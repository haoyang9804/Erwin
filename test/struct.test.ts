import { ElementaryType } from "../src/type"
import { IRStructDefinition, IRVariableDeclare } from "../src/declare";
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

test("test struct",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const error = new IRStructDefinition(1, 0, 0, "S", [variable1]);
  const result = writer.write(error.lower());
  expect(result).toEqual(
    "struct S {\n  uint256 x;\n}"
  );
}
)