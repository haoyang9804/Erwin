import random

def solidity_compilation_flags() -> str:
  output_flags = [
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
  ]
  opt_flags = [
    '--optimize',
    '--optimize-runs',  # followed by a number
    '--optimize-yul',
    '--no-optimize-yul',
    '--yul-optimizations'  # followed by valid alphabets
  ]
  yul_optimizations = ['f', 'l', 'c', 'C', 'U', 'n', 'D', 'E', 'v', 'e',
    'j', 's', 'x', 'I', 'O', 'o', 'i', 'g', 'h', 'F', 'T', 'L', 'M', 'm', 'V',
    'a', 't', 'r', 'p', 'S', 'u', 'd']
  # --optimize-yul and --no-optimize-yul are mutually exclusive
  model_checker_flags = [
    '--model-checker-div-mod-no-slacks',
    '--model-checker-engine',  # followed by all,bmc,chc,none
    '--model-checker-ext-calls',  # followed by untrusted,trusted
    '--model-checker-invariants',  # followed by default,all,contract,reentrancy
    '--model-checker-print-query',
    '--model-checker-show-proved-safe',
    '--model-checker-show-unproved',
    '--model-checker-show-unsupported',
    '--model-checker-solvers',  # followed by cvc5,eld,z3,smtlib2
    '--model-checker-targets',  # followed by default,all,constantCondition,underflow,overflow,divByZero,balance,assert,popEmptyArray,outOfBounds
    '--model-checker-timeout',  # followed by a number (ms)
    '--model-checker-bmc-loop-iterations',  # followed by a number
  ]
  # Only smtlib2 can print query

  def select_random_elements(lst, n):
    return random.sample(lst, n)

  def random_int(start, end):
    return random.randint(start, end)

  def pick_random_element(lst):
    return random.choice(lst)

  selected_output_flags = select_random_elements(output_flags, random_int(1, len(output_flags)))
  selected_opt_flags = select_random_elements(opt_flags, random_int(1, len(opt_flags)))
  selected_model_checker_flags = select_random_elements(model_checker_flags, random_int(1, len(model_checker_flags)))

  if '--no-optimize-yul' in selected_opt_flags and '--optimize-yul' in selected_opt_flags:
    index = selected_opt_flags.index('--optimize-yul' if random.random() < 0.5 else '--no-optimize-yul')
    selected_opt_flags.pop(index)

  if '--no-optimize-yul' in selected_opt_flags and '--optimize' in selected_opt_flags:
    index = selected_opt_flags.index('--optimize' if random.random() < 0.5 else '--no-optimize-yul')
    selected_opt_flags.pop(index)

  if '--optimize-yul' not in selected_opt_flags and '--yul-optimizations' in selected_opt_flags:
    index = selected_opt_flags.index('--yul-optimizations')
    selected_opt_flags.pop(index)

  for i, flag in enumerate(selected_opt_flags):
    if flag == '--optimize-runs':
      selected_opt_flags[i] = f"{flag} {random_int(1, 10)}"
    elif flag == '--yul-optimizations':
      selected_opt_flags[i] = f"{flag} {''.join(select_random_elements(yul_optimizations, random_int(1, len(yul_optimizations))))}"

  if '--model-checker-bmc-loop-iterations' in selected_model_checker_flags and '--model-checker-engine' in selected_model_checker_flags:
    if random.random() < 0.5:
      selected_model_checker_flags.remove('--model-checker-bmc-loop-iterations')
    else:
      index = selected_model_checker_flags.index('--model-checker-engine')
      selected_model_checker_flags[index] = '--model-checker-engine bmc'
  elif '--model-checker-bmc-loop-iterations' in selected_model_checker_flags and '--model-checker-engine' not in selected_model_checker_flags:
      selected_model_checker_flags.append('--model-checker-engine bmc')

  for i, flag in enumerate(selected_model_checker_flags):
    if flag == '--model-checker-engine':
      selected_model_checker_flags[i] = f"{flag} {pick_random_element(['all', 'bmc', 'chc', 'none'])}"
    elif flag == '--model-checker-ext-calls':
      selected_model_checker_flags[i] = f"{flag} {pick_random_element(['untrusted', 'trusted'])}"
    elif flag == '--model-checker-invariants':
      selected_model_checker_flags[i] = f"{flag} {pick_random_element(['default', 'all', 'contract', 'reentrancy'])}"
    elif flag == '--model-checker-solvers':
      selected_model_checker_flags[i] = f"{flag} {pick_random_element(['cvc5', 'eld', 'z3', 'smtlib2'])}"
    elif flag == '--model-checker-targets':
      selected_model_checker_flags[i] = f"{flag} {pick_random_element(['default', 'all', 'constantCondition', 'underflow', 'overflow', 'divByZero', 'balance', 'assert', 'popEmptyArray', 'outOfBounds'])}"
    elif flag in ['--model-checker-timeout', '--model-checker-bmc-loop-iterations']:
      selected_model_checker_flags[i] = f"{flag} {random_int(1, 10)}"

  if '--model-checker-print-query' in selected_model_checker_flags and '--model-checker-solvers' in selected_model_checker_flags:
    index = selected_model_checker_flags.index('--model-checker-solvers')
    if index != -1:
        selected_model_checker_flags[index] = '--model-checker-solvers smtlib2'
  elif '--model-checker-solvers' in selected_model_checker_flags:
    index = selected_model_checker_flags.index('--model-checker-solvers')
    selected_model_checker_flags[index] = f"--model-checker-solvers {pick_random_element(['default', 'all', 'constantCondition', 'underflow', 'overflow', 'divByZero', 'balance', 'assert', 'popEmptyArray', 'outOfBounds'])}"
  elif '--model-checker-print-query' in selected_model_checker_flags:
    selected_model_checker_flags.remove('--model-checker-print-query')

  flags = f"{pick_random_element(selected_output_flags)} {' '.join(selected_opt_flags)} {' '.join(selected_model_checker_flags)} --via-ir"
  return flags
