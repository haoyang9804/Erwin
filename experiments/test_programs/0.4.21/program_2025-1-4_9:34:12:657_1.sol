pragma experimental SMTChecker;
contract contract0 {
  event event1(int256 var2);

  string internal var3;
  int256 public var4;

  modifier modifier5(int256 var6) {
    (var4 /= int256(-2829385852397820951585204421623310918109979118888660421411));
    _;
  }

  modifier modifier7() {
    bool var8;
    (var8) ? (bool(true)) : var8;
    _;
  }

  function func9() internal returns (int256 var10, int256 var11) {
    (var4 %= (var4));
  }

  function func12(int256 var13) internal modifier7() modifier5(var13) returns (int256 var14) {
    int256 var15;
    (var15 = var15);
    return ((this.var4()));
  }
}

contract contract16 {
  event event17();

  struct struct18 {
    int256 var19;
  }

  int256 internal var20;
  struct18 internal struct_instance21;

  modifier modifier22() {
    struct18 memory struct_instance23;
    struct_instance23 = struct_instance23;
    struct18 memory struct_instance24;
    struct_instance24 = struct_instance24;
    if ((struct_instance24.var19) <= struct_instance23.var19) {} else {}
    _;
  }

  function func25(int256 var26) internal modifier22() {
    struct18 memory struct_instance30;
    struct_instance30 = struct_instance30;
    int256 var31;
    for (; (var20) > (struct_instance30.var19); (-var31)) {
      bool var32;
      int256 var33;
      int256 var34;
      ((var32) ? var34 : var33);
    }
  }

  function func27() external modifier22() returns (struct18 memory struct_instance28, int256 var29) {
    struct_instance28 = struct_instance28;
    struct18 memory struct_instance35;
    struct_instance35 = struct_instance35;
    int256(-28852984482049762889739859712662469587252646676719681051) > (struct_instance35.var19);
  }
}