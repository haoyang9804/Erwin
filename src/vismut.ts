import { FuncStatProvider, FuncStat } from "./funcstat";
import { FuncVis, FuncVisProvider, VarVis, VarVisProvider } from "./visibility";
import { ConstraintNode } from "./constraint";
import { cartesian_product } from "./utility";

export class FuncVisMutKind {
  visibility : FuncVis;
  state_mutability : FuncStat;
  typeName : string;
  constructor(visibility : FuncVis, state_mutability : FuncStat) {
    this.visibility = visibility;
    this.state_mutability = state_mutability;
    this.typeName = visibility.typeName + state_mutability.typeName;
  }
}

export class FuncVisMutKindProvider {
  private static m_internal_pure : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.internal(), FuncStatProvider.pure());
  static internal_pure() : FuncVisMutKind {
    return this.m_internal_pure;
  }
  private static m_internal_view : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.internal(), FuncStatProvider.view());
  static internal_view() : FuncVisMutKind {
    return this.m_internal_view;
  }
  private static m_internal_empty : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.internal(), FuncStatProvider.empty());
  static internal_empty() : FuncVisMutKind {
    return this.m_internal_empty;
  }
  private static m_external_pure : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.external(), FuncStatProvider.pure());
  static external_pure() : FuncVisMutKind {
    return this.m_external_pure;
  }
  private static m_external_view : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.external(), FuncStatProvider.view());
  static external_view() : FuncVisMutKind {
    return this.m_external_view;
  }
  private static m_external_payable : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.external(), FuncStatProvider.payable());
  static external_payable() : FuncVisMutKind {
    return this.m_external_payable;
  }
  private static m_external_empty : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.external(), FuncStatProvider.empty());
  static external_empty() : FuncVisMutKind {
    return this.m_external_empty;
  }
  private static m_public_pure : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.public(), FuncStatProvider.pure());
  static public_pure() : FuncVisMutKind {
    return this.m_public_pure;
  }
  private static m_public_view : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.public(), FuncStatProvider.view());
  static public_view() : FuncVisMutKind {
    return this.m_public_view;
  }
  private static m_public_payable : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.public(), FuncStatProvider.payable());
  static public_payable() : FuncVisMutKind {
    return this.m_public_payable;
  }
  private static m_public_empty : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.public(), FuncStatProvider.empty());
  static public_empty() : FuncVisMutKind {
    return this.m_public_empty;
  }
  private static m_private_pure : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.private(), FuncStatProvider.pure());
  static private_pure() : FuncVisMutKind {
    return this.m_private_pure;
  }
  private static m_private_view : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.private(), FuncStatProvider.view());
  static private_view() : FuncVisMutKind {
    return this.m_private_view;
  }
  private static m_private_empty : FuncVisMutKind = new FuncVisMutKind(FuncVisProvider.private(), FuncStatProvider.empty());
  static private_empty() : FuncVisMutKind {
    return this.m_private_empty;
  }
}

export class VarVisKind {
  visibility : VarVis;
  typeName : string;
  constructor(visibility : VarVis) {
    this.visibility = visibility;
    this.typeName = visibility.typeName;
  }
}

export class VarVisKindProvider {
  private static m_internal : VarVisKind = new VarVisKind(VarVisProvider.internal());
  static internal() : VarVisKind {
    return this.m_internal;
  }
  private static m_public : VarVisKind = new VarVisKind(VarVisProvider.public());
  static public() : VarVisKind {
    return this.m_public;
  }
  private static m_private : VarVisKind = new VarVisKind(VarVisProvider.private());
  static private() : VarVisKind {
    return this.m_private;
  }
  private static m_default : VarVisKind = new VarVisKind(VarVisProvider.default());
  static default() : VarVisKind {
    return this.m_default;
  }
}

export type VisMutKind = VarVisKind | FuncVisMutKind;

export class VisMutKindProvider {
  static vis_internal() : VisMutKind {
    return VarVisKindProvider.internal();
  }
  static vis_public() : VisMutKind {
    return VarVisKindProvider.public();
  }
  static vis_private() : VisMutKind {
    return VarVisKindProvider.private();
  }
  static vis_default() : VisMutKind {
    return VarVisKindProvider.default();
  }
  static func_internal_pure() : VisMutKind {
    return FuncVisMutKindProvider.internal_pure();
  }
  static func_internal_view() : VisMutKind {
    return FuncVisMutKindProvider.internal_view();
  }
  static func_internal_empty() : VisMutKind {
    return FuncVisMutKindProvider.internal_empty();
  }
  static func_external_pure() : VisMutKind {
    return FuncVisMutKindProvider.external_pure();
  }
  static func_external_view() : VisMutKind {
    return FuncVisMutKindProvider.external_view();
  }
  static func_external_payable() : VisMutKind {
    return FuncVisMutKindProvider.external_payable();
  }
  static func_external_empty() : VisMutKind {
    return FuncVisMutKindProvider.external_empty();
  }
  static func_public_pure() : VisMutKind {
    return FuncVisMutKindProvider.public_pure();
  }
  static func_public_view() : VisMutKind {
    return FuncVisMutKindProvider.public_view();
  }
  static func_public_payable() : VisMutKind {
    return FuncVisMutKindProvider.public_payable();
  }
  static func_public_empty() : VisMutKind {
    return FuncVisMutKindProvider.public_empty();
  }
  static func_private_pure() : VisMutKind {
    return FuncVisMutKindProvider.private_pure();
  }
  static func_private_view() : VisMutKind {
    return FuncVisMutKindProvider.private_view();
  }
  static func_private_empty() : VisMutKind {
    return FuncVisMutKindProvider.private_empty();
  }
  static from_varvis(vis : VarVis) : VisMutKind {
    if (vis.typeName === "VarInternal") {
      return VarVisKindProvider.internal();
    }
    else if (vis.typeName === "VarPublic") {
      return VarVisKindProvider.public();
    }
    else if (vis.typeName === "VarPrivate") {
      return VarVisKindProvider.private();
    }
    else {
      throw new Error("Invalid VarVis: VarVis can only be Internal, Public, or Private");
    }
  }
  static combine_vis_mut(vis : FuncVis, mut : FuncStat) : VisMutKind {
    if (vis.typeName === "FuncInternal") {
      if (mut.typeName === "Pure") {
        return FuncVisMutKindProvider.internal_pure();
      } else if (mut.typeName === "View") {
        return FuncVisMutKindProvider.internal_view();
      } else if (mut.typeName === "Empty") {
        return FuncVisMutKindProvider.internal_empty();
      } else {
        throw new Error(`Invalid FuncStat: FuncInternal can only be Pure, View, or Empty, but is ${mut.typeName}`);
      }
    }
    else if (vis.typeName === "FuncExternal") {
      if (mut.typeName === "Pure") {
        return FuncVisMutKindProvider.external_pure();
      } else if (mut.typeName === "View") {
        return FuncVisMutKindProvider.external_view();
      } else if (mut.typeName === "Payable") {
        return FuncVisMutKindProvider.external_payable();
      } else if (mut.typeName === "Empty") {
        return FuncVisMutKindProvider.external_empty();
      } else {
        throw new Error(`Invalid FuncStat: FuncExternal can only be Pure, View, Payable, or Empty, but is ${mut.typeName}`);
      }
    }
    else if (vis.typeName === "FuncPublic") {
      if (mut.typeName === "Pure") {
        return FuncVisMutKindProvider.public_pure();
      } else if (mut.typeName === "View") {
        return FuncVisMutKindProvider.public_view();
      } else if (mut.typeName === "Payable") {
        return FuncVisMutKindProvider.public_payable();
      } else if (mut.typeName === "Empty") {
        return FuncVisMutKindProvider.public_empty();
      } else {
        throw new Error(`Invalid FuncStat: FuncPublic can only be Pure, View, Payable, or Empty, but is ${mut.typeName}`);
      }
    }
    else if (vis.typeName === "FuncPrivate") {
      if (mut.typeName === "Pure") {
        return FuncVisMutKindProvider.private_pure();
      } else if (mut.typeName === "View") {
        return FuncVisMutKindProvider.private_view();
      } else if (mut.typeName === "Empty") {
        return FuncVisMutKindProvider.private_empty();
      } else {
        throw new Error(`Invalid FuncStat: FuncPrivate can only be Pure, View, or Empty, but is ${mut.typeName}`);
      }
    }
    else {
      throw new Error(`Invalid FuncVis: FuncVis can only be FunctionInternal, FunctionExternal, FunctionPublic, or FunctionPrivate, but got ${vis.typeName}`);
    }
  }
}

export abstract class VisMut extends ConstraintNode<VisMutKind> { }

export abstract class FuncVisMut extends VisMut {
  str() : string {
    return this.typeName;
  }
  subs() : VisMut[] {
    const local_kind = this.kind as FuncVisMutKind;
    //@ts-ignore
    const vis_sub = local_kind.visibility.subs();
    const all_visibility = [FuncVisProvider.internal(),
    FuncVisProvider.external(),
    FuncVisProvider.public(),
    FuncVisProvider.private()];
    const stat_sub = local_kind.state_mutability.subs();
    return cartesian_product([all_visibility, stat_sub])
      .filter(([vis, stat]) => !(vis === FuncVisProvider.internal() && stat === FuncStatProvider.payable())
        && !(vis === FuncVisProvider.private() && stat === FuncStatProvider.payable()))
      .map(([vis, stat]) =>
        VisMutProvider.from_kind(
          VisMutKindProvider.combine_vis_mut(vis, stat)));
  }
  supers() : VisMut[] {
    const local_kind = this.kind as FuncVisMutKind;
    //@ts-ignore
    const vis_super = local_kind.visibility.supers();
    const all_visibility = [FuncVisProvider.internal(),
    FuncVisProvider.external(),
    FuncVisProvider.public(),
    FuncVisProvider.private()];
    const stat_super = local_kind.state_mutability.supers();
    return cartesian_product([all_visibility, stat_super])
      .filter(([vis, stat]) => !(vis === FuncVisProvider.internal() && stat === FuncStatProvider.payable())
        && !(vis === FuncVisProvider.private() && stat === FuncStatProvider.payable()))
      .map(([vis, stat]) =>
        VisMutProvider.from_kind(
          VisMutKindProvider.combine_vis_mut(vis, stat)));
  }
  is_sub_of(t : VisMut) : boolean {
    return this.supers().includes(t);
  }
  is_super_of(t : VisMut) : boolean {
    return this.subs().includes(t);
  }
}

class FuncInternalPure extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_internal_pure());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_internal_pure();
  }
  copy() : VisMut {
    return new FuncInternalPure();
  }
}

class FuncInternalView extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_internal_view());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_internal_view();
  }
  copy() : VisMut {
    return new FuncInternalView();
  }
}

class FuncInternalEmpty extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_internal_empty());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_internal_empty();
  }
  copy() : VisMut {
    return new FuncInternalEmpty();
  }
}

class FuncExternalPure extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_external_pure());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_external_pure();
  }
  copy() : VisMut {
    return new FuncExternalPure();
  }
}

class FuncExternalView extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_external_view());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_external_view();
  }
  copy() : VisMut {
    return new FuncExternalView();
  }
}

class FuncExternalEmpty extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_external_empty());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_external_empty();
  }
  copy() : VisMut {
    return new FuncExternalEmpty();
  }
}

class FuncExternalPayable extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_external_payable());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_external_payable();
  }
  copy() : VisMut {
    return new FuncExternalPayable();
  }
}

class FuncPublicPure extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_public_pure());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_public_pure();
  }
  copy() : VisMut {
    return new FuncPublicPure();
  }
}

class FuncPublicView extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_public_view());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_public_view();
  }
  copy() : VisMut {
    return new FuncPublicView();
  }
}

class FuncPublicPayable extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_public_payable());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_public_payable();
  }
  copy() : VisMut {
    return new FuncPublicPayable();
  }
}

class FuncPublicEmpty extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_public_empty());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_public_empty();
  }
  copy() : VisMut {
    return new FuncPublicEmpty();
  }
}

class FuncPrivatePure extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_private_pure());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_private_pure();
  }
  copy() : VisMut {
    return new FuncPrivatePure();
  }
}

class FuncPrivateView extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_private_view());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_private_view();
  }
  copy() : VisMut {
    return new FuncPrivateView();
  }
}

class FuncPrivateEmpty extends FuncVisMut {
  constructor() {
    super(VisMutKindProvider.func_private_empty());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.func_private_empty();
  }
  copy() : VisMut {
    return new FuncPrivateEmpty();
  }
}

export abstract class VarVisMut extends VisMut {
  str() : string {
    return this.typeName;
  }
  subs() : VisMut[] {
    const local_kind = this.kind as VarVisKind;
    const vis_sub = local_kind.visibility.subs() as VarVis[];
    return vis_sub.map(t => VisMutProvider.from_kind(VisMutKindProvider.from_varvis(t)));

  }
  supers() : VisMut[] {
    const local_kind = this.kind as VarVisKind;
    const vis_sub = local_kind.visibility.supers() as VarVis[];
    return vis_sub.map(t => VisMutProvider.from_kind(VisMutKindProvider.from_varvis(t)));
  }
  is_sub_of(t : VisMut) : boolean {
    return this.supers().includes(t);
  }
  is_super_of(t : VisMut) : boolean {
    return this.subs().includes(t);
  }
}

class VarInternal extends VarVisMut {
  constructor() {
    super(VisMutKindProvider.vis_internal());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.var_internal();
  }
  copy() : VisMut {
    return new VarInternal();
  }
}

class VarPublic extends VarVisMut {
  constructor() {
    super(VisMutKindProvider.vis_public());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.var_public();
  }
  copy() : VisMut {
    return new VarPublic();
  }
}

class VarPrivate extends VarVisMut {
  constructor() {
    super(VisMutKindProvider.vis_private());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.var_private();
  }
  copy() : VisMut {
    return new VarPrivate();
  }
}

class VarDefault extends VarVisMut {
  constructor() {
    super(VisMutKindProvider.vis_default());
  }
  same(t : VisMut) : boolean {
    return t === VisMutProvider.var_default();
  }
  copy() : VisMut {
    return new VarDefault();
  }
}

export class VisMutProvider {
  private static m_func_internal_pure : FuncInternalPure = new FuncInternalPure();
  static func_internal_pure() : FuncInternalPure {
    return this.m_func_internal_pure;
  }
  private static m_func_internal_view : FuncInternalView = new FuncInternalView();
  static func_internal_view() : FuncInternalView {
    return this.m_func_internal_view;
  }
  private static m_func_internal_empty : FuncInternalEmpty = new FuncInternalEmpty();
  static func_internal_empty() : FuncInternalEmpty {
    return this.m_func_internal_empty;
  }
  private static m_func_external_pure : FuncExternalPure = new FuncExternalPure();
  static func_external_pure() : FuncExternalPure {
    return this.m_func_external_pure;
  }
  private static m_func_external_view : FuncExternalView = new FuncExternalView();
  static func_external_view() : FuncExternalView {
    return this.m_func_external_view;
  }
  private static m_func_external_empty : FuncExternalEmpty = new FuncExternalEmpty();
  static func_external_empty() : FuncExternalEmpty {
    return this.m_func_external_empty;
  }
  private static m_func_external_payable : FuncExternalPayable = new FuncExternalPayable();
  static func_external_payable() : FuncExternalPayable {
    return this.m_func_external_payable;
  }
  private static m_func_public_pure : FuncPublicPure = new FuncPublicPure();
  static func_public_pure() : FuncPublicPure {
    return this.m_func_public_pure;
  }
  private static m_func_public_view : FuncPublicView = new FuncPublicView();
  static func_public_view() : FuncPublicView {
    return this.m_func_public_view;
  }
  private static m_func_public_payable : FuncPublicPayable = new FuncPublicPayable();
  static func_public_payable() : FuncPublicPayable {
    return this.m_func_public_payable;
  }
  private static m_func_public_empty : FuncPublicEmpty = new FuncPublicEmpty();
  static func_public_empty() : FuncPublicEmpty {
    return this.m_func_public_empty;
  }
  private static m_func_private_pure : FuncPrivatePure = new FuncPrivatePure();
  static func_private_pure() : FuncPrivatePure {
    return this.m_func_private_pure;
  }
  private static m_func_private_view : FuncPrivateView = new FuncPrivateView();
  static func_private_view() : FuncPrivateView {
    return this.m_func_private_view;
  }
  private static m_func_private_empty : FuncPrivateEmpty = new FuncPrivateEmpty();
  static func_private_empty() : FuncPrivateEmpty {
    return this.m_func_private_empty;
  }
  private static m_var_internal : VarInternal = new VarInternal();
  static var_internal() : VarInternal {
    return this.m_var_internal
  }
  private static m_var_public : VarPublic = new VarPublic();
  static var_public() : VarPublic {
    return this.m_var_public;
  }
  private static m_var_private : VarPrivate = new VarPrivate();
  static var_private() : VarPrivate {
    return this.m_var_private;
  }
  private static m_var_default : VarDefault = new VarDefault();
  static var_default() : VarDefault {
    return this.m_var_default;
  }
  static from_kind(kind : VisMutKind) : VisMut {
    if (kind.typeName === "FuncInternalPure") {
      return this.m_func_internal_pure;
    }
    else if (kind.typeName === "FuncInternalView") {
      return this.m_func_internal_view;
    }
    else if (kind.typeName === "FuncInternalEmpty") {
      return this.m_func_internal_empty;
    }
    else if (kind.typeName === "FuncExternalPure") {
      return this.m_func_external_pure;
    }
    else if (kind.typeName === "FuncExternalView") {
      return this.m_func_external_view;
    }
    else if (kind.typeName === "FuncExternalEmpty") {
      return this.m_func_external_empty;
    }
    else if (kind.typeName === "FuncExternalPayable") {
      return this.m_func_external_payable;
    }
    else if (kind.typeName === "FuncPublicPure") {
      return this.m_func_public_pure;
    }
    else if (kind.typeName === "FuncPublicView") {
      return this.m_func_public_view;
    }
    else if (kind.typeName === "FuncPublicPayable") {
      return this.m_func_public_payable;
    }
    else if (kind.typeName === "FuncPublicEmpty") {
      return this.m_func_public_empty;
    }
    else if (kind.typeName === "FuncPrivatePure") {
      return this.m_func_private_pure;
    }
    else if (kind.typeName === "FuncPrivateView") {
      return this.m_func_private_view;
    }
    else if (kind.typeName === "FuncPrivateEmpty") {
      return this.m_func_private_empty;
    }
    else if (kind.typeName === "VarInternal") {
      return this.m_var_internal;
    }
    else if (kind.typeName === "VarPublic") {
      return this.m_var_public;
    }
    else if (kind.typeName === "VarPrivate") {
      return this.m_var_private;
    }
    else if (kind.typeName === "VarDefault") {
      return this.m_var_default;
    }
    else {
      throw new Error("Invalid VisMutKind");
    }
  }
}

export const all_func_vismut = [
  VisMutProvider.func_internal_pure(),
  VisMutProvider.func_internal_view(),
  VisMutProvider.func_internal_empty(),
  VisMutProvider.func_external_pure(),
  VisMutProvider.func_external_view(),
  VisMutProvider.func_external_empty(),
  VisMutProvider.func_external_payable(),
  VisMutProvider.func_public_pure(),
  VisMutProvider.func_public_view(),
  VisMutProvider.func_public_payable(),
  VisMutProvider.func_public_empty(),
  VisMutProvider.func_private_pure(),
  VisMutProvider.func_private_view(),
  VisMutProvider.func_private_empty()
];

export const all_var_vismut = [
  VisMutProvider.var_internal(),
  VisMutProvider.var_public(),
  VisMutProvider.var_private(),
  VisMutProvider.var_default()
];

export const nonpayable_func_vismut = [
  VisMutProvider.func_internal_pure(),
  VisMutProvider.func_internal_view(),
  VisMutProvider.func_internal_empty(),
  VisMutProvider.func_external_pure(),
  VisMutProvider.func_external_view(),
  VisMutProvider.func_external_empty(),
  VisMutProvider.func_public_pure(),
  VisMutProvider.func_public_view(),
  VisMutProvider.func_public_empty(),
  VisMutProvider.func_private_pure(),
  VisMutProvider.func_private_view(),
  VisMutProvider.func_private_empty()
];

export const open_func_vismut = [
  VisMutProvider.func_external_pure(),
  VisMutProvider.func_external_view(),
  VisMutProvider.func_external_empty(),
  VisMutProvider.func_external_payable(),
  VisMutProvider.func_public_pure(),
  VisMutProvider.func_public_view(),
  VisMutProvider.func_public_payable(),
  VisMutProvider.func_public_empty()
];

export const closed_func_vismut = [
  VisMutProvider.func_internal_pure(),
  VisMutProvider.func_internal_view(),
  VisMutProvider.func_internal_empty(),
  VisMutProvider.func_private_pure(),
  VisMutProvider.func_private_view(),
  VisMutProvider.func_private_empty()
];

export const nonpure_func_vismut = [
  VisMutProvider.func_internal_view(),
  VisMutProvider.func_internal_empty(),
  VisMutProvider.func_external_view(),
  VisMutProvider.func_external_empty(),
  VisMutProvider.func_external_payable(),
  VisMutProvider.func_public_view(),
  VisMutProvider.func_public_payable(),
  VisMutProvider.func_public_empty(),
  VisMutProvider.func_private_view(),
  VisMutProvider.func_private_empty()
];

export const nonpure_nonview_func_vismut = [
  VisMutProvider.func_internal_empty(),
  VisMutProvider.func_external_empty(),
  VisMutProvider.func_external_payable(),
  VisMutProvider.func_public_payable(),
  VisMutProvider.func_public_empty(),
  VisMutProvider.func_private_empty()
];

export const pure_func_vismut = [
  VisMutProvider.func_internal_pure(),
  VisMutProvider.func_external_pure(),
  VisMutProvider.func_public_pure(),
  VisMutProvider.func_private_pure()
];

export const view_func_vismut = [
  VisMutProvider.func_internal_view(),
  VisMutProvider.func_external_view(),
  VisMutProvider.func_public_view(),
  VisMutProvider.func_private_view()
];

export function from_state_mutability_range_to_vismut_range(state_mutability_range : FuncStat[]) : VisMut[] {
  let vismut_range : VisMut[] = [];
  for (const state_mutability of state_mutability_range) {
    if (state_mutability === FuncStatProvider.payable()) {
      vismut_range.push(VisMutProvider.func_external_payable());
      vismut_range.push(VisMutProvider.func_public_payable());
    }
    else if (state_mutability === FuncStatProvider.empty()) {
      vismut_range.push(VisMutProvider.func_external_empty());
      vismut_range.push(VisMutProvider.func_public_empty());
      vismut_range.push(VisMutProvider.func_internal_empty());
      vismut_range.push(VisMutProvider.func_private_empty());
    }
    else if (state_mutability === FuncStatProvider.view()) {
      vismut_range.push(VisMutProvider.func_external_view());
      vismut_range.push(VisMutProvider.func_public_view());
      vismut_range.push(VisMutProvider.func_internal_view());
      vismut_range.push(VisMutProvider.func_private_view());
    }
    else if (state_mutability === FuncStatProvider.pure()) {
      vismut_range.push(VisMutProvider.func_external_pure());
      vismut_range.push(VisMutProvider.func_public_pure());
      vismut_range.push(VisMutProvider.func_internal_pure());
      vismut_range.push(VisMutProvider.func_private_pure());
    }
  }
  return vismut_range;
}