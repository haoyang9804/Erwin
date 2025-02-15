contract C {
	function f() pure public {
		revert();
				assert(false);
	}

	function g() pure public {
		revert("revert message");
				assert(false);
	}

	function h(bool b) pure public {
        revert();
        revert();

}

		bool x = false;
	function m() view internal returns (string memory) {
		assert(x != true);
	}
	function i() public {
		x = true;
		revert(m());
	}
}