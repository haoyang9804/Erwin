import { ElementaryType } from "../src/type"
import { IREventDefinition, IRVariableDeclare } from "../src/declare";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  VariableDeclaration,
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test event",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const error = new IREventDefinition(1, 0, 0, "E", false, [variable1]);
  const result = writer.write(error.lower());
  expect(result).toEqual(
    "event E(uint256 x);"
  );
  const error2 = new IREventDefinition(1, 0, 0, "E", true, [variable1]);
  const result2 = writer.write(error2.lower());
  expect(result2).toEqual(
    "event E(uint256 x) anonymous;"
  );
}
)