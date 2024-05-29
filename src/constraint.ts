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
import { assert, createCustomSet, extendArrayofMap, pickRandomElement, shuffle } from "./utility";
import { irnode2types, Type } from "./type"
import * as dot from 'ts-graphviz';
// debug
import { toFile } from "@ts-graphviz/adapter";

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

// export class InfoTree<T> {
//   id: number;
//   type: T | undefined;
//   children: InfoTree<T>[] = [];
//   nt: InfoTree<T> | undefined = undefined;
//   constructor(id: number, type?: T) {
//     this.id = id;
//     this.type = type;
//   }
// }

// export class DAGpath {
//   me: number;
//   nt: DAGpath | undefined;
//   subtype_cnt: number;
//   constructor(me: number, subtype_cnt: number, nt?: DAGpath) {
//     this.me = me;
//     this.subtype_cnt = subtype_cnt;
//     this.nt = nt;
//   }
// }

// export class rDAGpath {
//   me: number;
//   nt: rDAGpath | undefined;
//   supertype_cnt: number;
//   constructor(me: number, supertype_cnt: number, nt?: rDAGpath) {
//     this.me = me;
//     this.supertype_cnt = supertype_cnt;
//     this.nt = nt;
//   }
// }

// export function reversePath(path: DAGpath): rDAGpath {
//   const nodes: DAGpath[] = []
//   const subtype_cnt = path.subtype_cnt;
//   let maybe_path: DAGpath | undefined = path;
//   while(maybe_path !== undefined) {
//     nodes.push(maybe_path);
//     maybe_path = maybe_path.nt;
//   }
//   nodes.reverse();
//   let rpath: rDAGpath | undefined = undefined;
//   for (let node of nodes) {
//     rpath = new rDAGpath(node.me, subtype_cnt - node.subtype_cnt, rpath);
//   }
//   assert(rpath !== undefined, `reversePath: rpath is undefined`);
//   return rpath;
// }

// The type dependence of the subsequent uses on the previous declacations
export class TypeDominanceDAG {
  dag_nodes : Map<number, ConstaintNode> = new Map<number, ConstaintNode>();
  // If 'id1 id2' is installed in subtype/supertype, then the type of id2 is a subtype/supertype of the type of id1
  subtype : Set<string> = new Set();
  supertype : Set<string> = new Set();
  resolved_types_collection : Map<number, Type>[] = [];

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
    assert(this.dag_nodes.get(from)! !== undefined, `TypeDominanceDAG::connect: node ${from} is not in the DAG`)
    assert(this.dag_nodes.get(to)! !== undefined, `TypeDominanceDAG::connect: node ${to} is not in the DAG`)
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

  resolve() : void {
    // 0. initialize the resolution
    for (let [_, node] of this.dag_nodes) {
      node.resolved = false;
    }
    this.resolved_types_collection = [];
    // 1. Get heads and tails
    const heads = new Set<number>();
    const tails = new Set<number>();
    for (let [_, node] of this.dag_nodes) {
      if (node.inbound === 0) {
        heads.add(node.id);
      }
      if (node.outbound === 0) {
        tails.add(node.id);
      }
    }
    // 2. Map nodes to their tails, recording if there exists a path from the node to tail with tail_id on which subtype/supertype domination does not holds.
    // If there are multiple paths from node to tail, then the subtype does not hold as long as there exists a path on which subtype domination does not hold.
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
    // tail_ids are not in node2tail
    const node2tail = new Map<number, Set<toTail>>();
    let dfs4node2tail = (id : number, tail_id : number, subtype : boolean, supertype : boolean) => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const key = `${parent} ${id}`;
        let this_subtype = this.subtype.has(key) || subtype;
        let this_supertype = this.supertype.has(key) || supertype;
        if (node2tail.has(parent)) {
          // pre_subtype = false if there exists a path from the parent to tail with tail_id on which no subtype domination holds.
          let pre_subtype = true;
          const pre_tail_info : toTail[] = [];
          let meet_this_tail_before = false;
          for (const tail_info of node2tail.get(parent)!) {
            if (tail_info.tail_id === tail_id) {
              meet_this_tail_before = true;
              pre_subtype &&= tail_info.subtype;
              pre_tail_info.push(tail_info);
            }
          }
          if (meet_this_tail_before) {
            if (pre_subtype === true && this_subtype == false) {
              for (const tail_info of pre_tail_info)
                node2tail.get(parent)!.delete(tail_info);
              node2tail.get(parent)!.add({ tail_id: tail_id, subtype: false, supertype: this_supertype });
            }
            this_subtype &&= pre_subtype;
          }
          else {
            node2tail.get(parent)!.add({ tail_id: tail_id, subtype: this_subtype, supertype: this_supertype });
          }
        }
        else {
          const s = createCustomSet<toTail>(equal_toTail);
          s.add({ tail_id: tail_id, subtype: this_subtype, supertype: this_supertype });
          node2tail.set(parent, s);
        }
        dfs4node2tail(parent, tail_id, this_subtype, this_supertype);
      }
    }
    for (let tail of tails) {
      dfs4node2tail(tail, tail, false, false);
    }
    // 3. Map edges to their reachable tails
    const edge2tail = new Map<string, Set<number>>();
    let dfs4edge2tail = (id : number, tail_id : number) => {
      for (let parent of this.dag_nodes.get(id)!.ins) {
        const edge = `${parent} ${id}`;
        if (edge2tail.has(edge)) {
          edge2tail.get(edge)!.add(tail_id);
        }
        else {
          edge2tail.set(edge, new Set([tail_id]));
        }
        dfs4edge2tail(parent, tail_id);
      }
    }
    for (let tail of tails) {
      dfs4edge2tail(tail, tail);
    }

    // 4. Remove some removable subtype dominations using node2tail and edge2tail
    // See the first test case in resolve.test.ts. The subtype domination from node 6 to node 7
    // is removable since the type of node 6 must be the same as the type of node 1, and edge (6, 7)
    // can reach tail 1.
    let remove_subtype_domination = (node : number) => {
      for (const child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        assert(edge2tail.has(edge), `${edge} is not included in edge2tail`);
        for (const tail of edge2tail.get(edge)!) {
          const tail_info = [...node2tail.get(node)!].find(t => t.tail_id === tail);
          assert(tail_info !== undefined, `TypeDominanceDAG::resolve: tail_info of tail whose ID is ${tail} is undefined`);
          if (!tail_info.subtype && this.subtype.has(edge)) {
            this.subtype.delete(edge);
          }
        }
        remove_subtype_domination(child);
      }
    }
    for (let head of heads) {
      remove_subtype_domination(head);
    }

    // 5. Assign types to heads
    let heads2type : Map<number, Type>[] = []
    for (let head of heads) {
      const heads2type_length = heads2type.length;
      assert(irnode2types.has(head), `TypeDominanceDAG::resolve: head ${head} is not in irnode2types`);
      heads2type = extendArrayofMap(heads2type, irnode2types.get(head)!.length);
      let cnt = 1;
      for (let type of irnode2types.get(head)!) {
        if (heads2type_length === 0) {
          heads2type.push(new Map([[head, type]]));
        }
        else {
          for (let i = (cnt - 1) * heads2type_length; i < cnt * heads2type_length; i++) {
            heads2type[i].set(head, type);
          }
        }
        cnt++;
      }
    }
    // 6. Get type candidates for tails
    let get_type_candidates_for_tails = (head_resolve : Map<number, Type>) : Map<number, Type[]> => {
      const tail2types = new Map<number, Type[]>();
      let types4tail : Type[] = [];
      for (let [head, type_of_head] of head_resolve) {
        for (const { tail_id, subtype, supertype } of node2tail.get(head)!) {
          if (subtype) {
            types4tail = type_of_head.subtype();
          }
          else if (supertype) {
            types4tail = type_of_head.supertype();
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
    // 7. Build relation among tails.
    // If "tail1 tail2" is in tailssubtype, then the type of tail2 is a subtype of the type of tail1.
    let tailssubtype = new Set<string>();
    let tailsequal = new Set<string>();
    let tails_relation = () : void => {
      for (let [_, tail_infos] of node2tail) {
        const tail_infos_array = [...tail_infos];
        const tail_infos_length = tail_infos_array.length;
        for (let i = 0; i < tail_infos_length; i++) {
          for (let j = i + 1; j < tail_infos_length; j++) {
            const tail_info1 = tail_infos_array[i];
            const tail_info2 = tail_infos_array[j];
            if (tail_info1.subtype && (!tail_info2.subtype && !tail_info2.supertype)) {
              tailssubtype.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
            }
            else if (tail_info1.supertype && (!tail_info2.subtype && !tail_info2.supertype)) {
              tailssubtype.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
            }
            else if ((!tail_info1.subtype && !tail_info1.supertype) && tail_info2.subtype) {
              tailssubtype.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
            }
            else if ((!tail_info1.subtype && !tail_info1.supertype) && tail_info2.supertype) {
              tailssubtype.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
            }
            else if ((!tail_info1.subtype && !tail_info1.supertype) && (!tail_info2.subtype && !tail_info2.supertype)) {
              tailsequal.add(`${tail_info1.tail_id} ${tail_info2.tail_id}`);
              tailsequal.add(`${tail_info2.tail_id} ${tail_info1.tail_id}`);
            }
          }
        }
      }
    }
    const resolved_types = new Map<number, Type>();

    // 9. Resolve types from heads to tails
    let resolve = (node : number) => {
      for (let child of this.dag_nodes.get(node)!.outs) {
        const edge = `${node} ${child}`;
        for (const tail_id of edge2tail.get(edge)!) {
          const tail_info = [...node2tail.get(node)!].find(t => t.tail_id === tail_id);
          if (this.subtype.has(edge)) {
            if (tail_info!.subtype) {
              let type_candidates = resolved_types.get(node)!.subtype_with_lowerbound(resolved_types.get(tail_id)!)!;
              if (resolved_types.has(child)) {
                type_candidates = type_candidates.filter(t => t.same(resolved_types.get(child)!));
              }
              assert(type_candidates.length > 0, `TypeDominanceDAG::resolve::resolve: type_candidates is empty`);
              resolved_types.set(child, pickRandomElement(type_candidates)!);
            }
            else if (tail_info!.supertype) {
              throw new Error(`TypeDominanceDAG::resolve::resolve: ${node} should not be the subtype of ${child}`);
            }
            else {
              throw new Error(`TypeDominanceDAG::resolve::resolve: the type of ${node} should not be the equal of the type of ${child}`);
            }
          }
          else if (this.supertype.has(edge)) {
            // child is a tail
            let type_candidates = resolved_types.get(node)!.supertype()!;
            if (resolved_types.has(child)) {
              type_candidates = type_candidates.filter(t => t.same(resolved_types.get(child)!));
            }
            assert(type_candidates.length > 0, `TypeDominanceDAG::resolve::resolve: type_candidates is empty`);
            resolved_types.set(child, pickRandomElement(type_candidates)!);
          }
          else {
            let type_candidates = [resolved_types.get(node)!];
            if (resolved_types.has(child)) {
              type_candidates = type_candidates.filter(t => t.same(resolved_types.get(child)!));
            }
            assert(type_candidates.length > 0, `TypeDominanceDAG::resolve::resolve: type_candidates is empty`);
            resolved_types.set(child, pickRandomElement(type_candidates)!);
          }
        }
        resolve(child);
      }
    }
    for (const head_resolve of heads2type) {
      resolved_types.clear();
      let good_head_resolve = true;
      // First, narrow down the type range of tails
      const tail2types = get_type_candidates_for_tails(head_resolve);
      // Then check if there exists one tail whose type candidates are empty.
      // If all tails have non-empty type candidates, then resolve the types of tails.
      for (const tail of tails) {
        assert(tail2types.has(tail), `tail2type does not have ${tail}`);
        if (tail2types.get(tail)!.length === 0) {
          good_head_resolve = false;
          break;
        }
        else {
          // The choice of the type of the tail is restricted by the indirect connection among tails.
          // If a non-head non-tail node N has two paths two tail T1 and T2 respectively, then the type of
          // T1 and T2 have a type relation.
          tail2types.set(tail, shuffle(tail2types.get(tail)!))
        }
      }
      if (!good_head_resolve) continue;
      // Next, build connection among tails.
      tails_relation();
      // Then, resolve the types of tails.
      const tails_array = [...tails];
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
            assert(tailid2type_candidates.has(tails_array[j]), `TypeDominanceDAG::resolve: tailid2type_candidates does not have ${tails_array[j]}`);
            if (tailssubtype.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
              types_candidate = types_candidate.filter(t => t.issubtypeof(tailid2type_candidates.get(tails_array[j])![i4types_of_each_tail[i4tails_array]]));
            }
            else if (tailssubtype.has(`${tails_array[i4tails_array]} ${tails_array[j]}`)) {
              types_candidate = types_candidate.filter(t => t.issupertypeof(tailid2type_candidates.get(tails_array[j])![i4types_of_each_tail[i4tails_array]]));
            }
            else if (tailsequal.has(`${tails_array[j]} ${tails_array[i4tails_array]}`)) {
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
      if (cannot_resolve) continue;
      for (let i = 0; i < tails_array.length; i++) {
        resolved_types.set(tails_array[i], tailid2type_candidates.get(tails_array[i])![i4types_of_each_tail[i]]);
      }
      // Finally, resolve the types of non-heads and non-tails.
      for (let [head, type_of_head] of head_resolve) {
        let compatible_with_resolved_tails = true;
        for (let tail_info of node2tail.get(head)!) {
          if (resolved_types.has(tail_info.tail_id)) {
            if (tail_info.subtype) {
              if (!type_of_head.issupertypeof(resolved_types.get(tail_info.tail_id)!)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else if (tail_info.supertype) {
              if (!resolved_types.get(tail_info.tail_id)!.issupertypeof(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
            else {
              if (!resolved_types.get(tail_info.tail_id)!.same(type_of_head)) {
                compatible_with_resolved_tails = false;
                break;
              }
            }
          }
        }
        if (compatible_with_resolved_tails) {
          resolved_types.set(head, type_of_head);
          // const new_knowledge_about_tails = new Map<number, "subtype"|"supertype"|"equal">();
          // for (const tail_info of node2tail.get(head)!) {
          //   if (tail_info.subtype) new_knowledge_about_tails.set(tail_info.tail_id, "subtype");
          //   else if (tail_info.supertype) new_knowledge_about_tails.set(tail_info.tail_id, "supertype");
          //   else new_knowledge_about_tails.set(tail_info.tail_id, "equal");
          // }
          // dfs4resolve_from_heads_to_tails(head, new_knowledge_about_tails);
          resolve(head);
        }
        else {
          good_head_resolve = false;
          break;
        }
      }
      if (good_head_resolve) {
        this.resolved_types_collection.push(new Map(resolved_types));
      }
    }
  }

  verify() : void {
    for (const resolved_types of this.resolved_types_collection) {
      for (let [id, node] of this.dag_nodes) {
        assert(resolved_types.has(id), `TypeDominanceDAG: node ${id} is not resolved.`);
        for (let child of node.outs) {
          assert(resolved_types.get(child), `TypeDominanceDAG: node ${child} is not resolved.`)
          if (this.subtype.has(`${node.id} ${child}`)) {
            const subttypes = resolved_types.get(node.id)!.subtype();
            let typeofchild = resolved_types.get(child)!;
            let match = false;
            for (let subtype of subttypes) {
              if (typeofchild.same(subtype)) {
                match = true;
                break;
              }
            }
            assert(match,
              `TypeDominanceDAG: subtype constraint is not satisfied:
              ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}.
              Maybe you forget to add a subtype constraint in constraint.ts: TypeDominanceDAG: verify.`);
          }
          else if (this.supertype.has(`${node.id} ${child}`)) {
            const supertypes = resolved_types.get(node.id)!.supertype();
            let typeofchild = resolved_types.get(child)!;
            let match = false;
            for (let subtype of supertypes) {
              if (typeofchild.same(subtype)) {
                match = true;
                break;
              }
            }
            assert(match,
              `TypeDominanceDAG: supertype constraint is not satisfied:
              ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}.
              Maybe you forget to add a supertype constraint in constraint.ts: TypeDominanceDAG: verify.`);
          }
          else {
            assert(resolved_types.get(node.id)!.same(resolved_types.get(child)!),
              `TypeDominanceDAG: strong type constraint is not satisfied: ${node.id} of ${resolved_types.get(node.id)!.str()} --> ${child} of ${resolved_types.get(child)!.str()}`);
          }
        }
      }
    }
  }

  async draw() : Promise<void> {
    const heads = new Set<number>();
    const tails = new Set<number>();
    for (let [_, node] of this.dag_nodes) {
      if (node.inbound === 0) {
        heads.add(node.id);
      }
      if (node.outbound === 0) {
        tails.add(node.id);
      }
    }
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
          heads.has(node) ? 'red' : tails.has(node) ? 'green' : 'blue'
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
    for (let head of heads) {
      dfs(undefined, head, false, false);
    }
    const dot_lang = dot.toDot(G);
    await toFile(dot_lang, './constraint.svg', { format: 'svg' });
  }
}