/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-23_16:36:49:209_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-23_16:36:49:209_0.sol

Error: Return argument type tuple(string storage ref,string[4] memory) is not implicitly convertible to expected type tuple(string memory,string[4] storage pointer).
  --> generated_programs/program_2025-1-23_16:36:49:209_0.sol:35:12:
   |
35 |     return (var4, ((bool(true)) ? array32 : array28));
   |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  struct struct1 {
    string var2;
    int256 var3;
  }

  string internal var4;
  struct1 internal struct_instance9;
  struct1 internal struct_instance8 = struct_instance9;
  int256 internal var14 = int256(-649398254157719434709245662926956771880352135315500004073);
  int256 public var13 = (var14);
  int256 internal var12 = (var13);
  int256 internal var11 = var12;
  int256 internal var10 = var11;
  bool internal var16 = (true);
  string[4] internal array32;
  string[4] internal array30 = (array32);
  mapping(int256 => int256) internal mapping36;

  modifier modifier5(bool var6) {
    struct1 memory struct_instance7 = struct1(struct_instance8.var2, var10);
    if ((var11 < struct_instance7.var3)) {} else {}
    _;
  }

  constructor(int256 var15) modifier5(var16) {
    var11 = var16 ? var11 : (var14);
  }

  function func17(int256[10] calldata array18) internal modifier5(false) modifier5(true) returns (string memory var20, string[4] storage array21) {
    var20 = var20;
    array21 = array21;
    this.var13();
    string[4] memory array28 = (array30);
    return (var4, ((bool(true)) ? array32 : array28));
  }

  function func23() internal modifier5(bool(false)) returns (mapping(int256 => int256) storage mapping24, int256 var27) {
    mapping24 = mapping24;
    while (!var16) {
      -var10;
    }
    return ((mapping36), -var13);
  }
}

contract contract39 {
  error error40();

  struct struct41 {
    contract0 contract_instance42;
    string var43;
  }

  mapping(int256 => struct41[8]) internal mapping44;
  mapping(int256 => int256)[] public array48;
  contract0.struct1 internal struct_instance60;
  contract0.struct1 internal struct_instance59 = struct_instance60;

  modifier modifier54() {
    bool var55;
    !var55;
    _;
  }

  modifier modifier56() {
    contract0.struct1 memory struct_instance57;
    struct_instance57 = struct_instance57;
    contract0.struct1 memory struct_instance58 = (struct_instance59);
    int256 var61;
    for (((struct_instance58.var3 += struct_instance57.var3)); var61 < int256(-2857203993208832082610289301756462124213772192265072392531); this.array48(10262814739042391685843144570320519332678339076587648968475540090317326605627, int256(-135167465660868227763285462558025108466512937578202284808))) {
      (--var61);
    }
    _;
  }

  constructor() modifier56() {
    contract0.struct1 memory struct_instance65;
    struct_instance65 = struct_instance65;
    ~struct_instance65.var3;
  }

  function func62() internal view modifier56() modifier56() returns (contract0 contract_instance63, int256 var64) {
    int256 var66;
    --var66;
  }
}