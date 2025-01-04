import subprocess
import os
from compile import solidity_compilation_flags
import numpy as np
from colorama import Fore
import glob
import sys
import csv
import time
from collections import defaultdict
import shutil
import json
import re

def install_benchmark():
  print("Installing benchmark")
  repo_url = "https://github.com/haoyang9804/ISSTA24-Solidity-Study.git"
  clone_dir = "ISSTA24-Solidity-Study"
  
  try:
    if os.path.exists(clone_dir):
      print(f"The directory '{clone_dir}' already exists. Updating instead of cloning.")
      subprocess.run(["git", "-C", clone_dir, "pull"], check=True)
    else:
      subprocess.run(["git", "clone", repo_url, clone_dir], check=True)
    
    print("Benchmark installation completed successfully.")
  except subprocess.CalledProcessError as e:
    print(f"An error occurred while installing the benchmark: {e}")
  except Exception as e:
    print(f"An unexpected error occurred: {e}")

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

def extract_error(err):
  lines = err.split('\n')
  for line in lines:
    if 'Error:' in line:
      return line
  return err

def compile(solc_path, sol_file):
  compile_command = f'{solc_path} {sol_file}'
  # print(Fore.GREEN + f'compiler_command: {compile_command}')
  try:
    p = subprocess.run(compile_command, shell=True, capture_output=True)
    return remove_generated_program_names(extract_error(p.stderr.decode('utf-8'))), p.stdout.decode('utf-8'), p.returncode
  except subprocess.CalledProcessError as e:
    print(f"Error occurred: {e}")
    sys.exit(1)

def generate():
  suffix = ' --error_prob 0.0'
  command = f'{np.random.choice(commands)} -max 100 --generation_rounds 1 --refresh_folder {" ".join(optional_command_suffix())} {suffix}'
  # print(Fore.CYAN + f"Erwin command: {command}")
  heads = [
    'pragma experimental ABIEncoderV2;',
    'pragma experimental SMTChecker;'
  ]
  # select one of the headers randomly
  head = np.random.choice(heads)
  while True:
    try:
      start = time.time()
      subprocess.run(command, shell=True, capture_output=True)
      for sol_file in glob.glob(os.path.join('./generated_programs', '*.sol')):
        with open(sol_file, 'r') as original: data = original.read()
        with open(sol_file, 'w') as modified: modified.write(head + '\n' + data)
      end = time.time()
      return end - start
    except subprocess.CalledProcessError as e:
      print(f"Error occurred: {e}")
      continue

def remove_solidity_file_names(text):
  # Regular expression to match file patterns like "/path/to/file.sol:line:column:"
  pattern = r'\.\/ISSTA24-Solidity-Study\/benchmark\/[\d.]+\/\d+\.sol:\d+:\d+:'
  # Remove all occurrences of the pattern from the text
  cleaned_text = re.sub(pattern, '', text)
  # Remove any leading/trailing whitespace
  cleaned_text = cleaned_text.strip()
  return cleaned_text

def remove_generated_program_names(text):
  # Regular expression to match patterns like "./generated_programs/program_2025-1-4_2:14:51:253_0.sol:1:1:"
  pattern = r'(?:^|\s)(\.\/generated_programs\/program_\d{4}-\d{1,2}-\d{1,2}_\d{1,2}:\d{2}:\d{2}:\d+_\d+\.sol:\d+:\d+:)'
  # Remove all occurrences of the pattern from the text
  cleaned_text = re.sub(pattern, '', text)
  # Remove any leading/trailing whitespace
  cleaned_text = cleaned_text.strip()
  return cleaned_text

benchmark_error_message = {}

def collect_error_message():
  path = './ISSTA24-Solidity-Study/benchmark'
  for version in os.listdir(path):
    solc_path = os.path.join(path, version, 'solc-static-linux')
    for file in os.listdir(os.path.join(path, version)):
      if file == 'solc-static-linux':
        continue
      file_path = os.path.join(path, version, file)
      command = f'{solc_path} {file_path}'
      p = subprocess.run(command, shell=True, capture_output=True)
      if p.stderr:
        benchmark_error_message[file_path] = remove_solidity_file_names(extract_error(p.stderr.decode('utf-8')))
      elif p.returncode == -11:
        benchmark_error_message[file_path] = 'segfault'
      else:
        print(f'Error message: {p.stderr}')
        print(f'Stdout: {p.stdout}')
        print(f'Return code: {p.returncode}')
        sys.exit(1)
  # write the error messages to a json file
  save_json('./experiments/error_message.json', benchmark_error_message)

def analyze_csv():
  id2symptom_rootcause = {}
  with open('./ISSTA24-Solidity-Study/Solidity Compiler Bugs.csv', 'r') as file:
    reader = csv.reader(file)
    for row in reader:
      id2symptom_rootcause[row[9]] = (row[2], row[3])
  return id2symptom_rootcause

def larger_than(x, y):
  x = x.split('.')
  y = y.split('.')
  for i in range(3):
    if (int(x[i]) > int(y[i])):
      return True
    elif (int(x[i]) < int(y[i])):
      return False
  return False

def smaller_than(x, y):
  x = x.split('.')
  y = y.split('.')
  for i in range(3):
    if (int(x[i]) < int(y[i])):
      return True
    elif (int(x[i]) > int(y[i])):
      return False
  return False

def load_json(file_path):
  if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
    with open(file_path, 'r') as f:
      try:
        return json.load(f)
      except json.JSONDecodeError:
        return {}
  return {}

def save_json(file_path, data):
  with open(file_path, 'w') as f:
    json.dump(data, f, indent=2)

def compare_strings(s1, s2):
  def match(str1, pattern):
    if not pattern:
      return not str1
    if not str1 and pattern != '#':
      return False
    if pattern[0] == '#':
      return match(str1, pattern[1:]) or (str1 and match(str1[1:], pattern))
    return str1 and str1[0] == pattern[0] and match(str1[1:], pattern[1:])
  return match(s1, s2)

def contains(s1, ss):
  for s2 in ss:
    if compare_strings(s1, s2):
      return True
  return False

if __name__ == "__main__":
  if sys.platform != 'linux':
    print("This script is only supported on Linux.")
    sys.exit(1)
  install_benchmark()
  benchmark_error_message = load_json('./experiments/error_message.json')
  time_limit = 20*24*3600
  time_budget = time_limit
  path = './ISSTA24-Solidity-Study/benchmark'
  bugs_error_message = defaultdict(set)
  if not os.path.exists('./experiments/test_programs'):
    os.makedirs('./experiments/test_programs')
  bugs_file = './experiments/test_programs/bugs.json'
  if not os.path.exists(bugs_file):
    with open(bugs_file, 'w') as f:
      f.write('')
  bugs_data = load_json(bugs_file)
  for version in bugs_data:
    for bug in bugs_data[version]:
      bugs_error_message[version].add(bugs_data[version][bug])
  while time_budget > 0:
    time_budget -= generate()
    for version in os.listdir(path):
      bugs = dict()
      other_bugs = dict()
      solc_path = os.path.join(path, version, 'solc-static-linux')
      vals = []
      for file in os.listdir(os.path.join(path, version)):
        if file == 'solc-static-linux':
          continue
        file_path = os.path.join(path, version, file)
        if file_path in benchmark_error_message and version in file_path:
          vals.append(benchmark_error_message[file_path])
      for sol_file in glob.glob(os.path.join('./generated_programs', '*.sol')):
        err, out, returncode = compile(solc_path, sol_file)
        if returncode == -11:
          sol_file_name = sol_file.split('/')[-1]
          record = False
          if 'segfault' in vals and 'segfault' not in bugs_error_message[version]:
            bugs[sol_file_name] = 'segfault'
            bugs_error_message[version].add('segfault')  
            record = True
          if record:
            if not os.path.exists(f'./experiments/test_programs/{version}'):
              os.makedirs(f'./experiments/test_programs/{version}')
            shutil.move(sol_file, f'./experiments/test_programs/{version}/{sol_file_name}')
        elif err:
          sol_file_name = sol_file.split('/')[-1]
          record = False
          if contains(err, vals) and err not in bugs_error_message[version]:
            bugs[sol_file_name] = err
            bugs_error_message[version].add(err)
            record = True
          if record:
            if not os.path.exists(f'./experiments/test_programs/{version}'):
              os.makedirs(f'./experiments/test_programs/{version}')
            shutil.move(sol_file, f'./experiments/test_programs/{version}/{sol_file_name}')
      if version not in bugs_data:
        bugs_data[version] = {}
      bugs_data[version].update(bugs)
      save_json(bugs_file, bugs_data)
    print(f'Time left: {time_budget} seconds')