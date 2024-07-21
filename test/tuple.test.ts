import { TypeProvider } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRTuple, IRIdentifier } from "../src/expression";
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

test("test tuple",
() => {
  const variable1 = new IRVariableDeclare(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const v1id = new IRIdentifier(1, 0).from(variable1);
  const variable2 = new IRVariableDeclare(2, 0, "y")
  variable2.type = TypeProvider.uint128();
  const v2id = new IRIdentifier(3, 0).from(variable2);
  const tuple1 = new IRTuple(4, 0, [v1id]);
  expect(writer.write(tuple1.lower())).toBe("(x)");
  const tuple2 = new IRTuple(5, 0, [v1id, v2id]);
  expect(writer.write(tuple2.lower())).toBe("(x, y)");
  const tuple3 = new IRTuple(6, 0, []);
  // nulltype
  expect(writer.write(tuple3.lower())).toBe("()");
}
)