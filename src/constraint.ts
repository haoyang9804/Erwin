export class ConstaintNode {
  // id of the irnode
  id : number;
  inbound : number = 0;
  outbound : number = 0;
  ins : number[] = [];
  outs : number[] = [];
  //WARNING: Do not change the default value of depth.
  depth : number = -1;
  conflict : boolean = false;
  resolved : boolean = false;
  constructor(id : number) {
    this.id = id;
  }
}
import { assert, merge_set, shuffle } from "./utility";
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

interface toLeaf {
  leaf_id : number;
  sub_dominance : boolean; // node sub dominate leaf
  super_dominance : boolean; // node super dominate leaf
  subsuper_dominance : boolean; // node subsuper dominate leaf
  equal_dominance : boolean; // node equal dominate leaf
};
interface fromRoot {
  root_id : number;
  sub_dominance : boolean; // root sub dominate node
  super_dominance : boolean;  // root super dominate node
  subsuper_dominance : boolean; // root subsuper dominate node
  equal_dominance : boolean; // root equal dominate node
};

export class DominanceDAG<T, Node extends DominanceNode<T>> {
  dag_nodes : Map<number, ConstaintNode> = new Map<number, ConstaintNode>();
  // If 'id1 id2' is installed in sub_dominance/super_dominance, then the solution of id2 is a sub_dominance/super_dominance of the solution of id1
  sub_dominance : Set<string> = new Set();
  super_dominance : Set<string> = new Set();
  subsuper_dominance : Set<string> = new Set();
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
  rootssub : Set<string> = new Set<string>();
  rootsequal : Set<string> = new Set<string>();
  rootsnotsure : Set<string> = new Set<string>();
  name : string;
  constructor() {
    this.name = this.constructor.name;
  }

  async check_property() : Promise<void> {
    this.get_roots_and_leaves();
    // Check if the graph have roots and leaves
    if (this.roots.size === 0 && this.dag_nodes.size !== 0) {
      await this.draw("graph_for_check_property.svg");
      throw new Error(`DominanceDAG: no root`);
    }
    if (this.leaves.size === 0 && this.roots.size !== this.dag_nodes.size) {
      await this.draw("graph_for_check_property.svg");
      throw new Error(`DominanceDAG: no leaf`);
    }
    // Check if the non-leaf node has only one inbound edge or is a root
    for (const [nodeid, node] of this.dag_nodes) {
      if (!this.leaves.has(nodeid)) {
        if (!(node.inbound === 1 || node.inbound === 0 && this.roots.has(nodeid))) {
          await this.draw("graph_for_check_property.svg");
          throw new Error(`DominanceDAG: node ${nodeid} has more than one inbound edge`);
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

  update(nodeid : number, range : Node[]) : void {
    assert(this.dag_nodes.has(nodeid), `DominanceDAG: node ${nodeid} is not in the graph`);
    assert(this.solution_range.has(nodeid), `DominanceDAG: node ${nodeid} is not in the solution_range`);
    this.solution_range.set(nodeid, range);
  }

  /*
  1. If node1 weakly dominates node2 in solution, then the solution of node2 is sub of the solution of node1.
  2. If node1 weakly and reversely dominates node2 in solution, then the solution of node2 is super to the solution of node1.
  */
  connect(from : number, to : number, rank ?: string) : void {
    if (config.debug) {
      assert(this.dag_nodes.has(from), `DominanceDAG: node ${from} is not in the graph`);
      assert(this.dag_nodes.has(to), `DominanceDAG: node ${to} is not in the graph`);
    }
    if (from === to) return;
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    if (config.debug)
      assert(rank === undefined || rank === "sub_dominance" || rank === "super_dominance", `DominanceDAG: rank ${rank} is not supported`)
    if (rank === "sub_dominance") {
      this.sub_dominance.add(`${from} ${to}`);
    }
    else if (rank === "super_dominance") {
      this.super_dominance.add(`${from} ${to}`);
    }
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
    this.rootssub = new Set<string>();
    this.rootsequal = new Set<string>();
    this.rootsnotsure = new Set<string>();
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

  remove_removable_sub_super_dominance_in_multi_dominance() : void {
    // Remove sub-dominance 1->3 and 3->4 in constraint1.png
    // In this example, node 1 dominates node 2 (leaf) for more than once.
    // Removable sub- and super- dominances may occur
    /*
      Suppose non-leaf node N dominate leaf L through dominance edge E (N, N_child).

      sub_dominance(E) means E is a sub-dominance edge.
      Similar for super_dominance(E) and equal_dominance(E).

      (N |-_super L || N |-_equal L) && sub_dominance(E) => remove sub_dominance(E)
      (N |-_sub L || N |-_equal L) && super_dominance(E) => remove super_dominance
    */
    let remove_from_roots = (node : number) : void => {
      for (const child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        assert(this.edge2leaf.has(edge), `${edge} is not included in this.edge2leaf`);
        for (const leaf of this.edge2leaf.get(edge)!) {
          const leaf_info = [...this.node2leaf.get(node)!].find(t => t.leaf_id === leaf)!;
          assert(leaf_info !== undefined, `remove_removable_sub_super_dominance_in_multi_dominance: leaf_info of leaf whose ID is ${leaf} is undefined`);
          if ((leaf_info.super_dominance || leaf_info.equal_dominance) && this.sub_dominance.has(edge)) {
            this.sub_dominance.delete(edge);
          }
          if ((leaf_info.sub_dominance || leaf_info.equal_dominance) && this.super_dominance.has(edge)) {
            this.super_dominance.delete(edge);
          }
        }
        remove_from_roots(child);
      }
    }
    for (let root of this.roots) {
      remove_from_roots(root);
    }
  }

  climb_upwards_see_the_path(nodeid : number) : Map<number, string[]> {
    const res = new Map<number, string[]>();
    let upwards = (nodeid : number) : void => {
      for (const parent of this.dag_nodes.get(nodeid)!.ins) {
        const edge = `${parent} ${nodeid}`;
        if (res.has(parent)) {
          res.set(parent, [...res.get(parent)!, edge,]);
        }
        else {
          res.set(parent, [edge]);
        }
        if (res.has(nodeid)) {
          res.set(parent, [...res.get(parent)!, ...res.get(nodeid)!]);
        }
        upwards(parent);
      }
    }
    upwards(nodeid);
    return res;
  }

  //! Must be called after build_leaves_relation
  remove_removable_sub_super_dominance_in_pyramid() {
    // Dominance DAG in constraint2 is considered as a pyramid
    // where sub-dominance 4->2 should be removed.
    if (this.leavesequal.size === 0) return;
    for (const equalstr of this.leavesequal) {
      const [leaf1, leaf2] = equalstr.split(" ");
      const ancestor1_to_path = this.climb_upwards_see_the_path(parseInt(leaf1));
      const ancestor2_to_path = this.climb_upwards_see_the_path(parseInt(leaf2));
      for (const [ancestor1, path1] of ancestor1_to_path) {
        if (!ancestor2_to_path.has(ancestor1)) continue;
        for (const edge1 of path1) {
          if (this.sub_dominance.has(edge1)) {
            this.sub_dominance.delete(edge1);
          }
          if (this.super_dominance.has(edge1)) {
            this.super_dominance.delete(edge1);
          }
        }
        for (const edge2 of ancestor2_to_path.get(ancestor1)!) {
          if (this.sub_dominance.has(edge2)) {
            this.sub_dominance.delete(edge2);
          }
          if (this.super_dominance.has(edge2)) {
            this.super_dominance.delete(edge2);
          }
        }
      }
    }
  }

  restrict_solution_range(node : number) {
    for (let parent of this.dag_nodes.get(node)!.ins) {
      const edge = `${parent} ${node}`;
      if (!this.sub_dominance.has(edge) && !this.super_dominance.has(edge)) {
        let parent_solution_candidates = this.solution_range.get(parent)!;
        let child_solution_candidates = this.solution_range.get(node)!;
        let same = true;
        if (parent_solution_candidates.length !== child_solution_candidates.length) {
          same = false;
        }
        else {
          for (let i = 0; i < parent_solution_candidates.length; i++) {
            if (!parent_solution_candidates[i].same(child_solution_candidates[i])) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          let parent_candidates_issuper_dominanceset_of_child_candidates = is_super_set(parent_solution_candidates, child_solution_candidates);
          let child_candidates_issuper_dominanceset_of_parent_candidates = is_super_set(child_solution_candidates, parent_solution_candidates);
          assert(parent_candidates_issuper_dominanceset_of_child_candidates || child_candidates_issuper_dominanceset_of_parent_candidates,
            `restrict_solution_range: the solution range of ${parent}: ${parent_solution_candidates.map(x => x.str())} is not a superset
            or subset of the solution range of ${node}: ${child_solution_candidates.map(x => x.str())}`);
          if (parent_candidates_issuper_dominanceset_of_child_candidates) {
            this.solution_range.set(parent, child_solution_candidates);
          }
        }
      }
      this.restrict_solution_range(parent);
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
    // this.solution_range_alignment(node, node);
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

  allocate_solutions_for_roots_in_stream() : Generator<Map<number, Node>> {
    for (let root of this.roots) this.solution_range.set(root, shuffle(this.solution_range.get(root)!));
    const root_array = shuffle(Array.from(this.roots));
    const solution_range_copy = this.solution_range;

    let check_root_solution = (root_solution : Map<number, Node>) : boolean => {
      const root_solution_array = Array.from(root_solution);
      const root_solution_length = root_solution_array.length;
      for (let i = 0; i < root_solution_length; i++) {
        for (let j = i + 1; j < root_solution_length; j++) {
          const i2j = `${root_solution_array[i][0]} ${root_solution_array[j][0]}`;
          const j2i = `${root_solution_array[j][0]} ${root_solution_array[i][0]}`;
          const inode = root_solution_array[i][1];
          const jnode = root_solution_array[j][1];
          if (this.rootssub.has(i2j) && !inode.issuperof(jnode)) {
            return false;
          }
          if (this.rootssub.has(j2i) && !jnode.issuperof(inode)) {
            return false;
          }
          if (this.rootsequal.has(i2j) && !inode.same(jnode)) {
            return false;
          }
          if (this.rootsequal.has(j2i) && !jnode.same(inode)) {
            return false;
          }
          if (this.rootsnotsure.has(i2j) && !inode.issubof(jnode) && !inode.issuperof(jnode)) {
            return false;
          }
          if (this.rootsnotsure.has(j2i) && !inode.issubof(jnode) && !inode.issuperof(jnode)) {
            return false;
          }
        }
      }
      return true;
    }

    function* dfs(id : number, root_resolution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (id === root_array.length) {
        if (check_root_solution(root_resolution)) {
          yield new Map(root_resolution);
          return;
        }
      }
      else {
        for (let solution of solution_range_copy.get(root_array[id])!) {
          root_resolution.set(root_array[id], solution);
          if (!check_root_solution(root_resolution)) {
            root_resolution.delete(root_array[id]);
            continue;
          }
          yield* dfs(id + 1, root_resolution);
          root_resolution.delete(root_array[id]);
        }
      }
    }
    return dfs(0, new Map<number, Node>());
  }

  allocate_solutions_for_leaves_based_on_solutions_to_roots_in_stream(root_solution : Map<number, Node>) : Generator<Map<number, Node>> {
    const leaf_solution_range = new Map<number, Node[]>();
    let solution4leaf : Node[] = [];
    for (let [root, solution_to_root] of root_solution) {
      // There may exist roots that are not connected any other nodes.
      // They are not in node2leaf.
      if (!this.node2leaf.has(root)) continue;
      for (const { leaf_id, sub_dominance, super_dominance } of this.node2leaf.get(root)!) {
        if (sub_dominance) {
          solution4leaf = solution_to_root.subs() as Node[];
        }
        else if (super_dominance) {
          solution4leaf = solution_to_root.supers() as Node[];
        }
        else {
          solution4leaf = [solution_to_root];
        }
        if (leaf_solution_range.has(leaf_id)) {
          leaf_solution_range.set(leaf_id, leaf_solution_range.get(leaf_id)!.filter(t => solution4leaf.some(tt => tt.same(t))));
        }
        else {
          leaf_solution_range.set(leaf_id, solution4leaf);
        }
      }
    }

    for (const leaf of this.leaves) {
      leaf_solution_range.set(leaf, leaf_solution_range.get(leaf)!
        .filter(t => this.solution_range.get(leaf)!
          .some(tt => tt.same(t))
        )
      );
    }
    for (const leaf of this.leaves) leaf_solution_range.set(leaf, shuffle(leaf_solution_range.get(leaf)!));
    const leaf_array = shuffle(Array.from(this.leaves));

    let check_leaf_solution = (leaf_solution : Map<number, Node>) : boolean => {
      const leaf_solution_array = Array.from(leaf_solution);
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

    function* dfs(id : number, leaf_solution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (id === leaf_array.length) {
        if (check_leaf_solution(leaf_solution)) {
          yield new Map(leaf_solution);
          return;
        }
      }
      else {
        for (let solution of leaf_solution_range.get(leaf_array[id])!) {
          leaf_solution.set(leaf_array[id], solution);
          if (!check_leaf_solution(leaf_solution)) {
            leaf_solution.delete(leaf_array[id]);
            continue;
          }
          yield* dfs(id + 1, leaf_solution);
          leaf_solution.delete(leaf_array[id]);
        }
      }
    }
    return dfs(0, new Map<number, Node>());
  }

  /*
    If there exists a path from node1 to node2 on which sub dominance and super dominance both holds,
    neutiralize them into equal dominance.
  */
  //! Must be called after get_roots_and_leaves
  neutralize_super_and_sub() {
    let exist_sub_dominance = (path : string[]) : boolean => {
      for (const edge of path) {
        if (this.sub_dominance.has(edge)) return true;
      }
      return false;
    };
    let exist_super_dominance = (path : string[]) : boolean => {
      for (const edge of path) {
        if (this.super_dominance.has(edge)) return true;
      }
      return false;
    }
    for (const leaf of this.leaves) {
      const peak_to_path = this.climb_upwards_see_the_path(leaf);
      for (const [peak, path] of peak_to_path) {
        if (!this.roots.has(peak)) continue;
        if (exist_sub_dominance(path) && exist_super_dominance(path)) {
          for (const edge of path) {
            if (this.sub_dominance.has(edge)) {
              this.sub_dominance.delete(edge);
            }
            if (this.super_dominance.has(edge)) {
              this.super_dominance.delete(edge);
            }
          }
        }
      }
    }
  }

  build_roots_relation() : void {
    const leaf2rootinfo = new Map<number, Set<fromRoot>>();
    //! Fill in leaf2rootinfo
    for (let [nodeid, leaf_infos] of this.node2leaf) {
      if (!this.roots.has(nodeid)) continue;
      for (const leaf_info of leaf_infos) {
        if (leaf2rootinfo.has(leaf_info.leaf_id)) {
          leaf2rootinfo.get(leaf_info.leaf_id)!.add({
            root_id: nodeid, sub_dominance: leaf_info.sub_dominance,
            super_dominance: leaf_info.super_dominance, subsuper_dominance: leaf_info.subsuper_dominance,
            equal_dominance: leaf_info.equal_dominance
          });
        }
        else {
          leaf2rootinfo.set(leaf_info.leaf_id, new Set([{
            root_id: nodeid, sub_dominance: leaf_info.sub_dominance,
            super_dominance: leaf_info.super_dominance, subsuper_dominance: leaf_info.subsuper_dominance,
            equal_dominance: leaf_info.equal_dominance
          }]));
        }
      }
    }
    //! build relation among roots
    for (const [_, rootinfos] of leaf2rootinfo) {
      const root_infos_array = [...rootinfos];
      const root_infos_length = root_infos_array.length;
      for (let i = 0; i < root_infos_length; i++) {
        for (let j = i + 1; j < root_infos_length; j++) {
          const root_info1 = root_infos_array[i];
          const root_info2 = root_infos_array[j];
          if (root_info1.sub_dominance) {
            if (root_info2.equal_dominance || root_info2.super_dominance) {
              this.rootssub.add(`${root_info1.root_id} ${root_info2.root_id}`);
            }
            else {
              this.rootsnotsure.add(`${root_info1.root_id} ${root_info2.root_id}`);
              this.rootsnotsure.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
          }
          else if (root_info1.super_dominance) {
            if (root_info2.equal_dominance || root_info2.sub_dominance) {
              this.rootssub.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
            else {
              this.rootsnotsure.add(`${root_info1.root_id} ${root_info2.root_id}`);
              this.rootsnotsure.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
          }
          else if (root_info1.equal_dominance) {
            if (root_info2.sub_dominance) {
              this.rootssub.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
            else if (root_info2.super_dominance) {
              this.rootssub.add(`${root_info1.root_id} ${root_info2.root_id}`);
            }
            else if (root_info2.equal_dominance) {
              this.rootsequal.add(`${root_info1.root_id} ${root_info2.root_id}`);
              this.rootsequal.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
            else {
              this.rootsnotsure.add(`${root_info1.root_id} ${root_info2.root_id}`);
              this.rootsnotsure.add(`${root_info2.root_id} ${root_info1.root_id}`);
            }
          }
          else if (root_info1.subsuper_dominance) {
            this.rootsnotsure.add(`${root_info1.root_id} ${root_info2.root_id}`);
            this.rootsnotsure.add(`${root_info2.root_id} ${root_info1.root_id}`);
          }
        }
      }
    }
    const root_equal_leaves = new Map<number, Set<number>>();
    for (const key of this.rootsequal) {
      const [root1, root2] = key.split(" ");
      if (root_equal_leaves.has(parseInt(root1))) {
        root_equal_leaves.get(parseInt(root1))!.add(parseInt(root2));
      }
      else {
        root_equal_leaves.set(parseInt(root1), new Set([parseInt(root2)]));
      }
    }
    const visited = new Set<number>();
    let dfs = (rootid : number, curleafid : number) : void => {
      visited.add(curleafid);
      for (const next of root_equal_leaves.get(curleafid)!) {
        if (visited.has(next)) continue;
        this.leavesequal.add(`${rootid} ${next}`);
        this.leavesequal.add(`${next} ${rootid}`);
        dfs(rootid, next);
      }
    }
    for (const [rootid, _] of root_equal_leaves) {
      visited.add(rootid);
      dfs(rootid, rootid);
    }
    for (const edge of this.rootssub) {
      const [root1, root2] = edge.split(" ");
      if (this.rootssub.has(`${root2} ${root1}`)) {
        this.rootssub.delete(`${root2} ${root1}`);
        this.rootssub.delete(`${root1} ${root2}`);
        this.rootsequal.add(`${root1} ${root2}`);
        this.rootsequal.add(`${root2} ${root1}`);
      }
      else if (this.rootsequal.has(`${root2} ${root1}`) ||
        this.rootsequal.has(`${root1} ${root2}`)) {
        this.rootssub.delete(edge);
      }
      else if (this.rootsnotsure.has(`${root1} ${root2}`)
        || this.rootsnotsure.has(`${root2} ${root1}`)) {
        this.rootsnotsure.delete(`${root2} ${root1}`);
        this.rootsnotsure.delete(`${root1} ${root2}`);
      }
    }
    for (const edge of this.rootsnotsure) {
      const [root1, root2] = edge.split(" ");
      if (this.rootssub.has(`${root2} ${root1}`)
        || this.rootssub.has(`${root1} ${root2}`)
        || this.rootsequal.has(`${root2} ${root1}`)
        || this.rootsequal.has(`${root1} ${root2}`)) {
        this.rootsnotsure.delete(`${root1} ${root2}`);
        this.rootsnotsure.delete(`${root2} ${root1}`);
      }
    }
    for (const key of this.rootssub) {
      const [root1, root2] = key.split(" ");
      assert(this.rootssub.has(`${root2} ${root1}`) === false, `build_roots_relation: rootssub has ${root2} ${root1}`);
      assert(this.rootsequal.has(`${root2} ${root1}`) === false, `build_roots_relation: rootsequal has ${root2} ${root1}`);
      assert(this.rootsnotsure.has(`${root2} ${root1}`) === false, `build_roots_relation: rootsnotsure has ${root2} ${root1}`);
      assert(this.rootsnotsure.has(`${root1} ${root2}`) === false, `build_roots_relation: rootsnotsure has ${root1} ${root2}`);
    }
    for (const key of this.rootsequal) {
      const [root1, root2] = key.split(" ");
      assert(this.rootssub.has(`${root2} ${root1}`) === false, `build_roots_relation: rootssub has ${root2} ${root1}`);
      assert(this.rootssub.has(`${root1} ${root2}`) === false, `build_roots_relation: rootssub has ${root1} ${root2}`);
      assert(this.rootsnotsure.has(`${root2} ${root1}`) === false, `build_roots_relation: rootsnotsure has ${root2} ${root1}`);
      assert(this.rootsnotsure.has(`${root1} ${root2}`) === false, `build_roots_relation: rootsnotsure has ${root1} ${root2}`);
    }
  }

  build_leaves_relation() : void {
    for (let [_, leaf_infos] of this.node2leaf) {
      const leaf_infos_array = [...leaf_infos];
      const leaf_infos_length = leaf_infos_array.length;
      for (let i = 0; i < leaf_infos_length; i++) {
        for (let j = i + 1; j < leaf_infos_length; j++) {
          const leaf_info1 = leaf_infos_array[i];
          const leaf_info2 = leaf_infos_array[j];
          if (leaf_info1.sub_dominance) {
            if (leaf_info2.equal_dominance || leaf_info2.super_dominance) {
              this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else {
              this.leavesnotsure.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leavesnotsure.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
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

  can_resolve_leaves(root_solution : Map<number, Node>) : boolean {
    const leaf_solution = new Map<number, Node[]>();
    let solution4leaf : Node[] = [];
    for (let [root, solution_to_root] of root_solution) {
      // There may exist roots that are not connected any other nodes.
      // They are not in node2leaf.
      if (!this.node2leaf.has(root)) continue;
      for (const { leaf_id, sub_dominance, super_dominance } of this.node2leaf.get(root)!) {
        if (sub_dominance) {
          solution4leaf = solution_to_root.subs() as Node[];
        }
        else if (super_dominance) {
          solution4leaf = solution_to_root.supers() as Node[];
        }
        else {
          solution4leaf = [solution_to_root];
        }
        if (leaf_solution.has(leaf_id)) {
          leaf_solution.set(leaf_id, leaf_solution.get(leaf_id)!.filter(t => solution4leaf.some(tt => tt.same(t))));
        }
        else {
          leaf_solution.set(leaf_id, solution4leaf);
        }
      }
    }
    if (leaf_solution.size === 0) {
      assert(this.leaves.size === 0, "DominanceDAG::resolve_leaves: leaves is not empty when leaf_solution is empty");
      return false;
    }
    for (const leaf of this.leaves) {
      leaf_solution.set(leaf, leaf_solution.get(leaf)!
        .filter(t => this.solution_range.get(leaf)!
          .some(tt => tt.same(t))
        )
      );
      if (leaf_solution.get(leaf)!.length === 0) {
        return false;
      }
    }
    for (const leaf of this.leaves) {
      assert(leaf_solution.has(leaf), `leaf_solution does not have ${leaf}`);
      if (leaf_solution.get(leaf)!.length === 0) {
        return false;
      }
    }
    const leaves_array = [...this.leaves];
    let i4leaves_array = 0;
    let i4solutions_of_each_leaf = new Array<number>(leaves_array.length).fill(0);
    let leafID_to_solution_candidates = new Map<number, Node[]>();
    let cannot_resolve = false;
    while (true) {
      if (i4leaves_array === 0) {
        const solution_candidate = leaf_solution.get(leaves_array[i4leaves_array])!;
        leafID_to_solution_candidates.set(leaves_array[i4leaves_array], solution_candidate);
        i4leaves_array++;
      }
      else {
        // Use previous leaf solution to restrict the current leaf solution.
        let solution_candidate = leaf_solution.get(leaves_array[i4leaves_array])!;
        for (let j = 0; j < i4leaves_array; j++) {
          assert(leafID_to_solution_candidates.has(leaves_array[j]), `resolve_leaves: leafID_to_solution_candidates does not have ${leaves_array[j]}`);
          if (this.leavessub.has(`${leaves_array[j]} ${leaves_array[i4leaves_array]}`)) {
            solution_candidate = solution_candidate.filter(t =>
              t.issubof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          else if (this.leavessub.has(`${leaves_array[i4leaves_array]} ${leaves_array[j]}`)) {
            solution_candidate = solution_candidate.filter(t =>
              t.issuperof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          else if (this.leavesequal.has(`${leaves_array[j]} ${leaves_array[i4leaves_array]}`)) {
            solution_candidate = solution_candidate.filter(t =>
              t.same(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          else if (this.leavesnotsure.has(`${leaves_array[j]} ${leaves_array[i4leaves_array]}`)) {
            solution_candidate = solution_candidate.filter(t =>
              t.issubof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]])
              || t.issuperof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          if (solution_candidate.length === 0) {
            let jcopy = j;
            for (let ji = j + 1; ji < i4leaves_array; ji++) {
              i4solutions_of_each_leaf[ji] = 0;
              leafID_to_solution_candidates.delete(leaves_array[ji]);
            }
            while (true) {
              i4solutions_of_each_leaf[jcopy]++;
              if (i4solutions_of_each_leaf[jcopy] === leafID_to_solution_candidates.get(leaves_array[jcopy])!.length) {
                leafID_to_solution_candidates.delete(leaves_array[jcopy]);
                i4solutions_of_each_leaf[jcopy] = 0;
                i4leaves_array = jcopy;
                jcopy--;
              }
              else {
                break;
              }
              if (jcopy === -1) {
                cannot_resolve = true;
                break;
              }
            }
            break;
          }
        }
        if (solution_candidate.length !== 0) {
          leafID_to_solution_candidates.set(leaves_array[i4leaves_array], solution_candidate);
          i4leaves_array++;
        }
      }
      if (cannot_resolve) break;
      if (i4leaves_array === leaves_array.length) break;
    }
    if (cannot_resolve === false) {
      return true;
    }
    else return false;
  }

  resolve_nonroots_and_nonleaves_in_stream() : Generator<Map<number, Node>> {
    const local_dag_nodes = this.dag_nodes;
    const local_edge2leaf = this.edge2leaf;
    const local_node2leaf = this.node2leaf;
    const local_sub_dominance = this.sub_dominance;
    const local_super_dominance = this.super_dominance;
    const local_leaves = this.leaves;
    const local_root_array = [...this.roots];
    const father = new Map<number, number>();
    const id2child_array_id = new Map<number, number>();
    const root_array_length = local_root_array.length;
    function* dfs(root_array_id : number, id : number, child_array_id : number, this_solution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (root_array_id === root_array_length) {
        yield this_solution;
        return;
      }
      assert(this_solution.has(id), `resolve_nonroots_and_nonleaves: this_solution does not have ${id}`);
      const root_id = local_root_array[root_array_id];
      if (child_array_id === local_dag_nodes.get(id)!.outs.length) {
        if (id === root_id) {
          yield* dfs(root_array_id + 1,
            root_array_id + 1 === root_array_length ? -1 : local_root_array[root_array_id + 1], 0, this_solution);
          return;
        }
        assert(father.has(id),
          `resolve_nonroots_and_nonleaves: father does not have ${id}, root_id is ${root_id}, child_array_id is ${child_array_id}`);
        yield* dfs(root_array_id, father.get(id)!, id2child_array_id.get(father.get(id)!)! + 1, this_solution);
        return;
      }
      id2child_array_id.set(id, child_array_id);
      const child = local_dag_nodes.get(id)!.outs[child_array_id];
      if (local_leaves.has(child)) {
        yield* dfs(root_array_id, id, child_array_id + 1, this_solution);
        return;
      }
      father.set(child, id);
      const edge = `${id} ${child}`;
      let solution_candidate_for_child : Node[] = [];
      let first = true;
      /*
      For each edge from node n1 to node n2, consider all the leaves that can be reached from n1 through the edge.
      Since the solution of the reachable leaves have been settled, we can first restrict the solution range of n2
      based on the solution of the reachable leaves and then randomly pick a solution from the restricted solution range.
      */
      const leaf_ids : number[] = [];
      for (const leaf_id of local_edge2leaf.get(edge)!) {
        leaf_ids.push(leaf_id);
        assert(local_node2leaf.has(child),
          `resolve_nonroots_and_nonleaves: local_node2leaf does not have ${child}
        \nnode2leaf: ${[...local_node2leaf].map(([a, b]) => `${a} -> ${[...b].map(t => t.leaf_id)}\n`)}`);
        const leaf_info = [...local_node2leaf.get(child)!].find(t => t.leaf_id === leaf_id);
        let solution_candidate_for_child_based_on_current_leaf : Node[] = [];
        // Update solution_candidate_for_child_based_on_current_leaf
        if (local_sub_dominance.has(edge)) {
          if (leaf_info!.sub_dominance) {
            solution_candidate_for_child_based_on_current_leaf =
              this_solution.get(id)!.sub_with_lowerbound(this_solution.get(leaf_id)!)!
                .map(t => t as Node);
          }
          else if (leaf_info!.subsuper_dominance) {
            solution_candidate_for_child_based_on_current_leaf = this_solution.get(id)!.subs().map(t => t as Node);
          }
          else if (leaf_info!.super_dominance) {
            solution_candidate_for_child_based_on_current_leaf =
              this_solution.get(id)!.subs().filter(t => t.issubof(this_solution.get(leaf_id)!)) as Node[];
          }
          else if (leaf_info!.equal_dominance) {
            assert(this_solution.has(leaf_id), `resolve_nonroots_and_nonleaves: local_solutions does not have ${leaf_id}`);
            solution_candidate_for_child_based_on_current_leaf = [this_solution.get(leaf_id)!];
          }
        }
        else if (local_super_dominance.has(edge)) {
          if (leaf_info!.super_dominance) {
            solution_candidate_for_child_based_on_current_leaf =
              this_solution.get(id)!.super_with_upperbound(this_solution.get(leaf_id)!)!
                .map(t => t as Node);
          }
          else if (leaf_info!.subsuper_dominance) {
            solution_candidate_for_child_based_on_current_leaf = this_solution.get(id)!.supers().map(t => t as Node);
          }
          else if (leaf_info!.sub_dominance) {
            solution_candidate_for_child_based_on_current_leaf =
              this_solution.get(id)!.supers().filter(t => t.issuperof(this_solution.get(leaf_id)!)) as Node[];
          }
          else if (leaf_info!.equal_dominance) {
            assert(this_solution.has(leaf_id), `resolve_nonroots_and_nonleaves: local_solutions does not have ${leaf_id}`);
            solution_candidate_for_child_based_on_current_leaf = [this_solution.get(leaf_id)!];
          }
        }
        else {
          solution_candidate_for_child_based_on_current_leaf = [this_solution.get(id)!];
        }
        // Update solution_candidate_for_child
        if (first) {
          solution_candidate_for_child = solution_candidate_for_child_based_on_current_leaf.map(t => t as Node);
          first = false;
        }
        else {
          solution_candidate_for_child = solution_candidate_for_child.filter(
            t => solution_candidate_for_child_based_on_current_leaf.some(tt => t.same(tt))
          );
        }
        assert(solution_candidate_for_child.length > 0,
          `resolve_nonroots_and_nonleaves: solution_candidate_for_child is empty when edge is ${edge}:
          \nleaf id to its solution: ${leaf_ids.map(t => `${t}: ${this_solution.get(t)!.str()}`).join("\n")}`);
      }
      for (const solution of solution_candidate_for_child) {
        this_solution.set(child, solution);
        yield* dfs(root_array_id, child, 0, this_solution);
      }
    }
    return dfs(0, local_root_array[0], 0, this.solutions);
  }

  // Given a node, returns all its ancestors (not including itself) plus how acestors dominate it
  //! Use after remove_removable_sub_super_dominance_in_multi_dominance and remove_removable_sub_super_dominance_in_pyramid
  get_ancestors(nodeid : number) : Map<number, toLeaf> {
    const node2node : Map<number, toLeaf> = new Map<number, toLeaf>();
    // node2node.set(nodeid, { leaf_id: nodeid, sub_dominance: false, super_dominance: false, subsuper_dominance: false, equal_dominance: false });
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number, pre_sub_dominance_path : boolean,
      pre_super_dominance_path : boolean, pre_subsuper_dominance_path : boolean, pre_equal_dominance_path : boolean) : void => {
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
          `get_ancestors: edge ${parent} -> ${id}. sub_dominance_path, super_dominance_path, subsuper_dominance_path, equal_dominance_path are not exclusive
          \nsub_dominance_path: ${sub_dominance_path}, super_dominance_path: ${super_dominance_path}, subsuper_dominance_path: ${subsuper_dominance_path}, equal_dominance_path: ${equal_dominance_path}`);

        node2node.set(parent, {
          leaf_id: leaf_id, sub_dominance: sub_dominance_path, super_dominance: super_dominance_path
          , subsuper_dominance: subsuper_dominance_path, equal_dominance: equal_dominance_path
        });
        if (node2node.has(parent)) {
          const leaf_info = node2node.get(parent)!;
          assert(sub_dominance_path === leaf_info.sub_dominance,
            `get_ancestors: thissub_dominance ${sub_dominance_path} is not equal to leaf_info.sub_dominance ${leaf_info.sub_dominance}`);
          assert(super_dominance_path === leaf_info.super_dominance,
            `get_ancestors: thissuper_dominance ${super_dominance_path} is not equal to leaf_info.super_dominance ${leaf_info.super_dominance}`);
          assert(subsuper_dominance_path === leaf_info.subsuper_dominance,
            `get_ancestors: thissubsuper_dominance ${subsuper_dominance_path} is not equal to leaf_info.subsuper_dominance ${leaf_info.subsuper_dominance}`);
          assert(equal_dominance_path === leaf_info.equal_dominance,
            `get_ancestors: thisequal_dominance ${equal_dominance_path} is not equal to leaf_info.equal_dominance ${leaf_info.equal_dominance}`);
        }
        broadcast_from_leaves_upwards(parent, leaf_id, sub_dominance_path, super_dominance_path, subsuper_dominance_path, equal_dominance_path);
      }
    }
    broadcast_from_leaves_upwards(nodeid, nodeid, false, false, false, true);
    return node2node;
  }

  // Shrink the graph into a smaller one that only contain nodes which require solutions,
  async shrink_graph() : Promise<void> {
    assert(config.mode !== 'scope', `shrink_graph: config.mode shound't be scope`);
    // !initialize the resolution
    this.initialize_resolve();
    // !Get roots and leaves
    this.get_roots_and_leaves(false);
    // !Map nodes to their leaves, recording if there exists a path from the node to leaf with leaf_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to leaf, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // leaf_ids are not in this.node2leaf
    this.dfs4node2leaf();
    // !Map edges to their reachable this.leaves
    this.dfs4edge2leaf();
    // !Remove some removable sub/super dominations using node2leaf and edge2leaf
    this.remove_removable_sub_super_dominance_in_multi_dominance();
    // !Re-dfs4node2leaf
    this.node2leaf.clear();
    this.dfs4node2leaf();
    //! Build relation among leaves, which are defined to require solutions
    //! in Dominance DAG
    this.build_leaves_relation();
    this.remove_removable_sub_super_dominance_in_pyramid();
    // !Re-dfs4node2leaf
    this.node2leaf.clear();
    this.dfs4node2leaf();
    if (config.unit_test_mode || this.name === "TypeDominanceDAG" && config.debug) {
      await this.draw("./type_constraint_before_shrink.svg");
    }
    else if (config.unit_test_mode || this.name === "StorageLocationDominanceDAG" && config.debug) {
      await this.draw("./storage_constraint_before_shrink.svg");
    }
    else if (config.unit_test_mode || this.name === "VisMutDominanceDAG" && config.debug) {
      await this.draw("./scope_constraint_before_shrink.svg");
    }
    //! Update solution_range
    this.solution_range.forEach((_, k) => {
      if (!this.leaves.has(k)) {
        this.solution_range.delete(k);
      }
    })
    const leaf_array = [...this.leaves];
    const leaf_count = leaf_array.length;
    const new_dag_nodes = new Map<number, ConstaintNode>();
    const new_sub_dominance = new Set<string>();
    const new_super_dominance = new Set<string>();
    const relevant_leaf_array = [];
    for (let i = 0; i < leaf_count; i++) {
      new_dag_nodes.set(leaf_array[i], new ConstaintNode(leaf_array[i]));
      relevant_leaf_array.push(leaf_array[i]);
    }
    const relevant_leaf_count = relevant_leaf_array.length;
    const collectedby = new Map<number, Set<number>>();
    let visit_all_collected_nodes = (nodeid : number) : Set<number> => {
      const visited = new Set<number>();
      if (!collectedby.has(nodeid)) return visited;
      for (const child of collectedby.get(nodeid)!) {
        visited.add(child);
        for (const grandchild of visit_all_collected_nodes(child)) {
          visited.add(grandchild);
        }
      }
      return visited;
    }
    for (let i = 0; i < relevant_leaf_count; i++) {
      let visited = new Set<number>();
      for (let j = i - 1; j >= 0; j--) {
        if (visited.has(relevant_leaf_array[j])) continue;
        const edge = `${relevant_leaf_array[i]} ${relevant_leaf_array[j]}`;
        const reversed_edge = `${relevant_leaf_array[j]} ${relevant_leaf_array[i]}`;
        let connect = false;
        if (this.leavessub.has(edge)) {
          new_sub_dominance.add(edge);
          connect = true;
        }
        else if (this.leavessub.has(reversed_edge)) {
          new_super_dominance.add(edge);
          connect = true;
        }
        else if (this.leavesequal.has(edge) || this.leavesequal.has(reversed_edge)) {
          connect = true;
        }
        else if (this.leavesnotsure.has(edge) || this.leavesnotsure.has(reversed_edge)) {
          this.subsuper_dominance.add(edge);
          connect = true;
        }
        if (connect) {
          if (new_dag_nodes.get(relevant_leaf_array[j])!.outbound > 0 &&
            new_dag_nodes.get(relevant_leaf_array[j])!.inbound > 0) {
            // connect from j to i
            visited = merge_set(visited, visit_all_collected_nodes(relevant_leaf_array[j]));
            if (collectedby.has(relevant_leaf_array[j])) {
              collectedby.get(relevant_leaf_array[j])!.add(relevant_leaf_array[i]);
            }
            else {
              collectedby.set(relevant_leaf_array[j], new Set([relevant_leaf_array[i]]));
            }
            new_dag_nodes.get(relevant_leaf_array[j])!.outs.push(relevant_leaf_array[i]);
            new_dag_nodes.get(relevant_leaf_array[i])!.ins.push(relevant_leaf_array[j]);
            new_dag_nodes.get(relevant_leaf_array[j])!.outbound++;
            new_dag_nodes.get(relevant_leaf_array[i])!.inbound++;
          }
          else {
            // connect from i to j
            visited = merge_set(visited, visit_all_collected_nodes(relevant_leaf_array[j]));
            if (collectedby.has(relevant_leaf_array[i])) {
              collectedby.get(relevant_leaf_array[i])!.add(relevant_leaf_array[j]);
            }
            else {
              collectedby.set(relevant_leaf_array[i], new Set([relevant_leaf_array[j]]));
            }
            new_dag_nodes.get(relevant_leaf_array[i])!.outs.push(relevant_leaf_array[j]);
            new_dag_nodes.get(relevant_leaf_array[j])!.ins.push(relevant_leaf_array[i]);
            new_dag_nodes.get(relevant_leaf_array[i])!.outbound++;
            new_dag_nodes.get(relevant_leaf_array[j])!.inbound++;
          }
        }
      }
    }
    assert(this.solution_range.size === new_dag_nodes.size, `shrink_graph: solution_range.size ${this.solution_range.size} is not equal to new_dag_nodes.size ${new_dag_nodes.size}`);
    console.log(color.green(`Before shrinking, the number of nodes in ${this.name} is ${this.dag_nodes.size}.`));
    console.log(color.green(`After shrinking, the number of nodes in ${this.name} is ${new_dag_nodes.size}.`));
    let mul = 1n;
    for (let id of this.solution_range.keys()) {
      mul *= BigInt(this.solution_range.get(id)!.length)
    }
    console.log(color.cyan(`The size of solution candidate of ${this.name} is ${mul}`));
    for (let id of new_dag_nodes.keys()) {
      for (let parent of new_dag_nodes.get(id)!.ins) {
        assert(new_dag_nodes.has(parent), `shrink_graph: new_dag_nodes does not have ${parent}`);
      }
      for (let child of new_dag_nodes.get(id)!.outs) {
        assert(new_dag_nodes.has(child), `shrink_graph: new_dag_nodes does not have ${child}`);
      }
    }
    this.dag_nodes = new_dag_nodes;
    this.sub_dominance = new_sub_dominance;
    this.super_dominance = new_super_dominance;
    this.node2leaf = new Map<number, Set<toLeaf>>();
    this.edge2leaf = new Map<string, Set<number>>();
    this.rootsequal = new Set<string>();
    this.rootssub = new Set<string>();
    this.leavesequal = new Set<string>();
    this.leavessub = new Set<string>();
    this.roots = new Set<number>();
    this.leaves = new Set<number>();
  }

  logging() {
    if (config.unit_test_mode || config.debug) {
      console.log(color.green("===node2leaf==="));
      for (const [node, leaves] of this.node2leaf) {
        console.log(color.green(`${node} -> ${[...leaves].map(t => [t.leaf_id, t.sub_dominance, t.super_dominance])}`))
      }
      console.log(color.green("===edge2leaf==="));
      for (const [edge, leaves] of this.edge2leaf) {
        console.log(color.green(`${edge} -> ${[...leaves]}`))
      }
      console.log(color.magenta("==sub_dominance=="));
      for (const edge of this.sub_dominance) {
        console.log(color.magenta(edge));
      }
      console.log(color.magenta("==super_dominance=="));
      for (const edge of this.super_dominance) {
        console.log(color.magenta(edge));
      }
      console.log(color.green("===solution_range==="));
      const keys = [...this.solution_range.keys()].sort();
      for (const key of keys) {
        console.log(color.green(`${key} -> ${this.solution_range.get(key)!.map(t => t.str())}`));
      }
    }
  }

  async resolve_by_stream(shrink : boolean = false) : Promise<void> {
    if (
      this.name === 'FuncStateMutabilityDominanceDAG' ||
      this.name === 'FuncVisibilityDominanceDAG' ||
      this.name === 'StateVariableVisibilityDominanceDAG'
    ) {
      throw new Error(`resolve_by_stream: ${this.name} should not be resolved by stream`);
    }
    if (shrink) await this.shrink_graph();
    // !initialize the resolution
    this.initialize_resolve();
    await this.check_property();
    // !Get roots and leaves
    this.get_roots_and_leaves();
    // !Map nodes to their leaves, recording if there exists a path from the node to leaf with leaf_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to leaf, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // leaf_ids are not in this.node2leaf
    this.dfs4node2leaf();
    // !Map edges to their reachable this.leaves
    this.dfs4edge2leaf();
    // !Remove some removable sub/super dominations using node2leaf and edge2leaf
    this.remove_removable_sub_super_dominance_in_multi_dominance();
    // !Re-dfs4node2leaf
    /*
      Take `constraint1` in the folder constraintDAGs for instance.
      By remove_removable_sub_super_dominance_in_multi_dominance, all sub-dominances have been removed.
      But this change does not reflect on node2leaf. 
      So in node2leaf, node 1 and node 3 still believe leaf 5 is sub-dominated by them.
      Therefore, we need to reconstruct node2leaf.
    */
    this.node2leaf.clear();
    this.dfs4node2leaf();
    /*
      Take `constraint2` in the folder constraintDAGs for instance.
      It's structure is named a pyramid. sub-dominance from 4 to 2 should be removed.
    */
    // !Build connection among roots and leaves.
    this.build_roots_relation();
    this.build_leaves_relation();
    this.remove_removable_sub_super_dominance_in_pyramid();
    this.node2leaf.clear();
    this.dfs4node2leaf();
    if (this.name === "TypeDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./type_constraint_after_shrink.svg");
    }
    else if (this.name === "StorageLocationDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./storage_constraint_after_shrink.svg");
    }
    else if (this.name === "VisMutDominanceDAG" && config.debug || config.unit_test_mode) {
      await this.draw("./scope_constraint_after_shrink.svg");
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
    for (const root_solution of this.allocate_solutions_for_roots_in_stream()) {
      this.solutions.clear();
      if (should_stop) break;
      if (this.solutions_collection.length >= maximum_solution_count) {
        should_stop = true;
        break;
      }
      if (this.leaves.size === 0) {
        this.solutions_collection.push(new Map(root_solution));
        continue;
      }
      if (this.can_resolve_leaves(root_solution) === false) continue;
      for (const [root, solution] of root_solution) {
        this.solutions.set(root, solution);
      }
      for (const leaf_solution of this.allocate_solutions_for_leaves_based_on_solutions_to_roots_in_stream(root_solution)) {
        if (should_stop) break;
        for (const [leaf, solution] of leaf_solution) {
          this.solutions.set(leaf, solution);
        }
        let exist_nonroot_nonleaf = false;
        for (const _ of this.resolve_nonroots_and_nonleaves_in_stream()) {
          exist_nonroot_nonleaf = true;
          this.solutions_collection.push(new Map(this.solutions));
          if (this.solutions_collection.length >= maximum_solution_count) {
            should_stop = true;
            break;
          }
        }
        if (!exist_nonroot_nonleaf) {
          this.solutions_collection.push(new Map(this.solutions));
          if (this.solutions_collection.length >= maximum_solution_count) {
            should_stop = true;
            break;
          }
        }
      }
    }
  }

  async resolve_by_brute_force(check : boolean, shrink : boolean = false) : Promise<void> {
    if (shrink) {
      await this.shrink_graph();
    }
    // !initialize the resolution
    this.initialize_resolve();
    const ids = [...this.solution_range.keys()];
    let traverse_solution = (id : number, solution : Map<number, Node>) : void => {
      if (id === ids.length) {
        if (!check || this.check(solution)) {
          this.solutions_collection.push(new Map(solution));
        }
        return;
      }
      assert(this.solution_range.has(ids[id]), `resolve_by_brute_force: solution_range does not have ${ids[id]}`);
      for (let solu of this.solution_range.get(ids[id])!) {
        if (this.solutions_collection.length >= config.maximum_solution_count) return;
        solution.set(ids[id], solu);
        traverse_solution(id + 1, solution);
      }
      if (this.solutions_collection.length >= config.maximum_solution_count) return;
    }
    traverse_solution(0, new Map<number, Node>());
  }

  check(solutions : Map<number, Node>) : boolean {
    // 1. Check that all nodes have been resolved.
    for (let [id, _] of this.dag_nodes) {
      if (!solutions.has(id)) {
        return false;
      }
    }
    // 2. Check that all resolved types are one of the solution candidates of the node.
    for (let [id, solution_candidates] of this.solution_range) {
      let resolved_type = solutions.get(id)!;
      let match = false;
      for (let solution_candidate of solution_candidates) {
        if (resolved_type.same(solution_candidate)) {
          match = true;
          break;
        }
      }
      if (!match) return false;
    }
    // 3. Check that all domination relations hold.
    for (let [_, node] of this.dag_nodes) {
      for (let child of node.outs) {
        if (this.sub_dominance.has(`${node.id} ${child}`)) {
          return solutions.get(child)!.issubof(solutions.get(node.id)!);
        }
        else if (this.super_dominance.has(`${node.id} ${child}`)) {
          return solutions.get(child)!.issuperof(solutions.get(node.id)!);
        }
        else if (this.subsuper_dominance.has(`${node.id} ${child}`)) {
          return solutions.get(child)!.issubof(solutions.get(node.id)!)
            || solutions.get(child)!.issuperof(solutions.get(node.id)!);
        }
        else {
          return solutions.get(node.id)!.same(solutions.get(child)!);
        }
      }
    }
    return true;
  }

  verify() : void {
    for (const solutions of this.solutions_collection) {
      // 1. Verify that all nodes have been resolved.
      let not_resolved = new Set<number>();
      for (let [id, _] of this.dag_nodes) {
        if (!solutions.has(id)) {
          not_resolved.add(id);
        }
      }
      assert(not_resolved.size === 0,
        `Dominance::Verify: nodes ${[...not_resolved]} have not been resolved.
        Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      // 2. Verify that all resolved types are one of the solution candidates of the node.
      for (let [id, solution_candidates] of this.solution_range) {
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
      // 3. Verify that all domination relations hold.
      for (let [_, node] of this.dag_nodes) {
        for (let child of node.outs) {
          if (this.sub_dominance.has(`${node.id} ${child}`)) {
            const match = solutions.get(child)!.issubof(solutions.get(node.id)!);
            assert(match,
              `Dominance::Verify: sub_dominance constraint is not satisfied:
              ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Maybe you forget to add a sub_dominance constraint in constraint.ts: TypeDominanceDAG: verify.
              Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
          }
          else if (this.super_dominance.has(`${node.id} ${child}`)) {
            const match = solutions.get(child)!.issuperof(solutions.get(node.id)!);
            assert(match,
              `Dominance::Verify: super_dominance constraint is not satisfied:
              ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Maybe you forget to add a super_dominance constraint in constraint.ts: TypeDominanceDAG: verify.
              Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
          }
          else if (this.subsuper_dominance.has(`${node.id} ${child}`)) {
            const match = solutions.get(child)!.issubof(solutions.get(node.id)!) || solutions.get(child)!.issuperof(solutions.get(node.id)!);
            assert(match,
              `Dominance::Verify: subsuper_dominance constraint is not satisfied:
              ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Maybe you forget to add a super_dominance constraint in constraint.ts: TypeDominanceDAG: verify.
              Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
          }
          else {
            assert(solutions.get(node.id)!.same(solutions.get(child)!),
              `Dominance::Verify: strong constraint is not satisfied: ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
          }
        }
      }
    }
  }

  //! This function should be called after getting roots and leaves
  async draw(path : string) : Promise<void> {
    const G = new dot.Digraph();
    const visited : Map<number, dot.Node> = new Map<number, dot.Node>();
    let dfs = (pre_gnode : dot.Node | undefined, node : number, sub_dominance : boolean,
      super_dominance : boolean, subsuper_dominance : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (super_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "subd" });
            G.addEdge(edge);
          }
          else if (sub_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'superd' });
            G.addEdge(edge);
          }
          else if (subsuper_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'suberd' });
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
        else if (subsuper_dominance) {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "suberd" });
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
          this.super_dominance.has(`${node} ${child}`), this.subsuper_dominance.has(`${node} ${child}`));
      }
    }
    for (const root of this.roots) {
      dfs(undefined, root, false, false, false);
    }
    for (const leaf of this.leaves) {
      if (!visited.has(leaf)) {
        dfs(undefined, leaf, false, false, false);
      }
    }
    const dot_lang = dot.toDot(G);
    await toFile(dot_lang, path, { format: 'svg' });
  }
}

export class TypeDominanceDAG extends DominanceDAG<TypeKind, Type> { }
export class FuncStateMutabilityDominanceDAG extends DominanceDAG<FunctionStateMutability, FuncStat> { }
export class FuncVisibilityDominanceDAG extends DominanceDAG<FunctionVisibility, FuncVis> { }
export class StateVariableVisibilityDominanceDAG extends DominanceDAG<StateVariableVisibility, VarVis> { }
export class StorageLocationDominanceDAG extends DominanceDAG<DataLocation, StorageLocation> { }
export class VisMutDominanceDAG extends DominanceDAG<VisMutKind, VisMut> { }