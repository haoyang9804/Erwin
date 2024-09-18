import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Tree } from './dataStructor';
import { scopeKind } from './scope';
import { FunctionVisibility, StateVariableVisibility } from 'solc-typed-ast';
import { assert } from 'console';
import { config } from './config';
import { IRVariableDeclare } from './declare';

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
  GLOBAL = "erwin_visibility::GLOBAL",
  INFUNCTION = "erwin_visibility::INFUNCTION"
}

export function decideFunctionVisibility(kind : scopeKind, vis : FunctionVisibility) : erwin_visibility {
  switch (kind) {
    case scopeKind.GLOBAL:
      if (config.debug)
        assert(vis === FunctionVisibility.Default, "When the scope is global, the visibiliity is not FunctionVisibility.Default");
      return erwin_visibility.GLOBAL;
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
      return erwin_visibility.INFUNCTION;
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
  private ghost_ID : number;
  // scopermap is a map from node ID to scope ID
  // It's records the scope that some node exposes to the outside world.
  // The nodes in the exposed scope are called `hidden nodes`.
  // The node that exposes the scope is called `scoper`.
  private scopermap : Map<number, number>;
  constructor() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.ghost_ID = -1;
    this.scopermap = new Map<number, number>();
  }
  init() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
    this.ghost_ID = -1;
    this.scopermap = new Map<number, number>();
  }
  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }
  insert_contract_ghost(scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      // The contract ghost is private: it can be accessed by the contract itself but not the outside world
      // or the derived contracts.
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat(
        { id: this.ghost_ID, vis: erwin_visibility.INCONTRACT_PRIVATE })
      );
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: this.ghost_ID, vis: erwin_visibility.INCONTRACT_PRIVATE }]);
    }
    this.scopermap.set(this.ghost_ID, scope_id);
    new IRVariableDeclare(this.ghost_ID, scope_id, 'this');
    this.ghost_ID--;
  }
  insert(node_id : number, erwin_visibility : erwin_visibility, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat({ id: node_id, vis: erwin_visibility }));
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: node_id, vis: erwin_visibility }]);
    }
  }
  // Get IRNodes from a scope but not its ancestors
  get_nonhidden_nodes_ids_nonrecursively(scope_id : number) : [number, number][] {
    let irnodes_ids : [number, number][] = [];
    if (this.scope2irnodeinfo.has(scope_id))
      irnodes_ids = this.scope2irnodeinfo.get(scope_id)!.map(x => [-1, x.id]);
    return irnodes_ids;
  }

  // Get IRNodes from a scope, the scope's ancestors, but not scopers inside
  get_nonhidden_irnodes_ids_recursively(scope_id : number) : [number, number][] {
    let irnodes_ids : [number, number][] = [];
    while (true) {
      if (this.scope2irnodeinfo.has(scope_id))
        irnodes_ids = irnodes_ids.concat(
          this.scope2irnodeinfo.get(scope_id)!.map(x => [-1, x.id])
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

  get_scoper(scope_id : number) : number[] {
    const irnodes_ids : number[] = [];
    if (this.scope2irnodeinfo.has(scope_id)) {
      for (const irnode_info of this.scope2irnodeinfo.get(scope_id)!) {
        if (this.scopermap.has(irnode_info.id)) {
          irnodes_ids.push(irnode_info.id);
        }
      }
    }
    return irnodes_ids;
  }
  /*
  From a scope, get all hidden nodes' IDs from the inside scopers.
  */
  get_hidden_irnodes_ids_from_scoper(scope_id : number) : [number, number][] {
    const scoper_ids = this.get_scoper(scope_id);
    const irnodes_ids : [number, number][] = [];
    for (const scoper_id of scoper_ids) {
      irnodes_ids.concat(this.get_nonhidden_nodes_ids_nonrecursively(scoper_id).map(x => [scoper_id, x[1]]));
    }
    return irnodes_ids;
  }
}

export let decl_db = new DeclDB();