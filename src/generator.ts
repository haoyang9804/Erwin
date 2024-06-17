import { assert, pickRandomElement, generateRandomString } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { irnode_db } from "./db";
import { TypeDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
let cur_scope_id = 0;
// Record the parent scope of each scope.
const scope_parent = new Map<number, number>();
let field_flag = FieldFlag.GLOBAL;
const vardecls : Set<number> = new Set<number>();
// let virtual_env = false;
// let override_env = false;
// Record statements in each scope.
export const scope_stmt = new Map<number, IRNode[]>();
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

async function hasAvailableIRVariableDeclare(scope : number) : Promise<boolean> {
  return (await getAvailableIRVariableDeclare(scope)).length > 0;
}

async function getAvailableIRVariableDeclareWithTypeConstraint(scope : number | undefined, types : type.Type[]) : Promise<decl.IRVariableDeclare[]> {
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
  return collection.filter((irdecl) => type.isSuperTypeSet(type.irnode2types.get(irdecl.id)!, types) || type.isSuperTypeSet(types, type.irnode2types.get(irdecl.id)!));
}

async function hasAvailableIRVariableDeclareWithTypeConstraint(scope : number, types : type.Type[]) : Promise<boolean> {
  return (await getAvailableIRVariableDeclareWithTypeConstraint(scope, types)).length > 0;
}


function typeRangeAlignment(irnode_id1 : number, irnode_id2 : number) : void {
  if (type.isEqualTypeSet(type.irnode2types.get(irnode_id1)!, type.irnode2types.get(irnode_id2)!)) return;
  if (type.isSuperTypeSet(type.irnode2types.get(irnode_id1)!, type.irnode2types.get(irnode_id2)!)) {
    type.irnode2types.set(irnode_id1, type.irnode2types.get(irnode_id2)!);
    if (vardecls.has(irnode_id1)) type_dag.tighten_type_range_from_a_tail(irnode_id1);
    else type_dag.tighten_type_range_from_a_head(irnode_id1);
    return;
  }
  if (type.isSuperTypeSet(type.irnode2types.get(irnode_id2)!, type.irnode2types.get(irnode_id1)!)) {
    type.irnode2types.set(irnode_id2, type.irnode2types.get(irnode_id1)!);
    if (vardecls.has(irnode_id2)) type_dag.tighten_type_range_from_a_tail(irnode_id2);
    else type_dag.tighten_type_range_from_a_head(irnode_id2);
    return;
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Declaration Generator

export abstract class DeclarationGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

export class VariableDeclareGenerator extends DeclarationGenerator {
  type_range : type.Type[];
  constructor(type_range : type.Type[]) {
    super();
    this.type_range = type_range;
  }
  async generate() : Promise<void> {
    this.irnode = createVariableDeclare();
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclare");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, this.type_range);
    vardecls.add(this.irnode.id);
  }
}

export class FunctionDeclareGenerator extends DeclarationGenerator {
  constructor() {
    super();
  }
  async generate() : Promise<void> {
    const parameter_count = Math.floor(Math.random() * config.param_count_of_function_upperlimit);
    const return_count = Math.floor(Math.random() * config.return_count_of_function_upperlimit);
    const parameters : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < parameter_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      await variable_gen.generate();
      parameters.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    const returns : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < return_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      await variable_gen.generate();
      returns.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    // const name = generateVarName();
    // const virtual = virtual_env;
    // const overide = override_env;
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  constructor(type_range : type.Type[]) {
    super();
    this.type_range = type_range;
  }
  // If component is 0, the generator will generate a complete statement and update scope_stmt.
  // Otherwise, the generator will generate a component of a statement.
  // The positive number of the component indicates the complex level of the component.
  // For instance, x = a + b contains a binary operation component with complex level 1,
  // while x = a + (b += c) contains a binary operation component with complex level 1 and an assignment component with complex level 2.
  // If the complex level reaches the maximum, the generator will generate a terminal expression such as an identifier expression.
  abstract generate(component : number) : void;
}

export abstract class LValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
  }
  abstract generate(component : number) : void;
}

export abstract class RValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
  }
  abstract generate(component : number) : void;
}

export abstract class LRValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
  }
  abstract generate(component : number) : void;
}

export class LiteralGenerator extends RValueGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
    console.log('>> Literal');
  }
  async generate(component : number) : Promise<void> {
    this.irnode = new exp.IRLiteral(global_id++, cur_scope_id, field_flag);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Literal");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, this.type_range);
    if (config.debug) console.log(color.yellowBG(`${this.irnode.id}: Literal, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
    console.log('>> Identifier');
  }
  async generate(component : number) : Promise<void> {
    // Generate a variable decl if there is no variable decl available.
    if (!(await hasAvailableIRVariableDeclareWithTypeConstraint(cur_scope_id, this.type_range))) {
      const variable_stmt_gen = new SingleVariableDeclareStatementGenerator(this.type_range);
      await variable_stmt_gen.generate();
    }
    // generate an identifier
    let irdecl : decl.IRVariableDeclare;
    const availableIRDecl = await getAvailableIRVariableDeclareWithTypeConstraint(cur_scope_id, this.type_range);
    assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
    assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
    irdecl = pickRandomElement(availableIRDecl)!;
    this.irnode = new exp.IRIdentifier(global_id++, cur_scope_id, field_flag, irdecl.name, irdecl.id);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Identifier");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, irdecl.id);
    type.irnode2types.set(this.irnode.id, this.type_range);
    typeRangeAlignment(this.irnode.id, irdecl.id);
    if (config.debug) console.log(color.yellowBG(`${this.irnode.id}: Identifier --> ${irdecl.id}, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class AssignmentGenerator extends RValueGenerator {

  op : "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=" | undefined;

  constructor(type_range : type.Type[]) {
    super(type_range);
    if (type.isEqualTypeSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = "=";
    }
    else if (type.isSuperTypeSet(type.all_integer_types, type_range) ||
      type.isEqualTypeSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(
        ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]);
    }
    else {
      console.log('type_range: ', type_range);
      throw new Error(`AssignmentGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
    console.log('>> Assignment ' + this.op);
  }

  async generate(component : number) : Promise<void> {
    let type_range;
    if (this.op === "=") type_range = this.type_range;
    else {
      if (type.isEqualTypeSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    let right_expression_gen_prototype;
    if (component >= config.expression_complex_level) {
      right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    let right_expression_gen;
    if (this.op === "<<=" || this.op === ">>=") {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(type_range);
    }
    await right_expression_gen.generate(component + 1);
    let right_expression : exp.IRExpression = right_expression_gen.irnode as exp.IRExpression;
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "AssignmentGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    assert(type.irnode2types.has(right_extracted_expression.id), `irnode2types does not contain ${right_extracted_expression.id}`);
    const identifier_gen = new IdentifierGenerator(type.irnode2types.get(right_extracted_expression.id)!);
    await identifier_gen.generate(component + 1);
    let left_expression : exp.IRExpression = identifier_gen.irnode as exp.IRExpression;
    this.irnode = new exp.IRAssignment(global_id++, cur_scope_id, field_flag, left_expression, right_expression, this.op!);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Assignment");
    let left_extracted_expression = left_expression;
    while (left_extracted_expression instanceof exp.IRTuple) {
      assert(left_extracted_expression.components.length === 1, "AssignmentGenerator: left_extracted_expression.components.length is not 1");
      left_extracted_expression = left_extracted_expression.components[0];
    }
    if (this.op !== ">>=" && this.op !== "<<=") {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "subtype");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type.irnode2types.set(this.irnode.id, this.type_range);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, left_extracted_expression.id);
    typeRangeAlignment(this.irnode.id, left_extracted_expression.id);
    if (config.debug) {
      assert(type.irnode2types.has(this.irnode.id), `irnode2types does not contain ${this.irnode.id}`);
      console.log(color.yellowBG(`${this.irnode.id}: Assignment ${this.op}, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    }
    if (component !== 0) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
    else if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class BinaryOpGenerator extends RValueGenerator {
  op : "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "^" | "|" | "&&" | "||";
  constructor(type_range : type.Type[]) {
    super(type_range);
    console.log('>> BinaryOp');
    if (type.isEqualTypeSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (type.isSuperTypeSet(type.all_integer_types, type_range)) {
      this.op = pickRandomElement(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else if (type.isEqualTypeSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
    }
    else {
      throw new Error(`BinaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }
  async generate(component : number) : Promise<void> {
    let type_range;
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1) {
      if (type.isEqualTypeSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else if (["<", ">", "<=", ">=", "==", "!="].filter((op) => op === this.op).length === 1) {
      type_range = type.all_integer_types;
      this.type_range = [new type.ElementaryType("bool", "nonpayable")];
    }
    else { // &&, ||
      this.type_range = type_range = [new type.ElementaryType("bool", "nonpayable")];
    }
    let left_expression : exp.IRExpression;
    let right_expression : exp.IRExpression;
    let left_expression_gen_prototype, right_expression_gen_prototype;
    let left_expression_gen, right_expression_gen;
    if (component >= config.expression_complex_level) {
      left_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      right_expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      left_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    left_expression_gen = new left_expression_gen_prototype(type_range);
    await left_expression_gen.generate(component + 1);
    left_expression = left_expression_gen.irnode as exp.IRExpression;
    let left_extracted_expression = left_expression;
    while (left_extracted_expression instanceof exp.IRTuple) {
      assert(left_extracted_expression.components.length === 1, "BinaryGenerator: left_extracted_expression.components.length is not 1");
      left_extracted_expression = left_extracted_expression.components[0];
    }
    if (this.op === ">>" || this.op === "<<") {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(type.irnode2types.get(left_extracted_expression.id)!);
    }
    await right_expression_gen.generate(component + 1);
    right_expression = right_expression_gen.irnode as exp.IRExpression;
    this.irnode = new exp.IRBinaryOp(global_id++, cur_scope_id, field_flag, left_expression, right_expression, this.op);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "BinaryOp");
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "BinaryGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    if (this.op !== ">>" && this.op !== "<<") {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "subtype");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, this.type_range);
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|", "&&", "||"].filter((op) => op === this.op).length === 1) {
      type_dag.connect(this.irnode.id, left_extracted_expression.id);
      typeRangeAlignment(this.irnode.id, left_extracted_expression.id);
    }
    if (config.debug) console.log(color.yellowBG(`${this.irnode.id}: BinaryOp ${this.op}, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  op : "!" | "-" | "~" | "++" | "--";
  constructor(type_range : type.Type[]) {
    super(type_range);
    console.log('>> UnaryOp');
    if (type.isEqualTypeSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["!", "-", "~", "++", "--"])!;
    }
    else if (type.isEqualTypeSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = "!";
    }
    else if (type.isEqualTypeSet(type_range, type.integer_types) || type.isEqualTypeSet(type_range, type.all_integer_types)) {
      this.op = pickRandomElement(["-", "~", "++", "--"])!;
    }
    else if (type.isEqualTypeSet(type_range, type.uinteger_types)) {
      this.op = pickRandomElement(["~", "++", "--"])!;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }
  async generate(component : number) : Promise<void> {
    let type_range;
    if (this.op === "!") {
      this.type_range = type_range = [new type.ElementaryType("bool", "nonpayable")];
    }
    else if (this.op === "~" || this.op === "++" || this.op === "--") {
      if (type.isEqualTypeSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else if (this.op === "-") {
      if (type.isEqualTypeSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else {
      throw new Error(`UnaryOpGenerator generate: this.op ${this.op} is invalid`);
    }
    const identifier_gen = new IdentifierGenerator(type_range);
    await identifier_gen.generate(component + 1);
    let expression : exp.IRExpression = identifier_gen.irnode! as exp.IRExpression;
    this.irnode = new exp.IRUnaryOp(global_id++, cur_scope_id, field_flag, pickRandomElement([true, false])!, expression, this.op)!;
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "UnaryOp");
    let extracted_expression = expression;
    while (extracted_expression instanceof exp.IRTuple) {
      assert(extracted_expression.components.length === 1, "UnaryOpGenerator: extracted_expression.components.length is not 1");
      extracted_expression = extracted_expression.components[0];
    }
    assert(extracted_expression instanceof exp.IRIdentifier, "UnaryOpGenerator: extracted_expression is not IRIdentifier");
    assert((extracted_expression as exp.IRIdentifier).reference !== undefined, "UnaryOpGenerator: extracted_expression.reference is undefined");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type.irnode2types.set(this.irnode.id, this.type_range);
    type_dag.connect(this.irnode.id, extracted_expression.id);
    typeRangeAlignment(this.irnode.id, extracted_expression.id);
    if (config.debug) console.log(color.yellowBG(`${this.irnode.id}: UnaryOp ${this.op}, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

export class ConditionalGenerator extends RValueGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
    console.log('Conditional');
  }
  async generate(component : number) : Promise<void> {
    let e1_gen_prototype, e2_gen_prototype, e3_gen_prototype;
    if (component >= config.expression_complex_level) {
      e1_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      e2_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      e3_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      e1_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      e2_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      e3_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    const e1_gen = new e1_gen_prototype([new type.ElementaryType("bool", "nonpayable")]);
    await e1_gen.generate(component + 1);
    let extracted_e1 = e1_gen.irnode!;
    while (extracted_e1 instanceof exp.IRTuple) {
      assert(extracted_e1.components.length === 1, "ConditionalGenerator: extracted_e1.components.length is not 1");
      extracted_e1 = extracted_e1.components[0];
    }
    const e2_gen = new e2_gen_prototype(this.type_range);
    await e2_gen.generate(component + 1);
    let extracted_e2 = e2_gen.irnode!;
    while (extracted_e2 instanceof exp.IRTuple) {
      assert(extracted_e2.components.length === 1, "ConditionalGenerator: extracted_e2.components.length is not 1");
      extracted_e2 = extracted_e2.components[0];
    }
    if (type.isEqualTypeSet(type.irnode2types.get(extracted_e2.id)!, type.elementary_types)) {
      type.irnode2types.set(extracted_e2.id, pickRandomElement(type.type_range_collection)!);
      type_dag.tighten_type_range_from_a_head(extracted_e2.id);
    }
    const e3_gen = new e3_gen_prototype(type.irnode2types.get(extracted_e2.id)!);
    await e3_gen.generate(component + 1);
    this.irnode = new exp.IRConditional(global_id++, cur_scope_id, field_flag, e1_gen.irnode! as exp.IRExpression, e2_gen.irnode! as exp.IRExpression, e3_gen.irnode! as exp.IRExpression);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "Conditional");
    let extracted_e3 = e3_gen.irnode!;
    while (extracted_e3 instanceof exp.IRTuple) {
      assert(extracted_e3.components.length === 1, "ConditionalGenerator: extracted_e3.components.length is not 1");
      extracted_e3 = extracted_e3.components[0];
    }
    type.irnode2types.set(extracted_e1.id, [new type.ElementaryType("bool", "nonpayable")]);
    type.irnode2types.set(this.irnode.id, type.elementary_types);
    type_dag.connect(extracted_e2.id, extracted_e3.id, "subtype");
    typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, extracted_e2.id);
    typeRangeAlignment(this.irnode.id, extracted_e2.id);
    if (config.debug) console.log(color.yellowBG(`${this.irnode.id}: Conditional, type: ${type.irnode2types.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope_id, field_flag, [this.irnode as exp.IRExpression]);
      await irnode_db.insert(this.irnode.id, this.irnode.scope, "Tuple");
    }
  }
}

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
]

const nonterminal_expression_generators = [
  AssignmentGenerator,
  // BinaryOpGenerator,
  // UnaryOpGenerator,
  // ConditionalGenerator
]
const all_expression_generators = [
  // LiteralGenerator,
  // IdentifierGenerator,
  AssignmentGenerator,
  // BinaryOpGenerator,
  // UnaryOpGenerator,
  // ConditionalGenerator
]


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Statement Generator

export abstract class StatementGenerator extends Generator {
  constructor() { super(); }
  abstract generate() : void;
}

export class SingleVariableDeclareStatementGenerator extends StatementGenerator {
  type_range : type.Type[] | undefined;
  constructor(type_range ?: type.Type[]) {
    super();
    console.log('>> SingleVariableDeclare');
    this.type_range = type_range;
  }
  async generate() : Promise<void> {
    if (this.type_range === undefined) this.type_range = type.elementary_types;
    let expression_gen_prototype;
    let expression_gen;
    if (await hasAvailableIRVariableDeclare(cur_scope_id) && Math.random() > config.literal_prob) {
      expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      expression_gen = new expression_gen_prototype(this.type_range);
    }
    else {
      expression_gen = new LiteralGenerator(this.type_range);
    }
    await expression_gen.generate(0);
    const variable_gen = new VariableDeclareGenerator(this.type_range);
    await variable_gen.generate();
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope_id, field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as exp.IRExpression);
    let expression_gen_extracted = expression_gen.irnode!;
    while (expression_gen_extracted instanceof exp.IRTuple) {
      assert(expression_gen_extracted.components.length === 1, "SingleVariableDeclareStatementGenerator: expression_gen_extracted.components.length is not 1");
      expression_gen_extracted = expression_gen_extracted.components[0];
    }
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclareStatement");
    type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "supertype");
    typeRangeAlignment(expression_gen_extracted.id, variable_gen.irnode!.id);
    if (config.debug) console.log(color.yellowBG(`${variable_gen.irnode!.id}: VarDecl, type: ${type.irnode2types.get(variable_gen.irnode!.id)!.map(t => t.str())}`));
  }
}

export class MultipleVariableDeclareStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  async generate() : Promise<void> {
    const ir_exps : exp.IRExpression[] = [];
    for (let i = 0; i < config.tuple_vardecl_count; i++) {
      let expression_gen_prototype;
      if (await hasAvailableIRVariableDeclare(cur_scope_id) && Math.random() > config.literal_prob) {
        expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expression_gen = new expression_gen_prototype(type.elementary_types);
      await expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as exp.IRExpression);
    }
    const ir_varnodes : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < config.tuple_vardecl_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      await variable_gen.generate();
      ir_varnodes.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    const ir_tuple_exp = new exp.IRTuple(global_id++, cur_scope_id, field_flag, ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope_id, field_flag, ir_varnodes, ir_tuple_exp);
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "VariableDeclareStatement");
    for (let i = 0; i < config.tuple_vardecl_count; i++) {
      let extracted_ir = ir_exps[i];
      while (extracted_ir instanceof exp.IRTuple) {
        assert(extracted_ir.components.length === 1, "SingleVariableDeclareStatementGenerator: expression_gen_extracted.components.length is not 1");
        extracted_ir = extracted_ir.components[0];
      }
      type_dag.connect(extracted_ir.id, ir_varnodes[i].id, "supertype");
      typeRangeAlignment(extracted_ir.id, ir_varnodes[i].id);
      if (config.debug) console.log(color.yellowBG(`${ir_varnodes[i].id}: VarDecl, type: ${type.irnode2types.get(ir_varnodes[i].id)!.map(t => t.str())}`));
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
    const assignment_gen = new AssignmentGenerator(type.elementary_types);
    await assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope_id, field_flag, assignment_gen.irnode! as exp.IRAssignment);
    scope_stmt.set(cur_scope_id, scope_stmt.has(cur_scope_id) ? scope_stmt.get(cur_scope_id)!.concat(this.irnode!) : [this.irnode!]);
    await irnode_db.insert(this.irnode.id, this.irnode.scope, "AssignmentStatement");
  }
}
