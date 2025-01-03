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

def install_benchmark():
  print("Installing benchmark")
  # Clone the repository https://github.com/haoyang9804/ISSTA24-Solidity-Study
  repo_url = "https://github.com/haoyang9804/ISSTA24-Solidity-Study.git"
  clone_dir = "ISSTA24-Solidity-Study"
  
  try:
    # Check if the directory already exists
    if os.path.exists(clone_dir):
      print(f"The directory '{clone_dir}' already exists. Updating instead of cloning.")
      # If it exists, pull the latest changes
      subprocess.run(["git", "-C", clone_dir, "pull"], check=True)
    else:
      # If it doesn't exist, clone the repository
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

def compile(solc_path, sol_file):
  heads = [
    'pragma experimental ABIEncoderV2;',
    'pragma experimental SMTChecker;'
  ]
  # add headers to the solidity file
  with open(sol_file, 'r') as original: data = original.read()
  with open(sol_file, 'w') as modified: modified.write('\n'.join(heads) + '\n' + data)
  compile_command = f'{solc_path} {sol_file}'
  print(Fore.GREEN + f'compiler_command: {compile_command}')
  try:
    p = subprocess.run(compile_command, shell=True, capture_output=True)
    return p.stderr, p.stdout, p.returncode
  except subprocess.CalledProcessError as e:
    print(f"Error occurred: {e}")
    sys.exit(1)

def generate(noconstructor):
  suffix = ' --error_prob 0.0'
  if noconstructor:
    suffix += ' --constructor_prob 0.0'
  else:
    suffix += ' --constructor_prob 1.0'
  command = f'{np.random.choice(commands)} -max 100 --generation_rounds 1 --refresh_folder {" ".join(optional_command_suffix())} {suffix}'
  print(Fore.CYAN + f"Erwin command: {command}")
  while True:
    try:
      start = time.time()
      subprocess.run(command, shell=True, capture_output=True)
      end = time.time()
      return end - start
    except subprocess.CalledProcessError as e:
      print(f"Error occurred: {e}")
      continue

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
      print(command)
      p = subprocess.run(command, shell=True, capture_output=True)
      if p.stderr:
        benchmark_error_message[file_path] = p.stderr.decode('utf-8')
      elif p.returncode == -11:
        benchmark_error_message[file_path] = 'segfault'
      else:
        print(f'Error message: {p.stderr}')
        print(f'Stdout: {p.stdout}')
        print(f'Return code: {p.returncode}')
        sys.exit(1)
  print(benchmark_error_message)

def analyze_csv():
  id2symptom_rootcause = {}
  with open('./ISSTA24-Solidity-Study/Solidity Compiler Bugs.csv', 'r') as file:
    # Create a CSV reader object
    reader = csv.reader(file)
    # Iterate over each row in the CSV file
    for row in reader:
      # Access the data in each column of the row
      id2symptom_rootcause[row[9]] = (row[2], row[3])
  return id2symptom_rootcause

id2symptom_rootcause = analyze_csv()

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

# Example usage
if __name__ == "__main__":
  if sys.platform != 'linux':
    print("This script is only supported on Linux.")
    sys.exit(1)
  install_benchmark()
  collect_error_message()
  analyze_csv()
  time_limit = 20*24*3600
  time_budget = time_limit
  path = './ISSTA24-Solidity-Study/benchmark'
  bugs = defaultdict(lambda: defaultdict(str))
  other_bugs = defaultdict(lambda: defaultdict(str))
  if not os.path.exists('./experiments/test_programs'):
    os.makedirs('./experiments/test_programs')
  f = open('./experiments/test_programs/bugs.csv', 'w')
  g = open('./experiments/test_programs/other_bugs.csv', 'w')

  while time_budget > 0:
    no_constructor = np.random.choice([True, False])
    time_budget -= generate(no_constructor)
    for version in os.listdir(path):
      if not no_constructor and smaller_than(version, '0.5.0'):
        continue
      solc_path = os.path.join(path, version, 'solc-static-linux')
      vals = []
      for file in os.listdir(os.path.join(path, version)):
        if file == 'solc-static-linux':
          continue
        file_path = os.path.join(path, version, file)
        vals.append(benchmark_error_message[file_path])
      for sol_file in glob.glob(os.path.join('./generated_programs', '*.sol')):
        err, out, returncode = compile(solc_path, sol_file)
        if returncode == -11:
          sol_file_name = sol_file.split('/')[-1]
          if 'segfault' not in vals:
            other_bugs[version][sol_file_name] = 'segfault'
          else:
            bugs[version][sol_file_name] = 'file'  
          if os.path.exists(f'./experiments/test_programs/{version}'):
            os.makedirs(f'./experiments/test_programs/{version}')
          os.rename(sol_file, f'./experiments/test_programs/{version}/{sol_file_name}')
        elif err:
          sol_file_name = sol_file.split('/')[-1]
          if err in vals:
            bugs[version][sol_file_name] = err
          else:
            other_bugs[version][sol_file_name] = err
          if not os.path.exists(f'./experiments/test_programs/{version}'):
            os.makedirs(f'./experiments/test_programs/{version}')
          shutil.move(sol_file, f'./experiments/test_programs/{version}/{sol_file_name}')
    # Save bugs to bugs.csv
    for version in bugs:
      for sol_file_name in bugs[version]:
        f.write(f'{version},{sol_file_name},{bugs[version][sol_file_name]}\n')
    for version in other_bugs:
      for sol_file_name in other_bugs[version]:
        g.write(f'{version},{sol_file_name},{other_bugs[version][sol_file_name]}\n')
    print(f'Time left: {time_budget} seconds')
  f.close()
  g.close()