import { ElementaryType } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp, IRConditional } from "../src/expression";
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

test("test conditional",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const variable2 = new IRVariableDeclare(1, 0, 0, "y")
  variable2.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(2, 0, 0).from(variable1);
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  const op = new IRBinaryOp(4, 0, 0, v1id, v2id, "+");
  expect(async() => { op.lower() }).rejects.toThrow("IRBinaryOp: type is not generated");
  // op.type = new ElementaryType("uint256", "nonpayable");
  // const op2 = new IRBinaryOp(5, 0, 0, v1id, v2id, "+");
  // const op3 = new IRBinaryOp(6, 0, 0, v1id, v2id, "-");
  // const cond = new IRConditional(7, 0, 0, op, op2, op3);
  // const result = writer.write(cond.lower());
  // expect(result).toEqual(
  //   "x > y ? x + y : x - y"
  // );
}
)