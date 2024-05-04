import {
  ASTNodeFactory,
  ASTNode,
  ContractKind,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability,
  DataLocation,
  StateVariableVisibility,
  Mutability,
  LiteralKind,
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  ParameterList
} from "solc-typed-ast"

const factory = new ASTNodeFactory();
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test('test a trivial Solidity program generation',
() => {
  const variable_type = factory.makeElementaryTypeName("??", "uint256")
  const variable_node = factory.makeVariableDeclaration(false, false, "x", 1, false, DataLocation.Default, StateVariableVisibility.Default, Mutability.Mutable, "any type", undefined, variable_type);
  const variable_type2 = factory.makeElementaryTypeName("??", "uint256")
  const variable_node2 = factory.makeVariableDeclaration(false, false, "", 1, false, DataLocation.Default, StateVariableVisibility.Default, Mutability.Mutable, "any type", undefined, variable_type2);
  const parameter_list_node = factory.makeParameterList([variable_node]);
  const parameter_list_node2 = factory.makeParameterList([variable_node2]);
  const x_1 = factory.makeIdentifier("any type", "x", 1);
  const literal_1 = factory.makeLiteral("Uh? No idea..", LiteralKind.Number, "", "333");
  const assignment_1 = factory.makeAssignment("any type", "+=", x_1, literal_1);
  const x_2 = factory.makeIdentifier("any type", "x", 1);
  const return_1 = factory.makeReturn(3, x_2);
  const statement_node_1 = factory.makeExpressionStatement(assignment_1);
  const statement_node_2 = return_1;
  const block_1 = factory.makeBlock([statement_node_1, statement_node_2]);
  const function_node = factory.makeFunctionDefinition(2, FunctionKind.Function, 'f', false, FunctionVisibility.Public, FunctionStateMutability.Pure, false, parameter_list_node, parameter_list_node2, [], undefined, block_1);
  const contract_node = factory.makeContractDefinition("C", -1, ContractKind.Contract, false, true, [], [], [], undefined, [function_node]);
  const result = writer.write(contract_node);
  expect(result).toBe(
`contract C {
  function f(uint256 x) public pure returns (uint256) {
    x += 333;
    return x;
  }
}`
);
}
)

test("test function generation",
() => {
  const var_function_def1 = factory.makeVariableDeclaration(
    false,
    false,
    "f",
    1,
    false,
    DataLocation.Default,
    StateVariableVisibility.Default,
    Mutability.Mutable,
    "any type",
    undefined,
    factory.makeFunctionTypeName(
      "any type",
      FunctionVisibility.External,
      FunctionStateMutability.Pure,
      factory.makeParameterList(
        [
          factory.makeVariableDeclaration(false, false, "x", 1, false, DataLocation.Default, StateVariableVisibility.Default, Mutability.Mutable, "uint256", undefined, factory.makeElementaryTypeName("uint256", "uint256"))
        ],
      ),
      factory.makeParameterList(
        [
          factory.makeVariableDeclaration(false, false, "", 1, false, DataLocation.Default, StateVariableVisibility.Default, Mutability.Mutable, "uint256", undefined, factory.makeElementaryTypeName("uint256", "uint256"))
        ]
      )
    ));
  expect(writer.write(var_function_def1)).toBe("function(uint256 x) external pure returns (uint256) f");
}
)

test("test type alias generation",
() => {
  const user_defined_type = factory.makeUserDefinedTypeName("", "x", 1);
  expect(writer.write(user_defined_type)).toBe("x");
  const user_defined_type_definiiton = factory.makeUserDefinedValueTypeDefinition("x", factory.makeElementaryTypeName("", "uint256"));
  expect(writer.write(user_defined_type_definiiton)).toBe("type x is uint256;");
}
)

test("test enum generation",
() => {
  const enumvalue1 = factory.makeEnumValue("x");
  const enumvalue2 = factory.makeEnumValue("y");
  const enumvalue3 = factory.makeEnumValue("z");
  const enum_definition = factory.makeEnumDefinition("E", [enumvalue1, enumvalue2, enumvalue3]);
  expect(writer.write(enum_definition)).toBe("enum E {\n  x,\n  y,\n  z\n}");
}
)