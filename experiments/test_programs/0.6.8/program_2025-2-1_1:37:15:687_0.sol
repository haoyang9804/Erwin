pragma experimental SMTChecker;
contract contract0 {
  struct struct1 {
    uint8 var2;
    mapping(int16 => int16[]) mapping3;
  }

  bool[] internal array7;
  struct1 internal struct_instance9;

  modifier modifier11() {
    struct1 storage struct_instance12;
    struct_instance12 = struct_instance12;
    string memory var13;
    var13 = var13;
    revert ((array7[(struct_instance12.var2)]) ? var13 : (var13));
    _;
  }

  function func14(string memory var15) internal modifier11() returns (int16 var16, int16 var17) {
    string memory var20;
    var20 = var20;
    revert (var20);
  }

  function func18(int16 var19) internal modifier11() {
    revert (string("leuhx"));
    return ();
  }
}

contract contract21 {
  event event22();

  event event23();

  struct struct24 {
    contract0 contract_instance25;
    mapping(int16 => int16) mapping26;
  }

  bool internal var29;
  contract0 internal contract_instance30 = (new contract0());
  string internal var38;
  mapping(contract0 => mapping(string => int16)) internal mapping45;
  mapping(contract0 => mapping(string => int16)) internal mapping50;

  modifier modifier31(string memory var32) {
    string memory var33;
    var33 = var33;
    string memory var35;
    var35 = var35;
    string memory var34 = var35;
    revert ((var34 = var33));
    _;
  }

  function func36(string memory var37) internal modifier31(var38) {
    var29 ? () : ((, )) = (var37, var38);
  }

  function func39() internal returns (mapping(contract0 => mapping(string => int16)) storage mapping40) {
    mapping40 = mapping40;
    revert (("SIhHa"));
    return (bool(true) ? mapping50 : mapping45);
  }
}