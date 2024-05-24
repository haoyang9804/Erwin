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

import { assert } from "./utility";
import { irnode2types, Type } from "./type"
import { pickRandomElement, extendArrayofMap } from "./utility";
import * as dot from 'ts-graphviz';
// debug
import { color } from 'console-log-colors';
import { toFile } from "@ts-graphviz/adapter";
import { debug } from "./index";

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

// class PriorityQueueNode extends PriorityQueue<ConstaintNode> {
//   constructor() {
//     super(
//       function(a, b) {
//         return a.inbound - b.inbound;
//       }
//     );
//   }
// }


/*
The directed acyclic graph to represent dependences in a constraint (e.g., type constraint).

Take the following code snippet as example to explain the forward dependence:
```Solidity
uint256 x = 1; // S1
x += 1; // S2
```
Type of S2.x dependes on the type of S1.x. We build the following dependence DAG to represent the forward dependence:
S1.x -> S2.x
This DAG means the type of S1.x will flow into S2.x as its type.
In the implementation, the flow is classfied into two types: hard and soft.
Hard flow means the info of S1.x will be directly copied to S2.x.
Soft flow means the info of S1.x will be copied to S2.x after some tweak (e.g., allowable type conversion, etc.).
*/
abstract class ForwardDependenceDAG<T> {
  // queue: PriorityQueueNode;
  name : string | undefined;
  dag_nodes : Map<number, ConstaintNode>;
  // this.head_map records the head of each node in the DAG
  head_map = new Map<number, number>();
  // heads are constraint nodes that must be resolved first
  // The resolution of head nodes will trigger the resolution of other nodes
  real_heads = new Set<number>();
  // nominal heads are constraint nodes that seems to be heads (constraint nodes that must be resolved first),
  // but actually are indirectly dominated by other real heads. (which is `heads` in the following)
  nominal_heads = new Set<number>();
  // an array of map from node id to the resolved info
  head_resolved : Map<number, T>[] = [];
  // multiple_dominance records all pairs of (node1, node2) where there are more than one path from node1 to node2
  multiple_dominance : Set<string> = new Set();

  constructor(name : string) {
    // this.queue = new PriorityQueueNode();
    this.name = name;
    this.dag_nodes = new Map<number, ConstaintNode>();
  }

  get_heads() : void {
    // get all decls (inbound = 0)
    const decls : number[] = [];
    for (let [i, node] of this.dag_nodes) {
      if (node.inbound === 0) {
        decls.push(i);
        this.head_map.set(i, i);
      }
    }
    // Recursive function to set the depth of each node in the DAG
    // head means the id of the constraint node for a decl
    // id means the id of the current Constraint Node
    let f = (head : number, id : number, depth : number) : void => {
      let stop = false;
      if (this.dag_nodes.get(id)!.depth == -1) {
        this.dag_nodes.get(id)!.depth = depth;
        this.head_map.set(id, head);
      }
      else if (this.dag_nodes.get(id)!.depth < depth) {
        this.dag_nodes.get(id)!.depth = depth;
        this.dag_nodes.get(id)!.conflict = true;
        assert(this.head_map.has(id), `DAG: this.head_map does not have id ${id} in ${this.name}`);
        if (this.head_map.get(id) !== head) {
          this.nominal_heads.add(this.head_map.get(id) as number);
          this.head_map.set(id, head);
        }
        else {
          this.multiple_dominance.add(`${head} ${id}`);
        }
      }
      else {
        stop = true;
        this.dag_nodes.get(id)!.conflict = true;
        if (this.head_map.get(id) !== head) {
          this.nominal_heads.add(head as number);
        }
        else {
          this.multiple_dominance.add(`${head} ${id}`);
        }
      }
      if (stop) return;
      for (let i = 0; i < this.dag_nodes.get(id)!.outs.length; i++) {
        f(head, this.dag_nodes.get(id)!.outs[i], depth + 1);
      }
    }

    // initialize the depths of all nodes that are directly dominated by heads
    for (let i = 0; i < decls.length; i++) {
      this.dag_nodes.get(decls[i])!.depth = 0;
      if (this.dag_nodes.get(decls[i])!.outbound === 0) {
      }
      else {
        for (let j = 0; j < this.dag_nodes.get(decls[i])!.outs.length; j++) {
          f(decls[i], this.dag_nodes.get(decls[i])!.outs[j], 1);
        }
      }
    }

    for (let id of decls) {
      if (!this.nominal_heads.has(id)) {
        this.real_heads.add(id);
      }
    }

    // broadcast the conflict resolution to nominal heads
    let f2 = (id : number) : number => {
      let depth = this.dag_nodes.get(id)!.depth;
      if (this.dag_nodes.get(id)!.conflict) {
        return depth;
      }
      for (let i = 0; i < this.dag_nodes.get(id)!.outs.length; i++) {
        depth = Math.max(-1 + f2(this.dag_nodes.get(id)!.outs[i]), depth);
      }
      this.dag_nodes.get(id)!.conflict = true;
      return depth;
    }
    for (let nominal_head of this.nominal_heads) {
      this.dag_nodes.get(nominal_head)!.depth = f2(nominal_head);
    }

    assert(this.real_heads.size > 0, `DAG: real_heads is empty in ${this.name}`)
    for (let [_, node] of this.dag_nodes) {
      assert(node.depth !== -1, `DAG: node ${node.id} does not have depth in ${this.name}`)
    }
    for (let [_, node] of this.dag_nodes) {
      if (debug) {
        console.log(color.blue(`constraint node: id = ${node.id}, inbound = ${node.inbound}, outbound = ${node.outbound}, head = ${this.head_map.get(node.id)}`))
      }
    }
  }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node : ConstaintNode) : void {
    this.dag_nodes.set(node.id, node);
    if (debug)
      console.log(color.green(`node.id = ${node.id}, this.dag_nodes.length = ${this.dag_nodes.size}`))
  }

  connect(from : number, to : number, rank ?: string) : void {
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
  }

  // Draw a graphviz graph
  // Must be called after calling get_heads
  abstract draw() : void;

  abstract init_resolution() : void;

  // Resolve one constraint given some constraints have been resolved
  // For instance, given that the type of heads (nodes whose inbound == 0), the type of all nodes in the DAG will be resolved
  abstract resolve() : void;

  // Resolve the real_heads
  abstract resolve_heads() : Map<number, T>[];

  // Verify that all constraints have been successfully resolved
  // and all resolutions are consistent.
  abstract verify() : void;
}

// The type dependence of the subsequent uses on the previous declacations
export class ForwardTypeDependenceDAG extends ForwardDependenceDAG<Type> {
  // a map records all weak type dependence from the first element to the second element
  weak : Set<string> = new Set();
  reverse : Set<string> = new Set();
  // a map records all resolved types
  resolved_types : Map<number, Type> = new Map();

  constructor() {
    super("ForwardTypeDependence");
  }

  /*
  1. If node1 weakly dominates node2 in type, then the type of node2 is a subtype of the type of node1.
  2. If node1 weakly and reversely dominates node2 in type, then the type of node2 is a supertype of the type of node1.
  */
  connect(from : number, to : number, rank ?: string) : void {
    assert(this.dag_nodes.get(from)! !== undefined, `ForwardTypeDependenceDAG::connect: node ${from} is not in the DAG`)
    assert(this.dag_nodes.get(to)! !== undefined, `ForwardTypeDependenceDAG::connect: node ${to} is not in the DAG`)
    this.dag_nodes.get(to)!.ins.push(from);
    this.dag_nodes.get(from)!.outs.push(to);
    this.dag_nodes.get(to)!.inbound++;
    this.dag_nodes.get(from)!.outbound++;
    assert(rank === undefined || rank === "weak" || rank === "weak && reverse" || rank === "reverse", `ForwardTypeDependenceDAG: rank ${rank} is not supported`)
    if (rank === "weak" || rank === "weak && reverse") {
      this.weak.add(`${from} ${to}`);
    }
    // haoyang
    if (rank === "weak && reverse" || rank === "reverse") {
      this.reverse.add(`${from} ${to}`);
    }
  }

  // if a node is the child of node whose id is id, then resolve the type of the child node
  private resolve_weak(id : number, direction : "from" | "to") : Type {
    assert(this.resolved_types.has(id), `ForwardTypeDependenceDAG::resolve_weak: node ${id} is not resolved`);
    let available_types = direction === "from" ?
      this.resolved_types.get(id)!.subtype()
      :
      this.resolved_types.get(id)!.supertype();
    assert(available_types.length > 0, `ForwardTypeDependenceDAG::resolve_weak: node ${id} has no available types`)
    return pickRandomElement(available_types)!;
  }

  resolve() : void {
    // broadcast the type of a real head to its reachable descendants
    let type_broadcast = (node : number, depth : number) : void => {
      assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG::resolve_0: node ${node} is not resolved`);
      for (let i = 0; i < this.dag_nodes.get(node)!.outs.length; i++) {
        let next = this.dag_nodes.get(node)!.outs[i];
        if (depth + 1 !== this.dag_nodes.get(next)!.depth) {
          assert(depth + 1 < this.dag_nodes.get(next)!.depth, `ForwardTypeDependenceDAG::resolve: depth ${depth + 1} is not less than ${this.dag_nodes.get(next)!.depth}`)
          continue;
        }
        if (this.weak.has(`${node} ${next}`)) {
          if (this.reverse.has(`${node} ${next}`)) {
            this.resolved_types.set(next, this.resolve_weak(node, "to"));
          }
          else {
            this.resolved_types.set(next, this.resolve_weak(node, "from"));
          }
        }
        else {
          assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG::resolve_1: node ${node} is not resolved`);
          this.resolved_types.set(next, this.resolved_types.get(node) as Type);
        }
        this.dag_nodes.get(next)!.resolved = true;
        type_broadcast(next, depth + 1);
      }
    }
    for (let head of this.real_heads) {
      assert(this.dag_nodes.get(head)!.resolved, `ForwardTypeDependenceDAG::resolve_2: head ${head} is not resolved`);
      type_broadcast(head, 0);
    }
    // now back-broadcast from resolved nodes to their ancestors until all nominal heads are type-resolved
    let back_type_broadcast = (node : number) : void => {
      for (let i = 0; i < this.dag_nodes.get(node)!.ins.length; i++) {
        let prev = this.dag_nodes.get(node)!.ins[i];
        if (this.dag_nodes.get(prev)!.resolved) continue;
        if (this.weak.has(`${prev} ${node}`)) {
          if (this.reverse.has(`${prev} ${node}`)) {
            this.resolved_types.set(prev, this.resolve_weak(node, "from"));
          }
          else {
            this.resolved_types.set(prev, this.resolve_weak(node, "to"));
          }
        }
        else {
          assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG::resolve_3: node ${node} is not resolved`);
          this.resolved_types.set(prev, this.resolved_types.get(node) as Type);
        }
        this.dag_nodes.get(prev)!.resolved = true;
        back_type_broadcast(prev);
      }
    }
    for (let [id, _] of this.dag_nodes) {
      back_type_broadcast(id);
    }
    /*
      Consider this example:
      0
      |
      |
      v
      1 <-- 3 --> 4

      0 is the head and 3 is the nominal head.
      0 is resolved first in function resolve_heads.
      1 is resolved later by type_broadcast.
      3 is then resolved by back_type_broadcast.
      However, 4 is not resolved.
      So, after resolving nominal heads, we need to check if there exists
      any nodes whose head in the head_map is nominal_head.
      If yes, resolve them.
    */
    let resolve_remaining = (nominal_head : number, cur_node : number) : void => {
      assert(this.nominal_heads.has(nominal_head), `resolve_remaining: the nominal_head ${nominal_head} is not in nominal_heads`);
      assert(this.resolved_types.has(cur_node), `resolve_remaining: ${cur_node} is not type-resolved`);
      for (let i = 0; i < this.dag_nodes.get(cur_node)!.outs.length; i++) {
        if (this.head_map.get(cur_node) !== nominal_head) continue;
        let next = this.dag_nodes.get(cur_node)!.outs[i];
        if (this.weak.has(`${cur_node} ${next}`)) {
          if (this.reverse.has(`${cur_node} ${next}`)) {
            this.resolved_types.set(next, this.resolve_weak(cur_node, "to"));
          }
          else {
            this.resolved_types.set(next, this.resolve_weak(cur_node, "from"));
          }
        }
        else {
          assert(this.resolved_types.has(cur_node), `resolve_remaining: the cur_node ${cur_node} is not type-resolved`);
          this.resolved_types.set(next, this.resolved_types.get(cur_node) as Type);
        }
        this.dag_nodes.get(next)!.resolved = true;
        resolve_remaining(nominal_head, next);
      }
    };
    for (let nominal_head of this.nominal_heads) {
      resolve_remaining(nominal_head, nominal_head);
    }
    // verify that all dag_nodes have been type-resolved
    for (let [_, node] of this.dag_nodes) {
      assert(node.resolved, `ForwardTypeDependenceDAG::resolve_4: node ${node.id} is not resolved`);
    }
  }

  resolve_heads() : Map<number, Type>[] {
    let heads2type : Map<number, Type>[] = []
    for (let head of this.real_heads) {
      const heads2type_length = heads2type.length;
      assert(irnode2types.has(head), `ForwardTypeDependenceDAG::resolve_head: head ${head} is not in irnode2types`);
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
    return heads2type;
  }

  init_resolution() : void {
    for (let [_, node] of this.dag_nodes) {
      node.resolved = false;
    }
    this.resolved_types.clear();
  }

  verify() : void {
    for (let [_, node] of this.dag_nodes) {
      assert(node.resolved, `ForwardTypeDependenceDAG: node ${node.id} is not resolved`);
      for (let child of node.outs) {
        assert(this.resolved_types.get(child))
        if (this.weak.has(`${node.id} ${child}`)) {
          const subttypes = this.resolved_types.get(child)!.subtype();
          let typeofchild = this.resolved_types.get(child)!;
          let match = false;
          for (let subtype of subttypes) {
            if (subtype.kind !== typeofchild.kind) continue;
            if (typeofchild.same(subtype)) {
              match = true;
              break;
            }
          }
          assert(match,
            `ForwardTypeDependenceDAG: weak type constraint is not satisfied:
            ${node.id} of ${this.resolved_types.get(node.id)!.str()} --> ${child} of ${this.resolved_types.get(child)!.str()}.
            Maybe you forget to add a weak type constraint in constraint.ts: ForwardTypeDependenceDAG: verify.`);
        }
        else {
          assert(this.resolved_types.get(node.id)!.str() === this.resolved_types.get(child)!.str(),
            `ForwardTypeDependenceDAG: strong type constraint is not satisfied: ${node.id} of ${this.resolved_types.get(node.id)!.str()} --> ${child} of ${this.resolved_types.get(child)!.str()}`);
        }
      }
    }
  }

  async draw() : Promise<void> {
    if (this.real_heads.size === 0) {
      this.get_heads();
    }
    const G = new dot.Digraph();
    const visited : Map<number, dot.Node> = new Map<number, dot.Node>();
    let dfs = (pre_gnode : dot.Node | undefined, node : number, weak : boolean, reverse : boolean) : void => {
      if (visited.has(node)) {
        if (pre_gnode !== undefined) {
          if (weak && reverse) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'weak && reverse' });
            G.addEdge(edge);
          }
          else if (weak) {
            const edge = new dot.Edge([pre_gnode, visited.get(node)!], { [dot.attribute.label]: 'weak' });
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
          this.real_heads.has(node) ? 'red' : this.nominal_heads.has(node) ? 'pink' : 'blue'
      });
      visited.set(node, gnode);
      if (pre_gnode !== undefined) {
        if (weak) {
          const edge = new dot.Edge([pre_gnode, gnode], { [dot.attribute.label]: 'weak' });
          G.addEdge(edge);
        }
        else {
          const edge = new dot.Edge([pre_gnode, visited.get(node)!]);
          G.addEdge(edge);
        }
      }
      G.addNode(gnode);
      for (let child of this.dag_nodes.get(node)!.outs) {
        dfs(gnode, child, this.weak.has(`${node} ${child}`), this.reverse.has(`${node} ${child}`));
      }
    }
    for (let head of this.real_heads) {
      dfs(undefined, head, false, false);
    }
    for (let nominal_head of this.nominal_heads) {
      dfs(undefined, nominal_head, false, false);
    }
    const dot_lang = dot.toDot(G);
    await toFile(dot_lang, './constraint.svg', { format: 'svg' });
  }
}