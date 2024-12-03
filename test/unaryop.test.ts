import { TypeProvider } from "../src/type"
import { IRVariableDeclaration } from "../src/declaration";
import { IRIdentifier, IRUnaryOp } from "../src/expression";
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
  const v1id = new IRIdentifier(2, 0).from(variable1);
  const uop = new IRUnaryOp(2, 0, true, v1id, "++");
  const result = writer.write(uop.lower());
  expect(result).toEqual(
    "++x"
  );
  const uop2 = new IRUnaryOp(2, 0, false, v1id, "++");
  const result2 = writer.write(uop2.lower());
  expect(result2).toEqual(
    "x++"
  );
}
)