pragma experimental SMTChecker;
contract contract0 {
  event event1(int8 var2);

  int8 internal var3;

  modifier modifier4() {
    int8 var5;
    (var3) / var5;
    _;
  }

  function func6(int8 var7) internal pure returns (int8 var8) {
    bool var10;
    ((false) && var10);
    int8 var11;
    return (-var11);
  }

  function func9() internal view modifier4() modifier4() {
    bool var12;
    (var12) ? var12 : (var12);
    return ();
  }
}

contract contract13 {
  event event14();

  event event15();

  struct struct16 {
    string var17;
  }

  string internal var18;
  bool internal var19;
  contract0 internal contract_instance28;

  modifier modifier20(contract0 contract_instance21) {
    if (var19 || false) {} else {
      int8 var22;
      ((var22)++);
    }
    _;
  }

  function func23() internal {
    emit contract13.event15();
    return ();
  }

  function func24(int8 var25) internal modifier20(contract_instance28) modifier20(contract_instance28) returns (int8 var26, int8 var27) {
    emit event15();
  }
}