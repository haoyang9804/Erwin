import { TypeProvider } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRUnaryOp, IRBinaryOp, IRLiteral } from "../src/expression";
import { IRFor, IRVariableDeclareStatement, IRBreakStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
} from "solc-typed-ast"
import { config } from '../src/config';
config.unit_test_mode = true;
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test if",
() => {
  const v1 = new IRVariableDeclare(0, 0, 0, "x")
  v1.type = TypeProvider.uint256();
  const l1 = new IRLiteral(1, 0, 0);
  l1.type = TypeProvider.uint256();
  const initial = new IRVariableDeclareStatement(2, 0, 0, [v1], l1);
  const v1id = new IRIdentifier(3, 0, 0).from(v1);
  const loop = new IRUnaryOp(4, 0, 0, true, v1id, "++"); // loop
  const v2id = new IRIdentifier(5, 0, 0).from(v1);
  const l2 = new IRLiteral(6, 0, 0, "100");
  l2.type = TypeProvider.uint256();
  const cond = new IRBinaryOp(7, 0, 0, v2id, l2, "<");
  const body = new IRBreakStatement(8, 0, 0);
  const forloop = new IRFor(9, 0, 0, initial, cond, loop, [body, body]);
  const result = writer.write(forloop.lower());
  expect(result).toEqual(
    `for (uint256 x = ${l1.value}; x < ${l2.value}; ++x) {\n  break;\n  break;\n}`
  );
}
)