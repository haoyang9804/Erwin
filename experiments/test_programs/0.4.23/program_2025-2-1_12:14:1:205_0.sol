contract contract0 {
  string var1 = "YFqpl";

  modifier modifier2() {
    revert (var1);
    _;
  }

  function func3() public returns (int8 var4) {
    string memory var5 = "NUuYn";
    revert ((var1 = var5));
  }
}