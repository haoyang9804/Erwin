import { merge_set } from "./utility";

/**
 * Value is an abstract class that is used to instantiate placeholders
 * in the generated IR.
 * 
 * Take the following code snippet as an example of the IR:
 * ```solidity
 * mapping(T1 => T2) M V m;
 * ```
 * In which `T1`, `T2`, `M` and `V` are all placeholders.
 * In the solving process, the solver will replace these placeholders
 * with actual values, which are type, type, storage location and
 * visibility respectively.
 * 
 * @template T The type of the kind of the Value.
 * @param kind The kind of the Value.
 */
export abstract class Value<T> {
  kind : T;
  typeName : string;
  constructor(kind : T) {
    this.kind = kind;
    this.typeName = this.constructor.name;
  }
  abstract str() : string;
  abstract subs() : Value<T>[];
  abstract supers() : Value<T>[];
  abstract copy() : Value<T>;
  abstract same(t : Value<T>) : boolean;
  sub_with_lowerbound(lower_bound : Value<T>) : Value<T>[] {
    return this.subs().filter(x => x.is_super_of(lower_bound));
  }
  super_with_upperbound(upper_bound : Value<T>) : Value<T>[] {
    return this.supers().filter(x => x.is_sub_of(upper_bound));
  }
  same_range() : Value<T>[] {
    return [...merge_set(new Set(this.supers()), new Set(this.subs()))];
  }
  is_the_same_as(t : Value<T>) : boolean {
    return this.same(t);
  }
  is_sub_of(t : Value<T>) : boolean {
    return this.supers().some(g => g.same(t));
  }
  is_super_of(t : Value<T>) : boolean {
    return this.subs().some(g => g.same(t));
  }
  equivalents() : Value<T>[] {
    return this.subs().filter(t => this.supers().some(g => g.same(t)));
  }
  is_equivalent_of(t : Value<T>) : boolean {
    return this.equivalents().some(g => g.same(t));
  }
}

export function includes<T>(arr : Value<T>[], item : Value<T>) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}

export function is_super_range<T>(set : Value<T>[], subset : Value<T>[]) : boolean {
  for (const element of subset) {
    if (!includes(set, element)) {
      return false;
    }
  }
  return true;
}

export function is_equal_range<T>(s1 : Value<T>[], s2 : Value<T>[]) : boolean {
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

export function intersection_range<T>(s1 : Value<T>[], s2 : Value<T>[]) : Value<T>[] {
  const result : Value<T>[] = [];
  for (const element of s1) {
    if (includes(s2, element)) {
      result.push(element);
    }
  }
  return result;
}