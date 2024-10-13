import { assert, pick_random_element, random_int, merge_set, intersection, cartesian_product } from "./utility";
import { IRGhost, IRNode, IRSourceUnit } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { decide_variable_visibility, decl_db, erwin_visibility } from "./db";
import { TypeDominanceDAG, StorageLocationDominanceDAG, VisMutDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { is_super_set, is_equal_set } from "./dominance";
import { ContractKind, DataLocation, FunctionCallKind, FunctionKind, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { ScopeList, scopeKind, initScope } from "./scope";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { FuncVis, FuncVisProvider } from "./visibility";
import { StorageLocationProvider } from "./memory";
import { all_func_vismut, all_var_vismut, FuncVisMut, nonpayable_func_vismut, open_func_vismut, VisMut, VisMutKindProvider, VisMutProvider } from "./vismut";
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables
const global_id_start = 1;
export let global_id = global_id_start;
let cur_scope : ScopeList = initScope();
let indent = 0;
let no_state_variable_in_function_body = false;
let allow_empty_return = false;
// A signal to indicate whether there is an external function call in the current function body.
let external_call = false;
let cur_contract_id = 0;
let cur_contract_name = '';
let cur_struct_id = 0;
let virtual_env = false;
let override_env = false;
let name_id = 0;
let all_types : type.Type[] = [];
// A map from scope id to the set of unexpected extra statements.
let unexpected_extra_stmt : Map<number, stmt.IRStatement[]> = new Map<number, stmt.IRStatement[]>();
const ghost_function_decl_calls = new Set<number>();
const contract_types : Map<number, type.ContractType> = new Map<number, type.ContractType>();
const internal_struct_types = new Set<type.StructType>();
let user_defined_types : type.UserDefinedType[] = [];
// Record which variables are read and written in each expression.
const expr2read_variables : Map<number, Set<number>> = new Map<number, Set<number>>();
const expr2write_variables : Map<number, Set<number>> = new Map<number, Set<number>>();
// Record which contract the function belongs to.
const function_name_to_contract_id : Map<string, Set<number>> = new Map<string, Set<number>>();
// Record which contract the state variable or the in-contract struct belongs to.
const contract_member_variable_name_to_contract_ids : Map<string, Set<number>> = new Map<string, Set<number>>();
const struct_member_variable_name_to_struct_ids : Map<string, Set<number>> = new Map<string, Set<number>>();
enum IDENTIFIER {
  FREE_VAR,
  FREE_FUNC,
  FREE_STRUCT,
  CONTRACT,
  STATE_VAR,
  CONTRACT_FUNC,
  CONTRACT_STRUCT,
  VAR,
  STRUCT_MEMBER_VAR,
  CONTRACT_INSTANCE,
  STRUCT_INSTANCE
};
// Record statements in each scope.
export const type_dag = new TypeDominanceDAG();
export const vismut_dag = new VisMutDominanceDAG();
export const storage_location_dag = new StorageLocationDominanceDAG();
/*
In generating names, Erwin allows resuing names.
To avoid redifnition, only the following rules are applied:
  1. Reuse nonfree struct members' names outside the same struct
  2. Reuse contract members' (including state variables, functions, and structs) names 
      outside the same contract and the derived contracts
*/
//TODO: support name shallowing.
function generate_name(identifier : IDENTIFIER) : string {
  let __name__ : string;
  let __names__ : string[];
  let reuse_contract_member_name = (name_to_contract_id : Map<string, Set<number>>) : string[] => {
    return Array.from(name_to_contract_id.keys())
      .filter(
        (name) =>
          new Set<number>([...name_to_contract_id.get(name)!].flatMap(
            (id) => !contract_types.has(id) ? [id] : contract_types.get(id)!.subs().map((t) => (t as type.ContractType).referece_id)
          )).has(cur_contract_id) === false
      );
  };
  let post_update = (name_to_contract_id : Map<string, Set<number>>, name : string, id : number) : void => {
    if (name_to_contract_id.has(name)) {
      name_to_contract_id.get(name)!.add(id);
    }
    else {
      name_to_contract_id.set(name, new Set<number>([id]));
    }
  }
  switch (identifier) {
    case IDENTIFIER.FREE_VAR:
      return `var${name_id++}`;
    case IDENTIFIER.FREE_FUNC:
      return `func${name_id++}`;
    case IDENTIFIER.FREE_STRUCT:
      return `struct${name_id++}`;
    case IDENTIFIER.CONTRACT:
      return `contract${name_id++}`;
    case IDENTIFIER.STATE_VAR:
      // May reuse state variable names in the other contracts that are not parent contracts of the current contract
      __names__ = reuse_contract_member_name(contract_member_variable_name_to_contract_ids);
      if (Math.random() < config.reuse_name_prob && __names__.length > 0) {
        return pick_random_element(__names__)!;
      }
      __name__ = `var${name_id++}`;
      post_update(contract_member_variable_name_to_contract_ids, __name__, cur_contract_id);
      return __name__;
    case IDENTIFIER.CONTRACT_FUNC:
      // May reuse function names in the other contracts that are not parent contracts of the current contract
      __names__ = reuse_contract_member_name(function_name_to_contract_id);
      if (Math.random() < config.reuse_name_prob && __names__.length > 0) {
        return pick_random_element(__names__)!;
      }
      __name__ = `func${name_id++}`;
      post_update(function_name_to_contract_id, __name__, cur_contract_id);
      return __name__;
    case IDENTIFIER.CONTRACT_STRUCT:
      // May reuse struct names in the other contracts that are not parent contracts of the current contract
      __names__ = reuse_contract_member_name(contract_member_variable_name_to_contract_ids);
      if (Math.random() < config.reuse_name_prob && __names__.length > 0) {
        return pick_random_element(__names__)!;
      }
      __name__ = `struct${name_id++}`;
      post_update(contract_member_variable_name_to_contract_ids, __name__, cur_contract_id);
      return __name__;
    case IDENTIFIER.VAR:
      return `var${name_id++}`;
    case IDENTIFIER.CONTRACT_INSTANCE:
      return `instance${name_id++}`;
    case IDENTIFIER.STRUCT_INSTANCE:
      return `struct_instance${name_id++}`;
    case IDENTIFIER.STRUCT_MEMBER_VAR:
      __names__ = Array.from(struct_member_variable_name_to_struct_ids.keys())
        .filter((name) => struct_member_variable_name_to_struct_ids.get(name)!.has(cur_struct_id) === false);
      if (Math.random() < config.reuse_name_prob && __names__.length > 0) {
        return pick_random_element(__names__)!;
      }
      __name__ = `struct_member${name_id++}`;
      post_update(struct_member_variable_name_to_struct_ids, __name__, cur_struct_id);
      return __name__;
    default:
      throw new Error(`generate_name: identifier ${identifier} is not supported`);
  }
}

function get_exprgenerator(type_range : type.Type[], nofunccall : boolean = true, cur_expression_complex_level : number = 0) : any {
  let arg_gen_prototype;
  let generator_candidates = new Set<any>();
  const contain_user_defined_types = type_range.some(t => t instanceof type.UserDefinedType);
  if (contain_user_defined_types) {
    if (type_range.some(t => t.typeName === "ContractType")) {
      generator_candidates.add(NewContractGenerator);
      if (cur_expression_complex_level < config.expression_complex_level) {
        generator_candidates.add(AssignmentGenerator);
        generator_candidates.add(FunctionCallGenerator);
        generator_candidates.add(ConditionalGenerator);
      }
    }
    if (type_range.some(t => t.typeName === "StructType")) {
      generator_candidates.add(NewStructGenerator);
      if (cur_expression_complex_level < config.expression_complex_level) {
        generator_candidates.add(AssignmentGenerator);
        generator_candidates.add(FunctionCallGenerator);
        generator_candidates.add(ConditionalGenerator);
      }
    }
  }
  const contain_element_types = type_range.some(t => t.typeName === "ElementaryType");
  if (contain_element_types) {
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      generator_candidates = merge_set(generator_candidates, new Set<any>([...terminal_expression_generators]));
    }
    else {
      if (is_equal_set(type_range, type.address_types)) {
        generator_candidates = merge_set(generator_candidates, new Set<any>([...nonterminal_expression_generators_for_address_type]));
      }
      else {
        generator_candidates = merge_set(generator_candidates, new Set<any>([...nonterminal_expression_generators]));
      }
    }
  }
  if (nofunccall) {
    generator_candidates.delete(FunctionCallGenerator);
  }
  const generator_candidates_array = Array.from(generator_candidates);
  assert(generator_candidates_array.length > 0, `get_exprgenerator: generator_candidates is empty, type_range is ${type_range.map(t => t.str())}`);
  arg_gen_prototype = pick_random_element(generator_candidates_array)!;
  return arg_gen_prototype;
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

function unexpected_extra_stmt_belong_to_the_parent_scope() : boolean {
  return cur_scope.kind() === scopeKind.FOR_CONDITION ||
    cur_scope.kind() === scopeKind.WHILE_CONDITION ||
    cur_scope.kind() === scopeKind.DOWHILE_COND ||
    cur_scope.kind() === scopeKind.IF_CONDITION;
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SourceUnit, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const children : IRNode[] = [];
    for (let i = 0; i < config.contract_count; i++) {
      const contract_gen = new ContractDeclarationGenerator();
      contract_gen.generate();
      const all_types_set = new Set([...all_types]);
      const user_defined_types_set = new Set([...user_defined_types]);
      for (const internal_struct_type of internal_struct_types) {
        all_types_set.delete(internal_struct_type);
        user_defined_types_set.delete(internal_struct_type);
      }
      all_types = [...all_types_set];
      user_defined_types = [...user_defined_types_set];
      internal_struct_types.clear();
      children.push(contract_gen.irnode!);
    }
    this.irnode = new IRSourceUnit(global_id++, -1, children);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}SourceUnit, scope: ${cur_scope.kind()}`));
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

class StructInstanceDeclarationGenerator extends DeclarationGenerator {
  struct_id ? : number;
  no_initializer : boolean;
  type_range : type.Type[];
  constructor(type_range : type.Type[], no_initializer : boolean = true, struct_id ?: number) {
    super();
    this.struct_id = struct_id;
    this.no_initializer = no_initializer;
    this.type_range = type_range;
  }
  generate() : void {
    assert(this.type_range.some((t) => t.typeName === 'StructType'),
      `StructInstanceDeclarationGenerator: type_range should contain struct types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName === 'StructType');
    if (this.struct_id === undefined) {
      this.struct_id = pick_random_element(this.type_range.map(t => (t as type.StructType).referece_id))!;
    }
    assert(irnodes.has(this.struct_id), `StructInstanceDeclarationGenerator: struct_id ${this.struct_id} is not in irnodes`);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Struct Instance Declaration, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const struct_instance_name = generate_name(IDENTIFIER.STRUCT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(), struct_instance_name);
    type_dag.insert(this.irnode.id, this.type_range);
    let initializer : expr.IRExpression | undefined;
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      const nid = global_id++;
      type_dag.insert(nid, type_dag.solution_range.get(this.irnode.id)!);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_struct_gen = new NewStructGenerator(nid);
      new_struct_gen.generate(0);
      initializer = new_struct_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
      decl_db.insert(this.irnode.id, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
      vismut_dag.insert(this.irnode.id, all_var_vismut);
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref()
      ])
    }
    else if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
      ]);
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    else if (cur_scope.kind() === scopeKind.STRUCT) {
      (this.irnode as decl.IRVariableDeclaration).loc = DataLocation.Default;
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.memory_default(),
      ]);
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    else {
      if (initializer !== undefined) {
        storage_location_dag.insert(this.irnode.id, [
          StorageLocationProvider.calldata(),
          StorageLocationProvider.memory(),
          StorageLocationProvider.storage_pointer()
        ]);
      }
      else {
        // If there is no initializer, make the storage location non-calldata, referring to 
        // https://github.com/ethereum/solidity/issues/15483#issuecomment-2396563287
        storage_location_dag.insert(this.irnode.id, [
          StorageLocationProvider.memory(),
          StorageLocationProvider.storage_pointer()
        ]);
      }
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    if (initializer !== undefined) {
      storage_location_dag.connect(expr.tuple_extraction(initializer).id, this.irnode.id, "super_dominance");
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      decl_db.state_variables.add(this.irnode.id);
    }
    else {
      decl_db.vardecls.add(this.irnode.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Struct Instance Declaration, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    }
  }
}

class ContractInstanceDeclarationGenerator extends DeclarationGenerator {
  no_initializer : boolean;
  type_range : type.Type[];
  constructor(type_range : type.Type[], no_initializer : boolean = true) {
    super();
    this.no_initializer = no_initializer;
    this.type_range = type_range;
  }
  generate() : void {
    // assert that all types in the type range are contract types
    assert(this.type_range.some((t) => t.typeName == 'ContractType'),
      `ContractInstanceDeclarationGenerator: type_range should contain contract types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName == 'ContractType');
    assert(this.type_range.length === 1, `ContractInstanceDeclarationGenerator: type_range should contain only one contract type, but is ${this.type_range.map(t => t.str())}`);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Instance Declaration, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const contract_instance_name = generate_name(IDENTIFIER.CONTRACT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(), contract_instance_name);
    type_dag.insert(this.irnode.id, this.type_range);
    let initializer : expr.IRExpression | undefined;
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      const nid = global_id++;
      type_dag.insert(nid, this.type_range);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_contract_gen = new NewContractGenerator(nid);
      new_contract_gen.generate(0);
      initializer = new_contract_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
      decl_db.insert(this.irnode.id, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
      vismut_dag.insert(this.irnode.id, all_var_vismut);
    }
    else {
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      decl_db.state_variables.add(this.irnode.id);
    }
    else {
      decl_db.vardecls.add(this.irnode.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Contract Instance Declaration, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
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
      if (cur_scope.kind() === scopeKind.CONTRACT) {
        this.name = generate_name(IDENTIFIER.STATE_VAR);
        if (contract_member_variable_name_to_contract_ids.has(this.name)) {
          contract_member_variable_name_to_contract_ids.get(this.name)!.add(cur_contract_id);
        }
        else {
          contract_member_variable_name_to_contract_ids.set(this.name, new Set<number>([cur_contract_id]));
        }
      }
      else if (cur_scope.kind() === scopeKind.GLOBAL) {
        this.name = generate_name(IDENTIFIER.FREE_VAR);
      }
      else if (cur_scope.kind() === scopeKind.STRUCT) {
        this.name = generate_name(IDENTIFIER.STRUCT_MEMBER_VAR);
        if (struct_member_variable_name_to_struct_ids.has(this.name)) {
          struct_member_variable_name_to_struct_ids.get(this.name)!.add(cur_struct_id);
        }
        else {
          struct_member_variable_name_to_struct_ids.set(this.name, new Set<number>([cur_struct_id]));
        }
      }
      else {
        this.name = generate_name(IDENTIFIER.VAR);
      }
    }
    this.type_range = this.type_range.filter((t) => t.typeName === 'ElementaryType');
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Elementary Type Variable Decl, name is ${this.name}, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(),
        this.name, undefined);
      (this.irnode as decl.IRVariableDeclaration).state = true;
      decl_db.insert(this.irnode.id, erwin_visibility.INCONTRACT_UNKNOWN, cur_scope.id());
      vismut_dag.insert(this.irnode.id, all_var_vismut);
    }
    else {
      this.irnode = new decl.IRVariableDeclaration(global_id++, cur_scope.id(),
        this.name, undefined, StateVariableVisibility.Default);
      decl_db.insert(this.irnode.id, decide_variable_visibility(cur_scope.kind(), StateVariableVisibility.Default), cur_scope.id());
    }
    type_dag.insert(this.irnode.id, this.type_range);
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      if (Math.random() < config.literal_prob) {
        if (config.debug) {
          console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal, scope: ${cur_scope.kind()}`));
          indent += 2;
        }
        const literal_id = global_id++;
        type_dag.insert(literal_id, type_dag.solution_range.get(this.irnode!.id)!);
        const literal_gen = new LiteralGenerator(literal_id);
        const ghost_id = global_id++;
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_dag.solution_range.get(this.irnode!.id)!);
        type_dag.connect(ghost_id, this.irnode!.id, "super_dominance");
        type_dag.connect(ghost_id, literal_id);
        literal_gen.generate(0);
        (this.irnode as decl.IRVariableDeclaration).value = literal_gen.irnode! as expr.IRExpression;
        if (config.debug) {
          indent -= 2;
          console.log(color.yellowBG(`${" ".repeat(indent)}Literal, scope: ${cur_scope.kind()}`));
        }
      }
      else {
        const expr_gen_prototype = pick_random_element(all_expression_generators)!;
        const expr_id = global_id++;
        type_dag.insert(expr_id, type_dag.solution_range.get(this.irnode!.id)!);
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        const extracted_expr = expr.tuple_extraction(expr_gen.irnode! as expr.IRExpression);
        if (extracted_expr!.typeName === "IRLiteral") {
          const ghost_id = global_id++;
          new IRGhost(ghost_id, cur_scope.id());
          type_dag.insert(ghost_id, type_dag.solution_range.get(expr_id)!);
          type_dag.connect(ghost_id, this.irnode!.id, "super_dominance");
          type_dag.connect(ghost_id, expr_id);
        }
        else {
          type_dag.connect(expr_id, this.irnode!.id, "super_dominance");
          type_dag.solution_range_alignment(expr_id, this.irnode!.id);
        }
        (this.irnode as decl.IRVariableDeclaration).value = expr_gen.irnode! as expr.IRExpression;
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
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Elementary Type Variable Decl, name: ${this.name}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Variable Declaration, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const contain_element_types = this.type_range.some((t) => t.typeName === 'ElementaryType');
    const contain_contract_types = this.type_range.some((t) => t.typeName === 'ContractType');
    const contain_struct_types = this.type_range.some((t) => t.typeName === 'StructType');
    assert(contain_element_types || contain_contract_types || contain_struct_types, `VariableDeclarationGenerator: type_range ${this.type_range.map(t => t.str())} should contain at least one elementary type or contract type`);
    let prob_sum = 0;
    let contract_type_prob = contain_contract_types ? config.contract_instance_prob : 0;
    prob_sum += contract_type_prob;
    let struct_type_prob = contain_struct_types ? config.struct_instance_prob : 0;
    prob_sum += struct_type_prob;
    let elementary_type_prob = contain_element_types ? 1 - struct_type_prob - contract_type_prob : 0;
    prob_sum += elementary_type_prob;
    contract_type_prob /= prob_sum;
    struct_type_prob /= prob_sum;
    elementary_type_prob /= prob_sum;
    if (contain_contract_types && Math.random() < contract_type_prob) {
      const contract_instance_gen = new ContractInstanceDeclarationGenerator(this.type_range, this.no_initializer);
      contract_instance_gen.generate();
      this.irnode = contract_instance_gen.irnode;
    }
    else if (contain_struct_types && Math.random() < contract_type_prob + struct_type_prob) {
      const struct_instance_gen = new StructInstanceDeclarationGenerator(this.type_range, this.no_initializer);
      struct_instance_gen.generate();
      this.irnode = struct_instance_gen.irnode;
    }
    else {
      // Generate elementary type variable declaration
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range, this.no_initializer);
      variable_gen.generate();
      this.irnode = variable_gen.irnode;
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Variable Declaration, scope: ${cur_scope.kind()}`));
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
        const expr_gen_prototype = get_exprgenerator(type_dag.solution_range.get(vardecl.id)!);
        const expr_id = global_id++;
        type_dag.insert(expr_id, type_dag.solution_range.get(vardecl.id)!);
        type_dag.connect(expr_id, vardecl.id, "super_dominance");
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        type_dag.solution_range_alignment(expr_id, vardecl.id);
        const expression = expr_gen.irnode! as expr.IRExpression;
        const assignment = new expr.IRAssignment(global_id++, cur_scope.id(), identifier, expression, "=");
        const assignment_stmt = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment);
        body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
        unexpected_extra_stmt.delete(cur_scope.id());
        body.push(assignment_stmt);
      }
      else {
        const stmt_gen_prototype = pick_random_element(statement_generators)!;
        const stmt_gen = new stmt_gen_prototype();
        stmt_gen.generate(0);
        body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
        unexpected_extra_stmt.delete(cur_scope.id());
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Declaration: ${this.fid}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //TODO: support modifiers
    const modifiers : decl.Modifier[] = [];
    //! Generate parameters
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.FUNC_PARAMETER);
    for (let i = 0; i < this.parameter_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(all_types);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    cur_scope = cur_scope.rollback();
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
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Constructor Declaration, scope: ${cur_scope.kind()}`));
    }
  }
}
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
    cur_struct_id = thisid;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Struct Definition: ${thisid}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    decl_db.insert(thisid, this.erwin_vis, cur_scope.id());
    //! Generate struct name
    let struct_name;
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      struct_name = generate_name(IDENTIFIER.CONTRACT_STRUCT);
      if (contract_member_variable_name_to_contract_ids.has(struct_name)) {
        contract_member_variable_name_to_contract_ids.get(struct_name)!.add(cur_contract_id);
      }
      else {
        contract_member_variable_name_to_contract_ids.set(struct_name, new Set<number>([cur_contract_id]));
      }
    }
    else if (cur_scope.kind() === scopeKind.GLOBAL) {
      struct_name = generate_name(IDENTIFIER.FREE_STRUCT);
    }
    else {
      throw new Error(`StructGenerator: scope kind should be CONTRACT or GLOBAL, but is ${cur_scope.kind()}`);
    }
    cur_scope = cur_scope.new(scopeKind.STRUCT);
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
    //! Add this struct type
    all_types = [...all_types];
    const struct_type = new type.StructType(thisid, struct_name, `struct ${cur_contract_name}.${struct_name}`);
    all_types.push(struct_type);
    user_defined_types.push(struct_type);
    if (cur_contract_id !== 0) {
      internal_struct_types.add(struct_type);
      const external_struct_name = cur_contract_name + "." + struct_name;
      const external_struct_type = new type.StructType(thisid, external_struct_name, `struct ${cur_contract_name}.${struct_name}`);
      all_types.push(external_struct_type);
      user_defined_types.push(external_struct_type);
    }
    decl_db.structdecls.add(thisid);
    cur_struct_id = 0;
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Struct Definition, scope: ${cur_scope.kind()}`));
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

  get_visibility_range() : FuncVis[] {
    const visibility_range = [
      FuncVisProvider.external(),
      FuncVisProvider.public(),
    ];
    if (!external_call) {
      visibility_range.push(FuncVisProvider.internal());
      visibility_range.push(FuncVisProvider.private());
    }
    return visibility_range;
  }

  get_state_mutability_range(read_state_variables : boolean, write_state_variables : boolean) : FuncStat[] {
    let state_mutability_range : FuncStat[] = [];
    if (write_state_variables) {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
      ]
    }
    else if (read_state_variables) {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
        FuncStatProvider.view(),
      ]
    }
    else if (external_call) {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
        FuncStatProvider.view(),
      ]
    }
    else {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
        FuncStatProvider.view(),
        FuncStatProvider.pure(),
      ]
    }
    return state_mutability_range;
  }

  get_vismut_range(read_state_variables : boolean, write_state_variables : boolean) : VisMut[] {
    const state_mutability_range = this.get_state_mutability_range(read_state_variables, write_state_variables);
    const visibility_range = this.get_visibility_range();
    return cartesian_product([visibility_range, state_mutability_range])
      .filter(([vis, stat]) => !(vis === FuncVisProvider.internal() && stat === FuncStatProvider.payable())
        && !(vis === FuncVisProvider.private() && stat === FuncStatProvider.payable()))
      .map(([vis, stat]) =>
        VisMutProvider.from_kind(
          VisMutKindProvider.combine_vis_mut(vis, stat)));
  }

  build_connection_between_caller_and_callee(thisid : number) : void {
    /*
      Follow the rule of DominanceDAG that if A dominates B, then the solution range of B
      is a superset of the solution range of A.
    */
    for (const called_function_decl_ID of decl_db.called_function_decls_IDs) {
      if (decl_db.ghost_funcdecls.has(called_function_decl_ID)) continue;
      if (called_function_decl_ID === thisid) continue;
      const ghost_id = global_id++;
      new IRGhost(ghost_id, cur_scope.id());
      vismut_dag.insert(ghost_id, vismut_dag.solution_range.get(thisid)!);
      vismut_dag.connect(ghost_id, thisid, "super_dominance");
      vismut_dag.connect(ghost_id, called_function_decl_ID);
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
    // read_vardecls is a set that records the vardecls read by the body.
    const read_vardecls : Set<number> = new Set<number>();
    // write_vardecls is a set that records the vardecls written by the body.
    const write_vardecls : Set<number> = new Set<number>();
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
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(stmt_gen.irnode! as stmt.IRStatement);
      // update read_vardecls
      if (stmt_gen instanceof ExpressionStatementGenerator) {
        if (ghost_function_decl_calls.has(stmt_gen.expr!.id)) continue;
        for (const used_vardecl of expr2read_variables.get(stmt_gen.expr!.id)!) {
          read_vardecls.add(used_vardecl);
        }
        if (expr2write_variables.has(stmt_gen.expr!.id)) {
          for (const written_vardecl of expr2write_variables.get(stmt_gen.expr!.id)!) {
            write_vardecls.add(written_vardecl);
          }
        }
      }
      else if (stmt_gen instanceof NonExpressionStatementGenerator) {
        for (const expr of stmt_gen.exprs) {
          if (ghost_function_decl_calls.has(expr.id)) continue;
          for (const used_vardecl of expr2read_variables.get(expr.id)!) {
            read_vardecls.add(used_vardecl);
          }
          if (expr2write_variables.has(expr.id)) {
            for (const written_vardecl of expr2write_variables.get(expr.id)!) {
              write_vardecls.add(written_vardecl);
            }
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
        type_dag.insert(expr_id, type_range);
        let expr_gen_prototype = get_exprgenerator(type_range);
        let ghost_id;
        if (expr_gen_prototype.name === "LiteralGenerator") {
          ghost_id = global_id++;
          new IRGhost(ghost_id, cur_scope.id());
          type_dag.insert(ghost_id, type_range);
          type_dag.connect(ghost_id, expr_id);
          type_dag.connect(ghost_id, this.return_decls[i].id, "super_dominance");
        }
        else {
          type_dag.connect(expr_id, this.return_decls[i].id, "super_dominance");
        }
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        return_values.push(expr_gen.irnode! as expr.IRExpression);
        let expression_extracted = expr.tuple_extraction(return_values[i]);
        if (ghost_id === undefined) {
          type_dag.solution_range_alignment(expr_id, this.return_decls[i].id);
        }
        else {
          type_dag.solution_range_alignment(ghost_id, expr_id);
        }
        // update read_vardecls
        for (const used_vardecl of expr2read_variables.get(expression_extracted.id)!) {
          read_vardecls.add(used_vardecl);
        }
        body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
        unexpected_extra_stmt.delete(cur_scope.id());
        if (storage_location_dag.solution_range.has(this.return_decls[i].id)) {
          assert(storage_location_dag.solution_range.has(expression_extracted.id),
            `storage_location_dag.solution_range should have ${expression_extracted.id}`);
          storage_location_dag.connect(expression_extracted.id, this.return_decls[i].id, "super_dominance");
        }
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
    // Check whether function body read from/write into any state variables and records the result into `use_state_variables`
    let read_state_variables = false;
    let write_state_variables = false;
    for (const read_vardecl of read_vardecls) {
      if (decl_db.state_variables.has(read_vardecl)) {
        assert(!no_state_variable_in_function_body,
          `no_state_variable_in_function_body should be false: irnode (ID: ${read_vardecl}, typeName: ${irnodes.get(read_vardecl)!.typeName}) is used in the function body`);
        read_state_variables = true;
        break;
      }
    }
    for (const write_vardecl of write_vardecls) {
      if (decl_db.state_variables.has(write_vardecl)) {
        assert(!no_state_variable_in_function_body,
          `no_state_variable_in_function_body should be false: irnode (ID: ${write_vardecl}, typeName: ${irnodes.get(write_vardecl)!.typeName}) is written in the function body`);
        write_state_variables = true;
        break;
      }
    }
    const vismut_range = this.get_vismut_range(read_state_variables, write_state_variables);
    vismut_dag.update(this.fid, vismut_range);
    this.build_connection_between_caller_and_callee(this.irnode!.id);
    (this.irnode as decl.IRFunctionDefinition).body = body;
    this.clear_no_state_variable_signal();
    if (!this.has_body) cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Body for ${this.fid}. vismut range is ${vismut_dag.solution_range.get(this.irnode!.id)!.map(f => f.str())}`));
    }
  }

  generate() : void {
    vismut_dag.insert(this.fid, all_func_vismut);
    const modifiers : decl.Modifier[] = [];
    //TODO: fill the modifiers
    let name;
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      name = generate_name(IDENTIFIER.CONTRACT_FUNC);
      if (function_name_to_contract_id.has(name)) {
        function_name_to_contract_id.get(name)!.add(cur_contract_id);
      }
      else {
        function_name_to_contract_id.set(name, new Set<number>([cur_contract_id]));
      }
    }
    else if (cur_scope.kind() === scopeKind.GLOBAL) {
      name = generate_name(IDENTIFIER.FREE_FUNC);
    }
    else {
      throw new Error(`FunctionDeclarationGenerator: cur_scope.kind() should be CONTRACT or GLOBAL, but is ${cur_scope.kind()}`);
    }
    const virtual = virtual_env;
    const overide = override_env;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Definition ${this.fid} ${name}, scope: ${cur_scope.kind()}`));
      indent += 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    cur_scope = this.function_scope.snapshot();
    cur_scope = cur_scope.new(scopeKind.FUNC_PARAMETER);
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
    cur_scope = cur_scope.rollback();
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
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.fid}: Function ${name}, vismut range is ${vismut_dag.solution_range.get(this.fid)!.map(f => f.str())}, scope: ${cur_scope.kind()}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Definition: ${thisid}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    assert(cur_scope.kind() === scopeKind.GLOBAL,
      `Contracts' scope must be global, but is ${cur_scope.kind()}`);
    decl_db.insert(thisid, erwin_visibility.NAV, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONTRACT);
    //! Generate contract name
    const contract_name = generate_name(IDENTIFIER.CONTRACT);
    cur_contract_name = contract_name;
    const body : IRNode[] = [];
    //! Generate Struct
    if (Math.random() < config.struct_prob) {
      const struct_gen = new StructGenerator(erwin_visibility.INCONTRACT_PRIVATE);
      struct_gen.generate();
      body.push(struct_gen.irnode!);
    }
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
      variable_decl.state = true;
      local_state_variables.push(variable_decl);
      if (unexpected_extra_stmt.has(cur_scope.id())) {
        for (const stmt of unexpected_extra_stmt.get(cur_scope.id())!) {
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
      }
      unexpected_extra_stmt.delete(cur_scope.id());
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
      decl_db.ghost_funcdecls.add(fid);
      vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, [], [variable_decl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
      if (config.debug) {
        indent -= 2;
        console.log(color.yellowBG(`${" ".repeat(indent)}${fid}: Getter function for state variable ${variable_decl.name}`));
      }
    }
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
    cur_contract_id = 0;
    cur_contract_name = '';
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Contract, scope: ${cur_scope.kind()}`));
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
    this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.elementary_types))];
    assert(this.type_range.length > 0, `LiteralGenerator: type_range ${this.type_range.map(t => t.str())} is invalid`);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
    }
    type_dag.update(this.id, this.type_range);
    this.irnode = new expr.IRLiteral(this.id, cur_scope.id());
    expr2read_variables.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

class IdentifierGenerator extends LRValueGenerator {
  left : boolean;
  variable_decl : decl.IRVariableDeclaration | undefined;
  constructor(id : number, left : boolean = false) {
    super(id);
    this.left = left;
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    let generate_var_decl = () => {
      let roll_back = false;
      let snapshot_scope = cur_scope.snapshot();
      if (unexpected_extra_stmt_belong_to_the_parent_scope()) {
        roll_back = true;
        cur_scope = cur_scope.rollback();
      }
      const variable_decl_gen = new VariableDeclarationGenerator(this.type_range, false);
      variable_decl_gen.generate();
      this.variable_decl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
      const variable_decl_stmt = new stmt.IRVariableDeclareStatement(
        global_id++, cur_scope.id(), [variable_decl_gen.irnode! as decl.IRVariableDeclaration],
        this.variable_decl.value!
      );
      this.variable_decl.value = undefined;
      if (unexpected_extra_stmt.has(cur_scope.id())) {
        unexpected_extra_stmt.get(cur_scope.id())!.push(variable_decl_stmt);
      }
      else {
        unexpected_extra_stmt.set(cur_scope.id(), [variable_decl_stmt]);
      }
      if (roll_back) {
        cur_scope = snapshot_scope.snapshot();
      }
    }
    expr2read_variables.set(this.id, new Set<number>());
    // Generate a variable decl if there is no variable decl available.
    if (!has_available_IRVariableDeclaration_with_type_constraint(this.type_range) ||
      Math.random() < config.vardecl_prob) {
      const contain_element_types = this.type_range.some(t => t.typeName === "ElementaryType");
      if (contain_element_types) {
        generate_var_decl();
      }
      else {
        let contain_contract_types = this.type_range.some(t => t.typeName === "ContractType");
        let contain_struct_types = this.type_range.some(t => t.typeName === "StructType");
        assert(contain_contract_types || contain_struct_types,
          `IdentifierGenerator: type_range ${this.type_range.map(t => t.str())} is invalid: neither contract nor struct type`);
        if (contain_contract_types && contain_struct_types) {
          contain_contract_types = Math.random() < 0.5;
          contain_struct_types = !contain_contract_types;
        }
        if (contain_contract_types) {
          this.type_range = this.type_range.filter(t => t.typeName === "ContractType");
        }
        else {
          this.type_range = this.type_range.filter(t => t.typeName === "StructType");
        }
        type_dag.update(this.id, this.type_range);
        assert(this.type_range.length > 0, `IdentifierGenerator: type_range is empty`);
        if (contain_contract_types) {
          if (!this.left && Math.random() < config.in_place_vardecl_prob) {
            // Generate a new expr for the contract type
            const new_contract_gen = new NewContractGenerator(this.id);
            new_contract_gen.generate(cur_expression_complex_level + 1);
            const contract_instance_expr = new_contract_gen.irnode as expr.IRExpression;
            const extracted_contract_instance_expr = expr.tuple_extraction(contract_instance_expr);
            expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(extracted_contract_instance_expr.id)!));
            this.irnode = contract_instance_expr;
          }
          else {
            generate_var_decl();
          }
        }
        else if (contain_struct_types) {
          if (!this.left && Math.random() < config.in_place_vardecl_prob) {
            // Generate an instance of the struct type
            const new_struct_gen = new NewStructGenerator(this.id);
            new_struct_gen.generate(cur_expression_complex_level + 1);
            const struct_instance_expr = new_struct_gen.irnode as expr.IRExpression;
            const extracted_struct_instance_expr = expr.tuple_extraction(struct_instance_expr);
            expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(extracted_struct_instance_expr.id)!));
            this.irnode = struct_instance_expr;
          }
          else {
            generate_var_decl();
          }
        }
      }
    }
    else {
      const available_irdecl = get_available_IRVariableDeclarations_with_type_constraint(this.type_range);
      assert(available_irdecl !== undefined, "IdentifierGenerator: available_irdecl is undefined");
      assert(available_irdecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      this.variable_decl = pick_random_element(available_irdecl)!;
    }
    if (this.variable_decl !== undefined) {
      assert(this.irnode === undefined, "IdentifierGenerator: this.irnode is not undefined");
      this.irnode = new expr.IRIdentifier(this.id, cur_scope.id(), this.variable_decl.name, this.variable_decl.id);
      type_dag.connect(this.id, this.variable_decl.id);
      type_dag.solution_range_alignment(this.id, this.variable_decl.id);
      expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, new Set<number>([this.variable_decl.id])));
      if (storage_location_dag.solution_range.has(this.variable_decl.id)) {
        if ((this.left && cur_expression_complex_level === 1) || cur_expression_complex_level === 0) {
          storage_location_dag.insert(this.id,
            storage_location_dag.solution_range.get(this.variable_decl.id)!
          );
        }
        else {
          storage_location_dag.insert(this.id,
            storage_location_dag.solution_range.get(this.variable_decl.id)!
              .map(s => s === StorageLocationProvider.storage_ref() ? StorageLocationProvider.storage_pointer() : s)
          );
        }
      }
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Identifier ${this.variable_decl === undefined ? '' : `--> ${this.variable_decl.id}`}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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

  this_dominate_right() : boolean {
    return this.op !== ">>=" && this.op !== "<<=";
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
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
    type_dag.update(this.id, this.type_range);
    const leftid = global_id++;
    const rightid = global_id++;
    if (this.this_dominate_right()) {
      type_dag.insert(rightid, this.type_range);
    }
    else {
      type_dag.insert(rightid, type.uinteger_types);
    }
    type_dag.insert(leftid, type_dag.solution_range.get(this.id)!);
    if (this.this_dominate_right()) {
      type_dag.connect(this.id, rightid, "sub_dominance");
    }
    type_dag.connect(this.id, leftid);
    //! Generate the right-hand-side expression
    let right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range.get(rightid)!, false, cur_expression_complex_level);
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    //! Generate the left-hand-side identifier
    if (this.this_dominate_right()) {
      type_dag.solution_range_alignment(this.id, rightid);
    }
    const identifier_gen = new IdentifierGenerator(leftid, true);
    identifier_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, leftid);
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    assert(identifier_gen.variable_decl !== undefined, "AssignmentGenerator: identifier_gen.vardecl is undefined");
    if (storage_location_dag.solution_range.has(identifier_gen.variable_decl.id)) {
      assert(this.op === "=", `AssignmentGenerator: op is not =, but is ${this.op}`);
      assert(storage_location_dag.solution_range.has(right_extracted_expression.id),
        `AssignmentGenerator: right_extracted_expression.id ${right_extracted_expression.id} is not in storage_location_dag.solution_range`);
      storage_location_dag.insert(this.id,
        storage_location_dag.solution_range.get(identifier_gen.irnode!.id)!
      );
      storage_location_dag.connect(this.id, left_extracted_expression.id);
      storage_location_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
    }
    //! Update expr2read_variables
    expr2read_variables.set(this.id,
      merge_set(
        expr2read_variables.get(left_extracted_expression.id)!,
        expr2read_variables.get(right_extracted_expression.id)!
      )
    );
    expr2write_variables.set(this.id, new Set<number>([left_extracted_expression.id]));
    //! Generate irnode
    this.irnode = new expr.IRAssignment(this.id, cur_scope.id(), left_expression, right_expression, this.op!);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Assignment ${this.op}, scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}, scope: ${cur_scope.kind()}`));
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
    return ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1;
  }

  this_dominate_right() : boolean {
    return ["+", "-", "*", "/", "%", "&", "^", "|"].filter((op) => op === this.op).length === 1;
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
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
    type_dag.update(this.id, this.type_range);
    const leftid = global_id++;
    const rightid = global_id++;
    if (this.this_dominate_right()) {
      type_dag.insert(rightid, this.type_range);
    }
    else if (this.op === ">>" || this.op === "<<") {
      type_dag.insert(rightid, type.uinteger_types);
    }
    else if (this.op === "&&" || this.op === "||") {
      type_dag.insert(rightid, type.bool_types);
    }
    else {
      type_dag.insert(rightid, type.all_integer_types);
    }
    if (this.this_dominates_left()) {
      type_dag.insert(leftid, type_dag.solution_range.get(this.id)!);
    }
    else if (this.op === "&&" || this.op === "||") {
      type_dag.insert(leftid, type.bool_types);
    }
    else {
      type_dag.insert(leftid, type.all_integer_types);
    }
    if (this.this_dominates_left()) {
      type_dag.connect(this.id, leftid, "sub_dominance");
    }
    if (this.this_dominate_right()) {
      type_dag.connect(this.id, rightid, "sub_dominance");
    }
    let ghostid;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      ghostid = global_id++;
      new IRGhost(ghostid, cur_scope.id());
      type_dag.insert(ghostid, type.all_integer_types);
      type_dag.connect(ghostid, leftid, "sub_dominance");
      type_dag.connect(ghostid, rightid, "sub_dominance");
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
        left_expression_gen_prototype = pick_random_element(nonliteral_expression_generators)!;
      }
      else {
        left_expression_gen_prototype = pick_random_element(all_expression_generators)!;
      }
    }
    if (left_expression_gen_prototype.name === "LiteralGenerator") {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = IdentifierGenerator;
      }
      else {
        right_expression_gen_prototype = pick_random_element(nonliteral_expression_generators)!;
      }
    }
    else {
      if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
        right_expression_gen_prototype = pick_random_element(terminal_expression_generators)!;
      }
      else {
        right_expression_gen_prototype = pick_random_element(all_expression_generators)!;
      }
    }
    //! Generate right-hand-side expression
    right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    //! Generate left-hand-side expression
    if (this.this_dominate_right()) {
      type_dag.solution_range_alignment(this.id, rightid);
    }
    else if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    if (this.this_dominates_left()) {
      type_dag.solution_range_alignment(this.id, leftid);
    }
    else if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, leftid);
    }
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    //! Update expr2read_variables
    expr2read_variables.set(this.id,
      merge_set(
        expr2read_variables.get(left_extracted_expression.id)!,
        expr2read_variables.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    type_dag.update(this.id, type.bool_types);
    const leftid = global_id++;
    const rightid = global_id++;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      type_dag.insert(rightid, type.all_integer_types);
    }
    else {
      type_dag.insert(rightid, type.bool_types);
    }
    type_dag.insert(leftid, type_dag.solution_range.get(rightid)!);
    let ghostid;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      ghostid = global_id++;
      new IRGhost(ghostid, cur_scope.id());
      type_dag.insert(ghostid, type.all_integer_types);
      type_dag.connect(ghostid, leftid, "sub_dominance");
      type_dag.connect(ghostid, rightid, "sub_dominance");
    }
    //! Select generators for the left-hand-side and right-hand-side expressions
    let left_expression : expr.IRExpression;
    let right_expression : expr.IRExpression;
    let right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range.get(rightid)!, false, cur_expression_complex_level);
    let left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range.get(rightid)!, false, cur_expression_complex_level);
    //! Generate right-hand-side expression
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    //! Generate left-hand-side expression
    const left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, leftid);
    }
    expr2read_variables.set(this.id,
      merge_set(
        expr2read_variables.get(left_extracted_expression.id)!,
        expr2read_variables.get(right_extracted_expression.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryCompareOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}: ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
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
    type_dag.update(this.id, this.type_range);
    const identifier_id = global_id++;
    type_dag.insert(identifier_id, this.type_range);
    type_dag.connect(this.id, identifier_id);
    //! Generate identifier
    const identifier_gen = new IdentifierGenerator(identifier_id);
    identifier_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, identifier_id);
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    //! Generate irnode
    this.irnode = new expr.IRUnaryOp(this.id, cur_scope.id(), pick_random_element([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tuple_extraction(expression);
    //!. Update expr2read_variables, expr2dominated_vardecls
    expr2read_variables.set(this.id, expr2read_variables.get(extracted_expression.id)!);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: UnaryOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional: ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    type_dag.insert(this.id, this.type_range);
    const e1id = global_id++;
    type_dag.insert(e1id, type.bool_types);
    const e2id = global_id++;
    type_dag.insert(e2id, this.type_range);
    const e3id = global_id++;
    type_dag.insert(e3id, this.type_range);
    type_dag.connect(this.id, e3id, "sub_dominance");
    type_dag.connect(this.id, e2id, "sub_dominance");
    //! Suppose the conditional expression is e1 ? e2 : e3
    //! The first step is to get a generator for e1.
    let e1_gen_prototype = get_exprgenerator(type.bool_types, false, cur_expression_complex_level);
    //! Generate e1
    const e1_gen = new e1_gen_prototype(e1id);
    e1_gen.generate(cur_expression_complex_level + 1);
    let extracted_e1 = expr.tuple_extraction(e1_gen.irnode! as expr.IRExpression);
    expr2read_variables.set(this.id, expr2read_variables.get(extracted_e1.id)!);
    //! Generate e3
    const e3_gen_prototype = get_exprgenerator(this.type_range, false, cur_expression_complex_level);
    const e3_gen = new e3_gen_prototype!(e3id);
    e3_gen.generate(cur_expression_complex_level + 1);
    let extracted_e3 = expr.tuple_extraction(e3_gen.irnode! as expr.IRExpression);
    type_dag.solution_range_alignment(this.id, e3id);
    //! Generate e2
    const e2_gen_prototype = get_exprgenerator(type_dag.solution_range.get(e3id)!, false, cur_expression_complex_level);
    const e2_gen = new e2_gen_prototype(e2id);
    e2_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, e2id);
    let extracted_e2 = expr.tuple_extraction(e2_gen.irnode! as expr.IRExpression);
    expr2read_variables.set(this.id,
      merge_set(
        merge_set(
          expr2read_variables.get(extracted_e1.id)!,
          expr2read_variables.get(extracted_e2.id)!
        ),
        expr2read_variables.get(extracted_e3.id)!
      )
    );
    //! Generate irnode
    this.irnode = new expr.IRConditional(
      this.id, cur_scope.id(), e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    if (storage_location_dag.solution_range.has(extracted_e2.id)) {
      assert(storage_location_dag.solution_range.has(extracted_e3.id),
        `ConditionalGenerator: extracted_e3.id ${extracted_e3!.id} is not in storage_location_dag.solution_range`);
      storage_location_dag.insert(this.id,
        storage_location_dag.solution_range.get(extracted_e2.id)!
      );
      storage_location_dag.connect(this.id, extracted_e2.id);
      storage_location_dag.connect(extracted_e2.id, extracted_e3.id, "sub_dominance");
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Conditional, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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
      const visibility_range = vismut_dag.solution_range.get(funcdecl_id)!.
        filter(v => v instanceof FuncVisMut)
        .map(v => v.kind.visibility);
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
      assert(type_dag.solution_range.has(ret_decl_id), `FunctionCallGenerator: return_is_good: ret_decl_id ${ret_decl_id} is not in type_dag.solution_range`);
      return is_super_set(this.type_range, type_dag.solution_range.get(ret_decl_id)!) ||
        is_super_set(type_dag.solution_range.get(ret_decl_id)!, this.type_range) &&
        type_dag.try_tighten_solution_range_middle_out(ret_decl_id, this.type_range)
    };
    type_dag.insert(this.id, this.type_range);
    //! If cur_expression_complex_level reaches the maximum, generate an terminal expression
    if (cur_expression_complex_level >= config.expression_complex_level || Math.random() < config.terminal_prob) {
      const expression_gen_prototype = get_exprgenerator(this.type_range, true, cur_expression_complex_level);
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
            vismut_dag.solution_range.get(irnode_id)!.includes(VisMutProvider.func_external_empty()) ||
            vismut_dag.solution_range.get(irnode_id)!.includes(VisMutProvider.func_external_payable()) ||
            vismut_dag.solution_range.get(irnode_id)!.includes(VisMutProvider.func_external_pure()) ||
            vismut_dag.solution_range.get(irnode_id)!.includes(VisMutProvider.func_external_view())) &&
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
      let expression_gen_prototype = get_exprgenerator(this.type_range, true, cur_expression_complex_level);
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
    if (decl_db.ghost_funcdecls.has(funcdecl_id)) {
      ghost_function_decl_calls.add(this.id);
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall: ${this.id}: ${this.type_range.map(t => t.str())}, contractdecl_id: ${contractdecl_id} funcdecl_id: ${funcdecl_id}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    if (contractdecl_id === cur_contract_id) {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {

        vismut_dag.solution_range.set(funcdecl_id,
          [...intersection(new Set<VisMut>(nonpayable_func_vismut),
            new Set<VisMut>(vismut_dag.solution_range.get(funcdecl_id)!))]);
      }
    }
    else {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        vismut_dag.solution_range.set(funcdecl_id,
          [...intersection(new Set<VisMut>(open_func_vismut),
            new Set<VisMut>(vismut_dag.solution_range.get(funcdecl_id)!))]);
      }
    }
    decl_db.called_function_decls_IDs.add(funcdecl_id);
    if (decl_db.ghost_funcdecls.has(funcdecl_id)) {
      vismut_dag.update((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).returns[0].id, [
        VisMutProvider.var_public()
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
      type_dag.solution_range_alignment(this.id, selected_ret_decl.id);
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
    expr2read_variables.set(this.id, new Set<number>());
    //! Generate arguments
    for (let i = 0; i < funcdecl.parameters.length; i++) {
      const type_range = type_dag.solution_range.get(funcdecl.parameters[i].id)!;
      let arg_gen_prototype = get_exprgenerator(type_range, false, cur_expression_complex_level);
      const argid = global_id++;
      type_dag.insert(argid, type_range);
      let ghost_id;
      if (arg_gen_prototype.name === "LiteralGenerator") {
        ghost_id = global_id++;
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_range);
        type_dag.connect(ghost_id, argid);
        type_dag.connect(ghost_id, funcdecl.parameters[i].id, "super_dominance");
      }
      else {
        type_dag.connect(argid, funcdecl.parameters[i].id, "super_dominance");
      }
      const arg_gen = new arg_gen_prototype(argid);
      arg_gen.generate(cur_expression_complex_level + 1);
      let extracted_arg = expr.tuple_extraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      if (ghost_id === undefined) {
        type_dag.solution_range_alignment(argid, funcdecl.parameters[i].id);
      }
      else {
        type_dag.solution_range_alignment(ghost_id, argid);
      }
      if (storage_location_dag.solution_range.has(funcdecl.parameters[i].id)) {
        assert(storage_location_dag.solution_range.has(argid),
          `FunctionCallGenerator: storage_location_dag.solution_range has no argid ${argid}`);
        storage_location_dag.connect(argid, funcdecl.parameters[i].id, "super_dominance");
      }
    }
    for (const arg_id of args_ids) {
      expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(arg_id)!));
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}FunctionCall Arguments`));
    }
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1 && selected_ret_decl !== null) {
      //* generate the function call node
      let func_call_node : expr.IRExpression;
      const fid = global_id++;
      type_dag.insert(fid, this.type_range);
      // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
      if (contractdecl_id !== cur_contract_id) {
        external_call = true;
        // "this" (yin)
        if (contractdecl_id < 0) {
          func_call_node = new expr.IRFunctionCall(
            fid,
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
          const type_range = contract_types.get(contractdecl_id)!.subs();
          const idid = global_id++;
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complex_level + 1);
          contract_instance_expr = identifier_gen.irnode as expr.IRExpression;
          func_call_node = new expr.IRFunctionCall(
            fid,
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
        func_call_node = new expr.IRFunctionCall(fid, cur_scope.id(), this.kind!,
          func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
      }
      //* generate an identifier
      const identifier_gen = new IdentifierGenerator(this.id, true);
      identifier_gen.generate(cur_expression_complex_level + 1);
      this.irnode = identifier_gen.irnode;
      const identifier_expr = expr.tuple_extraction(identifier_gen.irnode! as expr.IRExpression);
      assert(identifier_gen.variable_decl !== undefined, `FunctionCallGenerator: identifier_gen.variable_decl is undefined`);
      expr2write_variables.set(this.id, new Set<number>([identifier_gen.variable_decl!.id]));
      expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(identifier_expr.id)!));
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
      if (unexpected_extra_stmt_belong_to_the_parent_scope()) {
        if (unexpected_extra_stmt.has(cur_scope.pre().id())) {
          unexpected_extra_stmt.get(cur_scope.pre().id())!.push(assignment_stmt_node);
        }
        else {
          unexpected_extra_stmt.set(cur_scope.pre().id(), [assignment_stmt_node]);
        }
      }
      else {
        if (unexpected_extra_stmt.has(cur_scope.id())) {
          unexpected_extra_stmt.get(cur_scope.id())!.push(assignment_stmt_node);
        }
        else {
          unexpected_extra_stmt.set(cur_scope.id(), [assignment_stmt_node]);
        }
      }
    }
    else {
      // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
      if (contractdecl_id !== cur_contract_id) {
        external_call = true;
        // "this" (yin)
        if (contractdecl_id < 0) {
          this.irnode = new expr.IRFunctionCall(
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
          const type_range = contract_types.get(contractdecl_id)!.subs();
          const idid = global_id++;
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complex_level + 1);
          contract_instance_expr = identifier_gen.irnode as expr.IRExpression;
          this.irnode = new expr.IRFunctionCall(
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
        this.irnode = new expr.IRFunctionCall(this.id, cur_scope.id(), this.kind!,
          func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
      }
    }
    if (selected_ret_decl !== null) {
      type_dag.solution_range_alignment(this.id, selected_ret_decl!.id);
      if (storage_location_dag.solution_range.has(selected_ret_decl.id)) {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range.get(selected_ret_decl.id)!
        );
        storage_location_dag.connect(this.id, selected_ret_decl.id);
      }
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: FunctionCall, id: ${this.id} scope: ${cur_scope.id()}, type: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}, scope: ${cur_scope.kind()}`));
    }
  }
}

class NewStructGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }
  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewStructGenerator ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    assert(decl_db.structdecls.size > 0, "No struct is declared");
    this.type_range = this.type_range.filter(t => t.typeName === "StructType");
    type_dag.update(this.id, this.type_range);
    assert(this.type_range.length > 0, "NewStructGenerator: type_range is empty");
    const struct_type = pick_random_element(this.type_range)! as type.StructType;
    const struct_decl = irnodes.get(struct_type.referece_id) as decl.IRStructDefinition;
    //! Generate arguments for the constructor
    const args_ids : number[] = [];
    const args : expr.IRExpression[] = [];
    expr2read_variables.set(this.id, new Set<number>());
    for (const member of struct_decl.members) {
      const type_range = type_dag.solution_range.get(member.id)!;
      let arg_gen_prototype = get_exprgenerator(type_range, false, cur_expression_complex_level);
      const argid = global_id++;
      type_dag.insert(argid, type_dag.solution_range.get(member.id)!);
      let ghost_id;
      if (arg_gen_prototype.name === "LiteralGenerator") {
        ghost_id = global_id++;
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_dag.solution_range.get(member.id)!);
        type_dag.connect(ghost_id, argid);
        type_dag.connect(ghost_id, member.id, "super_dominance");
      }
      else {
        type_dag.connect(argid, member.id, "super_dominance");
      }
      const arg_gen = new arg_gen_prototype(argid);
      arg_gen.generate(cur_expression_complex_level + 1);
      if (ghost_id === undefined) {
        type_dag.solution_range_alignment(argid, member.id);
      }
      else {
        type_dag.solution_range_alignment(ghost_id, argid);
      }
      args.push(arg_gen.irnode! as expr.IRExpression);
      let extracted_arg = expr.tuple_extraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      for (const arg_id of args_ids) {
        expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(arg_id)!));
      }
      if (storage_location_dag.solution_range.has(member.id)) {
        assert(storage_location_dag.solution_range.has(argid),
          `NewStructGenerator: storage_location_dag.solution_range has no argid ${argid}`);
        storage_location_dag.connect(argid, member.id, "super_dominance");
      }
    }
    let identifier_name = struct_type.name;
    const function_call_expr = new expr.IRFunctionCall(this.id, cur_scope.id(), FunctionCallKind.FunctionCall,
      new expr.IRIdentifier(global_id++, cur_scope.id(), identifier_name, struct_type.referece_id), args);
    this.irnode = function_call_expr;
    storage_location_dag.insert(this.id, [
      StorageLocationProvider.calldata(),
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.memory(),
    ]);
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: NewStructGenerator, scope: ${cur_scope.id()}, scope: ${cur_scope.kind()}`));
    }
  }
}

class NewContractGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }

  generate(cur_expression_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewContractGenerator ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    assert(decl_db.contractdecls.size > 0, "No contract is declared");
    this.type_range = this.type_range.filter(t => t.typeName === "ContractType");
    type_dag.update(this.id, this.type_range);
    assert(this.type_range.length > 0, "NewContractGenerator: type_range is empty");
    const contract_type = pick_random_element(this.type_range)! as type.ContractType;
    const contract_decl = irnodes.get(contract_type.referece_id) as decl.IRContractDefinition;
    const new_expr = new expr.IRNew(global_id++, cur_scope.id(), contract_decl.name);
    //! Generate arguments for the constructor
    const args_ids : number[] = [];
    const args : expr.IRExpression[] = [];
    expr2read_variables.set(this.id, new Set<number>());
    for (let i = 0; i < contract_decl.constructor_parameters.length; i++) {
      const type_range = type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!;
      let arg_gen_prototype = get_exprgenerator(type_range, false, cur_expression_complex_level);
      const argid = global_id++;
      type_dag.insert(argid, type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!);
      let ghost_id;
      if (arg_gen_prototype.name === "LiteralGenerator") {
        ghost_id = global_id++;
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_dag.solution_range.get(contract_decl.constructor_parameters[i].id)!);
        type_dag.connect(ghost_id, argid);
        type_dag.connect(ghost_id, contract_decl.constructor_parameters[i].id, "super_dominance");
      }
      else {
        type_dag.connect(argid, contract_decl.constructor_parameters[i].id, "super_dominance");
      }
      type_dag.connect(argid, contract_decl.constructor_parameters[i].id);
      const arg_gen = new arg_gen_prototype(argid);
      arg_gen.generate(cur_expression_complex_level + 1);
      if (ghost_id === undefined) {
        type_dag.solution_range_alignment(argid, contract_decl.constructor_parameters[i].id);
      }
      else {
        type_dag.solution_range_alignment(ghost_id, argid);
      }
      args.push(arg_gen.irnode! as expr.IRExpression);
      let extracted_arg = expr.tuple_extraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      for (const arg_id of args_ids) {
        expr2read_variables.set(this.id, merge_set(expr2read_variables.get(this.id)!, expr2read_variables.get(arg_id)!));
      }
      if (storage_location_dag.solution_range.has(contract_decl.constructor_parameters[i].id)) {
        assert(storage_location_dag.solution_range.has(argid),
          `NewContractGenerator: storage_location_dag.solution_range has no argid ${argid}`);
        storage_location_dag.connect(argid, contract_decl.constructor_parameters[i].id, "super_dominance");
      }
    }
    const new_function_expr = new expr.IRFunctionCall(this.id, cur_scope.id(), FunctionCallKind.FunctionCall, new_expr, args);
    this.irnode = new_function_expr;
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: NewContractGenerator, scope: ${cur_scope.kind()}, type_range: ${type_dag.solution_range.get(this.id)!.map(t => t.str())}`));
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
];

const nonterminal_expression_generators_for_address_type = [
  AssignmentGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const all_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator,
];

const nonliteral_expression_generators = [
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator,
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating AssignmentStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const assignid = global_id++;
    type_dag.insert(assignid, all_types);
    const assignment_gen = new AssignmentGenerator(assignid);
    assignment_gen.generate(0);
    this.expr = expr.tuple_extraction(assignment_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), assignment_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: AssignmentStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOpStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const bopid = global_id++;
    type_dag.insert(bopid, type.elementary_types);
    const binaryop_gen = new BinaryOpGenerator(bopid);
    binaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(binaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), binaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: BinaryOpStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOpStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const uopid = global_id++;
    type_dag.insert(uopid, type.elementary_types);
    const unaryop_gen = new UnaryOpGenerator(uopid);
    unaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(unaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), unaryop_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: UnaryOpStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class ConditionalStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ConditionalStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cid = global_id++;
    type_dag.insert(cid, all_types);
    const conditional_gen = new ConditionalGenerator(cid);
    conditional_gen.generate(0);
    this.expr = expr.tuple_extraction(conditional_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), conditional_gen.irnode! as expr.IRExpression);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ConditionalStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class FunctionCallStatementGenerator extends ExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCallStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    allow_empty_return = true;
    const fid = global_id++;
    type_dag.insert(fid, all_types);
    const funcall_gen = new FunctionCallGenerator(fid);
    funcall_gen.generate(0);
    this.expr = expr.tuple_extraction(funcall_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.id(), funcall_gen.irnode! as expr.IRExpression);
    allow_empty_return = false;
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: FunctionCallStatement, scope: ${cur_scope.kind()}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SingleVariableDeclareStatement, scope: ${cur_scope.kind()}`));
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
      type_dag.insert(expr_id, all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      this.expr = expression_gen.irnode! as expr.IRExpression;
    }
    this.exprs = this.exprs.concat(expr.tuple_extraction(this.expr));
    if (this.vardecl === undefined) {
      const variable_gen = new VariableDeclarationGenerator(
        type_dag.solution_range.get(expr.tuple_extraction(this.expr).id)!, false);
      variable_gen.generate();
      this.vardecl = variable_gen.irnode! as decl.IRVariableDeclaration;
    }
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.id(), [this.vardecl], this.expr);
    let extracted_ir = expr.tuple_extraction(this.expr);
    if (extracted_ir.typeName === "IRLiteral") {
      const ghost_id = global_id++;
      type_dag.insert(ghost_id, type_dag.solution_range.get(extracted_ir.id)!);
      type_dag.connect(ghost_id, extracted_ir.id);
      type_dag.connect(ghost_id, this.vardecl.id, "super_dominance");
    }
    else {
      type_dag.connect(extracted_ir.id, this.vardecl.id, "super_dominance");
      type_dag.solution_range_alignment(extracted_ir.id, this.vardecl.id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: SingleVariableDeclareStatement, scope: ${cur_scope.kind()}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating MultipleVariableDeclareStatement, scope: ${cur_scope.kind()}`));
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
      type_dag.insert(expr_id, all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
      this.exprs = this.exprs.concat(expr.tuple_extraction(ir_exps[i]));
    }
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(
        type_dag.solution_range.get(expr.tuple_extraction(ir_exps[i]).id)!, false);
      variable_gen.generate();
      this.vardecls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    const ir_tuple_exp = new expr.IRTuple(global_id++, cur_scope.id(), ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.id(), this.vardecls, ir_tuple_exp);
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = expr.tuple_extraction(ir_exps[i]);
      if (extracted_ir.typeName === "IRLiteral") {
        const ghost_id = global_id++;
        type_dag.insert(ghost_id, type_dag.solution_range.get(extracted_ir.id)!);
        type_dag.connect(ghost_id, extracted_ir.id);
        type_dag.connect(ghost_id, this.vardecls[i].id, "super_dominance");
      }
      else {
        type_dag.connect(extracted_ir.id, this.vardecls[i].id, "super_dominance");
        type_dag.solution_range_alignment(extracted_ir.id, this.vardecls[i].id);
      }
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: MultipleVariableDeclareStatement, scope: ${cur_scope.kind()}`));
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
      console.log(color.redBG(`${" ".repeat(indent)}>> Start generating ReturnStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    assert(this.value !== undefined, "ReturnStatementGenerator: value is undefined");
    if (this.value === undefined) {
      //! Contain bugs
      const expression_gen_prototype = pick_random_element(all_expression_generators)!;
      const exprid = global_id++;
      type_dag.insert(exprid, all_types);
      const expression_gen = new expression_gen_prototype(exprid);
      expression_gen.generate(0);
      this.value = expression_gen.irnode! as expr.IRExpression;
      this.exprs.push(expr.tuple_extraction(this.value));
    }
    this.irnode = new stmt.IRReturnStatement(global_id++, cur_scope.id(), this.value);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ReturnStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class IfStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating IfStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF_CONDITION);
    //! Generate condition
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cid = global_id++;
    type_dag.insert(cid, type.bool_types);
    const condition_gen = new BinaryCompareOpGenerator(cid);
    condition_gen.generate(0);
    this.exprs.push(expr.tuple_extraction(condition_gen.irnode as expr.IRExpression));
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}IfStatement Condition, scope: ${cur_scope.kind()}`));
    }
    //! Generate true body
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If true body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF_BODY);
    let true_body : stmt.IRStatement[] = [];
    const true_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < true_stmt_cnt; i++) {
      const then_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const then_stmt_gen = new then_stmt_gen_prototype();
      then_stmt_gen.generate(cur_stmt_complex_level + 1);
      true_body = true_body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      true_body.push(then_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        then_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(then_stmt_gen.expr!)] :
          then_stmt_gen.exprs
      );
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}IfStatement True Body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    if (Math.random() < config.else_prob) {
      this.irnode = new stmt.IRIf(global_id++, cur_scope.id(), condition_gen.irnode! as expr.IRExpression, true_body, []);
      return;
    }
    //! Generate false body
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If false body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF_BODY);
    let false_body : stmt.IRStatement[] = [];
    const false_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < false_stmt_cnt; i++) {
      const else_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const else_stmt_gen = new else_stmt_gen_prototype();
      else_stmt_gen.generate(cur_stmt_complex_level + 1);
      false_body = false_body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      false_body.push(else_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        else_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(else_stmt_gen.expr!)] :
          else_stmt_gen.exprs
      );
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}IfStatement False Body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRIf(global_id++, cur_scope.id(), condition_gen.irnode! as expr.IRExpression, true_body, false_body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: IfStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class ForStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ForStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.FOR_CONDITION);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating intialization, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
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
        type_dag.insert(iid, all_types);
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
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}ForStatement Initialization, scope: ${cur_scope.kind()}`));
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating conditional, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate the conditional expression
    const cid = global_id++;
    type_dag.insert(cid, type.bool_types);
    const conditional_gen = new BinaryCompareOpGenerator(cid);
    conditional_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(conditional_gen.irnode as expr.IRExpression)]);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}ForStatement Conditional, scope: ${cur_scope.kind()}`));
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating loop generation, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate the loop generation expression
    const loop_gen_prototype = pick_random_element(all_expression_generators)!;
    const lid = global_id++;
    type_dag.insert(lid, all_types);
    const loop_gen = new loop_gen_prototype(lid);
    loop_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(loop_gen.irnode as expr.IRExpression)]);
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}ForStatement Loop Generation, scope: ${cur_scope.kind()}`));
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate the body statement
    cur_scope = cur_scope.new(scopeKind.FOR_BODY);
    const stmt_cnt = random_int(config.for_body_stmt_cnt_lower_limit, config.for_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = this.complex(cur_stmt_complex_level) ?
        pick_random_element(expr_statement_generators)! :
        pick_random_element(statement_generators)!;
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode!);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}ForStatement, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRFor(global_id++, cur_scope.id(), init_stmt_expr, conditional_gen.irnode! as expr.IRExpression,
      loop_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: ForStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class WhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating WhileStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate condition expression
    const cond_gen_prototype = pick_random_element(all_expression_generators)!;
    const cid = global_id++;
    type_dag.insert(cid, type.bool_types);
    const cond_gen = new cond_gen_prototype(cid);
    cur_scope = cur_scope.new(scopeKind.WHILE_CONDITION);
    cond_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(cond_gen.irnode as expr.IRExpression)]);
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}WhileStatement Condition, scope: ${cur_scope.kind()}`));
    }
    //! Generate body statement
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.WHILE_BODY);
    const stmt_cnt = random_int(config.while_body_stmt_cnt_lower_limit, config.while_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
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
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode!);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}WhileStatement body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRWhile(global_id++, cur_scope.id(), cond_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: WhileStatement, scope: ${cur_scope.kind()}`));
    }
  }
}

class DoWhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(cur_stmt_complex_level : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate condition expression
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cond_gen_prototype = pick_random_element(all_expression_generators)!;
    const cid = global_id++;
    type_dag.insert(cid, type.bool_types);
    const cond_gen = new cond_gen_prototype(cid);
    cur_scope = cur_scope.new(scopeKind.DOWHILE_COND);
    cond_gen.generate(0);
    cur_scope = cur_scope.rollback();
    this.exprs = this.exprs.concat([expr.tuple_extraction(cond_gen.irnode as expr.IRExpression)]);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}DoWhileStatement Condition, scope: ${cur_scope.kind()}`));
    }
    //! Generate body statement
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.DOWHILE_BODY);
    const stmt_cnt = random_int(config.do_while_body_stmt_cnt_lower_limit, config.do_while_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
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
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode!);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}DoWhileStatement body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRDoWhile(global_id++, cur_scope.id(), cond_gen.irnode! as expr.IRExpression, body);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: DoWhileStatement, scope: ${cur_scope.kind()}`));
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