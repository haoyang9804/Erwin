pragma experimental SMTChecker;
contract contract0 {
  event event1();

  string internal var2;
  int8 internal var3 = int8(-5);
  bool var7 = func5();
  bool var8 = var7;
  bool var9 = var8;
  bool var10 = var9 || var8;

  modifier modifier4() {
    revert ((bool(true) ? var2 : var2));
    _;
  }

  function func5() internal modifier4() returns (bool var6) {
    revert (("TQTnS"));
    return var10;
  }
}