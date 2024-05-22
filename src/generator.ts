import { assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { irnode_db } from "./db";
import { ForwardTypeDependenceDAG } from "./constraint";
import { type_focus_kind, expression_complex_level } from "./index";
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
  constructor() {}
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


function createVariableDeclare() : decl.IRVariableDeclare {
  return new decl.IRVariableDeclare(global_id, cur_scope_id, field_flag, generateVarName());
}

async function getAvailableIRVariableDeclare(scope : number) : Promise<decl.IRVariableDeclare[]> {
  const collection: decl.IRVariableDeclare[] = [];
  do {
    const results = await irnode_db.run(`SELECT id FROM tbl WHERE scope = ${scope} AND kind = "VariableDeclare"`);
    assert(results !== undefined, "getAvailableIRVariableDeclare: results is undefined")
    for (let result of results) {
      collection.push(irnodes[result.id] as decl.IRVariableDeclare);
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

export abstract class DeclarationGenerator extends Generator {
  abstract generate() : void;
}

export class VariableDeclareGenerator extends DeclarationGenerator {
  async generate() : Promise<void> {
    this.irnode = createVariableDeclare();
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclare");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    //TODO: support for other types
    switch (type_focus_kind) {
      case 0:
        type.varID2Types.set(this.irnode.id, all_types);
        break;
      case 1:
        type.varID2Types.set(this.irnode.id, all_elementary_types);
        break;
      case 2:
        type.varID2Types.set(this.irnode.id, all_mapping_types);
        break;
      case 3:
        type.varID2Types.set(this.irnode.id, all_function_types);
        break;
      case 4:
        type.varID2Types.set(this.irnode.id, all_array_types);
        break;
      default:
        throw new Error(`VariableDeclareGenerator: type_focus_kind ${type_focus_kind} is invalid`);
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  // If component is 0, the generator will generate a complete statement and update scope_stmt.
  // Otherwise, the generator will generate a component of a statement.
  // The positive number of the component indicates the complex level of the component.
  // For instance, x = a + b contains a binary operation component with complex level 1,
  // while x = a + (b += c) contains a binary operation component with complex level 1 and an assignment component with complex level 2.
  // If the complex level reaches the maximum, the generator will generate a terminal expression such as an identifier expression.
  abstract generate(component: number) : void;
}

export class LiteralGenerator extends ExpressionGenerator {
  async generate(component: number) : Promise<void> {
    this.irnode = new exp.IRLiteral(global_id, cur_scope_id, field_flag);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Literal");
    type_dag.insert(type_dag.newNode(this.irnode.id));
  }
}

export class IdentifierGenerator extends ExpressionGenerator {
  id : number | undefined;
  constructor(id ?: number) {
    super();
    this.id = id;
  }
  async generate(component: number) : Promise<void> {
    // Generate a variable decl if there is no variable decl available.
    if (this.id === undefined && !(await hasAvailableIRVariableDeclare(cur_scope_id))) {
      const variable_gen = new VariableDeclareGenerator();
      await variable_gen.generate();
    }
    // generate an identifier
    let irdecl : decl.IRVariableDeclare;
    if (this.id === undefined) {
      const availableIRDecl = await getAvailableIRVariableDeclare(cur_scope_id);
      assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pickRandomElement(availableIRDecl)!;
      this.irnode = new exp.IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    else {
      irdecl = irnodes[this.id!] as decl.IRVariableDeclare;
      this.irnode = new exp.IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Identifier");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(irdecl.id, this.irnode.id);
  }
}


export class AssignmentGenerator extends ExpressionGenerator {

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

  async generate(component: number) : Promise<void> {

    const identifier_gen = new IdentifierGenerator();
    await identifier_gen.generate(component + 1);
    let left_expression : exp.IRExpression = identifier_gen.irnode as exp.IRExpression;
    let right_expression : exp.IRExpression;
    if (component >= expression_complex_level) {
      const right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const right_expression_gen = new right_expression_gen_prototype();
      await right_expression_gen.generate(component + 1);
      right_expression = right_expression_gen.irnode as exp.IRExpression;
    }
    else {
      const right_expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      const right_expression_gen = new right_expression_gen_prototype();
      await right_expression_gen.generate(component + 1);
      right_expression = right_expression_gen.irnode as exp.IRExpression;
    }
    this.irnode = new exp.IRAssignment(global_id, cur_scope_id, field_flag, left_expression, right_expression, this.op!);
    // Post-Generation
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
      const v_id = (left_expression as exp.IRIdentifier).reference;
      assert(v_id !== undefined, `AssignmentGenerator: v_id ${v_id} is undefined`);
      assert(type.varID2Types.has(v_id), `AssignmentGenerator: v_id ${v_id} is not in type.varID2Types`);
      type.varID2Types.set(v_id, type.all_integer_types);
    }
  }
}

// export class BinaryOpGenerator extends Generator {
//   async generate(component: number) : Promise<void> {
//   }
// }

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
]

const all_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator
]

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

export abstract class StatementGenerator extends Generator {
  abstract generate() : void;
}

export class VariableDeclareStatementGenerator extends StatementGenerator {
  async generate() : Promise<void> {
    const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
    const expression_gen = new expression_gen_prototype();
    await expression_gen.generate(0);
    const variable_gen = new VariableDeclareGenerator();
    await variable_gen.generate();
    this.irnode = new stmt.IRVariableDeclareStatement(global_id, cur_scope_id, field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as exp.IRExpression);
    global_id++;
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclareStatement");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(variable_gen.irnode!.id, expression_gen.irnode!.id);
  }
}

export class ExpressionStatementGenerator extends StatementGenerator {
  async generate() : Promise<void> {
    const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
    const expression_gen = new expression_gen_prototype();
    await expression_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id, cur_scope_id, field_flag, expression_gen.irnode! as exp.IRExpression);
    global_id++;
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "ExpressionStatement");
  }
}

export class AssignmentStatementGenerator extends StatementGenerator {
  async generate() : Promise<void> {
    const assignment_gen = new AssignmentGenerator();
    await assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id, cur_scope_id, field_flag, assignment_gen.irnode! as exp.IRAssignment);
    global_id++;
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id)? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "AssignmentStatement");
  }
}