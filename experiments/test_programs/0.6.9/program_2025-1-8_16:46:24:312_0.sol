pragma experimental SMTChecker;
contract contract0 {
  event event1();

  struct struct2 {
    bool var3;
  }

  struct2 public struct_instance7;
  struct2 internal struct_instance6 = struct_instance7;
  struct2 internal struct_instance5 = (struct_instance6);
  struct2 internal struct_instance4 = struct_instance5;
  struct2 internal struct_instance25;

  modifier modifier8() {
    bool var9;
    while (var9) {
      bool var10 = false;
      !var10;
    }
    _;
  }

  modifier modifier11(bool var12) {
    struct2 memory struct_instance13;
    struct_instance13 = struct_instance13;
    while ((true) ? false : struct_instance13.var3) {
      emit contract0.event1();
    }
    _;
  }

  function func14() internal modifier8() returns (mapping(int32 => int32)[] storage array15, int32 var19) {
    array15 = array15;
    int32 var26;
    for (((((,)))) = ((array15),var26); (var26 == (int32(-11809797))); this.struct_instance7()) {
      emit contract0.event1();
    }
  }

  function func20(mapping(string => string)[1] storage array21) internal modifier11(struct_instance25.var3) modifier8() {
    bool var27;
    var27 ? var27 : var27;
  }
}