import { ElementaryType, EventType, FunctionType, UnionType } from "../src/type"
import { IREventDefinition, IRVariableDeclare, IRFunctionDefinition } from "../src/declare";
import { IRIdentifier, IRFunctionCall } from "../src/expression";
import { IRTryCatchClause, IRTry, IREmitStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionCallKind,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test try catch",
() => {
  const variable1 = new IRVariableDeclare(0, 0, 0, "x")
  variable1.type = new ElementaryType("uint256", "nonpayable");
  const event = new IREventDefinition(1, 0, 0, "E", false, [variable1]);
  const variable2 = new IRVariableDeclare(3, 0, 0, "y");
  variable2.type = variable1.type.copy();
  const variable2_id = new IRIdentifier(4, 0, 0, variable2.name, variable2.id);
  variable2_id.type = variable2.type.copy();
  const event_id = new IRIdentifier(5, 0, 0, event.name, event.id);
  event_id.type = new EventType(event_id.name!);
  const emit = new IREmitStatement(6, 0, 0, event_id, [variable2_id]);

  const function1 = new IRFunctionDefinition(7, 0, 0, "F", FunctionKind.Function, false, false, [], [], [], [], FunctionVisibility.Public, FunctionStateMutability.NonPayable);
  const f_id = new IRIdentifier(8, 0, 0, "F", 7);
  f_id.type = new FunctionType("public", "nonpayable",
    new UnionType([new ElementaryType()]), new UnionType([new ElementaryType()]));
  const tc1 = new IRTryCatchClause(10, 0, 0, "", [], [emit]);
  const tc2 = new IRTryCatchClause(11, 0, 0, "", [], [emit]);
  const fcall = new IRFunctionCall(9, 0, 0, FunctionCallKind.FunctionCall, f_id, []);
  fcall.type = (function1 as IRFunctionDefinition).returnType();
  const try1 = new IRTry(12, 0, 0, fcall, [tc1, tc2]);
  const result = writer.write(try1.lower());
  expect(result).toEqual(
    "try F() {\n  emit E(y);\n} catch {\n  emit E(y);\n}"
  );
}
)