export class ConstaintNode {
  id : number;
  inbound : number = 0;
  outbound : number = 0;
  ins : number[] = [];
  outs : number[] = [];
  depth : number = -1;
  conflict : boolean = false;
  resolved : boolean = false;
  constructor(id : number) {
    this.id = id;
  }
}

import { irnodes } from "./node";
import { assert } from "./utility";
import { PriorityQueue } from "./dataStructor";
import { varID2Types, Type, ElementaryType } from "./type"
import { pickRandomElement, extendArrayofMap } from "./utility";

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

class PriorityQueueNode extends PriorityQueue<ConstaintNode> {
  constructor() {
    super(
      function(a, b) {
        return a.inbound - b.inbound;
      }
    );
  }
}


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
  dag_nodes : ConstaintNode[];
  // heads are constraint nodes that must be resolved first
  // The resolution of head nodes will trigger the resolution of other nodes
  real_heads = new Set<number>();
  // nominal heads are constraint nodes that seems to be heads (constraint nodes that must be resolved first),
  // but actually are indirectly dominated by other real heads. (which is `heads` in the following)
  nominal_heads = new Set<number>();
  // an array of map from node id to the resolved info
  head_resolved : Map<number, T>[] = [];

  constructor(name : string) {
    // this.queue = new PriorityQueueNode();
    this.name = name;
    this.dag_nodes = [];
  }

  get_heads() : void {
    // get all decls (inbound = 0)
    const decls : number[] = [];
    for (let i = 0; i < this.dag_nodes.length; i++) {
      if (this.dag_nodes[i].inbound === 0) {
        decls.push(i);
      }
    }
    const head_map = new Map<number, number>();
    // recursive function to set the depth of each node in the DAG
    // head means the id of the constraint node for a decl
    // id means the id of the current Constraint Node
    let f = (head : number, id : number, depth : number) : void => {
      let stop = false;
      if (this.dag_nodes[id].depth == -1) {
        this.dag_nodes[id].depth = depth;
        head_map.set(id, head);
      }
      else if (this.dag_nodes[id].depth < depth) {
        this.dag_nodes[id].depth = depth;
        this.dag_nodes[id].conflict = true;
        assert(head_map.has(id), `DAG: head_map does not have id ${id} in ${this.name}`);
        this.nominal_heads.add(head_map.get(id) as number);
        head_map.set(id, head);
      }
      else {
        stop = true;
        this.dag_nodes[id].conflict = true;
        if (head_map.get(id) !== head) {
          this.nominal_heads.add(head as number);
        }
      }
      if (stop) return;
      for (let i = 0; i < this.dag_nodes[id].outs.length; i++) {
        f(head, this.dag_nodes[id].outs[i], depth + 1);
      }
    }

    // initialize the depths of all nodes that are directly dominated by heads
    for (let i = 0; i < decls.length; i++) {
      this.dag_nodes[decls[i]].depth = 0;
      if (this.dag_nodes[decls[i]].outbound === 0) {
      }
      else {
        for (let j = 0; j < this.dag_nodes[decls[i]].outs.length; j++) {
          f(decls[i], this.dag_nodes[decls[i]].outs[j], 1);
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
      let depth = this.dag_nodes[id].depth;
      if (this.dag_nodes[id].conflict) {
        return depth;
      }
      for (let i = 0; i < this.dag_nodes[id].outs.length; i++) {
        depth = Math.max(-1 + f2(this.dag_nodes[id].outs[i]), depth);
      }
      this.dag_nodes[id].conflict = true;
      return depth;
    }
    for (let nominal_head of this.nominal_heads) {
      this.dag_nodes[nominal_head].depth = f2(nominal_head);
    }

    assert(this.real_heads.size > 0, `DAG: real_heads is empty in ${this.name}`)
    for (let node of this.dag_nodes) {
      assert(node.depth !== -1, `DAG: node ${node.id} does not have depth in ${this.name}`)
    }
  }

  newNode(id : number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node : ConstaintNode) : void {
    this.dag_nodes.push(node);
    assert(node.id === this.dag_nodes.length - 1, `DAG: node id ${node.id} is not equal its id ${this.dag_nodes.length - 1} in dag_nodes`)
  }

  connect(from : number, to : number, rank ?: string) : void {
    this.dag_nodes[to].ins.push(from);
    this.dag_nodes[from].outs.push(to);
    this.dag_nodes[to].inbound++;
    this.dag_nodes[from].outbound++;
  }

  abstract init_resolution(): void;

  // Resolve one constraint given some constraints have been resolved
  // For instance, given that the type of heads (nodes whose inbound == 0), the type of all nodes in the DAG will be resolved
  abstract resolve() : void;

  // Resolve the real_heads
  abstract resolve_heads() : Map<number, T>[];

  // Verify that all constraints have been successfully resolved
  // and all resolutions are consistent.
  abstract verify(): void;
}

// The type dependence of the subsequent uses on the previous declacations
export class ForwardTypeDependenceDAG extends ForwardDependenceDAG<Type> {
  // a map records all weak type dependence from the first element to the second element
  weak : Set<string> = new Set();
  // a map records all resolved types
  resolved_types : Map<number, Type> = new Map();

  // subtyping relation
  subtype_from : Map<string, Set<string>> = new Map([
    ["uint256 nonpayable", new Set(["uint256 nonpayable", "uint128 nonpayable", "uint64 nonpayable", "uint32 nonpayable", "uint16 nonpayable", "uint8 nonpayable"])],
    ["uint128 nonpayable", new Set(["uint128 nonpayable", "uint64 nonpayable", "uint32 nonpayable", "uint16 nonpayable", "uint8 nonpayable"])],
    ["uint64 nonpayable", new Set(["uint64 nonpayable", "uint32 nonpayable", "uint16 nonpayable", "uint8 nonpayable"])],
    ["uint32 nonpayable", new Set(["uint32 nonpayable", "uint16 nonpayable", "uint8 nonpayable"])],
    ["uint16 nonpayable", new Set(["uint16 nonpayable", "uint8 nonpayable"])],
    ["uint8 nonpayable", new Set(["uint8 nonpayable"])]
  ]);

  subtype_to : Map<string, Set<string>> = new Map([
    ["uint8 nonpayable", new Set(["uint8 nonpayable", "uint16 nonpayable", "uint32 nonpayable", "uint64 nonpayable", "uint128 nonpayable", "uint256 nonpayable"])],
    ["uint16 nonpayable", new Set(["uint16 nonpayable", "uint32 nonpayable", "uint64 nonpayable", "uint128 nonpayable", "uint256 nonpayable"])],
    ["uint32 nonpayable", new Set(["uint32 nonpayable", "uint64 nonpayable", "uint128 nonpayable", "uint256 nonpayable"])],
    ["uint64 nonpayable", new Set(["uint64 nonpayable", "uint128 nonpayable", "uint256 nonpayable"])],
    ["uint128 nonpayable", new Set(["uint128 nonpayable", "uint256 nonpayable"])],
    ["uint256 nonpayable", new Set(["uint256 nonpayable"])]
  ]);

  constructor() {
    super("ForwardTypeDependence");
  }

  connect(from : number, to : number, rank ?: string) : void {
    this.dag_nodes[to].ins.push(from);
    this.dag_nodes[from].outs.push(to);
    this.dag_nodes[to].inbound++;
    this.dag_nodes[from].outbound++;
    assert(rank === undefined || rank === "weak", `ForwardTypeDependenceDAG: rank ${rank} is not supported`)
    if (rank === "weak") {
      this.weak.add(`${from} ${to}`);
    }
  }

  // if a node is the child of node whose id is id, then resolve the type of the child node
  private resolve_weak(id : number, direction : "from" | "to") : Type {
    assert(this.resolved_types.has(id), `ForwardTypeDependenceDAG: node ${id} is not resolved`);
    if (direction === "from")
      assert(this.subtype_from.has(this.resolved_types.get(id)!.str()),
      `ForwardTypeDependenceDAG: type ${this.resolved_types.get(id)!.str()} is not in subtype_from`);
    else
      assert(this.subtype_to.has(this.resolved_types.get(id)!.str()),
      `ForwardTypeDependenceDAG: type ${this.resolved_types.get(id)!.str()} is not in subtype_to`);
    let available_types_str = direction === "from" ?
      this.subtype_from.get(this.resolved_types.get(id)!.str()) as Set<string>
        :
          this.subtype_to.get(this.resolved_types.get(id)!.str()) as Set<string>;
    assert(available_types_str !== undefined, `ForwardTypeDependenceDAG: available_types_str is undefined`);
    let available_types : Type[] = new Array();
    for (let type_str of available_types_str) {
      available_types.push(new ElementaryType().from_str(type_str));
    }
    assert(available_types.length > 0, `ForwardTypeDependenceDAG: node ${id} has no available types`)
    return pickRandomElement(available_types)!;
  }

  resolve() : void {
    // broadcast the type of a real head to its reachable descendants
    let depths : number[] = new Array(this.dag_nodes.length).fill(0x7f7f7f7f);
    let type_broadcast = (node : number, depth: number) : void => {
      assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG: node ${node} is not resolved`);
      if (depths[node] <= depth) return;
      depths[node] = depth;
      for (let i = 0; i < this.dag_nodes[node].outs.length; i++) {
        let next = this.dag_nodes[node].outs[i];
        if (this.weak.has(`${node} ${next}`)) {
          this.resolved_types.set(next, this.resolve_weak(node, "from"));
        }
        else {
          assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG: node ${node} is not resolved`);
          this.resolved_types.set(next, this.resolved_types.get(node) as Type);
        }
        this.dag_nodes[next].resolved = true;
        type_broadcast(next, depth + 1);
      }
    }
    for (let head of this.real_heads) {
      assert(this.dag_nodes[head].resolved, `ForwardTypeDependenceDAG: head ${head} is not resolved`);
      type_broadcast(head, 0);
    }
    // now back-broadcast from resolved nodes to their ancestors until all nominal heads are type-resolved
    const visited : boolean[] = new Array(this.dag_nodes.length).fill(false);
    let back_type_broadcast = (node : number) : void => {
      for (let i = 0; i < this.dag_nodes[node].ins.length; i++) {
        let prev = this.dag_nodes[node].ins[i];
        if (visited[prev]) continue;
        if (this.dag_nodes[prev].resolved) continue;
        if (this.weak.has(`${prev} ${node}`)) {
          this.resolved_types.set(prev, this.resolve_weak(node, "to"));
        }
        else {
          assert(this.resolved_types.has(node), `ForwardTypeDependenceDAG: node ${node} is not resolved`);
          this.resolved_types.set(prev, this.resolved_types.get(node) as Type);
        }
        this.dag_nodes[prev].resolved = true;
        back_type_broadcast(prev);
      }
    }
    for (let id = 0; id < this.dag_nodes.length; id++) {
      back_type_broadcast(id);
    }
    // verify that all dag_nodes have been type-resolved
    for (let node of this.dag_nodes) {
      assert(node.resolved, `ForwardTypeDependenceDAG: node ${node.id} is not resolved`);
    }
  }

  resolve_heads() : Map<number, Type>[] {
    let heads2type : Map<number, Type>[] = []
    for (let head of this.real_heads) {
      const heads2type_length = heads2type.length;
      heads2type = extendArrayofMap(heads2type, varID2Types.get(head)!.length);
      let cnt = 1;
      for (let type of varID2Types.get(head)!) {
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

  init_resolution(): void {
    for (let node of this.dag_nodes) {
      node.resolved = false;
    }
    this.weak.clear();
    this.resolved_types.clear();
  }

  verify(): void {
    for (let node of this.dag_nodes) {
      assert(node.resolved, `ForwardTypeDependenceDAG: node ${node.id} is not resolved`);
      for (let child of node.outs) {
        if (this.weak.has(`${node.id} ${child}`)) {
          assert(this.subtype_from.get(this.resolved_types.get(child)!.str())!.has(this.resolved_types.get(child)!.str()),
          `ForwardTypeDependenceDAG: weak type dependence is not satisfied: ${node.id} of ${this.resolved_types.get(child)!.str()} --> ${child} of ${this.resolved_types.get(child)!.str()}`);
        }
        else {
          assert(this.resolved_types.get(node.id)!.str() === this.resolved_types.get(child)!.str(),
          `ForwardTypeDependenceDAG: weak type dependence is not satisfied: ${node.id} of ${this.resolved_types.get(child)!.str()} --> ${child} of ${this.resolved_types.get(child)!.str()}`);
        }
      }
    }
  }

}