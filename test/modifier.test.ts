import { ElementaryType } from "../src/type"
import { IRModifier, IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp } from "../src/expression";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  VariableDeclaration,
  Identifier,
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test modifier",
() => {
  const v1 = new IRVariableDeclare(1, 0, 0, "x");
  v1.type = new ElementaryType("uint256", "nonpayable");
  const id1 = new IRIdentifier(2,0,0).from(v1);
  const id2 = new IRIdentifier(3,0,0).from(v1);
  const op = new IRBinaryOp(4,0,0,id1,id2,"+");
  op.type = new ElementaryType("uint256", "nonpayable");
  const modifier = new IRModifier(0, 0, 0, "M", true, true, "internal", [v1], [op]);
  expect(writer.write(modifier.lower())).toBe("modifier M(uint256 x) virtual override {\n  x + x;\n}");
}
)