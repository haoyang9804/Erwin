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
  }

  async open() {
    await this.db.open();
  }

  async init() {
    await this.db.exec('CREATE TABLE tbl (id INTEGER PRIMARY KEY, scope INTEGER)')
  }

  async close() {
    await this.db.close();
  }

  async run(cmd: string) : Promise<void | any[]>  {
    if (cmd.startsWith("INSERT") || cmd.startsWith("UPDATE")) {
      await this.db.run(cmd);
    }
    else if (cmd.startsWith("SELECT")) {
      return await this.db.all(cmd) as any[];
    }
  }

  async insert(id: number, scope: number) {
    const cmd = "INSERT INTO tbl (id, scope) VALUES (" + id + ", " + scope + ")";
    await this.run(cmd);
  }
}

export let irnode_db = new DB();
//TODO: don't forget to close the db