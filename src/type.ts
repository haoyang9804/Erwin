import { assert, cartesian_product, pick_random_subarray, merge_set } from "./utility";
import { sizeof } from "sizeof";
import { config } from './config';
import { decl_db } from "./db";
import { type_dag, ConstraintNode } from "./constraint";

export enum TypeKind {
  ElementaryType = "TypeKind::ElementaryType",
  FunctionType = "TypeKind::FunctionType",
  ArrayType = "TypeKind::ArrayType",
  MappingType = "TypeKind::MappingType",
  UnionType = "TypeKind::UnionType",
  StructType = "TypeKind::StructType",
  ContractType = "TypeKind::ContractType",
  StringType = "TypeKind::StringType",
  PlaceholderType = "TypeKind::PlaceholderType"
}

export abstract class Type extends ConstraintNode<TypeKind> { }

export class PlaceholderType extends Type {
  constructor() {
    super(TypeKind.PlaceholderType);
  }
  str() : string {
    return "_";
  }
  copy() : Type {
    throw new Error("PlaceholderType::copy() not implemented.");
  }
  subs() : Type[] {
    return [TypeProvider.placeholder()];
  }
  supers() : Type[] {
    return [TypeProvider.placeholder()];
  }
  same(t : Type) : boolean {
    return t === TypeProvider.placeholder();
  }
}

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
  remove_sub(subs : UserDefinedType) : void {
    this._subs = this._subs.filter(x => x !== subs);
  }
  add_super(supers : UserDefinedType) : void {
    this._supers.push(supers);
  }
  remove_super(supers : UserDefinedType) : void {
    this._supers = this._supers.filter(x => x !== supers);
  }
  type_range() : UserDefinedType[] {
    return [...merge_set(new Set<UserDefinedType>(this._subs), new Set<UserDefinedType>(this._supers))];
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
  supers() : Type[] {
    return this._supers;
  }
  copy() : Type {
    return new StructType(this.referece_id, this.name, this.type_str);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.StructType && (t as StructType).name === this.name;
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
  supers() : Type[] {
    return this._supers;
  }
  copy() : Type {
    return new ContractType(this.referece_id, this.name);
  }
  same(t : Type) : boolean {
    return t.kind === TypeKind.ContractType && (t as ContractType).name === this.name;
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
  supers() : Type[] {
    return cartesian_product(this.types.map(x => x.supers())).map(x => new UnionType(x));
  }
  same(t : Type) : boolean {
    if (t.kind !== TypeKind.UnionType) return false;
    if ((t as UnionType).types.length !== this.types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (!this.types[i].same((t as UnionType).types[i])) return false;
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
}

export class ArrayType extends Type {
  base : Type;
  length : number | undefined = undefined;
  constructor(base : Type, length : number | undefined = undefined) {
    super(TypeKind.ArrayType);
    this.base = base;
    this.length = length;
  }
  str() : string {
    if (this.length === undefined) {
      return `${this.base.str()}[]`;
    }
    return `${this.base.str()}[${this.length}]`;
  }
  copy() : Type {
    throw new Error("ArrayType::copy() not implemented.");
  }
  supers() : Type[] {
    if (this === TypeProvider.trivial_array()) return [this];
    const base_supers = this.base.supers();
    return base_supers.map(x => new ArrayType(x, this.length));
  }
  subs() : Type[] {
    if (this === TypeProvider.trivial_array()) return [this];
    const base_subs = this.base.subs();
    return base_subs.map(x => new ArrayType(x, this.length));
  }
  same(t : Type) : boolean {
    if (t === TypeProvider.trivial_array()) return true;
    if (t.kind !== TypeKind.ArrayType) return false;
    if ((t as ArrayType).base.same(this.base) && (t as ArrayType).length === this.length) {
      return true;
    }
    if (this === TypeProvider.trivial_array() && t.kind === TypeKind.ArrayType) return true;
    return false;
  }
}

export class MappingType extends Type {
  kType : Type;
  vType : Type;
  constructor(kType : Type, vType : Type) {
    super(TypeKind.MappingType);
    assert(kType.kind !== TypeKind.StructType, `MappingType: key type cannot be struct`);
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
    return t.kind === TypeKind.MappingType &&
      (t as MappingType).kType.same(this.kType) &&
      (t as MappingType).vType.same(this.vType) ||
      t === TypeProvider.trivial_mapping() ||
      this === TypeProvider.trivial_mapping() &&
      t.kind === TypeKind.MappingType;
  }
  subs() : Type[] {
    return [this];
  }
  supers() : Type[] {
    return [this];
  }
}

export class StringType extends Type {
  constructor() {
    super(TypeKind.StringType);
  }
  str() : string {
    return "string";
  }
  copy() : Type {
    return new StringType();
  }
  same(t : Type) : boolean {
    return t === TypeProvider.string();
  }
  subs() : Type[] {
    return [this];
  }
  supers() : Type[] {
    return [this];
  }
}

export class TypeProvider {
  static int256() : ElementaryType { return this.m_int256; }
  static int128() : ElementaryType { return this.m_int128; }
  static int64() : ElementaryType { return this.m_int64; }
  static int32() : ElementaryType { return this.m_int32; }
  static int16() : ElementaryType { return this.m_int16; }
  static int8() : ElementaryType { return this.m_int8; }
  static uint256() : ElementaryType { return this.m_uint256; }
  static uint128() : ElementaryType { return this.m_uint128; }
  static uint64() : ElementaryType { return this.m_uint64; }
  static uint32() : ElementaryType { return this.m_uint32; }
  static uint16() : ElementaryType { return this.m_uint16; }
  static uint8() : ElementaryType { return this.m_uint8; }
  static bool() : ElementaryType { return this.m_bool; }
  static address() : ElementaryType { return this.m_address; }
  static payable_address() : ElementaryType { return this.m_payable_address; }
  static placeholder() : PlaceholderType { return this.m_placeholder; }
  static trivial_mapping() : MappingType { return this.m_mapping; }
  static trivial_array() : ArrayType { return this.m_array; }
  static string() : StringType { return this.m_string; }
  private static m_string : StringType = new StringType();
  private static m_placeholder : PlaceholderType = new PlaceholderType();
  private static m_mapping : MappingType = new MappingType(this.m_placeholder, this.m_placeholder);
  private static m_array : ArrayType = new ArrayType(this.m_placeholder, undefined);
  private static m_int256 : ElementaryType = new ElementaryType("int256", "nonpayable");
  private static m_int128 : ElementaryType = new ElementaryType("int128", "nonpayable");
  private static m_int64 : ElementaryType = new ElementaryType("int64", "nonpayable");
  private static m_int32 : ElementaryType = new ElementaryType("int32", "nonpayable");
  private static m_int16 : ElementaryType = new ElementaryType("int16", "nonpayable");
  private static m_int8 : ElementaryType = new ElementaryType("int8", "nonpayable");
  private static m_uint256 : ElementaryType = new ElementaryType("uint256", "nonpayable");
  private static m_uint128 : ElementaryType = new ElementaryType("uint128", "nonpayable");
  private static m_uint64 : ElementaryType = new ElementaryType("uint64", "nonpayable");
  private static m_uint32 : ElementaryType = new ElementaryType("uint32", "nonpayable");
  private static m_uint16 : ElementaryType = new ElementaryType("uint16", "nonpayable");
  private static m_uint8 : ElementaryType = new ElementaryType("uint8", "nonpayable");
  private static m_bool : ElementaryType = new ElementaryType("bool", "nonpayable");
  private static m_address : ElementaryType = new ElementaryType("address", "nonpayable");
  private static m_payable_address : ElementaryType = new ElementaryType("address", "payable");
}

export let integer_types : Type[] = [
  TypeProvider.int256(),
  TypeProvider.int128(),
  TypeProvider.int64(),
  TypeProvider.int32(),
  TypeProvider.int16(),
  TypeProvider.int8()
];

export let uinteger_types : Type[] = [
  TypeProvider.uint256(),
  TypeProvider.uint128(),
  TypeProvider.uint64(),
  TypeProvider.uint32(),
  TypeProvider.uint16(),
  TypeProvider.uint8()
];

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

export function contain_mapping_type(type : Type) : boolean {
  if (type.kind === TypeKind.MappingType) return true;
  if (type.kind === TypeKind.ArrayType) {
    return contain_mapping_type((type as ArrayType).base);
  }
  if (type.kind === TypeKind.UnionType) {
    return (type as UnionType).types.some(x => contain_mapping_type(x));
  }
  if (type.kind === TypeKind.FunctionType) {
    return contain_mapping_type((type as FunctionType).parameterTypes) || contain_mapping_type((type as FunctionType).returnTypes);
  }
  if (type.kind === TypeKind.StructType) {
    for (const member of decl_db.members_of_struct_decl((type as StructType).referece_id)) {
      for (const t of type_dag.solution_range.get(member)!) {
        if (contain_mapping_type(t)) return true;
      }
    }
    return false;
  }
  if (type.kind === TypeKind.ContractType) {
    return false;
  }
  if (type.kind === TypeKind.ElementaryType) {
    return false;
  }
  if (type.kind === TypeKind.PlaceholderType) {
    return false;
  }
  if (type.kind === TypeKind.StringType) {
    return false;
  }
  throw new Error(`contain_mapping_type: unrecognized type kind: ${type.kind}`);
}

export function all_mapping(types : Type[]) : boolean {
  return types.every(x => x.kind === TypeKind.MappingType);
}

export function all_array(types : Type[]) : boolean {
  return types.every(x => x.kind === TypeKind.ArrayType);
}

export function contains_trivial_mapping(types : Type[]) : boolean {
  return types.some(x => x === TypeProvider.trivial_mapping());
}

export function contains_trivial_array(types : Type[]) : boolean {
  return types.some(x => x === TypeProvider.trivial_array());
}