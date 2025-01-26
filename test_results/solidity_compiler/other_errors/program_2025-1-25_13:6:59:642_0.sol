/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-25_13:6:59:642_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-25_13:6:59:642_0.sol

Error: Type literal_string "uAfGV" is not implicitly convertible to expected type string calldata.
  --> generated_programs/program_2025-1-25_13:6:59:642_0.sol:21:10:
   |
21 |     for (string calldata var22 = ("uAfGV"); (array10[var23] < (array8[array10[uint8(2)]])); (array8[var23]) - array6[(uint8(3))]) {
   |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  event event1();

  struct struct2 {
    string var3;
  }

  uint8[6] internal array10;
  uint8[6] internal array8 = array10;
  uint8[6] internal array6 = array8;
  uint8[6] internal array4 = array6;

  modifier modifier16(mapping(int256 => int256) storage mapping17) {
    bool var20;
    while (var20) {}
    _;
  }

  modifier modifier21() {
    uint8 var23 = uint8(135);
    for (string calldata var22 = ("uAfGV"); (array10[var23] < (array8[array10[uint8(2)]])); (array8[var23]) - array6[(uint8(3))]) {
      (array8[array10[uint8(1)]] ^= (uint8(239)));
    }
    _;
  }

  function func24(string calldata var25) internal modifier21() returns (int256 var26) {
    bool var27 = true;
    while (!var27) {}
  }
}

contract contract28 {
  error error29();

  mapping(string => string) internal mapping30;
  mapping(int256 => int256[10]) internal mapping33;

  modifier modifier38() {
    bool var40 = bool(true);
    bool var39 = var40;
    var39 ? var40 : (var40);
    _;
  }

  function func41() internal modifier38() modifier38() returns (mapping(int256 => mapping(int256 => int256)) storage mapping42) {
    mapping42 = mapping42;
    revert error29();
  }
}