pragma experimental SMTChecker;
contract contract0 {
  event event1(int32 var2);

  event event3(int32 var4);

  struct struct5 {
    int32 var6;
    mapping(int32 => int32[]) mapping7;
  }

  bool[9] internal array11;
  int32[][3] public array13;
  int32[4][8] internal array27;

  modifier modifier19() {
    bool var20;
    do {} while((array11[1] = var20));
    _;
  }

  modifier modifier21(int32[4][8] storage array22) {
    uint8 var25;
    for (((var25 -= uint8(32))); array13[var25][var25] > (int32(-1225521450)); this.array13(var25, var25)) {
      (uint8(39) < var25);
    }
    _;
  }

  constructor(int32 var26) modifier21(array27) {
    bool[9] memory array39;
    array39 = array39;
    array11 = ((bool(false)) ? array39 : array11);
  }

  function func32() internal modifier21(array27) returns (struct5 storage struct_instance33, string[1] storage array34) {
    struct_instance33 = struct_instance33;
    array34 = array34;
    bool var41;
    (true) ? var41 : array11[8];
    struct5 storage struct_instance42;
    struct_instance42 = struct_instance42;
    struct5 storage struct_instance43;
    struct_instance43 = struct_instance43;
    string[1] storage array44;
    array44 = array44;
    return (bool(true) ? struct_instance43 : (struct_instance42), true ? array44 : (array44));
  }

  function func36() internal returns (int32 var37, string memory var38) {
    var38 = var38;
    struct5 storage struct_instance46;
    struct_instance46 = struct_instance46;
    ((bool(true)) ? int32(-1399175774) : (struct_instance46.var6));
    bool var47;
    int32 var48;
    int32 var49;
    string memory var50;
    var50 = var50;
    return ((var47) ? (var49) : var48, false ? var50 : var50);
  }
}

contract contract51 {
  int32 internal var52;
  string internal var60;

  modifier modifier53(string memory var54) {
    ((var52) % var52);
    _;
  }

  function func55() internal modifier53(var60) modifier53(var60) returns (mapping(int32 => int32)[2] storage array56) {
    array56 = array56;
    bool var61;
    do {} while(!var61);
  }
}