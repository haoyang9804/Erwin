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
import { assert, create_custom_set, extend_arrayofmap, pick_random_element, shuffle, select_random_elements } from "./utility";
import { Type, TypeKind, size_of_type } from "./type"
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

interface toTail {
  tail_id : number;
  // sub_dominance/super_dominance = true if there exists a path from the node to tail with tail_id,
  // sub_dominance/super_dominance domination holds.
  sub_dominance : boolean;
  super_dominance : boolean;
};
let equal_toTail = (a : toTail, b : toTail) : boolean => {
  return a.tail_id === b.tail_id;
}

export class DominanceDAG<T, Node extends DominanceNode<T>> {
  dag_nodes : Map<number, ConstaintNode> = new Map<number, ConstaintNode>();
  // If 'id1 id2' is installed in sub_dominance/super_dominance, then the solution of id2 is a sub_dominance/super_dominance of the solution of id1
  sub_dominance : Set<string> = new Set();
  super_dominance : Set<string> = new Set();
  sub_dominance_among_heads : Set<string> = new Set();
  super_dominance_among_heads : Set<string> = new Set();
  solutions = new Map<number, Node>();
  solution_range = new Map<number, Node[]>();
  solutions_collection : Map<number, Node>[] = [];
  // Records the IDs of heads/tails
  heads : Set<number> = new Set<number>();
  tails : Set<number> = new Set<number>();
  // For each node, records the IDs of its reachable tails and the sub_dominance/super_dominance domination between the node and the tail.
  // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
  // tail are not in node2tail.
  // Isolated nodes are not in node2tail.
  node2tail : Map<number, Set<toTail>> = new Map<number, Set<toTail>>();
  // Map each edge to its reachable tails
  edge2tail : Map<string, Set<number>> = new Map<string, Set<number>>();
  // Records solution candidates of all heads
  head_solution_collection : Map<number, Node>[] = [];
  // If "tail1 tail2" is in tailssub, then the solution of tail2 is a sub of the solution of tail1.
  tailssub : Set<string> = new Set<string>();
  // If "tail1 tail2" is in tailssub, then the solution of tail2 equals to the solution of tail1.
  tailsequal : Set<string> = new Set<string>();
  headssub : Set<string> = new Set<string>();
  headsequal : Set<string> = new Set<string>();
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
    this.heads = new Set<number>();
    this.tails = new Set<number>();
    this.node2tail = new Map<number, Set<toTail>>();
    this.edge2tail = new Map<string, Set<number>>();
    this.head_solution_collection = [];
    this.tailssub = new Set<string>();
    this.tailsequal = new Set<string>();
    this.headssub = new Set<string>();
    this.headsequal = new Set<string>();
    this.sub_dominance_among_heads = new Set<string>();
    this.super_dominance_among_heads = new Set<string>();
  }

  get_heads_and_tails() : void {
    for (let [_, node] of this.dag_nodes) {
      if (node.inbound === 0) {
        this.heads.add(node.id);
      }
      if (node.outbound === 0) {
        this.tails.add(node.id);
      }
    }
    // Remove nodes that are both head and tail from tails.
    // Such nodes are isolated and not in the dominance relationship.
    for (let node of this.heads) {
      if (this.tails.has(node)) {
        this.tails.delete(node);
      }
    }
  }

  dfs4node2tail() : void {
    let broadcast_from_tails_upwards = (id : number, tail_id : number, sub_dominance : boolean, super_dominance : boolean) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const key = `${parent} ${id}`;
        let thissub_dominance = this.sub_dominance.has(key) || sub_dominance;
        let thissuper_dominance = this.super_dominance.has(key) || super_dominance;
        if (this.node2tail.has(parent)) {
          // presub_dominance = false if there exists a path from the parent to tail with tail_id on which no sub_dominance domination holds.
          let presub_dominance = true;
          let presuper_dominance = true;
          let pre_tail_info : toTail | undefined = undefined;
          let meet_this_tail_before = false;
          for (const tail_info of this.node2tail.get(parent)!) {
            if (tail_info.tail_id === tail_id) {
              meet_this_tail_before = true;
              presub_dominance &&= tail_info.sub_dominance;
              presuper_dominance &&= tail_info.super_dominance;
              pre_tail_info = tail_info;
              break;
            }
          }
          if (meet_this_tail_before) {
            thissub_dominance &&= presub_dominance;
            thissuper_dominance &&= presuper_dominance
            if (presub_dominance === true && thissub_dominance == false
              || presuper_dominance === true && thissuper_dominance == false
            ) {
              this.node2tail.get(parent)!.delete(pre_tail_info!);
              this.node2tail.get(parent)!.add({ tail_id: tail_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
            }
          }
          else {
            this.node2tail.get(parent)!.add({ tail_id: tail_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
          }
        }
        else {
          const s = create_custom_set<toTail>(equal_toTail);
          s.add({ tail_id: tail_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
          this.node2tail.set(parent, s);
        }
        broadcast_from_tails_upwards(parent, tail_id, thissub_dominance, thissuper_dominance);
      }
    }
    let broadcast_from_heads_downwards = (id : number) : void => {
      for (let child of this.dag_nodes.get(id)!.outs) {
        if (!this.node2tail.has(child)) continue;
        for (let this_tail_info of this.node2tail.get(id)!) {
          for (let child_tail_info of this.node2tail.get(child)!) {
            if (this_tail_info.tail_id === child_tail_info.tail_id
              && !this_tail_info.sub_dominance && !this_tail_info.super_dominance
              && child_tail_info.sub_dominance) {
              child_tail_info.sub_dominance = false;
            }
          }
        }
        broadcast_from_heads_downwards(child);
      }
    }
    for (let tail of this.tails) {
      broadcast_from_tails_upwards(tail, tail, false, false);
    }
    for (let head of this.heads) {
      broadcast_from_heads_downwards(head);
    }
  }

  dfs4edge2tail() : void {
    let broadcast_from_tails_upwards = (id : number, tail_id : number) : void => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const edge = `${parent} ${id}`;
        if (this.edge2tail.has(edge)) {
          this.edge2tail.get(edge)!.add(tail_id);
        }
        else {
          this.edge2tail.set(edge, new Set([tail_id]));
        }
        broadcast_from_tails_upwards(parent, tail_id);
      }
    }
    for (let tail of this.tails) {
      broadcast_from_tails_upwards(tail, tail);
    }
  }

  remove_removable_sub_dominance() : void {
    let remove_from_heads = (node : number) : void => {
      for (const child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        assert(this.edge2tail.has(edge), `${edge} is not included in this.edge2tail`);
        for (const tail of this.edge2tail.get(edge)!) {
          const tail_info = [...this.node2tail.get(node)!].find(t => t.tail_id === tail);
          assert(tail_info !== undefined, `remove_removable_sub_dominance: tail_info of tail whose ID is ${tail} is undefined`);
          if (!tail_info!.sub_dominance && this.sub_dominance.has(edge)) {
            this.sub_dominance.delete(edge);
          }
        }
        remove_from_heads(child);
      }
    }
    for (let head of this.heads) {
      remove_from_heads(head);
    }
  }

  remove_removable_super_dominance() : void {
    let remove_from_heads = (node : number) : void => {
      for (const child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        assert(this.edge2tail.has(edge), `${edge} is not included in this.edge2tail`);
        for (const tail of this.edge2tail.get(edge)!) {
          const tail_info = [...this.node2tail.get(node)!].find(t => t.tail_id === tail);
          assert(tail_info !== undefined, `remove_removable_super_dominance: tail_info of tail whose ID is ${tail} is undefined`);
          if (!tail_info!.super_dominance && this.super_dominance.has(edge)) {
            this.super_dominance.delete(edge);
          }
        }
        remove_from_heads(child);
      }
    }
    for (let head of this.heads) {
      remove_from_heads(head);
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
    for (let head of this.heads) {
      broadcast_the_tightest_type_range_downwards(head);
    }
  }

  allocate_solutions_for_heads_with_uplimit() : void {
    for (let head of this.heads) this.solution_range.set(head, shuffle(this.solution_range.get(head)!));
    const head_array = shuffle(Array.from(this.heads));
    let cnt = 0;
    let dfs = (id : number, head_resolution : Map<number, Node>) : void => {
      if (cnt > config.maximum_type_resolution_for_heads) return;
      if (id === head_array.length) {
        this.head_solution_collection.push(new Map(head_resolution));
        cnt++;
        return;
      }
      else {
        for (let solution of this.solution_range.get(head_array[id])!) {
          head_resolution.set(head_array[id], solution);
          dfs(id + 1, head_resolution);
          head_resolution.delete(head_array[id]);
        }
      }
    }
    dfs(0, new Map<number, Node>());
  }

  allocate_solutions_for_heads_in_stream() : Generator<Map<number, Node>[]> {
    if (config.debug) {
      let mul = 1n;
      for (let head of this.heads) {
        mul *= BigInt(this.solution_range.get(head)!.length)
      }
      console.log(color.cyan(`The size of of solution candidate of heads of ${this.name} is ${mul}`));
    }
    for (let head of this.heads) this.solution_range.set(head, shuffle(this.solution_range.get(head)!));
    const head_array = shuffle(Array.from(this.heads));
    let cnt = 0;
    let local_head_resolution_collection : Map<number, Node>[] = [];
    const uplimit = head_array.reduce((acc, cur) => acc * this.solution_range.get(cur)!.length, 1);
    const solution_range_copy = this.solution_range;

    let check_head_solution = (head_solution : Map<number, Node>) : boolean => {
      const head_solution_array = Array.from(head_solution);
      const head_solution_length = head_solution_array.length;
      for (let i = 0; i < head_solution_length; i++) {
        for (let j = i + 1; j < head_solution_length; j++) {
          const i2j = `${head_solution_array[i][0]} ${head_solution_array[j][0]}`;
          const j2i = `${head_solution_array[j][0]} ${head_solution_array[i][0]}`;
          const inode = head_solution_array[i][1];
          const jnode = head_solution_array[j][1];
          if (this.headssub.has(i2j) && !inode.issuperof(jnode)) {
            return false;
          }
          if (this.headssub.has(j2i) && !jnode.issuperof(inode)) {
            return false;
          }
          if (this.headsequal.has(i2j) && !inode.same(jnode)) {
            return false;
          }
          if (this.headsequal.has(j2i) && !jnode.same(inode)) {
            return false;
          }
        }
      }
      return true;
    }

    function* dfs(id : number, head_resolution : Map<number, Node>) : Generator<Map<number, Node>[]> {
      if (id === head_array.length) {
        if (check_head_solution(head_resolution)) {
          local_head_resolution_collection.push(new Map(head_resolution));
          cnt++;
        }
        if (config.stream || cnt % config.chunk_size === 0) {
          yield local_head_resolution_collection;
          local_head_resolution_collection = [];
        }
        else if (cnt === uplimit) {
          yield local_head_resolution_collection;
          local_head_resolution_collection = [];
        }
        return;
      }
      else {
        for (let solution of solution_range_copy.get(head_array[id])!) {
          head_resolution.set(head_array[id], solution);
          if (!check_head_solution(head_resolution)) {
            head_resolution.delete(head_array[id]);
            continue;
          }
          yield* dfs(id + 1, head_resolution);
          head_resolution.delete(head_array[id]);
        }
      }
    }
    return dfs(0, new Map<number, Node>());
  }

  allocate_solutions_for_heads() : void {
    this.head_solution_collection.push(new Map<number, Node>());
    for (let head of this.heads) {
      const head_resolution_length = this.head_solution_collection.length;
      this.head_solution_collection = extend_arrayofmap(this.head_solution_collection, this.solution_range.get(head)!.length);
      let cnt = 1;
      for (let solution of this.solution_range.get(head)!) {
        for (let i = (cnt - 1) * head_resolution_length; i < cnt * head_resolution_length; i++) {
          this.head_solution_collection[i].set(head, solution);
        }
        cnt++;
      }
    }
    if (config.debug) console.log(color.cyan(`head_solution_collection.size is ${this.head_solution_collection.length}`));
    if (this.head_solution_collection.length > config.maximum_type_resolution_for_heads) {
      this.head_solution_collection = select_random_elements(this.head_solution_collection, config.maximum_type_resolution_for_heads);
    }
    else {
      this.head_solution_collection = shuffle(this.head_solution_collection);
    }
  }

  allocate_solutions_for_tails_based_on_solutions_to_heads(head_resolve : Map<number, Node>) : Map<number, Node[]> {
    const tail_solution = new Map<number, Node[]>();
    let solution4tail : Node[] = [];
    for (let [head, solution_to_head] of head_resolve) {
      // There may exist heads that are not connected any other nodes.
      // They are not in node2tail.
      if (!this.node2tail.has(head)) continue;
      for (const { tail_id, sub_dominance, super_dominance } of this.node2tail.get(head)!) {
        if (sub_dominance) {
          solution4tail = solution_to_head.subs() as Node[];
        }
        else if (super_dominance) {
          solution4tail = solution_to_head.supers() as Node[];
        }
        else {
          solution4tail = [solution_to_head];
        }
        if (tail_solution.has(tail_id)) {
          tail_solution.set(tail_id, tail_solution.get(tail_id)!.filter(t => solution4tail.some(tt => tt.same(t))));
        }
        else {
          tail_solution.set(tail_id, solution4tail);
        }
      }
    }
    return tail_solution;
  }

  build_heads_relation() : void {
    interface fromHead {
      head_id : number;
      sub_dominance : boolean; // the solution of head_id is a sub_dominance of the solution of the node
      super_dominance : boolean; // the solution of head_id is a super_dominance of the solution of the node
    }
    const tail2headinfo = new Map<number, Set<fromHead>>();
    //! Fill in tail2headinfo
    for (let [nodeid, tail_infos] of this.node2tail) {
      if (!this.heads.has(nodeid)) continue;
      for (const tail_info of tail_infos) {
        if (tail2headinfo.has(tail_info.tail_id)) {
          tail2headinfo.get(tail_info.tail_id)!.add({ head_id: nodeid, sub_dominance: tail_info.sub_dominance, super_dominance: tail_info.super_dominance });
        }
        else {
          tail2headinfo.set(tail_info.tail_id, new Set([{ head_id: nodeid, sub_dominance: tail_info.sub_dominance, super_dominance: tail_info.super_dominance }]));
        }
      }
    }
    //! build relation among heads
    for (const [_, headinfos] of tail2headinfo) {
      const head_infos_array = [...headinfos];
      const head_infos_length = head_infos_array.length;
      for (let i = 0; i < head_infos_length; i++) {
        for (let j = i + 1; j < head_infos_length; j++) {
          const head_info = head_infos_array[i];
          const head_info2 = head_infos_array[j];
          if (head_info.sub_dominance && (!head_info2.sub_dominance && !head_info2.super_dominance)) {
            this.headssub.add(`${head_info.head_id} ${head_info2.head_id}`);
          }
          else if (head_info.super_dominance && (!head_info2.sub_dominance && !head_info2.super_dominance)) {
            this.headssub.add(`${head_info2.head_id} ${head_info.head_id}`);
          }
          else if ((!head_info.sub_dominance && !head_info.super_dominance) && head_info2.sub_dominance) {
            this.headssub.add(`${head_info2.head_id} ${head_info.head_id}`);
          }
          else if ((!head_info.sub_dominance && !head_info.super_dominance) && head_info2.super_dominance) {
            this.headssub.add(`${head_info.head_id} ${head_info2.head_id}`);
          }
          else if ((!head_info.sub_dominance && !head_info.super_dominance) && (!head_info2.sub_dominance && !head_info2.super_dominance)) {
            this.headsequal.add(`${head_info.head_id} ${head_info2.head_id}`);
            this.headsequal.add(`${head_info2.head_id} ${head_info.head_id}`);
          }
          else if (head_info.sub_dominance && head_info2.super_dominance) {
            this.headssub.add(`${head_info.head_id} ${head_info2.head_id}`);
          }
          else if (head_info.super_dominance && head_info2.sub_dominance) {
            this.headssub.add(`${head_info2.head_id} ${head_info.head_id}`);
          }
        }
      }
      for (const key of this.headssub) {
        const [head1, head2] = key.split(" ");
        if (this.headssub.has(`${head2} ${head1}`)) {
          this.headssub.delete(`${head2} ${head1}`);
          this.headssub.delete(`${head1} ${head2}`);
          this.headsequal.add(`${head1} ${head2}`);
          this.headsequal.add(`${head2} ${head1}`);
        }
        else if (this.headsequal.has(`${head2} ${head1}`) ||
          this.headsequal.has(`${head1} ${head2}`)) {
          this.headssub.delete(key);
        }
      }
    }
  }

  build_tails_relation() : void {
    for (let [_, tail_infos] of this.node2tail) {
      const tail_infos_array = [...tail_infos];
      const tail_infos_length = tail_infos_array.length;
      for (let i = 0; i < tail_infos_length; i++) {
        for (let j = i + 1; j < tail_infos_length; j++) {
          const tail_info1 = tail_infos_array[i];
          const tail_info2 = tail_infos_array[j];
          if (tail_info1.sub_dominance && (!tail_info2.sub_dominance && !tail_info2.super_dominance)) {
            this.tailssub.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if (tail_info1.super_dominance && (!tail_info2.sub_dominance && !tail_info2.super_dominance)) {
            this.tailssub.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
          }
          else if ((!tail_info1.sub_dominance && !tail_info1.super_dominance) && tail_info2.sub_dominance) {
            this.tailssub.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
          }
          else if ((!tail_info1.sub_dominance && !tail_info1.super_dominance) && tail_info2.super_dominance) {
            this.tailssub.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if ((!tail_info1.sub_dominance && !tail_info1.super_dominance) && (!tail_info2.sub_dominance && !tail_info2.super_dominance)) {
            this.tailsequal.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
            this.tailsequal.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if (tail_info1.sub_dominance && tail_info2.super_dominance) {
            this.tailssub.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if (tail_info1.super_dominance && tail_info2.sub_dominance) {
            this.tailssub.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
          }
        }
      }
    }
    for (const key of this.tailssub) {
      const [tail1, tail2] = key.split(" ");
      if (this.tailssub.has(`${tail2} ${tail1}`)) {
        this.tailssub.delete(`${tail2} ${tail1}`);
        this.tailssub.delete(`${tail1} ${tail2}`);
        this.tailsequal.add(`${tail1} ${tail2}`);
        this.tailsequal.add(`${tail2} ${tail1}`);
      }
      else if (this.tailsequal.has(`${tail2} ${tail1}`) ||
        this.tailsequal.has(`${tail1} ${tail2}`)) {
        this.tailssub.delete(key);
      }
    }
  }

  resolve_tails(tail_solution : Map<number, Node[]>) : boolean {
    if (tail_solution.size === 0) {
      assert(this.tails.size === 0, "DominanceDAG::resolve_tails: tails is not empty when tail_solution is empty");
      return true;
    }
    const tails_array = [...this.tails];
    let i4tails_array = 0;
    let i4solutions_of_each_tail = new Array<number>(tails_array.length).fill(0);
    let tailID_to_solution_candidates = new Map<number, Node[]>();
    let cannot_resolve = false;
    while (true) {
      if (i4tails_array === 0) {
        const types_candidate = tail_solution.get(tails_array[i4tails_array])!;
        tailID_to_solution_candidates.set(tails_array[i4tails_array], types_candidate);
        i4tails_array++;
      }
      else {
        // Use previous tail solution to restrict the current tail solution.
        let types_candidate = tail_solution.get(tails_array[i4tails_array])!;
        for (let j = 0; j < i4tails_array; j++) {
          assert(tailID_to_solution_candidates.has(tails_array[j]), `resolve_tails: tailID_to_solution_candidates does not have ${tails_array[j]}`);
          if (this.tailssub.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
            types_candidate = types_candidate.filter(t => t.issubof(tailID_to_solution_candidates.get(tails_array[j])![i4solutions_of_each_tail[i4tails_array]]));
          }
          else if (this.tailssub.has(`${tails_array[i4tails_array]} ${tails_array[j]}`)) {
            types_candidate = types_candidate.filter(t => t.issuperof(tailID_to_solution_candidates.get(tails_array[j])![i4solutions_of_each_tail[i4tails_array]]));
          }
          else if (this.tailsequal.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
            types_candidate = types_candidate.filter(t => t.same(tailID_to_solution_candidates.get(tails_array[j])![i4solutions_of_each_tail[i4tails_array]]));
          }
          if (types_candidate.length === 0) {
            let jcopy = j;
            for (let ji = j + 1; ji < i4tails_array; ji++) {
              i4solutions_of_each_tail[ji] = 0;
              tailID_to_solution_candidates.delete(tails_array[ji]);
            }
            while (true) {
              i4solutions_of_each_tail[jcopy]++;
              if (i4solutions_of_each_tail[jcopy] === tailID_to_solution_candidates.get(tails_array[jcopy])!.length) {
                tailID_to_solution_candidates.delete(tails_array[jcopy]);
                i4solutions_of_each_tail[jcopy] = 0;
                i4tails_array = jcopy;
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
        if (types_candidate.length !== 0) {
          tailID_to_solution_candidates.set(tails_array[i4tails_array], types_candidate);
          i4tails_array++;
        }
      }
      if (cannot_resolve) break;
      if (i4tails_array === tails_array.length) break;
    }
    if (cannot_resolve === false) {
      for (let i = 0; i < tails_array.length; i++) {
        this.solutions.set(tails_array[i], tailID_to_solution_candidates.get(tails_array[i])![i4solutions_of_each_tail[i]]);
      }
      return true;
    }
    else return false;
  }

  resolve_nonheads_and_nontails(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      const edge = `${node} ${child}`;
      let solution_candidates : DominanceNode<T>[] = [];
      let first = true;
      /*
      For each edge from node n1 to node n2, consider all the tails that can be reached from n1 through the edge.
      Since the solution of the reachable tails have been settled, we can first restrict the solution range of n2
      based on the solution of the reachable tails and then randomly pick a solution from the restricted solution range.
      */
      for (const tail_id of this.edge2tail.get(edge)!) {
        if (this.node2tail.has(child)) { // child is not tail
          const tail_info = [...this.node2tail.get(child)!].find(t => t.tail_id === tail_id);
          if (this.sub_dominance.has(edge)) {
            if (tail_info!.sub_dominance) {
              const solution_candidates_for_this_tail = this.solutions.get(node)!.sub_with_lowerbound(this.solutions.get(tail_id)!)!;
              if (first) {
                solution_candidates = solution_candidates_for_this_tail;
                first = false;
              }
              else {
                solution_candidates = solution_candidates.filter(
                  t => solution_candidates_for_this_tail.some(tt => t.same(tt))
                );
                assert(solution_candidates.length > 0,
                  `resolve_nonheads_and_nontails case 1: solution_candidates is empty when edge is ${edge}`);
              }
            }
            else if (tail_info!.super_dominance) {
              throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the sub_dominance of ${child}`);
            }
            else {
              const solution_for_tail = this.solutions.get(tail_id)!;
              if (first) {
                solution_candidates = [solution_for_tail];
                first = false;
              }
              else {
                solution_candidates = solution_candidates.filter(
                  t => solution_for_tail.same(t)
                );
              }
            }
          }
          else if (this.super_dominance.has(edge)) {
            // child is a tail
            throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the super_dominance of ${child}`);
          }
          else {
            if (first) {
              solution_candidates = [this.solutions.get(node)!];
              first = false;
            }
            else {
              solution_candidates = solution_candidates.filter(
                t => [this.solutions.get(node)!].some(tt => t.same(tt))
              );
              assert(solution_candidates.length > 0,
                `resolve_nonheads_and_nontails case 2: solution_candidates is empty when edge is ${edge}`);
            }
          }
        }
      }
      if (!this.tails.has(child)) {
        assert(solution_candidates.length > 0,
          `resolve_nonheads_and_nontails case 3: solution_candidates is empty when edge is ${edge}`);
        this.solutions.set(child, pick_random_element(solution_candidates)! as Node);
        this.resolve_nonheads_and_nontails(child);
      }
    }
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

  resolve_by_stream() : void {
    // !initialize the resolution
    this.initialize_resolve();
    // !Get heads and tails
    this.get_heads_and_tails();
    // !Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // tail_ids are not in this.node2tail
    this.dfs4node2tail();
    // !Map edges to their reachable this.tails
    this.dfs4edge2tail();
    // !Remove some removable sub/super dominations using node2tail and edge2tail
    this.remove_removable_sub_dominance();
    this.remove_removable_super_dominance();
    // !Re-dfs4node2tail
    /*
      Take `type-constraint1.svg` in the folder constraintDAGs for instance.
      In dfs4node2tail, we first broadcast the tail information upwards. This step lets node 29 be aware of
      the existence of an dominance path to tail 18 when the node has more than one path connected to
      the tail.
      Then we broadcast downwards. This step lets node 36 know that it should not sub-dominate node 40.
      Otherwise, node 29, which is the ancestor of node 36, cannot dominate node 40.
      However, after removing removable sub_dominance, node 45 still stubbornly believe it sub-dominates node 33
      though the sub-dominance from 29 to 42 has been removed.
    */
    this.node2tail.clear();
    this.dfs4node2tail();
    // Logging
    if (config.debug) {
      console.log(color.green("===node2tail==="));
      for (const [node, tails] of this.node2tail) {
        console.log(color.green(`${node} -> ${[...tails].map(t => [t.tail_id, t.sub_dominance, t.super_dominance])}`))
      }
      console.log(color.green("===edge2tail==="));
      for (const [edge, tails] of this.edge2tail) {
        console.log(color.green(`${edge} -> ${[...tails]}`))
      }
      console.log(color.magenta("==sub_dominance after remove_removable_sub_dominance=="));
      for (const edge of this.sub_dominance) {
        console.log(color.magenta(edge));
      }
      console.log(color.magenta("==super_dominance after remove_removable_super_dominance=="));
      for (const edge of this.super_dominance) {
        console.log(color.magenta(edge));
      }
    }
    // !Check before solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_before_tightening(head);
    }
    // !Tighten the solution range for each node
    this.tighten_solution_range();
    // !Check after solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_after_tightening(head);
    }
    if (config.debug) {
      console.log(color.green("===solution_range==="));
      const keys = [...this.solution_range.keys()].sort();
      for (const key of keys) {
        console.log(color.green(`${key} -> ${this.solution_range.get(key)!.map(t => t.str())}`));
      }
    }
    // !Build connection among heads and tails.
    this.build_heads_relation();
    this.build_tails_relation();
    if (config.debug) {
      console.log(color.green("===headssub==="));
      for (const edge of this.headssub) {
        console.log(color.green(edge));
      }
      console.log(color.red("===headsequal==="));
      for (const edge of this.headsequal) {
        console.log(color.red(edge));
      }
    }
    if (config.debug) {
      console.log(color.green("===tailssub==="));
      for (const edge of this.tailssub) {
        console.log(color.green(edge));
      }
      console.log(color.red("===tailsequal==="));
      for (const edge of this.tailsequal) {
        console.log(color.red(edge));
      }
    }
    // !Assign solutions to heads
    let cnt : number = 0;
    let should_stop = false;
    let stop_until_find_solution_mode = false;
    if (config.no_type_exploration) stop_until_find_solution_mode = true;
    for (let local_head_resolution_collection of this.allocate_solutions_for_heads_in_stream()) {
      this.solutions.clear();
      if (should_stop) break;
      // !Traverse each solution to heads
      for (const head_resolve of local_head_resolution_collection) {
        this.solutions.clear();
        if (should_stop) break;
        cnt++;
        console.log(`>> ${cnt} <<`);
        if (config.mode == 'scope' && this.name == "TypeDominanceDAG" ||
          (!stop_until_find_solution_mode && (cnt > config.maximum_type_resolution_for_heads))) {
          if (this.solutions_collection.length > 0) {
            should_stop = true;
            break;
          }
          else {
            stop_until_find_solution_mode = true;
          }
        }
        let good_resolve = true;
        // First, narrow down the solution range of this.tails
        // !Allocate solution candidates for tails based on the current solution to heads
        const tail_solution = this.allocate_solutions_for_tails_based_on_solutions_to_heads(head_resolve);
        // Then check if there exists one tail whose solution candidates are empty.
        // If all this.tails have non-empty solution candidates, then resolve the types of this.tails.
        for (const tail of this.tails) {
          assert(tail_solution.has(tail), `tail_solution does not have ${tail}`);
          if (tail_solution.get(tail)!.length === 0) {
            good_resolve = false;
            break;
          }
          else {
            // The choice of the solution of the tail is restricted by the indirect connection among this.tails.
            // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the solution to
            // T1 and T2 have a dominance relation.
            tail_solution.set(tail, shuffle(tail_solution.get(tail)!))
          }
        }
        if (!good_resolve) {
          continue;
        }
        // !Resolve tails.
        const plausible_type_resolution_for_tails = this.resolve_tails(tail_solution);
        if (plausible_type_resolution_for_tails === false) continue;
        // !Check if the solutions to tails are compatible with the solutions to heads.
        for (let [head, solution_to_head] of head_resolve) {
          if (this.node2tail.has(head) === false) {
            // This head is isolated from other nodes.
            this.solutions.set(head, solution_to_head);
            continue;
          }
          if (config.debug) {
            for (let tail_info of this.node2tail.get(head)!) {
              assert(this.solutions.has(tail_info.tail_id),
                `resolve: tail ${tail_info.tail_id} is not resolved`);
              if (tail_info.sub_dominance) {
                if (!solution_to_head.issuperof(this.solutions.get(tail_info.tail_id)!)) {
                  assert(false,
                    `resolve: the solution to head ${head}: ${solution_to_head.str()}
                  is not the super of the solution to tail ${tail_info.tail_id}:
                  ${this.solutions.get(tail_info.tail_id)!.str()}`);
                }
              }
              else if (tail_info.super_dominance) {
                if (!this.solutions.get(tail_info.tail_id)!.issuperof(solution_to_head)) {
                  assert(false,
                    `resolve: the solution to head ${head}: ${solution_to_head.str()}
                  is not the sub of the solution to tail ${tail_info.tail_id}:
                  ${this.solutions.get(tail_info.tail_id)!.str()}`);
                }
              }
              else {
                if (!this.solutions.get(tail_info.tail_id)!.same(solution_to_head)) {
                  assert(false,
                    `resolve: the solution to head ${head}: ${solution_to_head.str()}
                  is not the same as the solution to tail ${tail_info.tail_id}:
                  ${this.solutions.get(tail_info.tail_id)!.str()}`);
                }
              }
            }
          }
          // !Resolve the types of nonheads and nontails.
          this.solutions.set(head, solution_to_head);
          this.resolve_nonheads_and_nontails(head);
        }
        if (good_resolve) {
          this.solutions_collection.push(new Map(this.solutions));
          if (stop_until_find_solution_mode) {
            should_stop = true;
          }
        }
      }
    }
    if (stop_until_find_solution_mode) {
      console.log(`Start "stop_until_find_solution_mode", find one solution after ${cnt} executions`);
    }
  }

  resolve() : void {
    // !initialize the resolution
    this.initialize_resolve();
    // !Get heads and tails
    this.get_heads_and_tails();
    // !Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // tail_ids are not in this.node2tail
    this.dfs4node2tail();
    // !Map edges to their reachable this.tails
    this.dfs4edge2tail();
    // !Remove some removable sub/super dominations using node2tail and edge2tail
    this.remove_removable_sub_dominance();
    this.remove_removable_super_dominance();
    // !Re-dfs4node2tail
    /*
      Take `type-constraint1.svg` in the folder constraintDAGs for instance.
      In dfs4node2tail, we first broadcast the tail information upwards. This step lets node 29 be aware of
      the existence of an dominance path to tail 18 when the node has more than one path connected to
      the tail.
      Then we broadcast downwards. This step lets node 36 know that it should not sub-dominate node 40.
      Otherwise, node 29, which is the ancestor of node 36, cannot dominate node 40.
      However, after removing removable sub_dominance, node 45 still stubbornly believe it sub-dominates node 33
      though the sub-dominance from 29 to 42 has been removed.
    */
    this.node2tail.clear();
    this.dfs4node2tail();
    // Logging
    if (config.debug) {
      console.log(color.green("===node2tail==="));
      for (const [node, tails] of this.node2tail) {
        console.log(color.green(`${node} -> ${[...tails].map(t => [t.tail_id, t.sub_dominance, t.super_dominance])}`))
      }
      console.log(color.green("===edge2tail==="));
      for (const [edge, tails] of this.edge2tail) {
        console.log(color.green(`${edge} -> ${[...tails]}`))
      }
      console.log(color.magenta("==sub_dominance after remove_removable_sub_dominance=="));
      for (const edge of this.sub_dominance) {
        console.log(color.magenta(edge));
      }
    }
    // !Check before solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_before_tightening(head);
    }
    // !Tighten the solution range for each node
    this.tighten_solution_range();
    // !Check after solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_after_tightening(head);
    }
    // !Build connection among tails.
    this.build_tails_relation();
    if (config.debug) {
      console.log(color.green("===tailssub==="));
      for (const edge of this.tailssub) {
        console.log(color.green(edge));
      }
      console.log(color.red("===tailsequal==="));
      for (const edge of this.tailsequal) {
        console.log(color.red(edge));
      }
    }
    //! Estimate the size of the solution space and select a suitable head solution allocation strategy.
    let size_estimation1 = 1;
    for (let head of this.heads) {
      size_estimation1 *= this.solution_range.get(head)!.length;
    }
    size_estimation1 *= this.heads.size * size_of_type;
    let size_estimation2 = config.maximum_type_resolution_for_heads * this.heads.size * size_of_type;
    if (config.debug) {
      console.log(color.cyan(`size_estimation1 is ${size_estimation1}, size_estimation2 is ${size_estimation2}`));
    }
    if (size_estimation1 < size_estimation2) {
      this.allocate_solutions_for_heads();
    }
    else {
      this.allocate_solutions_for_heads_with_uplimit();
    }
    // !Traverse each resolution for heads
    for (const head_resolve of this.head_solution_collection) {
      this.solutions.clear();
      let good_resolve = true;
      // First, narrow down the solution range of this.tails
      // !Allocate solution candidates for tails based on the current solution to heads
      const tail_solution = this.allocate_solutions_for_tails_based_on_solutions_to_heads(head_resolve);
      // Then check if there exists one tail whose solution candidates are empty.
      // If all this.tails have non-empty solution candidates, then resolve the types of this.tails.
      for (const tail of this.tails) {
        if (config.debug)
          assert(tail_solution.has(tail), `tail2type does not have ${tail}`);
        if (tail_solution.get(tail)!.length === 0) {
          good_resolve = false;
          break;
        }
        else {
          // The choice of the solution of the tail is restricted by the indirect connection among this.tails.
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the solution to
          // T1 and T2 have a dominance relation.
          tail_solution.set(tail, shuffle(tail_solution.get(tail)!))
        }
      }
      if (!good_resolve) continue;
      // !Resolve tails.
      const plausible_type_resolution_for_tails = this.resolve_tails(tail_solution);
      if (plausible_type_resolution_for_tails === false) continue;
      // !Check if the solutions to tails are compatible with the solutions to heads.
      for (let [head, solution_to_head] of head_resolve) {
        if (this.node2tail.has(head) === false) {
          // This head is isolated from other nodes.
          this.solutions.set(head, solution_to_head);
          continue;
        }
        if (config.debug) {
          for (let tail_info of this.node2tail.get(head)!) {
            assert(this.solutions.has(tail_info.tail_id),
              `resolve: tail ${tail_info.tail_id} is not resolved`);
            if (tail_info.sub_dominance) {
              if (!solution_to_head.issuperof(this.solutions.get(tail_info.tail_id)!)) {
                assert(false,
                  `resolve: the solution to head ${head}: ${solution_to_head.str()}
                is not the super of the solution to tail ${tail_info.tail_id}:
                ${this.solutions.get(tail_info.tail_id)!.str()}`);
              }
            }
            else if (tail_info.super_dominance) {
              if (!this.solutions.get(tail_info.tail_id)!.issuperof(solution_to_head)) {
                assert(false,
                  `resolve: the solution to head ${head}: ${solution_to_head.str()}
                is not the sub of the solution to tail ${tail_info.tail_id}:
                ${this.solutions.get(tail_info.tail_id)!.str()}`);
              }
            }
            else {
              if (!this.solutions.get(tail_info.tail_id)!.same(solution_to_head)) {
                assert(false,
                  `resolve: the solution to head ${head}: ${solution_to_head.str()}
                is not the same as the solution to tail ${tail_info.tail_id}:
                ${this.solutions.get(tail_info.tail_id)!.str()}`);
              }
            }
          }
        }
        // !Resolve the types of nonheads and nontails.
        this.solutions.set(head, solution_to_head);
        this.resolve_nonheads_and_nontails(head);
      }
      if (good_resolve) {
        this.solutions_collection.push(new Map(this.solutions));
      }
    }
  }

  resolve_by_brute_force(check : boolean) : void {
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
        solution.set(ids[id], solu);
        traverse_solution(id + 1, solution);
      }
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
      for (let [id, _] of this.dag_nodes) {
        assert(solutions.has(id), `Dominance::Verify: node ${id} has not been resolved`);
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

  async draw(path : string) : Promise<void> {
    this.get_heads_and_tails();
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
          this.heads.has(node) ? 'red' : this.tails.has(node) ? 'green' : 'blue'
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
      for (let child of this.dag_nodes.get(node)!.outs) {
        dfs(gnode, child, this.sub_dominance.has(`${node} ${child}`), this.super_dominance.has(`${node} ${child}`));
      }
    }
    for (let head of this.heads) {
      dfs(undefined, head, false, false);
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