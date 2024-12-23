import { TypeProvider } from "../src/type"
import { IRStructDefinition, IRVariableDeclaration } from "../src/declaration";
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

test("test struct",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const error = new IRStructDefinition(1, 0, "S", [variable1]);
  const result = writer.write(error.lower());
  expect(result).toEqual(
    "struct S {\n  uint256 x;\n}"
  );
}
)