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
  kind : LiteralKind = LiteralKind.Number;
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
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
  private generateVal() : string {
    //TODO: add support for strange value, such as huge number and overlong string, etc.
    this.generateKind();
    if (this.kind === LiteralKind.Bool) {
      if (Math.random() > 0.5) return "true";
      return "false";
    }
    if (this.kind === LiteralKind.Number) {
      return Math.floor(Math.random() * 100).toString();
    }
    if (this.kind === LiteralKind.String) {
      return generateRandomString();
    }
    //TODO: add support for HexString and UnicodeString
    throw new Error("IRLiteral: Unreachable code.");
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRLiteral: type is not generated");
    assert(this.type.kind === TypeKind.ElementaryType, "IRLiteral: type is not ElementaryType")
    const value = this.generateVal();
    return factory.makeLiteral("", this.kind, str2hex(value), value);
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
  from(node: IRVariableDeclare) {
    this.name = node.name;
    this.reference = node.id;
    this.type = node.type;
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
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator?: string) {
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
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator? : string) {
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

export class IRConditional extends IRExpression {
  condition: IRExpression;
  true_expression: IRExpression;
  false_expression: IRExpression;
  constructor(id: number, scope: number, field_flag: FieldFlag, condition: IRExpression, true_expression: IRExpression, false_expression: IRExpression) {
    super(id, scope, field_flag);
    this.condition = condition;
    this.true_expression = true_expression;
    this.false_expression = false_expression;
  }
  lower(): Expression {
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
  kind: FunctionCallKind = FunctionCallKind.FunctionCall;
  function_expression: IRExpression;
  arguments: IRExpression[];
  constructor(id: number, scope: number, field_flag: FieldFlag, function_expression: IRExpression, arguments_: IRExpression[]) {
    super(id, scope, field_flag);
    this.function_expression = function_expression;
    this.arguments = arguments_;
  }
  lower(): Expression {
    assert(this.type !== undefined, "IRFunctionCall: type is not generated");
    return factory.makeFunctionCall("", this.kind, this.function_expression.lower() as Expression, this.arguments.map((arg) => arg.lower() as Expression));
  }
}

export class IRTuple extends IRExpression {
  isInlineArray: boolean = false;
  components: IRExpression[];
  constructor(id: number, scope: number, field_flag: FieldFlag, components: IRExpression[]) {
    super(id, scope, field_flag);
    this.components = components;
  }
  lower() : Expression {
    assert(this.type !== undefined, "IRTuple: type is not generated");
    return factory.makeTupleExpression("", this.isInlineArray, this.components.map((component) => component?.lower() as Expression));
  }
}