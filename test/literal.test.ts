import { ElementaryType } from "../src/type"
import { IRLiteral } from "../src/expression";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
} from "solc-typed-ast"
import { config } from "../src/config";

config.debug = true;

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);
test("test literal 1",
() => {
  const l1 = new IRLiteral(0, 0, 0, "55555555555555555555555555555555555555555555555555555555555555555");
  l1.type = new ElementaryType("uint256", "nonpayable");
  const lowered_value = l1.lower();
  expect(l1.value).toBeDefined();
  expect(writer.write(lowered_value)).toBe("55555555555555555555555555555555555555555555555555555555555555555");
}
)

test("test literal 2",
() => {
  const l1 = new IRLiteral(0, 0, 0, undefined, false, true);
  l1.type = new ElementaryType("int8", "nonpayable");
  const lowered_value = l1.lower();
  expect(l1.value).toBeDefined();
  expect(writer.write(lowered_value)).toBe(`int8(${l1.value})`);
}
)