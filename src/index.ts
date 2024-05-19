#!/usr/bin/env node
import { Command } from "commander";
import * as figlet from "figlet"

console.log(figlet.textSync('Erwin'));
export let type_focus_kind = 0;
export let type_complex_level = 1;
const version = "0.1.0";

function terminate(message?: string, exitCode = 0): never {
  if (message !== undefined) {
      if (exitCode === 0) {
          console.log(message);
      } else {
          console.error(message);
      }
  }

  process.exit(exitCode);
}

function error(message: string): never {
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

  const args = program.args;
  const options = program.opts();
  console.log('args = ', args)
  console.log('options = ', options)
  console.log(options.type_focus_kind)
})().catch((e) => {
  error(e.message);
});