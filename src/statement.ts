import {
  Statement,
  VariableDeclaration,
  FunctionCallKind,
  Expression,
  VariableDeclarationStatement
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

export class IREmitStatement extends IRStatement {
  event_call : IRExpression;
  arguments : IRExpression[];
  constructor(id : number, scope : number, field_flag : FieldFlag, event_call : IRExpression, arguments_ : IRExpression[]) {
    super(id, scope, field_flag);
    this.event_call = event_call;
    this.arguments = arguments_;
  }
  lower() : Statement {
    const event_call = factory.makeFunctionCall("", FunctionCallKind.FunctionCall, this.event_call.lower(), this.arguments.map(a => a.lower() as Expression));
    return factory.makeEmitStatement(event_call);
  }
}

export class IRIf extends IRStatement {
  condition : IRExpression;
  true_expression : IRStatement | IRExpression;
  false_expression : IRStatement | IRExpression;
  constructor(id : number, scope : number, field_flag : FieldFlag, condition : IRExpression, true_expression : IRStatement | IRExpression, false_expression : IRStatement | IRExpression) {
    super(id, scope, field_flag);
    this.condition = condition;
    this.true_expression = true_expression;
    this.false_expression = false_expression;
  }
  lower() : Statement {
    const lowered_true_expression = this.true_expression instanceof IRStatement ? this.true_expression.lower() : factory.makeExpressionStatement(this.true_expression.lower());
    const lowered_false_expression = this.false_expression instanceof IRStatement ? this.false_expression.lower() : factory.makeExpressionStatement(this.false_expression.lower());
    return factory.makeIfStatement(this.condition.lower(), lowered_true_expression, lowered_false_expression);
  }
}

export class IRFor extends IRStatement {
  initial_stmt: IRVariableDeclareStatement | IRExpression | undefined;
  condition: IRExpression | undefined;
  loop: IRExpression | undefined;
  body: IRStatement;
  constructor(id: number, scope: number, field_flag: FieldFlag, initial_stmt: IRVariableDeclareStatement | IRExpression | undefined, condition: IRExpression | undefined, loop: IRExpression | undefined, body: IRStatement) {
    super(id, scope, field_flag);
    this.initial_stmt = initial_stmt;
    this.condition = condition;
    this.loop = loop;
    this.body = body;
  }
  lower(): Statement {
    const lowered_initial_stmt = this.initial_stmt === undefined ? undefined : this.initial_stmt instanceof IRVariableDeclareStatement ? this.initial_stmt.lower() as VariableDeclarationStatement : factory.makeExpressionStatement(this.initial_stmt.lower());
    const lowered_condition = this.condition === undefined ? undefined : this.condition.lower();
    const lowered_loop = this.loop === undefined ? undefined : factory.makeExpressionStatement(this.loop.lower());
    return factory.makeForStatement(this.body.lower(), lowered_initial_stmt, lowered_condition, lowered_loop);
  }
}

export class IRDoWhile extends IRStatement {
  condition: IRExpression;
  body: IRStatement;
  constructor(id: number, scope: number, field_flag: FieldFlag, condition: IRExpression, body: IRStatement) {
    super(id, scope, field_flag);
    this.condition = condition;
    this.body = body;
  }
  lower(): Statement {
    return factory.makeDoWhileStatement(this.condition.lower(), this.body.lower());
  }
}