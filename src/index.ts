#!/usr/bin/env node
import { Command } from "commander";
import * as gen from "./generator"
import * as db from "./db"
import { irnodes } from "./node";
import { IRExpression } from "./expression";
import { IRVariableDeclare } from "./declare";
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
    .option("-ts --type_complex_level <number>", "The complex level of the type Erwin will generate.\nRange over [1,2,3], the bigger, the more complex.", `${type_complex_level}`)
  program.parse(process.argv);
  // open and init DB
  await db.irnode_db.open();
  await db.irnode_db.init();
  // generation
  const a1 = new gen.AssignmentGenerator();
  await a1.generate();
  // resolve constraints
  gen.type_dag.get_heads();
  let heads_typemap_array = gen.type_dag.resolve_heads();
  for (let typemap of heads_typemap_array) {
    gen.type_dag.init_resolution();
    for (let [key, value] of typemap) {
      gen.type_dag.resolved_types.set(key, value);
      gen.type_dag.dag_nodes[key].resolved = true;
    }
    gen.type_dag.resolve();
    gen.type_dag.verify();
    for (let [key, value] of gen.type_dag.resolved_types) {
      gen.type_dag.dag_nodes[key].resolved = false;
      assert(irnodes[key] instanceof IRExpression || irnodes[key] instanceof IRVariableDeclare, "Type resolution failed");
      (irnodes[key] as IRExpression | IRVariableDeclare).type = value;
    }
    console.log('==========\n');
    assert(gen.scope_stmt.has(0) && gen.scope_stmt.get(0)!.length > 0, "No statements in the global scope");
    for (let stmt of gen.scope_stmt.get(0)!) {
      console.log(writer.write(stmt.lower()));
    }
  }
  await db.irnode_db.close();
  // const args = program.args;
  // const options = program.opts();
})().catch((e) => {
  error(e.message);
});