import * as db from "../src/db"
import { IRIdentifier, IRExpression } from "../src/expression"
import { ElementaryType } from "../src/type"
import { irnodes } from "../src/node"
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

test("test db 1",
async () => {
  await db.irnode_db.open();
  await db.irnode_db.init();
  const ir = new IRIdentifier(0, 0, 0, "x", 0);
  await db.irnode_db.insert(ir.id, ir.scope, "Identifier");
  const find_ir = await db.irnode_db.run("SELECT * FROM tbl WHERE kind = \"Identifier\"") as IRExpression[];
  expect(find_ir[0].id).toBe(0);
  (irnodes[find_ir[0].id] as IRExpression).type = new ElementaryType("uint256", "nonpayable");
  const result = writer.write(ir.lower());
  expect(result).toEqual(
    "x"
  );
}
)