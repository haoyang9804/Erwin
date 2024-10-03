import { assert, pick_random_element, random_int, merge_set, intersection } from "./utility";
import { IRNode, IRSourceUnit } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { decide_variable_visibility, decl_db, erwin_visibility } from "./db";
import { TypeDominanceDAG, FuncStateMutabilityDominanceDAG, FuncVisibilityDominanceDAG, StateVariableVisibilityDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { is_super_set, is_equal_set } from "./dominance";
import { ContractKind, FunctionCallKind, FunctionKind, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { ScopeList, scopeKind, initScope } from "./scope";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { FuncVis, FuncVisProvider, VarVisProvider } from "./visibility";
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables
const global_id_start = 1;
let global_id = global_id_start;
let cur_scope : ScopeList = initScope();
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
let varid = 0;
let contractid = 0;
let functionid = 0;
let structid = 0;
let all_types : type.Type[] = [];
const contract_types : Map<number, type.ContractType> = new Map<number, type.ContractType>();
const struct_types : Map<number, type.StructType> = new Map<number, type.StructType>();
const user_defined_types : type.UserDefinedType[] = [];
enum IDENTIFIER {
  VAR,
  FUNC,
  CONTRACT,
  STRUCT,
  CONTRACT_INSTANCE,
  STRUCT_INSTANCE
};
// Record statements in each scope.
export const type_dag = new TypeDominanceDAG();
export const funcstat_dag = new FuncStateMutabilityDominanceDAG();
export const func_visibility_dag = new FuncVisibilityDominanceDAG();
export const state_variable_visibility_dag = new StateVariableVisibilityDominanceDAG();

function generate_name(identifier : IDENTIFIER) : string {
  switch (identifier) {
    case IDENTIFIER.VAR:
      return `var${varid++}`;
    case IDENTIFIER.FUNC:
      return `func${functionid++}`;
    case IDENTIFIER.CONTRACT:
      return `contract${contractid++}`;
    case IDENTIFIER.STRUCT:
      return `struct${structid++}`;
    case IDENTIFIER.CONTRACT_INSTANCE:
      return `contract_instance${contractid++}`;
    case IDENTIFIER.STRUCT_INSTANCE:
      return `struct_instance${structid++}`;
    default:
      throw new Error(`generate_name: identifier ${identifier} is not supported`);
  }
}

function get_available_IRVariableDeclarations() : decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  const available_irnode_ids = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  if (cur_scope.kind() === scopeKind.CONTRACT) {
    for (let id of available_irnode_ids) {
      if (decl_db.state_variables.has(id)) {
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  else {
    for (let id of available_irnode_ids) {
      if (decl_db.vardecls.has(id) &&
        !(no_state_variable_in_function_body && decl_db.state_variables.has(id))) {
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  return collection;
}

function has_available_IRVariableDeclarations() : boolean {
  return get_available_IRVariableDeclarations().length > 0;
}

function get_available_IRVariableDeclarations_with_type_constraint(types : type.Type[]) : decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  const available_irnode_ids = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  if (cur_scope.kind() === scopeKind.CONTRACT) {
    for (let id of available_irnode_ids) {
      if (decl_db.state_variables.has(id)) {
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  else {
    for (let id of available_irnode_ids) {
      if (
        decl_db.vardecls.has(id) &&
        !(no_state_variable_in_function_body && decl_db.state_variables.has(id))
      ) {
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  return collection.filter(
    (irdecl) =>
      is_super_set(type_dag.solution_range.get(irdecl.id)!, types) &&
      type_dag.try_tighten_solution_range_middle_out(irdecl.id, types) ||
      is_super_set(types, type_dag.solution_range.get(irdecl.id)!)
  );
}

function has_available_IRVariableDeclaration_with_type_constraint(types : type.Type[]) : boolean {
  return get_available_IRVariableDeclarations_with_type_constraint(types).length > 0;
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

abstract class Generator {
  irnode : IRNode | undefined;
  generator_name : string;
  constructor() {
    this.generator_name = this.constructor.name;
  }
}

export class SourceUnitGenerator extends Generator {
  constructor() {
    super();
    all_types = [...type.elementary_types];
  }
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
      console.log(color.yellowBG(`${" ".repeat(indent)}SourceUnit`));
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

class ContractInstanceDeclarationGenerator extends DeclarationGenerator {
  contract_id ? : number;
  no_initializer : boolean;
  type_range : type.Type[];
  constructor(type_range : type.Type[], no_initializer : boolean = true, contract_id ?: number) {
    super();
    this.contract_id = contract_id;
    this.no_initializer = no_initializer;
    this.type_range = type_range;
  }
  generate() : void {
    // assert that all types in the type range are contract types
    assert(this.type_range.some((t) => t.typeName == 'ContractType'),
      `ContractInstanceDeclarationGenerator: type_range should contain contract types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName == 'ContractType');
    const available_contractdecls = [...decl_db.contractdecls]
      .filter((contract_id) => contract_id > 0)
      .filter((contract_id) => this.type_range.some((t) => t.typeName === "ContractType" && (t as type.ContractType).id === contract_id));
    assert(available_contractdecls.length > 0, "ContractInstanceDeclarationGenerator: contractdecls is empty");
    if (this.contract_id === undefined) {
      this.contract_id = pick_random_element(available_contractdecls)!;
    }
    assert(irnodes.has(this.contract_id), `ContractInstanceDeclarationGenerator: contract_id ${this.contract_id} is not in irnodes`);
    assert(contract_types.has(this.contract_id), `ContractInstanceDeclarationGenerator: contract_id ${this.contract_id} is not in contract_types`);
    this.type_range = this.type_range
      .filter((t) => (t as type.ContractType).type_range().includes(contract_types.get(this.contract_id!)!));
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Instance Declaration, type_range: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    const contract_instance_name = generate_name(IDENTIFIER.CONTRACT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(), contract_instance_name);
    type_dag.insert(type_dag.newNode(this.irnode.id), this.type_range);
    let initializer : expr.IRExpression | undefined;
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      const nid = global_id++;
      type_dag.insert(type_dag.newNode(nid), type_dag.solution_range.get(this.irnode.id)!);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_contract_gen = new NewContractDecarationGenerator(nid, this.contract_id);
      new_contract_gen.generate(0);
      initializer = new_contract_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
    if (cur_scope.value().kind === scopeKind.CONTRACT) {
      decl_db.insert(this.irnode.id, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
      state_variable_visibility_dag.solution_range.set(this.irnode.id, [
        VarVisProvider.private(),
        VarVisProvider.internal(),
        VarVisProvider.public(),
        VarVisProvider.default()
      ]);
    }
    else {
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    if (decl_db.contractdecl_to_contract_instance.has(this.contract_id)) {
      decl_db.contractdecl_to_contract_instance.get(this.contract_id)!.push(this.irnode.id);
    }
    else {
      decl_db.contractdecl_to_contract_instance.set(this.contract_id, [this.irnode.id]);
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      decl_db.state_variables.add(this.irnode.id);
    }
    else {
      decl_db.vardecls.add(this.irnode.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Contract Instance Declaration`));
    }
  }
}

class ElementaryTypeVariableDeclarationGenerator extends DeclarationGenerator {
  type_range : type.Type[];
  name : string | undefined;
  no_initializer : boolean;
  constructor(type_range : type.Type[], no_initializer : boolean = true, name ?: string) {
    super();
    this.type_range = type_range;
    this.name = name;
    this.no_initializer = no_initializer;
  }
  generate() : void {
    if (this.name === undefined) {
      this.name = generate_name(IDENTIFIER.VAR);
    }
    this.type_range = this.type_range.filter((t) => t.typeName === 'ElementaryType');
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Elementary Type Variable Decl, name is ${this.name}, type_range: ${this.type_range.map(t => t.str())}`));
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
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    type_dag.insert(type_dag.newNode(this.irnode.id), this.type_range);
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      if (Math.random() < config.literal_prob) {
        if (config.debug) {
          console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal`));
          indent += 2;
        }
        const literal_id = global_id++;
        type_dag.insert(type_dag.newNode(literal_id), type_dag.solution_range.get(this.irnode!.id)!);
        type_dag.connect(literal_id, this.irnode!.id, "super_dominance");
        const literal_gen = new LiteralGenerator(literal_id);
        literal_gen.generate(0);
        (this.irnode as decl.IRVariableDeclaration).value = literal_gen.irnode! as expr.IRExpression;
        if (config.debug) {
          indent -= 2;
          console.log(color.yellowBG(`${" ".repeat(indent)}Literal`));
        }
      }
      else {
        const expr_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
        const expr_id = global_id++;
        type_dag.insert(type_dag.newNode(expr_id), type_dag.solution_range.get(this.irnode!.id)!);
        type_dag.connect(expr_id, this.irnode!.id, "super_dominance");
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        (this.irnode as decl.IRVariableDeclaration).value = expr_gen.irnode! as expr.IRExpression;
        type_dag.type_range_alignment(expr_id, this.irnode!.id);
      }
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      decl_db.state_variables.add(this.irnode.id);
    }
    else {
      decl_db.vardecls.add(this.irnode.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Elementary Type Variable Decl, name: ${this.name}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
    }
  }
}

class VariableDeclarationGenerator extends DeclarationGenerator {
  no_initializer : boolean;
  type_range : type.Type[];
  constructor(type_range : type.Type[], no_initializer : boolean = true) {
    super();
    this.no_initializer = no_initializer;
    this.type_range = type_range;
  }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Variable Declaration`));
      indent += 2;
    }
    const contain_element_types = this.type_range.some((t) => t.typeName === 'ElementaryType');
    const contain_contract_types = this.type_range.some((t) => t.typeName === 'ContractType');
    assert(contain_element_types || contain_contract_types, `VariableDeclarationGenerator: type_range ${this.type_range.map(t => t.str())} should contain at least one elementary type or contract type`);
    if (contain_contract_types && Math.random() < config.contract_instance_prob) {
      const contract_instance_gen = new ContractInstanceDeclarationGenerator(this.type_range, this.no_initializer);
      contract_instance_gen.generate();
      this.irnode = contract_instance_gen.irnode;
    }
    else {
      // Generate elementary type variable declaration
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range, this.no_initializer);
      variable_gen.generate();
      this.irnode = variable_gen.irnode;
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Variable Declaration`));
    }
  }
}

class ConstructorDeclarationGenerator extends DeclarationGenerator {
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
    this.parameter_count = random_int(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
    //! Find state variables in contract body scope
    this.state_variables_in_cur_contract_scope = decl_db.get_irnodes_ids_nonrecursively_from_a_scope(cur_scope.id())
      .filter((nid) => decl_db.state_variables.has(nid))
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
    const body_stmt_count = random_int(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
    for (let i = body.length; i < body_stmt_count; i++) {
      if (this.state_variables_in_cur_contract_scope.length > 0 && Math.random() < config.init_state_var_in_constructor_prob) {
        const vardecl = irnodes.get(pick_random_element(this.state_variables_in_cur_contract_scope)!) as decl.IRVariableDeclaration;
        const identifier = new expr.IRIdentifier(global_id++, cur_scope.id(), vardecl.name, vardecl.id);
        const expr_gen_prototype = pick_random_element(all_expression_generators)!;
        const expr_id = global_id++;
        type_dag.insert(type_dag.newNode(expr_id), type_dag.solution_range.get(vardecl.id)!);
        type_dag.connect(expr_id, vardecl.id, "super_dominance");
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        type_dag.type_range_alignment(expr_id, vardecl.id);
        const expression = expr_gen.irnode! as expr.IRExpression;
        const assignment = new expr.IRAssignment(global_id++, cur_scope.id(), identifier, expression, "=");
        const assignment_stmt = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment);
        body = body.concat(unexpected_extra_stmt);
        unexpected_extra_stmt = [];
        body.push(assignment_stmt);
      }
      else {
        const stmt_gen_prototype = pick_random_element(statement_generators)!;
        const stmt_gen = new stmt_gen_prototype();
        stmt_gen.generate(0);
        body = body.concat(unexpected_extra_stmt);
        unexpected_extra_stmt = [];
        body.push(stmt_gen.irnode! as stmt.IRStatement);
      }
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Constructor Body`));
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
      const variable_gen = new VariableDeclarationGenerator(all_types);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Parameters`));
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
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Constructor Declaration`));
    }
  }
}
// @ts-ignore
class StructGenerator extends DeclarationGenerator {
  erwin_vis : erwin_visibility;
  constructor(erwin_vis : erwin_visibility) {
    super();
    // In-contract struct is private.
    // Global struct is NAV.
    assert(erwin_vis === erwin_visibility.INCONTRACT_PRIVATE || erwin_vis === erwin_visibility.NAV,
      `StructGenerator: erwin_vis should be INCONTRACT_PRIVATE or NAV, but is ${erwin_vis}`);
    this.erwin_vis = erwin_vis;
  }
  generate() : void {
    //! Create the struct scope
    const thisid = global_id++;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Struct Definition: ${thisid}`));
      indent += 2;
    }
    decl_db.insert(thisid, this.erwin_vis, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.STRUCT);
    //! Generate struct name
    const struct_name = generate_name(IDENTIFIER.STRUCT);
    const body : decl.IRVariableDeclaration[] = [];
    //! Generate member variables
    const member_variable_count = random_int(config.struct_member_variable_count_lowerlimit, config.struct_member_variable_count_upperlimit);
    for (let i = 0; i < member_variable_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(all_types);
      variable_gen.generate();
      body.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    this.irnode = new decl.IRStructDefinition(thisid, cur_scope.id(), struct_name, body);
    cur_scope = cur_scope.rollback();
    //! Add this contract type
    all_types = [...all_types];
    const struct_type = new type.StructType(thisid, struct_name);
    all_types.push(struct_type);
    struct_types.set(thisid, struct_type);
    user_defined_types.push(struct_type);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Struct Definition`));
    }
  }
}

class FunctionDeclarationGenerator extends DeclarationGenerator {
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
    this.return_count = random_int(config.return_count_of_function_lowerlimit, config.return_count_of_function_upperlimit);
    this.parameter_count = random_int(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
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
    */
    for (const called_function_decl_ID of decl_db.called_function_decls_IDs) {
      if (is_super_set(funcstat_dag.solution_range.get(thisid)!, funcstat_dag.solution_range.get(called_function_decl_ID)!)) {
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
    const body_stmt_count = random_int(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
    // used_vardecls is a set that records the vardecls used by the body.
    const used_vardecls : Set<number> = new Set<number>();
    this.throw_no_state_variable_signal_at_random();
    //! Here we generate stmts.
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Body for ${this.fid}`));
      indent += 2;
    }
    for (let i = body.length; i < body_stmt_count; i++) {
      const stmt_gen_prototype = pick_random_element(statement_generators)!;
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
    if (Math.random() < config.return_prob) {
      for (let i = 0; i < this.return_count; i++) {
        //* Generate expr for return
        const expr_id = global_id++;
        const type_range = type_dag.solution_range.get(this.return_decls[i].id)!;
        type_dag.insert(type_dag.newNode(expr_id), type_range);
        type_dag.connect(expr_id, this.return_decls[i].id, "super_dominance");
        let expr_gen_prototype;
        const only_contract_type = type_range.every((t) => t.typeName === "ContractType");
        if (only_contract_type) {
          expr_gen_prototype = NewContractDecarationGenerator;
        }
        else {
          const no_contract_type = type_range.every((t) => t.typeName !== "ContractType");
          if (!no_contract_type) {
            expr_gen_prototype = pick_random_element(all_expression_generators)!;
          }
          else {
            expr_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
          }
        }
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        return_values.push(expr_gen.irnode! as expr.IRExpression);
        let expression_extracted = expr.tuple_extraction(return_values[i]);
        // update used_vardecls
        for (const used_vardecl of expr2used_vardecls.get(expression_extracted.id)!) {
          used_vardecls.add(used_vardecl);
        }
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
    }
    // Check whether function body uses any state variables and records the result into `use_state_variables`
    let use_state_variables = false;
    for (const used_vardecl of used_vardecls) {
      if (decl_db.state_variables.has(used_vardecl)) {
        assert(!no_state_variable_in_function_body,
          `no_state_variable_in_function_body should be false: irnode (ID: ${used_vardecl}, typeName: ${irnodes.get(used_vardecl)!.typeName}) is used in the function body`);
        use_state_variables = true;
        break;
      }
    }
    const state_mutability_range = this.get_state_mutability_range_v2(use_state_variables);
    funcstat_dag.update(funcstat_dag.newNode(this.irnode!.id), this.get_FuncStats_from_state_mutabilitys(state_mutability_range));
    this.build_connection_from_caller_to_callee(this.irnode!.id);
    (this.irnode as decl.IRFunctionDefinition).body = body;
    this.clear_no_state_variable_signal();
    if (!this.has_body) cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Body for ${this.fid}. funcstate range is ${funcstat_dag.solution_range.get(this.irnode!.id)!.map(f => f.str())}`));
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
    const name = generate_name(IDENTIFIER.FUNC);
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
      const variable_gen = new VariableDeclarationGenerator(all_types);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    //! Generate return_decls
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Parameters`));
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Return Decls, ${this.return_count} in total`));
      indent += 2;
    }
    for (let i = 0; i < this.return_count; i++) {
      //* Generate the returned vardecl. For instance, in the following code:
      //* function f() returns (uint a, uint b) { return (1, 2); }
      //* We generate two returned vardecls for a and b.
      const variable_gen = new VariableDeclarationGenerator(all_types);
      variable_gen.generate();
      this.return_decls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Return Decls`));
    }
    this.irnode = new decl.IRFunctionDefinition(this.fid, cur_scope.id(), name,
      FunctionKind.Function, virtual, overide, this.parameters, this.return_decls, [], modifiers);
    decl_db.funcdecls.add(this.fid);
    if (this.has_body) {
      this.generate_function_body();
    }
    else {
      funcstat_dag.insert(funcstat_dag.newNode(this.irnode!.id), [
        FuncStatProvider.empty(),
        FuncStatProvider.pure(),
        FuncStatProvider.view(),
        FuncStatProvider.payable()
      ]);
    }
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.fid}: Function ${name}, funcstate range is ${funcstat_dag.solution_range.get(this.fid)!.map(f => f.str())}`));
    }
  }
}

class ContractDeclarationGenerator extends DeclarationGenerator {
  constructor() { super(); }
  generate() : void {
    //! Create the contract scope
    const thisid = global_id++;
    cur_contract_id = thisid;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Definition: ${thisid}`));
      indent += 2;
    }
    assert(cur_scope.kind() === scopeKind.GLOBAL,
      `Contracts' scope must be global, but is ${cur_scope.kind()}`);
    decl_db.insert(thisid, erwin_visibility.NAV, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONTRACT);
    //! Generate contract name
    const contract_name = generate_name(IDENTIFIER.CONTRACT);
    const body : IRNode[] = [];
    //! Generate state variables
    const state_variable_count = random_int(config.state_variable_count_lowerlimit, config.state_variable_count_upperlimit);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating State Variables: ${state_variable_count} in total`));
      indent += 2;
    }
    // Generate state variables and randomly assigns values to these variables
    const local_state_variables : decl.IRVariableDeclaration[] = [];
    for (let i = 0; i < state_variable_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(all_types, false);
      variable_gen.generate();
      const variable_decl = variable_gen.irnode as decl.IRVariableDeclaration;
      local_state_variables.push(variable_decl);
      for (const stmt of unexpected_extra_stmt) {
        assert(stmt.typeName === "IRVariableDeclareStatement",
          `ContractDeclarationGenerator: stmt is not IRVariableDeclareStatement, but is ${stmt.typeName}`);
        for (const vardecl of (stmt as stmt.IRVariableDeclareStatement).variable_declares) {
          assert(vardecl !== null, "ContractDeclarationGenerator: vardecl is null");
          decl_db.state_variables.add(vardecl.id);
          decl_db.vardecls.delete(vardecl.id);
          vardecl.value = (stmt as stmt.IRVariableDeclareStatement).value;
          body.push(vardecl);
          decl_db.state_variables.add(vardecl.id);
        }
      }
      unexpected_extra_stmt = [];
      body.push(variable_decl);
      decl_db.state_variables.add(variable_decl.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}State Variables, ${state_variable_count} in total`));
    }
    for (let i = 0; i < state_variable_count; i++) {
      // For each state variable, generate a external view function with the same identifier name as the state variable.
      const variable_decl = local_state_variables[i];
      const fid = global_id++;
      if (config.debug) {
        console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating getter function for state variable ${variable_decl.name}, ID: ${fid}`));
        indent += 2;
      }
      decl_db.funcdecls.add(fid);
      decl_db.insert(fid, erwin_visibility.INCONTRACT_EXTERNAL, cur_scope.id());
      funcstat_dag.insert(funcstat_dag.newNode(fid), [FuncStatProvider.empty()]);
      // The returned variable_decl is not the state variable, but is a ghost variable of the true state variable
      // Since expr2used_vardecls(functioncall) includes its returned vardecl, which may be state variable, 
      // an external call of this getter function may mislead a function body and let it believe it uses the state variable, which is not true. 
      // So we need a ghost state variable, which is a copy of the true state variable but not a state variable itself, to avoid this misleading.
      if (config.debug) {
        console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ghost state variable for state variable ${variable_decl.name}`));
        indent += 2;
      }
      const ghost_state_vardecl = new decl.IRVariableDeclaration(global_id++, cur_scope.id(), variable_decl.name,
        undefined, variable_decl.visibility);
      type_dag.insert(type_dag.newNode(ghost_state_vardecl.id), type_dag.solution_range.get(variable_decl.id)!);
      type_dag.connect(ghost_state_vardecl.id, variable_decl.id);
      if (config.debug) {
        indent -= 2;
        console.log(color.yellowBG(`${" ".repeat(indent)}${ghost_state_vardecl.id}: Ghost state variable for state variable ${variable_decl.name}, type: ${type_dag.solution_range.get(ghost_state_vardecl.id)!.map(t => t.str())}`));
      }
      decl_db.ghost_funcdecls.add(fid);
      decl_db.add_ghosts_for_state_variable(fid, ghost_state_vardecl.id, variable_decl.id);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, [], [ghost_state_vardecl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
      if (config.debug) {
        indent -= 2;
        console.log(color.yellowBG(`${" ".repeat(indent)}${fid}: Getter function for state variable ${variable_decl.name}`));
      }
    }
    //TODO: Generate struct declaration
    //TODO: Generate events, errors, and mappings
    decl_db.insert_yin_contract(cur_scope.id(), thisid);
    //! Generator constructor declaration
    let constructor_gen : ConstructorDeclarationGenerator | undefined;
    let constructor_parameters : decl.IRVariableDeclaration[] = [];
    if (Math.random() < config.constructor_prob) {
      constructor_gen = new ConstructorDeclarationGenerator(false);
      constructor_gen.generate();
      body.push(constructor_gen.irnode!);
      constructor_parameters = constructor_gen.parameters;
    }
    //! Generate function declarations in contract
    const function_count_per_contract_upper_limit = random_int(config.function_count_per_contract_lower_limit,
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
    if (constructor_gen !== undefined) {
      constructor_gen.generate_body();
    }
    //! Generate function bodies
    for (let i = 0; i < function_count_per_contract_upper_limit; i++) {
      function_gens[i].generate_function_body();
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new decl.IRContractDefinition(thisid, cur_scope.id(), contract_name,
      ContractKind.Contract, false, false, body, [], [], [], constructor_parameters);
    //! Add this contract type
    all_types = [...all_types];
    const contract_type = new type.ContractType(thisid, contract_name);
    all_types.push(contract_type);
    contract_types.set(thisid, contract_type);
    user_defined_types.push(contract_type)
    decl_db.insert_yang_contract(cur_scope.id(), thisid);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Contract`));
    }
  }
}

//TODO: Generate library, interface, and abstract contract.

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  id : number;
  constructor(id : number) {
    super();
    this.id = id;
    assert(type_dag.solution_range.has(id), `ExpressionGenerator: type_dag.solution_range does not have id ${id}`);
    this.type_range = type_dag.solution_range.get(id)!;
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

// @ts-ignore
abstract class LValueGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

abstract class RValueGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

abstract class LRValueGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }
  abstract generate(cur_expression_complex_level : number) : void;
}

class LiteralGenerator extends RValueGenerator {
  constructor(id : number) {
    super(id);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal ${this.id}: ${this.type_range.map(t => t.str())}`));
    }
    this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.elementary_types))];
    assert(this.type_range.length > 0, `LiteralGenerator: type_range ${this.type_range.map(t => t.str())} is invalid`);
    type_dag.insert(type_dag.newNode(this.id), this.type_range);
    this.irnode = new expr.IRLiteral(this.id, cur_scope.id());
    expr2used_vardecls.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

class IdentifierGenerator extends LRValueGenerator {
  constructor(id : number) {
    super(id);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    type_dag.insert(type_dag.newNode(this.id), this.type_range);
    let irdecl : decl.IRVariableDeclaration;
    // Generate a variable decl if there is no variable decl available.
    if (!has_available_IRVariableDeclaration_with_type_constraint(this.type_range) ||
      Math.random() < config.vardecl_prob) {
      const variable_decl_gen = new VariableDeclarationGenerator(this.type_range, false);
      variable_decl_gen.generate();
      const variable_decl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
      if (variable_decl.value === undefined) {
        const literal_id = global_id++;
        type_dag.insert(type_dag.newNode(literal_id), this.type_range);
        type_dag.connect(literal_id, variable_decl_gen.irnode!.id, "super_dominance");
        const literal_gen = new LiteralGenerator(literal_id);
        literal_gen.generate(0);
        variable_decl.value = literal_gen.irnode! as expr.IRExpression;
      }
      const variable_decl_stmt = new stmt.IRVariableDeclareStatement(
        global_id++, cur_scope.id(), [variable_decl_gen.irnode! as decl.IRVariableDeclaration],
        variable_decl.value!
      );
      variable_decl.value = undefined;
      unexpected_extra_stmt.push(variable_decl_stmt as stmt.IRVariableDeclareStatement);
      irdecl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
    }
    else {
      const contract_instance_plus_availableIRDecl = get_available_IRVariableDeclarations_with_type_constraint(this.type_range);
      assert(contract_instance_plus_availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(contract_instance_plus_availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pick_random_element(contract_instance_plus_availableIRDecl)!;
    }
    this.irnode = new expr.IRIdentifier(this.id, cur_scope.id(), irdecl.name, irdecl.id);
    type_dag.insert(type_dag.newNode(this.irnode.id), type_dag.solution_range.get(irdecl.id)!);
    type_dag.connect(this.irnode.id, irdecl.id);
    type_dag.type_range_alignment(this.irnode.id, irdecl.id);
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

class AssignmentGenerator extends RValueGenerator {
  op : ASSIOP;

  constructor(id : number, op ?: ASSIOP) {
    super(id);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_set(this.type_range, type.bool_types)
      || is_equal_set(this.type_range, type.address_types)
      || is_super_set(user_defined_types, this.type_range)) {
      this.op = "=";
    }
    else if (is_super_set(type.all_integer_types, this.type_range) ||
      is_super_set(all_types, this.type_range)) {
      this.op = pick_random_element(
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    //! Update type range of this node
    if (this.op === "=") {
    }
    else {
      this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.all_integer_types))];
      assert(this.type_range.length > 0, "AssignmentGenerator: type_range is empty");
    }
    if (this.op !== "=") {
      assert(this.type_range.every(t => t.typeName === "ElementaryType"),
        `AssignmentGenerator: op is not =, but type range ${this.type_range.map(t => t.str())} is not all elementary types`);
    }
    type_dag.update(type_dag.newNode(this.id), this.type_range);
    const leftid = global_id++;
    const rightid = global_id++;
    if (this.left_dominate_right()) {
      type_dag.insert(type_dag.newNode(rightid), this.type_range);
    }
    else {
      type_dag.insert(type_dag.newNode(rightid), type.uinteger_types);
    }
    if (this.left_dominate_right()) {
      type_dag.insert(type_dag.newNode(leftid), type_dag.solution_range.get(rightid)!);
    }
    else {
      type_dag.insert(type_dag.newNode(leftid), type_dag.solution_range.get(this.id)!);
    }
    if (this.left_dominate_right()) {
      type_dag.connect(leftid, rightid);
    }
    type_dag.connect(this.id, leftid);
    //! Generate the right-hand-side expression
    let right_expression_gen_prototype;
    const only_contract_type = this.type_range.every(t => t.typeName === "ContractType");
    if (only_contract_type) {
      assert(this.op === '=', `AssignmentGenerator: only_contract_type is true, but op ${this.op} is not =`);
      right_expression_gen_prototype = NewContractDecarationGenerator;
    }
    else {
      const no_contract_type = this.type_range.every(t => t.typeName !== "ContractType");
      if (!no_contract_type) {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          right_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          if (is_equal_set(this.type_range, type.address_types)) {
            assert(this.op === '=', `AssignmentGenerator: type range is address_types, but op ${this.op} is not =`);
            right_expression_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
          }
          else {
            right_expression_gen_prototype = pick_random_element(nonterminal_expression_generators)!;
          }
        }
      }
      else {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          right_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          if (is_equal_set(this.type_range, type.address_types)) {
            assert(this.op === '=', `AssignmentGenerator: type range is address_types, but op ${this.op} is not =`);
            right_expression_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
          }
          else {
            right_expression_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
          }
        }
      }
    }
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    //! Generate the left-hand-side identifier
    if (this.left_dominate_right()) {
      type_dag.type_range_alignment(leftid, rightid);
    }
    const identifier_gen = new IdentifierGenerator(leftid);
    identifier_gen.generate(cur_expression_complex_level + 1);
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    //! Update expr2used_vardecls
    expr2used_vardecls.set(this.id,
      merge_set(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRAssignment(this.id, cur_scope.id(), left_expression, right_expression, this.op!);
    if (this.left_dominate_right()) {
      type_dag.type_range_alignment(leftid, rightid);
    }
    type_dag.type_range_alignment(this.id, leftid);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Assignment ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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

class BinaryOpGenerator extends RValueGenerator {
  op : BOP;
  constructor(id : number, op ?: BOP) {
    super(id);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_set(this.type_range, type.bool_types)) {
      this.op = pick_random_element(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (is_super_set(type.all_integer_types, this.type_range)) {
      this.op = pick_random_element(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else if (is_super_set(this.type_range, type.elementary_types)) {
      this.op = pick_random_element(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
      this.type_range = type.elementary_types
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    //! Update type range of this node
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1) {
      this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.all_integer_types))]
      assert(this.type_range.length > 0, "BinaryOpGenerator: type_range is empty");
    }
    else if (["<", ">", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      this.type_range = type.bool_types;
    }
    else { // &&, ||, =
      this.type_range = type.bool_types;
    }
    assert(this.type_range.every(t => t.typeName === "ElementaryType",
      `BinaryOpGenerator: type_range ${this.type_range.map(t => t.str())} is not all elementary types`));
    type_dag.update(type_dag.newNode(this.id), this.type_range);
    const leftid = global_id++;
    const rightid = global_id++;
    if (this.left_dominate_right() && this.this_dominates_left()) {
      type_dag.insert(type_dag.newNode(rightid), this.type_range);
    }
    else if (this.this_dominates_left()) {
      type_dag.insert(type_dag.newNode(rightid), type.uinteger_types);
    }
    else {
      type_dag.insert(type_dag.newNode(rightid), type.all_integer_types);
    }
    if (this.left_dominate_right()) {
      type_dag.insert(type_dag.newNode(leftid), type_dag.solution_range.get(rightid)!);
    }
    else if (this.this_dominates_left()) {
      type_dag.insert(type_dag.newNode(leftid), type_dag.solution_range.get(this.id)!);
    }
    else {
      throw new Error(`BinaryOpGenerator: op ${this.op} leads to an invalid situation`);
    }
    if (this.this_dominates_left()) {
      type_dag.connect(this.id, leftid);
    }
    if (this.left_dominate_right()) {
      type_dag.connect(leftid, rightid, "sub_dominance");
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
        left_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
      }
    }
    else {
      if (this.op === "<<" || this.op === ">>") {
        left_expression_gen_prototype = pick_random_element(nonnew_nonliteral_expression_generators)!;
      }
      else {
        left_expression_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
      }
    }
    if (left_expression_gen_prototype.name === "LiteralGenerator") {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = IdentifierGenerator;
      }
      else {
        right_expression_gen_prototype = pick_random_element(nonnew_nonliteral_expression_generators)!;
      }
    }
    else {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
      }
      else {
        right_expression_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
      }
    }
    //! Generate right-hand-side expression
    right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    //! Generate left-hand-side expression
    if (this.left_dominate_right()) {
      type_dag.type_range_alignment(leftid, rightid);
    }
    left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    //! Update expr2used_vardecls
    expr2used_vardecls.set(this.id,
      merge_set(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    if (this.left_dominate_right()) {
      type_dag.type_range_alignment(leftid, rightid);
    }
    if (this.this_dominates_left()) {
      type_dag.type_range_alignment(this.id, leftid);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type BINARYCOMPAREOP = "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||";

class BinaryCompareOpGenerator extends RValueGenerator {
  op : BINARYCOMPAREOP;
  constructor(id : number, op ?: BINARYCOMPAREOP) {
    super(id);
    assert(is_equal_set(this.type_range, type.bool_types),
      `BinaryCompareOpGenerator: type_range ${this.type_range.map(t => t.str())} should be bool_types`);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_set(this.type_range, type.bool_types)) {
      this.op = pick_random_element(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    type_dag.update(type_dag.newNode(this.id), type.bool_types);
    const leftid = global_id++;
    const rightid = global_id++;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      type_dag.insert(type_dag.newNode(rightid), type.all_integer_types);
    }
    else {
      type_dag.insert(type_dag.newNode(rightid), type_dag.solution_range.get(this.id)!);
    }
    type_dag.insert(type_dag.newNode(leftid), type_dag.solution_range.get(rightid)!);
    if (this.this_dominates_left()) {
      type_dag.connect(this.id, leftid);
    }
    type_dag.connect(leftid, rightid, "sub_dominance");
    //! Select generators for the left-hand-side and right-hand-side expressions
    let left_expression : expr.IRExpression;
    let right_expression : expr.IRExpression;
    let left_expression_gen_prototype, right_expression_gen_prototype;
    let left_expression_gen, right_expression_gen;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      left_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
      right_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
    }
    else {
      left_expression_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
      right_expression_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
    }
    //! Generate right-hand-side expression
    right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    //! Generate left-hand-side expression
    type_dag.type_range_alignment(leftid, rightid);
    left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    expr2used_vardecls.set(this.id,
      merge_set(
        expr2used_vardecls.get(left_extracted_expression.id)!,
        expr2used_vardecls.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    type_dag.type_range_alignment(leftid, rightid);
    if (this.this_dominates_left()) {
      type_dag.type_range_alignment(this.id, leftid);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryCompareOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

type UOP = "!" | "-" | "~" | "++" | "--";

//TODO: create a delete Statement Generator
class UnaryOpGenerator extends RValueGenerator {
  op : UOP;
  constructor(id : number, op ?: UOP) {
    super(id);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_set(this.type_range, type.bool_types)) {
      this.op = "!";
    }
    else if (is_equal_set(this.type_range, type.integer_types) || is_equal_set(this.type_range, type.all_integer_types)) {
      this.op = pick_random_element(["-", "~", "++", "--"])!;
    }
    else if (is_equal_set(this.type_range, type.uinteger_types)) {
      this.op = pick_random_element(["~", "++", "--"])!;
    }
    else {
      this.op = pick_random_element(["!", "-", "~", "++", "--"])!;
    }
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    //! Update type range
    if (this.op === "!") {
      this.type_range = type.bool_types;
    }
    else if (this.op === "~" || this.op === "++" || this.op === "--") {
      this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.all_integer_types))]
    }
    else if (this.op === "-") {
      this.type_range = this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.integer_types))]
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
    assert(this.type_range.length > 0, "UnaryOpGenerator: type_range is empty");
    assert(this.type_range.every(t => t.typeName === "ElementaryType"),
      `UnaryOpGenerator: type_range ${this.type_range.map(t => t.str())} is not all ElementaryType`);
    type_dag.update(type_dag.newNode(this.id), this.type_range);
    const identifier_id = global_id++;
    type_dag.insert(type_dag.newNode(identifier_id), this.type_range);
    type_dag.connect(this.id, identifier_id);
    //! Generate identifier
    const identifier_gen = new IdentifierGenerator(identifier_id);
    identifier_gen.generate(cur_expression_complex_level + 1);
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    //! Generate irnode
    this.irnode = new expr.IRUnaryOp(this.id, cur_scope.id(), pick_random_element([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tuple_extraction(expression);
    //!. Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(this.id, expr2used_vardecls.get(extracted_expression.id)!);
    //! Build dominations
    type_dag.type_range_alignment(this.id, identifier_id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: UnaryOp ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

class ConditionalGenerator extends RValueGenerator {
  constructor(id : number) {
    super(id);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional: ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    type_dag.insert(type_dag.newNode(this.id), this.type_range);
    const e1id = global_id++;
    type_dag.insert(type_dag.newNode(e1id), type.bool_types);
    const e2id = global_id++;
    type_dag.insert(type_dag.newNode(e2id), this.type_range);
    const e3id = global_id++;
    type_dag.insert(type_dag.newNode(e3id), this.type_range);
    type_dag.connect(e2id, e3id, "sub_dominance");
    type_dag.connect(this.id, e2id);
    //! Suppose the conditional expression is e1 ? e2 : e3
    //! The first step is to get a generator for e1.
    let e1_gen_prototype;
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      e1_gen_prototype = pick_random_element(terminal_expression_generators)!;
    }
    else {
      e1_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
    }
    //! Generate e1
    const e1_gen = new e1_gen_prototype(e1id);
    e1_gen.generate(cur_expression_complex_level + 1);
    let extracted_e1 = expr.tuple_extraction(e1_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(this.id, expr2used_vardecls.get(extracted_e1.id)!);
    //! Generate e3
    let e3_gen_prototype;
    const only_contract_type_e3 = this.type_range.every(t => t.typeName == 'ContractType');
    if (only_contract_type_e3) {
      e3_gen_prototype = NewContractDecarationGenerator;
    }
    else {
      const no_contract_type_e3 = this.type_range.every(t => t.typeName != 'ContractType');
      if (!no_contract_type_e3) {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          e3_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          e3_gen_prototype = pick_random_element(nonterminal_expression_generators)!;
        }
      }
      else {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          e3_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          e3_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
        }
      }
    }
    const e3_gen = new e3_gen_prototype!(e3id);
    e3_gen.generate(cur_expression_complex_level + 1);
    let extracted_e3 = expr.tuple_extraction(e3_gen.irnode! as expr.IRExpression);
    type_dag.type_range_alignment(e2id, e3id);
    //! Generate e2
    let e2_gen_prototype;
    const type_Range_for_e2 = type_dag.solution_range.get(e2id)!;
    const only_contract_type_e2 = type_Range_for_e2.every(t => t.typeName == 'ContractType');
    if (only_contract_type_e2) {
      e2_gen_prototype = NewContractDecarationGenerator;
    }
    else {
      const no_contract_type_e2 = type_Range_for_e2.every(t => t.typeName != 'ContractType');
      if (!no_contract_type_e2) {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          e2_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          e2_gen_prototype = pick_random_element(nonterminal_expression_generators)!;
        }
      }
      else {
        if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
          e2_gen_prototype = pick_random_element(terminal_expression_generators)!;
        }
        else {
          e2_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
        }
      }
    }
    const e2_gen = new e2_gen_prototype(e2id);
    e2_gen.generate(cur_expression_complex_level + 1);
    let extracted_e2 = expr.tuple_extraction(e2_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(this.id,
      merge_set(
        merge_set(
          expr2used_vardecls.get(extracted_e1.id)!,
          expr2used_vardecls.get(extracted_e2.id)!
        ),
        expr2used_vardecls.get(extracted_e3.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRConditional(
      this.id, cur_scope.id(), e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    //! Build dominations
    type_dag.type_range_alignment(e2id, e3id);
    type_dag.type_range_alignment(this.id, e2id);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Conditional, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

class FunctionCallGenerator extends RValueGenerator {
  kind : FunctionCallKind | undefined;
  constructor(id : number, kind ?: FunctionCallKind) {
    super(id);
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
      // haoyang TODO:

      assert(type_dag.solution_range.has(ret_decl_id), `FunctionCallGenerator: return_is_good: ret_decl_id ${ret_decl_id} is not in type_dag.solution_range`);
      return is_super_set(this.type_range, type_dag.solution_range.get(ret_decl_id)!) ||
        is_super_set(type_dag.solution_range.get(ret_decl_id)!, this.type_range) &&
        type_dag.try_tighten_solution_range_middle_out(ret_decl_id, this.type_range)
    };
    type_dag.insert(type_dag.newNode(this.id), this.type_range);
    //! If cur_expression_complex_level reaches the maximum, generate an terminal expression
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      const expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.id);
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
      if (is_equal_set(this.type_range, type.address_types)) {
        expression_gen_prototype = pick_random_element(non_funccall_expression_generators_for_address_type)!;
      }
      else {
        const only_contract_type = this.type_range.every(t => t.typeName === "ContractType");
        if (only_contract_type) {
          expression_gen_prototype = NewContractDecarationGenerator;
        }
        else {
          const no_contract_type = this.type_range.every(t => t.typeName !== "ContractType");
          if (!no_contract_type) {
            expression_gen_prototype = pick_random_element(non_funccall_expression_generators)!;
          }
          else {
            expression_gen_prototype = pick_random_element(nonnew_non_funccall_expression_generators)!;
          }
        }
      }
      const expression_gen = new expression_gen_prototype(this.id);
      expression_gen.generate(cur_expression_complex_level);
      this.irnode = expression_gen.irnode;
      return;
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
        ([contractdecl_id, funcdecl_id]) =>
          (irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).returns.length == 1
      );
    }
    const [contractdecl_id, funcdecl_id] = pick_random_element(contractdecl_id_plus_funcdecl_id)!;
    //! Otherwise, first select a function declaration
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall: ${this.id}: ${this.type_range.map(t => t.str())}, contractdecl_id: ${contractdecl_id} funcdecl_id: ${funcdecl_id}`));
      indent += 2;
    }
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
    let selected_ret_decls_index = available_ret_decls_index.length == 0 ? -1 : pick_random_element(available_ret_decls_index)!;
    let selected_ret_decl : null | decl.IRVariableDeclaration = null;
    if (selected_ret_decls_index !== -1) selected_ret_decl = ret_decls[selected_ret_decls_index];
    if (selected_ret_decl !== null) {
      type_dag.connect(this.id, selected_ret_decl.id);
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
    expr2used_vardecls.set(this.id, new Set<number>());
    for (let i = 0; i < funcdecl.parameters.length; i++) {
      const type_range = type_dag.solution_range.get(funcdecl.parameters[i].id)!;
      let arg_gen_prototype;
      const only_contract_type = type_range.every(t => t.typeName === "ContractType");
      if (only_contract_type) {
        arg_gen_prototype = NewContractDecarationGenerator;
      }
      else {
        const no_contract_type = type_range.every(t => t.typeName !== "ContractType");
        if (!no_contract_type) {
          if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
            arg_gen_prototype = pick_random_element(terminal_expression_generators)!;
          }
          else {
            if (is_equal_set(type_range, type.address_types))
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
            else
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators)!;
          }
        }
        else {
          if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
            arg_gen_prototype = pick_random_element(terminal_expression_generators)!;
          }
          else {
            if (is_equal_set(type_range, type.address_types))
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
            else
              arg_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
          }
        }
      }
      const argid = global_id++;
      type_dag.insert(type_dag.newNode(argid), type_range);
      type_dag.connect(argid, funcdecl.parameters[i].id, "super_dominance");
      const arg_gen = new arg_gen_prototype(argid);
      arg_gen.generate(cur_expression_complex_level + 1);
      let extracted_arg = expr.tuple_extraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      type_dag.type_range_alignment(argid, funcdecl.parameters[i].id);
    }
    for (const arg_id of args_ids) {
      expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, expr2used_vardecls.get(arg_id)!));
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}FunctionCall Arguments`));
    }
    //! Generate an function call and select which returned value will be used
    let func_call_node;
    // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
    if (contractdecl_id !== cur_contract_id) {
      external_call = true;
      // "this" (yin)
      if (contractdecl_id < 0) {
        func_call_node = new expr.IRFunctionCall(
          this.id,
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
        let contract_instance_expr : expr.IRExpression | undefined;
        // Generate a contract instance
        if (!decl_db.contractdecl_to_contract_instance.has(contractdecl_id) || Math.random() < config.vardecl_prob) {
          const nid = global_id++;
          type_dag.insert(type_dag.newNode(nid), [contract_types.get(contractdecl_id)!]);
          const new_contract_gen = new NewContractDecarationGenerator(nid, contractdecl_id);
          new_contract_gen.generate(cur_expression_complex_level + 1);
          contract_instance_expr = new_contract_gen.irnode as expr.IRExpression;
          const extracted_contract_instance_expr = expr.tuple_extraction(contract_instance_expr);
          expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, expr2used_vardecls.get(extracted_contract_instance_expr.id)!));
        }
        // Use an existing contract instance
        else {
          const contract_instance_id = pick_random_element(decl_db.contractdecl_to_contract_instance.get(contractdecl_id)!)!;
          expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, new Set([contract_instance_id])));
          const contract_instance = irnodes.get(contract_instance_id)! as decl.IRVariableDeclaration;
          // Intialized contract instance with a new expr
          if (cur_scope.kind() !== scopeKind.CONTRACT &&
            (contract_instance.value === undefined || Math.random() < config.initialization_prob)) {
            const nid = global_id++;
            type_dag.insert(type_dag.newNode(nid), contract_types.get(contractdecl_id)!.subs());
            type_dag.connect(nid, contract_instance.id, "super_dominance");
            const new_contract_gen = new NewContractDecarationGenerator(nid, contractdecl_id);
            new_contract_gen.generate(cur_expression_complex_level + 1);
            const new_contract_expr = new_contract_gen.irnode as expr.IRExpression;
            const new_contract_expr_extracted = expr.tuple_extraction(new_contract_expr);
            expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, expr2used_vardecls.get(new_contract_expr_extracted.id)!));
            const identifier = new expr.IRIdentifier(global_id++, cur_scope.id(), contract_instance.name, contract_instance_id);
            const assignment = new expr.IRAssignment(global_id++, cur_scope.id(), identifier, new_contract_expr, "=");
            const assignment_stmt = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment);
            unexpected_extra_stmt.push(assignment_stmt);
          }
          contract_instance_expr = new expr.IRIdentifier(global_id++, cur_scope.id(), contract_instance.name, contract_instance_id);
        }
        func_call_node = new expr.IRFunctionCall(
          this.id,
          cur_scope.id(),
          this.kind!,
          new expr.IRMemberAccess(global_id++, cur_scope.id(),
            func_identifier.name!, contractdecl_id, contract_instance_expr,
          ),
          args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
        );
      }
    }
    else {
      func_call_node = new expr.IRFunctionCall(this.id, cur_scope.id(), this.kind!,
        func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
    }
    if (selected_ret_decl !== null) {
      type_dag.type_range_alignment(this.id, selected_ret_decl!.id);
    }
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1 && selected_ret_decl !== null) {
      //* generate an identifier
      const identifier_id = global_id++;
      type_dag.insert(type_dag.newNode(identifier_id), type_dag.solution_range.get(selected_ret_decl.id)!);
      type_dag.connect(identifier_id, this.id);
      const identifier_gen = new IdentifierGenerator(identifier_id);
      identifier_gen.generate(cur_expression_complex_level + 1);
      const identifier_expr = expr.tuple_extraction(identifier_gen.irnode! as expr.IRExpression);
      expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, expr2used_vardecls.get(identifier_expr.id)!));
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
      expr2used_vardecls.set(this.irnode.id, expr2used_vardecls.get(this.id)!);
    }
    else {
      this.irnode = func_call_node;
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: FunctionCall, id: ${this.id} scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
    }
  }
}

class NewContractDecarationGenerator extends ExpressionGenerator {
  contract_id ? : number;
  constructor(id : number, contract_id ?: number) {
    super(id);
    this.contract_id = contract_id;
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewContractDeclaration ${this.id}: ${this.type_range.map(t => t.str())}`));
      indent += 2;
    }
    assert(decl_db.contractdecls.size > 0, "No contract is declared");
    if (this.contract_id === undefined) {
      this.contract_id = pick_random_element([...decl_db.contractdecls].filter(id => id > 0))!;
    }
    assert(irnodes.has(this.contract_id), `NewContractDecarationGenerator: contract_id ${this.contract_id} is not in irnodes`);
    const contract_decl = irnodes.get(this.contract_id) as decl.IRContractDefinition;
    const new_expr = new expr.IRNew(global_id++, cur_scope.id(), contract_decl.name);
    //! Generate arguments for the constructor
    const args_ids : number[] = [];
    const args : expr.IRExpression[] = [];
    expr2used_vardecls.set(this.id, new Set<number>());
    for (let i = 0; i < contract_decl.constructor_parameters.length; i++) {
      const type_range = type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!;
      let arg_gen_prototype;
      const only_contract_type = type_range.every(t => t.typeName === "ContractType");
      if (only_contract_type) {
        arg_gen_prototype = NewContractDecarationGenerator;
      }
      else {
        const no_contract_type = type_range.every(t => t.typeName !== "ContractType");
        if (!no_contract_type) {
          if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
            arg_gen_prototype = pick_random_element(terminal_expression_generators)!;
          }
          else {
            if (is_equal_set(type_range, type.address_types))
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
            else
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators)!;
          }
        }
        else {
          if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
            arg_gen_prototype = pick_random_element(terminal_expression_generators)!;
          }
          else {
            if (is_equal_set(type_range, type.address_types))
              arg_gen_prototype = pick_random_element(nonterminal_expression_generators_for_address_type)!;
            else
              arg_gen_prototype = pick_random_element(nonnew_nonterminal_expression_generators)!;
          }
        }
      }
      const argid = global_id++;
      type_dag.insert(type_dag.newNode(argid), type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!);
      type_dag.connect(argid, contract_decl.constructor_parameters[i].id);
      const arg_gen = new arg_gen_prototype(argid);
      arg_gen.generate(cur_expression_complex_level + 1);
      args.push(arg_gen.irnode! as expr.IRExpression);
      let extracted_arg = expr.tuple_extraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      for (const arg_id of args_ids) {
        expr2used_vardecls.set(this.id, merge_set(expr2used_vardecls.get(this.id)!, expr2used_vardecls.get(arg_id)!));
      }
    }
    const new_function_expr = new expr.IRFunctionCall(this.id, cur_scope.id(), FunctionCallKind.FunctionCall, new_expr, args);
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
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator,
  NewContractDecarationGenerator
];

const nonterminal_expression_generators_for_address_type = [
  AssignmentGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const non_funccall_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  NewContractDecarationGenerator
];

const nonnew_non_funccall_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator
];

const non_funccall_expression_generators_for_address_type = [
  IdentifierGenerator,
  AssignmentGenerator,
  ConditionalGenerator,
];

const all_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator,
  NewContractDecarationGenerator
];

const nonnew_all_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const nonnew_nonliteral_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const nonnew_nonterminal_expression_generators = [
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

abstract class StatementGenerator extends Generator {
  constructor() { super(); }
  abstract generate(cur_stmt_complex_level : number) : void;
}


abstract class ExpressionStatementGenerator extends StatementGenerator {
  expr : expr.IRExpression | undefined;
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void { }
}

class AssignmentStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating AssignmentStatement`));
      indent += 2;
    }
    const assignid = global_id++;
    type_dag.insert(type_dag.newNode(assignid), all_types);
    const assignment_gen = new AssignmentGenerator(assignid);
    assignment_gen.generate(0);
    this.expr = expr.tuple_extraction(assignment_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: AssignmentStatement`));
    }
  }
}

class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOpStatement`));
      indent += 2;
    }
    const bopid = global_id++;
    type_dag.insert(type_dag.newNode(bopid), type.elementary_types);
    const binaryop_gen = new BinaryOpGenerator(bopid);
    binaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(binaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), binaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: BinaryOpStatement`));
    }
  }
}

class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOpStatement`));
      indent += 2;
    }
    const uopid = global_id++;
    type_dag.insert(type_dag.newNode(uopid), type.elementary_types);
    const unaryop_gen = new UnaryOpGenerator(uopid);
    unaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(unaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), unaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: UnaryOpStatement`));
    }
  }
}

class ConditionalStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ConditionalStatement`));
      indent += 2;
    }
    const cid = global_id++;
    type_dag.insert(type_dag.newNode(cid), all_types);
    const conditional_gen = new ConditionalGenerator(cid);
    conditional_gen.generate(0);
    this.expr = expr.tuple_extraction(conditional_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), conditional_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ConditionalStatement`));
    }
  }
}

class FunctionCallStatementGenerator extends ExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCallStatement`));
      indent += 2;
    }
    allow_empty_return = true;
    const fid = global_id++;
    type_dag.insert(type_dag.newNode(fid), all_types);
    const funcall_gen = new FunctionCallGenerator(fid);
    funcall_gen.generate(0);
    this.expr = expr.tuple_extraction(funcall_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), funcall_gen.irnode! as expr.IRExpression);
    allow_empty_return = false;
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: FunctionCallStatement`));
    }
  }
}

abstract class NonExpressionStatementGenerator extends StatementGenerator {
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
// @ts-ignore
class SingleVariableDeclareStatementGenerator extends NonExpressionStatementGenerator {
  vardecl : decl.IRVariableDeclaration | undefined;
  expr : expr.IRExpression | undefined;
  constructor(vardecl ?: decl.IRVariableDeclaration, expr ?: expr.IRExpression) {
    super();
    this.vardecl = vardecl;
    this.expr = expr;
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SingleVariableDeclareStatement`));
      indent += 2;
    }
    if (this.expr === undefined) {
      let expression_gen_prototype;
      if (has_available_IRVariableDeclarations() && Math.random() > config.literal_prob) {
        expression_gen_prototype = pick_random_element(all_expression_generators)!;
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expr_id = global_id++;
      type_dag.insert(type_dag.newNode(expr_id), all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      this.expr = expression_gen.irnode! as expr.IRExpression;
    }
    this.exprs = this.exprs.concat(expr.tuple_extraction(this.expr));
    if (this.vardecl === undefined) {
      const variable_gen = new VariableDeclarationGenerator(all_types, false);
      variable_gen.generate();
      this.vardecl = variable_gen.irnode! as decl.IRVariableDeclaration;
    }
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.id(), [this.vardecl], this.expr);
    let extracted_ir = expr.tuple_extraction(this.expr);
    type_dag.connect(extracted_ir.id, this.vardecl.id, "super_dominance");
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: SingleVariableDeclareStatement`));
    }
  }
}

class MultipleVariableDeclareStatementGenerator extends NonExpressionStatementGenerator {
  var_count : number;
  vardecls : decl.IRVariableDeclaration[] = [];
  constructor(var_count : number) {
    super();
    this.var_count = var_count;
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating MultipleVariableDeclareStatement`));
      indent += 2;
    }
    const ir_exps : expr.IRExpression[] = [];
    for (let i = 0; i < this.var_count; i++) {
      let expression_gen_prototype;
      if (has_available_IRVariableDeclarations() && Math.random() > config.literal_prob) {
        expression_gen_prototype = pick_random_element(all_expression_generators)!;
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expr_id = global_id++;
      type_dag.insert(type_dag.newNode(expr_id), all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
      this.exprs = this.exprs.concat(expr.tuple_extraction(ir_exps[i]));
    }
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(all_types, false);
      variable_gen.generate();
      this.vardecls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    const ir_tuple_exp = new expr.IRTuple(global_id++, cur_scope.id(), ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.id(), this.vardecls, ir_tuple_exp);
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = expr.tuple_extraction(ir_exps[i]);
      type_dag.connect(extracted_ir.id, this.vardecls[i].id, "super_dominance");
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: MultipleVariableDeclareStatement`));
    }
  }
}

class ReturnStatementGenerator extends NonExpressionStatementGenerator {
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
    assert(this.value !== undefined, "ReturnStatementGenerator: value is undefined");
    if (this.value === undefined) {
      //! Contain bugs
      const expression_gen_prototype = pick_random_element(all_expression_generators)!;
      const exprid = global_id++;
      type_dag.insert(type_dag.newNode(exprid), all_types);
      const expression_gen = new expression_gen_prototype(exprid);
      expression_gen.generate(0);
      this.value = expression_gen.irnode! as expr.IRExpression;
      this.exprs.push(expr.tuple_extraction(this.value));
    }
    this.irnode = new stmt.IRReturnStatement(global_id++, cur_scope.id(), this.value);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ReturnStatement`));
    }
  }
}

class IfStatementGenerator extends NonExpressionStatementGenerator {
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
    const cid = global_id++;
    type_dag.insert(type_dag.newNode(cid), type.bool_types);
    const condition_gen = new BinaryCompareOpGenerator(cid);
    condition_gen.generate(0);
    this.exprs.push(expr.tuple_extraction(condition_gen.irnode as expr.IRExpression));
    //! Generate true body
    const true_body : stmt.IRStatement[] = [];
    const true_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < true_stmt_cnt; i++) {
      const then_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const then_stmt_gen = new then_stmt_gen_prototype();
      then_stmt_gen.generate(cur_stmt_complex_level + 1);
      true_body.push(then_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        then_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(then_stmt_gen.expr!)] :
          then_stmt_gen.exprs
      );
    }
    if (Math.random() < config.else_prob) {
      this.irnode = new stmt.IRIf(global_id++, cur_scope.id(), condition_gen.irnode! as expr.IRExpression, true_body, []);
      cur_scope = cur_scope.rollback();
      return;
    }
    //! Generate false body
    const false_body : stmt.IRStatement[] = [];
    const false_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < false_stmt_cnt; i++) {
      const else_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const else_stmt_gen = new else_stmt_gen_prototype();
      else_stmt_gen.generate(cur_stmt_complex_level + 1);
      false_body.push(else_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        else_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(else_stmt_gen.expr!)] :
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

class ForStatementGenerator extends NonExpressionStatementGenerator {
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
    const init_cnt = random_int(config.for_init_cnt_lower_limit, config.for_init_cnt_upper_limit);
    if (init_cnt > 0 && Math.random() < config.vardecl_prob) {
      const mul_vardecl_gen = new MultipleVariableDeclareStatementGenerator(init_cnt);
      mul_vardecl_gen.generate(0);
      init_stmt_expr = mul_vardecl_gen.irnode! as stmt.IRVariableDeclareStatement;
      this.exprs = this.exprs.concat(mul_vardecl_gen.exprs);
    }
    else {
      const ir_exps : expr.IRExpression[] = [];
      for (let i = 0; i < init_cnt; i++) {
        const init_expr_gen_prototype = pick_random_element(all_expression_generators)!;
        const iid = global_id++;
        type_dag.insert(type_dag.newNode(iid), all_types);
        const init_expr_gen = new init_expr_gen_prototype(iid);
        init_expr_gen.generate(0);
        ir_exps.push(init_expr_gen.irnode! as expr.IRExpression);
      }
      if (init_cnt > 0) {
        init_stmt_expr = new expr.IRTuple(global_id++, cur_scope.id(), ir_exps);
        this.exprs = this.exprs.concat(ir_exps.map(e => expr.tuple_extraction(e)));
      }
      else {
        init_stmt_expr = undefined;
        this.exprs = [];
      }
    }
    //! Generate the conditional expression
    const cid = global_id++;
    type_dag.insert(type_dag.newNode(cid), type.bool_types);
    const conditional_gen = new BinaryCompareOpGenerator(cid);
    conditional_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(conditional_gen.irnode as expr.IRExpression)]);
    //! Generate the loop generation expression
    const loop_gen_prototype = pick_random_element(all_expression_generators)!;
    const lid = global_id++;
    type_dag.insert(type_dag.newNode(lid), all_types);
    const loop_gen = new loop_gen_prototype(lid);
    loop_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(loop_gen.irnode as expr.IRExpression)]);
    //! Generate the body statement
    const stmt_cnt = random_int(config.for_body_stmt_cnt_lower_limit, config.for_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      body.push(body_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
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

class WhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating WhileStatement`));
      indent += 2;
    }
    //! Generate condition expression
    const cond_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
    const cid = global_id++;
    type_dag.insert(type_dag.newNode(cid), type.bool_types);
    const cond_gen = new cond_gen_prototype(cid);
    cur_scope = cur_scope.new(scopeKind.WHILE);
    cond_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(cond_gen.irnode as expr.IRExpression)]);
    //! Generate body statement
    const stmt_cnt = random_int(config.while_body_stmt_cnt_lower_limit, config.while_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
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

class DoWhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement`));
      indent += 2;
    }
    //! Generate condition expression
    const cond_gen_prototype = pick_random_element(nonnew_all_expression_generators)!;
    const cid = global_id++;
    type_dag.insert(type_dag.newNode(cid), type.bool_types);
    const cond_gen = new cond_gen_prototype(cid);
    cur_scope = cur_scope.new(scopeKind.DOWHILE_COND);
    cond_gen.generate(0);
    cur_scope = cur_scope.rollback();
    this.exprs = this.exprs.concat([expr.tuple_extraction(cond_gen.irnode as expr.IRExpression)]);
    //! Generate body statement
    cur_scope = cur_scope.new(scopeKind.DOWHILE_BODY);
    const stmt_cnt = random_int(config.do_while_body_stmt_cnt_lower_limit, config.do_while_body_stmt_cnt_upper_limit);
    const body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
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