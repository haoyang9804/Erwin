#!/bin/bash

# Prompt the user to enter the path to solc
# read -p "Enter the path to solc: " solc_path
solc_path="../solidity/build/solc/solc"

# Check if the provided path exists and is executable
if [ ! -x "$solc_path" ]; then
    echo "Error: The provided path '$solc_path' is not a valid executable."
    exit 1
fi

# Function to test the validity of generated programs
test_validity() {
    if [ ! -d "generated_programs" ]; then
        return 2
    fi

    for file in generated_programs/*; do
        if [ -f "$file" ]; then
            # Run solc on the file and capture the output and error
            output=$( "$solc_path" "$file" 2>&1 )
            return_code=$?

            if [ $return_code -ne 0 ]; then
                echo "=========Error in file $file========="
                echo "$output"
                return 1
            fi
        fi
    done
    return 0
}

init() {
    rm -rf generated_programs
}

# Generate complicated program, full of structs, arrays, mappings
command1() {
    # Check if both arguments are provided
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "Error: Missing arguments. Usage: command1 <loc|type|scope> <number>"
        return 1
    fi

    # Validate the first argument
    if [[ "$1" != "loc" && "$1" != "type" && "$1" != "scope" ]]; then
        echo "Error: Invalid first argument '$1'. Accepted values are loc, type, or scope."
        return 1
    fi

    # Validate the second argument (check if it's a number)
    if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: Invalid second argument '$2'. It must be a number."
        return 1
    fi
    output_dir="${3:-generated_programs}"
    NODE_OPTIONS="--max-old-space-size=8192" npx erwin generate -d -m "$1" --maximum_solution_count "$2" --type_complexity_level 2 --statement_complexity__level 2 --expression_complexity_level 2 -o "$output_dir" > log.txt
}

# Generate complicated program without compound types such as arrays and mappings
command2() {
    # Check if both arguments are provided
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "Error: Missing arguments. Usage: command1 <loc|type|scope> <number>"
        return 1
    fi

    # Validate the first argument
    if [[ "$1" != "loc" && "$1" != "type" && "$1" != "scope" ]]; then
        echo "Error: Invalid first argument '$1'. Accepted values are loc, type, or scope."
        return 1
    fi

    # Validate the second argument (check if it's a number)
    if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: Invalid second argument '$2'. It must be a number."
        return 1
    fi
    output_dir="${3:-generated_programs}"
    NODE_OPTIONS="--max-old-space-size=8192" npx erwin generate -d -m "$1" --maximum_solution_count "$2" --type_complexity_level 0 --statement_complexity__level 2 --expression_complexity_level 2 -o "$output_dir" > log.txt
}

test() {
    cnt=0
    while true; do
        init
        command2 type 1
        exit_status=$?
        # Check if the command crashed (non-zero exit status)
        if [ $exit_status -ne 0 ]; then
            echo "> Command crashed with exit status: $exit_status"
            break
        fi
        test_validity
        return_code=$?
        if [ $return_code -eq 0 ]; then
            echo "All files are valid."
        elif [ $return_code -eq 1 ]; then
            echo "There exist invalid files."
            break
        else
            echo "No file is generated."
            break
        fi
        cnt=$((cnt+1))
        echo "Round $cnt is done."
    done
    echo "In total, successfully passed $cnt rounds."
}

generate() {
    if [ -z "$1" ]; then
        echo "Error: Missing argument. Usage: generate <number>"
        return 1
    fi
    # Validate the argument (check if it's a number)
    if ! [[ "$1" =~ ^[0-9]+$ ]]; then
        echo "Error: Invalid argument '$1'. It must be a number."
        return 1
    fi
    cnt=0
    while true; do
        command1 type 1
        cnt=$((cnt+1))
        if [ $cnt -eq $1 ]; then
            break
        fi
    done
    
}

# generate 1
test

