#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import * as db from "./db"
import { irnodes } from "./node";
import * as exp from "./expression";
import * as decl from "./declare";
import { assert } from "./utility";
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
export let type_focus_kind = 0;
export let type_complex_level = 1;
export let expression_complex_level = 1;
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
    .option("-t --type_focus_kind <number>", "The type kind Erwin will focus in generation.\n0: no focus.\n1: elementary types.\n2: mapping types\n3: function types\n4: array types\n", `${type_focus_kind}`)
    .option("-tc --type_complex_level <number>", "The complex level of the type Erwin will generate.\nThe suggested range is [1,2,3]. The bigger, the more complex.", `${type_complex_level}`)
    .option("-ec --expression_complex_level <number>", "The complex level of the expression Erwin will generate.\nThe suggedted range is [1,2,3,4,5]. The bigger, the more complex.", `${expression_complex_level}`)
  program.parse(process.argv);
  // open and init DB
  await db.irnode_db.open();
  await db.irnode_db.init();
  // generation
  const v1 = new gen.VariableDeclareStatementGenerator();
  const v2 = new gen.VariableDeclareStatementGenerator();
  // const v3 = new gen.VariableDeclareStatementGenerator();
  await v1.generate();
  await v2.generate();
  // await v3.generate();
  // resolve constraints
  gen.type_dag.get_heads();
  gen.type_dag.draw();
  let heads_typemap_array = gen.type_dag.resolve_heads();
  for (let typemap of heads_typemap_array) {
    gen.type_dag.init_resolution();
    for (let [key, value] of typemap) {
      gen.type_dag.resolved_types.set(key, value);
      gen.type_dag.dag_nodes.get(key)!.resolved = true;
    }
    gen.type_dag.resolve();
    gen.type_dag.verify();
    for (let [key, value] of gen.type_dag.resolved_types) {
      gen.type_dag.dag_nodes.get(key)!.resolved = false;
      assert(irnodes[key] instanceof exp.IRExpression || irnodes[key] instanceof decl.IRVariableDeclare, "Type resolution failed");
      (irnodes[key] as exp.IRExpression | decl.IRVariableDeclare).type = value;
    }
    console.log('==========\n');
    assert(gen.scope_stmt.has(0) && gen.scope_stmt.get(0)!.length > 0, "No statements in the global scope");
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
  await db.irnode_db.close();
  // const args = program.args;
  // const options = program.opts();
})().catch((e) => {
  error(e.message);
});