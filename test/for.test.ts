import { ElementaryType} from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRUnaryOp, IRBinaryOp, IRLiteral } from "../src/expression";
import { IRFor, IRVariableDeclareStatement, IRBreakStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  Literal,
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test if",
() => {
  const v1 = new IRVariableDeclare(0, 0, 0, "x")
  v1.type = new ElementaryType("uint256", "nonpayable");
  const l1 = new IRLiteral(1, 0, 0);
  l1.type = v1.type.copy();
  const initial = new IRVariableDeclareStatement(2, 0, 0, [v1], l1);
  const v1id = new IRIdentifier(3, 0, 0).from(v1);
  v1id.type = v1.type.copy();
  const loop = new IRUnaryOp(4, 0, 0, true, v1id, "++"); // loop
  loop.type = v1id.type.copy();
  const v2id = new IRIdentifier(5, 0, 0).from(v1);
  v2id.type = v1.type.copy();
  const l2 = new IRLiteral(6, 0, 0, "100");
  l2.type = l1.type.copy();
  const cond = new IRBinaryOp(7, 0, 0, v2id, l2, "<");
  cond.type = new ElementaryType("bool", "nonpayable");
  const body = new IRBreakStatement(8, 0, 0);
  const forloop = new IRFor(9, 0, 0, initial, cond, loop, [body, body]);
  const result = writer.write(forloop.lower());
  expect(result).toEqual(
    `for (uint256 x = ${l1.value}; x < ${l2.value}; ++x) {\n  break;\n  break;\n}`
  );
}
)