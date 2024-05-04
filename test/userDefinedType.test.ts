import { IRUserDefinedTypeDefinition, IREnumDefinition } from "../src/declare";
import { IREnumValue } from "../src/expression";
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

test("test user defined type",
() => {
  const ir = new IRUserDefinedTypeDefinition(0, 0, 0, "T", "uint256");
  const result = writer.write(ir.lower());
  expect(result).toEqual(
    "type T is uint256;"
  );
}
)

test("test enum",
() => {
  const ir = new IREnumDefinition(0, 0, 0, "E", [
    new IREnumValue(1, 0, 0, "A"),
    new IREnumValue(2, 0, 0, "B")
  ]);
  const result = writer.write(ir.lower());
  expect(result).toEqual(
    "enum E {\n  A,\n  B\n}"
  );
}
)