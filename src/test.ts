import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { config } from './config';
import { select_random_elements, random_int, pick_random_element } from './utility';

// Promisify exec to use it with async/await
const execPromise = promisify(exec);

async function compile(file_path : string) : Promise<[string, string]> {
  const output_flags = [
    '--ast-compact-json',
    '--asm',
    '--asm-json',
    '--opcodes',
    '--bin',
    '--bin-runtime',
    '--abi',
    '--ir',
    '--ir-ast-json',
    '--ir-optimized',
    '--ir-optimized-ast-json',
    '--hashes',
    '--userdoc',
    '--devdoc',
    '--metadata',
    '--storage-layout',
  ];
  const opt_flags = [
    '--optimize',
    '--optimize-runs', // followed by a number
    '--optimize-yul',
    '--no-optimize-yul',
    '--yul-optimizations' // followed by valid alphabets
  ];
  const yul_optimizations = ['f', 'l', 'c', 'C', 'U', 'n', 'D', 'E', 'v', 'e',
    'j', 's', 'x', 'I', 'O', 'o', 'i', 'g', 'h', 'F', 'T', 'L', 'M', 'm', 'V',
    'a', 't', 'r', 'p', 'S', 'u', 'd'];
  /*
  ! --optimize-yul and --no-optimize-yul are mutually exclusive
  */
  const model_checker_flags = [
    '--model-checker-div-mod-no-slacks',
    '--model-checker-engine', // followed by all,bmc,chc,none
    '--model-checker-ext-calls', // followed by untrusted,trusted
    '--model-checker-invariants', // followed by default,all,contract,reentrancy
    '--model-checker-print-query',
    '--model-checker-show-proved-safe',
    '--model-checker-show-unproved',
    '--model-checker-show-unsupported',
    '--model-checker-solvers', // followed by cvc5,eld,z3,smtlib2
    '--model-checker-targets', // followed by default,all,constantCondition,underflow,overflow,divByZero,balance,assert,popEmptyArray,outOfBounds
    '--model-checker-timeout', // followed by a number (ms)
    '--model-checker-bmc-loop-iterations', // followed by a number
  ];
  /*
  ! Only smtlib2 can print query
  */
  const selected_output_flags = select_random_elements(output_flags, random_int(1, output_flags.length));
  const selected_opt_flags = select_random_elements(opt_flags, random_int(1, opt_flags.length));
  const selected_model_checker_flags = select_random_elements(model_checker_flags, random_int(1, model_checker_flags.length));
  if (selected_opt_flags.includes('--no-optimize-yul') && selected_opt_flags.includes('--optimize-yul')) {
    const index = Math.random() < 0.5 ? selected_opt_flags.indexOf('--optimize-yul') : selected_opt_flags.indexOf('--no-optimize-yul');
    selected_opt_flags.splice(index, 1);
  }
  if (selected_opt_flags.includes('--no-optimize-yul') && selected_opt_flags.includes('--optimize')) {
    const index = Math.random() < 0.5 ? selected_opt_flags.indexOf('--optimize') : selected_opt_flags.indexOf('--no-optimize-yul');
    selected_opt_flags.splice(index, 1);
  }
  if (!selected_opt_flags.includes('--optimize-yul') && selected_opt_flags.includes('--yul-optimizations')) {
    const index = selected_opt_flags.indexOf('--yul-optimizations');
    selected_opt_flags.splice(index, 1);
  }
  selected_opt_flags.forEach((flag) => {
    if (flag === '--optimize-runs') {
      const index = selected_opt_flags.indexOf(flag);
      selected_opt_flags[index] = flag + ' ' + random_int(1, 10).toString();
    }
    else if (flag === '--yul-optimizations') {
      const index = selected_opt_flags.indexOf(flag);
      selected_opt_flags[index] = flag + ' ' + select_random_elements(yul_optimizations, random_int(1, yul_optimizations.length)).join('');
    }
  });
  if (selected_model_checker_flags.includes('--model-checker-bmc-loop-iterations') && selected_model_checker_flags.includes('--model-checker-engine')) {
    if (Math.random() < 0.5) {
      const index = selected_model_checker_flags.indexOf('--model-checker-bmc-loop-iterations');
      selected_model_checker_flags.splice(index, 1);
    }
    else {
      const index = selected_model_checker_flags.indexOf('--model-checker-engine');
      selected_model_checker_flags[index] = '--model-checker-engine bmc';
    }
  }
  else if (selected_model_checker_flags.includes('--model-checker-bmc-loop-iterations') && !selected_model_checker_flags.includes('--model-checker-engine')) {
    selected_model_checker_flags.push('--model-checker-engine bmc');
  }
  selected_model_checker_flags.forEach((flag) => {
    if (flag === '--model-checker-engine') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + select_random_elements(['all', 'bmc', 'chc', 'none'], 1).join('');
    }
    else if (flag === '--model-checker-ext-calls') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + select_random_elements(['untrusted', 'trusted'], 1).join('');
    }
    else if (flag === '--model-checker-invariants') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + select_random_elements(['default', 'all', 'contract', 'reentrancy'], 1).join('');
    }
    else if (flag === '--model-checker-solvers') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + select_random_elements(['cvc5', 'eld', 'z3', 'smtlib2'], 1).join('');
    }
    else if (flag === '--model-checker-targets') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + select_random_elements(['default', 'all', 'constantCondition', 'underflow', 'overflow', 'divByZero', 'balance', 'assert', 'popEmptyArray', 'outOfBounds'], 1).join('');
    }
    else if (flag === '--model-checker-timeout' || flag === '--model-checker-bmc-loop-iterations') {
      const index = selected_model_checker_flags.indexOf(flag);
      selected_model_checker_flags[index] = flag + ' ' + random_int(1, 10).toString();
    }
  });
  if (selected_model_checker_flags.includes('--model-checker-print-query') && selected_model_checker_flags.includes('--model-checker-solvers')) {
    const index = selected_model_checker_flags.indexOf('--model-checker-solvers');
    if (index !== -1) {
      selected_model_checker_flags[index] = '--model-checker-solvers smtlib2';
    }
  }
  else if (selected_model_checker_flags.includes('--model-checker-solvers')) {
    const index = selected_model_checker_flags.indexOf('--model-checker-solvers');
    selected_model_checker_flags[index] = '--model-checker-solvers' + ' ' + select_random_elements(['default', 'all', 'constantCondition', 'underflow', 'overflow', 'divByZero', 'balance', 'assert', 'popEmptyArray', 'outOfBounds'], 1).join('');
  }
  else if (selected_model_checker_flags.includes('--model-checker-print-query')) {
    const index = selected_model_checker_flags.indexOf('--model-checker-print-query');
    selected_model_checker_flags.splice(index, 1);
  }
  const compile_command = `${config.compiler_path} ${file_path} ${pick_random_element(selected_output_flags)} ${selected_opt_flags.join(' ')} ${selected_model_checker_flags.join(' ')}` + ' --via-ir';
  const { stdout, stderr } = await execPromise(compile_command);
  return [stdout, stderr];
}

/**
 * Test the Solidity compiler
 * 
 * @returns {number} A number indicating the result of the operation:
 * - 0 if all the generated programs pass the compilation
 * - 1 if generated program triggers an error
 * - 2 if the output directory does not exist
 * - 4 if the compiler path is incorrect
 */
export async function test_compiler() : Promise<number> {
  // Check if the "generated_programs" directory exists
  const dirPath = config.out_dir;
  const stats = await stat(dirPath);
  if (!stats.isDirectory()) {
    console.error('Output directory does not exist');
    return 2;
  }
  //@ts-ignore
  const { stdout, stderr } = await execPromise(`${config.compiler_path} --version`);
  if (stderr) {
    console.error('Compiler path is incorrect');
    return 4;
  }
  const files = await readdir(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await stat(filePath);
    if (stats.isFile()) {
      try {
        await compile(filePath);
      } catch (error) {
        const execError = error as ExecException & {
          stdout : string;
          stderr : string;
          signal ?: string;
        };

        console.error(`=========Error in file ${filePath}=========`);

        // Check for segmentation fault first
        if (execError.signal === 'SIGSEGV') {
          console.error('Segmentation fault (SIGSEGV) detected in compiler execution');
        }
        // If it's not a segmentation fault, check for other errors
        else if (execError.stderr) {
          console.error(`Solidity compiler error: ${execError.stderr}`);
        }
        return 1;
      }
    }
  }
  return 0;
}

/**
 * Test the Slither static analysis tool
 * 
 * @returns {number} A number indicating the result of the operation:
 * - 0 if all the generated programs pass the analysis
 * - 1 if generated program triggers an error
 * - 2 if the output directory does not exist
 * - 4 if slither is not installed
 */
export async function test_slither() : Promise<number> {
  // Check if the "generated_programs" directory exists
  const dirPath = config.out_dir;
  const stats = await stat(dirPath);
  if (!stats.isDirectory()) {
    console.error('Output directory does not exist');
    return 2;
  }
  //@ts-ignore
  const { stdout, stderr } = await execPromise('slither --version');
  if (stderr) {
    console.error('Slither is not installed');
    return 4;
  }
  const files = await readdir(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await stat(filePath);
    if (stats.isFile()) {
      try {
        const slither_command = `slither ${filePath}`;
        await execPromise(slither_command);
      } catch (error) {
        const execError = error as ExecException & {
          stdout : string;
          stderr : string;
          signal ?: string;
        };

        // Check for segmentation fault first
        if (execError.signal === 'SIGSEGV') {
          console.error(`=========Error in file ${filePath}=========`);
          console.error('Segmentation fault (SIGSEGV) detected in Slither execution');
          return 1;
        }
      }
    }
  }
  return 0;
}