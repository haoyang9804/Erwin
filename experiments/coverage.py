import json
import matplotlib.pyplot as plt
from matplotlib_venn import venn2
import glob
import numpy as np
import subprocess
import os
from collections import defaultdict, namedtuple
import sys
import time
import colorama
from colorama import Fore, Back, Style
import random
import subprocess
import asyncio

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

def int_to_string_array(int_array):
  string_array = [str(num) for num in int_array]
  return string_array

# Extract edge coverages from llvm-cov JSON file
def extract_collected_edges(coverage_data) -> dict :
  position = namedtuple('Position', ['function_name', 'line_start', 'column_start', 'line_end', 'column_end'])
  collected_edges = defaultdict(int)
  # Iterate through the functions in the coverage data
  for function in coverage_data['data'][0]['functions']:
    function_name = function['name']
    # Check if the function has collected edges
    if 'branches' in function:
      for branch in function['branches']:
        # https://github.com/llvm/llvm-project/blob/34f8573a514915222630cf21e8a0c901a25f4ca0/llvm/tools/llvm-cov/CoverageExporterJson.cpp#L96
        collected_edges[position(function_name, branch[0],branch[1],branch[2],branch[3])] = branch[4]
  return collected_edges

solidity_sources = []
def collect_solidity_sources(root_dir):
  for dirpath, _, filenames in os.walk(root_dir):
    for filename in filenames:
      if filename.endswith('.cpp') and 'deps' not in dirpath and 'build' not in dirpath:
        solidity_sources.append(filename)
      elif filename.endswith('.h') and 'deps' not in dirpath and 'build' not in dirpath:
        solidity_sources.append(filename)

# Extract line coverages from gcov files generated by gcov
def extract_collected_lines(gcov_folder_path) -> set :
  # update gcov files
  generate_gcov_files(gcov_folder_path)
  # find all gcov files
  gcov_files = []
  for root, dirs, files in os.walk(gcov_folder_path):
    for file in files:
      if file.endswith('.gcov') and file.split('.gcov')[0] in solidity_sources:
        gcov_files.append(os.path.join(root, file))
  # extract the coverage data
  filename_linenum = namedtuple('FilenameLinenum', ['filename', 'linenum'])
  # collected_lines is a set of (filename, linenum) pairs
  collected_lines = set()
  lines_count = 0

  for gcov_file in gcov_files:
    with open(gcov_file, 'r') as f:
      stmtlines = f.readlines()
    for j in range(len(stmtlines)):
      if stmtlines[j] == '------------------\n':
        continue
      covcnt = stmtlines[j].strip().split(':')[0].strip()
      linenum = stmtlines[j].strip().split(':')[1].strip()
      if covcnt != '-' and covcnt != '#####':
        collected_lines.add(filename_linenum(filename=gcov_file.split('/')[-1], linenum=linenum))
        lines_count += 1
      elif covcnt == '#####':
        lines_count += 1
      continue
  
  return collected_lines, lines_count

def remove_gcov_files(gcov_folder_path):
  cur_path = os.getcwd()
  os.chdir(gcov_folder_path)
  command = 'find . -name "*.gcov" -exec rm -rf {} +;'
  try:
    subprocess.run(command, shell=True)
  except Exception as e:
    print(f"Error: {e}")
  os.chdir(cur_path)

def remove_gcda_files(gcda_folder_path):
  cur_path = os.getcwd()
  os.chdir(gcda_folder_path)
  command = 'find . -name "*.gcda" -exec rm -rf {} +;'
  try:
    subprocess.run(command, shell=True)
  except Exception as e:
    print(f"Error: {e}")
  os.chdir(cur_path)

# Extract line coverages from gcda files generated by llvm-cov gcov
def generate_gcov_files(gcda_folder_path) :
  remove_gcov_files(gcda_folder_path)
  # linux command of finding all gcda files in the folder and using gcov to generate gcov files
  cur_path = os.getcwd()
  os.chdir(gcda_folder_path)
  command = 'find . -name "*.gcda" -exec llvm-cov gcov {} \\;'
  try:
    subprocess.run(command, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  except Exception as e:
    print(f"Error: {e}")
  os.chdir(cur_path)
  
colors = [
  plt.cm.Purples(0.9),
  plt.cm.Blues(0.9),
  plt.cm.Greens(0.9),
  plt.cm.Oranges(0.9),
  plt.cm.Reds(0.9),
]

optional_command_suffixes = [
  '--mapping_type_prob 0.0',
  '--array_type_prob 0.0',
  '--struct_type_prob 0.0'
]

commands = [
  'npx erwin generate -m type',
  'npx erwin generate -m loc',
  'npx erwin generate -m scope',
]

def optional_command_suffix():
  # Randomly choose optional command suffixes, or return []
  return np.random.choice(optional_command_suffixes, size = np.random.randint(0, len(optional_command_suffixes)), replace = False)

def percentage(part, whole):
  Percentage = 100 * float(part)/float(whole)
  return str(Percentage) + '%'

def generate_solidity_edge_coverage(solc_path, sol_dir):
  """
  Generate coverage reports for multiple Solidity files.

  :param solc_path: Path to the instrumented Solidity compiler
  :param sol_dir: Directory containing Solidity files
  """
  #!Step 1: Compile all Solidity programs with the instrumented compiler
  for sol_file in glob.glob(os.path.join(sol_dir, '*.sol')):
    filename = os.path.basename(sol_file)
    profraw_file = os.path.join('temp_profiles', f"{os.path.splitext(filename)[0]}.profraw")
    compiler_command = f'LLVM_PROFILE_FILE="{profraw_file}" {solc_path} {solidity_compilation_flags()} {sol_file}'
    print(Fore.GREEN + f'compiler_command: {compiler_command}')
    subprocess.run(compiler_command, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  #!Step 2: Merge all raw profile data
  # Get all .profraw files in the temp_profiles directory
  profraw_files = glob.glob('temp_profiles/*.profraw')
  # Check if any files were found
  if not profraw_files:
    print("No .profraw files found in the temp_profiles directory.")
    exit(1)
  # Construct the command
  cmd = ['llvm-profdata', 'merge', '-sparse'] + profraw_files + ['-o', 'solc_combined.profdata']
  try:
    subprocess.run(cmd, check=True, capture_output=True, text=True)
  except subprocess.CalledProcessError as e:
    print(f"Error in running {cmd}: {e}")
    exit(1)
  # Get list of all Solidity files
  sol_files = glob.glob(os.path.join(sol_dir, '*.sol'))

  #!Step 3: Generate coverage reports
  # HTML report
  subprocess.run([
    'llvm-cov', 'show', solc_path, '-instr-profile=solc_combined.profdata',
    '-format=html', '-output-dir=coverage_report', *sol_files
  ])

  # Text summary
  with open('coverage_report/coverage_summary.txt', 'w') as f:
    subprocess.run([
      'llvm-cov', 'report', solc_path, '-instr-profile=solc_combined.profdata', 
      *sol_files
    ], stdout=f)

  # Detailed coverage data in JSON format
  with open('coverage_report/coverage_data.json', 'w') as f:
    subprocess.run([
      'llvm-cov', 'export', solc_path, '-instr-profile=solc_combined.profdata',
      '-format=text', *sol_files
    ], stdout=f)

  os.remove('solc_combined.profdata')

def generate_compile_covcollect(command, solc_path, generated_programs_folder_path, gcov_folder_path):
  # Execute Erwin command
  try:
    subprocess.run(command, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  except Exception as e:
    print(f"Error: {e}")
  start = time.time()
  # Compile the generated programs and generate coverage json file
  generate_solidity_edge_coverage(solc_path, generated_programs_folder_path)
  end = time.time()
  print(Fore.GREEN + f"generate_solidity_edge_coverage: {end-start} seconds")
  # Collect llvm-cov coverage data
  with open('./coverage_report/coverage_data.json', 'r') as f:
    coverage_data = json.load(f)
  start = time.time()
  collected_edges = extract_collected_edges(coverage_data)
  end = time.time()
  print(Fore.GREEN + f"extract_collected_edges: {end-start} seconds")
  start = time.time()
  collected_lines, lines_count = extract_collected_lines(gcov_folder_path)
  end = time.time()
  print(Fore.GREEN + f"extract_collected_lines: {end-start} seconds")
  edgecnt = 0
  covered_edgecnt = 0
  for edge in collected_edges:
    edgecnt += 1
    if collected_edges[edge] > 0:
      covered_edgecnt += 1
  return covered_edgecnt, edgecnt, len(collected_lines), lines_count

def draw_experiment1(name, rounds, ax_edge, ax_line, color, g_covered_edgecnts, g_covered_linecnts):
  # Plot the coverage data of all executions
  x = np.arange(1, rounds+1)
  median_covered_edgecnts = np.median(g_covered_edgecnts, axis=0)
  upper_covered_edgecnts = np.max(g_covered_edgecnts, axis=0)
  lower_covered_edgecnts = np.min(g_covered_edgecnts, axis=0)
  ax_edge.plot(x, median_covered_edgecnts, label = name, color = color)
  ax_edge.fill_between(x, lower_covered_edgecnts, upper_covered_edgecnts, alpha=0.3, edgecolor=color, facecolor=color)
  median_covered_linecnts = np.median(g_covered_linecnts, axis=0)
  upper_covered_linecnts = np.max(g_covered_linecnts, axis=0)
  lower_covered_linecnts = np.min(g_covered_linecnts, axis=0)
  ax_line.plot(x, median_covered_linecnts, label = name, color = color)
  ax_line.fill_between(x, lower_covered_linecnts, upper_covered_linecnts, alpha=0.3, edgecolor=color, facecolor=color)

def store_fig_experiment1(ax_edge, ax_line, fig_edge, fig_line):
  ax_edge.set_xlabel('#Generated Programs', fontsize = 25)
  ax_edge.set_ylabel('Edge Coverage', fontsize = 25)
  ax_edge.spines['right'].set_visible(False)
  ax_edge.spines['top'].set_visible(False)
  ax_edge.legend(fontsize=12)
  ax_line.set_xlabel('#Generated Programs', fontsize = 25)
  ax_line.set_ylabel('Line Coverage', fontsize = 25)
  ax_line.spines['right'].set_visible(False)
  ax_line.spines['top'].set_visible(False)
  ax_line.legend(fontsize=12)
  # Save the figures
  fig_edge.savefig('coverage_report/edge_plot.pdf', format='pdf', dpi=300, bbox_inches='tight')
  fig_edge.savefig('coverage_report/edge_plot.svg', format='svg', dpi=300, bbox_inches='tight')
  fig_line.savefig('coverage_report/line_plot.pdf', format='pdf', dpi=300, bbox_inches='tight')
  fig_line.savefig('coverage_report/line_plot.svg', format='svg', dpi=300, bbox_inches='tight')

  # Optionally, close the figures to free up memory
  plt.close(fig_edge)
  plt.close(fig_line)

# Draw from log files of previous experiments
def draw_previous_experiment1():
  fig_edge, ax_edge = plt.subplots(figsize = (8,5))
  fig_line, ax_line = plt.subplots(figsize = (8,5))
  #! collect experimental results of the trivial setting
  g_covered_edgecnts_trivial = []
  g_covered_linecnts_trivial = []
  g_edgecnt_trivial = -1
  g_linecnt_trivial = -1
  g_edgecnt_covered_trivial = -1
  g_linecnt_covered_trivial = -1
  if os.path.exists('coverage_report/edgecov_trivial.txt'):
    with open('coverage_report/edgecov_trivial.txt', 'r') as f:
      edgecov_trivial = f.readlines()
    edgecov_trivial_ = [list(map(int, line.strip().split(','))) for line in edgecov_trivial[:-1]]
    g_covered_edgecnts_trivial = edgecov_trivial_
    g_edgecnt_trivial = edgecov_trivial[-1].split('>')[1].strip().split('/')[1]
    g_edgecnt_covered_trivial = edgecov_trivial[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/linecov_trivial.txt'):
    with open('coverage_report/linecov_trivial.txt', 'r') as f:
      linecov_trivial = f.readlines()
    linecov_trivial_ = [list(map(int, line.strip().split(','))) for line in linecov_trivial[:-1]]
    g_covered_linecnts_trivial = linecov_trivial_
    g_linecnt_trivial = linecov_trivial[-1].split('>')[1].strip().split('/')[1]
    g_linecnt_covered_trivial = linecov_trivial[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/edgecov_trivial.txt') and os.path.exists('coverage_report/linecov_trivial.txt'):
    print(f"Trivial: Covered {percentage(g_edgecnt_covered_trivial, g_edgecnt_trivial)} edges, {percentage(g_linecnt_covered_trivial, g_linecnt_trivial)} lines")
    draw_experiment1('trivial', len(g_covered_edgecnts_trivial[0]), ax_edge, ax_line, plt.cm.Purples(0.9), g_covered_edgecnts_trivial, g_covered_linecnts_trivial)

  #! collect experimental results from the gen100 setting
  g_covered_edgecnts_gen100 = []
  g_covered_linecnts_gen100 = []
  g_edgecnt_gen100 = -1
  g_linecnt_gen100 = -1
  g_edgecnt_covered_gen100 = -1
  g_linecnt_covered_gen100 = -1
  if os.path.exists('coverage_report/edgecov_gen100.txt'):
    with open('coverage_report/edgecov_gen100.txt', 'r') as f:
      edgecov_gen100 = f.readlines()
    edgecov_gen100_ = [list(map(int, line.strip().split(','))) for line in edgecov_gen100[:-1]]
    g_covered_edgecnts_gen100 = edgecov_gen100_
    g_edgecnt_gen100 = edgecov_gen100[-1].split('>')[1].strip().split('/')[1]
    g_edgecnt_covered_gen100 = edgecov_gen100[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/linecov_gen100.txt'):
    with open('coverage_report/linecov_gen100.txt', 'r') as f:
      linecov_gen100 = f.readlines()
    linecov_gen100_ = [list(map(int, line.strip().split(','))) for line in linecov_gen100[:-1]]
    g_covered_linecnts_gen100 = linecov_gen100_
    g_linecnt_gen100 = linecov_gen100[-1].split('>')[1].strip().split('/')[1]
    g_linecnt_covered_gen100 = linecov_gen100[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/edgecov_gen100.txt') and os.path.exists('coverage_report/linecov_gen100.txt'):
    print(f"Gen100: Covered {percentage(g_edgecnt_covered_gen100, g_edgecnt_gen100)} edges, {percentage(g_linecnt_covered_gen100, g_linecnt_gen100)} lines")
    draw_experiment1('gen100', len(g_covered_edgecnts_gen100[0]), ax_edge, ax_line, plt.cm.Greens(0.9), g_covered_edgecnts_gen100, g_covered_linecnts_gen100)
  
  #! collect experimental results from the gen500 setting
  g_covered_edgecnts_gen500 = []
  g_covered_linecnts_gen500 = []
  g_edgecnt_gen500 = -1
  g_linecnt_gen500 = -1
  g_edgecnt_covered_gen500 = -1
  g_linecnt_covered_gen500 = -1
  if os.path.exists('coverage_report/edgecov_gen500.txt'):
    with open('coverage_report/edgecov_gen500.txt', 'r') as f:
      edgecov_gen500 = f.readlines()
    edgecov_gen500_ = [list(map(int, line.strip().split(','))) for line in edgecov_gen500[:-1]]
    g_covered_edgecnts_gen500 = edgecov_gen500_
    g_edgecnt_gen500 = edgecov_gen500[-1].split('>')[1].strip().split('/')[1]
    g_edgecnt_covered_gen500 = edgecov_gen500[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/linecov_gen500.txt'):
    with open('coverage_report/linecov_gen500.txt', 'r') as f:
      linecov_gen500 = f.readlines()
    linecov_gen500_ = [list(map(int, line.strip().split(','))) for line in linecov_gen500[:-1]]
    g_covered_linecnts_gen500 = linecov_gen500_
    g_linecnt_gen500 = linecov_gen500[-1].split('>')[1].strip().split('/')[1]
    g_linecnt_covered_gen500 = linecov_gen500[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/edgecov_gen500.txt') and os.path.exists('coverage_report/linecov_gen500.txt'):
    print(f"Gen500: Covered {percentage(g_edgecnt_covered_gen500, g_edgecnt_gen500)} edges, {percentage(g_linecnt_covered_gen500, g_linecnt_gen500)} lines")
    draw_experiment1('gen500', len(g_covered_edgecnts_gen500[0]), ax_edge, ax_line, plt.cm.Blues(0.9), g_covered_edgecnts_gen500, g_covered_linecnts_gen500)
    
  #! collect experimental results from the gen1000 setting
  g_covered_edgecnts_gen1000 = []
  g_covered_linecnts_gen1000 = []
  g_edgecnt_gen1000 = -1
  g_linecnt_gen1000 = -1
  g_edgecnt_covered_gen1000 = -1
  g_linecnt_covered_gen1000 = -1
  if os.path.exists('coverage_report/edgecov_gen1000.txt'):
    with open('coverage_report/edgecov_gen1000.txt', 'r') as f:
      edgecov_gen1000 = f.readlines()
    edgecov_gen1000_ = [list(map(int, line.strip().split(','))) for line in edgecov_gen1000[:-1]]
    g_covered_edgecnts_gen1000 = edgecov_gen1000_
    g_edgecnt_gen1000 = edgecov_gen1000[-1].split('>')[1].strip().split('/')[1]
    g_edgecnt_covered_gen1000 = edgecov_gen1000[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/linecov_gen1000.txt'):
    with open('coverage_report/linecov_gen1000.txt', 'r') as f:
      linecov_gen1000 = f.readlines()
    linecov_gen1000_ = [list(map(int, line.strip().split(','))) for line in linecov_gen1000[:-1]]
    g_covered_linecnts_gen1000 = linecov_gen1000_
    g_linecnt_gen1000 = linecov_gen1000[-1].split('>')[1].strip().split('/')[1]
    g_linecnt_covered_gen1000 = linecov_gen1000[-1].split('>')[1].strip().split('/')[0]
  if os.path.exists('coverage_report/edgecov_gen1000.txt') and os.path.exists('coverage_report/linecov_gen1000.txt'):
    print(f"Gen1000: Covered {percentage(g_edgecnt_covered_gen1000, g_edgecnt_gen1000)} edges, {percentage(g_linecnt_covered_gen1000, g_linecnt_gen1000)} lines")
    draw_experiment1('gen1000', len(g_covered_edgecnts_gen1000[0]), ax_edge, ax_line, plt.cm.Reds(0.9), g_covered_edgecnts_gen1000, g_covered_linecnts_gen1000)
  
  store_fig_experiment1(ax_edge, ax_line, fig_edge, fig_line)

def run_experiment1(name, executions, rounds, time_limit, command_prefix, command_suffix, solc_path, generated_programs_folder_path, gcov_folder_path, ax_edge, ax_line, color):
  g_covered_edgecnts = []
  g_covered_linecnts = []
  g_edgecnt = -1
  g_linecnt = -1
  g_covered_edgecnt = -1
  g_covered_linecnt = -1
  for i in range(executions):
    remove_gcov_files(gcov_folder_path)
    remove_gcda_files(gcov_folder_path)
    # Create a directory for intermediate profraw files
    if os.path.exists('temp_profiles'):
      for file in glob.glob('temp_profiles/*'):
        os.remove(file)
      os.rmdir('temp_profiles')
    os.makedirs('temp_profiles')
    covered_edgecnts = []
    covered_linecnts = []
    # for j in range(rounds):
    time_budget = time_limit
    while time_budget > 0:
      gen_start = time.time()
      command = f'{np.random.choice(commands) if command_prefix=="" else command_prefix} {command_suffix} {" ".join(optional_command_suffix())}'
      print(Fore.CYAN + f"Erwin command: {command}")
      covered_edgecnt, edgecnt, covered_linecnt, linecnt = generate_compile_covcollect(command, solc_path, generated_programs_folder_path, gcov_folder_path)
      gen_end = time.time()
      time_budget -= gen_end-gen_start
      print(Fore.BLUE + f"> Execution {i+1}, Time Cost: {gen_end-gen_start} seconds, Time Budget: {time_budget} seconds, {covered_edgecnt}/{edgecnt} edges covered, {covered_linecnt}/{linecnt} lines covered")
      g_edgecnt = max(edgecnt, g_edgecnt)
      g_linecnt = max(linecnt, g_linecnt)
      g_covered_edgecnt = max(covered_edgecnt, g_covered_edgecnt)
      g_covered_linecnt = max(covered_linecnt, g_covered_linecnt)
      covered_edgecnts.append(covered_edgecnt)
      covered_linecnts.append(covered_linecnt)
    if i == 0:
      # Log the edge coverage data
      with open(f'./coverage_report/edgecov_{name}.txt', 'w') as f:
        f.write(f'{",".join(int_to_string_array(covered_edgecnts))}\n')
      # Log the line coverage data
      with open(f'./coverage_report/linecov_{name}.txt', 'w') as f:
        f.write(f'{",".join(int_to_string_array(covered_linecnts))}\n')
    else:
      # Log the edge coverage data
      with open(f'./coverage_report/edgecov_{name}.txt', 'a') as f:
        f.write(f'{",".join(int_to_string_array(covered_edgecnts))}\n')
      # Log the line coverage data
      with open(f'./coverage_report/linecov_{name}.txt', 'a') as f:
        f.write(f'{",".join(int_to_string_array(covered_linecnts))}\n')
    g_covered_edgecnts.append(covered_edgecnts)
    g_covered_linecnts.append(covered_linecnts)
  print(f"Covered {percentage(g_covered_edgecnt, g_edgecnt)} edges, {percentage(g_covered_linecnt, g_linecnt)} lines")
  if os.path.exists(f'coverage_report/edgecov_{name}.txt'):
    with open(f'./coverage_report/edgecov_{name}.txt', 'a') as f:
      f.write(f'> {g_covered_edgecnt}/{g_edgecnt}\n')
  if os.path.exists(f'coverage_report/linecov_{name}.txt'):
    with open(f'./coverage_report/linecov_{name}.txt', 'a') as f:
      f.write(f'> {g_covered_linecnt}/{g_linecnt}\n')
  # Clean up intermediate profraw files
  for file in glob.glob('temp_profiles/*'):
    os.remove(file)
  os.rmdir('temp_profiles')
  draw_experiment1(name, rounds, ax_edge, ax_line, color, g_covered_edgecnts, g_covered_linecnts)

'''
Experiment 1.
Compare edge/line coverage increase speed over different generation setting.
'''
def experiment1():
  
  # solc_path = input("Enter the absolute path to the compiler executable: ")
  # generated_programs_folder_path = input("Enter the path to the generated program folder: ")
  # gcov_folder_path = input("Enter the absolute path to the gcov folder: ")
  # compiler_source_folder_path = input("Enter the absolute path to the compiler source folder: ")

  solc_path = '/data/hmaaj/solidity/build-experiment1/solc/solc'
  generated_programs_folder_path = '/data/hmaaj/Erwin/generated_programs'
  gcov_folder_path = '/data/hmaaj/solidity/build-experiment1'
  compiler_source_folder_path = '/data/hmaaj/solidity'

  solc_path = '/Users/mac/repo/solidity/build-lcov/solc/solc'
  generated_programs_folder_path = '/Users/mac/repo/Erwin/generated_programs'
  gcov_folder_path = '/Users/mac/repo/solidity/build-lcov'
  compiler_source_folder_path = '/Users/mac/repo/solidity'
  
  collect_solidity_sources(compiler_source_folder_path)
  
  command_suffix = f'--generation_rounds 1 --refresh_folder'
  executions = 5 # Number of executions of this experiment, used to mitigate the impact of randomness
  rounds = 1000 # Number of rounds of each execution, the x-axis of the plot
  time_limit = 3600*5 # Time limit for each round, in seconds
  fig_edge, ax_edge = plt.subplots(figsize = (8,5))
  fig_line, ax_line = plt.subplots(figsize = (8,5))
  
  #!1. Trivial generation
  print('Setting 1: Trivial generation')
  run_experiment1('trivial', executions, rounds, time_limit, 'npx erwin generate', command_suffix, solc_path, generated_programs_folder_path, gcov_folder_path, ax_edge, ax_line, plt.cm.Purples(0.9))
  # #!2. generate at most 100 programs from an IR
  print('Setting 2: Generate at most 50 programs from an IR')
  run_experiment1('gen100', executions, rounds, time_limit, '', f'--max 100 {command_suffix}', solc_path, generated_programs_folder_path, gcov_folder_path, ax_edge, ax_line, plt.cm.Greens(0.9))
  # #!3. generate 500 programs from an IR
  print('Setting 3: Generate at most 100 programs from an IR')
  run_experiment1('gen500', executions, rounds, time_limit, '', f'--max 500 {command_suffix}', solc_path, generated_programs_folder_path, gcov_folder_path, ax_edge, ax_line, plt.cm.Blues(0.9))
  # #!4. generate at most 1000 programs from an IR
  print('Setting 4: Generate at most 1000 programs from an IR')
  run_experiment1('gen1000', executions, rounds, time_limit, '', f'--max 1000 {command_suffix}', solc_path, generated_programs_folder_path, gcov_folder_path, ax_edge, ax_line, plt.cm.Reds(0.9))

  store_fig_experiment1(ax_edge, ax_line, fig_edge, fig_line)

'''
Experiment 2.
Compare edge/line coverages between Erwin-generated test programs and Solidity compiler unit test cases.
'''
def experiment2(collected_edges1, collected_edges2):
  coverage_json_path1 = input("Enter the path to the first coverage JSON file: ")
  coverage_json_path2 = input("Enter the path to the second coverage JSON file: ")

  # Example usage
  with open(coverage_json_path1, 'r') as f:
    coverage_data = json.load(f)

  collected_edges1 = extract_collected_edges(coverage_data)

  with open(coverage_json_path2, 'r') as f:
    coverage_data = json.load(f)

  collected_edges2 = extract_collected_edges(coverage_data)

  # Print the collected edges
  for edge in collected_edges1:
    assert edge in collected_edges2
    if (collected_edges1[edge] > 0) != (collected_edges2[edge] > 0):
      print(f"Edge {edge} has different counts: {collected_edges1[edge]} vs {collected_edges2[edge]}")

'''
Experiment 3.
Compare line coverage increase speed over different generation setting.
'''
def experiment3(gcovfolder1, gcovfolder2):
  collected_lines1 = extract_collected_lines(gcovfolder1)
  collected_lines2 = extract_collected_lines(gcovfolder2)
  # Output the number of lines covered by collected_lines1 but not collected_lines2
  print(f'collected_lines1 - collected_lines2 = {len(collected_lines1 - collected_lines2)}')
  # Output the number of lines covered by collected_lines2 but not collected_lines1
  print(f'collected_lines2 - collected_lines1 = {len(collected_lines2 - collected_lines1)}')
  # Output the number of lines covered by both collected_lines1 and collected_lines2
  print(f'collected_lines1 & collected_lines2 = {len(collected_lines1 & collected_lines2)}')
  # Output the first ten elements in collected_lines1
  print(f'collected_lines1: {list(collected_lines1)[:10]}')
  # Output the first ten elements in collected_lines2
  print(f'collected_lines2: {list(collected_lines2)[:10]}')
  venn2([collected_lines1, collected_lines2], ('1', '2'))
  plt.show()
  

if __name__ == '__main__':
  # args
  if len(sys.argv) < 2:
    print("Usage: python coverage.py <experiment_number>")
    exit(1)
  experiment_desc = sys.argv[1]
  if experiment_desc == 'experiment1':
    experiment1()
  elif experiment_desc == 'draw_previous_experiment1':
    draw_previous_experiment1()
