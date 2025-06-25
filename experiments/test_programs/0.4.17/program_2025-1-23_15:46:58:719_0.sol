contract contract0 {
  event event1();

  struct struct2 {
    uint256 var3;
  }

  bool internal var4;
  uint256[6**852] internal array7;
  uint256[6] internal array5 = array7;
  int32 internal var16;
  mapping(int32 => int32) internal mapping24;

  modifier modifier11(int32 var12) {
    struct2 memory struct_instance13;
    struct_instance13 = struct_instance13;
    struct_instance13.var3 / (array5[contract0.struct2(25744835921833003575901285681577055032061447212274116915206887360850195750263).var3]);
    _;
  }

  modifier modifier14(int32 var15) {
    _;
  }

  constructor() modifier11(int32(-205274713)) modifier11(var16) {
    !(var4);
  }

  function func17() internal modifier14(var16) returns (mapping(int32 => int32) storage mapping18) {
    mapping18 = mapping18;
    string memory var22;
    var22 = var22;
    string memory var21 = var22;
    string memory var23 = string("WcIqI");
    revert (bool(true) ? var23 : var21);
    return (mapping24);
  }
}

contract contract27 {
  error error29(contract0.struct2 struct_instance30);

  event event28();

  struct struct31 {
    contract0.struct2[2] array32;
    contract0 contract_instance34;
  }

  struct struct35 {
    mapping(int32 => string[]) mapping36;
    mapping(int32 => int32) mapping40;
  }

  contract0 internal contract_instance43;

  modifier modifier44() {
    bool var46;
    bool var45 = (var46);
    do {
      emit event28();
    } while(((var45) = bool(true)));
    _;
  }

  function func47() internal view returns (string memory var48) {
    var48 = var48;
    contract0.struct2 memory struct_instance49;
    struct_instance49 = struct_instance49;
    ((struct_instance49.var3) >>= 36808675005479207055338361718669690519114607982237864377529293764001451557599);
  }
}