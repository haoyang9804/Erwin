import {
  LiteralKind,
  ASTNode,
  Expression,
  FunctionCallKind
} from "solc-typed-ast"

import { assert, generateRandomString, str2hex } from "./utility";
import { includesType, TypeKind, Type, ElementaryType } from "./type";
import { IRNode, FieldFlag, factory } from "./node";
import { IRVariableDeclare } from "./declare";

export abstract class IRExpression extends IRNode {
  type : Type | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  abstract lower() : Expression;
}

export class IRLiteral extends IRExpression {
  kind : LiteralKind | undefined;
  value : string | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, value?: string) {
    super(id, scope, field_flag);
    this.value = value;
  }
  private generateKind() : void {
    const type = this.type as ElementaryType;
    if (type.name === "bool") {
      this.kind = LiteralKind.Bool;
    }

    else if (type.name !== "bytes" && type.name !== "string") {
      this.kind = LiteralKind.Number;
    }
    //TODO: add support for HexString and UnicodeString
    else this.kind = LiteralKind.String;
  }
  private generateVal() : void {
    //TODO: add support for strange value, such as huge number and overlong string, etc.
    switch (this.kind) {
      case LiteralKind.Bool:
        this.value = Math.random() > 0.5 ? "true" : "false";
        break;
      case LiteralKind.Number:
        this.value = Math.floor(Math.random() * 100).toString();
        break;
      case LiteralKind.String:
        this.value = generateRandomString();
        break;
      default:
        assert(false, "IRLiteral: kind is not generated");
    }
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRLiteral: type is not generated");
    assert(this.type.kind === TypeKind.ElementaryType, "IRLiteral: type is not ElementaryType")
    this.generateKind();
    if (this.value === undefined) this.generateVal();
    return factory.makeLiteral("", this.kind!, str2hex(this.value!), this.value!);
  }
}

export class IRIdentifier extends IRExpression {
  name : string | undefined;
  // The id of the referenced IRNode
  reference : number | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, name ?: string, reference ?: number) {
    super(id, scope, field_flag);
    this.name = name;
    this.reference = reference;
  }
  from(node : IRVariableDeclare) {
    this.name = node.name;
    this.reference = node.id;
    return this;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRIdentifier: type is not generated");
    assert(this.name !== undefined, "IRIdentifier: name is not generated");
    assert(this.reference !== undefined, "IRIdentifier: reference is not generated");
    return factory.makeIdentifier("", this.name, this.reference);
  }
}

export class IRAssignment extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  type : Type | undefined;
  operator : string | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator ?: string) {
    super(id, scope, field_flag);
    this.left = left;
    this.right = right;
    if (operator !== undefined) {
      assert(["=", "+=", "-=", "*=", "/=", "%="].includes(operator), "IRAssignment: operator is not supported")
    }
    this.operator = operator;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRAssignment: type is undefined");
    assert(this.operator !== undefined, "IRAssignment: operator is undefined");
    return factory.makeAssignment("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}

export class IRBinaryOp extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  operator : string | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator ?: string) {
    super(id, scope, field_flag);
    this.left = left;
    this.right = right;
    if (operator !== undefined) {
      assert(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"].includes(operator), `IRBinaryOp: operator ${operator} is not supported`)
    }
    this.operator = operator;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRBinaryOp: type is not generated");
    assert(this.operator !== undefined, "IRBinaryOp: operator is not generated")
    return factory.makeBinaryOperation("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}

export class IRUnaryOp extends IRExpression {
  prefix: boolean;
  expression : IRExpression;
  operator : string;
  //TODO: support useFunction
  useFunction : number | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, prefix: boolean, expression : IRExpression, operator: string, useFunction?: number) {
    super(id, scope, field_flag);
    this.prefix = prefix;
    this.expression = expression;
    if (operator !== undefined) {
      assert(["!", "-", "~", "++", "--", "delete"].includes(operator), `IRUnaryOp: operator ${operator} is not supported`)
    }
    this.operator = operator;
    this.useFunction = useFunction;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRUnaryOp: type is not generated");
    assert(this.operator !== undefined, "IRUnaryOp: operator is not generated")
    return factory.makeUnaryOperation("", this.prefix, this.operator, this.expression.lower() as Expression);
  }
}

export class IRConditional extends IRExpression {
  condition : IRExpression;
  true_expression : IRExpression;
  false_expression : IRExpression;
  constructor(id : number, scope : number, field_flag : FieldFlag, condition : IRExpression, true_expression : IRExpression, false_expression : IRExpression) {
    super(id, scope, field_flag);
    this.condition = condition;
    this.true_expression = true_expression;
    this.false_expression = false_expression;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRConditional: type is not generated");
    assert(includesType(this.true_expression!.type!.subtype(), this.false_expression!.type!)
      || includesType(this.true_expression!.type!.supertype(), this.false_expression!.type!),
      `IRConditional: true_expression and false_expression have incompatible types: ${this.true_expression!.type!.str()} and ${this.false_expression!.type!.str()}`)
    return factory.makeConditional("", this.condition.lower() as Expression, this.true_expression.lower() as Expression, this.false_expression.lower() as Expression);
  }
}

//WARNING: UNTESTED!!
//TODO: test it after implementing IRFunctionDefinition
export class IRFunctionCall extends IRExpression {
  kind : FunctionCallKind;
  //TODO: I think the type of function_expression can be further narrowed down
  function_expression : IRExpression;
  arguments : IRExpression[];
  constructor(id : number, scope : number, field_flag : FieldFlag, kind : FunctionCallKind, function_expression : IRExpression, arguments_ : IRExpression[]) {
    super(id, scope, field_flag);
    this.kind = kind;
    this.function_expression = function_expression;
    this.arguments = arguments_;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRFunctionCall: type is not generated");
    return factory.makeFunctionCall("", this.kind, this.function_expression.lower() as Expression, this.arguments.map((arg) => arg.lower() as Expression));
  }
}

export class IRTuple extends IRExpression {
  isInlineArray : boolean | undefined;
  components : IRExpression[];
  constructor(id : number, scope : number, field_flag : FieldFlag, components : IRExpression[], isInlineArray ?: boolean) {
    super(id, scope, field_flag);
    this.components = components;
    this.isInlineArray = isInlineArray;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRTuple: type is not generated");
    assert(this.type.kind === TypeKind.UnionType, "IRTuple: type is not UnionType");
    return factory.makeTupleExpression("", this.isInlineArray === undefined ? false : true, this.components.map((component) => component?.lower() as Expression));
  }
}

export class IRIndexedAccess extends IRExpression {
  base: IRExpression;
  /**
   * Access the index of an expression, e.g. `index` in `someArray[index]`.
   *
   * May be `undefined` if used with `abi.decode()`,
   * for example `abi.decode(data, uint[]);`.
   */
  indexed: IRExpression | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, base : IRExpression, indexed ?: IRExpression) {
    super(id, scope, field_flag);
    this.base = base;
    this.indexed = indexed;
  }
  lower() {
    assert(this.type !== undefined, "IRIndexedAccess: type is not generated");
    return factory.makeIndexAccess("", this.base.lower() as Expression, this.indexed?.lower() as Expression);
  }
}

export class IRMemberAccess extends IRExpression {
  member_name : string;
  referenced_id: number;
  expression : IRExpression;
  constructor(id : number, scope : number, field_flag : FieldFlag, member_name : string, referenced_id: number, expression : IRExpression) {
    super(id, scope, field_flag);
    this.expression = expression;
    this.referenced_id = referenced_id;
    this.member_name = member_name;
  }
  lower() {
    assert(this.type !== undefined, "IRMemberAccess: type is not generated");
    return factory.makeMemberAccess("", this.expression.lower() as Expression, this.member_name, this.referenced_id);
  }
}