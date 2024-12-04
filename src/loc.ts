import { DataLocation } from "solc-typed-ast";
import { DominanceNode } from "./dominance";

export abstract class StorageLocation extends DominanceNode<DataLocation> {}

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
  sub_with_lowerbound(lower_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.memory()
    ];
  }
  super_with_upperbound(upper_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  same(t : StorageLocation) : boolean {
    return t instanceof StoragePointer || t instanceof StorageRef;
  }
  copy() : StorageLocation {
    return new StoragePointer();
  }
  issubof(t : StorageLocation) : boolean {
    return this.supers().some(g => g.same(t));
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().some(g => g.same(t));
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
  sub_with_lowerbound(lower_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
      StorageLocationProvider.memory(),
    ];
  }
  super_with_upperbound(upper_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  same(t : StorageLocation) : boolean {
    return t instanceof StorageRef || t instanceof StoragePointer;
  }
  copy() : StorageLocation {
    return new StorageRef();
  }
  issubof(t : StorageLocation) : boolean {
    return this.supers().some(g => g.same(t));
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().some(g => g.same(t));
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
  sub_with_lowerbound(lower_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  super_with_upperbound(upper_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  same(t : StorageLocation) : boolean {
    return t instanceof Memory;
  }
  copy() : StorageLocation {
    return new Memory();
  }
  issubof(t : StorageLocation) : boolean {
    return this.supers().some(g => g.same(t));
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().some(g => g.same(t));
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
  sub_with_lowerbound(lower_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.calldata(),
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  super_with_upperbound(upper_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  same(t : StorageLocation) : boolean {
    return t instanceof Calldata;
  }
  copy() : StorageLocation {
    return new Calldata();
  }
  issubof(t : StorageLocation) : boolean {
    return this.supers().some(g => g.same(t));
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().some(g => g.same(t));
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
  sub_with_lowerbound(lower_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  supers() : StorageLocation[] {
    return [
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_ref(),
    ];
  }
  super_with_upperbound(upper_bound : StorageLocation) : StorageLocation[] {
    throw new Error("Method not implemented.");
  }
  same(t : StorageLocation) : boolean {
    return t instanceof MemoryDefault;
  }
  copy() : StorageLocation {
    return new MemoryDefault();
  }
  issubof(t : StorageLocation) : boolean {
    return this.supers().some(g => g.same(t));
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().some(g => g.same(t));
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

export function range_of_locs(loc : StorageLocation[], how_is_loc_dominated : "sub" | "super" | "equal") : StorageLocation[] {
  if (how_is_loc_dominated === "sub") {
    return [...new Set(loc.flatMap(l => l.supers()))] as StorageLocation[];
  }
  if (how_is_loc_dominated === "super") {
    return [...new Set(loc.flatMap(l => l.subs()))] as StorageLocation[];
  }
  return [...new Set(loc.flatMap(l => l.equivalents() as StorageLocation[]))] as StorageLocation[];
}