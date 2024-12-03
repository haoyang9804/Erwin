import { TypeProvider } from "../src/type"
import { IRVariableDeclaration } from "../src/declaration";
import { IRIdentifier, IRBinaryOp } from "../src/expression";
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

test("test binary op",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const variable2 = new IRVariableDeclaration(1, 0, "y")
  variable2.type = TypeProvider.uint256();
  const v1id = new IRIdentifier(2, 0).from(variable1);
  const v2id = new IRIdentifier(3, 0).from(variable2);
  const op = new IRBinaryOp(2, 0, v1id, v2id, "+");
  const result = writer.write(op.lower());
  expect(result).toEqual(
    "x + y"
  );
}
)