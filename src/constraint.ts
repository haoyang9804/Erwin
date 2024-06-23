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
import { assert, createCustomSet, extendArrayofMap, pickRandomElement, shuffle, selectRandomElements } from "./utility";
import { Type, size_of_type, TypeKind } from "./type"
import * as dot from 'ts-graphviz';
import { config } from './config'
// debug
import { toFile } from "@ts-graphviz/adapter";
import { color } from "console-log-colors"
import { DominanceNode, isEqualSet, isSuperSet } from "./dominance";
import { FunctionStateMutability } from "solc-typed-ast";
import { FuncStat } from "./funcstat";

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

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
  // If "tail1 tail2" is in tailssub, then the solution of tail2 is a sub_dominance of the solution of tail1.
  tailssub : Set<string> = new Set<string>();
  // If "tail1 tail2" is in tailssub, then the solution of tail2 equals to the solution of tail1.
  tailsequal : Set<string> = new Set<string>();

  constructor() { }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node : ConstaintNode) : void {
    this.dag_nodes.set(node.id, node);
  }

  /*
  1. If node1 weakly dominates node2 in solution, then the solution of node2 is a sub_dominance of the solution of node1.
  2. If node1 weakly and reversely dominates node2 in solution, then the solution of node2 is a super_dominance of the solution of node1.
  */
  connect(from : number, to : number, rank ?: string) : void {
    if (config.debug) {
      assert(this.dag_nodes.get(from)! !== undefined, `DominanceDAG::connect: node (from) ${from} is not in the DAG`)
      assert(this.dag_nodes.get(to)! !== undefined, `DominanceDAG::connect: node (to) ${to} is not in the DAG`)
    }
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    if (config.debug)
      assert(rank === undefined || rank === "sub_dominance" || rank === "super_dominance", `DominanceDAG: rank ${rank} is not supported`)
    if (rank === "sub_dominance") {
      this.sub_dominance.add(`${from} ${to}`);
    }
    // haoyang
    if (rank === "super_dominance") {
      this.super_dominance.add(`${from} ${to}`);
    }
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

  dfs4node2tail(id : number, tail_id : number, sub_dominance : boolean, super_dominance : boolean) : void {
    for (let parent of this.dag_nodes.get(id)!.ins) {
      const key = `${parent} ${id}`;
      let thissub_dominance = this.sub_dominance.has(key) || sub_dominance;
      let thissuper_dominance = this.super_dominance.has(key) || super_dominance;
      if (this.node2tail.has(parent)) {
        // presub_dominance = false if there exists a path from the parent to tail with tail_id on which no sub_dominance domination holds.
        let presub_dominance = true;
        const pre_tail_info : toTail[] = [];
        let meet_this_tail_before = false;
        for (const tail_info of this.node2tail.get(parent)!) {
          if (tail_info.tail_id === tail_id) {
            meet_this_tail_before = true;
            presub_dominance &&= tail_info.sub_dominance;
            pre_tail_info.push(tail_info);
          }
        }
        if (meet_this_tail_before) {
          if (presub_dominance === true && thissub_dominance == false) {
            for (const tail_info of pre_tail_info)
              this.node2tail.get(parent)!.delete(tail_info);
            this.node2tail.get(parent)!.add({ tail_id: tail_id, sub_dominance: false, super_dominance: thissuper_dominance });
          }
          thissub_dominance &&= presub_dominance;
        }
        else {
          this.node2tail.get(parent)!.add({ tail_id: tail_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
        }
      }
      else {
        const s = createCustomSet<toTail>(equal_toTail);
        s.add({ tail_id: tail_id, sub_dominance: thissub_dominance, super_dominance: thissuper_dominance });
        this.node2tail.set(parent, s);
      }
      this.dfs4node2tail(parent, tail_id, thissub_dominance, thissuper_dominance);
    }
  }

  dfs4edge2tail(id : number, tail_id : number) : void {
    for (let parent of this.dag_nodes.get(id)!.ins) {
      const edge = `${parent} ${id}`;
      if (this.edge2tail.has(edge)) {
        this.edge2tail.get(edge)!.add(tail_id);
      }
      else {
        this.edge2tail.set(edge, new Set([tail_id]));
      }
      this.dfs4edge2tail(parent, tail_id);
    }
  }

  remove_removable_sub_dominance(node : number) : void {
    for (const child of this.dag_nodes.get(node)!.outs) {
      const edge = `${node} ${child}`;
      if (config.debug)
        assert(this.edge2tail.has(edge), `${edge} is not included in this.edge2tail`);
      for (const tail of this.edge2tail.get(edge)!) {
        const tail_info = [...this.node2tail.get(node)!].find(t => t.tail_id === tail);
        if (config.debug)
          assert(tail_info !== undefined, `remove_removable_sub_dominance: tail_info of tail whose ID is ${tail} is undefined`);
        if (!tail_info!.sub_dominance && this.sub_dominance.has(edge)) {
          this.sub_dominance.delete(edge);
        }
      }
      this.remove_removable_sub_dominance(child);
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
          let parent_candidates_issuper_dominanceset_of_child_candidates = isSuperSet(parent_solution_candidates, child_solution_candidates);
          let child_candidates_issuper_dominanceset_of_parent_candidates = isSuperSet(child_solution_candidates, parent_solution_candidates);
          if (config.debug)
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

  tighten_solution_range_from_a_tail(tail : number) {
    let upwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length === 0)
          downwards(node);
        return;
      }
      for (let parent of this.dag_nodes.get(node)!.ins) {
        if (isEqualSet(this.solution_range.get(parent)!, this.solution_range.get(node)!)) {
          continue;
        }
        if (config.debug)
          assert(isSuperSet(this.solution_range.get(parent)!, this.solution_range.get(node)!),
            `tighten_solution_range_from_a_tail::upwards: the solution range of ${parent}:
        ${this.solution_range.get(parent)!.map(t => t.str())} is not a superset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(parent, this.solution_range.get(node)!);
        upwards(parent);
        downwards(parent);
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length === 0)
          upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        if (isEqualSet(this.solution_range.get(child)!, this.solution_range.get(node)!)) {
          continue;
        }
        assert(isSuperSet(this.solution_range.get(child)!, this.solution_range.get(node)!), `tighten_solution_range_from_a_tail::downwards: the solution range of ${child}: ${this.solution_range.get(child)!.map(t => t.str())} is not a superset of the solution range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(child, this.solution_range.get(node)!);
        downwards(child);
      }
    }
    upwards(tail);
  }

  tighten_solution_range_from_a_head(head : number) {
    let upwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        if (this.dag_nodes.get(node)!.outs.length === 0)
          downwards(node);
        return;
      }
      for (let parent of this.dag_nodes.get(node)!.ins) {
        if (isEqualSet(this.solution_range.get(parent)!, this.solution_range.get(node)!)) {
          continue;
        }
        if (config.debug)
          assert(isSuperSet(this.solution_range.get(parent)!, this.solution_range.get(node)!),
            `tighten_solution_range_from_a_head::upwards: the solution range of ${parent}:
        ${this.solution_range.get(parent)!.map(t => t.str())} is not a superset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(parent, this.solution_range.get(node)!);
        upwards(parent);
        downwards(parent);
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        if (this.dag_nodes.get(node)!.ins.length === 0)
          upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        if (isEqualSet(this.solution_range.get(child)!, this.solution_range.get(node)!)) {
          continue;
        }
        if (config.debug)
          assert(isSuperSet(this.solution_range.get(child)!, this.solution_range.get(node)!),
            `tighten_solution_range_from_a_head::downwards: the solution range of ${child}:
        ${this.solution_range.get(child)!.map(t => t.str())} is not a superset of the solution
        range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
        this.solution_range.set(child, this.solution_range.get(node)!);
        downwards(child);
      }
    }
    downwards(head);
  }

  tighten_solution_range() {
    let broadcast_the_tightest_type_range_downwards = (node : number) : void => {
      for (let child of this.dag_nodes.get(node)!.outs) {
        let child_type_range = this.solution_range.get(child)!;
        let parent_type_range = this.solution_range.get(node)!;
        if (!isEqualSet(child_type_range, parent_type_range)) {
          if (config.debug)
            assert(isSuperSet(child_type_range, parent_type_range),
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

  allocate_solutions_for_heads_in_chunks() : Generator<Map<number, Node>[]> {
    if (config.debug) {
      let mul = 1n;
      for (let head of this.heads) {
        console.log(color.cyan(`head is ${head}, and this.solution_range.get(head)!.length is ${this.solution_range.get(head)!.length}`));
        mul *= BigInt(this.solution_range.get(head)!.length)
      }
      console.log(color.cyan(`The size of of type resolution candidate of heads is ${mul}`))
    }
    for (let head of this.heads) this.solution_range.set(head, shuffle(this.solution_range.get(head)!));
    const head_array = shuffle(Array.from(this.heads));
    let cnt = 0;
    let local_head_resolution_collection : Map<number, Node>[] = [];
    const uplimit = head_array.reduce((acc, cur) => acc * this.solution_range.get(cur)!.length, 1);
    const solution_range_copy = this.solution_range;
    function* dfs(id : number, head_resolution : Map<number, Node>) : Generator<Map<number, Node>[]> {
      if (cnt > config.maximum_type_resolution_for_heads) return;
      if (id === head_array.length) {
        local_head_resolution_collection.push(new Map(head_resolution));
        cnt++;
        if (cnt % config.chunk_size === 0) {
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
      if (config.debug) console.log(color.cyan(`head is ${head}, and this.solution_range.get(head)!.length is ${this.solution_range.get(head)!.length}`));
      if (config.debug)
        assert(this.solution_range.has(head), `allocate_solutions_for_heads: head ${head} is not in this.solution_range`);
      this.head_solution_collection = extendArrayofMap(this.head_solution_collection, this.solution_range.get(head)!.length);
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
      this.head_solution_collection = selectRandomElements(this.head_solution_collection, config.maximum_type_resolution_for_heads);
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
        }
      }
    }
  }

  resolve_tails(tail_solution : Map<number, Node[]>) : boolean {
    if (tail_solution.size === 0) {
      if (config.debug)
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
          if (config.debug)
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
      for (const tail_id of this.edge2tail.get(edge)!) {
        if (this.node2tail.has(child)) { // child is not tail
          const tail_info = [...this.node2tail.get(child)!].find(t => t.tail_id === tail_id);
          if (this.sub_dominance.has(edge)) {
            if (tail_info!.sub_dominance) {
              let solution_candidates = this.solutions.get(node)!.sub_with_lowerbound(this.solutions.get(tail_id)!)!;
              if (this.solutions.has(child)) {
                solution_candidates = solution_candidates.filter(t => t.same(this.solutions.get(child)!));
              }
              // Deal with the case where the type range of the child is smaller than the type range of the parent
              // mentioned by the 5th step.
              const type_candidate_copy = solution_candidates;
              solution_candidates = solution_candidates.filter(t => this.solution_range.get(child)!.some(tt => t.same(tt)));
              if (config.debug)
                assert(solution_candidates.length > 0,
                  `resolve_nonheads_and_nontails:>1 solution_candidates is empty when resolving ${child} on edge ${edge}.
                  solution_candidates before and after set intersection is ${type_candidate_copy.map(t => t.str())} and
                  ${this.solution_range.get(child)!.map(t => t.str())}`);
              this.solutions.set(child, pickRandomElement(solution_candidates)! as Node);
            }
            else if (tail_info!.super_dominance) {
              throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the super_dominance of ${child}`);
            }
            else {
              if (config.debug)
                assert(this.solutions.get(tail_id)!.issubof(this.solutions.get(node)!),
                  `resolve_nonheads_and_nontails: the type of ${node}: ${this.solutions.get(node)!.str()} is not the
                super_dominance of the type of ${tail_id}: ${this.solutions.get(tail_id)!.str()}`);
              this.solutions.set(child, this.solutions.get(tail_id)!);
            }
          }
          else if (this.super_dominance.has(edge)) {
            // child is a tail
            throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the super_dominance of ${child}`);
          }
          else {
            let solution_candidates = [this.solutions.get(node)!];
            if (this.solutions.has(child)) {
              solution_candidates = solution_candidates.filter(t => t.same(this.solutions.get(child)!));
            }
            if (config.debug)
              assert(solution_candidates.length > 0, `resolve_nonheads_and_nontails:>3 solution_candidates is empty`);
            this.solutions.set(child, pickRandomElement(solution_candidates)!);
          }
        }
      }
      this.resolve_nonheads_and_nontails(child);
    }
  }

  check_solution_range_after_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      if (config.debug)
        assert(isEqualSet(this.solution_range.get(node)!, this.solution_range.get(child)!),
          `check_solution_range_after_tightening: the solution range of ${node}:
          ${this.solution_range.get(node)!.map(t => t.str())} is not the same as the solution
          range of ${child}: ${this.solution_range.get(child)!.map(t => t.str())}`);
      this.check_solution_range_after_tightening(child);
    }
  }

  check_solution_range_before_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      if (config.debug)
        assert(isSuperSet(this.solution_range.get(child)!, this.solution_range.get(node)!),
          `check_solution_range_before_tightening: the solution range of ${child}:
          ${this.solution_range.get(child)!.map(t => t.str())} is not the superset of the solution
          range of ${node}: ${this.solution_range.get(node)!.map(t => t.str())}`);
      this.check_solution_range_before_tightening(child);
    }
  }

  resolve_by_chunk() : void {
    // !0. initialize the resolution
    this.initialize_resolve();
    // !1. Get heads and tails
    this.get_heads_and_tails();
    // !2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // tail_ids are not in this.node2tail
    for (let tail of this.tails) {
      this.dfs4node2tail(tail, tail, false, false);
    }
    if (config.debug) {
      console.log(color.green("===node2tail==="));
      for (const [node, tails] of this.node2tail) {
        console.log(color.green(`${node} -> ${[...tails].map(t => [t.tail_id, t.sub_dominance, t.super_dominance])}`))
      }
    }
    // !3. Map edges to their reachable this.tails
    for (let tail of this.tails) {
      this.dfs4edge2tail(tail, tail);
    }
    // !4. Remove some removable sub_dominance dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The sub_dominance domination from node 6 to node 7
    // is removable since the solution of node 6 must be the same as the solution of node 1, and edge (6, 7)
    // can reach tail 1.
    for (let head of this.heads) {
      this.remove_removable_sub_dominance(head);
    }
    if (config.debug) {
      console.log(color.magenta("==sub_dominance after remove_removable_sub_dominance=="));
      for (const edge of this.sub_dominance) {
        console.log(color.magenta(edge));
      }
    }
    // !4.5 Check before solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_before_tightening(head);
    }
    // !5. Tighten the solution range for each node
    this.tighten_solution_range();
    // !5.5 Check after solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_after_tightening(head);
    }
    // !6. Assign types to this.heads
    for (let local_head_resolution_collection of this.allocate_solutions_for_heads_in_chunks()) {
      // !7. Traverse each resolution for heads
      for (const head_resolve of local_head_resolution_collection) {
        this.solutions.clear();
        let good_resolve = true;
        // First, narrow down the solution range of this.tails
        // !8. Allocate solution candidates for tails based on the current solution to heads
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
        // !9. Build connection among tails.
        this.build_tails_relation();
        // !10. Resolve the types of tails.
        const plausible_type_resolution_for_tails = this.resolve_tails(tail_solution);
        if (plausible_type_resolution_for_tails === false) continue;
        // !11. Check if the resolved types of tails are compatible with the resolved types of heads.
        for (let [head, solution_to_head] of head_resolve) {
          if (this.node2tail.has(head) === false) {
            this.solutions.set(head, solution_to_head);
            continue;
          }
          let compatible_with_resolved_tails = true;
          for (let tail_info of this.node2tail.get(head)!) {
            if (this.solutions.has(tail_info.tail_id)) {
              if (tail_info.sub_dominance) {
                if (!solution_to_head.issuperof(this.solutions.get(tail_info.tail_id)!)) {
                  compatible_with_resolved_tails = false;
                  break;
                }
              }
              else if (tail_info.super_dominance) {
                if (!this.solutions.get(tail_info.tail_id)!.issuperof(solution_to_head)) {
                  compatible_with_resolved_tails = false;
                  break;
                }
              }
              else {
                if (!this.solutions.get(tail_info.tail_id)!.same(solution_to_head)) {
                  compatible_with_resolved_tails = false;
                  break;
                }
              }
            }
          }
          // !12. Resolve the types of nonheads and nontails.
          if (compatible_with_resolved_tails) {
            this.solutions.set(head, solution_to_head);
            this.resolve_nonheads_and_nontails(head);
          }
          else {
            good_resolve = false;
            break;
          }
        }
        if (good_resolve) {
          this.solutions_collection.push(new Map(this.solutions));
        }
      }
    }
  }

  resolve() : void {
    // !0. initialize the resolution
    this.initialize_resolve();
    // !1. Get heads and tails
    this.get_heads_and_tails();
    // !2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // tail_ids are not in this.node2tail
    for (let tail of this.tails) {
      this.dfs4node2tail(tail, tail, false, false);
    }
    // !3. Map edges to their reachable this.tails
    for (let tail of this.tails) {
      this.dfs4edge2tail(tail, tail);
    }
    // !4. Remove some removable sub_dominance dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The sub_dominance domination from node 6 to node 7
    // is removable since the solution of node 6 must be the same as the solution of node 1, and edge (6, 7)
    // can reach tail 1.
    for (let head of this.heads) {
      this.remove_removable_sub_dominance(head);
    }
    // !4.5 Check before solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_before_tightening(head);
    }
    // !5. Tighten the solution range for each node
    this.tighten_solution_range();
    // !5.5 Check after solution range tightening
    for (let head of this.heads) {
      this.check_solution_range_after_tightening(head);
    }
    // !6. Assign types to this.heads
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
    // !7. Traverse each solution for heads
    for (const head_resolve of this.head_solution_collection) {
      this.solutions.clear();
      let good_resolve = true;
      // First, narrow down the solution range of this.tails
      // !8. Allocate solution candidates for tails based on the current solution for heads
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
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the solution of
          // T1 and T2 have a solution relation.
          tail_solution.set(tail, shuffle(tail_solution.get(tail)!))
        }
      }
      if (!good_resolve) continue;
      // !9. Build connection among tails.
      this.build_tails_relation();
      // !10. Resolve the types of tails.
      const plausible_type_resolution_for_tails = this.resolve_tails(tail_solution);
      if (plausible_type_resolution_for_tails === false) continue;
      // !11. Check if the resolved types of tails are compatible with the resolved types of heads.
      for (let [head, solution_to_head] of head_resolve) {
        if (this.node2tail.has(head) === false) {
          this.solutions.set(head, solution_to_head);
          continue;
        }
        let compatible_with_resolved_tails = true;
        for (let tail_info of this.node2tail.get(head)!) {
          if (this.solutions.has(tail_info.tail_id)) {
            if (tail_info.sub_dominance) {
              if (!solution_to_head.issuperof(this.solutions.get(tail_info.tail_id)!)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else if (tail_info.super_dominance) {
              if (!this.solutions.get(tail_info.tail_id)!.issuperof(solution_to_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else {
              if (!this.solutions.get(tail_info.tail_id)!.same(solution_to_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
          }
        }
        // !12. Resolve the types of nonheads and nontails.
        if (compatible_with_resolved_tails) {
          this.solutions.set(head, solution_to_head);
          this.resolve_nonheads_and_nontails(head);
        }
        else {
          good_resolve = false;
          break;
        }
      }
      if (good_resolve) {
        this.solutions_collection.push(new Map(this.solutions));
      }
    }
  }

  depracated_resolve() : void {
    // !0. initialize the resolution
    this.initialize_resolve();
    // !1. Get heads and tails
    this.get_heads_and_tails();
    // !2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which sub_dominance/super_dominance domination does not holds.
    // If there are multiple paths from node to tail, then the sub_dominance does not hold as long as there exists a path on which sub_dominance domination does not hold.
    // tail_ids are not in this.node2tail
    for (let tail of this.tails) {
      this.dfs4node2tail(tail, tail, false, false);
    }
    // !3. Map edges to their reachable this.tails
    for (let tail of this.tails) {
      this.dfs4edge2tail(tail, tail);
    }
    // !4. Remove some removable sub_dominance dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The sub_dominance domination from node 6 to node 7
    // is removable since the solution to node 6 must be the same as the solution to node 1, and edge (6, 7)
    // can reach tail 1.
    for (let head of this.heads) {
      this.remove_removable_sub_dominance(head);
    }
    // !5. Restrict the solution range of heads.
    // Consider the following scenario.
    // If the true expression of a conditional expression Ec is a unaryop expression Eu whose op is "!", then the type of
    // Eu should be boolean. However, Eu type-dominate Ec and the type range of Eu is more than just boolean.
    // Therefore, we need to backpropogate the type range from children to parents until the type range of this.heads are restricted.
    // The backpropogation strategy is simple: if n1 type-dominate n2 by n1.type == n2.type, then the type range of n1 must be a
    // superset of the type range of n2. In this case, we restrict the type range of n1 to be the same as the type range of n2.
    // As for the scenario where n1 type-dominate n2 by n1.type is the super_dominance of n2.type, we resolve the sub_dominance domination
    // with the consideration of n2's type range in the resolve() function.
    for (let tail of this.tails) {
      this.restrict_solution_range(tail);
    }
    // !6. Assign types to this.heads
    this.allocate_solutions_for_heads();
    // !7. Traverse each solution for heads
    for (const head_resolve of this.head_solution_collection) {
      this.solutions.clear();
      let good_resolve = true;
      // First, narrow down the solution range of this.tails
      // !8. Allocate solution candidates for tails based on the current solution for heads
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
          // The choice of the solution to the tail is restricted by the indirect connection among this.tails.
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the solution of
          // T1 and T2 have a dominance relation.
          tail_solution.set(tail, shuffle(tail_solution.get(tail)!))
        }
      }
      if (!good_resolve) continue;
      // !9. Build connection among tails.
      this.build_tails_relation();
      // !10. Resolve the types of tails.
      const plausible_type_resolution_for_tails = this.resolve_tails(tail_solution);
      if (plausible_type_resolution_for_tails === false) continue;
      // !11. Check if the resolved types of tails are compatible with the resolved types of heads.
      for (let [head, solution_to_head] of head_resolve) {
        if (this.node2tail.has(head) === false) {
          this.solutions.set(head, solution_to_head);
          continue;
        }
        let compatible_with_resolved_tails = true;
        for (let tail_info of this.node2tail.get(head)!) {
          if (this.solutions.has(tail_info.tail_id)) {
            if (tail_info.sub_dominance) {
              if (!solution_to_head.issuperof(this.solutions.get(tail_info.tail_id)!)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else if (tail_info.super_dominance) {
              if (!this.solutions.get(tail_info.tail_id)!.issuperof(solution_to_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else {
              if (!this.solutions.get(tail_info.tail_id)!.same(solution_to_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
          }
        }
        // !12. Resolve the types of nonheads and nontails.
        if (compatible_with_resolved_tails) {
          this.solutions.set(head, solution_to_head);
          this.resolve_nonheads_and_nontails(head);
        }
        else {
          good_resolve = false;
          break;
        }
      }
      if (good_resolve) {
        this.solutions_collection.push(new Map(this.solutions));
      }
    }
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
              `Dominance::Verify: strong constraint is not satisfied: ${node.id} of ${solutions.get(node.id)!.str()} --> ${child} of ${solutions.get(child)!.str()}`);
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