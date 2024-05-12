import { ElementaryType, EventType } from "../src/type"
import { IREventDefinition, IRVariableDeclare } from "../src/declare";
import { IRIdentifier } from "../src/expression";
import { IREmitStatement } from "../src/statement";
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

test("test event and emit",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const event = new IREventDefinition(1, 0, 0, "E", false, [variable1]);
  const result = writer.write(event.lower());
  expect(result).toEqual(
    "event E(uint256 x);"
  );
  const event2 = new IREventDefinition(1, 0, 0, "E", true, [variable1]);
  const result2 = writer.write(event2.lower());
  expect(result2).toEqual(
    "event E(uint256 x) anonymous;"
  );
  const variable2 = new IRVariableDeclare(0, 0, 0, "y");
  variable2.type = variable1.type.copy();
  const variable2_id = new IRIdentifier(0, 0, 0, variable2.name, variable2.id);
  variable2_id.type = variable2.type.copy();
  const event_id = new IRIdentifier(0, 0, 0, event.name, event.id);
  event_id.type = new EventType();
  const emit = new IREmitStatement(0, 0, 0, event_id, [variable2_id]);
  expect(writer.write(emit.lower())).toBe("emit E(y);")
}
)