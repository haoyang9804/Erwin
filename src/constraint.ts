import { assert, intersection, merge_set } from "./utility";
import { Type, TypeKind, MappingType, ArrayType } from "./type"
import * as dot from 'ts-graphviz';
import { config } from './config'
import { new_global_id } from "./genContext";
import { toFile } from "@ts-graphviz/adapter";
import { Log } from "./log";
import { DataLocation } from "solc-typed-ast";
import { StorageLocation } from "./loc";
import { VisMut, VisMutKind } from "./vismut";
import { LinkedListNode } from "./dataStructor";
import { decl_db, expr_db } from "./db";
import { Value, is_equal_range, is_super_range } from "./value";

/**
 * Stores how a non-leaf constraint node restrains a leaf node.
 */
interface toLeaf {
  // leaf's id
  leaf_id : number;
  // leaf's solution is the sub of node's solution
  sub : boolean;
  // leaf's solution is the super of node's solution
  super : boolean;
  // leaf's solution is in the same range of node's solution
  same_range : boolean;
  // leaf's solution is the same as the node's solution
  same : boolean;
  // leaf's solution is the equivalent of the node's solution
  equal : boolean;
};

/**
 * A node in the constraint graph
 */
export class ConstraintNode {
  id : number;
  inbound : number = 0;
  outbound : number = 0;
  ins : number[] = [];
  outs : number[] = [];
  constructor(id : number) {
    this.id = id;
  }
}
/**
 * A directed acyclic graph that stores the constraints between nodes.
 */
export class ConstraintDAG<T, V extends Value<T>> {
  dag_nodes : Map<number, ConstraintNode> = new Map<number, ConstraintNode>();
  // If 'id1 id2' is installed in sub/super, then the solution of id2 is a sub/super of the solution of id1
  sub : Set<string> = new Set();
  super : Set<string> = new Set();
  solutions = new Map<number, V>();
  solution_range = new Map<number, V[]>();
  solutions_collection : Map<number, V>[] = [];
  // Records the IDs of roots/leaves
  roots : Set<number> = new Set<number>();
  leaves : Set<number> = new Set<number>();
  // For each node, records the IDs of its reachable leaves and the sub/super domination between the node and the leaf.
  // If there are multiple paths from node to leaf, then the sub does not hold as long as there exists a path on which sub domination does not hold.
  // leaf are not in node2leaf.
  // Isolated nodes are not in node2leaf.
  node2leaf : Map<number, Set<toLeaf>> = new Map<number, Set<toLeaf>>();
  // Map each edge to its reachable leaves
  edge2leaf : Map<string, Set<number>> = new Map<string, Set<number>>();
  // If "leaf1 leaf2" is in leaves_sub, then the solution of leaf2 is a sub of the solution of leaf1.
  leaves_sub : Set<string> = new Set<string>();
  // If "leaf1 leaf2" is in leaves_same, then the solution of leaf2 is exactly the same as the solution of leaf1.
  leaves_same : Set<string> = new Set<string>();
  // If "leaf1 leaf2" is in leaves_equal, then the solution of leaf2 is the equivalent of the solution of leaf1.
  leaves_equal : Set<string> = new Set<string>();
  leaves_same_range : Set<string> = new Set<string>();
  name : string;

  constructor() {
    this.name = this.constructor.name;
  }

  clear() : void {
    this.dag_nodes.clear();
    this.sub.clear();
    this.super.clear();
    this.solutions.clear();
    this.solution_range.clear();
    this.solutions_collection = [];
    this.roots.clear();
    this.leaves.clear();
    this.node2leaf.clear();
    this.edge2leaf.clear();
    this.leaves_sub.clear();
    this.leaves_same.clear();
    this.leaves_equal.clear();
    this.leaves_same_range.clear();
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

  newNode(id : number) : ConstraintNode {
    return new ConstraintNode(id);
  }

  insert(nodeid : number, range : V[]) : void {
    if (this.dag_nodes.has(nodeid)) return;
    const node = this.newNode(nodeid);
    this.dag_nodes.set(node.id, node);
    this.solution_range.set(node.id, range);
  }

  remove(nodeid : number) : void {
    assert(this.dag_nodes.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the graph`);
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
    this.sub = new Set([...this.sub].filter(t => !t.includes(`${nodeid}`)));
    this.super = new Set([...this.super].filter(t => !t.includes(`${nodeid}`)));
  }

  update(nodeid : number, range : V[]) : void {
    assert(this.dag_nodes.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the graph`);
    assert(this.solution_range.has(nodeid), `ConstraintDAG: node ${nodeid} is not in the solution_range`);
    const intersected_range = [...intersection(new Set<V>(this.solution_range.get(nodeid)), new Set<V>(range))];
    assert(intersected_range.length > 0,
      `ConstraintDAG: node ${nodeid} has empty solution range.
       solution_range of ${nodeid} is ${this.solution_range.get(nodeid)!.map(t => t.str())}
       new solution range is ${range.map(t => t.str())}`);
    this.solution_range.set(nodeid, intersected_range);
    if (!is_equal_range(this.solution_range.get(nodeid)!, intersected_range)) {
      this.tighten_solution_range_middle_out(nodeid);
    }
  }

  force_update(nodeid : number, range : V[]) : void {
    this.solution_range.set(nodeid, range);
  }

  check_connection(from : number, to : number) : boolean {
    return this.dag_nodes.get(from)!.outs.includes(to);
  }

  connect(from : number, to : number, rank ?: string) : void {
    if (this.check_connection(from, to)) return;
    assert(this.dag_nodes.has(from), `ConstraintDAG: node ${from} is not in the graph`);
    assert(this.dag_nodes.has(to), `ConstraintDAG: node ${to} is not in the graph`);
    if (from === to) return;
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    if (config.debug)
      assert(rank === undefined || rank === "sub" || rank === "super", `ConstraintDAG: rank ${rank} is not supported`)
    if (rank === "sub") {
      this.sub.add(`${from} ${to}`);
    }
    else if (rank === "super") {
      this.super.add(`${from} ${to}`);
    }
  }

  remove_connection(from : number, to : number) : void {
    if (!this.check_connection(from, to)) return;
    this.dag_nodes.get(to)!.ins = this.dag_nodes.get(to)!.ins.filter(t => t !== from);
    this.dag_nodes.get(from)!.outs = this.dag_nodes.get(from)!.outs.filter(t => t !== to);
    this.dag_nodes.get(to)!.inbound--;
    this.dag_nodes.get(from)!.outbound--;
    this.sub.delete(`${from} ${to}`);
    this.super.delete(`${from} ${to}`);
  }

  solution_range_of(nodeid : number) : V[] {
    assert(this.solution_range.has(nodeid), `${this.name}: node ${nodeid} is not in solution_range`);
    return this.solution_range.get(nodeid)!;
  }

  non_empty_solution_range_of(nodeid : number) : boolean {
    return this.solution_range_of(nodeid).length > 0;
  }

  has_solution_range(nodeid : number) : boolean {
    return this.solution_range.has(nodeid);
  }

  protected dominator_solution_range_should_be_shrinked(dominator_id : number, dominatee_id : number) : V[] | undefined {
    let minimum_solution_range_of_dominator;
    const rank = this.sub.has(`${dominator_id} ${dominatee_id}`) ? "sub" :
      this.super.has(`${dominator_id} ${dominatee_id}`) ? "super" : undefined;
    if (rank === undefined) {
      minimum_solution_range_of_dominator = [...
        merge_set(new Set<V>(this.solution_range.get(dominatee_id)!
          .flatMap(t => t.supers() as V[])), new Set<V>(this.solution_range.get(dominatee_id)!
            .flatMap(t => t.subs() as V[])))
      ];
    }
    else if (rank === "sub") {
      minimum_solution_range_of_dominator = [...new Set<V>(this.solution_range.get(dominatee_id)!
        .flatMap(t => t.supers() as V[]))];
    }
    else if (rank === "super") {
      minimum_solution_range_of_dominator = [...new Set<V>(this.solution_range.get(dominatee_id)!
        .flatMap(t => t.subs() as V[]))];
    }
    else {
      throw new Error(`dominator_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = this.solution_range.get(dominator_id)!.filter(t => minimum_solution_range_of_dominator.some(g => g.same(t)));
    assert(intersection.length > 0,
      `dominator_solution_range_should_be_shrinked: intersection is empty
       dominator_id: ${dominator_id}, solution_range is ${this.solution_range.get(dominator_id)!.map(t => t.str())}
       dominatee_id: ${dominatee_id}, solution_range is ${this.solution_range.get(dominatee_id)!.map(t => t.str())}
       minimum_solution_range_of_dominator: ${minimum_solution_range_of_dominator.map(t => t.str())}`);
    if (is_super_range(this.solution_range.get(dominator_id)!, intersection) && !is_equal_range(this.solution_range.get(dominator_id)!, intersection)) {
      return intersection;
    }
    return undefined;
  }

  protected dominatee_solution_range_should_be_shrinked(dominator_id : number, dominatee_id : number) : V[] | undefined {
    let minimum_solution_range_of_dominatee;
    const rank = this.sub.has(`${dominator_id} ${dominatee_id}`) ? "sub" :
      this.super.has(`${dominator_id} ${dominatee_id}`) ? "super" : undefined;
    if (rank === undefined) {
      minimum_solution_range_of_dominatee = [...
        merge_set(new Set<V>(this.solution_range.get(dominator_id)!
          .flatMap(t => t.subs() as V[])), new Set<V>(this.solution_range.get(dominator_id)!
            .flatMap(t => t.supers() as V[])))
      ];
    }
    else if (rank === "sub") {
      minimum_solution_range_of_dominatee = [...new Set<V>(this.solution_range.get(dominator_id)!
        .flatMap(t => t.subs() as V[]))];
    }
    else if (rank === "super") {
      minimum_solution_range_of_dominatee = [...new Set<V>(this.solution_range.get(dominator_id)!
        .flatMap(t => t.supers() as V[]))];
    }
    else {
      throw new Error(`dominatee_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = this.solution_range.get(dominatee_id)!.filter(t => minimum_solution_range_of_dominatee.some(g => g.same(t)));
    assert(intersection.length > 0,
      `dominatee_solution_range_should_be_shrinked: intersection is empty
       dominator_id: ${dominator_id}, solution_range is ${this.solution_range.get(dominator_id)!.map(t => t.str())}
       dominatee_id: ${dominatee_id}, solution_range is ${this.solution_range.get(dominatee_id)!.map(t => t.str())}
       minimum_solution_range_of_dominatee: ${minimum_solution_range_of_dominatee.map(t => t.str())}`);
    if (is_super_range(this.solution_range.get(dominatee_id)!, intersection) && !is_equal_range(this.solution_range.get(dominatee_id)!, intersection)) {
      return intersection;
    }
    return undefined;
  }

  solution_range_alignment(dominator_id : number, dominatee_id : number) : void {
    assert(this.dag_nodes.has(dominator_id), `ConstraintDAG: node ${dominator_id} is not in the graph`);
    assert(this.dag_nodes.has(dominatee_id), `ConstraintDAG: node ${dominatee_id} is not in the graph`);
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
    this.solutions = new Map<number, V>();
    this.solutions_collection = [];
    this.roots = new Set<number>();
    this.leaves = new Set<number>();
    this.node2leaf = new Map<number, Set<toLeaf>>();
    this.edge2leaf = new Map<string, Set<number>>();
    this.leaves_sub = new Set<string>();
    this.leaves_same = new Set<string>();
    this.leaves_same_range = new Set<string>();
  }

  protected get_roots_and_leaves(isolated_node_is_root : boolean = true) : void {
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
      // Such nodes are isolated and not in the constraint DAG.
      for (let node of this.roots) {
        if (this.leaves.has(node)) {
          this.leaves.delete(node);
        }
      }
    }
    else {
      // Remove nodes that are both root and leaf from roots.
      // Such nodes are isolated and not in the constraint DAG.
      for (let node of this.leaves) {
        if (this.roots.has(node)) {
          this.roots.delete(node);
        }
      }
    }
  }

  protected dfs4node2leaf() : void {
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number, pre_sub_path : boolean,
      pre_super_path : boolean, pre_samerange_path : boolean, pre_same_path : boolean, pre_equal_path : boolean) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const edge = `${parent} ${id}`;
        // + means adding an constraint edge to a constraint path
        // sub_edge + same_path = sub_path
        // same_edge + sub_path = sub_path
        // sub_edge + sub_path = sub_path
        let sub_path = this.sub.has(edge) && pre_same_path
          || this.sub.has(edge) && pre_sub_path
          || !this.sub.has(edge) && !this.super.has(edge) && pre_sub_path;
        // super_edge + same_path = super_path
        // same_edge + super_path = super_path
        // super_edge + super_path = super_path
        let super_path = this.super.has(edge) && pre_same_path
          || this.super.has(edge) && pre_super_path
          || !this.sub.has(edge) && !this.super.has(edge) && pre_super_path;
        // sub_edge + super_path = samerange_path
        // super_edge + sub_path = samerange_path
        let samerange_path = pre_samerange_path || (this.sub.has(edge) && pre_super_path)
          || (this.super.has(edge) && pre_sub_path);
        // same_edge + same_path = same_path
        let same_path = !this.sub.has(edge) && !this.super.has(edge) && pre_same_path;
        // super_edge + equal_path = equal_path
        // sub_edge + equal_path = equal_path
        // same_edge + equal_path = equal_path
        let equal_path = pre_equal_path
        assert([same_path, samerange_path, sub_path, super_path, equal_path].filter(x => x).length === 1,
          `dfs4node2leaf: edge ${parent} -> ${id}, leaf ${leaf_id}: sub_path, super_path, samerange_path, same_path, equal_path are not exclusive
          \nsub_path: ${sub_path}, super_path: ${super_path}, samerange_path: ${samerange_path}, same_path: ${same_path}, equal_path: ${equal_path}`);
        // Multi-constraint from a non-leaf to this leaf node
        if (this.node2leaf.has(parent) &&
          [...this.node2leaf.get(parent)!].map(t => t.leaf_id).includes(leaf_id)) {
          const tail_info = [...this.node2leaf.get(parent)!].find(t => t.leaf_id === leaf_id)!;
          let sub_to_tail = tail_info.sub;
          let super_to_tail = tail_info.super;
          let same_range_to_tail = tail_info.same_range;
          let same_to_tail = tail_info.same;
          let equal_to_tail = tail_info.equal;
          assert([same_to_tail, same_range_to_tail, sub_to_tail, super_to_tail, equal_to_tail].filter(x => x).length === 1,
            `dfs4node2leaf edge ${parent} -> ${id}, leaf ${leaf_id}: sub_to_tail, super_to_tail, same_range_to_tail, same_to_tail, equal_to_tail are not exclusive.
            sub_to_tail: ${sub_to_tail}, super_to_tail: ${super_to_tail}, same_range_to_tail: ${same_range_to_tail}, same_to_tail: ${same_to_tail}, equal_to_tail: ${equal_to_tail}`);
          this.node2leaf.get(parent)!.delete(tail_info);
          /*
            /\ means the conjunction of two constraint paths
            /\ is commutative
            
            sub_path /\ sub_path = sub_path
            sub_path /\ super_path = equal_path
            sub_path /\ samerange_path = sub_path
            sub_path /\ same_path = same_path
            sub_path /\ equal_path = equal_path

            super_path /\ super_path = super_path
            super_path /\ sub_path = equal_path
            super_path /\ samerange_path = super_path
            super_path /\ same_path = same_path
            super_path /\ equal_path = equal_path

            samerange_path /\ samerange_path = samerange_path
            samerange_path /\ sub_path = sub_path
            samerange_path /\ super_path = super_path
            samerange_path /\ same_path = same_path
            samerange_path /\ equal_path = equal_path

            same_path /\ same_path = same_path
            same_path /\ sub_path = same_path
            same_path /\ super_path = same_path
            same_path /\ samerange_path = same_path
            same_path /\ equal_path = same_path

            equal_path /\ equal_path = equal_path
            equal_path /\ sub_path = equal_path
            equal_path /\ super_path = equal_path
            equal_path /\ samerange_path = equal_path
            equal_path /\ same_path = same_path
          */
          if (sub_to_tail) {
            if (sub_path) { }
            else if (super_path) {
              sub_to_tail = false;
              equal_to_tail = true;
            }
            else if (samerange_path) { }
            else if (same_path) {
              sub_to_tail = false;
              same_to_tail = true;
            }
            else if (equal_to_tail) {
              sub_to_tail = false;
              equal_to_tail = true;
            }
          }
          else if (super_to_tail) {
            if (sub_path) {
              super_to_tail = false;
              equal_to_tail = true;
            }
            else if (super_path) { }
            else if (samerange_path) { }
            else if (same_path) {
              super_to_tail = false;
              same_to_tail = true;
            }
            else if (equal_to_tail) {
              super_to_tail = false;
              equal_to_tail = true;
            }
          }
          else if (same_range_to_tail) {
            if (sub_path) {
              same_range_to_tail = false;
              sub_to_tail = true;
            }
            else if (super_path) {
              same_range_to_tail = false;
              super_to_tail = true;
            }
            else if (samerange_path) { }
            else if (same_path) {
              same_range_to_tail = false;
              same_to_tail = true;
            }
            else if (equal_to_tail) {
              same_range_to_tail = false;
              equal_to_tail = true;
            }
          }
          else if (same_to_tail) {
            if (sub_path) { }
            else if (super_path) { }
            else if (samerange_path) { }
            else if (same_path) { }
            else if (equal_to_tail) { }
          }
          else if (equal_to_tail) {
            if (sub_path) { }
            else if (super_path) { }
            else if (samerange_path) { }
            else if (same_path) {
              equal_to_tail = false;
              same_to_tail = true;
            }
            else if (equal_to_tail) { }
          }
          assert([same_to_tail, same_range_to_tail, sub_to_tail, super_to_tail, equal_to_tail].filter(x => x).length === 1,
            `dfs4node2leaf >2: sub_to_tail, super_to_tail, same_range_to_tail, same_to_tail, equal_to_tail are not exclusive
            pre_sub_to_tail: ${sub_to_tail}, super_to_tail: ${super_to_tail}, same_range_to_tail: ${same_range_to_tail}, same_to_tail: ${same_to_tail}, equal_to_tail: ${equal_to_tail}`);
          this.node2leaf.get(parent)!.delete(tail_info);
          this.node2leaf.get(parent)!.add({
            leaf_id: leaf_id, sub: sub_to_tail,
            super: super_to_tail, same_range: same_range_to_tail,
            same: same_to_tail, equal: equal_to_tail
          });
          broadcast_from_leaves_upwards(parent, leaf_id, sub_to_tail, super_to_tail,
            same_range_to_tail, same_to_tail, equal_to_tail);
        }
        else {
          if (this.node2leaf.has(parent)) {
            this.node2leaf.get(parent)!.add({
              leaf_id: leaf_id, sub: sub_path,
              super: super_path, same_range: samerange_path,
              same: same_path, equal: false
            });
          }
          else {
            this.node2leaf.set(parent, new Set<toLeaf>([{
              leaf_id: leaf_id, sub: sub_path,
              super: super_path, same_range: samerange_path,
              same: same_path, equal: false
            }]));
          }
          broadcast_from_leaves_upwards(parent, leaf_id, sub_path, super_path,
            samerange_path, same_path, false);
        }
      }
    }

    let broadcast_from_roots_downwards = (id : number) : void => {
      for (let child of this.dag_nodes.get(id)!.outs) {
        if (this.leaves.has(child)) continue;
        for (const this_leaf_info of this.node2leaf.get(id)!) {
          for (const child_leaf_info of this.node2leaf.get(child)!) {
            if (this_leaf_info.leaf_id !== child_leaf_info.leaf_id) {
              continue;
            }
            /*
              Suppose node N1 restrains node N2, and they both restrain leaf L;
              
              N1 |-_same L -> N2 |-_same L

              N1 |-_sub L -> ( N2 |-_sub L || N2 |-_same L || N2 |-_samerange L || N2 |-_super L || N2 |-_equal L )
              
              N1 |-_super L -> ( N2 |-_super L || N2 |-_same L || N2 |-_samerange L || N2 |-_sub L || N2 |-_equal L )

              N1 |-_samerange L -> ( N2 |-_samerange L || N2 |-_sub L || N2 |-_super L )

              N1 |-_equal L -> (N2 |-_equal L || N2 |-_sub L || N2 |-_super L || N2 |-_samerange L || N2 |-_same L)
            */
            if (this_leaf_info.same) {
              if (child_leaf_info.sub) {
                child_leaf_info.sub = false;
                child_leaf_info.same = true;
              }
              else if (child_leaf_info.super) {
                child_leaf_info.super = false;
                child_leaf_info.same = true;
              }
              else if (child_leaf_info.same_range) {
                child_leaf_info.same_range = false;
                child_leaf_info.same = true;
              }
              else if (child_leaf_info.equal) {
                child_leaf_info.equal = false;
                child_leaf_info.same = true;
              }
            }
            else if (this_leaf_info.same_range) {
              assert(!child_leaf_info.same && !child_leaf_info.equal,
                `node's (${id}) solution is in the same range as the leaf's (${this_leaf_info.leaf_id}), but node's (${child}) solution is the same as or equal to the leaf's (${this_leaf_info.leaf_id}).
                child_leaf_info.same: ${child_leaf_info.same},
                child_leaf_info.equal: ${child_leaf_info.equal}`);
            }
          }
        }
        broadcast_from_roots_downwards(child);
      }
    }
    for (let leaf of this.leaves) {
      broadcast_from_leaves_upwards(leaf, leaf, false, false, false, true, false);
    }
    for (let root of this.roots) {
      broadcast_from_roots_downwards(root);
    }
  }

  protected dfs4edge2leaf() : void {
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

  protected try_shrink_dominator_solution_range(solution_range : Map<number, V[]>,
    dominator_id : number, dominatee_id : number) : V[] {
    let minimum_solution_range_of_dominator;
    const rank = this.sub.has(`${dominator_id} ${dominatee_id}`) ? "sub" :
      this.super.has(`${dominator_id} ${dominatee_id}`) ? "super" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominator = solution_range.get(dominatee_id)!;
    else if (rank === "sub") {
      minimum_solution_range_of_dominator = [...new Set<V>(solution_range.get(dominatee_id)!.flatMap(t => t.supers() as V[]))];
    }
    else if (rank === "super") {
      minimum_solution_range_of_dominator = [...new Set<V>(solution_range.get(dominatee_id)!.flatMap(t => t.subs() as V[]))];
    }
    else {
      throw new Error(`dominator_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = solution_range.get(dominator_id)!.filter(t => minimum_solution_range_of_dominator.some(g => g.same(t)));
    return intersection;
  }

  protected try_shrink_dominatee_solution_range(solution_range : Map<number, V[]>,
    dominator_id : number, dominatee_id : number) : V[] {
    let minimum_solution_range_of_dominatee;
    const rank = this.sub.has(`${dominator_id} ${dominatee_id}`) ? "sub" :
      this.super.has(`${dominator_id} ${dominatee_id}`) ? "super" : undefined;
    if (rank === undefined) minimum_solution_range_of_dominatee = solution_range.get(dominator_id)!;
    else if (rank === "sub") {
      minimum_solution_range_of_dominatee = [...new Set<V>(solution_range.get(dominator_id)!.flatMap(t => t.subs() as V[]))];
    }
    else if (rank === "super") {
      minimum_solution_range_of_dominatee = [...new Set<V>(solution_range.get(dominator_id)!.flatMap(t => t.supers() as V[]))];
    }
    else {
      throw new Error(`dominatee_solution_range_should_be_shrinked: rank ${rank} is not supported`);
    }
    const intersection = solution_range.get(dominatee_id)!.filter(t => minimum_solution_range_of_dominatee!.some(g => g.same(t)));
    return intersection;
  }

  try_tighten_solution_range_middle_out(node : number, new_range : V[]) : boolean {
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
        if (is_equal_range(solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
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
        if (is_equal_range(solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
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

  protected tighten_solution_range_middle_out(node : number) {
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
          if (is_super_range(this.solution_range.get(parent)!, minimum_solution_range_of_dominator) &&
            !is_equal_range(this.solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
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
          if (is_super_range(this.solution_range.get(child)!, minimum_solution_range_of_dominatee) &&
            !is_equal_range(this.solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
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

  protected allocate_solutions_for_leaves_in_stream() : Generator<Map<number, V>> {
    for (let leaf of this.leaves) this.solution_range.set(leaf, this.solution_range.get(leaf)!);
    const leave_array = Array.from(this.leaves);
    Log.log(`leave_array ${leave_array.length}: ${leave_array}`);
    Log.log(`====== solution_range of leaves before allocating solutions ======\n${Array.from(this.solution_range).filter(t => this.leaves.has(t[0])).map(t => [t[0], t[1].map(g => g.str())]).join("\n")}`);
    const solution_range_copy = this.solution_range;
    let check_leaf_solution = (leaf_solution : Map<number, V>) : boolean => {
      const leaf_solution_array = Array.from(leaf_solution);
      const leaf_solution_length = leaf_solution_array.length;
      for (let i = 0; i < leaf_solution_length; i++) {
        for (let j = i + 1; j < leaf_solution_length; j++) {
          const i2j = `${leaf_solution_array[i][0]} ${leaf_solution_array[j][0]}`;
          const j2i = `${leaf_solution_array[j][0]} ${leaf_solution_array[i][0]}`;
          const inode = leaf_solution_array[i][1];
          const jnode = leaf_solution_array[j][1];
          if (this.leaves_sub.has(i2j) && !inode.is_super_of(jnode)) {
            return false;
          }
          if (this.leaves_sub.has(j2i) && !jnode.is_super_of(inode)) {
            return false;
          }
          if (this.leaves_same.has(i2j) && !inode.is_the_same_as(jnode)) {
            return false;
          }
          if (this.leaves_same.has(j2i) && !jnode.is_the_same_as(inode)) {
            return false;
          }
          if (this.leaves_equal.has(i2j) && !inode.is_equivalent_of(jnode)) {
            return false;
          }
          if (this.leaves_equal.has(j2i) && !jnode.is_equivalent_of(inode)) {
            return false;
          }
          if (this.leaves_same_range.has(i2j) && !inode.is_sub_of(jnode) && !inode.is_super_of(jnode)) {
            return false;
          }
          if (this.leaves_same_range.has(j2i) && !inode.is_sub_of(jnode) && !inode.is_super_of(jnode)) {
            return false;
          }
        }
      }
      return true;
    }

    class SolutionRangeList extends LinkedListNode<V[]> {
      new(range : V[]) : SolutionRangeList {
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

    let narrow_solution_range_for_leaves_afterwards = (id : number, solution : V) : boolean => {
      for (let j = id + 1; j < leave_array.length; j++) {
        if (this.leaves_sub.has(`${leave_array[j]} ${leave_array[id]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.supers() as V[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.is_sub_of(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leaves_sub.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.subs() as V[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.is_super_of(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leaves_same.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_same.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList([solution] as V[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.is_the_same_as(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leaves_equal.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_equal.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.equivalents() as V[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => solution.is_equivalent_of(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        else if (this.leaves_same_range.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_same_range.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            narrowed_solution_range.set(leave_array[j], new SolutionRangeList(solution.same_range() as V[]));
          }
          else {
            let leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
            const leave_solution_range = leave_solution_range_node.value().filter(
              t => merge_set(
                new Set<V>(solution.supers() as V[]), new Set<V>(solution.subs() as V[])
              ).has(t)
            );
            leave_solution_range_node = leave_solution_range_node.new(leave_solution_range);
            narrowed_solution_range.set(leave_array[j], leave_solution_range_node);
          }
        }
        if (narrowed_solution_range.has(leave_array[j])) {
          const leave_solution_range_node = narrowed_solution_range.get(leave_array[j])!;
          let leave_solution_range = leave_solution_range_node.value();
          leave_solution_range = solution_range_copy.get(leave_array[j])!.filter(t => leave_solution_range.some(g => g.same(t)));
          narrowed_solution_range.get(leave_array[j])!.update(leave_solution_range);
          if (narrowed_solution_range.get(leave_array[j])!.value().length === 0) {
            return false;
          }
        }
      }
      return true;
    }

    let clear_narrowed_solution_for_leaves_afterwards = (id : number) : void => {
      for (let j = id + 1; j < leave_array.length; j++) {
        if (this.leaves_same.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_same.has(`${leave_array[id]} ${leave_array[j]}`)
          || this.leaves_sub.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_sub.has(`${leave_array[id]} ${leave_array[j]}`)
          || this.leaves_same_range.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_same_range.has(`${leave_array[id]} ${leave_array[j]}`)
          || this.leaves_equal.has(`${leave_array[j]} ${leave_array[id]}`)
          || this.leaves_equal.has(`${leave_array[id]} ${leave_array[j]}`)) {
          if (!narrowed_solution_range.has(leave_array[j])) {
            continue;
          }
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

    function* dfs(id : number, leaf_resolution : Map<number, V>) : Generator<Map<number, V>> {
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
          if (!narrow_solution_range_for_leaves_afterwards(id, solution)) {
            clear_narrowed_solution_for_leaves_afterwards(id);
            leaf_resolution.delete(leave_array[id]);
            continue;
          }
          yield* dfs(id + 1, leaf_resolution);
          clear_narrowed_solution_for_leaves_afterwards(id);
          leaf_resolution.delete(leave_array[id]);
        }
      }
    }
    return dfs(0, new Map<number, V>());
  }

  protected build_leaves_relation() : void {
    for (let [_, leaf_infos] of this.node2leaf) {
      const leaf_infos_array = [...leaf_infos];
      const leaf_infos_length = leaf_infos_array.length;
      for (let i = 0; i < leaf_infos_length; i++) {
        for (let j = i + 1; j < leaf_infos_length; j++) {
          let leaf_info1 = leaf_infos_array[i];
          let leaf_info2 = leaf_infos_array[j];
          if (leaf_info1.sub) {
            if (leaf_info2.same || leaf_info2.super || leaf_info2.equal) {
              this.leaves_sub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.sub || leaf_info2.same_range) {
              this.leaves_same_range.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
              this.leaves_same_range.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
          }
          else if (leaf_info1.super) {
            if (leaf_info2.same || leaf_info2.sub || leaf_info2.equal) {
              this.leaves_sub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
            else if (leaf_info2.same_range || leaf_info2.super) {
              this.leaves_same_range.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_same_range.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
          }
          else if (leaf_info1.same) {
            if (leaf_info2.sub) {
              this.leaves_sub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
            else if (leaf_info2.super) {
              this.leaves_sub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.same) {
              this.leaves_same.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_same.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.equal) {
              this.leaves_equal.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_equal.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.same_range) {
              this.leaves_same_range.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_same_range.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
          }
          else if (leaf_info1.same_range) {
            this.leaves_same_range.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            this.leaves_same_range.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
          else if (leaf_info1.equal) {
            if (leaf_info2.same) {
              this.leaves_equal.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_equal.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.sub) {
              this.leaves_sub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            }
            else if (leaf_info2.super) {
              this.leaves_sub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.same_range) {
              this.leaves_same_range.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_same_range.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
            else if (leaf_info2.equal) {
              this.leaves_equal.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
              this.leaves_equal.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
            }
          }
        }
      }
    }
    const leaf_equal_leaves = new Map<number, Set<number>>();
    for (const key of this.leaves_same) {
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
        this.leaves_same.add(`${leafid} ${next}`);
        this.leaves_same.add(`${next} ${leafid}`);
        dfs(leafid, next);
      }
    }
    for (const [leafid, _] of leaf_equal_leaves) {
      visited.add(leafid);
      dfs(leafid, leafid);
    }
    for (const edge of this.leaves_sub) {
      const [leaf1, leaf2] = edge.split(" ");
      if (this.leaves_sub.has(`${leaf2} ${leaf1}`)) {
        this.leaves_sub.delete(`${leaf2} ${leaf1}`);
        this.leaves_sub.delete(`${leaf1} ${leaf2}`);
        this.leaves_equal.add(`${leaf1} ${leaf2}`);
        this.leaves_equal.add(`${leaf2} ${leaf1}`);
      }
      if (this.leaves_same.has(`${leaf2} ${leaf1}`) ||
        this.leaves_same.has(`${leaf1} ${leaf2}`)) {
        this.leaves_sub.delete(edge);
        this.leaves_equal.delete(`${leaf1} ${leaf2}`);
        this.leaves_equal.delete(`${leaf2} ${leaf1}`);
      }
      if (this.leaves_same_range.has(`${leaf1} ${leaf2}`)
        || this.leaves_same_range.has(`${leaf2} ${leaf1}`)) {
        this.leaves_same_range.delete(`${leaf2} ${leaf1}`);
        this.leaves_same_range.delete(`${leaf1} ${leaf2}`);
      }
    }
    for (const edge of this.leaves_same_range) {
      const [leaf1, leaf2] = edge.split(" ");
      if (this.leaves_sub.has(`${leaf2} ${leaf1}`)
        || this.leaves_sub.has(`${leaf1} ${leaf2}`)
        || this.leaves_same.has(`${leaf2} ${leaf1}`)
        || this.leaves_same.has(`${leaf1} ${leaf2}`)
        || this.leaves_equal.has(`${leaf2} ${leaf1}`)
        || this.leaves_equal.has(`${leaf1} ${leaf2}`)) {
        this.leaves_same_range.delete(`${leaf1} ${leaf2}`);
        this.leaves_same_range.delete(`${leaf2} ${leaf1}`);
      }
    }
    for (const edge of this.leaves_equal) {
      const [leaf1, leaf2] = edge.split(" ");
      if (this.leaves_same.has(`${leaf2} ${leaf1}`)
        || this.leaves_same.has(`${leaf1} ${leaf2}`)) {
        this.leaves_equal.delete(`${leaf1} ${leaf2}`);
        this.leaves_equal.delete(`${leaf2} ${leaf1}`);
      }
      else if (this.leaves_sub.has(`${leaf1} ${leaf2}`)) {
        this.leaves_sub.delete(`${leaf1} ${leaf2}`);
      }
      else if (this.leaves_sub.has(`${leaf2} ${leaf1}`)) {
        this.leaves_sub.delete(`${leaf2} ${leaf1}`);
      }
    }
    for (const key of this.leaves_sub) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leaves_sub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_sub has ${leaf2} ${leaf1}`);
      assert(this.leaves_same.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same has ${leaf2} ${leaf1}`);
      assert(this.leaves_same_range.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same_range has ${leaf2} ${leaf1}`);
      assert(this.leaves_same_range.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_same_range has ${leaf1} ${leaf2}`);
      assert(this.leaves_equal.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_equal has ${leaf2} ${leaf1}`);
      assert(this.leaves_equal.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_equal has ${leaf1} ${leaf2}`);
    }
    for (const key of this.leaves_same) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leaves_sub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_sub has ${leaf2} ${leaf1}`);
      assert(this.leaves_sub.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_sub has ${leaf1} ${leaf2}`);
      assert(this.leaves_same_range.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same_range has ${leaf2} ${leaf1}`);
      assert(this.leaves_same_range.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_same_range has ${leaf1} ${leaf2}`);
      assert(this.leaves_equal.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_equal has ${leaf2} ${leaf1}`);
      assert(this.leaves_equal.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_equal has ${leaf1} ${leaf2}`);
    }
    for (const key of this.leaves_equal) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leaves_sub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_sub has ${leaf2} ${leaf1}`);
      assert(this.leaves_sub.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_sub has ${leaf1} ${leaf2}`);
      assert(this.leaves_same.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same has ${leaf2} ${leaf1}`);
      assert(this.leaves_same.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_same has ${leaf1} ${leaf2}`);
      assert(this.leaves_same_range.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same_range has ${leaf2} ${leaf1}`);
      assert(this.leaves_same_range.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_same_range has ${leaf1} ${leaf2}`);
    }
    for (const key of this.leaves_same_range) {
      const [leaf1, leaf2] = key.split(" ");
      assert(this.leaves_sub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_sub has ${leaf2} ${leaf1}`);
      assert(this.leaves_sub.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_sub has ${leaf1} ${leaf2}`);
      assert(this.leaves_same.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_same has ${leaf2} ${leaf1}`);
      assert(this.leaves_same.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_same has ${leaf1} ${leaf2}`);
      assert(this.leaves_equal.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leaves_equal has ${leaf2} ${leaf1}`);
      assert(this.leaves_equal.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leaves_equal has ${leaf1} ${leaf2}`);
    }
  }

  protected remove_irrelevant_leaves() : void { }

  protected get_maximum_solution_count() : number { return -1; }

  async resolve() : Promise<void> {
    // !initialize the resolution
    this.initialize_resolve();
    await this.check_property();
    // !Get roots and leaves
    this.get_roots_and_leaves(false);
    let mul = 1n;
    for (let id of this.solution_range.keys()) {
      if (!this.leaves.has(id)) continue;
      if (this.solution_range.get(id)!.length === 0) continue;
      mul *= BigInt(this.solution_range.get(id)!.length)
    }
    Log.log(`The size of solution candidate of ${this.name} is ${mul}`);
    // !Map nodes to their leaves, recording if there exists a path from the node to leaf with leaf_id on which sub/super domination does not holds.
    // If there are multiple paths from node to leaf, then the sub does not hold as long as there exists a path on which sub domination does not hold.
    // leaf_ids are not in this.node2leaf
    this.dfs4node2leaf();
    if (config.debug || config.unit_test_mode) {
      for (let [id, leaf_infos] of this.node2leaf) {
        for (const leaf_info of leaf_infos) {
          Log.log(`node ${id} constraints leaf ${leaf_info.leaf_id}: sub: ${leaf_info.sub}, super: ${leaf_info.super}, same_range: ${leaf_info.same_range}, same: ${leaf_info.same}`);
        }
      }
    }
    this.build_leaves_relation();
    this.remove_irrelevant_leaves();
    Log.log(`> leaves_sub: ${this.leaves_sub.size}`);
    for (const edge of this.leaves_sub) {
      Log.log(edge);
    }
    Log.log(`> leaves_same: ${this.leaves_same.size}`);
    for (const edge of this.leaves_same) {
      Log.log(edge);
    }
    Log.log(`> leaves_equal: ${this.leaves_equal.size}`);
    for (const edge of this.leaves_equal) {
      Log.log(edge);
    }
    Log.log(`> leaves_same_range: ${this.leaves_same_range.size}`);
    for (const edge of this.leaves_same_range) {
      Log.log(edge);
    }
    if (config.debug || config.unit_test_mode) {
      await this.draw_for_debug();
    }
    // !Assign solutions to roots
    let should_stop = false;
    let maximum_solution_count = this.get_maximum_solution_count();
    assert(maximum_solution_count !== -1, "maximum_solution_count should be set.");
    let solution_id = 0;
    for (const leaf_solution of this.allocate_solutions_for_leaves_in_stream()) {
      this.solutions.clear();
      if (should_stop) break;
      if (this.solutions_collection.length >= maximum_solution_count) {
        should_stop = true;
        break;
      }
      Log.log(`leaf_solution${solution_id++}: ${Array.from(leaf_solution).map(t => [t[0], t[1].str()])}`);
      if (leaf_solution.size === 0) continue;
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
        `ConstraintDAG::Verify: nodes ${[...not_resolved]} have not been resolved.
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
          `ConstraintDAG::Verify: solution ${resolved_type.str()} to node ${id} is not one of the solution candidates: ${solution_candidates.map(t => t.str()).join(", ")}
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      // 3. Verify that all leaf relation constraints hold.
      for (const edge of this.leaves_sub) {
        const [leaf1, leaf2] = edge.split(" ");
        if (!solutions.has(parseInt(leaf1)) || !solutions.has(parseInt(leaf2))) continue;
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.is_super_of(node2),
          `ConstraintDAG::Verify: sub constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      for (const edge of this.leaves_same) {
        const [leaf1, leaf2] = edge.split(" ");
        if (!solutions.has(parseInt(leaf1)) || !solutions.has(parseInt(leaf2))) continue;
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.is_the_same_as(node2),
          `ConstraintDAG::Verify: same constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      for (const edge of this.leaves_equal) {
        const [leaf1, leaf2] = edge.split(" ");
        if (!solutions.has(parseInt(leaf1)) || !solutions.has(parseInt(leaf2))) continue;
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.is_equivalent_of(node2),
          `ConstraintDAG::Verify: equal constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
      for (const edge of this.leaves_same_range) {
        const [leaf1, leaf2] = edge.split(" ");
        if (!solutions.has(parseInt(leaf1)) || !solutions.has(parseInt(leaf2))) continue;
        const node1 = solutions.get(parseInt(leaf1))!;
        const node2 = solutions.get(parseInt(leaf2))!;
        assert(node1.is_sub_of(node2) || node1.is_super_of(node2),
          `ConstraintDAG::Verify: same_range constraint is not satisfied: ${leaf1} of ${node1.str()} --> ${leaf2} of ${node2.str()}.
          Here are solutions to all nodes:\n${[...solutions].sort((a, b) => a[0] - b[0]).map(([id, t]) => `${id}: ${t.str()}`).join("\n")}`);
      }
    }
  }

  protected async draw_for_debug() : Promise<void> {
    await this.draw("./debug.svg");
  }

  //! This function should be called after getting roots and leaves
  async draw(path : string) : Promise<void> {
    const G = new dot.Digraph();
    const visited : Map<number, dot.Node> = new Map<number, dot.Node>();
    let dfs = (pre_gnode : dot.Node | undefined, node : number, sub_edge : boolean,
      super_edge : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (super_edge) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "superd" });
            G.addEdge(edge);
          }
          else if (sub_edge) {
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
        if (sub_edge) {
          const edge = new dot.Edge([pre_gnode, gnode], { [dot.attribute.label]: 'subd' });
          G.addEdge(edge);
        }
        else if (super_edge) {
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
        dfs(gnode, child, this.sub.has(`${node} ${child}`),
          this.super.has(`${node} ${child}`));
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

export class TypeConstraintDAG extends ConstraintDAG<TypeKind, Type> {

  private assign_new_type_range_if_node_is_of_mapping_type(nodeid : number, solution_range : Map<number, Type[]>)
    : [number, number] | undefined | "conflict" {
    if (decl_db.is_mapping_decl(nodeid)) {
      const valueid = decl_db.value_of_mapping(nodeid);
      const keyid = decl_db.key_of_mapping(nodeid);
      const range = solution_range.get(nodeid)!;
      let value_type_range = range.filter(t => t.kind === TypeKind.MappingType).map(t => (t as MappingType).vType);
      let key_type_range = range.filter(t => t.kind === TypeKind.MappingType).map(t => (t as MappingType).kType);
      value_type_range = [...new Set(value_type_range)];
      key_type_range = [...new Set(key_type_range)];
      if (value_type_range.length === 0 || key_type_range.length === 0) return "conflict";
      solution_range.set(valueid, value_type_range);
      solution_range.set(keyid, key_type_range);
      return [keyid, valueid];
    }
    if (expr_db.is_mapping_expr(nodeid)) {
      const valueid = expr_db.value_of_mapping(nodeid);
      const keyid = expr_db.key_of_mapping(nodeid);
      const range = solution_range.get(nodeid)!;
      let value_type_range = range.filter(t => t.kind === TypeKind.MappingType).map(t => (t as MappingType).vType);
      let key_type_range = range.filter(t => t.kind === TypeKind.MappingType).map(t => (t as MappingType).kType);
      value_type_range = [...new Set(value_type_range)];
      key_type_range = [...new Set(key_type_range)];
      if (value_type_range.length === 0 || key_type_range.length === 0) return "conflict";
      solution_range.set(valueid, value_type_range);
      solution_range.set(keyid, key_type_range);
      return [keyid, valueid];
    }
    return undefined;
  }
  private assign_new_type_range_if_node_is_mapping_value(nodeid : number, solution_range : Map<number, Type[]>)
    : number | undefined | "conflict" {
    if (decl_db.is_mapping_value(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const mapping_decl_id = decl_db.mapping_of_value(nodeid)!;
      const mapping_decl_type_range = solution_range.get(mapping_decl_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).vType)));
      if (mapping_decl_type_range.length === 0) return "conflict";
      solution_range.set(mapping_decl_id, mapping_decl_type_range);
      return mapping_decl_id;
    }
    if (expr_db.is_value_expr(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const mapping_expr_id = expr_db.mapping_of_value(nodeid)!;
      const mapping_expr_type_range = solution_range.get(mapping_expr_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).vType)));
      if (mapping_expr_type_range.length === 0) return "conflict";
      solution_range.set(mapping_expr_id, mapping_expr_type_range);
      return mapping_expr_id;
    }
    return undefined;
  }
  private assign_new_type_range_if_node_is_mapping_key(nodeid : number, solution_range : Map<number, Type[]>)
    : number | undefined | "conflict" {
    if (decl_db.is_mapping_key(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const mapping_decl_id = decl_db.mapping_of_key(nodeid)!;
      const mapping_decl_type_range = solution_range.get(mapping_decl_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).kType)));
      if (mapping_decl_type_range.length === 0) return "conflict";
      solution_range.set(mapping_decl_id, mapping_decl_type_range);
      return mapping_decl_id;
    }
    if (expr_db.is_key_expr(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const mapping_expr_id = expr_db.mapping_of_key(nodeid)!;
      const mapping_expr_type_range = solution_range.get(mapping_expr_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).kType)));
      if (mapping_expr_type_range.length === 0) return "conflict";
      solution_range.set(mapping_expr_id, mapping_expr_type_range);
      return mapping_expr_id;
    }
    return undefined;
  }
  private assign_new_type_range_if_node_is_array_type(nodeid : number, solution_range : Map<number, Type[]>)
    : number | undefined | "conflict" {
    if (decl_db.is_array_decl(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const baseid = decl_db.base_of_array(nodeid);
      const base_type_range = range.filter(t => t.kind === TypeKind.ArrayType).map(t => (t as ArrayType).base);
      if (base_type_range.length === 0) return "conflict";
      solution_range.set(baseid, base_type_range);
      return baseid;
    }
    if (expr_db.is_array_expr(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const baseid = expr_db.base_of_array(nodeid);
      const base_type_range = range.filter(t => t.kind === TypeKind.ArrayType).map(t => (t as ArrayType).base);
      if (base_type_range.length === 0) return "conflict";
      solution_range.set(baseid, base_type_range);
      return baseid;
    }
    return undefined;
  }
  private assign_new_type_range_if_node_is_array_base(nodeid : number, solution_range : Map<number, Type[]>)
    : number | undefined | "conflict" {
    if (decl_db.is_base_decl(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const array_decl_id = decl_db.array_of_base(nodeid)!;
      const array_decl_type_range = solution_range.get(array_decl_id)!
        .filter(t => t.kind === TypeKind.ArrayType)
        .filter(t => range.some(g => g.same((t as ArrayType).base)));
      if (array_decl_type_range.length === 0) return "conflict";
      solution_range.set(array_decl_id, array_decl_type_range);
      return array_decl_id;
    }
    if (expr_db.is_base_expr(nodeid)) {
      const range = solution_range.get(nodeid)!;
      const array_expr_id = expr_db.array_of_base(nodeid)!;
      const array_expr_type_range = solution_range.get(array_expr_id)!
        .filter(t => t.kind === TypeKind.ArrayType)
        .filter(t => range.some(g => g.same((t as ArrayType).base)));
      if (array_expr_type_range.length === 0) return "conflict";
      solution_range.set(array_expr_id, array_expr_type_range);
      return array_expr_id;
    }
    return undefined;
  }

  protected tighten_solution_range_middle_out(node : number) {
    let updown = (node : number) : void => {
      upwards(node);
      downwards(node);
    }
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
          if (is_super_range(this.solution_range.get(parent)!, minimum_solution_range_of_dominator) &&
            !is_equal_range(this.solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
            this.solution_range.set(parent, minimum_solution_range_of_dominator);
            updown(parent);
            let result1 = this.assign_new_type_range_if_node_is_of_mapping_type(parent, this.solution_range);
            assert(result1 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result1 !== undefined) {
              updown(result1[0]);
              updown(result1[1]);
            }
            let result2 = this.assign_new_type_range_if_node_is_mapping_value(parent, this.solution_range);
            assert(result2 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result2 !== undefined) {
              updown(result2);
            }
            let result3 = this.assign_new_type_range_if_node_is_mapping_key(parent, this.solution_range);
            assert(result3 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result3 !== undefined) {
              updown(result3);
            }
            let result4 = this.assign_new_type_range_if_node_is_array_type(parent, this.solution_range);
            assert(result4 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result4 !== undefined) {
              updown(result4);
            }
            let result5 = this.assign_new_type_range_if_node_is_array_base(parent, this.solution_range);
            assert(result5 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result5 !== undefined) {
              updown(result5);
            }
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
          if (is_super_range(this.solution_range.get(child)!, minimum_solution_range_of_dominatee) &&
            !is_equal_range(this.solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
            this.solution_range.set(child, minimum_solution_range_of_dominatee);
            updown(child);
            let result1 = this.assign_new_type_range_if_node_is_of_mapping_type(child, this.solution_range);
            assert(result1 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result1 !== undefined) {
              updown(result1[0]);
              updown(result1[1]);
            }
            let result2 = this.assign_new_type_range_if_node_is_mapping_value(child, this.solution_range);
            assert(result2 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result2 !== undefined) {
              updown(result2);
            }
            let result3 = this.assign_new_type_range_if_node_is_mapping_key(child, this.solution_range);
            assert(result3 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result3 !== undefined) {
              updown(result3);
            }
            let result4 = this.assign_new_type_range_if_node_is_array_type(child, this.solution_range);
            assert(result4 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result4 !== undefined) {
              updown(result4);
            }
            let result5 = this.assign_new_type_range_if_node_is_array_base(child, this.solution_range);
            assert(result5 !== "conflict", "tighten_solution_range_middle_out: conflict");
            if (result5 !== undefined) {
              updown(result5);
            }
          }
        }
      }
    }
    return updown(node);
  }

  try_tighten_solution_range_middle_out(node : number, new_range : Type[]) : boolean {
    const solution_range = new Map(this.solution_range);
    solution_range.set(node, new_range);
    let updown = (node : number) : boolean => {
      return downwards(node) && upwards(node);
    }
    let upwards = (node : number) : boolean => {
      if (solution_range.get(node)!.length === 0) return false;
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length !== 0)
          return downwards(node);
      }
      let res = true;
      for (let parent of this.dag_nodes.get(node)!.ins) {
        const minimum_solution_range_of_dominator = this.try_shrink_dominator_solution_range(solution_range, parent, node);
        if (is_equal_range(solution_range.get(parent)!, minimum_solution_range_of_dominator)) {
          continue;
        }
        if (minimum_solution_range_of_dominator.length === 0) {
          return false;
        }
        solution_range.set(parent, minimum_solution_range_of_dominator);
        let result1 = this.assign_new_type_range_if_node_is_of_mapping_type(parent, solution_range);
        if (result1 === "conflict") return false;
        if (result1 !== undefined) {
          res &&= updown(result1[0]);
          if (!res) return false;
          res &&= updown(result1[1]);
          if (!res) return false;
        }
        let result2 = this.assign_new_type_range_if_node_is_mapping_value(parent, solution_range);
        if (result2 === "conflict") return false;
        if (result2 !== undefined) {
          res &&= updown(result2);
          if (!res) return false;
        }
        let result3 = this.assign_new_type_range_if_node_is_mapping_key(parent, solution_range);
        if (result3 === "conflict") return false;
        if (result3 !== undefined) {
          res &&= updown(result3);
          if (!res) return false;
        }
        let result4 = this.assign_new_type_range_if_node_is_array_type(parent, solution_range);
        if (result4 === "conflict") return false;
        if (result4 !== undefined) {
          res &&= updown(result4);
          if (!res) return false;
        }
        let result5 = this.assign_new_type_range_if_node_is_array_base(parent, solution_range);
        if (result5 === "conflict") return false;
        if (result5 !== undefined) {
          res &&= updown(result5);
          if (!res) return false;
        }
        res &&= upwards(parent);
        if (!res) return false;
        res &&= downwards(parent);
        if (!res) return false;
      }
      return res;
    }
    let downwards = (node : number) : boolean => {
      if (solution_range.get(node)!.length === 0) return false;
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length !== 0)
          return upwards(node);
      }
      let res = true;
      for (let child of this.dag_nodes.get(node)!.outs) {
        const minimum_solution_range_of_dominatee = this.try_shrink_dominatee_solution_range(solution_range, node, child);
        if (is_equal_range(solution_range.get(child)!, minimum_solution_range_of_dominatee)) {
          continue;
        }
        if (minimum_solution_range_of_dominatee.length === 0) {
          return false;
        }
        solution_range.set(child, minimum_solution_range_of_dominatee);
        let result1 = this.assign_new_type_range_if_node_is_of_mapping_type(child, solution_range);
        if (result1 === "conflict") return false;
        if (result1 !== undefined) {
          res &&= updown(result1[0]);
          if (!res) return false;
          res &&= updown(result1[1]);
          if (!res) return false;
        }
        let result2 = this.assign_new_type_range_if_node_is_mapping_value(child, solution_range);
        if (result2 === "conflict") return false;
        if (result2 !== undefined) {
          res &&= updown(result2);
          if (!res) return false;
        }
        let result3 = this.assign_new_type_range_if_node_is_mapping_key(child, solution_range);
        if (result3 === "conflict") return false;
        if (result3 !== undefined) {
          res &&= updown(result3);
          if (!res) return false;
        }
        let result4 = this.assign_new_type_range_if_node_is_array_type(child, solution_range);
        if (result4 === "conflict") return false;
        if (result4 !== undefined) {
          res &&= updown(result4);
          if (!res) return false;
        }
        let result5 = this.assign_new_type_range_if_node_is_array_base(child, solution_range);
        if (result5 === "conflict") return false;
        if (result5 !== undefined) {
          res &&= updown(result5);
          if (!res) return false;
        }
        res &&= upwards(child);
        if (!res) return false;
        res &&= downwards(child);
        if (!res) return false;
      }
      return res;
    }
    return updown(node);
  }

  private connect_mapping_type_var_or_expr(dominator_id : number, dominatee_id : number) : void {
    if (decl_db.is_mapping_decl(dominatee_id)) {
      const dominatee_keyid = decl_db.key_of_mapping(dominatee_id);
      const dominatee_valueid = decl_db.value_of_mapping(dominatee_id);
      if (!expr_db.is_mapping_expr(dominator_id)) {
        const keyid = new_global_id();
        const valueid = new_global_id();
        this.insert(keyid, this.solution_range.get(dominatee_keyid)!);
        this.insert(valueid, this.solution_range.get(dominatee_valueid)!);
        expr_db.add_mapping_expr(dominator_id, keyid, valueid);
      }
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      this.connect(dominator_keyid, dominatee_keyid);
      this.connect(dominator_valueid, dominatee_valueid);
    }
    else if (expr_db.is_mapping_expr(dominatee_id)) {
      const [dominatee_keyid, dominatee_valueid] = expr_db.kv_of_mapping(dominatee_id)!;
      if (!expr_db.is_mapping_expr(dominator_id)) {
        const keyid = new_global_id();
        const valueid = new_global_id();
        this.insert(keyid, this.solution_range.get(dominatee_keyid)!);
        this.insert(valueid, this.solution_range.get(dominatee_valueid)!);
        expr_db.add_mapping_expr(dominator_id, keyid, valueid);
      }
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      this.connect(dominator_keyid, dominatee_keyid);
      this.connect(dominator_valueid, dominatee_valueid);
    }
    else if (expr_db.is_mapping_expr(dominator_id)) {
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      if (!expr_db.is_mapping_expr(dominatee_id)) {
        const keyid = new_global_id();
        const valueid = new_global_id();
        this.insert(keyid, this.solution_range.get(dominator_keyid)!);
        this.insert(valueid, this.solution_range.get(dominator_valueid)!);
        expr_db.add_mapping_expr(dominatee_id, keyid, valueid);
      }
      const [dominatee_keyid, dominatee_valueid] = expr_db.kv_of_mapping(dominatee_id)!;
      this.connect(dominator_keyid, dominatee_keyid);
      this.connect(dominator_valueid, dominatee_valueid);
    }
  }

  private connect_array_type_var_or_expr(dominator_id : number, dominatee_id : number,
    rank ?: "sub" | "super") : void {
    if (decl_db.is_array_decl(dominatee_id)) {
      const dominatee_baseid = decl_db.base_of_array(dominatee_id);
      if (!expr_db.is_array_expr(dominator_id)) {
        const baseid = new_global_id();
        this.insert(baseid, this.solution_range.get(dominatee_baseid)!);
        expr_db.add_array_expr(dominator_id, baseid);
      }
      const dominator_baseid = expr_db.base_of_array(dominator_id)!;
      this.connect(dominator_baseid, dominatee_baseid, rank);
    }
    else if (expr_db.is_array_expr(dominatee_id)) {
      const dominatee_baseid = expr_db.base_of_array(dominatee_id)!;
      if (!expr_db.is_array_expr(dominator_id)) {
        const baseid = new_global_id();
        this.insert(baseid, this.solution_range.get(dominatee_baseid)!);
        expr_db.add_array_expr(dominator_id, baseid);
      }
      const dominator_baseid = expr_db.base_of_array(dominator_id)!;
      this.connect(dominator_baseid, dominatee_baseid, rank);
    }
    else if (expr_db.is_array_expr(dominator_id)) {
      const dominator_baseid = expr_db.base_of_array(dominator_id)!;
      if (!expr_db.is_array_expr(dominatee_id)) {
        const baseid = new_global_id();
        this.insert(baseid, this.solution_range.get(dominator_baseid)!);
        expr_db.add_array_expr(dominatee_id, baseid);
      }
      const dominatee_baseid = expr_db.base_of_array(dominatee_id)!;
      this.connect(dominator_baseid, dominatee_baseid, rank);
    }
  }

  private align_kv_solution_range_from_mapping(dominator_id : number, dominatee_id : number) : void {
    //* Align Mapping's key and value
    if (decl_db.is_mapping_decl(dominatee_id)) {
      const dominatee_keyid = decl_db.key_of_mapping(dominatee_id);
      const dominatee_valueid = decl_db.value_of_mapping(dominatee_id);
      this.connect_mapping_type_var_or_expr(dominator_id, dominatee_id);
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      this.solution_range_alignment(dominator_keyid, dominatee_keyid, "outside_in");
      this.solution_range_alignment(dominator_valueid, dominatee_valueid, "outside_in");
    }
    else if (expr_db.is_mapping_expr(dominatee_id)) {
      const [dominatee_keyid, dominatee_valueid] = expr_db.kv_of_mapping(dominatee_id)!;
      this.connect_mapping_type_var_or_expr(dominator_id, dominatee_id);
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      this.solution_range_alignment(dominator_keyid, dominatee_keyid, "outside_in");
      this.solution_range_alignment(dominator_valueid, dominatee_valueid, "outside_in");
    }
    else if (expr_db.is_mapping_expr(dominator_id)) {
      const [dominator_keyid, dominator_valueid] = expr_db.kv_of_mapping(dominator_id)!;
      this.connect_mapping_type_var_or_expr(dominator_id, dominatee_id);
      const [dominatee_keyid, dominatee_valueid] = expr_db.kv_of_mapping(dominatee_id)!;
      this.solution_range_alignment(dominator_keyid, dominatee_keyid, "outside_in");
      this.solution_range_alignment(dominator_valueid, dominatee_valueid, "outside_in");
    }
  }

  private align_mapping_type_range_from_kv(node_id : number) : void {
    //* Align mapping from its key and value
    if (decl_db.is_mapping_value(node_id)) {
      const range = this.solution_range.get(node_id)!;
      const mapping_decl_id = decl_db.mapping_of_value(node_id)!;
      assert(this.solution_range.has(mapping_decl_id),
        `align_mapping_type_range_from_kv: solution_range does not have ${mapping_decl_id}`);
      const mapping_decl_type_range = this.solution_range.get(mapping_decl_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).vType)));
      assert(mapping_decl_type_range.length !== 0,
        `solution_range_alignment: mapping_decl_type_range of ${mapping_decl_id} is empty`
      )
      this.solution_range.set(mapping_decl_id, mapping_decl_type_range);
      this.tighten_solution_range_middle_out(mapping_decl_id);
      this.align_mapping_type_range_from_kv(mapping_decl_id);
      this.align_array_type_range_from_base(mapping_decl_id);
    }
    else if (decl_db.is_mapping_key(node_id)) {
      const range = this.solution_range.get(node_id)!;
      const mapping_decl_id = decl_db.mapping_of_key(node_id)!;
      assert(this.solution_range.has(mapping_decl_id),
        `align_mapping_type_range_from_kv: solution_range does not have ${mapping_decl_id}`);
      const mapping_decl_type_range = this.solution_range.get(mapping_decl_id)!
        .filter(t => t.kind === TypeKind.MappingType)
        .filter(t => range.some(g => g.same((t as MappingType).kType)));
      this.solution_range.set(mapping_decl_id, mapping_decl_type_range);
      this.tighten_solution_range_middle_out(mapping_decl_id);
      this.align_mapping_type_range_from_kv(mapping_decl_id);
      this.align_array_type_range_from_base(mapping_decl_id);
    }
  }

  private align_base_type_range_from_array(dominator_id : number, dominatee_id : number) : void {
    //* Align array's base
    if (decl_db.is_array_decl(dominatee_id)) {
      const dominatee_baseid = decl_db.base_of_array(dominatee_id);
      this.connect_array_type_var_or_expr(dominator_id, dominatee_id);
      const dominator_baseid = expr_db.base_of_array(dominator_id);
      this.solution_range_alignment(dominator_baseid, dominatee_baseid, "outside_in");
    }
    else if (expr_db.is_array_expr(dominatee_id)) {
      const dominatee_baseid = expr_db.base_of_array(dominatee_id);
      this.connect_array_type_var_or_expr(dominator_id, dominatee_id);
      const dominator_baseid = expr_db.base_of_array(dominator_id);
      this.solution_range_alignment(dominator_baseid, dominatee_baseid, "outside_in");
    }
    else if (expr_db.is_array_expr(dominator_id)) {
      const dominator_baseid = expr_db.base_of_array(dominator_id);
      this.connect_array_type_var_or_expr(dominator_id, dominatee_id);
      const dominatee_baseid = expr_db.base_of_array(dominatee_id);
      this.solution_range_alignment(dominator_baseid, dominatee_baseid, "outside_in");
    }
  }

  private align_array_type_range_from_base(node_id : number) : void {
    //* Align array from its base
    if (decl_db.is_base_decl(node_id)) {
      const range = this.solution_range.get(node_id)!;
      const array_decl_id = decl_db.array_of_base(node_id)!;
      assert(this.solution_range.has(array_decl_id),
        `align_array_type_range_from_base: solution_range does not have ${array_decl_id}`);
      const array_decl_type_range = this.solution_range.get(array_decl_id)!
        .filter(t => t.kind === TypeKind.ArrayType)
        .filter(t => range.some(g => g.same((t as ArrayType).base)));
      this.solution_range.set(array_decl_id, array_decl_type_range);
      this.tighten_solution_range_middle_out(array_decl_id);
      this.align_array_type_range_from_base(array_decl_id);
      this.align_mapping_type_range_from_kv(array_decl_id);
    }
  }

  /*
  ! First, align the solution range of the dominator and dominatee
  ! Second, if the dominatee is of mapping type, align its key and value to the dominator's
  !         if the dominatee is of array type, align its base to the dominator's
  ! Third, if the dominatee/dominator is a mapping's key or value, update the corresponding mapping type
  !        if the dominatee/dominator is an array's base, update the corresponding array type
  */

  solution_range_alignment(dominator_id : number, dominatee_id : number,
    direction : "inside_out" | "outside_in" | "bidirectional" = "bidirectional") : void {
    super.solution_range_alignment(dominator_id, dominatee_id);
    if (direction === "bidirectional" || direction === "outside_in") {
      this.align_kv_solution_range_from_mapping(dominator_id, dominatee_id);
      this.align_base_type_range_from_array(dominator_id, dominatee_id);
    }
    if (direction === "bidirectional" || direction === "inside_out") {
      this.align_mapping_type_range_from_kv(dominator_id);
      this.align_mapping_type_range_from_kv(dominatee_id);
      this.align_array_type_range_from_base(dominator_id);
      this.align_array_type_range_from_base(dominatee_id);
    }
  }
  connect(dominator_id : number, dominatee_id : number,
    rank ?: "sub" | "super") : void {
    this.connect_mapping_type_var_or_expr(dominator_id, dominatee_id);
    this.connect_array_type_var_or_expr(dominator_id, dominatee_id);
    super.connect(dominator_id, dominatee_id, rank);
  }

  protected async draw_for_debug() : Promise<void> {
    await this.draw("./type_constraint.svg");
  }

  protected remove_irrelevant_leaves() : void {
    this.leaves.forEach(leaf => {
      if (decl_db.is_mapping_decl(leaf) || decl_db.is_array_decl(leaf) ||
        !decl_db.is_vardecl(leaf) && !expr_db.is_literal(leaf)) {
        this.leaves.delete(leaf);
        for (const edge of this.leaves_same) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_same.delete(edge);
          }
        }
        for (const edge of this.leaves_sub) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_sub.delete(edge);
          }
        }
        for (const edge of this.leaves_same_range) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_same_range.delete(edge);
          }
        }
      }
    });
  }

  protected get_maximum_solution_count() {
    if (config.mode === 'type') {
      return config.maximum_solution_count;
    }
    return 1;
  }
}
export class StorageLocationConstraintDAG extends ConstraintDAG<DataLocation, StorageLocation> {
  protected async draw_for_debug() : Promise<void> {
    await this.draw("./storage_constraint.svg");
  }

  protected get_maximum_solution_count() {
    if (config.mode === 'loc') {
      return config.maximum_solution_count;
    }
    return 1;
  }

  protected remove_irrelevant_leaves() : void {
    this.leaves.forEach(leaf => {
      if (expr_db.is_literal(leaf)) {
        this.leaves.delete(leaf);
        for (const edge of this.leaves_same) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_same.delete(edge);
          }
        }
        for (const edge of this.leaves_sub) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_sub.delete(edge);
          }
        }
        for (const edge of this.leaves_same_range) {
          const [leaf1, leaf2] = edge.split(" ");
          if (parseInt(leaf1) === leaf || parseInt(leaf2) === leaf) {
            this.leaves_same_range.delete(edge);
          }
        }
      }
    });
  }
}
export class VisMutConstraintDAG extends ConstraintDAG<VisMutKind, VisMut> {
  protected async draw_for_debug() : Promise<void> {
    await this.draw("./vismut_constraint.svg");
  }

  protected get_maximum_solution_count() {
    if (config.mode === 'scope') {
      return config.maximum_solution_count;
    }
    return 1;
  }
}

export const type_dag = new TypeConstraintDAG();
export const vismut_dag = new VisMutConstraintDAG();
export const storage_location_dag = new StorageLocationConstraintDAG();