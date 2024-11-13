import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Tree } from './dataStructor';
import { scopeKind } from './scope';
import { FunctionVisibility, StateVariableVisibility } from 'solc-typed-ast';
import { assert } from 'console';
import { config } from './config';
import { IRFunctionDefinition, IRStructDefinition } from './declare';
import { irnodes } from './node';
import { contain_mapping_type } from './type';
import { type_dag } from './generator';

// Deprecated Database
export class DeprecatedDB {
  db : sqlite.Database;
  constructor(filename : string = ":memory:") {
    const config = {
      filename: filename,
      driver: sqlite3.Database
    };
    this.db = new sqlite.Database(config);
  }

  async open() {
    await this.db.open();
  }

  async init() {
    await this.db.exec('CREATE TABLE tbl (id INTEGER PRIMARY KEY, scope INTEGER, kind TEXT, type TEXT)')
  }

  async close() {
    await this.db.close();
  }

  async run(cmd : string) : Promise<void | any[]> {
    if (cmd.startsWith("INSERT") || cmd.startsWith("UPDATE")) {
      await this.db.run(cmd);
    }
    else if (cmd.startsWith("SELECT")) {
      const result = await this.db.all(cmd) as any[];
      return result;
    }
  }

  async insert(id : number, scope : number, kind : string) {
    const cmd = `INSERT INTO tbl (id, scope, kind) VALUES (${id}, ${scope}, "${kind}")`;
    await this.run(cmd);
  }
}

export enum erwin_visibility {
  INCONTRACT_INTERNAL = "erwin_visibility::INCONTRACT_INTERNAL",
  INCONTRACT_EXTERNAL = "erwin_visibility::INCONTRACT_EXTERNAL",
  INCONTRACT_PUBLIC = "erwin_visibility::INCONTRACT_PUBLIC",
  INCONTRACT_PRIVATE = "erwin_visibility::INCONTRACT_PRIVATE",
  INCONTRACT_UNKNOWN = "erwin_visibility::INCONTRACT_UNKNOWN",
  NAV = "erwin_visibility::NAV", // visibility does not apply
}

export function decide_function_visibility(kind : scopeKind, vis : FunctionVisibility) : erwin_visibility {
  switch (kind) {
    case scopeKind.GLOBAL:
      if (config.debug)
        assert(vis === FunctionVisibility.Default, "When the scope is global, the visibiliity is not FunctionVisibility.Default");
      return erwin_visibility.NAV;
    case scopeKind.CONTRACT:
      switch (vis) {
        case FunctionVisibility.External:
          return erwin_visibility.INCONTRACT_EXTERNAL;
        case FunctionVisibility.Internal:
          return erwin_visibility.INCONTRACT_INTERNAL;
        case FunctionVisibility.Private:
          return erwin_visibility.INCONTRACT_PRIVATE;
        case FunctionVisibility.Public:
          return erwin_visibility.INCONTRACT_PUBLIC;
        default:
          throw new Error(`Unsupported FunctionVisibility: ${vis}`);
      }
    case scopeKind.FUNC:
    case scopeKind.IF_CONDITION:
    case scopeKind.IF_BODY:
    case scopeKind.FOR_CONDITION:
    case scopeKind.FOR_BODY:
    case scopeKind.WHILE_CONDITION:
    case scopeKind.WHILE_BODY:
    case scopeKind.DOWHILE_BODY:
    case scopeKind.DOWHILE_COND:
    case scopeKind.CONSTRUCTOR:
    case scopeKind.CONSTRUCTOR_PARAMETERS:
    case scopeKind.STRUCT:
    case scopeKind.FUNC_PARAMETER:
    case scopeKind.FUNC_RETURNS:
    case scopeKind.MAPPING:
    case scopeKind.ARRAY:
      return erwin_visibility.NAV;
    default:
      throw new Error(`Unsupported scopeKind: ${kind}`);
  }
}

export function decide_variable_visibility(kind : scopeKind, vis : StateVariableVisibility) : erwin_visibility {
  switch (kind) {
    case scopeKind.CONTRACT:
      switch (vis) {
        case StateVariableVisibility.Internal:
          return erwin_visibility.INCONTRACT_INTERNAL;
        case StateVariableVisibility.Private:
          return erwin_visibility.INCONTRACT_PRIVATE;
        case StateVariableVisibility.Public:
          return erwin_visibility.INCONTRACT_PUBLIC;
        default:
          throw new Error(`Unsupported StateVariableVisibility: ${vis}`);
      }
    case scopeKind.FUNC:
    case scopeKind.GLOBAL:
    case scopeKind.IF_BODY:
    case scopeKind.IF_CONDITION:
    case scopeKind.FOR_BODY:
    case scopeKind.FOR_CONDITION:
    case scopeKind.WHILE_BODY:
    case scopeKind.WHILE_CONDITION:
    case scopeKind.DOWHILE_BODY:
    case scopeKind.DOWHILE_COND:
    case scopeKind.CONSTRUCTOR:
    case scopeKind.CONSTRUCTOR_PARAMETERS:
    case scopeKind.STRUCT:
    case scopeKind.FUNC_PARAMETER:
    case scopeKind.FUNC_RETURNS:
    case scopeKind.MAPPING:
    case scopeKind.ARRAY:
      return erwin_visibility.NAV;
    default:
      throw new Error(`Unsupported scopeKind: ${kind}`);
  }
}

type irnodeInfo = {
  id : number,
  vis : erwin_visibility
}

class DeclDB {

  //! Scope-Related
  private scope_tree : Tree<number>;
  private scope2irnodeinfo : Map<number, irnodeInfo[]>;
  private contractdecl_id_to_scope : Map<number, number>;
  private scope_id_to_contractdecl_id : Map<number, number> = new Map<number, number>();

  //! Decl-Related
  private vardecls : Set<number> = new Set<number>();
  private structdecls : Set<number> = new Set<number>();
  private funcdecls : Set<number> = new Set<number>();
  private contractdecls : Set<number> = new Set<number>();
  private state_variables : Set<number> = new Set<number>();
  private getter_funcdecls : Set<number> = new Set<number>();

  private getter_function_id_to_state_struct_instance_id : Map<number, number> = new Map<number, number>();
  private getter_function_id_to_struct_decl_id : Map<number, number> = new Map<number, number>();
  private getter_function_id_to_state_mapping_decl : Map<number, number> = new Map<number, number>();
  private state_struct_instance_id_to_getter_function_ids : Map<number, number[]> = new Map<number, number[]>();

  private mapping_decls : Set<number> = new Set<number>();
  private mapping_decl_id_to_kv_ids : Map<number, [number, number]> = new Map<number, [number, number]>();
  private value_id_to_mapping_decl_id : Map<number, number> = new Map<number, number>();
  private key_id_to_mapping_decl_id : Map<number, number> = new Map<number, number>();

  private called_function_decls_ids : Set<number> = new Set<number>();

  private array_decl_id : Set<number> = new Set<number>();
  private array_decl_id_to_base_id : Map<number, number> = new Map<number, number>();
  private base_id_to_array_decl_id : Map<number, number> = new Map<number, number>();
  private array_decl_that_contains_mapping_decl : Set<number> = new Set<number>();

  private struct_decl_that_contains_mapping_decl : Set<number> = new Set<number>();
  private member2structdecl : Map<number, number> = new Map<number, number>();
  private structdecl2members : Map<number, number[]> = new Map<number, number[]>();


  private cannot_be_assigned_to : Set<number> = new Set<number>();
  private must_be_initialized : Map<number, number[]> = new Map<number, number[]>();

  constructor() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.contractdecl_id_to_scope = new Map<number, number>();
  }

  //! ================ Decl-Related ================

  //* vardecl
  add_vardecl(vardecl_id : number) : void {
    this.vardecls.add(vardecl_id);
  }

  remove_vardecl(vardecl_id : number) : void {
    this.vardecls.delete(vardecl_id);
  }

  is_vardecl(vardecl_id : number) : boolean {
    return this.vardecls.has(vardecl_id);
  }

  vardecls_ids() : number[] {
    return Array.from(this.vardecls);
  }

  vardecl_size() : number {
    return this.vardecls.size;
  }

  //* structdecl
  add_structdecl(structdecl_id : number) : void {
    this.structdecls.add(structdecl_id);
  }

  remove_structdecl(structdecl_id : number) : void {
    this.structdecls.delete(structdecl_id);
  }

  is_structdecl(structdecl_id : number) : boolean {
    return this.structdecls.has(structdecl_id);
  }

  structdecls_ids() : number[] {
    return Array.from(this.structdecls);
  }

  structdecl_size() : number {
    return this.structdecls.size;
  }

  //* funcdecl
  add_funcdecl(funcdecl_id : number) : void {
    this.funcdecls.add(funcdecl_id);
  }

  remove_funcdecl(funcdecl_id : number) : void {
    this.funcdecls.delete(funcdecl_id);
  }

  is_funcdecl(funcdecl_id : number) : boolean {
    return this.funcdecls.has(funcdecl_id);
  }

  funcdecls_ids() : number[] {
    return Array.from(this.funcdecls);
  }

  funcdecl_size() : number {
    return this.funcdecls.size;
  }

  add_called_function_decl(funcdecl_id : number) : void {
    this.called_function_decls_ids.add(funcdecl_id);
  }

  clear_called_function_decls() : void {
    this.called_function_decls_ids.clear();
  }

  called_funcdecls_ids() : number[] {
    return Array.from(this.called_function_decls_ids);
  }

  //* contractdecl

  add_contractdecl_scope(scope_id : number, contractdecl_id : number) : void {
    this.scope_id_to_contractdecl_id.set(scope_id, contractdecl_id);
  }

  get_contractdecl_by_scope(scope_id : number) : number {
    return this.scope_id_to_contractdecl_id.get(scope_id)!;
  }

  insert_yin_contract(scope_id : number, contractdecl_id : number) : void {
    this.contractdecls.add(-contractdecl_id);
    this.contractdecl_id_to_scope.set(-contractdecl_id, scope_id);
  }

  insert_yang_contract(scope_id : number, contractdecl_id : number) : void {
    this.contractdecls.add(contractdecl_id);
    this.contractdecl_id_to_scope.set(contractdecl_id, scope_id);
  }

  remove_contractdecl(contractdecl_id : number) : void {
    this.contractdecls.delete(contractdecl_id);
  }

  is_contractdecl(contractdecl_id : number) : boolean {
    return this.contractdecls.has(contractdecl_id);
  }

  contractdecls_ids() : number[] {
    return Array.from(this.contractdecls);
  }

  contractdecl_size() : number {
    return this.contractdecls.size;
  }

  //* state_variable
  add_state_variable(vardecl_id : number) : void {
    this.state_variables.add(vardecl_id);
  }

  remove_state_variable(vardecl_id : number) : void {
    this.state_variables.delete(vardecl_id);
  }

  is_state_variable(vardecl_id : number) : boolean {
    return this.state_variables.has(vardecl_id);
  }

  state_variables_ids() : number[] {
    return Array.from(this.state_variables);
  }

  state_variable_size() : number {
    return this.state_variables.size;
  }

  //* struct decl
  find_structdecl_by_name(name : string) : IRStructDefinition | undefined {
    const struct_decl = Array.from(this.structdecls).find(x => (irnodes.get(x)! as IRStructDefinition).name === name);
    return struct_decl === undefined ? undefined : irnodes.get(struct_decl)! as IRStructDefinition;
  }

  if_struct_decl_contain_mapping_decl(struct_decl_id : number) : void {
    let stop = false;
    for (const member of this.members_of_struct_decl(struct_decl_id)) {
      for (const t of type_dag.solution_range.get(member)!) {
        if (contain_mapping_type(t)) {
          this.struct_decl_that_contains_mapping_decl.add(struct_decl_id);
          stop = true;
          break;
        }
      }
      if (stop) break;
    }
  }

  remove_struct_decl_that_contains_mapping_decl(struct_decl_id : number) : void {
    this.struct_decl_that_contains_mapping_decl.delete(struct_decl_id);
  }

  is_struct_decl_that_contains_mapping_decl(struct_decl_id : number) : boolean {
    return this.struct_decl_that_contains_mapping_decl.has(struct_decl_id);
  }

  add_member_to_struct_decl(member_id : number, struct_decl_id : number) : void {
    this.member2structdecl.set(member_id, struct_decl_id);
    if (this.structdecl2members.has(struct_decl_id)) {
      this.structdecl2members.get(struct_decl_id)!.push(member_id);
    }
    else {
      this.structdecl2members.set(struct_decl_id, [member_id]);
    }
  }

  is_member_of_struct_decl(member_id : number) : boolean {
    return this.member2structdecl.has(member_id);
  }

  struct_decl_of_member(member_id : number) : number {
    assert(this.member2structdecl.has(member_id), `The member ${member_id} does not exist.`);
    return this.member2structdecl.get(member_id)!;
  }

  members_of_struct_decl(struct_decl_id : number) : number[] {
    assert(this.structdecl2members.has(struct_decl_id), `The struct declaration ${struct_decl_id} does not exist.`);
    return this.structdecl2members.get(struct_decl_id)!;
  }

  //* struct instance
  is_state_struct_instance(node_id : number) : boolean {
    return this.state_struct_instance_id_to_getter_function_ids.has(node_id);
  }

  getter_functions_of_state_struct_instance(state_struct_instance_id : number) : number[] {
    assert(this.state_struct_instance_id_to_getter_function_ids.has(state_struct_instance_id),
      `The state struct instance ${state_struct_instance_id} does not exist.`);
    return this.state_struct_instance_id_to_getter_function_ids.get(state_struct_instance_id)!;
  }

  //* getter function
  add_getter_function(funcdecl_id : number) : void {
    this.getter_funcdecls.add(funcdecl_id);
  }

  remove_getter_function(funcdecl_id : number) : void {
    this.getter_funcdecls.delete(funcdecl_id);
    this.funcdecls.delete(funcdecl_id);
    this.remove(funcdecl_id, (irnodes.get(funcdecl_id)! as IRFunctionDefinition).scope);
    const state_struct_instance = this.getter_function_id_to_state_struct_instance_id.get(funcdecl_id);
    this.getter_function_id_to_state_struct_instance_id.delete(funcdecl_id);
    if (state_struct_instance !== undefined) {
      const getter_functions = this.state_struct_instance_id_to_getter_function_ids.get(state_struct_instance)!;
      this.state_struct_instance_id_to_getter_function_ids.set(state_struct_instance, getter_functions.filter(x => x !== funcdecl_id));
    }
    this.getter_function_id_to_struct_decl_id.delete(funcdecl_id);
  }

  add_getter_function_to_state_mapping_decl(funcdecl_id : number, mapping_decl_id : number) : void {
    this.getter_function_id_to_state_mapping_decl.set(funcdecl_id, mapping_decl_id);
  }

  is_getter_function_for_state_mapping_decl(funcdecl_id : number) : boolean {
    return this.getter_function_id_to_state_mapping_decl.has(funcdecl_id);
  }

  state_mapping_decl_of_getter_function(funcdecl_id : number) : number {
    assert(this.getter_function_id_to_state_mapping_decl.has(funcdecl_id),
      `The getter function ${funcdecl_id} does not exist.`);
    return this.getter_function_id_to_state_mapping_decl.get(funcdecl_id)!;
  }

  map_getter_function_to_state_struct_instance(funcdecl_id : number, state_struct_instance_id : number, struct_decl_id : number) : void {
    this.getter_function_id_to_state_struct_instance_id.set(funcdecl_id, state_struct_instance_id);
    this.getter_function_id_to_struct_decl_id.set(funcdecl_id, struct_decl_id);
    if (this.state_struct_instance_id_to_getter_function_ids.has(state_struct_instance_id)) {
      this.state_struct_instance_id_to_getter_function_ids.set(state_struct_instance_id,
        this.state_struct_instance_id_to_getter_function_ids.get(state_struct_instance_id)!.concat(funcdecl_id));
    }
    else {
      this.state_struct_instance_id_to_getter_function_ids.set(state_struct_instance_id, [funcdecl_id]);
    }
  }

  is_getter_function(funcdecl_id : number) : boolean {
    return this.getter_funcdecls.has(funcdecl_id);
  }

  is_getter_function_for_state_struct_instance(funcdecl_id : number) : boolean {
    return this.getter_function_id_to_state_struct_instance_id.has(funcdecl_id);
  }

  state_struct_instance_of_getter_function(funcdecl_id : number) : number {
    assert(this.getter_function_id_to_state_struct_instance_id.has(funcdecl_id),
      `The getter function ${funcdecl_id} does not exist.`);
    return this.getter_function_id_to_state_struct_instance_id.get(funcdecl_id)!;
  }

  state_decl_of_getter_function(funcdecl_id : number) : number {
    assert(this.getter_function_id_to_struct_decl_id.has(funcdecl_id),
      `The getter function ${funcdecl_id} does not exist.`);
    return this.getter_function_id_to_struct_decl_id.get(funcdecl_id)!;
  }

  //* array decl
  add_array_decl(array_decl_id : number, base_id : number) : void {
    this.array_decl_id.add(array_decl_id);
    this.array_decl_id_to_base_id.set(array_decl_id, base_id);
    this.base_id_to_array_decl_id.set(base_id, array_decl_id);
  }

  is_array_decl(array_decl_id : number) : boolean {
    return this.array_decl_id.has(array_decl_id);
  }

  is_base_decl(base_id : number) : boolean {
    return this.base_id_to_array_decl_id.has(base_id);
  }

  array_of_base(base_id : number) : number {
    assert(this.base_id_to_array_decl_id.has(base_id), `The base ${base_id} does not exist.`);
    return this.base_id_to_array_decl_id.get(base_id)!;
  }

  remove_array_decl(array_decl_id : number) : void {
    this.array_decl_id.delete(array_decl_id);
    this.array_decl_id_to_base_id.delete(array_decl_id);
    this.base_id_to_array_decl_id.delete(this.base_id_of_array_decl(array_decl_id));
  }

  base_id_of_array_decl(array_decl_id : number) : number {
    return this.array_decl_id_to_base_id.get(array_decl_id)!;
  }

  if_array_decl_contain_mapping_decl(array_decl_id : number) : void {
    for (const t of type_dag.solution_range.get(array_decl_id)!) {
      if (contain_mapping_type(t)) {
        this.array_decl_that_contains_mapping_decl.add(array_decl_id);
        break;
      }
    }
  }

  is_array_decl_that_contains_mapping_decl(array_decl_id : number) : boolean {
    return this.array_decl_that_contains_mapping_decl.has(array_decl_id);
  }

  //* mapping decl
  add_mapping_decl(mapping_decl_id : number, key_id : number, value_id : number) : void {
    this.mapping_decls.add(mapping_decl_id);
    this.mapping_decl_id_to_kv_ids.set(mapping_decl_id, [key_id, value_id]);
    this.value_id_to_mapping_decl_id.set(value_id, mapping_decl_id);
    this.key_id_to_mapping_decl_id.set(key_id, mapping_decl_id);
  }

  is_mapping_decl(mapping_decl_id : number) : boolean {
    return this.mapping_decls.has(mapping_decl_id);
  }

  mapping_decls_ids() : number[] {
    return Array.from(this.mapping_decls);
  }

  remove_mapping_decl(mapping_decl_id : number) : void {
    this.mapping_decls.delete(mapping_decl_id);
    this.mapping_decl_id_to_kv_ids.delete(mapping_decl_id);
    this.value_id_to_mapping_decl_id.delete(this.value_id_of_mapping_decl(mapping_decl_id));
    this.key_id_to_mapping_decl_id.delete(this.key_id_of_mapping_decl(mapping_decl_id));
  }

  kv_idpair_of_mapping_decl(mapping_decl_id : number) : [number, number] {
    assert(this.mapping_decl_id_to_kv_ids.has(mapping_decl_id), `The mapping declaration ${mapping_decl_id} does not exist.`);
    return this.mapping_decl_id_to_kv_ids.get(mapping_decl_id)!;
  }

  key_id_of_mapping_decl(mapping_decl_id : number) : number {
    return this.kv_idpair_of_mapping_decl(mapping_decl_id)[0];
  }

  value_id_of_mapping_decl(mapping_decl_id : number) : number {
    return this.kv_idpair_of_mapping_decl(mapping_decl_id)[1];
  }

  is_mapping_value(value_id : number) : boolean {
    return this.value_id_to_mapping_decl_id.has(value_id);
  }

  mapping_of_value(value_id : number) : number {
    assert(this.value_id_to_mapping_decl_id.has(value_id), `The value ${value_id} does not exist.`);
    return this.value_id_to_mapping_decl_id.get(value_id)!;
  }

  is_mapping_key(key_id : number) : boolean {
    return this.key_id_to_mapping_decl_id.has(key_id);
  }

  mapping_of_key(key_id : number) : number {
    assert(this.key_id_to_mapping_decl_id.has(key_id), `The key ${key_id} does not exist.`);
    return this.key_id_to_mapping_decl_id.get(key_id)!;
  }

  //* misc
  set_vardecl_as_nonassignable(vardecl_id : number) : void {
    this.cannot_be_assigned_to.add(vardecl_id);
  }

  is_vardecl_nonassignable(vardecl_id : number) : boolean {
    return this.cannot_be_assigned_to.has(vardecl_id);
  }

  set_vardecl_as_must_be_initialized(scope_id : number, vardecl_id : number) : void {
    if (this.must_be_initialized.has(scope_id)) {
      this.must_be_initialized.get(scope_id)!.push(vardecl_id);
    }
    else {
      this.must_be_initialized.set(scope_id, [vardecl_id]);
    }
  }

  remove_vardecl_from_must_be_initialized(scope_id : number) : void {
    this.must_be_initialized.delete(scope_id);
  }

  scope_has_vardecls_that_must_be_initialized(scope_id : number) : boolean {
    return this.must_be_initialized.has(scope_id);
  }

  exist_vardecls_that_must_be_initialized(scope_id : number) : number[] {
    assert(this.must_be_initialized.has(scope_id), `The scope ${scope_id} does not exist.`);
    return this.must_be_initialized.get(scope_id)!;
  }

  //! ================ Scope-Related ================
  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }

  insert(node_id : number, ervis : erwin_visibility, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat({ id: node_id, vis: ervis }));
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: node_id, vis: ervis }]);
    }
  }

  remove(node_id : number, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.filter(x => x.id !== node_id));
    }
    else {
      throw new Error(`The scope ${scope_id} does not exist.`);
    }
  }

  // Get IRNodes from a scope but not the scope's ancestors
  get_irnodes_ids_nonrecursively_from_a_scope(scope_id : number) : number[] {
    let irnodes_ids : number[] = [];
    if (this.scope2irnodeinfo.has(scope_id)) {
      irnodes_ids = irnodes_ids.concat(
        this.scope2irnodeinfo.get(scope_id)!.map(x => x.id)
      );
    }
    return irnodes_ids;
  }

  // Get IRNodes from a scope and the scope's ancestors
  get_irnodes_ids_recursively_from_a_scope(scope_id : number) : number[] {
    let irnodes_ids : number[] = [];
    while (true) {
      if (this.scope2irnodeinfo.has(scope_id))
        irnodes_ids = irnodes_ids.concat(
          this.scope2irnodeinfo.get(scope_id)!.map(x => x.id)
        );
      if (this.scope_tree.has_parent(scope_id)) {
        scope_id = this.scope_tree.get_parent(scope_id);
      }
      else {
        break;
      }
    }
    return irnodes_ids;
  }

  get_funcdecls_ids_recursively_from_a_scope(scope_id : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(scope_id);
    return irnodes_ids.filter(x => this.funcdecls.has(x));
  }

  get_structdecls_ids_recursively_from_a_scope(scope_id : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(scope_id);
    return irnodes_ids.filter(x => this.structdecls.has(x));
  }

  get_funcdecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let scope_id = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_funcdecls_ids_recursively_from_a_scope(scope_id!);
  }

  get_structdecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let scope_id = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_structdecls_ids_recursively_from_a_scope(scope_id!);
  }
}

export let decl_db = new DeclDB();

class ExprDB {
  public expr2read_variables : Map<number, Set<number>> = new Map<number, Set<number>>();
  public expr2write_variables : Map<number, Set<number>> = new Map<number, Set<number>>();

  private mapping_type_exprs : Set<number> = new Set<number>();
  private mapping_type_expr_to_key_value_pair : Map<number, [number, number]> = new Map<number, [number, number]>();
  private key_expr_to_mapping_expr : Map<number, number> = new Map<number, number>();
  private value_expr_to_mapping_expr : Map<number, number> = new Map<number, number>();

  private array_type_exprs : Set<number> = new Set<number>();
  private array_type_expr_id_to_base_expr_id : Map<number, number> = new Map<number, number>();
  private base_expr_id_to_array_type_expr_id : Map<number, number> = new Map<number, number>();

  //! Mapping-Related

  add_mapping_expr(mapping_expr_id : number, key_id : number, value_id : number) : void {
    this.mapping_type_exprs.add(mapping_expr_id);
    this.mapping_type_expr_to_key_value_pair.set(mapping_expr_id, [key_id, value_id]);
    this.key_expr_to_mapping_expr.set(key_id, mapping_expr_id);
    this.value_expr_to_mapping_expr.set(value_id, mapping_expr_id);
  }

  is_mapping_expr(expr_id : number) : boolean {
    return this.mapping_type_exprs.has(expr_id);
  }

  is_value_expr(expr_id : number) : boolean {
    return this.value_expr_to_mapping_expr.has(expr_id);
  }

  is_key_expr(expr_id : number) : boolean {
    return this.key_expr_to_mapping_expr.has(expr_id);
  }

  kv_of_mapping(mapping_expr_id : number) : [number, number] {
    assert(this.mapping_type_expr_to_key_value_pair.has(mapping_expr_id),
      `The mapping expression ${mapping_expr_id} does not exist.`);
    return this.mapping_type_expr_to_key_value_pair.get(mapping_expr_id)!;
  }

  value_of_mapping(mapping_expr_id : number) : number {
    assert(this.mapping_type_expr_to_key_value_pair.has(mapping_expr_id),
      `The mapping expression ${mapping_expr_id} does not exist.`);
    return this.mapping_type_expr_to_key_value_pair.get(mapping_expr_id)![1];
  }

  key_of_mapping(mapping_expr_id : number) : number {
    assert(this.mapping_type_expr_to_key_value_pair.has(mapping_expr_id),
      `The mapping expression ${mapping_expr_id} does not exist.`);
    return this.mapping_type_expr_to_key_value_pair.get(mapping_expr_id)![0];
  }

  mapping_of_value(value_expr_id : number) : number {
    assert(this.value_expr_to_mapping_expr.has(value_expr_id),
      `The value expression ${value_expr_id} does not exist.`);
    return this.value_expr_to_mapping_expr.get(value_expr_id)!;
  }

  mapping_of_key(key_expr_id : number) : number {
    assert(this.key_expr_to_mapping_expr.has(key_expr_id),
      `The key expression ${key_expr_id} does not exist.`);
    return this.key_expr_to_mapping_expr.get(key_expr_id)!;
  }

  //! Array-Related

  add_array_expr(array_expr_id : number, base_id : number) : void {
    this.array_type_exprs.add(array_expr_id);
    this.array_type_expr_id_to_base_expr_id.set(array_expr_id, base_id);
    this.base_expr_id_to_array_type_expr_id.set(base_id, array_expr_id);
  }

  is_array_expr(expr_id : number) : boolean {
    return this.array_type_exprs.has(expr_id);
  }

  is_base_expr(expr_id : number) : boolean {
    return this.base_expr_id_to_array_type_expr_id.has(expr_id);
  }

  base_of_array(array_expr_id : number) : number {
    assert(this.array_type_expr_id_to_base_expr_id.has(array_expr_id),
      `The array expression ${array_expr_id} does not exist.`);
    return this.array_type_expr_id_to_base_expr_id.get(array_expr_id)!;
  }

  array_of_base(base_expr_id : number) : number {
    assert(this.base_expr_id_to_array_type_expr_id.has(base_expr_id),
      `The base expression ${base_expr_id} does not exist.`);
    return this.base_expr_id_to_array_type_expr_id.get(base_expr_id)!;
  }
}

export let expr_db = new ExprDB();