export class ConstaintNode {
  id: number;
  inbound: number = 0;
  outbound: number = 0;
  ins: number[] = [];
  outs: number[] = [];
  depth: number = -1;
  conflict: boolean = false;
  resolved: boolean = false;
  constructor(id: number) {
    this.id = id;
  }
}

import { irnodes } from "./node";
import { assert } from "./utility";
import { PriorityQueue } from "./dataStructor";

// a set of IRNode ids that have backward constrants that cannot be constant
export const constantLock = new Set<number>();

class PriorityQueueNode extends PriorityQueue<ConstaintNode> {
  constructor() {
    super(
      function (a, b) {
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
abstract class ForwardDependenceDAG {
  // queue: PriorityQueueNode;
  name: string | undefined;
  dag_nodes: ConstaintNode[];

  constructor(name: string) {
    // this.queue = new PriorityQueueNode();
    this.name = name;
    this.dag_nodes = [];
  }

  // preprocess the DAG
  preprocess() : Set<number> {
    // get all decls (inbound = 0)
    const decls: number[] = [];
    for (let i = 0; i < this.dag_nodes.length; i++) {
      if (this.dag_nodes[i].inbound === 0) {
        decls.push(i);
      }
    }
    // nominal heads are constraint nodes that seems to be heads (constraint nodes that must be resolved first),
    // but actually are indirectly dominated by other real heads. (which is `heads` in the following)
    const nominal_heads = new Set<number>();
    // heads are constraint nodes that must be resolved first
    // The resolution of head nodes will trigger the resolution of other nodes
    const real_heads = new Set<number>();
    const head_map = new Map<number, number>();
    // recursive function to set the depth of each node in the DAG
    // head means the id of the constraint node for a decl
    // id means the id of the current Constraint Node
    let f = (head: number, id: number, depth: number) : void => {
      let stop = false;
      if (this.dag_nodes[id].depth == -1) {
        this.dag_nodes[id].depth = depth;
        head_map.set(id, head);
      }
      else if (this.dag_nodes[id].depth < depth) {
        this.dag_nodes[id].depth = depth;
        this.dag_nodes[id].conflict = true;
        assert(head_map.has(id), `DAG: head_map does not have id ${id} in ${this.name}`);
        nominal_heads.add(head_map.get(id) as number);
        head_map.set(id, head);
      }
      else {
        stop = true;
        this.dag_nodes[id].conflict = true;
        if (head_map.get(id) !== head) {
          nominal_heads.add(head as number);
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
      if (!nominal_heads.has(id)) {
        real_heads.add(id);
      }
    }

    // broadcast the conflict resolution to nominal heads
    let f2 = (id: number) : number => {
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
    for (let nominal_head of nominal_heads) {
      this.dag_nodes[nominal_head].depth = f2(nominal_head);
    }

    assert (real_heads.size > 0, `DAG: real_heads is empty in ${this.name}`)
    for (let node of this.dag_nodes) {
      assert (node.depth !== -1, `DAG: node ${node.id} does not have depth in ${this.name}`)
    }
    return real_heads;
  }

  newNode(id: number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node: ConstaintNode) : void {
    this.dag_nodes.push(node);
    assert(node.id === this.dag_nodes.length - 1, `DAG: node id ${node.id} is not equal its id ${this.dag_nodes.length - 1} in dag_nodes`)
  }

  connect(from: number, to: number, rank?: string) : void {
    this.dag_nodes[to].ins.push(from);
    this.dag_nodes[from].outs.push(to);
    this.dag_nodes[to].inbound++;
    this.dag_nodes[from].outbound++;
  }

  // resolve one constraint
  abstract resolve() : void;
}


type Pair = [number, number];

// The type dependence of the subsequent uses on the previous declacations
export class ForwardTypeDependenceDAG extends ForwardDependenceDAG {
  // a map records all weak type dependence from the first element to the second element
  weak: Set<Pair> = new Set();
  constructor() {
    super("ForwardTypeDependence");
  }

  connect(from: number, to: number, rank?: string) : void {
    this.dag_nodes[to].ins.push(from);
    this.dag_nodes[from].outs.push(to);
    this.dag_nodes[to].inbound++;
    this.dag_nodes[from].outbound++;
    if (rank === "weak") {
      this.weak.add([from, to]);
    }
  }

  resolve() : void {
    // const heads = this.preprocess();
    // for (let head of heads) {
    //   this.dfs(head);
    // }
  }
}