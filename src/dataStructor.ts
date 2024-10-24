import { config } from "./config";
import { assert, swap } from "./utility";
export class PriorityQueue<T> {
  heap : T[];
  compare : (a : T, b : T) => number;
  constructor(compare : (a : T, b : T) => number) {
    this.heap = [];
    this.compare = compare;
  }
  push(value : T) {
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

// Union-Find Data Structure
export class UFD<T> {
  private ancestor_map : Map<T, T>;
  private subtree_size_map : Map<T, number>;
  constructor() {
    this.ancestor_map = new Map<T, T>();
    this.subtree_size_map = new Map<T, number>();
  }
  insert(node : T) : void {
    this.ancestor_map.set(node, node);
    this.subtree_size_map.set(node, 1);
  }
  find_ancestor(node : T) : T {
    if (config.debug)
      assert(this.ancestor_map.has(node), "The id must be in the ancestor map.");
    const ancestor = this.ancestor_map.get(node)!;
    return ancestor === node ? node : this.find_ancestor(ancestor);
  }
  unite_the_first_into_the_second(node1 : T, node2 : T) : void {
    let ancestor1 = this.find_ancestor(node1);
    let ancestor2 = this.find_ancestor(node2);
    if (ancestor1 === ancestor2) return;
    this.ancestor_map.set(ancestor1, ancestor2);
    this.subtree_size_map.set(ancestor2, this.subtree_size_map.get(ancestor2)! + this.subtree_size_map.get(ancestor1)!);
  }
  unite(node1 : T, node2 : T) : void {
    let ancestor1 = this.find_ancestor(node1);
    let ancestor2 = this.find_ancestor(node2);
    if (ancestor1 === ancestor2) return;
    if (this.subtree_size_map.get(ancestor1)! < this.subtree_size_map.get(ancestor2)!) {
      [ancestor1, ancestor2] = swap(ancestor1, ancestor2);
    }
    this.ancestor_map.set(ancestor2, ancestor1);
    this.subtree_size_map.set(ancestor1, this.subtree_size_map.get(ancestor1)! + this.subtree_size_map.get(ancestor2)!);
  }
}

export class Tree<T> {
  private node_set : Set<T>;
  private parent_map : Map<T, T>;
  private children_map : Map<T, T[]>;
  private has_ins : Set<T>;
  private root : T | undefined;
  constructor() {
    this.parent_map = new Map<T, T>();
    this.children_map = new Map<T, T[]>();
    this.node_set = new Set<T>();
    this.has_ins = new Set<T>();
  }
  insert(parent : T, child : T) : void {
    if (this.children_map.has(parent)) {
      this.children_map.set(parent, this.children_map.get(parent)!.concat(child));
    }
    else {
      this.children_map.set(parent, [child]);
    }
    this.parent_map.set(child, parent);
    this.has_ins.add(child);
    this.node_set.add(parent);
  }
  get_children(parent : T) : T[] {
    return this.children_map.get(parent)!;
  }
  has_parent(child : T) : boolean {
    return this.parent_map.has(child);
  }
  get_parent(child : T) : T {
    if (config.debug)
      assert(this.parent_map.has(child), `The child must have a parent.`);
    return this.parent_map.get(child)!;
  }
  get_root() : T {
    if (this.root !== undefined) return this.root;
    if (config.debug) {
      let root_count = 0;
      for (let node of this.node_set) {
        if (!this.has_ins.has(node)) {
          root_count++;
        }
      }
      assert(root_count === 1, "There must be only one root.")
    }
    for (let node of this.node_set) {
      if (!this.has_ins.has(node)) {
        this.root = node;
        break;
      }
    }
    if (config.debug)
      assert(this.root !== undefined, "The root must be found.");
    return this.root!;
  }
}

export class LinkedListNode<T> {
  protected m_next : LinkedListNode<T> | undefined;
  protected m_pre : LinkedListNode<T> | undefined;
  protected m_value : T | undefined;
  constructor(value : T) {
    this.m_value = value;
  }
  pre() : LinkedListNode<T> | undefined {
    return this.m_pre;
  }
  next() : LinkedListNode<T> | undefined {
    return this.m_next;
  }
  set_next(next : LinkedListNode<T> | undefined) : void {
    this.m_next = next;
  }
  set_pre(pre : LinkedListNode<T> | undefined) : void {
    this.m_pre = pre;
  }
  update(value : T) : void {
    this.m_value = value;
  }
  value() : T {
    assert(this.m_value !== undefined, "The value must be set.");
    return this.m_value!;
  }
}