import { random_bigInt } from '../src/utility';

test("test random bigInt",
() => {
  expect((1n << BigInt(8) - 1n)).toEqual(128n);
  for (let i = 0; i < 100; i++) {
    const result = random_bigInt(0n, (1n << BigInt(8) - 1n));
    expect(result).toBeGreaterThanOrEqual(0n);
    expect(result).toBeLessThanOrEqual(128n);
  }
}
)