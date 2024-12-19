import { DataLocation } from "solc-typed-ast";
import { Value } from "./value";

export abstract class StorageLocation extends Value<DataLocation> { }

export class StoragePointer extends StorageLocation {
  constructor() {
    super(DataLocation.Storage);
  }
  str() : string {
    return "StoragePointer";
  }
  subs() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.memory()
    ];
  }
  same(t : StorageLocation) : boolean {
    return t instanceof StoragePointer || t instanceof StorageRef;
  }
  copy() : StorageLocation {
    return new StoragePointer();
  }
}

export class StorageRef extends StorageLocation {
  constructor() {
    super(DataLocation.Storage);
  }
  str() : string {
    return "StorageRef";
  }
  subs() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.memory(),
      StorageLocationProvider.calldata()
    ];
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.memory(),
    ];
  }
  same(t : StorageLocation) : boolean {
    return t instanceof StorageRef || t instanceof StoragePointer;
  }
  copy() : StorageLocation {
    return new StorageRef();
  }
}

export class Memory extends StorageLocation {
  constructor() {
    super(DataLocation.Memory);
  }
  str() : string {
    return "Memory";
  }
  subs() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.calldata(),
      StorageLocationProvider.storage_pointer()
    ];
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  same(t : StorageLocation) : boolean {
    return t instanceof Memory;
  }
  copy() : StorageLocation {
    return new Memory();
  }
}

export class Calldata extends StorageLocation {
  constructor() {
    super(DataLocation.CallData);
  }
  str() : string {
    return "Calldata";
  }
  subs() : StorageLocation[] {
    return [StorageLocationProvider.calldata()];
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.calldata(),
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  same(t : StorageLocation) : boolean {
    return t instanceof Calldata;
  }
  copy() : StorageLocation {
    return new Calldata();
  }
}

// A special memory. Used to describe the location of struct instance
// inside a struct declaration.
export class MemoryDefault extends StorageLocation {
  constructor() {
    super(DataLocation.Default);
  }
  str() : string {
    return "MemoryDefault";
  }
  subs() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.calldata(),
      StorageLocationProvider.storage_pointer()
    ];
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  same(t : StorageLocation) : boolean {
    return t instanceof MemoryDefault;
  }
  copy() : StorageLocation {
    return new MemoryDefault();
  }
}

export class StorageLocationProvider {
  private static m_storage_pointer : StoragePointer = new StoragePointer();
  private static m_storage_ref : StorageRef = new StorageRef();
  private static m_memory_location : Memory = new Memory();
  private static m_calldata_location : Calldata = new Calldata();
  private static m_memory_default_lcoation : MemoryDefault = new MemoryDefault();
  static storage_pointer() : StoragePointer {
    return this.m_storage_pointer;
  }
  static storage_ref() : StorageRef {
    return this.m_storage_ref;
  }
  static memory() : Memory {
    return this.m_memory_location;
  }
  static calldata() : Calldata {
    return this.m_calldata_location;
  }
  static memory_default() : MemoryDefault {
    return this.m_memory_default_lcoation;
  }
}

export const all_storage_locations = [
  StorageLocationProvider.storage_pointer(),
  StorageLocationProvider.storage_ref(),
  StorageLocationProvider.memory(),
  StorageLocationProvider.calldata(),
  StorageLocationProvider.memory_default()
];

export function range_of_locs(loc : StorageLocation[], how_is_loc_dominated : "sub" | "super" | "equal" | "same") : StorageLocation[] {
  if (how_is_loc_dominated === "sub") {
    return [...new Set(loc.flatMap(l => l.supers()))] as StorageLocation[];
  }
  if (how_is_loc_dominated === "super") {
    return [...new Set(loc.flatMap(l => l.subs()))] as StorageLocation[];
  }
  if (how_is_loc_dominated === "equal") {
    return [...new Set(loc.flatMap(l => l.equivalents()))] as StorageLocation[];
  }
  return [...new Set(loc.flatMap(l =>
    l === StorageLocationProvider.storage_pointer() ||
      l === StorageLocationProvider.storage_ref() ? [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref()
    ] : [l]
  ))];
}