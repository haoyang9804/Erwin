import { DataLocation } from "solc-typed-ast";
import { DominanceNode } from "./dominance";

export abstract class StorageLocation extends DominanceNode<DataLocation> { }

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
    return t instanceof StoragePointer;
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
    return t instanceof StorageRef;
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
  private static m_storage_pointer : StorageLocation = new StoragePointer();
  private static m_storage_ref : StorageLocation = new StorageRef();
  private static m_memory_location : StorageLocation = new Memory();
  private static m_calldata_location : StorageLocation = new Calldata();
  private static m_memory_default_lcoation : StorageLocation = new MemoryDefault();
  static storage_pointer() : StorageLocation {
    return this.m_storage_pointer;
  }
  static storage_ref() : StorageLocation {
    return this.m_storage_ref;
  }
  static memory() : StorageLocation {
    return this.m_memory_location;
  }
  static calldata() : StorageLocation {
    return this.m_calldata_location;
  }
  static memory_default() : StorageLocation {
    return this.m_memory_default_lcoation;
  }
}