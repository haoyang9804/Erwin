import { TypeProvider} from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp, IRLiteral } from "../src/expression";
import { IRDoWhile, IRBreakStatement } from "../src/statement";
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

test("test do while",
() => {
  const v1 = new IRVariableDeclare(0, 0, 0, "x")
  v1.type = TypeProvider.uint256();
  const v2id = new IRIdentifier(5, 0, 0).from(v1);
  const l2 = new IRLiteral(6, 0, 0, "100");
  l2.type = TypeProvider.uint256();
  const cond = new IRBinaryOp(7, 0, 0, v2id, l2, "<");
  const body = new IRBreakStatement(8, 0, 0);
  const doWhile = new IRDoWhile(9, 0, 0, cond, [body]);
  const result = writer.write(doWhile.lower());
  expect(result).toEqual(
    `do {\n  break;\n} while(x < 100);`
  );
}
)