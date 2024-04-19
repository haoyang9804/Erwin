class node {
  inbound: number;
  outbound: number;
  ins: any[];
  outs: any[];
  constructor() {
    this.inbound = 0;
    this.outbound = 0;
    this.ins = [];
    this.outs = [];
  }
}

import { irnodes } from "./node.js";

export const dag_nodes: node[] = [];


import { PriorityQueue } from "./dataStructor.js";

class PriorityQueueNode extends PriorityQueue<node> {
  constructor() {
    super(
      function (a, b) {
         return a.inbound - b.inbound;
        }
      );
  }
}


// the directed acyclic graph to represent dependences in a constraint (e.g., type constraint)
abstract class DAG {
  queue: PriorityQueueNode;
  name: string | undefined;

  constructor(name: string) {
    this.queue = new PriorityQueueNode();
    this.name = name;
  }

  // init the DAG
  init() : void {
    for (let i = 0; i < nodes.length; i++) {
      this.queue.push(nodes[i]);
    }
  }

  // resolve one constraint
  abstract resolve() : void;
}

export class VarTypeDAG extends DAG {
  constructor() {
    super("Var:Type");
  }

}