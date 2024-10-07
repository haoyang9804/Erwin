import { assert, cartesian_product, pick_random_subarray, merge_set } from "./utility";
import { sizeof } from "sizeof";
import { DominanceNode } from "./dominance";
import { config } from './config';

export enum TypeKind {
  ElementaryType = "TypeKind::ElementaryType", // uint256, address, boolean,
  FunctionType = "TypeKind::FunctionType", // function (uint256) pure external returns (uint256)
  ArrayType = "TypeKind::ArrayType", // uint256[2], address[2], boolean[2]
  MappingType = "TypeKind::MappingType", // mapping(uint256 => address), mapping(uint256 => boolean)
  UnionType = "TypeKind::UnionType",
  EventType = "TypeKind::EventType",
  StructType = "TypeKind::StructType",
  ContractType = "TypeKind::ContractType",
  ErrorType = "TypeKind::ErrorType",
  StringType = "TypeKind::StringType",
}

export function upperType(t1 : Type, t2 : Type) {
  assert(t1.kind === t2.kind, `upperType: t1.kind !== t2.kind`);
  assert(t1.issubof(t2) || t2.issubof(t1), `upperType: t1 is not subof t2 and t2 is not subof t1`);
  return t1.issubof(t2) ? t2 : t1;
}

export function lowerType(t1 : Type, t2 : Type) {
  assert(t1.kind === t2.kind, `upperType: t1.kind !== t2.kind`);
  assert(t1.issubof(t2) || t2.issubof(t1), `upperType: t1 is not subof t2 and t2 is not subof t1`);
  return t1.issuperof(t2) ? t2 : t1;
}

export abstract class Type extends DominanceNode<TypeKind> { }

export abstract class UserDefinedType extends Type {
  _subs : UserDefinedType[] = [];
  _supers : UserDefinedType[] = [];
  referece_id : number;
  constructor(reference_id : number, kind : TypeKind) {
    super(kind);
    this.referece_id = reference_id;
    this._subs = [this];
    this._supers = [this];
  }
  add_sub(subs : UserDefinedType) : void {
    this._subs.push(subs);
  }
  add_super(supers : UserDefinedType) : void {
    this._supers.push(supers);
  }
  type_range() : UserDefinedType[] {
    return [...merge_set(new Set<UserDefinedType>(this._subs), new Set<UserDefinedType>(this._supers))];
  }
}

export class EventType extends Type {
  name : string;
  constructor(name : string) {
    super(TypeKind.EventType);
    this.name = name;
  }
  str() : string {
    return "event";
  }
  subs() : Type[] {
    throw new Error("No sub_dominance for EventType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No sub_dominance for EventType");
  }
  supers() : Type[] {
    throw new Error("No super_dominance for EventType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No super_dominance for EventType");
  }
  copy() : Type {
    return new EventType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.EventType;
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

export class ErrorType extends Type {
  name : string;
  constructor(name : string) {
    super(TypeKind.ErrorType);
    this.name = name;
  }
  str() : string {
    return "error";
  }
  subs() : Type[] {
    throw new Error("No sub_dominance for ErrorType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No sub_dominance for ErrorType");
  }
  supers() : Type[] {
    throw new Error("No super_dominance for ErrorType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No super_dominance for ErrorType");
  }
  copy() : Type {
    return new EventType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ErrorType;
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

export class StructType extends UserDefinedType {
  name : string;
  type_str : string
  constructor(reference_id : number, name : string, type_str : string) {
    super(reference_id, TypeKind.StructType);
    this.name = name;
    this.type_str = type_str;
  }
  str() : string {
    return this.name;
  }
  subs() : Type[] {
    return this._subs;
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    return this._supers;
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  copy() : Type {
    return new StructType(this.referece_id, this.name, this.type_str);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.StructType && (t as StructType).name === this.name;
  }
  issubof(t : Type) : boolean {
    for (let i = 0; i < this._subs.length; i++) {
      if (this._supers[i].same(t)) return true;
    }
    return false;
  }
  issuperof(t : Type) : boolean {
    for (let i = 0; i < this._supers.length; i++) {
      if (this._subs[i].same(t)) return true;
    }
    return false;
  }
}

export class ContractType extends UserDefinedType {
  name : string;
  constructor(reference_id : number, name : string) {
    super(reference_id, TypeKind.ContractType);
    this.name = name;
  }
  str() : string {
    return this.name;
  }
  subs() : Type[] {
    return this._subs;
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    return this._supers;
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  copy() : Type {
    return new ContractType(this.referece_id, this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ContractType && (t as ContractType).name === this.name;
  }
  issubof(t : Type) : boolean {
    for (let i = 0; i < this._subs.length; i++) {
      if (this._supers[i].same(t)) return true;
    }
    return false;
  }
  issuperof(t : Type) : boolean {
    for (let i = 0; i < this._supers.length; i++) {
      if (this._subs[i].same(t)) return true;
    }
    return false;
  }
}

type elementary_type_name = "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "int256" | "int128" | "int64" | "int32" | "int16" | "int8";

export class ElementaryType extends Type {
  // uint256, address, boolean, etc
  name : elementary_type_name;
  /**
   * Can be set to `payable` if the type is `address`.
   * Otherwise the value is always `nonpayable`.
   */

  stateMutability : "nonpayable" | "payable";
  constructor(name : elementary_type_name = "uint256", stateMutability : "nonpayable" | "payable" = "nonpayable") {
    super(TypeKind.ElementaryType);
    assert(!(name !== "address" && stateMutability === "payable"), `ElementaryType: cannot set stateMutability to payable if name is not address`);
    this.name = name;
    this.stateMutability = stateMutability;
  }
  str() : string {
    if (this.stateMutability === "nonpayable") return this.name;
    return this.name + " " + this.stateMutability;
  }

  copy() : Type {
    throw new Error("ElementaryType::copy() not implemented.");
  }

  subs() : Type[] {
    switch (this.name) {
      case "uint256":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128(),
          TypeProvider.uint64(),
          TypeProvider.uint32(),
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint128":
        return [
          TypeProvider.uint128(),
          TypeProvider.uint64(),
          TypeProvider.uint32(),
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint64":
        return [
          TypeProvider.uint64(),
          TypeProvider.uint32(),
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint32":
        return [
          TypeProvider.uint32(),
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint16":
        return [
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint8":
        return [
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "int256":
        return [
          TypeProvider.int256(),
          TypeProvider.int128(),
          TypeProvider.int64(),
          TypeProvider.int32(),
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int128":
        return [
          TypeProvider.int128(),
          TypeProvider.int64(),
          TypeProvider.int32(),
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int64":
        return [
          TypeProvider.int64(),
          TypeProvider.int32(),
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int32":
        return [
          TypeProvider.int32(),
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int16":
        return [
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int8":
        return [
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "address":
        if (this.stateMutability === "payable") {
          return [TypeProvider.payable_address()];
        }
        else if (this.stateMutability === "nonpayable") {
          return [TypeProvider.payable_address(), TypeProvider.address()];
        }
        else {
          assert(false, `Elementary::sub_dominance: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [TypeProvider.bool()];
    }
  }

  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }

  supers() : Type[] {
    switch (this.name) {
      case "uint256":
        return [
          TypeProvider.uint256()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint128":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint64":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128(),
          TypeProvider.uint64()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint32":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128(),
          TypeProvider.uint64(),
          TypeProvider.uint32()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint16":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128(),
          TypeProvider.uint64(),
          TypeProvider.uint32(),
          TypeProvider.uint16()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "uint8":
        return [
          TypeProvider.uint256(),
          TypeProvider.uint128(),
          TypeProvider.uint64(),
          TypeProvider.uint32(),
          TypeProvider.uint16(),
          TypeProvider.uint8()
        ].filter(t => uinteger_types.some(tt => tt.same(t)));
      case "int256":
        return [
          TypeProvider.int256()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int128":
        return [
          TypeProvider.int256(),
          TypeProvider.int128()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int64":
        return [
          TypeProvider.int256(),
          TypeProvider.int128(),
          TypeProvider.int64()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int32":
        return [
          TypeProvider.int256(),
          TypeProvider.int128(),
          TypeProvider.int64(),
          TypeProvider.int32()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int16":
        return [
          TypeProvider.int256(),
          TypeProvider.int128(),
          TypeProvider.int64(),
          TypeProvider.int32(),
          TypeProvider.int16()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "int8":
        return [
          TypeProvider.int256(),
          TypeProvider.int128(),
          TypeProvider.int64(),
          TypeProvider.int32(),
          TypeProvider.int16(),
          TypeProvider.int8()
        ].filter(t => integer_types.some(tt => tt.same(t)));
      case "address":
        if (this.stateMutability === "payable") {
          return [TypeProvider.payable_address(), TypeProvider.address()];
        }
        else if (this.stateMutability === "nonpayable") {
          return [TypeProvider.address()];
        }
        else {
          assert(false, `Elementary::sub_dominance: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [TypeProvider.bool()];
    }
  }

  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }

  same(t : Type) : boolean {
    if (t.kind !== TypeKind.ElementaryType) return false;
    if ((t as ElementaryType).name === "address" && this.name === "address") {
      if ((t as ElementaryType).stateMutability === this.stateMutability) {
        return true;
      }
      return false;
    }
    if ((t as ElementaryType).name === this.name) {
      return true;
    }
    return false;
  }

  issuperof(t : Type) : boolean {
    if (t.kind !== TypeKind.ElementaryType) return false;
    const et : ElementaryType = t as ElementaryType;
    switch (et.name) {
      case "uint256":
        if (this.name === "uint256") return true;
        return false;
      case "uint128":
        if (this.name === "uint256" || this.name === "uint128") return true;
        return false;
      case "uint64":
        if (this.name.startsWith('u') && !this.name.endsWith('t8') && !this.name.endsWith('16') && !this.name.endsWith('2')) return true;
        return false;
      case "uint32":
        if (this.name.startsWith('u') && !this.name.endsWith('t8') && !this.name.endsWith('16')) return true;
        return false;
      case "uint16":
        if (this.name.startsWith('u') && !this.name.endsWith('t8')) return true;
        return false;
      case "uint8":
        if (this.name.startsWith('u')) return true;
        return false;
      case "int256":
        if (this.name === "int256") return true;
        return false;
      case "int128":
        if (this.name === "int256" || this.name === "int128") return true;
        return false;
      case "int64":
        if (this.name.startsWith('i') && !this.name.endsWith('t8') && !this.name.endsWith('16') && !this.name.endsWith('2')) return true;
        return false;
      case "int32":
        if (this.name.startsWith('i') && !this.name.endsWith('t8') && !this.name.endsWith('16')) return true;
        return false;
      case "int16":
        if (this.name.startsWith('i') && !this.name.endsWith('t8')) return true;
        return false;
      case "int8":
        if (this.name.startsWith('i')) return true;
        return false;
      case "address":
        if (this.name !== "address") return false;
        if (this.stateMutability === "nonpayable") {
          return true;
        }
        else if (this.stateMutability === "payable") {
          if (et.stateMutability === "payable") return true;
          return false;
        }
      case "bool":
        if (this.name === "bool") return true;
        return false;
    }
  }

  issubof(t : Type) : boolean {
    if (t.kind !== TypeKind.ElementaryType) return false;
    const et : ElementaryType = t as ElementaryType;
    switch (et.name) {
      case "uint256":
        if (this.name.startsWith('u')) return true;
        return false;
      case "uint128":
        if (this.name.startsWith('u') && !this.name.endsWith('56')) return true;
        return false;
      case "uint64":
        if (this.name.startsWith('u') && !this.name.endsWith('56') && !this.name.endsWith('28')) return true;
        return false;
      case "uint32":
        if (this.name.startsWith('u') && !this.name.endsWith('56') && !this.name.endsWith('28') && !this.name.endsWith('4')) return true;
        return false;
      case "uint16":
        if (this.name === "uint16" || this.name === "uint8") return true;
        return false;
      case "uint8":
        if (this.name === "uint8") return true;
        return false;
      case "int256":
        if (this.name.startsWith('i')) return true;
        return false;
      case "int128":
        if (this.name.startsWith('i') && !this.name.endsWith('56')) return true;
        return false;
      case "int64":
        if (this.name.startsWith('i') && !this.name.endsWith('56') && !this.name.endsWith('28')) return true;
        return false;
      case "int32":
        if (this.name.startsWith('i') && !this.name.endsWith('56') && !this.name.endsWith('28') && !this.name.endsWith('4')) return true;
        return false;
      case "int16":
        if (this.name === "int16" || this.name === "int8") return true;
        return false;
      case "int8":
        if (this.name === "int8") return true;
        return false;
      case "address":
        if (this.name !== "address") return false;
        if (this.stateMutability === "nonpayable") {
          if (et.stateMutability === "nonpayable") return true;
          return false;
        }
        else if (this.stateMutability === "payable") {
          return true;
        }
      case "bool":
        if (this.name === "bool") return true;
        return false;
    }
  }
}

export class UnionType extends Type {
  types : Type[];
  constructor(types : Type[]) {
    super(TypeKind.UnionType);
    this.types = types;
  }
  str() : string {
    return this.types.map(x => x.str()).join(" | ");
  }
  copy() : Type {
    return new UnionType(this.types.map(x => x.copy()));
  }
  subs() : Type[] {
    return cartesian_product(this.types.map(x => x.subs())).map(x => new UnionType(x));
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    return cartesian_product(this.types.map(x => x.supers())).map(x => new UnionType(x));
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if ((t as UnionType).types.length !== this.types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].same((t as UnionType).types[i])) return false;
    }
    return true;
  }
  issubof(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if (this.types.length !== (t as UnionType).types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].issubof((t as UnionType).types[i])) return false;
    }
    return true;
  }
  issuperof(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if (this.types.length !== (t as UnionType).types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].issuperof((t as UnionType).types[i])) return false;
    }
    return true;
  }
}

export class FunctionType extends Type {
  visibility : "public" | "internal" | "external" | "private" = "public";
  stateMutability : "pure" | "view" | "payable" | "nonpayable" = "nonpayable";
  parameterTypes : UnionType;
  returnTypes : UnionType;
  constructor(
    visibility : "public" | "internal" | "external" | "private" = "public",
    stateMutability : "pure" | "view" | "payable" | "nonpayable" = "nonpayable",
    parameterTypes : UnionType, returnTypes : UnionType) {
    super(TypeKind.FunctionType);
    this.visibility = visibility;
    this.stateMutability = stateMutability;
    this.parameterTypes = parameterTypes;
    this.returnTypes = returnTypes;
  }
  str() : string {
    return `function (${this.parameterTypes.types.map(x => x.str()).join(", ")}) ${this.stateMutability} ${this.visibility} returns (${this.returnTypes.types.map(x => x.str()).join(", ")})`;
  }
  copy() : Type {
    return new FunctionType(this.visibility, this.stateMutability, this.parameterTypes, this.returnTypes);
  }
  parameterTypes_str() : string {
    return this.parameterTypes.types.map(x => x.str()).join(", ");
  }
  returnTypes_str() : string {
    return this.returnTypes.types.map(x => x.str()).join(", ");
  }
  subs() : Type[] {
    switch (this.stateMutability) {
      case "pure":
        return [new FunctionType(this.visibility, "pure", this.parameterTypes, this.returnTypes)];
      case "view":
        return [new FunctionType(this.visibility, "pure", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "view", this.parameterTypes, this.returnTypes)]
      case "payable":
        return [new FunctionType(this.visibility, "payable", this.parameterTypes, this.returnTypes)]
      case "nonpayable":
        return [new FunctionType(this.visibility, "payable", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "nonpayable", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "pure", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "view", this.parameterTypes, this.returnTypes)]
    }
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    switch (this.stateMutability) {
      case "pure":
        return [new FunctionType(this.visibility, "pure", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "view", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "nonpayable", this.parameterTypes, this.returnTypes)]
      case "view":
        return [new FunctionType(this.visibility, "view", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "nonpayable", this.parameterTypes, this.returnTypes)]
      case "payable":
        return [new FunctionType(this.visibility, "payable", this.parameterTypes, this.returnTypes),
        new FunctionType(this.visibility, "nonpayable", this.parameterTypes, this.returnTypes)]
      case "nonpayable":
        return [new FunctionType(this.visibility, "nonpayable", this.parameterTypes, this.returnTypes)]
    }
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.FunctionType) return false;
    if ((t as FunctionType).stateMutability === this.stateMutability
      && (t as FunctionType).visibility === this.visibility
      && (t as FunctionType).returnTypes.types.length === this.returnTypes.types.length
      && (t as FunctionType).parameterTypes.types.length === this.parameterTypes.types.length
      && (t as FunctionType).parameterTypes_str() === this.parameterTypes_str()
      && (t as FunctionType).returnTypes_str() === this.returnTypes_str()) {
      return true;
    }
    return false;
  }

  issubof(t : Type) : boolean {
    if (t.kind !== TypeKind.FunctionType) return false;
    const ft : FunctionType = t as FunctionType;
    if (this.visibility !== ft.visibility) return false;
    if (!this.parameterTypes.same(ft.parameterTypes)) return false;
    if (!this.returnTypes.same(ft.returnTypes)) return false;
    switch (ft.stateMutability) {
      case "pure":
        if (this.stateMutability === "pure") return true;
        return false;
      case "view":
        if (this.stateMutability === "view" || this.stateMutability === "pure") return true;
        return false;
      case "payable":
        if (this.stateMutability === "payable") return true;
        return false;
      case "nonpayable":
        if (this.stateMutability === "nonpayable" || this.stateMutability === "payable" || this.stateMutability === "view" || this.stateMutability === "pure") return true;
        return false;
    }
  }

  issuperof(t : Type) : boolean {
    if (t.kind !== TypeKind.FunctionType) return false;
    const ft : FunctionType = t as FunctionType;
    if (this.visibility !== ft.visibility) return false;
    if (!this.parameterTypes.same(ft.parameterTypes)) return false;
    if (!this.returnTypes.same(ft.returnTypes)) return false;
    switch (ft.stateMutability) {
      case "pure":
        if (this.stateMutability === "pure" || this.stateMutability === "view" || this.stateMutability === "nonpayable") return true;
        return false;
      case "view":
        if (this.stateMutability === "nonpayable" || this.stateMutability === "view") return true;
        return false;
      case "payable":
        if (this.stateMutability === "nonpayable" || this.stateMutability === "payable") return true;
        return false;
      case "nonpayable":
        if (this.stateMutability === "nonpayable") return true;
        return false;
    }
  }
}

export class ArrayType extends Type {
  base : Type;
  length : number = 1
  constructor(base : Type, length : number = 1) {
    super(TypeKind.ArrayType);
    this.base = base;
    this.length = length;
  }
  str() : string {
    return `${this.base.str()}[${this.length}]`;
  }
  copy() : Type {
    return new ArrayType(this.base.copy(), this.length);
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  supers() : Type[] {
    return [this.copy()];
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  subs() : Type[] {
    return [this.copy()];
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.ArrayType) return false;
    if ((t as ArrayType).base.same(this.base) && (t as ArrayType).length === this.length) {
      return true;
    }
    return false;
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

export class MappingType extends Type {
  kType : Type;
  vType : Type;
  constructor(kType : Type, vType : Type) {
    super(TypeKind.MappingType);
    this.kType = kType;
    this.vType = vType;
  }
  str() : string {
    return `mapping(${this.kType.str()} => ${this.vType.str()})`;
  }
  copy() : Type {
    return new MappingType(this.kType.copy(), this.vType.copy());
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.MappingType) return false;
    if ((t as MappingType).kType.same(this.kType) && (t as MappingType).vType.same(this.vType)) {
      return true;
    }
    return false;
  }
  subs() : Type[] {
    return [this.copy()];
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    return [this.copy()];
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    return this.supers().filter(x => x.issubof(upper_bound));
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

export class TypeProvider {
  static int256() : Type { return this.m_int256; }
  static int128() : Type { return this.m_int128; }
  static int64() : Type { return this.m_int64; }
  static int32() : Type { return this.m_int32; }
  static int16() : Type { return this.m_int16; }
  static int8() : Type { return this.m_int8; }
  static uint256() : Type { return this.m_uint256; }
  static uint128() : Type { return this.m_uint128; }
  static uint64() : Type { return this.m_uint64; }
  static uint32() : Type { return this.m_uint32; }
  static uint16() : Type { return this.m_uint16; }
  static uint8() : Type { return this.m_uint8; }
  static bool() : Type { return this.m_bool; }
  static address() : Type { return this.m_address; }
  static payable_address() : Type { return this.m_payable_address; }
  private static m_int256 : Type = new ElementaryType("int256", "nonpayable");
  private static m_int128 : Type = new ElementaryType("int128", "nonpayable");
  private static m_int64 : Type = new ElementaryType("int64", "nonpayable");
  private static m_int32 : Type = new ElementaryType("int32", "nonpayable");
  private static m_int16 : Type = new ElementaryType("int16", "nonpayable");
  private static m_int8 : Type = new ElementaryType("int8", "nonpayable");
  private static m_uint256 : Type = new ElementaryType("uint256", "nonpayable");
  private static m_uint128 : Type = new ElementaryType("uint128", "nonpayable");
  private static m_uint64 : Type = new ElementaryType("uint64", "nonpayable");
  private static m_uint32 : Type = new ElementaryType("uint32", "nonpayable");
  private static m_uint16 : Type = new ElementaryType("uint16", "nonpayable");
  private static m_uint8 : Type = new ElementaryType("uint8", "nonpayable");
  private static m_bool : Type = new ElementaryType("bool", "nonpayable");
  private static m_address : Type = new ElementaryType("address", "nonpayable");
  private static m_payable_address : Type = new ElementaryType("address", "payable");
}

// export const irnode2types = new Map<number, Type[]>();

export let integer_types : Type[] = [
  TypeProvider.int256(),
  TypeProvider.int128(),
  TypeProvider.int64(),
  TypeProvider.int32(),
  TypeProvider.int16(),
  TypeProvider.int8()
]
export let uinteger_types : Type[] = [
  TypeProvider.uint256(),
  TypeProvider.uint128(),
  TypeProvider.uint64(),
  TypeProvider.uint32(),
  TypeProvider.uint16(),
  TypeProvider.uint8()
]

export let all_integer_types : Type[];
export let elementary_types : Type[];
export const bool_types : Type[] = [TypeProvider.bool()];
export const address_types : Type[] = [TypeProvider.address(), TypeProvider.payable_address()];
export let size_of_type : number;

export function initType() : void {
  integer_types = pick_random_subarray(integer_types, config.int_num);
  uinteger_types = pick_random_subarray(uinteger_types, config.uint_num);
  all_integer_types = integer_types.concat(uinteger_types);
  elementary_types = all_integer_types.concat(bool_types).concat(address_types);
  size_of_type = sizeof(elementary_types[0]);
}