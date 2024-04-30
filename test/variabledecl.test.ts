import * as gen from "../src/generator"
import * as db from "../src/db"
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test a simple vardecl generation 1",
async () => {
  await db.irnode_db.open();
  await db.irnode_db.init();
  const vgen = new gen.VariableDeclareGenerator();
  await vgen.generate();
  expect(vgen.irnode).toBeDefined();
  expect(vgen.irnode!.id).toBe(0);
  db.irnode_db.run("SELECT * FROM tbl").then((result) => {
    const res = result as any[];
    expect(res.length).toBe(1);
    expect(res[0].id).toBe(0);
    expect(res[0].scope).toBe(-1);
  })
}
)