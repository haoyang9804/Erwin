import { ElementaryType } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRTuple, IRIdentifier } from "../src/expression";
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

test("test tuple",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const v1id = new IRIdentifier(1, 0, 0).from(variable1);
  v1id.type = new ElementaryType("uint256", "nonpayable");
  const variable2 = new IRVariableDeclare(2, 0, 0, "y")
  variable2.type = new ElementaryType("uint128", "nonpayable");
  const v2id = new IRIdentifier(3, 0, 0).from(variable2);
  v2id.type = new ElementaryType("uint128", "nonpayable");
  const tuple1 = new IRTuple(4, 0, 0, [v1id]);
  expect(writer.write(tuple1.lower())).toBe("(x)");
  const tuple2 = new IRTuple(5, 0, 0, [v1id, v2id]);
  expect(writer.write(tuple2.lower())).toBe("(x, y)");
  const tuple3 = new IRTuple(6, 0, 0, []);
  // nulltype
  expect(writer.write(tuple3.lower())).toBe("()");
}
)