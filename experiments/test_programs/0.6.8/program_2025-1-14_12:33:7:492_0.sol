pragma experimental SMTChecker;
contract contract0 {
  event event1(int128 var2);

  struct struct3 {
    bool var4;
  }

  mapping(int128 => int128[10]) public mapping5;
  bool internal var16;
  struct3 internal struct_instance15 = contract0.struct3(var16);

  modifier modifier10() {
    uint16 var11;
    struct3 memory struct_instance12;
    struct_instance12 = struct_instance12;
    struct3 memory struct_instance14 = struct_instance15;
    bool var13 = (struct_instance14.var4);
    uint16 var17 = var11;
    for ((((var11) %= (12893))); (var13 || struct_instance12.var4); this.mapping5(int128(-915175079716627223), var17)) {}
    _;
  }

  function func18() public view modifier10() returns (bool var19) {
    int128 var21 = int128(-740170660036735073);
    int128 var20 = var21;
    (var20 <<= 52640);
    return ((var21 != int128(-9117035259800883315)));
  }
}

contract contract22 {
  struct struct23 {
    mapping(contract0 => contract0.struct3) mapping24;
    mapping(int128 => string) mapping27;
  }

  struct23 internal struct_instance30;
  mapping(bool => mapping(bool => int128)) internal mapping31;
  bool var32 = new contract0().func18() && new contract0().func18();
}