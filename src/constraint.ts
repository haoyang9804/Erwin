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
import { assert, create_custom_set, shuffle } from "./utility";
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
import { irnodes } from "./node";

interface toLeaf {
  leaf_id : number;
  // sub_dominance/super_dominance = true if there exists a path from the node to leaf with leaf_id,
  // sub_dominance/super_dominance domination holds.
  sub_dominance : boolean;
  super_dominance : boolean;
};
interface fromRoot {
  root_id : number;
  sub_dominance : boolean; // the solution of root_id is a sub_dominance of the solution of the node
  super_dominance : boolean; // the solution of root_id is a super_dominance of the solution of the node
};


let equal_toLeaf = (a : toLeaf, b : toLeaf) : boolean => {
  return a.leaf_id === b.leaf_id;
}
export class DominanceDAG<T, Node extends DominanceNode<T>> {
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
  rootssub : Set<string> = new Set<string>();
  rootsequal : Set<string> = new Set<string>();
  relevant_nodes : Set<number> = new Set<number>();
  name : string;
  constructor() {
    this.name = this.constructor.name;
  }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node : ConstaintNode, range : Node[]) : void {
    if (this.dag_nodes.has(node.id)) return;
    this.dag_nodes.set(node.id, node);
    this.solution_range.set(node.id, range);
  }

  specify_relevant_nodes(nodeid : number) : void {
    assert(this.dag_nodes.has(nodeid), `DominanceDAG: node ${nodeid} is not in the graph`);
    this.relevant_nodes.add(nodeid);
  }

  update(node : ConstaintNode, range : Node[]) : void {
    this.solution_range.set(node.id, range);
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

  type_range_alignment(dominator_id : number, dominatee_id : number) : void {
    if (is_equal_set(this.solution_range.get(dominator_id)!, this.solution_range.get(dominatee_id)!)) return;
    if (is_super_set(this.solution_range.get(dominator_id)!, this.solution_range.get(dominatee_id)!)) {
      this.solution_range.set(dominator_id, this.solution_range.get(dominatee_id)!);
      this.tighten_solution_range_middle_out(dominator_id);
      // if (config.debug) {
      //   console.log(`${[...this.solution_range.keys()].map(k => `${k}: ${this.solution_range.get(k)!.map(t => t.str())}`).join("\n")}`)
      // }
      return;
    }
    if (is_super_set(this.solution_range.get(dominatee_id)!, this.solution_range.get(dominator_id)!)) {
      this.solution_range.set(dominatee_id, this.solution_range.get(dominator_id)!);
      this.tighten_solution_range_middle_out(dominatee_id);
      // if (config.debug) {
      //   console.log(`${[...this.solution_range.keys()].map(k => `${k}: ${this.solution_range.get(k)!.map(t => t.str())}`).join("\n")}`)
      // }
      return;
    }
    throw new Error(`type_range_alignment: type_range of ${dominator_id}: ${this.solution_range.get(dominator_id)!.map(t => t.str())}
      and ${dominatee_id}: ${this.solution_range.get(dominatee_id)!.map(t => t.str())} cannot be aligned`);
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
    this.rootssub = new Set<string>();
    this.rootsequal = new Set<string>();
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
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number, sub_dominance : boolean, super_dominance : boolean) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const key = `${parent} ${id}`;
        let thissub_dominance = this.sub_dominance.has(key) || sub_dominance;
        let thissuper_dominance = this.super_dominance.has(key) || super_dominance;
        if (this.node2leaf.has(parent)) {
          // presub_dominance = false if there exists a path from the parent to leaf with leaf_id on which no sub_dominance domination holds.
          let presub_dominance = true;
          let presuper_dominance = true;
          let pre_leaf_info : toLeaf | undefined = undefined;
          let meet_this_leaf_before = false;
          for (const leaf_info of this.node2leaf.get(parent)!) {
            if (leaf_info.leaf_id === leaf_id) {
              meet_this_leaf_before = true;
              presub_dominance &&= leaf_info.sub_dominance;
              presuper_dominance &&= leaf_info.super_dominance;
              pre_leaf_info = leaf_info;
              break;
            }
          }
          if (meet_this_leaf_before) {
            thissub_dominance &&= presub_dominance;
            thissuper_dominance &&= presuper_dominance
            if (presub_dominance === true && thissub_dominance == false
              || presuper_dominance === true && thissuper_dominance == false
            ) {
              this.node2leaf.get(parent)!.delete(pre_leaf_info!);
              this.node2leaf.get(parent)!.add({ leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
            }
          }
          else {
            this.node2leaf.get(parent)!.add({ leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
          }
        }
        else {
          const s = create_custom_set<toLeaf>(equal_toLeaf);
          s.add({ leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
          this.node2leaf.set(parent, s);
        }
        broadcast_from_leaves_upwards(parent, leaf_id, thissub_dominance, thissuper_dominance);
      }
    }
    let broadcast_from_roots_downwards = (id : number) : void => {
      for (let child of this.dag_nodes.get(id)!.outs) {
        if (!this.node2leaf.has(child)) continue;
        for (let this_leaf_info of this.node2leaf.get(id)!) {
          for (let child_leaf_info of this.node2leaf.get(child)!) {
            if (this_leaf_info.leaf_id === child_leaf_info.leaf_id
              && !this_leaf_info.sub_dominance && !this_leaf_info.super_dominance
              && child_leaf_info.sub_dominance) {
              child_leaf_info.sub_dominance = false;
            }
            else if (this_leaf_info.leaf_id === child_leaf_info.leaf_id
              && !this_leaf_info.sub_dominance && !this_leaf_info.super_dominance
              && child_leaf_info.super_dominance) {
              child_leaf_info.super_dominance = false;
            }
          }
        }
        broadcast_from_roots_downwards(child);
      }
    }
    for (let leaf of this.leaves) {
      broadcast_from_leaves_upwards(leaf, leaf, false, false);
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
    let remove_from_roots = (node : number) : void => {
      for (const child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        assert(this.edge2leaf.has(edge), `${edge} is not included in this.edge2leaf`);
        for (const leaf of this.edge2leaf.get(edge)!) {
          const leaf_info = [...this.node2leaf.get(node)!].find(t => t.leaf_id === leaf);
          assert(leaf_info !== undefined, `remove_removable_sub_super_dominance_in_multi_dominance: leaf_info of leaf whose ID is ${leaf} is undefined`);
          if (!leaf_info!.sub_dominance && this.sub_dominance.has(edge)) {
            this.sub_dominance.delete(edge);
          }
          if (!leaf_info!.super_dominance && this.super_dominance.has(edge)) {
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
    // assert(this.leavesequal.size > 0 || this.leavessub.size > 0 || this.leaves.size === 0,
    //   `remove_removable_sub_super_dominance_in_pyramid: called before build_leaves_relation`);
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

  try_tighten_solution_range_middle_out(node : number, new_range : Node[]) : boolean {
    this.type_range_alignment(node, node);
    const solution_range = new Map(this.solution_range);
    solution_range.set(node, new_range);
    let upwards = (node : number) : boolean => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length !== 0)
          return downwards(node);
      }
      let res = true;
      for (let parent of this.dag_nodes.get(node)!.ins) {
        if (is_equal_set(solution_range.get(parent)!, solution_range.get(node)!)) {
          continue;
        }
        if (!is_super_set(solution_range.get(parent)!, solution_range.get(node)!)
          && !is_super_set(solution_range.get(node)!, solution_range.get(parent)!)) {
          return false
        }
        solution_range.set(parent, solution_range.get(node)!);
        res &&= upwards(parent)
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
        if (is_equal_set(solution_range.get(child)!, solution_range.get(node)!)) {
          continue;
        }
        if (!is_super_set(solution_range.get(child)!, solution_range.get(node)!)
          && !is_super_set(solution_range.get(node)!, solution_range.get(child)!)) {
          return false;
        }
        solution_range.set(child, solution_range.get(node)!);
        res &&= downwards(child);
        if (!res) return false;
        res &&= upwards(child);
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
        if (is_equal_set(this.solution_range.get(parent)!, this.solution_range.get(node)!)) {
          continue;
        }
        assert(is_super_set(this.solution_range.get(parent)!, this.solution_range.get(node)!)
          || is_super_set(this.solution_range.get(node)!, this.solution_range.get(parent)!),
          `tighten_solution_range_middle_out::upwards: the solution range of ${parent}:
        ${this.solution_range.get(parent)!.map(t => t.str())} is not a superset/subset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(parent, this.solution_range.get(node)!);
        upwards(parent);
        downwards(parent);
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length !== 0)
          upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        if (is_equal_set(this.solution_range.get(child)!, this.solution_range.get(node)!)) {
          continue;
        }
        assert(is_super_set(this.solution_range.get(child)!, this.solution_range.get(node)!)
          || is_super_set(this.solution_range.get(node)!, this.solution_range.get(child)!),
          `tighten_solution_range_middle_out::downwards: the solution range of ${child}:
        ${this.solution_range.get(child)!.map(t => t.str())} is not a superset/subset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(child, this.solution_range.get(node)!);
        downwards(child);
        upwards(child);
      }
    }
    upwards(node);
    downwards(node);
  }

  tighten_solution_range() {
    let broadcast_the_tightest_type_range_downwards = (node : number) : void => {
      for (let child of this.dag_nodes.get(node)!.outs) {
        let child_type_range = this.solution_range.get(child)!;
        let parent_type_range = this.solution_range.get(node)!;
        if (!is_equal_set(child_type_range, parent_type_range)) {
          assert(is_super_set(child_type_range, parent_type_range),
            `tighten_solution_range::broadcast_the_tightest_type_range_downwards: the solution
              range of ${child}: ${child_type_range.map(t => t.str())} is not a superset of the
              solution range of ${node}: ${parent_type_range.map(t => t.str())}`);
          this.solution_range.set(child, parent_type_range);
        }
        broadcast_the_tightest_type_range_downwards(child);
      }
    }
    for (let root of this.roots) {
      broadcast_the_tightest_type_range_downwards(root);
    }
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
        }
      }
      return true;
    }

    function* dfs(id : number, root_resolution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (id === root_array.length) {
        if (check_root_solution(root_resolution)) {
          yield new Map(root_resolution);
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

    for (let leaf of this.leaves) this.solution_range.set(leaf, shuffle(this.solution_range.get(leaf)!));
    const leaf_array = shuffle(Array.from(this.leaves));
    const solution_range_copy = this.solution_range;

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
        }
      }
      return true;
    }

    function* dfs(id : number, leaf_solution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (id === leaf_array.length) {
        if (check_leaf_solution(leaf_solution)) {
          yield new Map(leaf_solution);
        }
      }
      else {
        for (let solution of solution_range_copy.get(leaf_array[id])!) {
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
          leaf2rootinfo.get(leaf_info.leaf_id)!.add({ root_id: nodeid, sub_dominance: leaf_info.sub_dominance, super_dominance: leaf_info.super_dominance });
        }
        else {
          leaf2rootinfo.set(leaf_info.leaf_id, new Set([{ root_id: nodeid, sub_dominance: leaf_info.sub_dominance, super_dominance: leaf_info.super_dominance }]));
        }
      }
    }
    //! build relation among roots
    for (const [_, rootinfos] of leaf2rootinfo) {
      const root_infos_array = [...rootinfos];
      const root_infos_length = root_infos_array.length;
      for (let i = 0; i < root_infos_length; i++) {
        for (let j = i + 1; j < root_infos_length; j++) {
          const root_info = root_infos_array[i];
          const root_info2 = root_infos_array[j];
          if (root_info.sub_dominance && (!root_info2.sub_dominance && !root_info2.super_dominance)) {
            this.rootssub.add(`${root_info.root_id} ${root_info2.root_id}`);
          }
          else if (root_info.super_dominance && (!root_info2.sub_dominance && !root_info2.super_dominance)) {
            this.rootssub.add(`${root_info2.root_id} ${root_info.root_id}`);
          }
          else if ((!root_info.sub_dominance && !root_info.super_dominance) && root_info2.sub_dominance) {
            this.rootssub.add(`${root_info2.root_id} ${root_info.root_id}`);
          }
          else if ((!root_info.sub_dominance && !root_info.super_dominance) && root_info2.super_dominance) {
            this.rootssub.add(`${root_info.root_id} ${root_info2.root_id}`);
          }
          else if ((!root_info.sub_dominance && !root_info.super_dominance) && (!root_info2.sub_dominance && !root_info2.super_dominance)) {
            this.rootsequal.add(`${root_info.root_id} ${root_info2.root_id}`);
            this.rootsequal.add(`${root_info2.root_id} ${root_info.root_id}`);
          }
          else if (root_info.sub_dominance && root_info2.super_dominance) {
            this.rootssub.add(`${root_info.root_id} ${root_info2.root_id}`);
          }
          else if (root_info.super_dominance && root_info2.sub_dominance) {
            this.rootssub.add(`${root_info2.root_id} ${root_info.root_id}`);
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
      for (const key of this.rootssub) {
        const [root1, root2] = key.split(" ");
        if (this.rootssub.has(`${root2} ${root1}`)) {
          this.rootssub.delete(`${root2} ${root1}`);
          this.rootssub.delete(`${root1} ${root2}`);
          this.rootsequal.add(`${root1} ${root2}`);
          this.rootsequal.add(`${root2} ${root1}`);
        }
        else if (this.rootsequal.has(`${root2} ${root1}`) ||
          this.rootsequal.has(`${root1} ${root2}`)) {
          this.rootssub.delete(key);
        }
      }
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
          if (leaf_info1.sub_dominance && (!leaf_info2.sub_dominance && !leaf_info2.super_dominance)) {
            this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
          else if (leaf_info1.super_dominance && (!leaf_info2.sub_dominance && !leaf_info2.super_dominance)) {
            this.leavessub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
          }
          else if ((!leaf_info1.sub_dominance && !leaf_info1.super_dominance) && leaf_info2.sub_dominance) {
            this.leavessub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
          }
          else if ((!leaf_info1.sub_dominance && !leaf_info1.super_dominance) && leaf_info2.super_dominance) {
            this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
          else if ((!leaf_info1.sub_dominance && !leaf_info1.super_dominance) && (!leaf_info2.sub_dominance && !leaf_info2.super_dominance)) {
            this.leavesequal.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
            this.leavesequal.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
          else if (leaf_info1.sub_dominance && leaf_info2.super_dominance) {
            this.leavessub.add(`${leaf_info2.leaf_id} ${leaf_info1.leaf_id}`);
          }
          else if (leaf_info1.super_dominance && leaf_info2.sub_dominance) {
            this.leavessub.add(`${leaf_info1.leaf_id} ${leaf_info2.leaf_id}`);
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
    for (const key of this.leavessub) {
      const [leaf1, leaf2] = key.split(" ");
      if (this.leavessub.has(`${leaf2} ${leaf1}`)) {
        this.leavessub.delete(`${leaf2} ${leaf1}`);
        this.leavessub.delete(`${leaf1} ${leaf2}`);
        this.leavesequal.add(`${leaf1} ${leaf2}`);
        this.leavesequal.add(`${leaf2} ${leaf1}`);
      }
      else if (this.leavesequal.has(`${leaf2} ${leaf1}`) ||
        this.leavesequal.has(`${leaf1} ${leaf2}`)) {
        this.leavessub.delete(key);
      }
    }
    if (config.debug) {
      for (const key of this.leavessub) {
        const [leaf1, leaf2] = key.split(" ");
        assert(this.leavessub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavessub has ${leaf2} ${leaf1}`);
        assert(this.leavesequal.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavesequal has ${leaf2} ${leaf1}`);
      }
      for (const key of this.leavesequal) {
        const [leaf1, leaf2] = key.split(" ");
        assert(this.leavessub.has(`${leaf2} ${leaf1}`) === false, `build_leaves_relation: leavessub has ${leaf2} ${leaf1}`);
        assert(this.leavessub.has(`${leaf1} ${leaf2}`) === false, `build_leaves_relation: leavessub has ${leaf1} ${leaf2}`);
      }
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
            solution_candidate = solution_candidate.filter(t => t.issubof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          else if (this.leavessub.has(`${leaves_array[i4leaves_array]} ${leaves_array[j]}`)) {
            solution_candidate = solution_candidate.filter(t => t.issuperof(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
          }
          else if (this.leavesequal.has(`${leaves_array[j]} ${leaves_array[i4leaves_array]}`)) {
            solution_candidate = solution_candidate.filter(t => t.same(leafID_to_solution_candidates.get(leaves_array[j])![i4solutions_of_each_leaf[i4leaves_array]]));
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

    function* dfs(id : number, this_solution : Map<number, Node>) : Generator<Map<number, Node>> {
      assert(this_solution.has(id), `resolve_nonroots_and_nonleaves: this_solution does not have ${id}`);
      for (let child of local_dag_nodes.get(id)!.outs) {
        const edge = `${id} ${child}`;
        let solution_candidates : Node[] = [];
        let first = true;
        /*
        For each edge from node n1 to node n2, consider all the leaves that can be reached from n1 through the edge.
        Since the solution of the reachable leaves have been settled, we can first restrict the solution range of n2
        based on the solution of the reachable leaves and then randomly pick a solution from the restricted solution range.
        */
        const leaf_ids : number[] = [];
        for (const leaf_id of local_edge2leaf.get(edge)!) {
          leaf_ids.push(leaf_id);
          if (!local_leaves.has(child)) {
            const leaf_info = [...local_node2leaf.get(child)!].find(t => t.leaf_id === leaf_id);
            if (local_sub_dominance.has(edge)) {
              if (leaf_info!.sub_dominance) {
                const solution_candidates_for_this_leaf = this_solution.get(id)!.sub_with_lowerbound(this_solution.get(leaf_id)!)!;
                if (first) {
                  solution_candidates = solution_candidates_for_this_leaf.map(t => t as Node);
                  first = false;
                }
                else {
                  solution_candidates = solution_candidates.filter(
                    t => solution_candidates_for_this_leaf.some(tt => t.same(tt))
                  );
                  assert(solution_candidates.length > 0,
                    `resolve_nonroots_and_nonleaves case 1: solution_candidates is empty when edge is ${edge}:
                    \nleaf id to its solution: ${leaf_ids.map(t => `${t}: ${this_solution.get(t)!.str()}`).join("\n")}`);
                }
              }
              else if (leaf_info!.super_dominance) {
                throw new Error(`resolve_nonroots_and_nonleaves: ${id} should not be the sub_dominance of ${child}`);
              }
              else {
                assert(this_solution.has(leaf_id), `resolve_nonroots_and_nonleaves: local_solutions does not have ${leaf_id}`);
                const solution_for_leaf = this_solution.get(leaf_id)!;
                if (first) {
                  solution_candidates = [solution_for_leaf];
                  first = false;
                }
                else {
                  solution_candidates = solution_candidates.filter(
                    t => solution_for_leaf.same(t)
                  );
                }
              }
            }
            else if (local_super_dominance.has(edge)) {
              // child is a leaf
              throw new Error(`resolve_nonroots_and_nonleaves: ${id} should not be the super_dominance of ${child}`);
            }
            else {
              if (first) {
                solution_candidates = [this_solution.get(id)!];
                first = false;
              }
              else {
                solution_candidates = solution_candidates.filter(
                  t => [this_solution.get(id)!].some(tt => t.same(tt))
                );
                assert(solution_candidates.length > 0,
                  `resolve_nonroots_and_nonleaves case 2: solution_candidates is empty when edge is ${edge}`);
              }
            }
          }
        }
        if (!local_leaves.has(child)) {
          assert(solution_candidates.length > 0,
            `resolve_nonroots_and_nonleaves case 3: solution_candidates is empty when edge is ${edge}`);
          for (const solution of solution_candidates) {
            this_solution.set(child, solution);
            yield* dfs(child, this_solution);
          }
        }
        else {
          yield this_solution;
        }
      }
    }

    function* dfs_of_each_root(root_array_index : number, this_solution : Map<number, Node>) : Generator<Map<number, Node>> {
      if (root_array_index === local_root_array.length) {
        yield this_solution;
      }
      for (const _ of dfs(local_root_array[root_array_index], this_solution)) {
        yield* dfs_of_each_root(root_array_index + 1, this_solution);
      }
    }
    return dfs_of_each_root(0, new Map(this.solutions));
  }

  check_solution_range_after_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      assert(is_equal_set(this.solution_range.get(node)!, this.solution_range.get(child)!),
        `check_solution_range_after_tightening: the solution range of ${node}:
        ${this.solution_range.get(node)!.map(t => t.str())} is not the same as the solution
        range of ${child}: ${this.solution_range.get(child)!.map(t => t.str())}`);
      this.check_solution_range_after_tightening(child);
    }
  }

  check_solution_range_before_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      assert(is_super_set(this.solution_range.get(child)!, this.solution_range.get(node)!),
        `check_solution_range_before_tightening: the solution range of ${child}:
        ${this.solution_range.get(child)!.map(t => t.str())} is not the superset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}.
        \nBelow are solution ranges for all nodes:\n
        ${[...this.solution_range.keys()].map(k => `${k}: ${this.solution_range.get(k)!.map(t => t.str())}`).join("\n")}`);
      this.check_solution_range_before_tightening(child);
    }
  }

  // Given a node, returns all its ancestors plus how acestors dominate it
  //! Use after remove_removable_sub_super_dominance_in_multi_dominance
  get_ancestors(nodeid : number) : Map<number, toLeaf> {
    const node2node : Map<number, toLeaf> = new Map<number, toLeaf>();
    node2node.set(nodeid, { leaf_id: nodeid, sub_dominance: false, super_dominance: false });
    let broadcast_from_leaves_upwards = (id : number, leaf_id : number, sub_dominance : boolean, super_dominance : boolean) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const key = `${parent} ${id}`;
        let thissub_dominance = this.sub_dominance.has(key) || sub_dominance;
        let thissuper_dominance = this.super_dominance.has(key) || super_dominance;
        node2node.set(parent, { leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
        if (node2node.has(parent)) {
          const leaf_info = node2node.get(parent)!;
          assert(thissub_dominance === leaf_info.sub_dominance,
            `get_ancestors: thissub_dominance ${thissub_dominance} is not equal to leaf_info.sub_dominance ${leaf_info.sub_dominance}`);
          assert(thissuper_dominance === leaf_info.super_dominance,
            `get_ancestors: thissuper_dominance ${thissuper_dominance} is not equal to leaf_info.super_dominance ${leaf_info.super_dominance}`);
        }
        // if (node2node.has(parent)) {
        //   // presub_dominance = false if there exists a path from the parent to leaf with leaf_id on which no sub_dominance domination holds.
        //   let presub_dominance = true;
        //   let presuper_dominance = true;
        //   const leaf_info = node2node.get(parent)!;
        //   assert(leaf_info.leaf_id === leaf_id, `get_ancestors: leaf_info.leaf_id ${leaf_info.leaf_id} is not equal to leaf_id ${leaf_id}`);
        //   presub_dominance &&= leaf_info.sub_dominance;
        //   presuper_dominance &&= leaf_info.super_dominance;
        //   thissub_dominance &&= presub_dominance;
        //   thissuper_dominance &&= presuper_dominance
        //   if (presub_dominance === true && thissub_dominance == false
        //     || presuper_dominance === true && thissuper_dominance == false
        //   ) {
        //     node2node.delete(parent);
        //     node2node.set(parent, { leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
        //   }
        // }
        // else {
        //   node2node.set(parent, { leaf_id: leaf_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
        // }
        broadcast_from_leaves_upwards(parent, leaf_id, thissub_dominance, thissuper_dominance);
      }
    }
    // let broadcast_from_roots_downwards = (id : number) : void => {
    //   for (let child of this.dag_nodes.get(id)!.outs) {
    //     if (!node2node.has(child)) continue;
    //     const this_leaf_info = node2node.get(id)!;
    //     const child_leaf_info = node2node.get(child)!;
    //     if (!this_leaf_info.sub_dominance && !this_leaf_info.super_dominance
    //       && child_leaf_info.sub_dominance) {
    //       child_leaf_info.sub_dominance = false;
    //     }
    //     else if (!this_leaf_info.sub_dominance && !this_leaf_info.super_dominance
    //       && child_leaf_info.super_dominance) {
    //       child_leaf_info.super_dominance = false;
    //     }
    //     broadcast_from_roots_downwards(child);
    //   }
    // }
    broadcast_from_leaves_upwards(nodeid, nodeid, false, false);
    // for (let root of this.roots) {
    //   broadcast_from_roots_downwards(root);
    // }
    return node2node;
  }

  // Shrink the graph into a smaller one that only contain nodes which require solutions,
  async shrink_graph() : Promise<void> {
    assert(config.mode !== 'scope', `shrink_graph: config.mode shound't be scope`);
    // !initialize the resolution
    this.initialize_resolve();
    // !Get roots and leaves
    this.get_roots_and_leaves(false);
    // ! Neturalize the dominance
    this.neutralize_super_and_sub();
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
    if (this.name === "TypeDominanceDAG") {
      if (config.debug) {
        await this.draw("./type_constraint_before_shrink.svg");
      }
    }
    //! Update solution_range
    this.solution_range.forEach((_, k) => {
      if (!this.relevant_nodes.has(k)) {
        this.solution_range.delete(k);
      }
    })
    const leaf_array = [...this.leaves];
    const leaf_count = leaf_array.length;
    const new_dag_nodes = new Map<number, ConstaintNode>();
    const new_sub_dominance = new Set<string>();
    const new_super_dominance = new Set<string>();
    const new_equal_dominance = new Set<string>();
    const relevant_leaf_array = [];
    console.log(color.cyan(`The size of the relevant nodes is ${this.relevant_nodes.size}`));
    for (let i = 0; i < leaf_count; i++) {
      if (this.relevant_nodes.has(leaf_array[i])) {
        this.relevant_nodes.delete(leaf_array[i]);
        new_dag_nodes.set(leaf_array[i], new ConstaintNode(leaf_array[i]));
        relevant_leaf_array.push(leaf_array[i]);
      }
    }
    const relevant_leaf_set = new Set(relevant_leaf_array);
    const relevant_leaf_count = relevant_leaf_array.length;
    for (let i = 0; i < relevant_leaf_count; i++) {
      for (let j = i - 1; j >= 0; j--) {
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
        if (connect) {
          new_dag_nodes.get(relevant_leaf_array[i])!.outs.push(relevant_leaf_array[j]);
          new_dag_nodes.get(relevant_leaf_array[j])!.ins.push(relevant_leaf_array[i]);
          new_dag_nodes.get(relevant_leaf_array[i])!.outbound++;
          new_dag_nodes.get(relevant_leaf_array[j])!.inbound++;
        }
      }
    }
    // let gid = -1;
    //! In TypeDominanceDAG, literals should be considered.
    if (config.unit_test_mode || this.name === "TypeDominanceDAG") {
      const node2literals : Map<number, toLeaf>[] = [];
      for (const literal_id of this.relevant_nodes) {
        new_dag_nodes.set(literal_id, new ConstaintNode(literal_id));
        if (!config.unit_test_mode) assert(irnodes.has(literal_id), `shrink_graph: irnodes does not have ${literal_id}`);
        if (!config.unit_test_mode) assert(irnodes.get(literal_id)!.typeName === "IRLiteral",
          `shrink_graph: ${literal_id} is not a literal, but a ${irnodes.get(literal_id)!.typeName}.
          \nIt's parents: ${this.dag_nodes.get(literal_id)!.ins}
          \nIt's inbound: ${this.dag_nodes.get(literal_id)!.inbound}
          \nIt's children: ${this.dag_nodes.get(literal_id)!.outs}
          \nIt's outbound: ${this.dag_nodes.get(literal_id)!.outbound}`);
        //! The literal and the leaf variable decl may have the same ancestor (including the literal itself).
        const node2literal = this.get_ancestors(literal_id);
        const visitleaf = new Set<number>();
        // const lazyvisitleaf = new Set<number>();
        node2literals.push(node2literal);
        for (let ancestor of node2literal.keys()) {
          assert(this.node2leaf.has(ancestor), `shrink_graph: node2leaf does not have ${ancestor}`);
          const literal_info = node2literal.get(ancestor)!;
          assert(!literal_info.super_dominance, `shrink_graph: literal id ${literal_info.leaf_id} literal_info.super_dominance is true`);
          for (const leaf of this.node2leaf.get(ancestor)!) {
            if (leaf.leaf_id === literal_id) continue;
            if (visitleaf.has(leaf.leaf_id)) continue;
            if (relevant_leaf_set.has(leaf.leaf_id)) {
              if (leaf.super_dominance && literal_info.sub_dominance) {
                new_super_dominance.add(`${literal_id} ${leaf.leaf_id}`);
                visitleaf.add(leaf.leaf_id);
              }
              else if (leaf.sub_dominance && literal_info.sub_dominance) {
                // lazyvisitleaf.add(leaf.leaf_id);
              }
              else if (!leaf.sub_dominance && !leaf.super_dominance && literal_info.sub_dominance) {
                new_super_dominance.add(`${literal_id} ${leaf.leaf_id}`);
                visitleaf.add(leaf.leaf_id);
              }
              else if (leaf.super_dominance && !literal_info.sub_dominance && !literal_info.super_dominance) {
                new_super_dominance.add(`${literal_id} ${leaf.leaf_id}`);
                visitleaf.add(leaf.leaf_id);
              }
              else if (leaf.sub_dominance && !literal_info.sub_dominance && !literal_info.super_dominance) {
                new_sub_dominance.add(`${literal_id} ${leaf.leaf_id}`);
                visitleaf.add(leaf.leaf_id);
              }
              else if (!leaf.sub_dominance && !leaf.super_dominance && !literal_info.sub_dominance && !literal_info.super_dominance) {
                visitleaf.add(leaf.leaf_id);
              }
              new_dag_nodes.get(literal_id)!.outs.push(leaf.leaf_id);
              new_dag_nodes.get(leaf.leaf_id)!.ins.push(literal_id);
              new_dag_nodes.get(literal_id)!.outbound++;
              new_dag_nodes.get(leaf.leaf_id)!.inbound++;
            }
          }
        }
        // for (let leaf_id of lazyvisitleaf) {
        //   if (visitleaf.has(leaf_id)) continue;
        //   const id = gid--;
        //   new_dag_nodes.set(id, new ConstaintNode(id));
        //   this.solution_range.set(id, this.solution_range.get(leaf_id)!);
        //   new_sub_dominance.add(`${id} ${literal_id}`);
        //   new_sub_dominance.add(`${id} ${leaf_id}`);
        //   new_dag_nodes.get(id)!.outs.push(literal_id);
        //   new_dag_nodes.get(literal_id)!.ins.push(id);
        //   new_dag_nodes.get(id)!.outs.push(leaf_id);
        //   new_dag_nodes.get(leaf_id)!.ins.push(id);
        //   new_dag_nodes.get(id)!.outbound += 2;
        //   new_dag_nodes.get(leaf_id)!.inbound++;
        //   new_dag_nodes.get(literal_id)!.outbound++;
        // }
      }
      //! Now build the relation among literals
      //! First suppose the two literals have a common ancestor.
      const node2literal_length = node2literals.length;
      // const uncertain_literal_pairs = new Map<string, string>();
      for (let i = 0; i < node2literal_length; i++) {
        for (let j = i + 1; j < node2literal_length; j++) {
          const node2literal_i = node2literals[i];
          const node2literal_j = node2literals[j];
          let certain_relation = false;
          // let uncertain_relation = false;
          let grade_i, grade_j;
          let literal_info_i, literal_info_j;
          for (const ancestor of node2literal_i.keys()) {
            if (node2literal_j.has(ancestor)) {
              literal_info_i = node2literal_i.get(ancestor)!;
              literal_info_j = node2literal_j.get(ancestor)!;
              if (literal_info_i.super_dominance) grade_i = 2;
              else if (literal_info_i.sub_dominance) grade_i = 0;
              else grade_i = 1;
              if (literal_info_j.super_dominance) grade_j = 2;
              else if (literal_info_j.sub_dominance) grade_j = 0;
              else grade_j = 1;
              if (grade_i > grade_j) {
                new_super_dominance.add(`${literal_info_i.leaf_id} ${literal_info_j.leaf_id}`);
                certain_relation = true;
              }
              else if (grade_i < grade_j) {
                new_sub_dominance.add(`${literal_info_i.leaf_id} ${literal_info_j.leaf_id}`);
                certain_relation = true;
              }
              else if (grade_i === grade_j && grade_i === 1) {
                new_equal_dominance.add(`${literal_info_i.leaf_id} ${literal_info_j.leaf_id}`);
                certain_relation = true;
              }
              // else {
              // uncertain_relation = true;
              // }
              if (certain_relation) {
                new_dag_nodes.get(literal_info_i.leaf_id)!.outs.push(literal_info_j.leaf_id);
                new_dag_nodes.get(literal_info_j.leaf_id)!.ins.push(literal_info_i.leaf_id);
                new_dag_nodes.get(literal_info_i.leaf_id)!.outbound++;
                new_dag_nodes.get(literal_info_j.leaf_id)!.inbound++;
                break;
              }
            }
          }
          // if (!certain_relation && uncertain_relation) {
          //   assert(literal_info_i !== undefined, `shrink_graph: literal_info_i is undefined`);
          //   assert(literal_info_j !== undefined, `shrink_graph: literal_info_j is undefined`);
          //   assert(grade_i === grade_j, `shrink_graph: grade_i ${grade_i} is not equal to grade_j ${grade_j}`);
          //   assert(grade_i !== 1, `shrink_graph: grade_i ${grade_i} is equal to 1`);
          //   uncertain_literal_pairs.set(`${literal_info_i.leaf_id} ${literal_info_j.leaf_id}`,
          //     grade_i === 0 ? "sub" : "super");
          // const id = gid--;
          // new_dag_nodes.set(id, new ConstaintNode(id));
          // this.solution_range.set(id, this.solution_range.get(literal_info_i.leaf_id)!);
          // if (grade_i == 0) {
          //   new_sub_dominance.add(`${id} ${literal_info_i.leaf_id}`);
          //   new_sub_dominance.add(`${id} ${literal_info_j.leaf_id}`);
          // }
          // else if (grade_i == 2) {
          //   new_super_dominance.add(`${id} ${literal_info_i.leaf_id}`);
          //   new_super_dominance.add(`${id} ${literal_info_j.leaf_id}`);
          // }
          // new_dag_nodes.get(id)!.outs.push(literal_info_i.leaf_id);
          // new_dag_nodes.get(literal_info_i.leaf_id)!.ins.push(id);
          // new_dag_nodes.get(id)!.outs.push(literal_info_j.leaf_id);
          // new_dag_nodes.get(literal_info_j.leaf_id)!.ins.push(id);
          // new_dag_nodes.get(id)!.outbound += 2;
          // new_dag_nodes.get(literal_info_i.leaf_id)!.inbound++;
          // new_dag_nodes.get(literal_info_j.leaf_id)!.inbound++;
          // }
        }
      }
      //! Second suppose the two literals have common decendants, which according to the property
      //! of Dominance DAG, can only be leaves.
      const literals = [...this.relevant_nodes];
      const literal_count = literals.length;
      for (let i = 0; i < literal_count; i++) {
        this.relevant_nodes.delete(literals[i]);
        const leaf_infos_i = this.node2leaf.get(literals[i])!;
        for (let j = i - 1; j >= 0; j--) {
          const leaf_infos_j = this.node2leaf.get(literals[j])!;
          const common_leaf_info = [...leaf_infos_i].filter(t => [...leaf_infos_j].some(tt => tt.leaf_id === t.leaf_id));
          assert(common_leaf_info.length === 0 || common_leaf_info.length === 1,
            `shrink_graph: common_leaf_info.length ${common_leaf_info.length} is not equal to 0 or 1`);
          if (common_leaf_info.length === 1) {
            const leaf_info_i = [...leaf_infos_i].find(t => t.leaf_id === common_leaf_info[0].leaf_id)!;
            const leaf_info_j = [...leaf_infos_j].find(t => t.leaf_id === common_leaf_info[0].leaf_id)!;
            let grade_i;
            if (leaf_info_i.sub_dominance) grade_i = 2;
            else if (leaf_info_i.super_dominance) grade_i = 0;
            else grade_i = 1;
            let grade_j;
            if (leaf_info_j.sub_dominance) grade_j = 2;
            else if (leaf_info_j.super_dominance) grade_j = 0;
            else grade_j = 1;
            let i_sub_dominance_j = grade_i > grade_j;
            let j_sub_dominance_i = grade_i < grade_j;
            let i_dominance_j = grade_i === grade_j && grade_i === 1;
            if (new_sub_dominance.has(`${literals[i]} ${literals[j]}`) ||
              new_super_dominance.has(`${literals[j]} ${literals[i]}`)) {
              assert(i_sub_dominance_j, `shrink_graph: i_sub_dominance_j is false`);
            }
            else if (new_sub_dominance.has(`${literals[j]} ${literals[i]}`) ||
              new_super_dominance.has(`${literals[i]} ${literals[j]}`)) {
              assert(j_sub_dominance_i, `shrink_graph: j_sub_dominance_i is false`);
            }
            else if (new_equal_dominance.has(`${literals[j]} ${literals[i]}`) ||
              new_equal_dominance.has(`${literals[i]} ${literals[j]}`)) {
              assert(i_dominance_j, `shrink_graph: i_dominance_j is false`);
            }
            else {
              let certain_relation = false;
              if (i_sub_dominance_j) {
                new_sub_dominance.add(`${literals[i]} ${literals[j]}`);
                certain_relation = true;
              }
              else if (j_sub_dominance_i) {
                new_super_dominance.add(`${literals[i]} ${literals[j]}`);
                certain_relation = true;
              }
              else if (i_dominance_j) {
                new_equal_dominance.add(`${literals[i]} ${literals[j]}`);
                certain_relation = true;
              }
              // else {
              //   assert (grade_i === grade_j, `shrink_graph: grade_i ${grade_i} is not equal to grade_j ${grade_j}`);
              //   if (grade_i === 2) {

              //   }
              // }
              if (certain_relation) {
                new_dag_nodes.get(literals[i])!.outs.push(literals[j]);
                new_dag_nodes.get(literals[j])!.ins.push(literals[i]);
                new_dag_nodes.get(literals[i])!.outbound++;
                new_dag_nodes.get(literals[j])!.inbound++;
              }
            }
          }
        }
      }

    }
    assert(this.relevant_nodes.size === 0, `shrink_graph: relevant_nodes ${this.relevant_nodes} is not empty`);
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
    // !initialize the resolution
    this.initialize_resolve();
    if (shrink) await this.shrink_graph();
    // !Get roots and leaves
    this.get_roots_and_leaves();
    // ! Neturalize the dominance
    this.neutralize_super_and_sub();
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
    if (this.name === "TypeDominanceDAG") {
      if (config.debug) {
        await this.draw("./type_constraint_after_shrink.svg");
      }
    }
    if (this.name === "TypeDominanceDAG") {
      // !Check before solution range tightening
      for (let root of this.roots) {
        this.check_solution_range_before_tightening(root);
      }
      // !Tighten the solution range for each node
      this.tighten_solution_range();
      // !Check after solution range tightening
      for (let root of this.roots) {
        this.check_solution_range_after_tightening(root);
      }
    }
    // this.logging();
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
          // for (const [node, solution] of nonroot_nonleaf_solution) {
          //   this.solutions.set(node, solution);
          // }
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
    // 1. Verify that all nodes have been resolved.
    for (let [id, _] of this.dag_nodes) {
      if (!solutions.has(id)) {
        return false;
      }
    }
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
      if (!match) return false;
    }
    // 3. Verify that all domination relations hold.
    for (let [_, node] of this.dag_nodes) {
      for (let child of node.outs) {
        if (this.sub_dominance.has(`${node.id} ${child}`)) {
          const subttypes = solutions.get(node.id)!.subs();
          let typeofchild = solutions.get(child)!;
          let match = false;
          for (let sub_dominance of subttypes) {
            if (typeofchild.same(sub_dominance)) {
              match = true;
              break;
            }
          }
          if (!match) return false;
        }
        else if (this.super_dominance.has(`${node.id} ${child}`)) {
          const supers = solutions.get(node.id)!.supers();
          let typeofchild = solutions.get(child)!;
          let match = false;
          for (let sub_dominance of supers) {
            if (typeofchild.same(sub_dominance)) {
              match = true;
              break;
            }
          }
          if (!match) return false;
        }
        else {
          if (!(solutions.get(node.id)!.same(solutions.get(child)!))) return false;
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
        `Dominance::Verify: nodes ${[...not_resolved]} have not been resolved.`);
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
        assert(match, `Dominance::Verify: solution ${resolved_type.str()} to node ${id} is not one of the solution candidates: ${solution_candidates.map(t => t.str()).join(", ")}`);
      }
      // 3. Verify that all domination relations hold.
      for (let [_, node] of this.dag_nodes) {
        for (let child of node.outs) {
          if (this.sub_dominance.has(`${node.id} ${child}`)) {
            const subttypes = solutions.get(node.id)!.subs();
            let typeofchild = solutions.get(child)!;
            let match = false;
            for (let sub_dominance of subttypes) {
              if (typeofchild.same(sub_dominance)) {
                match = true;
                break;
              }
            }
            assert(match,
              `Dominance::Verify: sub_dominance constraint is not satisfied:
              ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Maybe you forget to add a sub_dominance constraint in constraint.ts: TypeDominanceDAG: verify.`);
          }
          else if (this.super_dominance.has(`${node.id} ${child}`)) {
            const supers = solutions.get(node.id)!.supers();
            let typeofchild = solutions.get(child)!;
            let match = false;
            for (let sub_dominance of supers) {
              if (typeofchild.same(sub_dominance)) {
                match = true;
                break;
              }
            }
            assert(match,
              `Dominance::Verify: super_dominance constraint is not satisfied:
              ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}.
              Maybe you forget to add a super_dominance constraint in constraint.ts: TypeDominanceDAG: verify.`);
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
    let dfs = (pre_gnode : dot.Node | undefined, node : number, sub_dominance : boolean, super_dominance : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (super_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "is sub of" });
            G.addEdge(edge);
          }
          else if (sub_dominance) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'is super of' });
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
          const edge = new dot.Edge([pre_gnode, gnode], { [dot.attribute.label]: 'is super of' });
          G.addEdge(edge);
        }
        else if (super_dominance) {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "is sub of" });
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
        dfs(gnode, child, this.sub_dominance.has(`${node} ${child}`), this.super_dominance.has(`${node} ${child}`));
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

export class TypeDominanceDAG extends DominanceDAG<TypeKind, Type> { }
export class FuncStateMutabilityDominanceDAG extends DominanceDAG<FunctionStateMutability, FuncStat> { }
export class FuncVisibilityDominanceDAG extends DominanceDAG<FunctionVisibility, FuncVis> { }
export class StateVariableVisibilityDominanceDAG extends DominanceDAG<StateVariableVisibility, VarVis> { }
export class StorageLocationDominanceDAG extends DominanceDAG<DataLocation, StorageLocation> { }