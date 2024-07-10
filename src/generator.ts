import { assert, pickRandomElement, generateRandomString, randomInt, mergeSet } from "./utility";
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
import { ContractKind, FunctionCallKind, FunctionKind, FunctionVisibility } from "solc-typed-ast";
import { LinkedListNode } from "./dataStructor";

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Global Variables

const varnames = new Set<string>();
let global_id = 0;
class ScopeList extends LinkedListNode<number> {
  constructor(value : number) {
    super(value);
  }

  create(value : number) : ScopeList {
    this.m_next = new ScopeList(value);
    this.m_next.set_pre(this);
    return this.m_next as ScopeList;
  }

  new() : ScopeList {
    scope_id++;
    irnode_db.new_scope(scope_id, this.m_value!);
    return this.create(scope_id) as ScopeList;
  }

  rollback() : ScopeList {
    return super.rollback() as ScopeList;
  }
}
let scope_id : number = 0;
let cur_scope : ScopeList = new ScopeList(scope_id);
let field_flag = FieldFlag.GLOBAL;
let indent = 0;
// Record the vardecls used by each expression. If an expr contains an identifier of a vardecl, then this expr uses this vardecl.
const expr2used_vardecls : Map<number, Set<number>> = new Map<number, Set<number>>();
// Record the vardecls dominated by each expression.
// expr2dominated_vardecls only cares about the vardecls that are dominated during expr generation.
// If this expr is dominated / dominates other exprs after the generation, the domination relation is not recorded.
const expr2dominated_vardecls : Map<number, Set<number>> = new Map<number, Set<number>>();
// For each key vardecl, record the vardecls that dominate or are dominated by it. These vardecls are of the same type range as the key vardecl.
const vardecl2vardecls_of_the_same_type_range : Map<number, Set<number>> = new Map<number, Set<number>>();
const vardecls : Set<number> = new Set<number>();
const funcdecls : Set<number> = new Set<number>();
const contractdecls : Set<number> = new Set<number>();
/*
Image a awkward situation:
In a function call generation, one of the arguments is a function call to the same function.
Then the type range decision of one of the returned variable may encounter a conflict.
For instance, the first function call decides the first retured variable to be an integer while
the second function call decides the first returned variable to be a boolean.
The second advances in this race since we should generate the argument before the function call.
Now the first function call believe the first returned variable is an integer while the second function call
has made it a boolean. So we need to forbid this recursive function calls to the same function definition.
To support function call as an argument of another function call to the same function, we need to introduce
mutators after resolving domination constraints.
*/
const forbidden_funcs : Set<number> = new Set<number>();
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
    if (vardecls.has(id)) collection.push(irnodes.get(id)! as decl.IRVariableDeclare);
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
    if (vardecls.has(id)) collection.push(irnodes.get(id)! as decl.IRVariableDeclare);
  }
  return collection.filter((irdecl) => isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) || isSuperSet(types, type_dag.solution_range.get(irdecl.id)!));
}

function hasAvailableIRVariableDeclareWithTypeConstraint(types : type.Type[]) : boolean {
  return getAvailableIRVariableDeclareWithTypeConstraint(types).length > 0;
}

function getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types : type.Type[],
  forbidden_vardecls : Set<number>,
  dominated_vardecls_by_dominator : Set<number>) :
  decl.IRVariableDeclare[] {
  const collection : decl.IRVariableDeclare[] = [];
  const IDs_of_available_irnodes = irnode_db.get_IRNodes_by_scope(cur_scope.value());
  for (let id of IDs_of_available_irnodes) {
    if (vardecls.has(id)) collection.push(irnodes.get(id)! as decl.IRVariableDeclare);
  }

  for (const dominated_vardecl of dominated_vardecls_by_dominator) {
    for (const vardecl of vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!) {
      dominated_vardecls_by_dominator.add(vardecl);
    }
  }

  for (const vardecl of forbidden_vardecls) {
    for (const dominated_vardecl of vardecl2vardecls_of_the_same_type_range.get(vardecl)!) {
      if (!forbidden_vardecls.has(dominated_vardecl)) {
        forbidden_vardecls.add(dominated_vardecl);
      }
    }
  }

  let type_range_narrows_down_the_type_range_of_forbidden_vardecls = (type_range : type.Type[]) : boolean => {
    for (const vardecl of dominated_vardecls_by_dominator) {
      if (isSuperSet(type_dag.solution_range.get(vardecl)!, type_range)
        && !isEqualSet(type_dag.solution_range.get(vardecl)!, type_range)) return true;
    }
    return false;
  }

  return collection.filter((irdecl) =>
    type_range_narrows_down_the_type_range_of_forbidden_vardecls(type_dag.solution_range.get(irdecl.id)!) ?
      false :
      forbidden_vardecls.has(irdecl.id) ?
        isSuperSet(types, type_dag.solution_range.get(irdecl.id)!) :
        isSuperSet(type_dag.solution_range.get(irdecl.id)!, types) ||
        isSuperSet(types, type_dag.solution_range.get(irdecl.id)!));
}

function hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types : type.Type[],
  forbidden_vardecls : Set<number>,
  dominated_vardecls_by_dominator : Set<number>) :
  boolean {
  return getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(types,
    forbidden_vardecls,
    dominated_vardecls_by_dominator).length > 0;
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
  throw new Error(`typeRangeAlignment: type_range of ${irnode_id1}: ${type_dag.solution_range.get(irnode_id1)!.map(t => t.str())}
    and ${irnode_id2}: ${type_dag.solution_range.get(irnode_id2)!.map(t => t.str())} cannot be aligned`);
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
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating vardecl, name is ${this.name}, type range is ${this.type_range.map(t => t.str())}`));
    }
    this.irnode = new decl.IRVariableDeclare(global_id++, cur_scope.value(), field_flag, generateVarName());
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    vardecls.add(this.irnode.id);
    vardecl2vardecls_of_the_same_type_range.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode!.id}: VarDecl, name: ${this.name}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode!.id)!.map(t => t.str())}`));
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
    console.log(2, cur_scope.value());
    cur_scope = cur_scope.new();
    console.log(3, cur_scope.value());
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Definition`));
      indent += 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Parameters, ${parameter_count} in total`));
    }
    for (let i = 0; i < parameter_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      if (config.debug) indent += 2;
      variable_gen.generate();
      if (config.debug) indent -= 2;
      parameters.push(variable_gen.irnode! as decl.IRVariableDeclare);
    }
    let body : stmt.IRStatement[] = [];
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Body, ${body_stmt_count} in total`));
    }
    for (let i = body.length; i < body_stmt_count; i++) {
      const stmt_gen_prototype = pickRandomElement(statement_generators)!;
      const stmt_gen = new stmt_gen_prototype();
      if (config.debug) indent += 2;
      stmt_gen.generate();
      if (config.debug) indent -= 2;
      body = body.concat(unexpected_extra_stmt);
      unexpected_extra_stmt = [];
      body.push(stmt_gen.irnode! as stmt.IRStatement);
    }
    const return_decls : decl.IRVariableDeclare[] = [];
    const return_values : expr.IRExpression[] = [];
    const return_count = randomInt(0, config.return_count_of_function_upperlimit);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Function Returns, ${return_count} in total`));
    }
    for (let i = 0; i < return_count; i++) {
      //* Generate expr for return
      const expr_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expr_gen = new expr_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
      if (config.debug) indent += 2;
      expr_gen.generate(0);
      if (config.debug) indent -= 2;
      const expr_for_return = expr.tupleExtraction(expr_gen.irnode! as expr.IRExpression);
      return_values.push(expr_for_return);
      let expression_extracted = expr.tupleExtraction(return_values[i]);
      //* Generate the returned vardecl
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      if (config.debug) indent += 2;
      variable_gen.generate();
      if (config.debug) indent -= 2;
      //! Update vardecl2vardecls_of_the_same_type_range
      const dominated_vardecls = expr2dominated_vardecls.get(expression_extracted.id)!;
      for (const dominated_vardecl of dominated_vardecls) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
            new Set<number>([variable_gen.irnode!.id])));
      }
      vardecl2vardecls_of_the_same_type_range.set(variable_gen.irnode!.id, dominated_vardecls);
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
      if (config.debug) indent += 2;
      return_gen.generate();
      if (config.debug) indent -= 2;
      body.push(return_gen.irnode!);
    }
    cur_scope = cur_scope.rollback();
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
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating function ${name}`));
      indent -= 2;
    }
  }
}

export class ContractDeclareGenerator extends DeclarationGenerator {
  constructor() { super(); }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Contract Definition`));
      indent += 2;
    }
    //! Create the contract scope
    cur_scope = cur_scope.new();
    const body : IRNode[] = [];
    //TODO: Generate state variable
    //! Generate contract name
    const contract_name = generateVarName();
    //TODO: Generate struct declaration
    //TODO: Generate events, errors, and mappings
    //! Generate functions in contract
    const function_count_per_contract = randomInt(1, config.function_count_per_contract);
    for (let i = 0; i < function_count_per_contract; i++) {
      const function_gen = new FunctionDeclareGenerator();
      if (config.debug) indent += 2;
      function_gen.generate();
      if (config.debug) indent -= 2;
      body.push(function_gen.irnode!);
    }
    cur_scope = cur_scope.rollback();
    this.irnode = new decl.IRContractDefinition(global_id++, cur_scope.value(), field_flag, contract_name, ContractKind.Contract, false, false, body, [], [], []);
    contractdecls.add(this.irnode.id);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Finish generating contract`));
      indent -= 2;
    }
  }
}

//TODO: Generate library, interface, and abstract contract.

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Expression Generator

export abstract class ExpressionGenerator extends Generator {
  type_range : type.Type[];
  /*
    If an expression contains two parts: e1 and e2, the generation of e1 precedes the generation of e2.
    After the generation of e1, the type range of all vardecls used by e1 is pre-decided.
    In otherwides, these type ranges are not finally decided and may be further narrowed down by the generation of e2.
    For instance, a vardecl v has type range all_integer_types and is used by e1. The type range of v can be integer_types after the generation of e1.
    However, this "narrowing-down" step may cause an type range decision conflict.
    Take id1 ^= id1 + id2 << id1 as example. Suppose id1's vardecl has type range all_integer_types and id2's vardecl has type range integer_types.
    The operator << determines the type range of id1 is uinteger_types, resulting in the type range of id1 ^= id1 is uinteger_types, which arises a
    conflict since the type range of (id2 << id1) is integer_types.
    To eliminate this conflict, we introduce forbidden_vardecls to forbid the narrowing-down step of pre-decided type range.
    To simplify, forbidden_vardecls is a set of vardecls that are used by the dominator of the current expr.
    We also introduce dominated_vardecls_by_dominator to assist the support of forbidden_vardecls.
    If there exists a dominated vardecl v of the dominator of the current expr that is in forbidden_vardecls,
      then the type range of the current expr should not narrow down the type range of v.
  */
  forbidden_vardecls : Set<number>;
  dominated_vardecls_by_dominator : Set<number>;
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super();
    this.type_range = type_range;
    this.forbidden_vardecls = forbidden_vardecls;
    this.dominated_vardecls_by_dominator = dominated_vardecls_by_dominator;
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(component : number) : void;
}

export abstract class RValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(component : number) : void;
}

export abstract class LRValueGenerator extends ExpressionGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  abstract generate(component : number) : void;
}

export class LiteralGenerator extends RValueGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Literal, type range is ${this.type_range.map(t => t.str())}`));
    }
    this.irnode = new expr.IRLiteral(global_id++, cur_scope.value(), field_flag);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    expr2used_vardecls.set(this.irnode.id, new Set<number>());
    expr2dominated_vardecls.set(this.irnode.id, new Set<number>());
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Literal, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class IdentifierGenerator extends LRValueGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Identifier, type range is ${this.type_range.map(t => t.str())}`));
    }
    let irdecl : decl.IRVariableDeclare;
    // Generate a variable decl if there is no variable decl available.
    if (!hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator))
    ) {
      const variable_stmt_gen = new SingleVariableDeclareStatementGenerator(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator),
        true
      );
      if (config.debug) indent += 2;
      variable_stmt_gen.generate();
      if (config.debug) indent -= 2;
      unexpected_extra_stmt.push(variable_stmt_gen.irnode! as stmt.IRVariableDeclareStatement);
      irdecl = (variable_stmt_gen.irnode as stmt.IRVariableDeclareStatement).variable_declares[0] as decl.IRVariableDeclare;
    }
    else {
      const availableIRDecl = getAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      if (config.debug) {
        assert(availableIRDecl !== undefined, "IdentifierGenerator: availableIRDecl is undefined");
        assert(availableIRDecl.length > 0, "IdentifierGenerator: no available IR irnodes");
      }
      irdecl = pickRandomElement(availableIRDecl)!;
    }
    this.irnode = new expr.IRIdentifier(global_id++, cur_scope.value(), field_flag, irdecl.name, irdecl.id);
    type_dag.insert(type_dag.newNode(this.irnode.id));
    type_dag.connect(this.irnode.id, irdecl.id);
    type_dag.solution_range.set(this.irnode.id, this.type_range);
    typeRangeAlignment(this.irnode.id, irdecl.id);
    expr2used_vardecls.set(this.irnode.id, new Set<number>([irdecl.id]));
    expr2dominated_vardecls.set(this.irnode.id, new Set<number>([irdecl.id]));
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${this.irnode.id}: Identifier --> ${irdecl.id}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(this.irnode.id)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

type ASSIOP = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<<=" | ">>=" | "&=" | "^=" | "|=";

export class AssignmentGenerator extends RValueGenerator {
  op : ASSIOP;

  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: ASSIOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
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

  left_dominate_right() : boolean {
    return this.op !== ">>=" && this.op !== "<<=";
  }

  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
    }
    const thisid = global_id++;
    //! Update type range of this node
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
    //! Generate the left-hand-side identifier
    const identifier_gen = new IdentifierGenerator(type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator));
    if (config.debug) indent += 2;
    identifier_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    let left_expression : expr.IRExpression = identifier_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(left_extracted_expression.id)!);
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(left_extracted_expression.id)!);
    //! Generate the right-hand-side expression
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
    const forbidden_vardecls_for_right = mergeSet(expr2used_vardecls.get(left_extracted_expression.id)!, this.forbidden_vardecls);
    const dominated_vardecls_by_dominator_for_right = this.left_dominate_right() ?
      mergeSet(expr2dominated_vardecls.get(left_extracted_expression.id)!,
        this.dominated_vardecls_by_dominator) :
      new Set<number>();
    if (!this.left_dominate_right()) {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(isSuperSet(type_range,
        type_dag.solution_range.get(left_extracted_expression.id)!) ?
        type_dag.solution_range.get(left_extracted_expression.id)! :
        type_range, forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    if (config.debug) indent += 2;
    right_expression_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    let right_expression : expr.IRExpression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    if (config.debug)
      assert(type_dag.solution_range.has(right_extracted_expression.id), `solution_range does not contain ${right_extracted_expression.id}`);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(right_extracted_expression.id)!));
    if (this.left_dominate_right()) {
      const dominated_vardecls_of_left = expr2dominated_vardecls.get(left_extracted_expression.id)!;
      const dominated_vardecls_of_right = expr2dominated_vardecls.get(right_extracted_expression.id)!;
      for (const left_vardecl of dominated_vardecls_of_left) {
        for (const right_vardecl of dominated_vardecls_of_right) {
          vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
              dominated_vardecls_of_right)
          );
          vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
              dominated_vardecls_of_left)
          );
        }
      }
      expr2dominated_vardecls.set(thisid, mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right));
    }
    //! Generate irnode
    this.irnode = new expr.IRAssignment(thisid, cur_scope.value(), field_flag, left_expression, right_expression, this.op!);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.connect(thisid, left_extracted_expression.id);
    typeRangeAlignment(thisid, left_extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Assignment ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    //! Wrap the irnode with a tuple
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
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: BOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
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

  this_dominates_left() : boolean {
    return ["+", "-", "*", "/", "%", "<<", ">>", "&", "^", "|", "&&", "||"].filter((op) => op === this.op).length === 1;
  }

  left_dominate_right() : boolean {
    return this.op !== ">>" && this.op !== "<<";
  }

  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
    }
    const thisid = global_id++;
    //! Update type range of this node
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
    //! Select generators for the left-hand-side and right-hand-side expressions
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
    //! Generate left-hand-side expression
    const dominated_vardecls_by_dominator_for_left = this.this_dominates_left() ?
      new Set<number>(this.dominated_vardecls_by_dominator) :
      new Set<number>();
    left_expression_gen = new left_expression_gen_prototype(type_range,
      new Set<number>(this.forbidden_vardecls),
      dominated_vardecls_by_dominator_for_left);
    if (config.debug) indent += 2;
    left_expression_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    left_expression = left_expression_gen.irnode as expr.IRExpression;
    let left_extracted_expression = expr.tupleExtraction(left_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(left_extracted_expression.id)!);
    if (this.this_dominates_left())
      expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(left_extracted_expression.id)!);
    //! Generate right-hand-side expression
    const forbidden_vardecls_for_right = mergeSet(expr2used_vardecls.get(left_extracted_expression.id)!, this.forbidden_vardecls);
    const dominated_vardecls_by_dominator_for_right = this.left_dominate_right() ?
      mergeSet(expr2dominated_vardecls.get(left_extracted_expression.id)!,
        dominated_vardecls_by_dominator_for_left) :
      new Set<number>();
    if (!this.left_dominate_right()) {
      right_expression_gen = new right_expression_gen_prototype(type.uinteger_types,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    else {
      right_expression_gen = new right_expression_gen_prototype(type_dag.solution_range.get(left_extracted_expression.id)!,
        forbidden_vardecls_for_right,
        dominated_vardecls_by_dominator_for_right);
    }
    if (config.debug) indent += 2;
    right_expression_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    right_expression = right_expression_gen.irnode as expr.IRExpression;
    let right_extracted_expression = expr.tupleExtraction(right_expression);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, (expr2used_vardecls.get(right_extracted_expression.id)!)));
    if (this.left_dominate_right()) {
      const dominated_vardecls_of_left = expr2dominated_vardecls.get(left_extracted_expression.id)!;
      const dominated_vardecls_of_right = expr2dominated_vardecls.get(right_extracted_expression.id)!;
      for (const left_vardecl of dominated_vardecls_of_left) {
        for (const right_vardecl of dominated_vardecls_of_right) {
          vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
              dominated_vardecls_of_right));
          vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
            mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
              dominated_vardecls_of_left));
        }
      }
      expr2dominated_vardecls.set(thisid,
        expr2dominated_vardecls.has(thisid) ? mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right) :
          dominated_vardecls_of_right);
    }
    //! Generate irnode
    this.irnode = new expr.IRBinaryOp(thisid, cur_scope.value(), field_flag, left_expression, right_expression, this.op);
    //! Build dominations
    if (this.left_dominate_right()) {
      type_dag.connect(left_extracted_expression.id, right_extracted_expression.id, "sub_dominance");
      typeRangeAlignment(left_extracted_expression.id, right_extracted_expression.id);
    }
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    if (this.this_dominates_left()) {
      type_dag.connect(thisid, left_extracted_expression.id);
      typeRangeAlignment(thisid, left_extracted_expression.id);
    }
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: BinaryOp ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

type UOP = "!" | "-" | "~" | "++" | "--";

//TODO: create a delete Statement Generator
export class UnaryOpGenerator extends RValueGenerator {
  op : UOP;
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, op ?: UOP) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
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
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOp ${this.op}, type range is ${this.type_range.map(t => t.str())}`));
    }
    let type_range;
    const thisid = global_id++;
    //! Update type range
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
    //! Generate identifier
    const identifier_gen = new IdentifierGenerator(type_range,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>(this.dominated_vardecls_by_dominator));
    if (config.debug) indent += 2;
    identifier_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    let expression : expr.IRExpression = identifier_gen.irnode! as expr.IRExpression;
    //! Generate irnode
    this.irnode = new expr.IRUnaryOp(thisid, cur_scope.value(), field_flag, pickRandomElement([true, false])!, expression, this.op)!;
    let extracted_expression = expr.tupleExtraction(expression);
    //!. Update expr2used_vardecls, expr2dominated_vardecls
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_expression.id)!);
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(extracted_expression.id)!);
    //! Build dominations
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.connect(thisid, extracted_expression.id);
    typeRangeAlignment(thisid, extracted_expression.id);
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: UnaryOp ${this.op}, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class ConditionalGenerator extends RValueGenerator {
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
  }
  generate(component : number) : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Conditional, type range is ${this.type_range.map(t => t.str())}`));
    }
    const thisid = global_id++;
    //! Suppose the conditional expression is e1 ? e2 : e3
    //! The first step is to get a generator for e1.
    let e1_gen_prototype;
    if (component >= config.expression_complex_level) {
      e1_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      e1_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e1
    const e1_gen = new e1_gen_prototype(type.bool_types,
      new Set<number>(this.forbidden_vardecls),
      new Set<number>());
    if (config.debug) indent += 2;
    e1_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    let extracted_e1 = expr.tupleExtraction(e1_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid, expr2used_vardecls.get(extracted_e1.id)!);
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
    //! Generate e2
    const forbidden_vardecl_for_e2 = mergeSet(expr2used_vardecls.get(extracted_e1.id)!, this.forbidden_vardecls);
    const e2_gen = new e2_gen_prototype(this.type_range,
      forbidden_vardecl_for_e2,
      new Set<number>(this.dominated_vardecls_by_dominator));
    if (config.debug) indent += 2;
    e2_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    let extracted_e2 = expr.tupleExtraction(e2_gen.irnode! as expr.IRExpression);
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(extracted_e2.id)!));
    expr2dominated_vardecls.set(thisid, expr2dominated_vardecls.get(extracted_e2.id)!);
    let type_range_of_extracted_e2 = type_dag.solution_range.get(extracted_e2.id)!;
    //! Finally, get a generator for e3.
    let e3_gen_prototype;
    if (component >= config.expression_complex_level) {
      e3_gen_prototype = pickRandomElement(terminal_expression_generators)!;
    }
    else {
      if (isEqualSet(type_range_of_extracted_e2, type.address_types))
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
      else
        e3_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
    }
    //! Generate e3
    const forbidden_vardecl_for_e3 = mergeSet(expr2used_vardecls.get(extracted_e2.id)!, forbidden_vardecl_for_e2);
    const e3_gen = new e3_gen_prototype!(type_range_of_extracted_e2,
      forbidden_vardecl_for_e3,
      mergeSet(this.dominated_vardecls_by_dominator,
        expr2dominated_vardecls.get(extracted_e2.id)!)
    );
    if (config.debug) indent += 2;
    e3_gen.generate(component + 1);
    if (config.debug) indent -= 2;
    this.irnode = new expr.IRConditional(
      thisid, cur_scope.value(), field_flag, e1_gen.irnode! as expr.IRExpression,
      e2_gen.irnode! as expr.IRExpression,
      e3_gen.irnode! as expr.IRExpression
    );
    let extracted_e3 = expr.tupleExtraction(e3_gen.irnode! as expr.IRExpression);
    //! Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
    expr2used_vardecls.set(thisid, mergeSet(expr2used_vardecls.get(thisid)!, expr2used_vardecls.get(extracted_e3.id)!));
    const dominated_vardecls_of_left = expr2dominated_vardecls.get(extracted_e2.id)!;
    const dominated_vardecls_of_right = expr2dominated_vardecls.get(extracted_e3.id)!;
    for (const left_vardecl of dominated_vardecls_of_left) {
      for (const right_vardecl of dominated_vardecls_of_right) {
        vardecl2vardecls_of_the_same_type_range.set(left_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(left_vardecl)!,
            dominated_vardecls_of_right));
        vardecl2vardecls_of_the_same_type_range.set(right_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(right_vardecl)!,
            dominated_vardecls_of_left));
      }
    }
    expr2dominated_vardecls.set(thisid, mergeSet(expr2dominated_vardecls.get(thisid)!, dominated_vardecls_of_right));
    //! Build dominations
    type_dag.solution_range.set(extracted_e1.id, type.bool_types);
    type_dag.solution_range.set(thisid, type.elementary_types);
    type_dag.connect(extracted_e2.id, extracted_e3.id, "sub_dominance");
    typeRangeAlignment(extracted_e2.id, extracted_e3.id);
    type_dag.insert(type_dag.newNode(thisid));
    type_dag.connect(thisid, extracted_e2.id);
    typeRangeAlignment(thisid, extracted_e2.id);
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: Conditional, scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
  }
}

export class FunctionCallGenerator extends RValueGenerator {
  kind : FunctionCallKind | undefined;
  constructor(type_range : type.Type[], forbidden_vardecls : Set<number>, dominated_vardecls_by_dominator : Set<number>, kind ?: FunctionCallKind) {
    super(type_range, forbidden_vardecls, dominated_vardecls_by_dominator);
    this.kind = kind;
    if (this.kind === undefined) {
      this.kind = FunctionCallKind.FunctionCall;
    }
  }
  generate(component : number) : void {
    const dominated_vardecls_by_dominator_copy = new Set<number>(this.dominated_vardecls_by_dominator);
    for (const dominated_vardecl of dominated_vardecls_by_dominator_copy) {
      for (const vardecl of vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!) {
        dominated_vardecls_by_dominator_copy.add(vardecl);
      }
    }
    let type_range_narrows_down_the_type_range_of_dominated_vardecls = (type_range : type.Type[]) : boolean => {
      for (const vardecl of dominated_vardecls_by_dominator_copy) {
        if (isSuperSet(type_dag.solution_range.get(vardecl)!, type_range)
          && !isEqualSet(type_dag.solution_range.get(vardecl)!, type_range)) return true;
      }
      return false;
    };
    let return_is_good = (ret_decl : number) : boolean => {
      return type_range_narrows_down_the_type_range_of_dominated_vardecls(this.type_range) ?
        false :
        this.forbidden_vardecls.has(ret_decl) ?
          isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl)!) :
          isSuperSet(this.type_range, type_dag.solution_range.get(ret_decl)!)
          || isSuperSet(type_dag.solution_range.get(ret_decl)!, this.type_range)
    };
    //! If component reaches the maximum, generate an terminal expression
    if (component >= config.expression_complex_level) {
      const expression_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      const expression_gen = new expression_gen_prototype(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      expression_gen.generate(component);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Find available function declarations
    const available_funcdecls_ids : number[] = [];
    const IDs_of_available_irnodes = irnode_db.get_IRNodes_by_scope(cur_scope.value());
    //TODO: update the following function definition candidates after introducing interconnection between contracts.
    for (let id of IDs_of_available_irnodes) {
      if (funcdecls.has(id) && (irnodes.get(id)! as decl.IRFunctionDefinition).visibility !== FunctionVisibility.External) {
        let ret_decl_index = 0;
        for (const ret_decl of (irnodes.get(id)! as decl.IRFunctionDefinition).returns) {
          if (forbidden_funcs.has(id)) continue;
          if (return_is_good(ret_decl.id)) {
            available_funcdecls_ids.push(id);
            break;
          }
          ret_decl_index++;
        }
      }
    }
    //! If no available function declaration, generate a other expressions
    if (available_funcdecls_ids.length === 0) {
      let expression_gen_prototype;
      if (isEqualSet(this.type_range, type.address_types)) {
        expression_gen_prototype = pickRandomElement(non_funccall_expression_generators_for_address_type)!;
      }
      else {
        expression_gen_prototype = pickRandomElement(non_funccall_expression_generators)!;
      }
      const expression_gen = new expression_gen_prototype(this.type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      expression_gen.generate(component);
      this.irnode = expression_gen.irnode;
      return;
    }
    //! Otherwise, first select a function declaration
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall, type range is ${this.type_range.map(t => t.str())}`));
    }
    const thisid = global_id++;
    type_dag.solution_range.set(thisid, this.type_range);
    type_dag.insert(type_dag.newNode(thisid));
    const funcdecl_id = pickRandomElement([...available_funcdecls_ids])!;
    const funcdecl = irnodes.get(funcdecl_id)! as decl.IRFunctionDefinition;
    //! Then generate an identifier for this function declaration
    const func_name = funcdecl.name;
    const func_identifier = new expr.IRIdentifier(global_id++, cur_scope.value(), field_flag, func_name, funcdecl_id);
    irnode_db.insert(func_identifier.id, func_identifier.scope);
    //! Then select which returned value to be used
    const ret_decls = funcdecl.returns;
    const available_ret_decls_index : number[] = [];
    for (let i = 0; i < ret_decls.length; i++) {
      if (return_is_good(ret_decls[i].id)) {
        available_ret_decls_index.push(i);
      }
    }
    const selected_ret_decls_index = pickRandomElement(available_ret_decls_index)!;
    const selected_ret_decl = ret_decls[selected_ret_decls_index];
    type_dag.connect(thisid, selected_ret_decl.id);
    typeRangeAlignment(thisid, selected_ret_decl.id);
    forbidden_funcs.add(funcdecl_id);
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  The type range of the selected ret decl is ${selected_ret_decls_index}: ${type_dag.solution_range.get(selected_ret_decl.id)!.map(t => t.str())}`));
    }
    //! Then generate expressions as arguments
    if (config.debug) {
      indent += 2;
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating FunctionCall Arguments`));
    }
    const args_ids : number[] = [];
    for (let i = 0; i < funcdecl.parameters.length; i++) {
      const type_range = type_dag.solution_range.get(funcdecl.parameters[i].id)!;
      let arg_gen_prototype;
      if (component >= config.expression_complex_level) {
        arg_gen_prototype = pickRandomElement(terminal_expression_generators)!;
      }
      else {
        if (isEqualSet(type_range, type.address_types))
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators_for_address_type)!;
        else
          arg_gen_prototype = pickRandomElement(nonterminal_expression_generators)!;
      }
      const arg_gen = new arg_gen_prototype(type_range,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      if (config.debug) indent += 2;
      arg_gen.generate(component + 1);
      if (config.debug) indent -= 2;
      let extracted_arg = expr.tupleExtraction(arg_gen.irnode! as expr.IRExpression);
      args_ids.push(extracted_arg.id);
      type_dag.connect(extracted_arg.id, funcdecl.parameters[i].id);
      typeRangeAlignment(extracted_arg.id, funcdecl.parameters[i].id);
      const dominated_vardecls = expr2dominated_vardecls.get(extracted_arg.id)!;
      for (const dominated_vardecl of dominated_vardecls) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
            new Set<number>([funcdecl.parameters[i].id])));
      }
      vardecl2vardecls_of_the_same_type_range.set(funcdecl.parameters[i].id, dominated_vardecls);
    }
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}<<  Finish generating FunctionCall Arguments`));
      indent -= 2;
    }
    //! Generate an function call and select which returned value will be used
    const func_call_node = new expr.IRFunctionCall(thisid, cur_scope.value(), field_flag, this.kind!,
      func_identifier, args_ids.map(i => irnodes.get(i)! as expr.IRExpression));
    expr2used_vardecls.set(thisid, new Set<number>([selected_ret_decl.id]));
    expr2dominated_vardecls.set(thisid, new Set<number>([selected_ret_decl.id]));
    //! If the function has more than one returns, we need to first generate a tuple of identifiers to
    //! relay the returned variables. And the irnode of this generation is the same as the one of the generated
    //! IRIdentifiers
    if (funcdecl.returns.length > 1) {
      //* generate an identifier
      let type_range_for_identifier = type_dag.solution_range.get(selected_ret_decl.id)!;
      if (isSuperSet(type_range_for_identifier, this.type_range)) {
        type_range_for_identifier = this.type_range;
      }
      const identifier_gen = new IdentifierGenerator(type_range_for_identifier,
        new Set<number>(this.forbidden_vardecls),
        new Set<number>(this.dominated_vardecls_by_dominator));
      if (config.debug) indent += 2;
      identifier_gen.generate(component + 1);
      if (config.debug) indent -= 2;
      const identifier_expr = expr.tupleExtraction(identifier_gen.irnode! as expr.IRExpression);
      //* 3. Update expr2used_vardecls, expr2dominated_vardecls, and vardecl2vardecls_of_the_same_type_range
      expr2used_vardecls.set(thisid, mergeSet(this.forbidden_vardecls, expr2used_vardecls.get(identifier_expr.id)!));
      const dominated_vardecls_of_identifier = expr2dominated_vardecls.get(identifier_expr.id)!;
      for (const dominated_vardecl of dominated_vardecls_of_identifier) {
        vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!, new Set<number>([selected_ret_decl.id])));
        vardecl2vardecls_of_the_same_type_range.set(selected_ret_decl.id,
          mergeSet(vardecl2vardecls_of_the_same_type_range.get(selected_ret_decl.id)!, new Set<number>([dominated_vardecl])));
      }
      type_dag.connect(identifier_expr.id, thisid);
      typeRangeAlignment(identifier_expr.id, thisid);
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
      expr2used_vardecls.set(this.irnode.id, new Set<number>([selected_ret_decl.id]));
      expr2dominated_vardecls.set(this.irnode.id, new Set<number>([selected_ret_decl.id]));
    }
    else {
      this.irnode = func_call_node;
    }
    if (Math.random() < config.tuple_prob) {
      this.irnode = new expr.IRTuple(global_id++, cur_scope.value(), field_flag, [this.irnode as expr.IRExpression]);
    }
    forbidden_funcs.delete(funcdecl_id);
    if (config.debug)
      console.log(color.yellowBG(`${" ".repeat(indent)}${thisid}: FunctionCall, id: ${thisid} scope: ${cur_scope.value()}, type: ${type_dag.solution_range.get(thisid)!.map(t => t.str())}`));
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

const non_funccall_expression_generators_for_address_type = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
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

const all_expression_generators_for_address_types = [
  LiteralGenerator,
  IdentifierGenerator,
  AssignmentGenerator,
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
  forbidden_vardecls : Set<number> | undefined;
  dominated_vardecls_by_dominator : Set<number> | undefined;
  generate_literal : boolean = false;
  constructor(type_range ?: type.Type[], forbidden_vardecls ?: Set<number>, dominated_vardecls_by_dominator ?: Set<number>, generate_literal ?: boolean) {
    super();
    this.type_range = type_range;
    this.forbidden_vardecls = forbidden_vardecls;
    this.dominated_vardecls_by_dominator = dominated_vardecls_by_dominator;
    if (generate_literal !== undefined) this.generate_literal = generate_literal;
  }
  generate() : void {
    if (this.type_range === undefined) this.type_range = type.elementary_types;
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating SingleVariableDeclareStatement, type range is ${this.type_range!.map(t => t.str())}`));
    }
    let expression_gen_prototype;
    let expression_gen;
    if (!this.generate_literal &&
      ((
        this.type_range === undefined && hasAvailableIRVariableDeclare() ||
        this.type_range !== undefined && this.forbidden_vardecls === undefined && this.dominated_vardecls_by_dominator === undefined &&
        hasAvailableIRVariableDeclareWithTypeConstraint(this.type_range) ||
        this.type_range !== undefined && this.forbidden_vardecls !== undefined && this.dominated_vardecls_by_dominator !== undefined &&
        hasAvailableIRVariableDeclareWithTypeConstraintWithForbiddenVardeclcs(this.type_range,
          new Set<number>(this.forbidden_vardecls),
          new Set<number>(this.dominated_vardecls_by_dominator))
      ) && Math.random() > config.literal_prob)
    ) {
      if (isEqualSet(this.type_range, type.address_types)) {
        expression_gen_prototype = pickRandomElement(all_expression_generators_for_address_types)!;
      }
      else {
        expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      }
      expression_gen = new expression_gen_prototype(this.type_range, new Set<number>(), new Set<number>());
    }
    else {
      expression_gen = new LiteralGenerator(this.type_range, new Set<number>(), new Set<number>());
    }
    if (config.debug) indent += 2;
    expression_gen.generate(0);
    if (config.debug) indent -= 2;
    const variable_gen = new VariableDeclareGenerator(this.type_range);
    if (config.debug) indent += 2;
    variable_gen.generate();
    if (config.debug) indent -= 2;
    //! Update vardecl2vardecls_of_the_same_type_range
    const extracted_expression = expr.tupleExtraction(expression_gen.irnode! as expr.IRExpression);
    const dominated_vardecls = expr2dominated_vardecls.get(extracted_expression.id)!;
    for (const dominated_vardecl of dominated_vardecls) {
      vardecl2vardecls_of_the_same_type_range.set(dominated_vardecl,
        mergeSet(vardecl2vardecls_of_the_same_type_range.get(dominated_vardecl)!,
          new Set<number>([variable_gen.irnode!.id])));
    }
    vardecl2vardecls_of_the_same_type_range.set(variable_gen.irnode!.id, dominated_vardecls);
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
    assert(config.experimental, "MultipleVariableDeclareStatementGenerator is experimental, please turn on the experimental mode");
    super();
    this.var_count = var_count;
  }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating Assignment MultipleVariableDeclareStatement`));
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
      const expression_gen = new expression_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
      if (config.debug) indent += 2;
      expression_gen.generate(0);
      if (config.debug) indent -= 2;
      ir_exps.push(expression_gen.irnode! as expr.IRExpression);
    }
    const ir_varnodes : decl.IRVariableDeclare[] = [];
    for (let i = 0; i < this.var_count; i++) {
      const variable_gen = new VariableDeclareGenerator(type.elementary_types);
      if (config.debug) indent += 2;
      variable_gen.generate();
      if (config.debug) indent -= 2;
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
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating AssignmentStatement`));
    }
    const assignment_gen = new AssignmentGenerator(type.elementary_types, new Set<number>(), new Set<number>());
    if (config.debug) indent += 2;
    assignment_gen.generate(0);
    if (config.debug) indent -= 2;
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class BinaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating BinaryOpStatement`));
    }
    const assignment_gen = new BinaryOpGenerator(type.elementary_types, new Set<number>(), new Set<number>());
    if (config.debug) indent += 2;
    assignment_gen.generate(0);
    if (config.debug) indent -= 2;
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class UnaryOpStatementGenerator extends ExpressionStatementGenerator {
  constructor() { super(); }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating UnaryOpStatement`));
    }
    const assignment_gen = new UnaryOpGenerator(type.elementary_types, new Set<number>(), new Set<number>());
    if (config.debug) indent += 2;
    assignment_gen.generate(0);
    if (config.debug) indent -= 2;
    this.irnode = new stmt.IRExpressionStatement(global_id++, cur_scope.value(), field_flag, assignment_gen.irnode! as expr.IRAssignment);
  }
}

export class ConditionalStatementGenerator extends StatementGenerator {
  constructor() { super(); }
  generate() : void {
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ConditionalStatement`));
    }
    const conditional_gen = new ConditionalGenerator(type.elementary_types, new Set<number>(), new Set<number>());
    if (config.debug) indent += 2;
    conditional_gen.generate(0);
    if (config.debug) indent -= 2;
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
    if (config.debug) {
      console.log(color.redBG(`${" ".repeat(indent)}>>  Start generating ReturnStatement`));
    }
    if (this.value === undefined) {
      const expression_gen_prototype = pickRandomElement(all_expression_generators)!;
      const expression_gen = new expression_gen_prototype(type.elementary_types, new Set<number>(), new Set<number>());
      if (config.debug) indent += 2;
      expression_gen.generate(0);
      if (config.debug) indent -= 2;
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