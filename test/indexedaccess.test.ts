import { ElementaryType, ArrayType } from "../src/type"
import { IRVariableDeclaration } from "../src/declare";
import { IRIndexedAccess, IRIdentifier, IRLiteral } from "../src/expression";
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

test("test indexed access",
() => {
  const v1 = new IRVariableDeclaration(0, 0, "x")
  //TODO: support ArrayType generation in TypeProvider
  v1.type = new ArrayType(new ElementaryType("uint256", "nonpayable"), 10);
  const v1id = new IRIdentifier(1, 0).from(v1);
  const v1id2 = new IRIdentifier(5, 0).from(v1);
  const e1 = new IRIndexedAccess(2, 0, v1id);
  expect(writer.write(e1.lower())).toEqual("x[]");
  const l1 = new IRLiteral(3, 0, "5");
  l1.type = new ElementaryType("uint256", "nonpayable");
  const e2 = new IRIndexedAccess(4, 0, v1id2, l1);
  expect(writer.write(e2.lower())).toEqual("x[5]");
}
)