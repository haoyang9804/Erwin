import { IRIdentifier } from "../src/expression"
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

test("test identifier",
() => {
  const ir = new IRIdentifier(0, 0, 0, "x", 0);
  const result = writer.write(ir.lower());
  expect(result).toEqual(
    "x"
  );
}
)