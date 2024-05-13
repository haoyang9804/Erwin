import { ElementaryType, ErrorType } from "../src/type"
import { IRErrorDefinition, IRVariableDeclare } from "../src/declare";
import { IRRevertStatement } from "../src/statement";
import { IRIdentifier } from "../src/expression";
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

test("test revert",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const error = new IRErrorDefinition(1, 0, 0, "E", [variable1]);
  const error_id = new IRIdentifier(2, 0, 0, error.name, error.id);
  error_id.type = new ErrorType(error.name);
  const v1id = new IRIdentifier(3, 0, 0).from(variable1);
  v1id.type = variable1.type.copy();
  const revert = new IRRevertStatement(3, 0, 0, error_id, [v1id]);
  const result = writer.write(revert.lower());
  expect(result).toEqual("revert E(x);")
}
)