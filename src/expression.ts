import {
  LiteralKind,
  ASTNode,
  Expression,
} from "solc-typed-ast"

import { assert, generateRandomString, str2hex } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { IRNode, FieldFlag, factory } from "./node";
import { IRVariableDeclare } from "./declare";

export abstract class IRExpression extends IRNode {
  type : Type | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  abstract lower() : ASTNode;
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
  lower() : ASTNode {
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
  lower() : ASTNode {
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
  operator : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator: string) {
    super(id, scope, field_flag);
    this.left = left;
    this.right = right;
    assert(operator in ["=", "+=", "-=", "*=", "/=", "%="], "IRAssignment: operator is not supported")
    this.operator = operator;
  }
  lower() : ASTNode {
    assert(this.type !== undefined, "IRAssignment: type is undefined");
    assert(this.operator !== undefined, "IRAssignment: operator is undefined");
    return factory.makeAssignment("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}

export class IREnumValue extends IRExpression {
  name : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, name: string) {
    super(id, scope, field_flag);
    this.name = name;
  }
  lower() : ASTNode {
    assert(this.name !== undefined, "IREnumValue: name is not generated");
    return factory.makeEnumValue(this.name);
  }
}

export class IRBinaryOp extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  operator : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, left : IRExpression, right : IRExpression, operator : string) {
    super(id, scope, field_flag);
    this.left = left;
    this.right = right;
    assert(operator in ["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"], "IRBinaryOp: operator is not supported")
    this.operator = operator;
  }
  lower() : ASTNode {
    assert(this.type !== undefined, "IRBinaryOp: type is not generated");
    return factory.makeBinaryOperation("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}