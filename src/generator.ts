import {
  ASTNode,
} from "solc-typed-ast"

import { assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import { IRLiteral, IRAssignment, IRIdentifier, IRExpression } from "./expression";
import { IRVariableDeclare } from "./declare";
import { irnode_db } from "./db";
import { ForwardTypeDependenceDAG } from "./constraint";
import { all_integer_types, varID2Types } from "./type";
import { type_focus_kind } from "./index";
import { all_types, all_array_types, all_elementary_types, all_function_types, all_mapping_types } from "./type";
import { irnodes } from "./node";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
let cur_scope_id = 0;
// Record statements in each scope.
export const scope_stmt = new Map<number, IRNode[]>();
// Record the parent scope of each scope.
const scope_parent = new Map<number, number>();
let field_flag = FieldFlag.GLOBAL;
export const scope2userDefinedTypes = new Map<number, number>();
export const type_dag = new ForwardTypeDependenceDAG();

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

export abstract class Generator {
  irnode : IRNode | undefined;
  astnode : ASTNode | undefined;
  constructor() { }
  // If component is false, the generator will generate a complete statement and update scope_stmt.
  abstract generate(component: boolean) : void;
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

async function getAvailableIRVariableDeclare(scope : number) : Promise<IRVariableDeclare[]> {
  const collection: IRVariableDeclare[] = [];
  do {
    const results = await irnode_db.run(`SELECT id FROM tbl WHERE scope = ${scope} AND kind = "VariableDeclare"`);
    assert(results !== undefined, "getAvailableIRVariableDeclare: results is undefined")
    for (let result of results) {
      collection.push(irnodes[result.id] as IRVariableDeclare);
    }
  } while (scope_parent.has(scope) && (scope = scope_parent.get(scope)!) !== undefined);
  return collection;
}

async function hasAvailableIRVariableDeclare(scope : number) : Promise<boolean> {
  return (await getAvailableIRVariableDeclare(scope)).length > 0;
}

export async function getIRNodesByID(id : number) : Promise<IRNode[]> {
  return await irnode_db.run("SELECT * FROM tbl WHERE id = " + id) as IRNode[];
}


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export class VariableDeclareGenerator extends Generator {
  async generate(component: boolean) : Promise<void> {
    this.irnode = createVariableDeclare();
    global_id++;
    if (!component)
      scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclare");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    //TODO: support for other types
    switch (type_focus_kind) {
      case 0:
        varID2Types.set(this.irnode.id, all_types);
        break;
      case 1:
        varID2Types.set(this.irnode.id, all_elementary_types);
        break;
      case 2:
        varID2Types.set(this.irnode.id, all_mapping_types);
        break;
      case 3:
        varID2Types.set(this.irnode.id, all_function_types);
        break;
      case 4:
        varID2Types.set(this.irnode.id, all_array_types);
        break;
      default:
        throw new Error(`VariableDeclareGenerator: type_focus_kind ${type_focus_kind} is invalid`);
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export class LiteralGenerator extends Generator {
  async generate(component: boolean) : Promise<void> {
    this.irnode = new IRLiteral(global_id, cur_scope_id, field_flag);
    if (!component)
      scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Literal");
    type_dag.insert(type_dag.newNode(this.irnode.id));
  }
  lower() : void {
    assert(this.irnode !== undefined, "LiteralGenerator: irnode is not generated")
    this.astnode = this.irnode!.lower()
  }
}

export class IdentifierGenerator extends Generator {
  id : number | undefined;
  constructor(id ?: number) {
    super();
    this.id = id;
  }
  async generate(component: boolean) : Promise<void> {
    // Generate a variable decl if there is no variable decl available.
    if (this.id === undefined && !(await hasAvailableIRVariableDeclare(cur_scope_id))) {
      const variable_gen = new VariableDeclareGenerator();
      await variable_gen.generate(false);
    }
    // generate an identifier
    let irdecl : IRVariableDeclare;
    if (this.id === undefined) {
      const availableIRDecl = await getAvailableIRVariableDeclare(cur_scope_id);
      assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pickRandomElement(availableIRDecl)!;
      this.irnode = new IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    else {
      irdecl = irnodes[this.id!] as IRVariableDeclare;
      this.irnode = new IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    if (!component)
      scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Identifier");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(irdecl.id, this.irnode.id);
  }
}


export class AssignmentGenerator extends Generator {

  op : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=" | undefined;

  constructor(op?: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=") {
    super();
    if (op === undefined) {
      this.op = pickRandomElement(
        ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]
      ) as "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";
    }
    else {
      this.op = op;
    }
  }

  async generate() : Promise<void> {
    // left-hand-side identifier
    const identifier_gen = new IdentifierGenerator();
    await identifier_gen.generate(true);
    // specify both the left-hand side and right-hand side of the assignment
    let left_expression : IRExpression = identifier_gen.irnode as IRExpression
    let right_expression : IRExpression;
    // Generate a literal on the righ-hand side with probability 0.8 if there is only one available variable.
    // Otherwise, generate an identifier on the right-hand side with probability 0.2.
    if ((await getAvailableIRVariableDeclare(cur_scope_id)).length === 1 && Math.random() < 0.8 ||
      (await getAvailableIRVariableDeclare(cur_scope_id)).length >= 2 && Math.random() < 0.2) {
      const literal_gen = new LiteralGenerator();
      await literal_gen.generate(true);
      this.irnode = new IRAssignment(global_id, cur_scope_id, field_flag, identifier_gen.irnode as IRExpression, literal_gen.irnode as IRExpression, this.op!);
      right_expression = literal_gen.irnode as IRExpression;
    }
    // Generate a variable declaration otherwise, and place its identifier on the right-hand side.
    // left_identifier op right_identifier
    else {
      const variable_gen = new VariableDeclareGenerator();
      await variable_gen.generate(false);
      // This identifier_gen generates an identifier for the variable declaration generated above.
      const right_identifier_gen = new IdentifierGenerator(global_id - 1);
      await right_identifier_gen.generate(true);
      this.irnode = new IRAssignment(global_id, cur_scope_id, field_flag, identifier_gen.irnode as IRExpression, right_identifier_gen.irnode as IRExpression, this.op!);
      right_expression = right_identifier_gen.irnode as IRExpression;
    }
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Assignment");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, left_expression.id);
    type_dag.connect(left_expression.id, right_expression.id);
    /*
    Suppose the assignment is "x op y", where x is the identifier of variable v.
    If the operator is not "=", then the type of v should be integer type.
    */
    if (this.op !== "=") {
      const v_id = (left_expression as IRIdentifier).reference;
      assert(v_id !== undefined, `AssignmentGenerator: v_id ${v_id} is undefined`);
      assert(varID2Types.has(v_id), `AssignmentGenerator: v_id ${v_id} is not in varID2Types`);
      varID2Types.set(v_id, all_integer_types);
    }
  }

}