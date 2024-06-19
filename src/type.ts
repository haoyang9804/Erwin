import { assert, pickRandomElement, lazyPickRandomElement, cartesianProduct, pickRandomSubarray } from "./utility";
import { sizeof } from "sizeof";
import { DominanceNode } from "./dominance";
import { config } from './config';

export enum TypeKind {
  ElementaryType, // uint256, address, boolean,
  FunctionType, // function (uint256) pure external returns (uint256)
  ArrayType, // uint256[2], address[2], boolean[2]
  MappingType, // mapping(uint256 => address), mapping(uint256 => boolean)
  UnionType,
  EventType,
  StructType,
  ContractType,
  ErrorType
}

export function upperType(t1 : Type, t2 : Type) {
  assert(t1.kind === t2.kind, `upperType: t1.kind !== t2.kind`);
  assert(t1.issubof(t2) || t2.issubof(t1), `upperType: t1 is not subtypeof t2 and t2 is not subtypeof t1`);
  return t1.issubof(t2) ? t2 : t1;
}

export function lowerType(t1 : Type, t2 : Type) {
  assert(t1.kind === t2.kind, `upperType: t1.kind !== t2.kind`);
  assert(t1.issubof(t2) || t2.issubof(t1), `upperType: t1 is not subtypeof t2 and t2 is not subtypeof t1`);
  return t1.issuperof(t2) ? t2 : t1;
}

export abstract class Type extends DominanceNode<TypeKind> { }

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
    throw new Error("No _sub for EventType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No _sub for EventType");
  }
  supers() : Type[] {
    throw new Error("No _super for EventType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No _super for EventType");
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
    throw new Error("No _sub for ErrorType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No _sub for ErrorType");
  }
  supers() : Type[] {
    throw new Error("No _super for ErrorType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No _super for ErrorType");
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

export class StructType extends Type {
  name : string;
  constructor(name : string) {
    super(TypeKind.StructType);
    this.name = name;
  }
  str() : string {
    return "struct";
  }
  subs() : Type[] {
    throw new Error("No _sub for StructType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No _sub for StructType");
  }
  supers() : Type[] {
    throw new Error("No _super for StructType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No _super for StructType");
  }
  copy() : Type {
    return new StructType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.StructType;
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

export class ContractType extends Type {
  name : string;
  constructor(name : string) {
    super(TypeKind.ContractType);
    this.name = name;
  }
  str() : string {
    return "contract";
  }
  subs() : Type[] {
    throw new Error("No _sub for ContractType");
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No _sub for ContractType");
  }
  supers() : Type[] {
    throw new Error("No _super for ContractType");
  }
  super_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No _super for ContractType");
  }
  copy() : Type {
    return new ContractType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ContractType;
  }
  issubof(t : Type) : boolean {
    return this.same(t);
  }
  issuperof(t : Type) : boolean {
    return this.same(t);
  }
}

type elementary_type_name = "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "string" | "bytes" | "int256" | "int128" | "int64" | "int32" | "int16" | "int8";

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
        return [TypeProvider.uint256(), TypeProvider.uint128(), TypeProvider.uint64(), TypeProvider.uint32(), TypeProvider.uint16(), TypeProvider.uint8()];
      case "uint128":
        return [TypeProvider.uint128(), TypeProvider.uint64(), TypeProvider.uint32(), TypeProvider.uint16(), TypeProvider.uint8()];
      case "uint64":
        return [TypeProvider.uint64(), TypeProvider.uint32(), TypeProvider.uint16(), TypeProvider.uint8()];
      case "uint32":
        return [TypeProvider.uint32(), TypeProvider.uint16(), TypeProvider.uint8()];
      case "uint16":
        return [TypeProvider.uint16(), TypeProvider.uint8()];
      case "uint8":
        return [TypeProvider.uint8()];
      case "int256":
        return [TypeProvider.int256(), TypeProvider.int128(), TypeProvider.int64(), TypeProvider.int32(), TypeProvider.int16(), TypeProvider.int8()];
      case "int128":
        return [TypeProvider.int128(), TypeProvider.int64(), TypeProvider.int32(), TypeProvider.int16(), TypeProvider.int8()];
      case "int64":
        return [TypeProvider.int64(), TypeProvider.int32(), TypeProvider.int16(), TypeProvider.int8()];
      case "int32":
        return [TypeProvider.int32(), TypeProvider.int16(), TypeProvider.int8()];
      case "int16":
        return [TypeProvider.int16(), TypeProvider.int8()];
      case "int8":
        return [TypeProvider.int8()];
      case "address":
        if (this.stateMutability === "payable") {
          return [TypeProvider.address()];
        }
        else if (this.stateMutability === "nonpayable") {
          return [TypeProvider.payable_address(), TypeProvider.address()];
        }
        else {
          assert(false, `Elementary::_sub: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [new ElementaryType("bool", this.stateMutability)];
      case "string":
        return [new ElementaryType("string", this.stateMutability)];
      case "bytes":
        return [new ElementaryType("bytes", this.stateMutability)];
    }
  }

  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }

  supers() : Type[] {
    switch (this.name) {
      case "uint256":
        return [TypeProvider.uint256()];
      case "uint128":
        return [TypeProvider.uint256(), TypeProvider.uint128()];
      case "uint64":
        return [TypeProvider.uint256(), TypeProvider.uint128(), TypeProvider.uint64()];
      case "uint32":
        return [TypeProvider.uint256(), TypeProvider.uint128(), TypeProvider.uint64(), TypeProvider.uint32()];
      case "uint16":
        return [TypeProvider.uint256(), TypeProvider.uint128(), TypeProvider.uint64(), TypeProvider.uint32(), TypeProvider.uint16()];
      case "uint8":
        return [TypeProvider.uint256(), TypeProvider.uint128(), TypeProvider.uint64(), TypeProvider.uint32(), TypeProvider.uint16(), TypeProvider.uint8()];
      case "int256":
        return [TypeProvider.int256()];
      case "int128":
        return [TypeProvider.int256(), TypeProvider.int128()];
      case "int64":
        return [TypeProvider.int256(), TypeProvider.int128(), TypeProvider.int64()];
      case "int32":
        return [TypeProvider.int256(), TypeProvider.int128(), TypeProvider.int64(), TypeProvider.int32()];
      case "int16":
        return [TypeProvider.int256(), TypeProvider.int128(), TypeProvider.int64(), TypeProvider.int32(), TypeProvider.int16()];
      case "int8":
        return [TypeProvider.int256(), TypeProvider.int128(), TypeProvider.int64(), TypeProvider.int32(), TypeProvider.int16(), TypeProvider.int8()];
      case "address":
        if (this.stateMutability === "payable") {
          return [TypeProvider.payable_address(), TypeProvider.address()];
        }
        else if (this.stateMutability === "nonpayable") {
          return [TypeProvider.payable_address()];
        }
        else {
          assert(false, `Elementary::_sub: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [new ElementaryType("bool", this.stateMutability)];
      case "string":
        return [new ElementaryType("string", this.stateMutability)];
      case "bytes":
        return [new ElementaryType("bytes", this.stateMutability)];
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
        if (this.stateMutability === "payable") {
          return true;
        }
        else if (this.stateMutability === "nonpayable") {
          if (et.stateMutability === "nonpayable") return true;
          return false;
        }
      case "bool":
        if (this.name === "bool") return true;
        return false
      case "string":
        if (this.name === "string") return true;
        return false;
      case "bytes":
        if (this.name === "bytes") return true;
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
        if (this.stateMutability === "payable") {
          if (et.stateMutability === "payable") return true;
          return false;
        }
        else if (this.stateMutability === "nonpayable") {
          return true;
        }
      case "bool":
        if (this.name === "bool") return true;
        return false
      case "string":
        if (this.name === "string") return true;
        return false;
      case "bytes":
        if (this.name === "bytes") return true;
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
    return cartesianProduct(this.types.map(x => x.subs())).map(x => new UnionType(x));
  }
  sub_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subs().filter(x => x.issuperof(lower_bound));
  }
  supers() : Type[] {
    return cartesianProduct(this.types.map(x => x.supers())).map(x => new UnionType(x));
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

export const irnode2types = new Map<number, Type[]>();

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
uinteger_types = pickRandomSubarray(uinteger_types, config.uint_num);
integer_types = pickRandomSubarray(integer_types, config.int_num);
export const all_integer_types : Type[] = integer_types.concat(uinteger_types);
export const bool_types : Type[] = [TypeProvider.bool()];
export const address_types : Type[] = [TypeProvider.address(), TypeProvider.payable_address()];
export const elementary_types : Type[] = all_integer_types.concat(bool_types).concat(address_types);

export const type_range_collection : Type[][] = [
  all_integer_types,
  bool_types,
  address_types
];

export let mapping_types : Type[] = [];
export let function_types : Type[] = [];
export let array_types : Type[] = [];

//TODO: need to be updated later
export function generate_all_mapping_types() : Type[] {
  const all_types_for_k = elementary_types;
  const all_types_for_v = elementary_types.concat(function_types)
    .concat(array_types)
    .concat(mapping_types);
  const collection : Type[] = new Array(all_types_for_k.length * all_types_for_v.length);
  all_types_for_k.forEach((k, i) => {
    all_types_for_v.forEach((v, j) => {
      collection[i * all_types_for_v.length + j] = new MappingType(k, v);
    });
  });
  return collection;
}

export function generate_all_function_types() : Type[] {
  let collection : Type[] = [];
  let all_visibility : ("public" | "internal" | "external" | "private")[] = ["public", "internal", "external", "private"];
  let all_stateMutability : ("pure" | "view" | "payable" | "nonpayable")[] = ["pure", "view", "payable", "nonpayable"];
  const all_available_types = elementary_types.concat(function_types)
    .concat(array_types)
    .concat(mapping_types);
  for (let visibility of all_visibility) {
    for (let stateMutability of all_stateMutability) {
      const parameterTypes = lazyPickRandomElement(all_available_types);
      const returnTypes = lazyPickRandomElement(all_available_types);
      collection.push(new FunctionType(visibility, stateMutability,
        new UnionType(parameterTypes === undefined ? [] : [parameterTypes]),
        new UnionType(returnTypes === undefined ? [] : [returnTypes])));
    }
  }
  return collection;
}

//TODO: need to be updated later
export function generate_all_array_types() : Type[] {
  const all_available_types = elementary_types.concat(function_types)
    .concat(array_types)
    .concat(mapping_types);
  //TODO: allow super big length
  const available_length = [1, 2, 3, 4, 5];
  const collection : Type[] = new Array(all_available_types.length);
  all_available_types.forEach((v, i) => {
    collection[i] = new ArrayType(v, pickRandomElement(available_length));
  });
  return collection;
}

// for (let i = 0; i < type_complex_level; i++) {
//   mapping_types = mapping_types.concat(generate_all_mapping_types());
//   function_types = function_types.concat(generate_all_function_types());
//   array_types = array_types.concat(generate_all_array_types());
// }

export function includesType(arr : Type[], item : Type) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}

export const all_types = elementary_types.concat(mapping_types).concat(function_types).concat(array_types);

export function isSuperTypeSet(set : Type[], subset : Type[]) : boolean {
  for (const element of subset) {
    if (!includesType(set, element)) {
      return false;
    }
  }
  return true;
}

export function isEqualTypeSet(s1 : Type[], s2 : Type[]) : boolean {
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

export const size_of_type = sizeof(elementary_types[0]);