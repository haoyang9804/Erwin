contract C {
    function() returns (uint256) internal x;

    function set() public {
        ufixed256x80 a = ufixed256x80(1/3); a;
        ufixed248x80 b = ufixed248x80(1/3); b;
        ufixed8x1 c = ufixed8x1(1/3); c;

}

    function g() public pure returns (uint256) {
        return 2;
    }

    function h() public returns (uint256) {
        return C.x();
    }
}