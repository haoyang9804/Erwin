import {
  ASTNodeFactory,
  ASTNode,
  ContractDefinition,
  ContractKind,
  FunctionDefinition,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability,
  VariableDeclaration,
  DataLocation,
  StateVariableVisibility,
  Mutability,
  ParameterList,
  LiteralKind,
  block
} from "solc-typed-ast"

abstract class Generator {
  protected factory: ASTNodeFactory;
  constructor() {
    this.factory = new ASTNodeFactory();
  }
  abstract generate(): ASTNode;
}

class TrivialGenerator extends Generator {
  generate(): ASTNode {
    const variable_node = this.factory.makeVariableDeclaration(false, false, "x", 1, false, DataLocation.Memory, StateVariableVisibility.Default, Mutability.Mutable, "uint256");
    const parameter_list_node = this.factory.makeParameterList([variable_node]);
    // const expression_1 = this.factory.makeIdentifier(2, "x", "uint256");
    const x_1 = this.factory.makeIdentifier("uint256", "x", 1);
    const literal_1 = this.factory.makeLiteral("int_const 1", LiteralKind.Number, "", "1");
    const assignment_1 = this.factory.makeAssignment("uint256", "+=", x_1, literal_1);
    const x_2 = this.factory.makeIdentifier("uint256", "x", 1);
    const return_1 = this.factory.makeReturn(3, x_2);
    const statement_node_1 = this.factory.makeExpressionStatement(assignment_1);
    const statement_node_2 = return_1;
    const block_1 = this.factory.makeBlock([statement_node_1, statement_node_2]);
    const function_node = this.factory.makeFunctionDefinition(2, FunctionKind.Function, 'f', false, FunctionVisibility.Public, FunctionStateMutability.Pure, false, parameter_list_node, parameter_list_node, [], undefined, block_1);
    const contract_node = this.factory.makeContractDefinition("C", -1, ContractKind.Contract, false, true, [], [], [], undefined, [function_node]);
    return contract_node;
  }
}

import { ASTWriter, PrettyFormatter, DefaultASTWriterMapping, LatestCompilerVersion } from "solc-typed-ast";
let g = new TrivialGenerator()
let ast_node = g.generate()
// console.log(ast_node)

const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

const contract_node = ast_node as ContractDefinition;
const function_node = contract_node.vFunctions[0];
const statements = function_node.vBody!.vStatements;
for (const statement of statements) {
    console.log('===================================================================')
    console.log(statement)
    console.log('>>> ', writer.write(statement))
}

console.log(writer.write(ast_node));