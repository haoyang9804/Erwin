export class PriorityQueue<T> {
  heap: T[];
  compare: (a: T, b: T) => number;
  constructor(compare: (a: T, b: T) => number) {
    this.heap = [];
    this.compare = compare;
  }
  push(value: T) {
    this.heap.push(value);
    this.heap.sort(this.compare);
  }
  pop() {
    return this.heap.shift();
  }
  top() {
    return this.heap[0];
  }
  size() {
    return this.heap.length;
  }
}