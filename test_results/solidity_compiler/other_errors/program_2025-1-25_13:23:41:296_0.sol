/*Warning: This is a pre-release compiler version, please do not use it in production.

Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.
--> generated_programs/program_2025-1-25_13:23:41:296_0.sol

Warning: Source file does not specify required compiler version!
--> generated_programs/program_2025-1-25_13:23:41:296_0.sol

Error: Type string memory is not implicitly convertible to expected type string storage pointer.
  --> generated_programs/program_2025-1-25_13:23:41:296_0.sol:74:5:
   |
74 |     string storage var76 = (string("ELzCW"));
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

*/
contract contract0 {
  error error6();

  event event1(int64[] array2);

  event event4(int64 var5);

  mapping(int64 => int64) internal mapping7;
  int64 internal var11;
  int64 internal var10 = var11;
  mapping(int64 => mapping(int64 => string)) internal mapping27;

  modifier modifier12(mapping(int64 => mapping(int64 => string)) storage mapping13) {
    revert error6();
    _;
  }

  modifier modifier18() {
    int64 var19 = mapping7[int64(-0)];
    for (; var19 == var11; (bool(true) ? var11 : (var19))) {}
    _;
  }

  function func20() internal view modifier18() returns (int64 var21) {
    bool var32 = false;
    bool var33 = true;
    if (var33 || var32) {} else {}
  }

  function func22(mapping(int64 => string) storage mapping23) internal modifier12(mapping27) modifier12(mapping27) returns (string memory var26) {
    var26 = var26;
    int64 var35 = int64(-0);
    int64 var34 = var35;
    ~(var34);
    bool var36;
    string memory var37;
    var37 = var37;
    return (var36 ? var37 : var37);
  }
}

contract contract38 {
  error error39(int64 var40);

  string[10] internal array47;
  string[10] internal array45 = (array47);
  string[10] internal array43 = array45;
  string[10] internal array41 = (array43);
  contract0 internal contract_instance52;
  string[] internal array66;
  string[] internal array64 = array66;
  string[] internal array62 = (array64);

  modifier modifier54(string[] storage array55) {
    int64 var57;
    (var57 <<= 1264832529);
    _;
  }

  modifier modifier58(contract0 contract_instance59) {
    int64 var60 = int64(-0);
    (var60) > (var60);
    _;
  }

  constructor() modifier58(contract_instance52) modifier58(contract_instance52) {
    bool var74;
    bool var73 = var74;
    !var73;
  }

  function func61() internal view modifier54(array62) {
    uint32 var75 = 2317667262;
    string storage var76 = (string("ELzCW"));
    bool(true) ? var76 : (array41[(var75)]);
    return ();
  }

  function func71() internal view returns (contract0 contract_instance72) {
    bool var77;
    bool var78 = var77;
    while (((var78) = var77)) {}
    return (contract_instance52);
  }
}