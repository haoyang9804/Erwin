import { stat } from "fs";
import { assert } from "./utility";

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
  abstract from_str(str: string): Type;
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
  from_str(str: string): Type {
    let segs = str.split(" ");
    assert(segs.length === 2, "ElementaryType: from_str: invalid str: " + str);
    this.name = segs[0] as "uint256" | "uint128" | "uint64" | "uint32" | "uint16" | "uint8" | "address" | "bool" | "string" | "bytes";
    this.stateMutability = segs[1] as "nonpayable" | "payable";
    return this;
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
