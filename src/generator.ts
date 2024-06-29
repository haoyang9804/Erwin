import { assert, pickRandomElement, generateRandomString, randomInt } from "./utility";
import { FieldFlag, IRNode } from "./node";
import * as expr from "./expression";
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
import { FunctionCallKind, FunctionKind, FunctionVisibility } from "solc-typed-ast";
import { LinkedListNode } from "./dataStructor";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
class ScopeList extends LinkedListNode<number> {
  constructor(value : number) {
    super(value);
  }
  new() : ScopeList {
    scope_id++;
    irnode_db.new_scope(scope_id, this.m_value!);
    return this.create(scope_id) as ScopeList;
  }
}
let scope_id : number = 0;
let cur_scope : ScopeList = new ScopeList(scope_id);
let field_flag = FieldFlag.GLOBAL;
const vardecls : Set<number> = new Set<number>();
const funcdecls : Set<number> = new Set<number>();
let virtual_env = false;
let override_env = false;
let unexpected_extra_stmt : stmt.IRStatement[] = [];
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

// irnode1 dominates irnode2
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
  name : string | undefined;
  constructor(type_range : type.Type[], name ?: string) {
    super();
    this.type_range = type_range;
    this.name = name;
  }
  generate() : void {
    if (this.name === undefined) {
      this.name = generateVarName();
    }
    this.irnode = new decl.IRVariableDeclare(global_id++, cur_scope.value(), field_flag, generateVarName());
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    vardecls.add(this.irnode.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode!.id}: VarDecl, name: ${this.name}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
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
      body = body.concat(unexpected_extra_stmt);
      unexpected_extra_stmt = [];
      body.push(stmt_gen.irnode! as stmt.IRStatement);
    }
    const return_decls : decl.IRVariableDeclare[] = [];
    const return_values : expr.IRExpression[] = [];
    const return_count = randomInt(0, config.return_count_of_function_upperlimit);
    for (let i = 0; i < return_count; i++) {
      const expr_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expr_gen = new expr_gen_prototype(type.elementary_types);
      expr_gen.generate(0);
      const expr_for_return = expr.tupleExtraction(expr_gen.irnode! as expr.IRExpression);
      return_values.push(expr_for_return);
      let expression_extracted = expr.tupleExtraction(return_values[i]);
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      variable_gen.generate();
      return_decls.push(variable_gen.irnode! as decl.IRVariableDeclare);
      type_dag.connect(expression_extracted.id, return_decls[i].id, "super_dominance");
      typeRangeAlignment(expression_extracted.id, return_decls[i].id);
      body = body.concat(unexpected_extra_stmt);
      unexpected_extra_stmt = [];
    }
    if (return_values.length === 0 && Math.random() > 0.5) { }
    else {
      const return_gen = new ReturnStatementGenerator(
        new expr.IRTuple(global_id++, cur_scope.value(), field_flag, return_values)
      );
      return_gen.generate();
      body.push(return_gen.irnode!);
    }
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
      this.kind, virtual, overide, parameters, return_decls, body, modifiers, visibility);
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
    this.irnode = new expr.IRLiteral(global_id++, cur_scope.value(), field_flag);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Literal, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
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
      unexpected_extra_stmt.push(variable_gen.irnode! as stmt.IRVariableDeclareStatement);
    }
    // generate an identifier
    let irdecl : decl.IRVariableDeclare;
    const availableIRDecl = getAvailableIRVariableDeclareWithTypeConstraint(this.type_range);
    assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
    assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
    irdecl = pickRandomElement(availableIRDecl)!;
    this.irnode = new expr.IRIdentifier(global_id++, cur_scope.value(), field_flag, irdecl.name, irdecl.id);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, irdecl.id);
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    typeRangeAlignment(this.irnode.id, irdecl.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Identifier --> ${irdecl.id}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
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
    else if (isEqualSet(type_range, type.bool_types)
      || isEqualSet(type_range, type.address_types)) {
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
      if (isEqualSet(type_range, type.address_types))
        right_expression_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
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
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    assert(type_dag.solution_range.has(right_extracted_expression.id), `irnode2types does not contain ${right_extracted_expression.id}`);
    const identifier_gen =
      this.op !== "<<=" && this.op !== ">>=" ?
        new IdentifierGenerator(type_dag.solution_range.get(right_extracted_expression.id)!) :
        new IdentifierGenerator(type_range);
    identifier_gen.generate(component + 1);
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    this.irnode = new expr.IRAssignment(global_id++, cur_scope.value(), field_flag, left_expression, right_expression, this.op!);
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    if (this.op !== ">>=" && this.op !== "<<=") {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, left_extracted_expression.id);
    typeRangeAlignment(this.irnode.id, left_extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Assignment ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (component !== 0) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
    else if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
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
    else if (isEqualSet(type_range, type.bool_types)) {
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
      this.type_range = type.bool_types;
    }
    else { // &&, ||, =
      this.type_range = type_range = type.bool_types;
    }
    let left_expression : expr.IRExpression;
    let right_expression : expr.IRExpression;
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
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    if (this.op === ">>" || this.op === "<<") {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(type_dag.solution_range.get(left_extracted_expression.id)!);
    }
    right_expression_gen.generate(component + 1);
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    this.irnode = new expr.IRBinaryOp(global_id++, cur_scope.value(), field_flag, left_expression, right_expression, this.op);
    let right_extracted_expression = expr.tupleExtraction(right_expression);
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
      console.log(color.yellowBG(`${this.irnode.id}: BinaryOp ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
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
    else if (isEqualSet(type_range, type.bool_types)) {
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
      this.type_range = type_range = type.bool_types;
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
      throw new Error(`UnaryOpGenerator constructor: type_range ${this.type_range.map(t => t.str())} is invalid`);
    }
    const identifier_gen = new IdentifierGenerator(type_range);
    identifier_gen.generate(component + 1);
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    this.irnode = new expr.IRUnaryOp(global_id++, cur_scope.value(), field_flag, pickRandomElement([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tupleExtraction(expression);
    assert(extracted_expression instanceof expr.IRIdentifier, "UnaryOpGenerator: extracted_expression is not IRIdentifier");
    assert((extracted_expression as expr.IRIdentifier).reference !== undefined, "UnaryOpGenerator: extracted_expression.reference is undefined");
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    type_dag.connect(this.irnode.id, extracted_expression.id);
    typeRangeAlignment(this.irnode.id, extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: UnaryOp ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class ConditionalGenerator extends RValueGenerator {
  constructor(type_range : type.Type[]) {
    super(type_range);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating Conditional`));
    }
    //! Suppose the conditional expression is e1 ? e2 : e3
    //! The first step is to get a generator foe e1.
    let e1_gen_prototype;
    if (component >= config.expression_complex_level) {
      e1_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      e1_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    const e1_gen = new e1_gen_prototype(type.bool_types);
    e1_gen.generate(component + 1);
    let extracted_e1 = expr.tupleExtraction(e1_gen.irnode! as expr.IRExpression);
    //! Then get a generator for e2.
    let e2_gen_prototype;
    if (component >= config.expression_complex_level) {
      e2_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(this.type_range, type.address_types))
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e2_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    const e2_gen = new e2_gen_prototype(this.type_range);
    e2_gen.generate(component + 1);
    let extracted_e2 = expr.tupleExtraction(e2_gen.irnode! as expr.IRExpression);
    if (isEqualSet(type_dag.solution_range.get(extracted_e2.id)!, type.elementary_types)) {
      type_dag.solution_range.set(extracted_e2.id, pickRandomElement(type.type_range_collection)!);
      type_dag.tighten_solution_range_from_a_head(extracted_e2.id);
    }
    //! Finally, get a generator for e3.
    let e3_gen_prototype;
    if (component >= config.expression_complex_level) {
      e3_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(this.type_range, type.address_types))
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    const e3_gen = new e3_gen_prototype!(type_dag.solution_range.get(extracted_e2.id)!);
    e3_gen.generate(component + 1);
    this.irnode = new expr.IRConditional(
      global_id++, cur_scope.value(), field_flag, e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    let extracted_e3 = expr.tupleExtraction(e3_gen.irnode! as expr.IRExpression);
    type_dag.solution_range.set(extracted_e1.id, type.bool_types);
    type_dag.solution_range.set(this.irnode.id, type.elementary_types);
    type_dag.connect(extracted_e2.id, extracted_e3.id, "sub_dominance");
    typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, extracted_e2.id);
    typeRangeAlignment(this.irnode.id, extracted_e2.id);
    if (config.debug)
      console.log(color.yellowBG(`${this.irnode.id}: Conditional, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class FunctionCallGenerator extends RValueGenerator {
  kind : FunctionCallKind | undefined;
  constructor(type_range : type.Type[], kind ?: FunctionCallKind) {
    super(type_range);
    this.kind = kind;
    if (this.kind === undefined) {
      this.kind = FunctionCallKind.FunctionCall;
    }
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`Starting generating FunctionCall`));
    }
    //! If component reaches the maximum, generate an terminal expression
    if (component >= config.expression_complex_level) {
      const expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.type_range);
      expression_gen.generate(component);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Find available function declarations
    const available_funcdecls_ids : number[] = [];
    const IDs_of_available_irnodes = irnode_db.get_IRNodes_by_scope(cur_scope.value());
    //TODO: update the following function definition candidates after introducing interconnection between contracts.
    for (let id of IDs_of_available_irnodes) {

      if (funcdecls.has(id) && (irnodes[id] as decl.IRFunctionDefinition).visibility !== FunctionVisibility.External) {
        for (const ret_decl of (irnodes[id] as decl.IRFunctionDefinition).returns) {
          if (isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl.id)!)
            || isSuperSet(type_dag.solution_range.get(ret_decl.id)!, this.type_range)) {
            available_funcdecls_ids.push(id);
            break;
          }
        }
      }
    }
    //! If no available function declaration, generate a other expressions
    if (available_funcdecls_ids.length === 0) {
      const expression_gen_prototype = pickRandomElement(non_funccall_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.type_range);
      expression_gen.generate(component);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Otherwise, first select a function declaration
    const funcdecl_id = pickRandomElement([...available_funcdecls_ids])!;
    const funcdecl = irnodes[funcdecl_id] as decl.IRFunctionDefinition;
    //! Then generate an identifier for this function declaration
    const func_name = funcdecl.name;
    const func_identifier = new expr.IRIdentifier(global_id++, cur_scope.value(), field_flag, func_name, funcdecl_id);
    irnode_db.insert(func_identifier.id, func_identifier.scope);
    //! Then generate expressions as arguments
    const args_ids : number[] = [];
    for (let i = 0; i < funcdecl.parameters.length; i++) {
      const arg_gen_prototype = pickRandomElement(all_expression_generators)!;
      const arg_gen = new arg_gen_prototype(type_dag.solution_range.get(funcdecl.parameters[i].id)!);
      arg_gen.generate(component + 1);
      let extracted_arg = expr.tupleExtraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
    }
    //! Then select which returned value to be used
    const ret_decls = funcdecl.returns;
    const available_ret_decls_index : number[] = [];
    for (let i = 0; i < ret_decls.length; i++) {
      if (isSuperSet(this.type_range, type_dag.solution_range.get(ret_decls[i].id)!)
        || isSuperSet(type_dag.solution_range.get(ret_decls[i].id)!, this.type_range)) {
        available_ret_decls_index.push(i);
      }
    }
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 0) {
      //* 1.generate an function call and select which returned value will be used
      const func_call_node = new expr.IRFunctionCall(global_id++, cur_scope.value(), field_flag, this.kind!,
        func_identifier, args_ids.map(i => irnodes[i] as expr.IRExpression));
      const selected_ret_decls_index = pickRandomElement(available_ret_decls_index)!;
      //* 2. generate an identifier
      const identifier_gen = new IdentifierGenerator(type_dag.solution_range.get(ret_decls[selected_ret_decls_index].id)!);
      identifier_gen.generate(component + 1);
      const identifier_expr = expr.tupleExtraction(identifier_gen.irnode! as expr.IRExpression);
      type_dag.connect(identifier_expr.id, ret_decls[selected_ret_decls_index].id, "sub_dominance");
      typeRangeAlignment(identifier_expr.id, ret_decls[selected_ret_decls_index].id);
      //* 3. use a tuple to wrap around this identifier.
      const tuple_elements : (expr.IRExpression | null)[] = [];
      for (let i = 0; i < ret_decls.length; i++) {
        if (i === selected_ret_decls_index) {
          tuple_elements.push(identifier_gen.irnode! as expr.IRExpression);
        }
        else {
          tuple_elements.push(null);
        }
      }
      const tuple_node = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, tuple_elements);
      const assignment_node = new expr.IRAssignment(global_id++, cur_scope.value(), field_flag, tuple_node, func_call_node, "=");
      //* 4. generate an assignment statement passing the returned values of the callee to the tuple
      const assignment_stmt_node = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_node);
      unexpected_extra_stmt.push(assignment_stmt_node);
      //* 5. This irnode is the same as the identifier irnode which relays the selected returned value
      this.irnode = identifier_gen.irnode!;
    }
    else {
      this.irnode = new expr.IRFunctionCall(global_id++, cur_scope.value(), field_flag, this.kind!,
        func_identifier, args_ids.map(i => irnodes[i] as expr.IRExpression));
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class TupleGeneration extends Generator {
  elements : (expr.IRExpression | null)[];
  constructor(elements : (expr.IRExpression | null)[]) {
    super();
    this.elements = elements;
  }
  generate() {
    this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, this.elements);
  }
}

const terminal_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator
];

const nonterminal_expression_generators = [
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const nonterminal_expression_generators_for_address_type = [
  AssignmentGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

const non_funccall_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
];

const all_expression_generators = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
  BinaryOpGenerator,
  UnaryOpGenerator,
  ConditionalGenerator,
  FunctionCallGenerator
];

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
      global_id++, cur_scope.value(), field_flag, [variable_gen.irnode! as decl.IRVariableDeclare], expression_gen.irnode! as expr.IRExpression
    );
    let expression_gen_extracted = expr.tupleExtraction(expression_gen.irnode! as expr.IRExpression);
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
    const ir_exps : expr.IRExpression[] = [];
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
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
    }
    const ir_varnodes : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      variable_gen.generate();
      ir_varnodes.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    const ir_tuple_exp = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, ir_exps);
    this.irnode = new stmt.IRVariableDeclareStatement(global_id++, cur_scope.value(), field_flag, ir_varnodes, ir_tuple_exp);
    for (let i = 0; i < this.var_count; i++) {
      let extracted_ir = expr.tupleExtraction(ir_exps[i]);
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
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate() : void {
    const assignment_gen = new BinaryOpGenerator(type.elementary_types);
    assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate() : void {
    const assignment_gen = new UnaryOpGenerator(type.elementary_types);
    assignment_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class ConditionalStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  generate() : void {
    const conditional_gen = new ConditionalGenerator(type.elementary_types);
    conditional_gen.generate(0);
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, conditional_gen.irnode! as expr.IRConditional);
  }
}

export class ReturnStatementGenerator extends StatementGenerator {
  value : expr.IRExpression | undefined;
  constructor(value ?: expr.IRExpression) {
    super();
    this.value = value;
  }
  generate() : void {
    if (this.value === undefined) {
      const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expression_gen = new expression_gen_prototype(type.elementary_types);
      expression_gen.generate(0);
      this.value = expression_gen.irnode! as expr.IRExpression;
    }
    this.irnode = new stmt.IRReturnStatement(global_id++, cur_scope.value(), field_flag, this.value);
  }
}

const statement_generators = [
  AssignmentStatementGenerator,
  BinaryOpStatementGenerator,
  UnaryOpStatementGenerator,
  ConditionalStatementGenerator,
]