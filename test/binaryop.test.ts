import { ElementaryType } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRBinaryOp } from "../src/expression";
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

test("test binary op",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const variable2 = new IRVariableDeclare(1, 0, 0, "y")
  variable2.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(2, 0, 0).from(variable1);
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  const op = new IRBinaryOp(2, 0, 0, v1id, v2id, "+");
  expect(async() => { op.lower() }).rejects.toThrow("IRBinaryOp: type is not generated");
  const result = writer.write(op.lower());
  expect(result).toEqual(
    "x + y"
  );
}
)