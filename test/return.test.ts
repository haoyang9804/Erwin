import { TypeProvider } from "../src/type"
import { IRVariableDeclaration } from "../src/declaration";
import { IRIdentifier, IRTuple } from "../src/expression";
import { IRReturnStatement } from "../src/statement";
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

test("test return",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const v1id = new IRIdentifier(1, 0).from(variable1);
  const variable2 = new IRVariableDeclaration(2, 0, "y")
  variable2.type = TypeProvider.uint128();
  const v2id = new IRIdentifier(3, 0).from(variable2);
  const tuple1 = new IRTuple(4, 0, [v1id, v2id]);
  const return_stmt = new IRReturnStatement(5, 0, tuple1);
  expect(writer.write(return_stmt.lower())).toBe("return (x, y);");
}
)