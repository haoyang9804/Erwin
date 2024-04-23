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

test("test a simple identifier generation",
async () => {
  await db.irnode_db.open();
  await db.irnode_db.init();
  const igen = new gen.IdentifierGenerator();
  expect(async() => {await igen.generate()}).rejects.toThrow("IdentifierGenerator: no available IR irnodes");

})