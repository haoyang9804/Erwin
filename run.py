import subprocess

command = "npx erwin -d -fc 1 -pcf 1 -rcf 0 -bscf 2"

while True:
  p = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  stdout, stderr = p.communicate()
  # if p.returncode != 0 or 'Error: resolve_nonheads_and_nontails: solution_candidates' in stdout.decode('utf-8'):
  if p.returncode != 0 or 'Error:' in stdout.decode('utf-8'):
    print('>>> stdout')
    print(stdout.decode('utf-8'))
    print('>>> stderr')
    print(stderr.decode('utf-8'))
    print('>>> returncode')
    print(p.returncode)
    break