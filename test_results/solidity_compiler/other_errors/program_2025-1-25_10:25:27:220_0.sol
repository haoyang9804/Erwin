/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-25_10:25:27:220_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-25_10:25:27:220_0.sol

Error: Return argument type struct contract9.struct10[] memory is not implicitly convertible to expected type (type of first return variable) struct contract9.struct10[] storage pointer.
  --> generated_programs/program_2025-1-25_10:25:27:220_0.sol:50:12:
   |
50 |     return ((array30 = array26));
   |            ^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  event event1();

  int64 internal var2;
  bool internal var3;

  modifier modifier4() {
    while ((var3 = bool(true))) {
      (var2 &= var2);
    }
    _;
  }

  function func5(int64 var6) internal modifier4() returns (int64 var7) {
    bool var8;
    do {} while((var8 = true));
  }
}

contract contract9 {
  struct struct10 {
    bool var11;
  }

  contract0 internal contract_instance12 = new contract0();
  struct10 internal struct_instance16 = (struct10(true));
  struct10 public struct_instance15 = struct_instance16;
  struct10 internal struct_instance14 = struct_instance15;
  struct10 internal struct_instance13 = struct_instance14;
  struct10[] internal array28;

  modifier modifier17() {
    int64 var18 = int64(-0);
    (var18 |= var18);
    _;
  }

  constructor(int64 var19) modifier17() modifier17() {
    while (true) {
      emit contract0.event1();
    }
  }

  function func20(mapping(string => int64) storage mapping21) internal returns (struct10[] storage array24) {
    array24 = array24;
    do {} while(this.struct_instance15());
    struct10[] memory array26 = array28;
    struct10[] memory array30;
    array30 = array30;
    return ((array30 = array26));
  }
}