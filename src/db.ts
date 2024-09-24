import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Tree } from './dataStructor';
import { scopeKind } from './scope';
import { FunctionVisibility, StateVariableVisibility } from 'solc-typed-ast';
import { assert } from 'console';
import { config } from './config';
import { IRVariableDeclaration } from './declare';

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

export function decideFunctionVisibility(kind : scopeKind, vis : FunctionVisibility) : erwin_visibility {
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
    case scopeKind.IF:
    case scopeKind.FOR:
    case scopeKind.WHILE:
    case scopeKind.DOWHILE_BODY:
    case scopeKind.DOWHILE_COND:
      return erwin_visibility.NAV;
    default:
      throw new Error(`Unsupported scopeKind: ${kind}`);
  }
}

export function decideVariableVisibility(kind : scopeKind, vis : StateVariableVisibility) : erwin_visibility {
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
    case scopeKind.IF:
    case scopeKind.FOR:
    case scopeKind.WHILE:
    case scopeKind.DOWHILE_BODY:
    case scopeKind.DOWHILE_COND:
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
  private scope_tree : Tree<number>;
  private scope2irnodeinfo : Map<number, irnodeInfo[]>;
  // Each contract has a ghost ID, which is used to represent the contract itself.
  // Different from node ID which is larger than 0, ghost ID is below 0
  // It's mainly used for generating "this.function()" inside a contract.
  public contract_ghost_id : number;
  // contract_instance_to_scope is a map from node ID to scope ID
  // It's records the scope that contract instance node exposes to the outside world.
  private contract_instance_to_scope : Map<number, number>;
  public vardecls : Set<number> = new Set<number>();
  public funcdecls : Set<number> = new Set<number>();
  // ghost funcdecls are function decls playing the role of getter functions of member variables
  public ghost_funcdecls : Set<number> = new Set<number>();
  // vardecl_to_ghost_vardecls are used in collaboration with ghost funcdecls to avoid type resolution problems.
  public ghost_vardecl_to_state_vardecl : Map<number, number> = new Map<number, number>();
  public contractdecls : Set<number> = new Set<number>();
  public called_function_decls_IDs : Set<number> = new Set<number>();
  constructor() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.contract_ghost_id = -1;
    this.contract_instance_to_scope = new Map<number, number>();
  }
  init() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.contract_ghost_id = -1;
    this.contract_instance_to_scope = new Map<number, number>();
  }

  add_ghosts_for_state_variable(ghost_funcdecl_id : number, ghost_vardecl_id : number, state_vardecl_id : number) : void {
    this.ghost_funcdecls.add(ghost_funcdecl_id);
    this.ghost_vardecl_to_state_vardecl.set(ghost_vardecl_id, state_vardecl_id);
  }

  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }

  insert_contract_ghost(scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      // The contract ghost is private: it can be accessed by the contract itself but not the outside world
      // or the derived contracts.
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat(
        { id: this.contract_ghost_id, vis: erwin_visibility.INCONTRACT_PRIVATE })
      );
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: this.contract_ghost_id, vis: erwin_visibility.INCONTRACT_PRIVATE }]);
    }
    this.contract_instance_to_scope.set(this.contract_ghost_id, scope_id);
    new IRVariableDeclaration(this.contract_ghost_id, scope_id, 'this');
    this.contract_ghost_id--;
  }
  // insert_contract_instance(node_id : number, instance_name: string, ervis : erwin_visibility,
  //   scope_id : number, contract_scope: number) : void {
  //   if (this.scope2irnodeinfo.has(scope_id)) {
  //     // The contract ghost is private: it can be accessed by the contract itself but not the outside world
  //     // or the derived contracts.
  //     this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat(
  //       { id: this.contract_ghost_id, vis: ervis })
  //     );
  //   }
  //   else {
  //     this.scope2irnodeinfo.set(scope_id, [{ id: this.contract_ghost_id, vis: ervis }]);
  //   }
  //   this.contract_instance_to_scope.set(node_id, contract_scope);
  //   new IRVariableDeclaration(node_id, scope_id, instance_name + );
  // }
  insert(node_id : number, ervis : erwin_visibility, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat({ id: node_id, vis: ervis }));
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: node_id, vis: ervis }]);
    }
  }
  // Get IRNodes from a scope but not its ancestors
  get_nonhidden_nodes_ids_nonrecursively(scope_id : number) : [number, number][] {
    let irnodes_ids : [number, number][] = [];
    if (this.scope2irnodeinfo.has(scope_id))
      irnodes_ids = this.scope2irnodeinfo.get(scope_id)!.map(x => [0, x.id]);
    return irnodes_ids;
  }

  // Get IRNodes from a scope, the scope's ancestors, but not scopers inside
  get_nonhidden_irnodes_ids_recursively(scope_id : number) : [number, number][] {
    let irnodes_ids : [number, number][] = [];
    while (true) {
      if (this.scope2irnodeinfo.has(scope_id))
        irnodes_ids = irnodes_ids.concat(
          this.scope2irnodeinfo.get(scope_id)!.map(x => [0, x.id])
        );
      if (this.scope_tree.hasParent(scope_id)) {
        scope_id = this.scope_tree.getParent(scope_id);
      }
      else {
        break;
      }
    }
    return irnodes_ids;
  }

  // Get contract instances from a scope without its ancestors
  get_contract_instance(scope_id : number) : number[] {
    const irnodes_ids : number[] = [];
    if (this.scope2irnodeinfo.has(scope_id)) {
      for (const irnode_info of this.scope2irnodeinfo.get(scope_id)!) {
        if (this.contract_instance_to_scope.has(irnode_info.id)) {
          irnodes_ids.push(irnode_info.id);
        }
      }
    }
    return irnodes_ids;
  }

  get_hidden_func_irnodes_ids_from_contract_instance(scope_id : number) : [number, number][] {
    let contract_instance_id_plus_func_irnodes_id : [number, number][] = [];
    while (true) {
      const contract_instance_ids = this.get_contract_instance(scope_id);
      for (const contract_instance_id of contract_instance_ids) {
        contract_instance_id_plus_func_irnodes_id = contract_instance_id_plus_func_irnodes_id.concat(
          this.get_nonhidden_nodes_ids_nonrecursively(this.contract_instance_to_scope.get(contract_instance_id)!)
            .map(x => [contract_instance_id, x[1]]))
          .filter(([_, irnode_id]) => this.funcdecls.has(irnode_id)
          );
      }
      if (this.scope_tree.hasParent(scope_id)) {
        scope_id = this.scope_tree.getParent(scope_id);
      }
      else {
        break;
      }
    }
    return contract_instance_id_plus_func_irnodes_id;
  }
}

export let decl_db = new DeclDB();