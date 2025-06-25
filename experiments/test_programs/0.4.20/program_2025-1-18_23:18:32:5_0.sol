contract contract0 {
  event event1();

  struct struct2 {
    uint128 var3;
  }

  struct2[] public array8;
  struct2[] internal array6 = array8;
  struct2[] internal array4 = (array6);
  uint128 internal var15;

  modifier modifier13() {
    struct2 memory struct_instance14 = array8[var15];
    while (var15 > struct_instance14.var3) {}
    _;
  }

  function func16(struct2[] memory struct_instance17) public view returns (int8[] memory array18) {
    array18 = array18;
    (this.array8(contract0.struct2(uint128(9716491644842261891508118989265334215)).var3));
    bool var25;
    bool var24 = var25;
    bool var23 = var24;
    struct2 memory struct_instance26 = (array6[(2988625795614433558050094788818594633)]);
    int8[] memory array21 = new int8[](var23 ? (uint128(136120848011156467712055038183214384818)) : struct_instance26.var3);
    int8[] memory array27;
    array27 = array27;
  }
}