import { assert, pickRandomElement, generateRandomString, randomInt, mergeSet, intersection } from "./utility";
import { IRNode } from "./node";
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
// Record the vardecls dominated by each expression.
// expr2dominated_vardecls only cares about the vardecls that are dominated during expr generation.
// If this expr is dominated / dominates other exprs after the generation, the domination relation is not recorded.
const expr2dominated_vardecls : Map<number, Set<number>> = new Map<number, Set<number>>();
// For each key vardecl, record the vardecls that dominate or are dominated by it. These vardecls are of the same type range as the key vardecl.
const vardecl2vardecls_of_the_same_type_range : Map<number, Set<number>> = new Map<number, Set<number>>();
let no_state_variable_in_function_body = false;
let allow_empty_return = false;
// A signal to indicate whether there is an external function call in the current function body.
let external_call = false;
let cur_contract_id = 0;
/*
Image a awkward situation:
In a function call generation, one of the arguments is a function call to the same function.
Then the type range decision of one of the returned variable may encounter a conflict.
For instance, the first function call decides the first retured variable to be an integer while
the second function call decides the first returned variable to be a boolean.
The second advances in this race since we should generate the argument before the function call.
Now the first function call believe the first returned variable is an integer while the second function call
has made it a boolean. So we need to forbid this recursive function calls to the same function definition.
To support function call as an argument of another function call to the same function, we need to introduce
mutators after resolving domination constraints.
*/
const forbidden_funcs : Set<number> = new Set<number>();
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
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

export abstract class Generator {
  irnode : IRNode | undefined;
  generator_name : string;
  constructor() {
    this.generator_name = this.constructor.name;
  }
}

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
  const IDs_of_available_irnodes = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  for (let id of IDs_of_available_irnodes) {
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
  const IDs_of_available_irnodes = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  for (let id of IDs_of_available_irnodes) {
    if (decl_db.vardecls.has(id) && !(no_state_variable_in_function_body && state_variables.has(id))) {
      collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
    }
  }
  return collection.filter((irdecl) => isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) || isSuperSet(types, type_dag.solution_range.get(irdecl.id)!));
}

function hasAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : boolean {
  return getAvailableIRVariableDeclareWithTypeConstraint(types).length > 0;
}

function getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types : type.Type[],
  forbidden_vardecls : Set<number>,
  dominated_vardecls_by_dominator : Set<number>) :
  decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  const IDs_of_available_irnodes = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  for (let id of IDs_of_available_irnodes) {
    if (decl_db.vardecls.has(id) && !(no_state_variable_in_function_body && state_variables.has(id))) {
      collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
    }
  }
  //TODO: support the following code, which is used to extract function identifier from contract instance
  // for (const [scoper_id, irnode_id] of decl_db.get_hidden_func_irnodes_ids_from_contract_instance(cur_scope.id())) {
  //   if (decl_db.vardecls.has(irnode_id) && !(no_state_variable_in_function_body && state_variables.has(irnode_id))) {
  //     collection.push([scoper_id, irnodes.get(irnode_id)! as decl.IRVariableDeclaration]);
  //   }
  // }

  for (const dominated_vardecl of dominated_vardecls_by_dominator) {
    for (const vardecl of vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!) {
      dominated_vardecls_by_dominator.add(vardecl);
    }
  }

  for (const vardecl of forbidden_vardecls) {
    for (const dominated_vardecl of vardecl2vardecls_of_the_same_type_range.get(vardecl)!) {
      if (!forbidden_vardecls.has(dominated_vardecl)) {
        forbidden_vardecls.add(dominated_vardecl);
      }
    }
  }

  let type_range_narrows_down_the_type_range_of_forbidden_vardecls = (type_range : type.Type[]) : boolean => {
    for (const vardecl of dominated_vardecls_by_dominator) {
      if (isSuperSet(type_dag.solution_range.get(vardecl)!, type_range)
        && !isEqualSet(type_dag.solution_range.get(vardecl)!, type_range)) return true;
    }
    return false;
  }

  return collection.filter((irdecl) =>
    type_range_narrows_down_the_type_range_of_forbidden_vardecls(type_dag.solution_range.get(irdecl.id)!) ?
      false :
      forbidden_vardecls.has(irdecl.id) ?
        isSuperSet(types, type_dag.solution_range.get(irdecl.id)!) :
        isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) ||
        isSuperSet(types, type_dag.solution_range.get(irdecl.id)!));
}

function hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types : type.Type[],
  forbidden_vardecls : Set<number>,
  dominated_vardecls_by_dominator : Set<number>) :
  boolean {
  return getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types,
    forbidden_vardecls,
    dominated_vardecls_by_dominator).length > 0;
}

// irnode1 dominates irnode2
function typeRangeAlignment(irnode_id1 : number, irnode_id2 : number) : void {
  if (isEqualSet(type_dag.solution_range.get(irnode_id1)!, type_dag.solution_range.get(irnode_id2)!)) return;
  if (isSuperSet(type_dag.solution_range.get(irnode_id1)!, type_dag.solution_range.get(irnode_id2)!)) {
    type_dag.solution_range.set(irnode_id1, type_dag.solution_range.get(irnode_id2)!);
    type_dag.tighten_solution_range_middle_out(irnode_id1);
    if (config.debug) {
      console.log(`${[...type_dag.solution_range.keys()].map(k => `${k}: ${type_dag.solution_range.get(k)!.map(t => t.str())}`).join("\n")}`)
    }
    return;
  }
  if (isSuperSet(type_dag.solution_range.get(irnode_id2)!, type_dag.solution_range.get(irnode_id1)!)) {
    type_dag.solution_range.set(irnode_id2, type_dag.solution_range.get(irnode_id1)!);
    type_dag.tighten_solution_range_middle_out(irnode_id2);
    if (config.debug) {
      console.log(`${[...type_dag.solution_range.keys()].map(k => `${k}: ${type_dag.solution_range.get(k)!.map(t => t.str())}`).join("\n")}`)
    }
    return;
  }
  throw new Error(`typeRangeAlignment: type_range of ${irnode_id1}: ${type_dag.solution_range.get(irnode_id1)!.map(t => t.str())}
    and ${irnode_id2}: ${type_dag.solution_range.get(irnode_id2)!.map(t => t.str())} cannot be aligned`);
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
    vardecl2vardecls_of_the_same_type_range.set(this.irnode.id, new Set<number>());
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
        const expr_gen = new expr_gen_prototype(type_dag.solution_range.get(vardecl.id)!, new Set<number>([vardecl.id]), new Set<number>([vardecl.id]));
        expr_gen.generate(0);
        const expression = expr_gen.irnode! as expr.IRExpression;
        const assignment = new expr.IRAssignment(global_id++, cur_scope.id(), identifier, expression, "=");
        const assignment_stmt = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment);
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
      const expr_gen = new expr_gen_prototype(type_dag.solution_range.get(this.return_decls[i].id)!, new Set<number>([this.return_decls[i].id]), new Set<number>());
      expr_gen.generate(0);
      const expr_for_return = expr.tupleExtraction(expr_gen.irnode! as expr.IRExpression);
      return_values.push(expr_for_return);
      let expression_extracted = expr.tupleExtraction(return_values[i]);
      // update used_vardecls
      for (const used_vardecl of expr2used_vardecls.get(expression_extracted.id)!) {
        used_vardecls.add(used_vardecl);
      }
      //! Update vardecl2vardecls_of_the_same_type_range
      const dominated_vardecls = expr2dominated_vardecls.get(expression_extracted.id)!;
      for (const dominated_vardecl of dominated_vardecls) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
            new Set<number>([this.return_decls[i].id])));
      }
      vardecl2vardecls_of_the_same_type_range.set(this.return_decls[i].id, dominated_vardecls);
      type_dag.connect(expression_extracted.id, this.return_decls[i].id, "super_dominance");
      typeRangeAlignment(expression_extracted.id, this.return_decls[i].id);
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
        const literal_gen = new LiteralGenerator(type.elementary_types, new Set<number>(), new Set<number>());
        literal_gen.generate(0);
        variable_decl.value = literal_gen.irnode! as expr.IRExpression;
        let expression_gen_extracted = expr.tupleExtraction(literal_gen.irnode! as expr.IRExpression);
        type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "super_dominance");
        typeRangeAlignment(expression_gen_extracted.id, variable_gen.irnode!.id);
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
      typeRangeAlignment(ghost_state_vardecl.id, variable_decl.id);
      vardecl2vardecls_of_the_same_type_range.set(ghost_state_vardecl.id, new Set<number>());
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
      ContractKind.Contract, false, false, body, [], [], []);
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating contract ${thisid}`));
    }
  }
}

//TODO: Generate library, interface, and abstract contract.

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  /*
    If an expression contains two parts: e1 and e2, the generation of e1 precedes the generation of e2.
    After the generation of e1, the type range of all vardecls used by e1 is pre-decided.
    In otherwides, these type ranges are not finally decided and may be further narrowed down by the generation of e2.
    For instance, a vardecl v has type range all_integer_types and is used by e1. The type range of v can be integer_types after the generation of e1.
    However, this "narrowing-down" step may cause an type range decision conflict.
    Take id1 ^= id1 + id2 << id1 as example. Suppose id1's vardecl has type range all_integer_types and id2's vardecl has type range integer_types.
    The operator << determines the type range of id1 is uinteger_types, resulting in the type range of id1 ^= id1 is uinteger_types, which arises a
    conflict since the type range of (id2 << id1) is integer_types.
    To eliminate this conflict, we introduce forbidden_vardecls to forbid the narrowing-down step of pre-decided type range.
    To simplify, forbidden_vardecls is a set of vardecls that are used by the dominator of the current expr.
    We also introduce dominated_vardecls_by_dominator to assist the support of forbidden_vardecls.
    If there exists a dominated vardecl v of the dominator of the current expr that is in forbidden_vardecls,
      then the type range of the current expr should not narrow down the type range of v.
  */
  forbidden_vardecls : Set<number>;
  dominated_vardecls_by_dominator : Set<number>;
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super();
    this.type_range = type_range;
    this.forbidden_vardecls = forbidden_vardecls;
    this.dominated_vardecls_by_dominator = dominated_vardecls_by_dominator;
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class LValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class RValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export abstract class LRValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

export class LiteralGenerator extends RValueGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal, type range is ${this.type_range.map(t => t.str())}`));
    }
    this.irnode = new expr.IRLiteral(global_id++, cur_scope.id());
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    expr2used_vardecls.set(this.irnode.id, new Set<number>());
    expr2dominated_vardecls.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    let irdecl : decl.IRVariableDeclaration;
    // Generate a variable decl if there is no variable decl available.
    if (!hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator)) ||
      Math.random() < config.vardecl_prob
    ) {
      const variable_decl_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range);
      const literal_gen = new LiteralGenerator(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator),);
      variable_decl_gen.generate();
      literal_gen.generate(0);
      let expression_gen_extracted = expr.tupleExtraction(literal_gen.irnode! as expr.IRExpression);
      type_dag.connect(expression_gen_extracted.id, variable_decl_gen.irnode!.id, "super_dominance");
      typeRangeAlignment(expression_gen_extracted.id, variable_decl_gen.irnode!.id);
      const variable_decl_stmt = new stmt.IRVariableDeclareStatement(
        global_id++, cur_scope.id(), [variable_decl_gen.irnode! as decl.IRVariableDeclaration],
        literal_gen.irnode! as expr.IRExpression
      );
      unexpected_extra_stmt.push(variable_decl_stmt as stmt.IRVariableDeclareStatement);
      irdecl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
    }
    else {
      const contract_instance_plus_availableIRDecl = getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      assert(contract_instance_plus_availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(contract_instance_plus_availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pickRandomElement(contract_instance_plus_availableIRDecl)!;
    }
    this.irnode = new expr.IRIdentifier(global_id++, cur_scope.id(), irdecl.name, irdecl.id);

    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, irdecl.id);
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    typeRangeAlignment(this.irnode.id, irdecl.id);
    expr2used_vardecls.set(this.irnode.id, new Set<number>([irdecl.id]));
    expr2dominated_vardecls.set(this.irnode.id, new Set<number>([irdecl.id]));
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

  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: ASSIOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, type.bool_types)
      || isEqualSet(type_range, type.address_types)) {
      this.op = "=";
    }
    else if (isSuperSet(type.all_integer_types, type_range) ||
      isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(
        ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="])!;
    }
    else {
      throw new Error(`AssignmentGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
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
    let type_range;
    if (this.op === "=") type_range = this.type_range;
    else {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    //! Generate the left-hand-side identifier
    const identifier_gen = new IdentifierGenerator(type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator));
    identifier_gen.generate(cur_expression_complex_level + 1);
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(left_extracted_expression.id)!);
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(left_extracted_expression.id)!);
    //! Generate the right-hand-side expression
    let right_expression_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(type_range, type.address_types))
        right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    let right_expression_gen;
    const forbidden_vardecls_for_right = mergeSet(expr2used_vardecls.get(left_extracted_expression.id)!, this.forbidden_vardecls);
    const dominated_vardecls_by_dominator_for_right = this.left_dominate_right() ?
      mergeSet(expr2dominated_vardecls.get(left_extracted_expression.id)!,
        this.dominated_vardecls_by_dominator) :
      new Set<number>();
    if (!this.left_dominate_right()) {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(isSuperSet(type_range,
        type_dag.solution_range.get(left_extracted_expression.id)!) ?
        type_dag.solution_range.get(left_extracted_expression.id)! :
        type_range, forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    right_expression_gen.generate(cur_expression_complex_level + 1);
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    assert(type_dag.solution_range.has(right_extracted_expression.id), `solution_range does not contain ${right_extracted_expression.id}`);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(right_extracted_expression.id)!));
    if (this.left_dominate_right()) {
      const dominated_vardecls_of_left = expr2dominated_vardecls.get(left_extracted_expression.id)!;
      const dominated_vardecls_of_right = expr2dominated_vardecls.get(right_extracted_expression.id)!;
      for (const left_vardecl of dominated_vardecls_of_left) {
        for (const right_vardecl of dominated_vardecls_of_right) {
          vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
              dominated_vardecls_of_right)
          );
          vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
              dominated_vardecls_of_left)
          );
        }
      }
      expr2dominated_vardecls.set(thisid, mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right));
    }
    //! Generate irnode
    this.irnode = new expr.IRAssignment(thisid, cur_scope.id(), left_expression, right_expression, this.op!);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.connect(thisid, left_extracted_expression.id);
    typeRangeAlignment(thisid, left_extracted_expression.id);
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: BOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, type.bool_types)) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (isSuperSet(type.all_integer_types, type_range)) {
      this.op = pickRandomElement(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else if (isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
    }
    else {
      throw new Error(`BinaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
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
    let type_range;
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1) {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else if (["<", ">", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      type_range = type.all_integer_types;
      this.type_range = type.bool_types;
    }
    else { // &&, ||, =
      this.type_range = type_range = type.bool_types;
    }
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
    //! Generate left-hand-side expression
    const dominated_vardecls_by_dominator_for_left = this.this_dominates_left() ?
      new Set<number>(this.dominated_vardecls_by_dominator) :
      new Set<number>();
    left_expression_gen = new left_expression_gen_prototype(type_range,
      new Set<number>(this.forbidden_vardecls),
      dominated_vardecls_by_dominator_for_left);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(left_extracted_expression.id)!);
    if (this.this_dominates_left())
      expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(left_extracted_expression.id)!);
    //! Generate right-hand-side expression
    const forbidden_vardecls_for_right = mergeSet(expr2used_vardecls.get(left_extracted_expression.id)!, this.forbidden_vardecls);
    const dominated_vardecls_by_dominator_for_right = this.left_dominate_right() ?
      mergeSet(expr2dominated_vardecls.get(left_extracted_expression.id)!,
        dominated_vardecls_by_dominator_for_left) :
      new Set<number>();
    if (!this.left_dominate_right()) {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(
        type_dag.solution_range.get(left_extracted_expression.id)!,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right
      );
    }
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, (expr2used_vardecls.get(right_extracted_expression.id)!)));
    if (this.left_dominate_right()) {
      const dominated_vardecls_of_left = expr2dominated_vardecls.get(left_extracted_expression.id)!;
      const dominated_vardecls_of_right = expr2dominated_vardecls.get(right_extracted_expression.id)!;
      for (const left_vardecl of dominated_vardecls_of_left) {
        for (const right_vardecl of dominated_vardecls_of_right) {
          vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
              dominated_vardecls_of_right));
          vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
              dominated_vardecls_of_left));
        }
      }
      expr2dominated_vardecls.set(thisid,
        expr2dominated_vardecls.has(thisid) ? mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right) :
          dominated_vardecls_of_right);
    }
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(thisid, cur_scope.id(), left_expression, right_expression, this.op);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.this_dominates_left()) {
      type_dag.connect(thisid, left_extracted_expression.id);
      typeRangeAlignment(thisid, left_extracted_expression.id);
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: BINARYCOMPAREOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, type.bool_types)) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else {
      throw new Error(`BinaryCompareOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }

  this_dominates_left() : boolean {
    return ["&&", "||"].filter((op) => op === this.op).length === 1;
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOpGenerator ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
    //! Update type range of this node
    let type_range;
    if (["<", ">", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      type_range = type.all_integer_types;
      this.type_range = type.bool_types;
    }
    else { // &&, ||
      this.type_range = type_range = type.bool_types;
    }
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
    //! Generate left-hand-side expression
    const dominated_vardecls_by_dominator_for_left = this.this_dominates_left() ?
      new Set<number>(this.dominated_vardecls_by_dominator) :
      new Set<number>();
    left_expression_gen = new left_expression_gen_prototype(type_range,
      new Set<number>(this.forbidden_vardecls),
      dominated_vardecls_by_dominator_for_left);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(left_extracted_expression.id)!);
    if (this.this_dominates_left())
      expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(left_extracted_expression.id)!);
    //! Generate right-hand-side expression
    const forbidden_vardecls_for_right = mergeSet(expr2used_vardecls.get(left_extracted_expression.id)!, this.forbidden_vardecls);
    const dominated_vardecls_by_dominator_for_right = mergeSet(expr2dominated_vardecls.get(left_extracted_expression.id)!,
      dominated_vardecls_by_dominator_for_left)
    right_expression_gen = new right_expression_gen_prototype(
      type_dag.solution_range.get(left_extracted_expression.id)!,
      forbidden_vardecls_for_right,
      dominated_vardecls_by_dominator_for_right
    );
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, (expr2used_vardecls.get(right_extracted_expression.id)!)));
    const dominated_vardecls_of_left = expr2dominated_vardecls.get(left_extracted_expression.id)!;
    const dominated_vardecls_of_right = expr2dominated_vardecls.get(right_extracted_expression.id)!;
    for (const left_vardecl of dominated_vardecls_of_left) {
      for (const right_vardecl of dominated_vardecls_of_right) {
        vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
            dominated_vardecls_of_right));
        vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
            dominated_vardecls_of_left));
      }
    }
    expr2dominated_vardecls.set(thisid,
      expr2dominated_vardecls.has(thisid) ? mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right) :
        dominated_vardecls_of_right);
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(thisid, cur_scope.id(), left_expression, right_expression, this.op);
    //! Build dominations
    type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
    typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.this_dominates_left()) {
      type_dag.connect(thisid, left_extracted_expression.id);
      typeRangeAlignment(thisid, left_extracted_expression.id);
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: UOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["!", "-", "~", "++", "--"])!;
    }
    else if (isEqualSet(type_range, type.bool_types)) {
      this.op = "!";
    }
    else if (isEqualSet(type_range, type.integer_types) || isEqualSet(type_range, type.all_integer_types)) {
      this.op = pickRandomElement(["-", "~", "++", "--"])!;
    }
    else if (isEqualSet(type_range, type.uinteger_types)) {
      this.op = pickRandomElement(["~", "++", "--"])!;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    let type_range;
    const thisid = global_id++;
    //! Update type range
    if (this.op === "!") {
      this.type_range = type_range = type.bool_types;
    }
    else if (this.op === "~" || this.op === "++" || this.op === "--") {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else if (this.op === "-") {
      this.type_range = type_range = type.integer_types;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
    //! Generate identifier
    const identifier_gen = new IdentifierGenerator(type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator));
    identifier_gen.generate(cur_expression_complex_level + 1);
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    //! Generate irnode
    this.irnode = new expr.IRUnaryOp(thisid, cur_scope.id(), pickRandomElement([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tupleExtraction(expression);
    //!. Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_expression.id)!);
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(extracted_expression.id)!);
    //! Build dominations
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.connect(thisid, extracted_expression.id);
    typeRangeAlignment(thisid, extracted_expression.id);
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional, type range is ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const thisid = global_id++;
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
    const e1_gen = new e1_gen_prototype(type.bool_types,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>());
    e1_gen.generate(cur_expression_complex_level + 1);
    let extracted_e1 = expr.tupleExtraction(e1_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_e1.id)!);
    //! Then get a generator for e2.
    let e2_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e2_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(this.type_range, type.address_types))
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e2
    const forbidden_vardecl_for_e2 = mergeSet(expr2used_vardecls.get(extracted_e1.id)!, this.forbidden_vardecls);
    const e2_gen = new e2_gen_prototype(this.type_range,
      forbidden_vardecl_for_e2,
      new Set<number>(this.dominated_vardecls_by_dominator));
    e2_gen.generate(cur_expression_complex_level + 1);
    let extracted_e2 = expr.tupleExtraction(e2_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(extracted_e2.id)!));
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(extracted_e2.id)!);
    let type_range_of_extracted_e2 = type_dag.solution_range.get(extracted_e2.id)!;
    //! Finally, get a generator for e3.
    let e3_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e3_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(type_range_of_extracted_e2, type.address_types))
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e3
    const forbidden_vardecl_for_e3 = mergeSet(expr2used_vardecls.get(extracted_e2.id)!, forbidden_vardecl_for_e2);
    const e3_gen = new e3_gen_prototype!(type_range_of_extracted_e2,
      forbidden_vardecl_for_e3,
      mergeSet(this.dominated_vardecls_by_dominator,
        expr2dominated_vardecls.get(extracted_e2.id)!)
    );
    e3_gen.generate(cur_expression_complex_level + 1);
    this.irnode = new expr.IRConditional(
      thisid, cur_scope.id(), e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    let extracted_e3 = expr.tupleExtraction(e3_gen.irnode! as expr.IRExpression);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(extracted_e3.id)!));
    const dominated_vardecls_of_left = expr2dominated_vardecls.get(extracted_e2.id)!;
    const dominated_vardecls_of_right = expr2dominated_vardecls.get(extracted_e3.id)!;
    for (const left_vardecl of dominated_vardecls_of_left) {
      for (const right_vardecl of dominated_vardecls_of_right) {
        vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
            dominated_vardecls_of_right));
        vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
            dominated_vardecls_of_left));
      }
    }
    expr2dominated_vardecls.set(thisid, mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right));
    //! Build dominations
    type_dag.solution_range.set(extracted_e1.id, type.bool_types);
    type_dag.solution_range.set(thisid, type.elementary_types);
    type_dag.connect(extracted_e2.id, extracted_e3.id, "sub_dominance");
    typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.connect(thisid, extracted_e2.id);
    typeRangeAlignment(thisid, extracted_e2.id);
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, kind ?: FunctionCallKind) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
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
    const dominated_vardecls_by_dominator_copy = new Set<number>(this.dominated_vardecls_by_dominator);
    for (const dominated_vardecl of dominated_vardecls_by_dominator_copy) {
      for (const vardecl of vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!) {
        dominated_vardecls_by_dominator_copy.add(vardecl);
      }
    }
    let type_range_narrows_down_the_type_range_of_dominated_vardecls = (type_range : type.Type[]) : boolean => {
      for (const vardecl of dominated_vardecls_by_dominator_copy) {
        if (isSuperSet(type_dag.solution_range.get(vardecl)!, type_range)
          && !isEqualSet(type_dag.solution_range.get(vardecl)!, type_range)) return true;
      }
      return false;
    };
    let return_is_good = (ret_decl : number) : boolean => {
      return type_range_narrows_down_the_type_range_of_dominated_vardecls(this.type_range) ?
        false :
        this.forbidden_vardecls.has(ret_decl) ?
          isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl)!) :
          isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl)!)
          || isSuperSet(type_dag.solution_range.get(ret_decl)!, this.type_range)
    };
    //! If cur_expression_complex_level reaches the maximum, generate an terminal expression
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      const expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
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
              if (forbidden_funcs.has(irnode_id)) continue;
              if (return_is_good(ret_decl.id)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
        else {
          if (((irnodes.get(irnode_id) as decl.IRFunctionDefinition).visibility == FunctionVisibility.External ||
            func_visibility_dag.solution_range.get(irnode_id)!.includes(FuncVisProvider.external())) &&
            (allow_empty_return || (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns.length > 0)) {
            for (const ret_decl of (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns) {
              if (forbidden_funcs.has(irnode_id)) continue;
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
      const expression_gen = new expression_gen_prototype(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
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
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.insert(type_dag.newNode(thisid));
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
      typeRangeAlignment(thisid, selected_ret_decl.id);
    }

    forbidden_funcs.add(funcdecl_id);
    if (config.debug && selected_ret_decl !== null) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  The type range of the selected ret decl (ID: ${selected_ret_decl.id}) is ${selected_ret_decls_index}: ${type_dag.solution_range.get(selected_ret_decl.id)!.map(t => t.str())}`));
    }
    //! Then generate expressions as arguments
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall Arguments`));
      indent += 2;
    }
    const args_ids : number[] = [];
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
      const arg_gen = new arg_gen_prototype(type_range,
        mergeSet(new Set<number>(this.forbidden_vardecls), new Set<number>([funcdecl.parameters[i].id])),
        new Set<number>(this.dominated_vardecls_by_dominator));
      arg_gen.generate(cur_expression_complex_level + 1);
      let extracted_arg = expr.tupleExtraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      type_dag.connect(extracted_arg.id, funcdecl.parameters[i].id);
      typeRangeAlignment(extracted_arg.id, funcdecl.parameters[i].id);
      expr2used_vardecls.set(thisid, new Set<number>());
      for (const arg_id of args_ids) {
        expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(arg_id)!));
      }
      const dominated_vardecls = expr2dominated_vardecls.get(extracted_arg.id)!;
      for (const dominated_vardecl of dominated_vardecls) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
            new Set<number>([funcdecl.parameters[i].id])));
      }
      vardecl2vardecls_of_the_same_type_range.set(funcdecl.parameters[i].id, dominated_vardecls);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.redBG(`${" ".repeat(indent)}<<  Finish generating FunctionCall Arguments`));
    }
    //! Generate an function call and select which returned value will be used
    let func_call_node;
    // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
    if (contractdecl_id != cur_contract_id) {
      external_call = true;
      func_call_node = new expr.IRFunctionCall(thisid, cur_scope.id(), this.kind!,
        new expr.IRMemberAccess(global_id++, cur_scope.id(),
          func_identifier.name!, contractdecl_id, new expr.IRIdentifier(global_id++, cur_scope.id(), "this", -1),
        ),
        args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
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
      let type_range_for_identifier = type_dag.solution_range.get(selected_ret_decl.id)!;
      if (isSuperSet(type_range_for_identifier, this.type_range)) {
        type_range_for_identifier = this.type_range;
      }
      const identifier_gen = new IdentifierGenerator(type_range_for_identifier,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      identifier_gen.generate(cur_expression_complex_level + 1);
      const identifier_expr = expr.tupleExtraction(identifier_gen.irnode! as expr.IRExpression);
      //* 3. Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
      // expr2used_vardecls.set(thisid, mergeSet(this.forbidden_vardecls, expr2used_vardecls.get(identifier_expr.id)!));
      const dominated_vardecls_of_identifier = expr2dominated_vardecls.get(identifier_expr.id)!;
      for (const dominated_vardecl of dominated_vardecls_of_identifier) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!, new Set<number>([selected_ret_decl.id])));
        vardecl2vardecls_of_the_same_type_range.set(selected_ret_decl.id,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(selected_ret_decl.id)!, new Set<number>([dominated_vardecl])));
      }
      type_dag.connect(identifier_expr.id, thisid);
      typeRangeAlignment(identifier_expr.id, thisid);
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
      expr2used_vardecls.set(this.irnode.id, new Set<number>([selected_ret_decl.id]));
      expr2dominated_vardecls.set(this.irnode.id, new Set<number>([selected_ret_decl.id]));
    }
    else {
      this.irnode = func_call_node;
      if (selected_ret_decl !== null) {
        expr2used_vardecls.set(thisid, new Set<number>([selected_ret_decl.id]));
        expr2dominated_vardecls.set(thisid, new Set<number>([selected_ret_decl.id]));
      }
      else {
        expr2used_vardecls.set(thisid, new Set<number>());
        expr2dominated_vardecls.set(thisid, new Set<number>());
      }
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    forbidden_funcs.delete(funcdecl_id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: FunctionCall, id: ${thisid} scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    }
  }
}

// export class NewContractDecarationGenerator extends ExpressionGenerator {
//   constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
//     super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
//   }

//   generate() : void {
//     assert (decl_db.contractdecls.size > 0, "No contract is declared");
//     const contract_id = pickRandomElement([...decl_db.contractdecls])!;
//     const contract_name = (irnodes.get(contract_id)! as decl.IRContractDefinition).name;
//     const new_expr = new expr.IRNew(global_id++, cur_scope.id(), contract_name);
//     const new_function_expr = new expr.IRFunctionCall(global_id++, cur_scope.id(), FunctionCallKind.FunctionCall, new_expr, []);

//   }
// }

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
];

const nonterminal_expression_generators = [
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const nonterminal_expression_generators_for_address_type = [
  AssignmentGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const non_funccall_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
];

const non_funccall_expression_generators_for_address_type = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  ConditionalGenerator,
];

const all_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const nonliteral_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const all_expression_generators_for_address_types = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

export abstract class StatementGenerator extends Generator {
  constructor() { super(); }
  abstract generate(cur_stmt_complex_level : number) : void;
}

/*
A generator for a single variable declaration of which the type range is elementary.
The RHS of the variable declaration is required and it can be any suitable expression.
*/
//! Deprecated, check before use
export class SingleElementaryTypeVariableDeclareStatementGenerator extends StatementGenerator {
  type_range : type.Type[] | undefined;
  forbidden_vardecls : Set<number> | undefined;
  dominated_vardecls_by_dominator : Set<number> | undefined;
  generate_literal : boolean = false;
  constructor(type_range ?: type.Type[], forbidden_vardecls ?: Set<number>, dominated_vardecls_by_dominator ?: Set<number>, generate_literal ?: boolean) {
    assert(config.experimental, "SingleElementaryTypeVariableDeclareStatementGenerator is experimental, please turn on the experimental mode");
    super();
    this.type_range = type_range;
    this.forbidden_vardecls = forbidden_vardecls;
    this.dominated_vardecls_by_dominator = dominated_vardecls_by_dominator;
    if (generate_literal !== undefined) this.generate_literal = generate_literal;
  }
  generate(cur_stmt_complex_level : number) : void {
    if (this.type_range === undefined) this.type_range = type.elementary_types;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SingleVariableDeclareStatement, type range is ${this.type_range!.map(t => t.str())}`));
      indent += 2;
    }
    let expression_gen_prototype;
    let expression_gen = null;
    if (!this.generate_literal &&
      ((
        this.type_range === undefined && hasAvailableIRVariableDeclare() ||
        this.type_range !== undefined && this.forbidden_vardecls === undefined && this.dominated_vardecls_by_dominator === undefined &&
        hasAvailableIRVariableDeclareWithTypeConstraint(this.type_range) ||
        this.type_range !== undefined && this.forbidden_vardecls !== undefined && this.dominated_vardecls_by_dominator !== undefined &&
        hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
          new Set<number>(this.forbidden_vardecls),
          new Set<number>(this.dominated_vardecls_by_dominator))
      ) && Math.random() > config.literal_prob)
    ) {
      if (isEqualSet(this.type_range, type.address_types)) {
        expression_gen_prototype = pickRandomElement(all_expression_generators_for_address_types)!;
      }
      else {
        expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
      expression_gen = new expression_gen_prototype(this.type_range, new Set<number>(), new Set<number>());
    }
    else {
      expression_gen = new LiteralGenerator(this.type_range, new Set<number>(), new Set<number>());
    }
    expression_gen.generate(0);
    const variable_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range);
    variable_gen.generate();
    //! Update vardecl2vardecls_of_the_same_type_range
    const extracted_expression = expr.tupleExtraction(expression_gen.irnode! as expr.IRExpression);
    const dominated_vardecls = expr2dominated_vardecls.get(extracted_expression.id)!;
    for (const dominated_vardecl of dominated_vardecls) {
      vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
        mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
          new Set<number>([variable_gen.irnode!.id])));
    }
    vardecl2vardecls_of_the_same_type_range.set(variable_gen.irnode!.id, dominated_vardecls);
    this.irnode = new stmt.IRVariableDeclareStatement(
      global_id++, cur_scope.id(), [variable_gen.irnode! as decl.IRVariableDeclaration], expression_gen.irnode! as expr.IRExpression
    );
    let expression_gen_extracted = expr.tupleExtraction(expression_gen.irnode! as expr.IRExpression);
    type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "super_dominance");
    typeRangeAlignment(expression_gen_extracted.id, variable_gen.irnode!.id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${variable_gen.irnode!.id}: SingleVariableDeclareStatement`));
    }
  }
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
    const assignment_gen = new AssignmentGenerator(type.elementary_types, new Set<number>(), new Set<number>());
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
    const binaryop_gen = new BinaryOpGenerator(type.elementary_types, new Set<number>(), new Set<number>());
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
    const unaryop_gen = new UnaryOpGenerator(type.elementary_types, new Set<number>(), new Set<number>());
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
    const conditional_gen = new ConditionalGenerator(type.elementary_types, new Set<number>(), new Set<number>());
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
    const funcall_gen = new FunctionCallGenerator(type.elementary_types, new Set<number>(), new Set<number>(), FunctionCallKind.FunctionCall);
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
      const expression_gen = new expression_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
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
      typeRangeAlignment(extracted_ir.id, ir_varnodes[i].id);
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ReturnStatement`));
      indent += 2;
    }
    if (this.value === undefined) {
      const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expression_gen = new expression_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
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
    const condition_gen = new BinaryCompareOpGenerator(type.bool_types, new Set<number>(), new Set<number>());
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
        const init_expr_gen = new init_expr_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
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
    const conditional_gen = new BinaryCompareOpGenerator(type.bool_types, new Set<number>(), new Set<number>());
    conditional_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tupleExtraction(conditional_gen.irnode as expr.IRExpression)]);
    //! Generate the loop generation expression
    const loop_gen_prototype = pickRandomElement(all_expression_generators);
    const loop_gen = new loop_gen_prototype!(type.elementary_types, new Set<number>(), new Set<number>());
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
    const cond_gen = new cond_gen_prototype(type.bool_types, new Set<number>(), new Set<number>());
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
    const cond_gen = new cond_gen_prototype(type.bool_types, new Set<number>(), new Set<number>());
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
  AssignmentStatementGenerator,
  BinaryOpStatementGenerator,
  UnaryOpStatementGenerator,
  ConditionalStatementGenerator,
  FunctionCallStatementGenerator
]

const statement_generators = [
  AssignmentStatementGenerator,
  BinaryOpStatementGenerator,
  UnaryOpStatementGenerator,
  ConditionalStatementGenerator,
  FunctionCallStatementGenerator,
  IfStatementGenerator,
  ForStatementGenerator,
  WhileStatementGenerator,
  DoWhileStatementGenerator
]