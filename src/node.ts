import {
  DataLocation,
  StateVariableVisibility,
  Mutability,
  LiteralKind,
  ASTNode,
  ASTNodeFactory,
  Expression
} from "solc-typed-ast"

import { str2hex, assert, pickRandomElement } from "./utility.js";

const factory = new ASTNodeFactory();

export abstract class IRNode {
  public id : number;
  public scope: number;
  constructor(id : number, scope: number) {
    this.id = id;
    this.scope = scope;
  }
  abstract stringify() : string;
  print() : void {
    console.log(this.stringify());
  }
  abstract lower() : ASTNode;
}

export const irnodes: IRNode[] = [];

export abstract class IRDeclare extends IRNode {
  name: string;
  constructor(id : number, scope: number, name: string) {
    super(id, scope);
    this.name = name;
  }
}

export class IRVariableDeclare extends IRDeclare {
  indexed: boolean | undefined;
  constant: boolean | undefined; // duplicated with attribute `mutable`. but required by solc-typed-ast.
  state: boolean | undefined;
  memory : DataLocation | undefined;
  visibility : StateVariableVisibility | undefined;
  mutable : Mutability | undefined;
  type : string | undefined;
  constructor(id : number, scope: number, name : string, indexed?: boolean, constant?: boolean, state?: boolean, memory ?: DataLocation, visibility ?: StateVariableVisibility, mutable ?: Mutability, type ?: string) {
    super(id, scope, name);
    this.indexed = indexed;
    this.constant = constant;
    this.state = state;
    this.memory = memory;
    this.visibility = visibility;
    this.mutable = mutable;
    this.type = type;
  }
  stringify() : string {
    return `declare> ${this.name} <id: ${this.id}, scope: ${this.scope}, indexed: ${this.indexed}, constant: ${this.constant} memory: ${this.memory}, visibility: ${this.visibility}, mutable: ${this.mutable}, type: ${this.type}>`;
  }
  lower(): ASTNode {
    assert(this.constant !== undefined, "IRVariableDeclare: constant is not generated");
    assert(this.indexed !== undefined, "IRVariableDeclare: indexed is not generated");
    assert(this.state !== undefined, "IRVariableDeclare: state is not generated")
    assert(this.memory !== undefined, "IRVariableDeclare: memory is not generated");
    assert(this.visibility !== undefined, "IRVariableDeclare: visibility is not generated");
    assert(this.mutable !== undefined, "IRVariableDeclare: mutable is not generated");
    assert(this.type !== undefined, "IRVariableDeclare: type is not generated");
    return factory.makeVariableDeclaration(this.constant, this.indexed, this.name, this.scope, this.state, this.memory, this.visibility, this.mutable, this.type);
  }
}

export abstract class IRExpression extends IRNode {
  constructor(id : number, scope: number) {
    super(id, scope);
  }
  abstract lower() : ASTNode;
}

export class IRLiteral extends IRExpression {
  value : string | undefined;
  type: string | undefined;
  kind: LiteralKind | undefined;
  constructor(id : number, scope: number, value ?: string, type ?: string, kind ?: LiteralKind) {
    super(id, scope);
    this.value = value;
    this.type = type;
    this.kind = kind;
  }
  stringify() : string {
    return `literal> ${this.value} <id: ${this.id}, scope: ${this.scope}, value: ${this.value}, type: ${this.type}, kind: ${this.kind}>`;
  }
  lower(): ASTNode {
    assert(this.value !== undefined, "IRLiteral: value is not generated");
    assert(this.kind !== undefined, "IRLiteral: kind is not generated");
    assert(this.type !== undefined, "IRLiteral: type is not generated");
    return factory.makeLiteral(this.type, this.kind, str2hex(this.value), this.value);
  }
}

export class IRIdentifier extends IRExpression {
  name: string | undefined;
  reference: number | undefined;
  type: string | undefined;
  constructor(id: number, scope: number, name?: string, reference?: number, type?: string) {
    super(id, scope);
    this.name = name;
    this.reference = reference;
    this.type = type;
  }
  stringify(): string {
    return `identifier> ${this.name} <id: ${this.id}, scope: ${this.scope}, reference: ${this.reference}>`
  }
  lower(): ASTNode {
    assert(this.type !== undefined, "IRIdentifier: type is not generated");
    assert(this.name !== undefined, "IRIdentifier: name is not generated");
    assert(this.reference !== undefined, "IRIdentifier: reference is not generated");
    return factory.makeIdentifier(this.type, this.name, this.reference);
  }
}

export class IRAssignment extends IRExpression {
  left : IRExpression;
  right : IRExpression;
  type: string | undefined;
  operator: string | undefined;
  constructor(id : number, scope: number, left : IRExpression, right : IRExpression) {
    super(id, scope);
    this.left = left;
    this.right = right;
  }
  stringify() : string {
    return `${this.left.stringify()} ${this.operator} ${this.right.stringify()} <id: ${this.id}, scope: ${this.scope}, type: ${this.type}>`;
  }
  lower(): ASTNode {
    assert(this.type !== undefined, "IRAssignment: type is undefined");
    assert(this.operator !== undefined, "IRAssignment: operator is undefined");
    return factory.makeAssignment(this.type, this.operator, this.left.lower() as Expression, this.right.lower() as Expression);
  }
}