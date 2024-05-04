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
  block,
  Literal
} from "solc-typed-ast"

import { str2hex, assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import { IRLiteral, IRAssignment, IRIdentifier, IRExpression } from "./expression";
import { IRVariableDeclare } from "./declare";
import { irnode_db } from "./db";
import { ConstaintNode, ForwardTypeDependenceDAG } from "./constrant";
import { Type, ElementaryType, all_elementary_types, all_integer_types, varID2Types } from "./type";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
let cur_scope_id = -1;
let field_flag = FieldFlag.GLOBAL;
export const scope2userDefinedTypes = new Map<number, number>();
const type_dag = new ForwardTypeDependenceDAG();
// a set of IRNode ids that have backward type constrants
const backward_type_constrant = new Set<number>();

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

export abstract class Generator {
  irnode : IRNode | undefined;
  astnode : ASTNode | undefined;
  constructor() { }
  abstract generate() : void;
  abstract lower() : void;
}

function generateVarName() : string {
  while (true) {
    const varname = generateRandomString();
    if (!varnames.has(varname)) {
      varnames.add(varname);
      return varname;
    }
  }
  throw new Error("generateVarName: Unreachable code.");
}


function createVariableDeclare() : IRVariableDeclare {
  return new IRVariableDeclare(global_id, cur_scope_id, field_flag, generateVarName());
}

async function getAvaliableIRNodes() : Promise<any[]> {
  return await irnode_db.run("SELECT id FROM tbl WHERE scope <= " + cur_scope_id) as any[];
}


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export class VariableDeclareGenerator extends Generator {
  generate() : void {
    this.irnode = createVariableDeclare();
    global_id++;
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    //TODO: support for other types
    varID2Types.set(this.irnode.id, all_elementary_types);
  }
  lower() : void {
    assert(this.irnode !== undefined, "VariableDeclareGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export class LiteralGenerator extends Generator {
  async generate() : Promise<void> {
    this.irnode = new IRLiteral(global_id, cur_scope_id, field_flag);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
  }
  lower() : void {
    assert(this.irnode !== undefined, "LiteralGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}

export class IdentifierGenerator extends Generator {
  async generate() : Promise<void> {
    const availableIRDecl = await getAvaliableIRNodes();
    assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
    assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
    const irdecl = pickRandomElement(availableIRDecl);
    this.irnode = new IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(irdecl.id, this.irnode.id);
  }
  lower() : void {
    assert(this.irnode !== undefined, "IdentifierGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}


export class AssignmentGenerator extends Generator {

  op : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";

  constructor() {
    super();
    this.op = pickRandomElement(
      ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]
    ) as "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";
  }

  async generate() : Promise<void> {
    await this.generate_literal();
  }

  // generate a literal-involved assignment like "a = 1"
  private async generate_literal() : Promise<void> {
    const identifier_gen = new IdentifierGenerator();
    identifier_gen.generate();
    const literal_gen = new LiteralGenerator();
    literal_gen.generate();
    this.irnode = new IRAssignment(global_id, cur_scope_id, field_flag, identifier_gen.irnode as IRExpression, literal_gen.irnode as IRExpression);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, identifier_gen.irnode!.id);
    type_dag.connect(identifier_gen.irnode!.id, literal_gen.irnode!.id);
    // backward constraint on the left side of the assignment
    assert(identifier_gen.irnode !== undefined, "AssignmentGenerator: identifier_gen.irnode is not generated");
    const node_id = (identifier_gen.irnode as IRIdentifier).reference;
    assert(node_id !== undefined, "AssignmentGenerator: node_id is undefined");
    assert(node_id in varID2Types, "AssignmentGenerator: node_id is not in varID2Types");
    if (this.op === "=") {
      varID2Types.set(node_id, all_integer_types);
    }
    backward_type_constrant.add(node_id);
  }

  lower() : void {
    assert(this.irnode !== undefined, "AssignmentGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower();
  }
}