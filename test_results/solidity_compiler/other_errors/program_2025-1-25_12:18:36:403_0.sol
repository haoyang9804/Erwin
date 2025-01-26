/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-25_12:18:36:403_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-25_12:18:36:403_0.sol

Error: Type struct contract0.struct4 memory is not implicitly convertible to expected type struct contract0.struct4 storage pointer.
  --> generated_programs/program_2025-1-25_12:18:36:403_0.sol:89:5:
   |
89 |     contract0.struct4 storage struct_instance79 = contract0.struct4(array80);
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  error error1(int128[4] array2);

  struct struct4 {
    string[] array5;
  }

  struct struct7 {
    bool var8;
  }

  struct7 internal struct_instance9;
  struct7 internal struct_instance12;
  struct7 internal struct_instance11 = struct_instance12;
  bool internal var10 = (struct_instance11.var8);
  int128[][8] internal array50;
  int128[][8] internal array47 = array50;

  modifier modifier13(struct7 memory struct_instance14) {
    struct7 memory struct_instance15;
    struct_instance15 = struct_instance15;
    while (((struct_instance15.var8) = bool(false))) {
      int128[4] memory array16;
      array16 = array16;
      revert contract0.error1(array16);
    }
    _;
  }

  modifier modifier18(string[] storage array19) {
    int128 var23;
    int128 var22 = var23;
    int128 var24 = int128(-7230235135878775942);
    for (int128 var21 = (int128(-8216341721492177867)); (var24 >= var22); struct_instance12) {
      int128 var25;
      ((var25) = int128(-5077847451333115456));
    }
    _;
  }

  function func26(int128 var27) internal modifier13(struct_instance12) returns (int128[] memory array28, uint128 var30) {
    array28 = array28;
    int128[4] memory array37;
    array37 = array37;
    revert error1(array37);
    int128[] memory array39;
    array39 = array39;
    uint128 var42;
    uint128 var41 = var42;
    return ((array39), ((var42) << var41));
  }

  function func31(int128 var32) external view returns (int128[][8] memory array33, bool var36) {
    array33 = array33;
    int128 var43;
    ((int128(-5145969135284795213)) * var43);
    int128[][8] memory array44 = (array47);
    ((array44), ) = this.func31(int128(-8088349464609033591));
    int128 var53 = array47[4][uint128(164695836329725127056926824865614956700)];
    return ((array44), (var53) < array50[(2)][108320086007368061245999302184526113665]);
  }
}

contract contract58 {
  error error61();

  event event59(string var60);

  contract0.struct4 internal struct_instance65;
  contract0.struct4 internal struct_instance64 = (contract0.struct4(struct_instance65.array5));
  contract0.struct4 internal struct_instance63 = (struct_instance64);
  contract0.struct4 internal struct_instance62 = struct_instance63;

  modifier modifier66() {
    int128 var67 = int128(-4405871519260541931);
    (var67 |= var67);
    _;
  }

  modifier modifier68(mapping(int128 => mapping(int128 => contract0.struct7)) storage mapping69) {
    int128 var74;
    ((var74) += var74);
    _;
  }

  function func75(mapping(int128 => int128) storage mapping76) internal view {
    string[] memory array80;
    array80 = array80;
    contract0.struct4 storage struct_instance79 = contract0.struct4(array80);
    (false) ? struct_instance79 : (struct_instance65);
  }
}