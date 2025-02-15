interface I {
    function i() external;
}

library L {
    function f(I _i) internal {
        _i.i();
    }
	function g(I _i) internal {
		f(_i);
	}
}

contract C {
    struct S { C c; }
    function f(uint a, S[2] memory s1, uint b) public returns (uint r1, C r2, uint r3) {
        r1 = a;
        r2 = s1[0].c;
        r3 = b;
    }

}