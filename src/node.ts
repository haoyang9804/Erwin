import {
  ASTNode,
  ASTNodeFactory,
} from "solc-typed-ast"
import { irnode_db } from "./db";

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

export const factory = new ASTNodeFactory();
export const irnodes = new Map<number, IRNode>();

export abstract class IRNode {
  public id : number;
  public scope : number;
  public field_flag : FieldFlag;
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    this.id = id;
    this.scope = scope;
    this.field_flag = field_flag;
    irnodes.set(this.id, this);
    irnode_db.insert(this.id, this.scope);

  }
  abstract lower() : ASTNode;
}