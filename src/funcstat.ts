import { FunctionStateMutability } from "solc-typed-ast";
import { ConstraintNode } from "./constraintNode";

export abstract class FuncStat extends ConstraintNode<FunctionStateMutability> { }

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
  supers() : FuncStat[] {
    return [FuncStatProvider.pure(), FuncStatProvider.view(), FuncStatProvider.empty()];
  }
  same(t : FuncStat) : boolean {
    return t instanceof Pure;
  }
  copy() : FuncStat {
    throw new Error("Pure::copy() not implemented.");
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
  supers() : FuncStat[] {
    return [FuncStatProvider.view(), FuncStatProvider.empty()];
  }
  same(t : FuncStat) : boolean {
    return t instanceof View;
  }
  copy() : FuncStat {
    throw new Error("View::copy() not implemented.");
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
  supers() : FuncStat[] {
    return [FuncStatProvider.payable(), FuncStatProvider.empty()];
  }
  same(t : FuncStat) : boolean {
    return t instanceof Payable;
  }
  copy() : FuncStat {
    throw new Error("Payable::copy() not implemented.");
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
  supers() : FuncStat[] {
    return [FuncStatProvider.empty(), FuncStatProvider.payable()];
  }
  same(t : FuncStat) : boolean {
    return t instanceof Empty;
  }
  copy() : FuncStat {
    throw new Error("Empty::copy() not implemented.");
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