import { stat } from "fs";
import { assert, pickRandomElement, lazyPickRandomElement } from "./utility";

export enum TypeKind {
  ElementaryType, // uint256, address, boolean,
  FunctionType, // function (uint256) pure external returns (uint256)
  ArrayType, // uint256[2], address[2], boolean[2]
  MappingType, // mapping(uint256 => address), mapping(uint256 => boolean)
  UserDefinedType // contract, struct, enum, library
}

export abstract class Type {
  kind : TypeKind;
  constructor(kind : TypeKind) {
    this.kind = kind;
  }
  abstract str() : string;
  abstract subtype() : Type[];
  abstract supertype() : Type[];
  abstract same(t : Type) : boolean
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
    return this.name + " " + this.stateMutability;
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
          return [new ElementaryType("address", "payable")];
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

}

export class FunctionType extends Type {
  visibility : "public" | "internal" | "external" | "private" = "public";
  stateMutability : "pure" | "view" | "payable" | "nonpayable" = "nonpayable";
  parameterTypes : Type[] = [];
  returnTypes : Type[] = [];
  constructor(visibility : "public" | "internal" | "external" | "private" = "public", stateMutability : "pure" | "view" | "payable" | "nonpayable" = "nonpayable",
    parameterTypes : Type[] = [], returnTypes : Type[] = []) {
    super(TypeKind.FunctionType);
    this.visibility = visibility;
    this.stateMutability = stateMutability;
    this.parameterTypes = parameterTypes;
    this.returnTypes = returnTypes;
  }
  str() : string {
    return `function (${this.parameterTypes.map(x => x.str()).join(", ")}) ${this.stateMutability} ${this.visibility} returns (${this.returnTypes.map(x => x.str()).join(", ")})`;
  }
  parameterTypes_str() : string {
    return this.parameterTypes.map(x => x.str()).join(", ");
  }
  returnTypes_str() : string {
    return this.returnTypes.map(x => x.str()).join(", ");
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

  same(t : Type) : boolean {
    if (t.kind !== TypeKind.FunctionType) return false;
    if ((t as FunctionType).stateMutability === this.stateMutability
      && (t as FunctionType).visibility === this.visibility
      && (t as FunctionType).returnTypes.length === this.returnTypes.length
      && (t as FunctionType).parameterTypes.length === this.parameterTypes.length
      && (t as FunctionType).parameterTypes_str() === this.parameterTypes_str()
      && (t as FunctionType).returnTypes_str() === this.returnTypes_str()) {
      return true;
    }
    return false;
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
  myself() : Type {
    return new ArrayType(this.base, this.length);
  }
  str() : string {
    return `${this.base.str()}[${this.length}]`;
  }
  supertype() : Type[] {
    return [this.myself()];
  }
  subtype() : Type[] {
    return [this.myself()];
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.ArrayType) return false;
    if ((t as ArrayType).base.same(this.base) && (t as ArrayType).length === this.length) {
      return true;
    }
    return false;
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
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.MappingType) return false;
    if ((t as MappingType).kType.same(this.kType) && (t as MappingType).vType.same(this.vType)) {
      return true;
    }
    return false;
  }
  myself() : Type {
    return new MappingType(this.kType, this.vType);
  }
  subtype() : Type[] {
    return [this.myself()];
  }
  supertype() : Type[] {
    return [this.myself()];
  }
}

export const varID2Types = new Map<number, Type[]>();

export const all_elementary_types : Type[] = [
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

export const all_integer_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
]

export let all_mapping_types : Type[] = [];
export let all_function_types : Type[] = [];
export let all_array_types : Type[] = [];
export let all_user_defined_types : Type[] = [];

//TODO: need to be updated later
function generate_all_mapping_types() : Type[] {
  const all_types_for_k = all_elementary_types;
  const all_types_for_v = all_elementary_types.concat(all_function_types)
    .concat(all_array_types)
    .concat(all_mapping_types)
    .concat(all_user_defined_types);
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
  const all_available_types = all_elementary_types.concat(all_function_types)
    .concat(all_array_types)
    .concat(all_mapping_types)
    .concat(all_user_defined_types);
  for (let visibility of all_visibility) {
    for (let stateMutability of all_stateMutability) {
      const parameterTypes = lazyPickRandomElement(all_available_types);
      const returnTypes = lazyPickRandomElement(all_available_types);
      collection.push(new FunctionType(visibility, stateMutability,
        parameterTypes === undefined ? [] : [parameterTypes],
        returnTypes === undefined ? [] : [returnTypes]));
    }
  }
  return collection;
}

//TODO: need to be updated later
function generate_all_array_types() : Type[] {
  const all_available_types = all_elementary_types.concat(all_function_types)
    .concat(all_array_types)
    .concat(all_mapping_types)
    .concat(all_user_defined_types);
  //TODO: allow super big length
  const available_length = [1, 2, 3, 4, 5];
  const collection : Type[] = new Array(all_available_types.length);
  all_available_types.forEach((v, i) => {
    collection[i] = new ArrayType(v, pickRandomElement(available_length));
  });
  return collection;
}

for (let i = 0; i < 3; i++) {
  all_mapping_types = all_mapping_types.concat(generate_all_mapping_types());
  all_function_types = all_function_types.concat(generate_all_function_types());
  all_array_types = all_array_types.concat(generate_all_array_types());
}