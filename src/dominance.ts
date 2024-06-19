export abstract class DominanceNode<T> {
  kind : T;
  constructor(kind : T) {
    this.kind = kind;
  }
  abstract str() : string;
  abstract subs() : DominanceNode<T>[];
  abstract sub_with_lowerbound(lower_bound : DominanceNode<T>) : DominanceNode<T>[];
  abstract supers() : DominanceNode<T>[];
  abstract super_with_upperbound(upper_bound : DominanceNode<T>) : DominanceNode<T>[];
  abstract same(t : DominanceNode<T>) : boolean;
  abstract copy() : DominanceNode<T>;
  abstract issubof(t : DominanceNode<T>) : boolean;
  abstract issuperof(t : DominanceNode<T>) : boolean;
}

export function includes<T>(arr : DominanceNode<T>[], item : DominanceNode<T>) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}


export function isSuperSet<T>(set : DominanceNode<T>[], subset : DominanceNode<T>[]) : boolean {
  for (const element of subset) {
    if (!includes(set, element)) {
      return false;
    }
  }
  return true;
}

export function isEqualSet<T>(s1 : DominanceNode<T>[], s2 : DominanceNode<T>[]) : boolean {
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