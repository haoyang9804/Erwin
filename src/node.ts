import { ASTNode, ContractDefinition, ContractKind } from "solc-typed-ast"

abstract class NodePlayer {
  abstract do(node: ASTNode): ASTNode;
}

abstract class Mutator extends NodePlayer {
  abstract do(node: ASTNode): ASTNode;
}

class TrivialMutator extends Mutator {
  do(node: ASTNode): ASTNode {
    return node;
  }
}

abstract class Generator {
  abstract generate(): ASTNode;
}

class TrivialGenerator extends Generator {
  generate(): ASTNode {
    let contract_content = `
    contract C {
        function f(uint x) public pure returns (uint) {
            x += 1;
            return x;
        }
    }
    `
    let length = "57:" + contract_content.length.toString() + ":0";
    // scope can by assigned any value and does not affect the output
    let contract_node = new ContractDefinition(0, length, "C", 0, ContractKind.Contract, false, true, [], [], [], "doc", []);
    return contract_node;
  }
}

import { ASTWriter } from "solc-typed-ast";

let g = new TrivialGenerator()
g.do()