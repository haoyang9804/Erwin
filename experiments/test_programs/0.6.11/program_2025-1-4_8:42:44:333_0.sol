pragma experimental SMTChecker;
contract contract0 {
  struct struct1 {
    int8 var2;
  }

  int8 internal var3;

  modifier modifier4(int8 var5) {
    int8 var6;
    false ? var6 : var6;
    _;
  }

  function func7() internal view modifier4(var3) {
    int8 var8;
    (var8 -= int8(-58));
  }
}

contract contract9 {
  event event10();

  bool internal var11;
  int8 internal var12;

  modifier modifier13(mapping(contract0 => int8) storage mapping14) {
    --(var12);
    _;
  }

  modifier modifier17() {
    do {} while((var11));
    _;
  }

  function func18(int8 var19) internal view modifier17() {
    int8 var23;
    if (var23 == (var23)) {
      ((var23) <<= (1964581080497355282873526149610302858237401105513922727205924643375651975673));
    } else {}
  }

  function func20() internal returns (string memory var21, string memory var22) {
    var21 = var21;
    var22 = var22;
    emit contract9.event10();
  }
}