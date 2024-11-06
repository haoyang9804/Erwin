import { TypeProvider } from "../src/type"
import { IRVariableDeclaration, IRFunctionDefinition, IRContractDefinition } from "../src/declare";
import { IRIdentifier, IRLiteral, IRTuple, IRFunctionCall, IRNew } from "../src/expression";
import { IRVariableDeclarationStatement } from "../src/statement";
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
import { config } from '../src/config';
config.unit_test_mode = true;
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

const variable1 = new IRVariableDeclaration(0, 0, "x");
variable1.type = TypeProvider.uint256()
const variable2 = new IRVariableDeclaration(1, 0, "y");
variable2.type = TypeProvider.uint128();
const literal1 = new IRLiteral(2, 0);
literal1.type = TypeProvider.uint256()
const literal2 = new IRLiteral(3, 0);
literal2.type = TypeProvider.uint128();
const tuple = new IRTuple(5, 0, [literal1, literal2]);
const variable_declare_stmt = new IRVariableDeclarationStatement(4, 0, [variable1, variable2], tuple);

const v2 = new IRVariableDeclaration(6, 0, "y");
v2.type = TypeProvider.uint256()
const v3 = new IRVariableDeclaration(7, 0, "z");
v3.type = TypeProvider.uint256()
const f_correct = new IRFunctionDefinition(8, 0, "F", FunctionKind.Function,
true, true,
[v2], [v3], [variable_declare_stmt], [], FunctionVisibility.Private, FunctionStateMutability.View);

const v4 = new IRVariableDeclaration(9, 0, "x");
v4.type = TypeProvider.uint256()
const id4 = new IRIdentifier(10, 0).from(v4);
const f_id = new IRIdentifier(11, 0, f_correct.name, f_correct.id);
const functioncall = new IRFunctionCall(12, 0, FunctionCallKind.FunctionCall, f_id, [id4]);
const contract = new IRContractDefinition(13, 0, "C", ContractKind.Contract, false, false, [variable_declare_stmt, f_correct, v4, functioncall], [], [], [], []);

test("test contract",
() => {
  expect(writer.write(contract.lower())).toBe(`contract C {\n  uint256 x;\n\n  function F(uint256 y) virtual override private view returns (uint256 z) {\n    (uint256 x, uint128 y) = (${literal1.value}, ${literal2.value});\n  }\n}`);
}
)

const new_expr = new IRNew(14, 0, contract.name);
const functioncall2 = new IRFunctionCall(15, 0, FunctionCallKind.FunctionCall, new_expr, []);

test("test new",
() => {
  expect(writer.write(functioncall2.lower())).toBe(`new C()`);
}
)