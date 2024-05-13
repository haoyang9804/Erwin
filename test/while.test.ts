import { ElementaryType} from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp, IRLiteral } from "../src/expression";
import { IRWhile, IRBreakStatement } from "../src/statement";
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

test("test while",
() => {
  const v1 = new IRVariableDeclare(0, 0, 0, "x")
  v1.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(3, 0, 0).from(v1);
  v1id.type = v1.type.copy();
  const v2id = new IRIdentifier(5, 0, 0).from(v1);
  v2id.type = v1.type.copy();
  const l2 = new IRLiteral(6, 0, 0, "100");
  l2.type = v1.type.copy();
  const cond = new IRBinaryOp(7, 0, 0, v2id, l2, "<");
  cond.type = new ElementaryType("bool", "nonpayable");
  const body = new IRBreakStatement(8, 0, 0);
  const doWhile = new IRWhile(9, 0, 0, cond, body);
  const result = writer.write(doWhile.lower());
  expect(result).toEqual(
    `while (x < 100) break;`
  );
}
)