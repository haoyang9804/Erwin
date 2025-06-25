pragma experimental SMTChecker;
contract contract0 {
  struct struct1 {
    bool var2;
  }

  string internal var3;
  bool public var4;

  modifier modifier5() {
    struct1 memory struct_instance6;
    struct_instance6 = struct_instance6;
    !struct_instance6.var2;
    _;
  }

  modifier modifier7() {
    while (this.var4()) {}
    _;
  }

  function func8(int8 var9) internal modifier7() {
    struct1 memory struct_instance10;
    struct_instance10 = struct_instance10;
    int8 var11;
    for (((int8(-114))); ((struct_instance10.var2) || (false)); var11) {}
  }
}

contract contract12 {
  event event13(int8 var14);

  struct struct15 {
    int8 var16;
  }

  struct struct17 {
    string var18;
  }

  string internal var19;
  struct15 internal struct_instance30;
  mapping(int8 => int8) internal mapping35;
  mapping(int8 => int8) internal mapping38;
  mapping(int8 => int8) internal mapping41;

  modifier modifier20(struct15 memory struct_instance21) {
    struct15 memory struct_instance22;
    struct_instance22 = struct_instance22;
    if (struct_instance22.var16 <= (int8(-108))) {} else {}
    _;
  }

  function func23() internal modifier20(struct_instance30) returns (mapping(int8 => int8) storage mapping24, mapping(int8 => int8) storage mapping27) {
    mapping24 = mapping24;
    mapping27 = mapping27;
    int8 var31;
    int8 var32;
    for ((new contract0()); (var32 == (var31)); new contract0()) {
      contract0.struct1 memory struct_instance33;
      struct_instance33 = struct_instance33;
      contract0.struct1 memory struct_instance34;
      struct_instance34 = struct_instance34;
      (struct_instance34.var2 && struct_instance33.var2);
    }
    return (mapping35, bool(false) ? mapping41 : (mapping38));
  }
}