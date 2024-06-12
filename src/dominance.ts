export abstract class DominanceNode<T> {
  kind : T;
  constructor(kind : T) {
    this.kind = kind;
  }
  abstract str() : string;
  abstract subtype() : DominanceNode<T>[];
  abstract sub_with_lowerbound(lower_bound : DominanceNode<T>) : DominanceNode<T>[];
  abstract supertype() : DominanceNode<T>[];
  abstract super_with_upperbound(upper_bound : DominanceNode<T>) : DominanceNode<T>[];
  abstract same(t : DominanceNode<T>) : boolean;
  abstract copy() : DominanceNode<T>;
  abstract issubof(t : DominanceNode<T>) : boolean;
  abstract issuperof(t : DominanceNode<T>) : boolean;
}