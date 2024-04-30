
export function assert(condition : any, message ?: string) : asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

export function maybe<T>(value : T | undefined, defaulton ?: T) : T | undefined {
  return value === undefined ? defaulton : value;
}

export function dec2hex(num : number) : string {
  const map = "0123456789abcdef";
  let hex = num === 0 ? "0" : "";
  while (num !== 0) {
    hex = map[num & 15] + hex;
    num = num >>> 4;
  }
  return hex;
}

export function str2hex(str : string) : string {
  let res = "";
  for (let i = 0; i < str.length; i++) {
    res += str.charCodeAt(i).toString(16);
  }
  return res;
}

export function pickRandomElement<T>(array : T[]) : T | undefined {
  if (array.length === 0) {
    return undefined;
  }

  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

export function lazyPickRandomElement<T>(array : T[]) : T | undefined {
  if (Math.random() < 0.5) {
    return undefined;
  }
  return pickRandomElement(array);
}

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateRandomString_fixedLength(length : number) : string {
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

export function generateRandomString_randomLength(minLength : number, maxLength : number) : string {
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

//TODO: add a config to specify whether to generate a random string of fixed length
export function generateRandomString() : string {
  return generateRandomString_fixedLength(5);
}

export function extendArray<T>(array : T[], n : number) : T[] {
  assert(n > 0, "extendArray: n must be greater than 0");
  let extendedArray : T[] = [];
  for (let i = 0; i < n; i++) {
    // shallow copy
    extendedArray = extendedArray.concat(array);
  }
  return extendedArray;
}

export function extendArrayofMap<K, V>(array : Map<K, V>[], n : number) : Map<K, V>[] {
  assert(n > 0, "extendArray: n must be greater than 0");
  let extendedArray : Map<K, V>[] = [];
  for (let i = 0; i < n; i++) {
    // shallow copy
    extendedArray = extendedArray.concat(deepCopy_ArrayofMap(array));
  }
  return extendedArray;
}

export function deepCopy_ArrayofMap<K, V>(array : Map<K, V>[]) : Map<K, V>[] {
  const res : Map<K, V>[] = [];
  for (let map of array) {
    res.push(new Map(map));
  }
  return res;
}