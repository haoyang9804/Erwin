import { TypeProvider } from "../src/type"
import { IRErrorDefinition, IRVariableDeclare } from "../src/declare";
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

test("test error",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const error = new IRErrorDefinition(1, 0, 0, "E", [variable1]);
  const result = writer.write(error.lower());
  expect(result).toEqual(
    "error E(uint256 x);"
  );
}
)