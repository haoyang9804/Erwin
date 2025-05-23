import { Tree } from './dataStructor';
import { get_scope_from_scope_id, inside_contract, scopeKind, ScopeList } from './scope';
import { assert } from './utility';
import { IRContractDefinition, IRStructDefinition, IRVariableDeclaration } from './declaration';
import { irnodes } from './node';
import * as type from './type';
import { merge_set } from './utility';
import { IRExpressionStatement, IRStatement } from './statement';
import { new_global_id } from './genContext';
import { IRAssignment, IRIdentifier } from './expression';
import { cur_scope } from './genContext';
import { config } from './config';
/**
 * A class to store the declaration information.
 */
class DeclDB {

  private scope_tree : Tree<number> = new Tree();
  private scope2irnode : Map<number, number[]> = new Map<number, number[]>();
  private irnode2scope : Map<number, number> = new Map<number, number>();
  private contractdecl_id_to_scope : Map<number, number> = new Map<number, number>();
  private scope_id_to_contractdecl_id : Map<number, number> = new Map<number, number>();
  private functiondecl_id_to_scope : Map<number, number> = new Map<number, number>();
  private scope_id_to_functiondecl_id : Map<number, number> = new Map<number, number>();
  private constructordecl_id_to_scope : Map<number, number> = new Map<number, number>();
  private scope_id_to_constructordecl_id : Map<number, number> = new Map<number, number>();
  private modifierdecl_id_to_scope : Map<number, number> = new Map<number, number>();
  private scope_id_to_modifierdecl_id : Map<number, number> = new Map<number, number>();

  private vardecls : Set<number> = new Set<number>();
  private structdecls : Set<number> = new Set<number>();
  private funcdecls : Set<number> = new Set<number>();
  private contract_modifierdecls : Map<number, Set<number>> = new Map<number, Set<number>>();
  private struct_instance_decls : Set<number> = new Set<number>();
  private contractdecls : Set<number> = new Set<number>();
  private state_decls : Set<number> = new Set<number>();
  private getter_funcdecls : Set<number> = new Set<number>();
  private eventdecls : Set<number> = new Set<number>();
  private errordecls : Set<number> = new Set<number>();
  private stringdecls : Set<number> = new Set<number>();

  /*
  ! For any struct declaration, different struct instances may have different storage location ranges.
  ! Such ranges may influence the storage location ranges of the members.
  ! To address this issue, Erwin creates a member ghost for each member when constructing a struct
  ! instance from a struct declaration. If the member is of compound type, e.g., struct, array, or mapping,
  ! the member ghost creation will be recursive.
  ! For instance:
  !  struct A {
  !    B b;
  !  }
  !  struct B {
  !    int[] arr;
  !  }
  ! If there is a struct instance of A, named Ains, then Ains's ghost members will be:
  ! Ains.b, Ains.b.arr.
  */
  private ghost_members_of_struct_instance : Map<number, number[]> = new Map<number, number[]>();
  private ghost_member_to_member : Map<number, number> = new Map<number, number>();


  /*
  ! Suppose the context only has a mapping-type variable
  ! mapping(uint => uint) m;
  ! I want to generate an identifier to m[{expr}], where the expr is an identifier since
  ! the expression complexity reaches the upper limit.
  ! Then expr is also m[{expr}], possibly causing an infinite recursion under some hyperparemeter settings.
  ! Therefore, Erwin forbides such resorting to itself to fullfil its hole.
  ! */
  private forbidden_vardecls : Set<number> = new Set<number>();

  private storage_qualified_struct_members_of_struct_instance : Map<number, number[]> = new Map<number, number[]>();

  private getter_function_id_to_state_var_id : Map<number, number> = new Map<number, number>();
  private state_var_id_to_getter_function_id : Map<number, number> = new Map<number, number>();

  private mapping_decls : Set<number> = new Set<number>();
  private mapping_decl_id_to_kv_ids : Map<number, [number, number]> = new Map<number, [number, number]>();
  private value_id_to_mapping_decl_id : Map<number, number> = new Map<number, number>();
  private key_id_to_mapping_decl_id : Map<number, number> = new Map<number, number>();

  private called_function_decls_ids : Set<number> = new Set<number>();

  private array_decl_id : Set<number> = new Set<number>();
  private array_decl_id_to_base_id : Map<number, number> = new Map<number, number>();
  private base_id_to_array_decl_id : Map<number, number> = new Map<number, number>();

  private member2structdecl : Map<number, number> = new Map<number, number>();
  private structdecl2members : Map<number, number[]> = new Map<number, number[]>();
  private struct_instance_to_struct_decl : Map<number, number> = new Map<number, number>();

  private cannot_be_assigned_to : Set<number> = new Set<number>();
  /*
  In Solidity, there exists a workaround to initialize a variable later.
  For instance,
  ```
  function f() public {
    int[] memory arr;
    arr = arr;
  }
  ```
  `arr = arr` is a must.
  `arr` in this example is a variable that must be initialized later.
  */
  private must_be_initialized_later : Map<number, number[]> = new Map<number, number[]>();
  private has_been_initialized : Set<number> = new Set<number>();

  constructor() { }

  init() {
    this.scope_tree.init();
    this.scope2irnode.clear();
    this.irnode2scope.clear();
    this.contractdecl_id_to_scope.clear();
    this.scope_id_to_contractdecl_id.clear();
    this.functiondecl_id_to_scope.clear();
    this.scope_id_to_functiondecl_id.clear();
    this.constructordecl_id_to_scope.clear();
    this.scope_id_to_constructordecl_id.clear();
    this.modifierdecl_id_to_scope.clear();
    this.scope_id_to_modifierdecl_id.clear();

    this.vardecls.clear();
    this.structdecls.clear();
    this.funcdecls.clear();
    this.contract_modifierdecls.clear();
    this.struct_instance_decls.clear();
    this.contractdecls.clear();
    this.state_decls.clear();
    this.getter_funcdecls.clear();
    this.eventdecls.clear();
    this.errordecls.clear();
    this.stringdecls.clear();

    this.ghost_members_of_struct_instance.clear();
    this.ghost_member_to_member.clear();

    this.forbidden_vardecls.clear();

    this.storage_qualified_struct_members_of_struct_instance.clear();

    this.getter_function_id_to_state_var_id.clear();
    this.state_var_id_to_getter_function_id.clear();

    this.mapping_decls.clear();
    this.mapping_decl_id_to_kv_ids.clear();
    this.value_id_to_mapping_decl_id.clear();
    this.key_id_to_mapping_decl_id.clear();

    this.called_function_decls_ids.clear();

    this.array_decl_id.clear();
    this.array_decl_id_to_base_id.clear();
    this.base_id_to_array_decl_id.clear();

    this.member2structdecl.clear();
    this.structdecl2members.clear();
    this.struct_instance_to_struct_decl.clear();

    this.cannot_be_assigned_to.clear();
    this.must_be_initialized_later.clear();
    this.has_been_initialized.clear();
  }

  //! ================ Decl-Related ================

  //* vardecl
  add_vardecl_with_scope(vardecl_id : number, scope : ScopeList) : void {
    if (scope.kind() === scopeKind.CONTRACT) {
      this.add_state_decl(vardecl_id);
    }
    this.add_vardecl(vardecl_id);
    this.insert(vardecl_id, scope.id());
  }

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

  lock_vardecl(vardecl_id : number) : void {
    this.forbidden_vardecls.add(vardecl_id);
  }

  unlock_vardecl(vardecl_id : number) : void {
    this.forbidden_vardecls.delete(vardecl_id);
  }

  is_locked_vardecl(vardecl_id : number) : boolean {
    return this.forbidden_vardecls.has(vardecl_id);
  }

  //* eventdecl
  add_eventdecl(eventdecl_id : number) : void {
    this.eventdecls.add(eventdecl_id);
  }

  remove_eventdecl(eventdecl_id : number) : void {
    this.eventdecls.delete(eventdecl_id);
  }

  is_eventdecl(eventdecl_id : number) : boolean {
    return this.eventdecls.has(eventdecl_id);
  }

  eventdecls_ids() : number[] {
    return Array.from(this.eventdecls);
  }

  //* errordecl
  add_errordecl(errordecl_id : number) : void {
    this.errordecls.add(errordecl_id);
  }

  remove_errordecl(errordecl_id : number) : void {
    this.errordecls.delete(errordecl_id);
  }

  is_errordecl(errordecl_id : number) : boolean {
    return this.errordecls.has(errordecl_id);
  }

  errordecls_ids() : number[] {
    return Array.from(this.errordecls);
  }

  //* stringdecl
  add_stringdecl(stringdecl_id : number) : void {
    this.stringdecls.add(stringdecl_id);
  }

  remove_stringdecl(stringdecl_id : number) : void {
    this.stringdecls.delete(stringdecl_id);
  }

  is_stringdecl(stringdecl_id : number) : boolean {
    return this.stringdecls.has(stringdecl_id);
  }

  stringdecls_ids() : number[] {
    return Array.from(this.stringdecls);
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

  //* modifierdecl
  add_modifierdecl(modifierdecl_id : number, contract_id : number) : void {
    if (this.contract_modifierdecls.has(contract_id)) {
      this.contract_modifierdecls.get(contract_id)!.add(modifierdecl_id);
    }
    else {
      this.contract_modifierdecls.set(contract_id, new Set([modifierdecl_id]));
    }
  }

  modifierdecls_ids(contract_id : number) : number[] {
    if (this.contract_modifierdecls.has(contract_id)) {
      return Array.from(this.contract_modifierdecls.get(contract_id)!);
    }
    return [];
  }

  insert_modifierdecl_with_scope(modifierdecl_id : number, scope : ScopeList) : void {
    assert(scope.kind() === scopeKind.MODIFIER, `The scope ${scope.id()} is not a modifier scope.`);
    this.modifierdecl_id_to_scope.set(modifierdecl_id, scope.id());
    this.scope_id_to_modifierdecl_id.set(scope.id(), modifierdecl_id);
  }

  modifier_scope_of_modifierdecl(modifierdecl_id : number) : number {
    assert(this.modifierdecl_id_to_scope.has(modifierdecl_id), `The modifier declaration ${modifierdecl_id} does not exist.`);
    return this.modifierdecl_id_to_scope.get(modifierdecl_id)!;
  }

  modifierdecl_of_scope(scope : ScopeList) : number {
    assert(this.scope_id_to_modifierdecl_id.has(scope.id()), `The scope ${scope.id()} does not exist.`);
    return this.scope_id_to_modifierdecl_id.get(scope.id())!;
  }

  //* constructordecl
  insert_constructordecl_with_scope(constructordecl_id : number, scope : ScopeList) : void {
    assert(scope.kind() === scopeKind.CONSTRUCTOR, `The scope ${scope.id()} is not a constructor scope.`);
    this.constructordecl_id_to_scope.set(constructordecl_id, scope.id());
    this.scope_id_to_constructordecl_id.set(scope.id(), constructordecl_id);
  }

  constructor_scope_of_constructordecl(constructordecl_id : number) : number {
    assert(this.constructordecl_id_to_scope.has(constructordecl_id), `The constructor declaration ${constructordecl_id} does not exist.`);
    return this.constructordecl_id_to_scope.get(constructordecl_id)!;
  }

  constructordecl_of_scope(scope : ScopeList) : number {
    assert(this.scope_id_to_constructordecl_id.has(scope.id()), `The scope ${scope.id()} does not exist.`);
    return this.scope_id_to_constructordecl_id.get(scope.id())!;
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

  insert_function_decl_with_scope(funcdecl_id : number, scope : ScopeList) : void {
    assert(scope.kind() === scopeKind.FUNC, `The scope ${scope.id()} is not a function scope.`);
    this.functiondecl_id_to_scope.set(funcdecl_id, scope.id());
    this.scope_id_to_functiondecl_id.set(scope.id(), funcdecl_id);
  }

  func_scope_of_funcdecl(funcdecl_id : number) : number {
    assert(this.functiondecl_id_to_scope.has(funcdecl_id), `The function declaration ${funcdecl_id} does not exist.`);
    return this.functiondecl_id_to_scope.get(funcdecl_id)!;
  }

  funcdecl_of_scope(scope : ScopeList) : number {
    assert(this.scope_id_to_functiondecl_id.has(scope.id()), `The scope ${scope.id()} does not exist.`);
    return this.scope_id_to_functiondecl_id.get(scope.id())!;
  }

  //* struct instance
  add_struct_instance_decl(struct_instance_id : number) : void {
    this.struct_instance_decls.add(struct_instance_id);
  }

  remove_struct_instance_decl(struct_instance_id : number) : void {
    this.struct_instance_decls.delete(struct_instance_id);
  }

  is_struct_instance_decl(struct_instance_id : number) : boolean {
    return this.struct_instance_decls.has(struct_instance_id);
  }

  pair_struct_instance_with_struct_decl(struct_instance_id : number, struct_decl_id : number) : void {
    this.struct_instance_to_struct_decl.set(struct_instance_id, struct_decl_id);
  }

  struct_instance_has_paired_struct_decl(struct_instance_id : number) : boolean {
    return this.struct_instance_to_struct_decl.has(struct_instance_id);
  }

  struct_decl_of_struct_instance(struct_instance_id : number) : number {
    assert(this.struct_instance_to_struct_decl.has(struct_instance_id),
      `The struct instance ${struct_instance_id} does not exist.`);
    return this.struct_instance_to_struct_decl.get(struct_instance_id)!;
  }

  members_of_struct_instance(struct_instance_id : number) : number[] {
    assert(this.struct_instance_decls.has(struct_instance_id),
      `The struct instance ${struct_instance_id} does not exist.`);
    return this.members_of_struct_decl(this.struct_decl_of_struct_instance(struct_instance_id))!;
  }

  pair_storage_qualified_ghost_members_with_struct_instance(struct_instance_id : number, member_id : number) : void {
    if (this.storage_qualified_struct_members_of_struct_instance.has(struct_instance_id)) {
      this.storage_qualified_struct_members_of_struct_instance.get(struct_instance_id)!.push(member_id);
    }
    else {
      this.storage_qualified_struct_members_of_struct_instance.set(struct_instance_id, [member_id]);
    }
  }

  get_storage_qualified_ghost_members_from_struct_instance(struct_instance_id : number) : number[] {
    assert(this.struct_instance_decls.has(struct_instance_id),
      `Node ${struct_instance_id} is not a struct instance.`);
    assert(this.storage_qualified_struct_members_of_struct_instance.has(struct_instance_id),
      `Struct instance ${struct_instance_id} does not exist in storage_qualified_struct_members_of_struct_instance.`);
    return this.storage_qualified_struct_members_of_struct_instance.get(struct_instance_id)!;
  }

  update_ghost_members_of_struct_instance(struct_instance_id : number,
    member_id : number, ghost_member_id : number) : void {
    if (this.ghost_members_of_struct_instance.has(struct_instance_id)) {
      this.ghost_members_of_struct_instance.get(struct_instance_id)!.push(ghost_member_id);
    }
    else {
      this.ghost_members_of_struct_instance.set(struct_instance_id, [ghost_member_id]);
    }
    this.ghost_member_to_member.set(ghost_member_id, member_id);
  }

  ghost_member_of_member_inside_struct_instance(member_id : number, struct_instance_id : number) : number {
    assert(this.ghost_members_of_struct_instance.has(struct_instance_id),
      `Struct instance ${struct_instance_id} does not exist in ghost_members_of_struct_instance.`);
    const ghost_members = this.ghost_members_of_struct_instance.get(struct_instance_id);
    for (const ghost_member of ghost_members!) {
      if (this.ghost_member_to_member.get(ghost_member) === member_id) {
        return ghost_member;
      }
    }
    throw new Error(`The member ${member_id} does not have a ghost member in struct instance ${struct_instance_id}.
                     ghost_members: ${ghost_members}`);
  }

  is_ghost_member(ghost_member_id : number) : boolean {
    return this.ghost_member_to_member.has(ghost_member_id);
  }

  //* contractdecl
  pair_contractdecl_to_scope(fid : number, contractdecl_id : number) : void {
    this.scope_id_to_contractdecl_id.set(fid, contractdecl_id);
  }

  get_contractdecl_by_scope(fid : number) : number | undefined {
    if (!this.scope_id_to_contractdecl_id.has(fid)) {
      return undefined;
    }
    return this.scope_id_to_contractdecl_id.get(fid)!;
  }

  get_current_contractdecl_id(scope : ScopeList) : number | undefined {
    if (scope.kind() === scopeKind.GLOBAL) {
      return undefined;
    }
    while (scope.kind() !== scopeKind.CONTRACT && scope.pre().kind() !== scopeKind.GLOBAL) {
      scope = scope.pre();
    }
    if (scope.kind() === scopeKind.CONTRACT) {
      assert(scope.pre().kind() === scopeKind.GLOBAL,
        `contract scope's previous scope is not global scope, but is ${scope.pre().kind()}`);
      return this.get_contractdecl_by_scope(scope.id());
    }
    return undefined;
  }

  insert_yin_contract(fid : number, contractdecl_id : number) : void {
    if (config.target === "solang") {
      return;
    }
    this.contractdecls.add(-contractdecl_id);
    this.contractdecl_id_to_scope.set(-contractdecl_id, fid);
  }

  insert_yang_contract(fid : number, contractdecl_id : number) : void {
    this.contractdecls.add(contractdecl_id);
    this.contractdecl_id_to_scope.set(contractdecl_id, fid);
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

  //* state_decl
  add_state_decl(vardecl_id : number) : void {
    this.state_decls.add(vardecl_id);
  }

  remove_state_decl(vardecl_id : number) : void {
    this.state_decls.delete(vardecl_id);
  }

  is_state_decl(vardecl_id : number) : boolean {
    return this.state_decls.has(vardecl_id);
  }

  state_decls_ids() : number[] {
    return Array.from(this.state_decls);
  }

  state_decl_size() : number {
    return this.state_decls.size;
  }

  //* struct decl
  find_structdecl_by_name(name : string) : IRStructDefinition | undefined {
    let struct_name = name.includes(".") ? name.split(".")[1] : name;
    const struct_decl = Array.from(this.structdecls).find(x => (irnodes.get(x)! as IRStructDefinition).name === struct_name);
    return struct_decl === undefined ? undefined : irnodes.get(struct_decl)! as IRStructDefinition;
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

  //* getter function
  add_getter_function(funcdecl_id : number, var_decl_id : number) : void {
    this.getter_funcdecls.add(funcdecl_id);
    this.getter_function_id_to_state_var_id.set(funcdecl_id, var_decl_id);
    this.state_var_id_to_getter_function_id.set(var_decl_id, funcdecl_id);
  }

  state_var_of_getter_function(funcdecl_id : number) : number {
    assert(this.getter_function_id_to_state_var_id.has(funcdecl_id), `The getter function ${funcdecl_id} does not exist.`);
    return this.getter_function_id_to_state_var_id.get(funcdecl_id)!;
  }

  getter_function_of_state_var(vardecl_id : number) : number {
    assert(this.state_var_id_to_getter_function_id.has(vardecl_id), `The state variable ${vardecl_id} does not exist.`);
    return this.state_var_id_to_getter_function_id.get(vardecl_id)!;
  }

  has_getter_function(vardecl_id : number) : boolean {
    return this.state_var_id_to_getter_function_id.has(vardecl_id);
  }

  is_getter_function(funcdecl_id : number) : boolean {
    return this.getter_funcdecls.has(funcdecl_id);
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
    this.base_id_to_array_decl_id.delete(this.base_of_array(array_decl_id));
  }

  base_of_array(array_decl_id : number) : number {
    return this.array_decl_id_to_base_id.get(array_decl_id)!;
  }

  array_decls_ids() : number[] {
    return Array.from(this.array_decl_id);
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
    this.value_id_to_mapping_decl_id.delete(this.value_of_mapping(mapping_decl_id));
    this.key_id_to_mapping_decl_id.delete(this.key_of_mapping(mapping_decl_id));
  }

  kvpair_of_mapping(mapping_decl_id : number) : [number, number] {
    assert(this.mapping_decl_id_to_kv_ids.has(mapping_decl_id), `The mapping declaration ${mapping_decl_id} does not exist.`);
    return this.mapping_decl_id_to_kv_ids.get(mapping_decl_id)!;
  }

  key_of_mapping(mapping_decl_id : number) : number {
    return this.kvpair_of_mapping(mapping_decl_id)[0];
  }

  value_of_mapping(mapping_decl_id : number) : number {
    return this.kvpair_of_mapping(mapping_decl_id)[1];
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

  set_vardecl_as_must_be_initialized_later(fid : number, vardecl_id : number) : void {
    if (this.must_be_initialized_later.has(fid)) {
      this.must_be_initialized_later.get(fid)!.push(vardecl_id);
    }
    else {
      this.must_be_initialized_later.set(fid, [vardecl_id]);
    }
  }

  remove_vardecl_from_must_be_initialized_later_in_scope(fid : number) : void {
    this.must_be_initialized_later.delete(fid);
  }

  remove_vardecl_from_must_be_initialized_later(fid : number, vardecl_id : number) : void {
    if (this.must_be_initialized_later.has(fid)) {
      this.must_be_initialized_later.set(fid, this.must_be_initialized_later.get(fid)!.filter(x => x !== vardecl_id));
    }
  }

  scope_has_vardecls_that_must_be_initialized_later(fid : number) : boolean {
    return this.must_be_initialized_later.has(fid);
  }

  get_vardecls_that_must_be_initialized_later(fid : number) : number[] {
    if (!this.must_be_initialized_later.has(fid)) {
      return [];
    }
    return this.must_be_initialized_later.get(fid)!;
  }

  set_vardecl_as_initialized(vardecl_id : number) : void {
    this.has_been_initialized.add(vardecl_id);
  }

  is_vardecl_initialized(vardecl_id : number) : boolean {
    return this.has_been_initialized.has(vardecl_id);
  }

  qualifed_by_storage_qualifier(id : number) : boolean {
    return this.is_mapping_decl(id) ||
      this.is_array_decl(id) ||
      this.is_struct_instance_decl(id) ||
      expr_db.is_new_struct_expr(id) ||
      this.is_stringdecl(id) ||
      expr_db.is_string_expr(id) ||
      expr_db.is_new_dynamic_array_expr(id);
  }

  contains_mapping_decl(id : number) : boolean {
    if (this.is_structdecl(id)) {
      return this.structdecl2members.get(id)!.some(x => this.contains_mapping_decl(x));
    }
    if (this.is_array_decl(id)) {
      return this.contains_mapping_decl(this.base_of_array(id));
    }
    if (this.is_mapping_decl(id)) {
      return true;
    }
    if (this.is_struct_instance_decl(id)) {
      return this.contains_mapping_decl(this.struct_decl_of_struct_instance(id));
    }
    return false;
  }

  //! ================ Scope-Related ================
  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }

  insert(node_id : number, fid : number) : void {
    if (this.scope2irnode.has(fid)) {
      this.scope2irnode.get(fid)!.push(node_id);
    }
    else {
      this.scope2irnode.set(fid, [node_id]);
    }
    this.irnode2scope.set(node_id, fid);
  }

  scope_of_irnode(node_id : number) : number {
    assert(this.irnode2scope.has(node_id), `The node ${node_id} does not exist.`);
    return this.irnode2scope.get(node_id)!;
  }

  remove(node_id : number, fid : number) : void {
    if (this.scope2irnode.has(fid)) {
      this.scope2irnode.set(fid, this.scope2irnode.get(fid)!.filter(x => x !== node_id));
    }
    else {
      throw new Error(`The scope ${fid} does not exist.`);
    }
  }

  // Get IRNodes from a scope but not the scope's ancestors
  get_irnodes_ids_nonrecursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids : number[] = [];
    if (this.scope2irnode.has(fid)) {
      irnodes_ids = irnodes_ids.concat(
        this.scope2irnode.get(fid)!
      );
    }
    return irnodes_ids;
  }

  // Get IRNodes from a scope and the scope's ancestors
  get_irnodes_ids_recursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids : number[] = [];
    while (true) {
      if (this.scope2irnode.has(fid)) {
        irnodes_ids = irnodes_ids.concat(
          this.scope2irnode.get(fid)!
        );
      }
      const scope = get_scope_from_scope_id(fid);
      if (scope.kind() === scopeKind.FUNC) {
        const function_scope = scope.pre();
        const function_parameter_scope = function_scope.nexts().find(x => x.kind() === scopeKind.FUNC_PARAMETER);
        const function_return_scope = function_scope.nexts().find(x => x.kind() === scopeKind.FUNC_RETURNS);
        if (function_parameter_scope) {
          irnodes_ids = irnodes_ids.concat(this.get_irnodes_ids_nonrecursively_from_a_scope(function_parameter_scope.id()));
        }
        if (function_return_scope) {
          irnodes_ids = irnodes_ids.concat(this.get_irnodes_ids_nonrecursively_from_a_scope(function_return_scope.id()));
        }
      }
      if (scope.kind() === scopeKind.CONSTRUCTOR) {
        const constructor_scope = scope.pre();
        const constructor_parameter_scope = constructor_scope.nexts().find(x => x.kind() === scopeKind.CONSTRUCTOR_PARAMETERS);
        if (constructor_parameter_scope) {
          irnodes_ids = irnodes_ids.concat(this.get_irnodes_ids_nonrecursively_from_a_scope(constructor_parameter_scope.id()));
        }
      }
      if (scope.kind() === scopeKind.MODIFIER_INVOKER) {
        const func_constructor_scope = scope.pre();
        const parameter_scope = func_constructor_scope.nexts().find(x => x.kind() === scopeKind.FUNC_PARAMETER) || func_constructor_scope.nexts().find(x => x.kind() === scopeKind.CONSTRUCTOR_PARAMETERS);
        const returns_scope = func_constructor_scope.nexts().find(x => x.kind() === scopeKind.FUNC_RETURNS);
        if (parameter_scope) {
          irnodes_ids = irnodes_ids.concat(this.get_irnodes_ids_nonrecursively_from_a_scope(parameter_scope.id()));
        }
        if (returns_scope) {
          irnodes_ids = irnodes_ids.concat(this.get_irnodes_ids_nonrecursively_from_a_scope(returns_scope.id()));
        }
      }
      if (this.scope_tree.has_parent(fid)) {
        fid = this.scope_tree.get_parent(fid);
      }
      else {
        break;
      }
    }
    return irnodes_ids;
  }

  get_funcdecls_ids_recursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(fid);
    return irnodes_ids.filter(x => this.funcdecls.has(x));
  }

  get_structdecls_ids_recursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(fid);
    return irnodes_ids.filter(x => this.structdecls.has(x));
  }

  get_eventdecls_ids_recursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(fid);
    return irnodes_ids.filter(x => this.eventdecls.has(x));
  }

  get_errordecls_ids_recursively_from_a_scope(fid : number) : number[] {
    let irnodes_ids = this.get_irnodes_ids_recursively_from_a_scope(fid);
    return irnodes_ids.filter(x => this.errordecls.has(x));
  }

  get_funcdecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let fid = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_funcdecls_ids_recursively_from_a_scope(fid!);
  }

  get_structdecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let fid = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_structdecls_ids_recursively_from_a_scope(fid!);
  }

  get_eventdecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let fid = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_eventdecls_ids_recursively_from_a_scope(fid!);
  }

  get_errordecls_ids_recursively_from_a_contract(contract_id : number) : number[] {
    let fid = this.contractdecl_id_to_scope.get(contract_id);
    return this.get_errordecls_ids_recursively_from_a_scope(fid!);
  }

}

/**
 * A class to store the information of expressions.
 */
class ExprDB {
  private expr2read_variables : Map<number, Set<number>> = new Map<number, Set<number>>();
  private expr2write_variables : Map<number, Set<number>> = new Map<number, Set<number>>();

  private literals : Set<number> = new Set<number>();

  private mapping_type_exprs : Set<number> = new Set<number>();
  private mapping_type_expr_to_key_value_pair : Map<number, [number, number]> = new Map<number, [number, number]>();
  private key_expr_to_mapping_expr : Map<number, number> = new Map<number, number>();
  private value_expr_to_mapping_expr : Map<number, number> = new Map<number, number>();

  private array_type_exprs : Set<number> = new Set<number>();
  private array_type_expr_id_to_base_expr_id : Map<number, number> = new Map<number, number>();
  private base_expr_id_to_array_type_expr_id : Map<number, number> = new Map<number, number>();

  private new_struct_exprs : Set<number> = new Set<number>();
  private new_struct_to_struct_decl : Map<number, number> = new Map<number, number>();
  private ghost_members_of_new_struct_expr : Map<number, number[]> = new Map<number, number[]>();
  private ghost_member_to_member : Map<number, number> = new Map<number, number>();

  private string_exprs : Set<number> = new Set<number>();

  private new_dynamic_array_exprs : Set<number> = new Set<number>();

  // Records new-contract expressions in function / constructor / modifier declaration.
  private new_contract_exprs : Map<number, Set<number>> = new Map<number, Set<number>>();

  init() {
    this.expr2read_variables.clear();
    this.expr2write_variables.clear();

    this.literals.clear();

    this.mapping_type_exprs.clear();
    this.mapping_type_expr_to_key_value_pair.clear();
    this.key_expr_to_mapping_expr.clear();
    this.value_expr_to_mapping_expr.clear();

    this.array_type_exprs.clear();
    this.array_type_expr_id_to_base_expr_id.clear();
    this.base_expr_id_to_array_type_expr_id.clear();

    this.new_struct_exprs.clear();
    this.new_struct_to_struct_decl.clear();
    this.ghost_members_of_new_struct_expr.clear();
    this.ghost_member_to_member.clear();

    this.string_exprs.clear();

    this.new_dynamic_array_exprs.clear();

    this.new_contract_exprs.clear();
  }

  //! new dynamic array expr
  add_new_dynamic_array_expr(expr_id : number) : void {
    this.new_dynamic_array_exprs.add(expr_id);
  }

  is_new_dynamic_array_expr(expr_id : number) : boolean {
    return this.new_dynamic_array_exprs.has(expr_id);
  }

  remove_new_dynamic_array_expr(expr_id : number) : void {
    this.new_dynamic_array_exprs.delete(expr_id);
  }

  new_dynamic_array_exprs_ids() : number[] {
    return Array.from(this.new_dynamic_array_exprs);
  }

  //! new contract expr
  add_new_contract_expr(expr_id : number, fid : number) : void {
    if (this.new_contract_exprs.has(fid)) {
      this.new_contract_exprs.get(fid)!.add(expr_id);
    }
    else {
      this.new_contract_exprs.set(fid, new Set([expr_id]));
    }
  }

  is_new_contract_expr(expr_id : number) : boolean {
    return Array.from(this.new_contract_exprs.values()).some(x => x.has(expr_id));
  }

  has_new_contract_exprs(fid : number) : boolean {
    return this.new_contract_exprs.has(fid);
  }

  //! Read-Write-Related

  expr_reads_variable(expr_id : number, var_id : number | number[] | Set<number>) : void {
    if (var_id instanceof Set) {
      if (this.expr2read_variables.has(expr_id)) {
        this.expr2read_variables.set(expr_id,
          merge_set(this.expr2read_variables.get(expr_id)!, var_id)
        )
      }
      else {
        this.expr2read_variables.set(expr_id, var_id);
      }
    }
    else if (Array.isArray(var_id)) {
      for (const id of var_id) {
        if (this.expr2read_variables.has(expr_id)) {
          this.expr2read_variables.get(expr_id)!.add(id);
        }
        else {
          this.expr2read_variables.set(expr_id, new Set<number>([id]));
        }
      }
    }
    else {
      if (this.expr2read_variables.has(expr_id)) {
        this.expr2read_variables.get(expr_id)!.add(var_id);
      }
      else {
        this.expr2read_variables.set(expr_id, new Set<number>([var_id]));
      }
    }
  }

  transfer_read_variables(expr_id : number, from_expr_id : number) : void {
    this.expr_reads_variable(expr_id, this.read_variables_of_expr(from_expr_id));
  }

  expr_writes_variable(expr_id : number, var_id : number | number[] | Set<number>) : void {
    if (var_id instanceof Set) {
      if (this.expr2write_variables.has(expr_id)) {
        this.expr2write_variables.set(expr_id,
          merge_set(this.expr2write_variables.get(expr_id)!, var_id)
        )
      }
      else {
        this.expr2write_variables.set(expr_id, var_id);
      }
    }
    else if (Array.isArray(var_id)) {
      for (const id of var_id) {
        if (this.expr2write_variables.has(expr_id)) {
          this.expr2write_variables.get(expr_id)!.add(id);
        }
        else {
          this.expr2write_variables.set(expr_id, new Set<number>([id]));
        }
      }
    }
    else {
      if (this.expr2write_variables.has(expr_id)) {
        this.expr2write_variables.get(expr_id)!.add(var_id);
      }
      else {
        this.expr2write_variables.set(expr_id, new Set<number>([var_id]));
      }
    }
  }

  transfer_write_variables(expr_id : number, from_expr_id : number) : void {
    this.expr_writes_variable(expr_id, this.write_variables_of_expr(from_expr_id));
  }

  read_variables_of_expr(expr_id : number) : number[] {
    if (!this.expr2read_variables.has(expr_id)) {
      return [];
    }
    return Array.from(this.expr2read_variables.get(expr_id)!);
  }

  write_variables_of_expr(expr_id : number) : number[] {
    if (!this.expr2write_variables.has(expr_id)) {
      return [];
    }
    return Array.from(this.expr2write_variables.get(expr_id)!);
  }

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

  //! Struct-Related
  add_new_struct_expr(expr_id : number) : void {
    this.new_struct_exprs.add(expr_id);
  }

  is_new_struct_expr(expr_id : number) : boolean {
    return this.new_struct_exprs.has(expr_id);
  }

  remove_new_struct_expr(expr_id : number) : void {
    this.new_struct_exprs.delete(expr_id);
  }

  new_struct_exprs_ids() : number[] {
    return Array.from(this.new_struct_exprs);
  }

  pair_new_struct_expr_with_struct_decl(newstruct_id : number, struct_decl_id : number) : void {
    this.new_struct_to_struct_decl.set(newstruct_id, struct_decl_id);
  }

  struct_decl_of_new_struct_expr(newstruct_id : number) : number {
    assert(this.new_struct_to_struct_decl.has(newstruct_id),
      `The new struct expr ${newstruct_id} does not exist.`);
    return this.new_struct_to_struct_decl.get(newstruct_id)!;
  }

  members_of_new_struct_expr(newstruct_id : number) : number[] {
    assert(this.new_struct_to_struct_decl.has(newstruct_id),
      `The new struct expr ${newstruct_id} does not exist.`);
    return decl_db.members_of_struct_decl(this.struct_decl_of_new_struct_expr(newstruct_id))!;
  }

  update_ghost_members_of_new_struct_expr(newstruct_id : number,
    member_id : number, ghost_member_id : number) : void {
    if (this.ghost_members_of_new_struct_expr.has(newstruct_id)) {
      this.ghost_members_of_new_struct_expr.get(newstruct_id)!.push(ghost_member_id);
    }
    else {
      this.ghost_members_of_new_struct_expr.set(newstruct_id, [ghost_member_id]);
    }
    this.ghost_member_to_member.set(ghost_member_id, member_id);
  }

  is_ghost_member(ghost_member_id : number) : boolean {
    return this.ghost_member_to_member.has(ghost_member_id);
  }

  ghost_member_of_member_inside_new_struct_expr(member_id : number, newstruct_id : number) : number {
    assert(this.ghost_members_of_new_struct_expr.has(newstruct_id),
      `The new struct expr ${newstruct_id} does not exist.`);
    const ghost_members = this.ghost_members_of_new_struct_expr.get(newstruct_id);
    for (const ghost_member of ghost_members!) {
      if (this.ghost_member_to_member.get(ghost_member) === member_id) {
        return ghost_member;
      }
    }
    throw new Error(`The member ${member_id} does not have a ghost member in new struct expr ${newstruct_id}.
                     ghost_members: ${ghost_members}`);
  }

  //! String-Related

  add_string_expr(expr_id : number) : void {
    this.string_exprs.add(expr_id);
  }

  is_string_expr(expr_id : number) : boolean {
    return this.string_exprs.has(expr_id);
  }

  remove_string_expr(expr_id : number) : void {
    this.string_exprs.delete(expr_id);
  }

  string_exprs_ids() : number[] {
    return Array.from(this.string_exprs);
  }

  //! Literal-Related

  add_literal(expr_id : number) : void {
    this.literals.add(expr_id);
  }

  is_literal(expr_id : number) : boolean {
    return this.literals.has(expr_id);
  }

  literals_ids() : number[] {
    return Array.from(this.literals);
  }

  remove_literal(expr_id : number) : void {
    this.literals.delete(expr_id);
  }
}

export enum IDENTIFIER {
  CONTRACT,
  FUNC,
  STRUCT,
  VAR,
  CONTRACT_INSTANCE,
  STRUCT_INSTANCE,
  MAPPING,
  ARRAY,
  EVENT,
  ERROR,
  MODIFIER,
};

/**
 * The class that stores all the names.
 */
class NameDB {
  private name_id : number = 0;

  init() {
    this.name_id = 0;
  }

  //TODO: support name shallowing.
  public generate_name(identifier : IDENTIFIER) : string {
    switch (identifier) {
      case IDENTIFIER.CONTRACT:
        return `contract${this.name_id++}`;
      case IDENTIFIER.MAPPING:
        return `mapping${this.name_id++}`;
      case IDENTIFIER.ARRAY:
        return `array${this.name_id++}`;
      case IDENTIFIER.VAR:
        return `var${this.name_id++}`;
      case IDENTIFIER.CONTRACT_INSTANCE:
        return `contract_instance${this.name_id++}`;
      case IDENTIFIER.STRUCT_INSTANCE:
        return `struct_instance${this.name_id++}`;
      case IDENTIFIER.STRUCT:
        return `struct${this.name_id++}`;
      case IDENTIFIER.FUNC:
        return `func${this.name_id++}`;
      case IDENTIFIER.EVENT:
        return `event${this.name_id++}`;
      case IDENTIFIER.ERROR:
        return `error${this.name_id++}`;
      case IDENTIFIER.MODIFIER:
        return `modifier${this.name_id++}`;
      default:
        throw new Error(`generate_name: identifier ${identifier} is not supported`);
    }
  }
}

/**
 * The class that stores all the statements.
 */
class StmtDB {
  // Record the statements that are not expected to be generated before the current statement.
  private unexpected_extra_stmt : Map<number, IRStatement[]> = new Map<number, IRStatement[]>();

  init() {
    this.unexpected_extra_stmt.clear();
  }

  private initialize_variable(vardecl_id : number) {
    assert(irnodes.has(vardecl_id), `initialize_variable: id ${vardecl_id} is not in irnodes`);
    assert(irnodes.get(vardecl_id) instanceof IRVariableDeclaration,
      `initialize_variable: id ${vardecl_id} is not an instance of IRVariableDeclaration`);
    const vardecl = irnodes.get(vardecl_id) as IRVariableDeclaration;
    const assignment = new IRAssignment(new_global_id(), cur_scope.id(),
      new IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id),
      new IRIdentifier(new_global_id(), cur_scope.id(), vardecl.name, vardecl.id), '=');
    const assignment_stmt = new IRExpressionStatement(new_global_id(), cur_scope.id(), assignment);
    expr_db.expr_reads_variable(assignment.id, vardecl.id);
    expr_db.expr_writes_variable(assignment.id, vardecl.id);
    (assignment_stmt as IRStatement).exprs.push(assignment);
    return assignment_stmt;
  }

  public initialize_the_vardecls_that_must_be_initialized_later(fid : number) : void {
    for (const id of decl_db.get_vardecls_that_must_be_initialized_later(fid)!) {
      if (decl_db.is_vardecl_initialized(id)) {
        continue;
      }
      this.add_unexpected_extra_stmt(fid, this.initialize_variable(id));
      decl_db.set_vardecl_as_initialized(id);
    }
    decl_db.remove_vardecl_from_must_be_initialized_later_in_scope(fid);
  }

  public add_unexpected_extra_stmt(fid : number, stmt : IRStatement) : void {
    if (this.unexpected_extra_stmt.has(fid)) {
      this.unexpected_extra_stmt.get(fid)!.push(stmt);
    }
    else {
      this.unexpected_extra_stmt.set(fid, [stmt]);
    }
  }

  public unexpected_extra_stmts_of_scope(fid : number) : IRStatement[] {
    if (!this.unexpected_extra_stmt.has(fid)) {
      return [];
    }
    return this.unexpected_extra_stmt.get(fid)!;
  }

  public remove_unexpected_extra_stmt_from_scope(fid : number) : void {
    this.unexpected_extra_stmt.delete(fid);
  }

  public has_unexpected_extra_stmt(fid : number) : boolean {
    return this.unexpected_extra_stmt.has(fid);
  }
}

/**
 * The class that stores all the types.
 */
class TypeDB {
  private all_types : type.Type[] = [];
  private contract_types : Map<number, type.ContractType> = new Map<number, type.ContractType>();
  private internal_struct_types = new Set<type.StructType>();
  private internal_struct_type_to_external_struct_type = new Map<type.StructType, type.StructType>();
  private user_defined_types : type.UserDefinedType[] = [];

  public init() : void {
    this.all_types = [...type.elementary_types];
    if (config.string_type_prob > 0) {
      this.all_types.push(type.TypeProvider.string());
    }
    if (config.array_type_prob > 0) {
      this.all_types.push(type.TypeProvider.trivial_array());
    }
    if (config.mapping_type_prob > 0) {
      this.all_types.push(type.TypeProvider.trivial_mapping());
    }
    this.contract_types.clear();
    this.internal_struct_types.clear();
    this.internal_struct_type_to_external_struct_type.clear();
    this.user_defined_types = [];
  }

  public remove_internal_struct_types() : void {
    const all_types_set = new Set([...this.all_types]);
    const user_defined_types_set = new Set([...this.user_defined_types]);
    this.internal_struct_types.forEach((t) => {
      all_types_set.delete(t)
      user_defined_types_set.delete(t);
    });
    this.all_types = [...all_types_set];
    this.user_defined_types = [...user_defined_types_set];
    this.internal_struct_types.clear();
  }

  public types() : type.Type[] {
    return [...this.all_types];
  }

  public update_types(types : type.Type[]) : void {
    this.all_types = types;
  }

  public add_type(t : type.Type) : void {
    this.all_types.push(t);
  }

  public add_contract_type(contract_id : number, t : type.ContractType) : void {
    this.add_type(t);
    this.contract_types.set(contract_id, t);
    this.add_user_defined_type(t);
  }

  public contract_type_of(contract_id : number) : type.ContractType {
    return this.contract_types.get(contract_id)!;
  }

  public add_internal_struct_type(t : type.StructType) : void {
    this.internal_struct_types.add(t);
  }

  public is_internal_struct_type(t : type.StructType) : boolean {
    return this.internal_struct_types.has(t);
  }

  public add_external_struct_type(internal : type.StructType, external : type.StructType) : void {
    this.internal_struct_type_to_external_struct_type.set(internal, external);
  }

  public add_user_defined_type(t : type.UserDefinedType) : void {
    this.user_defined_types.push(t);
  }

  public userdefined_types() : type.UserDefinedType[] {
    return [...this.user_defined_types];
  }

  public get_struct_type(struct_decl_id : number) : type.UserDefinedType[] {
    return this.userdefined_types().filter(t => t.typeName === "StructType" &&
      (t as type.StructType).referece_id === struct_decl_id);
  }

  public add_struct_type(struct_type : type.StructType, scope : ScopeList) : void {
    if (config.struct_type_prob == 0) {
      return;
    }
    this.add_type(struct_type);
    this.add_user_defined_type(struct_type);
    if (inside_contract(scope)) {
      this.add_internal_struct_type(struct_type);
      const cur_contract_id = decl_db.get_current_contractdecl_id(scope);
      assert(cur_contract_id !== undefined, `The current scope ${scope.id()} is not inside a contract.`);
      const cur_contract_name = (irnodes.get(cur_contract_id!) as IRContractDefinition).name;
      const external_struct_name = cur_contract_name + "." + struct_type.name;
      const external_struct_type = new type.StructType(struct_type.referece_id, external_struct_name, `struct ${cur_contract_name}.${struct_type.name}`);
      external_struct_type.add_sub(struct_type);
      external_struct_type.add_super(struct_type);
      struct_type.add_sub(external_struct_type);
      struct_type.add_super(external_struct_type);
      this.add_external_struct_type(struct_type, external_struct_type);
      this.add_type(external_struct_type);
      this.add_user_defined_type(external_struct_type);
    }
  }

  has_type(t : type.Type) : boolean {
    return this.all_types.some(x => x.same(t));
  }
}

export const decl_db = new DeclDB();
export const expr_db = new ExprDB();
export const stmt_db = new StmtDB();
export const name_db = new NameDB();
export const type_db = new TypeDB();


/**
 * Struct declarations may contain declarations that are qualified by storage locations (e.g., memory, storage, calldata).
 * When creating a struct instance of this kind, we have to assign a storage location to the instance and vicariously to its members.
 * Therefore, two identifiers of the same member of a struct declaration may have different storage locations.
 * In this case, we cannot easily say the identifier's storage location restrains the member's storage location.
 * We need to create a ghost member of the member inside the struct instance to represent the member's storage location
 * in this case and let the identifier's storage location restrain the ghost member's storage location.
 * 
 * @param member_id The ID of the member of a struct declaration
 * @param struct_instantiation_id The ID of the struct instantiation, e.g., a new-struct expression, or an identifier of a struct instance declaration
 * @returns The ghost member ID of the member inside the struct instantiation
 */
export function ghost_member_of_member_inside_struct_instantiation(member_id : number, struct_instantiation_id : number) : number {
  if (decl_db.is_struct_instance_decl(struct_instantiation_id)) {
    return decl_db.ghost_member_of_member_inside_struct_instance(member_id, struct_instantiation_id);
  }
  else if (expr_db.is_new_struct_expr(struct_instantiation_id)) {
    return expr_db.ghost_member_of_member_inside_new_struct_expr(member_id, struct_instantiation_id);
  }
  else {
    throw new Error(`The struct instantiation ${struct_instantiation_id} is not a struct instance declaration or a new struct expression.`);
  }
}

/**
 * 
 * @param struct_instantiation_id The ID of the struct instantiation, e.g., a new-struct expression, or an identifier of a struct instance declaration
 * @param member_id The ID of the member of a struct declaration
 * @param ghost_member_id The ghost member ID of the member inside the struct instantiation
 */

export function update_ghost_members_of_struct_instantiation(struct_instantiation_id : number, member_id : number, ghost_member_id : number) {
  if (decl_db.is_struct_instance_decl(struct_instantiation_id)) {
    decl_db.update_ghost_members_of_struct_instance(struct_instantiation_id, member_id, ghost_member_id);
  }
  else if (expr_db.is_new_struct_expr(struct_instantiation_id)) {
    expr_db.update_ghost_members_of_new_struct_expr(struct_instantiation_id, member_id, ghost_member_id);
  }
  else {
    throw new Error(`The struct instantiation ${struct_instantiation_id} is not a struct instance declaration or a new struct expression.`);
  }
}

/**
 * Initialize all databases.
 */
export function init() {
  decl_db.init();
  expr_db.init();
  stmt_db.init();
  name_db.init();
  type_db.init();
}