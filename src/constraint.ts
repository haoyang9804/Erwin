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
import { irnode2types, Type, isSuperTypeSet, isEqualTypeSet, size_of_type } from "./type"
import * as dot from 'ts-graphviz';
import { config } from './config'
// debug
import { toFile } from "@ts-graphviz/adapter";
import { color } from "console-log-colors"

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

interface toTail {
  tail_id : number;
  // subtype/supertype = true if there exists a path from the node to tail with tail_id,
  // subtype/supertype domination holds.
  subtype : boolean;
  supertype : boolean;
};
let equal_toTail = (a : toTail, b : toTail) : boolean => {
  return a.tail_id === b.tail_id;
}

// The type dependence of the subsequent uses on the previous declacations
export class TypeDominanceDAG {
  dag_nodes : Map<number, ConstaintNode> = new Map<number, ConstaintNode>();
  // If 'id1 id2' is installed in subtype/supertype, then the type of id2 is a subtype/supertype of the type of id1
  subtype : Set<string> = new Set();
  supertype : Set<string> = new Set();
  resolved_types = new Map<number, Type>();
  resolved_types_collection : Map<number, Type>[] = [];
  // Records the IDs of heads/tails
  heads : Set<number> = new Set<number>();
  tails : Set<number> = new Set<number>();
  // For each node, records the IDs of its reachable tails and the subtype/supertype domination between the node and the tail.
  // If there are multiple paths from node to tail, then the subtype does not hold as long as there exists a path on which subtype domination does not hold.
  // tail are not in node2tail.
  // Isolated nodes are not in node2tail.
  node2tail : Map<number, Set<toTail>> = new Map<number, Set<toTail>>();
  // Map each edge to its reachable tails
  edge2tail : Map<string, Set<number>> = new Map<string, Set<number>>();
  // Records type candidates of all heads
  heads2type_collection : Map<number, Type>[] = [];
  // If "tail1 tail2" is in tailssubtype, then the type of tail2 is a subtype of the type of tail1.
  tailssubtype : Set<string> = new Set<string>();
  // If "tail1 tail2" is in tailssubtype, then the type of tail2 equals to the type of tail1.
  tailsequal : Set<string> = new Set<string>();

  constructor() { }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node : ConstaintNode) : void {
    this.dag_nodes.set(node.id, node);
  }

  /*
  1. If node1 weakly dominates node2 in type, then the type of node2 is a subtype of the type of node1.
  2. If node1 weakly and reversely dominates node2 in type, then the type of node2 is a supertype of the type of node1.
  */
  connect(from : number, to : number, rank ?: string) : void {
    assert(this.dag_nodes.get(from)! !== undefined, `TypeDominanceDAG::connect: node (from) ${from} is not in the DAG`)
    assert(this.dag_nodes.get(to)! !== undefined, `TypeDominanceDAG::connect: node (to) ${to} is not in the DAG`)
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    assert(rank === undefined || rank === "subtype" || rank === "supertype", `TypeDominanceDAG: rank ${rank} is not supported`)
    if (rank === "subtype") {
      this.subtype.add(`${from} ${to}`);
    }
    // haoyang
    if (rank === "supertype") {
      this.supertype.add(`${from} ${to}`);
    }
  }

  initialize_resolve() : void {
    this.resolved_types = new Map<number, Type>();
    this.resolved_types_collection = [];
    this.heads = new Set<number>();
    this.tails = new Set<number>();
    this.node2tail = new Map<number, Set<toTail>>();
    this.edge2tail = new Map<string, Set<number>>();
    this.heads2type_collection = [];
    this.tailssubtype = new Set<string>();
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
    // Remove nodes that are both head and tail from this.heads and this.tails.
    // Such nodes are isolated and not in the type dominance relationship.
    for (let node of this.heads) {
      if (this.tails.has(node)) {
        this.tails.delete(node);
      }
    }
  }

  dfs4node2tail(id : number, tail_id : number, subtype : boolean, supertype : boolean) : void {
    for (let parent of this.dag_nodes.get(id)!.ins) {
      const key = `${parent} ${id}`;
      let this_subtype = this.subtype.has(key) || subtype;
      let this_supertype = this.supertype.has(key) || supertype;
      if (this.node2tail.has(parent)) {
        // pre_subtype = false if there exists a path from the parent to tail with tail_id on which no subtype domination holds.
        let pre_subtype = true;
        const pre_tail_info : toTail[] = [];
        let meet_this_tail_before = false;
        for (const tail_info of this.node2tail.get(parent)!) {
          if (tail_info.tail_id === tail_id) {
            meet_this_tail_before = true;
            pre_subtype &&= tail_info.subtype;
            pre_tail_info.push(tail_info);
          }
        }
        if (meet_this_tail_before) {
          if (pre_subtype === true && this_subtype == false) {
            for (const tail_info of pre_tail_info)
              this.node2tail.get(parent)!.delete(tail_info);
            this.node2tail.get(parent)!.add({ tail_id: tail_id, subtype: false, supertype: this_supertype });
          }
          this_subtype &&= pre_subtype;
        }
        else {
          this.node2tail.get(parent)!.add({ tail_id: tail_id, subtype: this_subtype, supertype: this_supertype });
        }
      }
      else {
        const s = createCustomSet<toTail>(equal_toTail);
        s.add({ tail_id: tail_id, subtype: this_subtype, supertype: this_supertype });
        this.node2tail.set(parent, s);
      }
      this.dfs4node2tail(parent, tail_id, this_subtype, this_supertype);
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

  remove_subtype_domination(node : number) : void {
    for (const child of this.dag_nodes.get(node)!.outs) {
      const edge = `${node} ${child}`;
      assert(this.edge2tail.has(edge), `${edge} is not included in this.edge2tail`);
      for (const tail of this.edge2tail.get(edge)!) {
        const tail_info = [...this.node2tail.get(node)!].find(t => t.tail_id === tail);
        assert(tail_info !== undefined, `remove_subtype_domination: tail_info of tail whose ID is ${tail} is undefined`);
        if (!tail_info.subtype && this.subtype.has(edge)) {
          this.subtype.delete(edge);
        }
      }
      this.remove_subtype_domination(child);
    }
  }

  restrict_type_range(node : number) {
    for (let parent of this.dag_nodes.get(node)!.ins) {
      const edge = `${parent} ${node}`;
      if (!this.subtype.has(edge) && !this.supertype.has(edge)) {
        let parent_type_candidates = irnode2types.get(parent)!;
        let child_type_candidates = irnode2types.get(node)!;
        let same = true;
        if (parent_type_candidates.length !== child_type_candidates.length) {
          same = false;
        }
        else {
          for (let i = 0; i < parent_type_candidates.length; i++) {
            if (!parent_type_candidates[i].same(child_type_candidates[i])) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          let parent_candidates_is_superset_of_child_candidates = isSuperTypeSet(parent_type_candidates, child_type_candidates);
          let child_candidates_is_superset_of_parent_candidates = isSuperTypeSet(child_type_candidates, parent_type_candidates);
          assert(parent_candidates_is_superset_of_child_candidates || child_candidates_is_superset_of_parent_candidates,
            `restrict_type_range: the type range of ${parent}: ${parent_type_candidates.map(x => x.str())} is not a superset or subset of the type range of ${node}: ${child_type_candidates.map(x => x.str())}`);
          if (parent_candidates_is_superset_of_child_candidates) {
            irnode2types.set(parent, child_type_candidates);
          }
        }
      }
      this.restrict_type_range(parent);
    }
  }

  tighten_type_range_from_a_tail(tail : number) {
    let upwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        downwards(node);
        return;
      }
      for (let parent of this.dag_nodes.get(node)!.ins) {
        if (isEqualTypeSet(irnode2types.get(parent)!, irnode2types.get(node)!)) {
          continue;
        }
        assert(isSuperTypeSet(irnode2types.get(parent)!, irnode2types.get(node)!), `tighten_type_range_from_a_tail::upwards: the type range of ${parent}: ${irnode2types.get(parent)!.map(t => t.str())} is not a superset of the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())}`);
        irnode2types.set(parent, irnode2types.get(node)!);
        upwards(parent);
        downwards(parent);
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        if (isEqualTypeSet(irnode2types.get(child)!, irnode2types.get(node)!)) {
          continue;
        }
        assert(isSuperTypeSet(irnode2types.get(child)!, irnode2types.get(node)!), `tighten_type_range_from_a_tail::downwards: the type range of ${child}: ${irnode2types.get(child)!.map(t => t.str())} is not a superset of the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())}`);
        irnode2types.set(child, irnode2types.get(node)!);
        downwards(child);
      }
    }
    upwards(tail);
    if (config.debug) {
      for (let [id, _] of this.dag_nodes) {
        console.log(color.redBG(`${id}'s type range: ${irnode2types.get(id)!.map(t => t.str())}`));
      }
      console.log('=====================================');
    }
  }

  tighten_type_range_from_a_head(head : number) {
    let upwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.ins.length === 0) {
        downwards(node);
        return;
      }
      for (let parent of this.dag_nodes.get(node)!.ins) {
        if (isEqualTypeSet(irnode2types.get(parent)!, irnode2types.get(node)!)) {
          continue;
        }
        assert(isSuperTypeSet(irnode2types.get(parent)!, irnode2types.get(node)!), `tighten_type_range_from_a_head::upwards: the type range of ${parent}: ${irnode2types.get(parent)!.map(t => t.str())} is not a superset of the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())}`);
        irnode2types.set(parent, irnode2types.get(node)!);
        upwards(parent);
        downwards(parent);
      }
    }
    let downwards = (node : number) : void => {
      if (this.dag_nodes.get(node)!.outs.length === 0) {
        upwards(node);
        return;
      }
      for (let child of this.dag_nodes.get(node)!.outs) {
        if (isEqualTypeSet(irnode2types.get(child)!, irnode2types.get(node)!)) {
          continue;
        }
        assert(isSuperTypeSet(irnode2types.get(child)!, irnode2types.get(node)!), `tighten_type_range_from_a_head::downwards: the type range of ${child}: ${irnode2types.get(child)!.map(t => t.str())} is not a superset of the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())}`);
        irnode2types.set(child, irnode2types.get(node)!);
        downwards(child);
      }
    }
    downwards(head);
    if (config.debug) {
      for (let [id, _] of this.dag_nodes) {
        console.log(color.greenBG(`${id}'s type range: ${irnode2types.get(id)!.map(t => t.str())}`));
      }
      console.log('=====================================');
    }
  }

  tighten_type_range() {
    let broadcast_the_tightest_type_range_downwards = (node : number) : void => {
      for (let child of this.dag_nodes.get(node)!.outs) {
        let child_type_range = irnode2types.get(child)!;
        let parent_type_range = irnode2types.get(node)!;
        if (!isEqualTypeSet(child_type_range, parent_type_range)) {
          assert(isSuperTypeSet(child_type_range, parent_type_range),
            `tighten_type_range::broadcast_the_tightest_type_range_downwards: the type range of ${child}: ${child_type_range.map(t => t.str())} is not a superset of the type range of ${node}: ${parent_type_range.map(t => t.str())}`);
          irnode2types.set(child, parent_type_range);
        }
        broadcast_the_tightest_type_range_downwards(child);
      }
    }
    for (let head of this.heads) {
      broadcast_the_tightest_type_range_downwards(head);
    }
  }

  allocate_type_candidates_for_heads_with_smaller_memory_consumption() : void {
    for (let head of this.heads) irnode2types.set(head, shuffle(irnode2types.get(head)!));
    const head_array = shuffle(Array.from(this.heads));
    let cnt = 0;
    let dfs = (id : number, heads2type : Map<number, Type>) : void => {
      if (cnt > config.maximum_type_resolution_for_heads) return;
      if (id === head_array.length) {
        this.heads2type_collection.push(heads2type);
        cnt++;
        return;
      }
      else {
        for (let type of irnode2types.get(head_array[id])!) {
          let heads2type_copy = new Map(heads2type);
          heads2type_copy.set(head_array[id], type);
          dfs(id + 1, heads2type_copy);
        }
      }
    }
    dfs(0, new Map<number, Type>());
  }

  allocate_type_candidates_for_heads() : void {
    this.heads2type_collection.push(new Map<number, Type>());
    for (let head of this.heads) {
      const heads2type_length = this.heads2type_collection.length;
      if (config.debug) console.log(color.cyan(`head is ${head}, and irnode2types.get(head)!.length is ${irnode2types.get(head)!.length}`));
      assert(irnode2types.has(head), `allocate_type_candidates_for_heads: head ${head} is not in irnode2types`);
      this.heads2type_collection = extendArrayofMap(this.heads2type_collection, irnode2types.get(head)!.length);
      let cnt = 1;
      for (let type of irnode2types.get(head)!) {
        for (let i = (cnt - 1) * heads2type_length; i < cnt * heads2type_length; i++) {
          this.heads2type_collection[i].set(head, type);
        }
        cnt++;
      }
    }
    if (config.debug) console.log(color.cyan(`heads2type_collection.size is ${this.heads2type_collection.length}`));
    if (this.heads2type_collection.length > config.maximum_type_resolution_for_heads) {
      this.heads2type_collection = selectRandomElements(this.heads2type_collection, config.maximum_type_resolution_for_heads);
    }
    else {
      this.heads2type_collection = shuffle(this.heads2type_collection);
    }
  }

  allocate_type_candidates_for_tails_based_on_type_resolution_for_heads(head_resolve : Map<number, Type>) : Map<number, Type[]> {
    const tail2types = new Map<number, Type[]>();
    let types4tail : Type[] = [];
    for (let [head, type_of_head] of head_resolve) {
      // There may exist heads that are not connected any other nodes.
      // They are not in node2tail.
      if (!this.node2tail.has(head)) continue;
      for (const { tail_id, subtype, supertype } of this.node2tail.get(head)!) {
        if (subtype) {
          types4tail = type_of_head.subs();
        }
        else if (supertype) {
          types4tail = type_of_head.supers();
        }
        else {
          types4tail = [type_of_head];
        }
        if (tail2types.has(tail_id)) {
          tail2types.set(tail_id, tail2types.get(tail_id)!.filter(t => types4tail.some(tt => tt.same(t))));
        }
        else {
          tail2types.set(tail_id, types4tail);
        }
      }
    }
    return tail2types;
  }

  build_tails_relation() : void {
    for (let [_, tail_infos] of this.node2tail) {
      const tail_infos_array = [...tail_infos];
      const tail_infos_length = tail_infos_array.length;
      for (let i = 0; i < tail_infos_length; i++) {
        for (let j = i + 1; j < tail_infos_length; j++) {
          const tail_info1 = tail_infos_array[i];
          const tail_info2 = tail_infos_array[j];
          if (tail_info1.subtype && (!tail_info2.subtype && !tail_info2.supertype)) {
            this.tailssubtype.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if (tail_info1.supertype && (!tail_info2.subtype && !tail_info2.supertype)) {
            this.tailssubtype.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
          }
          else if ((!tail_info1.subtype && !tail_info1.supertype) && tail_info2.subtype) {
            this.tailssubtype.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
          }
          else if ((!tail_info1.subtype && !tail_info1.supertype) && tail_info2.supertype) {
            this.tailssubtype.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
          else if ((!tail_info1.subtype && !tail_info1.supertype) && (!tail_info2.subtype && !tail_info2.supertype)) {
            this.tailsequal.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
            this.tailsequal.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
          }
        }
      }
    }
  }

  resolve_tails(tail2types : Map<number, Type[]>) : boolean {
    const tails_array = [...this.tails];
    let i4tails_array = 0;
    let i4types_of_each_tail = new Array<number>(tails_array.length).fill(0);
    let tailid2type_candidates = new Map<number, Type[]>();
    let cannot_resolve = false;
    while (true) {
      if (i4tails_array === 0) {
        const types_candidate = tail2types.get(tails_array[i4tails_array])!;
        tailid2type_candidates.set(tails_array[i4tails_array], types_candidate);
        i4tails_array++;
      }
      else {
        // Use previous tail type resolution to restrict the current tail type resolution.
        let types_candidate = tail2types.get(tails_array[i4tails_array])!;
        for (let j = 0; j < i4tails_array; j++) {
          assert(tailid2type_candidates.has(tails_array[j]), `resolve_tails: tailid2type_candidates does not have ${tails_array[j]}`);
          if (this.tailssubtype.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
            types_candidate = types_candidate.filter(t => t.issubof(tailid2type_candidates.get(tails_array[j])![i4types_of_each_tail[i4tails_array]]));
          }
          else if (this.tailssubtype.has(`${tails_array[i4tails_array]} ${tails_array[j]}`)) {
            types_candidate = types_candidate.filter(t => t.issuperof(tailid2type_candidates.get(tails_array[j])![i4types_of_each_tail[i4tails_array]]));
          }
          else if (this.tailsequal.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
            types_candidate = types_candidate.filter(t => t.same(tailid2type_candidates.get(tails_array[j])![i4types_of_each_tail[i4tails_array]]));
          }
          if (types_candidate.length === 0) {
            let jcopy = j;
            for (let ji = j + 1; ji < i4tails_array; ji++) {
              i4types_of_each_tail[ji] = 0;
              tailid2type_candidates.delete(tails_array[ji]);
            }
            while (true) {
              i4types_of_each_tail[jcopy]++;
              if (i4types_of_each_tail[jcopy] === tailid2type_candidates.get(tails_array[jcopy])!.length) {
                tailid2type_candidates.delete(tails_array[jcopy]);
                i4types_of_each_tail[jcopy] = 0;
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
          tailid2type_candidates.set(tails_array[i4tails_array], types_candidate);
          i4tails_array++;
        }
      }
      if (cannot_resolve) break;
      if (i4tails_array === tails_array.length) break;
    }
    if (cannot_resolve === false) {
      for (let i = 0; i < tails_array.length; i++) {
        this.resolved_types.set(tails_array[i], tailid2type_candidates.get(tails_array[i])![i4types_of_each_tail[i]]);
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
          if (this.subtype.has(edge)) {
            if (tail_info!.subtype) {
              let type_candidates = this.resolved_types.get(node)!.sub_with_lowerbound(this.resolved_types.get(tail_id)!)!;
              if (this.resolved_types.has(child)) {
                type_candidates = type_candidates.filter(t => t.same(this.resolved_types.get(child)!));
              }
              // Deal with the case where the type range of the child is smaller than the type range of the parent
              // mentioned by the 5th step.
              const type_candidate_copy = type_candidates;
              type_candidates = type_candidates.filter(t => irnode2types.get(child)!.some(tt => t.same(tt)));
              assert(type_candidates.length > 0, `resolve_nonheads_and_nontails:>1 type_candidates is empty when resolving ${child} on edge ${edge}. type_candidates before and after set intersection is ${type_candidate_copy.map(t => t.str())} and ${irnode2types.get(child)!.map(t => t.str())}`);
              this.resolved_types.set(child, pickRandomElement(type_candidates)!);
            }
            else if (tail_info!.supertype) {
              throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the supertype of ${child}`);
            }
            else {
              assert(this.resolved_types.get(tail_id)!.issubof(this.resolved_types.get(node)!), `resolve_nonheads_and_nontails: the type of ${node}: ${this.resolved_types.get(node)!.str()} is not the supertype of the type of ${tail_id}: ${this.resolved_types.get(tail_id)!.str()}`);
              this.resolved_types.set(child, this.resolved_types.get(tail_id)!);
            }
          }
          else if (this.supertype.has(edge)) {
            // child is a tail
            throw new Error(`resolve_nonheads_and_nontails: ${node} should not be the supertype of ${child}`);
          }
          else {
            let type_candidates = [this.resolved_types.get(node)!];
            if (this.resolved_types.has(child)) {
              type_candidates = type_candidates.filter(t => t.same(this.resolved_types.get(child)!));
            }
            assert(type_candidates.length > 0, `resolve_nonheads_and_nontails:>3 type_candidates is empty`);
            this.resolved_types.set(child, pickRandomElement(type_candidates)!);
          }
        }
      }
      this.resolve_nonheads_and_nontails(child);
    }
  }

  check_type_range_after_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      assert(isEqualTypeSet(irnode2types.get(node)!, irnode2types.get(child)!),
        `check_type_range_after_tightening: the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())} is not the same as the type range of ${child}: ${irnode2types.get(child)!.map(t => t.str())}`);
      this.check_type_range_after_tightening(child);
    }
  }

  check_type_range_before_tightening(node : number) : void {
    for (let child of this.dag_nodes.get(node)!.outs) {
      assert(isSuperTypeSet(irnode2types.get(child)!, irnode2types.get(node)!),
        `check_type_range_before_tightening: the type range of ${child}: ${irnode2types.get(child)!.map(t => t.str())} is not the superset of the type range of ${node}: ${irnode2types.get(node)!.map(t => t.str())}`);
      this.check_type_range_before_tightening(child);
    }
  }

  resolve() : void {
    // !0. initialize the resolution
    this.initialize_resolve();
    // !1. Get heads and tails
    this.get_heads_and_tails();
    // !2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which subtype/supertype domination does not holds.
    // If there are multiple paths from node to tail, then the subtype does not hold as long as there exists a path on which subtype domination does not hold.
    // tail_ids are not in this.node2tail
    for (let tail of this.tails) {
      this.dfs4node2tail(tail, tail, false, false);
    }
    // !3. Map edges to their reachable this.tails
    for (let tail of this.tails) {
      this.dfs4edge2tail(tail, tail);
    }
    // !4. Remove some removable subtype dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The subtype domination from node 6 to node 7
    // is removable since the type of node 6 must be the same as the type of node 1, and edge (6, 7)
    // can reach tail 1.
    for (let head of this.heads) {
      this.remove_subtype_domination(head);
    }
    // !4.5 Check before type range tightening
    for (let head of this.heads) {
      this.check_type_range_before_tightening(head);
    }
    // !5. Tighten the type range for each node
    this.tighten_type_range();
    if (config.debug) {
      for (let [id, _] of this.dag_nodes) {
        console.log(color.redBG(`${id}'s type range: ${irnode2types.get(id)!.map(t => t.str())}`));
      }
    }
    // !5.5 Check after type range tightening
    for (let head of this.heads) {
      this.check_type_range_after_tightening(head);
    }
    // !6. Assign types to this.heads
    let size_estimation1 = 1;
    for (let head of this.heads) {
      size_estimation1 *= irnode2types.get(head)!.length;
    }
    size_estimation1 *= this.heads.size * size_of_type;
    let size_estimation2 = config.maximum_type_resolution_for_heads * this.heads.size * size_of_type;
    if (config.debug) {
      console.log(color.cyan(`size_estimation1 is ${size_estimation1}, size_estimation2 is ${size_estimation2}`));
    }
    if (size_estimation1 < size_estimation2) {
      this.allocate_type_candidates_for_heads();
    }
    else {
      this.allocate_type_candidates_for_heads_with_smaller_memory_consumption();
    }
    // !7. Traverse each type resolution for heads
    for (const head_resolve of this.heads2type_collection) {
      this.resolved_types.clear();
      let good_resolve = true;
      // First, narrow down the type range of this.tails
      // !8. Allocate type candidates for tails based on the current type resolution for heads
      const tail2types = this.allocate_type_candidates_for_tails_based_on_type_resolution_for_heads(head_resolve);
      // Then check if there exists one tail whose type candidates are empty.
      // If all this.tails have non-empty type candidates, then resolve the types of this.tails.
      for (const tail of this.tails) {
        assert(tail2types.has(tail), `tail2type does not have ${tail}`);
        if (tail2types.get(tail)!.length === 0) {
          good_resolve = false;
          break;
        }
        else {
          // The choice of the type of the tail is restricted by the indirect connection among this.tails.
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the type of
          // T1 and T2 have a type relation.
          tail2types.set(tail, shuffle(tail2types.get(tail)!))
        }
      }
      if (!good_resolve) continue;
      // !9. Build connection among tails.
      this.build_tails_relation();
      // !10. Resolve the types of tails.
      const plausible_type_resolution_for_tails = this.resolve_tails(tail2types);
      if (plausible_type_resolution_for_tails === false) continue;
      // !11. Check if the resolved types of tails are compatible with the resolved types of heads.
      for (let [head, type_of_head] of head_resolve) {
        if (this.node2tail.has(head) === false) {
          this.resolved_types.set(head, type_of_head);
          continue;
        }
        let compatible_with_resolved_tails = true;
        for (let tail_info of this.node2tail.get(head)!) {
          if (this.resolved_types.has(tail_info.tail_id)) {
            if (tail_info.subtype) {
              if (!type_of_head.issuperof(this.resolved_types.get(tail_info.tail_id)!)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else if (tail_info.supertype) {
              if (!this.resolved_types.get(tail_info.tail_id)!.issuperof(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else {
              if (!this.resolved_types.get(tail_info.tail_id)!.same(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
          }
        }
        // !12. Resolve the types of nonheads and nontails.
        if (compatible_with_resolved_tails) {
          this.resolved_types.set(head, type_of_head);
          this.resolve_nonheads_and_nontails(head);
        }
        else {
          good_resolve = false;
          break;
        }
      }
      if (good_resolve) {
        this.resolved_types_collection.push(new Map(this.resolved_types));
      }
    }
  }

  depracated_resolve() : void {
    // !0. initialize the resolution
    this.initialize_resolve();
    // !1. Get heads and tails
    this.get_heads_and_tails();
    // !2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which subtype/supertype domination does not holds.
    // If there are multiple paths from node to tail, then the subtype does not hold as long as there exists a path on which subtype domination does not hold.
    // tail_ids are not in this.node2tail
    for (let tail of this.tails) {
      this.dfs4node2tail(tail, tail, false, false);
    }
    // !3. Map edges to their reachable this.tails
    for (let tail of this.tails) {
      this.dfs4edge2tail(tail, tail);
    }
    // !4. Remove some removable subtype dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The subtype domination from node 6 to node 7
    // is removable since the type of node 6 must be the same as the type of node 1, and edge (6, 7)
    // can reach tail 1.
    for (let head of this.heads) {
      this.remove_subtype_domination(head);
    }
    // !5. Restrict the type range of heads.
    // Consider the following scenario.
    // If the true expression of a conditional expression Ec is a unaryop expression Eu whose op is "!", then the type of
    // Eu should be boolean. However, Eu type-dominate Ec and the type range of Eu is more than just boolean.
    // Therefore, we need to backpropogate the type range from children to parents until the type range of this.heads are restricted.
    // The backpropogation strategy is simple: if n1 type-dominate n2 by n1.type == n2.type, then the type range of n1 must be a
    // superset of the type range of n2. In this case, we restrict the type range of n1 to be the same as the type range of n2.
    // As for the scenario where n1 type-dominate n2 by n1.type is the supertype of n2.type, we resolve the subtype domination
    // with the consideration of n2's type range in the resolve() function.
    for (let tail of this.tails) {
      this.restrict_type_range(tail);
    }
    // !6. Assign types to this.heads
    this.allocate_type_candidates_for_heads();
    // !7. Traverse each type resolution for heads
    for (const head_resolve of this.heads2type_collection) {
      this.resolved_types.clear();
      let good_resolve = true;
      // First, narrow down the type range of this.tails
      // !8. Allocate type candidates for tails based on the current type resolution for heads
      const tail2types = this.allocate_type_candidates_for_tails_based_on_type_resolution_for_heads(head_resolve);
      // Then check if there exists one tail whose type candidates are empty.
      // If all this.tails have non-empty type candidates, then resolve the types of this.tails.
      for (const tail of this.tails) {
        assert(tail2types.has(tail), `tail2type does not have ${tail}`);
        if (tail2types.get(tail)!.length === 0) {
          good_resolve = false;
          break;
        }
        else {
          // The choice of the type of the tail is restricted by the indirect connection among this.tails.
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the type of
          // T1 and T2 have a type relation.
          tail2types.set(tail, shuffle(tail2types.get(tail)!))
        }
      }
      if (!good_resolve) continue;
      // !9. Build connection among tails.
      this.build_tails_relation();
      // !10. Resolve the types of tails.
      const plausible_type_resolution_for_tails = this.resolve_tails(tail2types);
      if (plausible_type_resolution_for_tails === false) continue;
      // !11. Check if the resolved types of tails are compatible with the resolved types of heads.
      for (let [head, type_of_head] of head_resolve) {
        if (this.node2tail.has(head) === false) {
          this.resolved_types.set(head, type_of_head);
          continue;
        }
        let compatible_with_resolved_tails = true;
        for (let tail_info of this.node2tail.get(head)!) {
          if (this.resolved_types.has(tail_info.tail_id)) {
            if (tail_info.subtype) {
              if (!type_of_head.issuperof(this.resolved_types.get(tail_info.tail_id)!)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else if (tail_info.supertype) {
              if (!this.resolved_types.get(tail_info.tail_id)!.issuperof(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else {
              if (!this.resolved_types.get(tail_info.tail_id)!.same(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
          }
        }
        // !12. Resolve the types of nonheads and nontails.
        if (compatible_with_resolved_tails) {
          this.resolved_types.set(head, type_of_head);
          this.resolve_nonheads_and_nontails(head);
        }
        else {
          good_resolve = false;
          break;
        }
      }
      if (good_resolve) {
        this.resolved_types_collection.push(new Map(this.resolved_types));
      }
    }
  }

  verify() : void {
    for (const resolved_types of this.resolved_types_collection) {
      // 1. Verify that all nodes have been resolved.
      for (let [id, _] of this.dag_nodes) {
        assert(resolved_types.has(id), `Verify: node ${id} has not been resolved`);
      }
      // 2. Verify that all resolved types are one of the type candidates of the node.
      for (let [id, type_candidates] of irnode2types) {
        let resolved_type = resolved_types.get(id)!;
        let match = false;
        for (let type_candidate of type_candidates) {
          if (resolved_type.same(type_candidate)) {
            match = true;
            break;
          }
        }
        assert(match, `Verify: resolved type ${resolved_type.str()} of node ${id} is not one of the type candidates: ${type_candidates.map(t => t.str()).join(", ")}`);
      }
      // 3. Verify that all type-domination relations hold.
      for (let [_, node] of this.dag_nodes) {
        for (let child of node.outs) {
          if (this.subtype.has(`${node.id} ${child}`)) {
            const subttypes = resolved_types.get(node.id)!.subs();
            let typeofchild = resolved_types.get(child)!;
            let match = false;
            for (let subtype of subttypes) {
              if (typeofchild.same(subtype)) {
                match = true;
                break;
              }
            }
            assert(match,
              `Verify: subtype constraint is not satisfied:
              ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}.
              Maybe you forget to add a subtype constraint in constraint.ts: TypeDominanceDAG: verify.`);
          }
          else if (this.supertype.has(`${node.id} ${child}`)) {
            const supertypes = resolved_types.get(node.id)!.supers();
            let typeofchild = resolved_types.get(child)!;
            let match = false;
            for (let subtype of supertypes) {
              if (typeofchild.same(subtype)) {
                match = true;
                break;
              }
            }
            assert(match,
              `Verify: supertype constraint is not satisfied:
              ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}.
              Maybe you forget to add a supertype constraint in constraint.ts: TypeDominanceDAG: verify.`);
          }
          else {
            assert(resolved_types.get(node.id)!.same(resolved_types.get(child)!),
              `Verify: strong type constraint is not satisfied: ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}`);
          }
        }
      }
    }
  }

  async draw() : Promise<void> {
    this.get_heads_and_tails();
    const G = new dot.Digraph();
    const visited : Map<number, dot.Node> = new Map<number, dot.Node>();
    let dfs = (pre_gnode : dot.Node | undefined, node : number, subtype : boolean, supertype : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (supertype) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "is subtype of" });
            G.addEdge(edge);
          }
          else if (subtype) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'is supertype of' });
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
        if (subtype) {
          const edge = new dot.Edge([pre_gnode, gnode], { [dot.attribute.label]: 'is supertype of' });
          G.addEdge(edge);
        }
        else if (supertype) {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: "is subtype of" });
          G.addEdge(edge);
        }
        else {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!]);
          G.addEdge(edge);
        }
      }
      G.addNode(gnode);
      for (let child of this.dag_nodes.get(node)!.outs) {
        dfs(gnode, child, this.subtype.has(`${node} ${child}`), this.supertype.has(`${node} ${child}`));
      }
    }
    for (let head of this.heads) {
      dfs(undefined, head, false, false);
    }
    const dot_lang = dot.toDot(G);
    await toFile(dot_lang, './type-constraint.svg', { format: 'svg' });
  }
}