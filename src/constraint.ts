export class ConstaintNode {
  id : number;
  inbound : number = 0;
  outbound : number = 0;
  ins : number[] = [];
  outs : number[] = [];
  constructor(id : number) {
    this.id = id;
  }
}
import { assert, intersection, merge_set } from "./utility";
import { Type, TypeKind } from "./type"
import * as dot from 'ts-graphviz';
import { config } from './config'
// debug
import { toFile } from "@ts-graphviz/adapter";
import { color } from "console-log-colors"
import { DominanceNode, is_equal_set, is_super_set } from "./dominance";
import { DataLocation, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { FuncStat } from "./funcstat";
import { FuncVis, VarVis } from "./visibility";
import { StorageLocation } from "./memory";
import { VisMut, VisMutKind } from "./vismut";
import { LinkedListNode } from "./dataStructor";
import { decl_db } from "./db";

interface toLeaf {
  leaf_id : number;
  sub_dominance : boolean; // node sub dominate leaf
  super_dominance : boolean; // node super dominate leaf
  subsuper_dominance : boolean; // node subsuper dominate leaf
  equal_dominance : boolean; // node equal dominate leaf
};

export class ConstraintDAG<T, Node extends DominanceNode<T>> {
  dag_nodes : Map<number, ConstaintNode> = new Map<number, ConstaintNode>();
  // If 'id1 id2' is installed in sub_dominance/super_dominance, then the solution of id2 is a sub_dominance/super_dominance of the solution of id1
  sub_dominance : Set<string> = new Set();
  super_dominance : Set<string> = new Set();
  solutions = new Map<number, Node>();
  solution_range = new Map<number, Node[]>();
  solutions_collection : Map<number, Node>[] = [];
  // Records the IDs of roots/leaves
  roots : Set<number> = new Set<number>();
  leaves : Set<number> = new Set<number>();
  // For each node, records the IDs of its reachable leaves and the sub_dominance/super_dominance domination between the node and the leaf.
  // If there are multiple paths from node to leaf, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
  // leaf are not in node2leaf.
  // Isolated nodes are not in node2leaf.
  node2leaf : Map<number, Set<toLeaf>> = new Map<number, Set<toLeaf>>();
  // Map each edge to its reachable leaves
  edge2leaf : Map<string, Set<number>> = new Map<string, Set<number>>();
  // If "leaf1 leaf2" is in leavessub, then the solution of leaf2 is a sub of the solution of leaf1.
  leavessub : Set<string> = new Set<string>();
  // If "leaf1 leaf2" is in leavesequal, then the solution of leaf2 equals to the solution of leaf1.
  leavesequal : Set<string> = new Set<string>();
  leavesnotsure : Set<string> = new Set<string>();
  name : string;
  constructor() {
    this.name = this.constructor.name;
  }

  async check_property() : Promise<void> {
    this.get_roots_and_leaves();
    // Check if the graph have roots and leaves
    if (this.roots.size === 0 && this.dag_nodes.size !== 0) {
      await this.draw("graph_for_check_property.svg");
      throw new Error(`ConstraintDAG: no root`);
    }
    if (this.leaves.size === 0 && this.roots.size !== this.dag_nodes.size) {
      await this.draw("graph_for_check_property.svg");
      throw new Error(`ConstraintDAG: no leaf`);
    }
    // Check if the non-leaf node has only one inbound edge or is a root
    for (const [nodeid, node] of this.dag_nodes) {
      if (!this.leaves.has(nodeid)) {
        if (!(node.inbound === 1 || node.inbound === 0 && this.roots.has(nodeid))) {
          await this.draw("graph_for_check_property.svg");
          throw new Error(`ConstraintDAG: node ${nodeid} has more than one inbound edge`);
        }
      }
    }
    // No need to check if a node connects to itself because it's forbidden in the connect function
  }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(nodeid : number, range : Node[]) : void {
    const node = this.newNode(nodeid);
    if (this.dag_nodes.has(node.id)) return;
    this.dag_nodes.set(node.id, node);
    this.solution_range.set(node.id, range);
  }

  remove(nodeid : number) : void {
    if (config.debug) {
      assert(this.dag_nodes.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the graph`);
    }
    this.solution_range.delete(nodeid);
    for (const innode of this.dag_nodes.get(nodeid)!.ins) {
      this.dag_nodes.get(innode)!.outs = this.dag_nodes.get(innode)!.outs.filter(t => t !== nodeid);
      this.dag_nodes.get(innode)!.outbound--;
    }
    for (const outnode of this.dag_nodes.get(nodeid)!.outs) {
      this.dag_nodes.get(outnode)!.ins = this.dag_nodes.get(outnode)!.ins.filter(t => t !== nodeid);
      this.dag_nodes.get(outnode)!.inbound--;
    }
    this.dag_nodes.delete(nodeid);
    this.sub_dominance = new Set([...this.sub_dominance].filter(t => !t.includes(`${nodeid}`)));
    this.super_dominance = new Set([...this.super_dominance].filter(t => !t.includes(`${nodeid}`)));
  }

  update(nodeid : number, range : Node[]) : void {
    assert(this.dag_nodes.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the graph`);
    assert(this.solution_range.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the solution_range`);
    this.solution_range.set(nodeid, [...intersection(new Set<Node>(this.solution_range.get(nodeid)), new Set<Node>(range))]);
  }

  connect(from : number, to : number, rank ?: string) : void {
    if (config.debug) {
      assert(this.dag_nodes.has(from), `ConstraintDAG: node ${from} is not in the graph`);
      assert(this.dag_nodes.has(to), `ConstraintDAG: node ${to} is not in the graph`);
    }
    if (from === to) return;
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    if (config.debug)
      assert(rank === undefined || rank === "sub_dominance" || rank === "super_dominance", `ConstraintDAG: rank ${rank} is not supported`)
    if (rank === "sub_dominance") {
      this.sub_dominance.add(`${from} ${to}`);
    }
    else if (rank === "super_dominance") {
      this.super_dominance.add(`${from} ${to}`);
    }
    this.solution_range_alignment(from, to);
  }

  dominator_solution_range_should_be_shrinked(dominator_id : number, dominatee_id : number) : Node[] | undefined {
    let minimum_solution_range_of_dominator;
    const rank = this.sub_dominance.has(`${dominator_id} ${dominatee_id}`) ? "sub_dominance" :
      this.super_dominance.has(`${dominator_id} ${dominatee_id}`) ? "super_dominance" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominator = this.solution_range.get(dominatee_id)!;
    else if (rank === "sub_dominance") {
      minimum_solution_range_of_dominator = [...new Set<Node>(this.solution_range.get(dominatee_id)!.flatMap(t => t.supers() as Node[]))];
    }
    else if (rank === "super_dominance") {
      minimum_solution_range_of_dominator = [...new Set<Node>(this.solution_range.get(dominatee_id)!.flatMap(t => t.subs() as Node[]))];
    }
    else {
      throw new Error(`dominator_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = this.solution_range.get(dominator_id)!.filter(t => minimum_solution_range_of_dominator!.includes(t));
    assert(intersection.length > 0,
      `dominator_solution_range_should_be_shrinked: intersection is empty
      \ndominator_id: ${dominator_id}, solution_range is ${this.solution_range.get(dominator_id)!.map(t => t.str())}
      \ndominatee_id: ${dominatee_id}, solution_range is ${this.solution_range.get(dominatee_id)!.map(t => t.str())}`);
    if (is_super_set(this.solution_range.get(dominator_id)!, intersection) && !is_equal_set(this.solution_range.get(dominator_id)!, intersection)) {
      return intersection;
    }
    return undefined;
  }

  dominatee_solution_range_should_be_shrinked(dominator_id : number, dominatee_id : number) : Node[] | undefined {
    let minimum_solution_range_of_dominatee;
    const rank = this.sub_dominance.has(`${dominator_id} ${dominatee_id}`) ? "sub_dominance" :
      this.super_dominance.has(`${dominator_id} ${dominatee_id}`) ? "super_dominance" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominatee = this.solution_range.get(dominator_id)!;
    else if (rank === "sub_dominance") {
      minimum_solution_range_of_dominatee = [...new Set<Node>(this.solution_range.get(dominator_id)!.flatMap(t => t.subs() as Node[]))];
    }
    else if (rank === "super_dominance") {
      minimum_solution_range_of_dominatee = [...new Set<Node>(this.solution_range.get(dominator_id)!.flatMap(t => t.supers() as Node[]))];
    }
    else {
      throw new Error(`dominatee_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = this.solution_range.get(dominatee_id)!.filter(t => minimum_solution_range_of_dominatee!.includes(t));
    assert(intersection.length > 0,
      `dominatee_solution_range_should_be_shrinked: intersection is empty
      \ndominator_id: ${dominator_id}, solution_range is ${this.solution_range.get(dominator_id)!.map(t => t.str())}
      \ndominatee_id: ${dominatee_id}, solution_range is ${this.solution_range.get(dominatee_id)!.map(t => t.str())}`);
    if (is_super_set(this.solution_range.get(dominatee_id)!, intersection) && !is_equal_set(this.solution_range.get(dominatee_id)!, intersection)) {
      return intersection;
    }
    return undefined;
  }

  solution_range_alignment(dominator_id : number, dominatee_id : number) : void {
    let minimum_solution_range_of_dominator;
    if (minimum_solution_range_of_dominator = this.dominator_solution_range_should_be_shrinked(dominator_id, dominatee_id)) {
      this.solution_range.set(dominator_id, minimum_solution_range_of_dominator);
      this.tighten_solution_range_middle_out(dominator_id);
    }
    let minimum_solution_range_of_dominatee;
    if (minimum_solution_range_of_dominatee = this.dominatee_solution_range_should_be_shrinked(dominator_id, dominatee_id)) {
      this.solution_range.set(dominatee_id, minimum_solution_range_of_dominatee);
      this.tighten_solution_range_middle_out(dominatee_id);
    }
  }

  initialize_resolve() : void {
    this.solutions = new Map<number, Node>();
    this.solutions_collection = [];
    this.roots = new Set<number>();
    this.leaves = new Set<number>();
    this.node2leaf = new Map<number, Set<toLeaf>>();
    this.edge2leaf = new Map<string, Set<number>>();
    this.leavessub = new Set<string>();
    this.leavesequal = new Set<string>();
    this.leavesnotsure = new Set<string>();
  }

  get_roots_and_leaves(isolated_node_is_root : boolean = true) : void {
    for (let [_, node] of this.dag_nodes) {
      if (node.inbound === 0) {
        this.roots.add(node.id);
      }
      if (node.outbound === 0) {
        this.leaves.add(node.id);
      }
    }
    if (isolated_node_is_root) {
      // Remove nodes that are both root and leaf from leaves.
      // Such nodes are isolated and not in the dominance relationship.
      for (let node of this.roots) {
        if (this.leaves.has(node)) {
          this.leaves.delete(node);
        }
      }
    }
    else {
      // Remove nodes that are both root and leaf from roots.
      // Such nodes are isolated and not in the dominance relationship.
      for (let node of this.leaves) {
        if (this.roots.has(node)) {
          this.roots.delete(node);
        }
      }
    }
  }

  dfs4node2leaf() : void {
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number, pre_sub_dominance_path : boolean,
      pre_super_dominance_path : boolean,
      pre_subsuper_dominance_path : boolean, pre_equal_dominance_path : boolean
    ) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const edge = `${parent} ${id}`;
        // + means adding an dominance edge to a dominance path
        // sub_edge + equal_path = sub_path
        // equal_edge + sub_path = sub_path
        // sub_edge + sub_path = sub_path
        let sub_dominance_path = this.sub_dominance.has(edge) && pre_equal_dominance_path
          || this.sub_dominance.has(edge) && pre_sub_dominance_path
          || !this.sub_dominance.has(edge) && !this.super_dominance.has(edge) && pre_sub_dominance_path;
        // super_edge + equal_path = super_path
        // equal_edge + super_path = super_path
        // super_edge + super_path = super_path
        let super_dominance_path = this.super_dominance.has(edge) && pre_equal_dominance_path
          || this.super_dominance.has(edge) && pre_super_dominance_path
          || !this.sub_dominance.has(edge) && !this.super_dominance.has(edge) && pre_super_dominance_path;
        // sub_edge + super_path = subsuper_path
        // super_edge + sub_path = subsuper_path
        let subsuper_dominance_path = pre_subsuper_dominance_path || (this.sub_dominance.has(edge) && pre_super_dominance_path)
          || (this.super_dominance.has(edge) && pre_sub_dominance_path);
        // equal_edge + equald_path = equal_path
        let equal_dominance_path = !this.sub_dominance.has(edge) && !this.super_dominance.has(edge) && pre_equal_dominance_path;
        assert([equal_dominance_path, subsuper_dominance_path, sub_dominance_path, super_dominance_path].filter(x => x).length === 1,
          `dfs4node2leaf: edge ${parent} -> ${id}, leaf ${leaf_id}: sub_dominance_path, super_dominance_path, subsuper_dominance_path, equal_dominance_path are not exclusive
          \nsub_dominance_path: ${sub_dominance_path}, super_dominance_path: ${super_dominance_path}, subsuper_dominance_path: ${subsuper_dominance_path}, equal_dominance_path: ${equal_dominance_path}`);
        // Multi-dominance from a non-leaf to this leaf node
        if (this.node2leaf.has(parent) &&
          [...this.node2leaf.get(parent)!].map(t => t.leaf_id).includes(leaf_id)) {
          const tail_info = [...this.node2leaf.get(parent)!].find(t => t.leaf_id === leaf_id)!;
          let sub_dominance_to_tail = tail_info.sub_dominance;
          let super_dominance_to_tail = tail_info.super_dominance;
          let subsuper_dominance_to_tail = tail_info.subsuper_dominance;
          let equal_dominance_to_tail = tail_info.equal_dominance;
          assert([equal_dominance_to_tail, subsuper_dominance_to_tail, sub_dominance_to_tail, super_dominance_to_tail].filter(x => x).length === 1,
            `dfs4node2leaf edge ${parent} -> ${id}, leaf ${leaf_id}: sub_dominance_to_tail, super_dominance_to_tail, subsuper_dominance_to_tail, equal_dominance_to_tail are not exclusive
            \npre_sub_dominance: ${sub_dominance_to_tail}, super_dominance_to_tail: ${super_dominance_to_tail}, subsuper_dominance_to_tail: ${subsuper_dominance_to_tail}, equal_dominance_to_tail: ${equal_dominance_to_tail}`);
          this.node2leaf.get(parent)!.delete(tail_info);
          /*
            /\ means the conjunction of two dominance paths
            /\ is commutative
            
            sub_path /\ sub_path = sub_path
            sub_path /\ super_path = equal_path
            sub_path /\ subsuper_path = sub_path
            sub_path /\ equal_path = equal_path

            super_path /\ super_path = super_path
            super_path /\ sub_path = equal_path
            super_path /\ subsuper_path = super_path
            super_path /\ equal_path = equal_path

            subsuper_path /\ subsuper_path = subsuper_path
            subsuper_path /\ sub_path = sub_path
            subsuper_path /\ super_path = super_path
            subsuper_path /\ equal_path = equal_path

            equal_path /\ equal_path = equal_path
            equal_path /\ sub_path = equal_path
            equal_path /\ super_path = equal_path
            equal_path /\ subsuper_path = equal_path
          */
          if (sub_dominance_to_tail) {
            if (sub_dominance_path) { }
            else if (super_dominance_path) {
              sub_dominance_to_tail = false;
              equal_dominance_to_tail = true;
            }
            else if (subsuper_dominance_path) { }
            else if (equal_dominance_path) {
              sub_dominance_to_tail = false;
              equal_dominance_to_tail = true;
            }
          }
          else if (super_dominance_to_tail) {
            if (sub_dominance_path) {
              super_dominance_to_tail = false;
              equal_dominance_to_tail = true;
            }
            else if (super_dominance_path) { }
            else if (subsuper_dominance_path) { }
            else if (equal_dominance_path) {
              super_dominance_to_tail = false;
              equal_dominance_to_tail = true;
            }
          }
          else if (subsuper_dominance_to_tail) {
            if (sub_dominance_path) {
              subsuper_dominance_to_tail = false;
              sub_dominance_to_tail = true;
            }
            else if (super_dominance_path) {
              subsuper_dominance_to_tail = false;
              super_dominance_to_tail = true;
            }
            else if (subsuper_dominance_path) { }
            else if (equal_dominance_path) {
              subsuper_dominance_to_tail = false;
              equal_dominance_to_tail = true;
            }
          }
          else if (equal_dominance_to_tail) {
            if (sub_dominance_path) { }
            else if (super_dominance_path) { }
            else if (subsuper_dominance_path) { }
            else if (equal_dominance_path) { }
          }
          assert([equal_dominance_to_tail, subsuper_dominance_to_tail, sub_dominance_to_tail, super_dominance_to_tail].filter(x => x).length === 1,
            `dfs4node2leaf >2: sub_dominance_to_tail, super_dominance_to_tail, subsuper_dominance_to_tail, equal_dominance_to_tail are not exclusive
            \npre_sub_dominance: ${sub_dominance_to_tail}, super_dominance_to_tail: ${super_dominance_to_tail}, subsuper_dominance_to_tail: ${subsuper_dominance_to_tail}, equal_dominance_to_tail: ${equal_dominance_to_tail}`);
          this.node2leaf.get(parent)!.delete(tail_info);
          this.node2leaf.get(parent)!.add({
            leaf_id: leaf_id, sub_dominance: sub_dominance_to_tail,
            super_dominance: super_dominance_to_tail, subsuper_dominance: subsuper_dominance_to_tail,
            equal_dominance: equal_dominance_to_tail
          });
          broadcast_from_leaves_upwards(parent, leaf_id, sub_dominance_to_tail, super_dominance_to_tail,
            subsuper_dominance_to_tail, equal_dominance_to_tail);
        }
        else {
          if (this.node2leaf.has(parent)) {
            this.node2leaf.get(parent)!.add({
              leaf_id: leaf_id, sub_dominance: sub_dominance_path,
              super_dominance: super_dominance_path, subsuper_dominance: subsuper_dominance_path,
              equal_dominance: equal_dominance_path
            });
          }
          else {
            this.node2leaf.set(parent, new Set<toLeaf>([{
              leaf_id: leaf_id, sub_dominance: sub_dominance_path,
              super_dominance: super_dominance_path, subsuper_dominance: subsuper_dominance_path,
              equal_dominance: equal_dominance_path
            }]));
          }
          broadcast_from_leaves_upwards(parent, leaf_id, sub_dominance_path, super_dominance_path,
            subsuper_dominance_path, equal_dominance_path);
        }
      }
    }
    //! Given a node's dominance to a leaf, modify its child's dominance to the same leaf.
    //! In this case, the node's dominance is broadcast from the child's dominance in `broadcast_from_leaves_upwards`.
    //! If there exists multi-dominance from the node to the leaf, then the modification may not work.
    //! Therefore, we need the function remove_removable_sub_super_dominance_in_multi_dominance to remove the removable sub- and super- dominances.
    let broadcast_from_roots_downwards = (id : number) : void => {
      for (let child of this.dag_nodes.get(id)!.outs) {
        if (this.leaves.has(child)) continue;
        for (const this_leaf_info of this.node2leaf.get(id)!) {
          for (const child_leaf_info of this.node2leaf.get(child)!) {
            if (this_leaf_info.leaf_id !== child_leaf_info.leaf_id) {
              continue;
            }
            /*
              Suppose node N1 dominates node N2, and they both dominate leaf L;
              
              N1 |-_equal L -> N2 |-_equal L

              N1 |-_sub L -> ( N2 |-_sub L || N2 |-_equal L || N2 |-_subsuper L || N2 |-_super L )
              
              N1 |-_super L -> ( N2 |-_super L || N2 |-_equal L || N2 |-_subsuper L || N2 |-_sub L )

              N1 |-_subsuper L -> ( N2 |-_subsuper L || N2 |-_sub L || N2 |-_super L )
            */
            if (this_leaf_info.equal_dominance) {
              if (child_leaf_info.sub_dominance) {
                child_leaf_info.sub_dominance = false;
                child_leaf_info.equal_dominance = true;
              }
              else if (child_leaf_info.super_dominance) {
                child_leaf_info.super_dominance = false;
                child_leaf_info.equal_dominance = true;
              }
              else if (child_leaf_info.subsuper_dominance) {
                child_leaf_info.subsuper_dominance = false;
                child_leaf_info.equal_dominance = true;
              }
            }
            else if (this_leaf_info.subsuper_dominance) {
              assert(!child_leaf_info.equal_dominance,
                `node ${id} subsuper-dominate leaf ${this_leaf_info.leaf_id}, but node ${child} equal-dominate leaf ${this_leaf_info.leaf_id}`);
            }
          }
        }
        broadcast_from_roots_downwards(child);
      }
    }
    for (let leaf of this.leaves) {
      broadcast_from_leaves_upwards(leaf, leaf, false, false, false, true);
    }
    for (let root of this.roots) {
      broadcast_from_roots_downwards(root);
    }
  }

  dfs4edge2leaf() : void {
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const edge = `${parent} ${id}`;
        if (this.edge2leaf.has(edge)) {
          this.edge2leaf.get(edge)!.add(leaf_id);
        }
        else {
          this.edge2leaf.set(edge, new Set([leaf_id]));
        }
        broadcast_from_leaves_upwards(parent, leaf_id);
      }
    }
    for (let leaf of this.leaves) {
      broadcast_from_leaves_upwards(leaf, leaf);
    }
  }

  try_shrink_dominator_solution_range(solution_range : Map<number, Node[]>,
    dominator_id : number, dominatee_id : number) : Node[] {
    let minimum_solution_range_of_dominator;
    const rank = this.sub_dominance.has(`${dominator_id} ${dominatee_id}`) ? "sub_dominance" :
      this.super_dominance.has(`${dominator_id} ${dominatee_id}`) ? "super_dominance" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominator = solution_range.get(dominatee_id)!;
    else if (rank === "sub_dominance") {
      minimum_solution_range_of_dominator = [...new Set<Node>(solution_range.get(dominatee_id)!.flatMap(t => t.supers() as Node[]))];
    }
    else if (rank === "super_dominance") {
      minimum_solution_range_of_dominator = [...new Set<Node>(solution_range.get(dominatee_id)!.flatMap(t => t.subs() as Node[]))];
    }
    else {
      throw new Error(`dominator_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = solution_range.get(dominator_id)!.filter(t => minimum_solution_range_of_dominator!.includes(t));
    return intersection;
  }

  try_shrink_dominatee_solution_range(solution_range : Map<number, Node[]>,
    dominator_id : number, dominatee_id : number) : Node[] {
    let minimum_solution_range_of_dominatee;
    const rank = this.sub_dominance.has(`${dominator_id} ${dominatee_id}`) ? "sub_dominance" :
      this.super_dominance.has(`${dominator_id} ${dominatee_id}`) ? "super_dominance" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominatee = solution_range.get(dominator_id)!;
    else if (rank === "sub_dominance") {
      minimum_solution_range_of_dominatee = [...new Set<Node>(solution_range.get(dominator_id)!.flatMap(t => t.subs() as Node[]))];
    }
    else if (rank === "super_dominance") {
      minimum_solution_range_of_dominatee = [...new Set<Node>(solution_range.get(dominator_id)!.flatMap(t => t.supers() as Node[]))];
    }
    else {
      throw new Error(`dominatee_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = solution_range.get(dominatee_id)!.filter(t => minimum_solution_range_of_dominatee!.includes(t));
    return intersection;
  }

  try_tighten_solution_range_middle_out(node : number, new_range : Node[]) : boolean {
    const solution_range = new Map(this.solution_range);
    solution_range.set(node, new_range);
    let upwards = (node : number) : boolean => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length !== 0)
          return downwards(node);
      }
      let res = true;
      for (let parent of this.dag_nodes.get(node)!.ins) {
        const minimum_solution_range_of_dominator = this.try_shrink_dominator_solution_range(solution_range, parent, node);
        if (is_equal_set(solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
          continue;
        }
        if (minimum_solution_range_of_dominator.length === 0) {
          return false;
        }
        solution_range.set(parent, minimum_solution_range_of_dominator);
        res &&= upwards(parent);
        if (!res) return false;
        res &&= downwards(parent);
        if (!res) return false;
      }
      return res;
    }
    let downwards = (node : number) : boolean => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length !== 0)
          return upwards(node);
      }
      let res = true;
      for (let child of this.dag_nodes.get(node)!.outs) {
        const minimum_solution_range_of_dominatee = this.try_shrink_dominatee_solution_range(solution_range, node, child);
        if (is_equal_set(solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
          continue;
        }
        if (minimum_solution_range_of_dominatee.length === 0) {
          return false;
        }
        solution_range.set(child, minimum_solution_range_of_dominatee);
        res &&= upwards(child);
        if (!res) return false;
        res &&= downwards(child);
        if (!res) return false;
      }
      return res;
    }
    return downwards(node) && upwards(node);
  }

  tighten_solution_range_middle_out(node : number) {
    let upwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length !== 0)
          downwards(node);
        return;
      }
      for (let parent of this.dag_nodes.get(node)!.ins) {
        let minimum_solution_range_of_dominator;
        if (minimum_solution_range_of_dominator =
          this.dominator_solution_range_should_be_shrinked(parent, node)) {
          if (is_super_set(this.solution_range.get(parent)!, minimum_solution_range_of_dominator) &&
            !is_equal_set(this.solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
            this.solution_range.set(parent, minimum_solution_range_of_dominator);
            upwards(parent);
            downwards(parent);
          }
        }
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length !== 0)
          upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        let minimum_solution_range_of_dominatee;
        if (minimum_solution_range_of_dominatee =
          this.dominatee_solution_range_should_be_shrinked(node, child)) {
          if (is_super_set(this.solution_range.get(child)!, minimum_solution_range_of_dominatee) &&
            !is_equal_set(this.solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
            this.solution_range.set(child, minimum_solution_range_of_dominatee);
            downwards(child);
            upwards(child);
          }
        }
      }
    }
    upwards(node);
    downwards(node);
  }

  allocate_solutions_for_leaves_in_stream() : Generator<Map<number, Node>> {
    for (let leaf of this.leaves) this.solution_range.set(leaf, this.solution_range.get(leaf)!);
    const leave_array = Array.from(this.leaves);
    const solution_range_copy = this.solution_range;

    let check_leaf_solution = (leavf_solution : Map<number, Node>) : boolean => {
      const leaf_solution_array = Array.from(leavf_solution);
      const leaf_solution_length = leaf_solution_array.length;
      for (let i = 0; i < leaf_solution_length; i++) {
        for (let j = i + 1; j < leaf_solution_length; j++) {
          const i2j = `${leaf_solution_array[i][0]} ${leaf_solution_array[j][0]}`;
          const j2i = `${leaf_solution_array[j][0]} ${leaf_solution_array[i][0]}`;
          const inode = leaf_solution_array[i][1];
          const jnode = leaf_solution_array[j][1];
          if (this.leavessub.has(i2j) && !inode.issuperof(jnode)) {
            return false;
          }
          if (this.leavessub.has(j2i) && !jnode.issuperof(inode)) {
            return false;
          }
          if (this.leavesequal.has(i2j) && !inode.same(jnode)) {
            return false;
          }
          if (this.leavesequal.has(j2i) && !jnode.same(inode)) {
            return false;
          }
          if (this.leavesnotsure.has(i2j) && !inode.issubof(jnode) && !inode.issuperof(jnode)) {
            return false;
          }
          if (this.leavesnotsure.has(j2i) && !inode.issubof(jnode) && !inode.issuperof(jnode)) {
            return false;
          }
        }
      }
      return true;
    }

    class SolutionRangeList extends LinkedListNode<Node[]> {
      new(range : Node[]) : SolutionRangeList {
        this.m_next = new SolutionRangeList(range);
        this.m_next.set_pre(this);
        return this.m_next as SolutionRangeList;
      }
      rollback() : SolutionRangeList {
        assert(this.m_pre !== undefined, "The previous node must exist.");
        this.m_pre!.set_next(undefined);
        return this.m_pre! as SolutionRangeList;
      }
    }

    const narrowed_solution_range : Map<number, SolutionRangeList> = new Map<number, SolutionRangeList>();

    let narrow_solution_range_for_leaves_behind = (id : number, solution : Node) : boolean => {
      for (let j = id + 1; j < leave_array.length; j++) {
        if (this.leavessub.has(`${leave_array[j]} ${leave_array[id]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.supers() as Node[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.supers()!.includes(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leavessub.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.subs() as Node[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.subs()!.includes(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leavesequal.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leavesequal.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList([solution] as Node[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.same(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leavesnotsure.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leavesnotsure.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList([...merge_set(
              new Set<Node>(solution.supers() as Node[]), new Set<Node>(solution.subs() as Node[]))]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => merge_set(
                new Set<Node>(solution.supers() as Node[]), new Set<Node>(solution.subs() as Node[])
              ).has(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        if (narrowed_solution_range.has(leave_array[j])) {
          const leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
          let leave_solution_range = leave_solution_range_node.value();
          leave_solution_range = leave_solution_range.filter(t => solution_range_copy.get(leave_array[j])!.includes(t));
          narrowed_solution_range.get(leave_array[j])!.update(leave_solution_range);
          if (narrowed_solution_range.get(leave_array[j])!.value().length === 0) {
            return false;
          }
        }
      }
      return true;
    }

    let clear_narrowed_solution_for_leaves_behind = (id : number) : void => {
      for (let j = id + 1; j < leave_array.length; j++) {
        if (this.leavesequal.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leavesequal.has(`${leave_array[id]} ${leave_array[j]}`)
          || this.leavessub.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leavessub.has(`${leave_array[id]} ${leave_array[j]}`)
          || this.leavesnotsure.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leavesnotsure.has(`${leave_array[id]} ${leave_array[j]}`)) {
          assert(narrowed_solution_range.has(leave_array[j]),
            `allocate_solutions_for_leaves_in_stream: narrowed_solution_range_for_id of ${leave_array[j]} is empty given ${leave_array[id]}`);
          let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
          if (leave_solution_range_node.pre() != null) {
            leave_solution_range_node = leave_solution_range_node.rollback();
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
          else {
            narrowed_solution_range.delete(leave_array[j]);
          }
        }
      }
    }

    function* dfs(id : number, leaf_resolution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (id === leave_array.length) {
        if (check_leaf_solution(leaf_resolution)) {
          yield new Map(leaf_resolution);
          return;
        }
      }
      else {
        let solution_range_for_id = solution_range_copy.get(leave_array[id])!;
        if (narrowed_solution_range.has(leave_array[id])) {
          solution_range_for_id = narrowed_solution_range.get(leave_array[id])!.value();
          assert(solution_range_for_id.length > 0,
            `allocate_solutions_for_leaves_in_stream: narrowed_solution_range_for_id of ${id} is empty`);
        }
        for (let solution of solution_range_for_id) {
          leaf_resolution.set(leave_array[id], solution);
          if (!check_leaf_solution(leaf_resolution)) {
            leaf_resolution.delete(leave_array[id]);
            continue;
          }
          if (!narrow_solution_range_for_leaves_behind(id, solution)) {
            clear_narrowed_solution_for_leaves_behind(id);
            continue;
          }
          yield* dfs(id + 1, leaf_resolution);
          clear_narrowed_solution_for_leaves_behind(id);
          leaf_resolution.delete(leave_array[id]);
        }
      }
    }
    return dfs(0, new Map<number, Node>());
  }

  build_leaves_relation() : void {
    for (let [_, leaf_infos] of this.node2leaf) {
      const leaf_infos_array = [...leaf_infos];
      const leaf_infos_length = leaf_infos_array.length;
      for (let i = 0; i < leaf_infos_length; i++) {
        for (let j = i + 1; j < leaf_infos_length; j++) {
          let leaf_info1 = leaf_infos_array[i];
          let leaf_info2 = leaf_infos_array[j];
          if (leaf_info1.sub_dominance) {
            if (leaf_info2.equal_dominance || leaf_info2.super_dominance) {
              this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else {
              this.leavesnotsure.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
              this.leavesnotsure.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
          }
          else if (leaf_info1.super_dominance) {
            if (leaf_info2.equal_dominance || leaf_info2.sub_dominance) {
              this.leavessub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
            else {
              this.leavesnotsure.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leavesnotsure.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
          }
          else if (leaf_info1.equal_dominance) {
            if (leaf_info2.sub_dominance) {
              this.leavessub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
            else if (leaf_info2.super_dominance) {
              this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.equal_dominance) {
              this.leavesequal.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leavesequal.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
          }
          else if (leaf_info1.subsuper_dominance) {
            this.leavesnotsure.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            this.leavesnotsure.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
        }
      }
    }
    const leaf_equal_leaves = new Map<number, Set<number>>();
    for (const key of this.leavesequal) {
      const [leaf1, leaf2] = key.split(" ");
      if (leaf_equal_leaves.has(parseInt(leaf1))) {
        leaf_equal_leaves.get(parseInt(leaf1))!.add(parseInt(leaf2));
      }
      else {
        leaf_equal_leaves.set(parseInt(leaf1), new Set([parseInt(leaf2)]));
      }
    }
    const visited = new Set<number>();
    let dfs = (leafid : number, curleafid : number) : void => {
      visited.add(curleafid);
      for (const next of leaf_equal_leaves.get(curleafid)!) {
        if (visited.has(next)) continue;
        this.leavesequal.add(`${leafid} ${next}`);
        this.leavesequal.add(`${next} ${leafid}`);
        dfs(leafid, next);
      }
    }
    for (const [leafid, _] of leaf_equal_leaves) {
      visited.add(leafid);
      dfs(leafid, leafid);
    }
    for (const edge of this.leavessub) {
      const [leaf1, leaf2] = edge.split(" ");
      if (this.leavessub.has(`${leaf2} ${leaf1}`)) {
        this.leavessub.delete(`${leaf2} ${leaf1}`);
        this.leavessub.delete(`${leaf1} ${leaf2}`);
        this.leavesequal.add(`${leaf1} ${leaf2}`);
        this.leavesequal.add(`${leaf2} ${leaf1}`);
      }
      else if (this.leavesequal.has(`${leaf2} ${leaf1}`) ||
        this.leavesequal.has(`${leaf1} ${leaf2}`)) {
        this.leavessub.delete(edge);
      }
      else if (this.leavesnotsure.has(`${leaf1} ${leaf2}`)
        || this.leavesnotsure.has(`${leaf2} ${leaf1}`)) {
        this.leavesnotsure.delete(`${leaf2} ${leaf1}`);
        this.leavesnotsure.delete(`${leaf1} ${leaf2}`);
      }
    }
    for (const edge of this.leavesnotsure) {
      const [leaf1, leaf2] = edge.split(" ");
      if (this.leavessub.has(`${leaf2} ${leaf1}`)
        || this.leavessub.has(`${leaf1} ${leaf2}`)
        || this.leavesequal.has(`${leaf2} ${leaf1}`)
        || this.leavesequal.has(`${leaf1} ${leaf2}`)) {
        this.leavesnotsure.delete(`${leaf1} ${leaf2}`);
        this.leavesnotsure.delete(`${leaf2} ${leaf1}`);
      }
    }
    for (const key of this.leavessub) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leavessub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavessub has ${leaf2} ${leaf1}`);
      assert(this.leavesequal.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavesequal has ${leaf2} ${leaf1}`);
      assert(this.leavesnotsure.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavesnotsure has ${leaf2} ${leaf1}`);
      assert(this.leavesnotsure.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leavesnotsure has ${leaf1} ${leaf2}`);
    }
    for (const key of this.leavesequal) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leavessub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavessub has ${leaf2} ${leaf1}`);
      assert(this.leavessub.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leavessub has ${leaf1} ${leaf2}`);
      assert(this.leavesnotsure.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavesnotsure has ${leaf2} ${leaf1}`);
      assert(this.leavesnotsure.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leavesnotsure has ${leaf1} ${leaf2}`);
    }
  }

  async resolve() : Promise<void> {
    // !initialize the resolution
    this.initialize_resolve();
    await this.check_property();
    // !Get roots and leaves
    this.get_roots_and_leaves(false);
    let mul = 1n;
    for (let id of this.solution_range.keys()) {
      if (!this.leaves.has(id)) continue;
      mul *= BigInt(this.solution_range.get(id)!.length)
    }
    console.log(color.cyan(`The size of solution candidate of ${this.name} is ${mul}`));
    // !Map nodes to their leaves, recording if there exists a path from the node to leaf with leaf_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to leaf, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // leaf_ids are not in this.node2leaf
    this.dfs4node2leaf();
    if (config.debug || config.unit_test_mode) {
      for (let [id, leaf_infos] of this.node2leaf) {
        for (const leaf_info of leaf_infos) {
          console.log(`node ${id} dominates leaf ${leaf_info.leaf_id}: sub_dominance: ${leaf_info.sub_dominance}, super_dominance: ${leaf_info.super_dominance}, subsuper_dominance: ${leaf_info.subsuper_dominance}, equal_dominance: ${leaf_info.equal_dominance}`);
        }
      }
    }
    this.build_leaves_relation();
    if (this.name === "TypeDominanceDAG") {
      const mapping_leaves : number[] = []
      this.leaves.forEach(leaf => {
        if (decl_db.is_mapping_decl(leaf)) {
          this.leaves.delete(leaf);
          mapping_leaves.push(leaf);
          for (const edge of this.leavesequal) {
            const [leaf1, leaf2] = edge.split(" ");
            if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
              this.leavesequal.delete(edge);
            }
          }
          for (const edge of this.leavessub) {
            const [leaf1, leaf2] = edge.split(" ");
            if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
              this.leavessub.delete(edge);
            }
          }
          for (const edge of this.leavesnotsure) {
            const [leaf1, leaf2] = edge.split(" ");
            if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
              this.leavesnotsure.delete(edge);
            }
          }
        }
      });
      for (let i = 0; i < mapping_leaves.length; i++) {
        const keyi = decl_db.key_id_of_mapping_decl(mapping_leaves[i]);
        const valuei = decl_db.value_id_of_mapping_decl(mapping_leaves[i]);
        for (let j = i + 1; j < mapping_leaves.length; j++) {
          const keyj = decl_db.key_id_of_mapping_decl(mapping_leaves[j]);
          const valuej = decl_db.value_id_of_mapping_decl(mapping_leaves[j]);
          if (this.leavesequal.has(`${mapping_leaves[i]} ${mapping_leaves[j]}`)
            || this.leavesequal.has(`${mapping_leaves[j]} ${mapping_leaves[i]}`)
            || this.leavessub.has(`${mapping_leaves[i]} ${mapping_leaves[j]}`)
            || this.leavessub.has(`${mapping_leaves[j]} ${mapping_leaves[i]}`)
            || this.leavesnotsure.has(`${mapping_leaves[i]} ${mapping_leaves[j]}`)
            || this.leavesnotsure.has(`${mapping_leaves[j]} ${mapping_leaves[i]}`)) {
            this.leavesequal.add(`${keyi} ${keyj}`);
            this.leavesequal.add(`${keyj} ${keyi}`);
            this.leavesequal.add(`${valuei} ${valuej}`);
            this.leavesequal.add(`${valuej} ${valuei}`);
          }
        }
      }
    }
    if (config.debug || config.unit_test_mode) {
      console.log(color.green("> leavessub:"));
      for (const edge of this.leavessub) {
        console.log(edge);
      }
      console.log(color.green("> leavesequal:"));
      for (const edge of this.leavesequal) {
        console.log(edge);
      }
      console.log(color.green("> leavesnotsure:"));
      for (const edge of this.leavesnotsure) {
        console.log(edge);
      }
    }
    if (this.name === "TypeDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./type_constraint.svg");
    }
    else if (this.name === "StorageLocationDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./storage_constraint.svg");
    }
    else if (this.name === "VisMutDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./scope_constraint.svg");
    }
    // !Assign solutions to roots
    let should_stop = false;
    let maximum_solution_count;
    if (config.mode === 'scope' && this.name === "TypeDominanceDAG"
      || config.mode === 'scope' && this.name === "StorageLocationDominanceDAG"
    ) {
      maximum_solution_count = 1;
    }
    else if (config.mode === 'type' && this.name !== "TypeDominanceDAG") {
      maximum_solution_count = 1;
    }
    else if (config.mode === 'loc' && this.name !== "StorageLocationDominanceDAG") {
      maximum_solution_count = 1;
    }
    else {
      maximum_solution_count = config.maximum_solution_count;
    }
    for (const leaf_solution of this.allocate_solutions_for_leaves_in_stream()) {
      this.solutions.clear();
      if (should_stop) break;
      if (this.solutions_collection.length >= maximum_solution_count) {
        should_stop = true;
        break;
      }
      this.solutions_collection.push(new Map(leaf_solution));
    }
  }

  verify() : void {
    for (const solutions of this.solutions_collection) {
      // 1. Verify that all nodes have been resolved.
      let not_resolved = new Set<number>();
      for (let [id, _] of this.dag_nodes) {
        if (this.leaves.has(id) && !solutions.has(id)) {
          not_resolved.add(id);
        }
      }
      assert(not_resolved.size === 0,
        `Dominance::Verify: nodes ${[...not_resolved]} have not been resolved.
        Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      // 2. Verify that all resolved types are one of the solution candidates of the node.
      for (let [id, solution_candidates] of this.solution_range) {
        if (!this.leaves.has(id)) continue;
        let resolved_type = solutions.get(id)!;
        let match = false;
        for (let solution_candidate of solution_candidates) {
          if (resolved_type.same(solution_candidate)) {
            match = true;
            break;
          }
        }
        assert(match,
          `Dominance::Verify: solution ${resolved_type.str()} to node ${id} is not one of the solution candidates: ${solution_candidates.map(t => t.str()).join(", ")}
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      // 3. Verify that all leaf relation constraints hold.
      for (const edge of this.leavessub) {
        const [leaf1, leaf2] = edge.split(" ");
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.issuperof(node2),
          `Dominance::Verify: sub_dominance constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      for (const edge of this.leavesequal) {
        const [leaf1, leaf2] = edge.split(" ");
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.same(node2),
          `Dominance::Verify: equal_dominance constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      for (const edge of this.leavesnotsure) {
        const [leaf1, leaf2] = edge.split(" ");
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.issubof(node2) || node1.issuperof(node2),
          `Dominance::Verify: not_sure_dominance constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
    }
  }

  //! This function should be called after getting roots and leaves
  async draw(path : string) : Promise<void> {
    const G = new dot.Digraph();
    const visited : Map<number, dot.Node> = new Map<number, dot.Node>();
    let dfs = (pre_gnode : dot.Node | undefined, node : number, sub_dominance : boolean,
      super_dominance : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (super_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "superd" });
            G.addEdge(edge);
          }
          else if (sub_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'subd' });
            G.addEdge(edge);
          }
          else {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!]);
            G.addEdge(edge);
          }
        }
        return;
      }
      const gnode = new dot.Node(node.toString(), {
        [dot.attribute.color]:
          this.roots.has(node) ? 'red' : this.leaves.has(node) ? 'green' : 'blue'
      });
      visited.set(node, gnode);
      if (pre_gnode !== undefined) {
        if (sub_dominance) {
          const edge = new dot.Edge([pre_gnode, gnode], { [dot.attribute.label]: 'subd' });
          G.addEdge(edge);
        }
        else if (super_dominance) {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "superd" });
          G.addEdge(edge);
        }
        else {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!]);
          G.addEdge(edge);
        }
      }
      G.addNode(gnode);
      assert(this.dag_nodes.has(node), `draw: dag_nodes does not have ${node}`);
      for (let child of this.dag_nodes.get(node)!.outs) {
        dfs(gnode, child, this.sub_dominance.has(`${node} ${child}`),
          this.super_dominance.has(`${node} ${child}`));
      }
    }
    for (const root of this.roots) {
      dfs(undefined, root, false, false);
    }
    for (const leaf of this.leaves) {
      if (!visited.has(leaf)) {
        dfs(undefined, leaf, false, false);
      }
    }
    const dot_lang = dot.toDot(G);
    await toFile(dot_lang, path, { format: 'svg' });
  }
}

export class TypeDominanceDAG extends ConstraintDAG<TypeKind, Type> { }
export class FuncStateMutabilityDominanceDAG extends ConstraintDAG<FunctionStateMutability, FuncStat> { }
export class FuncVisibilityDominanceDAG extends ConstraintDAG<FunctionVisibility, FuncVis> { }
export class StateVariableVisibilityDominanceDAG extends ConstraintDAG<StateVariableVisibility, VarVis> { }
export class StorageLocationDominanceDAG extends ConstraintDAG<DataLocation, StorageLocation> { }
export class VisMutDominanceDAG extends ConstraintDAG<VisMutKind, VisMut> { }