pragma experimental SMTChecker;
contract contract0 {
  event event1(int128 var2);

  event event3();

  struct struct4 {
    int128 var5;
  }

  int128 internal var6;

  modifier modifier7(int128 var8) {
    string memory var9;
    var9 = var9;
    string memory var10 = var9;
    revert (((true) ? (var10) : var9));
    _;
  }

  function func11(string memory var12) internal {
    string memory var15;
    var15 = var15;
    revert (bool(false) ? var15 : (var15));
  }

  function func13(string memory var14) public {
    ((string("WRvIf"), var14));
  }
}

contract contract16 {
  event event17();

  event event18(string var19);

  struct struct20 {
    string var21;
  }

  int128 internal var22 = contract0.struct4(int128(-1324131697839436499)).var5;

  modifier modifier23(int128 var24) {
    struct20 memory struct_instance25;
    struct_instance25 = struct_instance25;
    revert (struct_instance25.var21);
    _;
  }

  function func26() internal view modifier23(var22) {
    revert ((string("zsAYC")));
  }

  function func27(string memory var28) internal pure {
    revert (("ppljg"));
  }
}