import * as db from "../src/db"
import { IRIdentifier } from "../src/expression"

test("test db 1",
async () => {
  await db.irnode_db.open();
  await db.irnode_db.init();
  const results = await db.irnode_db.run("SELECT id FROM tbl") as any[];
  expect(results).toEqual([]);
  expect(results.length).toBe(0);
  const ir = new IRIdentifier(0, 0, 0, "x", 0);
  await db.irnode_db.insert(ir.id, ir.scope, "Identifier");
  const find_ir = await db.irnode_db.run("SELECT * FROM tbl WHERE kind = \"Identifier\"") as any[];
  expect(find_ir[0].id).toBe(0);
}
)