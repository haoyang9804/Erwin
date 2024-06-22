import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import { Tree } from './dataStructor';

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

export class DB {
  private scope_set : Tree<number>;
  private scope2IRNodesID : Map<number, number[]>;
  constructor() {
    this.scope_set = new Tree();
    this.scope2IRNodesID = new Map<number, number[]>();
  }
  init() {
    this.scope_set = new Tree();
    this.scope2IRNodesID = new Map<number, number[]>();
  }
  new_scope(cur_scope : number, parent_scope : number) : void {
    this.scope_set.insert(parent_scope, cur_scope);
  }
  insert(id : number, scope : number) : void {
    if (this.scope2IRNodesID.has(scope)) {
      this.scope2IRNodesID.set(scope, this.scope2IRNodesID.get(scope)!.concat(id));
    }
    else {
      this.scope2IRNodesID.set(scope, [id]);
    }
  }
  get_IRNodes_by_scope(scope : number) : number[] {
    let irnodes_ids : number[] = [];
    while (true) {
      if (this.scope2IRNodesID.has(scope))
        irnodes_ids = irnodes_ids.concat(this.scope2IRNodesID.get(scope)!);
      if (this.scope_set.hasParent(scope)) {
        scope = this.scope_set.getParent(scope);
      }
      else {
        break;
      }
    }
    return irnodes_ids;
  }
}

export let irnode_db = new DB();
//TODO: don't forget to close the db