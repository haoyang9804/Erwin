import subprocess
import time

command = "npx erwin -d -fc 1 -pcf 1 -rcf 0 -bscf 3"

while True:
    process = subprocess.Popen(command, shell=True)
    process.wait()  # Wait for the process to finish
    print(process.returncode)
    time.sleep(1)
    # if process.returncode != 0:
    #     # Command executed successfully
    #     break