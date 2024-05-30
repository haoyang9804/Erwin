import { assert, pickRandomElement, lazyPickRandomElement, cartesianProduct } from "./utility";
import { type_complex_level } from "./index";

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
  assert(t1.issubtypeof(t2) || t2.issubtypeof(t1), `upperType: t1 is not subtypeof t2 and t2 is not subtypeof t1`);
  return t1.issubtypeof(t2) ? t2 : t1;
}

export function lowerType(t1 : Type, t2 : Type) {
  assert(t1.kind === t2.kind, `upperType: t1.kind !== t2.kind`);
  assert(t1.issubtypeof(t2) || t2.issubtypeof(t1), `upperType: t1 is not subtypeof t2 and t2 is not subtypeof t1`);
  return t1.issupertypeof(t2) ? t2 : t1;
}


export abstract class Type {
  kind : TypeKind;
  constructor(kind : TypeKind) {
    this.kind = kind;
  }
  abstract str() : string;
  abstract subtype() : Type[];
  abstract subtype_with_lowerbound(lower_bound : Type) : Type[];
  abstract supertype() : Type[];
  abstract supertype_with_upperbound(upper_bound : Type) : Type[];
  abstract same(t : Type) : boolean;
  abstract copy() : Type;
  abstract issubtypeof(t : Type) : boolean;
  abstract issupertypeof(t : Type) : boolean;
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
  subtype() : Type[] {
    throw new Error("No subtype for EventType");
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No subtype for EventType");
  }
  supertype() : Type[] {
    throw new Error("No supertype for EventType");
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No supertype for EventType");
  }
  copy() : Type {
    return new EventType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.EventType;
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
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
  subtype() : Type[] {
    throw new Error("No subtype for ErrorType");
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No subtype for ErrorType");
  }
  supertype() : Type[] {
    throw new Error("No supertype for ErrorType");
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No supertype for ErrorType");
  }
  copy() : Type {
    return new EventType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ErrorType;
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
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
  subtype() : Type[] {
    throw new Error("No subtype for StructType");
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No subtype for StructType");
  }
  supertype() : Type[] {
    throw new Error("No supertype for StructType");
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No supertype for StructType");
  }
  copy() : Type {
    return new StructType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.StructType;
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
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
  subtype() : Type[] {
    throw new Error("No subtype for ContractType");
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    throw new Error("No subtype for ContractType");
  }
  supertype() : Type[] {
    throw new Error("No supertype for ContractType");
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    throw new Error("No supertype for ContractType");
  }
  copy() : Type {
    return new ContractType(this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ContractType;
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
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
    return new ElementaryType(this.name, this.stateMutability);
  }

  subtype() : Type[] {
    switch (this.name) {
      case "uint256":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "uint128":
        return [new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "uint64":
        return [new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "uint32":
        return [new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "uint16":
        return [new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "uint8":
        return [new ElementaryType("uint8", this.stateMutability)];
      case "int256":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "int128":
        return [new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "int64":
        return [new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "int32":
        return [new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "int16":
        return [new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "int8":
        return [new ElementaryType("int8", this.stateMutability)];
      case "address":
        if (this.stateMutability === "payable") {
          return [new ElementaryType("address", "payable")];
        }
        else if (this.stateMutability === "nonpayable") {
          return [new ElementaryType("address", "nonpayable"), new ElementaryType("address", "payable")];
        }
        else {
          assert(false, `Elementary::subtype: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [new ElementaryType("bool", this.stateMutability)];
      case "string":
        return [new ElementaryType("string", this.stateMutability)];
      case "bytes":
        return [new ElementaryType("bytes", this.stateMutability)];
    }
  }

  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subtype().filter(x => x.issupertypeof(lower_bound));
  }

  supertype() : Type[] {
    switch (this.name) {
      case "uint256":
        return [new ElementaryType("uint256", this.stateMutability)];
      case "uint128":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability)];
      case "uint64":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability)];
      case "uint32":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability)];
      case "uint16":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability)];
      case "uint8":
        return [new ElementaryType("uint256", this.stateMutability), new ElementaryType("uint128", this.stateMutability), new ElementaryType("uint64", this.stateMutability), new ElementaryType("uint32", this.stateMutability), new ElementaryType("uint16", this.stateMutability), new ElementaryType("uint8", this.stateMutability)];
      case "int256":
        return [new ElementaryType("int256", this.stateMutability)];
      case "int128":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability)];
      case "int64":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability)];
      case "int32":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability)];
      case "int16":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability)];
      case "int8":
        return [new ElementaryType("int256", this.stateMutability), new ElementaryType("int128", this.stateMutability), new ElementaryType("int64", this.stateMutability), new ElementaryType("int32", this.stateMutability), new ElementaryType("int16", this.stateMutability), new ElementaryType("int8", this.stateMutability)];
      case "address":
        if (this.stateMutability === "payable") {
          return [new ElementaryType("address", "nonpayable"), new ElementaryType("address", "payable")];
        }
        else if (this.stateMutability === "nonpayable") {
          return [new ElementaryType("address", "nonpayable")];
        }
        else {
          assert(false, `Elementary::subtype: unrecognized stateMutability: ${this.stateMutability}`);
        }
      case "bool":
        return [new ElementaryType("bool", this.stateMutability)];
      case "string":
        return [new ElementaryType("string", this.stateMutability)];
      case "bytes":
        return [new ElementaryType("bytes", this.stateMutability)];
    }
  }

  supertype_with_upperbound(upper_bound : Type) : Type[] {
    return this.supertype().filter(x => x.issubtypeof(upper_bound));
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

  issupertypeof(t : Type) : boolean {
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

  issubtypeof(t : Type) : boolean {
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
  subtype() : Type[] {
    return cartesianProduct(this.types.map(x => x.subtype())).map(x => new UnionType(x));
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subtype().filter(x => x.issupertypeof(lower_bound));
  }
  supertype() : Type[] {
    return cartesianProduct(this.types.map(x => x.supertype())).map(x => new UnionType(x));
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    return this.supertype().filter(x => x.issubtypeof(upper_bound));
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if ((t as UnionType).types.length !== this.types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].same((t as UnionType).types[i])) return false;
    }
    return true;
  }
  issubtypeof(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if (this.types.length !== (t as UnionType).types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].issubtypeof((t as UnionType).types[i])) return false;
    }
    return true;
  }
  issupertypeof(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if (this.types.length !== (t as UnionType).types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].issupertypeof((t as UnionType).types[i])) return false;
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
  subtype() : Type[] {
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
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subtype().filter(x => x.issupertypeof(lower_bound));
  }
  supertype() : Type[] {
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
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    return this.supertype().filter(x => x.issubtypeof(upper_bound));
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

  issubtypeof(t : Type) : boolean {
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

  issupertypeof(t : Type) : boolean {
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
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    return this.supertype().filter(x => x.issubtypeof(upper_bound));
  }
  supertype() : Type[] {
    return [this.copy()];
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subtype().filter(x => x.issupertypeof(lower_bound));
  }
  subtype() : Type[] {
    return [this.copy()];
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.ArrayType) return false;
    if ((t as ArrayType).base.same(this.base) && (t as ArrayType).length === this.length) {
      return true;
    }
    return false;
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
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
  subtype() : Type[] {
    return [this.copy()];
  }
  subtype_with_lowerbound(lower_bound : Type) : Type[] {
    return this.subtype().filter(x => x.issupertypeof(lower_bound));
  }
  supertype() : Type[] {
    return [this.copy()];
  }
  supertype_with_upperbound(upper_bound : Type) : Type[] {
    return this.supertype().filter(x => x.issubtypeof(upper_bound));
  }
  issubtypeof(t : Type) : boolean {
    return this.same(t);
  }
  issupertypeof(t : Type) : boolean {
    return this.same(t);
  }
}


export const irnode2types = new Map<number, Type[]>();

export const elementary_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
  new ElementaryType("int256", "nonpayable"),
  new ElementaryType("int128", "nonpayable"),
  new ElementaryType("int64", "nonpayable"),
  new ElementaryType("int32", "nonpayable"),
  new ElementaryType("int16", "nonpayable"),
  new ElementaryType("int8", "nonpayable"),
  new ElementaryType("address", "payable"),
  new ElementaryType("address", "nonpayable"),
  new ElementaryType("bool", "nonpayable"),
  new ElementaryType("string", "nonpayable"),
  new ElementaryType("bytes", "nonpayable"),
]

export const literal_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
  new ElementaryType("int256", "nonpayable"),
  new ElementaryType("int128", "nonpayable"),
  new ElementaryType("int64", "nonpayable"),
  new ElementaryType("int32", "nonpayable"),
  new ElementaryType("int16", "nonpayable"),
  new ElementaryType("int8", "nonpayable"),
  new ElementaryType("address", "payable"),
  new ElementaryType("address", "nonpayable"),
  new ElementaryType("bool", "nonpayable"),
]

export const integer_types : Type[] = [
  new ElementaryType("int256", "nonpayable"),
  new ElementaryType("int128", "nonpayable"),
  new ElementaryType("int64", "nonpayable"),
  new ElementaryType("int32", "nonpayable"),
  new ElementaryType("int16", "nonpayable"),
  new ElementaryType("int8", "nonpayable"),
]

export const uinteger_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
]

export const all_integer_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
  new ElementaryType("int256", "nonpayable"),
  new ElementaryType("int128", "nonpayable"),
  new ElementaryType("int64", "nonpayable"),
  new ElementaryType("int32", "nonpayable"),
  new ElementaryType("int16", "nonpayable"),
  new ElementaryType("int8", "nonpayable")
]

export let mapping_types : Type[] = [];
export let function_types : Type[] = [];
export let array_types : Type[] = [];

//TODO: need to be updated later
function generate_all_mapping_types() : Type[] {
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

function generate_all_function_types() : Type[] {
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
function generate_all_array_types() : Type[] {
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

for (let i = 0; i < type_complex_level; i++) {
  mapping_types = mapping_types.concat(generate_all_mapping_types());
  function_types = function_types.concat(generate_all_function_types());
  array_types = array_types.concat(generate_all_array_types());
}

export function includesType(arr : Type[], item : Type) : boolean {
  for (const element of arr) {
    if (element.kind === item.kind && element.same(item)) {
      return true;
    }
  }
  return false;
}

export const all_types = elementary_types.concat(mapping_types).concat(function_types).concat(array_types);