import { ElementaryType, UnionType } from "../src/type"
import { IRModifier, IRVariableDeclare, IRFunctionDefinition } from "../src/declare";
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
  FunctionCallKind
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

const v1 = new IRVariableDeclare(1, 0, 0, "x");
v1.type = new ElementaryType("uint256", "nonpayable");
const id1 = new IRIdentifier(2,0,0).from(v1);
id1.type = new ElementaryType("uint256", "nonpayable");
const id2 = new IRIdentifier(3,0,0).from(v1);
id2.type = new ElementaryType("uint256", "nonpayable");
const op = new IRBinaryOp(4,0,0,id1,id2,"+");
op.type = new ElementaryType("uint256", "nonpayable");
const op_stmt = new IRExpressionStatement(5,0,0,op);

const modifier_error = new IRModifier(0, 0, 0, "M", true, true, "internal", [v1], [op_stmt]);
test("test modifier 1",
() => {
  expect(async() => {
    writer.write(modifier_error.lower())
}).rejects.toThrow("IRModifier: body does not contain placeholder");
}
)

const modifier_correct = new IRModifier(0, 0, 0, "M", true, false, "intrnal", [v1], [op_stmt, new IRPlaceholderStatement(5,0,0)]);
test("test modifier 2",
() => {
  expect(writer.write(modifier_correct.lower())).toBe("modifier M(uint256 x) virtual {\n  x + x;\n  _;\n}");
}
)

const v2 = new IRVariableDeclare(5, 0, 0, "y");
v2.type = new ElementaryType("uint256", "nonpayable");

const v3 = new IRVariableDeclare(6, 0, 0, "z");
v3.type = new ElementaryType("uint256", "nonpayable");



const f_correct = new IRFunctionDefinition(7, 0, 0, "F", FunctionKind.Function,
true, true, FunctionVisibility.Private, FunctionStateMutability.View,
[v2], [v3], [variable_declare_stmt], [{name: "M", arg_names: ["x"]}]);

test("test function 1",
() => {
  expect(writer.write(f_correct.lower())).toBe("function F(uint256 y) virtual override private view M(x) returns (uint256 z) {\n  (uint256 x, uint128 y) = (" + literal1.value + ", " + literal2.value + ");\n}")
}
)


test("test function 2",
() => {
  expect(async() => { new IRFunctionDefinition(7, 0, 0, "F", FunctionKind.Function,
  true, true, FunctionVisibility.Default, FunctionStateMutability.View,
  [v2], [v3], [], [{name: "M", arg_names: ["x"]}]) }).rejects.toThrow(
    "IRFunctionDefinition: visibility is default");
}
)

const v4 = new IRVariableDeclare(8, 0, 0, "x");
v4.type = new ElementaryType("uint256", "nonpayable");
const id4 = new IRIdentifier(9,0,0).from(v4);
id4.type = new ElementaryType("uint256", "nonpayable");
const f_id = new IRIdentifier(11, 0, 0, f_correct.name, f_correct.id);
f_id.type = (f_correct as IRFunctionDefinition).functionType();

test("test function identifier's type",
() => {
  expect(f_id.type!.str()).toBe("function (uint256) view private returns (uint256)");
}
)

const functioncall = new IRFunctionCall(10, 0, 0, FunctionCallKind.FunctionCall, f_id, [id4]);
functioncall.type = (f_correct as IRFunctionDefinition).returnType();

test("test function call",
() => {
  expect(writer.write(functioncall.lower())).toBe("F(x)");
}
)