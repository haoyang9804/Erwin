import {
  Statement,
  VariableDeclaration,
  FunctionCallKind,
  Expression,
  VariableDeclarationStatement,
  TryCatchClause,
  FunctionCall
} from "solc-typed-ast"

import { assert, } from "./utility";
import { IRNode, factory } from "./node";
import { IRVariableDeclaration } from "./declare";
import { IRExpression, IRFunctionCall, IRTuple } from "./expression";

export abstract class IRStatement extends IRNode {
  exprs : IRExpression[];
  constructor(id : number, scope : number, exprs : IRExpression[] = []) {
    super(id, scope);
    this.exprs = exprs;
  }
  abstract lower() : Statement;
}

export class IRPlaceholderStatement extends IRStatement {
  constructor(id : number, scope : number) {
    super(id, scope);
  }
  lower() : Statement {
    return factory.makePlaceholderStatement();
  }
}

export class IRVariableDeclarationStatement extends IRStatement {
  variable_declares : (IRVariableDeclaration | null)[];
  value : IRExpression | undefined;
  constructor(id : number, scope : number, variable_declares : (IRVariableDeclaration | null)[], value ?: IRExpression) {
    super(id, scope);
    this.variable_declares = variable_declares;
    this.value = value;
  }
  lower() : Statement {
    assert(this.variable_declares.length > 0, `IRVariableDeclarationStatement ${this.id}: variable_declares is empty`);
    if (this.variable_declares.length > 1) {
      assert(this.value instanceof IRTuple, "IRVariableDeclarationStatement: value is not IRTuple when there are more than one variable_declares");
    }
    const lowered_variable_declares = (this.variable_declares.filter(v => v !== null) as IRVariableDeclaration[]).map(v => v.lower() as VariableDeclaration);
    const assignments = lowered_variable_declares.map(v => v.id);
    return factory.makeVariableDeclarationStatement(assignments, lowered_variable_declares,
      this.value !== undefined ? this.value.lower() : undefined);
  }
}

export class IRBreakStatement extends IRStatement {
  constructor(id : number, scope : number) {
    super(id, scope);
  }
  lower() : Statement {
    return factory.makeBreak();
  }
}

export class IRContinueStatement extends IRStatement {
  constructor(id : number, scope : number) {
    super(id, scope);
  }
  lower() : Statement {
    return factory.makeContinue();
  }
}

export class IRThrowStatement extends IRStatement {
  constructor(id : number, scope : number) {
    super(id, scope);
  }
  lower() : Statement {
    return factory.makeThrow();
  }
}

export class IRReturnStatement extends IRStatement {
  value : IRExpression | undefined;
  constructor(id : number, scope : number, value ?: IRExpression) {
    super(id, scope);
    this.value = value;
  }
  lower() : Statement {
    assert(this.value !== undefined, "IRReturnStatement: value is not generated");
    return factory.makeReturn(-1, this.value.lower());
  }
}

//! Deprecated
export class IREmitStatement extends IRStatement {
  event_call : IRExpression;
  arguments : IRExpression[];
  constructor(id : number, scope : number, event_call : IRExpression, arguments_ : IRExpression[]) {
    super(id, scope);
    this.event_call = event_call;
    this.arguments = arguments_;
  }
  lower() : Statement {
    const event_call = factory.makeFunctionCall("", FunctionCallKind.FunctionCall, this.event_call.lower(), this.arguments.map(a => a.lower() as Expression));
    return factory.makeEmitStatement(event_call);
  }
}

export class IREmitStatementV2 extends IRStatement {
  event_call : IRFunctionCall;
  constructor(id : number, scope : number, event_call : IRFunctionCall) {
    super(id, scope);
    this.event_call = event_call;
  }
  lower() : Statement {
    return factory.makeEmitStatement(this.event_call.lower() as FunctionCall);
  }
}

export class IRIf extends IRStatement {
  condition : IRExpression;
  true_expression : IRStatement[];
  false_expression : IRStatement[];
  constructor(id : number, scope : number, condition : IRExpression, true_expression : IRStatement[], false_expression : IRStatement[]) {
    super(id, scope);
    this.condition = condition;
    this.true_expression = true_expression;
    this.false_expression = false_expression;
  }
  lower() : Statement {
    const lowered_true_expression = factory.makeBlock(this.true_expression.map(function(stmt) {
      return stmt.lower();
    }));
    const lowered_false_expression = factory.makeBlock(this.false_expression.map(function(stmt) {
      return stmt.lower();
    }));
    return factory.makeIfStatement(this.condition.lower(), lowered_true_expression, lowered_false_expression);
  }
}

export class IRFor extends IRStatement {
  initial_stmt : IRVariableDeclarationStatement | IRExpression | undefined;
  condition : IRExpression | undefined;
  loop : IRExpression | undefined;
  body : IRStatement[];
  constructor(id : number, scope : number, initial_stmt : IRVariableDeclarationStatement | IRExpression | undefined, condition : IRExpression | undefined, loop : IRExpression | undefined, body : IRStatement[]) {
    super(id, scope);
    this.initial_stmt = initial_stmt;
    this.condition = condition;
    this.loop = loop;
    this.body = body;
  }
  lower() : Statement {
    const lowered_initial_stmt = this.initial_stmt === undefined ? undefined : this.initial_stmt instanceof IRVariableDeclarationStatement ? this.initial_stmt.lower() as VariableDeclarationStatement : factory.makeExpressionStatement(this.initial_stmt.lower());
    const lowered_condition = this.condition === undefined ? undefined : this.condition.lower();
    const lowered_loop = this.loop === undefined ? undefined : factory.makeExpressionStatement(this.loop.lower());
    const lowered_body = factory.makeBlock(this.body.map(function(stmt) {
      return stmt.lower();
    }));
    return factory.makeForStatement(lowered_body, lowered_initial_stmt, lowered_condition, lowered_loop);
  }
}

export class IRDoWhile extends IRStatement {
  condition : IRExpression;
  body : IRStatement[];
  constructor(id : number, scope : number, condition : IRExpression, body : IRStatement[]) {
    super(id, scope);
    this.condition = condition;
    this.body = body;
  }
  lower() : Statement {
    const lowered_body = factory.makeBlock(this.body.map(function(stmt) {
      return stmt.lower();
    }));
    return factory.makeDoWhileStatement(this.condition.lower(), lowered_body);
  }
}

export class IRWhile extends IRStatement {
  condition : IRExpression;
  body : IRStatement[];
  constructor(id : number, scope : number, condition : IRExpression, body : IRStatement[]) {
    super(id, scope);
    this.condition = condition;
    this.body = body;
  }
  lower() : Statement {
    const lowered_body = factory.makeBlock(this.body.map(function(stmt) {
      return stmt.lower();
    }));
    return factory.makeWhileStatement(this.condition.lower(), lowered_body);
  }
}

export class IRRevertStatement extends IRStatement {
  error_call : IRExpression;
  arguments : IRExpression[];
  constructor(id : number, scope : number, error_call : IRExpression, arguments_ : IRExpression[]) {
    super(id, scope);
    this.error_call = error_call;
    this.arguments = arguments_;
  }
  lower() : Statement {
    const event_call = factory.makeFunctionCall("", FunctionCallKind.FunctionCall, this.error_call.lower(), this.arguments.map(a => a.lower() as Expression));
    return factory.makeRevertStatement(event_call);
  }
}

export class IRTryCatchClause extends IRStatement {
  error_name : string;
  parameters : IRVariableDeclaration[];
  body : IRStatement[];
  constructor(id : number, scope : number, error_name : string, parameters : IRVariableDeclaration[], body : IRStatement[]) {
    super(id, scope);
    this.error_name = error_name;
    this.parameters = parameters;
    this.body = body;
  }
  lower() : Statement {
    const lowered_body = factory.makeBlock(this.body.map(function(stmt) {
      return stmt.lower();
    }));
    const lowered_parameters = this.parameters.length === 0 ? undefined : factory.makeParameterList(this.parameters.map(p => p.lower() as VariableDeclaration));
    return factory.makeTryCatchClause(this.error_name, lowered_body, lowered_parameters);
  }
}

export class IRTry extends IRStatement {
  call : IRFunctionCall;
  clauses : IRTryCatchClause[];
  constructor(id : number, scope : number, call : IRFunctionCall, clauses : IRTryCatchClause[]) {
    super(id, scope);
    this.call = call;
    this.clauses = clauses;
  }
  lower() {
    const lowered_clauses = this.clauses.map(c => c.lower() as TryCatchClause);
    return factory.makeTryStatement(this.call.lower() as FunctionCall, lowered_clauses);
  }
}

export class IRExpressionStatement extends IRStatement {
  expression : IRExpression;
  constructor(id : number, scope : number, expression : IRExpression) {
    super(id, scope);
    this.expression = expression;
  }
  lower() : Statement {
    return factory.makeExpressionStatement(this.expression.lower());
  }
}