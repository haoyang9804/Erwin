import { ElementaryType } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp, IRConditional } from "../src/expression";
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

test("test conditional",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const variable2 = new IRVariableDeclare(1, 0, 0, "y")
  variable2.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(2, 0, 0).from(variable1);
  v1id.type = new ElementaryType("uint256", "nonpayable");
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  v2id.type = new ElementaryType("uint256", "nonpayable");
  const op = new IRBinaryOp(4, 0, 0, v1id, v2id, ">");
  expect(async() => { op.lower() }).rejects.toThrow("IRBinaryOp: type is not generated");
  op.type = new ElementaryType("uint256", "nonpayable");
  const op2 = new IRBinaryOp(5, 0, 0, v1id, v2id, "+");
  op2.type = new ElementaryType("uint256", "nonpayable");
  const op3 = new IRBinaryOp(6, 0, 0, v1id, v2id, "-");
  op3.type = new ElementaryType("uint256", "nonpayable");
  const cond = new IRConditional(7, 0, 0, op, op2, op3);
  cond.type = new ElementaryType("uint256", "nonpayable");
  const result = writer.write(cond.lower());
  expect(result).toEqual(
    "(x > y) ? (x + y) : (x - y)"
  );
  const variable3 = new IRVariableDeclare(8, 0, 0, "z");
  variable3.type = new ElementaryType("address", "nonpayable");
  const v3id = new IRIdentifier(9, 0, 0).from(variable3);
  v3id.type = new ElementaryType("address", "nonpayable");
  const cond2 = new IRConditional(10, 0, 0, op, op2, v3id);
  // whatever type it is
  cond2.type = new ElementaryType("address", "nonpayable");
  expect(async() => { writer.write(cond2.lower()) }).rejects.toThrow("IRConditional: true_expression and false_expression have incompatible types: uint256 nonpayable and address nonpayable");
}
)