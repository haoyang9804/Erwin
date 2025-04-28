import { merge_set } from "./utility";

/**
 * Value is an abstract class that is used to instantiate placeholders
 * in the generated IR.
 *
 * Take the following code snippet as an example of the IR:
 * ```
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
  /**
   * @remarks Get the string representation of the Value.
   * @returns The string representation of the Value.
   */
  abstract str() : string;
  /**
   * @remarks Get the sub-Values of the Value.
   * @returns The sub-Values of the Value.
   */
  abstract subs() : Value<T>[];
  /**
   * @remarks Get the super-Values of the Value.
   * @returns The super-Values of the Value
  */
  abstract supers() : Value<T>[];
  /**
   * @remarks Create a copy of the Value.
   * @returns The copy of the Value.
  */
  abstract copy() : Value<T>;
  /**
   * @remarks Check if two Values are the same.
   * @param t The Value to compare with.
   * @returns Whether the two Values are the same.
   */
  abstract same(t : Value<T>) : boolean;
  /**
   * @remarks Check if two Values are exactly the same.
   * Sometimes, two Values are the same but not exactly the same.
   * For example, `StoragePointer` and `StorageRef` are the same
   * but not exactly the same. 
   * @param t The Value to compare with.
   * @returns Whether the two Values are exactly the same.
   */
  exactly_same(t : Value<T>) : boolean {
    return this.same(t) && t.same(this);
  }
  /**
   * @remarks Get the sub-Values of the Value with a lower bound.
   * @param lower_bound The lower bound of the sub-Values.
   * @returns The sub-Values of the Value with a lower bound.
   */
  sub_with_lowerbound(lower_bound : Value<T>) : Value<T>[] {
    return this.subs().filter(x => x.is_super_of(lower_bound));
  }
  /**
   * @remarks Get the super-Values of the Value with an upper bound.
   * @param upper_bound The upper bound of the super-Values.
   * @returns The super-Values of the Value with an upper bound.
   */
  super_with_upperbound(upper_bound : Value<T>) : Value<T>[] {
    return this.supers().filter(x => x.is_sub_of(upper_bound));
  }
  /**
   * @remarks Get the values that are in the same range as the Value.
   * The value `v` is in the same range as the Value `u` if and only if
   * `u` is a super-Value of `v` or `u` is a sub-Value of `v`.
   */
  same_range() : Value<T>[] {
    return [...merge_set(new Set(this.supers()), new Set(this.subs()))];
  }
  /**
   * @remarks Check if the Value is a sub-Value of another Value.
   * @param t The Value to compare with.
   * @returns Whether the Value is a sub-Value of the Value `t`.
   */
  is_sub_of(t : Value<T>) : boolean {
    return this.supers().some(g => g.same(t));
  }
  /**
   * @remarks Get the sub-Values of the Value that are in the same range.
   * @param t The Value to compare with.
   * @returns The sub-Values of the Value that are in the same range.
   */
  is_super_of(t : Value<T>) : boolean {
    return this.subs().some(g => g.same(t));
  }
  /**
   * @remarks Get the equivalents of the Value.
   * The equivalents of the Value `v` are the Values that are both the
   * sub-Values and the super-Values of `v`.
   * @returns The equivalents of the Value.
   */
  equivalents() : Value<T>[] {
    return this.subs().filter(t => this.supers().some(g => g.same(t)));
  }
  /**
   * @remarks Check if the Value is the equivalent of another Value.
   * @param t The Value to compare with.
   * @returns Whether the Value is the equivalent of the Value `t`.
   */
  is_equivalent_of(t : Value<T>) : boolean {
    return this.equivalents().some(g => g.same(t));
  }
}

/**
 * 
 * @param arr The array of Values.
 * @param item The Value to check.
 * @returns If the Value `item` is in the array `arr`.
 */
export function includes<T>(arr : Value<T>[], item : Value<T>) : boolean {
  for (const element of arr) {
    if (element.exactly_same(item)) {
      return true;
    }
  }
  return false;
}

/**
 * 
 * @param set The array of Values.
 * @param subset The array of Values to check.
 * @returns If the array `subset` is a subset of the array `set`.
 */
export function is_super_range<T>(set : Value<T>[], subset : Value<T>[]) : boolean {
  for (const element of subset) {
    if (!includes(set, element)) {
      return false;
    }
  }
  return true;
}

/**
 * 
 * @param s1 The array of Values.
 * @param s2 Another array of Values.
 * @returns If the two arrays are equal.
 */
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

/**
 * 
 * @param s1 The array of Values.
 * @param s2 Another array of Values.
 * @returns The intersection of the two arrays.
 */
export function intersection_range<T>(s1 : Value<T>[], s2 : Value<T>[]) : Value<T>[] {
  const result : Value<T>[] = [];
  for (const element of s1) {
    if (includes(s2, element)) {
      result.push(element);
    }
  }
  return [...new Set(result)];
}
