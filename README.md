<p align="center">
<img src="https://raw.githubusercontent.com/haoyang9804/haoyang9804.github.io/master/Erwin_icon.png" alt="erwin" width="200"/>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@__haoyang__/erwin">
    <img alt="NPM Version" src="https://img.shields.io/npm/v/%40__haoyang__%2Ferwin">
  </a>
  <img alt="NPM License" src="https://img.shields.io/npm/l/%40__haoyang__%2Ferwin">
  <a href="https://haoyang9804.github.io/Erwin">
    <img alt="Static Badge" src="https://img.shields.io/badge/Erwin-doc-pink">
  </a>
  <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/haoyang9804/Erwin/npm.yml">
</p>


***Erwin*** is an academic attempt on introducing `bounded exhaustive instantiation` in random program generator to mitigate opportunism.
Different from [Csmith](https://github.com/csmith-project/csmith)-family tools that generate a test program in one go, ***Erwin*** separates the generation process into two sub-steps: 1) randomly generate a type/loc/vis-agnostic IR (i.e., a program without type, storage location, and visibility), and 2) conducts bounded exhaustive instantiation to instantiate the IR into a swarm of real-word test programs.
By masking out bug-related langauge features, such as type, storage location, and visibility in the IR, ***Erwin*** shrinks the search space into a highly bug-related subspace. This way, ***Erwin*** reduce opportunism in random program generations.

***Erwin*** is still under development, any suggestion and collaboration is welcomed.

## How to play it?

The simplest way is `npm install @__haoyang__/erwin` it and `npx erwin generate` with different generation flags. `npx erwin generate` is the trivial generation, in which ***Erwin*** will not explore the search space of the IR, but perform just like Csmith, generate a test program in one go.

To utilize ***Erwin***'s features in program generation, you can use `-m` to specify the bug-related features you want to mask in the IR, and use `-max` to specify the maximum test programs you want to instantiation from the generated IR.

To directly use ***Erwin*** to fuzz the Solidity compiler, you can invoke `--enable_test`.

Below is an example command to fuzz the Solidity compiler:

```
npx erwin generate -m type -d  --enable_test --compiler_path=../solidity/build/solc/solc --refresh_folder --generation_rounds 10000 -max 100
```

For more flags, please refer to `npx erwin generation -h`.

## Detected Bugs

1. https://github.com/ethereum/solidity/issues/14719 (medium impact, confirmed, fixed, type) ✅
2. https://github.com/ethereum/solidity/issues/14720 (duplicate of 14719) 🤡
3. https://github.com/ethereum/solidity/issues/15223 (error handling) ✅
4. https://github.com/ethereum/solidity/issues/15236 (a probable duplicate, confirmed, fixed, type) ✅🤡
5. https://github.com/ethereum/solidity/issues/15219 (low effort, low impact, confirmed) ✅
6. https://github.com/ethereum/solidity/issues/15468 (low effort, low impact, confirmed, a probable duplicate) ✅🤡
7. https://github.com/ethereum/solidity/issues/15469 (smt) ✅
8. https://github.com/ethereum/solidity/issues/15469 (smt, two bugs in a thread) ✅
9. https://github.com/ethereum/solidity/issues/15483 (not a bug, but a workaround)
10. https://github.com/ethereum/solidity/issues/15525 (documentation error, workaround) ✅
11. https://github.com/ethereum/solidity/issues/15483 (documentation error) ✅
12. https://github.com/ethereum/solidity/issues/15565 (error handling)
13. https://github.com/ethereum/solidity/issues/15564 (error handling)
14. https://github.com/ethereum/solidity/issues/15567 (error handling)
15. https://github.com/ethereum/solidity/pull/15566 (documentation error)
16. https://github.com/ethereum/solidity/issues/15583 (error handling,low effort low impact must have eventually should report better error) ✅
17. https://github.com/ethereum/solidity/issues/15645 (ICE, duplicate) 🤡
18. https://github.com/ethereum/solidity/issues/15646 (error handling) ✅
19. https://github.com/ethereum/solidity/issues/15647 (ICE, smt) ✅
20. https://github.com/ethereum/solidity/issues/15649 (ICE)
21. https://github.com/ethereum/solidity/issues/15651 (ICE)
22. https://github.com/crytic/slither/issues/2619 (hang)

## Weird Language Features

Besides bugs, ***Erwin*** only plays a role of examining the design of language features. Until now, ***Erwin*** has found the following features that may be confusing to Solidity users.

1. Solidity has a weird type inference on `int_const`, `int`, and `uint`. Many intuitive operations on int literals and (u)int variables are forbidden.
   ```solidity
    int8 var21;
    false ? var21 : 62;
   ```
   The second line raises an type error:  `TypeError: True expression's type int8 does not match false expression's type uint8.`.

## TODO

- [ ] Support byte and bytes (similar to array).
- [ ] Support contract inheritance.
- [ ] support global constant variable, functions, and structs
- [ ] support variable shallowing
- [ ] support function type
- [ ] Support inline assembly.
- [ ] Mutate Solidity programs.