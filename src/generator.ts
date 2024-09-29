import { assert, pickRandomElement, generateRandomString, randomInt, mergeSet, intersection } from "./utility";
import { IRNode, IRSourceUnit } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { decideVariableVisibility, decl_db, erwin_visibility } from "./db";
import { TypeDominanceDAG, FuncStateMutabilityDominanceDAG, FuncVisibilityDominanceDAG, StateVariableVisibilityDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { isSuperSet, isEqualSet } from "./dominance";
import { ContractKind, FunctionCallKind, FunctionKind, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { ScopeList, scopeKind, init_scope } from "./scope";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { FuncVis, FuncVisProvider, VarVisProvider } from "./visibility";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 1;
let cur_scope : ScopeList = init_scope();
let indent = 0;
// Record the vardecls used by each expression. If an expr contains an identifier of a vardecl, then this expr uses this vardecl.
const expr2used_vardecls : Map<number, Set<number>> = new Map<number, Set<number>>();
let no_state_variable_in_function_body = false;
let allow_empty_return = false;
// A signal to indicate whether there is an external function call in the current function body.
let external_call = false;
let cur_contract_id = 0;
let virtual_env = false;
let override_env = false;
let unexpected_extra_stmt : stmt.IRStatement[] = [];
let state_variables : Set<number> = new Set<number>();
// Record statements in each scope.
export const scope2userDefinedTypes = new Map<number, number>();
export const type_dag = new TypeDominanceDAG();
export const funcstat_dag = new FuncStateMutabilityDominanceDAG();
export const func_visibility_dag = new FuncVisibilityDominanceDAG();
export const state_variable_visibility_dag = new StateVariableVisibilityDominanceDAG();

function generateVarName() : string {
  while (true) {
    const varname = generateRandomString();
    if (!varnames.has(varname)) {
      varnames.add(varname);
      return varname;
    }
  }
}

/*
Suppose the current contract has yang scope, then the yin scope
is exposed by "this" pointer.
*/
export function yin_contract_scope_id() {
  return -cur_scope.id();
}

export function is_yin_scope(scope_id : number) {
  return scope_id === yin_contract_scope_id();
}

export function is_another_yang_scope(scope_id : number) {
  return scope_id > 0 && scope_id !== cur_scope.id();
}

function getAvailableIRVariableDeclare() : decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  const available_irnode_ids = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  for (let id of available_irnode_ids) {
    if (decl_db.vardecls.has(id) && !(no_state_variable_in_function_body && state_variables.has(id))) {
      collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
    }
  }
  return collection;
}

function hasAvailableIRVariableDeclare() : boolean {
  return getAvailableIRVariableDeclare().length > 0;
}

function getAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  const available_irnode_ids = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  for (let id of available_irnode_ids) {
    if (
      decl_db.vardecls.has(id) &&
      !(no_state_variable_in_function_body && state_variables.has(id))
    ) {
      collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
    }
  }
  return collection.filter(
    (irdecl) =>
      isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) &&
      type_dag.try_tighten_solution_range_middle_out(irdecl.id, types) ||
      isSuperSet(types, type_dag.solution_range.get(irdecl.id)!)
  );
}

function hasAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : boolean {
  return getAvailableIRVariableDeclareWithTypeConstraint(types).length > 0;
}

function dominatee_id_to_type_range(id : number) : type.Type[] {
  if (id === -1.5) {
    return type.elementary_types;
  }
  if (id === -2.5) {
    return type.uinteger_types;
  }
  if (id === -3.5) {
    return type.all_integer_types;
  }
  if (id === -4.5) {
    return type.bool_types;
  }
  if (id === -5.5) {
    return []; // Contract, Struct, etc
  }
  if (id > 0) {
    assert(type_dag.solution_range.has(id), `dominatee_id_to_type_range: id ${id} is not in type_dag`);
    return type_dag.solution_range.get(id)!;
  }
  if (id < 0) {
    assert(type_dag.solution_range.has(-id), `dominatee_id_to_type_range: id ${id} is not in type_dag`);
    return type_dag.solution_range.get(-id)!;
  }
  throw new Error(`dominatee_id_to_type_range: id ${id} is not a dominatee`);
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

export abstract class Generator {
  irnode : IRNode | undefined;
  generator_name : string;
  constructor() {
    this.generator_name = this.constructor.name;
  }
}

export class SourceUnitGenerator extends Generator {
  constructor() { super(); }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SourceUnit`));
      indent += 2;
    }
    const children : IRNode[] = [];
    for (let i = 0; i < config.contract_count; i++) {
      const contract_gen = new ContractDeclarationGenerator();
      contract_gen.generate();
      children.push(contract_gen.irnode!);
    }
    this.irnode = new IRSourceUnit(global_id++, -1, children);
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating SourceUnit`));
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

export class ElementaryTypeVariableDeclarationGenerator extends DeclarationGenerator {
  type_range : type.Type[];
  name : string | undefined;
  constructor(type_range : type.Type[], name ?: string) {
    super();
    this.type_range = type_range;
    this.name = name;
  }
  generate() : void {
    if (this.name === undefined) {
      this.name = generateVarName();
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating vardecl, name is ${this.name}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    if (cur_scope.value().kind === scopeKind.CONTRACT) {
      this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(),
        this.name, undefined);
      decl_db.insert(this.irnode.id, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
      state_variable_visibility_dag.solution_range.set(this.irnode.id, [
        VarVisProvider.private(),
        VarVisProvider.internal(),
        VarVisProvider.public(),
        VarVisProvider.default()
      ]);
    }
    else {
      this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(),
        this.name, undefined, StateVariableVisibility.Default);
      decl_db.insert(this.irnode.id, decideVariableVisibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    decl_db.vardecls.add(this.irnode.id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: VarDecl, name: ${this.name}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
    }
  }
}

export class ConstructorDeclarationGenerator extends DeclarationGenerator {
  parameters : decl.IRVariableDeclaration[] = [];
  function_scope : ScopeList;
  fid : number;
  has_body : boolean;
  parameter_count : number;
  state_variables_in_cur_contract_scope : number[] = [];
  constructor(has_body : boolean = true) {
    super();
    this.fid = global_id++;
    decl_db.insert(this.fid, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONSTRUCTOR);
    this.function_scope = cur_scope.snapshot();
    cur_scope = cur_scope.rollback();
    this.has_body = has_body;
    this.parameter_count = randomInt(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
    //! Find state variables in contract body scope
    this.state_variables_in_cur_contract_scope = decl_db.get_irnodes_ids_nonrecursively_from_a_scope(cur_scope.id())
      .filter((nid) => state_variables.has(nid))
      .map((nid) => nid);
  }

  generate_body() : void {
    assert(cur_scope.kind() === scopeKind.CONTRACT, `ConstructorDeclarationGenerator: scope kind should be CONTRACT, but is ${cur_scope.kind()}`);
    //! Generate body
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Body`));
      indent += 2;
    }
    if (!this.has_body) cur_scope = this.function_scope.snapshot();
    let body : stmt.IRStatement[] = [];
    const body_stmt_count = randomInt(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
    for (let i = body.length; i < body_stmt_count; i++) {
      if (this.state_variables_in_cur_contract_scope.length > 0 && Math.random() < config.init_state_var_in_constructor_prob) {
        const vardecl = irnodes.get(pickRandomElement(this.state_variables_in_cur_contract_scope)!) as decl.IRVariableDeclaration;
        const identifier = new expr.IRIdentifier(global_id++, cur_scope.id(), vardecl.name, vardecl.id);
        const expr_gen_prototype = pickRandomElement(all_expression_generators)!;
        const expr_gen = new expr_gen_prototype(vardecl.id);
        expr_gen.generate(0);
        const expression = expr_gen.irnode! as expr.IRExpression;
        const assignment = new expr.IRAssignment(global_id++, cur_scope.id(), identifier, expression, "=");
        const assignment_stmt = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment);
        type_dag.connect(expr.tupleExtraction(expression).id, vardecl.id, "super_dominance");
        body = body.concat(unexpected_extra_stmt);
        unexpected_extra_stmt = [];
        body.push(assignment_stmt);
      }
      else {
        const stmt_gen_prototype = pickRandomElement(statement_generators)!;
        const stmt_gen = new stmt_gen_prototype();
        stmt_gen.generate(0);
        body = body.concat(unexpected_extra_stmt);
        unexpected_extra_stmt = [];
        body.push(stmt_gen.irnode! as stmt.IRStatement);
      }
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Constructor Body`));
    }
    if (!this.has_body) cur_scope = cur_scope.rollback();
    (this.irnode as decl.IRFunctionDefinition).body = body;
  }

  generate() : void {
    assert(cur_scope.kind() === scopeKind.CONTRACT, `ConstructorDeclarationGenerator: scope kind should be CONTRACT, but is ${cur_scope.kind()}`);
    cur_scope = this.function_scope.snapshot();
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Declaration: ${this.fid}`));
      indent += 2;
    }
    //TODO: support modifiers
    const modifiers : decl.Modifier[] = [];
    //! Generate parameters
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    for (let i = 0; i < this.parameter_count; i++) {
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(type.elementary_types);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Function Parameters`));
    }
    this.irnode = new decl.IRFunctionDefinition(this.fid, cur_scope.id(), "",
      FunctionKind.Constructor, false, false, this.parameters, [], [], modifiers,
      FunctionVisibility.Public, FunctionStateMutability.NonPayable);
    if (this.has_body) {
      this.generate_body();
    }
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Constructor Declaration`));
    }
  }
}

export class FunctionDeclarationGenerator extends DeclarationGenerator {
  has_body : boolean;
  return_count : number;
  parameter_count : number;
  return_decls : decl.IRVariableDeclaration[] = [];
  parameters : decl.IRVariableDeclaration[] = [];
  function_scope : ScopeList;
  fid : number;
  constructor(has_body : boolean = true) {
    super();
    this.fid = global_id++;
    decl_db.insert(this.fid, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.FUNC);
    this.function_scope = cur_scope.snapshot();
    cur_scope = cur_scope.rollback();
    this.has_body = has_body;
    this.return_count = randomInt(config.return_count_of_function_lowerlimit, config.return_count_of_function_upperlimit);
    this.parameter_count = randomInt(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
  }

  get_state_mutability_range_v2(use_state_variables : boolean) : FunctionStateMutability[] {
    let state_mutability_range : FunctionStateMutability[] = [];
    if (use_state_variables) {
      state_mutability_range = [
        FunctionStateMutability.Payable,
        FunctionStateMutability.NonPayable
      ]
    }
    else if (external_call) {
      state_mutability_range = [
        FunctionStateMutability.Payable,
        FunctionStateMutability.NonPayable,
        FunctionStateMutability.View
      ]
    }
    else {
      state_mutability_range = [
        FunctionStateMutability.Payable,
        FunctionStateMutability.NonPayable,
        FunctionStateMutability.Pure,
        FunctionStateMutability.View
      ]
    }
    return state_mutability_range;
  }

  get_FuncStat_from_state_mutability(state_mutability : FunctionStateMutability) : FuncStat {
    switch (state_mutability) {
      case FunctionStateMutability.Pure:
        return FuncStatProvider.pure();
      case FunctionStateMutability.View:
        return FuncStatProvider.view();
      case FunctionStateMutability.Payable:
        return FuncStatProvider.payable();
      case FunctionStateMutability.NonPayable:
        return FuncStatProvider.empty();
      default:
        throw new Error(`get_FuncStat_from_state_mutability: Improper state_mutability ${state_mutability}`);
    }
  }

  get_FuncStats_from_state_mutabilitys(state_mutabilitys : FunctionStateMutability[]) : FuncStat[] {
    const res : FuncStat[] = [];
    for (const state_mutability of state_mutabilitys) {
      res.push(this.get_FuncStat_from_state_mutability(state_mutability));
    }
    return res;
  }

  connect_from_caller_to_callee(callerID : number, calleeID : number) : void {
    funcstat_dag.connect(callerID, calleeID, "sub_dominance");
  }

  connect_from_callee_to_caller(calleeID : number, callerID : number) : void {
    funcstat_dag.connect(calleeID, callerID, "super_dominance");
  }

  build_connection_from_caller_to_callee(thisid : number) : void {
    for (const called_function_decl_ID of decl_db.called_function_decls_IDs) {
      if (thisid != called_function_decl_ID)
        this.connect_from_caller_to_callee(thisid, called_function_decl_ID);
    }
    decl_db.called_function_decls_IDs.clear();
  }

  build_connection_between_caller_and_callee(thisid : number) : void {
    /*
      Follow the rule of DominanceDAG that if A dominates B, then the solution range of B
      is a superset of the solution range of A.
      //! Since we use brute force to resolve state mutatbility constraints, this 
      //! function is not necessary.
    */
    for (const called_function_decl_ID of decl_db.called_function_decls_IDs) {
      if (isSuperSet(funcstat_dag.solution_range.get(thisid)!, funcstat_dag.solution_range.get(called_function_decl_ID)!)) {
        this.connect_from_callee_to_caller(called_function_decl_ID, thisid);
      }
      else {
        this.connect_from_caller_to_callee(thisid, called_function_decl_ID);
      }
    }
    decl_db.called_function_decls_IDs.clear();
  }

  throw_no_state_variable_signal_at_random() : void {
    if (Math.random() > 0.5) {
      no_state_variable_in_function_body = true;
    }
  }

  clear_no_state_variable_signal() : void {
    no_state_variable_in_function_body = false;
  }

  generate_function_body() : void {
    if (!this.has_body) cur_scope = this.function_scope.snapshot();
    //! Generate function body. Body includes exprstmts and the return stmt.
    external_call = false;
    let body : stmt.IRStatement[] = [];
    const body_stmt_count = randomInt(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
    // used_vardecls is a set that records the vardecls used by the body.
    const used_vardecls : Set<number> = new Set<number>();
    this.throw_no_state_variable_signal_at_random();
    //! Here we generate stmts.
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Body for ${this.fid}`));
      indent += 2;
    }
    for (let i = body.length; i < body_stmt_count; i++) {
      const stmt_gen_prototype = pickRandomElement(statement_generators)!;
      const stmt_gen = new stmt_gen_prototype();
      stmt_gen.generate(0);
      body = body.concat(unexpected_extra_stmt);
      unexpected_extra_stmt = [];
      body.push(stmt_gen.irnode! as stmt.IRStatement);
      // update used_vardecls
      if (stmt_gen instanceof ExpressionStatementGenerator) {
        for (const used_vardecl of expr2used_vardecls.get(stmt_gen.expr!.id)!) {
          used_vardecls.add(used_vardecl);
        }
      }
      else if (stmt_gen instanceof NonExpressionStatementGenerator) {
        for (const expr of stmt_gen.exprs) {
          for (const used_vardecl of expr2used_vardecls.get(expr.id)!) {
            used_vardecls.add(used_vardecl);
          }
        }
      }
    }
    //! Then we generate return exprs.
    const return_values : expr.IRExpression[] = [];
    for (let i = 0; i < this.return_count; i++) {
      //* Generate expr for return
      const expr_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expr_gen = new expr_gen_prototype(this.return_decls[i].id);
      expr_gen.generate(0);
      return_values.push(expr_gen.irnode! as expr.IRExpression);
      let expression_extracted = expr.tupleExtraction(return_values[i]);
      // update used_vardecls
      for (const used_vardecl of expr2used_vardecls.get(expression_extracted.id)!) {
        used_vardecls.add(used_vardecl);
      }
      type_dag.connect(expression_extracted.id, this.return_decls[i].id, "super_dominance");
      body = body.concat(unexpected_extra_stmt);
      unexpected_extra_stmt = [];
    }
    if (return_values.length === 0 && Math.random() > 0.5) { }
    else {
      const return_gen = new ReturnStatementGenerator(
        new expr.IRTuple(global_id++, cur_scope.id(), return_values)
      );
      return_gen.generate(0);
      body.push(return_gen.irnode!);
    }
    // Check whether function body uses any state variables and records the result into `use_state_variables`
    let use_state_variables = false;
    for (const used_vardecl of used_vardecls) {
      if (state_variables.has(used_vardecl)) {
        assert(!no_state_variable_in_function_body,
          `no_state_variable_in_function_body should be false: irnode (ID: ${used_vardecl}, typeName: ${irnodes.get(used_vardecl)!.typeName}) is used in the function body`);
        use_state_variables = true;
        break;
      }
    }
    const state_mutability_range = this.get_state_mutability_range_v2(use_state_variables);
    funcstat_dag.insert(funcstat_dag.newNode(this.irnode!.id));
    funcstat_dag.solution_range.set(this.irnode!.id, this.get_FuncStats_from_state_mutabilitys(state_mutability_range));
    this.build_connection_from_caller_to_callee(this.irnode!.id);
    (this.irnode as decl.IRFunctionDefinition).body = body;
    this.clear_no_state_variable_signal();
    if (!this.has_body) cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Function Body for ${this.fid}. funcstate range is ${funcstat_dag.solution_range.get(this.irnode!.id)!.map(f => f.str())}`));
    }
  }

  generate() : void {
    func_visibility_dag.solution_range.set(this.fid, [
      FuncVisProvider.external(),
      FuncVisProvider.internal(),
      FuncVisProvider.private(),
      FuncVisProvider.public()
    ]);
    const modifiers : decl.Modifier[] = [];
    //TODO: fill the modifiers
    const name = generateVarName();
    const virtual = virtual_env;
    const overide = override_env;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Definition ${this.fid} ${name}`));
      indent += 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    cur_scope = this.function_scope.snapshot();
    //! Generate parameters
    for (let i = 0; i < this.parameter_count; i++) {
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(type.elementary_types);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    //! Generate return_decls
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Function Parameters`));
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Return Decls, ${this.return_count} in total`));
      indent += 2;
    }
    for (let i = 0; i < this.return_count; i++) {
      //* Generate the returned vardecl. For instance, in the following code:
      //* function f() returns (uint a, uint b) { return (1, 2); }
      //* We generate two returned vardecls for a and b.
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(type.elementary_types);
      variable_gen.generate();
      this.return_decls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating Function Return Decls`));
    }
    this.irnode = new decl.IRFunctionDefinition(this.fid, cur_scope.id(), name,
      FunctionKind.Function, virtual, overide, this.parameters, this.return_decls, [], modifiers);
    decl_db.funcdecls.add(this.fid);
    if (this.has_body) {
      this.generate_function_body();
    }
    else {
      funcstat_dag.insert(funcstat_dag.newNode(this.irnode!.id));
      funcstat_dag.solution_range.set(this.irnode!.id, [
        FuncStatProvider.empty(),
        FuncStatProvider.pure(),
        FuncStatProvider.view(),
        FuncStatProvider.payable()
      ]);
    }
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating function ${name}, funcstate range is ${funcstat_dag.solution_range.get(this.irnode!.id)!.map(f => f.str())}`));
    }
  }
}

export class ContractDeclarationGenerator extends DeclarationGenerator {
  constructor() { super(); }
  generate() : void {
    //! Create the contract scope
    const thisid = global_id++;
    cur_contract_id = thisid;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Definition: ${thisid}`));
      indent += 2;
    }
    assert(cur_scope.kind() === scopeKind.GLOBAL, "Contracts' scope must be global");
    decl_db.insert(thisid, erwin_visibility.NAV, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONTRACT);
    //! Generate contract name
    const contract_name = generateVarName();
    const body : IRNode[] = [];
    //! Generate state variables
    const state_variable_count = randomInt(config.state_variable_count_lowerlimit, config.state_variable_count_upperlimit);
    // Generate state variables and randomly assigns values to these variables
    for (let i = 0; i < state_variable_count; i++) {
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(type.elementary_types);
      variable_gen.generate();
      const variable_decl = variable_gen.irnode! as decl.IRVariableDeclaration;
      if (Math.random() < 0.5) {
        const literal_gen = new LiteralGenerator(-1.5);
        literal_gen.generate(0);
        variable_decl.value = literal_gen.irnode! as expr.IRExpression;
        let expression_gen_extracted = expr.tupleExtraction(literal_gen.irnode! as expr.IRExpression);
        type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "super_dominance");
      }
      body.push(variable_decl);
      state_variables.add(variable_decl.id);
      // For each state variable, generate a external view function with the same identifier name as the state variable.
      const fid = global_id++;
      if (config.debug) {
        console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating getter function for state variable ${variable_decl.name}, ID: ${fid}`));
        indent += 2;
      }
      decl_db.funcdecls.add(fid);
      decl_db.insert(fid, erwin_visibility.INCONTRACT_EXTERNAL, cur_scope.id());
      funcstat_dag.insert(funcstat_dag.newNode(fid));
      funcstat_dag.solution_range.set(fid, [FuncStatProvider.empty()]);
      // The returned variable_decl is not the state variable, but is a ghost variable of the true state variable
      // Since expr2used_vardecls(functioncall) is its returned vardecl, which may be state variable, 
      // an external call of this getter function may mislead a function body and let it believe it uses the state variable, which is not true. 
      // So we need a ghost state variable, which is a copy of the true state variable but not a state variable itself, to avoid this misleading.
      const ghost_state_vardecl = new decl.IRVariableDeclaration(global_id++, cur_scope.id(), variable_decl.name,
        undefined, variable_decl.visibility);
      type_dag.insert(type_dag.newNode(ghost_state_vardecl.id));
      type_dag.solution_range.set(ghost_state_vardecl.id, type_dag.solution_range.get(variable_decl.id)!);
      type_dag.connect(ghost_state_vardecl.id, variable_decl.id);
      decl_db.ghost_funcdecls.add(fid);
      decl_db.add_ghosts_for_state_variable(fid, ghost_state_vardecl.id, variable_decl.id);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, [], [ghost_state_vardecl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
      if (config.debug) {
        indent -= 2;
        console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating getter function for state variable ${variable_decl.name}, ID: ${fid}`));
      }
    }
    //TODO: Generate struct declaration
    //TODO: Generate events, errors, and mappings
    decl_db.insert_contract(cur_scope.id(), thisid);
    //! Generator constructor declaration
    const constructor_gen = new ConstructorDeclarationGenerator(false);
    constructor_gen.generate();
    body.push(constructor_gen.irnode!);
    //! Generate function declarations in contract
    const function_count_per_contract_upper_limit = randomInt(config.function_count_per_contract_lower_limit,
      config.function_count_per_contract_upper_limit);
    //* To allow circular function calls, Erwin first generates function declarations and then generates function bodies.
    const function_gens : FunctionDeclarationGenerator[] = [];
    for (let i = 0; i < function_count_per_contract_upper_limit; i++) {
      // Disallow generating function bodies for the first function declaration
      function_gens[i] = new FunctionDeclarationGenerator(false);
      function_gens[i].generate();
      body.push(function_gens[i].irnode!);
    }
    //! Generate constructor body
    constructor_gen.generate_body();
    //! Generate function bodies
    for (let i = 0; i < function_count_per_contract_upper_limit; i++) {
      function_gens[i].generate_function_body();
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new decl.IRContractDefinition(thisid, cur_scope.id(), contract_name,
      ContractKind.Contract, false, false, body, [], [], [], constructor_gen.parameters);
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating contract ${thisid}`));
    }
  }
}

//TODO: Generate library, interface, and abstract contract.

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  dominatee_id : number;
  type_range : type.Type[];
  dominance : "sub_dominance" | "super_dominance" | undefined = undefined;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super();
    this.dominatee_id = dominatee_id;
    this.type_range = dominatee_id_to_type_range(dominatee_id);
    this.dominance = dominance;
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class LValueGenerator extends ExpressionGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class RValueGenerator extends ExpressionGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class LRValueGenerator extends ExpressionGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export class LiteralGenerator extends RValueGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal, type range is ${this.type_range.map(t => t.str())}`));
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    this.irnode = new expr.IRLiteral(thisid, cur_scope.id());
    expr2used_vardecls.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    let irdecl : decl.IRVariableDeclaration;
    // Generate a variable decl if there is no variable decl available.
    if (!hasAvailableIRVariableDeclareWithTypeConstraint(this.type_range) ||
      Math.random() < config.vardecl_prob) {
      const variable_decl_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range);
      const literal_gen = new LiteralGenerator(-1.5);
      variable_decl_gen.generate();
      literal_gen.generate(0);
      let expression_gen_extracted = expr.tupleExtraction(literal_gen.irnode! as expr.IRExpression);
      type_dag.connect(expression_gen_extracted.id, variable_decl_gen.irnode!.id, "super_dominance");
      const variable_decl_stmt = new stmt.IRVariableDeclareStatement(
        global_id++, cur_scope.id(), [variable_decl_gen.irnode! as decl.IRVariableDeclaration],
        literal_gen.irnode! as expr.IRExpression
      );
      unexpected_extra_stmt.push(variable_decl_stmt as stmt.IRVariableDeclareStatement);
      irdecl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
    }
    else {
      const contract_instance_plus_availableIRDecl = getAvailableIRVariableDeclareWithTypeConstraint(this.type_range);
      assert(contract_instance_plus_availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(contract_instance_plus_availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pickRandomElement(contract_instance_plus_availableIRDecl)!;
    }
    this.irnode = new expr.IRIdentifier(thisid, cur_scope.id(), irdecl.name, irdecl.id);

    type_dag.connect(this.irnode.id, irdecl.id);
    expr2used_vardecls.set(this.irnode.id, new Set<number>([irdecl.id]));
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Identifier --> ${irdecl.id}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type ASSIOP = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";

export class AssignmentGenerator extends RValueGenerator {
  op : ASSIOP;

  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, op ?: ASSIOP) {
    super(dominatee_id, dominance);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(this.type_range, type.bool_types)
      || isEqualSet(this.type_range, type.address_types)) {
      this.op = "=";
    }
    else if (isSuperSet(type.all_integer_types, this.type_range) ||
      isEqualSet(this.type_range, type.elementary_types)) {
      this.op = pickRandomElement(
        ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="])!;
    }
    else {
      throw new Error(`AssignmentGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
  }

  left_dominate_right() : boolean {
    return this.op !== ">>=" && this.op !== "<<=";
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    //! Update type range of this node
    let initial_type_range;
    if (this.op === "=") initial_type_range = this.type_range;
    else {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = initial_type_range = type.all_integer_types;
      }
      else {
        initial_type_range = this.type_range;
      }
    }
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    //! Generate the right-hand-side expression
    let right_expression_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(initial_type_range, type.address_types))
        right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    let right_expression_gen;
    if (!this.left_dominate_right()) {
      right_expression_gen = new right_expression_gen_prototype(-2.5);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(-thisid);
    }
    right_expression_gen.generate(cur_expression_complex_level + 1);
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Generate the left-hand-side identifier
    let identifier_gen;
    if (this.left_dominate_right())
      identifier_gen = new IdentifierGenerator(right_extracted_expression.id, "sub_dominance");
    else
      identifier_gen = new IdentifierGenerator(-thisid);
    identifier_gen.generate(cur_expression_complex_level + 1);
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls
    expr2used_vardecls.set(thisid,
      mergeSet(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRAssignment(thisid, cur_scope.id(), left_expression, right_expression, this.op!);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
    }
    type_dag.connect(thisid, left_extracted_expression.id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Assignment ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
    //! Wrap the irnode with a tuple
    if (cur_expression_complex_level !== 0) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    else if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type BOP = "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "^" | "|" | "&&" | "||";

export class BinaryOpGenerator extends RValueGenerator {
  op : BOP;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, op ?: BOP) {
    super(dominatee_id, dominance);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(this.type_range, type.bool_types)) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (isSuperSet(type.all_integer_types, this.type_range)) {
      this.op = pickRandomElement(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else if (isEqualSet(this.type_range, type.elementary_types)) {
      this.op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
    }
    else {
      throw new Error(`BinaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
  }

  this_dominates_left() : boolean {
    return ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|", "&&", "||"].filter((op) => op === this.op).length === 1;
  }

  left_dominate_right() : boolean {
    return this.op !== ">>" && this.op !== "<<";
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    //! Update type range of this node
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1) {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type.all_integer_types;
      }
    }
    else if (["<", ">", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      this.type_range = type.bool_types;
    }
    else { // &&, ||, =
      this.type_range = type.bool_types;
    }
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    //! Select generators for the left-hand-side and right-hand-side expressions
    let left_expression : expr.IRExpression;
    let right_expression : expr.IRExpression;
    let left_expression_gen_prototype, right_expression_gen_prototype;
    let left_expression_gen, right_expression_gen;
    /* RULES
    1. Avoid the situation that both left_expression and right_expression are literals.
    In this case, we cannot control the value of the result.
    For instance, (ZOwza %= (19421) * 50595) where ZOwza is uint16.
    Then (19421) * 50595 overflows the uint16 range, leading to an invalid code.
    2. According to the following rule in https://docs.soliditylang.org/en/latest/types.html#rational-and-integer-literals,
    "Shifts and exponentiation with literal numbers as left (or base) operand and integer types as the right (exponent)
    operand are always performed in the uint256 (for non-negative literals) or int256 (for a negative literals) type,
    regardless of the type of the right (exponent) operand.",
    if the op is a shift op and the left expression is a literal, then the type of binary expression should be uint256/int256
    since we don't allow there exist two literals in a binary expression according to rule 1.
    */
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      if (this.op === "<<" || this.op === ">>") {
        left_expression_gen_prototype = IdentifierGenerator;
      }
      else {
        left_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      }
    }
    else {
      if (this.op === "<<" || this.op === ">>") {
        left_expression_gen_prototype = pickRandomElement(nonliteral_expression_generators)!;
      }
      else {
        left_expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
    }
    if (["*", "+", "-", "<<", "|", "^"].includes(this.op) && left_expression_gen_prototype.name === "LiteralGenerator") {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = IdentifierGenerator;
      }
      else {
        right_expression_gen_prototype = pickRandomElement(nonliteral_expression_generators)!;
      }
    }
    else {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      }
      else {
        right_expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
    }
    //! Generate right-hand-side expression
    if (this.left_dominate_right() && this.this_dominates_left()) {
      right_expression_gen = new right_expression_gen_prototype(-thisid);
    }
    else if (this.this_dominates_left()) {
      right_expression_gen = new right_expression_gen_prototype(-2.5);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(-3.5);
    }
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Generate left-hand-side expression
    if (this.left_dominate_right()) {
      left_expression_gen = new left_expression_gen_prototype(right_extracted_expression.id, "sub_dominance");
    }
    else if (this.this_dominates_left()) {
      left_expression_gen = new left_expression_gen_prototype(-thisid);
    }
    else {
      throw new Error(`BinaryOpGenerator: op ${this.op} leads to an invalid situation`);
    }
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls
    expr2used_vardecls.set(thisid,
      mergeSet(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(thisid, cur_scope.id(), left_expression, right_expression, this.op);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    if (this.this_dominates_left()) {
      type_dag.connect(thisid, left_extracted_expression.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: BinaryOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type BINARYCOMPAREOP = "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||";

export class BinaryCompareOpGenerator extends RValueGenerator {
  op : BINARYCOMPAREOP;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, op ?: BINARYCOMPAREOP) {
    super(dominatee_id, dominance);
    assert(isEqualSet(this.type_range, type.bool_types),
      `BinaryCompareOpGenerator: type_range ${this.type_range.map(t => t.str())} should be bool_types`);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(this.type_range, type.bool_types)) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else {
      throw new Error(`BinaryCompareOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
  }

  this_dominates_left() : boolean {
    return ["&&", "||"].filter((op) => op === this.op).length === 1;
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    //! Select generators for the left-hand-side and right-hand-side expressions
    let left_expression : expr.IRExpression;
    let right_expression : expr.IRExpression;
    let left_expression_gen_prototype, right_expression_gen_prototype;
    let left_expression_gen, right_expression_gen;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      left_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      left_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate right-hand-side expression
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      right_expression_gen = new right_expression_gen_prototype(-3.5);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(-thisid);
    }
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Generate left-hand-side expression
    left_expression_gen = new left_expression_gen_prototype(right_extracted_expression.id, "sub_dominance");
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    expr2used_vardecls.set(thisid,
      mergeSet(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(thisid, cur_scope.id(), left_expression, right_expression, this.op);
    //! Build dominations
    type_dag.typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    if (this.this_dominates_left()) {
      type_dag.connect(thisid, left_extracted_expression.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: BinaryCompareOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type UOP = "!" | "-" | "~" | "++" | "--";

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  op : UOP;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, op ?: UOP) {
    super(dominatee_id, dominance);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(this.type_range, type.elementary_types)) {
      this.op = pickRandomElement(["!", "-", "~", "++", "--"])!;
    }
    else if (isEqualSet(this.type_range, type.bool_types)) {
      this.op = "!";
    }
    else if (isEqualSet(this.type_range, type.integer_types) || isEqualSet(this.type_range, type.all_integer_types)) {
      this.op = pickRandomElement(["-", "~", "++", "--"])!;
    }
    else if (isEqualSet(this.type_range, type.uinteger_types)) {
      this.op = pickRandomElement(["~", "++", "--"])!;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    //! Update type range
    if (this.op === "!") {
      this.type_range = type.bool_types;
    }
    else if (this.op === "~" || this.op === "++" || this.op === "--") {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type.all_integer_types;
      }
    }
    else if (this.op === "-") {
      this.type_range = type.integer_types;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    //! Generate identifier
    const identifier_gen = new IdentifierGenerator(-thisid);
    identifier_gen.generate(cur_expression_complex_level + 1);
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    //! Generate irnode
    this.irnode = new expr.IRUnaryOp(thisid, cur_scope.id(), pickRandomElement([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tupleExtraction(expression);
    //!. Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_expression.id)!);
    //! Build dominations
    type_dag.connect(thisid, extracted_expression.id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: UnaryOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

export class ConditionalGenerator extends RValueGenerator {
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined) {
    super(dominatee_id, dominance);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    //! Suppose the conditional expression is e1 ? e2 : e3
    //! The first step is to get a generator for e1.
    let e1_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e1_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      e1_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e1
    const e1_gen = new e1_gen_prototype(-4.5);
    e1_gen.generate(cur_expression_complex_level + 1);
    let extracted_e1 = expr.tupleExtraction(e1_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_e1.id)!);
    //! Generate e3
    let e3_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e3_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      e3_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e3
    const e3_gen = new e3_gen_prototype!(-thisid);
    e3_gen.generate(cur_expression_complex_level + 1);
    let extracted_e3 = expr.tupleExtraction(e3_gen.irnode! as expr.IRExpression);
    //! Generate e2
    let e2_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e2_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(type_dag.solution_range.get(extracted_e3.id)!, type.address_types))
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    const e2_gen = new e2_gen_prototype(extracted_e3.id, "sub_dominance");
    e2_gen.generate(cur_expression_complex_level + 1);
    let extracted_e2 = expr.tupleExtraction(e2_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid,
      mergeSet(
        mergeSet(
          expr2used_vardecls.get(extracted_e1.id)!,
          expr2used_vardecls.get(extracted_e2.id)!
        ),
        expr2used_vardecls.get(extracted_e3.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRConditional(
      thisid, cur_scope.id(), e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    //! Build dominations
    type_dag.typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.connect(thisid, extracted_e2.id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Conditional, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

export class FunctionCallGenerator extends RValueGenerator {
  kind : FunctionCallKind | undefined;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, kind ?: FunctionCallKind) {
    super(dominatee_id, dominance);
    this.kind = kind;
    if (this.kind === undefined) {
      this.kind = FunctionCallKind.FunctionCall;
    }
  }

  contains_available_funcdecls(contractdecl_id_plus_funcdecl_id : [number, number][]) : boolean {
    if (contractdecl_id_plus_funcdecl_id.length === 0) return false;
    for (const [contractdecl_id, funcdecl_id] of contractdecl_id_plus_funcdecl_id) {
      if (decl_db.ghost_funcdecls.has(funcdecl_id)) {
        if (contractdecl_id !== cur_contract_id) {
          return true;
        }
        continue;
      }
      const visibility_range = func_visibility_dag.solution_range.get(funcdecl_id)!;
      if (contractdecl_id === cur_contract_id &&
        (
          visibility_range.includes(FuncVisProvider.internal()) ||
          visibility_range.includes(FuncVisProvider.private()) ||
          visibility_range.includes(FuncVisProvider.public())
        )) {
        return true;
      }
      if (contractdecl_id !== cur_contract_id &&
        (
          visibility_range.includes(FuncVisProvider.external()) ||
          visibility_range.includes(FuncVisProvider.public())
        )) {
        return true;
      }
    }
    return false;
  }

  generate(cur_expression_complex_level : number) : void {
    let return_is_good = (ret_decl_id : number) : boolean => {
      return isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl_id)!) ||
        isSuperSet(type_dag.solution_range.get(ret_decl_id)!, this.type_range) &&
        type_dag.try_tighten_solution_range_middle_out(ret_decl_id, this.type_range)
    };
    //! If cur_expression_complex_level reaches the maximum, generate an terminal expression
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      const expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.dominatee_id);
      expression_gen.generate(cur_expression_complex_level);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Find available function declarations
    let contractdecl_id_plus_funcdecl_id : [number, number][] = [];
    for (let contract_id of decl_db.contractdecls) {
      const funcdecl_ids = decl_db.get_funcdecls_ids_recursively_from_a_contract(contract_id);
      for (let irnode_id of funcdecl_ids) {
        if (contract_id === cur_contract_id) {
          if ((irnodes.get(irnode_id) as decl.IRFunctionDefinition).visibility != FunctionVisibility.External &&
            (allow_empty_return || (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns.length > 0)) {
            for (const ret_decl of (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns) {
              if (return_is_good(ret_decl.id)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
        else if (contract_id < 0 && contract_id !== -cur_contract_id) {
          continue;
        }
        else {
          if (((irnodes.get(irnode_id) as decl.IRFunctionDefinition).visibility == FunctionVisibility.External ||
            func_visibility_dag.solution_range.get(irnode_id)!.includes(FuncVisProvider.external())) &&
            (allow_empty_return || (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns.length > 0)) {
            for (const ret_decl of (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns) {
              if (return_is_good(ret_decl.id)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
      }
    }
    //! If no available function declaration, generate other expressions
    if (!this.contains_available_funcdecls(contractdecl_id_plus_funcdecl_id)) {
      let expression_gen_prototype;
      if (isEqualSet(this.type_range, type.address_types)) {
        expression_gen_prototype = pickRandomElement(non_funccall_expression_generators_for_address_type)!;
      }
      else {
        expression_gen_prototype = pickRandomElement(non_funccall_expression_generators)!;
      }
      const expression_gen = new expression_gen_prototype(this.dominatee_id);
      expression_gen.generate(cur_expression_complex_level);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Otherwise, first select a function declaration
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.dominatee_id >= 1)
      type_dag.connect(thisid, this.dominatee_id, this.dominance);
    const [contractdecl_id, funcdecl_id] = pickRandomElement(contractdecl_id_plus_funcdecl_id)!;
    if (contractdecl_id === cur_contract_id) {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        func_visibility_dag.solution_range.set(funcdecl_id,
          [...intersection(new Set<FuncVis>([
            FuncVisProvider.internal(),
            FuncVisProvider.private(),
            FuncVisProvider.public()
          ]), new Set<FuncVis>(func_visibility_dag.solution_range.get(funcdecl_id)!))]);
      }
    }
    else {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        func_visibility_dag.solution_range.set(funcdecl_id,
          [...intersection(new Set<FuncVis>([
            FuncVisProvider.public(),
            FuncVisProvider.external()
          ]), new Set<FuncVis>(func_visibility_dag.solution_range.get(funcdecl_id)!))]);
      }
    }
    decl_db.called_function_decls_IDs.add(funcdecl_id);
    if (decl_db.ghost_funcdecls.has(funcdecl_id)) {
      const state_variable_id = decl_db.ghost_vardecl_to_state_vardecl.get(
        (irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).returns[0].id
      )!;
      state_variable_visibility_dag.solution_range.set(state_variable_id, [
        VarVisProvider.public()
      ]);
    }
    const funcdecl = irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition;
    //! Then generate an identifier for this function declaration
    const func_name = funcdecl.name;
    const func_identifier = new expr.IRIdentifier(global_id++, cur_scope.id(), func_name, funcdecl_id);
    //! Then select which returned value to be used
    const ret_decls = funcdecl.returns;
    const available_ret_decls_index : number[] = [];
    for (let i = 0; i < ret_decls.length; i++) {
      if (return_is_good(ret_decls[i].id)) {
        available_ret_decls_index.push(i);
      }
    }
    let selected_ret_decls_index = available_ret_decls_index.length == 0 ? -1 : pickRandomElement(available_ret_decls_index)!;
    let selected_ret_decl : null | decl.IRVariableDeclaration = null;
    if (selected_ret_decls_index !== -1) selected_ret_decl = ret_decls[selected_ret_decls_index];
    if (selected_ret_decl !== null) {
      type_dag.connect(thisid, selected_ret_decl.id);
    }
    if (config.debug && selected_ret_decl !== null) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  The type range of the selected ret decl (ID: ${selected_ret_decl.id}) is ${selected_ret_decls_index}: ${type_dag.solution_range.get(selected_ret_decl.id)!.map(t => t.str())}`));
    }
    //! Then generate expressions as arguments
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall Arguments`));
      indent += 2;
    }
    const args_ids : number[] = [];
    expr2used_vardecls.set(thisid, new Set<number>());
    for (let i = 0; i < funcdecl.parameters.length; i++) {
      const type_range = type_dag.solution_range.get(funcdecl.parameters[i].id)!;
      let arg_gen_prototype;
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        arg_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      }
      else {
        if (isEqualSet(type_range, type.address_types))
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
        else
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      }
      const arg_gen = new arg_gen_prototype(funcdecl.parameters[i].id);
      arg_gen.generate(cur_expression_complex_level + 1);
      let extracted_arg = expr.tupleExtraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
    }
    for (const arg_id of args_ids) {
      expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(arg_id)!));
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}<<  Finish generating FunctionCall Arguments`));
    }
    //! Generate an function call and select which returned value will be used
    let func_call_node;
    // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
    if (contractdecl_id !== cur_contract_id) {
      external_call = true;
      // "this" (yin)
      if (contractdecl_id < 0) {
        func_call_node = new expr.IRFunctionCall(
          thisid,
          cur_scope.id(),
          this.kind!,
          new expr.IRMemberAccess(global_id++, cur_scope.id(),
            func_identifier.name!, contractdecl_id, new expr.IRIdentifier(global_id++, cur_scope.id(), "this", -1),
          ),
          args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
        );
      }
      // Other yang contracts
      else {
        const new_contract_gen = new NewContractDecarationGenerator(-5.5, undefined, contractdecl_id);
        new_contract_gen.generate(cur_expression_complex_level + 1);
        func_call_node = new expr.IRFunctionCall(
          thisid,
          cur_scope.id(),
          this.kind!,
          new expr.IRMemberAccess(global_id++, cur_scope.id(),
            func_identifier.name!, contractdecl_id, new_contract_gen.irnode! as expr.IRExpression,
          ),
          args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
        );
      }
    }
    else {
      func_call_node = new expr.IRFunctionCall(thisid, cur_scope.id(), this.kind!,
        func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
    }
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1 && selected_ret_decl !== null) {
      //* generate an identifier
      const identifier_gen = new IdentifierGenerator(-selected_ret_decl.id);
      identifier_gen.generate(cur_expression_complex_level + 1);
      const identifier_expr = expr.tupleExtraction(identifier_gen.irnode! as expr.IRExpression);
      expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(identifier_expr.id)!));
      type_dag.connect(identifier_expr.id, thisid);
      //* 3. use a tuple to wrap around this identifier.
      const tuple_elements : (expr.IRExpression | null)[] = [];
      for (let i = 0; i < ret_decls.length; i++) {
        if (i === selected_ret_decls_index) {
          tuple_elements.push(identifier_gen.irnode! as expr.IRExpression);
        }
        else {
          tuple_elements.push(null);
        }
      }
      const tuple_node = new expr.IRTuple(global_id++, cur_scope.id(), tuple_elements);
      const assignment_node = new expr.IRAssignment(global_id++, cur_scope.id(), tuple_node, func_call_node, "=");
      //* 4. generate an assignment statement passing the returned values of the callee to the tuple
      const assignment_stmt_node = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment_node);
      unexpected_extra_stmt.push(assignment_stmt_node);
      //* 5. This irnode is the same as the identifier irnode which relays the selected returned value
      this.irnode = identifier_gen.irnode!;
      expr2used_vardecls.set(this.irnode.id, expr2used_vardecls.get(thisid)!);
    }
    else {
      this.irnode = func_call_node;
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: FunctionCall, id: ${thisid} scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
  }
}

export class NewContractDecarationGenerator extends ExpressionGenerator {
  contract_id ? : number;
  constructor(dominatee_id : number, dominance : "sub_dominance" | "super_dominance" | undefined = undefined, contract_id ?: number) {
    super(dominatee_id, dominance);
    this.contract_id = contract_id;
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewContractDeclaration`));
      indent += 2;
    }
    assert(decl_db.contractdecls.size > 0, "No contract is declared");
    const thisid = global_id++;
    if (this.contract_id === undefined) {
      this.contract_id = pickRandomElement([...decl_db.contractdecls])!;
    }
    const contract_decl = irnodes.get(this.contract_id)! as decl.IRContractDefinition;
    const new_expr = new expr.IRNew(global_id++, cur_scope.id(), contract_decl.name);
    //! Generate arguments for the constructor
    const args_ids : number[] = [];
    const args : expr.IRExpression[] = [];
    for (let i = 0; i < contract_decl.constructor_parameters.length; i++) {
      const type_range = type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!;
      let arg_gen_prototype;
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        arg_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      }
      else {
        if (isEqualSet(type_range, type.address_types))
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
        else
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      }
      const arg_gen = new arg_gen_prototype(contract_decl.constructor_parameters[i].id);
      arg_gen.generate(cur_expression_complex_level + 1);
      args.push(arg_gen.irnode! as expr.IRExpression);
      let extracted_arg = expr.tupleExtraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      expr2used_vardecls.set(thisid, new Set<number>());
      for (const arg_id of args_ids) {
        expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(arg_id)!));
      }
    }
    const new_function_expr = new expr.IRFunctionCall(thisid, cur_scope.id(), FunctionCallKind.FunctionCall, new_expr, args);
    this.irnode = new_function_expr;
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: NewContractDeclaration, scope: ${cur_scope.id()}`));
    }
  }
}

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
];

const nonterminal_expression_generators = [
  // AssignmentGenerator,
  // BinaryOpGenerator,
  // UnaryOpGenerator,
  // ConditionalGenerator,
  FunctionCallGenerator
];

const nonterminal_expression_generators_for_address_type = [
  // AssignmentGenerator,
  // ConditionalGenerator,
  FunctionCallGenerator
];

const non_funccall_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
];

const non_funccall_expression_generators_for_address_type = [
  IdentifierGenerator,
  AssignmentGenerator,
  ConditionalGenerator,
];

const all_expression_generators = [
  // IdentifierGenerator,
  // AssignmentGenerator,
  // BinaryOpGenerator,
  // UnaryOpGenerator,
  // ConditionalGenerator,
  FunctionCallGenerator
];

const nonliteral_expression_generators = [
  // IdentifierGenerator,
  // AssignmentGenerator,
  // BinaryOpGenerator,
  // UnaryOpGenerator,
  // ConditionalGenerator,
  FunctionCallGenerator
];

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

export abstract class StatementGenerator extends Generator {
  constructor() { super(); }
  abstract generate(cur_stmt_complex_level : number) : void;
}

export abstract class ExpressionStatementGenerator extends StatementGenerator {
  expr : expr.IRExpression | undefined;
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void { }
}

export class AssignmentStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating AssignmentStatement`));
      indent += 2;
    }
    const assignment_gen = new AssignmentGenerator(-1.5);
    assignment_gen.generate(0);
    this.expr = expr.tupleExtraction(assignment_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: AssignmentStatement`));
    }
  }
}

export class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOpStatement`));
      indent += 2;
    }
    const binaryop_gen = new BinaryOpGenerator(-1.5);
    binaryop_gen.generate(0);
    this.expr = expr.tupleExtraction(binaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), binaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: BinaryOpStatement`));
    }
  }
}

export class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOpStatement`));
      indent += 2;
    }
    const unaryop_gen = new UnaryOpGenerator(-1.5);
    unaryop_gen.generate(0);
    this.expr = expr.tupleExtraction(unaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), unaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: UnaryOpStatement`));
    }
  }
}

export class ConditionalStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ConditionalStatement`));
      indent += 2;
    }
    const conditional_gen = new ConditionalGenerator(-1.5);
    conditional_gen.generate(0);
    this.expr = expr.tupleExtraction(conditional_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), conditional_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ConditionalStatement`));
    }
  }
}

export class FunctionCallStatementGenerator extends ExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCallStatement`));
      indent += 2;
    }
    allow_empty_return = true;
    const funcall_gen = new FunctionCallGenerator(-1.5);
    funcall_gen.generate(0);
    this.expr = expr.tupleExtraction(funcall_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), funcall_gen.irnode! as expr.IRExpression);
    allow_empty_return = false;
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: FunctionCallStatement`));
    }
  }
}

export abstract class NonExpressionStatementGenerator extends StatementGenerator {
  exprs : expr.IRExpression[];
  constructor() {
    super();
    this.exprs = [];
  }
  complex(cur_stmt_complex_level : number) : boolean {
    return cur_stmt_complex_level >= config.statement_complex_level || Math.random() < config.nonstructured_statement_prob;
  }
  abstract generate(cur_stmt_complex_level : number) : void;
};

export class MultipleVariableDeclareStatementGenerator extends NonExpressionStatementGenerator {
  var_count : number;
  constructor(var_count : number) {
    super();
    this.var_count = var_count;
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment MultipleVariableDeclareStatement`));
      indent += 2;
    }
    const ir_exps : expr.IRExpression[] = [];
    for (let i = 0; i < this.var_count; i++) {
      let expression_gen_prototype;
      if (hasAvailableIRVariableDeclare() && Math.random() > config.literal_prob) {
        expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expression_gen = new expression_gen_prototype(-1.5);
      expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
      this.exprs = this.exprs.concat(expr.tupleExtraction(ir_exps[i]));
    }
    const ir_varnodes : decl.IRVariableDeclaration[] = [];
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(type.elementary_types);
      variable_gen.generate();
      ir_varnodes.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    const ir_tuple_exp = new expr.IRTuple(global_id++, cur_scope.id(), ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.id(), ir_varnodes, ir_tuple_exp);
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = expr.tupleExtraction(ir_exps[i]);
      type_dag.connect(extracted_ir.id, ir_varnodes[i].id, "super_dominance");
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: MultipleVariableDeclareStatement`));
    }
  }
}

export class ReturnStatementGenerator extends NonExpressionStatementGenerator {
  value : expr.IRExpression | undefined;
  constructor(value ?: expr.IRExpression) {
    super();
    this.value = value;
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>   `));
      indent += 2;
    }
    if (this.value === undefined) {
      const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expression_gen = new expression_gen_prototype(-1.5);
      expression_gen.generate(0);
      this.value = expression_gen.irnode! as expr.IRExpression;
      this.exprs.push(expr.tupleExtraction(this.value));
    }
    this.irnode = new stmt.IRReturnStatement(global_id++, cur_scope.id(), this.value);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ReturnStatement`));
    }
  }
}

export class IfStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating IfStatement`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF);
    //! Generate condition
    const condition_gen = new BinaryCompareOpGenerator(-4.5);
    condition_gen.generate(0);
    this.exprs.push(expr.tupleExtraction(condition_gen.irnode as expr.IRExpression));
    //! Generate true body
    const true_body : stmt.IRStatement[] = [];
    const true_stmt_cnt = randomInt(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < true_stmt_cnt; i++) {
      const then_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pickRandomElement(expr_statement_generators)! :
        pickRandomElement(statement_generators)!;
      const then_stmt_gen = new then_stmt_gen_prototype();
      then_stmt_gen.generate(cur_stmt_complex_level + 1);
      true_body.push(then_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        then_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tupleExtraction(then_stmt_gen.expr!)] :
          then_stmt_gen.exprs
      );
    }
    if (Math.random() < config.else_prob) {
      this.irnode = new stmt.IRIf(global_id++, cur_scope.id(), condition_gen.irnode! as expr.IRExpression, true_body, []);
      return;
    }
    //! Generate false body
    const false_body : stmt.IRStatement[] = [];
    const false_stmt_cnt = randomInt(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < false_stmt_cnt; i++) {
      const else_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pickRandomElement(expr_statement_generators)! :
        pickRandomElement(statement_generators)!;
      const else_stmt_gen = new else_stmt_gen_prototype();
      else_stmt_gen.generate(cur_stmt_complex_level + 1);
      false_body.push(else_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        else_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tupleExtraction(else_stmt_gen.expr!)] :
          else_stmt_gen.exprs
      );
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRIf(global_id++, cur_scope.id(), condition_gen.irnode! as expr.IRExpression, true_body, false_body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: IfStatement`));
    }
  }
}

export class ForStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ForStatement`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.FOR);
    //! Generate the initialization statement
    let init_stmt_expr : stmt.IRVariableDeclareStatement | expr.IRExpression | undefined;
    const init_cnt = randomInt(config.for_init_cnt_lower_limit, config.for_init_cnt_upper_limit);
    if (Math.random() < config.vardecl_prob) {
      const mul_vardecl_gen = new MultipleVariableDeclareStatementGenerator(init_cnt);
      mul_vardecl_gen.generate(0);
      init_stmt_expr = mul_vardecl_gen.irnode! as stmt.IRVariableDeclareStatement;
      this.exprs = this.exprs.concat(mul_vardecl_gen.exprs);
    }
    else {
      const ir_exps : expr.IRExpression[] = [];
      for (let i = 0; i < init_cnt; i++) {
        const init_expr_gen_prototype = pickRandomElement(all_expression_generators)!;
        const init_expr_gen = new init_expr_gen_prototype(-1.5);
        init_expr_gen.generate(0);
        ir_exps.push(init_expr_gen.irnode! as expr.IRExpression);
      }
      if (init_cnt > 0) {
        init_stmt_expr = new expr.IRTuple(global_id++, cur_scope.id(), ir_exps);
        this.exprs = this.exprs.concat(ir_exps.map(e => expr.tupleExtraction(e)));
      }
      else {
        init_stmt_expr = undefined;
        this.exprs = [];
      }
    }
    //! Generate the conditional expression
    const conditional_gen = new BinaryCompareOpGenerator(-4.5);
    conditional_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tupleExtraction(conditional_gen.irnode as expr.IRExpression)]);
    //! Generate the loop generation expression
    const loop_gen_prototype = pickRandomElement(all_expression_generators)!;
    const loop_gen = new loop_gen_prototype(-1.5);
    loop_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tupleExtraction(loop_gen.irnode as expr.IRExpression)]);
    //! Generate the body statement
    const stmt_cnt = randomInt(config.for_body_stmt_cnt_lower_limit, config.for_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pickRandomElement(expr_statement_generators)! :
        pickRandomElement(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      body.push(body_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tupleExtraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );

    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRFor(global_id++, cur_scope.id(), init_stmt_expr, conditional_gen.irnode! as expr.IRExpression,
      loop_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ForStatement`));
    }
  }
}

export class WhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating WhileStatement`));
      indent += 2;
    }
    //! Generate condition expression
    const cond_gen_prototype = pickRandomElement(all_expression_generators)!;
    const cond_gen = new cond_gen_prototype(-4.5);
    cur_scope = cur_scope.new(scopeKind.WHILE);
    cond_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tupleExtraction(cond_gen.irnode as expr.IRExpression)]);
    //! Generate body statement
    const stmt_cnt = randomInt(config.while_body_stmt_cnt_lower_limit, config.while_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pickRandomElement(expr_statement_generators)! :
        pickRandomElement(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tupleExtraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );
      body.push(body_stmt_gen.irnode!);
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRWhile(global_id++, cur_scope.id(), cond_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: WhileStatement`));
    }
  }
}

export class DoWhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement`));
      indent += 2;
    }
    //! Generate condition expression
    const cond_gen_prototype = pickRandomElement(all_expression_generators)!;
    const cond_gen = new cond_gen_prototype(-4.5);
    cur_scope = cur_scope.new(scopeKind.DOWHILE_COND);
    cond_gen.generate(0);
    cur_scope = cur_scope.rollback();
    this.exprs = this.exprs.concat([expr.tupleExtraction(cond_gen.irnode as expr.IRExpression)]);
    //! Generate body statement
    cur_scope = cur_scope.new(scopeKind.DOWHILE_BODY);
    const stmt_cnt = randomInt(config.do_while_body_stmt_cnt_lower_limit, config.do_while_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pickRandomElement(expr_statement_generators)! :
        pickRandomElement(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tupleExtraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );
      body.push(body_stmt_gen.irnode!);
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRDoWhile(global_id++, cur_scope.id(), cond_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: DoWhileStatement`));
    }
  }
}

const expr_statement_generators = [
  // AssignmentStatementGenerator,
  // BinaryOpStatementGenerator,
  // UnaryOpStatementGenerator,
  // ConditionalStatementGenerator,
  FunctionCallStatementGenerator
]

const statement_generators = [
  // AssignmentStatementGenerator,
  // BinaryOpStatementGenerator,
  // UnaryOpStatementGenerator,
  // ConditionalStatementGenerator,
  // FunctionCallStatementGenerator,
  // IfStatementGenerator,
  // ForStatementGenerator,
  // WhileStatementGenerator,
  DoWhileStatementGenerator
]