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
  <img alt="NPM Downloads" src="https://img.shields.io/npm/d18m/%40__haoyang__%2Ferwin">
</p>


***Erwin*** is an academic attempt on introducing `bounded exhaustive instantiation` in random program generator to mitigate opportunism. This effort is inspired by [![arXiv](https://img.shields.io/badge/arXiv-2407.05981-b31b1b.svg?style=flat-square)](https://arxiv.org/abs/2407.05981).

Different from [Csmith](https://github.com/csmith-project/csmith)-family tools that generate a test program in one go, ***Erwin*** separates the generation process into two sub-steps: 1) randomly generate a type/loc/scope-agnostic IR (i.e., a program without type, storage location, and scope), and 2) conducts bounded exhaustive instantiation to instantiate the IR into a swarm of real-word test programs.
By masking out bug-related langauge features, such as type, storage location, and scope in the IR, ***Erwin*** shrinks the search space into a highly bug-related subspace. This way, ***Erwin*** reduce opportunism in random program generations.

***Erwin*** is still under development, any suggestion and collaboration is welcomed.

## Install Erwin

### Install through NPM

```
npm install @__haoyang__/erwin
```

### Install through Git

```
git install git@github.com:haoyang9804/Erwin.git
cd Erwin
npm install
npm run build
```

## Run Erwin

If you install Erwin through NPM, the `erwin` executable is in `node_modules/.bin`, add it to your PATH, and directly call `erwin`.
If you install Erwin through Git, go into the folder and type `npx erwin`.

### Use Erwin as a Solidity program generator.

Erwin support various flags to tune the probability distribution of all language features (e.g., `literal_prob`), control the program size (e.g., `function_body_stmt_cnt_upper_limit`), change the generation mode (e.g, `-m`), regulate the upperlimit of the amount of the test programs generated from the IR (e.g., `-max`), etc.

`npx erwin generate` is the trivial generation that generates a test program in a generation round, just like Csmith.

To enable the `bounded exhaustive instantiation` feature, use `-m` to specify the a class of language features you want to exhausitively instantiate from the IR, including `type`, `loc`ation, and `scope`. `-max` helps control the upperlimit of the instantiation.

Since different compilers (Solidity, Solang, Solar) define slightly different Solidity grammar, you can use `--target` to specify the "accent" of Solidity you want to generate. It defaults to solidity.

Below is an example for generating Solidity programs of solang "accent".

```
npx erwin generate -m type -max 100 --target solang
```

The generated programs are stored in `generated_programs`, you can change it by `-o`.

### Use Erwin as a generation-based fuzzer.

Erwin integrates four distinct automated testing workflows, each designed to target a specific software tool: the [Solidity](https://github.com/ethereum/solidity), [Solang](https://github.com/hyperledger-solang/solang), [Solar](https://github.com/paradigmxyz/solar), and [Slither](https://github.com/crytic/slither). The first three are compilers for Solidity programs while the last is a static analyzer of Solidity.

Below is an example for enable the testing workflow for Solidity.

```
npx erwin generate --target solc -m scope --enable_test --compiler_path solc  --refresh_folder --generation_rounds 1000 -max 100
```

Misbehavior-triggering test programs will be moved to `test_results`.

## Detected Bugs

1. https://github.com/ethereum/solidity/issues/14719 (medium impact, confirmed, fixed, type) ✅
2. https://github.com/ethereum/solidity/issues/14720 (duplicate of 14719) 🤡
3. https://github.com/ethereum/solidity/issues/15223 (error handling) ✅
4. https://github.com/ethereum/solidity/issues/15236 (a probable duplicate, confirmed, fixed, type) ✅🤡
5. https://github.com/ethereum/solidity/issues/15219 (low effort, low impact, confirmed) ✅
6. https://github.com/ethereum/solidity/issues/15468 (low effort, low impact, confirmed, a probable duplicate) ✅🤡
7. https://github.com/ethereum/solidity/issues/15469 (smt) ✅
8. https://github.com/ethereum/solidity/issues/15469 (smt, two bugs in a thread) ✅
9. https://github.com/ethereum/solidity/issues/15483
10. https://github.com/ethereum/solidity/issues/15525 (documentation error) ✅
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
23. https://github.com/hyperledger-solang/solang/issues/1687 (ICE)
24. https://github.com/hyperledger-solang/solang/issues/1688 (error handling)
25. https://github.com/hyperledger-solang/solang/issues/1689 (ICE)
26. https://github.com/hyperledger-solang/solang/issues/1690 (ICE)


## TODO

- 🔨 Support Solar testing workflow
- 🔨 Support fixed
- 🔨 Support .push .pop for arrays
- 🔨 Support byte
- 🔨 Support type definition (for instance, `type T is bool;`)
- 🔨 Support enum type
- 🔨 Support assertion
- 🔨 Support using for
- 🔨 Support inherent keywords, such as `msg.sender`, `abi.encode`, etc
- 🔨 Support bytes
- 🔨 Support contract inheritance
- 🔨 Support global constant variable, functions, and structs
- 🔨 Support variable shallowing
- 🔨 Support function type
- 🔨 Support inline assembly
- 🔨 Support try catch
- 🔨 Mutate Solidity programs