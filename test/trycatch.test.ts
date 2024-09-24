import { TypeProvider } from "../src/type"
import { IREventDefinition, IRVariableDeclaration } from "../src/declare";
import { IRIdentifier, IRFunctionCall } from "../src/expression";
import { IRTryCatchClause, IRTry, IREmitStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionCallKind,
} from "solc-typed-ast"
import { config } from '../src/config';
config.unit_test_mode = true;
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test("test try catch",
() => {
  const variable1 = new IRVariableDeclaration(0, 0, "x")
  variable1.type = TypeProvider.uint256();
  const event = new IREventDefinition(1, 0, "E", false, [variable1]);
  const variable2 = new IRVariableDeclaration(3, 0, "y");
  variable2.type = TypeProvider.uint256();
  const variable2_id = new IRIdentifier(4, 0, variable2.name, variable2.id);
  const event_id = new IRIdentifier(5, 0, event.name, event.id);
  const emit = new IREmitStatement(6, 0, event_id, [variable2_id]);

  const f_id = new IRIdentifier(8, 0, "F", 7);
  const tc1 = new IRTryCatchClause(10, 0, "", [], [emit]);
  const tc2 = new IRTryCatchClause(11, 0, "", [], [emit]);
  const fcall = new IRFunctionCall(9, 0, FunctionCallKind.FunctionCall, f_id, []);
  const try1 = new IRTry(12, 0, fcall, [tc1, tc2]);
  const result = writer.write(try1.lower());
  expect(result).toEqual(
    "try F() {\n  emit E(y);\n} catch {\n  emit E(y);\n}"
  );
}
)