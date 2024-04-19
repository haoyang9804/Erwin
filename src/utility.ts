
export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

export function maybe<T>(value : T | undefined, defaulton ?: T) : T | undefined {
  return value === undefined ? defaulton : value;
}

export function dec2hex(num: number): string {
  const map = "0123456789abcdef";
  let hex = num === 0 ? "0" : "";
  while (num !== 0) {
      hex = map[num & 15] + hex;
      num = num >>> 4;
  }
  return hex;
}

export function str2hex(str: string): string {
  let res = "";
  for (let i = 0; i < str.length; i++) {
    res += str.charCodeAt(i).toString(16);
  }
  return res;
}

export function pickRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }

  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
