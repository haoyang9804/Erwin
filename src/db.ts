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

export enum visibility {
  INCONTRACT_INTERNAL = "visibility::INCONTRACT_INTERNAL",
  INCONTRACT_EXTERNAL = "visibility::INCONTRACT_EXTERNAL",
  INCONTRACT_PUBLIC = "visibility::INCONTRACT_PUBLIC",
  INCONTRACT_PRIVATE = "visibility::INCONTRACT_PRIVATE",
  GLOBAL = "visibility::GLOBAL",
  INFUNCTION = "visibility::INFUNCTION"
}

export function decideFunctionVisibility(kind : scopeKind, vis : FunctionVisibility) : visibility {
  switch (kind) {
    case scopeKind.GLOBAL:
      if (config.debug)
        assert(vis === FunctionVisibility.Default, "When the scope is global, the visibiliity is not FunctionVisibility.Defaul");
      return visibility.GLOBAL;
    case scopeKind.CONTRACT:
      switch (vis) {
        case FunctionVisibility.External:
          return visibility.INCONTRACT_EXTERNAL;
        case FunctionVisibility.Internal:
          return visibility.INCONTRACT_INTERNAL;
        case FunctionVisibility.Private:
          return visibility.INCONTRACT_PRIVATE;
        case FunctionVisibility.Public:
          return visibility.INCONTRACT_PUBLIC;
        default:
          throw new Error(`Unsupported FunctionVisibility: ${vis}`);
      }
    default:
      throw new Error(`Unsupported scopeKind: ${kind}`);
  }
}

export function decideVariableVisibility(kind : scopeKind, vis : StateVariableVisibility) : visibility {
  switch (kind) {
    case scopeKind.CONTRACT:
      switch (vis) {
        case StateVariableVisibility.Internal:
          return visibility.INCONTRACT_INTERNAL;
        case StateVariableVisibility.Private:
          return visibility.INCONTRACT_PRIVATE;
        case StateVariableVisibility.Public:
          return visibility.INCONTRACT_PUBLIC;
        default:
          throw new Error(`Unsupported StateVariableVisibility: ${vis}`);
      }
    case scopeKind.FUNC:
      return visibility.INFUNCTION;
    default:
      throw new Error(`Unsupported scopeKind: ${kind}`);
  }
}

type irnodeInfo = {
  id : number,
  vis : visibility
}

class DeclDB {
  private scope_tree : Tree<number>;
  private scope2irnodeinfo : Map<number, irnodeInfo[]>;
  constructor() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
  }
  init() {
    this.scope_tree = new Tree();
    this.scope2irnodeinfo = new Map<number, irnodeInfo[]>();
  }
  new_scope(cur_scope_id : number, parent_scope_id : number) : void {
    this.scope_tree.insert(parent_scope_id, cur_scope_id);
  }
  insert(node_id : number, visibility : visibility, scope_id : number) : void {
    if (this.scope2irnodeinfo.has(scope_id)) {
      this.scope2irnodeinfo.set(scope_id, this.scope2irnodeinfo.get(scope_id)!.concat({ id: node_id, vis: visibility }));
    }
    else {
      this.scope2irnodeinfo.set(scope_id, [{ id: node_id, vis: visibility }]);
    }
  }
  get_irnodes_ids_by_scope_id(scope_id : number) : number[] {
    let irnodes_ids : number[] = [];
    while (true) {
      if (this.scope2irnodeinfo.has(scope_id))
        irnodes_ids = irnodes_ids.concat(
          this.scope2irnodeinfo.get(scope_id)!.map(x => x.id)
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
}

export let decl_db = new DeclDB();