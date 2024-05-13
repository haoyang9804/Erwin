import { ElementaryType, UnionType, ContractType } from "../src/type"
import { IRVariableDeclare, IRFunctionDefinition, IRContractDefinition } from "../src/declare";
import { IRIdentifier, IRLiteral, IRTuple, IRFunctionCall, IRNew } from "../src/expression";
import { IRVariableDeclareStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability,
  FunctionCallKind,
  ContractKind
} from "solc-typed-ast"

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

const variable1 = new IRVariableDeclare(0, 0, 0, "x");
variable1.type = new ElementaryType("uint256", "nonpayable");
const variable2 = new IRVariableDeclare(1, 0, 0, "y");
variable2.type = new ElementaryType("uint128", "nonpayable");
const literal1 = new IRLiteral(2, 0, 0);
literal1.type = new ElementaryType("uint256", "nonpayable");
const literal2 = new IRLiteral(3, 0, 0);
literal2.type = new ElementaryType("uint128", "nonpayable");
const tuple = new IRTuple(5, 0, 0, [literal1, literal2]);
tuple.type = new UnionType([literal1.type.copy(), literal2.type.copy()]);
const variable_declare_stmt = new IRVariableDeclareStatement(4, 0, 0, [variable1, variable2], tuple);

const v2 = new IRVariableDeclare(6, 0, 0, "y");
v2.type = new ElementaryType("uint256", "nonpayable");
const v3 = new IRVariableDeclare(7, 0, 0, "z");
v3.type = new ElementaryType("uint256", "nonpayable");
const f_correct = new IRFunctionDefinition(8, 0, 0, "F", FunctionKind.Function,
true, true, FunctionVisibility.Private, FunctionStateMutability.View,
[v2], [v3], [variable_declare_stmt], []);

const v4 = new IRVariableDeclare(9, 0, 0, "x");
v4.type = new ElementaryType("uint256", "nonpayable");
const id4 = new IRIdentifier(10, 0, 0).from(v4);
id4.type = new ElementaryType("uint256", "nonpayable");
const f_id = new IRIdentifier(11, 0, 0, f_correct.name, f_correct.id);
f_id.type = (f_correct as IRFunctionDefinition).functionType();
const functioncall = new IRFunctionCall(12, 0, 0, FunctionCallKind.FunctionCall, f_id, [id4]);
functioncall.type = (f_correct as IRFunctionDefinition).returnType();
const contract = new IRContractDefinition(13, 0, 0, "C", ContractKind.Contract, false, false, [variable_declare_stmt, f_correct, v4, functioncall], [], [], []);

test("test contract",
() => {
  expect(writer.write(contract.lower())).toBe(`contract C {\n  uint256 x;\n\n  function F(uint256 y) virtual override private view returns (uint256 z) {\n    (uint256 x, uint128 y) = (${literal1.value}, ${literal2.value});\n  }\n}`);
}
)

const new_expr = new IRNew(14, 0, 0, contract.name);
new_expr.type = new ContractType(contract.name);
const functioncall2 = new IRFunctionCall(15, 0, 0, FunctionCallKind.FunctionCall, new_expr, []);
functioncall2.type = new_expr.type.copy();

test("test new",
() => {
  expect(writer.write(functioncall2.lower())).toBe(`new C()`);
}
)