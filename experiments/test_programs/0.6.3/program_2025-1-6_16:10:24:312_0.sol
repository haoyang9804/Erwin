pragma experimental SMTChecker;
contract contract0 {
  event event1(int32 var2);

  int32 internal var3;

  modifier modifier4() {
    ((int32(-1071941736)) >= var3);
    _;
  }

  modifier modifier5(int32 var6) {
    int32 var7;
    ((int32(-2133366978)) != (var7));
    _;
  }

  function func8() internal view modifier4() {
    bool var11;
    var11 ? var11 : var11;
  }

  function func9(int32 var10) internal {
    while ((int32(-1090505975) != (var3))) {
      var3--;
    }
  }
}

contract contract12 {
  mapping(string => int32) internal mapping13;

  modifier modifier16(contract0 contract_instance17) {
    string memory var18;
    var18 = var18;
    int32(-977251463) <= mapping13[var18];
    _;
  }

  function func19() external view returns (string memory var20, int32 var21) {
    var20 = var20;
    (this.func19());
    int32 var22;
    return ((string("EeJft")), var22);
  }
}