import { TypeProvider } from "../src/type"
import { IREventDefinition, IRVariableDeclaration } from "../src/declare";
import { IRIdentifier } from "../src/expression";
import { IREmitStatement } from "../src/statement";
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

test("test event and emit",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const event = new IREventDefinition(1, 0, "E", false, [variable1]);
  const result = writer.write(event.lower());
  expect(result).toEqual(
    "event E(uint256 x);"
  );
  const event2 = new IREventDefinition(2, 0, "E", true, [variable1]);
  const result2 = writer.write(event2.lower());
  expect(result2).toEqual(
    "event E(uint256 x) anonymous;"
  );
  const variable2 = new IRVariableDeclaration(3, 0, "y");
  variable2.type = TypeProvider.uint256();
  const variable2_id = new IRIdentifier(4, 0, variable2.name, variable2.id);
  const event_id = new IRIdentifier(5, 0, event.name, event.id);
  const emit = new IREmitStatement(6, 0, event_id, [variable2_id]);
  expect(writer.write(emit.lower())).toBe("emit E(y);")
}
)