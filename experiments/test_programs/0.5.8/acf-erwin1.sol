contract contract0 {
  event event1(string var2);

  struct struct3 {
    string var4;
    mapping(int64 => int64[7])[] array5;
  }

  struct3 internal struct_instance9;
  mapping(int64 => struct3)[10] internal array22;
  mapping(int64 => struct3)[10] internal array26;

  modifier modifier10(mapping(int64 => struct3)[10] storage array11) {
    int64 var15;
    int64 var16 = var15;
    (var16 & var15);
    _;
  }

  function func17(mapping(string => struct3)[8] storage array18) internal view modifier10(array22) modifier10(array26) {
    int64 var41;
    (var41++);
    return ();
  }

  function func32() external returns (int[] memory array33) {
    array33 = array33;
    struct3 memory struct_instance38;
    struct_instance9 = struct_instance38;
    bool var42;
    if (var42 && true) {} else {}
  }
}

contract contract43 {
  event event44(int64 var45);

  struct struct46 {
    contract0.struct3 struct_instance47;
  }

  struct struct48 {
    mapping(int64 => mapping(int64 => struct46)) mapping49;
    contract0.struct3 struct_instance54;
  }

  struct48 internal struct_instance55;
  mapping(int64 => mapping(int64 => int64)) internal mapping56;
  mapping(int64 => string[1]) internal mapping69;
  mapping(int64 => string[1]) internal mapping73;

  modifier modifier61(mapping(int64 => string[1]) storage mapping62) {
    int64 var67 = int64(-0);
    int64 var66 = var67;
    ~var66;
    _;
  }

  function func68() internal view modifier61(mapping69) modifier61(mapping73) {
    (true ? mapping73 : mapping73);
  }
}