import { assert, pickRandomElement, generateRandomString, randomInt } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as stmt from "./statement";
import * as type from "./type";
import { irnode_db } from "./db";
import { TypeDominanceDAG, FuncStateMutabilityDominanceDAG } from "./constraint";
import { config } from './config';
import { irnodes } from "./node";
import { color } from "console-log-colors"
import { isSuperSet, isEqualSet } from "./dominance";
import * as funcstat from "./funcstat";
import { FunctionKind, FunctionVisibility } from "solc-typed-ast";
import { LinkedListNode } from "./dataStructor";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
class ScopeList extends LinkedListNode<number> {
  constructor(value : number) {
    super(value);
  }
  new() : ScopeList {
    return this.create(this.m_value! + 1) as ScopeList;
  }
}
let cur_scope : ScopeList = new ScopeList(0);
let field_flag = FieldFlag.GLOBAL;
const vardecls : Set<number> = new Set<number>();
const funcdecls : Set<number> = new Set<number>();
let virtual_env = false;
let override_env = false;
let unexpected_extra_vardecls : stmt.IRStatement[] = [];
// Record statements in each scope.
export const scope2userDefinedTypes = new Map<number, number>();
export const type_dag = new TypeDominanceDAG();
export const funcstat_dag = new FuncStateMutabilityDominanceDAG();
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
  return new decl.IRVariableDeclare(global_id++, cur_scope.value(), field_flag, generateVarName());
}

function getAvailableIRVariableDeclare() : decl.IRVariableDeclare[] {
  const collection : decl.IRVariableDeclare[] = [];
  const IDs_of_available_irnodes = irnode_db.get_IRNodes_by_scope(cur_scope.value());
  for (let id of IDs_of_available_irnodes) {
    if (vardecls.has(id)) collection.push(irnodes[id] as decl.IRVariableDeclare);
  }
  return collection;
}

function hasAvailableIRVariableDeclare() : boolean {
  return getAvailableIRVariableDeclare().length > 0;
}

function getAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : decl.IRVariableDeclare[] {
  const collection : decl.IRVariableDeclare[] = [];
  const IDs_of_available_irnodes = irnode_db.get_IRNodes_by_scope(cur_scope.value());
  for (let id of IDs_of_available_irnodes) {
    if (vardecls.has(id)) collection.push(irnodes[id] as decl.IRVariableDeclare);
  }
  return collection.filter((irdecl) => isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) || isSuperSet(types, type_dag.solution_range.get(irdecl.id)!));
}

function hasAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : boolean {
  return getAvailableIRVariableDeclareWithTypeConstraint(types).length > 0;
}


function typeRangeAlignment(irnode_id1 : number, irnode_id2 : number) : void {
  if (isEqualSet(type_dag.solution_range.get(irnode_id1)!, type_dag.solution_range.get(irnode_id2)!)) return;
  if (isSuperSet(type_dag.solution_range.get(irnode_id1)!, type_dag.solution_range.get(irnode_id2)!)) {
    type_dag.solution_range.set(irnode_id1, type_dag.solution_range.get(irnode_id2)!);
    if (vardecls.has(irnode_id1)) type_dag.tighten_solution_range_from_a_tail(irnode_id1);
    else type_dag.tighten_solution_range_from_a_head(irnode_id1);
    return;
  }
  if (isSuperSet(type_dag.solution_range.get(irnode_id2)!, type_dag.solution_range.get(irnode_id1)!)) {
    type_dag.solution_range.set(irnode_id2, type_dag.solution_range.get(irnode_id1)!);
    if (vardecls.has(irnode_id2)) type_dag.tighten_solution_range_from_a_tail(irnode_id2);
    else type_dag.tighten_solution_range_from_a_head(irnode_id2);
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
  generate() : void {
    this.irnode = createVariableDeclare();
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    vardecls.add(this.irnode.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode!.id}: VarDecl, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
  }
}

export class FunctionDeclareGenerator extends DeclarationGenerator {
  state_mutability_range : funcstat.FuncStat[] | undefined;
  kind : FunctionKind = FunctionKind.Function;
  constructor(kind ?: FunctionKind, state_mutability_range ?: funcstat.FuncStat[]) {
    super();
    if (kind !== undefined)
      this.kind = kind;
    this.state_mutability_range = state_mutability_range;
  }
  generate() : void {
    const parameter_count = randomInt(0, config.param_count_of_function_upperlimit);
    // const return_count = randomInt(0, config.return_count_of_function_upperlimit);
    const body_stmt_count = randomInt(0, config.body_stmt_count_of_function_upperlimit);
    const parameters : decl.IRVariableDeclare[] = [];
    cur_scope = cur_scope.new();
    for (let i = 0; i < parameter_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      variable_gen.generate();
      parameters.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    let body : stmt.IRStatement[] = [];
    for (let i = body.length; i < body_stmt_count; i++) {
      const stmt_gen_prototype = pickRandomElement(statement_generators)!;
      const stmt_gen = new stmt_gen_prototype();
      stmt_gen.generate();
      body = body.concat(unexpected_extra_vardecls);
      unexpected_extra_vardecls = [];
      body.push(stmt_gen.irnode! as stmt.IRStatement);
    }
    const returns : decl.IRVariableDeclare[] = [];
    // for (let i = 0; i < return_count; i++) {
    //   const variable_gen = new VariableDeclareGenerator(type.elementary_types);
    //   variable_gen.generate();
    //   returns.push(variable_gen.irnode! as decl.IRVariableDeclare);
    // }
    cur_scope = cur_scope.rollback() as ScopeList;
    const modifiers : decl.Modifier[] = [];
    //TODO: fill the modifiers
    const name = generateVarName();
    const virtual = virtual_env;
    const overide = override_env;
    const visibility = pickRandomElement([
      FunctionVisibility.External,
      FunctionVisibility.Internal,
      FunctionVisibility.Private,
      FunctionVisibility.Public
    ])
    if (this.state_mutability_range === undefined) {
      if (visibility === FunctionVisibility.Internal ||
          visibility === FunctionVisibility.Private)
        this.state_mutability_range = funcstat.nonpayable_func_mutability_stats;
      else
        this.state_mutability_range = funcstat.all_func_mutability_stats;
    }
    this.irnode = new decl.IRFunctionDefinition(global_id++, cur_scope.value(), field_flag, name,
      this.kind, virtual, overide, parameters, returns, body, modifiers, visibility);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    funcstat_dag.insert(funcstat_dag.newNode(this.irnode.id));
    funcstat_dag.solution_range.set(this.irnode.id, this.state_mutability_range);
    funcdecls.add(this.irnode.id);
  }
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  constructor(type_range : type.Type[],) {
    super();
    this.type_range = type_range;
  }
  // If component is 0, the generator will generate a complete statement.
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
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Literal`));
    }
    this.irnode = new exp.IRLiteral(global_id++, cur_scope.value(), field_flag);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Literal, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Identifier`));
    }
    // Generate a variable decl if there is no variable decl available.
    if (!hasAvailableIRVariableDeclareWithTypeConstraint(this.type_range)) {
      const variable_gen = new SingleVariableDeclareStatementGenerator(this.type_range);
      variable_gen.generate();
      unexpected_extra_vardecls.push(variable_gen.irnode! as stmt.IRStatement);
    }
    // generate an identifier
    let irdecl : decl.IRVariableDeclare;
    const availableIRDecl = getAvailableIRVariableDeclareWithTypeConstraint(this.type_range);
    assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
    assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
    irdecl = pickRandomElement(availableIRDecl)!;
    this.irnode = new exp.IRIdentifier(global_id++, cur_scope.value(), field_flag, irdecl.name, irdecl.id);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, irdecl.id);
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    typeRangeAlignment(this.irnode.id, irdecl.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Identifier --> ${irdecl.id}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

type ASSIOP = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";

export class AssignmentGenerator extends RValueGenerator {

  op : ASSIOP;

  constructor(type_range : type.Type[], op ?: ASSIOP) {
    super(type_range);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = "=";
    }
    else if (isSuperSet(type.all_integer_types, type_range) ||
      isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(
        ["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="])!;
    }
    else {
      throw new Error(`AssignmentGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }

  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Assignment ${this.op}`));
    }
    let type_range;
    if (this.op === "=") type_range = this.type_range;
    else {
      if (isEqualSet(this.type_range, type.elementary_types)) {
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
    right_expression_gen.generate(component + 1);
    let right_expression : exp.IRExpression = right_expression_gen.irnode as exp.IRExpression;
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "AssignmentGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    assert(type_dag.solution_range.has(right_extracted_expression.id), `irnode2types does not contain ${right_extracted_expression.id}`);
    const identifier_gen =
      this.op !== "<<=" && this.op !== ">>=" ?
        new IdentifierGenerator(type_dag.solution_range.get(right_extracted_expression.id)!) :
        new IdentifierGenerator(type_range);
    identifier_gen.generate(component + 1);
    let left_expression : exp.IRExpression = identifier_gen.irnode as exp.IRExpression;
    this.irnode = new exp.IRAssignment(global_id++, cur_scope.value(), field_flag, left_expression, right_expression, this.op!);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    let left_extracted_expression = left_expression;
    while (left_extracted_expression instanceof exp.IRTuple) {
      assert(left_extracted_expression.components.length === 1, "AssignmentGenerator: left_extracted_expression.components.length is not 1");
      left_extracted_expression = left_extracted_expression.components[0];
    }
    if (this.op !== ">>=" && this.op !== "<<=") {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, left_extracted_expression.id);
    typeRangeAlignment(this.irnode.id, left_extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Assignment ${this.op}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (component !== 0) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
    else if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

type BOP = "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "^" | "|" | "&&" | "||";

export class BinaryOpGenerator extends RValueGenerator {
  op : BOP;
  constructor(type_range : type.Type[], op ?: BOP) {
    super(type_range);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = pickRandomElement(["&&", "||", ">", "<", "<=", ">=", "==", "!="])!;
    }
    else if (isSuperSet(type.all_integer_types, type_range)) {
      this.op = pickRandomElement(
        ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"])!;
    }
    else if (isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["+", "-", "*", "/", "%", "<<", ">>", "<", ">", "<=", ">=", "==", "!=", "&", "^", "|", "&&", "||"])!;
    }
    else {
      throw new Error(`BinaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating BinaryOp ${this.op}`));
    }
    let type_range;
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|"].filter((op) => op === this.op).length === 1) {
      if (isEqualSet(this.type_range, type.elementary_types)) {
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
    left_expression_gen.generate(component + 1);
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
      right_expression_gen = new right_expression_gen_prototype(type_dag.solution_range.get(left_extracted_expression.id)!);
    }
    right_expression_gen.generate(component + 1);
    right_expression = right_expression_gen.irnode as exp.IRExpression;
    this.irnode = new exp.IRBinaryOp(global_id++, cur_scope.value(), field_flag, left_expression, right_expression, this.op);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    let right_extracted_expression = right_expression;
    while (right_extracted_expression instanceof exp.IRTuple) {
      assert(right_extracted_expression.components.length === 1, "BinaryGenerator: right_extracted_expression.components.length is not 1");
      right_extracted_expression = right_extracted_expression.components[0];
    }
    if (this.op !== ">>" && this.op !== "<<") {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    if (["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|", "&&", "||"].filter((op) => op === this.op).length === 1) {
      type_dag.connect(this.irnode.id, left_extracted_expression.id);
      typeRangeAlignment(this.irnode.id, left_extracted_expression.id);
    }
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: BinaryOp ${this.op}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

type UOP = "!" | "-" | "~" | "++" | "--";

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  op : UOP;
  constructor(type_range : type.Type[], op ?: UOP) {
    super(type_range);
    if (op !== undefined) {
      this.op = op;
    }
    else if (isEqualSet(type_range, type.elementary_types)) {
      this.op = pickRandomElement(["!", "-", "~", "++", "--"])!;
    }
    else if (isEqualSet(type_range, [new type.ElementaryType("bool", "nonpayable")])) {
      this.op = "!";
    }
    else if (isEqualSet(type_range, type.integer_types) || isEqualSet(type_range, type.all_integer_types)) {
      this.op = pickRandomElement(["-", "~", "++", "--"])!;
    }
    else if (isEqualSet(type_range, type.uinteger_types)) {
      this.op = pickRandomElement(["~", "++", "--"])!;
    }
    else {
      throw new Error(`UnaryOpGenerator constructor: type_range ${type_range.map(t => t.str())} is invalid`);
    }
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating UnaryOp ${this.op}`));
    }
    let type_range;
    if (this.op === "!") {
      this.type_range = type_range = [new type.ElementaryType("bool", "nonpayable")];
    }
    else if (this.op === "~" || this.op === "++" || this.op === "--") {
      if (isEqualSet(this.type_range, type.elementary_types)) {
        this.type_range = type_range = type.all_integer_types;
      }
      else {
        type_range = this.type_range;
      }
    }
    else if (this.op === "-") {
      this.type_range = type_range = type.integer_types;
    }
    else {
      throw new Error(`UnaryOpGenerator generate: this.op ${this.op} is invalid`);
    }
    const identifier_gen = new IdentifierGenerator(type_range);
    identifier_gen.generate(component + 1);
    let expression : exp.IRExpression = identifier_gen.irnode! as exp.IRExpression;
    this.irnode = new exp.IRUnaryOp(global_id++, cur_scope.value(), field_flag, pickRandomElement([true, false])!, expression, this.op)!;
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    let extracted_expression = expression;
    while (extracted_expression instanceof exp.IRTuple) {
      assert(extracted_expression.components.length === 1, "UnaryOpGenerator: extracted_expression.components.length is not 1");
      extracted_expression = extracted_expression.components[0];
    }
    assert(extracted_expression instanceof exp.IRIdentifier, "UnaryOpGenerator: extracted_expression is not IRIdentifier");
    assert((extracted_expression as exp.IRIdentifier).reference !== undefined, "UnaryOpGenerator: extracted_expression.reference is undefined");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    type_dag.connect(this.irnode.id, extracted_expression.id);
    typeRangeAlignment(this.irnode.id, extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: UnaryOp ${this.op}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

export class ConditionalGenerator extends RValueGenerator {
  constructor(type_range : type.Type[],) {
    super(type_range);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Conditional`));
    }
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
    e1_gen.generate(component + 1);
    let extracted_e1 = e1_gen.irnode!;
    while (extracted_e1 instanceof exp.IRTuple) {
      assert(extracted_e1.components.length === 1, "ConditionalGenerator: extracted_e1.components.length is not 1");
      extracted_e1 = extracted_e1.components[0];
    }
    const e2_gen = new e2_gen_prototype(this.type_range);
    e2_gen.generate(component + 1);
    let extracted_e2 = e2_gen.irnode!;
    while (extracted_e2 instanceof exp.IRTuple) {
      assert(extracted_e2.components.length === 1, "ConditionalGenerator: extracted_e2.components.length is not 1");
      extracted_e2 = extracted_e2.components[0];
    }
    if (isEqualSet(type_dag.solution_range.get(extracted_e2.id)!, type.elementary_types)) {
      type_dag.solution_range.set(extracted_e2.id, pickRandomElement(type.type_range_collection)!);
      type_dag.tighten_solution_range_from_a_head(extracted_e2.id);
    }
    const e3_gen = new e3_gen_prototype(type_dag.solution_range.get(extracted_e2.id)!);
    e3_gen.generate(component + 1);
    this.irnode = new exp.IRConditional(
      global_id++, cur_scope.value(), field_flag, e1_gen.irnode! as exp.IRExpression,
      e2_gen.irnode! as exp.IRExpression,
      e3_gen.irnode! as exp.IRExpression
    );
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    let extracted_e3 = e3_gen.irnode!;
    while (extracted_e3 instanceof exp.IRTuple) {
      assert(extracted_e3.components.length === 1, "ConditionalGenerator: extracted_e3.components.length is not 1");
      extracted_e3 = extracted_e3.components[0];
    }
    type_dag.solution_range.set(extracted_e1.id, [new type.ElementaryType("bool", "nonpayable")]);
    type_dag.solution_range.set(this.irnode.id, type.elementary_types);
    type_dag.connect(extracted_e2.id, extracted_e3.id, "sub_dominance");
    typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, extracted_e2.id);
    typeRangeAlignment(this.irnode.id, extracted_e2.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Conditional, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as exp.IRExpression]);
      irnode_db.insert(this.irnode.id, this.irnode.scope);
    }
  }
}

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
]

const nonterminal_expression_generators = [
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator
]
const all_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator
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
    this.type_range = type_range;
  }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating SingleVariableDeclareStatement`));
    }
    if (this.type_range === undefined) this.type_range = type.elementary_types;
    let expression_gen_prototype;
    let expression_gen;
    if (hasAvailableIRVariableDeclare() && Math.random() > config.literal_prob) {
      expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      expression_gen = new expression_gen_prototype(this.type_range);
    }
    else {
      expression_gen = new LiteralGenerator(this.type_range);
    }
    expression_gen.generate(0);
    const variable_gen = new VariableDeclareGenerator(this.type_range);
    variable_gen.generate();
    this.irnode = new stmt.IRVariableDeclareStatement(
      global_id++, cur_scope.value(), field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as exp.IRExpression
    );
    let expression_gen_extracted = expression_gen.irnode!;
    while (expression_gen_extracted instanceof exp.IRTuple) {
      assert(expression_gen_extracted.components.length === 1, "SingleVariableDeclareStatementGenerator: expression_gen_extracted.components.length is not 1");
      expression_gen_extracted = expression_gen_extracted.components[0];
    }
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    type_dag.connect(expression_gen_extracted.id, variable_gen.irnode!.id, "super_dominance");
    typeRangeAlignment(expression_gen_extracted.id, variable_gen.irnode!.id);
  }
}

export class MultipleVariableDeclareStatementGenerator extends StatementGenerator {
  var_count : number;
  constructor(var_count : number) {
    super();
    this.var_count = var_count;
  }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Assignment MultipleVariableDeclareStatement`));
    }
    const ir_exps : exp.IRExpression[] = [];
    for (let i = 0; i < this.var_count; i++) {
      let expression_gen_prototype;
      if (hasAvailableIRVariableDeclare() && Math.random() > config.literal_prob) {
        expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
      else {
        expression_gen_prototype = LiteralGenerator;
      }
      const expression_gen = new expression_gen_prototype(type.elementary_types);
      expression_gen.generate(0);
      ir_exps.push(expression_gen.irnode! as exp.IRExpression);
    }
    const ir_varnodes : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      variable_gen.generate();
      ir_varnodes.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    const ir_tuple_exp = new exp.IRTuple(global_id++, cur_scope.value(), field_flag, ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.value(), field_flag, ir_varnodes, ir_tuple_exp);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = ir_exps[i];
      while (extracted_ir instanceof exp.IRTuple) {
        assert(extracted_ir.components.length === 1, "SingleVariableDeclareStatementGenerator: expression_gen_extracted.components.length is not 1");
        extracted_ir = extracted_ir.components[0];
      }
      type_dag.connect(extracted_ir.id, ir_varnodes[i].id, "super_dominance");
      typeRangeAlignment(extracted_ir.id, ir_varnodes[i].id);
    }
  }
}

export abstract class ExpressionStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  generate() : void { }
}

export class AssignmentStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate() : void {
    const assignment_gen = new AssignmentGenerator(type.elementary_types);
    assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as exp.IRAssignment);
    irnode_db.insert(this.irnode.id, this.irnode.scope);
  }
}

const statement_generators = [
  AssignmentStatementGenerator
]