export class ConstaintNode {
  id: number;
  inbound: number;
  outbound: number;
  in: number;
  outs: number[];
  constructor(id: number) {
    this.id = id
    this.inbound = 0;
    this.outbound = 0;
    this.in = -1; // -1 means no innode
    this.outs = [];
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
  queue: PriorityQueueNode;
  name: string | undefined;
  dag_nodes: ConstaintNode[];

  constructor(name: string) {
    this.queue = new PriorityQueueNode();
    this.name = name;
    this.dag_nodes = [];
  }

  // init the DAG
  protected init() : void {
    // In connection, we only build up the relation from child nodes to parent nodes
    // We need first let parents know about their children
    for (let i = 0; i < this.dag_nodes.length; i++) {
      this.dag_nodes[this.dag_nodes[i].in].outbound++;
      this.dag_nodes[this.dag_nodes[i].in].outs.push(this.dag_nodes[i].id);
    }
    
    // push them into a priority_queue
    for (let i = 0; i < this.dag_nodes.length; i++) {
      this.queue.push(this.dag_nodes[i]);
    }
  }

  newNode(id: number) : ConstaintNode {
    return new ConstaintNode(id);
  }

  insert(node: ConstaintNode) : void {
    this.dag_nodes.push(node);
    assert(node.id === this.dag_nodes.length - 1, `DAG: node id ${node.id} is not equal its id ${this.dag_nodes.length - 1} in dag_nodes`)
  }

  /*
  Q: Why only update to's in but not from's out?
  A: Because the to's in may be updated later. This update influences
     from's out, resulting in low-efficiency.
     For instance, x += literal; This expression is an assignment (A) and x in it
     is an identifier (I) expression. The construction of I happens before the construction of A
     and it the type of both depend on the declaration of x (D).
     D first connects to A and finally to I. If the first connection updates the out of D,
     the second connection must first removes A from D's outs, which is redundant.

  The update of from's out will be conducted
  together in the init function.
  */
  connect(from: number, to: number) : void {
    this.dag_nodes[to].in = from;
  }

  /*
  lift the dependence flow of uses to their declarations
  Think about the following code snippet:

    declare x; // S1
    declare y; // S2
    x = y; // S3

  The dependence DAG is as follows:
  S1.x            S2.y
    |              |
   hard           hard
    |              |
    V              V
  S3.x --soft-->  S3.y

  The lift function is to lift the soft flow from S3.x to S3.y to a new soft flow from S1.x to S2.y.
  Without this lift, the resolve function does not know the underlying flow between S1.x and S2.y
  and may make a mistake by for instance, assigning uint256 to S1.x and string to S2.y. These two types
  finally flow into S3.x and S3.y. When the type of S3.x softly flows into S3.y, uint256 meets string
  and encounter a type mismatch.
  */
  lift(): void {
    
    for (let i = 0; i < this.dag_nodes.length; i++) {
      if (this.dag_nodes[i].inbound === 0) {
        this.queue.push(this.dag_nodes[i]);
      }
    }
  }

  // resolve one constraint
  abstract resolve() : void;
}


// The type dependence of the subsequent uses on the previous declacations
export class ForwardTypeDependenceDAG extends ForwardDependenceDAG {
  constructor() {
    super("ForwardTypeDependence");
  }

  resolve() : void {
    this.init();
    while (this.queue.size() > 0) {
      const node = this.queue.top();
      this.queue.pop();
      for (let i = 0; i < node.outs.length; i++) {
        const out = this.dag_nodes[node.outs[i]];
        out.inbound--;
        const out_irnode = irnodes[out.id];
        assert('type' in out_irnode, `TypeDAG: out_irnode ${out_irnode.id} does not have type`);
        const in_irnode = irnodes[node.id];
        assert('type' in in_irnode, `TypeDAG: in_irnode ${in_irnode.id} does not have type`);
        out_irnode.type = in_irnode.type;
      }
    }
  }
}