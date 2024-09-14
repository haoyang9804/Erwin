import { FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { DominanceNode } from "./dominance";

//! Visibility does not have super/sub relations

export abstract class FuncVis extends DominanceNode<FunctionVisibility> { }

export class FuncInternal extends FuncVis {
  constructor() {
    super(FunctionVisibility.Internal);
  }
  str() : string {
    return "internal";
  }
  subs() : FuncVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : FuncVis) : FuncVis[] {
    return [];
  }
  supers() : FuncVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : FuncVis) : FuncVis[] {
    return [];
  }
  same(t : FuncVis) : boolean {
    return t instanceof FuncInternal;
  }
  copy() : FuncVis {
    return new FuncInternal();
  }
  issubof(t : FuncVis) : boolean {
    return false;
  }
  issuperof(t : FuncVis) : boolean {
    return false;
  }
}

export class FuncExternal extends FuncVis {
  constructor() {
    super(FunctionVisibility.External);
  }
  str() : string {
    return "external";
  }
  subs() : FuncVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : FuncVis) : FuncVis[] {
    return [];
  }
  supers() : FuncVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : FuncVis) : FuncVis[] {
    return [];
  }
  same(t : FuncVis) : boolean {
    return t instanceof FuncExternal;
  }
  copy() : FuncVis {
    return new FuncExternal();
  }
  issubof(t : FuncVis) : boolean {
    return false;
  }
  issuperof(t : FuncVis) : boolean {
    return false;
  }
}

export class FuncPublic extends FuncVis {
  constructor() {
    super(FunctionVisibility.Public);
  }
  str() : string {
    return "public";
  }
  subs() : FuncVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : FuncVis) : FuncVis[] {
    return [];
  }
  supers() : FuncVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : FuncVis) : FuncVis[] {
    return [];
  }
  same(t : FuncVis) : boolean {
    return t instanceof FuncPublic;
  }
  copy() : FuncVis {
    return new FuncPublic();
  }
  issubof(t : FuncVis) : boolean {
    return false;
  }
  issuperof(t : FuncVis) : boolean {
    return false;
  }
}

export class FuncPrivate extends FuncVis {
  constructor() {
    super(FunctionVisibility.Private);
  }
  str() : string {
    return "private";
  }
  subs() : FuncVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : FuncVis) : FuncVis[] {
    return [];
  }
  supers() : FuncVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : FuncVis) : FuncVis[] {
    return [];
  }
  same(t : FuncVis) : boolean {
    return t instanceof FuncPrivate;
  }
  copy() : FuncVis {
    return new FuncPrivate();
  }
  issubof(t : FuncVis) : boolean {
    return false;
  }
  issuperof(t : FuncVis) : boolean {
    return false;
  }
}

export class FuncDefault extends FuncVis {
  constructor() {
    super(FunctionVisibility.Default);
  }
  str() : string {
    return "default";
  }
  subs() : FuncVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : FuncVis) : FuncVis[] {
    return [];
  }
  supers() : FuncVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : FuncVis) : FuncVis[] {
    return [];
  }
  same(t : FuncVis) : boolean {
    return t instanceof FuncDefault;
  }
  copy() : FuncVis {
    return new FuncDefault();
  }
  issubof(t : FuncVis) : boolean {
    return false;
  }
  issuperof(t : FuncVis) : boolean {
    return false;
  }
}

export class FuncVisProvider {
  private static m_internal = new FuncInternal();
  private static m_external = new FuncExternal();
  private static m_public = new FuncPublic();
  private static m_private = new FuncPrivate();

  public static internal() : FuncInternal {
    return this.m_internal;
  }

  public static external() : FuncExternal {
    return this.m_external;
  }

  public static public() : FuncPublic {
    return this.m_public;
  }

  public static private() : FuncPrivate {
    return this.m_private;
  }
}

export abstract class VarVis extends DominanceNode<StateVariableVisibility> { }

export class VarInternal extends VarVis {
  constructor() {
    super(StateVariableVisibility.Internal);
  }
  str() : string {
    return "internal";
  }
  subs() : VarVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : VarVis) : VarVis[] {
    return [];
  }
  supers() : VarVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : VarVis) : VarVis[] {
    return [];
  }
  same(t : VarVis) : boolean {
    return t instanceof VarInternal;
  }
  copy() : VarVis {
    return new VarInternal();
  }
  issubof(t : VarVis) : boolean {
    return false;
  }
  issuperof(t : VarVis) : boolean {
    return false;
  }
}

export class VarPublic extends VarVis {
  constructor() {
    super(StateVariableVisibility.Public);
  }
  str() : string {
    return "public";
  }
  subs() : VarVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : VarVis) : VarVis[] {
    return [];
  }
  supers() : VarVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : VarVis) : VarVis[] {
    return [];
  }
  same(t : VarVis) : boolean {
    return t instanceof VarPublic;
  }
  copy() : VarVis {
    return new VarPublic();
  }
  issubof(t : VarVis) : boolean {
    return false;
  }
  issuperof(t : VarVis) : boolean {
    return false;
  }
}

export class VarPrivate extends VarVis {
  constructor() {
    super(StateVariableVisibility.Private);
  }
  str() : string {
    return "private";
  }
  subs() : VarVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : VarVis) : VarVis[] {
    return [];
  }
  supers() : VarVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : VarVis) : VarVis[] {
    return [];
  }
  same(t : VarVis) : boolean {
    return t instanceof VarPrivate;
  }
  copy() : VarVis {
    return new VarPrivate();
  }
  issubof(t : VarVis) : boolean {
    return false;
  }
  issuperof(t : VarVis) : boolean {
    return false;
  }
}

export class VarDefault extends VarVis {
  constructor() {
    super(StateVariableVisibility.Default);
  }
  str() : string {
    return "default";
  }
  subs() : VarVis[] {
    return [];
  }
  sub_with_lowerbound(lower_bound : VarVis) : VarVis[] {
    return [];
  }
  supers() : VarVis[] {
    return [];
  }
  super_with_upperbound(upper_bound : VarVis) : VarVis[] {
    return [];
  }
  same(t : VarVis) : boolean {
    return t instanceof VarDefault;
  }
  copy() : VarVis {
    return new VarDefault();
  }
  issubof(t : VarVis) : boolean {
    return false;
  }
  issuperof(t : VarVis) : boolean {
    return false;
  }
}

export class VarVisProvider {
  private static m_internal = new VarInternal();
  private static m_public = new VarPublic();
  private static m_private = new VarPrivate();
  private static m_default = new VarDefault();

  public static internal() : VarInternal {
    return this.m_internal;
  }

  public static public() : VarPublic {
    return this.m_public;
  }

  public static private() : VarPrivate {
    return this.m_private;
  }

  public static default() : VarDefault {
    return this.m_default;
  }
}