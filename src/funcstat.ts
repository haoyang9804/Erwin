import { FunctionStateMutability } from "solc-typed-ast";
import { DominanceNode } from "./dominance";
import { assert } from "./utility";

export abstract class FuncStat extends DominanceNode<FunctionStateMutability> { }

class Pure extends FuncStat {
  constructor() {
    super(FunctionStateMutability.Pure);
  }
  str() : string {
    return "pure";
  }
  subs() : FuncStat[] {
    return [FuncStatProvider.pure()];
  }
  sub_with_lowerbound(lower_bound : FuncStat) : FuncStat[] {
    assert(lower_bound.kind === FunctionStateMutability.Pure);
    return [FuncStatProvider.pure()];
  }
  supers() : FuncStat[] {
    return [FuncStatProvider.pure(), FuncStatProvider.view(), FuncStatProvider.empty()];
  }
  super_with_upperbound(upper_bound : FuncStat) : FuncStat[] {
    if (upper_bound instanceof Pure) {
      return [FuncStatProvider.pure()];
    }
    else if (upper_bound instanceof View) {
      return [FuncStatProvider.pure(), FuncStatProvider.view()];
    }
    else if (upper_bound instanceof Empty) {
      return [FuncStatProvider.pure(), FuncStatProvider.view(), FuncStatProvider.empty()];
    }
    else {
      throw new Error(`Pure::super_with_upperbound: Impropoer upperbound type ${upper_bound.str()}`);
    }
  }
  same(t : FuncStat) : boolean {
    return t instanceof Pure;
  }
  copy() : FuncStat {
    throw new Error("Pure::copy() not implemented.");
  }
  issubof(t : FuncStat) : boolean {
    return t instanceof Pure || t instanceof View || t instanceof Empty;
  }
  issuperof(t : FuncStat) : boolean {
    return t instanceof Pure;
  }
}

class View extends FuncStat {
  constructor() {
    super(FunctionStateMutability.View);
  }
  str() : string {
    return "view";
  }
  subs() : FuncStat[] {
    return [FuncStatProvider.view(), FuncStatProvider.pure()];
  }
  sub_with_lowerbound(lower_bound : FuncStat) : FuncStat[] {
    if (lower_bound instanceof Pure) {
      return [FuncStatProvider.view(), FuncStatProvider.pure()];
    }
    else if (lower_bound instanceof View) {
      return [FuncStatProvider.view()];
    }
    else {
      throw new Error(`View::sub_with_lowerbound: Improper lowerbound type ${lower_bound.str()}`);
    }
  }
  supers() : FuncStat[] {
    return [FuncStatProvider.view(), FuncStatProvider.empty()];
  }
  super_with_upperbound(upper_bound : FuncStat) : FuncStat[] {
    if (upper_bound instanceof View) {
      return [FuncStatProvider.view()];
    }
    else if (upper_bound instanceof Empty) {
      return [FuncStatProvider.view(), FuncStatProvider.empty()];
    }
    else {
      throw new Error(`View::super_with_upperbound: Improper upperbound type ${upper_bound.str()}`);
    }
  }
  same(t : FuncStat) : boolean {
    return t instanceof View;
  }
  copy() : FuncStat {
    throw new Error("View::copy() not implemented.");
  }
  issubof(t : FuncStat) : boolean {
    return t instanceof View || t instanceof Empty;
  }
  issuperof(t : FuncStat) : boolean {
    return t instanceof View || t instanceof Pure;
  }
}

class Payable extends FuncStat {
  constructor() {
    super(FunctionStateMutability.Payable);
  }
  str() : string {
    return "payable";
  }
  subs() : FuncStat[] {
    return [FuncStatProvider.payable(), FuncStatProvider.empty()];
  }
  sub_with_lowerbound(lower_bound : FuncStat) : FuncStat[] {
    assert(lower_bound.kind === FunctionStateMutability.Payable || lower_bound.kind === FunctionStateMutability.NonPayable);
    return [FuncStatProvider.payable(), FuncStatProvider.empty()];
  }
  supers() : FuncStat[] {
    return [FuncStatProvider.payable(), FuncStatProvider.empty()];
  }
  super_with_upperbound(upper_bound : FuncStat) : FuncStat[] {
    assert(upper_bound.kind === FunctionStateMutability.Payable || upper_bound.kind === FunctionStateMutability.NonPayable);
    return [FuncStatProvider.payable(), FuncStatProvider.empty()];
  }
  same(t : FuncStat) : boolean {
    return t instanceof Payable;
  }
  copy() : FuncStat {
    throw new Error("Payable::copy() not implemented.");
  }
  issubof(t : FuncStat) : boolean {
    return t instanceof Payable || t instanceof Empty;
  }
  issuperof(t : FuncStat) : boolean {
    return t instanceof Payable;
  }
}

class Empty extends FuncStat {
  constructor() {
    super(FunctionStateMutability.NonPayable);
  }
  str() : string {
    return "empty";
  }
  subs() : FuncStat[] {
    return [FuncStatProvider.empty(), FuncStatProvider.payable(), FuncStatProvider.view(), FuncStatProvider.pure()];
  }
  sub_with_lowerbound(lower_bound : FuncStat) : FuncStat[] {
    if (lower_bound instanceof Pure) {
      return [FuncStatProvider.pure(), FuncStatProvider.view(), FuncStatProvider.empty()];
    }
    else if (lower_bound instanceof View) {
      return [FuncStatProvider.view(), FuncStatProvider.empty()];
    }
    else if (lower_bound instanceof Payable) {
      return [FuncStatProvider.payable(), FuncStatProvider.empty()];
    }
    else if (lower_bound instanceof Empty) {
      return [FuncStatProvider.empty()];
    }
    else {
      throw new Error(`Empty::sub_with_lowerbound: Improper lowerbound type ${lower_bound.str()}`);
    }
  }
  supers() : FuncStat[] {
    return [FuncStatProvider.empty(), FuncStatProvider.payable()];
  }
  super_with_upperbound(upper_bound : FuncStat) : FuncStat[] {
    if (upper_bound.kind === FunctionStateMutability.NonPayable || upper_bound.kind === FunctionStateMutability.Payable) {
      return [FuncStatProvider.empty(), FuncStatProvider.payable()];
    }
    else {
      throw new Error(`Empty::super_with_upperbound: Improper upperbound type ${upper_bound.str()}`);
    }
  }
  same(t : FuncStat) : boolean {
    return t instanceof Empty;
  }
  copy() : FuncStat {
    throw new Error("Empty::copy() not implemented.");
  }
  issubof(t : FuncStat) : boolean {
    return t instanceof Empty;
  }
  issuperof(t : FuncStat) : boolean {
    return t instanceof Empty || t instanceof Payable || t instanceof View || t instanceof Pure;
  }
}

export class FuncStatProvider {
  static pure() : Pure {
    return this.m_pure;
  }
  static view() : View {
    return this.m_view;
  }
  static payable() : Payable {
    return this.m_payable;
  }
  static empty() : Empty {
    return this.m_empty;
  }
  private static m_pure = new Pure();
  private static m_view = new View();
  private static m_payable = new Payable();
  private static m_empty = new Empty();
}