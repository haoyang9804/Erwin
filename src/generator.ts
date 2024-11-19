import { assert, pick_random_element, random_int, merge_set, intersection, cartesian_product } from "./utility";
import { IRGhost, IRNode, IRSourceUnit } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { decl_db, expr_db } from "./db";
import { TypeDominanceDAG, StorageLocationDominanceDAG, VisMutDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { is_super_set, is_equal_set } from "./dominance";
import { ContractKind, DataLocation, FunctionCallKind, FunctionKind, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { ScopeList, scopeKind, initScope, inside_function_body, inside_struct_scope, get_scope_from_scope_id } from "./scope";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { FuncVis, FuncVisProvider } from "./visibility";
import { StorageLocation, StorageLocationProvider } from "./memory";
import { all_func_vismut, all_var_vismut, closed_func_vismut, FuncVisMut, nonpayable_func_vismut, open_func_vismut, VisMut, VisMutKindProvider, VisMutProvider } from "./vismut";
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables
const global_id_start = 1;
export let global_id = global_id_start;
export function new_global_id() {
  return global_id++;
}
let cur_scope : ScopeList = initScope();
let indent = 0;
let no_state_variable_in_function_body = false;
let allow_empty_return = false;
// A signal to indicate whether there is an external function call in the current function body.
let external_call = false;
// A signal to indicate there should be no function calls to the function in another contract in the current function body.
// No external call means that the visibility range of the function is not limited to external and public.
let forbid_external_call = false;
let cur_contract_id = 0;
let cur_contract_name = '';
let virtual_env = false;
let override_env = false;
let noview_nopure_funcdecl = false;
let nopure_funcdecl = false;
let name_id = 0;
let all_types : type.Type[] = [];
// Record the statements that are not expected to be generated before the current statement.
let unexpected_extra_stmt : Map<number, stmt.IRStatement[]> = new Map<number, stmt.IRStatement[]>();
const contract_types : Map<number, type.ContractType> = new Map<number, type.ContractType>();
const internal_struct_types = new Set<type.StructType>();
const internal_struct_type_to_external_struct_type = new Map<type.StructType, type.StructType>();
let user_defined_types : type.UserDefinedType[] = [];

// Record the ID of the mapping declarations that cannot be assigned to.
function initialize_the_vardecls_that_must_be_initialized(scope_id : number) : stmt.IRStatement[] {
  if (!decl_db.scope_has_vardecls_that_must_be_initialized(scope_id)) return [];
  const initialized_stmts : stmt.IRStatement[] = [];
  for (const id of decl_db.exist_vardecls_that_must_be_initialized(scope_id)!) {
    assert(irnodes.has(id), `initialize_the_vardecls_that_must_be_initialized: id ${id} is not in irnodes`);
    assert(irnodes.get(id) instanceof decl.IRVariableDeclaration,
      `initialize_the_vardecls_that_must_be_initialized: id ${id} is not an instance of IRVariableDeclaration`);
    const vardecl = irnodes.get(id) as decl.IRVariableDeclaration;
    const assignment = new expr.IRAssignment(new_global_id(), cur_scope.id(),
      new expr.IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id),
      new expr.IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id), '=');
    const assignment_stmt = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), assignment);
    expr_db.expr_reads_variable(assignment.id, vardecl.id);
    (assignment_stmt as stmt.IRStatement).exprs.push(assignment);
    initialized_stmts.push(assignment_stmt);
  }
  decl_db.remove_vardecl_from_must_be_initialized(scope_id);
  return initialized_stmts;
}

/*
Mapping, array, and struct all have constituent variable declarations.
Storage loc range of such compound-type variable declaration is constrained by
and constraints the storage loc range of its constituent variable declarations.
*/
function update_storage_loc_range_for_compound_type(id : number, struct_instance_id = -1, ghost_id = -1) {
  assert(decl_db.qualifed_by_storage_qualifier(id),
    `update_storage_loc_range_recursively: id ${id} is not qualified by storage qualifier`);
  assert(storage_location_dag.has_solution_range(id) ||
    ghost_id !== -1 && storage_location_dag.has_solution_range(ghost_id),
    `update_storage_loc_range_recursively: id ${id} is not in storage_location_dag`);
  if (inside_struct_scope(cur_scope)) return;
  if (decl_db.is_array_decl(id)) {
    const baseid = decl_db.base_of_array(id);
    if (decl_db.qualifed_by_storage_qualifier(baseid)) {
      if (ghost_id === -1) {
        assert(struct_instance_id === -1,
          `update_storage_loc_range_for_compound_type: ghost_id is -1 but struct_instance_id (${struct_instance_id}) is not -1`);
        storage_location_dag.insert(baseid, storage_location_dag.solution_range_of(id)!);
        const bridge_id = new_global_id();
        storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(id)!);
        storage_location_dag.connect(bridge_id, baseid);
        storage_location_dag.connect(bridge_id, id);
        update_storage_loc_range_for_compound_type(baseid);
      }
      else {
        assert(!storage_location_dag.has_solution_range(baseid),
          `update_storage_loc_range_for_compound_type: baseid ${baseid} has solution range`);
        assert(struct_instance_id !== -1,
          `update_storage_loc_range_for_compound_type: struct_instance_id is -1 but ghost_id is not -1`);
        const base_ghost_id = new_global_id();
        const bridge_id = new_global_id();
        storage_location_dag.insert(base_ghost_id, storage_location_dag.solution_range_of(ghost_id)!);
        storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(ghost_id)!);
        storage_location_dag.connect(bridge_id, base_ghost_id);
        storage_location_dag.connect(bridge_id, ghost_id);
        decl_db.update_ghost_members_of_struct_instance(struct_instance_id, baseid, base_ghost_id);
        update_storage_loc_range_for_compound_type(baseid, struct_instance_id, base_ghost_id);
      }
    }
  }
  else if (decl_db.is_struct_instance_decl(id)) {
    const members = decl_db.members_of_struct_instance(id);
    members.forEach((member) => {
      if (decl_db.qualifed_by_storage_qualifier(member)) {
        if (ghost_id === -1) {
          const member_ghost_id = new_global_id();
          storage_location_dag.insert(member_ghost_id, storage_location_dag.solution_range_of(id)!);
          const bridge_id = new_global_id();
          storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(id)!);
          storage_location_dag.connect(bridge_id, member_ghost_id);
          storage_location_dag.connect(bridge_id, id);
          decl_db.update_ghost_members_of_struct_instance(id, member, member_ghost_id);
          update_storage_loc_range_for_compound_type(member, id, member_ghost_id);
        }
        else {
          assert(!storage_location_dag.has_solution_range(member),
            `update_storage_loc_range_for_compound_type: member ${member} has solution range`);
          assert(struct_instance_id !== -1,
            `update_storage_loc_range_for_compound_type: struct_instance_id is -1 but ghost_id is not -1`);
          const member_ghost_id = new_global_id();
          const bridge_id = new_global_id();
          storage_location_dag.insert(member_ghost_id, storage_location_dag.solution_range_of(ghost_id)!);
          storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(ghost_id)!);
          storage_location_dag.connect(bridge_id, member_ghost_id);
          storage_location_dag.connect(bridge_id, ghost_id);
          decl_db.update_ghost_members_of_struct_instance(struct_instance_id, member, member_ghost_id);
          update_storage_loc_range_for_compound_type(member, struct_instance_id, member_ghost_id);
        }
      }
    });
  }
  else if (decl_db.is_mapping_decl(id)) {
    const value = decl_db.value_of_mapping(id);
    if (decl_db.qualifed_by_storage_qualifier(value)) {
      if (ghost_id === -1) {
        storage_location_dag.insert(value, storage_location_dag.solution_range_of(id)!);
        const bridge_id = new_global_id();
        storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(id)!);
        storage_location_dag.connect(bridge_id, value);
        storage_location_dag.connect(bridge_id, id);
        update_storage_loc_range_for_compound_type(value);
      }
      else {
        assert(!storage_location_dag.has_solution_range(value),
          `update_storage_loc_range_for_compound_type: value ${value} has solution range`);
        assert(struct_instance_id !== -1,
          `update_storage_loc_range_for_compound_type: struct_instance_id is -1 but ghost_id is not -1`);
        const value_ghost_id = new_global_id();
        const bridge_id = new_global_id();
        storage_location_dag.insert(value_ghost_id, storage_location_dag.solution_range_of(ghost_id)!);
        storage_location_dag.insert(bridge_id, storage_location_dag.solution_range_of(ghost_id)!);
        storage_location_dag.connect(bridge_id, value_ghost_id);
        storage_location_dag.connect(bridge_id, ghost_id);
        decl_db.update_ghost_members_of_struct_instance(struct_instance_id, value, value_ghost_id);
        update_storage_loc_range_for_compound_type(value, struct_instance_id, value_ghost_id);
      }
    }
  }
}

/*
Solution ranges of arguments (including function call argument, return values, etc) are related
to the solution ranges of the corresponding parameters (including function parameters, return variables, etc).
*/
function connect_arguments_to_parameters(arg_id : number,
  param_id : number,
  exprgen_name : string,
  type_range : type.Type[],
  storage_loc_range : StorageLocation[]) : number | undefined {
  let ghost_id;
  if (exprgen_name === "LiteralGenerator") {
    ghost_id = new_global_id();
    new IRGhost(ghost_id, cur_scope.id());
    type_dag.insert(ghost_id, type_range);
    type_dag.connect(ghost_id, arg_id);
    type_dag.connect(ghost_id, param_id, "super_dominance");
  }
  else {
    type_dag.connect(arg_id, param_id, "super_dominance");
  }
  if (storage_loc_range.length > 0) {
    const storage_loc_range = storage_location_dag.solution_range_of(param_id)!;
    storage_location_dag.insert(arg_id, storage_loc_range);
    storage_location_dag.connect(arg_id, param_id, "super_dominance");
  }
  return ghost_id;
}

function align_solution_ranges_of_arguments_and_parameters(arg_id : number,
  param_id : number,
  ghost_id : number | undefined) : void {
  if (ghost_id === undefined) {
    type_dag.solution_range_alignment(arg_id, param_id);
  }
  else {
    type_dag.solution_range_alignment(ghost_id, arg_id);
  }
  if (storage_location_dag.has_solution_range(param_id)) {
    assert(storage_location_dag.has_solution_range(arg_id),
      `storage_location_dag.solution_range should have ${arg_id}`);
    storage_location_dag.connect(arg_id, param_id, "super_dominance");
    storage_location_dag.solution_range_alignment(arg_id, param_id);
  }
}

enum IDENTIFIER {
  CONTRACT,
  FUNC,
  STRUCT,
  VAR,
  CONTRACT_INSTANCE,
  STRUCT_INSTANCE,
  MAPPING,
  ARRAY
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
  //@ts-ignore
  let __name__ : string;
  //@ts-ignore
  let __names__ : string[];
  //@ts-ignore
  let reuse_contract_member_name = (name_to_contract_id : Map<string, Set<number>>) : string[] => {
    return Array.from(name_to_contract_id.keys())
      .filter(
        (name) =>
          new Set<number>([...name_to_contract_id.get(name)!].flatMap(
            (id) => !contract_types.has(id) ? [id] : contract_types.get(id)!.subs().map((t) => (t as type.ContractType).referece_id)
          )).has(cur_contract_id) === false
      );
  };
  //@ts-ignore
  let post_update = (name_to_contract_id : Map<string, Set<number>>, name : string, id : number) : void => {
    if (name_to_contract_id.has(name)) {
      name_to_contract_id.get(name)!.add(id);
    }
    else {
      name_to_contract_id.set(name, new Set<number>([id]));
    }
  }
  switch (identifier) {
    case IDENTIFIER.CONTRACT:
      return `contract${name_id++}`;
    case IDENTIFIER.MAPPING:
      return `mapping${name_id++}`;
    case IDENTIFIER.ARRAY:
      return `array${name_id++}`;
    case IDENTIFIER.VAR:
      return `var${name_id++}`;
    case IDENTIFIER.CONTRACT_INSTANCE:
      return `cointract_instance${name_id++}`;
    case IDENTIFIER.STRUCT_INSTANCE:
      return `struct_instance${name_id++}`;
    case IDENTIFIER.STRUCT:
      return `struct${name_id++}`;
    case IDENTIFIER.FUNC:
      return `func${name_id++}`;
    default:
      throw new Error(`generate_name: identifier ${identifier} is not supported`);
  }
}

function contains_available_funcdecls(contractdecl_id_plus_funcdecl_id : [number, number][]) : boolean {
  if (contractdecl_id_plus_funcdecl_id.length === 0) return false;
  for (const [contractdecl_id, funcdecl_id] of contractdecl_id_plus_funcdecl_id) {
    if (decl_db.is_getter_function(funcdecl_id)) {
      if (contractdecl_id !== cur_contract_id) {
        return true;
      }
      continue;
    }
    const visibility_range = vismut_dag.solution_range_of(funcdecl_id)!.
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

function get_available_funcdecls(type_range : type.Type[]) : [number, number][] {
  /*
    Return a list of [contractdecl_id, funcdecl_id] pairs.
    The function declaration with funcdecl_id is in the contract declaration with the contractdecl_id.
  */
  let contractdecl_id_plus_funcdecl_id : [number, number][] = [];
  for (let contract_id of decl_db.contractdecls_ids()) {
    const funcdecl_ids = decl_db.get_funcdecls_ids_recursively_from_a_contract(contract_id);
    for (let irnode_id of funcdecl_ids) {
      // internal call
      if (contract_id === cur_contract_id) {
        if (vismut_dag.solution_range_of(irnode_id)!.some(t => closed_func_vismut.includes(t)) &&
          (allow_empty_return || (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns.length > 0)) {
          if (allow_empty_return) {
            contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
          }
          else {
            for (const ret_decl of (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns) {
              if (vardecl_type_range_is_ok(ret_decl.id, type_range)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
      }
      // "this" function calls of other contracts
      else if (contract_id < 0 && contract_id !== -cur_contract_id) {
        continue;
      }
      // external call
      else {
        if (vismut_dag.solution_range_of(irnode_id)!.some(t => open_func_vismut.includes(t)) &&
          (allow_empty_return || (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns.length > 0)) {
          if (allow_empty_return) {
            contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
          }
          else {
            for (const ret_decl of (irnodes.get(irnode_id)! as decl.IRFunctionDefinition).returns) {
              if (vardecl_type_range_is_ok(ret_decl.id, type_range)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
      }
    }
  }
  if (cur_scope.kind() === scopeKind.CONTRACT) {
    contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
      ([_, funcdecl_id]) =>
        (irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).returns.length == 1
    );
  }
  if (forbid_external_call) {
    contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
      ([contract_id, _]) => contract_id === cur_contract_id || contract_id === -cur_contract_id
    );
  }
  let function_contaion_mapping_parameters_or_mapping_returns = (funcdecl_id : number) : boolean => {
    const func_decl = irnodes.get(funcdecl_id) as decl.IRFunctionDefinition;
    return func_decl.parameters.some((param) => decl_db.is_mapping_decl(param.id)) ||
      func_decl.returns.some((ret) => decl_db.is_mapping_decl(ret.id));
  }
  contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
    ([contract_id, function_id]) => {
      if (contract_id !== cur_contract_id &&
        function_contaion_mapping_parameters_or_mapping_returns(function_id)) {
        return false;
      }
      return true;
    }
  )
  return contractdecl_id_plus_funcdecl_id;
}

function cannot_choose_functioncallgenerator(type_range : type.Type[]) : boolean {
  return !contains_available_funcdecls(get_available_funcdecls(type_range));
}

function get_exprgenerator(type_range : type.Type[],
  cur_expression_complex_level : number = 0,
  forbidden_generators : any[] = [],
  storage_loc_range : StorageLocation[] = []) : any {
  let arg_gen_prototype;
  let generator_candidates = new Set<any>();
  if (type_range.some(t => t.typeName === "ContractType")) {
    generator_candidates.add(IdentifierGenerator);
    if (cur_expression_complex_level < config.expression_complex_level) {
      generator_candidates.add(NewContractGenerator);
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "StructType")) {
    generator_candidates.add(IdentifierGenerator);
    if (cur_expression_complex_level < config.expression_complex_level) {
      if (storage_loc_range.length === 0 ||
        storage_loc_range.some(s => s.same(StorageLocationProvider.memory()))) {
        generator_candidates.add(NewStructGenerator);
      }
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "MappingType")) {
    generator_candidates.add(IdentifierGenerator);
    if (cur_expression_complex_level < config.expression_complex_level) {
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "ArrayType")) {
    generator_candidates.add(IdentifierGenerator);
    if (cur_expression_complex_level < config.expression_complex_level) {
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
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
  if (cannot_choose_functioncallgenerator(type_range)) {
    generator_candidates.delete(FunctionCallGenerator);
  }
  forbidden_generators.forEach((generator) => {
    generator_candidates.delete(generator);
  });
  const generator_candidates_array = Array.from(generator_candidates);
  assert(generator_candidates_array.length > 0, `get_exprgenerator: generator_candidates is empty, type_range is ${type_range.map(t => t.str())}`);
  arg_gen_prototype = pick_random_element(generator_candidates_array)!;
  return arg_gen_prototype;
}

function get_stmtgenerator(cur_stmt_complex_level : number = -1) : any {
  let complex = () : boolean => {
    return cur_stmt_complex_level >= config.statement_complex_level || Math.random() < config.nonstructured_statement_prob;
  }
  const generator_candidates = cur_stmt_complex_level === -1 ?
    new Set<any>(statement_generators) :
    complex() ?
      new Set<any>(expr_statement_generators) :
      new Set<any>(statement_generators);
  if (get_available_funcdecls(all_types).length === 0) {
    generator_candidates.delete(FunctionCallStatementGenerator);
  }
  return pick_random_element([...generator_candidates]);
}

function vardecl_type_range_is_ok(vardecl_id : number, type_range : type.Type[]) : boolean {
  return is_super_set(type_dag.solution_range_of(vardecl_id)!, type_range) &&
    type_dag.try_tighten_solution_range_middle_out(vardecl_id, type_range) ||
    is_super_set(type_range, type_dag.solution_range_of(vardecl_id)!)
}

function get_available_vardecls_with_type_constraint(types : type.Type[]) : decl.IRVariableDeclaration[] {
  const collection : decl.IRVariableDeclaration[] = [];
  //! Search for struct members
  for (const struct_decl_id of decl_db.structdecls_ids()) {
    const struct_decl = irnodes.get(struct_decl_id) as decl.IRStructDefinition;
    struct_decl.members.forEach((member) => {
      collection.push(member);
    });
  }
  const available_irnode_ids = decl_db.get_irnodes_ids_recursively_from_a_scope(cur_scope.id());
  //! Search for mappings' values
  // Currently mappings are all state variables. 
  const get_value_from_a_mapping = (mapping_id : number) : number[] => {
    const valueid = decl_db.value_of_mapping(mapping_id);
    let result = [valueid];
    if (decl_db.is_mapping_decl(valueid)) {
      result = result.concat(get_value_from_a_mapping(valueid));
    }
    assert(type_dag.has_solution_range(valueid),
      `get_final_value_from_a_mapping: valueid ${valueid} is not in type_dag.solution_range`);
    return result;
  }
  //! Search for arrays' bases
  const get_bases_from_an_array = (array_id : number) : number[] => {
    const baseid = decl_db.base_of_array(array_id);
    let result = [baseid];
    if (decl_db.is_array_decl(baseid)) {
      result = result.concat(get_bases_from_an_array(baseid));
    }
    assert(type_dag.has_solution_range(baseid),
      `get_final_value_from_an_array: baseid ${baseid} is not in type_dag.solution_range`);
    return result;
  }
  //! If the current scope is a contract, only search for state variables
  if (cur_scope.kind() === scopeKind.CONTRACT) {
    for (let id of available_irnode_ids) {
      if (decl_db.is_state_variable(id)) {
        if (decl_db.is_mapping_decl(id)) {
          const valueids = get_value_from_a_mapping(id);
          for (let valueid of valueids) {
            collection.push(irnodes.get(valueid)! as decl.IRVariableDeclaration);
          }
        }
        else if (decl_db.is_array_decl(id)) {
          const baseids = get_bases_from_an_array(id);
          for (let baseid of baseids) {
            collection.push(irnodes.get(baseid)! as decl.IRVariableDeclaration);
          }
        }
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  //! Otherwise, search for non-state variables and state variables
  else {
    for (let id of available_irnode_ids) {
      let possible_mapping_decl_id = id;
      while (decl_db.is_mapping_value(possible_mapping_decl_id)) {
        possible_mapping_decl_id = decl_db.mapping_of_value(possible_mapping_decl_id)!;
      }
      if (decl_db.is_state_variable(possible_mapping_decl_id)) {
        if (!no_state_variable_in_function_body) {
          if (decl_db.is_mapping_decl(id)) {
            const valueids = get_value_from_a_mapping(id);
            for (let valueid of valueids) {
              collection.push(irnodes.get(valueid)! as decl.IRVariableDeclaration);
            }
          }
          else if (decl_db.is_array_decl(id)) {
            const baseids = get_bases_from_an_array(id);
            for (let baseid of baseids) {
              collection.push(irnodes.get(baseid)! as decl.IRVariableDeclaration);
            }
          }
          collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
        }
      }
      else if (decl_db.is_vardecl(possible_mapping_decl_id)) {
        collection.push(irnodes.get(id)! as decl.IRVariableDeclaration);
      }
    }
  }
  return collection.filter(
    (irdecl) => vardecl_type_range_is_ok(irdecl.id, types) && !decl_db.is_locked_vardecl(irdecl.id)
  );
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
    all_types = [...type.elementary_types,
    type.TypeProvider.trivial_mapping(),
    type.TypeProvider.trivial_array(),
    ];
  }

  private start_flag() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SourceUnit, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}SourceUnit, scope: ${cur_scope.kind()}`));
    }
  }

  private generate_children() : IRNode[] {
    const children : IRNode[] = [];
    Array.from({ length: config.contract_count }).forEach(() => {
      const contract_gen = new ContractDeclarationGenerator();
      contract_gen.generate();
      const all_types_set = new Set([...all_types]);
      const user_defined_types_set = new Set([...user_defined_types]);
      internal_struct_types.forEach((t) => {
        all_types_set.delete(t)
        user_defined_types_set.delete(t);
      });
      all_types = [...all_types_set];
      user_defined_types = [...user_defined_types_set];
      internal_struct_types.clear();
      children.push(contract_gen.irnode!);
    });
    return children;
  }

  generate() : void {
    this.start_flag();
    this.irnode = new IRSourceUnit(new_global_id(), -1, this.generate_children());
    this.end_flag();
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

class MappingDeclarationGenerator extends DeclarationGenerator {

  type_range : type.Type[];
  must_be_in_contract_scope : boolean;
  cur_type_complex_level : number;

  constructor(cur_type_complex_level : number, type_range : type.Type[], must_be_in_contract_scope : boolean = false) {
    super();
    this.cur_type_complex_level = cur_type_complex_level;
    this.type_range = type_range;
    this.must_be_in_contract_scope = must_be_in_contract_scope;
  }

  private extract_key_value_type_range_from_mapping_type_range(type_range : type.Type[]) {
    assert(type_range.every((t) => t.typeName === 'MappingType'),
      `MappingDeclarationGenerator: type_range should only contain mapping types, but is ${type_range.map(t => t.str())}`);
    const key_type_range = type_range.map((t) => (t as type.MappingType).kType)
    const deduplicated_key_type_range = key_type_range.filter((k, i) => key_type_range.findIndex((t) => t.same(k)) === i);
    const value_type_range = type_range.map((t) => t as type.MappingType).map((t) => t.vType);
    const deduplicated_value_type_range = value_type_range.filter((v, i) => value_type_range.findIndex((t) => t.same(v)) === i);
    return [deduplicated_key_type_range, deduplicated_value_type_range];
  }

  private integrate_mapping_type_from_key_value_type_range(key_type_range : type.Type[], value_type_range : type.Type[]) {
    return key_type_range.flatMap((k) => value_type_range.map((v) => new type.MappingType(k, v)));
  }

  private generate_key_value() : [number, number] {
    let [key_type_range, value_type_range] = this.extract_key_value_type_range_from_mapping_type_range(this.type_range);
    if (key_type_range.length === 0) {
      assert(value_type_range.length === 0,
        `MappingDeclarationGenerator: key_type_range is empty but value_type_range is not empty`);
      key_type_range = all_types.filter((t) =>
        t.typeName !== 'StructType' &&
        t !== type.TypeProvider.payable_address() &&
        t.typeName != 'MappingType' &&
        t.typeName != 'ArrayType'
      );
      value_type_range = all_types;
    }
    cur_scope = cur_scope.new(scopeKind.MAPPING);
    const key_var_gen = new VariableDeclarationGenerator(this.cur_type_complex_level + 1, key_type_range, true)
    key_var_gen.generate();
    (key_var_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
    const value_var_gen = new VariableDeclarationGenerator(this.cur_type_complex_level + 1, value_type_range, true)
    value_var_gen.generate();
    (value_var_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
    key_type_range = type_dag.solution_range_of(key_var_gen.irnode!.id)!;
    value_type_range = type_dag.solution_range_of(value_var_gen.irnode!.id)!;
    this.type_range = this.integrate_mapping_type_from_key_value_type_range(key_type_range, value_type_range);
    cur_scope = cur_scope.rollback();
    return [key_var_gen.irnode!.id, value_var_gen.irnode!.id];
  }

  private mapping_must_be_initialized_if_in_function_return_scope() : void {
    if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      const function_scope = cur_scope.pre();
      assert(function_scope.kind() === scopeKind.FUNC,
        `MappingDeclarationGenerator: function_scope.kind() is not FUNC but ${function_scope.kind()}`);
      assert(this.irnode !== undefined,
        `MappingDeclarationGenerator: this.irnode is undefined`);
      decl_db.set_vardecl_as_must_be_initialized(function_scope.id(), this.irnode!.id);
    }
  }

  private start_flag(mappingid : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Mapping Declaration, scope: ${cur_scope.kind()}, id: ${mappingid}`));
      indent += 2;
    }
  }

  private end_flag(mappingid : number, mapping_name : string) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Mapping Declaration, name: ${mapping_name} scope: ${cur_scope.kind()}, id: ${mappingid}`));
    }
  }

  private go_back_to_contract_scope_if_required() : [boolean, ScopeList] {
    let rollback = false;
    const snapshot = cur_scope.snapshot();
    if (this.must_be_in_contract_scope && cur_scope.kind() !== scopeKind.CONTRACT) {
      rollback = true;
      while (cur_scope.kind() !== scopeKind.CONTRACT) {
        cur_scope = cur_scope.rollback();
      }
    }
    return [rollback, snapshot];
  }

  private return_to_previous_scope_if_required(rollback : boolean, scope_snapshot : ScopeList) {
    if (rollback) {
      const contract_decl_id = decl_db.get_contractdecl_by_scope(cur_scope.id())!;
      assert(irnodes.has(contract_decl_id),
        `MappingDeclarationGenerator: contract_decl_id ${contract_decl_id} is not in irnodes`);
      const contract_decl = irnodes.get(contract_decl_id) as decl.IRContractDefinition;
      contract_decl.body.push(this.irnode!);
      cur_scope = scope_snapshot.snapshot();
    }
  }

  private update_storage_location_range(mappingid : number) {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    if (inside_struct_scope(cur_scope)) return;
    if (cur_scope.kind() === scopeKind.CONTRACT ||
      cur_scope.kind() === scopeKind.MAPPING ||
      cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(mappingid, [
        StorageLocationProvider.storage_ref()
      ]);
    }
    else {
      storage_location_dag.insert(mappingid, [
        StorageLocationProvider.storage_pointer()
      ]);
    }
    update_storage_loc_range_for_compound_type(mappingid);
  }

  private update_vismut_dag(mappingid : number) {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      vismut_dag.insert(mappingid, all_var_vismut);
    }
  }

  private distill_type_range() {
    assert(this.type_range.some((t) => t.typeName === 'MappingType'),
      `MappingDeclarationGenerator: type_range should contain mapping types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName === 'MappingType' && t !== type.TypeProvider.trivial_mapping());
  }

  generate() : void {
    this.distill_type_range();
    const mappingid = new_global_id();
    const [rollback, scope_snapshot] = this.go_back_to_contract_scope_if_required();
    this.start_flag(mappingid);
    const mapping_name = generate_name(IDENTIFIER.MAPPING);
    this.irnode = new decl.IRVariableDeclaration(mappingid, cur_scope.id(), mapping_name);
    const [keyid, valueid] = this.generate_key_value();
    type_dag.insert(mappingid, this.type_range);
    decl_db.set_vardecl_as_nonassignable(mappingid);
    this.mapping_must_be_initialized_if_in_function_return_scope();
    decl_db.add_mapping_decl(mappingid, keyid, valueid);
    decl_db.add_vardecl_with_scope(mappingid, cur_scope);
    this.update_storage_location_range(mappingid);
    this.update_vismut_dag(mappingid);
    this.end_flag(mappingid, mapping_name);
    this.return_to_previous_scope_if_required(rollback, scope_snapshot);
  }
}

class ArrayDeclarationGenerator extends DeclarationGenerator {
  type_range : type.Type[];
  no_initializer : boolean;
  cur_type_complex_level : number;
  base : IRNode | undefined;
  length : number | undefined;
  constructor(cur_type_complex_level : number, type_range : type.Type[], no_initializer : boolean = true) {
    super();
    this.type_range = type_range;
    this.no_initializer = no_initializer;
    this.cur_type_complex_level = cur_type_complex_level;
  }

  private distill_type_range() {
    assert(this.type_range.some((t) => t.typeName === 'ArrayType'),
      `MappingDeclarationGenerator: type_range should contain array types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName === 'ArrayType' && t !== type.TypeProvider.trivial_array());
  }

  private start_flag() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Array Declaration, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag(array_name : string, arrayid : number) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Array Declaration, scope: ${cur_scope.kind()}, name: ${array_name}, id: ${arrayid}`));
    }
  }

  private generate_length() {
    if (this.type_range.length > 0) {
      const all_lengths = [...new Set<number | undefined>(this.type_range.map((t) => (t as type.ArrayType).length))];
      this.length = pick_random_element(all_lengths);
      this.type_range = this.type_range.filter((t) => (t as type.ArrayType).length === this.length);
    }
    else {
      this.length = Math.random() < config.dynamic_array_prob ? undefined : random_int(1, config.array_length_upperlimit);
    }
  }

  private generate_base() {
    let base_type_range;
    if (this.type_range.length === 0) {
      base_type_range = all_types;
    }
    else {
      base_type_range = this.type_range.map((t) => (t as type.ArrayType).base);
    }
    cur_scope = cur_scope.new(scopeKind.ARRAY);
    const base_gen = new VariableDeclarationGenerator(this.cur_type_complex_level + 1, base_type_range, true);
    base_gen.generate();
    cur_scope = cur_scope.rollback();
    this.base = base_gen.irnode!;
    (this.base as decl.IRVariableDeclaration).loc = DataLocation.Default;
  }

  private update_type_range() {
    const base_type_range = type_dag.solution_range_of(this.base!.id)!;
    this.type_range = base_type_range.map((t) => new type.ArrayType(t, this.length!));
  }

  private generate_initializer() {
    let initializer : expr.IRExpression | undefined;
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      const nid = new_global_id();
      assert(this.irnode !== undefined, `ArrayDeclarationGenerator: this.irnode is undefined`);
      type_dag.insert(nid, type_dag.solution_range_of(this.irnode.id)!);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_struct_gen = new IdentifierGenerator(nid);
      new_struct_gen.generate(0);
      initializer = new_struct_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
  }

  private initialize_array_length() {
    assert(this.irnode !== undefined, `ArrayDeclarationGenerator: this.irnode is undefined`);
    (this.irnode as decl.IRVariableDeclaration).type = new type.ArrayType(type.TypeProvider.placeholder(), this.length!);
  }

  private init_storage_location_range() {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    if (inside_struct_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `ArrayDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.MAPPING) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref(),
        StorageLocationProvider.storage_pointer(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.calldata()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.STRUCT) {
    }
    else if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.memory()
      ]);
    }
    else {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
  }

  private update_storage_location_range() {
    if (inside_struct_scope(cur_scope)) {
      assert(!storage_location_dag.has_solution_range(this.irnode!.id),
        `ArrayDeclarationGenerator: storage_location_dag.has_solution_range(${this.irnode!.id}) is true`);
      assert((this.irnode as decl.IRVariableDeclaration).value === undefined,
        `ArrayDeclarationGenerator: (this.irnode as decl.IRVariableDeclaration).value is not undefined`);
      return;
    }
    assert(this.irnode !== undefined, `ArrayDeclarationGenerator: this.irnode is undefined`);
    const value = (this.irnode as decl.IRVariableDeclaration).value;
    if (value !== undefined) {
      assert(storage_location_dag.has_solution_range(this.irnode.id),
        `ArrayDeclarationGenerator: storage_location_dag.has_solution_range(${this.irnode.id}) is false`);
      const initializer_id = expr.tuple_extraction(value).id;
      storage_location_dag.connect(initializer_id, this.irnode.id, "super_dominance");
      storage_location_dag.solution_range_alignment(initializer_id, this.irnode.id);
    }
    update_storage_loc_range_for_compound_type(this.irnode.id);
  }

  private update_vismut_dag(arrayid : number) {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      vismut_dag.insert(arrayid, all_var_vismut);
    }
  }

  private array_must_be_initialized_if_in_function_return_scope_or_in_funcbody() : void {
    assert(this.irnode !== undefined,
      `ArrayDeclarationGenerator: this.irnode is undefined`);
    let inside_function_without_init = () => {
      return inside_function_body(cur_scope.kind()) &&
        (this.irnode! as decl.IRVariableDeclaration).value === undefined;
    };
    if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      const function_scope = cur_scope.pre();
      assert(function_scope.kind() === scopeKind.FUNC,
        `ArrayDeclarationGenerator: function_scope.kind() is not FUNC but ${function_scope.kind()}`);
      decl_db.set_vardecl_as_must_be_initialized(function_scope.id(), this.irnode!.id);
    }
    else if (inside_function_without_init()) {
      decl_db.set_vardecl_as_must_be_initialized(cur_scope.id(), this.irnode!.id);
    }
  }

  generate() : void {
    this.distill_type_range();
    this.start_flag();
    const arrayid = new_global_id();
    const array_name = generate_name(IDENTIFIER.VAR);
    this.irnode = new decl.IRVariableDeclaration(arrayid, cur_scope.id(), array_name);
    this.init_storage_location_range();
    this.generate_length();
    this.generate_base();
    decl_db.add_array_decl(arrayid, this.base!.id);
    this.update_type_range();
    type_dag.insert(arrayid, this.type_range);
    decl_db.if_array_decl_contain_mapping_decl(arrayid);
    this.generate_initializer();
    this.initialize_array_length();
    this.update_storage_location_range();
    decl_db.add_vardecl_with_scope(arrayid, cur_scope);
    this.update_vismut_dag(arrayid);
    this.array_must_be_initialized_if_in_function_return_scope_or_in_funcbody();
    if (decl_db.is_array_decl_that_contains_mapping_decl(arrayid)) {
      decl_db.set_vardecl_as_nonassignable(arrayid);
    }
    this.end_flag(array_name, arrayid);
  }
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

  private distill_type_range() {
    assert(this.type_range.some((t) => t.typeName === 'StructType'),
      `StructInstanceDeclarationGenerator: type_range should contain struct types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName === 'StructType');
    if (this.struct_id === undefined) {
      this.struct_id = pick_random_element(this.type_range.map(t => (t as type.StructType).referece_id))!;
    }
    assert(irnodes.has(this.struct_id), `StructInstanceDeclarationGenerator: struct_id ${this.struct_id} is not in irnodes`);
    assert(this.type_range.some((t) => (t as type.StructType).referece_id === this.struct_id),
      `StructInstanceDeclarationGenerator: struct_id ${this.struct_id} is not in the type_range ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => (t as type.StructType).referece_id === this.struct_id);
  }

  private start_flag(id : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Struct Instance Declaration ${id}, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private generate_initializer() {
    let initializer : expr.IRExpression | undefined;
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    assert(this.struct_id !== undefined, `StructInstanceDeclarationGenerator: this.struct_id is undefined`);
    if (!this.no_initializer && Math.random() < config.initialization_prob &&
      !decl_db.is_struct_decl_that_contains_mapping_decl(this.struct_id)) {
      const nid = new_global_id();
      type_dag.insert(nid, type_dag.solution_range_of(this.irnode.id)!);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_struct_gen = new NewStructGenerator(nid);
      new_struct_gen.generate(0);
      initializer = new_struct_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
  }

  private end_flag(struct_instance_name : string) {
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Struct Instance Declaration, name: ${struct_instance_name} scope: ${cur_scope.kind()}, type: ${type_dag.solution_range_of(this.irnode.id)!.map(t => t.str())}`));
    }
  }

  private init_storage_location_range() {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    if (inside_struct_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.MAPPING) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.storage_ref(),
        StorageLocationProvider.storage_pointer(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.calldata()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.STRUCT) {
    }
    else if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.memory()
      ]);
    }
    else {
      storage_location_dag.insert(this.irnode.id, [
        StorageLocationProvider.calldata(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_pointer()
      ]);
    }
    assert(this.struct_id !== undefined, `StructInstanceDeclarationGenerator: this.struct_id is undefined`);
    if (decl_db.is_struct_decl_that_contains_mapping_decl(this.struct_id)) {
      storage_location_dag.update(this.irnode.id, [
        StorageLocationProvider.storage_pointer(),
        StorageLocationProvider.storage_ref()
      ]);
    }
    assert(storage_location_dag.non_empty_solution_range_of(this.irnode.id),
      `StructInstanceDeclarationGenerator: storage_location_dag.non_empty_solution_range_of(${this.irnode.id}) is empty`);
  }

  private init_storage_location_range_for_ghost_members() {
    if (inside_struct_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    assert(storage_location_dag.has_solution_range(this.irnode!.id),
      `StructInstanceDeclarationGenerator: storage_location_dag doesn't have solution range of ${this.irnode!.id}`);
    update_storage_loc_range_for_compound_type(this.irnode!.id);
  }

  private assign_storage_location_range() {
    this.init_storage_location_range();
    /*
    !Members in the struct instance should be assigned storage location ranges
    !according to the struct instance declaration.
    !They are called ghost members.
    */
    this.init_storage_location_range_for_ghost_members();
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    assert(this.struct_id !== undefined, `StructInstanceDeclarationGenerator: this.struct_id is undefined`);
    const value = (this.irnode as decl.IRVariableDeclaration).value;
    if (value !== undefined && storage_location_dag.has_solution_range(this.irnode.id)) {
      assert(storage_location_dag.non_empty_solution_range_of(this.irnode.id),
        `StructInstanceDeclarationGenerator: storage_location_dag.non_empty_solution_range_of(${this.irnode.id}) is empty`);
      const initializer_id = expr.tuple_extraction(value).id;
      storage_location_dag.connect(initializer_id, this.irnode.id, "super_dominance");
      storage_location_dag.solution_range_alignment(initializer_id, this.irnode.id);
    }
  }

  private update_vismut_dag() {
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      vismut_dag.insert(this.irnode.id, all_var_vismut);
    }
  }

  private struct_instance_must_be_initialized_if_in_function_return_scope_or_in_funcbody() : void {
    assert(this.irnode !== undefined,
      `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    let inside_function_without_init = () => {
      return inside_function_body(cur_scope.kind()) &&
        (this.irnode! as decl.IRVariableDeclaration).value === undefined;
    };
    if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      const function_scope = cur_scope.pre();
      assert(function_scope.kind() === scopeKind.FUNC,
        `StructInstanceDeclarationGenerator: function_scope.kind() is not FUNC but ${function_scope.kind()}`);
      decl_db.set_vardecl_as_must_be_initialized(function_scope.id(), this.irnode!.id);
    }
    else if (inside_function_without_init()) {
      decl_db.set_vardecl_as_must_be_initialized(cur_scope.id(), this.irnode!.id);
    }
  }

  generate() : void {
    this.distill_type_range();
    const thisid = new_global_id();
    this.start_flag(thisid);
    const struct_instance_name = generate_name(IDENTIFIER.STRUCT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(thisid, cur_scope.id(), struct_instance_name);
    decl_db.pair_struct_instance_with_struct_decl(this.irnode.id, this.struct_id!);
    decl_db.add_struct_instance_decl(this.irnode.id);
    decl_db.add_vardecl_with_scope(this.irnode.id, cur_scope);
    type_dag.insert(this.irnode.id, this.type_range);
    this.generate_initializer();
    this.assign_storage_location_range();
    this.update_vismut_dag();
    this.struct_instance_must_be_initialized_if_in_function_return_scope_or_in_funcbody();
    if (decl_db.is_struct_decl_that_contains_mapping_decl(this.struct_id!)) {
      decl_db.set_vardecl_as_nonassignable(this.irnode.id);
    }
    this.end_flag(struct_instance_name);
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

  private distill_type_range() {
    assert(this.type_range.some((t) => t.typeName == 'ContractType'),
      `ContractInstanceDeclarationGenerator: type_range should contain contract types, but is ${this.type_range.map(t => t.str())}`);
    this.type_range = this.type_range.filter((t) => t.typeName == 'ContractType');
    assert(this.type_range.length === 1, `ContractInstanceDeclarationGenerator: type_range should contain only one contract type, but is ${this.type_range.map(t => t.str())}`);
  }

  private start_flag() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Instance Declaration, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private generate_initializer() {
    assert(this.irnode !== undefined, `ContractInstanceDeclarationGenerator: this.irnode is undefined`);
    let initializer : expr.IRExpression | undefined;
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      const nid = new_global_id();
      type_dag.insert(nid, this.type_range);
      type_dag.connect(nid, this.irnode.id, "super_dominance");
      const new_contract_gen = new NewContractGenerator(nid);
      new_contract_gen.generate(0);
      initializer = new_contract_gen.irnode as expr.IRExpression;
    }
    (this.irnode as decl.IRVariableDeclaration).value = initializer;
  }

  private update_vismut_dag() {
    assert(this.irnode !== undefined, `ContractInstanceDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      vismut_dag.insert(this.irnode.id, all_var_vismut);
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Contract Instance Declaration, scope: ${cur_scope.id()}, type: ${type_dag.solution_range_of(this.irnode!.id)!.map(t => t.str())}`));
    }
  }

  generate() : void {
    this.distill_type_range();
    this.start_flag();
    const contract_instance_name = generate_name(IDENTIFIER.CONTRACT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(new_global_id(), cur_scope.id(), contract_instance_name);
    type_dag.insert(this.irnode.id, this.type_range);
    this.generate_initializer();
    this.update_vismut_dag();
    decl_db.add_vardecl_with_scope(this.irnode.id, cur_scope);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    this.end_flag();
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

  private distill_type_range() {
    this.type_range = this.type_range.filter((t) => t.typeName === 'ElementaryType');
  }

  private start_flag() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Elementary Type Variable Decl, name is ${this.name}, type_range: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private update_vismut_dag() {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      vismut_dag.insert(this.irnode!.id, all_var_vismut);
    }
  }

  private generate_initializer() {
    if (!this.no_initializer && Math.random() < config.initialization_prob) {
      if (Math.random() < config.literal_prob) {
        const literal_id = new_global_id();
        type_dag.insert(literal_id, type_dag.solution_range_of(this.irnode!.id)!);
        const literal_gen = new LiteralGenerator(literal_id);
        const ghost_id = new_global_id();
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_dag.solution_range_of(this.irnode!.id)!);
        type_dag.connect(ghost_id, this.irnode!.id, "super_dominance");
        type_dag.connect(ghost_id, literal_id);
        literal_gen.generate(0);
        (this.irnode as decl.IRVariableDeclaration).value = literal_gen.irnode! as expr.IRExpression;
      }
      else {
        const expr_gen_prototype = get_exprgenerator(this.type_range);
        const expr_id = new_global_id();
        type_dag.insert(expr_id, type_dag.solution_range_of(this.irnode!.id)!);
        const expr_gen = new expr_gen_prototype(expr_id);
        expr_gen.generate(0);
        const extracted_expr = expr.tuple_extraction(expr_gen.irnode! as expr.IRExpression);
        if (extracted_expr!.typeName === "IRLiteral") {
          const ghost_id = new_global_id();
          new IRGhost(ghost_id, cur_scope.id());
          type_dag.insert(ghost_id, type_dag.solution_range_of(expr_id)!);
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
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Elementary Type Variable Decl, name: ${this.name}, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range_of(this.irnode!.id)!.map(t => t.str())}`));
    }
  }

  generate() : void {
    this.distill_type_range();
    this.start_flag();
    this.name = generate_name(IDENTIFIER.VAR);
    this.irnode = new decl.IRVariableDeclaration(new_global_id(), cur_scope.id(), this.name, undefined, StateVariableVisibility.Default);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    type_dag.insert(this.irnode.id, this.type_range);
    this.update_vismut_dag();
    //! First generate initializer, then add the variable declaration to the database
    //! Otherwise, assignment before declaration will be generated.
    this.generate_initializer();
    decl_db.add_vardecl_with_scope(this.irnode.id, cur_scope);
    this.end_flag();
  }
}

class VariableDeclarationGenerator extends DeclarationGenerator {
  no_initializer : boolean;
  must_be_in_contract_scope_if_mapping : boolean;
  type_range : type.Type[];
  cur_type_complex_level : number;
  constructor(cur_type_complex_level : number, type_range : type.Type[], no_initializer : boolean = true,
    must_be_in_contract_scope_if_mapping : boolean = false) {
    super();
    this.cur_type_complex_level = cur_type_complex_level;
    this.no_initializer = no_initializer;
    this.type_range = type_range;
    this.must_be_in_contract_scope_if_mapping = must_be_in_contract_scope_if_mapping
  }

  private distill_type_range() {
    //! Types containing (nested) mappings can only be parameters or return variables of internal or library functions.
    if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      this.type_range = this.type_range.filter(t => {
        return !(type.contain_mapping_type(t) && t.typeName === 'MappingType');
      })
    }
  }

  generate() : void {
    this.distill_type_range();
    const contain_element_types = this.type_range.some((t) => t.typeName === 'ElementaryType');
    const contain_contract_types = this.type_range.some((t) => t.typeName === 'ContractType');
    const contain_struct_types = this.type_range.some((t) => t.typeName === 'StructType');
    const contain_mapping_types = this.cur_type_complex_level <= config.type_complex_level &&
      this.type_range.some((t) => t.typeName === 'MappingType');
    const contain_array_types = this.cur_type_complex_level <= config.type_complex_level &&
      this.type_range.some((t) => t.typeName === 'ArrayType');
    assert(contain_element_types || contain_contract_types || contain_struct_types || contain_mapping_types || contain_array_types,
      `VariableDeclarationGenerator: type_range ${this.type_range.map(t => t.str())} should contain at least one elementary/contract/struct/mapping type`);
    let prob_sum = 0;
    let contract_type_prob = contain_contract_types ? config.contract_instance_prob : 0;
    prob_sum += contract_type_prob;
    let struct_type_prob = contain_struct_types ? config.struct_instance_prob : 0;
    prob_sum += struct_type_prob;
    let mapping_type_prob = contain_mapping_types ? config.mapping_prob : 0;
    prob_sum += mapping_type_prob;
    let array_type_prob = contain_array_types ? config.array_prob : 0;
    prob_sum += array_type_prob;
    let elementary_type_prob = contain_element_types ? 1 - struct_type_prob - contract_type_prob - mapping_type_prob - array_type_prob : 0;
    prob_sum += elementary_type_prob;
    contract_type_prob /= prob_sum;
    struct_type_prob /= prob_sum;
    elementary_type_prob /= prob_sum;
    mapping_type_prob /= prob_sum;
    array_type_prob /= prob_sum;
    //! Generate a contract-type variable
    if (contain_contract_types && Math.random() < contract_type_prob) {
      const contract_instance_gen = new ContractInstanceDeclarationGenerator(this.type_range, this.no_initializer);
      contract_instance_gen.generate();
      this.irnode = contract_instance_gen.irnode;
    }
    //! Generate a struct-type variable
    else if (contain_struct_types && Math.random() < contract_type_prob + struct_type_prob) {
      const struct_instance_gen = new StructInstanceDeclarationGenerator(this.type_range, this.no_initializer);
      struct_instance_gen.generate();
      this.irnode = struct_instance_gen.irnode;
    }
    //! Generate a mapping-type variable
    else if (contain_mapping_types && Math.random() < contract_type_prob + struct_type_prob + mapping_type_prob) {
      const mapping_gen = new MappingDeclarationGenerator(this.cur_type_complex_level, this.type_range, this.must_be_in_contract_scope_if_mapping);
      mapping_gen.generate();
      this.irnode = mapping_gen.irnode;
    }
    //! Generate a array-type variable
    else if (contain_array_types && Math.random() < contract_type_prob + struct_type_prob + mapping_type_prob + array_type_prob) {
      const array_gen = new ArrayDeclarationGenerator(this.cur_type_complex_level, this.type_range, this.no_initializer);
      array_gen.generate();
      this.irnode = array_gen.irnode;
    }
    else {
      const variable_gen = new ElementaryTypeVariableDeclarationGenerator(this.type_range, this.no_initializer);
      variable_gen.generate();
      this.irnode = variable_gen.irnode;
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
  body : stmt.IRStatement[] = [];

  constructor(has_body : boolean = true) {
    super();
    this.fid = new_global_id();
    decl_db.insert(this.fid, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONSTRUCTOR);
    this.function_scope = cur_scope.snapshot();
    cur_scope = cur_scope.rollback();
    this.has_body = has_body;
    this.parameter_count = random_int(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
    //! Find state variables in contract body scope
    this.state_variables_in_cur_contract_scope = decl_db.get_irnodes_ids_nonrecursively_from_a_scope(cur_scope.id())
      .filter((nid) => decl_db.is_state_variable(nid))
      .map((nid) => nid);
  }

  private start_flag_of_constructor_body() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Body`));
      indent += 2;
    }
  }

  private end_flag_of_constructor_body() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Constructor Body`));
    }
  }

  private initiaize_state_variables_in_cur_contract_scope() : boolean {
    const initializable_state_variables = this.state_variables_in_cur_contract_scope.filter((sid) => !decl_db.is_vardecl_nonassignable(sid));
    if (initializable_state_variables.length > 0 && Math.random() < config.init_state_var_in_constructor_prob) {
      const vardecl = irnodes.get(pick_random_element(initializable_state_variables)!) as decl.IRVariableDeclaration;
      const identifier = new expr.IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id);
      const expr_gen_prototype = get_exprgenerator(type_dag.solution_range_of(vardecl.id)!, 0, [FunctionCallGenerator]);
      const expr_id = new_global_id();
      type_dag.insert(expr_id, type_dag.solution_range_of(vardecl.id)!);
      const expr_gen = new expr_gen_prototype(expr_id);
      let ghost_id;
      if (expr_gen.generator_name === "LiteralGenerator") {
        ghost_id = new_global_id();
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_dag.solution_range_of(vardecl.id)!);
        type_dag.connect(ghost_id, expr_id);
        type_dag.connect(ghost_id, vardecl.id, "super_dominance");
      }
      else {
        type_dag.connect(expr_id, vardecl.id, "super_dominance");
      }
      expr_gen.generate(0);
      if (ghost_id === undefined) {
        type_dag.solution_range_alignment(expr_id, vardecl.id);
      }
      else {
        type_dag.solution_range_alignment(ghost_id, expr_id);
      }
      const expression = expr_gen.irnode! as expr.IRExpression;
      const assignment = new expr.IRAssignment(new_global_id(), cur_scope.id(), identifier, expression, "=");
      const assignment_stmt = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), assignment);
      this.body = this.body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      this.body.push(assignment_stmt);
      return true;
    }
    return false;
  }

  private generate_body_stmt() {
    const stmt_gen_prototype = get_stmtgenerator();
    const stmt_gen = new stmt_gen_prototype();
    stmt_gen.generate(0);
    this.body = this.body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
    unexpected_extra_stmt.delete(cur_scope.id());
    this.body.push(stmt_gen.irnode! as stmt.IRStatement);
  }

  generate_body() : void {
    assert(cur_scope.kind() === scopeKind.CONTRACT, `ConstructorDeclarationGenerator: scope kind should be CONTRACT, but is ${cur_scope.kind()}`);
    this.start_flag_of_constructor_body();
    if (!this.has_body) cur_scope = this.function_scope.snapshot();
    const body_stmt_count = random_int(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
    Array.from({ length: body_stmt_count }, () => {
      if (!this.initiaize_state_variables_in_cur_contract_scope()) {
        this.generate_body_stmt();
      }
    });
    this.end_flag_of_constructor_body();
    if (!this.has_body) cur_scope = cur_scope.rollback();
    (this.irnode as decl.IRFunctionDefinition).body = this.body;
  }

  private start_flag_of_constructor_decl() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Declaration: ${this.fid}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag_of_constructor_decl() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: Constructor Declaration, scope: ${cur_scope.kind()}`));
    }
  }

  //TODO: support modifiers
  private generate_modifiers() : decl.Modifier[] {
    return [];
  }

  private generate_parameters() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.CONSTRUCTOR_PARAMETERS);
    Array.from({ length: this.parameter_count }, () => {
      const variable_gen = new VariableDeclarationGenerator(0, all_types.filter((t) => t.typeName !== 'MappingType'));
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    });
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Parameters`));
    }
  }

  generate() : void {
    assert(cur_scope.kind() === scopeKind.CONTRACT, `ConstructorDeclarationGenerator: scope kind should be CONTRACT, but is ${cur_scope.kind()}`);
    cur_scope = this.function_scope.snapshot();
    this.start_flag_of_constructor_decl();
    const modifiers = this.generate_modifiers();
    this.generate_parameters();
    this.irnode = new decl.IRFunctionDefinition(this.fid, cur_scope.id(), "",
      FunctionKind.Constructor, false, false, this.parameters, [], [], modifiers,
      FunctionVisibility.Public, FunctionStateMutability.NonPayable);
    if (this.has_body) {
      this.generate_body();
    }
    cur_scope = cur_scope.rollback();
    this.end_flag_of_constructor_decl();
  }
}
class StructGenerator extends DeclarationGenerator {

  body : decl.IRVariableDeclaration[] = [];

  constructor() {
    super();
  }

  private start_flag(id : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Struct Definition: ${id}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag(id : number, struct_name : string) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${id}: Struct Definition, scope: ${cur_scope.kind()}, name: ${struct_name}`));
    }
  }

  private generate_member_variables(struct_id : number) {
    const member_variable_count = random_int(config.struct_member_variable_count_lowerlimit, config.struct_member_variable_count_upperlimit);
    cur_scope = cur_scope.new(scopeKind.STRUCT);
    for (let i = 0; i < member_variable_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(0, all_types, true);
      variable_gen.generate();
      (variable_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
      this.body.push(variable_gen.irnode! as decl.IRVariableDeclaration);
      decl_db.add_member_to_struct_decl(variable_gen.irnode!.id, struct_id);
    }
    cur_scope = cur_scope.rollback();
  }

  private add_struct_type(struct_id : number, struct_name : string) {
    const struct_type = new type.StructType(struct_id, struct_name, `struct ${cur_contract_name}.${struct_name}`);
    all_types.push(struct_type);
    user_defined_types.push(struct_type);
    if (cur_contract_id !== 0) {
      internal_struct_types.add(struct_type);
      const external_struct_name = cur_contract_name + "." + struct_name;
      const external_struct_type = new type.StructType(struct_id, external_struct_name, `struct ${cur_contract_name}.${struct_name}`);
      external_struct_type.add_sub(struct_type);
      external_struct_type.add_super(struct_type);
      struct_type.add_sub(external_struct_type);
      struct_type.add_super(external_struct_type);
      internal_struct_type_to_external_struct_type.set(struct_type, external_struct_type);
      all_types.push(external_struct_type);
      user_defined_types.push(external_struct_type);
    }
  }

  generate() : void {
    const thisid = new_global_id();
    this.start_flag(thisid);
    decl_db.insert(thisid, cur_scope.id());
    const struct_name = generate_name(IDENTIFIER.STRUCT);
    this.generate_member_variables(thisid);
    decl_db.if_struct_decl_contain_mapping_decl(thisid);
    this.irnode = new decl.IRStructDefinition(thisid, cur_scope.id(), struct_name, this.body);
    this.add_struct_type(thisid, struct_name);
    decl_db.add_structdecl(thisid);
    this.end_flag(thisid, struct_name);
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
  forbid_external_call : boolean;
  mapping_parameters_ids : number[] = [];
  mapping_return_decls_ids : number[] = [];
  storage_parameters : decl.IRVariableDeclaration[] = [];
  storage_return_decls : decl.IRVariableDeclaration[] = [];
  body_stmt_count = random_int(config.function_body_stmt_cnt_lower_limit, config.function_body_stmt_cnt_upper_limit);
  body : stmt.IRStatement[] = [];
  return_values : expr.IRExpression[] = [];
  // read_vardecls is a set that records the vardecls read by the body.
  read_vardecls : Set<number> = new Set<number>();
  // write_vardecls is a set that records the vardecls written by the body.
  write_vardecls : Set<number> = new Set<number>();

  constructor(has_body : boolean = true) {
    super();
    this.fid = new_global_id();
    decl_db.insert(this.fid, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.FUNC);
    this.function_scope = cur_scope.snapshot();
    cur_scope = cur_scope.rollback();
    this.has_body = has_body;
    this.return_count = random_int(config.return_count_of_function_lowerlimit, config.return_count_of_function_upperlimit);
    this.parameter_count = random_int(config.param_count_of_function_lowerlimit, config.param_count_of_function_upperlimit);
    this.forbid_external_call = false;
  }

  private get_visibility_range() : FuncVis[] {
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

  private get_state_mutability_range(read_state_variables : boolean, write_state_variables : boolean) : FuncStat[] {
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

  private get_vismut_range(read_state_variables : boolean, write_state_variables : boolean) : VisMut[] {
    const state_mutability_range = this.get_state_mutability_range(read_state_variables, write_state_variables);
    const visibility_range = this.get_visibility_range();
    return cartesian_product([visibility_range, state_mutability_range])
      .filter(([vis, stat]) => !(vis === FuncVisProvider.internal() && stat === FuncStatProvider.payable())
        && !(vis === FuncVisProvider.private() && stat === FuncStatProvider.payable()))
      .map(([vis, stat]) =>
        VisMutProvider.from_kind(
          VisMutKindProvider.combine_vis_mut(vis, stat)));
  }

  private build_connection_between_caller_and_callee(thisid : number) : void {
    /*
      Follow the rule of ConstraintDAG that if A dominates B, then the solution range of B
      is a superset of the solution range of A.
    */
    for (const called_function_decl_ID of decl_db.called_funcdecls_ids()) {
      if (decl_db.is_getter_function(called_function_decl_ID)) continue;
      if (called_function_decl_ID === thisid) continue;
      const ghost_id = new_global_id();
      new IRGhost(ghost_id, cur_scope.id());
      vismut_dag.insert(ghost_id, vismut_dag.solution_range_of(thisid)!);
      vismut_dag.connect(ghost_id, thisid, "super_dominance");
      vismut_dag.connect(ghost_id, called_function_decl_ID);
    }
    decl_db.clear_called_function_decls();
  }

  private throw_no_state_variable_signal_at_random() : void {
    if (Math.random() > 0.5) {
      // This is just a signal. It will not prevent the generation of state variables in the function body.
      // For instance, the generator may generate a mapping declaration and place it on the state variable
      // zone when generating the function body.
      no_state_variable_in_function_body = true;
    }
  }

  private clear_no_state_variable_signal() : void {
    no_state_variable_in_function_body = false;
  }

  private start_flag_of_func_body() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Body for ${this.fid}`));
      indent += 2;
    }
  }

  private end_flag_of_func_body() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Body for ${this.fid}. vismut range is ${vismut_dag.solution_range_of(this.irnode!.id)!.map(f => f.str())}`));
    }
  }

  private initialize_the_vardecls_that_must_be_initialized() {
    for (const init_stmt of initialize_the_vardecls_that_must_be_initialized(cur_scope.id())) {
      this.body.push(init_stmt);
    }
  }

  private generate_func_body_stmts() {
    for (let i = 0; i < this.body_stmt_count; i++) {
      const stmt_gen_prototype = get_stmtgenerator();
      const stmt_gen = new stmt_gen_prototype();
      stmt_gen.generate(0);
      this.body = this.body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      this.body.push(stmt_gen.irnode! as stmt.IRStatement);
    }
  }

  private generate_func_return_exprs() {
    if (Math.random() < config.return_prob) {
      this.return_decls.forEach((return_decl) => {
        //* Generate expr for return
        const expr_id = new_global_id();
        const type_range = type_dag.solution_range_of(return_decl.id)!;
        type_dag.insert(expr_id, type_range);
        const storage_loc_range = storage_location_dag.has_solution_range(return_decl.id) ?
          storage_location_dag.solution_range_of(return_decl.id)!.flatMap((s) => s.subs())
          : [];
        let expr_gen_prototype = get_exprgenerator(type_range, 0, [FunctionCallGenerator], storage_loc_range);
        const expr_gen = new expr_gen_prototype(expr_id);
        const ghost_id = connect_arguments_to_parameters(expr_id,
          return_decl.id,
          expr_gen.generator_name,
          type_range,
          storage_loc_range);
        expr_gen.generate(0);
        const exp = expr_gen.irnode! as expr.IRExpression;
        this.return_values.push(exp);
        this.body = this.body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
        unexpected_extra_stmt.delete(cur_scope.id());
        align_solution_ranges_of_arguments_and_parameters(expr_id, return_decl.id, ghost_id);
      });

      if (this.return_values.length === 0 && Math.random() > 0.5) { }
      else {
        const return_gen = new ReturnStatementGenerator(
          new expr.IRTuple(new_global_id(), cur_scope.id(), this.return_values)
        );
        return_gen.generate(0);
        this.body.push(return_gen.irnode! as stmt.IRStatement);
      }
    }
  }

  private analyze_what_vardecls_are_read_and_written_in_the_func_body() {
    for (const body_stmt of this.body) {
      const body_exprs = (body_stmt as stmt.IRStatement).exprs;
      if (body_exprs.length === 0) continue;
      for (let body_expr of body_exprs) {
        body_expr = expr.tuple_extraction(body_expr);
        for (const used_vardecl of expr_db.read_variables_of_expr(body_expr.id)!) {
          this.read_vardecls.add(used_vardecl);
          if (decl_db.is_getter_function_for_state_struct_instance(body_expr.id)) {
            const state_struct_instance_id = decl_db.state_struct_instance_of_getter_function(body_expr.id)!;
            this.read_vardecls.add(state_struct_instance_id);
          }
        }
        for (const written_vardecl of expr_db.write_variables_of_expr(body_expr.id)!) {
          this.write_vardecls.add(written_vardecl);
        }
        if (decl_db.is_getter_function_for_state_struct_instance(body_expr.id)) {
          const state_struct_instance_id = decl_db.state_struct_instance_of_getter_function(body_expr.id)!;
          this.write_vardecls.add(state_struct_instance_id);
        }
      }
    }
  }

  private update_vismut_dag_and_storage_dag_based_on_read_vardecls_and_write_vardecls() {
    let read_state_variables = false;
    let write_state_variables = false;
    for (const read_vardecl of this.read_vardecls) {
      if (decl_db.is_state_variable(read_vardecl)) {
        read_state_variables = true;
        break;
      }
      else if (decl_db.is_mapping_value(read_vardecl)) {
        let mapping_decl_id = decl_db.mapping_of_value(read_vardecl)!;
        while (decl_db.is_mapping_value(mapping_decl_id)) {
          mapping_decl_id = decl_db.mapping_of_value(mapping_decl_id)!;
        }
        if (decl_db.is_state_variable(mapping_decl_id)) {
          read_state_variables = true;
          break;
        }
      }
    }
    for (const write_vardecl of this.write_vardecls) {
      if (decl_db.is_state_variable(write_vardecl)) {
        write_state_variables = true;
        break;
      }
      else if (decl_db.is_mapping_value(write_vardecl)) {
        let mapping_decl_id = decl_db.mapping_of_value(write_vardecl)!;
        while (decl_db.is_mapping_value(mapping_decl_id)) {
          mapping_decl_id = decl_db.mapping_of_value(mapping_decl_id)!;
        }
        if (decl_db.is_state_variable(mapping_decl_id)) {
          write_state_variables = true;
          break;
        }
      }
    }
    if (noview_nopure_funcdecl) {
      read_state_variables = true;
      write_state_variables = true;
      noview_nopure_funcdecl = false;
    }
    if (nopure_funcdecl) {
      nopure_funcdecl = false;
      read_state_variables = true;
    }
    const vismut_range = this.get_vismut_range(read_state_variables, write_state_variables);
    vismut_dag.update(this.fid, vismut_range);
    const debug_vismug_range = vismut_dag.solution_range_of(this.fid)!;
    if (this.mapping_parameters_ids.length > 0 || this.mapping_return_decls_ids.length > 0) {
      vismut_dag.update(this.fid, closed_func_vismut);
    }
    else if (this.storage_parameters.length > 0 || this.storage_return_decls.length > 0) {
      const vismut_solution = vismut_dag.solution_range_of(this.fid)!;
      if (forbid_external_call) {
        // If forbid_external_call is set to true, then one of the storage parameters or return decls cannot be in memory or calldata.
        // Therefore, set this function's visibility to internal or private
        vismut_dag.update(this.fid, closed_func_vismut);
      }
      // If the function visibility can be internal or private, or 
      else if (vismut_solution.some((v) => closed_func_vismut.includes(v)) && Math.random() < 0.5) {
        // If this function can be internal or private, then with 50% probability,
        // we force the function to be internal or private.
        vismut_dag.update(this.fid, closed_func_vismut);
      }
      else {
        // Otherwise, we force the storage parameters and return decls to be in memory or calldata.
        // If any of the storage parameters or return decls cannot be in memory or calldata,
        // forbid_external_call is set to true, which is handled in the previous if block.
        this.storage_parameters.forEach((p) => {
          assert(storage_location_dag.has_solution_range(p.id),
            `storage_location_dag.solution_range should have ${p.id}`);
          storage_location_dag.update(p.id, [
            StorageLocationProvider.memory(),
            StorageLocationProvider.calldata()
          ]);
        });
        this.storage_return_decls.forEach((r) => {
          assert(storage_location_dag.has_solution_range(r.id),
            `storage_location_dag.solution_range should have ${r.id}`);
          storage_location_dag.update(r.id, [
            StorageLocationProvider.memory(),
            StorageLocationProvider.calldata()
          ]);
        });
      }
    }
    assert(vismut_dag.solution_range_of(this.fid)!.length > 0,
      `FunctionDeclarationGenerator: vismut_dag.solution_range[${this.fid}] should not be empty
       read_state_variables is ${read_state_variables}, write_state_variables is ${write_state_variables}
       noview_nopure_funcdecl is ${noview_nopure_funcdecl},
       external_call is ${external_call}, forbid_external_call is ${forbid_external_call}
       debug_vismug_range is ${debug_vismug_range.map(f => f.str())}`);
  }

  generate_function_body() : void {
    noview_nopure_funcdecl = false;
    nopure_funcdecl = false;
    if (!this.has_body) cur_scope = this.function_scope.snapshot();
    //! Generate function body. Body includes exprstmts and the return stmt.
    external_call = false;
    forbid_external_call = this.forbid_external_call;
    this.throw_no_state_variable_signal_at_random();
    this.start_flag_of_func_body();
    this.initialize_the_vardecls_that_must_be_initialized();
    this.generate_func_body_stmts();
    this.generate_func_return_exprs();
    this.analyze_what_vardecls_are_read_and_written_in_the_func_body();
    this.update_vismut_dag_and_storage_dag_based_on_read_vardecls_and_write_vardecls();
    this.build_connection_between_caller_and_callee(this.irnode!.id);
    (this.irnode as decl.IRFunctionDefinition).body = this.body;
    this.clear_no_state_variable_signal();
    if (!this.has_body) cur_scope = cur_scope.rollback();
    this.end_flag_of_func_body();
    external_call = false;
    forbid_external_call = false;
  }

  private forbid_external_call_if_required() : void {
    this.mapping_parameters_ids = this.parameters.filter((p) => decl_db.is_mapping_decl(p.id)).map((p) => p.id);
    this.mapping_return_decls_ids = this.return_decls.filter((r) => decl_db.is_mapping_decl(r.id)).map((r) => r.id);
    this.storage_parameters = this.parameters.filter((p) =>
      storage_location_dag.has_solution_range(p.id) &&
      storage_location_dag.solution_range_of(p.id)!.includes(StorageLocationProvider.storage_pointer())
    );
    this.storage_return_decls = this.return_decls.filter((r) =>
      storage_location_dag.has_solution_range(r.id) &&
      storage_location_dag.solution_range_of(r.id)!.includes(StorageLocationProvider.storage_pointer())
    );
    if (this.mapping_parameters_ids.length > 0 || this.mapping_return_decls_ids.length > 0) {
      // If the function has mapping parameters or return values, then they must be declared in storage location.
      // Therefore, the function cannot be public or external.
      // Thus external calls (function calls to functions in other contracts) are not allowed in the function body.
      this.forbid_external_call = true;
    }
    // If there exist storage parameters or return values whose storage location does not include memory or calldata,
    // then the function cannot be public or external. Therefore, the function cannot have function calls to functions in other contracts.
    // That's why we set forbid_external_call to true.
    this.storage_parameters.forEach((p) => {
      assert(storage_location_dag.has_solution_range(p.id),
        `storage_location_dag.solution_range should have ${p.id}`);
      if (!storage_location_dag.solution_range_of(p.id)!.includes(StorageLocationProvider.memory()) &&
        !storage_location_dag.solution_range_of(p.id)!.includes(StorageLocationProvider.calldata())) {
        this.forbid_external_call = true;
      }
    });
    this.storage_return_decls.forEach((r) => {
      assert(storage_location_dag.has_solution_range(r.id),
        `storage_location_dag.solution_range should have ${r.id}`);
      if (!storage_location_dag.solution_range_of(r.id)!.includes(StorageLocationProvider.memory()) &&
        !storage_location_dag.solution_range_of(r.id)!.includes(StorageLocationProvider.calldata())) {
        this.forbid_external_call = true;
      }
    });
  }

  private start_flag_of_func_decl(func_name : string) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Definition ${this.fid} ${func_name}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag_of_func_decl(func_name : string) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.fid}: Function ${func_name}, vismut range is ${vismut_dag.solution_range_of(this.fid)!.map(f => f.str())}, scope: ${cur_scope.kind()}`));
    }
  }

  private start_flag_of_func_params() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
  }

  private end_flag_of_func_params() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Parameters`));
    }
  }

  private generate_func_params() {
    cur_scope = cur_scope.new(scopeKind.FUNC_PARAMETER);
    this.start_flag_of_func_params();
    for (let i = 0; i < this.parameter_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(0, all_types, true);
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
    this.end_flag_of_func_params();
    cur_scope = cur_scope.rollback();
  }

  private start_flag_of_func_return_decls() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Return Decls, ${this.return_count} in total`));
      indent += 2;
    }
  }

  private end_flag_of_func_return_decls() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Function Return Decls`));
    }
  }

  private generate_func_return_decls() {
    cur_scope = cur_scope.new(scopeKind.FUNC_RETURNS);
    this.start_flag_of_func_return_decls();
    Array.from({ length: this.return_count }, (_) => {
      //* Generate the returned vardecl. For instance, in the following code:
      //* function f() returns (uint a, uint b) { return (1, 2); }
      //* We generate two returned vardecls for a and b.
      const variable_gen = new VariableDeclarationGenerator(0, all_types, true);
      variable_gen.generate();
      this.return_decls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    });
    this.end_flag_of_func_return_decls();
    cur_scope = cur_scope.rollback();
  }

  private update_vismut_dag() {
    if (this.forbid_external_call) {
      vismut_dag.update(this.fid, closed_func_vismut);
    }
  }

  generate() : void {
    vismut_dag.insert(this.fid, all_func_vismut);
    const modifiers : decl.Modifier[] = [];
    //TODO: fill the modifiers
    let name = generate_name(IDENTIFIER.FUNC);
    const virtual = virtual_env;
    const overide = override_env;
    cur_scope = this.function_scope.snapshot();
    this.start_flag_of_func_decl(name);
    this.generate_func_params();
    this.generate_func_return_decls();
    this.forbid_external_call_if_required();
    this.update_vismut_dag();
    this.irnode = new decl.IRFunctionDefinition(this.fid, cur_scope.id(), name,
      FunctionKind.Function, virtual, overide, this.parameters, this.return_decls, [], modifiers);
    decl_db.add_funcdecl(this.fid);
    if (this.has_body) {
      this.generate_function_body();
    }
    cur_scope = cur_scope.rollback();
    this.end_flag_of_func_decl(name);
  }
}

class ContractDeclarationGenerator extends DeclarationGenerator {

  body : IRNode[] = [];
  constructor_parameters : decl.IRVariableDeclaration[] = [];
  constructor_gen : ConstructorDeclarationGenerator | undefined;
  function_gens : FunctionDeclarationGenerator[] = [];

  constructor() { super(); }

  private start_flag_of_getter_function(fid : number, var_name : string) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating getter function ${fid} for state variable ${var_name}`));
      indent += 2;
    }
  }

  private end_flag_of_getter_function(fid : number, var_name : string) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)} Getter function ${fid} for state variable ${var_name}`));
    }
  }

  private generate_getter_function_for_contract_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    const fid = new_global_id();
    this.start_flag_of_getter_function(fid, variable_decl.name);
    decl_db.add_funcdecl(fid);
    decl_db.insert(fid, cur_scope.id());
    decl_db.add_getter_function(fid);
    vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
    new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
      false, false, [], [variable_decl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
    this.end_flag_of_getter_function(fid, variable_decl.name);
  }

  private generate_getter_function_for_elementary_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    const fid = new_global_id();
    this.start_flag_of_getter_function(fid, variable_decl.name);
    decl_db.add_funcdecl(fid);
    decl_db.insert(fid, cur_scope.id());
    decl_db.add_getter_function(fid);
    vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
    new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
      false, false, [], [variable_decl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
    this.end_flag_of_getter_function(fid, variable_decl.name);
  }

  private generate_getter_function_for_struct_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    const type_range_of_vardecl = type_dag.solution_range_of(variable_decl.id)!;
    //! Different struct types require different getter functions.
    //! Therefore, Erwin creates a getter function for each struct type, and may abandon some of them later
    //! based on the constraints of the ConstraintDAG.
    const struct_names = type_range_of_vardecl.map(t => (t as type.StructType).name).filter(name => !name.includes('.'));
    for (const struct_name of struct_names) {
      const fid = new_global_id();
      this.start_flag_of_getter_function(fid, variable_decl.name);
      const struct_decl = decl_db.find_structdecl_by_name(struct_name)!;
      const members = struct_decl.members.filter(
        (member) => type_dag.solution_range_of(member.id)!.every(
          (t) => t.typeName !== 'MappingType' && t.typeName !== 'ArrayType')
      );
      if (members.length === 0) {
        continue;
      }
      decl_db.add_funcdecl(fid);
      decl_db.insert(fid, cur_scope.id());
      decl_db.add_getter_function(fid);
      vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, [], members, [], [], FunctionVisibility.External, FunctionStateMutability.View);
      decl_db.map_getter_function_to_state_struct_instance(fid, variable_decl.id, struct_decl.id);
      this.end_flag_of_getter_function(fid, variable_decl.name);
    }
  }

  private generate_getter_function_for_mapping_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    const fid = new_global_id();
    this.start_flag_of_getter_function(fid, variable_decl.name);
    decl_db.add_funcdecl(fid);
    decl_db.add_getter_function_to_state_mapping_decl(fid, variable_decl.id);
    decl_db.add_getter_function(fid);
    decl_db.insert(fid, cur_scope.id());
    vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
    const key_decl = irnodes.get(decl_db.key_of_mapping(variable_decl.id)) as decl.IRVariableDeclaration;
    const parameters : decl.IRVariableDeclaration[] = [key_decl];
    let value_decl = irnodes.get(decl_db.value_of_mapping(variable_decl.id)) as decl.IRVariableDeclaration;
    while (value_decl.typeName === 'MappingType') {
      const key_decl = irnodes.get(decl_db.key_of_mapping(value_decl.id)) as decl.IRVariableDeclaration;
      parameters.push(key_decl);
      value_decl = irnodes.get(decl_db.value_of_mapping(value_decl.id)) as decl.IRVariableDeclaration;
    }
    new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
      false, false, parameters, [value_decl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
    this.end_flag_of_getter_function(fid, variable_decl.name);
  }

  private generate_getter_function(variable_decl : decl.IRVariableDeclaration) {
    assert(type_dag.has_solution_range(variable_decl.id),
      `ContractDeclarationGenerator: type_dag.solution_range should have ${variable_decl.id}`);
    const type_range_of_vardecl = type_dag.solution_range_of(variable_decl.id)!;
    const isstructdecl = type_range_of_vardecl.every((t) => t.kind === type.TypeKind.StructType);
    const iscontractdecl = type_range_of_vardecl.every((t) => t.kind === type.TypeKind.ContractType);
    const iselementarydecl = type_range_of_vardecl.every((t) => t.kind === type.TypeKind.ElementaryType);
    const ismappingdecl = type_range_of_vardecl.every((t) => t.kind === type.TypeKind.MappingType);
    const isarraydecl = type_range_of_vardecl.every((t) => t.kind === type.TypeKind.ArrayType);
    assert((isstructdecl ? 1 : 0) + (iscontractdecl ? 1 : 0) + (iselementarydecl ? 1 : 0) + (ismappingdecl ? 1 : 0) + (isarraydecl ? 1 : 0) === 1,
      `ContractDeclarationGenerator: type_range_of_vardecl ${type_range_of_vardecl.map(t => t.str())} should contain only one type.
       isstructdecl is ${isstructdecl}, iscontractdecl is ${iscontractdecl}, iselementarydecl is ${iselementarydecl}, ismappingdecl is ${ismappingdecl}, isarraydecl is ${isarraydecl}`);
    if (iselementarydecl) {
      this.generate_getter_function_for_elementary_type_state_variable(variable_decl);
    }
    else if (iscontractdecl) {
      this.generate_getter_function_for_contract_type_state_variable(variable_decl);
    }
    else if (isstructdecl) {
      this.generate_getter_function_for_struct_type_state_variable(variable_decl);
    }
    else if (ismappingdecl) {
      this.generate_getter_function_for_mapping_type_state_variable(variable_decl);
    }
  }

  private start_flag_of_contract_decl(id : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Definition: ${id}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag_of_contract_decl(id : number) {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${id}: Contract, scope: ${cur_scope.kind()}`));
    }
  }

  private generate_struct_decls() {
    if (Math.random() < config.struct_prob) {
      const struct_gen = new StructGenerator();
      struct_gen.generate();
      this.body.push(struct_gen.irnode!);
    }
  }

  private generate_state_variables() {
    let state_variable_count = random_int(config.state_variable_count_lowerlimit, config.state_variable_count_upperlimit);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating State Variables: ${state_variable_count} in total as planned`));
      indent += 2;
    }
    //* Generate state variables and randomly assigns values to these variables
    const local_state_variables : decl.IRVariableDeclaration[] = [];
    for (let i = 0; i < state_variable_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(0, all_types, false);
      variable_gen.generate();
      const variable_decl = variable_gen.irnode as decl.IRVariableDeclaration;
      variable_decl.state = true;
      variable_decl.loc = DataLocation.Default;
      local_state_variables.push(variable_decl);
      if (unexpected_extra_stmt.has(cur_scope.id())) {
        for (const stmt of unexpected_extra_stmt.get(cur_scope.id())!) {
          assert(stmt.typeName === "IRVariableDeclarationStatement",
            `ContractDeclarationGenerator: stmt is not IRVariableDeclarationStatement, but is ${stmt.typeName}`);
          for (const vardecl of (stmt as stmt.IRVariableDeclarationStatement).variable_declares) {
            assert(vardecl !== null, "ContractDeclarationGenerator: vardecl is null");
            decl_db.add_state_variable(vardecl.id);
            decl_db.remove_vardecl(vardecl.id);
            vardecl.value = (stmt as stmt.IRVariableDeclarationStatement).value;
            this.body.push(vardecl);
            local_state_variables.push(vardecl);
          }
        }
      }
      unexpected_extra_stmt.delete(cur_scope.id());
      this.body.push(variable_decl);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}State Variables, ${local_state_variables.length} in total practically`));
    }
    //* For each state variable, generate a external view function with the same identifier name as the state variable.
    for (let variable_decl of local_state_variables) {
      this.generate_getter_function(variable_decl);
    }
  }

  private generate_constructor_decl() {
    if (Math.random() < config.constructor_prob) {
      this.constructor_gen = new ConstructorDeclarationGenerator(false);
      this.constructor_gen.generate();
      this.body.push(this.constructor_gen.irnode!);
      this.constructor_parameters = this.constructor_gen.parameters;
    }
  }

  private generate_constructor_body() {
    if (this.constructor_gen !== undefined) {
      this.constructor_gen.generate_body();
    }
  }

  private generate_function_decls() {
    const function_count_per_contract_upper_limit = random_int(config.function_count_per_contract_lower_limit,
      config.function_count_per_contract_upper_limit);
    //* To allow circular function calls, Erwin first generates function declarations and then generates function bodies.
    Array.from({ length: function_count_per_contract_upper_limit }, () => {
      const function_gen = new FunctionDeclarationGenerator(false);
      function_gen.generate();
      this.function_gens.push(function_gen);
      this.body.push(function_gen.irnode!);
    });
  }

  private generate_function_bodies() {
    this.function_gens.forEach((function_gen) => {
      function_gen.generate_function_body();
    });
  }

  private add_contract_type(id : number, contract_name : string) {
    const contract_type = new type.ContractType(id, contract_name);
    all_types.push(contract_type);
    contract_types.set(id, contract_type);
    user_defined_types.push(contract_type)
  }

  generate() : void {
    const thisid = new_global_id();
    cur_contract_id = thisid;
    this.start_flag_of_contract_decl(thisid);
    assert(cur_scope.kind() === scopeKind.GLOBAL,
      `Contracts' scope must be global, but is ${cur_scope.kind()}`);
    decl_db.insert(thisid, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONTRACT);
    decl_db.add_contractdecl_scope(cur_scope.id(), thisid);
    const contract_name = generate_name(IDENTIFIER.CONTRACT);
    cur_contract_name = contract_name;
    this.irnode = new decl.IRContractDefinition(thisid, cur_scope.id(), contract_name,
      ContractKind.Contract, false, false, [], [], [], [], []);
    this.generate_struct_decls();
    this.generate_state_variables();
    decl_db.insert_yin_contract(cur_scope.id(), thisid);
    this.generate_constructor_decl();
    this.generate_function_decls();
    this.generate_constructor_body();
    this.generate_function_bodies();
    cur_scope = cur_scope.rollback();
    (this.irnode as decl.IRContractDefinition).body = (this.irnode as decl.IRContractDefinition).body.concat(this.body);
    (this.irnode as decl.IRContractDefinition).constructor_parameters = this.constructor_parameters;
    this.add_contract_type(thisid, contract_name);
    decl_db.insert_yang_contract(cur_scope.id(), thisid);
    cur_contract_id = 0;
    cur_contract_name = '';
    this.end_flag_of_contract_decl(thisid);
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
    assert(type_dag.has_solution_range(id), `ExpressionGenerator: type_dag.solution_range does not have id ${id}`);
    this.type_range = type_dag.solution_range_of(id)!;
  }

  protected wrap_in_a_tuple() {
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(new_global_id(), cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }

  abstract generate(cur_expression_complex_level : number) : void;
}

abstract class CallExpressionGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }

  protected generate_argument_from_parameters(cur_expression_complex_level : number,
    parameters : decl.IRVariableDeclaration[]) {
    const args_ids : number[] = [];
    parameters.forEach((parameter) => {
      const argid = new_global_id();
      args_ids.push(argid);
      //! Clear dropped-out types, such as local struct types.
      const type_range = type_dag.solution_range_of(parameter.id)!.filter(
        t => all_types.some(g => g.same(t)) || t.typeName === "MappingType" || t.typeName === "ArrayType"
      );
      type_dag.insert(argid, type_range);
      const storage_loc_range = storage_location_dag.has_solution_range(parameter.id) ?
        storage_location_dag.solution_range_of(parameter.id)!.flatMap((s) => s.subs())
        : [];
      let arg_gen_prototype = get_exprgenerator(type_range, cur_expression_complex_level + 1);
      const arg_gen = new arg_gen_prototype(argid);
      const ghost_id = connect_arguments_to_parameters(argid, parameter.id, arg_gen.generator_name, type_range, storage_loc_range);
      arg_gen.generate(cur_expression_complex_level + 1);
      align_solution_ranges_of_arguments_and_parameters(argid, parameter.id, ghost_id);
    });
    return args_ids;
  }
}

class LiteralGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }

  generate(_ : number) : void {
    this.type_range = [...intersection(new Set<type.Type>(this.type_range), new Set<type.Type>(type.elementary_types))];
    assert(this.type_range.length > 0, `LiteralGenerator: type_range ${this.type_range.map(t => t.str())} is invalid`);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal ${this.id}: ${this.type_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
    }
    type_dag.update(this.id, this.type_range);
    this.irnode = new expr.IRLiteral(this.id, cur_scope.id());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.kind()}, type: ${type_dag.solution_range_of(this.irnode.id)!.map(t => t.str())}`));
    this.wrap_in_a_tuple();
  }
}

class IdentifierGenerator extends ExpressionGenerator {
  left : boolean;
  variable_decl : decl.IRVariableDeclaration | undefined;
  available_vardecl : decl.IRVariableDeclaration[] = [];
  cur_expression_complex_level : number = 0;
  //! Since the selected variable may be a struct member, we need to store the instance id of the struct.
  //! In this situation, the identifier is actually a member access from the struct instance.
  private struct_instance_id : number | undefined;
  constructor(id : number, left : boolean = false) {
    super(id);
    this.left = left;
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Identifier ${this.variable_decl === undefined ? '' : `--> ${this.variable_decl.id}`}, scope: ${cur_scope.kind()}, type: ${type_range_str}`));
    }
  }

  private generate_var_decl() : void {
    let roll_back = false;
    let snapshot_scope = cur_scope.snapshot();
    if (unexpected_extra_stmt_belong_to_the_parent_scope()) {
      roll_back = true;
      cur_scope = cur_scope.rollback();
    }
    const variable_decl_gen = new VariableDeclarationGenerator(0, this.type_range, false, true);
    variable_decl_gen.generate();
    this.variable_decl = variable_decl_gen.irnode! as decl.IRVariableDeclaration;
    const variable_decl_stmt = new stmt.IRVariableDeclarationStatement(
      new_global_id(), cur_scope.id(), [variable_decl_gen.irnode! as decl.IRVariableDeclaration],
      this.variable_decl.value!
    );
    if (this.variable_decl.value !== undefined) {
      (variable_decl_stmt as stmt.IRStatement).exprs = [expr.tuple_extraction(this.variable_decl.value!)];
    }
    this.variable_decl.value = undefined;
    if (!decl_db.is_mapping_decl(this.variable_decl.id)) {
      if (unexpected_extra_stmt.has(cur_scope.id())) {
        unexpected_extra_stmt.get(cur_scope.id())!.push(variable_decl_stmt);
        for (const initialization of initialize_the_vardecls_that_must_be_initialized(cur_scope.id())) {
          unexpected_extra_stmt.get(cur_scope.id())!.push(initialization);
        }
      }
      else {
        unexpected_extra_stmt.set(cur_scope.id(), [variable_decl_stmt,
          ...initialize_the_vardecls_that_must_be_initialized(cur_scope.id())]);
      }
    }
    if (roll_back) {
      cur_scope = snapshot_scope.snapshot();
    }
  }

  private get_available_vardecls() {
    this.available_vardecl = get_available_vardecls_with_type_constraint(this.type_range);
    if (this.left) {
      this.available_vardecl = this.available_vardecl.filter(irdecl => !decl_db.is_vardecl_nonassignable(irdecl.id));
    }
  }

  private all_available_vardecls_are_struct_members_of_array_or_mapping_type() : boolean {
    return this.available_vardecl.every(irdecl => decl_db.is_member_of_struct_decl(irdecl.id) &&
      (decl_db.is_array_decl(irdecl.id) || decl_db.is_mapping_decl(irdecl.id)));
  }

  private should_generate_a_new_var_decl() : boolean {
    return this.available_vardecl.length === 0 || Math.random() < config.vardecl_prob
      || this.all_available_vardecls_are_struct_members_of_array_or_mapping_type() && Math.random() < 0.5;
  }

  private generate_a_temporary_contract_instance_expr() : expr.IRExpression {
    const new_contract_gen = new NewContractGenerator(this.id);
    new_contract_gen.generate(this.cur_expression_complex_level + 1);
    const contract_instance_expr = new_contract_gen.irnode as expr.IRExpression;
    const extracted_contract_instance_expr = expr.tuple_extraction(contract_instance_expr);
    expr_db.transfer_read_variables(this.id, extracted_contract_instance_expr.id);
    expr_db.transfer_write_variables(this.id, extracted_contract_instance_expr.id);
    return contract_instance_expr;
  }

  private this_identifier_can_be_a_temporary_contract_instance() : boolean {
    return !this.left && Math.random() < config.new_prob;
  }

  private dicide_between_contract_type_and_struct_type() {
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
    return contain_contract_types;
  }

  private should_generate_a_temporary_struct_instance(struct_decl_id : number) : boolean {
    return !this.left && Math.random() < config.new_prob &&
      !decl_db.is_struct_decl_that_contains_mapping_decl(struct_decl_id);
  }

  private this_identifier_can_be_a_temporary_struct_instance(struct_decl_id : number) : boolean {
    assert(storage_location_dag.has_solution_range(struct_decl_id),
      `IdentifierGenerator: storage_location_dag.solution_range should have ${struct_decl_id}`);
    return !this.left && Math.random() < config.new_prob &&
      !decl_db.is_struct_decl_that_contains_mapping_decl(struct_decl_id) &&
      storage_location_dag.solution_range_of(struct_decl_id)!.includes(StorageLocationProvider.memory());
  }

  private generate_a_temporary_struct_instantiation_expr(id : number) : expr.IRExpression {
    const new_struct_gen = new NewStructGenerator(id);
    new_struct_gen.generate(this.cur_expression_complex_level + 1);
    const struct_instance_expr = new_struct_gen.irnode as expr.IRExpression;
    const extracted_struct_instance_expr = expr.tuple_extraction(struct_instance_expr);
    expr_db.transfer_read_variables(id, extracted_struct_instance_expr.id);
    expr_db.transfer_write_variables(id, extracted_struct_instance_expr.id);
    storage_location_dag.insert(id, [StorageLocationProvider.memory()]);
    return struct_instance_expr;
  }

  private generate_a_new_var_decl() : void {
    const contain_element_types = this.type_range.some(t => t.typeName === "ElementaryType");
    const contain_mapping_types = this.type_range.some(t => t.typeName === "MappingType");
    const contain_array_types = this.type_range.some(t => t.typeName === "ArrayType");
    if (contain_element_types || contain_mapping_types || contain_array_types) {
      this.generate_var_decl();
    }
    else {
      const is_contract_type = this.dicide_between_contract_type_and_struct_type();
      if (is_contract_type) {
        if (this.this_identifier_can_be_a_temporary_contract_instance()) {
          this.irnode = this.generate_a_temporary_contract_instance_expr();
        }
        else {
          this.generate_var_decl();
        }
      }
      else {
        assert(this.type_range.length === 1,
          `IdentifierGenerator: this.type_range.length should be 1, but is ${this.type_range.length}`);
        const struct_type = this.type_range[0] as type.StructType;
        const struct_decl = decl_db.find_structdecl_by_name(struct_type.name)!;
        if (this.this_identifier_can_be_a_temporary_struct_instance(struct_decl.id)) {
          this.irnode = this.generate_a_temporary_struct_instantiation_expr(this.id);
        }
        else {
          this.generate_var_decl();
        }
      }
    }
  }

  private generate_expr_when_selected_vardecl_is_a_mapping_value(id : number) : expr.IRExpression {
    const mapping_decl_id = decl_db.mapping_of_value(id)!;
    if (!decl_db.is_state_variable(mapping_decl_id) &&
      inside_function_body(cur_scope.kind())) {
      noview_nopure_funcdecl = true;
    }
    let index_access;
    let cur_id = id;
    let real_variable_decl_id;
    let outermost_index_access : expr.IRExpression;
    while (decl_db.is_mapping_value(cur_id)) {
      const mapping_decl_id = decl_db.mapping_of_value(cur_id)!;
      real_variable_decl_id = mapping_decl_id;
      //* Generate an expr to be the key of the mapping.
      const key_id = decl_db.key_of_mapping(mapping_decl_id)!;
      const type_range = type_dag.solution_range_of(key_id)!
      const expr_gen_prototype = get_exprgenerator(type_range, this.cur_expression_complex_level + 1);
      const expr_id = new_global_id();
      type_dag.insert(expr_id, type_range);
      let ghost_id;
      const expr_gen = new expr_gen_prototype(expr_id);
      if (expr_gen.generator_name === "LiteralGenerator") {
        ghost_id = new_global_id();
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_range);
        type_dag.connect(ghost_id, expr_id);
        type_dag.connect(ghost_id, key_id, "super_dominance");
      }
      else {
        type_dag.connect(expr_id, key_id, "super_dominance");
      }
      expr_gen.generate(this.cur_expression_complex_level + 1);
      if (ghost_id === undefined) {
        type_dag.solution_range_alignment(expr_id, key_id);
      }
      else {
        type_dag.solution_range_alignment(ghost_id, expr_id);
      }
      if (index_access === undefined) {
        index_access = new expr.IRIndexedAccess(new_global_id(), cur_scope.id(),
          new expr.IRIdentifier(new_global_id(), cur_scope.id(),
            (irnodes.get(mapping_decl_id)! as decl.IRVariableDeclaration).name,
            mapping_decl_id),
          expr_gen.irnode! as expr.IRExpression
        );
      }
      else {
        let index_access_cp = index_access;
        outermost_index_access = index_access;
        while (true) {
          if ((index_access_cp as expr.IRIndexedAccess).base.typeName === "IRIndexedAccess") {
            index_access = (index_access as expr.IRIndexedAccess).base;
            continue;
          }
          else {
            assert((index_access_cp as expr.IRIndexedAccess).base.typeName === "IRIdentifier",
              `IdentifierGenerator: index_access_cp.base.typeName is not IRIdentifier, but is ${index_access_cp.typeName}`);
            outermost_index_access =
              new expr.IRIndexedAccess(new_global_id(), cur_scope.id(),
                new expr.IRIdentifier(new_global_id(), cur_scope.id(),
                  (irnodes.get(mapping_decl_id)! as decl.IRVariableDeclaration).name, mapping_decl_id),
                expr_gen.irnode! as expr.IRExpression);
            (index_access_cp as expr.IRIndexedAccess).base = outermost_index_access;
            break;
          }
        }
      }
      cur_id = mapping_decl_id;
    }
    assert(real_variable_decl_id !== undefined,
      `IdentifierGenerator: real_variable_decl_id is undefined when the variable_decl is of mapping type`);
    expr_db.expr_reads_variable(this.id, real_variable_decl_id!);
    if (this.left) {
      expr_db.expr_writes_variable(this.id, real_variable_decl_id!);
    }
    if (decl_db.is_member_of_struct_decl(mapping_decl_id)) {
      const struct_constructor = this.generate_expr_when_selected_vardecl_is_a_struct_member(irnodes.get(mapping_decl_id) as decl.IRVariableDeclaration);
      struct_constructor.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = struct_constructor;
      return index_access!;
    }
    else if (decl_db.is_base_decl(mapping_decl_id)) {
      const array_instance = this.generate_expr_when_selected_vardecl_is_an_array_element(mapping_decl_id);
      array_instance.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = array_instance;
      return index_access!;
    }
    else if (decl_db.is_mapping_value(mapping_decl_id)) {
      const mapping_instance = this.generate_expr_when_selected_vardecl_is_a_mapping_value(mapping_decl_id);
      mapping_instance.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = mapping_instance;
      return index_access!;
    }
    else {
      index_access!.id = this.id;
      return index_access!;
    }
  }

  private generate_expr_when_selected_vardecl_is_an_array_element(id : number) : expr.IRExpression {
    let cur_id = id;
    let index_access : expr.IRExpression | undefined;
    let real_variable_decl_id;
    let outermost_index_access : expr.IRExpression;
    assert(decl_db.is_base_decl(cur_id),
      `IdentifierGenerator: cur_id ${cur_id} is not a base_decl`);
    while (decl_db.is_base_decl(cur_id)) {
      const array_decl_id = decl_db.array_of_base(cur_id)!;
      real_variable_decl_id = array_decl_id;
      const array_type_range = type_dag.solution_range_of(array_decl_id)!;
      const lengths = [...new Set<number | undefined>(array_type_range.map(t => (t as type.ArrayType).length))];
      assert(lengths.length === 1, `IdentifierGenerator: more than one length ${lengths} for array_decl_id ${array_decl_id}`);
      const length = lengths[0];
      const expr_type_range = type.uinteger_types.filter(t => all_types.some(g => g.same(t)));
      const expr_gen_prototype = get_exprgenerator(
        expr_type_range,
        this.cur_expression_complex_level + 1
      );
      const expr_id = new_global_id();
      type_dag.insert(expr_id, expr_type_range);
      const expr_gen = new expr_gen_prototype(expr_id);
      expr_gen.generate(this.cur_expression_complex_level + 1);
      if (expr_gen.generator_name === "LiteralGenerator") {
        const literal_expr = expr_gen.irnode as expr.IRLiteral;
        if (length !== undefined) {
          literal_expr.value = `${random_int(0, length - 1)}`;
        }
      }
      if (index_access === undefined) {
        index_access = new expr.IRIndexedAccess(new_global_id(), cur_scope.id(),
          new expr.IRIdentifier(new_global_id(), cur_scope.id(),
            (irnodes.get(array_decl_id)! as decl.IRVariableDeclaration).name, array_decl_id),
          expr_gen.irnode! as expr.IRExpression
        );
        outermost_index_access = index_access;
      }
      else {
        let index_access_cp = index_access;
        outermost_index_access = index_access;
        while (true) {
          if ((index_access_cp as expr.IRIndexedAccess).base.typeName === "IRIndexedAccess") {
            index_access = (index_access as expr.IRIndexedAccess).base;
            continue;
          }
          else {
            assert((index_access_cp as expr.IRIndexedAccess).base.typeName === "IRIdentifier",
              `IdentifierGenerator: index_access_cp.base.typeName is not IRIdentifier, but is ${index_access_cp.typeName}`);
            outermost_index_access =
              new expr.IRIndexedAccess(new_global_id(), cur_scope.id(),
                new expr.IRIdentifier(new_global_id(), cur_scope.id(),
                  (irnodes.get(array_decl_id)! as decl.IRVariableDeclaration).name, array_decl_id),
                expr_gen.irnode! as expr.IRExpression);
            (index_access_cp as expr.IRIndexedAccess).base = outermost_index_access;
            break;
          }
        }
      }
      cur_id = array_decl_id;
    }
    assert(real_variable_decl_id !== undefined,
      `IdentifierGenerator: real_variable_decl_id is undefined when the variable_decl is of array type`);
    expr_db.expr_reads_variable(this.id, real_variable_decl_id!);
    if (this.left) {
      expr_db.expr_writes_variable(this.id, real_variable_decl_id!);
    }
    const array_decl_id = decl_db.array_of_base(id)!;
    if (decl_db.is_member_of_struct_decl(array_decl_id)) {
      const struct_constructor = this.generate_expr_when_selected_vardecl_is_a_struct_member(irnodes.get(array_decl_id) as decl.IRVariableDeclaration);
      struct_constructor.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = struct_constructor;
      return index_access!;
    }
    else if (decl_db.is_base_decl(array_decl_id)) {
      const array_instance = this.generate_expr_when_selected_vardecl_is_an_array_element(array_decl_id);
      array_instance.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = array_instance;
      return index_access!;
    }
    else if (decl_db.is_mapping_value(array_decl_id)) {
      const mapping_instance = this.generate_expr_when_selected_vardecl_is_a_mapping_value(array_decl_id);
      mapping_instance.id = new_global_id();
      index_access!.id = this.id;
      (outermost_index_access! as expr.IRIndexedAccess).base = mapping_instance;
      return index_access!;
    }
    else {
      index_access!.id = this.id;
      return index_access!;
    }
  }

  private generate_struct_instance_declaration_stmt(struct_decl_id : number) {
    //! Generate a struct instance (not a temporary struct instantiation) and then generate an IRMemberAccess.
    let rollback = false;
    let snapshot_scope = cur_scope.snapshot();
    if (unexpected_extra_stmt_belong_to_the_parent_scope()) {
      rollback = true;
      cur_scope = cur_scope.rollback();
    }
    const type_range = user_defined_types.filter(t => t.typeName === "StructType" &&
      (t as type.StructType).referece_id === struct_decl_id);
    const struct_instance_gen = new StructInstanceDeclarationGenerator(type_range, false, struct_decl_id);
    struct_instance_gen.generate();
    const vardeclstmt = new stmt.IRVariableDeclarationStatement(new_global_id(), cur_scope.id(),
      [struct_instance_gen.irnode! as decl.IRVariableDeclaration],
      (struct_instance_gen.irnode as decl.IRVariableDeclaration).value);
    if ((struct_instance_gen.irnode as decl.IRVariableDeclaration).value !== undefined) {
      (vardeclstmt as stmt.IRStatement).exprs = [(struct_instance_gen.irnode as decl.IRVariableDeclaration).value!];
    }
    (struct_instance_gen.irnode as decl.IRVariableDeclaration).value = undefined;
    if (unexpected_extra_stmt.has(cur_scope.id())) {
      unexpected_extra_stmt.get(cur_scope.id())!.push(vardeclstmt);
      for (const initialization of initialize_the_vardecls_that_must_be_initialized(cur_scope.id())) {
        unexpected_extra_stmt.get(cur_scope.id())!.push(initialization);
      }
    }
    else {
      unexpected_extra_stmt.set(cur_scope.id(), [vardeclstmt, ...initialize_the_vardecls_that_must_be_initialized(cur_scope.id())]);
    }
    if (rollback) {
      cur_scope = snapshot_scope.snapshot();
    }
    return struct_instance_gen.irnode!;
  }

  //! decl struct
  //! struct.member
  private generate_a_member_access_using_a_struct_declaration(struct_decl_id : number, member : decl.IRVariableDeclaration) : expr.IRExpression {
    const struct_instance_decl = this.generate_struct_instance_declaration_stmt(struct_decl_id);
    this.struct_instance_id = struct_instance_decl.id;
    assert(storage_location_dag.has_solution_range(struct_instance_decl.id),
      `IdentifierGenerator: storage_location_dag.solution_range does not have ${struct_instance_decl.id}`);
    if (this.left) {
      storage_location_dag.update(struct_instance_decl.id, [
        StorageLocationProvider.storage_pointer(),
        StorageLocationProvider.memory(),
        StorageLocationProvider.storage_ref()
      ])
    }
    expr_db.expr_reads_variable(this.id, struct_instance_decl.id);
    return new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
      struct_decl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(),
        (struct_instance_decl as decl.IRVariableDeclaration).name, struct_instance_decl.id));
  }

  //! struct(arg1, arg2, ...).member
  private generate_a_member_access_using_a_temporary_struct_instantiation(struct_decl_id : number, member : decl.IRVariableDeclaration) {
    const nsid = new_global_id();
    type_dag.insert(nsid, [user_defined_types.find(t => t.typeName === "StructType" &&
      (t as type.StructType).referece_id === struct_decl_id)!]);
    const struct_instance_gen = new NewStructGenerator(nsid);
    struct_instance_gen.generate(this.cur_expression_complex_level + 1);
    const struct_instance_expr = struct_instance_gen.irnode as expr.IRExpression;
    this.struct_instance_id = struct_instance_expr.id;
    const extracted_struct_instance_expr = expr.tuple_extraction(struct_instance_expr);
    expr_db.transfer_read_variables(this.id, extracted_struct_instance_expr.id);
    expr_db.transfer_write_variables(this.id, extracted_struct_instance_expr.id);
    return new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
      struct_decl_id, struct_instance_expr);
  }

  private generate_expr_when_selected_vardecl_is_a_struct_member(member : decl.IRVariableDeclaration) : expr.IRExpression {
    const struct_decl_id = decl_db.struct_decl_of_member(member.id)!;
    const available_possible_struct_instances = this.available_vardecl.filter(v =>
      type_dag.solution_range_of(v.id)!.some(
        t => t.typeName === "StructType" &&
          (t as type.StructType).referece_id === struct_decl_id));

    if (available_possible_struct_instances.length === 0) {
      if (this.should_generate_a_temporary_struct_instance(struct_decl_id)) {
        return this.generate_a_member_access_using_a_temporary_struct_instantiation(struct_decl_id, member);
      }
      else {
        return this.generate_a_member_access_using_a_struct_declaration(struct_decl_id, member);
      }
    }
    else {
      const struct_instance = pick_random_element(available_possible_struct_instances)!;
      this.struct_instance_id = struct_instance.id;
      assert(storage_location_dag.has_solution_range(struct_instance.id),
        `IdentifierGenerator: storage_location_dag.solution_range does not have ${struct_instance.id}`);
      if (this.left) {
        storage_location_dag.update(struct_instance.id, [
          StorageLocationProvider.storage_pointer(),
          StorageLocationProvider.memory(),
          StorageLocationProvider.storage_ref()
        ])
      }
      //* Generate an IRMemberAccess
      expr_db.expr_reads_variable(this.id, struct_instance.id);
      return new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
        struct_decl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(),
          (struct_instance as decl.IRVariableDeclaration).name, struct_instance.id));
    }
  }

  private update_storage_loc_range() {
    assert(this.variable_decl !== undefined, "IdentifierGenerator: this.variable_decl is undefined");
    let variable_in_struct_decl =
      inside_struct_scope(get_scope_from_scope_id(decl_db.scope_of_irnode(this.variable_decl!.id)));
    if (variable_in_struct_decl && decl_db.qualifed_by_storage_qualifier(this.variable_decl!.id)) {
      assert(this.struct_instance_id !== undefined, `IdentifierGenerator: this.struct_instance_id is undefined`);
      assert(!storage_location_dag.has_solution_range(this.variable_decl!.id),
        `IdentifierGenerator: storage_location_dag.solution_range has ${this.variable_decl!.id}`);
      const ghost_member_id = decl_db.ghost_member_of_member_inside_struct_instance(
        this.variable_decl!.id, this.struct_instance_id);
      if ((this.left && this.cur_expression_complex_level === 1) ||
        this.cur_expression_complex_level === 0) {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range.get(ghost_member_id)!
        );
      }
      else {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range.get(ghost_member_id)!
            .map(s => s === StorageLocationProvider.storage_ref() ? StorageLocationProvider.storage_pointer() : s)
        );
      }
      storage_location_dag.connect(this.id, ghost_member_id);
    }
    else if (storage_location_dag.has_solution_range(this.variable_decl!.id)) {
      if ((this.left && this.cur_expression_complex_level === 1) ||
        this.cur_expression_complex_level === 0) {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range.get(this.variable_decl!.id)!
        );
      }
      else {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range.get(this.variable_decl!.id)!
            .map(s => s === StorageLocationProvider.storage_ref() ? StorageLocationProvider.storage_pointer() : s)
        );
      }
      storage_location_dag.connect(this.id, this.variable_decl!.id);
    }
  }

  private generate_idenifier() {
    //! This identifier may be a temporary struct/contract instantiation
    //! if the type range only contains struct/contract types.
    //! In this branch, variable_decl is undefined.
    if (this.variable_decl !== undefined) {
      type_dag.connect(this.id, this.variable_decl.id);
      assert(this.irnode === undefined, "IdentifierGenerator: this.irnode is not undefined");
      if (decl_db.is_member_of_struct_decl(this.variable_decl.id)) {
        this.irnode = this.generate_expr_when_selected_vardecl_is_a_struct_member(this.variable_decl!);
      }
      else if (decl_db.is_mapping_value(this.variable_decl.id)) {
        this.irnode = this.generate_expr_when_selected_vardecl_is_a_mapping_value(this.variable_decl.id);
      }
      else if (decl_db.is_base_decl(this.variable_decl.id)) {
        this.irnode = this.generate_expr_when_selected_vardecl_is_an_array_element(this.variable_decl.id);
      }
      else {
        this.irnode = new expr.IRIdentifier(this.id, cur_scope.id(), this.variable_decl.name, this.variable_decl.id);
      }
      type_dag.solution_range_alignment(this.id, this.variable_decl.id);
      expr_db.expr_reads_variable(this.id, this.variable_decl.id);
      if (this.left) {
        expr_db.expr_writes_variable(this.id, this.variable_decl.id);
      }
      this.update_storage_loc_range();
    }
  }

  generate(cur_expression_complex_level : number) : void {
    this.cur_expression_complex_level = cur_expression_complex_level;
    this.start_flag();
    this.get_available_vardecls();
    if (this.should_generate_a_new_var_decl()) {
      this.generate_a_new_var_decl();
    }
    else {
      this.variable_decl = pick_random_element(this.available_vardecl)!;
    }
    if (this.variable_decl !== undefined) {
      decl_db.lock_vardecl(this.variable_decl!.id);
    }
    this.generate_idenifier();
    this.end_flag();
    this.wrap_in_a_tuple();
    if (this.variable_decl !== undefined) {
      decl_db.unlock_vardecl(this.variable_decl.id);
    }
  }
}

type ASSIOP = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";

class AssignmentGenerator extends ExpressionGenerator {
  op : ASSIOP;

  constructor(id : number, op ?: ASSIOP) {
    super(id);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_set(this.type_range, type.bool_types)
      || is_equal_set(this.type_range, type.address_types)
      || is_super_set(user_defined_types, this.type_range)
      || this.type_range.every(t => t.kind === type.TypeKind.ArrayType)) {
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

  private this_dominate_right() : boolean {
    return this.op !== ">>=" && this.op !== "<<=";
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Assignment ${this.op}, scope: ${cur_scope.kind()}, type: ${type_range_str}, scope: ${cur_scope.kind()}`));
    }
  }

  private distill_type_range() {
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
  }

  private init_left_and_right() : [number, number] {
    const leftid = new_global_id();
    const rightid = new_global_id();
    if (this.this_dominate_right()) {
      type_dag.insert(rightid, this.type_range);
    }
    else {
      type_dag.insert(rightid, type.uinteger_types);
    }
    type_dag.insert(leftid, type_dag.solution_range_of(this.id)!);
    if (this.this_dominate_right()) {
      type_dag.connect(this.id, rightid, "sub_dominance");
    }
    type_dag.connect(this.id, leftid);
    if (this.op === "=" && storage_location_dag.has_solution_range(this.id)) {
      storage_location_dag.insert(leftid, storage_location_dag.solution_range_of(this.id)!);
      storage_location_dag.connect(this.id, leftid);
      storage_location_dag.insert(rightid, storage_location_dag.solution_range_of(this.id)!);
      storage_location_dag.connect(this.id, rightid);
    }
    return [leftid, rightid];
  }

  private generate_right(rightid : number, cur_expression_complex_level : number) : expr.IRExpression {
    let right_expression_gen_prototype = get_exprgenerator(
      type_dag.solution_range_of(rightid)!,
      cur_expression_complex_level + 1,
      [],
      storage_location_dag.has_solution_range(rightid) ? storage_location_dag.solution_range_of(rightid)! : []
    );
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    if (this.this_dominate_right()) {
      type_dag.solution_range_alignment(this.id, rightid);
    }
    return right_expression_gen.irnode as expr.IRExpression;
  }

  private update_storage_loc_range(leftid : number, rightid : number) {
    if (storage_location_dag.has_solution_range(leftid)) {
      assert(this.op === "=", `AssignmentGenerator: op is not =, but is ${this.op}`);
      assert(storage_location_dag.has_solution_range(rightid),
        `AssignmentGenerator: right_extracted_expression.id ${rightid} is not in storage_location_dag.solution_range`);
      storage_location_dag.insert(this.id,
        storage_location_dag.solution_range_of(leftid)!
      );
      storage_location_dag.connect(this.id, leftid);
      storage_location_dag.solution_range_alignment(this.id, leftid);
      storage_location_dag.connect(this.id, rightid, "sub_dominance");
      storage_location_dag.solution_range_alignment(this.id, rightid);
    }
  }

  private generate_left(leftid : number, rightid : number, cur_expression_complex_level : number) : expr.IRExpression {
    const identifier_gen = new IdentifierGenerator(leftid, true);
    identifier_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, leftid);
    assert(identifier_gen.variable_decl !== undefined, "AssignmentGenerator: identifier_gen.vardecl is undefined");
    this.update_storage_loc_range(leftid, rightid);
    expr_db.expr_writes_variable(this.id, identifier_gen.variable_decl.id);
    return identifier_gen.irnode as expr.IRExpression;
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const [leftid, rightid] = this.init_left_and_right();
    const right_expression = this.generate_right(rightid, cur_expression_complex_level);
    const left_expression = this.generate_left(leftid, rightid, cur_expression_complex_level);
    expr_db.transfer_read_variables(this.id, leftid);
    expr_db.transfer_read_variables(this.id, rightid);
    this.irnode = new expr.IRAssignment(this.id, cur_scope.id(), left_expression, right_expression, this.op!);
    this.end_flag();
    this.wrap_in_a_tuple();
  }
}

type BOP = "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "^" | "|" | "&&" | "||";

class BinaryOpGenerator extends ExpressionGenerator {
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

  private this_dominates_left() : boolean {
    return ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1;
  }

  private this_dominate_right() : boolean {
    return ["+", "-", "*", "/", "%", "&", "^", "|"].filter((op) => op === this.op).length === 1;
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_range_str}`));
    }
  }

  private distill_type_range() {
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
  }

  private init_left_and_right() : [number, number, number | undefined] {
    const leftid = new_global_id();
    const rightid = new_global_id();
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
      type_dag.insert(leftid, type_dag.solution_range_of(this.id)!);
    }
    else if (this.op === "&&" || this.op === "||") {
      type_dag.insert(leftid, type.bool_types);
    }
    else {
      type_dag.insert(leftid, type.all_integer_types);
    }
    if (this.this_dominates_left()) {
      type_dag.connect(this.id, leftid);
    }
    if (this.this_dominate_right()) {
      type_dag.connect(this.id, rightid, "sub_dominance");
    }
    let ghostid;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      ghostid = new_global_id();
      new IRGhost(ghostid, cur_scope.id());
      type_dag.insert(ghostid, type.all_integer_types);
      type_dag.connect(ghostid, leftid);
      type_dag.connect(ghostid, rightid, "sub_dominance");
    }
    return [leftid, rightid, ghostid];
  }

  private generate_left_and_right(leftid : number, rightid : number, ghostid : number | undefined,
    cur_expression_complex_level : number) : [expr.IRExpression, expr.IRExpression] {
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
    if (this.op === "<<" || this.op === ">>") {
      left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(leftid)!,
        cur_expression_complex_level + 1, [LiteralGenerator]);
    }
    else {
      left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(leftid)!,
        cur_expression_complex_level + 1);
    }
    left_expression_gen = new left_expression_gen_prototype(leftid);
    if (left_expression_gen.generator_name === "LiteralGenerator") {
      right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!,
        cur_expression_complex_level + 1, [LiteralGenerator]);
    }
    else {
      right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!,
        cur_expression_complex_level + 1);
    }
    right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    //! Generate left-hand-side expression
    if (this.this_dominate_right()) {
      type_dag.solution_range_alignment(this.id, rightid);
    }
    else if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    left_expression_gen.generate(cur_expression_complex_level + 1);
    if (this.this_dominates_left()) {
      type_dag.solution_range_alignment(this.id, leftid);
    }
    else if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, leftid);
    }
    return [
      left_expression_gen.irnode as expr.IRExpression,
      right_expression_gen.irnode as expr.IRExpression
    ];
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const [leftid, rightid, ghostid] = this.init_left_and_right();
    //! Select generators for the left-hand-side and right-hand-side expressions
    const [left_expression, right_expression] = this.generate_left_and_right(leftid, rightid, ghostid, cur_expression_complex_level);
    const left_extracted_expression = expr.tuple_extraction(left_expression);
    const right_extracted_expression = expr.tuple_extraction(right_expression);
    expr_db.transfer_read_variables(this.id, left_extracted_expression.id);
    expr_db.transfer_read_variables(this.id, right_extracted_expression.id);
    expr_db.transfer_write_variables(this.id, left_extracted_expression.id);
    expr_db.transfer_write_variables(this.id, right_extracted_expression.id);
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    this.end_flag();
    this.wrap_in_a_tuple();
  }
}

type BINARYCOMPAREOP = "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||";

class BinaryCompareOpGenerator extends ExpressionGenerator {
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

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: BinaryCompareOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_range_str}`));
    }
  }

  private distill_type_range() {
    type_dag.update(this.id, type.bool_types);
  }

  private init_left_and_right() : [number, number, number | undefined] {
    const leftid = new_global_id();
    const rightid = new_global_id();
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      type_dag.insert(rightid, type.all_integer_types);
    }
    else {
      type_dag.insert(rightid, type.bool_types);
    }
    type_dag.insert(leftid, type_dag.solution_range_of(rightid)!);
    let ghostid;
    if (["<", ">", "<=", ">=", "==", "!="].includes(this.op)) {
      ghostid = new_global_id();
      new IRGhost(ghostid, cur_scope.id());
      type_dag.insert(ghostid, type.all_integer_types);
      type_dag.connect(ghostid, leftid);
      type_dag.connect(ghostid, rightid, "sub_dominance");
    }
    return [leftid, rightid, ghostid];
  }

  private generate_left_and_right(leftid : number, rightid : number, ghostid : number | undefined,
    cur_expression_complex_level : number) : [expr.IRExpression, expr.IRExpression] {
    let right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!, cur_expression_complex_level + 1);
    let left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!, cur_expression_complex_level + 1);
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complex_level + 1);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    //! Generate left-hand-side expression
    const left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complex_level + 1);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, leftid);
    }
    return [
      left_expression_gen.irnode as expr.IRExpression,
      right_expression_gen.irnode as expr.IRExpression
    ]
  }

  generate(cur_expression_complex_level : number) : void {
    this.distill_type_range();
    this.start_flag();
    const [leftid, rightid, ghostid] = this.init_left_and_right();
    const [left_expression, right_expression] = this.generate_left_and_right(leftid, rightid, ghostid, cur_expression_complex_level);
    let left_extracted_expression = expr.tuple_extraction(left_expression);
    let right_extracted_expression = expr.tuple_extraction(right_expression);
    expr_db.transfer_read_variables(this.id, left_extracted_expression.id);
    expr_db.transfer_read_variables(this.id, right_extracted_expression.id);
    expr_db.transfer_write_variables(this.id, left_extracted_expression.id);
    expr_db.transfer_write_variables(this.id, right_extracted_expression.id);
    this.irnode = new expr.IRBinaryOp(this.id, cur_scope.id(), left_expression, right_expression, this.op);
    this.end_flag();
    this.wrap_in_a_tuple();
  }
}

type UOP = "!" | "-" | "~" | "++" | "--";

//TODO: create a delete Statement Generator
class UnaryOpGenerator extends ExpressionGenerator {
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

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: UnaryOp ${this.op}, scope: ${cur_scope.kind()}, type: ${type_range_str}`));
    }
  }

  private distill_type_range() {
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
  }

  private generate_identifier(cur_expression_complex_level : number) : expr.IRExpression {
    const identifier_id = new_global_id();
    type_dag.insert(identifier_id, this.type_range);
    type_dag.connect(this.id, identifier_id);
    const is_left = this.op === "++" || this.op === "--";
    const identifier_gen = new IdentifierGenerator(identifier_id, is_left);
    identifier_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, identifier_id);
    if (is_left) {
      expr_db.expr_writes_variable(this.id, identifier_gen.variable_decl!.id);
    }
    return identifier_gen.irnode! as expr.IRExpression;
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const expression : expr.IRExpression = this.generate_identifier(cur_expression_complex_level);
    this.irnode = new expr.IRUnaryOp(this.id, cur_scope.id(), pick_random_element([true, false])!, expression, this.op)!;
    const extracted_expression = expr.tuple_extraction(expression);
    expr_db.transfer_read_variables(this.id, extracted_expression.id);
    this.end_flag();
    this.wrap_in_a_tuple();
  }
}

class ConditionalGenerator extends ExpressionGenerator {

  constructor(id : number) {
    super(id);
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Conditional, scope: ${cur_scope.kind()}, type: ${type_range_str}`));
    }
  }

  //! e1 ? e2 : e3
  private init_e1_e2_e3() : [number, number, number] {
    const e1id = new_global_id();
    type_dag.insert(e1id, type.bool_types);
    const e2id = new_global_id();
    type_dag.insert(e2id, this.type_range);
    const e3id = new_global_id();
    type_dag.insert(e3id, this.type_range);
    type_dag.connect(this.id, e2id);
    type_dag.connect(this.id, e3id, "sub_dominance");
    if (storage_location_dag.has_solution_range(this.id)) {
      storage_location_dag.insert(e2id, storage_location_dag.solution_range_of(this.id)!);
      storage_location_dag.connect(this.id, e2id);
      storage_location_dag.insert(e3id, storage_location_dag.solution_range_of(this.id)!);
      storage_location_dag.connect(this.id, e3id);
    }
    return [e1id, e2id, e3id];
  }

  private generate_e1_e2_e3(e1id : number, e2id : number, e3id : number,
    cur_expression_complex_level : number) : [expr.IRExpression, expr.IRExpression, expr.IRExpression] {
    let e1_gen_prototype = get_exprgenerator(type.bool_types, cur_expression_complex_level + 1);
    const e1_gen = new e1_gen_prototype(e1id);
    e1_gen.generate(cur_expression_complex_level + 1);
    const e3_gen_prototype = get_exprgenerator(this.type_range, cur_expression_complex_level + 1);
    const e3_gen = new e3_gen_prototype!(e3id);
    e3_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, e3id);
    const e2_gen_prototype = get_exprgenerator(type_dag.solution_range_of(e3id)!, cur_expression_complex_level + 1);
    const e2_gen = new e2_gen_prototype(e2id);
    e2_gen.generate(cur_expression_complex_level + 1);
    type_dag.solution_range_alignment(this.id, e2id);
    return [e1_gen.irnode! as expr.IRExpression, e2_gen.irnode! as expr.IRExpression, e3_gen.irnode! as expr.IRExpression];
  }

  private update_storage_loc_range(e2id : number, e3id : number) {
    if (storage_location_dag.has_solution_range(e2id)) {
      assert(storage_location_dag.has_solution_range(e3id),
        `ConditionalGenerator: e3id ${e3id} is not in storage_location_dag.solution_range`);
      storage_location_dag.insert(this.id,
        storage_location_dag.solution_range_of(e2id)!
      );
      storage_location_dag.connect(this.id, e2id);
      storage_location_dag.solution_range_alignment(this.id, e2id);
      storage_location_dag.connect(this.id, e3id, "sub_dominance");
      storage_location_dag.solution_range_alignment(this.id, e3id);
    }
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    type_dag.insert(this.id, this.type_range);
    const [e1id, e2id, e3id] = this.init_e1_e2_e3();
    const [e1, e2, e3] = this.generate_e1_e2_e3(e1id, e2id, e3id, cur_expression_complex_level);
    expr_db.transfer_read_variables(this.id, e1id);
    expr_db.transfer_read_variables(this.id, e2id);
    expr_db.transfer_read_variables(this.id, e3id);
    expr_db.transfer_write_variables(this.id, e1id);
    expr_db.transfer_write_variables(this.id, e2id);
    expr_db.transfer_write_variables(this.id, e3id);
    this.irnode = new expr.IRConditional(
      this.id, cur_scope.id(),
      e1, e2, e3
    );
    this.update_storage_loc_range(e2id, e3id);
    this.end_flag();
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(new_global_id(), cur_scope.id(), [this.irnode as expr.IRExpression]);
    }
  }
}

class FunctionCallGenerator extends CallExpressionGenerator {
  kind : FunctionCallKind | undefined;
  constructor(id : number, kind ?: FunctionCallKind) {
    super(id);
    this.kind = kind;
    if (this.kind === undefined) {
      this.kind = FunctionCallKind.FunctionCall;
    }
  }

  private pick_function_call() : [number, number] {
    const contractdecl_id_plus_funcdecl_id = get_available_funcdecls(this.type_range);
    assert(contractdecl_id_plus_funcdecl_id.length > 0,
      `FunctionCallGenerator: contractdecl_id_plus_funcdecl_id is empty.`);
    const [contractdecl_id, funcdecl_id] = pick_random_element(contractdecl_id_plus_funcdecl_id)!;
    if (decl_db.is_getter_function_for_state_struct_instance(funcdecl_id)) {
      const state_struct_instance_id = decl_db.state_struct_instance_of_getter_function(funcdecl_id);
      assert(state_struct_instance_id !== undefined, `FunctionCallGenerator: state_struct_instance is undefined`);
      const getter_function_ids = decl_db.getter_functions_of_state_struct_instance(state_struct_instance_id)!;
      for (const getter_func_id of getter_function_ids) {
        if (getter_func_id !== funcdecl_id) {
          vismut_dag.remove(getter_func_id);
          decl_db.remove_getter_function(getter_func_id);
        }
      }
      const state_decl_id = decl_db.state_decl_of_getter_function(funcdecl_id);
      assert(state_decl_id !== undefined, `FunctionCallGenerator: state_decl_id is undefined`);
      const state_decl_name = (irnodes.get(state_decl_id)! as decl.IRStructDefinition).name;
      type_dag.solution_range.set(state_struct_instance_id,
        type_dag.solution_range_of(state_struct_instance_id)!.filter(t => (t as type.StructType).name === state_decl_name));
    }
    return [contractdecl_id, funcdecl_id];
  }

  private start_flag(contractdecl_id : number, funcdecl_id : number) {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall: ${this.id}: ${type_range_str}, contractdecl_id: ${contractdecl_id} funcdecl_id: ${funcdecl_id}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: FunctionCall, id: ${this.id} scope: ${cur_scope.id()}, type: ${type_range_str}, scope: ${cur_scope.kind()}`));
    }
  }

  private internal_function_call(contractdecl_id : number) : boolean {
    return contractdecl_id === cur_contract_id;
  }

  private external_function_call(contractdecl_id : number) : boolean {
    return contractdecl_id !== cur_contract_id;
  }

  private update_vismut_range(contractdecl_id : number, funcdecl_id : number) {
    if (this.internal_function_call(contractdecl_id)) {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        vismut_dag.update(funcdecl_id, nonpayable_func_vismut);
      }
    }
    else {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        vismut_dag.update(funcdecl_id, open_func_vismut);
      }
    }
    if (decl_db.is_getter_function(funcdecl_id)
      && !decl_db.is_getter_function_for_state_struct_instance(funcdecl_id)
      && !decl_db.is_getter_function_for_state_mapping_decl(funcdecl_id)) {
      vismut_dag.update((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).returns[0].id, [
        VisMutProvider.var_public()
      ]);
    }
    else if (decl_db.is_getter_function_for_state_struct_instance(funcdecl_id)) {
      const state_struct_instance_id = decl_db.state_struct_instance_of_getter_function(funcdecl_id)!;
      vismut_dag.update(state_struct_instance_id, [
        VisMutProvider.var_public()
      ]);
    }
    else if (decl_db.is_getter_function_for_state_mapping_decl(funcdecl_id)) {
      const state_mapping_decl_id = decl_db.state_mapping_decl_of_getter_function(funcdecl_id)!;
      vismut_dag.update(state_mapping_decl_id, [
        VisMutProvider.var_public()
      ]);
    }
  }

  private update_storage_range(contractdecl_id : number, funcdecl_id : number,
    selected_ret_decl : decl.IRVariableDeclaration | null) {
    if (this.external_function_call(contractdecl_id)) {
      if ((irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition).visibility === undefined) {
        const func_decl = irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition;
        for (const param of func_decl.parameters) {
          if (storage_location_dag.has_solution_range(param.id)) {
            storage_location_dag.update(param.id, [
              StorageLocationProvider.memory(),
              StorageLocationProvider.calldata()
            ]);
          }
        }
        for (const ret of func_decl.returns) {
          if (storage_location_dag.has_solution_range(ret.id)) {
            storage_location_dag.update(ret.id, [
              StorageLocationProvider.memory(),
              StorageLocationProvider.calldata()
            ]);
          }
        }
      }
    }
    if (selected_ret_decl !== null) {
      type_dag.solution_range_alignment(this.id, selected_ret_decl!.id);
      if (storage_location_dag.has_solution_range(selected_ret_decl.id)) {
        storage_location_dag.insert(this.id,
          storage_location_dag.solution_range_of(selected_ret_decl.id)!
        );
        storage_location_dag.connect(this.id, selected_ret_decl.id);
        storage_location_dag.solution_range_alignment(this.id, selected_ret_decl.id);
      }
    }
  }

  /*
  Suppose the current function call is an external function call in
  the function body of function F, then F maybe nopure or noview.
  */
  private update_owner_function_features(contractdecl_id : number) : void {
    if (this.external_function_call(contractdecl_id)) {
      if (contractdecl_id > 0) {
        noview_nopure_funcdecl = true;
      }
      nopure_funcdecl = true;
    }
  }

  private extract_ret_decl(funcdecl : decl.IRFunctionDefinition) : [number, decl.IRVariableDeclaration | null] {
    const available_ret_decls_index : number[] = [];
    for (let i = 0; i < funcdecl.returns.length; i++) {
      if (vardecl_type_range_is_ok(funcdecl.returns[i].id, this.type_range)) {
        available_ret_decls_index.push(i);
      }
    }
    let selected_ret_decls_index = available_ret_decls_index.length == 0 ?
      -1 : pick_random_element(available_ret_decls_index)!;
    let selected_ret_decl : null | decl.IRVariableDeclaration = null;
    if (selected_ret_decls_index !== -1) selected_ret_decl = funcdecl.returns[selected_ret_decls_index];
    if (selected_ret_decl !== null) {
      type_dag.connect(this.id, selected_ret_decl.id);
      type_dag.solution_range_alignment(this.id, selected_ret_decl.id);
    }
    if (config.debug && selected_ret_decl !== null) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  The type range of the selected ret decl (ID: ${selected_ret_decl.id}) is ${selected_ret_decls_index}: ${type_dag.solution_range_of(selected_ret_decl.id)!.map(t => t.str())}`));
    }
    return [selected_ret_decls_index, selected_ret_decl];
  }

  private generate_arguments(selected_ret_decl : decl.IRVariableDeclaration | null,
    funcdecl : decl.IRFunctionDefinition,
    cur_expression_complex_level : number
  ) : number[] {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall Arguments`));
      indent += 2;
    }
    if (selected_ret_decl !== null) {
      expr_db.expr_reads_variable(this.id, selected_ret_decl.id);
    }
    const args_ids = super.generate_argument_from_parameters(cur_expression_complex_level, funcdecl.parameters);
    for (const arg_id of args_ids) {
      expr_db.transfer_read_variables(this.id, arg_id);
      expr_db.transfer_write_variables(this.id, arg_id);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}FunctionCall Arguments`));
    }
    return args_ids;
  }

  private generate_function_call_node(contractdecl_id : number,
    funcdecl : decl.IRFunctionDefinition,
    selected_ret_decl : decl.IRVariableDeclaration | null,
    selected_ret_decls_index : number,
    func_identifier : expr.IRIdentifier,
    args_ids : number[],
    cur_expression_complex_level : number) {
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1 && selected_ret_decl !== null) {
      //* generate the function call node
      let func_call_node : expr.IRExpression;
      const fid = new_global_id();
      type_dag.insert(fid, this.type_range);
      // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
      if (contractdecl_id !== cur_contract_id) {
        // "this" (yin)
        if (contractdecl_id < 0) {
          func_call_node = new expr.IRFunctionCall(
            fid,
            cur_scope.id(),
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), cur_scope.id(),
              func_identifier.name!, contractdecl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(), "this", -1),
            ),
            args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
          );
        }
        // Other yang contracts
        else {
          external_call = true;
          let contract_instance_expr : expr.IRExpression | undefined;
          const type_range = contract_types.get(contractdecl_id)!.subs();
          const idid = new_global_id();
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complex_level + 1);
          contract_instance_expr = identifier_gen.irnode as expr.IRExpression;
          func_call_node = new expr.IRFunctionCall(
            fid,
            cur_scope.id(),
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), cur_scope.id(),
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
      expr_db.transfer_read_variables(this.id, identifier_expr.id);
      expr_db.expr_writes_variable(this.id, identifier_gen.variable_decl!.id);
      //* 3. use a tuple to wrap around this identifier.
      const tuple_elements : (expr.IRExpression | null)[] = [];
      for (let i = 0; i < funcdecl.returns.length; i++) {
        if (i === selected_ret_decls_index) {
          tuple_elements.push(identifier_gen.irnode! as expr.IRExpression);
        }
        else {
          tuple_elements.push(null);
        }
      }
      const tuple_node = new expr.IRTuple(new_global_id(), cur_scope.id(), tuple_elements);
      const assignment_node = new expr.IRAssignment(new_global_id(), cur_scope.id(), tuple_node, func_call_node, "=");
      //* 4. generate an assignment statement passing the returned values of the callee to the tuple
      const assignment_stmt_node = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), assignment_node);
      (assignment_stmt_node as stmt.IRStatement).exprs = [expr.tuple_extraction(func_call_node)];
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
      if (this.external_function_call(contractdecl_id)) {
        // "this" (yin)
        if (contractdecl_id < 0) {
          this.irnode = new expr.IRFunctionCall(
            this.id,
            cur_scope.id(),
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), cur_scope.id(),
              func_identifier.name!, contractdecl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(), "this", -1),
            ),
            args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
          );
        }
        // Other yang contracts
        else {
          external_call = true;
          let contract_instance_expr : expr.IRExpression | undefined;
          const type_range = contract_types.get(contractdecl_id)!.subs();
          const idid = new_global_id();
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complex_level + 1);
          contract_instance_expr = identifier_gen.irnode as expr.IRExpression;
          this.irnode = new expr.IRFunctionCall(
            this.id,
            cur_scope.id(),
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), cur_scope.id(),
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
  }

  generate(cur_expression_complex_level : number) : void {
    const [contractdecl_id, funcdecl_id] = this.pick_function_call();
    this.start_flag(contractdecl_id, funcdecl_id);
    this.update_vismut_range(contractdecl_id, funcdecl_id);
    this.update_owner_function_features(contractdecl_id);
    decl_db.add_called_function_decl(funcdecl_id);
    const funcdecl = irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition;
    const func_identifier = new expr.IRIdentifier(new_global_id(), cur_scope.id(), funcdecl.name, funcdecl_id);
    const [selected_ret_decls_index, selected_ret_decl] = this.extract_ret_decl(funcdecl);
    this.update_storage_range(contractdecl_id, funcdecl_id, selected_ret_decl);
    const args_ids = this.generate_arguments(selected_ret_decl, funcdecl, cur_expression_complex_level);
    this.generate_function_call_node(contractdecl_id, funcdecl, selected_ret_decl,
      selected_ret_decls_index, func_identifier, args_ids,
      cur_expression_complex_level);
    this.wrap_in_a_tuple();
    this.end_flag();
  }
}

class NewStructGenerator extends CallExpressionGenerator {

  constructor(id : number) {
    super(id);
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(
        `${" ".repeat(indent)}>>  Start generating NewStructGenerator ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: NewStructGenerator, scope: ${cur_scope.kind()} type: ${type_range_str}`));
    }
  }

  private distill_type_range() : [type.StructType, decl.IRStructDefinition] {
    assert(decl_db.structdecl_size() > 0, "No struct is declared");
    this.type_range = this.type_range.filter(t => t.typeName === "StructType");
    assert(this.type_range.length > 0, "NewStructGenerator: type_range is empty");
    const struct_type = pick_random_element(this.type_range)! as type.StructType;
    type_dag.update(this.id, [struct_type]);
    return [struct_type, irnodes.get(struct_type.referece_id) as decl.IRStructDefinition];
  }

  private generate_arguments(struct_decl : decl.IRStructDefinition,
    cur_expression_complex_level : number) : expr.IRExpression[] {
    const args_ids : number[] = super.generate_argument_from_parameters(cur_expression_complex_level, struct_decl.members);
    const args = args_ids.map(i => irnodes.get(i)! as expr.IRExpression);
    return args;
  }

  private update_storage_loc_range() {
    storage_location_dag.insert(this.id, [
      StorageLocationProvider.memory(),
    ]);
    update_storage_loc_range_for_compound_type(this.id);
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    const [struct_type, struct_decl] = this.distill_type_range();
    decl_db.add_temporary_struct_instance_decl(this.id);
    const args = this.generate_arguments(struct_decl, cur_expression_complex_level);
    let identifier_name = struct_type.name;
    const function_call_expr = new expr.IRFunctionCall(this.id, cur_scope.id(), FunctionCallKind.FunctionCall,
      new expr.IRIdentifier(new_global_id(), cur_scope.id(), identifier_name, struct_type.referece_id), args);
    this.irnode = function_call_expr;
    this.update_storage_loc_range();
    this.end_flag();
    this.wrap_in_a_tuple();
  }
}

class NewContractGenerator extends CallExpressionGenerator {
  constructor(id : number) {
    super(id);
  }

  private start_flag() {
    if (config.debug) {
      let type_range_str = this.type_range.map(t => t.kind === type.TypeKind.MappingType ?
        type.TypeProvider.trivial_mapping().str() :
        t.kind === type.TypeKind.ArrayType ?
          (t as type.ArrayType).base.kind === type.TypeKind.MappingType ?
            new type.ArrayType(type.TypeProvider.trivial_mapping()).str() :
            t.str() :
          t.str());
      type_range_str = [...new Set(type_range_str)];
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewContractGenerator ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: NewContractGenerator, scope: ${cur_scope.kind()}, type_range: ${type_dag.solution_range_of(this.id)!.map(t => t.str())}`));
    }
  }

  private distill_type_range() : type.ContractType {
    assert(decl_db.contractdecl_size() > 0, "No contract is declared");
    this.type_range = this.type_range.filter(t => t.typeName === "ContractType");
    assert(this.type_range.length > 0, "NewContractGenerator: type_range is empty");
    const contract_type = pick_random_element(this.type_range)! as type.ContractType;
    type_dag.update(this.id, [contract_type]);
    return contract_type;
  }

  private generate_arguments(contract_decl : decl.IRContractDefinition,
    cur_expression_complex_level : number) : expr.IRExpression[] {
    const args_ids : number[] = super.generate_argument_from_parameters(cur_expression_complex_level, contract_decl.constructor_parameters);
    const args = args_ids.map(i => irnodes.get(i)! as expr.IRExpression);
    return args;
  }

  private update_owner_function_features() : void {
    if (inside_function_body(cur_scope.kind())) {
      noview_nopure_funcdecl = true;
    }
  }

  generate(cur_expression_complex_level : number) : void {
    this.start_flag();
    const contract_type = this.distill_type_range();
    const contract_decl = irnodes.get(contract_type.referece_id) as decl.IRContractDefinition;
    const new_expr = new expr.IRNew(new_global_id(), cur_scope.id(), contract_decl.name);
    const args = this.generate_arguments(contract_decl, cur_expression_complex_level);
    this.update_owner_function_features()
    const new_function_expr = new expr.IRFunctionCall(this.id, cur_scope.id(), FunctionCallKind.FunctionCall, new_expr, args);
    this.irnode = new_function_expr;
    this.wrap_in_a_tuple();
    this.end_flag();
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

//@ts-ignore
const all_expression_generators = [
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
  protected start_flag() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ${this.generator_name}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }
  protected end_flag() {
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: ${this.generator_name}, scope: ${cur_scope.kind()}`));
    }
  }
}


abstract class ExpressionStatementGenerator extends StatementGenerator {
  expr : expr.IRExpression | undefined;
  constructor() { super(); }

  generate(_ : number) : void { }
}

class AssignmentStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(_ : number) : void {
    this.start_flag();
    const assignid = new_global_id();
    type_dag.insert(assignid, all_types);
    const assignment_gen = new AssignmentGenerator(assignid);
    assignment_gen.generate(0);
    this.expr = expr.tuple_extraction(assignment_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), assignment_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    this.end_flag();
  }
}

class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(_ : number) : void {
    this.start_flag();
    const bopid = new_global_id();
    type_dag.insert(bopid, type.elementary_types);
    const binaryop_gen = new BinaryOpGenerator(bopid);
    binaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(binaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), binaryop_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    this.end_flag();
  }
}

class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(_ : number) : void {
    this.start_flag();
    const uopid = new_global_id();
    type_dag.insert(uopid, type.elementary_types);
    const unaryop_gen = new UnaryOpGenerator(uopid);
    unaryop_gen.generate(0);
    this.expr = expr.tuple_extraction(unaryop_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), unaryop_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    this.end_flag();
  }
}

class ConditionalStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate(_ : number) : void {
    this.start_flag();
    const cid = new_global_id();
    type_dag.insert(cid, all_types);
    const conditional_gen = new ConditionalGenerator(cid);
    conditional_gen.generate(0);
    this.expr = expr.tuple_extraction(conditional_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), conditional_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    this.end_flag();
  }
}

class FunctionCallStatementGenerator extends ExpressionStatementGenerator {
  constructor() {
    super();
  }
  generate(_ : number) : void {
    this.start_flag();
    allow_empty_return = true;
    const fid = new_global_id();
    type_dag.insert(fid, all_types);
    const funcall_gen = new FunctionCallGenerator(fid);
    funcall_gen.generate(0);
    this.expr = expr.tuple_extraction(funcall_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), funcall_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    allow_empty_return = false;
    this.end_flag();
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

  private generate_expr() {
    if (this.expr === undefined) {
      let expression_gen_prototype;
      if (get_available_vardecls_with_type_constraint(all_types).length > 0 && Math.random() > config.terminal_prob) {
        expression_gen_prototype = get_exprgenerator(all_types);
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expr_id = new_global_id();
      type_dag.insert(expr_id, all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      this.expr = expression_gen.irnode! as expr.IRExpression;
    }
    this.exprs = this.exprs.concat(expr.tuple_extraction(this.expr));
    if (this.vardecl === undefined) {
      const variable_gen = new VariableDeclarationGenerator(0,
        type_dag.solution_range_of(expr.tuple_extraction(this.expr!).id)!, false);
      variable_gen.generate();
      this.vardecl = variable_gen.irnode! as decl.IRVariableDeclaration;
    }
  }

  generate(_ : number) : void {
    this.start_flag();
    this.generate_expr();
    this.irnode = new stmt.IRVariableDeclarationStatement(new_global_id(), cur_scope.id(), [this.vardecl!], this.expr);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    let extracted_ir = expr.tuple_extraction(this.expr!);
    if (extracted_ir.typeName === "IRLiteral") {
      const ghost_id = new_global_id();
      type_dag.insert(ghost_id, type_dag.solution_range_of(extracted_ir.id)!);
      type_dag.connect(ghost_id, extracted_ir.id);
      type_dag.connect(ghost_id, this.vardecl!.id, "super_dominance");
    }
    else {
      type_dag.connect(extracted_ir.id, this.vardecl!.id, "super_dominance");
      type_dag.solution_range_alignment(extracted_ir.id, this.vardecl!.id);
    }
    this.end_flag();
  }
}

class MultipleVariableDeclareStatementGenerator extends NonExpressionStatementGenerator {
  var_count : number;
  vardecls : decl.IRVariableDeclaration[] = [];
  constructor(var_count : number) {
    super();
    this.var_count = var_count;
  }

  private generate_exprs() {
    const ir_exps : expr.IRExpression[] = [];
    for (let i = 0; i < this.var_count; i++) {
      let expression_gen_prototype;
      if (get_available_vardecls_with_type_constraint(all_types).length > 0 && Math.random() > config.terminal_prob) {
        expression_gen_prototype = get_exprgenerator(all_types);
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expr_id = new_global_id();
      type_dag.insert(expr_id, all_types);
      const expression_gen = new expression_gen_prototype(expr_id);
      expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
      this.exprs = this.exprs.concat(expr.tuple_extraction(ir_exps[i]));
    }
    return ir_exps;
  }

  private generate_vardecls(ir_exps : expr.IRExpression[]) {
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclarationGenerator(0,
        type_dag.solution_range_of(expr.tuple_extraction(ir_exps[i]).id)!, false);
      variable_gen.generate();
      this.vardecls.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    }
  }

  private update_type_range(ir_exps : expr.IRExpression[]) {
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = expr.tuple_extraction(ir_exps[i]);
      if (extracted_ir.typeName === "IRLiteral") {
        const ghost_id = new_global_id();
        type_dag.insert(ghost_id, type_dag.solution_range_of(extracted_ir.id)!);
        type_dag.connect(ghost_id, extracted_ir.id);
        type_dag.connect(ghost_id, this.vardecls[i].id, "super_dominance");
      }
      else {
        type_dag.connect(extracted_ir.id, this.vardecls[i].id, "super_dominance");
        type_dag.solution_range_alignment(extracted_ir.id, this.vardecls[i].id);
      }
    }
  }

  generate(_ : number) : void {
    this.start_flag();
    const ir_exps = this.generate_exprs();
    this.generate_vardecls(ir_exps);
    const ir_tuple_exp = new expr.IRTuple(new_global_id(), cur_scope.id(), ir_exps);
    this.irnode = new stmt.IRVariableDeclarationStatement(new_global_id(), cur_scope.id(), this.vardecls, ir_tuple_exp);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    this.update_type_range(ir_exps);
    this.end_flag();
  }
}

class ReturnStatementGenerator extends NonExpressionStatementGenerator {
  value : expr.IRExpression | undefined;
  constructor(value ?: expr.IRExpression) {
    super();
    this.value = value;
  }

  generate(_ : number) : void {
    this.start_flag();
    assert(this.value !== undefined, "ReturnStatementGenerator: value is undefined");
    if (this.value === undefined) {
      //! Contain bugs
      const expression_gen_prototype = get_exprgenerator(all_types);
      const exprid = new_global_id();
      type_dag.insert(exprid, all_types);
      const expression_gen = new expression_gen_prototype(exprid);
      expression_gen.generate(0);
      this.value = expression_gen.irnode! as expr.IRExpression;
      this.exprs.push(expr.tuple_extraction(this.value));
    }
    this.irnode = new stmt.IRReturnStatement(new_global_id(), cur_scope.id(), this.value);
    if (this.value !== undefined) {
      if (this.value.typeName === "IRTuple") {
        (this.irnode as stmt.IRStatement).exprs = (this.value as expr.IRTuple).components
          .filter(c => c !== null) as expr.IRExpression[];
      }
      else {
        (this.irnode as stmt.IRStatement).exprs = [this.value];
      }
    }
    this.end_flag();
  }
}

class IfStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  private generate_condition() : expr.IRExpression {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cid = new_global_id();
    type_dag.insert(cid, type.bool_types);
    const condition_gen = new BinaryCompareOpGenerator(cid);
    condition_gen.generate(0);
    this.exprs.push(expr.tuple_extraction(condition_gen.irnode as expr.IRExpression));
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}IfStatement Condition, scope: ${cur_scope.kind()}`));
    }
    return condition_gen.irnode as expr.IRExpression;
  }

  private generate_true_body(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If true body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF_BODY);
    let true_body : stmt.IRStatement[] = [];
    const true_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < true_stmt_cnt; i++) {
      const then_stmt_gen_prototype = get_stmtgenerator(cur_stmt_complex_level + 1);
      const then_stmt_gen = new then_stmt_gen_prototype();
      then_stmt_gen.generate(cur_stmt_complex_level + 1);
      true_body = true_body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      true_body.push(then_stmt_gen.irnode! as stmt.IRStatement);
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
    return true_body;
  }

  private generate_false_body(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating If false body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.IF_BODY);
    let false_body : stmt.IRStatement[] = [];
    const false_stmt_cnt = random_int(config.if_body_stmt_cnt_lower_limit, config.if_body_stmt_cnt_upper_limit);
    for (let i = 0; i < false_stmt_cnt; i++) {
      const else_stmt_gen_prototype = get_stmtgenerator(cur_stmt_complex_level + 1);
      const else_stmt_gen = new else_stmt_gen_prototype();
      else_stmt_gen.generate(cur_stmt_complex_level + 1);
      false_body = false_body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      false_body.push(else_stmt_gen.irnode! as stmt.IRStatement);
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
    return false_body;
  }

  generate(cur_stmt_complex_level : number) : void {
    this.start_flag();
    cur_scope = cur_scope.new(scopeKind.IF_CONDITION);
    const condition_expr = this.generate_condition();
    const true_body = this.generate_true_body(cur_stmt_complex_level);
    if (Math.random() < config.else_prob) {
      this.irnode = new stmt.IRIf(new_global_id(), cur_scope.id(), condition_expr, true_body, []);
      (this.irnode as stmt.IRStatement).exprs = this.exprs;
      return;
    }
    const false_body = this.generate_false_body(cur_stmt_complex_level);
    cur_scope = cur_scope.rollback();
    this.irnode = new stmt.IRIf(new_global_id(), cur_scope.id(), condition_expr, true_body, false_body);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    this.end_flag();
  }
}

class ForStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  private generate_init() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating intialization, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    //! Generate the initialization statement
    let init_stmt_expr : stmt.IRVariableDeclarationStatement | expr.IRExpression | undefined;
    const init_cnt = random_int(config.for_init_cnt_lower_limit, config.for_init_cnt_upper_limit);
    if (init_cnt > 0 && Math.random() < config.vardecl_prob) {
      const mul_vardecl_gen = new MultipleVariableDeclareStatementGenerator(init_cnt);
      mul_vardecl_gen.generate(0);
      init_stmt_expr = mul_vardecl_gen.irnode! as stmt.IRVariableDeclarationStatement;
      this.exprs = this.exprs.concat(mul_vardecl_gen.exprs);
    }
    else {
      const ir_exps : expr.IRExpression[] = [];
      for (let i = 0; i < init_cnt; i++) {
        const init_expr_gen_prototype = get_exprgenerator(all_types);
        const iid = new_global_id();
        type_dag.insert(iid, all_types);
        const init_expr_gen = new init_expr_gen_prototype(iid);
        init_expr_gen.generate(0);
        ir_exps.push(init_expr_gen.irnode! as expr.IRExpression);
      }
      if (init_cnt > 0) {
        init_stmt_expr = new expr.IRTuple(new_global_id(), cur_scope.id(), ir_exps);
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
    return init_stmt_expr;
  }

  private generate_condition() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating conditional, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cid = new_global_id();
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
    return conditional_gen.irnode! as expr.IRExpression;
  }

  private generate_loop() {
    const loop_gen_prototype = get_exprgenerator(all_types);
    const lid = new_global_id();
    type_dag.insert(lid, all_types);
    const loop_gen = new loop_gen_prototype(lid);
    loop_gen.generate(0);
    this.exprs = this.exprs.concat([expr.tuple_extraction(loop_gen.irnode as expr.IRExpression)]);
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}ForStatement Loop Generation, scope: ${cur_scope.kind()}`));
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    return loop_gen.irnode! as expr.IRExpression;
  }

  private generate_body(cur_stmt_complex_level : number) {
    cur_scope = cur_scope.new(scopeKind.FOR_BODY);
    const stmt_cnt = random_int(config.for_body_stmt_cnt_lower_limit, config.for_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = get_stmtgenerator(cur_stmt_complex_level + 1);
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode! as stmt.IRStatement);
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
    return body;
  }

  generate(cur_stmt_complex_level : number) {
    this.start_flag();
    cur_scope = cur_scope.new(scopeKind.FOR_CONDITION);
    const init_stmt_expr = this.generate_init();
    const conditional_expr = this.generate_condition();
    const loop_expr = this.generate_loop();
    cur_scope = cur_scope.rollback();
    const body = this.generate_body(cur_stmt_complex_level);
    this.irnode = new stmt.IRFor(new_global_id(), cur_scope.id(), init_stmt_expr,
      conditional_expr, loop_expr, body);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    this.end_flag();
  }
}

class WhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  private generate_condition() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cond_gen_prototype = get_exprgenerator(type.bool_types);
    const cid = new_global_id();
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
    return cond_gen.irnode! as expr.IRExpression;
  }

  private generate_body(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.WHILE_BODY);
    const stmt_cnt = random_int(config.while_body_stmt_cnt_lower_limit, config.while_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = get_stmtgenerator(cur_stmt_complex_level + 1);
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode! as stmt.IRStatement);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}WhileStatement body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    return body;
  }

  generate(cur_stmt_complex_level : number) : void {
    this.start_flag();
    const conditional_expr = this.generate_condition();
    const body = this.generate_body(cur_stmt_complex_level);
    this.irnode = new stmt.IRWhile(new_global_id(), cur_scope.id(), conditional_expr, body);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    this.end_flag();
  }
}

class DoWhileStatementGenerator extends NonExpressionStatementGenerator {
  constructor() {
    super();
  }

  private generate_condition() {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement condition, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    const cond_gen_prototype = get_exprgenerator(type.bool_types);
    const cid = new_global_id();
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
    return cond_gen.irnode! as expr.IRExpression;
  }

  private generate_body(cur_stmt_complex_level : number) {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating DoWhileStatement body, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.DOWHILE_BODY);
    const stmt_cnt = random_int(config.do_while_body_stmt_cnt_lower_limit, config.do_while_body_stmt_cnt_upper_limit);
    let body : stmt.IRStatement[] = [];
    for (let i = 0; i < stmt_cnt; i++) {
      const body_stmt_gen_prototype = get_stmtgenerator(cur_stmt_complex_level + 1);
      const body_stmt_gen = new body_stmt_gen_prototype();
      body_stmt_gen.generate(cur_stmt_complex_level + 1);
      this.exprs = this.exprs.concat(
        body_stmt_gen instanceof ExpressionStatementGenerator ?
          [expr.tuple_extraction(body_stmt_gen.expr!)] :
          body_stmt_gen.exprs
      );
      body = body.concat(unexpected_extra_stmt.has(cur_scope.id()) ? unexpected_extra_stmt.get(cur_scope.id())! : []);
      unexpected_extra_stmt.delete(cur_scope.id());
      body.push(body_stmt_gen.irnode! as stmt.IRStatement);
    }
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}DoWhileStatement body, scope: ${cur_scope.kind()}`));
    }
    cur_scope = cur_scope.rollback();
    return body;
  }

  generate(cur_stmt_complex_level : number) : void {
    this.start_flag();
    const condition_expr = this.generate_condition();
    const body = this.generate_body(cur_stmt_complex_level);
    this.irnode = new stmt.IRDoWhile(new_global_id(), cur_scope.id(), condition_expr, body);
    (this.irnode as stmt.IRStatement).exprs = this.exprs;
    this.end_flag();
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