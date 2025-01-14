pragma experimental SMTChecker;
contract contract0 {
  struct struct1 {
    int64 var2;
    int64[9] array3;
  }

  struct struct5 {
    int64 var6;
    string var7;
  }

  int64 internal var8;
  struct1 internal struct_instance15;
  struct5 internal struct_instance19 = contract0.struct5(int64(-0), "uvdOM");
  struct5 internal struct_instance18 = struct_instance19;

  modifier modifier9() {
    (var8 -= int64(-0));
    _;
  }

  constructor(int64 var10) {
    int64 var13;
    if (((var13) > int64(-0))) {
      struct1 memory struct_instance14 = struct_instance15;
      ((var8) -= struct_instance14.var2);
    } else {
      struct5 memory struct_instance16;
      struct_instance16 = struct_instance16;
      (struct_instance16.var6 %= int64(-0));
    }
  }

  function func11() public view returns (uint var20) {
    struct5 memory struct_instance17 = struct_instance18;
    while (int64(-0) <= (struct_instance17.var6)) {}
  }
}

contract contract21 {
  error error23(contract0.struct1 struct_instance24);

  event event22();

  struct struct25 {
    string var26;
    string var27;
  }

  int64 internal var28 = int64(-0);
  int64 internal var40;
  contract0.struct5 internal struct_instance43;
  contract0.struct5 internal struct_instance42 = (struct_instance43);
  contract0.struct5 internal struct_instance41 = struct_instance42;
  contract0[2] array48;
  uint var49 = array48[0].func11();

  modifier modifier29(int64 var30) {
    do {
      int64 var31 = int64(-0);
      ((var31) += contract0.struct5(int64(-0), "nMkWy").var6);
    } while((false));
    _;
  }

  function func32() internal view returns (contract0[5] memory array33) {
    array33 = array33;
    contract0.struct5 memory struct_instance44;
    struct_instance44 = struct_instance44;
    contract0.struct5 memory struct_instance45 = (struct_instance43);
    (struct_instance45.var6 /= struct_instance44.var6);
    contract0[5] memory array46;
    array46 = array46;
    return ((array46));
  }

  function func35(mapping(int64 => int64)[5] storage array36) internal modifier29(var40) modifier29(struct_instance41.var6) {
    emit event22();
  }
}