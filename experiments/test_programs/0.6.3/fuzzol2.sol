pragma experimental SMTChecker;

contract D
{
	uint x;
}

contract C
{
	function f(D c, fixed d) public pure {
		uint(d =--d);
	}
}