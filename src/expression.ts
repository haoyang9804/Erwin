import {
  LiteralKind,
  Expression,
  FunctionCallKind,
} from "solc-typed-ast"

import { assert, generate_random_string, str2hex, random_bigInt } from "./utility";
import { TypeKind, Type, ElementaryType, ContractType, StructType, MappingType, ArrayType, StringType } from "./type";
import { IRNode, factory } from "./node";
import { IRModifier, IRVariableDeclaration } from "./declaration";
import { config } from "./config";

export abstract class IRExpression extends IRNode {
  constructor(id : number, scope : number) {
    super(id, scope);
  }
  abstract lower() : Expression;
}

export class IRLiteral extends IRExpression {
  type : Type | undefined;
  kind : LiteralKind | undefined;
  value : string | undefined;
  fixed_value : boolean = false;
  str : string | undefined;
  mustBeNegaitive : boolean = false;
  mustHaveIntTypeConversion : boolean = false;
  constructor(id : number, scope : number, value ?: string,
    mustBeNegaitive ?: boolean, mustHaveIntTypeConversion ?: boolean) {
    super(id, scope);
    this.value = value;
    if (mustBeNegaitive !== undefined)
      this.mustBeNegaitive = mustBeNegaitive;
    if (mustHaveIntTypeConversion !== undefined)
      this.mustHaveIntTypeConversion = mustHaveIntTypeConversion;
  }
  private generateKind() : void {
    const type = this.type as ElementaryType;
    if (type.str() === "bool") {
      this.kind = LiteralKind.Bool;
    }
    else if (type.str() !== "bytes" && type.str() !== "string") {
      this.kind = LiteralKind.Number;
    }
    //TODO: add support for UnicodeString and HexString
    else this.kind = LiteralKind.String;
  }
  private generateVal() : void {
    //TODO: add support for strange value, such as large number and overlong string, etc.
    switch (this.kind) {
      case LiteralKind.Bool:
        this.value = Math.random() > 0.5 ? "true" : "false";
        break;
      case LiteralKind.Number:
        const typename = (this.type! as ElementaryType).name;
        if (typename !== "address") {
          let bits;
          if (typename.startsWith("uint")) {
            bits = parseInt(typename.slice(4));
          }
          else {
            assert(typename.startsWith("int"), `IRLiteral: typename ${typename} is not supported`);
            bits = parseInt(typename.slice(3));
          }
          if (typename === "int256" || typename === "int128" || typename === "int64" ||
            typename === "int32" || typename === "int16" || typename === "int8") {
            this.value = random_bigInt(0n, (1n << BigInt(bits) - 1n)).toString();
            if (this.value[0] === "-") {
              this.value = this.value.slice(1);
            }
          }
          else {
            this.value = random_bigInt(0n, (1n << BigInt(bits))).toString();
            if (this.value[0] === "-") {
              this.value = this.value.slice(1);
            }
          }
          if (this.mustBeNegaitive) {
            this.value = "-" + this.value;
          }
          else {
            if (typename === "int256" || typename === "int128" || typename === "int64" ||
              typename === "int32" || typename === "int16" || typename === "int8") {
              this.value = "-" + this.value;
              this.mustHaveIntTypeConversion = true;
            }
          }
          if (typename.startsWith('uint')) {
            assert(this.value[0] !== "-",
              `IRLiteral: value is negaitive but the type is uint. mustBeNegaitive is ${this.mustBeNegaitive}, bits is ${bits}, ${1n << BigInt(bits)}`);
          }
        }
        else {
          function checksum_encode(hex_addr : string) : string {
            const createKeccakHash = require('keccak')
            const keccak256 = createKeccakHash("keccak256")
            let checksummed_buffer = ""
            // Treat the hex address as ascii/utf-8 for keccak256 hashing
            const hashed_address = keccak256.update(hex_addr).digest().toString("hex")
            // Iterate over each character in the hex address
            for (let nibble_index = 0; nibble_index < hex_addr.length; nibble_index++) {
              const character = hex_addr[nibble_index]
              if ("0123456789".includes(character)) {
                // We can't upper-case the decimal digits
                checksummed_buffer += character
              } else if ("abcdef".includes(character)) {
                // Check if the corresponding hex digit (nibble) in the hash is 8 or higher
                const hashed_address_nibble = parseInt(hashed_address[nibble_index], 16)
                // console.log(hashed_address_nibble, hashed_address[nibble_index])
                if (hashed_address_nibble > 7) {
                  checksummed_buffer += character.toUpperCase()
                } else {
                  checksummed_buffer += character
                }
              } else {
                throw new Error(
                  `Unrecognized hex character ${character} at position ${nibble_index}`
                )
              }
            }
            return "0x" + checksummed_buffer
          }
          function create_random_address() : string {
            const characters = "0123456789abcdef";
            let addr = "";
            for (let i = 0; i < 40; i++) {
              addr += characters[Math.floor(Math.random() * 16)];
            }
            return addr;
          }
          this.value = checksum_encode(create_random_address());

        }
        break;
      case LiteralKind.String:
        this.value = generate_random_string();
        break;
      default:
        assert(false, "IRLiteral: kind is not generated");
    }
  }
  lower() : Expression {
    assert(this.type !== undefined, `IRLiteral ${this.id}: type is not generated`);
    assert(this.type.kind === TypeKind.ElementaryType || this.type.kind === TypeKind.StringType,
      `IRLiteral ${this.id}: type is not ElementaryType or StringType, but ${this.type.kind}`);
    this.generateKind();
    if (this.value === undefined) this.generateVal();
    const value = this.value!;
    const kind = this.kind;
    const mustHaveIntTypeConversion = this.mustHaveIntTypeConversion;
    if (!config.unit_test_mode) {
      this.mustBeNegaitive = false;
      if (!this.fixed_value) {
        this.value = undefined;
      }
      this.kind = undefined;
      this.mustHaveIntTypeConversion = false;
    }
    if (this.type!.str() === "address payable") {
      return factory.makeFunctionCall("", FunctionCallKind.TypeConversion,
        factory.makeElementaryTypeNameExpression("", factory.makeElementaryTypeName("", "address", "payable")),
        [factory.makeLiteral("", kind!, str2hex(value!), value!)]);
    }
    if (mustHaveIntTypeConversion || (!config.unit_test_mode && Math.random() > 0.5)) {
      if (this.type!.kind === TypeKind.ElementaryType) {
        return factory.makeFunctionCall("", FunctionCallKind.TypeConversion,
          factory.makeElementaryTypeNameExpression("", factory.makeElementaryTypeName("", (this.type as ElementaryType).name, "nonpayable")),
          [factory.makeLiteral("", kind!, str2hex(value!), value!)]);
      }
      else if (this.type!.kind === TypeKind.StringType) {
        return factory.makeFunctionCall("", FunctionCallKind.TypeConversion,
          factory.makeElementaryTypeNameExpression("", factory.makeElementaryTypeName("", "string", "nonpayable")),
          [factory.makeLiteral("", kind!, str2hex(value!), value!)]);
      }
    }
    return factory.makeLiteral("", kind!, str2hex(value!), value!);
  }
}

export class IRIdentifier extends IRExpression {
  name : string | undefined;
  // The id of the referenced IRNode
  reference : number | undefined;
  constructor(id : number, scope : number, name ?: string, reference ?: number) {
    super(id, scope);
    this.name = name;
    this.reference = reference;
  }
  from(node : IRVariableDeclaration) {
    this.name = node.name;
    this.reference = node.id;
    return this;
  }
  lower() : Expression {
    assert(this.name !== undefined, "IRIdentifier: name is not generated");
    assert(this.reference !== undefined, "IRIdentifier: reference is not generated");
    return factory.makeIdentifier("", this.name!, this.reference!);
  }
}

export class IRAssignment extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  operator : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";
  constructor(id : number, scope : number, left : IRExpression, right : IRExpression, operator : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=") {
    super(id, scope);
    this.left = left;
    this.right = right;
    this.operator = operator;
  }
  lower() : Expression {
    return factory.makeAssignment("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}

export class IRBinaryOp extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  operator : string | undefined;
  constructor(id : number, scope : number, left : IRExpression, right : IRExpression, operator ?: string) {
    super(id, scope);
    this.left = left;
    this.right = right;
    if (operator !== undefined) {
      assert(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"].includes(operator),
        `IRBinaryOp: operator ${operator} is not supported`)
    }
    this.operator = operator;
  }
  lower() : Expression {
    assert(this.operator !== undefined, "IRBinaryOp: operator is not generated")
    return factory.makeBinaryOperation("", this.operator!, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}

export class IRUnaryOp extends IRExpression {
  prefix : boolean;
  expression : IRExpression;
  operator : string;
  //TODO: support useFunction
  useFunction : number | undefined;
  constructor(id : number, scope : number, prefix : boolean, expression : IRExpression, operator : string, useFunction ?: number) {
    super(id, scope);
    this.prefix = prefix;
    this.expression = expression;
    if (operator !== undefined) {
      assert(["!", "-", "~", "++", "--", "delete"].includes(operator), `IRUnaryOp: operator ${operator} is not supported`)
    }
    this.operator = operator;
    this.useFunction = useFunction;
    if (this.operator === "!" || this.operator === "~" || this.operator === "-" || this.operator === "delete") {
      this.prefix = true;
    }
  }
  lower() : Expression {
    assert(this.operator !== undefined, "IRUnaryOp: operator is not generated")
    return factory.makeUnaryOperation("", this.prefix, this.operator, this.expression.lower() as Expression);
  }
}

export class IRConditional extends IRExpression {
  condition : IRExpression;
  true_expression : IRExpression;
  false_expression : IRExpression;
  constructor(id : number, scope : number, condition : IRExpression, true_expression : IRExpression, false_expression : IRExpression) {
    super(id, scope);
    this.condition = condition;
    this.true_expression = true_expression;
    this.false_expression = false_expression;
  }
  lower() : Expression {
    return factory.makeConditional("", this.condition.lower() as Expression, this.true_expression.lower() as Expression, this.false_expression.lower() as Expression);
  }
}

export class IRFunctionCall extends IRExpression {
  kind : FunctionCallKind;
  //TODO: I think the type of function_expression can be further narrowed down
  function_expression : IRExpression;
  arguments : IRExpression[];
  constructor(id : number, scope : number, kind : FunctionCallKind, function_expression : IRExpression, arguments_ : IRExpression[]) {
    super(id, scope);
    this.kind = kind;
    this.function_expression = function_expression;
    this.arguments = arguments_;
  }
  lower() : Expression {
    return factory.makeFunctionCall("", this.kind, this.function_expression.lower() as Expression, this.arguments.map((arg) => arg.lower() as Expression));
  }
}

export class IRTuple extends IRExpression {
  isInlineArray : boolean | undefined;
  components : (IRExpression | null)[];
  constructor(id : number, scope : number, components : (IRExpression | null)[], isInlineArray ?: boolean) {
    super(id, scope);
    this.components = components;
    this.isInlineArray = isInlineArray;
  }
  lower() : Expression {
    const lowered_components = this.components.map(
      (component) => component !== null ? component!.lower() as Expression : component);
    return factory.makeTupleExpression("", this.isInlineArray === undefined ? false : true, lowered_components);
  }
}

export function tuple_extraction(tuple_expr : IRExpression) : IRExpression {
  let extracted_expression = tuple_expr;
  while (extracted_expression instanceof IRTuple) {
    assert(extracted_expression.components.length === 1,
      `tuple_extraction: extracted_expression.components.length is ${extracted_expression.components.length}`);
    extracted_expression = extracted_expression.components[0] as IRExpression;
  }
  return extracted_expression;
}

export class IRIndexedAccess extends IRExpression {
  base : IRExpression;
  /**
   * Access the index of an expression, e.g. `index` in `someArray[index]`.
   *
   * May be `undefined` if used with `abi.decode()`,
   * for example `abi.decode(data, uint[]);`.
   */
  indexed : IRExpression | undefined;
  constructor(id : number, scope : number, base : IRExpression, indexed ?: IRExpression) {
    super(id, scope);
    this.base = base;
    this.indexed = indexed;
  }
  lower() {
    return factory.makeIndexAccess("", this.base.lower() as Expression, this.indexed?.lower() as Expression);
  }
}

export class IRMemberAccess extends IRExpression {
  member_name : string;
  referenced_id : number;
  expression : IRExpression;
  constructor(id : number, scope : number, member_name : string, referenced_id : number, expression : IRExpression) {
    super(id, scope);
    this.expression = expression;
    this.referenced_id = referenced_id;
    this.member_name = member_name;
  }
  lower() {
    return factory.makeMemberAccess("", this.expression.lower() as Expression, this.member_name, this.referenced_id);
  }
}

export class IRNew extends IRExpression {
  type_name : string;
  constructor(id : number, scope : number, type_name : string) {
    super(id, scope);
    this.type_name = type_name;
  }
  lower() {
    return factory.makeNewExpression("", factory.makeUserDefinedTypeName("", this.type_name, -1));
  }
}

export class IRModifierInvoker extends IRNode {
  modifier_decl : IRModifier;
  arguments : IRExpression[];
  constructor(id : number, scope : number, modifier_decl : IRModifier, arguments_ : IRExpression[]) {
    super(id, scope);
    this.modifier_decl = modifier_decl;
    this.arguments = arguments_;
  }
  lower() {
    const modifier_identifier = factory.makeIdentifier("", this.modifier_decl.name, this.modifier_decl.id);
    return factory.makeModifierInvocation(modifier_identifier, this.arguments.map((arg) => arg.lower() as Expression));
  }
}

export class IRNewDynamicArray extends IRExpression {
  base_type : Type | undefined;
  length : IRExpression;
  base_id : number;
  constructor(id : number, scope : number, length : IRExpression, base_id : number) {
    super(id, scope);
    this.length = length;
    this.base_id = base_id;
  }
  type_to_str() : string {
    assert(this.base_type !== undefined, `IRNewDynamicArray ${this.id}: base_type is not generated`);
    if (this.base_type.kind === TypeKind.ElementaryType) {
      const base_type = this.base_type as ElementaryType;
      return base_type.str();
    }
    if (this.base_type.kind === TypeKind.ContractType) {
      const base_type = this.base_type as ContractType;
      return base_type.name;
    }
    if (this.base_type.kind === TypeKind.StructType) {
      const base_type = this.base_type as StructType;
      return base_type.name;
    }
    if (this.base_type.kind === TypeKind.MappingType) {
      const base_type = this.base_type as MappingType;
      return base_type.str();
    }
    if (this.base_type.kind === TypeKind.ArrayType) {
      const base_type = this.base_type as ArrayType;
      return base_type.str();
    }
    if (this.base_type.kind === TypeKind.StringType) {
      const base_type = this.base_type as StringType;
      return base_type.str();
    }
    else {
      throw new Error(`IRVariableDeclaration: base_type ${this.base_type.kind} is not supported`);
    }
  }
  lower() {
    const new_expr = factory.makeNewExpression("", factory.makeUserDefinedTypeName("", this.type_to_str() + "[]", -1));
    return factory.makeFunctionCall("", FunctionCallKind.FunctionCall, new_expr, [this.length.lower() as Expression]);
  }
}