/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-23_23:51:53:153_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-23_23:51:53:153_0.sol

Error: Type string memory is not implicitly convertible to expected type string storage pointer.
  --> generated_programs/program_2025-1-23_23:51:53:153_0.sol:57:7:
   |
57 |       string storage var33 = (string("Fykrt"));
   |       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  error error1(int16 var2);

  error error3(int16 var4);

  struct struct5 {
    int16 var6;
    uint8 var7;
  }

  string internal var8 = ("Iares");
  struct5 internal struct_instance13;
  struct5 internal struct_instance12 = struct_instance13;
  string internal var15;
  string internal var16;
  string internal var20 = string("XqHMP");

  modifier modifier9(string memory var10) {
    struct5 memory struct_instance11 = (struct_instance12);
    struct5 memory struct_instance14;
    struct_instance14 = struct_instance14;
    struct_instance14.var6 >> struct_instance11.var7;
    _;
  }

  constructor() modifier9(var15) modifier9(var16) {
    bool var21 = true;
    do {
      struct5 memory struct_instance22;
      struct_instance22 = struct_instance22;
      int16 var23;
      var23 < struct_instance22.var6;
    } while(false && (var21));
  }

  function func17(struct5[6] memory array18) internal modifier9(var8) modifier9(var20) {
    struct5 memory struct_instance24 = (struct_instance13);
    ~(struct_instance24.var7);
    return ();
  }
}

contract contract25 {
  error error26();

  string internal var27;
  string internal var28 = ("DVdAo");
  contract0.struct5 internal struct_instance37;
  int16[] internal array46;
  int16[] internal array44 = (array46);
  int16[] internal array42 = (array44);
  int16[] internal array40 = array42;

  modifier modifier29(int16[] memory array30) {
    bool var32;
    while (!(var32)) {
      string storage var33 = (string("Fykrt"));
      (false) ? (var33) : var28;
    }
    _;
  }

  modifier modifier34() {
    bool var35;
    contract0.struct5 memory struct_instance36 = struct_instance37;
    uint8 var38;
    var35 ? var38 : struct_instance36.var7;
    _;
  }

  function func39() internal view modifier29(array40) {
    int16 var52;
    int16(-20655) >= var52;
  }
}