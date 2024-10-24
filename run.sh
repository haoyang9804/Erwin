#!/bin/bash

# Loop until the condition is met
while true; do
    # Run the command
    clear && rm -rf generated_programs && NODE_OPTIONS="--max-old-space-size=8192" npx erwin generate -d --struct_prob 1.0 --mapping_prob 1.0 -m type --maximum_solution_count 1 > log.txt

    # Check the last line of the log.txt
    last_line=$(tail -n 1 log.txt)

    # If the last line is "0 type solutions", break the loop
    if [[ "$last_line" == "0 type solutions" ]]; then
        echo "Termination condition met: $last_line"
        break
    fi
done
