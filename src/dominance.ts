export abstract class DominanceNode<T> {
  kind : T;
  typeName : string;
  constructor(kind : T) {
    this.kind = kind;
    this.typeName = this.constructor.name;
  }
  abstract str() : string;
  abstract subs() : DominanceNode<T>[];
  sub_with_lowerbound(lower_bound : DominanceNode<T>) : DominanceNode<T>[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  abstract supers() : DominanceNode<T>[];
  super_with_upperbound(upper_bound : DominanceNode<T>) : DominanceNode<T>[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  abstract same(t : DominanceNode<T>) : boolean;
  abstract copy() : DominanceNode<T>;
  abstract issubof(t : DominanceNode<T>) : boolean;
  abstract issuperof(t : DominanceNode<T>) : boolean;
  equivalents() : DominanceNode<T>[] {
    return this.subs().filter(t => this.supers().some(g => g.same(t)));
  }
  equal(t : DominanceNode<T>) : boolean {
    return this.equivalents().some(g => g.same(t));
  }
}

export function includes<T>(arr : DominanceNode<T>[], item : DominanceNode<T>) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}

export function is_super_range<T>(set : DominanceNode<T>[], subset : DominanceNode<T>[]) : boolean {
  for (const element of subset) {
    if (!includes(set, element)) {
      return false;
    }
  }
  return true;
}

export function is_equal_range<T>(s1 : DominanceNode<T>[], s2 : DominanceNode<T>[]) : boolean {
  if (s1.length !== s2.length) {
    return false;
  }
  for (let i = 0; i < s1.length; i++) {
    if (!s1[i].same(s2[i])) {
      return false;
    }
  }
  return true;
}

export function intersection_range<T>(s1 : DominanceNode<T>[], s2 : DominanceNode<T>[]) : DominanceNode<T>[] {
  const result : DominanceNode<T>[] = [];
  for (const element of s1) {
    if (includes(s2, element)) {
      result.push(element);
    }
  }
  return result;
}