
***Erwin*** is an academic attempt on introducing `bounded exhaustive instantiation` in random program generator to mitigate opportunism.

Different from [Csmith](https://github.com/csmith-project/csmith)-family tools that generate a test program in one go, ***Erwin*** separates the generation process into two sub-steps: 1) randomly generate a type/loc/scope-agnostic IR (i.e., a program without type, storage location, and scope), and 2) conducts bounded exhaustive instantiation to instantiate the IR into a swarm of real-word test programs.
By masking out bug-related langauge features, such as type, storage location, and scope in the IR, ***Erwin*** shrinks the search space into a highly bug-related subspace. This way, ***Erwin*** reduce opportunism in random program generations.

***Erwin*** is still under development, any suggestion and collaboration is welcomed.

## Install Erwin

After downloading this repo, run the following commands:

```
cd Erwin
npm install
npm run build
```

The `npm install` may raise vulnerabilities due to version issue. In that case, run `npm audit fix` to fix them.

The installation has been tested workable on the following configurations:

1. Apple M2 macOS Sequoia version 15.5 node version v23.10.0

## Run Erwin

Please go into the folder and type `npx erwin generate`.

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

Since the GitHub Issue links might reveal authors' personal information and compromise the double-blind review process, we have chosen not to include bug links here. All links will be updated if the paper is accepted.

