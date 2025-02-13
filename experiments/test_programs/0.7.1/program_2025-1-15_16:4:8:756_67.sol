pragma experimental SMTChecker;
contract contract0 {
  struct struct1 {
    bool var2;
  }

  int256 internal var3 = int256(-2038299663686612008334714856595978972037814433421197906286);
  mapping(int256 => mapping(int256 => string)) internal mapping4;
  struct1 internal struct_instance23;
  struct1 internal struct_instance22 = struct_instance23;

  modifier modifier9(int256 var10) {
    (int256(-2015774520701128309661512362679403056279067218366125633261) & (var3));
    _;
  }

  modifier modifier11() {
    bool var12 = true;
    (var12 ? (false) : (var12));
    _;
  }

  constructor(int256[] memory array13) modifier11() {
    struct1 memory struct_instance19;
    struct_instance19 = struct_instance19;
    (struct_instance19.var2, ) = this.func16();
    do {
      (var3 /= (int256(-1749182817385318899847415936667785954483011559938568087217)));
    } while(struct_instance19.var2);
  }

  function func16() external modifier11() returns (bool var17, string memory var18) {
    var18 = var18;
    struct1 memory struct_instance21 = struct_instance22;
    bool var20 = struct_instance21.var2;
    ((var20) = false);
    var20 ? (((var3, 1239112312399723))) : (var3 + var3, 10928390718);
  }
}