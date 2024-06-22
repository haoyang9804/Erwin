import { TypeProvider } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp } from "../src/expression";
import { IRIf, IRExpressionStatement } from "../src/statement";
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
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = TypeProvider.uint256()
  const variable2 = new IRVariableDeclare(1, 0, 0, "y")
  variable2.type = TypeProvider.uint256()
  const v1id = new IRIdentifier(2, 0, 0).from(variable1);
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  const op = new IRBinaryOp(4, 0, 0, v1id, v2id, ">");
  expect(async() => { op.lower() }).rejects.toThrow("IRBinaryOp: type is not generated");
  const op2 = new IRBinaryOp(5, 0, 0, v1id, v2id, "+");
  const op_stmt2 = new IRExpressionStatement(6, 0, 0, op2);
  const op3 = new IRBinaryOp(7, 0, 0, v1id, v2id, "-");
  const op_stmt3 = new IRExpressionStatement(8, 0, 0, op3);
  const cond = new IRIf(9, 0, 0, op, [op_stmt2], [op_stmt3]);
  const result = writer.write(cond.lower());
  expect(result).toEqual(
    "if (x > y) {\n  x + y;\n} else {\n  x - y;\n}"
  );
}
)