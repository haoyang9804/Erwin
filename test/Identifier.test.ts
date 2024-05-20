import { IRIdentifier } from "../src/expression"
import { ElementaryType } from "../src/type"
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
  expect(async() => { ir.lower() }).rejects.toThrow("IRIdentifier: type is not generated");
  ir.type = new ElementaryType("uint256", "nonpayable");
  const result = writer.write(ir.lower());
  expect(result).toEqual(
    "x"
  );
}
)