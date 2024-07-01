
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
  if (Math.random() < 0.1) {
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

export function cartesianProduct(arrays : any[][]) : any[][] {
  if (arrays.length === 0) {
    return [[]];
  }

  const results : any[][] = [];
  const currentArray = arrays[0];
  const remainingArrays = arrays.slice(1);

  const remainingCombinations = cartesianProduct(remainingArrays);

  for (const value of currentArray) {
    for (const combination of remainingCombinations) {
      results.push([value, ...combination]);
    }
  }

  return results;
}

export function createCustomSet<T>(equalityFn : (a : T, b : T) => boolean) : Set<T> {
  const set = new Set<T>();

  set.has = function(key : T) : boolean {
    for (const item of this) {
      if (equalityFn(item, key)) {
        return true;
      }
    }
    return false;
  };

  set.add = function(value : T) : Set<T> {
    if (!this.has(value)) {
      Set.prototype.add.call(this, value);
    }
    return this;
  };

  return set;
}

export function shuffle<T>(array : T[]) : T[] {
  let arrayCopy = Array.from(array);
  let currentIndex = arrayCopy.length, randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [arrayCopy[currentIndex], arrayCopy[randomIndex]] = [
      arrayCopy[randomIndex], arrayCopy[currentIndex]];
  }

  return arrayCopy;
}

export function selectRandomElements<T>(array : T[], n : number) : T[] {
  if (n > array.length) {
    throw new Error("Cannot select more elements than available in the array.");
  }
  const indexSet = new Set<number>();
  for (let i = 0; i < array.length; i++) indexSet.add(i);
  const selectedIndices = new Set<number>();
  const selectedElements : T[] = [];
  while (selectedIndices.size < n) {
    const randomIndexofIndex = Math.floor(Math.random() * indexSet.size);
    const randomIndex = Array.from(indexSet)[randomIndexofIndex];
    indexSet.delete(randomIndex);
    selectedIndices.add(randomIndex);
    selectedElements.push(array[randomIndex]);
  }
  return selectedElements;
}

export function pickRandomSubarray<T>(array : T[], length : number) : T[] {
  const shuffled = array.slice();
  let i = array.length;
  let temp;
  let index;

  while (i--) {
    index = Math.floor((i + 1) * Math.random());
    temp = shuffled[index];
    shuffled[index] = shuffled[i];
    shuffled[i] = temp;
  }

  return shuffled.slice(0, length);
}

export function randomBigInt(min : bigint | number | string, max ?: bigint | number | string) : bigint {
  if (max === undefined) return randomBigInt(0n, min);
  // choose if you want to allow not-bigints yourself
  // this wrapper allows `bigint | number | string` (you may want to keep at least `bigint | number`
  min = BigInt(min);
  max = BigInt(max);

  // choose what happens when input order is invalid (e.g. throw error)
  // this wrapper keeps `min` in and `max` out of generatable numbers
  if (min <= max)
    return min + _generateRandomBigInt(max - min);
  else
    return max - 1n - _generateRandomBigInt(min - max);
}

/**
 * This is tha basic function to generate random bigint.
 * @param max exclusive maximum
 * (c) <CC-BY-SA-4.0 or Unlicense> Dimava, 2023
 */
function _generateRandomBigInt(max : bigint) : bigint {
  if (max < 0) throw new Error("generateRandomBigInt cannot generate negative BigInt");
  if (max === 0n) return 0n;

  const POWER = 64n;
  const FILTER = (1n << POWER) - 1n;

  // 1. Create an BigInt64Array representation of max number
  let num = max;
  const maxList : bigint[] = [];
  while (num) {
    maxList.unshift(num & FILTER);
    num >>= POWER;
  }
  const maxArray = BigInt64Array.from(maxList);

  // 2. Generate the random number
  const rndArray = crypto.getRandomValues(maxArray.slice());

  // 3. Trim the random number highest bits
  // to reduce failure rate to <50%
  let trim = 1n;
  while (maxArray[0] > trim) trim <<= 1n;
  trim--;
  rndArray[0] &= trim;

  // 4. Convert to bigint
  let rnd = 0n;
  for (let i = 0; i < rndArray.length; i++) {
    rnd <<= POWER;
    rnd += rndArray[i];
  }

  // 5. Check for failure (the random number being higher then max)
  // and retry if needed
  if (rnd >= max) return _generateRandomBigInt(max);
  return rnd;
}

export function randomInt(min : number, max : number) : number {
  assert(min <= max, `min ${min} must be less than or equal to max ${max}`);
  const array : number[] = [];
  for (let i = min; i <= max; i++) {
    array.push(i);
  }
  return pickRandomElement(array)!;
}

export function swap(a : any, b : any) {
  const temp = a;
  a = b;
  b = temp;
  return [a, b];
}

export function terminate(message ?: string, exitCode = 0) : never {
  if (message !== undefined) {
    if (exitCode === 0) {
      console.log(message);
    } else {
      console.error(message);
    }
  }

  process.exit(exitCode);
}

export function error(message : string) : never {
  terminate(message, 1);
}

export function min(a : number, b : number) : number {
  return a < b ? a : b;
}

export function max(a : number, b : number) : number {
  return a > b ? a : b;
}

export function mergeSet<T>(a : Set<T>, b : Set<T>) : Set<T> {
  return new Set([...a, ...b]);
}