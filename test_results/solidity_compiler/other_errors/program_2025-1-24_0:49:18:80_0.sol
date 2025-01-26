/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-24_0:49:18:80_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-24_0:49:18:80_0.sol

Error: Data location can only be specified for array, struct or mapping types, but "memory" was given.
  --> generated_programs/program_2025-1-24_0:49:18:80_0.sol:44:7:
   |
44 |       int16 memory var36 = var35;
   |       ^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  error error2();

  event event1();

  uint256[1][7] public array3;

  modifier modifier8() {
    uint256 var9;
    uint256 var10;
    uint256 var11 = uint256(36131884447434543366274945801150943597201944038870981863397485189444488209883);
    for ((bool(false) ? array3[5] : array3[3]); (var10 <= array3[(var9)][uint256(0)]); this.array3(var10, var11)) {
      int16 var12;
      int16 var13 = (int16(-1278));
      var13 % var12;
    }
    _;
  }

  constructor(int16 var14) {
    int16 var17;
    ((var17) /= int16(-4353));
  }

  function func15() internal pure returns (int16 var16) {
    int16 var18 = int16(-1997);
    ++var18;
    return (int16(-18230));
  }
}

contract contract19 {
  struct struct20 {
    mapping(int16 => int16) mapping21;
    mapping(int16 => string[4]) mapping24;
  }

  mapping(contract0 => bool[]) public mapping28;
  contract0 internal contract_instance41;

  modifier modifier33(string calldata var34) {
    int16 var35 = int16(-21886);
    for ((~var35); (var35 == var35); new contract0(var35)) {
      int16 memory var36 = var35;
      (var36 = int16(-31938));
    }
    _;
  }

  modifier modifier37(contract0 contract_instance38) {
    int16 var39;
    if (var39 == int16(-1188)) {
      revert contract0.error2();
    } else {
      (var39 += var39);
    }
    _;
  }

  constructor(int16 var40) modifier37(contract_instance41) {
    int16 var44 = int16(-16900);
    (~(var44));
  }

  function func42(int16 var43) internal modifier37(contract_instance41) {
    contract0 contract_instance45;
    while (this.mapping28(contract_instance45, 5444362060689412235806152256649724113874389896150331067174675693482574704167)) {}
  }
}