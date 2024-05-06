import {
  ASTNode,
} from "solc-typed-ast"

import { assert, generateRandomString, str2hex } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { IRNode, FieldFlag, factory } from "./node";
import { IRVariableDeclare } from "./declare";
import { IRExpression } from "./expression";

export abstract class IRStatement extends IRNode {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  abstract lower() : ASTNode;
}

// export class IRVariableDeclareStatement extends IRStatement {
//   variable_declares: IRVariableDeclare[];
//   value: IRExpression;
//   constructor(id : number, scope : number, field_flag : FieldFlag, variable_declares: IRVariableDeclare[], value: IRExpression) {
//     super(id, scope, field_flag);
//     this.variable_declares = variable_declares;
//     this.value = value;
//     assert(this.variable_declares.length > 0, "IRVariableDeclareStatement: variable_declares is empty");
//     if (this.variable_declares.length > 1) {
//       assert(this.value instanceof , "IRVariableDeclareStatement: value is not undefined");
//     }
//   }
// }