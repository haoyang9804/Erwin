import { ElementaryType, UnionType } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRIdentifier, IRTuple } from "../src/expression";
import { IRReturnStatement } from "../src/statement";
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

test("test return",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(1, 0, 0).from(variable1);
  v1id.type = new ElementaryType("uint256", "nonpayable");
  const variable2 = new IRVariableDeclare(2, 0, 0, "y")
  variable2.type = new ElementaryType("uint128", "nonpayable");
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  v2id.type = new ElementaryType("uint128", "nonpayable");
  const tuple1 = new IRTuple(4, 0, 0, [v1id, v2id]);
  tuple1.type = new UnionType([v1id.type.copy(), v2id.type.copy()]);
  const return_stmt = new IRReturnStatement(5, 0, 0, tuple1);
  expect(writer.write(return_stmt.lower())).toBe("return (x, y);");
}
)