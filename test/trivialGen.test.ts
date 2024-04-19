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
  LatestCompilerVersion
} from "solc-typed-ast"

const factory = new ASTNodeFactory();

const variable_node = factory.makeVariableDeclaration(false, false, "x", 1, false, DataLocation.Memory, StateVariableVisibility.Default, Mutability.Mutable, "uint256");
const parameter_list_node = factory.makeParameterList([variable_node]);
const x_1 = factory.makeIdentifier("uint256", "x", 1);
const literal_1 = factory.makeLiteral("Uh? No idea..", LiteralKind.Number, "", "333");
const assignment_1 = factory.makeAssignment("uint256", "+=", x_1, literal_1);
const x_2 = factory.makeIdentifier("uint256", "x", 1);
const return_1 = factory.makeReturn(3, x_2);
const statement_node_1 = factory.makeExpressionStatement(assignment_1);
const statement_node_2 = return_1;
const block_1 = factory.makeBlock([statement_node_1, statement_node_2]);
const function_node = factory.makeFunctionDefinition(2, FunctionKind.Function, 'f', false, FunctionVisibility.Public, FunctionStateMutability.Pure, false, parameter_list_node, parameter_list_node, [], undefined, block_1);
const contract_node = factory.makeContractDefinition("C", -1, ContractKind.Contract, false, true, [], [], [], undefined, [function_node]);
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);
const result = writer.write(contract_node);

test('test a trivial Solidity program generation',
() => {
  expect(result).toBe(
`contract C {
  function f(memory x) public pure returns (memory x) {
    x += 333;
    return x;
  }
}`);
}
)