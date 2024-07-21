import {
  ASTNode,
  ASTNodeFactory,
} from "solc-typed-ast"

export const factory = new ASTNodeFactory();
export const irnodes = new Map<number, IRNode>();

export abstract class IRNode {
  public id : number;
  public scope : number;
  constructor(id : number, scope : number) {
    this.id = id;
    this.scope = scope;
    irnodes.set(this.id, this);
  }
  abstract lower() : ASTNode;
}