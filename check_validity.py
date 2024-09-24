import subprocess
import os

def test_validity():
  if not os.path.exists('generated_programs'):
    return
  for file in os.listdir('generated_programs'):
    file_path = os.path.join('./generated_programs', file)
    p = subprocess.run(f'solc {file_path}', shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode:
      print(f'Error in file {file_path}')
      print(p.stderr.decode('utf-8'))
      break
  
test_validity()