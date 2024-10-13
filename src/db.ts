import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Tree } from './dataStructor';
import { scopeKind } from './scope';
import { FunctionVisibility, StateVariableVisibility } from 'solc-typed-ast';
import { assert } from 'console';
import { config } from './config';

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
    case scopeKind.STRUCT:
    case scopeKind.FUNC_PARAMETER:
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
    case scopeKind.STRUCT:
    case scopeKind.FUNC_PARAMETER:
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
  // contractdecl_id_to_scope is a map from node ID to scope ID
  // It's records the scope that contract instance node exposes to the outside world.
  private contractdecl_id_to_scope : Map<number, number>;
  public vardecls : Set<number> = new Set<number>();
  public structdecls : Set<number> = new Set<number>();
  public funcdecls : Set<number> = new Set<number>();
  public contractdecls : Set<number> = new Set<number>();
  public state_variables : Set<number> = new Set<number>();
  // public structdecl_to_struct_instance : Map<number, number[]> = new Map<number, number[]>();
  // public contractdecl_to_contract_instance : Map<number, number[]> = new Map<number, number[]>();
  // ghost funcdecls are function decls playing the role of getter functions of member variables
  public ghost_funcdecls : Set<number> = new Set<number>();
  // vardecl_to_ghost_vardecls are used in collaboration with ghost funcdecls to avoid type resolution problems.
  public ghost_vardecl_to_state_vardecl : Map<number, number> = new Map<number, number>();
  public called_function_decls_IDs : Set<number> = new Set<number>();
  constructor() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.contractdecl_id_to_scope = new Map<number, number>();
  }
  init() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.contractdecl_id_to_scope = new Map<number, number>();
  }

  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }

  insert_yin_contract(scope_id : number, contractdecl_id : number) : void {
    this.contractdecls.add(-contractdecl_id);
    this.contractdecl_id_to_scope.set(-contractdecl_id, scope_id);
  }

  insert_yang_contract(scope_id : number, contractdecl_id : number) : void {
    // Yang
    this.contractdecls.add(contractdecl_id);
    this.contractdecl_id_to_scope.set(contractdecl_id, scope_id);
  }

  insert(node_id : number, ervis : erwin_visibility, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat({ id: node_id, vis: ervis }));
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: node_id, vis: ervis }]);
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