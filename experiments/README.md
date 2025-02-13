# Workflow of Experiments

## Coverage Collection

Solidity compiler is written in C++. We use `llvm coverage tools` to collect compiler coverage reports.

1. Instrument the codebase by adding the following to cmake statements into cmake file.
   ```
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fprofile-instr-generate -fcoverage-mapping --coverage")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fprofile-instr-generate")
   ```
2. In CMaking the Solidity compiler, set clang/clang++ as C/C++ compiler by `-DCMAKE_C_COMPILER=` and `-DCMAKE_CXX_COMPILER=`

After instrumenting the compiler, run `Python experiments/coverage.py` in the root dir of Erwin.

<!-- 3. Coverage collection is exquisite and requires a lot of prerequisites to promise correct results. When conducting `experiment1` in `coverage.py`, make sure the Python script must be placed in the same directory as the Erwin repository and the repository is installed by `git clone` instead of `npm install`.  -->

## Bug Detection On the Solidity Bug Benchmark

`python experiments/benchmark.py`
