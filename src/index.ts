#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import { vismut_dag, storage_location_dag, type_dag } from "./constraint";
import { irnodes } from "./node";
import * as expr from "./expression";
import * as decl from "./declare";
import * as mut from "./mutators";
import { config } from "./config";
import * as fs from "fs";
import { assert, pick_random_element } from "./utility";
import { initType, MappingType, ArrayType, Type } from './type';
import { decl_db } from './db';
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionVisibility,
  DataLocation,
  StateVariableVisibility,
  FunctionStateMutability,
} from "solc-typed-ast"
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
  DefaultASTWriterMapping,
  formatter,
  LatestCompilerVersion
);
import * as figlet from "figlet"
import { StorageLocation, StorageLocationProvider } from "./loc";
import { FuncVis, FuncVisProvider, VarVis, VarVisProvider } from "./visibility";
import { FuncVisMutKind, VarVisKind } from "./vismut";
import { FuncStat, FuncStatProvider } from "./funcstat";
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
  // Dominance Constraint Solution
  .option("-max --maximum_solution_count <number>", "The maximum number of solutions Erwin will consider.", `${config.maximum_solution_count}`)
  // Type
  .option("--int_types_num <number>", "The number of int types Erwin will consider in resolving type dominance.", `${config.int_num}`)
  .option("--uint_types_num <number>", "The number of uint types Erwin will consider in resolving type dominance.", `${config.uint_num}`)
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
  // Array
  .option("--array_length_upperlimit <number>", "The upper limit of the length of an array.", `${config.array_length_upperlimit}`)
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
  .option("--if_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of statements in the body of an if statement.", `${config.if_body_stmt_cnt_lower_limit}`)
  // Complexity
  .option("--expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3]. The bigger, the more complex.", `${config.expression_complex_level}`)
  .option("--statement_complex_level <number>", "The complex level of the statement Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.statement_complex_level}`)
  .option("--type_complex_level <number>", "The complex level of the type Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.type_complex_level}`)
  // Probability
  .option("--nonstructured_statement_prob <float>", "The probability of generating a nonstructured statement, such as AssignmentStatment or FunctionCallAssignment.", `${config.nonstructured_statement_prob}`)
  .option("--literal_prob <float>", "The probability of generating a literal.", `${config.literal_prob}`)
  .option("--tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${config.tuple_prob}`)
  .option("--vardecl_prob <float>", "The probability of generating a variable declaration.", `${config.vardecl_prob}`)
  .option("--new_prob <float>", "The probability of generating a variable declaration in place.", `${config.new_prob}`)
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
  .option("--mapping_prob <float>", "The probability of generating a mapping.", `${config.mapping_prob}`)
  .option("--array_prob <float>", "The probability of generating an array.", `${config.array_prob}`)
  .option("--dynamic_array_prob <float>", "The probability of generating a dynamic array.", `${config.dynamic_array_prob}`)
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
  config.array_length_upperlimit = parseInt(program.commands[1].opts().array_length_upperlimit);
  config.expression_complex_level = parseInt(program.commands[1].opts().expression_complex_level);
  config.state_variable_count_upperlimit = parseInt(program.commands[1].opts().state_variable_count_upperlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.struct_member_variable_count_upperlimit = parseInt(program.commands[1].opts().struct_member_variable_count_upperlimit);
  config.contract_count = parseInt(program.commands[1].opts().contract_count);
  config.mode = program.commands[1].opts().mode;
  config.vardecl_prob = parseFloat(program.commands[1].opts().vardecl_prob);
  config.new_prob = parseFloat(program.commands[1].opts().new_prob);
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
  config.mapping_prob = parseFloat(program.commands[1].opts().mapping_prob);
  config.array_prob = parseFloat(program.commands[1].opts().array_prob);
  config.dynamic_array_prob = parseFloat(program.commands[1].opts().dynamic_array_prob);
  config.for_init_cnt_upper_limit = parseInt(program.commands[1].opts().for_init_cnt_upper_limit);
  config.for_init_cnt_lower_limit = parseInt(program.commands[1].opts().for_init_cnt_lower_limit);
  config.statement_complex_level = parseInt(program.commands[1].opts().statement_complex_level);
  config.type_complex_level = parseInt(program.commands[1].opts().type_complex_level);
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
  assert(config.array_length_upperlimit >= 1, "The upper limit of the length of an array must be not less than 0.");
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
  if (config.mode === "") {
    console.warn("You didn't specify the mode of Erwin. Therefore, Erwin will generate trivially, without exhaustively enumerating test programs in the search space.");
    config.mode = "type";
    config.maximum_solution_count = 1;
  }
  assert(["type", "scope", "loc"].includes(config.mode), "The mode is not either 'type', 'scope', 'loc', instead it is " + config.mode);
  assert(config.vardecl_prob >= 0 && config.vardecl_prob <= 1.0, "The probability of generating a variable declaration must be in the range [0,1].");
  assert(config.new_prob >= 0 && config.new_prob <= 1.0, "The probability of generating a variable declaration in place must be in the range [0,1].");
  assert(config.else_prob >= 0.0 && config.else_prob <= 1.0, "The probability of generating an else statement must be in the range [0,1].");
  assert(config.terminal_prob >= 0.0 && config.terminal_prob <= 1.0, "The probability of generating a terminal statement must be in the range [0,1].");
  assert(config.mapping_prob > 0.0 && config.mapping_prob <= 1.0, "The probability of generating a mapping must be in the range (0,1].");
  assert(config.array_prob > 0.0 && config.array_prob <= 1.0, "The probability of generating an array must be in the range (0,1].");
  assert(config.contract_instance_prob >= 0.0 && config.contract_instance_prob <= 1.0, "The probability of generating a contract instance must be in the range [0,1].");
  assert(config.struct_instance_prob >= 0.0 && config.struct_instance_prob <= 1.0, "The probability of generating a struct instance must be in the range [0,1].");
  assert(config.array_prob + config.mapping_prob + config.contract_instance_prob + config.struct_instance_prob < 1, "The sum of the probabilities of generating a contract/struct instance, a mapping declaration, or an array declaration must be less than 1.");
  assert(config.dynamic_array_prob >= 0.0 && config.dynamic_array_prob <= 1.0, "The probability of generating a dynamic array must be in the range [0,1].");
  assert(config.return_count_of_function_lowerlimit <= config.return_count_of_function_upperlimit, "The lower limit of the number of return values of a function must be less than or equal to the upper limit.");
  assert(config.param_count_of_function_lowerlimit <= config.param_count_of_function_upperlimit, "The lower limit of the number of parameters of a function must be less than or equal to the upper limit.");
  assert(config.state_variable_count_lowerlimit <= config.state_variable_count_upperlimit, "state_variable_count_lowerlimit must be less than or equal to state_variable_count_upperlimit.");
  assert(config.nonstructured_statement_prob >= 0.0 && config.nonstructured_statement_prob <= 1.0, "The probability of generating a nonstructured statement must be in the range [0,1].");
  assert(config.function_body_stmt_cnt_lower_limit <= config.function_body_stmt_cnt_upper_limit, "The lower limit of the number of statements of a function must be less than or equal to the upper limit.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 1.");
  assert(config.statement_complex_level >= 0, "The complex level of the statement must be not less than 0.");
  assert(config.type_complex_level >= 0, "The complex level of the type must be not less than 0.");
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
  assert(config.constructor_prob >= 0 && config.constructor_prob <= 1, "The probability of generating a constructor must be in the range [0,1].");
  assert(config.return_prob >= 0 && config.return_prob <= 1, "The probability of generating a return statement must be in the range [0,1].");
  assert(config.reuse_name_prob >= 0 && config.reuse_name_prob < 1, "The probability of reusing a name must be in the range [0,1).");
}
// Execute
if (program.args[0] === "mutate") {
  (async () => {
    await mutate();
  })();
}
else if (program.args[0] === "generate") {
  (async () => {
    await generate();
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

function varvis2statevisibility(vv : VarVis) : StateVariableVisibility {
  switch (vv) {
    case VarVisProvider.public():
      return StateVariableVisibility.Public;
    case VarVisProvider.internal():
      return StateVariableVisibility.Internal;
    case VarVisProvider.private():
      return StateVariableVisibility.Private;
    default:
      return StateVariableVisibility.Default;
  }
}

function funcvis2funcvisibility(fv : FuncVis) : FunctionVisibility {
  switch (fv) {
    case FuncVisProvider.external():
      return FunctionVisibility.External;
    case FuncVisProvider.public():
      return FunctionVisibility.Public;
    case FuncVisProvider.internal():
      return FunctionVisibility.Internal;
    case FuncVisProvider.private():
      return FunctionVisibility.Private;
    default:
      throw new Error("The function visibility is not supported.");
  }
}

function funcstat2functionstatemutability(fs : FuncStat) : FunctionStateMutability {
  switch (fs) {
    case FuncStatProvider.pure():
      return FunctionStateMutability.Pure;
    case FuncStatProvider.view():
      return FunctionStateMutability.View;
    case FuncStatProvider.empty():
      return FunctionStateMutability.NonPayable;
    case FuncStatProvider.payable():
      return FunctionStateMutability.Payable;
    default:
      throw new Error("The function state mutability is not supported.");
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

function assign_mapping_type(mapping_decl_id : number, type_solutions : Map<number, Type>) : void {
  const [key_id, value_id] = decl_db.kvpair_of_mapping(mapping_decl_id);
  assert(type_solutions.has(key_id), `The type solution does not have the key id ${key_id}.`);
  assert(type_solutions.has(value_id) || decl_db.is_mapping_decl(value_id) || decl_db.is_array_decl(value_id),
    `The type solution does not have the value id ${value_id} and this id doesn't belong to a mapping/array declaration.`);
  if (type_solutions.has(value_id)) {
    (irnodes.get(mapping_decl_id) as decl.IRVariableDeclaration).type =
      new MappingType(type_solutions.get(key_id)!, type_solutions.get(value_id)!);
  }
  else {
    if (decl_db.is_mapping_decl(value_id)) {
      assign_mapping_type(value_id, type_solutions);
    }
    else if (decl_db.is_array_decl(value_id)) {
      assign_array_type(value_id, type_solutions);
    }
    else {
      throw new Error(`The value id ${value_id} is neither a mapping declaration nor an array declaration.`);
    }
    (irnodes.get(mapping_decl_id) as decl.IRVariableDeclaration).type =
      new MappingType(type_solutions.get(key_id)!, (irnodes.get(value_id) as decl.IRVariableDeclaration).type!);
  }
}

function assign_array_type(array_decl_id : number, type_solutions : Map<number, Type>) : void {
  const base_id = decl_db.base_of_array(array_decl_id);
  if (type_solutions.has(base_id)) {
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type !== undefined,
      `The type of the array declaration ${array_decl_id} is undefined.`);
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type!.typeName === "ArrayType",
      `The type of the array declaration ${array_decl_id} is not an instance of ArrayType.`);
    ((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type as ArrayType).base = type_solutions.get(base_id)!;
  }
  else {
    if (decl_db.is_array_decl(base_id)) {
      assign_array_type(base_id, type_solutions);
    }
    else if (decl_db.is_mapping_decl(base_id)) {
      assign_mapping_type(base_id, type_solutions);
    }
    else {
      throw new Error(`The base id ${base_id} of the array declaration ${array_decl_id} is neither a mapping declaration nor an array declaration.`);
    }
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type !== undefined,
      `The type of the array declaration ${array_decl_id} is undefined.`);
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type!.typeName === "ArrayType",
      `The type of the array declaration ${array_decl_id} is not an instance of ArrayType.`);
    ((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type as ArrayType).base = (irnodes.get(base_id) as decl.IRVariableDeclaration).type!;
  }
}

function generate_type_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${type_dag.solutions_collection.length} solution(s)`);
  //! Select one vismut solution
  if (vismut_dag.solutions_collection.length > 0) {
    const vismut_solutions = pick_random_element(vismut_dag.solutions_collection)!;
    for (let [key, value] of vismut_solutions) {
      if (irnodes.has(key) === false) continue;
      if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
        (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
          varvis2statevisibility((value.kind as VarVisKind).visibility);
      }
      else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
          funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
        (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability =
          funcstat2functionstatemutability((value.kind as FuncVisMutKind).state_mutability);
      }
    }
  }
  //! Select one storage location solution
  if (storage_location_dag.solutions_collection.length > 0) {
    const storage_location_solutions = pick_random_element(storage_location_dag.solutions_collection)!;
    for (let [key, value] of storage_location_solutions) {
      //! key may be ghost and is not in irnodes
      if (!irnodes.has(key)) continue;
      if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
        continue;
      }
      if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined) {
        (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
      }
    }
  }
  //! Traverse type solutions
  if (type_dag.solutions_collection.length === 0) {
    const program = writer.write(source_unit_gen.irnode!.lower());
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
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}_0.sol`;
    fs.writeFileSync(`./generated_programs/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (let type_solutions of type_dag.solutions_collection) {
      if (type_solutions.size === 0) continue;
      for (let [key, value] of type_solutions) {
        if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
          (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
      }
      for (const mapping_decl_id of decl_db.mapping_decls_ids()) {
        assign_mapping_type(mapping_decl_id, type_solutions);
      }
      for (const array_decl_id of decl_db.array_decls_ids()) {
        assign_array_type(array_decl_id, type_solutions);
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
}

function generate_scope_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${vismut_dag.solutions_collection.length} solution(s)`);
  //! Select one type solution
  if (type_dag.solutions_collection.length > 0) {
    const type_solutions = pick_random_element(type_dag.solutions_collection)!;
    for (let [key, value] of type_solutions) {
      if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
        (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
    }
    for (const mapping_decl_id of decl_db.mapping_decls_ids()) {
      assign_mapping_type(mapping_decl_id, type_solutions);
    }
    for (const array_decl_id of decl_db.array_decls_ids()) {
      assign_array_type(array_decl_id, type_solutions);
    }
  }
  //! Select storage location solution
  if (storage_location_dag.solutions_collection.length > 0) {
    const storage_location_solutions = pick_random_element(storage_location_dag.solutions_collection)!;
    for (let [key, value] of storage_location_solutions) {
      //! key may be ghost and is not in irnodes
      if (!irnodes.has(key)) continue;
      if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
        continue;
      }
      if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined)
        (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
    }
  }
  //! Traverse vismut solutions
  if (vismut_dag.solutions_collection.length === 0) {
    const program = writer.write(source_unit_gen.irnode!.lower());
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
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}_0.sol`;
    fs.writeFileSync(`./generated_programs/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (const vismut_solutions of vismut_dag.solutions_collection) {
      if (vismut_solutions.size === 0) continue;
      for (let [key, value] of vismut_solutions) {
        if (irnodes.has(key) === false) continue;
        if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
          (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
            varvis2statevisibility((value.kind as VarVisKind).visibility);
        }
        else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
          (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
            funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
        }
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
}

function generate_loc_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${storage_location_dag.solutions_collection.length} solution(s)`);
  //! Select one type solution
  const type_solutions = pick_random_element(type_dag.solutions_collection)!;
  for (const [key, value] of type_solutions) {
    if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration)
      (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
  }
  for (const mapping_decl_id of decl_db.mapping_decls_ids()) {
    assign_mapping_type(mapping_decl_id, type_solutions);
  }
  for (const array_decl_id of decl_db.array_decls_ids()) {
    assign_array_type(array_decl_id, type_solutions);
  }
  //! Select one vismut solution
  if (vismut_dag.solutions_collection.length > 0) {
    const vismut_solutions = pick_random_element(vismut_dag.solutions_collection)!;
    for (let [key, value] of vismut_solutions) {
      if (irnodes.has(key) === false) continue;
      if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
        (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
          varvis2statevisibility((value.kind as VarVisKind).visibility);
      }
      else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
          funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
        (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability =
          funcstat2functionstatemutability((value.kind as FuncVisMutKind).state_mutability);
      }
    }
  }
  //! Traverse storage location solutions
  if (storage_location_dag.solutions_collection.length === 0) {
    let program = writer.write(source_unit_gen.irnode!.lower());
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
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}_0.sol`;
    fs.writeFileSync(`./generated_programs/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (let storage_location_solutions of storage_location_dag.solutions_collection) {
      if (storage_location_solutions.size === 0) continue;
      for (let [key, value] of storage_location_solutions) {
        //! key may be ghost and is not in irnodes
        if (!irnodes.has(key)) continue;
        if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
          continue;
        }
        if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined)
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
}

// Generation
async function generate() {
  const source_unit = new gen.SourceUnitGenerator();
  source_unit.generate();
  try {
    let startTime = performance.now()
    await type_dag.resolve();
    let endTime = performance.now();
    console.log(`Time cost of resolving type constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await vismut_dag.resolve();
    endTime = performance.now();
    console.log(`Time cost of resolving visibility and state mutability constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await storage_location_dag.resolve();
    endTime = performance.now();
    console.log(`Time cost of resolving storage location constraints: ${endTime - startTime} ms`);
    type_dag.verify();
    vismut_dag.verify();
    storage_location_dag.verify();
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
