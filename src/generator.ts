import { assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { irnode_db } from "./db";
import { TypeDominanceDAG } from "./constraint";
import { expression_complex_level, tuple_prob } from "./index";
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
// global_type_context is used to control the selection of ops in the process of op-involved expression generations.
let global_type_context : string = "";
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
  return new decl.IRVariableDeclare(global_id++, cur_scope_id, field_flag, generateVarName());
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
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclare");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, type.elementary_types);
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
    this.irnode = new exp.IRLiteral(global_id++, cur_scope_id, field_flag);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Literal");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, type.literal_types);
    if (Math.random() < tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
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
      this.irnode = new exp.IRIdentifier(global_id++, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    else {
      assert(this.id! < irnodes.length, "IdentifierGenerator: this.id is out of range");
      assert(irnodes[this.id!]! instanceof decl.IRVariableDeclare, `IdentifierGenerator: irnodes[${this.id!}] is not IRVariableDeclare`);
      irdecl = irnodes[this.id!]! as decl.IRVariableDeclare;
      this.irnode = new exp.IRIdentifier(global_id++, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    }
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Identifier");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, type.elementary_types);
    type_dag.connect(this.irnode.id, irdecl.id);
    if (Math.random() < tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class AssignmentGenerator extends RValueGenerator {

  op : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=" | undefined;

  constructor() {
    super();
    switch (global_type_context) {
      case "bool":
        this.op = "=";
        break;
      case "int": case "":
        this.op = pickRandomElement(
          ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]
        ) as "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";
        break;
      default:
        throw new Error(`AssignmentGenerator constructor: global_type_context ${global_type_context} is invalid`);
    }
  }

  async generate(component : number) : Promise<void> {
    let new_type_context = false;
    if (global_type_context === "") {
      if (this.op !== "=") {
        new_type_context = true;
        global_type_context = "int";
      }
    }
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
    this.irnode = new exp.IRAssignment(global_id++, cur_scope_id, field_flag, left_expression, right_expression, this.op!);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Assignment");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (global_type_context === "") {
      type.irnode2types.set(this.irnode.id, type.elementary_types);
    }
    else if (global_type_context === "bool") {
      assert(new_type_context === false, "AssignmentGenerator: new_type_context is true");
      type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
    }
    else if (global_type_context === "int") {
      type.irnode2types.set(this.irnode.id, type.all_integer_types);
    }
    else {
      throw new Error(`AssignmentGenerator generator: global_type_context ${global_type_context} is invalid`);
    }
    let left_extracted_expression = left_expression;
    while (left_extracted_expression instanceof exp.IRTuple) {
      assert(left_extracted_expression.components.length === 1, "AssignmentGenerator: left_extracted_expression.components.length is not 1");
      left_extracted_expression = left_extracted_expression.components[0];
    }
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "AssignmentGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    type_dag.connect(this.irnode.id, left_extracted_expression.id);
    if (this.op === ">>=" || this.op === "<<=") {
      type.irnode2types.set(right_extracted_expression.id, type.uinteger_types);
    }
    else {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "subtype");
    }
    if (new_type_context) {
      global_type_context = "";
    }
    if (component !== 0) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
    else if (Math.random() < tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class BinaryOpGenerator extends RValueGenerator {
  op : "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "^" | "|" | "&&" | "||";
  constructor() {
    super();
    switch (global_type_context) {
      case "bool":
        this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
        break;
      case "int":
        this.op = pickRandomElement(
          ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
        break;
      case "":
        this.op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
        break;
      default:
        throw new Error(`BinaryOpGenerator constructor: global_type_context ${global_type_context} is invalid`);
    }
  }
  async generate(component : number) : Promise<void> {
    let new_type_context = false;
    if (global_type_context === "") {
      new_type_context = true;
      if (["&&", "||"].filter((op) => op === this.op).length === 1) {
        global_type_context = "bool";
      }
      else {
        global_type_context = "int";
      }
    }
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

    this.irnode = new exp.IRBinaryOp(global_id++, cur_scope_id, field_flag, left_expression, right_expression, this.op);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "BinaryOp");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (global_type_context === "bool") {
      type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
    }
    else if (global_type_context === "int") {
      if (["&&", "||", ">", "<", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
        type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
      }
      type.irnode2types.set(this.irnode.id, type.all_integer_types);
    }
    else {
      throw new Error(`BinaryOpGenerator generator: global_type_context ${global_type_context} is invalid`);
    }
    let left_extracted_expression = left_expression;
    while (left_extracted_expression instanceof exp.IRTuple) {
      assert(left_extracted_expression.components.length === 1, "BinaryGenerator: left_extracted_expression.components.length is not 1");
      left_extracted_expression = left_extracted_expression.components[0];
    }
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "BinaryGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    if ([">", "<", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      type.irnode2types.set(left_extracted_expression.id, type.all_integer_types);
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "subtype");
    }
    else if (this.op === ">>" || this.op === "<<") {
      type_dag.connect(this.irnode.id, left_extracted_expression.id);
      type.irnode2types.set(right_extracted_expression.id, type.uinteger_types);
    }
    else {
      type_dag.connect(this.irnode.id, left_extracted_expression.id);
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "subtype");
    }
    if (new_type_context) {
      global_type_context = "";
    }
    if (Math.random() < tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  op : "!" | "-" | "~" | "++" | "--";
  constructor() {
    super();
    switch (global_type_context) {
      case "":
        this.op = pickRandomElement(["!", "-", "~", "++", "--"])!;
        break;
      case "bool":
        this.op = "!";
        break;
      case "int":
        this.op = pickRandomElement(["-", "~", "++", "--"])!;
        break;
      default:
        throw new Error(`UnaryOpGenerator constructor: global_type_context ${global_type_context} is invalid`);
    }
  }
  async generate(component : number) : Promise<void> {
    let new_type_context = false;
    if (global_type_context === "") {
      new_type_context = true;
      if (this.op === "!") {
        global_type_context = "bool";
      }
      else {
        global_type_context = "int";
      }
    }
    const identifier_gen = new IdentifierGenerator();
    await identifier_gen.generate(component + 1);
    let expression : exp.IRExpression = identifier_gen.irnode! as exp.IRExpression;
    let extracted_expression = expression;
    while (extracted_expression instanceof exp.IRTuple) {
      assert(extracted_expression.components.length === 1, "UnaryOpGenerator: extracted_expression.components.length is not 1");
      extracted_expression = extracted_expression.components[0];
    }
    this.irnode = new exp.IRUnaryOp(global_id++, cur_scope_id, field_flag, pickRandomElement([true, false])!, expression, this.op)!;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "UnaryOp");
    assert(extracted_expression instanceof exp.IRIdentifier, "UnaryOpGenerator: extracted_expression is not IRIdentifier");
    assert((extracted_expression as exp.IRIdentifier).reference !== undefined, "UnaryOpGenerator: extracted_expression.reference is undefined");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    if (global_type_context === "bool") type.irnode2types.set(this.irnode.id, [new type.ElementaryType("bool", "nonpayable")]);
    else if (global_type_context === "int") {
      if (this.op === "-") type.irnode2types.set(this.irnode.id, type.integer_types);
      else type.irnode2types.set(this.irnode.id, type.all_integer_types);
    }
    else throw new Error(`UnaryOpGenerator generator: global_type_context ${global_type_context} is invalid`);
    type_dag.connect(this.irnode.id, extracted_expression.id);
    if (new_type_context) {
      global_type_context = "";
    }
    if (Math.random() < tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
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
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope_id, field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as exp.IRExpression);
    let expression_gen_extracted = expression_gen.irnode!;
    while (expression_gen_extracted instanceof exp.IRTuple) {
      assert(expression_gen_extracted.components.length === 1, "VariableDeclareStatementGenerator: expression_gen_extracted.components.length is not 1");
      expression_gen_extracted = expression_gen_extracted.components[0];
    }
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclareStatement");
    type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "supertype");
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
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope_id, field_flag, assignment_gen.irnode! as exp.IRAssignment);
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "AssignmentStatement");
  }
}
