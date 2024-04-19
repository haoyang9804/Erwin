import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3'

export class DB {
  db: sqlite.Database;
  constructor(filename: string = ":memory:") {
    const config = {
      filename: filename,
      driver: sqlite3.Database
    };
    this.db = new sqlite.Database(config);
    this.db.open();
    this.run('CREATE TABLE tbl (id INTEGER PRIMARY KEY, scope INTEGER)')
  }

  async close() {
    this.db.close();
  }

  async run(cmd: string) : Promise<void | any[]>  {
    if (cmd.startsWith("INSERT") || cmd.startsWith("UPDATE")) {
      this.db.run(cmd);
    }
    else if (cmd.startsWith("SELECT")) {
      return this.db.all(cmd) as Promise<any[]>;
    }
  }

  insert(id: number, scope: number) {
    const cmd = "INSERT INTO tbl (id, scope) VALUES (" + id + ", " + scope + ")";
    this.run(cmd);
  }
}

export let irnode_db = new DB();