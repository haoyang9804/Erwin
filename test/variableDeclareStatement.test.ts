import { TypeProvider } from "../src/type"
import { IRVariableDeclare } from "../src/declare";
import { IRLiteral, IRTuple } from "../src/expression";
import { IRVariableDeclareStatement } from "../src/statement";
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

test("test variableDeclareStatement",
() => {
  const variable1 = new IRVariableDeclare(0, 0, "x");
  variable1.type = TypeProvider.uint256()
  const variable2 = new IRVariableDeclare(1, 0, "y");
  variable2.type = TypeProvider.uint128()
  const literal1 = new IRLiteral(2, 0);
  literal1.type = TypeProvider.uint256()
  const literal2 = new IRLiteral(3, 0);
  literal2.type = TypeProvider.uint128()
  const tuple = new IRTuple(5, 0, [literal1, literal2]);
  const statement = new IRVariableDeclareStatement(4, 0, [variable1, variable2], tuple);
  const result = writer.write(statement.lower());
  expect(result).toBe("(uint256 x, uint128 y) = (" + literal1.value + ", " + literal2.value + ");");
}
)