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

import { str2hex, assert, pickRandomElement } from "./utility.js";
import { irnodes, IRNode, IRVariableDeclare, IRLiteral, IRAssignment, IRIdentifier } from "./node.js";
import { irnode_db } from "./db.js";
import { dag_nodes } from "./constrant.js";

export abstract class Generator {
  irnode: IRNode | undefined;
  astnode: ASTNode | undefined;
  constructor() {}
  abstract generate() : void;
  abstract lower() : void;
}

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const varnames = new Set<string>();
let global_id = 0;
let cur_scope_id = 1;

function generateRandomString_fixedLength(length : number) : string {
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

function generateRandomString_randomLength(minLength : number, maxLength : number) : string {
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

//TODO: add a config to specify whether to generate a random string of fixed length
function generateRandomString() : string {
  return generateRandomString_fixedLength(5);
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


function createVariableDeclare(indexed?: boolean, constant?: boolean, state?: boolean, memory ?: DataLocation, visibility ?: StateVariableVisibility, mutable ?: Mutability, type ?: string) : IRVariableDeclare {
  return new IRVariableDeclare(global_id, cur_scope_id, generateVarName(), indexed, constant, state, memory, visibility, mutable, type);
}

async function getAvaliableIRNodes() : Promise<any[]> {
  return await irnode_db.run("SELECT id FROM tbl WHERE scope <= " + cur_scope_id) as any[];
}


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export class VariableDeclareGenerator extends Generator {
  generate() : void {
    global_id++;
    this.irnode = createVariableDeclare();
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    irnodes.push(this.irnode);
  }
  lower() : void {
    assert(this.irnode !== undefined, "VariableDeclareGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export class LiteralGenerator extends Generator {
  generate() : void {
    global_id++;
    this.irnode = new IRLiteral(global_id, cur_scope_id);
  }
  lower() : void {
    assert(this.irnode !== undefined, "LiteralGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}

export class IdentifierGenerator extends Generator {
  async generate(): Promise<void> {
    global_id++;
    const availableIRDecl = await getAvaliableIRNodes();
    assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
    this.irnode = new IRIdentifier(global_id, cur_scope_id);
  }
  lower() : void {
    assert(this.irnode !== undefined, "IdentifierGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}


export class AssignmentGenerator extends Generator {

  async generate(): Promise<void> {
    global_id++;
    const availableIRDecl = await getAvaliableIRNodes();
    assert(availableIRDecl !== undefined, "AssignmentGenerator: availableIRDecl is undefined");
    assert(availableIRDecl.length > 0, "AssignmentGenerator: no available IR irnodes");
    const left = irnodes[pickRandomElement(availableIRDecl)];
    //TODO: change the generation of right to a random generation
    let literal_gen = new LiteralGenerator();
    literal_gen.generate();
    this.irnode = new IRAssignment(global_id, cur_scope_id, left, literal_gen.irnode as IRNode);
  }
  lower(): void {
    assert(this.irnode !== undefined, "AssignmentGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower();
  }
}