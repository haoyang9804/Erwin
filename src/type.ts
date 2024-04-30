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
  // abstract from_str(str: string): Type;
  abstract subtype(): Type[];
  abstract supertype(): Type[];
}

export class ElementaryType extends Type {
  // uint256, address, boolean, etc
  name : "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "string" | "bytes";
  /**
   * Can be set to `payable` if the type is `address`.
   * Otherwise the value is always `nonpayable`.
   */

  stateMutability : "nonpayable" | "payable";
  constructor(name : "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "string" | "bytes" = "uint256", stateMutability : "nonpayable" | "payable" = "nonpayable") {
    super(TypeKind.ElementaryType);
    assert(!(name !== "address" && stateMutability === "payable"), `ElementaryType: cannot set stateMutability to payable if name is not address`);
    this.name = name;
    this.stateMutability = stateMutability;
  }
  str() : string {
    return this.name + " " + this.stateMutability;
  }
  // from_str(str: string): Type {
  //   let segs = str.split(" ");
  //   assert(segs.length === 2, "ElementaryType: from_str: invalid str: " + str);
  //   this.name = segs[0] as "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "string" | "bytes";
  //   this.stateMutability = segs[1] as "nonpayable" | "payable";
  //   return this;
  // }
  subtype(): Type[] {
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

  supertype(): Type[] {
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

}

export class FunctionType extends Type {
  visibility: "public" | "internal" | "external" | "private" = "public";
  stateMutability: "pure" | "view" | "payable" | "nonpayable" = "nonpayable";
  parameterTypes: Type[] = [];
  returnTypes: Type[] = [];
  constructor(visibility: "public" | "internal" | "external" | "private" = "public", stateMutability: "pure" | "view" | "payable" | "nonpayable" = "nonpayable",
     parameterTypes: Type[] = [], returnTypes: Type[] = []) {
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
  subtype(): Type[] {
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
  supertype(): Type[] {
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
}

export const varID2Types = new Map<number, Type[]>();

export const all_elementary_types : Type[] = [
  new ElementaryType("uint256", "nonpayable"),
  new ElementaryType("uint128", "nonpayable"),
  new ElementaryType("uint64", "nonpayable"),
  new ElementaryType("uint32", "nonpayable"),
  new ElementaryType("uint16", "nonpayable"),
  new ElementaryType("uint8", "nonpayable"),
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

function generate_all_function_types() : Type[] {
  let all_function_types : Type[] = [];
  let all_visibility: ("public" | "internal" | "external" | "private")[] = ["public", "internal", "external", "private"];
  let all_stateMutability: ("pure" | "view" | "payable" | "nonpayable")[] = ["pure", "view", "payable", "nonpayable"];
  for (let visibility of all_visibility) {
    for (let stateMutability of all_stateMutability) {
      const parameterTypes = lazyPickRandomElement(all_elementary_types);
      const returnTypes = lazyPickRandomElement(all_elementary_types);
      all_function_types.push(new FunctionType(visibility, stateMutability,
        parameterTypes === undefined ? [] : [parameterTypes],
        returnTypes === undefined ? [] : [returnTypes]));
    }
  }
  return all_function_types;
}

export const all_function_types = generate_all_function_types();