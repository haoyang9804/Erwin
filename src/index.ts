#!/usr/bin/env node
import { Command } from "commander";
import { config } from "./config";
import { assert } from "./utility";
import { initType, } from './type';
import * as figlet from "figlet"
import { generate } from "./generate";
import { mutate } from "./mutate";

console.log(figlet.textSync('Erwin'));

const program = new Command();
program
  .name("erwin")
  .description("Tools that can generate random Solidity code and mutate the given Solidity code.")
  .helpOption("-h, --help", "Print help message.")
program
  .command("mutate")
  .description("Mutate the given Solidity code.")
  .option("-f, --file <string>", "The file to be mutated.", `${config.file}`)
  .option("-o --out_dir <string>", "The file to output the mutated code.", `${config.out_dir}`);
program
  .command("generate")
  .description("Generate random Solidity code.")
  .option("-m --mode <string>", "The mode of Erwin. The value can be 'type', 'scope', or 'loc'.", `${config.mode}`)
  .option("-d --debug", "Enable the debug mode.", `${config.debug}`)
  .option("-b --stop_on_erwin_bug", "Stop the program when a bug occurs during generating the program.", `${config.stop_on_erwin_bug}`)
  .option("-o --out_dir <string>", "The output directory for the generated program. The default is 'generated_programs'", `${config.out_dir}`)
  .option('-t --target <string>', 'The testing target. The value can be "solidity", "solang", "solar", and "slither". Default to solidity', `${config.target}`)
  // Dominance Constraint Solution
  .option("-max --maximum_solution_count <number>", "The maximum number of solutions Erwin will consider.", `${config.maximum_solution_count}`)
  // Type
  .option("--int_types_num <number>", "The upper limit for the quantity of integer data types that will be incorporated into the created Solidity code. The possible values are 1, 2, 3, 4, 5, or 6.", `${config.int_num}`)
  .option("--uint_types_num <number>", "The upper limit for the quantity of unsigned integer data types that will be incorporated into the created Solidity code. The possible values are 1, 2, 3, 4, 5, or 6.", `${config.uint_num}`)
  // Function
  .option("--function_body_stmt_cnt_upper_limit <number>", "The upper limit of the number of non-declaration statements of a function. This value is suggested to be bigger than tha value of var_count", `${config.function_body_stmt_cnt_upper_limit}`)
  .option("--function_body_stmt_cnt_lower_limit <number>", "The lower limit of the number of non-declaration statements of a function.", `${config.function_body_stmt_cnt_lower_limit}`)
  .option("--return_count_of_function_upperlimit <number>", "The upper limit of the number of return values of a function.", `${config.return_count_of_function_upperlimit}`)
  .option("--return_count_of_function_lowerlimit <number>", "The lower limit of the number of return values of a function.", `${config.return_count_of_function_lowerlimit}`)
  .option("--param_count_of_function_upperlimit <number>", "The upper limit of the number of parameters of a function.", `${config.param_count_of_function_upperlimit}`)
  .option("--param_count_of_function_lowerlimit <number>", "The lower limit of the number of parameters of a function.", `${config.param_count_of_function_lowerlimit}`)
  .option("--function_count_per_contract_upper_limit <number>", "The upper limit of the number of functions in a contract.", `${config.function_count_per_contract_upper_limit}`)
  .option("--function_count_per_contract_lower_limit <number>", "The lower limit of the number of functions in a contract.", `${config.function_count_per_contract_lower_limit}`)
  .option("--modifier_per_function_upper_limit <number>", "The upper limit of the number of modifiers in a contract.", `${config.modifier_per_function_upper_limit}`)
  .option("--modifier_per_function_lower_limit <number>", "The lower limit of the number of modifiers in a contract.", `${config.modifier_per_function_lower_limit}`)
  // Modifier
  .option("--modifier_count_per_contract_upper_limit <number>", "The upper limit of the number of modifiers in a contract.", `${config.modifier_count_per_contract_upper_limit}`)
  .option("--modifier_count_per_contract_lower_limit <number>", "The lower limit of the number of modifiers in a contract.", `${config.modifier_count_per_contract_lower_limit}`)
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
  .option("--struct_decl_per_contract_upperlimit <number>", "The upper limit of the number of struct declarations in a contract.", `${config.struct_decl_per_contract_upperlimit}`)
  .option("--struct_decl_per_contract_lowerlimit <number>", "The lower limit of the number of struct declarations in a contract.", `${config.struct_decl_per_contract_lowerlimit}`)
  .option("--event_decl_per_contract_upperlimit <number>", "The upper limit of the number of events in a contract.", `${config.event_decl_per_contract_upperlimit}`)
  .option("--event_decl_per_contract_lowerlimit <number>", "The lower limit of the number of events in a contract.", `${config.event_decl_per_contract_lowerlimit}`)
  .option("--error_decl_per_contract_upperlimit <number>", "The upper limit of the number of errors in a contract.", `${config.error_decl_per_contract_upperlimit}`)
  .option("--error_decl_per_contract_lowerlimit <number>", "The lower limit of the number of errors in a contract.", `${config.error_decl_per_contract_lowerlimit}`)
  // Complexity
  .option("--expression_complexity_level <number>", "The complexity level of the expression Erwin will generate.\nThe suggedted range is [1,2,3]. The bigger, the more complex.", `${config.expression_complexity_level}`)
  .option("--statement_complexity__level <number>", "The complexity level of the statement Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.statement_complexity__level}`)
  .option("--type_complexity_level <number>", "The complexity level of the type Erwin will generate.\nThe suggedted range is [1,2]. The bigger, the more complex.", `${config.type_complexity_level}`)
  // Probability
  .option("--nonstructured_statement_prob <float>", "The probability of generating a nonstructured statement, such as AssignmentStatment or FunctionCallAssignment.", `${config.nonstructured_statement_prob}`)
  .option("--expression_complexity_prob <float>", "The probability of generating a complex expression.", `${config.expression_complexity_prob}`)
  .option("--literal_prob <float>", "The probability of generating a literal when initializing a variable.", `${config.literal_prob}`)
  .option("--tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${config.tuple_prob}`)
  .option("--vardecl_prob <float>", "The probability of generating a variable declaration.", `${config.vardecl_prob}`)
  .option("--new_prob <float>", "The probability of generating a variable declaration in place.", `${config.new_prob}`)
  .option("--else_prob <float>", "The probability of generating an else statement.", `${config.else_prob}`)
  .option("--init_state_var_in_constructor_prob <float>", "The probability of initializing a state variable in the constructor.", `${config.init_state_var_in_constructor_prob}`)
  .option("--struct_prob <float>", "The probability of generating a struct.", `${config.struct_prob}`)
  .option("--contract_type_prob <float>", "The probability of generating a contract-type variable.", `${config.contract_type_prob}`)
  .option("--struct_type_prob <float>", "The probability of generating a struct-type variable.", `${config.struct_type_prob}`)
  .option("--in_func_initialization_prob <float>", "The probability of initializing a variable during its declaration inside a function.", `${config.in_func_initialization_prob}`)
  .option("--contract_member_initialization_prob <float>", "The probability of initializing a state variable during its declaration inside a contract.", `${config.contract_member_initialization_prob}`)
  .option("--init_with_state_var_prob <float>", "The probability of initializing a variable with a state variable.", `${config.init_with_state_var_prob}`)
  .option("--constructor_prob <float>", "The probability of generating a constructor.", `${config.constructor_prob}`)
  .option("--return_prob <float>", "The probability of generating a return statement.", `${config.return_prob}`)
  .option("--reuse_name_prob <float>", "The probability of reusing a name.", `${config.reuse_name_prob}`)
  .option("--mapping_type_prob <float>", "The probability of generating a mapping-type variable.", `${config.mapping_type_prob}`)
  .option("--array_type_prob <float>", "The probability of generating an array-type variab;e.", `${config.array_type_prob}`)
  .option("--string_type_prob <float>", "The probability of generating a string-type variable.", `${config.string_type_prob}`)
  .option("--dynamic_array_prob <float>", "The probability of generating a dynamic array.", `${config.dynamic_array_prob}`)
  .option("--event_prob <float>", "The probability of generating an event.", `${config.event_prob}`)
  .option("--error_prob <float>", "The probability of generating an error.", `${config.error_prob}`)
  .option("--generation_rounds <number>", "The number of rounds Erwin will generate.", `${config.generation_rounds}`)
  .option("--log_file_path <string>", "The path of the log file.", `${config.log_file_path}`)
  .option("--enable_test", "Enable the test mode.", `${config.enable_test}`)
  .option("--compiler_path <string>", "The path of the Solidity compiler.", `${config.compiler_path}`)
  .option("--refresh_folder", "Refresh the folder before generating the program.", `${config.refresh_folder}`)
  .option("--test_out_dir <string>", "The output directory for the generated test program. The default is 'test_results'", `${config.test_out_dir}`)
  .option("--terminate_on_compiler_crash", "Terminate the program when a failure occurs during testing the target software under the test mode", `${config.terminate_on_compiler_crash}`)
  .option("--enable_search_space_cmp", "Enable the search space comparison record.", `${config.enable_search_space_cmp}`)
program.parse(process.argv);
// Set the configuration
if (program.args[0] === "mutate") {
  config.file = program.commands[0].opts().file;
  config.out_dir = program.commands[0].opts().out_dir;
}
else if (program.args[0] === "generate") {
  config.out_dir = program.commands[1].opts().out_dir;
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
  config.modifier_per_function_lower_limit = parseInt(program.commands[1].opts().modifier_per_function_lower_limit);
  config.modifier_per_function_upper_limit = parseInt(program.commands[1].opts().modifier_per_function_upper_limit);
  config.modifier_count_per_contract_upper_limit = parseInt(program.commands[1].opts().modifier_count_per_contract_upper_limit);
  config.modifier_count_per_contract_lower_limit = parseInt(program.commands[1].opts().modifier_count_per_contract_lower_limit);
  config.literal_prob = parseFloat(program.commands[1].opts().literal_prob);
  config.maximum_solution_count = parseInt(program.commands[1].opts().maximum_solution_count);
  config.tuple_prob = parseFloat(program.commands[1].opts().tuple_prob);
  config.array_length_upperlimit = parseInt(program.commands[1].opts().array_length_upperlimit);
  config.expression_complexity_level = parseInt(program.commands[1].opts().expression_complexity_level);
  config.state_variable_count_upperlimit = parseInt(program.commands[1].opts().state_variable_count_upperlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.state_variable_count_lowerlimit = parseInt(program.commands[1].opts().state_variable_count_lowerlimit);
  config.struct_member_variable_count_upperlimit = parseInt(program.commands[1].opts().struct_member_variable_count_upperlimit);
  config.contract_count = parseInt(program.commands[1].opts().contract_count);
  config.mode = program.commands[1].opts().mode;
  config.vardecl_prob = parseFloat(program.commands[1].opts().vardecl_prob);
  config.new_prob = parseFloat(program.commands[1].opts().new_prob);
  config.else_prob = parseFloat(program.commands[1].opts().else_prob);
  config.init_state_var_in_constructor_prob = parseFloat(program.commands[1].opts().init_state_var_in_constructor_prob);
  config.nonstructured_statement_prob = parseFloat(program.commands[1].opts().nonstructured_statement_prob);
  config.expression_complexity_prob = parseFloat(program.commands[1].opts().expression_complexity_prob);
  config.struct_prob = parseFloat(program.commands[1].opts().struct_prob);
  config.contract_type_prob = parseFloat(program.commands[1].opts().contract_type_prob);
  config.struct_type_prob = parseFloat(program.commands[1].opts().struct_type_prob);
  config.in_func_initialization_prob = parseFloat(program.commands[1].opts().in_func_initialization_prob);
  config.contract_member_initialization_prob = parseFloat(program.commands[1].opts().contract_member_initialization_prob);
  config.init_with_state_var_prob = parseFloat(program.commands[1].opts().init_with_state_var_prob);
  config.constructor_prob = parseFloat(program.commands[1].opts().constructor_prob);
  config.return_prob = parseFloat(program.commands[1].opts().return_prob);
  config.reuse_name_prob = parseFloat(program.commands[1].opts().reuse_name_prob);
  config.mapping_type_prob = parseFloat(program.commands[1].opts().mapping_type_prob);
  config.array_type_prob = parseFloat(program.commands[1].opts().array_type_prob);
  config.string_type_prob = parseFloat(program.commands[1].opts().string_type_prob);
  config.dynamic_array_prob = parseFloat(program.commands[1].opts().dynamic_array_prob);
  config.event_prob = parseFloat(program.commands[1].opts().event_prob);
  config.error_prob = parseFloat(program.commands[1].opts().error_prob);
  config.for_init_cnt_upper_limit = parseInt(program.commands[1].opts().for_init_cnt_upper_limit);
  config.for_init_cnt_lower_limit = parseInt(program.commands[1].opts().for_init_cnt_lower_limit);
  config.statement_complexity__level = parseInt(program.commands[1].opts().statement_complexity__level);
  config.type_complexity_level = parseInt(program.commands[1].opts().type_complexity_level);
  config.for_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().for_body_stmt_cnt_lower_limit);
  config.for_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().for_body_stmt_cnt_upper_limit);
  config.while_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().while_body_stmt_cnt_lower_limit);
  config.while_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().while_body_stmt_cnt_upper_limit);
  config.do_while_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().do_while_body_stmt_cnt_lower_limit);
  config.do_while_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().do_while_body_stmt_cnt_upper_limit);
  config.if_body_stmt_cnt_lower_limit = parseInt(program.commands[1].opts().if_body_stmt_cnt_lower_limit);
  config.if_body_stmt_cnt_upper_limit = parseInt(program.commands[1].opts().if_body_stmt_cnt_upper_limit);
  config.struct_decl_per_contract_upperlimit = parseInt(program.commands[1].opts().struct_decl_per_contract_upperlimit);
  config.struct_decl_per_contract_lowerlimit = parseInt(program.commands[1].opts().struct_decl_per_contract_lowerlimit);
  config.event_decl_per_contract_upperlimit = parseInt(program.commands[1].opts().event_decl_per_contract_upperlimit);
  config.event_decl_per_contract_lowerlimit = parseInt(program.commands[1].opts().event_decl_per_contract_lowerlimit);
  config.error_decl_per_contract_upperlimit = parseInt(program.commands[1].opts().error_decl_per_contract_upperlimit);
  config.error_decl_per_contract_lowerlimit = parseInt(program.commands[1].opts().error_decl_per_contract_lowerlimit);
  config.generation_rounds = parseInt(program.commands[1].opts().generation_rounds);
  config.compiler_path = program.commands[1].opts().compiler_path;
  config.target = program.commands[1].opts().target;
  config.test_out_dir = program.commands[1].opts().test_out_dir;
  if (program.commands[1].opts().refresh_folder === true) config.refresh_folder = true;
  if (program.commands[1].opts().debug === true) config.debug = true;
  if (program.commands[1].opts().stop_on_erwin_bug === true) config.stop_on_erwin_bug = true;
  if (program.commands[1].opts().enable_test === true) config.enable_test = true;
  if (program.commands[1].opts().terminate_on_compiler_crash === true) config.terminate_on_compiler_crash = true;
  if (program.commands[1].opts().enable_search_space_cmp === true) config.enable_search_space_cmp = true;
  if (config.debug) {
    config.stop_on_erwin_bug = true;
  }
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
  assert(config.array_length_upperlimit >= 1, "The upper limit of the length of an array must be not less than 0.");
  assert(config.function_body_stmt_cnt_upper_limit >= 0, "The upper limit of the number of statements of a function must be not less than 0.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 0.");
  assert(config.return_count_of_function_upperlimit >= 0, "The upper limit of the number of return values of a function must be not less than 0.");
  assert(config.return_count_of_function_lowerlimit >= 0, "The lower limit of the number of return values of a function must be not less than 0.");
  assert(config.param_count_of_function_lowerlimit >= 0, "The lower limit of the number of parameters of a function must be not less than 0.");
  assert(config.param_count_of_function_upperlimit >= 0, "The upper limit of the number of parameters of a function must be not less than 0.");
  assert(config.function_count_per_contract_lower_limit <= config.function_count_per_contract_upper_limit, "The lower limit of the number of functions must be less than or equal to the upper limit.");
  assert(config.function_count_per_contract_lower_limit >= 0, "The number of functions must be not less than 0.");
  assert(config.modifier_per_function_lower_limit <= config.modifier_per_function_upper_limit, "The lower limit of the number of modifiers must be less than or equal to the upper limit.");
  assert(config.modifier_per_function_lower_limit >= 0, "The number of modifiers must be not less than 0.");
  assert(config.modifier_count_per_contract_lower_limit <= config.modifier_count_per_contract_upper_limit, "The lower limit of the number of modifiers must be less than or equal to the upper limit.");
  assert(config.modifier_count_per_contract_lower_limit >= 0, "The number of modifiers must be not less than 0.");
  assert(config.literal_prob >= 0 && config.literal_prob <= 1, "The probability of generating a literal must be in the range [0,1].");
  assert(config.maximum_solution_count >= 0, "The maximum number of solutions must be not less than 0.");
  assert(config.tuple_prob >= 0 && config.tuple_prob <= 1, "The probability of generating a tuple surrounding an expression must be in the range [0,1].");
  assert(config.init_state_var_in_constructor_prob >= 0 && config.init_state_var_in_constructor_prob <= 1, "The probability of initializing a state variable in the constructor must be in the range [0,1].");
  assert(config.expression_complexity_level >= 1, "The complex level of the expression must be not less than 1.");
  assert(config.state_variable_count_upperlimit >= 0, "state_variable_count_upperlimit must be not less than 0.");
  assert(config.state_variable_count_lowerlimit >= 0, "state_variable_count_lowerlimit must be not less than 0.");
  assert(config.contract_count >= 0, "contract_count must be not less than 0.");
  if (config.mode === "") {
    console.warn("You didn't specify the mode of Erwin. Therefore, Erwin will generate trivially, without exhaustively enumerating test programs in the search space.");
    config.mode = "type";
    config.maximum_solution_count = 1;
  }
  assert(["type", "scope", "loc"].includes(config.mode), "The mode is not either 'type', 'scope', 'loc', instead it is " + config.mode);
  assert(config.uint_num >= 1 && config.uint_num <= 6, "The number of uint types must be in the range [1,6].");
  assert(config.int_num >= 1 && config.int_num <= 6, "The number of int types must be in the range [1,6].");
  assert(config.vardecl_prob >= 0 && config.vardecl_prob <= 1.0, "The probability of generating a variable declaration must be in the range [0,1].");
  assert(config.new_prob >= 0 && config.new_prob <= 1.0, "The probability of generating a variable declaration in place must be in the range [0,1].");
  assert(config.else_prob >= 0.0 && config.else_prob <= 1.0, "The probability of generating an else statement must be in the range [0,1].");
  assert(config.mapping_type_prob >= 0.0 && config.mapping_type_prob <= 1.0, "The probability of generating a mapping must be in the range [0,1].");
  assert(config.array_type_prob >= 0.0 && config.array_type_prob <= 1.0, "The probability of generating an array must be in the range [0,1].");
  assert(config.string_type_prob >= 0.0 && config.string_type_prob <= 1.0, "The probability of generating a string must be in the range [0,1].");
  assert(config.contract_type_prob >= 0.0 && config.contract_type_prob <= 1.0, "The probability of generating a contract instance must be in the range [0,1].");
  assert(config.struct_type_prob >= 0.0 && config.struct_type_prob <= 1.0, "The probability of generating a struct instance must be in the range [0,1].");
  assert(config.array_type_prob + config.mapping_type_prob + config.contract_type_prob + config.struct_type_prob + config.string_type_prob < 1, "A variable can be of elementary type, contract type, contract type, struct type, mapping type, array type, or string type. Therefore, the sum of the probabilities of generating non-elementary types must be less than 1 to ensure the generation of elementary-type variables.");
  assert(config.dynamic_array_prob >= 0.0 && config.dynamic_array_prob <= 1.0, "The probability of generating a dynamic array must be in the range [0,1].");
  assert(config.event_prob >= 0.0 && config.event_prob <= 1.0, "The probability of generating an event must be in the range [0,1].");
  assert(config.error_prob >= 0.0 && config.error_prob <= 1.0, "The probability of generating an error must be in the range [0,1].");
  assert(config.return_count_of_function_lowerlimit <= config.return_count_of_function_upperlimit, "The lower limit of the number of return values of a function must be less than or equal to the upper limit.");
  assert(config.param_count_of_function_lowerlimit <= config.param_count_of_function_upperlimit, "The lower limit of the number of parameters of a function must be less than or equal to the upper limit.");
  assert(config.state_variable_count_lowerlimit <= config.state_variable_count_upperlimit, "state_variable_count_lowerlimit must be less than or equal to state_variable_count_upperlimit.");
  assert(config.nonstructured_statement_prob >= 0.0 && config.nonstructured_statement_prob <= 1.0, "The probability of generating a nonstructured statement must be in the range [0,1].");
  assert(config.expression_complexity_prob >= 0.0 && config.expression_complexity_prob <= 1.0, "The probability of generating a complex expression must be in the range [0,1].");
  assert(config.function_body_stmt_cnt_lower_limit <= config.function_body_stmt_cnt_upper_limit, "The lower limit of the number of statements of a function must be less than or equal to the upper limit.");
  assert(config.function_body_stmt_cnt_lower_limit >= 0, "The lower limit of the number of statements of a function must be not less than 1.");
  assert(config.statement_complexity__level >= 0, "The complex level of the statement must be not less than 0.");
  assert(config.type_complexity_level >= 0, "The complex level of the type must be not less than 0.");
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
  assert(config.struct_decl_per_contract_lowerlimit <= config.struct_decl_per_contract_upperlimit, "The lower limit of the number of struct declarations in a contract must be less than or equal to the upper limit.");
  assert(config.struct_decl_per_contract_lowerlimit >= 1, "The lower limit of the number of struct declarations in a contract must be not less than 1.");
  assert(config.event_decl_per_contract_lowerlimit <= config.event_decl_per_contract_upperlimit, "The lower limit of the number of events in a contract must be less than or equal to the upper limit.");
  assert(config.event_decl_per_contract_lowerlimit >= 1, "The lower limit of the number of events in a contract must be not less than 1.");
  assert(config.error_decl_per_contract_lowerlimit <= config.error_decl_per_contract_upperlimit, "The lower limit of the number of errors in a contract must be less than or equal to the upper limit.");
  assert(config.error_decl_per_contract_lowerlimit >= 1, "The lower limit of the number of errors in a contract must be not less than 1.");
  assert(config.struct_prob >= 0 && config.struct_prob <= 1, "The probability of generating a struct must be in the range [0,1].");
  assert(config.in_func_initialization_prob >= 0 && config.in_func_initialization_prob <= 1, "The probability of generating an initialization statement must be in the range [0,1].");
  assert(config.contract_member_initialization_prob >= 0 && config.contract_member_initialization_prob <= 1, "The probability of generating an initialization statement must be in the range [0,1].");
  assert(config.init_with_state_var_prob >= 0 && config.init_with_state_var_prob <= 1, "The probability of initializing a variable with a state variable must be in the range [0,1].");
  assert(config.constructor_prob >= 0 && config.constructor_prob <= 1, "The probability of generating a constructor must be in the range [0,1].");
  assert(config.return_prob >= 0 && config.return_prob <= 1, "The probability of generating a return statement must be in the range [0,1].");
  assert(config.reuse_name_prob >= 0 && config.reuse_name_prob < 1, "The probability of reusing a name must be in the range [0,1).");
  assert(config.generation_rounds >= 1, "The number of generation rounds must be not less than 1.");
  assert(config.test_out_dir !== "", "The output directory for the generated test program is not provided.");
  if (config.enable_test && config.target !== "slither") {
    assert(config.compiler_path !== "", "The path of the compiler path is not provided while enabling the testing mode and the target is a solidity compiler.");
  }
  assert(['solidity', 'solang', 'solar', 'slither'].includes(config.target), "The target is not either 'solidity', 'solang', 'solar', or 'slither'.");
}

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