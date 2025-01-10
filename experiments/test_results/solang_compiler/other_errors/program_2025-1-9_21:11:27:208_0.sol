/*Assertion failed: (getType() == V->getType() && "All operands to PHI node must be the same type as the PHI node!"), function setIncomingValue, file Instructions.h, line 2766.
*/
contract contract0 {
  event event1(int64 var2);

  event event3();

  struct struct4 {
    int64 var5;
    string var6;
  }

  struct4[4] internal array9;
  struct4[4] internal array7 = (array9);

  constructor() {
    int64 var16 = int64(-0);
    string memory var17 = string("JvVdS");
    if (contract0.struct4(var16, (contract0.struct4(int64(-0), var17)).var6).var5 > int64(-0)) {} else {}
  }

  function func13(string[] memory array14) internal pure {
    if ((contract0.struct4(int64(-0), string("aUJRa")).var5 < int64(-0))) {
      string memory var18 = (string("ZfGBj"));
      struct4 memory struct_instance19 = struct4(int64(-0), "GFvJK");
      (struct_instance19.var5 /= (struct4(int64(-0), (contract0.struct4(int64(-0), var18)).var6)).var5);
    } else {}
  }
}

contract contract20 {
  struct struct21 {
    int64[5] array22;
    string var24;
  }

  int64 internal var25;
  struct21 internal struct_instance31;

  constructor(string memory var26) {
    int64 var28 = int64(-0);
    var25 = var28;
  }

  function func27() internal {
    int64[5] memory array29 = struct_instance31.array22;
    if (contract0.struct4(int64(-0), contract0.struct4(int64(-0), contract20.struct21(array29, string("cysWj")).var24).var6).var5 <= int64(-0)) {
      (++var25);
    } else {
      bool var32 = true;
      (!(var32));
    }
  }
}