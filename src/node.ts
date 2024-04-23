import {
  DataLocation,
  StateVariableVisibility,
  Mutability,
  LiteralKind,
  ASTNode,
  ASTNodeFactory,
  Expression,
  TypeName
} from "solc-typed-ast"

import { str2hex, assert, pickRandomElement, generateRandomString } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { constantLock } from "./constrant";

export enum FieldFlag {
  GLOBAL,
  GLOBAL_FUNCTION_BODY,
  GLOBAL_FUNCTION_RETURN,
  GLOBAL_FUNCTION_PARAMETER,
  CONTRACT,
  CONTRACT_GLOBAL,
  CONTRACT_FUNCTION_BODY,
  CONTRACT_FUNCTION_RETURN,
  CONTRACT_FUNCTION_PARAMETER,
  EVENT
}

const factory = new ASTNodeFactory();

export abstract class IRNode {
  public id : number;
  public scope: number;
  public field_flag: FieldFlag;
  constructor(id : number, scope: number, field_flag: FieldFlag) {
    this.id = id;
    this.scope = scope;
    this.field_flag = field_flag;
  }
  abstract lower() : ASTNode;
}

export const irnodes: IRNode[] = [];

export abstract class IRDeclare extends IRNode {
  name: string;
  constructor(id : number, scope: number, field_flag: FieldFlag, name: string) {
    super(id, scope, field_flag);
    this.name = name;
  }
}

export class IRVariableDeclare extends IRDeclare {
  indexed: boolean = false;
  constant: boolean | undefined; // duplicated with attribute `mutable`. but required by solc-typed-ast.
  state: boolean;
  memory : DataLocation = DataLocation.Default;
  visibility : StateVariableVisibility = StateVariableVisibility.Default;
  mutable : Mutability = Mutability.Mutable;
  type : Type | undefined;
  constructor(id : number, scope: number, field_flag: FieldFlag, name : string) {
    super(id, scope, field_flag, name);
    if (field_flag === FieldFlag.CONTRACT_GLOBAL) {
      this.state = true;
    }
    else {
      this.state = false;
    }
    if (field_flag !== FieldFlag.EVENT) {
      this.indexed = false;
    }
    else {
      if (Math.random() > 0.5) this.indexed = true;
      else this.indexed = false;
    }
    if (!this.state) this.constant = false;
  }
  lower(): ASTNode {
    if (this.constant === undefined) {
      if (this.id in constantLock) this.constant = false;
      else {
        if (Math.random() > 0.5) this.constant = true;
        else this.constant = false;
      }
    }
    if (this.constant) this.mutable = Mutability.Constant;
    assert(this.type !== undefined, "IRVariableDeclare: type is not generated");

    let typename: TypeName | undefined = undefined;
    if (this.type.kind === TypeKind.ElementaryType) {
      const type = this.type as ElementaryType;
      typename = factory.makeElementaryTypeName("", type.name);
      if (type.name !== "string" && type.name !== "bytes") {
        this.memory = DataLocation.Default;
      }
    }
    else {
      this.memory = DataLocation.Default;
    }
    //TODO: add support for memory
    //TODO: add support for visibility
    //TODO: add support for mutability


    //TODO: add support for other types, firstly function type
    assert(typename !== undefined, "IRVariableDeclare: typename is not generated")
    return factory.makeVariableDeclaration(this.constant, this.indexed, this.name, this.scope, this.state, this.memory, this.visibility, this.mutable, "", undefined, typename);
  }
}

export abstract class IRExpression extends IRNode {
  type: Type | undefined;
  constructor(id : number, scope: number, field_flag: FieldFlag) {
    super(id, scope, field_flag);
  }
  abstract lower() : ASTNode;
}

export class IRLiteral extends IRExpression {
  kind: LiteralKind = LiteralKind.Number;
  constructor(id : number, scope: number, field_flag: FieldFlag) {
    super(id, scope, field_flag);
  }
  private generateKind(): void {
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
  private generateVal(): string {
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
  lower(): ASTNode {
    assert(this.type !== undefined, "IRLiteral: type is not generated");
    assert(this.type.kind === TypeKind.ElementaryType, "IRLiteral: type is not ElementaryType")
    const value = this.generateVal();
    return factory.makeLiteral("", this.kind, str2hex(value), value);
  }
}

export class IRIdentifier extends IRExpression {
  name: string | undefined;
  // The id of the referenced IRNode
  reference: number | undefined;
  constructor(id: number, scope: number, field_flag: FieldFlag, name?: string, reference?: number) {
    super(id, scope, field_flag);
    this.name = name;
    this.reference = reference;
  }
  lower(): ASTNode {
    assert(this.type !== undefined, "IRIdentifier: type is not generated");
    assert(this.name !== undefined, "IRIdentifier: name is not generated");
    assert(this.reference !== undefined, "IRIdentifier: reference is not generated");
    return factory.makeIdentifier("", this.name, this.reference);
  }
}

export class IRAssignment extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  type: Type | undefined;;
  operator: string | undefined;
  constructor(id : number, scope: number, field_flag: FieldFlag, left : IRExpression, right : IRExpression, operator?: string) {
    super(id, scope, field_flag);
    this.left = left;
    this.right = right;
    this.operator = operator;
  }
  lower(): ASTNode {
    assert(this.type !== undefined, "IRAssignment: type is undefined");
    assert(this.operator !== undefined, "IRAssignment: operator is undefined");
    return factory.makeAssignment("", this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}