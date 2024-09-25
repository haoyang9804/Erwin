#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import * as db from "./db"
import { irnodes } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as mut from "./mutators";
import { config } from "./config";
import * as fs from "fs";
import { global_scope } from "./scope";
import { assert, pickRandomElement } from "./utility";
import { init_types } from './type';
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionVisibility,
  FunctionStateMutability,
} from "solc-typed-ast"
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
  DefaultASTWriterMapping,
  formatter,
  LatestCompilerVersion
);
import * as figlet from "figlet"
console.log(figlet.textSync('Erwin'));
const version = "0.1.0";

const program = new Command();
program
  .name("erwin")
  .description("Tools that can generate random Solidity code and mutate the given Solidity code.")
  .version(version, "-v, --version", "Print package version.")
  .helpOption("-h, --help", "Print help message.")
program
  .command("mutate")
  .description("Mutate the given Solidity code.")
  .option("-f, --file <string>", "The file to be mutated.", `${config.file}`)
  .option("--out_dir <string>", "The file to output the mutated code.", `${config.out_dir}`);
program
  .command("generate")
  .description("Generate random Solidity code.")
  .option("-e --exprimental", "Enable the exprimental mode.", `${config.experimental}`)
  .option("-m --mode <string>", "The mode of Erwin. The value can be 'type' or 'scope'.", `${config.mode}`)
  .option("-d --debug", "Enable the debug mode.", `${config.debug}`)
  // Type
  .option("--int_types_num <number>", "The number of int types Erwin will consider in resolving type dominance.", `${config.int_num}`)
  .option("--uint_types_num <number>", "The number of uint types Erwin will consider in resolving type dominance.", `${config.uint_num}`)
  .option("--no_type_exploration", "Disable the type exploration.", `${config.no_type_exploration}`)
  // Dominance Constraint Solution
  .option("--maximum_type_resolution_for_heads <number>", "The maximum number of type resolutions for heads.", `${config.maximum_type_resolution_for_heads}`)
  .option("--chunk_size <number>", "The size of head solution chunk. The bigger the size is, the more resolutions Erwin will consider in a round.", `${config.chunk_size}`)
  // Function
  .option("--function_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of non-declaration statements of a function. This value is suggested to be bigger than tha value of var_count", `${config.function_body_stmt_cnt_upper_limit}`)
  .option("--function_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of non-declaration statements of a function.", `${config.function_body_stmt_cnt_lower_limit}`)
  .option("--return_count_of_function_upperlimit <number>", "The upper limit of the number of return values of a function.", `${config.return_count_of_function_upperlimit}`)
  .option("--return_count_of_function_lowerlimit <number>", "The lower limit of the number of return values of a function.", `${config.return_count_of_function_lowerlimit}`)
  .option("--param_count_of_function_upperlimit <number>", "The upper limit of the number of parameters of a function.", `${config.param_count_of_function_upperlimit}`)
  .option("--param_count_of_function_lowerlimit <number>", "The lower limit of the number of parameters of a function.", `${config.param_count_of_function_lowerlimit}`)
  .option("--function_count_per_contract_upper_limit <number>", "The upper limit of the number of functions in a contract.", `${config.function_count_per_contract_upper_limit}`)
  .option("--function_count_per_contract_lower_limit <number>", "The lower limit of the number of functions in a contract.", `${config.function_count_per_contract_lower_limit}`)
  // Contract  
  .option("--contract_count <number>", "The upper limit of the number of contracts Erwin will generate.", `${config.contract_count}`)
  .option("--state_variable_count_upperlimit <number>", "The upper limit of the number of state variables in a contract.", `${config.state_variable_count_upperlimit}`)
  .option("--state_variable_count_lowerlimit <number>", "The lower limit of the number of state variables in a contract.", `${config.state_variable_count_lowerlimit}`)
  // Complexity
  .option("--expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3,4,5]. The bigger, the more complex.", `${config.expression_complex_level}`)
  .option("--statement_complex_level <number>", "The complex level of the statement Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.statement_complex_level}`)
  // Probability
  .option("--nonstructured_statement_prob <float>", "The probability of generating a nonstructured statement, such as AssignmentStatment or FunctionCallAssignment.", `${config.nonstructured_statement_prob}`)
  .option("--literal_prob <float>", "The probability of generating a literal.", `${config.literal_prob}`)
  .option("--tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${config.tuple_prob}`)
  .option("--vardecl_prob <float>", "The probability of generating a variable declaration.", `${config.vardecl_prob}`)
  .option("--else_prob <float>", "The probability of generating an else statement.", `${config.else_prob}`)
  .option("--terminal_prob <float>", "The probability of generating a terminal statement.", `${config.terminal_prob}`)
  .option("--init_state_var_in_constructor_prob <float>", "The probability of initializing a state variable in the constructor.", `${config.init_state_var_in_constructor_prob}`)
  // Structured Statements
  .option("--for_init_cnt_upper_limit <number>", "The upper limit of the number of initialization in a for loop.", `${config.for_init_cnt_upper_limit}`)
  .option("--for_init_cnt_lower_limit <number>", "The lower limit of the number of initialization in a for loop.", `${config.for_init_cnt_lower_limit}`)
  .option("--for_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of statements in the body of a for loop.", `${config.for_body_stmt_cnt_upper_limit}`)
  .option("--for_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of statements in the body of a for loop.", `${config.for_body_stmt_cnt_lower_limit}`)
  .option("--while_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of statements in the body of a while loop.", `${config.while_body_stmt_cnt_upper_limit}`)
  .option("--while_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of statements in the body of a while loop.", `${config.while_body_stmt_cnt_lower_limit}`)
  .option("--do_while_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of statements in the body of a do while loop.", `${config.do_while_body_stmt_cnt_upper_limit}`)
  .option("--do_while_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of statements in the body of a do while loop.", `${config.do_while_body_stmt_cnt_lower_limit}`)
  .option("--if_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of statements in the body of an if statement.", `${config.if_body_stmt_cnt_upper_limit}`)
  .option("--if_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of statements in the body of an if statement.", `${config.if_body_stmt_cnt_lower_limit}`);
program.parse(process.argv);
// Set the configuration
if (program.args[0] === "mutate") {
  config.file = program.commands[0].opts().file;
  config.out_dir = program.commands[0].opts().out_dir;
}
else if (program.args[0] === "generate") {
  if (program.commands[1].opts().experimental === true) config.experimental = true;
  config.int_num = parseInt(program.commands[1].opts().int_types_num);
  config.uint_num = parseInt(program.commands[1].opts().uint_types_num);
  config.function_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().function_body_stmt_cnt_upper_limit);
  config.function_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().function_body_stmt_cnt_lower_limit);
  config.return_count_of_function_upperlimit = parseInt(program.commands[1].opts().return_count_of_function_upperlimit);
  config.return_count_of_function_lowerlimit = parseInt(program.commands[1].opts().return_count_of_function_lowerlimit);
  config.param_count_of_function_upperlimit = parseInt(program.commands[1].opts().param_count_of_function_upperlimit);
  config.param_count_of_function_lowerlimit = parseInt(program.commands[1].opts().param_count_of_function_lowerlimit);
  config.function_count_per_contract_upper_limit = parseInt(program.commands[1].opts().function_count_per_contract_upper_limit);
  config.function_count_per_contract_lower_limit = parseInt(program.commands[1].opts().function_count_per_contract_lower_limit);
  config.literal_prob = parseFloat(program.commands[1].opts().literal_prob);
  config.maximum_type_resolution_for_heads = parseInt(program.commands[1].opts().maximum_type_resolution_for_heads);
  config.tuple_prob = parseFloat(program.commands[1].opts().tuple_prob);
  config.expression_complex_level = parseInt(program.commands[1].opts().expression_complex_level);
  config.chunk_size = parseInt(program.commands[1].opts().chunk_size);
  config.state_variable_count_upperlimit = parseInt(program.commands[1].opts().state_variable_count_upperlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.contract_count = parseInt(program.commands[1].opts().contract_count);
  config.mode = program.commands[1].opts().mode;
  config.vardecl_prob = parseFloat(program.commands[1].opts().vardecl_prob);
  config.else_prob = parseFloat(program.commands[1].opts().else_prob);
  config.terminal_prob = parseFloat(program.commands[1].opts().terminal_prob);
  config.init_state_var_in_constructor_prob = parseFloat(program.commands[1].opts().init_state_var_in_constructor_prob);
  config.nonstructured_statement_prob = parseFloat(program.commands[1].opts().nonstructured_statement_prob);
  config.for_init_cnt_upper_limit = parseInt(program.commands[1].opts().for_init_cnt_upper_limit);
  config.for_init_cnt_lower_limit = parseInt(program.commands[1].opts().for_init_cnt_lower_limit);
  config.statement_complex_level = parseInt(program.commands[1].opts().statement_complex_level);
  config.for_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().for_body_stmt_cnt_lower_limit);
  config.for_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().for_body_stmt_cnt_upper_limit);
  config.while_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().while_body_stmt_cnt_lower_limit);
  config.while_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().while_body_stmt_cnt_upper_limit);
  config.do_while_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().do_while_body_stmt_cnt_lower_limit);
  config.do_while_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().do_while_body_stmt_cnt_upper_limit);
  config.if_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().if_body_stmt_cnt_lower_limit);
  config.if_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().if_body_stmt_cnt_upper_limit);
  if (program.commands[1].opts().debug === true) config.debug = true;
  if (program.commands[1].opts().no_type_exploration === true) config.no_type_exploration = true;
  if (config.mode == "scope") {
    config.int_num = 1;
    config.uint_num = 1;
  }
  init_types();
}
// Check the validity of the arguments
if (program.args[0] === "mutate") {
  assert(config.file !== "", "The file to be mutated is not provided.")
}
else if (program.args[0] === "generate") {
  assert(config.int_num >= 0, "The number of int types must be not less than 0.");
  assert(config.uint_num >= 0, "The number of uint types must be not less than 0.");
  assert(config.function_body_stmt_cnt_upper_limit >= 0, "The upper limit of the number of statements of a function must be not less than 0.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 0.");
  assert(config.return_count_of_function_upperlimit >= 0, "The upper limit of the number of return values of a function must be not less than 0.");
  assert(config.return_count_of_function_lowerlimit >= 0, "The lower limit of the number of return values of a function must be not less than 0.");
  assert(config.param_count_of_function_lowerlimit >= 0, "The lower limit of the number of parameters of a function must be not less than 0.");
  assert(config.param_count_of_function_upperlimit >= 0, "The upper limit of the number of parameters of a function must be not less than 0.");
  assert(config.function_count_per_contract_lower_limit <= config.function_count_per_contract_upper_limit, "The lower limit of the number of functions must be less than or equal to the upper limit.");
  assert(config.function_count_per_contract_lower_limit >= 0, "The number of functions must be not less than 0.");
  assert(config.literal_prob >= 0 && config.literal_prob <= 1, "The probability of generating a literal must be in the range [0,1].");
  assert(config.maximum_type_resolution_for_heads >= config.chunk_size, "The maximum number of type resolutions for heads must be not less than the size of chunk.");
  assert(config.tuple_prob >= 0 && config.tuple_prob <= 1, "The probability of generating a tuple surrounding an expression must be in the range [0,1].");
  assert(config.init_state_var_in_constructor_prob >= 0 && config.init_state_var_in_constructor_prob <= 1, "The probability of initializing a state variable in the constructor must be in the range [0,1].");
  assert(config.expression_complex_level >= 0, "The complex level of the expression must be not less than 0.");
  assert(config.chunk_size > 0, "The chunk size of the database must be greater than 0.");
  assert(config.state_variable_count_upperlimit >= 0, "state_variable_count_upperlimit must be not less than 0.");
  assert(config.state_variable_count_lowerlimit >= 0, "state_variable_count_lowerlimit must be not less than 0.");
  assert(config.contract_count >= 0, "contract_count must be not less than 0.");
  assert(["type", "scope"].includes(config.mode), "The mode is not either 'type' or 'scope', instead it is " + config.mode);
  assert(config.vardecl_prob >= 0 && config.vardecl_prob <= 1.0, "The probability of generating a variable declaration must be in the range [0,1].");
  assert(config.else_prob >= 0.0 && config.else_prob <= 1.0, "The probability of generating an else statement must be in the range [0,1].");
  assert(config.terminal_prob >= 0.0 && config.terminal_prob <= 1.0, "The probability of generating a terminal statement must be in the range [0,1].");
  assert(config.return_count_of_function_lowerlimit <= config.return_count_of_function_upperlimit, "The lower limit of the number of return values of a function must be less than or equal to the upper limit.");
  assert(config.param_count_of_function_lowerlimit <= config.param_count_of_function_upperlimit, "The lower limit of the number of parameters of a function must be less than or equal to the upper limit.");
  assert(config.state_variable_count_lowerlimit <= config.state_variable_count_upperlimit, "state_variable_count_lowerlimit must be less than or equal to state_variable_count_upperlimit.");
  assert(config.nonstructured_statement_prob >= 0.0 && config.nonstructured_statement_prob <= 1.0, "The probability of generating a nonstructured statement must be in the range [0,1].");
  assert(config.function_body_stmt_cnt_lower_limit <= config.function_body_stmt_cnt_upper_limit, "The lower limit of the number of statements of a function must be less than or equal to the upper limit.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 1.");
  assert(config.statement_complex_level >= 0, "The complex level of the statement must be not less than 0.");
  assert(config.for_init_cnt_lower_limit <= config.for_init_cnt_upper_limit, "The lower limit of the number of initialization in a for loop must be less than or equal to the upper limit.");
  assert(config.for_init_cnt_lower_limit >= 0, "The upper limit of the number of initialization in a for loop must be not less than 0.");
  assert(config.function_body_stmt_cnt_lower_limit <= config.function_body_stmt_cnt_upper_limit, "The lower limit of the number of statements of a function must be less than or equal to the upper limit.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 1.");
  assert(config.for_body_stmt_cnt_lower_limit <= config.for_body_stmt_cnt_upper_limit, "The lower limit of the number of statements in the body of a for loop must be less than or equal to the upper limit.");
  assert(config.for_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements in the body of a for loop must be not less than 0.");
  assert(config.while_body_stmt_cnt_lower_limit <= config.while_body_stmt_cnt_upper_limit, "The lower limit of the number of statements in the body of a while loop must be less than or equal to the upper limit.");
  assert(config.while_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements in the body of a while loop must be not less than 0.");
  assert(config.do_while_body_stmt_cnt_lower_limit <= config.do_while_body_stmt_cnt_upper_limit, "The lower limit of the number of statements in the body of a do while loop must be less than or equal to the upper limit.");
  assert(config.do_while_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements in the body of a do while loop must be not less than 0.");
  assert(config.if_body_stmt_cnt_lower_limit <= config.if_body_stmt_cnt_upper_limit, "The lower limit of the number of statements in the body of an if statement must be less than or equal to the upper limit.");
}
// Execute
if (program.args[0] === "mutate") {
  (async () => {
    mutate();
  })();
}
else if (program.args[0] === "generate") {
  (async () => {
    generate();
  })();
}

// Mutation
async function mutate() {
  const source_unit = await mut.readSourceUnit(config.file);
  const mutants = mut.typeMutateSourceUnit(source_unit);
  let out_id = 1;
  for (let mutant of mutants) {
    if (config.out_dir !== "") {
      const file_path = `${config.out_dir}/mutant_${out_id}.sol`;
      mut.writeMutant(file_path, mutant);
      out_id++;
    }
    else {
      console.log(mutant);
    }
  }
}

function generate_type_mode() {
  console.log(`${gen.type_dag.solutions_collection.length} type solutions`);
  let good = false;
  //! Traverse function state mutability solutions
  for (let funcstat_solutions of gen.funcstat_dag.solutions_collection) {
    // assign the state mutability to the function
    for (let [key, value] of funcstat_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition, "The node must be a function definition.");
      (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability = value.kind;
    }
    //! Traverse function visibility solutions
    for (let func_visibility_solutions of gen.func_visibility_dag.solutions_collection) {
      let no_conflict_with_funcstat = true;
      // assign the visibility to the function
      for (let [key, value] of func_visibility_solutions) {
        assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition, "The node must be a function definition.");
        // The assignment of visibility may be influenced by the state mutability
        if (
          (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability === FunctionStateMutability.Payable &&
          (value.kind === FunctionVisibility.Internal || value.kind === FunctionVisibility.Private)
        ) {
          no_conflict_with_funcstat = false;
          break;
        }
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility = value.kind;
      }
      if (!no_conflict_with_funcstat) continue;
      good = true;
      break;
    }
    if (good) break;
  }
  //! Traverse state variable visibility solutions
  const state_variable_visibility_solutions = pickRandomElement(gen.state_variable_visibility_dag.solutions_collection)!;
  // assign the visibility to the state variable
  for (let [key, value] of state_variable_visibility_solutions) {
    assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration, "The node must be a variable declaration.");
    (irnodes.get(key)! as decl.IRVariableDeclaration).visibility = value.kind;
  }
  let cnt = 0;
  //! Traverse type solutions
  for (let type_solutions of gen.type_dag.solutions_collection) {
    for (let [key, value] of type_solutions) {
      if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
        (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
    }
    let program = "";
    for (let [_, id] of db.decl_db.get_nonhidden_irnodes_ids_recursively(global_scope)!) {
      program += writer.write(irnodes.get(id)!.lower());
    }
    if (!fs.existsSync("./generated_programs")) {
      fs.mkdirSync("./generated_programs");
    }
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}_${cnt}.sol`;
    cnt++;
    fs.writeFileSync(`./generated_programs/${program_name}`, program, "utf-8");
  }
}

function generate_scope_mode() {
  console.log(`${gen.funcstat_dag.solutions_collection.length} function stat solutions`);
  console.log(`${gen.func_visibility_dag.solutions_collection.length} function visibility solutions`);
  console.log(`${gen.state_variable_visibility_dag.solutions_collection.length} state variable visibility solutions`);
  const type_solutions = pickRandomElement(gen.type_dag.solutions_collection)!;
  for (let [key, value] of type_solutions) {
    if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
      (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
  }
  let cnt = 0;
  //! Traverse function state mutability solutions
  for (let funcstat_solutions of gen.funcstat_dag.solutions_collection) {
    // assign the state mutability to the function
    for (let [key, value] of funcstat_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition, "The node must be a function definition.");
      (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability = value.kind;
    }
    //! Traverse function visibility solutions
    for (let func_visibility_solutions of gen.func_visibility_dag.solutions_collection) {
      let no_conflict_with_funcstat = true;
      // assign the visibility to the function
      for (let [key, value] of func_visibility_solutions) {
        assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition, "The node must be a function definition.");
        if (
          (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability === FunctionStateMutability.Payable &&
          (value.kind === FunctionVisibility.Internal || value.kind === FunctionVisibility.Private)
        ) {
          no_conflict_with_funcstat = false;
          break;
        }
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility = value.kind;
      }
      if (!no_conflict_with_funcstat) continue;
      //! Traverse state variable visibility solutions
      for (let state_variable_visibility_solutions of gen.state_variable_visibility_dag.solutions_collection) {
        // assign the visibility to the state variable
        for (let [key, value] of state_variable_visibility_solutions) {
          assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration, "The node must be a variable declaration.");
          (irnodes.get(key)! as decl.IRVariableDeclaration).visibility = value.kind;
        }
        let program = "";
        for (let [_, id] of db.decl_db.get_nonhidden_irnodes_ids_recursively(global_scope)!) {
          program += writer.write(irnodes.get(id)!.lower());
        }
        if (!fs.existsSync("./generated_programs")) {
          fs.mkdirSync("./generated_programs");
        }
        let date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let hour = date.getHours();
        let minute = date.getMinutes();
        let second = date.getSeconds();
        let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}_${cnt}.sol`;
        cnt++;
        fs.writeFileSync(`./generated_programs/${program_name}`, program, "utf-8");
      }
    }
  }
}

// Generation
async function generate() {
  const contract = new gen.ContractDeclarationGenerator();
  contract.generate();

  await (async () => {
    // resolve constraints
    if (config.debug) {
      gen.type_dag.draw("./type-constraint.svg");
    }
  })();
  try {
    let startTime = performance.now()
    gen.type_dag.resolve_by_chunk();
    let endTime = performance.now();
    console.log(`Time cost of resolving type constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    gen.funcstat_dag.resolve_by_brute_force(true);
    gen.func_visibility_dag.resolve_by_brute_force(false);
    gen.state_variable_visibility_dag.resolve_by_brute_force(false);
    endTime = performance.now();
    console.log(`Time cost of resolving visibility and state mutability constraints: ${endTime - startTime} ms`);
    if (config.debug) {
      gen.type_dag.verify();
      gen.funcstat_dag.verify();
    }
    if (config.mode === "type") {
      generate_type_mode();
    }
    else {
      generate_scope_mode();
    }
  }
  catch (error) {
    console.log(error)
  }
}
