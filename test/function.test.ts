import { ElementaryType } from "../src/type"
import { IRModifier, IRVariableDeclare, IRFunctionDefinition, Modifier } from "../src/declare";
import { IRIdentifier, IRBinaryOp } from "../src/expression";
import { IRPlaceholderStatement } from "../src/statement";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  VariableDeclaration,
  Identifier,
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

const v1 = new IRVariableDeclare(1, 0, 0, "x");
v1.type = new ElementaryType("uint256", "nonpayable");
const id1 = new IRIdentifier(2,0,0).from(v1);
id1.type = new ElementaryType("uint256", "nonpayable");
const id2 = new IRIdentifier(3,0,0).from(v1);
id2.type = new ElementaryType("uint256", "nonpayable");
const op = new IRBinaryOp(4,0,0,id1,id2,"+");
op.type = new ElementaryType("uint256", "nonpayable");

const modifier_error = new IRModifier(0, 0, 0, "M", true, true, "internal", [v1], [op]);
test("test modifier 1",
() => {
  expect(async() => {
    writer.write(modifier_error.lower())
}).rejects.toThrow("IRModifier: body does not contain placeholder");
}
)

const modifier_correct = new IRModifier(0, 0, 0, "M", true, false, "intrnal", [v1], [op, new IRPlaceholderStatement(5,0,0)]);
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
[v2], [v3], [], [{name: "M", arg_names: ["x"]}]);

test("test function 1",
() => {
  expect(writer.write(f_correct.lower())).toBe("function F(uint256 y) virtual override private view M(x) returns (uint256 z) {}");
}
)


const f_error = new IRFunctionDefinition(7, 0, 0, "F", FunctionKind.Function,
true, true, FunctionVisibility.Default, FunctionStateMutability.View,
[v2], [v3], [], [{name: "M", arg_names: ["x"]}]);


test("test function 2",
() => {
  expect(async() => { writer.write(f_error.lower()) }).rejects.toThrow(
    "IRFunctionDefinition: visibility is not set");
}
)