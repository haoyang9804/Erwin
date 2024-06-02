#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import * as db from "./db"
import { irnodes } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import * as type from "./type";
// import { pickRandomElement } from "./utility";
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
export let type_complex_level = 1;
export let expression_complex_level = 1;
export let debug = false;
export let tuple_prob = 0.3;
export let var_count = 5;
export let tuple_vardecl_count = 3;
const version = "0.1.0";

function terminate(message ?: string, exitCode = 0) : never {
  if (message !== undefined) {
    if (exitCode === 0) {
      console.log(message);
    } else {
      console.error(message);
    }
  }

  process.exit(exitCode);
}

function error(message : string) : never {
  terminate(message, 1);
}

(async () => {
  const program = new Command();
  program
    .name("erwin")
    .description("Randomly generate Solidity code.")
    .version(version, "-v, --version", "Print package version.")
    .helpOption("-h, --help", "Print help message.");
  program
    .option("-vc --var_count <number>", "The number of variables Erwin will generate.", `${var_count}`)
    .option("-tvc --tuple_vardecl_count <number>", "The number of variables in a tuple Erwin will generate.", `${tuple_vardecl_count}`)
    .option("-tp --tuple_prob <float>", "The probability of generating a tuple surrounding an expression.", `${tuple_prob}`)
    .option("-tc --type_complex_level <number>", "The complex level of the type Erwin will generate.\nThe suggested range is [1,2,3]. The bigger, the more complex.", `${type_complex_level}`)
    .option("-ec --expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3,4,5]. The bigger, the more complex.", `${expression_complex_level}`)
    .option("-d --debug", "Enable the debug mode.", `${debug}`);
  program.parse(process.argv);
  type_complex_level = parseInt(program.opts().type_complex_level);
  expression_complex_level = parseInt(program.opts().expression_complex_level);
  debug = program.opts().debug;
  var_count = parseInt(program.opts().var_count);
  tuple_vardecl_count = parseInt(program.opts().tuple_vardecl_count);
  tuple_prob = parseFloat(program.opts().tuple_prob);
  // open and init DB
  await db.irnode_db.open();
  await db.irnode_db.init();
  // generation
  for (let i = 0; i < var_count - tuple_vardecl_count; i++) {
    const v = new gen.SingleVariableDeclareStatementGenerator();
    await v.generate();
  }
  const tv = new gen.MultipleVariableDeclareStatementGenerator();
  await tv.generate();
  // const v1 = new gen.SingleVariableDeclareStatementGenerator();
  // const v2 = new gen.SingleVariableDeclareStatementGenerator();
  // const v3 = new gen.SingleVariableDeclareStatementGenerator();
  // await v1.generate();
  // await v2.generate();
  // await v3.generate();
  // resolve constraints
  if (debug) gen.type_dag.draw();
  try {
    gen.type_dag.resolve();
    if (debug) gen.type_dag.verify();
    console.log(`>> In total, there are ${gen.type_dag.resolved_types_collection.length} resolutions`);
    if (gen.type_dag.resolved_types_collection.length === 0) {
      for (let [key, value] of type.irnode2types) {
        console.log(`${key} -> ${value.forEach((x) => x.str())}`);
      }
    }
    // let resolved_types = pickRandomElement(gen.type_dag.resolved_types_collection)!;
    let cnt = 0;
    for (let resolved_types of gen.type_dag.resolved_types_collection) {
      console.log(`>>>>>>>>>> Resolution ${cnt++} <<<<<<<<<<`);
      for (let [key, value] of resolved_types) {
        (irnodes[key] as exp.IRExpression | decl.IRVariableDeclare).type = value;
      }
      for (let stmt of gen.scope_stmt.get(0)!) {
        console.log(writer.write(stmt.lower()));
      }
      for (let irnode of irnodes) {
        if (irnode instanceof exp.IRLiteral) {
          (irnode as exp.IRLiteral).kind = undefined;
          (irnode as exp.IRLiteral).value = undefined;
        }
      }
    }
  }
  catch (error) {
    console.log(error)
  }
  await db.irnode_db.close();
  // const args = program.args;
  // const options = program.opts();
})().catch((e) => {
  error(e.message);
});