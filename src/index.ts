#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import { irnodes } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as mut from "./mutators";
import { config } from "./config";
import * as fs from "fs";
import { assert, pick_random_element } from "./utility";
import { initType } from './type';
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionVisibility,
  FunctionStateMutability,
  DataLocation,
} from "solc-typed-ast"
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
  DefaultASTWriterMapping,
  formatter,
  LatestCompilerVersion
);
import * as figlet from "figlet"
import { StorageLocation, StorageLocationProvider } from "./memory";
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
  .option("-m --mode <string>", "The mode of Erwin. The value can be 'type', 'scope', or 'loc'.", `${config.mode}`)
  .option("-d --debug", "Enable the debug mode.", `${config.debug}`)
  // Type
  .option("--int_types_num <number>", "The number of int types Erwin will consider in resolving type dominance.", `${config.int_num}`)
  .option("--uint_types_num <number>", "The number of uint types Erwin will consider in resolving type dominance.", `${config.uint_num}`)
  // Dominance Constraint Solution
  .option("--maximum_solution_count <number>", "The maximum number of solutions Erwin will consider.", `${config.maximum_solution_count}`)
  // Function
  .option("--function_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of non-declaration statements of a function. This value is suggested to be bigger than tha value of var_count", `${config.function_body_stmt_cnt_upper_limit}`)
  .option("--function_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of non-declaration statements of a function.", `${config.function_body_stmt_cnt_lower_limit}`)
  .option("--return_count_of_function_upperlimit <number>", "The upper limit of the number of return values of a function.", `${config.return_count_of_function_upperlimit}`)
  .option("--return_count_of_function_lowerlimit <number>", "The lower limit of the number of return values of a function.", `${config.return_count_of_function_lowerlimit}`)
  .option("--param_count_of_function_upperlimit <number>", "The upper limit of the number of parameters of a function.", `${config.param_count_of_function_upperlimit}`)
  .option("--param_count_of_function_lowerlimit <number>", "The lower limit of the number of parameters of a function.", `${config.param_count_of_function_lowerlimit}`)
  .option("--function_count_per_contract_upper_limit <number>", "The upper limit of the number of functions in a contract.", `${config.function_count_per_contract_upper_limit}`)
  .option("--function_count_per_contract_lower_limit <number>", "The lower limit of the number of functions in a contract.", `${config.function_count_per_contract_lower_limit}`)
  // Struct
  .option("--struct_member_variable_count_upperlimit <number>", "The upper limit of the number of member variables in a struct.", `${config.struct_member_variable_count_upperlimit}`)
  .option("--struct_member_variable_count_lowerlimit <number>", "The lower limit of the number of member variables in a struct.", `${config.struct_member_variable_count_lowerlimit}`)
  // Contract  
  .option("--contract_count <number>", "The upper limit of the number of contracts Erwin will generate.", `${config.contract_count}`)
  .option("--state_variable_count_upperlimit <number>", "The upper limit of the number of state variables in a contract.", `${config.state_variable_count_upperlimit}`)
  .option("--state_variable_count_lowerlimit <number>", "The lower limit of the number of state variables in a contract.", `${config.state_variable_count_lowerlimit}`)
  // Complexity
  .option("--expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3]. The bigger, the more complex.", `${config.expression_complex_level}`)
  .option("--statement_complex_level <number>", "The complex level of the statement Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.statement_complex_level}`)
  // Probability
  .option("--nonstructured_statement_prob <float>", "The probability of generating a nonstructured statement, such as AssignmentStatment or FunctionCallAssignment.", `${config.nonstructured_statement_prob}`)
  .option("--literal_prob <float>", "The probability of generating a literal.", `${config.literal_prob}`)
  .option("--tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${config.tuple_prob}`)
  .option("--vardecl_prob <float>", "The probability of generating a variable declaration.", `${config.vardecl_prob}`)
  .option("--in_place_vardecl_prob <float>", "The probability of generating a variable declaration in place.", `${config.in_place_vardecl_prob}`)
  .option("--else_prob <float>", "The probability of generating an else statement.", `${config.else_prob}`)
  .option("--terminal_prob <float>", "The probability of generating a terminal statement.", `${config.terminal_prob}`)
  .option("--init_state_var_in_constructor_prob <float>", "The probability of initializing a state variable in the constructor.", `${config.init_state_var_in_constructor_prob}`)
  .option("--struct_prob <float>", "The probability of generating a struct.", `${config.struct_prob}`)
  .option("--contract_instance_prob <float>", "The probability of generating a contract instance.", `${config.contract_instance_prob}`)
  .option("--struct_instance_prob <float>", "The probability of generating a struct instance.", `${config.struct_instance_prob}`)
  .option("--initialization_prob <float>", "The probability of generating an initialization statement.", `${config.initialization_prob}`)
  .option("--constructor_prob <float>", "The probability of generating a constructor.", `${config.constructor_prob}`)
  .option("--return_prob <float>", "The probability of generating a return statement.", `${config.return_prob}`)
  .option("--reuse_name_prob <float>", "The probability of reusing a name.", `${config.reuse_name_prob}`)
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
  config.maximum_solution_count = parseInt(program.commands[1].opts().maximum_solution_count);
  config.tuple_prob = parseFloat(program.commands[1].opts().tuple_prob);
  config.expression_complex_level = parseInt(program.commands[1].opts().expression_complex_level);
  config.state_variable_count_upperlimit = parseInt(program.commands[1].opts().state_variable_count_upperlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.struct_member_variable_count_upperlimit = parseInt(program.commands[1].opts().struct_member_variable_count_upperlimit);
  config.contract_count = parseInt(program.commands[1].opts().contract_count);
  config.mode = program.commands[1].opts().mode;
  config.vardecl_prob = parseFloat(program.commands[1].opts().vardecl_prob);
  config.in_place_vardecl_prob = parseFloat(program.commands[1].opts().in_place_vardecl_prob);
  config.else_prob = parseFloat(program.commands[1].opts().else_prob);
  config.terminal_prob = parseFloat(program.commands[1].opts().terminal_prob);
  config.init_state_var_in_constructor_prob = parseFloat(program.commands[1].opts().init_state_var_in_constructor_prob);
  config.nonstructured_statement_prob = parseFloat(program.commands[1].opts().nonstructured_statement_prob);
  config.struct_prob = parseFloat(program.commands[1].opts().struct_prob);
  config.contract_instance_prob = parseFloat(program.commands[1].opts().contract_instance_prob);
  config.struct_instance_prob = parseFloat(program.commands[1].opts().struct_instance_prob);
  config.initialization_prob = parseFloat(program.commands[1].opts().initialization_prob);
  config.constructor_prob = parseFloat(program.commands[1].opts().constructor_prob);
  config.return_prob = parseFloat(program.commands[1].opts().return_prob);
  config.reuse_name_prob = parseFloat(program.commands[1].opts().reuse_name_prob);
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
  if (config.mode == "scope") {
    config.int_num = 1;
    config.uint_num = 1;
  }
  initType();
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
  assert(config.maximum_solution_count >= 0, "The maximum number of solutions must be not less than 0.");
  assert(config.tuple_prob >= 0 && config.tuple_prob <= 1, "The probability of generating a tuple surrounding an expression must be in the range [0,1].");
  assert(config.init_state_var_in_constructor_prob >= 0 && config.init_state_var_in_constructor_prob <= 1, "The probability of initializing a state variable in the constructor must be in the range [0,1].");
  assert(config.expression_complex_level >= 1, "The complex level of the expression must be not less than 1.");
  assert(config.state_variable_count_upperlimit >= 0, "state_variable_count_upperlimit must be not less than 0.");
  assert(config.state_variable_count_lowerlimit >= 0, "state_variable_count_lowerlimit must be not less than 0.");
  assert(config.contract_count >= 0, "contract_count must be not less than 0.");
  assert(["type", "scope", "loc"].includes(config.mode), "The mode is not either 'type' or 'scope', instead it is " + config.mode);
  assert(config.vardecl_prob >= 0 && config.vardecl_prob <= 1.0, "The probability of generating a variable declaration must be in the range [0,1].");
  assert(config.in_place_vardecl_prob >= 0 && config.in_place_vardecl_prob <= 1.0, "The probability of generating a variable declaration in place must be in the range [0,1].");
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
  assert(config.struct_member_variable_count_lowerlimit <= config.struct_member_variable_count_upperlimit, "The lower limit of the number of member variables in a struct must be less than or equal to the upper limit.");
  assert(config.struct_member_variable_count_lowerlimit >= 1, "The lower limit of the number of member variables in a struct must be not less than 1.");
  assert(config.struct_prob >= 0 && config.struct_prob <= 1, "The probability of generating a struct must be in the range [0,1].");
  assert(config.initialization_prob >= 0 && config.initialization_prob <= 1, "The probability of generating an initialization statement must be in the range [0,1].");
  assert(config.contract_instance_prob >= 0 && config.struct_instance_prob >= 0 && config.contract_instance_prob + config.struct_instance_prob < 1, "The probability of generating a contract/struct instance must be in the range [0,1).");
  assert(config.constructor_prob >= 0 && config.constructor_prob <= 1, "The probability of generating a constructor must be in the range [0,1].");
  assert(config.return_prob >= 0 && config.return_prob <= 1, "The probability of generating a return statement must be in the range [0,1].");
  assert(config.reuse_name_prob >= 0 && config.reuse_name_prob < 1, "The probability of reusing a name must be in the range [0,1).");
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

function storageLocation2loc(sl : StorageLocation) : DataLocation {
  switch (sl) {
    case StorageLocationProvider.memory():
      return DataLocation.Memory;
    case StorageLocationProvider.storage_pointer():
    case StorageLocationProvider.storage_ref():
      return DataLocation.Storage;
    case StorageLocationProvider.calldata():
      return DataLocation.CallData;
    default:
      return DataLocation.Default;
  }
}

// Mutation
async function mutate() {
  const source_unit = await mut.read_source_unit(config.file);
  const mutants = mut.type_mutate_source_unit(source_unit);
  let out_id = 1;
  for (let mutant of mutants) {
    if (config.out_dir !== "") {
      const file_path = `${config.out_dir}/mutant_${out_id}.sol`;
      mut.write_mutant(file_path, mutant);
      out_id++;
    }
    else {
      console.log(mutant);
    }
  }
}

function generate_type_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${gen.type_dag.solutions_collection.length} type solutions`);
  //! Select one function state mutability solution
  let good = false;
  for (let funcstat_solutions of gen.funcstat_dag.solutions_collection) {
    // assign the state mutability to the function
    for (let [key, value] of funcstat_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
        `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
      (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability = value.kind;
    }
    //! Select one function visibility solution
    for (let func_visibility_solutions of gen.func_visibility_dag.solutions_collection) {
      let no_conflict_with_funcstat = true;
      // assign the visibility to the function
      for (let [key, value] of func_visibility_solutions) {
        assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
          `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
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
  //! Select one storage location solution
  for (let storage_location_solutions of gen.storage_location_dag.solutions_collection) {
    for (let [key, value] of storage_location_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration,
        `The node must be a variable declaration, but a ${irnodes.get(key)!.typeName} is found.`);
      (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
    }
  }
  //! Select one state variable visibility solution
  const state_variable_visibility_solutions = pick_random_element(gen.state_variable_visibility_dag.solutions_collection)!;
  // assign the visibility to the state variable
  for (let [key, value] of state_variable_visibility_solutions) {
    assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration,
      `The node must be a variable declaration, but a ${irnodes.get(key)!.typeName} is found`);
    (irnodes.get(key)! as decl.IRVariableDeclaration).visibility = value.kind;
  }
  let cnt = 0;
  let pre_program = "";
  //! Traverse type solutions
  for (let type_solutions of gen.type_dag.solutions_collection) {
    for (let [key, value] of type_solutions) {
      if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
        (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
    }
    const program = writer.write(source_unit_gen.irnode!.lower());
    if (program === pre_program) continue;
    pre_program = program;
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

function generate_scope_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${gen.funcstat_dag.solutions_collection.length} function stat solutions`);
  console.log(`${gen.func_visibility_dag.solutions_collection.length} function visibility solutions`);
  console.log(`${gen.state_variable_visibility_dag.solutions_collection.length} state variable visibility solutions`);
  //! Select one type solution
  const type_solutions = pick_random_element(gen.type_dag.solutions_collection)!;
  for (let [key, value] of type_solutions) {
    if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
      (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
  }
  //! Select storage location solution
  const storage_location_solutions = pick_random_element(gen.storage_location_dag.solutions_collection)!;
  for (let [key, value] of storage_location_solutions) {
    assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration,
      `The node must be a variable declaration, but a ${irnodes.get(key)!.typeName} is found`);
    (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
  }
  let cnt = 0;
  let pre_program = "";
  //! Traverse function state mutability solutions
  for (let funcstat_solutions of gen.funcstat_dag.solutions_collection) {
    // assign the state mutability to the function
    for (let [key, value] of funcstat_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
        `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
      (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability = value.kind;
    }
    //! Traverse function visibility solutions
    for (let func_visibility_solutions of gen.func_visibility_dag.solutions_collection) {
      let no_conflict_with_funcstat = true;
      // assign the visibility to the function
      for (let [key, value] of func_visibility_solutions) {
        assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
          `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
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
          assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration,
            `The node must be a variable declaration, but a ${irnodes.get(key)!.typeName} is found`);
          (irnodes.get(key)! as decl.IRVariableDeclaration).visibility = value.kind;
        }
        let program = writer.write(source_unit_gen.irnode!.lower());
        if (program === pre_program) continue;
        pre_program = program;
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
        if (cnt > config.maximum_solution_count) return;
      }
    }
  }
}

function generate_loc_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${gen.storage_location_dag.solutions_collection.length} storage location solutions`);
  //! Select one type solution
  const type_solutions = pick_random_element(gen.type_dag.solutions_collection)!;
  for (let [key, value] of type_solutions) {
    if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
      (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
  }
  //! Select one function state mutability solution
  let good = false;
  for (let funcstat_solutions of gen.funcstat_dag.solutions_collection) {
    // assign the state mutability to the function
    for (let [key, value] of funcstat_solutions) {
      assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
        `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
      (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability = value.kind;
    }
    //! Select one function visibility solution
    for (let func_visibility_solutions of gen.func_visibility_dag.solutions_collection) {
      let no_conflict_with_funcstat = true;
      // assign the visibility to the function
      for (let [key, value] of func_visibility_solutions) {
        assert(irnodes.get(key)! instanceof decl.IRFunctionDefinition,
          `The node must be a function definition, but a ${irnodes.get(key)!.typeName} is found`);
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
  //! Select one state variable visibility solution
  const state_variable_visibility_solutions = pick_random_element(gen.state_variable_visibility_dag.solutions_collection)!;
  for (let [key, value] of state_variable_visibility_solutions) {
    assert(irnodes.get(key)! instanceof decl.IRVariableDeclaration,
      `The node must be a variable declaration, but a ${irnodes.get(key)!.typeName} is found`);
    (irnodes.get(key)! as decl.IRVariableDeclaration).visibility = value.kind;
  }
  //! Traverse storage location solutions
  let cnt = 0;
  let pre_program = "";
  for (let storage_location_solutions of gen.storage_location_dag.solutions_collection) {
    for (let [key, value] of storage_location_solutions) {
      if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") continue;
      (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
    }
    let program = writer.write(source_unit_gen.irnode!.lower());
    if (program === pre_program) continue;
    pre_program = program;
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

// Generation
async function generate() {
  const source_unit = new gen.SourceUnitGenerator();
  source_unit.generate();
  try {
    let startTime = performance.now()
    // gen.type_dag.resolve_by_stream();
    await gen.type_dag.resolve_by_stream(true);
    let endTime = performance.now();
    console.log(`Time cost of resolving type constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await gen.funcstat_dag.resolve_by_brute_force(true);
    await gen.func_visibility_dag.resolve_by_brute_force(false);
    await gen.state_variable_visibility_dag.resolve_by_brute_force(false);
    endTime = performance.now();
    console.log(`Time cost of resolving visibility and state mutability constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await gen.storage_location_dag.resolve_by_brute_force(false);
    endTime = performance.now();
    console.log(`Time cost of resolving storage location constraints: ${endTime - startTime} ms`);
    if (config.debug) {
      gen.type_dag.verify();
      gen.funcstat_dag.verify();
    }
    if (config.mode === "type") {
      generate_type_mode(source_unit);
    }
    else if (config.mode === "scope") {
      generate_scope_mode(source_unit);
    }
    else if (config.mode === "loc") {
      generate_loc_mode(source_unit);
    }
  }
  catch (error) {
    console.log(error)
  }
}
