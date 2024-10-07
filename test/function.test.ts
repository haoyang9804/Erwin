import { TypeProvider, StructType } from "../src/type"
import { IRModifier, IRVariableDeclaration, IRFunctionDefinition } from "../src/declare";
import { IRIdentifier, IRBinaryOp, IRLiteral, IRTuple, IRFunctionCall } from "../src/expression";
import { IRPlaceholderStatement, IRVariableDeclareStatement, IRExpressionStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability,
  FunctionCallKind,
  DataLocation
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
variable1.type = TypeProvider.uint256();
const variable2 = new IRVariableDeclaration(1, 0, "y");
variable2.type = TypeProvider.uint256();
const literal1 = new IRLiteral(2, 0);
literal1.type = TypeProvider.uint256();
const literal2 = new IRLiteral(3, 0);
literal2.type = TypeProvider.uint256();
const tuple = new IRTuple(5, 0, [literal1, literal2]);
const variable_declare_stmt = new IRVariableDeclareStatement(4, 0, [variable1, variable2], tuple);

const v1 = new IRVariableDeclaration(1, 0, "x");
v1.type = TypeProvider.uint256();
const id1 = new IRIdentifier(2,0).from(v1);
const id2 = new IRIdentifier(3,0).from(v1);
const op = new IRBinaryOp(4,0,id1,id2,"+");
const op_stmt = new IRExpressionStatement(5,0,op);

const modifier_error = new IRModifier(0, 0, "M", true, true, "internal", [v1], [op_stmt]);
test("test modifier 1",
() => {
  expect(async() => {
    writer.write(modifier_error.lower())
}).rejects.toThrow("IRModifier: body does not contain placeholder");
}
)

const modifier_correct = new IRModifier(0, 0, "M", true, false, "intrnal", [v1], [op_stmt, new IRPlaceholderStatement(5,0)]);
test("test modifier 2",
() => {
  expect(writer.write(modifier_correct.lower())).toBe("modifier M(uint256 x) virtual {\n  x + x;\n  _;\n}");
}
)

const v2 = new IRVariableDeclaration(5, 0, "y");
v2.type = new StructType(100, "S", "struct S")
v2.loc= DataLocation.Memory

const v3 = new IRVariableDeclaration(6, 0, "z");
v3.type = TypeProvider.uint256()



const f_correct = new IRFunctionDefinition(7, 0, "F", FunctionKind.Function,
true, true, [v2], [v3], [variable_declare_stmt], [{name: "M", arg_names: ["x"]}], FunctionVisibility.Private, FunctionStateMutability.View);

test("test function 1",
() => {
  expect(writer.write(f_correct.lower())).toBe("function F(S y) virtual override private view M(x) returns (uint256 z) {\n  (uint256 x, uint256 y) = (" + literal1.value + ", " + literal2.value + ");\n}")
}
)

const v4 = new IRVariableDeclaration(8, 0, "x");
v4.type = TypeProvider.uint256()
const id4 = new IRIdentifier(9,0).from(v4);
const f_id = new IRIdentifier(11, 0, f_correct.name, f_correct.id);

const functioncall = new IRFunctionCall(10, 0, FunctionCallKind.FunctionCall, f_id, [id4]);

test("test function call",
() => {
  expect(writer.write(functioncall.lower())).toBe("F(x)");
}
)