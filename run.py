import subprocess

command = "npx erwin -d -fc 2 -ec 3" # -pcf 1 -rcf 1 -bscf 1 -ec 2"

while True:
  p = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  stdout, stderr = p.communicate()
  print(stdout.decode('utf-8'))
  print(stderr.decode('utf-8'))
  if p.returncode != 0 or 'Error:' in stdout.decode('utf-8'):
    break