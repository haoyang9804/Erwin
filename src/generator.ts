import { assert, pick_random_element, random_int, merge_set, intersection, cartesian_product } from "./utility";
import { IRGhost, IRNode, IRSourceUnit } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { IDENTIFIER, decl_db, expr_db, ghost_member_of_member_inside_struct_instantiation, name_db, stmt_db, type_db, update_ghost_members_of_struct_instantiation } from "./db";
import { type_dag, storage_location_dag, vismut_dag } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { is_super_range, is_equal_range, intersection_range } from "./dominance";
import { ContractKind, DataLocation, FunctionCallKind, FunctionKind, FunctionStateMutability, FunctionVisibility, StateVariableVisibility } from "solc-typed-ast";
import { ScopeList, scopeKind, initScope, inside_function_body, inside_struct_decl_scope, get_scope_from_scope_id, unexpected_extra_stmt_belong_to_the_parent_scope, inside_constructor_scope, inside_constructor_parameter_scope } from "./scope";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { FuncVis, FuncVisProvider } from "./visibility";
import * as loc from "./loc";
import { all_func_vismut, all_var_vismut, closed_func_vismut, FuncVisMut, nonpayable_func_vismut, nonpure_func_vismut, nonpure_nonview_func_vismut, open_func_vismut, pure_func_vismut, view_func_vismut, VisMut, VisMutKindProvider, VisMutProvider } from "./vismut";
import { sig } from "./signal";
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables
const global_id_start = 1;
export let global_id = global_id_start;
export function new_global_id() {
  return global_id++;
}
export function change_node_id(node : IRNode, new_id : number) {
  let origin_node_of_new_id : IRNode | undefined = irnodes.get(new_id);
  irnodes.delete(node.id);
  node.id = new_id;
  if (origin_node_of_new_id !== undefined) {
    irnodes.delete(new_id);
    const id = new_global_id();
    origin_node_of_new_id!.id = id;
    irnodes.set(id, origin_node_of_new_id!);
  }
  irnodes.set(new_id, node);
}
let cur_scope : ScopeList = initScope();
let indent = 0;

export function initialize_variable(vardecl_id : number) {
  assert(irnodes.has(vardecl_id), `initialize_variable: id ${vardecl_id} is not in irnodes`);
  assert(irnodes.get(vardecl_id) instanceof decl.IRVariableDeclaration,
    `initialize_variable: id ${vardecl_id} is not an instance of IRVariableDeclaration`);
  const vardecl = irnodes.get(vardecl_id) as decl.IRVariableDeclaration;
  const assignment = new expr.IRAssignment(new_global_id(), cur_scope.id(),
    new expr.IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id),
    new expr.IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id), '=');
  const assignment_stmt = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), assignment);
  expr_db.expr_reads_variable(assignment.id, vardecl.id);
  expr_db.expr_writes_variable(assignment.id, vardecl.id);
  (assignment_stmt as stmt.IRStatement).exprs.push(assignment);
  return assignment_stmt;
}

function generate_type_range_str(type_range : type.Type[]) : string {
  assert(type_range.length > 0, `generate_type_range_str: type_range is empty`);
  let type_range_str : string;
  if (type.contains_trivial_mapping(type_range)
    || type.contains_trivial_array(type_range)) {
    type_range_str = type_range.map(t => t.str()).join(',');
  }
  else if (type.all_array(type_range)) {
    let base_range = type_range.map(t => (t as type.ArrayType).base);
    base_range = base_range.filter((t, i) => base_range.findIndex((t2) => t2.same(t)) === i);
    const base_range_str = generate_type_range_str(base_range);
    type_range_str = base_range_str.split(',').map(s =>
      `${s}[${(type_range[0] as type.ArrayType).length === undefined ? '' : (type_range[0] as type.ArrayType).length}]`).join(',');
  }
  else if (type.all_mapping(type_range)) {
    let key_range = type_range.map(t => (t as type.MappingType).kType);
    key_range = key_range.filter((t, i) => key_range.findIndex((t2) => t2.same(t)) === i);
    const key_range_str = generate_type_range_str(key_range);
    let value_range = type_range.map(t => (t as type.MappingType).vType);
    value_range = value_range.filter((t, i) => value_range.findIndex((t2) => t2.same(t)) === i);
    const value_range_str = generate_type_range_str(value_range);
    type_range_str = `{k: ${key_range_str}, v: ${value_range_str}}`;
  }
  else {
    type_range_str = type_range.map(t => t.str()).join(',');
  }
  return type_range_str;
}

/*
Mapping, array, and struct all have constituent variable declarations.
Storage loc range of such compound-type variable declaration is constrained by
and constraints the storage loc range of its constituent variable declarations.
*/
function update_storage_loc_range_for_compound_type(id : number, struct_instantiation_id = -1, ghost_id = -1) {
  assert(decl_db.qualifed_by_storage_qualifier(id),
    `update_storage_loc_range_recursively: id ${id} is not qualified by storage qualifier`);
  assert(decl_db.is_vardecl(id) || decl_db.is_state_variable(id) || expr_db.is_new_struct_expr(id),
    `update_storage_loc_range_recursively: id ${id} is not a variable declaration or a new struct expression`);
  if (!expr_db.is_new_struct_expr(id) &&
    inside_struct_decl_scope(get_scope_from_scope_id(decl_db.scope_of_irnode(id))) &&
    struct_instantiation_id === -1) {
    return;
  }
  if (decl_db.is_array_decl(id)) {
    const baseid = decl_db.base_of_array(id);
    if (decl_db.qualifed_by_storage_qualifier(baseid)) {
      if (ghost_id === -1) {
        assert(struct_instantiation_id === -1,
          `update_storage_loc_range_for_compound_type: ghost_id is -1 but struct_instantiation_id (${struct_instantiation_id}) is not -1`);
        if (storage_location_dag.has_solution_range(baseid)) {
          storage_location_dag.update(baseid,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        }
        else {
          storage_location_dag.insert(baseid,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        }
        const bridge_id = new_global_id();
        storage_location_dag.insert(bridge_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        storage_location_dag.connect(bridge_id, id);
        storage_location_dag.connect(bridge_id, baseid);
        storage_location_dag.solution_range_alignment(bridge_id, baseid);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, base id: ${baseid}, array id: ${id}`);
        }
      }
      else {
        assert(!storage_location_dag.has_solution_range(baseid),
          `update_storage_loc_range_for_compound_type: baseid ${baseid} has solution range`);
        assert(struct_instantiation_id !== -1,
          `update_storage_loc_range_for_compound_type: struct_instantiation_id is -1 but ghost_id is not -1`);
        const base_ghost_id = new_global_id();
        const bridge_id = new_global_id();
        storage_location_dag.insert(base_ghost_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
        storage_location_dag.insert(bridge_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
        storage_location_dag.connect(bridge_id, ghost_id);
        storage_location_dag.connect(bridge_id, base_ghost_id);
        update_ghost_members_of_struct_instantiation(struct_instantiation_id, baseid, base_ghost_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, base ghost id: ${base_ghost_id}, base id: ${baseid}, ghost array id: ${ghost_id}, array id: ${id}`);
        }
        update_storage_loc_range_for_compound_type(baseid, struct_instantiation_id, base_ghost_id);
      }
    }
  }
  else if (decl_db.is_struct_instance_decl(id)) {
    const members = decl_db.members_of_struct_instance(id);
    members.forEach((member) => {
      if (decl_db.qualifed_by_storage_qualifier(member)) {
        if (ghost_id === -1) {
          const member_ghost_id = new_global_id();
          storage_location_dag.insert(member_ghost_id,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
          const bridge_id = new_global_id();
          storage_location_dag.insert(bridge_id,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
          storage_location_dag.connect(bridge_id, id);
          storage_location_dag.connect(bridge_id, member_ghost_id);
          update_ghost_members_of_struct_instantiation(id, member, member_ghost_id);
          if (config.debug) {
            console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, member id: ${member}, struct instance id: ${id}, member ghost id: ${member_ghost_id}`);
          }
          update_storage_loc_range_for_compound_type(member, id, member_ghost_id);
        }
        else {
          assert(!storage_location_dag.has_solution_range(member),
            `update_storage_loc_range_for_compound_type: member ${member} has solution range`);
          assert(struct_instantiation_id !== -1,
            `update_storage_loc_range_for_compound_type: struct_instantiation_id is -1 but ghost_id is not -1`);
          const member_ghost_id = new_global_id();
          const bridge_id = new_global_id();
          storage_location_dag.insert(member_ghost_id,
            loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
          storage_location_dag.insert(bridge_id,
            loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
          storage_location_dag.connect(bridge_id, ghost_id);
          storage_location_dag.connect(bridge_id, member_ghost_id);
          update_ghost_members_of_struct_instantiation(struct_instantiation_id, member, member_ghost_id);
          if (config.debug) {
            console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, member id: ${member}, struct instance id: ${id}, member ghost id: ${member_ghost_id}, stuct instance ghost id: ${ghost_id}, struct instantiation id: ${struct_instantiation_id}`);
          }
          update_storage_loc_range_for_compound_type(member, struct_instantiation_id, member_ghost_id);
        }
      }
    });
  }
  else if (expr_db.is_new_struct_expr(id)) {
    const members = expr_db.members_of_new_struct_expr(id);
    members.forEach((member) => {
      if (decl_db.qualifed_by_storage_qualifier(member)) {
        const member_ghost_id = new_global_id();
        storage_location_dag.insert(member_ghost_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        storage_location_dag.connect(id, member_ghost_id);
        update_ghost_members_of_struct_instantiation(id, member, member_ghost_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: member id: ${member}, struct expr id: ${id}, member ghost id: ${member_ghost_id}`);
        }
        update_storage_loc_range_for_compound_type(member, id, member_ghost_id);
      }
    });
  }
  else if (decl_db.is_mapping_decl(id)) {
    const value = decl_db.value_of_mapping(id);
    if (decl_db.qualifed_by_storage_qualifier(value)) {
      if (ghost_id === -1) {
        if (storage_location_dag.has_solution_range(value)) {
          storage_location_dag.update(value,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        }
        else {
          storage_location_dag.insert(value,
            loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        }
        const bridge_id = new_global_id();
        storage_location_dag.insert(bridge_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(id)!, 'equal'));
        storage_location_dag.connect(bridge_id, id);
        storage_location_dag.connect(bridge_id, value);
        storage_location_dag.solution_range_alignment(bridge_id, value);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, value id: ${value}, mapping id: ${id}`);
        }
      }
      else {
        assert(!storage_location_dag.has_solution_range(value),
          `update_storage_loc_range_for_compound_type: value ${value} has solution range`);
        assert(struct_instantiation_id !== -1,
          `update_storage_loc_range_for_compound_type: struct_instantiation_id is -1 but ghost_id is not -1`);
        const value_ghost_id = new_global_id();
        const bridge_id = new_global_id();
        storage_location_dag.insert(value_ghost_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
        storage_location_dag.insert(bridge_id,
          loc.range_of_locs(storage_location_dag.solution_range_of(ghost_id)!, 'equal'));
        storage_location_dag.connect(bridge_id, value_ghost_id);
        storage_location_dag.connect(bridge_id, ghost_id);
        update_ghost_members_of_struct_instantiation(struct_instantiation_id, value, value_ghost_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}update_storage_loc_range_for_compound_type: bridge id: ${bridge_id}, value ghost id: ${value_ghost_id}, ghost mapping id: ${ghost_id}, mapping id: ${id}`);
        }
        update_storage_loc_range_for_compound_type(value, struct_instantiation_id, value_ghost_id);
      }
    }
  }
}

/*
Solution ranges of arguments (including function call argument, return values, etc) are related
to the solution ranges of the corresponding parameters (including function parameters, return variables, etc).
*/
// haoyang : may contain bugs considering storage loc range
function connect_arguments_to_parameters(arg_id : number,
  param_id : number,
  exprgen_name : string,
  type_range : type.Type[],
  storage_loc_range : loc.StorageLocation[]) : number | undefined {
  let ghost_id;
  if (exprgen_name === "LiteralGenerator") {
    ghost_id = new_global_id();
    new IRGhost(ghost_id, cur_scope.id());
    type_dag.insert(ghost_id, type_range);
    type_dag.connect(ghost_id, arg_id);
    type_dag.solution_range_alignment(ghost_id, arg_id);
    type_dag.connect(ghost_id, param_id, "super_dominance");
    type_dag.solution_range_alignment(ghost_id, param_id);
    if (config.debug) {
      console.log(`${" ".repeat(indent)}connect_arguments_to_parameters: ghost id: ${ghost_id}, arg id: ${arg_id}, param id: ${param_id}`);
    }
  }
  else {
    type_dag.connect(arg_id, param_id, "super_dominance");
    type_dag.solution_range_alignment(arg_id, param_id);
  }
  if (storage_loc_range.length > 0) {
    assert(!storage_location_dag.has_solution_range(arg_id),
      `storage_location_dag.solution_range should not have ${arg_id}.
       Perhaps you assign a storage location to a variable before calling function connect_arguments_to_parameters.`);
    storage_location_dag.insert(arg_id, storage_loc_range);
    storage_location_dag.connect(arg_id, param_id, "super_dominance");
  }
  return ghost_id;
}


function remove_storage_is_dumb(id : number) {
  if (!storage_location_dag.has_solution_range(id)) {
    return false;
  }
  const shrinked_loc_range = storage_location_dag.solution_range_of(id)!.filter(
    s => s !== loc.StorageLocationProvider.storage_pointer() &&
      s !== loc.StorageLocationProvider.storage_ref());
  if (shrinked_loc_range.length === 0 || !vardecl_storage_loc_range_is_ok(id, shrinked_loc_range)) {
    return true;
  }
  return !storage_location_dag.try_tighten_solution_range_middle_out(id, shrinked_loc_range);
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
    storage_location_dag.solution_range_alignment(arg_id, param_id);
  }
}

function contains_available_funcdecls(contractdecl_id_plus_funcdecl_id : [number, number][]) : boolean {
  if (contractdecl_id_plus_funcdecl_id.length === 0) return false;
  for (const [contractdecl_id, funcdecl_id] of contractdecl_id_plus_funcdecl_id) {
    if (decl_db.is_getter_function(funcdecl_id)) {
      if (contractdecl_id !== decl_db.get_current_contractdecl_id(cur_scope)) {
        return true;
      }
      continue;
    }
    const visibility_range = vismut_dag.solution_range_of(funcdecl_id)!.
      filter(v => v instanceof FuncVisMut)
      .map(v => v.kind.visibility);
    if (contractdecl_id === decl_db.get_current_contractdecl_id(cur_scope) &&
      (
        visibility_range.includes(FuncVisProvider.internal()) ||
        visibility_range.includes(FuncVisProvider.private()) ||
        visibility_range.includes(FuncVisProvider.public())
      )) {
      return true;
    }
    if (contractdecl_id !== decl_db.get_current_contractdecl_id(cur_scope) &&
      (
        visibility_range.includes(FuncVisProvider.external()) ||
        visibility_range.includes(FuncVisProvider.public())
      )) {
      return true;
    }
  }
  return false;
}

function get_funcdecls(type_range : type.Type[], storage_range : loc.StorageLocation[]) : [number, number][] {
  /*
    Return a list of [contractdecl_id, funcdecl_id] pairs.
    The function declaration with funcdecl_id is in the contract declaration with the contractdecl_id.
  */
  let contractdecl_id_plus_funcdecl_id : [number, number][] = [];
  //! Get in-contract functions
  for (let contract_id of decl_db.contractdecls_ids()) {
    const funcdecl_ids = decl_db.get_funcdecls_ids_recursively_from_a_contract(contract_id);
    for (let irnode_id of funcdecl_ids) {
      const funcdecl = (irnodes.get(irnode_id)! as decl.IRFunctionDefinition);
      const returns = funcdecl.returns;
      const params = funcdecl.parameters;
      // internal call
      if (contract_id === decl_db.get_current_contractdecl_id(cur_scope)) {
        if (vismut_dag.solution_range_of(irnode_id)!.some(t => closed_func_vismut.includes(t)) &&
          (sig.allow_empty_return || returns.length > 0)) {
          if (sig.allow_empty_return) {
            contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
          }
          else if (returns.length > 1) {
            // In this case, we must use an identifier to relay the function returns, such as 
            // (, identifier) = func(x, y);
            // However, if the functio' return variable are all of mapping-containing types, we cannot use this way
            // since we cannot assign a mapping to a mapping.
            if (returns.some((ret) => !decl_db.contains_mapping_decl(ret.id))) {
              for (const ret_decl of returns) {
                if (vardecl_type_range_is_ok(ret_decl.id, type_range) && vardecl_storage_loc_range_is_ok(ret_decl.id, storage_range)) {
                  contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                  break;
                }
              }
            }
          }
          else {
            for (const ret_decl of returns) {
              if (vardecl_type_range_is_ok(ret_decl.id, type_range) && vardecl_storage_loc_range_is_ok(ret_decl.id, storage_range)) {
                contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
                break;
              }
            }
          }
        }
      }
      // "this" function calls of other contracts
      else if (contract_id < 0 && contract_id !== -decl_db.get_current_contractdecl_id(cur_scope)!) {
        continue;
      }
      // external call
      else {
        if (vismut_dag.solution_range_of(irnode_id)!.some(t => open_func_vismut.includes(t)) &&
          (sig.allow_empty_return || returns.length > 0) &&
          // external call makes the callee's return values and parameters non-storage
          // so we need to assure every return value and parameter can affort the loss of storage
          returns.every(ret => !remove_storage_is_dumb(ret.id)) &&
          params.every(param => !remove_storage_is_dumb(param.id))) {
          if (sig.allow_empty_return) {
            contractdecl_id_plus_funcdecl_id.push([contract_id, irnode_id]);
          }
          else {
            for (const ret_decl of returns) {
              if (vardecl_type_range_is_ok(ret_decl.id, type_range) && vardecl_storage_loc_range_is_ok(ret_decl.id, storage_range)) {
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
  if (sig.forbid_external_call) {
    contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
      ([contract_id, _]) => contract_id === decl_db.get_current_contractdecl_id(cur_scope) || contract_id === -decl_db.get_current_contractdecl_id(cur_scope)!
    );
  }
  let function_contaion_mapping_parameters_or_mapping_returns = (funcdecl_id : number) : boolean => {
    const func_decl = irnodes.get(funcdecl_id) as decl.IRFunctionDefinition;
    return func_decl.parameters.some((param) => decl_db.is_mapping_decl(param.id)) ||
      func_decl.returns.some((ret) => decl_db.is_mapping_decl(ret.id));
  }
  contractdecl_id_plus_funcdecl_id = contractdecl_id_plus_funcdecl_id.filter(
    ([contract_id, function_id]) => {
      if (contract_id !== decl_db.get_current_contractdecl_id(cur_scope) &&
        function_contaion_mapping_parameters_or_mapping_returns(function_id)) {
        return false;
      }
      return true;
    }
  )
  return contractdecl_id_plus_funcdecl_id;
}

function cannot_choose_functioncallgenerator(type_range : type.Type[]) : boolean {
  return !contains_available_funcdecls(get_funcdecls(type_range, loc.all_storage_locations));
}

function get_exprgenerator(type_range : type.Type[],
  cur_expression_complexity_level : number = 0,
  forbidden_generators : any[] = [],
  storage_loc_range : loc.StorageLocation[] = []) : any {
  let arg_gen_prototype;
  let generator_candidates = new Set<any>();
  let not_complex = () : boolean => {
    return cur_expression_complexity_level < config.expression_complexity_level
      && Math.random() < config.expression_complexity_prob;
  }
  if (type_range.some(t => t.typeName === "ContractType")) {
    generator_candidates.add(IdentifierGenerator);
    if (not_complex()) {
      generator_candidates.add(NewContractGenerator);
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "StructType")) {
    generator_candidates.add(IdentifierGenerator);
    if (not_complex()) {
      if ((storage_loc_range.length === 0 ||
        storage_loc_range.some(s => s.same(loc.StorageLocationProvider.memory()))) &&
        type_range.some(t => t.typeName === "StructType" && !type.contain_mapping_type(t))) {
        generator_candidates.add(NewStructGenerator);
        type_range = type_range.filter(t => !type.contain_mapping_type(t));
      }
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "MappingType")) {
    generator_candidates.add(IdentifierGenerator);
    if (not_complex()) {
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  if (type_range.some(t => t.typeName === "ArrayType")) {
    generator_candidates.add(IdentifierGenerator);
    if (not_complex()) {
      generator_candidates.add(AssignmentGenerator);
      generator_candidates.add(FunctionCallGenerator);
      generator_candidates.add(ConditionalGenerator);
    }
  }
  const contain_element_types = type_range.some(t => t.typeName === "ElementaryType");
  if (contain_element_types) {
    if (!not_complex()) {
      generator_candidates = merge_set(generator_candidates, new Set<any>([...terminal_expression_generators]));
    }
    else {
      if (is_equal_range(type_range, type.address_types)) {
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
  if (type_range.every(t => type.contain_mapping_type(t))) {
    generator_candidates.delete(AssignmentGenerator);
  }
  let generator_candidates_array = Array.from(generator_candidates);
  assert(generator_candidates_array.length > 0, `get_exprgenerator: generator_candidates is empty, type_range is ${type_range.map(t => t.str())}`);
  arg_gen_prototype = pick_random_element(generator_candidates_array)!;
  return arg_gen_prototype;
}

function get_stmtgenerator(cur_stmt_complex_level : number = -1) : any {
  let complex = () : boolean => {
    return cur_stmt_complex_level >= config.statement_complexity__level || Math.random() < config.nonstructured_statement_prob;
  }
  let generator_candidates = cur_stmt_complex_level === -1 ?
    new Set<any>(statement_generators) :
    complex() ?
      new Set<any>(expr_statement_generators) :
      new Set<any>(statement_generators);
  if (get_funcdecls(type_db.types(), loc.all_storage_locations).length === 0) {
    generator_candidates.delete(FunctionCallStatementGenerator);
  }
  let generator_candidates_array = Array.from(generator_candidates);
  return pick_random_element(generator_candidates_array);
}

function vardecl_type_range_is_ok(vardecl_id : number, type_range : type.Type[]) : boolean {
  return is_super_range(type_dag.solution_range_of(vardecl_id)!, type_range) &&
    type_dag.try_tighten_solution_range_middle_out(vardecl_id, type_range) ||
    is_super_range(type_range, type_dag.solution_range_of(vardecl_id)!)
}

function vardecl_storage_loc_range_is_ok(vardecl_id : number, storage_loc_range : loc.StorageLocation[]) : boolean {
  if (!storage_location_dag.has_solution_range(vardecl_id) && storage_loc_range.length > 0) {
    return false;
  }
  if (storage_loc_range.length === 0) {
    return true;
  }
  return is_super_range(storage_location_dag.solution_range_of(vardecl_id)!, storage_loc_range) &&
    storage_location_dag.try_tighten_solution_range_middle_out(vardecl_id, storage_loc_range) ||
    is_super_range(storage_loc_range, storage_location_dag.solution_range_of(vardecl_id)!)
}

function get_vardecls(types : type.Type[], storage_locs : loc.StorageLocation[]) : decl.IRVariableDeclaration[] {
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
        if (!sig.no_state_variable_in_function_body) {
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
    (irdecl) => vardecl_type_range_is_ok(irdecl.id, types) &&
      vardecl_storage_loc_range_is_ok(irdecl.id, storage_locs) &&
      !decl_db.is_locked_vardecl(irdecl.id)
  );
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
    type_db.init_types();
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
      type_db.remove_internal_struct_types();
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
  cur_type_complexity_level : number;

  constructor(cur_type_complexity_level : number, type_range : type.Type[], must_be_in_contract_scope : boolean = false) {
    super();
    this.cur_type_complexity_level = cur_type_complexity_level;
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
      key_type_range = type_db.types().filter((t) =>
        t.typeName !== 'StructType' &&
        t !== type.TypeProvider.payable_address() &&
        t.typeName != 'MappingType' &&
        t.typeName != 'ArrayType'
      );
      value_type_range = type_db.types();
    }
    cur_scope = cur_scope.new(scopeKind.MAPPING);
    const key_var_gen = new VariableDeclarationGenerator(this.cur_type_complexity_level + 1, key_type_range, true)
    key_var_gen.generate();
    (key_var_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
    const value_var_gen = new VariableDeclarationGenerator(this.cur_type_complexity_level + 1, value_type_range, true)
    value_var_gen.generate();
    (value_var_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
    key_type_range = type_dag.solution_range_of(key_var_gen.irnode!.id)!;
    value_type_range = type_dag.solution_range_of(value_var_gen.irnode!.id)!;
    this.type_range = this.integrate_mapping_type_from_key_value_type_range(key_type_range, value_type_range);
    cur_scope = cur_scope.rollback();
    return [key_var_gen.irnode!.id, value_var_gen.irnode!.id];
  }

  private mapping_must_be_initialized_if_in_function_return_scope_or_funcbody() : void {
    let inside_function_without_init = () => {
      return (inside_function_body(cur_scope) || inside_constructor_scope(cur_scope)) &&
        (this.irnode! as decl.IRVariableDeclaration).value === undefined;
    };
    if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      const function_scope = cur_scope.pre();
      assert(function_scope.kind() === scopeKind.FUNC,
        `MappingDeclarationGenerator: function_scope.kind() is not FUNC but ${function_scope.kind()}`);
      assert(this.irnode !== undefined,
        `MappingDeclarationGenerator: this.irnode is undefined`);
      decl_db.set_vardecl_as_must_be_initialized(function_scope.id(), this.irnode!.id);
    }
    else if (inside_function_without_init()) {
      decl_db.set_vardecl_as_must_be_initialized(cur_scope.id(), this.irnode!.id);
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
      console.log(color.yellowBG(`${" ".repeat(indent)}Mapping Declaration, name: ${mapping_name} scope: ${cur_scope.kind()}, id: ${mappingid}, storage loc range: ${storage_location_dag.has_solution_range(mappingid) ? storage_location_dag.solution_range_of(mappingid).map(s => s.str()) : ''}`));
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
    if (inside_struct_decl_scope(cur_scope)) return;
    if (cur_scope.kind() === scopeKind.CONTRACT ||
      cur_scope.kind() === scopeKind.MAPPING ||
      cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(mappingid, [
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    else {
      storage_location_dag.insert(mappingid, [
        loc.StorageLocationProvider.storage_pointer()
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
    const mapping_name = name_db.generate_name(IDENTIFIER.MAPPING);
    this.irnode = new decl.IRVariableDeclaration(mappingid, cur_scope.id(), mapping_name);
    const [keyid, valueid] = this.generate_key_value();
    type_dag.insert(mappingid, this.type_range);
    decl_db.set_vardecl_as_nonassignable(mappingid);
    this.mapping_must_be_initialized_if_in_function_return_scope_or_funcbody();
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
  cur_type_complexity_level : number;
  base : IRNode | undefined;
  length : number | undefined;
  constructor(cur_type_complexity_level : number, type_range : type.Type[], no_initializer : boolean = true) {
    super();
    this.type_range = type_range;
    this.no_initializer = no_initializer;
    this.cur_type_complexity_level = cur_type_complexity_level;
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
      console.log(color.yellowBG(`${" ".repeat(indent)}Array Declaration, scope: ${cur_scope.kind()}, name: ${array_name}, id: ${arrayid}, storage loc range: ${storage_location_dag.has_solution_range(arrayid) ? storage_location_dag.solution_range_of(arrayid).map(s => s.str()) : ''}`));
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
      base_type_range = type_db.types();
    }
    else {
      base_type_range = this.type_range.map((t) => (t as type.ArrayType).base);
    }
    cur_scope = cur_scope.new(scopeKind.ARRAY);
    const base_gen = new VariableDeclarationGenerator(this.cur_type_complexity_level + 1, base_type_range, true);
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
    if (!this.no_initializer && Math.random() < config.initialization_prob &&
      decl_db.is_vardecl_nonassignable(this.irnode!.id) &&
      !decl_db.contains_mapping_decl(this.irnode!.id)) {
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
    if (inside_struct_decl_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `ArrayDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.MAPPING) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref(),
        loc.StorageLocationProvider.storage_pointer(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.calldata()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.calldata(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
    // External calls turns calldata ret decl into memory,
    // which may lead to troubles. Therefore, Erwin bans it.
    else if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.STRUCT) {
    }
    else if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.memory()
      ]);
    }
    else {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.calldata(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
  }

  private update_storage_location_range() {
    if (inside_struct_decl_scope(cur_scope)) {
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

  private array_must_be_initialized_if_in_function_return_scope_or_funcbody() : void {
    assert(this.irnode !== undefined,
      `ArrayDeclarationGenerator: this.irnode is undefined`);
    let inside_function_without_init = () => {
      return (inside_function_body(cur_scope) || inside_constructor_scope(cur_scope)) &&
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
    const array_name = name_db.generate_name(IDENTIFIER.ARRAY);
    this.irnode = new decl.IRVariableDeclaration(arrayid, cur_scope.id(), array_name);
    this.init_storage_location_range();
    this.generate_length();
    this.generate_base();
    decl_db.add_array_decl(arrayid, this.base!.id);
    this.update_type_range();
    type_dag.insert(arrayid, this.type_range);
    decl_db.if_array_decl_contain_mapping_decl(arrayid);
    if (decl_db.is_array_decl_that_contains_mapping_decl(arrayid)) {
      decl_db.set_vardecl_as_nonassignable(arrayid);
    }
    this.generate_initializer();
    this.initialize_array_length();
    decl_db.add_vardecl_with_scope(arrayid, cur_scope);
    this.update_storage_location_range();
    this.update_vismut_dag(arrayid);
    this.array_must_be_initialized_if_in_function_return_scope_or_funcbody();
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
      !decl_db.contains_mapping_decl(this.struct_id) &&
      decl_db.is_vardecl_nonassignable(this.irnode.id)) {
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
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Struct Instance Declaration, name: ${struct_instance_name} scope: ${cur_scope.kind()}, type: ${type_dag.solution_range_of(this.irnode.id)!.map(t => t.str())}, storage loc range: ${storage_location_dag.has_solution_range(this.irnode.id) ? storage_location_dag.solution_range_of(this.irnode.id).map(s => s.str()) : ""}`));
    }
  }

  private init_storage_location_range() {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      (this.irnode as decl.IRVariableDeclaration).state = true;
    }
    if (inside_struct_decl_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.MAPPING) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.ARRAY) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.storage_ref(),
        loc.StorageLocationProvider.storage_pointer(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.calldata()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.calldata(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.FUNC_RETURNS) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
    else if (cur_scope.kind() === scopeKind.STRUCT) {
    }
    else if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.memory()
      ]);
    }
    else {
      storage_location_dag.insert(this.irnode.id, [
        loc.StorageLocationProvider.calldata(),
        loc.StorageLocationProvider.memory(),
        loc.StorageLocationProvider.storage_pointer()
      ]);
    }
    assert(this.struct_id !== undefined, `StructInstanceDeclarationGenerator: this.struct_id is undefined`);
    if (decl_db.contains_mapping_decl(this.struct_id)) {
      storage_location_dag.update(this.irnode.id, [
        loc.StorageLocationProvider.storage_pointer(),
        loc.StorageLocationProvider.storage_ref()
      ]);
    }
    assert(storage_location_dag.non_empty_solution_range_of(this.irnode.id),
      `StructInstanceDeclarationGenerator: storage_location_dag.non_empty_solution_range_of(${this.irnode.id}) is empty`);
  }

  private init_storage_location_range_for_ghost_members() {
    if (inside_struct_decl_scope(cur_scope)) return;
    assert(this.irnode !== undefined, `StructInstanceDeclarationGenerator: this.irnode is undefined`);
    assert(storage_location_dag.has_solution_range(this.irnode!.id),
      `StructInstanceDeclarationGenerator: storage_location_dag doesn't have solution range of ${this.irnode!.id}`);
    assert(decl_db.struct_instance_has_paired_struct_decl(this.irnode!.id),
      `StructInstanceDeclarationGenerator: not pair this struct instance against a struct declaration`);
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
      return (inside_function_body(cur_scope) || inside_constructor_scope(cur_scope)) &&
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
    const struct_instance_name = name_db.generate_name(IDENTIFIER.STRUCT_INSTANCE);
    this.irnode = new decl.IRVariableDeclaration(thisid, cur_scope.id(), struct_instance_name);
    decl_db.pair_struct_instance_with_struct_decl(this.irnode.id, this.struct_id!);
    decl_db.add_struct_instance_decl(this.irnode.id);
    decl_db.add_vardecl_with_scope(this.irnode.id, cur_scope);
    type_dag.insert(this.irnode.id, this.type_range);
    if (decl_db.contains_mapping_decl(this.struct_id!)) {
      decl_db.set_vardecl_as_nonassignable(this.irnode.id);
    }
    this.generate_initializer();
    this.assign_storage_location_range();
    this.update_vismut_dag();
    this.struct_instance_must_be_initialized_if_in_function_return_scope_or_in_funcbody();
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
      type_dag.solution_range_alignment(nid, this.irnode.id);
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
    const contract_instance_name = name_db.generate_name(IDENTIFIER.CONTRACT_INSTANCE);
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
        type_dag.solution_range_alignment(ghost_id, literal_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}ElementaryTypeVariableDeclarationGenerator::generate_initializer: ghost_id: ${ghost_id}, literal_id: ${literal_id}, id: ${this.irnode!.id}`);
        }
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
          type_dag.connect(ghost_id, expr_id);
          type_dag.connect(ghost_id, this.irnode!.id, "super_dominance");
          type_dag.solution_range_alignment(ghost_id, this.irnode!.id);
          if (config.debug) {
            console.log(`${" ".repeat(indent)}ElementaryTypeVariableDeclarationGenerator::generate_initializer: ghost_id: ${ghost_id}, expr_id: ${expr_id}, id: ${this.irnode!.id}`);
          }
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
    this.name = name_db.generate_name(IDENTIFIER.VAR);
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
  cur_type_complexity_level : number;
  constructor(cur_type_complexity_level : number, type_range : type.Type[], no_initializer : boolean = true,
    must_be_in_contract_scope_if_mapping : boolean = false) {
    super();
    this.cur_type_complexity_level = cur_type_complexity_level;
    this.no_initializer = no_initializer;
    this.type_range = type_range;
    this.must_be_in_contract_scope_if_mapping = must_be_in_contract_scope_if_mapping
  }

  private distill_type_range() {
    //! Types containing (nested) mappings can only be parameters or return variables of internal or library functions.
    if (inside_constructor_parameter_scope(cur_scope)) {
      this.type_range = this.type_range.filter(t => {
        return !type.contain_mapping_type(t);
      })
    }
  }

  generate() : void {
    this.distill_type_range();
    const contain_element_types = this.type_range.some((t) => t.typeName === 'ElementaryType');
    const contain_contract_types = this.type_range.some((t) => t.typeName === 'ContractType');
    const contain_struct_types = this.type_range.some((t) => t.typeName === 'StructType' &&
      (!inside_constructor_parameter_scope(cur_scope) || !type.contain_mapping_type(t)));
    const contain_mapping_types = this.cur_type_complexity_level <= config.type_complexity_level &&
      this.type_range.some((t) => t.typeName === 'MappingType') && !inside_constructor_parameter_scope(cur_scope);
    const contain_array_types = this.cur_type_complexity_level <= config.type_complexity_level &&
      this.type_range.some((t) => t.typeName === 'ArrayType' &&
        (!inside_constructor_parameter_scope(cur_scope) || !type.contain_mapping_type(t)));
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
      const mapping_gen = new MappingDeclarationGenerator(this.cur_type_complexity_level, this.type_range, this.must_be_in_contract_scope_if_mapping);
      mapping_gen.generate();
      this.irnode = mapping_gen.irnode;
    }
    //! Generate a array-type variable
    else if (contain_array_types && Math.random() < contract_type_prob + struct_type_prob + mapping_type_prob + array_type_prob) {
      const array_gen = new ArrayDeclarationGenerator(this.cur_type_complexity_level, this.type_range, this.no_initializer);
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
        type_dag.connect(ghost_id, vardecl.id, "super_dominance");
        type_dag.connect(ghost_id, expr_id);
        type_dag.solution_range_alignment(ghost_id, expr_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}ConstructorDeclarationGenerator::initiaize_state_variables_in_cur_contract_scope: ghost_id: ${ghost_id}, expr_id: ${expr_id}, id: ${vardecl.id}`);
        }
      }
      else {
        type_dag.connect(expr_id, vardecl.id, "super_dominance");
        type_dag.solution_range_alignment(expr_id, vardecl.id);
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
      this.body = this.body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
      this.body.push(assignment_stmt);
      return true;
    }
    return false;
  }

  private generate_body_stmt() {
    const stmt_gen_prototype = get_stmtgenerator();
    const stmt_gen = new stmt_gen_prototype();
    stmt_gen.generate(0);
    stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
    this.body = this.body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
    stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Constructor Parameters, ${this.parameter_count} in total`));
      indent += 2;
    }
    cur_scope = cur_scope.new(scopeKind.CONSTRUCTOR_PARAMETERS);
    Array.from({ length: this.parameter_count }, () => {
      const variable_gen = new VariableDeclarationGenerator(0, type_db.types().filter((t) => t.typeName !== 'MappingType'));
      variable_gen.generate();
      this.parameters.push(variable_gen.irnode! as decl.IRVariableDeclaration);
    });
    cur_scope = cur_scope.rollback();
    if (config.debug) {
      indent -= 2;
      console.log(color.yellowBG(`${" ".repeat(indent)}Constructor Parameters`));
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
      const variable_gen = new VariableDeclarationGenerator(0, type_db.types(), true);
      variable_gen.generate();
      (variable_gen.irnode! as decl.IRVariableDeclaration).loc = DataLocation.Default;
      this.body.push(variable_gen.irnode! as decl.IRVariableDeclaration);
      decl_db.add_member_to_struct_decl(variable_gen.irnode!.id, struct_id);
    }
    cur_scope = cur_scope.rollback();
  }

  private add_struct_type(struct_id : number, struct_name : string) {
    const struct_type = new type.StructType(struct_id, struct_name, `struct ${struct_name}`);
    type_db.add_struct_type(struct_type, cur_scope);
  }

  generate() : void {
    const thisid = new_global_id();
    this.start_flag(thisid);
    decl_db.insert(thisid, cur_scope.id());
    const struct_name = name_db.generate_name(IDENTIFIER.STRUCT);
    this.generate_member_variables(thisid);
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
    if (!sig.external_call) {
      visibility_range.push(FuncVisProvider.internal());
      visibility_range.push(FuncVisProvider.private());
    }
    return visibility_range;
  }

  private get_state_mutability_range(read_storage_variables : boolean, modify_storage_variables : boolean) : FuncStat[] {
    let state_mutability_range : FuncStat[] = [];
    if (modify_storage_variables) {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
      ]
    }
    else if (read_storage_variables) {
      state_mutability_range = [
        FuncStatProvider.payable(),
        FuncStatProvider.empty(),
        FuncStatProvider.view(),
      ]
    }
    else if (sig.external_call) {
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

  private get_vismut_range(read_storage_variables : boolean, modify_storage_variables : boolean) : VisMut[] {
    const state_mutability_range = this.get_state_mutability_range(read_storage_variables, modify_storage_variables);
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
      vismut_dag.solution_range_alignment(ghost_id, called_function_decl_ID);
      if (config.debug) {
        console.log(`${" ".repeat(indent)}FunctionDeclarationGenerator::build_connection_between_caller_and_callee: ghost_id: ${ghost_id}, id: ${thisid}, called_function_decl_ID: ${called_function_decl_ID}`);
      }
    }
    decl_db.clear_called_function_decls();
  }

  private throw_no_state_variable_signal_at_random() : void {
    if (Math.random() > 0.5) {
      // This is just a signal. It will not prevent the generation of state variables in the function body.
      // For instance, the generator may generate a mapping declaration and place it on the state variable
      // zone when generating the function body.
      sig.no_state_variable_in_function_body = true;
    }
  }

  private clear_no_state_variable_signal() : void {
    sig.no_state_variable_in_function_body = false;
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
    stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
  }

  private generate_func_body_stmts() {
    for (let i = 0; i < this.body_stmt_count; i++) {
      if (this.removing_storage_from_parameters_or_returns_leads_to_broken_storage_location_constraint()) {
        // If removing the storage location from the parameters or returns leads to a broken storage location constraint, the function cannot be public or external.
        // Therefore, the external call is forbidden.
        sig.forbid_external_call = true;
      }
      const stmt_gen_prototype = get_stmtgenerator();
      const stmt_gen = new stmt_gen_prototype();
      stmt_gen.generate(0);
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      this.body = this.body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
      this.body.push(stmt_gen.irnode! as stmt.IRStatement);
    }
  }

  private generate_func_return_exprs() {
    if (Math.random() < config.return_prob) {
      this.return_decls.forEach((return_decl) => {
        if (this.removing_storage_from_parameters_or_returns_leads_to_broken_storage_location_constraint()) {
          // If removing the storage location from the parameters or returns leads to a broken storage location constraint, the function cannot be public or external.
          // Therefore, the external call is forbidden.
          sig.forbid_external_call = true;
        }
        //* Generate expr for return
        const expr_id = new_global_id();
        const type_range = type_dag.solution_range_of(return_decl.id)!;
        type_dag.insert(expr_id, type_range);
        const storage_loc_range = storage_location_dag.has_solution_range(return_decl.id) ?
          storage_location_dag.solution_range_of(return_decl.id)!.flatMap((s) => s.subs())
          : [];
        let expr_gen_prototype = get_exprgenerator(type_range, 0, [FunctionCallGenerator], storage_loc_range as loc.StorageLocation[]);
        const expr_gen = new expr_gen_prototype(expr_id);
        const ghost_id = connect_arguments_to_parameters(expr_id,
          return_decl.id,
          expr_gen.generator_name,
          type_range,
          storage_loc_range as loc.StorageLocation[]);
        expr_gen.generate(0);
        const exp = expr_gen.irnode! as expr.IRExpression;
        this.return_values.push(exp);
        stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
        this.body = this.body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
        stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
        }
        for (const written_vardecl of expr_db.write_variables_of_expr(body_expr.id)!) {
          this.write_vardecls.add(written_vardecl);
        }
      }
    }
  }

  private removing_storage_from_parameters_or_returns_leads_to_broken_storage_location_constraint() : boolean {
    return this.storage_parameters.some(p => remove_storage_is_dumb(p.id)) ||
      this.storage_return_decls.some(r => remove_storage_is_dumb(r.id));
  }

  private update_vismut_dag_and_storage_dag_based_on_read_vardecls_and_write_vardecls() {
    let read_storage_variables = false;
    let modify_storage_variables = false;
    const read_possibly_storage_variables : number[] = [];
    const modify_possibly_storage_variables : number[] = [];
    for (const read_vardecl of this.read_vardecls) {
      assert(!decl_db.is_base_decl(read_vardecl) &&
        !decl_db.is_mapping_value(read_vardecl) &&
        !decl_db.is_ghost_member(read_vardecl) &&
        !expr_db.is_ghost_member(read_vardecl),
        `FunctionDeclarationGenerator: read_vardecl ${read_vardecl} should not be base_decl, mapping_value, or ghost_member
        is_base_decl: ${decl_db.is_base_decl(read_vardecl)}
        is_mapping_value: ${decl_db.is_mapping_value(read_vardecl)}
        decl_db.is_ghost_member: ${decl_db.is_ghost_member(read_vardecl)}
        expr_db.is_ghost_member: ${expr_db.is_ghost_member(read_vardecl)}`);
      if (decl_db.is_state_variable(read_vardecl)) {
        read_storage_variables = true;
      }
      if (storage_location_dag.has_solution_range(read_vardecl) &&
        storage_location_dag.solution_range_of(read_vardecl)!.some(
          (s) => s == loc.StorageLocationProvider.storage_pointer() ||
            s == loc.StorageLocationProvider.storage_ref())) {
        read_possibly_storage_variables.push(read_vardecl);
      }
    }
    for (const write_vardecl of this.write_vardecls) {
      assert(!decl_db.is_base_decl(write_vardecl) &&
        !decl_db.is_mapping_value(write_vardecl) &&
        !decl_db.is_ghost_member(write_vardecl) &&
        !expr_db.is_ghost_member(write_vardecl),
        `FunctionDeclarationGenerator: write_vardecl ${write_vardecl} should not be base_decl, mapping_value, or ghost_member
        is_base_decl: ${decl_db.is_base_decl(write_vardecl)}
        is_mapping_value: ${decl_db.is_mapping_value(write_vardecl)}
        decl_db.is_ghost_member: ${decl_db.is_ghost_member(write_vardecl)}
        expr_db.is_ghost_member: ${expr_db.is_ghost_member(write_vardecl)}`);
      if (decl_db.is_state_variable(write_vardecl)) {
        modify_storage_variables = true;
      }
      if (decl_db.contains_mapping_decl(write_vardecl)) {
        modify_storage_variables = true;
      }
      if (storage_location_dag.has_solution_range(write_vardecl) &&
        storage_location_dag.solution_range_of(write_vardecl)!.some(
          (s) => s == loc.StorageLocationProvider.storage_pointer() ||
            s == loc.StorageLocationProvider.storage_ref())) {
        modify_possibly_storage_variables.push(write_vardecl);
      }
    }
    if (sig.noview_nopure_funcdecl) {
      read_storage_variables = true;
      modify_storage_variables = true;
      sig.noview_nopure_funcdecl = false;
    }
    if (sig.nopure_funcdecl) {
      sig.nopure_funcdecl = false;
      read_storage_variables = true;
    }
    const vismut_range = this.get_vismut_range(read_storage_variables, modify_storage_variables);
    vismut_dag.update(this.fid, vismut_range);
    const debug_vismug_range = vismut_dag.solution_range_of(this.fid)!;
    // If the function has mapping parameters or return values, then its visibility is internal or private.
    if (this.mapping_parameters_ids.length > 0 || this.mapping_return_decls_ids.length > 0) {
      vismut_dag.update(this.fid, closed_func_vismut);
    }
    // If any of parameters or return decls are possibly storage variables,
    // then the function visibility is internal or private or the variable cannot be in storage.
    else if (this.storage_parameters.length > 0 || this.storage_return_decls.length > 0) {
      const vismut_solution = vismut_dag.solution_range_of(this.fid)!;
      // If there is no external function call in the function body
      if (sig.forbid_external_call) {
        // If sig.forbid_external_call is set to true, then storage parameters or return decls cannot be in memory or calldata.
        // Therefore, set this function's visibility to internal or private
        assert(vismut_solution.some((v) => closed_func_vismut.includes(v)),
          `FunctionDeclarationGenerator: vismut_dag.solution_range[${this.fid}] should contain ${closed_func_vismut.map(f => f.str())}, but is ${vismut_solution.map(f => f.str())}`);
        vismut_dag.update(this.fid, closed_func_vismut);
      }
      else if (this.removing_storage_from_parameters_or_returns_leads_to_broken_storage_location_constraint()) {
        // If removing the storage possibility from a storage parameter or return decl leads
        // to a broken storage location constraint, then the function visibility is internal or private.
        assert(vismut_solution.some((v) => closed_func_vismut.includes(v)),
          `FunctionDeclarationGenerator: vismut_dag.solution_range[${this.fid}] should contain ${closed_func_vismut.map(f => f.str())}, but is ${vismut_solution.map(f => f.str())}`);
        vismut_dag.update(this.fid, closed_func_vismut);
      }
      else if (vismut_solution.some((v) => closed_func_vismut.includes(v)) && Math.random() < 0.5) {
        // If this function can be internal or private, then with 50% probability,
        // we force the function to be internal or private.
        assert(vismut_solution.some((v) => closed_func_vismut.includes(v)),
          `FunctionDeclarationGenerator: vismut_dag.solution_range[${this.fid}] should contain ${closed_func_vismut.map(f => f.str())}, but is ${vismut_solution.map(f => f.str())}`);
        vismut_dag.update(this.fid, closed_func_vismut);
      }
      else {
        // Otherwise, we force the storage parameters and return decls to be in memory or calldata.
        // If any of the storage parameters or return decls cannot be in memory or calldata,
        // sig.forbid_external_call is set to true, which is handled in the previous if block.
        this.storage_parameters.forEach((p) => {
          assert(storage_location_dag.has_solution_range(p.id),
            `storage_location_dag.solution_range should have ${p.id}`);
          storage_location_dag.update(p.id, [
            loc.StorageLocationProvider.memory(),
            loc.StorageLocationProvider.calldata()
          ]);
        });
        this.storage_return_decls.forEach((r) => {
          assert(storage_location_dag.has_solution_range(r.id),
            `storage_location_dag.solution_range should have ${r.id}`);
          storage_location_dag.update(r.id, [
            loc.StorageLocationProvider.memory(),
            loc.StorageLocationProvider.calldata()
          ]);
        });
      }
    }

    /*
    In the function body, if a variable is possibly in storage and it is read or modified,
    then the function state mutability is not view or pure based on the read/modify situation.
    */
    if (modify_possibly_storage_variables.length > 0) {
      if (vismut_dag.solution_range_of(this.fid)!.some(
        v => pure_func_vismut.includes(v) || view_func_vismut.includes(v))) {
        if (Math.random() < 0.5 || modify_possibly_storage_variables.some(
          x => !storage_location_dag.solution_range_of(x)!.includes(loc.StorageLocationProvider.memory())
            && !storage_location_dag.solution_range_of(x)!.includes(loc.StorageLocationProvider.calldata()))) {
          vismut_dag.update(this.fid, nonpure_nonview_func_vismut);
        }
        else {
          modify_possibly_storage_variables.forEach((vardecl) => {
            storage_location_dag.update(vardecl, [
              loc.StorageLocationProvider.memory(),
              loc.StorageLocationProvider.calldata()
            ]);
          });
        }
      }
    }
    if (read_possibly_storage_variables.length > 0) {
      if (vismut_dag.solution_range_of(this.fid)!.some(
        v => pure_func_vismut.includes(v))) {
        if (Math.random() < 0.5 || read_possibly_storage_variables.some(
          x => !storage_location_dag.solution_range_of(x)!.includes(loc.StorageLocationProvider.memory())
            && !storage_location_dag.solution_range_of(x)!.includes(loc.StorageLocationProvider.calldata()))) {
          vismut_dag.update(this.fid, nonpure_func_vismut);
        }
        else {
          read_possibly_storage_variables.forEach((vardecl) => {
            storage_location_dag.update(vardecl, [
              loc.StorageLocationProvider.memory(),
              loc.StorageLocationProvider.calldata()
            ]);
          });
        }
      }
    }

    assert(vismut_dag.solution_range_of(this.fid)!.length > 0,
      `FunctionDeclarationGenerator: vismut_dag.solution_range[${this.fid}] should not be empty
       read_storage_variables is ${read_storage_variables}, modify_storage_variables is ${modify_storage_variables}
       sig.noview_nopure_funcdecl is ${sig.noview_nopure_funcdecl},
       sig.external_call is ${sig.external_call}, sig.forbid_external_call is ${sig.forbid_external_call}
       debug_vismug_range is ${debug_vismug_range.map(f => f.str())}`);
  }

  generate_function_body() : void {
    sig.noview_nopure_funcdecl = false;
    sig.nopure_funcdecl = false;
    if (!this.has_body) cur_scope = this.function_scope.snapshot();
    //! Generate function body. Body includes exprstmts and the return stmt.
    sig.external_call = false;
    sig.forbid_external_call = this.forbid_external_call;
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
    sig.external_call = false;
    sig.forbid_external_call = false;
  }

  private forbid_external_call_if_required() : void {
    this.mapping_parameters_ids = this.parameters.filter((p) => decl_db.contains_mapping_decl(p.id)).map((p) => p.id);
    this.mapping_return_decls_ids = this.return_decls.filter((r) => decl_db.contains_mapping_decl(r.id)).map((r) => r.id);
    this.storage_parameters = this.parameters.filter((p) =>
      storage_location_dag.has_solution_range(p.id) &&
      storage_location_dag.solution_range_of(p.id)!.includes(loc.StorageLocationProvider.storage_pointer())
    );
    this.storage_return_decls = this.return_decls.filter((r) =>
      storage_location_dag.has_solution_range(r.id) &&
      storage_location_dag.solution_range_of(r.id)!.includes(loc.StorageLocationProvider.storage_pointer())
    );
    if (this.mapping_parameters_ids.length > 0 || this.mapping_return_decls_ids.length > 0) {
      // If the function has mapping parameters or return values, then they must be declared in storage location.
      // Therefore, the function cannot be public or external.
      // Thus external calls (function calls to functions in other contracts) are not allowed in the function body.
      this.forbid_external_call = true;
    }
    // If there exist storage parameters or return values whose storage location does not include memory or calldata,
    // then the function cannot be public or external. Therefore, the function cannot have function calls to functions in other contracts.
    // That's why we set sig.forbid_external_call to true.
    this.storage_parameters.forEach((p) => {
      assert(storage_location_dag.has_solution_range(p.id),
        `storage_location_dag.solution_range should have ${p.id}`);
      if (!storage_location_dag.solution_range_of(p.id)!.includes(loc.StorageLocationProvider.memory()) &&
        !storage_location_dag.solution_range_of(p.id)!.includes(loc.StorageLocationProvider.calldata())) {
        this.forbid_external_call = true;
      }
    });
    this.storage_return_decls.forEach((r) => {
      assert(storage_location_dag.has_solution_range(r.id),
        `storage_location_dag.solution_range should have ${r.id}`);
      if (!storage_location_dag.solution_range_of(r.id)!.includes(loc.StorageLocationProvider.memory()) &&
        !storage_location_dag.solution_range_of(r.id)!.includes(loc.StorageLocationProvider.calldata())) {
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
      const variable_gen = new VariableDeclarationGenerator(0, type_db.types(), true);
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
      const variable_gen = new VariableDeclarationGenerator(0, type_db.types(), true);
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
    let name = name_db.generate_name(IDENTIFIER.FUNC);
    const virtual = false;
    const overide = false;
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
    decl_db.add_getter_function(fid, variable_decl.id);
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
    decl_db.add_getter_function(fid, variable_decl.id);
    vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
    new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
      false, false, [], [variable_decl], [], [], FunctionVisibility.External, FunctionStateMutability.View);
    this.end_flag_of_getter_function(fid, variable_decl.name);
  }

  private generate_getter_function_returns_for_struct_type_state_variable(struct_instance_id : number) {
    assert(decl_db.is_struct_instance_decl(struct_instance_id),
      `ContractDeclarationGenerator: struct_instance_id ${struct_instance_id} should be a state struct instance`);
    let return_var_should_be_removed = (member : number) : boolean => {
      if (decl_db.is_array_decl(member) || decl_db.is_mapping_decl(member)) {
        return true;
      }
      if (decl_db.is_struct_instance_decl(member)) {
        return !decl_db.members_of_struct_instance(member).some(t => !return_var_should_be_removed(t));
      }
      return false;
    };
    const returns = decl_db.members_of_struct_instance(struct_instance_id).filter(
      member => !return_var_should_be_removed(member)
    );
    return returns.map((member) => irnodes.get(member) as decl.IRVariableDeclaration);
  }

  private generate_getter_function_for_struct_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    assert(decl_db.is_struct_instance_decl(variable_decl.id),
      `ContractDeclarationGenerator: variable_decl ${variable_decl.id} should be a state struct instance`);
    const returns = this.generate_getter_function_returns_for_struct_type_state_variable(variable_decl.id);
    if (returns.length > 0) {
      const fid = new_global_id();
      this.start_flag_of_getter_function(fid, variable_decl.name);
      decl_db.add_funcdecl(fid);
      decl_db.insert(fid, cur_scope.id());
      decl_db.add_getter_function(fid, variable_decl.id);
      vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, [], returns, [], [], FunctionVisibility.External, FunctionStateMutability.View);
      this.end_flag_of_getter_function(fid, variable_decl.name);
    }
    else {
      vismut_dag.update(variable_decl.id, [
        VisMutProvider.var_internal(),
        VisMutProvider.var_private(),
      ])
    }
  }

  private generate_getter_function_parameters_and_returns_for_mapping_type_state_variable(mapping_decl_id : number) : [decl.IRVariableDeclaration[], decl.IRVariableDeclaration[]] {
    assert(decl_db.is_mapping_decl(mapping_decl_id),
      `ContractDeclarationGenerator: mapping_decl_id ${mapping_decl_id} should be a mapping decl`);
    const key_decl_id = decl_db.key_of_mapping(mapping_decl_id);
    const value_decl_id = decl_db.value_of_mapping(mapping_decl_id);
    const parameters : decl.IRVariableDeclaration[] = [irnodes.get(key_decl_id) as decl.IRVariableDeclaration];
    let returns;
    if (decl_db.is_mapping_decl(value_decl_id)) {
      const [this_parameters, this_returns] = this.generate_getter_function_parameters_and_returns_for_mapping_type_state_variable(value_decl_id);
      parameters.push(...this_parameters);
      returns = this_returns;
    }
    else if (decl_db.is_array_decl(value_decl_id)) {
      const [this_parameters, this_returns] = this.generate_getter_function_parameters_and_returns_for_array_type_state_variable(value_decl_id);
      parameters.push(...this_parameters);
      returns = this_returns;
    }
    else if (decl_db.is_struct_instance_decl(value_decl_id)) {
      returns = this.generate_getter_function_returns_for_struct_type_state_variable(value_decl_id);
    }
    else {
      returns = [irnodes.get(value_decl_id) as decl.IRVariableDeclaration];
    }
    if (returns.length === 0) {
      return [[], []];
    }
    return [parameters, returns];
  }

  private generate_getter_function_for_mapping_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    assert(decl_db.is_mapping_decl(variable_decl.id),
      `ContractDeclarationGenerator: variable_decl ${variable_decl.id} should be a mapping decl`);
    const [parameters, returns] = this.generate_getter_function_parameters_and_returns_for_mapping_type_state_variable(variable_decl.id);
    if (returns.length > 0) {
      const fid = new_global_id();
      this.start_flag_of_getter_function(fid, variable_decl.name);
      decl_db.add_funcdecl(fid);
      decl_db.add_getter_function(fid, variable_decl.id);
      decl_db.insert(fid, cur_scope.id());
      vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, parameters, returns, [], [], FunctionVisibility.External, FunctionStateMutability.View);
      this.end_flag_of_getter_function(fid, variable_decl.name);
    }
    else {
      vismut_dag.update(variable_decl.id, [
        VisMutProvider.var_internal(),
        VisMutProvider.var_private(),
      ])
    }
  }

  private generate_getter_function_parameters_and_returns_for_array_type_state_variable(array_id : number) : [decl.IRVariableDeclaration[], decl.IRVariableDeclaration[]] {
    assert(decl_db.is_array_decl(array_id),
      `ContractDeclarationGenerator: array_id ${array_id} should be an array decl`);
    const base_decl_id = decl_db.base_of_array(array_id);
    let parameters : decl.IRVariableDeclaration[] = [];
    let returns;
    if (decl_db.is_mapping_decl(base_decl_id)) {
      const [this_parameters, this_returns] = this.generate_getter_function_parameters_and_returns_for_mapping_type_state_variable(base_decl_id);
      parameters = this_parameters;
      returns = this_returns;
    }
    else if (decl_db.is_array_decl(base_decl_id)) {
      const [this_parameters, this_returns] = this.generate_getter_function_parameters_and_returns_for_array_type_state_variable(base_decl_id);
      parameters = this_parameters;
      returns = this_returns;
    }
    else if (decl_db.is_struct_instance_decl(base_decl_id)) {
      returns = this.generate_getter_function_returns_for_struct_type_state_variable(base_decl_id);
    }
    else {
      returns = [irnodes.get(base_decl_id) as decl.IRVariableDeclaration];
    }
    cur_scope = cur_scope.new(scopeKind.FUNC_PARAMETER);
    const element_type_var_gen = new ElementaryTypeVariableDeclarationGenerator(type.uinteger_types, true)
    element_type_var_gen.generate();
    cur_scope = cur_scope.rollback();
    parameters = [element_type_var_gen.irnode as decl.IRVariableDeclaration].concat(parameters);
    if (returns.length === 0) {
      return [[], []];
    }
    return [parameters, returns];
  }

  private generate_getter_function_for_array_type_state_variable(variable_decl : decl.IRVariableDeclaration) {
    assert(decl_db.is_array_decl(variable_decl.id),
      `ContractDeclarationGenerator: variable_decl ${variable_decl.id} should be an array decl`);
    const [parameters, returns] = this.generate_getter_function_parameters_and_returns_for_array_type_state_variable(variable_decl.id);
    if (returns.length > 0) {
      const fid = new_global_id();
      this.start_flag_of_getter_function(fid, variable_decl.name);
      decl_db.add_funcdecl(fid);
      decl_db.insert(fid, cur_scope.id());
      decl_db.add_getter_function(fid, variable_decl.id);
      vismut_dag.insert(fid, [VisMutProvider.func_external_view()]);
      new decl.IRFunctionDefinition(fid, cur_scope.id(), variable_decl.name, FunctionKind.Function,
        false, false, parameters, returns, [], [], FunctionVisibility.External, FunctionStateMutability.View);
      this.end_flag_of_getter_function(fid, variable_decl.name);
    }
    else {
      vismut_dag.update(variable_decl.id, [
        VisMutProvider.var_internal(),
        VisMutProvider.var_private(),
      ])
    }
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
    else if (isarraydecl) {
      this.generate_getter_function_for_array_type_state_variable(variable_decl);
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
      const variable_gen = new VariableDeclarationGenerator(0, type_db.types(), false);
      variable_gen.generate();
      const variable_decl = variable_gen.irnode as decl.IRVariableDeclaration;
      variable_decl.state = true;
      variable_decl.loc = DataLocation.Default;
      local_state_variables.push(variable_decl);
      stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()).forEach((stmt) => {
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
      });
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
    type_db.add_type(contract_type);
    type_db.add_contract_type(id, contract_type);
    type_db.add_user_defined_type(contract_type)
  }

  generate() : void {
    const thisid = new_global_id();
    this.start_flag_of_contract_decl(thisid);
    assert(cur_scope.kind() === scopeKind.GLOBAL,
      `Contracts' scope must be global, but is ${cur_scope.kind()}`);
    decl_db.insert(thisid, cur_scope.id());
    cur_scope = cur_scope.new(scopeKind.CONTRACT);
    decl_db.pair_contractdecl_to_scope(cur_scope.id(), thisid);
    const contract_name = name_db.generate_name(IDENTIFIER.CONTRACT);
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
    this.end_flag_of_contract_decl(thisid);
  }
}

//TODO: Generate library, interface, and abstract contract.

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  storage_range : loc.StorageLocation[];
  id : number;
  constructor(id : number) {
    super();
    this.id = id;
    assert(type_dag.has_solution_range(id), `ExpressionGenerator: type_dag.solution_range does not have id ${id}`);
    this.type_range = type_dag.solution_range_of(id)!;
    this.storage_range = storage_location_dag.has_solution_range(id) ? storage_location_dag.solution_range_of(id)! : [];
  }

  protected wrap_in_a_tuple(must_wrap : boolean = false) {
    if (must_wrap || Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(new_global_id(), cur_scope.id(), [this.irnode as expr.IRExpression]);
      if (config.debug) {
        console.log(`${" ".repeat(indent)}${this.irnode.id}: Tuple: ${this.irnode.id} scope: ${cur_scope.kind()}`);
      }
    }
  }

  abstract generate(cur_expression_complexity_level : number) : void;
}

abstract class CallExpressionGenerator extends ExpressionGenerator {
  constructor(id : number) {
    super(id);
  }

  protected generate_argument_from_parameters(cur_expression_complexity_level : number,
    parameters : decl.IRVariableDeclaration[]) {
    const args_ids : number[] = [];
    parameters.forEach((parameter) => {
      const argid = new_global_id();
      args_ids.push(argid);
      //! Clear dropped-out types, such as local struct types.
      const type_range = type_dag.solution_range_of(parameter.id)!.filter(
        t => type_db.types().some(g => g.same(t)) || t.typeName === "MappingType" || t.typeName === "ArrayType"
      );
      type_dag.insert(argid, type_range);
      const storage_loc_range = storage_location_dag.has_solution_range(parameter.id) ?
        storage_location_dag.solution_range_of(parameter.id)!.flatMap((s) => s.subs())
        : [];
      let arg_gen_prototype = get_exprgenerator(type_range, cur_expression_complexity_level + 1);
      const arg_gen = new arg_gen_prototype(argid);
      const ghost_id = connect_arguments_to_parameters(argid, parameter.id, arg_gen.generator_name,
        type_range, storage_loc_range as loc.StorageLocation[]);
      arg_gen.generate(cur_expression_complexity_level + 1);
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
  cur_expression_complexity_level : number = 0;
  //! Since the selected variable may be a struct member, we need to store the instance id of the struct.
  //! In this situation, the identifier is actually a member access from the struct instance.
  //! The instantiation can be a struct instance or a temporary struct expression.
  private struct_instantiation_id : number | undefined;
  constructor(id : number, left : boolean = false) {
    super(id);
    this.left = left;
  }

  private start_flag() {
    if (config.debug) {
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier ${this.id}: type: ${type_range_str}, loc: ${this.storage_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Identifier ${this.variable_decl === undefined ? '' : `--> ${this.variable_decl.id}`}, scope: ${cur_scope.kind()}, type: ${type_range_str}, loc: ${storage_location_dag.has_solution_range(this.id) ? storage_location_dag.solution_range_of(this.id)!.map(t => t.str()) : ''}`));
    }
  }

  private generate_var_decl() : void {
    let roll_back = false;
    let snapshot_scope = cur_scope.snapshot();
    while (unexpected_extra_stmt_belong_to_the_parent_scope(cur_scope)) {
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
    if (decl_db.is_mapping_decl(this.variable_decl.id)) {
      const scope_id = decl_db.scope_of_irnode(this.variable_decl.id);
      stmt_db.add_unexpected_extra_stmt(scope_id, variable_decl_stmt);
      stmt_db.initialize_the_vardecls_that_must_be_initialized(scope_id);
    }
    else {
      stmt_db.add_unexpected_extra_stmt(cur_scope.id(), variable_decl_stmt);
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
    }
    if (roll_back) {
      cur_scope = snapshot_scope.snapshot();
    }
  }

  private get_available_vardecls() {
    this.available_vardecl = get_vardecls(this.type_range, loc.range_of_locs(this.storage_range, 'equal'));
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
    new_contract_gen.generate(this.cur_expression_complexity_level + 1);
    const contract_instance_expr = new_contract_gen.irnode as expr.IRExpression;
    const extracted_contract_instance_expr = expr.tuple_extraction(contract_instance_expr);
    expr_db.transfer_read_variables(this.id, extracted_contract_instance_expr.id);
    expr_db.transfer_write_variables(this.id, extracted_contract_instance_expr.id);
    return contract_instance_expr;
  }

  private this_identifier_can_be_a_temporary_contract_instance() : boolean {
    return !this.left && Math.random() < config.new_prob;
  }

  private decide_between_contract_type_and_struct_type() {
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
      !decl_db.contains_mapping_decl(struct_decl_id);
  }

  private this_identifier_can_be_a_temporary_struct_instance(struct_decl_id : number) : boolean {
    return !this.left && Math.random() < config.new_prob &&
      !decl_db.contains_mapping_decl(struct_decl_id) &&
      (!storage_location_dag.has_solution_range(this.id) ||
        storage_location_dag.solution_range_of(this.id)!.includes(loc.StorageLocationProvider.memory()));
  }

  private generate_a_temporary_struct_instantiation_expr(id : number) : expr.IRExpression {
    const new_struct_gen = new NewStructGenerator(id);
    new_struct_gen.generate(this.cur_expression_complexity_level + 1);
    const struct_instance_expr = new_struct_gen.irnode as expr.IRExpression;
    const extracted_struct_instance_expr = expr.tuple_extraction(struct_instance_expr);
    expr_db.transfer_read_variables(id, extracted_struct_instance_expr.id);
    expr_db.transfer_write_variables(id, extracted_struct_instance_expr.id);
    storage_location_dag.insert(id, [loc.StorageLocationProvider.memory()]);
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
      const is_contract_type = this.decide_between_contract_type_and_struct_type();
      if (is_contract_type) {
        if (this.this_identifier_can_be_a_temporary_contract_instance()) {
          this.irnode = this.generate_a_temporary_contract_instance_expr();
        }
        else {
          this.generate_var_decl();
        }
      }
      else {
        const filtered_type_range = this.type_range.filter(
          t => type_db.types().some(g => g.same(t)));
        assert(filtered_type_range.length === 1 || filtered_type_range.length === 2,
          `IdentifierGenerator: filtered_type_range.length should be 1 or 2, but is ${filtered_type_range.length}:
           filtered_type_range is ${filtered_type_range.map(t => t.str())}`);
        const struct_type = pick_random_element(filtered_type_range)! as type.StructType;
        const struct_decl = decl_db.find_structdecl_by_name(struct_type.name)!;
        assert(struct_decl !== undefined,
          `IdentifierGenerator: struct_decl with ${struct_type.name} is undefined`);
        if (this.this_identifier_can_be_a_temporary_struct_instance(struct_decl.id)) {
          this.irnode = this.generate_a_temporary_struct_instantiation_expr(this.id);
        }
        else {
          this.generate_var_decl();
        }
      }
    }
  }

  /*
  Returns: the access expresstion to the vardecl and the ID of outermost variable declaration.
  */
  private generate_expr_when_selected_vardecl_is_a_mapping_value(id : number) : [expr.IRExpression, number | undefined] {
    let index_access;
    let cur_id = id;
    let this_outermost_vardecl_id;
    let outermost_index_access : expr.IRExpression;
    /*
    Suppose the selected vardecl is a mapping value, then we need to generate an expr,
    for instance, mapping[0][1], to be the identifier of the variable declaration.
    */
    while (decl_db.is_mapping_value(cur_id)) {
      const mapping_decl_id = decl_db.mapping_of_value(cur_id)!;
      this_outermost_vardecl_id = mapping_decl_id;
      //* Generate an expr to be the key of the mapping.
      const key_id = decl_db.key_of_mapping(mapping_decl_id)!;
      const type_range = type_dag.solution_range_of(key_id)!
      const expr_gen_prototype = get_exprgenerator(type_range, this.cur_expression_complexity_level + 1);
      const expr_id = new_global_id();
      type_dag.insert(expr_id, type_range);
      let ghost_id;
      const expr_gen = new expr_gen_prototype(expr_id);
      if (expr_gen.generator_name === "LiteralGenerator") {
        ghost_id = new_global_id();
        new IRGhost(ghost_id, cur_scope.id());
        type_dag.insert(ghost_id, type_range);
        type_dag.connect(ghost_id, key_id, "super_dominance");
        type_dag.connect(ghost_id, expr_id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}IdentifierGenerator::generate_expr_when_selected_vardecl_is_a_mapping_value: ghost_id: ${ghost_id}, expr_id: ${expr_id}, key_id: ${key_id}`);
        }
      }
      else {
        type_dag.connect(expr_id, key_id, "super_dominance");
      }
      expr_gen.generate(this.cur_expression_complexity_level + 1);
      expr_db.transfer_read_variables(this.id, expr_id);
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
            index_access_cp = ((index_access as expr.IRIndexedAccess).base as expr.IRIndexedAccess);
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
    assert(this_outermost_vardecl_id !== undefined,
      `IdentifierGenerator: this_outermost_vardecl_id is undefined when the variable_decl is of mapping type`);
    assert(!decl_db.is_mapping_value(this_outermost_vardecl_id),
      `IdentifierGenerator: this_outermost_vardecl_id ${this_outermost_vardecl_id} is not a mapping value`);
    if (decl_db.is_member_of_struct_decl(this_outermost_vardecl_id)) {
      const [struct_instance_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_struct_member(irnodes.get(this_outermost_vardecl_id) as decl.IRVariableDeclaration);
      change_node_id(index_access!, this.id);
      (outermost_index_access! as expr.IRIndexedAccess).base = struct_instance_access_expr;
      return [index_access!, outermost_vardecl_id];
    }
    else if (decl_db.is_base_decl(this_outermost_vardecl_id)) {
      const [array_element_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_an_array_element(this_outermost_vardecl_id);
      change_node_id(index_access!, this.id);
      (outermost_index_access! as expr.IRIndexedAccess).base = array_element_access_expr;
      return [index_access!, outermost_vardecl_id];
    }
    else {
      change_node_id(index_access!, this.id);
      return [index_access!, this_outermost_vardecl_id];
    }
  }

  /*
  Returns: the access expresstion to the vardecl and the ID of outermost variable declaration.
  */
  private generate_expr_when_selected_vardecl_is_an_array_element(id : number) : [expr.IRExpression, number | undefined] {
    let cur_id = id;
    let index_access : expr.IRExpression | undefined;
    let this_outermost_vardecl_id;
    let outermost_index_access : expr.IRExpression;
    assert(decl_db.is_base_decl(cur_id),
      `IdentifierGenerator: cur_id ${cur_id} is not a base_decl`);
    /*
    Suppose the selected vardecl is an array element, then we need to generate an expr
    for instance, arr[0][1], to be the identifier of the variable declaration.
    */
    while (decl_db.is_base_decl(cur_id)) {
      const array_decl_id = decl_db.array_of_base(cur_id)!;
      this_outermost_vardecl_id = array_decl_id;
      const array_type_range = type_dag.solution_range_of(array_decl_id)!;
      const lengths = [...new Set<number | undefined>(array_type_range.map(t => (t as type.ArrayType).length))];
      assert(lengths.length === 1, `IdentifierGenerator: more than one length ${lengths} for array_decl_id ${array_decl_id}`);
      const length = lengths[0];
      const expr_type_range = type.uinteger_types.filter(t => type_db.types().some(g => g.same(t)));
      const expr_gen_prototype = get_exprgenerator(
        expr_type_range,
        this.cur_expression_complexity_level + 1
      );
      const expr_id = new_global_id();
      type_dag.insert(expr_id, expr_type_range);
      const expr_gen = new expr_gen_prototype(expr_id);
      expr_gen.generate(this.cur_expression_complexity_level + 1);
      expr_db.transfer_read_variables(this.id, expr_id);
      if (expr_gen.generator_name === "LiteralGenerator") {
        const literal_expr = expr.tuple_extraction(expr_gen.irnode) as expr.IRLiteral;
        if (length !== undefined) {
          literal_expr.value = `${random_int(0, length - 1)}`;
          literal_expr.fixed_value = true;
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
            index_access_cp = ((index_access as expr.IRIndexedAccess).base as expr.IRIndexedAccess);
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
    assert(this_outermost_vardecl_id !== undefined,
      `IdentifierGenerator: this_outermost_vardecl_id is undefined when the variable_decl is of array type`);
    assert(!decl_db.is_base_decl(this_outermost_vardecl_id),
      `IdentifierGenerator: this_outermost_vardecl_id ${this_outermost_vardecl_id} is a base_decl`);
    if (decl_db.is_member_of_struct_decl(this_outermost_vardecl_id)) {
      const [struct_instance_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_struct_member(irnodes.get(this_outermost_vardecl_id) as decl.IRVariableDeclaration);
      change_node_id(index_access!, this.id);
      (outermost_index_access! as expr.IRIndexedAccess).base = struct_instance_access_expr;
      return [index_access!, outermost_vardecl_id];
    }
    else if (decl_db.is_mapping_value(this_outermost_vardecl_id)) {
      const [mapping_value_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_mapping_value(this_outermost_vardecl_id);
      change_node_id(index_access!, this.id);
      (outermost_index_access! as expr.IRIndexedAccess).base = mapping_value_access_expr;
      return [index_access!, outermost_vardecl_id];
    }
    else {
      change_node_id(index_access!, this.id);
      return [index_access!, this_outermost_vardecl_id];
    }
  }

  private generate_struct_instance_declaration_stmt(struct_decl_id : number) {
    //! Generate a struct instance (not a temporary struct instantiation) and then generate an IRMemberAccess.
    let rollback = false;
    let snapshot_scope = cur_scope.snapshot();
    while (unexpected_extra_stmt_belong_to_the_parent_scope(cur_scope)) {
      rollback = true;
      cur_scope = cur_scope.rollback();
    }
    const type_range = type_db.get_struct_type(struct_decl_id);
    const struct_instance_gen = new StructInstanceDeclarationGenerator(type_range, false, struct_decl_id);
    struct_instance_gen.generate();
    const vardeclstmt = new stmt.IRVariableDeclarationStatement(new_global_id(), cur_scope.id(),
      [struct_instance_gen.irnode! as decl.IRVariableDeclaration],
      (struct_instance_gen.irnode as decl.IRVariableDeclaration).value);
    if ((struct_instance_gen.irnode as decl.IRVariableDeclaration).value !== undefined) {
      (vardeclstmt as stmt.IRStatement).exprs = [(struct_instance_gen.irnode as decl.IRVariableDeclaration).value!];
    }
    (struct_instance_gen.irnode as decl.IRVariableDeclaration).value = undefined;
    stmt_db.add_unexpected_extra_stmt(cur_scope.id(), vardeclstmt);
    stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
    if (rollback) {
      cur_scope = snapshot_scope.snapshot();
    }
    return struct_instance_gen.irnode!;
  }

  //! decl struct
  //! struct.member
  private generate_a_member_access_using_a_struct_declaration(struct_decl_id : number, member : decl.IRVariableDeclaration) : [expr.IRExpression, number | undefined] {
    const struct_instance_decl = this.generate_struct_instance_declaration_stmt(struct_decl_id);
    this.struct_instantiation_id = struct_instance_decl.id;
    assert(storage_location_dag.has_solution_range(struct_instance_decl.id),
      `IdentifierGenerator: storage_location_dag.solution_range does not have ${struct_instance_decl.id}`);
    return [new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
      struct_decl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(),
        (struct_instance_decl as decl.IRVariableDeclaration).name, struct_instance_decl.id)), struct_instance_decl.id];
  }

  //! struct(arg1, arg2, ...).member
  private generate_a_member_access_using_a_temporary_struct_instantiation(struct_decl_id : number, member : decl.IRVariableDeclaration) {
    const nsid = new_global_id();
    type_dag.insert(nsid, type_db.get_struct_type(struct_decl_id));
    const struct_instance_gen = new NewStructGenerator(nsid);
    struct_instance_gen.generate(this.cur_expression_complexity_level + 1);
    const struct_instance_expr = struct_instance_gen.irnode as expr.IRExpression;
    this.struct_instantiation_id = nsid;
    expr_db.transfer_read_variables(this.id, nsid);
    expr_db.transfer_write_variables(this.id, nsid);
    return new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
      struct_decl_id, struct_instance_expr);
  }

  /*
  Returns: the access expresstion to the vardecl and the ID of outermost variable declaration.
  */
  private generate_expr_when_selected_vardecl_is_a_struct_member(member : decl.IRVariableDeclaration) : [expr.IRExpression, number | undefined] {
    const struct_decl_id = decl_db.struct_decl_of_member(member.id)!;
    const available_possible_struct_instances = this.available_vardecl.filter(v =>
      type_dag.solution_range_of(v.id)!.some(
        t => t.typeName === "StructType" &&
          (t as type.StructType).referece_id === struct_decl_id));

    if (available_possible_struct_instances.length === 0) {
      if (this.should_generate_a_temporary_struct_instance(struct_decl_id)) {
        return [this.generate_a_member_access_using_a_temporary_struct_instantiation(struct_decl_id, member), undefined];
      }
      else {
        return this.generate_a_member_access_using_a_struct_declaration(struct_decl_id, member);
      }
    }
    else {
      const struct_instance = pick_random_element(available_possible_struct_instances)!;
      this.struct_instantiation_id = struct_instance.id;
      if (this.left) {
        storage_location_dag.update(struct_instance.id, [
          loc.StorageLocationProvider.storage_pointer(),
          loc.StorageLocationProvider.memory(),
          loc.StorageLocationProvider.storage_ref()
        ])
      }
      //* Generate an IRMemberAccess
      const member_access = new expr.IRMemberAccess(this.id, cur_scope.id(), member.name,
        struct_decl_id, new expr.IRIdentifier(new_global_id(), cur_scope.id(),
          (struct_instance as decl.IRVariableDeclaration).name, struct_instance.id));
      if (decl_db.is_member_of_struct_decl(struct_instance.id)) {
        const [struct_instance_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_struct_member(irnodes.get(struct_instance.id) as decl.IRVariableDeclaration);
        change_node_id(member_access, this.id);
        member_access.expression = struct_instance_access_expr;
        return [member_access, outermost_vardecl_id];
      }
      if (decl_db.is_base_decl(struct_instance.id)) {
        const [array_element_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_an_array_element(struct_instance.id);
        change_node_id(member_access, this.id);
        member_access.expression = array_element_access_expr;
        return [member_access, outermost_vardecl_id];
      }
      if (decl_db.is_mapping_value(struct_instance.id)) {
        const [mapping_value_access_expr, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_mapping_value(struct_instance.id);
        change_node_id(member_access, this.id);
        member_access.expression = mapping_value_access_expr;
        return [member_access, outermost_vardecl_id];
      }
      return [member_access, struct_instance.id];
    }
  }

  private update_storage_loc_range() {
    assert(this.variable_decl !== undefined, "IdentifierGenerator: this.variable_decl is undefined");
    let variable_in_struct_decl =
      inside_struct_decl_scope(get_scope_from_scope_id(decl_db.scope_of_irnode(this.variable_decl!.id)));
    if (variable_in_struct_decl && decl_db.qualifed_by_storage_qualifier(this.variable_decl!.id)) {
      assert(this.struct_instantiation_id !== undefined, `IdentifierGenerator: this.struct_instantiation_id is undefined`);
      assert(!storage_location_dag.has_solution_range(this.variable_decl!.id),
        `IdentifierGenerator: storage_location_dag.solution_range has ${this.variable_decl!.id}`);
      const ghost_member_id = ghost_member_of_member_inside_struct_instantiation(
        this.variable_decl!.id, this.struct_instantiation_id);
      if (storage_location_dag.has_solution_range(this.id)) {
        storage_location_dag.update(this.id,
          loc.range_of_locs(storage_location_dag.solution_range.get(ghost_member_id)!, 'equal'));
      }
      else {
        storage_location_dag.insert(this.id,
          loc.range_of_locs(storage_location_dag.solution_range.get(ghost_member_id)!, 'equal')
        );
      }
      storage_location_dag.connect(this.id, ghost_member_id);
    }
    else if (storage_location_dag.has_solution_range(this.variable_decl!.id)) {
      if (storage_location_dag.has_solution_range(this.id)) {
        storage_location_dag.update(this.id,
          loc.range_of_locs(storage_location_dag.solution_range.get(this.variable_decl!.id)!, 'equal')
        );
      }
      else {
        storage_location_dag.insert(this.id,
          loc.range_of_locs(storage_location_dag.solution_range.get(this.variable_decl!.id)!, 'equal')
        );
      }
      storage_location_dag.connect(this.id, this.variable_decl!.id);
    }
  }

  private generate_identifier() {
    //! This identifier may be a temporary struct/contract instantiation
    //! if the type range only contains struct/contract types.
    //! In this branch, variable_decl is undefined.
    if (this.variable_decl !== undefined) {
      type_dag.connect(this.id, this.variable_decl.id);
      if ((decl_db.is_mapping_decl(this.variable_decl.id) ||
        decl_db.is_array_decl(this.variable_decl.id)) &&
        (type.contains_trivial_mapping(type_dag.solution_range_of(this.id)!) ||
          type.contains_trivial_array(type_dag.solution_range_of(this.id)!))) {
        type_dag.force_update(this.id, type_dag.solution_range_of(this.variable_decl.id)!);
      }
      else {
        type_dag.solution_range_alignment(this.id, this.variable_decl.id);
      }
      assert(this.irnode === undefined, "IdentifierGenerator: this.irnode is not undefined");
      let outermost_vardecl_id : number | undefined;
      if (decl_db.is_member_of_struct_decl(this.variable_decl.id)) {
        [this.irnode, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_struct_member(this.variable_decl!);
      }
      else if (decl_db.is_mapping_value(this.variable_decl.id)) {
        [this.irnode, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_a_mapping_value(this.variable_decl.id);
      }
      else if (decl_db.is_base_decl(this.variable_decl.id)) {
        [this.irnode, outermost_vardecl_id] = this.generate_expr_when_selected_vardecl_is_an_array_element(this.variable_decl.id);
      }
      else {
        this.irnode = new expr.IRIdentifier(this.id, cur_scope.id(), this.variable_decl.name, this.variable_decl.id);
      }
      if (outermost_vardecl_id !== undefined) {
        expr_db.expr_reads_variable(this.id, outermost_vardecl_id);
        if (this.left) {
          expr_db.expr_writes_variable(this.id, outermost_vardecl_id);
        }
        if (storage_location_dag.has_solution_range(outermost_vardecl_id)) {
          // Since thie identifier accesses a struct member, the storage instance
          // cannot be in calldata.
          storage_location_dag.update(outermost_vardecl_id, [
            loc.StorageLocationProvider.storage_pointer(),
            loc.StorageLocationProvider.memory(),
            loc.StorageLocationProvider.storage_ref()
          ]);
        }
      }
      else {
        expr_db.expr_reads_variable(this.id, this.variable_decl.id);
        if (this.left) {
          expr_db.expr_writes_variable(this.id, this.variable_decl.id);
        }
        if (storage_location_dag.has_solution_range(this.variable_decl.id)) {
          storage_location_dag.update(this.variable_decl.id, [
            loc.StorageLocationProvider.storage_pointer(),
            loc.StorageLocationProvider.memory(),
            loc.StorageLocationProvider.storage_ref()
          ]);
        }
      }
      type_dag.solution_range_alignment(this.id, this.variable_decl.id);
      this.update_storage_loc_range();
    }
  }

  generate(cur_expression_complexity_level : number) : void {
    this.cur_expression_complexity_level = cur_expression_complexity_level;
    this.start_flag();
    this.get_available_vardecls();
    if (this.should_generate_a_new_var_decl()) {
      this.generate_a_new_var_decl();
    }
    else {
      this.variable_decl = pick_random_element(this.available_vardecl)!;
    }
    if (this.variable_decl !== undefined) {
      if (config.debug) {
        console.log(`${" ".repeat(indent)}IdentifierGenerator::generate: this.variable_decl: ${this.variable_decl.id}`);
      }
      decl_db.lock_vardecl(this.variable_decl!.id);
    }
    this.generate_identifier();
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
    else if (is_equal_range(this.type_range, type.bool_types)
      || is_equal_range(this.type_range, type.address_types)
      || is_super_range(type_db.userdefined_types(), this.type_range)
      || this.type_range.every(t => t.kind === type.TypeKind.ArrayType)) {
      this.op = "=";
    }
    else if (is_super_range(type.all_integer_types, this.type_range) ||
      is_super_range(type_db.types(), this.type_range)) {
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
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}: ${this.id}: type: ${type_range_str}, loc: ${this.storage_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Assignment ${this.op}, scope: ${cur_scope.kind()}, type: ${type_range_str}, loc: ${storage_location_dag.has_solution_range(this.id) ? storage_location_dag.solution_range_of(this.id)!.map(t => t.str()) : ''}, scope: ${cur_scope.kind()}`));
    }
  }

  private distill_type_range() {
    if (this.op === "=") {
      // Mapping-types or types that contain mapping-type are not allowed to be assigned.
      this.type_range = this.type_range.filter(t => !type.contain_mapping_type(t));
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
    type_dag.insert(leftid, this.type_range);
    if (this.this_dominate_right()) {
      type_dag.connect(this.id, rightid, "sub_dominance");
    }
    type_dag.connect(this.id, leftid);
    if (this.op === "=" && this.storage_range.length > 0) {
      storage_location_dag.insert(leftid, loc.range_of_locs(this.storage_range, 'equal'));
      storage_location_dag.connect(this.id, leftid);
      storage_location_dag.insert(rightid, loc.range_of_locs(this.storage_range, 'sub'));
      storage_location_dag.connect(this.id, rightid);
    }
    return [leftid, rightid];
  }

  private generate_right(rightid : number, cur_expression_complexity_level : number) : expr.IRExpression {
    let right_expression_gen_prototype = get_exprgenerator(
      type_dag.solution_range_of(rightid)!,
      cur_expression_complexity_level + 1,
      [],
      storage_location_dag.has_solution_range(rightid) ? storage_location_dag.solution_range_of(rightid)! : []
    );
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complexity_level + 1);
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
      if (storage_location_dag.has_solution_range(this.id)) {
        storage_location_dag.update(this.id,
          loc.range_of_locs(storage_location_dag.solution_range_of(leftid)!, "equal"));
      }
      else {
        storage_location_dag.insert(this.id,
          loc.range_of_locs(storage_location_dag.solution_range_of(leftid)!, 'equal'));
      }
      storage_location_dag.connect(this.id, leftid);
      storage_location_dag.solution_range_alignment(this.id, leftid);
      storage_location_dag.connect(this.id, rightid, "sub_dominance");
      storage_location_dag.solution_range_alignment(this.id, rightid);
    }
  }

  private generate_left(leftid : number, rightid : number, cur_expression_complexity_level : number) : expr.IRExpression {
    const right_type_range = type_dag.solution_range_of(rightid)!;
    if (this.op === "=" &&
      (type.all_mapping(right_type_range) || type.all_array(right_type_range)) &&
      (type.contains_trivial_mapping(type_dag.solution_range_of(leftid)!) ||
        type.contains_trivial_array(type_dag.solution_range_of(leftid)!))) {
      type_dag.force_update(leftid, right_type_range);
    }
    const right_storage_range = storage_location_dag.has_solution_range(rightid) ?
      storage_location_dag.solution_range_of(rightid)! : [];
    if (right_storage_range.length > 0) {
      assert(this.op === "=", `AssignmentGenerator: op is not =, but is ${this.op}`);
      if (storage_location_dag.has_solution_range(leftid)) {
        storage_location_dag.update(leftid, loc.range_of_locs(right_storage_range, "sub"));
      }
      else {
        storage_location_dag.insert(leftid, loc.range_of_locs(right_storage_range, "sub"));
      }
    }
    const identifier_gen = new IdentifierGenerator(leftid, true);
    identifier_gen.generate(cur_expression_complexity_level + 1);
    type_dag.solution_range_alignment(this.id, leftid);
    assert(identifier_gen.variable_decl !== undefined, "AssignmentGenerator: identifier_gen.vardecl is undefined");
    this.update_storage_loc_range(leftid, rightid);
    return identifier_gen.irnode as expr.IRExpression;
  }

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const [leftid, rightid] = this.init_left_and_right();
    const right_expression = this.generate_right(rightid, cur_expression_complexity_level);
    const left_expression = this.generate_left(leftid, rightid, cur_expression_complexity_level);
    expr_db.transfer_read_variables(this.id, leftid);
    expr_db.transfer_write_variables(this.id, leftid);
    expr_db.transfer_read_variables(this.id, rightid);
    expr_db.transfer_write_variables(this.id, rightid);
    this.irnode = new expr.IRAssignment(this.id, cur_scope.id(), left_expression, right_expression, this.op!);
    this.end_flag();
    this.wrap_in_a_tuple(true);
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
    else if (is_equal_range(this.type_range, type.bool_types)) {
      this.op = pick_random_element(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (is_super_range(type.all_integer_types, this.type_range)) {
      this.op = pick_random_element(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else {
      this.op = pick_random_element(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
      this.type_range = intersection_range(this.type_range, type.elementary_types);
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
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
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
      type_dag.insert(leftid, this.type_range);
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
      type_dag.solution_range_alignment(ghostid, leftid);
      type_dag.connect(ghostid, rightid, "sub_dominance");
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    return [leftid, rightid, ghostid];
  }

  private generate_left_and_right(leftid : number, rightid : number, ghostid : number | undefined,
    cur_expression_complexity_level : number) : [expr.IRExpression, expr.IRExpression] {
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
        cur_expression_complexity_level + 1, [LiteralGenerator]);
    }
    else {
      left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(leftid)!,
        cur_expression_complexity_level + 1);
    }
    /*
    Two literals may induce some wield issues, such as 912 > int8(73).
    So in the current version, Erwin bans it.
    */
    right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!,
      cur_expression_complexity_level + 1, [LiteralGenerator]);
    right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complexity_level + 1);
    //! Generate left-hand-side expression
    if (this.this_dominate_right()) {
      type_dag.solution_range_alignment(this.id, rightid);
    }
    else if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complexity_level + 1);
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

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const [leftid, rightid, ghostid] = this.init_left_and_right();
    //! Select generators for the left-hand-side and right-hand-side expressions
    const [left_expression, right_expression] = this.generate_left_and_right(leftid, rightid, ghostid, cur_expression_complexity_level);
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
    assert(is_equal_range(this.type_range, type.bool_types),
      `BinaryCompareOpGenerator: type_range ${this.type_range.map(t => t.str())} should be bool_types`);
    if (op !== undefined) {
      this.op = op;
    }
    else if (is_equal_range(this.type_range, type.bool_types)) {
      this.op = pick_random_element(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else {
      throw new Error(`BinaryCompareOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
  }

  private start_flag() {
    if (config.debug) {
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryCompareOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
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
      type_dag.solution_range_alignment(ghostid, leftid);
      type_dag.connect(ghostid, rightid, "sub_dominance");
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    return [leftid, rightid, ghostid];
  }

  private generate_left_and_right(leftid : number, rightid : number, ghostid : number | undefined,
    cur_expression_complexity_level : number) : [expr.IRExpression, expr.IRExpression] {
    let right_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!, cur_expression_complexity_level + 1);
    let left_expression_gen_prototype = get_exprgenerator(type_dag.solution_range_of(rightid)!, cur_expression_complexity_level + 1, [LiteralGenerator]);
    const right_expression_gen = new right_expression_gen_prototype(rightid);
    right_expression_gen.generate(cur_expression_complexity_level + 1);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, rightid);
    }
    //! Generate left-hand-side expression
    const left_expression_gen = new left_expression_gen_prototype(leftid);
    left_expression_gen.generate(cur_expression_complexity_level + 1);
    if (ghostid !== undefined) {
      type_dag.solution_range_alignment(ghostid, leftid);
    }
    return [
      left_expression_gen.irnode as expr.IRExpression,
      right_expression_gen.irnode as expr.IRExpression
    ]
  }

  generate(cur_expression_complexity_level : number) : void {
    this.distill_type_range();
    this.start_flag();
    const [leftid, rightid, ghostid] = this.init_left_and_right();
    const [left_expression, right_expression] = this.generate_left_and_right(leftid, rightid, ghostid, cur_expression_complexity_level);
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
    else if (is_equal_range(this.type_range, type.bool_types)) {
      this.op = "!";
    }
    else if (is_equal_range(this.type_range, type.integer_types) || is_equal_range(this.type_range, type.all_integer_types)) {
      this.op = pick_random_element(["-", "~", "++", "--"])!;
    }
    else if (is_equal_range(this.type_range, type.uinteger_types)) {
      this.op = pick_random_element(["~", "++", "--"])!;
    }
    else {
      this.op = pick_random_element(["!", "-", "~", "++", "--"])!;
    }
  }

  private start_flag() {
    if (config.debug) {
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}: ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
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

  private generate_identifier(cur_expression_complexity_level : number) : expr.IRExpression {
    const identifier_id = new_global_id();
    type_dag.insert(identifier_id, this.type_range);
    type_dag.connect(this.id, identifier_id);
    const is_left = this.op === "++" || this.op === "--";
    const identifier_gen = new IdentifierGenerator(identifier_id, is_left);
    identifier_gen.generate(cur_expression_complexity_level + 1);
    type_dag.solution_range_alignment(this.id, identifier_id);
    return identifier_gen.irnode! as expr.IRExpression;
  }

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    this.distill_type_range();
    const expression : expr.IRExpression = this.generate_identifier(cur_expression_complexity_level);
    this.irnode = new expr.IRUnaryOp(this.id, cur_scope.id(), pick_random_element([true, false])!, expression, this.op)!;
    const extracted_expression = expr.tuple_extraction(expression);
    expr_db.transfer_read_variables(this.id, extracted_expression.id);
    expr_db.transfer_write_variables(this.id, extracted_expression.id);
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
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional: ${this.id}: type: ${type_range_str}, loc: ${this.storage_range.map(t => t.str())}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: Conditional, scope: ${cur_scope.kind()}, type: ${type_range_str}, loc: ${storage_location_dag.has_solution_range(this.id) ? storage_location_dag.solution_range_of(this.id)!.map(t => t.str()) : ''}`));
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
    if (this.storage_range.length > 0) {
      storage_location_dag.insert(e2id, loc.range_of_locs(this.storage_range, "equal"));
      storage_location_dag.connect(this.id, e2id);
      storage_location_dag.insert(e3id, loc.range_of_locs(this.storage_range, 'sub'));
      storage_location_dag.connect(this.id, e3id);
    }
    return [e1id, e2id, e3id];
  }

  private generate_e1_e2_e3(e1id : number, e2id : number, e3id : number,
    cur_expression_complexity_level : number) : [expr.IRExpression, expr.IRExpression, expr.IRExpression] {
    let e1_gen_prototype = get_exprgenerator(type.bool_types, cur_expression_complexity_level + 1);
    const e1_gen = new e1_gen_prototype(e1id);
    e1_gen.generate(cur_expression_complexity_level + 1);
    const e3_gen_prototype = get_exprgenerator(this.type_range, cur_expression_complexity_level + 1, [LiteralGenerator]);
    const e3_gen = new e3_gen_prototype!(e3id);
    e3_gen.generate(cur_expression_complexity_level + 1);
    if ((type.all_array(type_dag.solution_range_of(e3id)!) ||
      type.all_mapping(type_dag.solution_range_of(e3id)!)) &&
      (type.contains_trivial_array(type_dag.solution_range_of(this.id)!) ||
        type.contains_trivial_mapping(type_dag.solution_range_of(this.id)!))) {
      type_dag.force_update(this.id, type_dag.solution_range_of(e3id)!);
    }
    type_dag.solution_range_alignment(this.id, e3id);
    if ((type.all_array(type_dag.solution_range_of(e3id)!) ||
      type.all_mapping(type_dag.solution_range_of(e3id)!)) &&
      (type.contains_trivial_array(type_dag.solution_range_of(e2id)!) ||
        type.contains_trivial_mapping(type_dag.solution_range_of(e2id)!))) {
      type_dag.force_update(e2id, type_dag.solution_range_of(e3id)!);
    }
    const e3_storage_range = storage_location_dag.has_solution_range(e3id) ?
      storage_location_dag.solution_range_of(e3id)! : [];
    if (e3_storage_range.length > 0) {
      if (storage_location_dag.has_solution_range(e2id)) {
        storage_location_dag.update(e2id, loc.range_of_locs(e3_storage_range, "sub"));
      }
      else {
        storage_location_dag.insert(e2id, loc.range_of_locs(e3_storage_range, "sub"));
      }
    }
    const e2_gen_prototype = get_exprgenerator(type_dag.solution_range_of(e3id)!, cur_expression_complexity_level + 1);
    const e2_gen = new e2_gen_prototype(e2id);
    e2_gen.generate(cur_expression_complexity_level + 1);
    type_dag.solution_range_alignment(this.id, e2id);
    return [e1_gen.irnode! as expr.IRExpression, e2_gen.irnode! as expr.IRExpression, e3_gen.irnode! as expr.IRExpression];
  }

  private update_storage_loc_range(e2id : number, e3id : number) {
    if (storage_location_dag.has_solution_range(e2id)) {
      assert(storage_location_dag.has_solution_range(e3id),
        `ConditionalGenerator: e3id ${e3id} is not in storage_location_dag.solution_range`);
      if (storage_location_dag.has_solution_range(this.id)) {
        storage_location_dag.update(this.id, loc.range_of_locs(storage_location_dag.solution_range_of(e2id)!, "equal"));
      }
      else {
        storage_location_dag.insert(this.id,
          loc.range_of_locs(storage_location_dag.solution_range_of(e2id)!, 'equal')
        );
      }
      storage_location_dag.connect(this.id, e2id);
      storage_location_dag.connect(this.id, e3id, "sub_dominance");
      storage_location_dag.solution_range_alignment(this.id, e3id);
    }
  }

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    type_dag.insert(this.id, this.type_range);
    const [e1id, e2id, e3id] = this.init_e1_e2_e3();
    const [e1, e2, e3] = this.generate_e1_e2_e3(e1id, e2id, e3id, cur_expression_complexity_level);
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
  fid : number | undefined;
  noreturn : boolean = false;
  constructor(id : number, kind ?: FunctionCallKind) {
    super(id);
    this.kind = kind;
    if (this.kind === undefined) {
      this.kind = FunctionCallKind.FunctionCall;
    }
  }

  private pick_function_call() : [number, number] {
    const contractdecl_id_plus_funcdecl_id = get_funcdecls(this.type_range, this.storage_range);
    assert(contractdecl_id_plus_funcdecl_id.length > 0,
      `FunctionCallGenerator: contractdecl_id_plus_funcdecl_id is empty.`);
    const [contractdecl_id, funcdecl_id] = pick_random_element(contractdecl_id_plus_funcdecl_id)!;
    return [contractdecl_id, funcdecl_id];
  }

  private start_flag(contractdecl_id : number, funcdecl_id : number) {
    if (config.debug) {
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall: ${this.id}: type: ${type_range_str}, loc: ${this.storage_range.map(t => t.str())}, contractdecl_id: ${contractdecl_id} funcdecl_id: ${funcdecl_id}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: FunctionCall, id: ${this.id} scope: ${cur_scope.id()}, type: ${type_range_str}, loc: ${storage_location_dag.has_solution_range(this.id) ? storage_location_dag.solution_range_of(this.id)!.map(t => t.str()) : ''}, scope: ${cur_scope.kind()}`));
    }
  }

  private internal_function_call(contractdecl_id : number) : boolean {
    return contractdecl_id === decl_db.get_current_contractdecl_id(cur_scope);
  }

  private external_function_call(contractdecl_id : number) : boolean {
    return contractdecl_id !== decl_db.get_current_contractdecl_id(cur_scope);
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
    if (decl_db.is_getter_function(funcdecl_id)) {
      const state_decl_id = decl_db.state_var_of_getter_function(funcdecl_id)!;
      vismut_dag.update(state_decl_id, [
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
              loc.StorageLocationProvider.memory(),
              loc.StorageLocationProvider.calldata()
            ]);
          }
        }
        for (const ret of func_decl.returns) {
          if (storage_location_dag.has_solution_range(ret.id)) {
            storage_location_dag.update(ret.id, [
              loc.StorageLocationProvider.memory(),
              loc.StorageLocationProvider.calldata()
            ]);
          }
        }
      }
    }
    if (selected_ret_decl !== null) {
      if (storage_location_dag.has_solution_range(selected_ret_decl!.id)) {
        storage_location_dag.solution_range_alignment(this.id, selected_ret_decl.id);
      }
    }
  }

  /*
  Suppose the current function call is an external function call in
  the function body of function F, then F maybe nopure or noview.
  */
  private update_owner_function_features(contractdecl_id : number) : void {
    if (inside_function_body(cur_scope)) {
      if (this.external_function_call(contractdecl_id)) {
        if (contractdecl_id > 0) {
          sig.noview_nopure_funcdecl = true;
        }
        sig.nopure_funcdecl = true;
      }
    }
  }

  private extract_ret_decl(funcdecl : decl.IRFunctionDefinition) : [number, decl.IRVariableDeclaration | null] {
    const available_ret_decls_index : number[] = [];
    for (let i = 0; i < funcdecl.returns.length; i++) {
      if (vardecl_type_range_is_ok(funcdecl.returns[i].id, this.type_range) &&
        (funcdecl.returns.length === 1 ||
          !type_dag.solution_range_of(funcdecl.returns[i].id).every(t => type.contain_mapping_type(t)))) {
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
      if (storage_location_dag.has_solution_range(selected_ret_decl!.id)) {
        if (!storage_location_dag.has_solution_range(this.id)) {
          storage_location_dag.insert(this.id,
            loc.range_of_locs(storage_location_dag.solution_range_of(selected_ret_decl.id)!, 'equal'));
        }
        else {
          storage_location_dag.update(this.id,
            loc.range_of_locs(storage_location_dag.solution_range_of(selected_ret_decl.id)!, 'equal'));
        }
        storage_location_dag.connect(this.id, selected_ret_decl.id);
      }
    }
    if (config.debug && selected_ret_decl !== null) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  The type range of the selected ret decl (ID: ${selected_ret_decl.id}) is ${selected_ret_decls_index}: ${type_dag.solution_range_of(selected_ret_decl.id)!.map(t => t.str())}`));
    }
    return [selected_ret_decls_index, selected_ret_decl];
  }

  private generate_arguments(selected_ret_decl : decl.IRVariableDeclaration | null,
    funcdecl : decl.IRFunctionDefinition,
    cur_expression_complexity_level : number
  ) : number[] {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall Arguments`));
      indent += 2;
    }
    if (selected_ret_decl !== null) {
      if (decl_db.is_getter_function(funcdecl.id)) {
        expr_db.expr_reads_variable(this.id, decl_db.state_var_of_getter_function(funcdecl.id)!);
      }
      else {
        expr_db.expr_reads_variable(this.id, selected_ret_decl.id);
      }
    }
    cur_scope = cur_scope.new(scopeKind.FUNC_ARGUMENTS)
    const original_allowed_empty_return = sig.allow_empty_return;
    sig.allow_empty_return = false;
    const args_ids = super.generate_argument_from_parameters(cur_expression_complexity_level, funcdecl.parameters);
    sig.allow_empty_return = original_allowed_empty_return;
    cur_scope = cur_scope.rollback();
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
    cur_expression_complexity_level : number) {
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1 && selected_ret_decl !== null) {
      //* generate the function call node
      let func_call_node : expr.IRExpression;
      this.fid = new_global_id();
      type_dag.insert(this.fid, this.type_range);
      let funccall_scope = cur_scope.snapshot();
      while (unexpected_extra_stmt_belong_to_the_parent_scope(funccall_scope)) {
        funccall_scope = funccall_scope.pre();
      }
      const funccall_scope_id = funccall_scope.id();
      // An external call, including "this": https://docs.soliditylang.org/en/latest/contracts.html#function-types
      if (contractdecl_id !== decl_db.get_current_contractdecl_id(cur_scope)) {
        // "this" (yin)
        if (contractdecl_id < 0) {
          func_call_node = new expr.IRFunctionCall(
            this.fid,
            funccall_scope_id,
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), funccall_scope_id,
              func_identifier.name!, contractdecl_id, new expr.IRIdentifier(new_global_id(), funccall_scope_id, "this", -1),
            ),
            args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
          );
        }
        // Other yang contracts
        else {
          sig.external_call = true;
          let contract_instance_expr : expr.IRExpression | undefined;
          const type_range = type_db.contract_type_of(contractdecl_id)!.subs();
          const idid = new_global_id();
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complexity_level + 1);
          contract_instance_expr = identifier_gen.irnode as expr.IRExpression;
          func_call_node = new expr.IRFunctionCall(
            this.fid,
            funccall_scope_id,
            this.kind!,
            new expr.IRMemberAccess(new_global_id(), funccall_scope_id,
              func_identifier.name!, contractdecl_id, contract_instance_expr,
            ),
            args_ids.map(i => irnodes.get(i)! as expr.IRExpression)
          );
        }
      }
      else {
        func_call_node = new expr.IRFunctionCall(this.fid, funccall_scope_id, this.kind!,
          func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
      }
      if (sig.allow_empty_return) {
        this.irnode = func_call_node;
        change_node_id(this.irnode, this.id);
      }
      else {
        //* generate an identifier
        const return_type_range = type_dag.solution_range_of(selected_ret_decl.id)!;
        if ((type.all_array(return_type_range) || type.all_mapping(return_type_range)) &&
          (type.contains_trivial_array(this.type_range) || type.contains_trivial_mapping(this.type_range))) {
          type_dag.force_update(this.id, return_type_range);
        }
        const identifier_gen = new IdentifierGenerator(this.id, true);
        identifier_gen.generate(cur_expression_complexity_level + 1);
        this.irnode = identifier_gen.irnode;
        const identifier_expr = expr.tuple_extraction(identifier_gen.irnode! as expr.IRExpression);
        assert(identifier_gen.variable_decl !== undefined, `FunctionCallGenerator: identifier_gen.variable_decl is undefined`);
        expr_db.transfer_read_variables(this.id, identifier_expr.id);
        expr_db.transfer_write_variables(this.id, identifier_expr.id);
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
        const assignment_stmt_node = new stmt.IRExpressionStatement(new_global_id(), funccall_scope_id, assignment_node);
        (assignment_stmt_node as stmt.IRStatement).exprs = [expr.tuple_extraction(func_call_node)];
        stmt_db.add_unexpected_extra_stmt(funccall_scope_id, assignment_stmt_node);
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
          sig.external_call = true;
          let contract_instance_expr : expr.IRExpression | undefined;
          const type_range = type_db.contract_type_of(contractdecl_id)!.subs();
          const idid = new_global_id();
          type_dag.insert(idid, type_range);
          const identifier_gen = new IdentifierGenerator(idid);
          identifier_gen.generate(cur_expression_complexity_level + 1);
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

  generate(cur_expression_complexity_level : number) : void {
    const [contractdecl_id, funcdecl_id] = this.pick_function_call();
    this.start_flag(contractdecl_id, funcdecl_id);
    this.update_vismut_range(contractdecl_id, funcdecl_id);
    this.update_owner_function_features(contractdecl_id);
    decl_db.add_called_function_decl(funcdecl_id);
    const funcdecl = irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition;
    const func_identifier = new expr.IRIdentifier(new_global_id(), cur_scope.id(), funcdecl.name, funcdecl_id);
    const [selected_ret_decls_index, selected_ret_decl] = this.extract_ret_decl(funcdecl);
    const args_ids = this.generate_arguments(selected_ret_decl, funcdecl, cur_expression_complexity_level);
    this.generate_function_call_node(contractdecl_id, funcdecl, selected_ret_decl,
      selected_ret_decls_index, func_identifier, args_ids,
      cur_expression_complexity_level);
    this.update_storage_range(contractdecl_id, funcdecl_id, selected_ret_decl);
    if (selected_ret_decl !== null) {
      this.wrap_in_a_tuple();
    }
    this.end_flag();
  }
}

class NewStructGenerator extends CallExpressionGenerator {

  constructor(id : number) {
    super(id);
  }

  private start_flag() {
    if (config.debug) {
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(
        `${" ".repeat(indent)}>>  Start generating NewStructGenerator ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.id}: NewStructGenerator, scope: ${cur_scope.kind()} type: ${type_range_str}, loc: ${storage_location_dag.has_solution_range(this.id) ? storage_location_dag.solution_range_of(this.id)!.map(t => t.str()) : ''}`));
    }
  }

  private distill_type_range() : [type.StructType, decl.IRStructDefinition] {
    assert(decl_db.structdecl_size() > 0, "No struct is declared");
    this.type_range = this.type_range.filter(
      t => t.typeName === "StructType" &&
        !decl_db.contains_mapping_decl((t as type.StructType).referece_id)
    );
    assert(this.type_range.length > 0, "NewStructGenerator: type_range is empty");
    const struct_type = pick_random_element(this.type_range)! as type.StructType;
    type_dag.update(this.id, [struct_type]);
    return [struct_type, irnodes.get(struct_type.referece_id) as decl.IRStructDefinition];
  }

  private generate_arguments(struct_decl : decl.IRStructDefinition,
    cur_expression_complexity_level : number) : expr.IRExpression[] {
    const args_ids : number[] = super.generate_argument_from_parameters(cur_expression_complexity_level, struct_decl.members);
    const args = args_ids.map(i => irnodes.get(i)! as expr.IRExpression);
    return args;
  }

  private update_storage_loc_range() {
    if (storage_location_dag.has_solution_range(this.id)) {
      storage_location_dag.update(this.id, [
        loc.StorageLocationProvider.memory(),
      ]);
    }
    else {
      storage_location_dag.insert(this.id, [
        loc.StorageLocationProvider.memory(),
      ]);
    }
    update_storage_loc_range_for_compound_type(this.id);
  }

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    const [struct_type, struct_decl] = this.distill_type_range();
    expr_db.add_new_struct_expr(this.id);
    expr_db.pair_new_struct_expr_with_struct_decl(this.id, struct_decl.id);
    const args = this.generate_arguments(struct_decl, cur_expression_complexity_level);
    args.forEach(arg => {
      expr_db.transfer_read_variables(this.id, arg.id);
      expr_db.transfer_write_variables(this.id, arg.id);
    });
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
      const type_range_str = generate_type_range_str(this.type_range);
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating NewContractGenerator ${this.id}: ${type_range_str}, scope: ${cur_scope.kind()}`));
      indent += 2;
    }
  }

  private end_flag() {
    if (config.debug) {
      indent -= 2;
      const type_range_str = generate_type_range_str(type_dag.solution_range_of(this.id)!);
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: NewContractGenerator, scope: ${cur_scope.kind()}, type_range: ${type_range_str}`));
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
    cur_expression_complexity_level : number) : expr.IRExpression[] {
    const args_ids : number[] = super.generate_argument_from_parameters(cur_expression_complexity_level, contract_decl.constructor_parameters);
    const args = args_ids.map(i => irnodes.get(i)! as expr.IRExpression);
    return args;
  }

  private update_owner_function_features() : void {
    if (inside_function_body(cur_scope)) {
      sig.noview_nopure_funcdecl = true;
    }
  }

  generate(cur_expression_complexity_level : number) : void {
    this.start_flag();
    const contract_type = this.distill_type_range();
    const contract_decl = irnodes.get(contract_type.referece_id) as decl.IRContractDefinition;
    const new_expr = new expr.IRNew(new_global_id(), cur_scope.id(), contract_decl.name);
    const args = this.generate_arguments(contract_decl, cur_expression_complexity_level);
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
    type_dag.insert(assignid, type_db.types());
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
    type_dag.insert(cid, type_db.types());
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
    sig.allow_empty_return = true;
    const fid = new_global_id();
    type_dag.insert(fid, type_db.types());
    const funcall_gen = new FunctionCallGenerator(fid);
    funcall_gen.generate(0);
    this.expr = expr.tuple_extraction(funcall_gen.irnode! as expr.IRExpression);
    this.irnode = new stmt.IRExpressionStatement(new_global_id(), cur_scope.id(), funcall_gen.irnode! as expr.IRExpression);
    (this.irnode as stmt.IRStatement).exprs = [this.expr];
    sig.allow_empty_return = false;
    this.end_flag();
  }
}

abstract class NonExpressionStatementGenerator extends StatementGenerator {
  exprs : expr.IRExpression[];
  constructor() {
    super();
    this.exprs = [];
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
      expression_gen_prototype = get_exprgenerator(type_db.types());
      const expr_id = new_global_id();
      type_dag.insert(expr_id, type_db.types());
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
      type_dag.solution_range_alignment(ghost_id, this.vardecl!.id);
      if (config.debug) {
        console.log(`${" ".repeat(indent)}SingleVariableDeclareStatementGenerator: ghost_id: ${ghost_id}, extracted_ir: ${extracted_ir}, this.vardecl.id: ${this.vardecl!.id}`);
      }
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
      expression_gen_prototype = get_exprgenerator(type_db.types());
      const expr_id = new_global_id();
      type_dag.insert(expr_id, type_db.types());
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
        type_dag.solution_range_alignment(ghost_id, this.vardecls[i].id);
        if (config.debug) {
          console.log(`${" ".repeat(indent)}MultipleVariableDeclareStatementGenerator: ghost_id: ${ghost_id}, extracted_ir: ${extracted_ir}, this.vardecl.id: ${this.vardecls[i].id}`);
        }
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
      const expression_gen_prototype = get_exprgenerator(type_db.types());
      const exprid = new_global_id();
      type_dag.insert(exprid, type_db.types());
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
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      true_body = true_body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      false_body = false_body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
        const init_expr_gen_prototype = get_exprgenerator(type_db.types());
        const iid = new_global_id();
        type_dag.insert(iid, type_db.types());
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
    const loop_gen_prototype = get_exprgenerator(type_db.types());
    const lid = new_global_id();
    type_dag.insert(lid, type_db.types());
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
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      body = body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      body = body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
      stmt_db.initialize_the_vardecls_that_must_be_initialized(cur_scope.id());
      body = body.concat(stmt_db.unexpected_extra_stmts_of_scope(cur_scope.id()));
      stmt_db.remove_unexpected_extra_stmt_from_scope(cur_scope.id());
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
];

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
];