#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import * as db from "./db"
import { irnodes } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import { config } from "./config";
import { pickRandomElement, assert } from "./utility";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
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
  .description("Randomly generate Solidity code.")
  .version(version, "-v, --version", "Print package version.")
  .helpOption("-h, --help", "Print help message.");
program
  .option("-itn --int_types_num <number>", "The number of int types Erwin will consider in resolving type dominance.", `${config.int_num}`)
  .option("-utn --uint_types_num <number>", "The number of uint types Erwin will consider in resolving type dominance.", `${config.uint_num}`)
  .option("-bscf --body_stmt_count_of_function_upperlimit <number>", "The upper limit of the number of non-declaration statements of a function. This value is suggested to be bigger than tha value of var_count", `${config.body_stmt_count_of_function_upperlimit}`)
  .option("-rcf --return_count_of_function_upperlimit <number>", "The upper limit of the number of return values of a function.", `${config.return_count_of_function_upperlimit}`)
  .option("-pcf --param_count_of_function_upperlimit <number>", "The upper limit of the number of parameters of a function.", `${config.param_count_of_function_upperlimit}`)
  .option("-fc --function_count <number>", "The number of functions Erwin will generate.", `${config.function_count}`)
  .option("-lp --literal_prob <float>", "The probability of generating a literal.", `${config.literal_prob}`)
  .option("-mxt --maximum_type_resolution_for_heads <number>", "The maximum number of type resolutions for heads.", `${config.maximum_type_resolution_for_heads}`)
  // .option("-vc --var_count <number>", "The maximum number of variables Erwin will generate in a scope when there is no available variable declaration.", `${config.var_count}`)
  // .option("-tvc --tuple_vardecl_count <number>", "The maximum number of variables in a tuple Erwin will generate in a scope when there is no available variable declaration.", `${config.tuple_vardecl_count}`)
  .option("-tp --tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${config.tuple_prob}`)
  .option("-ec --expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3,4,5]. The bigger, the more complex.", `${config.expression_complex_level}`)
  .option("-d --debug", "Enable the debug mode.", `${config.debug}`)
  .option("-cs --chunk_size <number>", "The size of head solution chunk. The bigger the size is, the more resolutions Erwin will consider in a round.", `${config.chunk_size}`);
program.parse(process.argv);
config.int_num = parseInt(program.opts().int_types_num);
config.uint_num = parseInt(program.opts().uint_types_num);
config.body_stmt_count_of_function_upperlimit = parseInt(program.opts().body_stmt_count_of_function_upperlimit);
config.return_count_of_function_upperlimit = parseInt(program.opts().return_count_of_function_upperlimit);
config.param_count_of_function_upperlimit = parseInt(program.opts().param_count_of_function_upperlimit);
config.function_count = parseInt(program.opts().function_count);
config.literal_prob = parseFloat(program.opts().literal_prob);
config.maximum_type_resolution_for_heads = parseInt(program.opts().maximum_type_resolution_for_heads);
// config.var_count = parseInt(program.opts().var_count);
// config.tuple_vardecl_count = parseInt(program.opts().tuple_vardecl_count);
config.tuple_prob = parseFloat(program.opts().tuple_prob);
config.expression_complex_level = parseInt(program.opts().expression_complex_level);
config.chunk_size = parseInt(program.opts().chunk_size);
assert(config.int_num >= 0, "The number of int types must be not less than 0.");
assert(config.uint_num >= 0, "The number of uint types must be not less than 0.");
assert(config.body_stmt_count_of_function_upperlimit >= 0, "The upper limit of the number of statements of a function must be not less than 0.");
assert(config.return_count_of_function_upperlimit >= 0, "The upper limit of the number of return values of a function must be not less than 0.");
assert(config.param_count_of_function_upperlimit >= 0, "The upper limit of the number of parameters of a function must be not less than 0.");
assert(config.function_count >= 0, "The number of functions must be not less than 0.");
assert(config.literal_prob >= 0 && config.literal_prob <= 1, "The probability of generating a literal must be in the range [0,1].");
assert(config.maximum_type_resolution_for_heads >= config.chunk_size, "The maximum number of type resolutions for heads must be not less than the size of chunk.");
// assert(config.var_count >= 0, "The number of variables must be not less than 0.");
// assert(config.tuple_vardecl_count >= 0, "The number of variables in a tuple must be not less than 0.");
assert(config.tuple_prob >= 0 && config.tuple_prob <= 1, "The probability of generating a tuple surrounding an expression must be in the range [0,1].");
assert(config.expression_complex_level >= 1 && config.expression_complex_level <= 5, "The complex level of the expression must be in the range [1,2,3,4,5].");
assert(config.chunk_size > 0, "The chunk size of the database must be greater than 0.");
if (program.opts().debug === true) config.debug = true;
// generation
// for (let i = 0; i < config.var_count - config.tuple_vardecl_count; i++) {
//   const v = new gen.SingleVariableDeclareStatementGenerator();
//   v.generate();
// }
// if (config.tuple_vardecl_count > 0) {
//   const tv = new gen.MultipleVariableDeclareStatementGenerator();
//   tv.generate();
// }
for (let i = 0; i < config.function_count; i++) {
  const f = new gen.FunctionDeclareGenerator();
  f.generate();
}
// resolve constraints
if (config.debug) {
  gen.type_dag.draw("./type-constraint.svg");
  gen.funcstat_dag.draw("./funcstat-constraint.svg");
}
try {
  gen.type_dag.resolve_by_chunk();
  gen.funcstat_dag.resolve_by_chunk();
  if (config.debug) {
    gen.type_dag.verify();
    gen.funcstat_dag.verify();
  }
  console.log(`${gen.type_dag.solutions_collection.length} type solutions`);
  console.log(`${gen.funcstat_dag.solutions_collection.length} function state solutions`);
  let type_solutions = pickRandomElement(gen.type_dag.solutions_collection)!;
  for (let [key, value] of type_solutions) {
    if (irnodes[key] instanceof exp.IRLiteral || irnodes[key] instanceof decl.IRVariableDeclare)
      (irnodes[key] as exp.IRLiteral | decl.IRVariableDeclare).type = value;
  }
  let funcstat_solutions = pickRandomElement(gen.funcstat_dag.solutions_collection)!;
  for (let [key, value] of funcstat_solutions) {
    if (irnodes[key] instanceof decl.IRFunctionDefinition)
      (irnodes[key] as decl.IRFunctionDefinition).stateMutability! = value.kind;
  }
  for (let id of db.irnode_db.get_IRNodes_by_scope(0)!) {
    console.log(writer.write(irnodes[id].lower()));
  }
  for (let irnode of irnodes) {
    if (irnode instanceof exp.IRLiteral) {
      (irnode as exp.IRLiteral).kind = undefined;
      (irnode as exp.IRLiteral).value = undefined;
    }
  }
  // let cnt = 0;
  // for (let resolutions of gen.type_dag.resolutions_collection) {
  //   console.log(`>>>>>>>>>> Resolution ${cnt++} <<<<<<<<<<`);
  //   for (let [key, value] of resolutions) {
  //     (irnodes[key] as exp.IRExpression | decl.IRVariableDeclare).type = value;
  //   }
  //   for (let stmt of gen.scope_stmt.get(0)!) {
  //     console.log(writer.write(stmt.lower()));
  //   }
  //   for (let irnode of irnodes) {
  //     if (irnode instanceof exp.IRLiteral) {
  //       (irnode as exp.IRLiteral).kind = undefined;
  //       (irnode as exp.IRLiteral).value = undefined;
  //     }
  //   }
  // }
}
catch (error) {
  console.log(error)
}