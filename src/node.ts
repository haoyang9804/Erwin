import {
  ASTNode,
  ASTNodeFactory,
} from "solc-typed-ast"

export const factory = new ASTNodeFactory();
export const irnodes = new Map<number, IRNode>();

export abstract class IRNode {
  public id : number;
  public scope : number;
  public typeName : string;
  constructor(id : number, scope : number) {
    this.id = id;
    this.scope = scope;
    irnodes.set(this.id, this);
    this.typeName = this.constructor.name;
  }
  abstract lower() : ASTNode;
}

export class IRSourceUnit extends IRNode {
  public children : IRNode[];
  constructor(id : number, scope : number, children : IRNode[]) {
    super(id, scope);
    this.children = children;
  }
  lower() : ASTNode {
    return factory.makeSourceUnit("", -1, "", new Map<string, number>(), this.children.map(x => x.lower()));
  }
}