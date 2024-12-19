import { merge_set } from "./utility";

export abstract class ConstraintNode<T> {
  kind : T;
  typeName : string;
  constructor(kind : T) {
    this.kind = kind;
    this.typeName = this.constructor.name;
  }
  abstract str() : string;
  abstract subs() : ConstraintNode<T>[];
  abstract supers() : ConstraintNode<T>[];
  abstract copy() : ConstraintNode<T>;
  abstract same(t : ConstraintNode<T>) : boolean;
  sub_with_lowerbound(lower_bound : ConstraintNode<T>) : ConstraintNode<T>[] {
    return this.subs().filter(x => x.is_super_of(lower_bound));
  }
  super_with_upperbound(upper_bound : ConstraintNode<T>) : ConstraintNode<T>[] {
    return this.supers().filter(x => x.is_sub_of(upper_bound));
  }
  same_range() : ConstraintNode<T>[] {
    return [...merge_set(new Set(this.supers()), new Set(this.subs()))];
  }
  is_the_same_as(t : ConstraintNode<T>) : boolean {
    return this.same(t);
  }
  is_sub_of(t : ConstraintNode<T>) : boolean {
    return this.supers().some(g => g.same(t));
  }
  is_super_of(t : ConstraintNode<T>) : boolean {
    return this.subs().some(g => g.same(t));
  }
  equivalents() : ConstraintNode<T>[] {
    return this.subs().filter(t => this.supers().some(g => g.same(t)));
  }
  is_equivalent_of(t : ConstraintNode<T>) : boolean {
    return this.equivalents().some(g => g.same(t));
  }
}

export function includes<T>(arr : ConstraintNode<T>[], item : ConstraintNode<T>) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}

export function is_super_range<T>(set : ConstraintNode<T>[], subset : ConstraintNode<T>[]) : boolean {
  for (const element of subset) {
    if (!includes(set, element)) {
      return false;
    }
  }
  return true;
}

export function is_equal_range<T>(s1 : ConstraintNode<T>[], s2 : ConstraintNode<T>[]) : boolean {
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

export function intersection_range<T>(s1 : ConstraintNode<T>[], s2 : ConstraintNode<T>[]) : ConstraintNode<T>[] {
  const result : ConstraintNode<T>[] = [];
  for (const element of s1) {
    if (includes(s2, element)) {
      result.push(element);
    }
  }
  return result;
}
