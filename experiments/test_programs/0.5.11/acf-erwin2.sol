pragma experimental SMTChecker;
contract contract0 {
  event event1();

  struct struct2 {
    bool var3;
    int256[] array4;
  }

  struct2 internal struct_instance8;
  int256[] internal array6 = struct_instance8.array4;

  modifier modifier10(int256 var11) {
    emit contract0.event1();
    _;
  }

  function func12() public pure {
    int256[][];
    struct2 memory struct_instance15;
    struct_instance15 = struct_instance15;
    struct2 memory struct_instance14 = struct_instance15;
    (struct_instance14.var3) ? (struct_instance14) : struct_instance14;
  }
}