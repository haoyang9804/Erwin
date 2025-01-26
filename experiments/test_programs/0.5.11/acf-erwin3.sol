pragma experimental SMTChecker;
contract contract0 {
  bool[] public array5;
  bool[] internal array3 = (array5);
  bool[] internal array1 = (array3);

  modifier modifier10() {
    bool var11 = array5[uint8(226)];
    int256[] memory array12;
    array12 = array12;
    int256[] memory array14;
    array14 = array14;
    (var11 ? array14 : (array12));
    _;
  }

  function func16() internal modifier10() modifier10() {
    int256[1][10];
    uint8 var23;
    do {} while(bool(true) ? array5[var23] : (array3[(uint8(208))]));
  }

  function func19() external view {
    int256[][] memory array20;
    array20 = array20;
    this.array5(60);
  }
}