/*thread 'main' panicked at 'Found PointerValue(PointerValue { ptr_value: Value { name: "struct member5", address: 0x14980ce80, is_const: false, is_null: false, is_undef: false, llvm_value: "  %\"struct member5\" = getelementptr inbounds { i16, ptr }, ptr %7, i32 0, i32 0", llvm_type: "ptr" } }) but expected the IntValue variant', /Users/runner/.cargo/registry/src/index.crates.io-6f17d22bba15001f/inkwell-0.2.0/src/values/enums.rs:286:13
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
*/
contract contract0 {
  event event1();

  struct struct2 {
    uint16 var3;
    string var4;
  }

  string internal var5;

  function func6(string calldata var7) internal pure returns (string memory var8) {
    string memory var9 = (string("KJBaW"));
    struct2 memory struct_instance10 = contract0.struct2(46029, var9);
    (struct_instance10.var3 <<= struct2(uint16(14065), var9).var3);
    return (var9);
  }
}

contract contract11 {
  event event12(string var13);

  struct struct14 {
    contract0.struct2 struct_instance15;
  }

  mapping(int64 => string) internal mapping16;
  string internal var19;
  mapping(uint16 => bool) internal mapping33;
  mapping(int64 => string)[] internal array41;

  function func20() internal view returns (mapping(uint16 => bool) storage mapping21) {
    uint16 var31 = (58795);
    for (; (contract0.struct2(var31, "hjplX")).var3 == (var31); contract0.struct2(var31, "nfVGl").var3 >= var31) {}
    bool var32 = bool(true);
    return (var32 ? mapping33 : (mapping33));
  }

  function func24(string calldata var25) internal view returns (string memory var26, mapping(int64 => string)[] storage array27) {
    while (mapping33[(contract0.struct2(uint16(36316), mapping16[int64(-0)]).var3)]) {}
    string memory var36 = "ruEzJ";
    mapping(int64 => string)[] storage array37 = array41;
    return (mapping33[(uint16(63588))] ? var36 : var19, (array37));
  }
}