<p align="center">
<img src="Erwin_icon.png" alt="erwin" width="200"/>
</p>

:blush: Erwin is an academic attempt on introducing bounded exhaustive enumeration in random program generator to mitigate opportunism.

:smiling_imp: Erwin can generate Solidity programs by first generating an IR (an intermediate representation with a lot of holes that are ready to be filled) and then exhaustively enumerate all valid programs inside the search space formed by the IR.

:innocent: Erwin is still under development, any suggestion and collaboration is welcomed.

## How to play it?

The simplest way is `npm install` it and `npx erwin generate` with different generation flags. `npx erwin generate` is the trivial generation, in which Erwin will not explore the search space of the IR, but instead randomly pick one valid program from the space and finish the generation round.

Erwin supports exploring type spaces, storage location spaces, state mutability spaces, and visibility spaces. To invoke them, you need to use the flag `-m` to activate nontrivial modes. Please refer the general flags to learn how to use flags.

## General Flags

As planned, Erwin can both generate and mutate. But up to now, all efforts have been made on generation. Below are flags supported by `erwin generate`.
Enjoy tuning the search space and generate diverse and valid Solidity programs.

```
  -e --exprimental                                    Enable the exprimental mode.
  -m --mode <string>                                  The mode of Erwin. The value can be 'type', 'scope', or 'loc'. (default: "")
  -d --debug                                          Enable the debug mode.
  -o --out_dir <string>                               The output directory for the generated program. The default is 'generated_programs' (default:
                                                      "./generated_programs")
  -max --maximum_solution_count <number>              The maximum number of solutions Erwin will consider. (default: "500")
  --int_types_num <number>                            The number of int types Erwin will consider in resolving type dominance. (default: "2")
  --uint_types_num <number>                           The number of uint types Erwin will consider in resolving type dominance. (default: "2")
  --function_body_stmt_cnt_upper_limit <number>       The upper limit of the number of non-declaration statements of a function. This value is suggested to be
                                                      bigger than tha value of var_count (default: "1")
  --function_body_stmt_cnt_lower_limit <number>       The lower limit of the number of non-declaration statements of a function. (default: "1")
  --return_count_of_function_upperlimit <number>      The upper limit of the number of return values of a function. (default: "2")
  --return_count_of_function_lowerlimit <number>      The lower limit of the number of return values of a function. (default: "0")
  --param_count_of_function_upperlimit <number>       The upper limit of the number of parameters of a function. (default: "1")
  --param_count_of_function_lowerlimit <number>       The lower limit of the number of parameters of a function. (default: "0")
  --function_count_per_contract_upper_limit <number>  The upper limit of the number of functions in a contract. (default: "2")
  --function_count_per_contract_lower_limit <number>  The lower limit of the number of functions in a contract. (default: "1")
  --struct_member_variable_count_upperlimit <number>  The upper limit of the number of member variables in a struct. (default: "2")
  --struct_member_variable_count_lowerlimit <number>  The lower limit of the number of member variables in a struct. (default: "1")
  --contract_count <number>                           The upper limit of the number of contracts Erwin will generate. (default: "2")
  --state_variable_count_upperlimit <number>          The upper limit of the number of state variables in a contract. (default: "2")
  --state_variable_count_lowerlimit <number>          The lower limit of the number of state variables in a contract. (default: "1")
  --array_length_upperlimit <number>                  The upper limit of the length of an array. (default: "10")
  --for_init_cnt_upper_limit <number>                 The upper limit of the number of initialization in a for loop. (default: "1")
  --for_init_cnt_lower_limit <number>                 The lower limit of the number of initialization in a for loop. (default: "0")
  --for_body_stmt_cnt_upper_limit <number>            The upper limit of the number of statements in the body of a for loop. (default: "1")
  --for_body_stmt_cnt_lower_limit <number>            The lower limit of the number of statements in the body of a for loop. (default: "0")
  --while_body_stmt_cnt_upper_limit <number>          The upper limit of the number of statements in the body of a while loop. (default: "1")
  --while_body_stmt_cnt_lower_limit <number>          The lower limit of the number of statements in the body of a while loop. (default: "0")
  --do_while_body_stmt_cnt_upper_limit <number>       The upper limit of the number of statements in the body of a do while loop. (default: "1")
  --do_while_body_stmt_cnt_lower_limit <number>       The lower limit of the number of statements in the body of a do while loop. (default: "0")
  --if_body_stmt_cnt_upper_limit <number>             The upper limit of the number of statements in the body of an if statement. (default: "1")
  --if_body_stmt_cnt_lower_limit <number>             The lower limit of the number of statements in the body of an if statement. (default: "0")
  --expression_complexity_level <number>              The complexity level of the expression Erwin will generate.
                                                      The suggedted range is [1,2,3]. The bigger, the more complex. (default: "1")
  --statement_complexity__level <number>              The complexity level of the statement Erwin will generate.
                                                      The suggedted range is [1,2]. The bigger, the more complex. (default: "1")
  --type_complexity_level <number>                    The complexity level of the type Erwin will generate.
                                                      The suggedted range is [1,2]. The bigger, the more complex. (default: "1")
  --nonstructured_statement_prob <float>              The probability of generating a nonstructured statement, such as AssignmentStatment or
                                                      FunctionCallAssignment. (default: "0.5")
  --expression_complexity_prob <float>                The probability of generating a complex expression. (default: "0.8")
  --literal_prob <float>                              The probability of generating a literal. (default: "0.05")
  --tuple_prob <float>                                The probability of generating a tuple surrounding an expression. (default: "0.3")
  --vardecl_prob <float>                              The probability of generating a variable declaration. (default: "0")
  --new_prob <float>                                  The probability of generating a variable declaration in place. (default: "0.1")
  --else_prob <float>                                 The probability of generating an else statement. (default: "0.3")
  --init_state_var_in_constructor_prob <float>        The probability of initializing a state variable in the constructor. (default: "0.3")
  --struct_prob <float>                               The probability of generating a struct. (default: "0.5")
  --contract_type_prob <float>                    The probability of generating a contract instance. (default: "0.1")
  --struct_type_prob <float>                      The probability of generating a struct instance. (default: "0.1")
  --initialization_prob <float>                       The probability of generating an initialization statement. (default: "0.3")
  --constructor_prob <float>                          The probability of generating a constructor. (default: "0.5")
  --return_prob <float>                               The probability of generating a return statement. (default: "0.5")
  --reuse_name_prob <float>                           The probability of reusing a name. (default: "0")
  --mapping_type_prob <float>                              The probability of generating a mapping. (default: "0.1")
  --array_type_prob <float>                                The probability of generating an array. (default: "0.1")
  --dynamic_array_prob <float>                        The probability of generating a dynamic array. (default: "0.5")
```


## Detected Bugs

1. https://github.com/ethereum/solidity/issues/14719 (medium impact, confirmed, fixed, type) ✅
2. https://github.com/ethereum/solidity/issues/14720 (duplicate of 14719)
3. https://github.com/ethereum/solidity/issues/15223 (error handling) ✅
4. https://github.com/ethereum/solidity/issues/15236 (a probable duplicate, confirmed, fixed, type) ✅❌
5. https://github.com/ethereum/solidity/issues/15219 (low effort, low impact, confirmed) ✅
6. https://github.com/ethereum/solidity/issues/15468 (low effort, low impact, confirmed, a probable duplicate) ✅
7. https://github.com/ethereum/solidity/issues/15469 (smt) ✅
8. https://github.com/ethereum/solidity/issues/15469 (smt, two bugs in a thread) ✅
9. https://github.com/ethereum/solidity/issues/15483 (not a bug, but a workaround)
10. https://github.com/ethereum/solidity/issues/15525 (documentation error, workaround) ✅
11. https://github.com/ethereum/solidity/issues/15483 (documentation error) ✅
12. https://github.com/ethereum/solidity/issues/15565 (wait for confirmation, error handling)
13. https://github.com/ethereum/solidity/issues/15564 (wait for confirmation, error handling)
14. https://github.com/ethereum/solidity/issues/15567 (wait for comfirmation, error handling)
15. https://github.com/ethereum/solidity/pull/15566 (wait for confirmation, documentation error)
16. https://github.com/ethereum/solidity/issues/15583 (wait for confirmation)

## Weird Language Features

Besides bugs, Erwin only plays a role of examining the design of language features. Until now, Erwin has found the following features that may be confusing to Solidity users.

1. Solidity has a weird type inference on `int_const`, `int`, and `uint`. Many intuitive operations on int literals and (u)int variables are forbidden.
   ```solidity
    int8 var21;
    false ? var21 : 62;
   ```
   The second line raises an type error:  `TypeError: True expression's type int8 does not match false expression's type uint8.`.

## TODO

- [ ] :hammer: Rebuild getter function generations.
- [ ] :hammer: Finish test script that test all compilation flags.
- [ ] :hammer: When generating identifiers, Erwin currently collects vardecls from variable declarations. But some available vardecls may hide in mappings/arrays/struct instances returned by functions. Consider them also.
- [ ] :hammer: Support strings.
- [ ] :hammer: Support byte and bytes (similar to array).
- [ ] :hammer: Support Event and Error.
- [ ] :hammer: Support contract inheritance.