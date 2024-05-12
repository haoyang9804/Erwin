import {
  ASTNode,
  Statement,
  PlaceholderStatement,
  VariableDeclaration,
  FunctionCall,
  FunctionCallKind
} from "solc-typed-ast"

import { assert, generateRandomString, str2hex } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { IRNode, FieldFlag, factory } from "./node";
import { IRVariableDeclare } from "./declare";
import { IRExpression, IRTuple } from "./expression";

export abstract class IRStatement extends IRNode {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  abstract lower() : Statement;
}

export class IRPlaceholderStatement extends IRStatement {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  lower() : Statement {
    return factory.makePlaceholderStatement();
  }
}

export class IRVariableDeclareStatement extends IRStatement {
  variable_declares : IRVariableDeclare[];
  value : IRExpression;
  constructor(id : number, scope : number, field_flag : FieldFlag, variable_declares : IRVariableDeclare[], value : IRExpression) {
    super(id, scope, field_flag);
    this.variable_declares = variable_declares;
    this.value = value;
  }
  lower() : Statement {
    assert(this.variable_declares.length > 0, "IRVariableDeclareStatement: variable_declares is empty");
    if (this.variable_declares.length > 1) {
      assert(this.value instanceof IRTuple, "IRVariableDeclareStatement: value is not IRTuple when there are more than one variable_declares");
    }
    const lowered_variable_declares = this.variable_declares.map(v => v.lower() as VariableDeclaration);
    const assignments = lowered_variable_declares.map(v => v.id);
    return factory.makeVariableDeclarationStatement(assignments, lowered_variable_declares, this.value.lower());
  }
}

export class IRBreakStatement extends IRStatement {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  lower() : Statement {
    return factory.makeBreak();
  }
}

export class IRContinueStatement extends IRStatement {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  lower() : Statement {
    return factory.makeContinue();
  }
}

export class IRThrowStatement extends IRStatement {
  constructor(id : number, scope : number, field_flag : FieldFlag) {
    super(id, scope, field_flag);
  }
  lower() : Statement {
    return factory.makeThrow();
  }
}

export class IRReturnStatement extends IRStatement {
  value : IRExpression | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, value ?: IRExpression) {
    super(id, scope, field_flag);
    this.value = value;
  }
  lower() : Statement {
    assert(this.value !== undefined, "IRReturnStatement: value is not generated");
    return factory.makeReturn(-1, this.value.lower());
  }
}