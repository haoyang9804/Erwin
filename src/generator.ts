import { assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { irnode_db } from "./db";
import { TypeDominanceDAG } from "./constraint";
import { type_focus_kind, expression_complex_level } from "./index";
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
export const type_dag = new TypeDominanceDAG();

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Generator

export abstract class Generator {
  irnode : IRNode | undefined;
  constructor() { }
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

async function getAvailableIRVariableDeclare(scope : number | undefined) : Promise<decl.IRVariableDeclare[]> {
  const collection : decl.IRVariableDeclare[] = [];
  do {
    const results = await irnode_db.run(`SELECT id FROM tbl WHERE scope = ${scope} AND kind = "VariableDeclare"`) as any[];
    assert(results !== undefined, "getAvailableIRVariableDeclare: results is undefined")
    for (let result of results) {
      collection.push(irnodes[result.id] as decl.IRVariableDeclare);
    }
    assert(scope !== undefined, "getAvailableIRVariableDeclare: scope is undefined");
    scope = scope_parent.get(scope!);
  } while (scope !== undefined);
  return collection;
}

export async function hasAvailableIRVariableDeclare(scope : number) : Promise<boolean> {
  return (await getAvailableIRVariableDeclare(scope)).length > 0;
}

export async function getIRNodesByID(id : number) : Promise<IRNode[]> {
  return await irnode_db.run("SELECT * FROM tbl WHERE id = " + id) as IRNode[];
}


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

export class VariableDeclareGenerator extends DeclarationGenerator {
  constructor() { super(); }
  async generate() : Promise<void> {
    this.irnode = createVariableDeclare();
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclare");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    //TODO: support for other types
    switch (type_focus_kind) {
      case -1: case 0:
        type.irnode2types.set(this.irnode.id, type.all_types);
        break;
      case 1:
        type.irnode2types.set(this.irnode.id, type.all_elementary_types);
        break;
      case 2:
        type.irnode2types.set(this.irnode.id, type.all_mapping_types);
        break;
      case 3:
        type.irnode2types.set(this.irnode.id, type.all_function_types);
        break;
      case 4:
        type.irnode2types.set(this.irnode.id, type.all_array_types);
        break;
      default:
        throw new Error(`VariableDeclareGenerator: type_focus_kind ${type_focus_kind} is invalid`);
    }
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  constructor() { super(); }
  // If component is 0, the generator will generate a complete statement and update scope_stmt.
  // Otherwise, the generator will generate a component of a statement.
  // The positive number of the component indicates the complex level of the component.
  // For instance, x = a + b contains a binary operation component with complex level 1,
  // while x = a + (b += c) contains a binary operation component with complex level 1 and an assignment component with complex level 2.
  // If the complex level reaches the maximum, the generator will generate a terminal expression such as an identifier expression.
  abstract generate(component : number) : void;
}

export abstract class LValueGenerator extends ExpressionGenerator {
  constructor() { super(); }
  abstract generate(component : number) : void;
}

export abstract class RValueGenerator extends ExpressionGenerator {
  constructor() { super(); }
  abstract generate(component : number) : void;
}

export abstract class LRValueGenerator extends ExpressionGenerator {
  constructor() { super(); }
  abstract generate(component : number) : void;
}

export class LiteralGenerator extends RValueGenerator {
  constructor() { super(); }
  async generate(component : number) : Promise<void> {
    this.irnode = new exp.IRLiteral(global_id, cur_scope_id, field_flag);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Literal");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, type.all_literal_types);
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  id : number | undefined;
  constructor(id ?: number) {
    super();
    this.id = id;
  }
  async generate(component : number) : Promise<void> {
    // Generate a variable decl if there is no variable decl available.
    if (this.id === undefined && !(await hasAvailableIRVariableDeclare(cur_scope_id))) {
      const variable_stmt_gen = new VariableDeclareStatementGenerator();
      await variable_stmt_gen.generate();
    }
    // generate an identifier
    let irdecl : decl.IRVariableDeclare;
    if (this.id === undefined) {
      assert(await hasAvailableIRVariableDeclare(cur_scope_id), "IdentifierGenerator: no available IR irnodes");
      const availableIRDecl = await getAvailableIRVariableDeclare(cur_scope_id);
      assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
      assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      irdecl = pickRandomElement(availableIRDecl)!;
      this.irnode = new exp.IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    else {
      assert(this.id! < irnodes.length, "IdentifierGenerator: this.id is out of range");
      assert(irnodes[this.id!]! instanceof decl.IRVariableDeclare, `IdentifierGenerator: irnodes[${this.id!}] is not IRVariableDeclare`);
      irdecl = irnodes[this.id!]! as decl.IRVariableDeclare;
      this.irnode = new exp.IRIdentifier(global_id, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Identifier");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    switch (type_focus_kind) {
      case -1: case 0:
        type.irnode2types.set(this.irnode.id, type.all_types);
        break;
      case 1:
        type.irnode2types.set(this.irnode.id, type.all_elementary_types);
        break;
      case 2:
        type.irnode2types.set(this.irnode.id, type.all_mapping_types);
        break;
      case 3:
        type.irnode2types.set(this.irnode.id, type.all_function_types);
        break;
      case 4:
        type.irnode2types.set(this.irnode.id, type.all_array_types);
        break;
      default:
        throw new Error(`VariableDeclareGenerator: type_focus_kind ${type_focus_kind} is invalid`);
    }
    type_dag.connect(this.irnode.id, irdecl.id);
  }
}


export class AssignmentGenerator extends RValueGenerator {

  op : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=" | undefined;

  constructor(op ?: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=") {
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

  async generate(component : number) : Promise<void> {
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
      const right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      const right_expression_gen = new right_expression_gen_prototype();
      await right_expression_gen.generate(component + 1);
      right_expression = right_expression_gen.irnode as exp.IRExpression;
    }
    this.irnode = new exp.IRAssignment(global_id, cur_scope_id, field_flag, left_expression, right_expression, this.op!);
    // Post-Generation
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Assignment");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (this.op === "=") {
      switch (type_focus_kind) {
        case -1: case 0:
          type.irnode2types.set(this.irnode.id, type.all_types);
          break;
        case 1:
          type.irnode2types.set(this.irnode.id, type.all_elementary_types);
          break;
        case 2:
          type.irnode2types.set(this.irnode.id, type.all_mapping_types);
          break;
        case 3:
          type.irnode2types.set(this.irnode.id, type.all_function_types);
          break;
        case 4:
          type.irnode2types.set(this.irnode.id, type.all_array_types);
          break;
        default:
          throw new Error(`VariableDeclareGenerator: type_focus_kind ${type_focus_kind} is invalid`);
      }
    }
    else {
      type.irnode2types.set(this.irnode.id, type.all_integer_types);
    }
    type_dag.connect(this.irnode.id, left_expression.id);
    if (type_focus_kind === -1) {
      type_dag.connect(left_expression.id, right_expression.id);
    }
    else {
      type_dag.connect(left_expression.id, right_expression.id, "subtype");
    }
  }
}

export class BinaryOpGenerator extends RValueGenerator {
  constructor() { super(); }
  async generate(component : number) : Promise<void> {
    let left_expression : exp.IRExpression;
    let right_expression : exp.IRExpression;
    if (component >= expression_complex_level) {
      const left_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const left_expression_gen = new left_expression_gen_prototype();
      await left_expression_gen.generate(component + 1);
      left_expression = left_expression_gen.irnode as exp.IRExpression;
      const right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const right_expression_gen = new right_expression_gen_prototype();
      await right_expression_gen.generate(component + 1);
      right_expression = right_expression_gen.irnode as exp.IRExpression;
    }
    else {
      const left_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      const left_expression_gen = new left_expression_gen_prototype();
      await left_expression_gen.generate(component + 1);
      left_expression = left_expression_gen.irnode as exp.IRExpression;
      const right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      const right_expression_gen = new right_expression_gen_prototype();
      await right_expression_gen.generate(component + 1);
      right_expression = right_expression_gen.irnode as exp.IRExpression;
    }
    const op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
    this.irnode = new exp.IRBinaryOp(global_id, cur_scope_id, field_flag, left_expression, right_expression, op);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "BinaryOp");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (op === "&&" || op === "||") {
      type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
    }
    else type.irnode2types.set(this.irnode.id, type.all_integer_types);
    type_dag.connect(this.irnode.id, left_expression.id);
    if (type_focus_kind === -1) {
      type_dag.connect(left_expression.id, right_expression.id);
    }
    else {
      type_dag.connect(left_expression.id, right_expression.id, "subtype");
    }
  }
}

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  constructor() { super(); }
  async generate(component : number) : Promise<void> {
    const identifier_gen = new IdentifierGenerator();
    await identifier_gen.generate(component + 1);
    let expression : exp.IRExpression = identifier_gen.irnode! as exp.IRExpression;
    let op = pickRandomElement(["!", "-", "~", "++", "--"])!;
    this.irnode = new exp.IRUnaryOp(global_id, cur_scope_id, field_flag, pickRandomElement([true, false])!, expression, op)!);
    global_id++;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "UnaryOp");
    assert(expression instanceof exp.IRIdentifier, "UnaryOpGenerator: expression is not IRIdentifier");
    assert((expression as exp.IRIdentifier).reference !== undefined, "UnaryOpGenerator: expression.reference is undefined");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (op === "!") type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
    else type.irnode2types.set(this.irnode.id, type.all_integer_types);
    type_dag.connect(this.irnode.id, expression.id);
  }
}

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
]

const all_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator
]

const nonterminal_expression_generators = [
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator
]

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

export abstract class StatementGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

export class VariableDeclareStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  async generate() : Promise<void> {
    let expression_gen_prototype;
    if (await hasAvailableIRVariableDeclare(cur_scope_id)) {
      expression_gen_prototype = pickRandomElement(all_expression_generators)!;
    }
    else {
      expression_gen_prototype = LiteralGenerator;
    }
    const expression_gen = new expression_gen_prototype();
    await expression_gen.generate(0);
    const variable_gen = new VariableDeclareGenerator();
    await variable_gen.generate();
    this.irnode = new stmt.IRVariableDeclareStatement(global_id, cur_scope_id, field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as exp.IRExpression);
    global_id++;
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclareStatement");
    if (type_focus_kind === -1) {
      type_dag.connect(expression_gen.irnode!.id, variable_gen.irnode!.id);
    }
    else {
      type_dag.connect(expression_gen.irnode!.id, variable_gen.irnode!.id, "supertype");
    }
  }
}

export abstract class ExpressionStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  async generate() : Promise<void> { }
}

export class AssignmentStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  async generate() : Promise<void> {
    const assignment_gen = new AssignmentGenerator();
    await assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id, cur_scope_id, field_flag, assignment_gen.irnode! as exp.IRAssignment);
    global_id++;
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "AssignmentStatement");
  }
}
