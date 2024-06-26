import subprocess

command = "npx erwin -d -fc 1"

while True:
  p = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  stdout, stderr = p.communicate()
  print(stdout.decode('utf-8'))
  print(stderr.decode('utf-8'))
  if p.returncode != 0 or 'Error:' in stdout.decode('utf-8'):
    break