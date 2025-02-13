contract contract0 {
  event event1();

  struct struct2 {
    string var3;
    bool var4;
  }

  struct2 internal struct_instance8;
  struct2 internal struct_instance7 = struct_instance8;
  struct2 internal struct_instance6 = struct_instance7;
  bool internal var5 = struct_instance6.var4;

  modifier modifier9(string[1] storage array10) {
    _;
  }

  function func12(struct2[] memory array13) public returns (bool var15) {
    array13 = array13;
    string[10] memory array16;
    array16 = array16;
    bool var19 = true;
    return (!(var19));
  }
}