import { TypeProvider } from "../src/type"
import { IRErrorDefinition, IRVariableDeclaration } from "../src/declaration";
import { IRRevertStatement } from "../src/statement";
import { IRIdentifier } from "../src/expression";
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

test("test revert",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const error = new IRErrorDefinition(1, 0, "E", [variable1]);
  const error_id = new IRIdentifier(2, 0, error.name, error.id);
  const v1id = new IRIdentifier(3, 0).from(variable1);
  const revert = new IRRevertStatement(3, 0, error_id, [v1id]);
  const result = writer.write(revert.lower());
  expect(result).toEqual("revert E(x);")
}
)