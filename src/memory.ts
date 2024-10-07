import { DataLocation } from "solc-typed-ast";
import { DominanceNode } from "./dominance";

export abstract class StorageLocation extends DominanceNode<DataLocation> { }

export class StoragePointer extends StorageLocation {
  constructor() {
    super(DataLocation.Storage);
  }
  str() : string {
    throw new Error("Method not implemented.");
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
    return this.supers().includes(t) && !this.same(t);
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().includes(t) && !this.same(t);
  }
}

export class StorageRef extends StorageLocation {
  constructor() {
    super(DataLocation.Storage);
  }
  str() : string {
    throw new Error("Method not implemented.");
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
    return this.supers().includes(t) && !this.same(t);
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().includes(t) && !this.same(t);
  }
}

export class Memory extends StorageLocation {
  constructor() {
    super(DataLocation.Memory);
  }
  str() : string {
    throw new Error("Method not implemented.");
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
    return this.supers().includes(t) && !this.same(t);
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().includes(t) && !this.same(t);
  }
}

export class Calldata extends StorageLocation {
  constructor() {
    super(DataLocation.CallData);
  }
  str() : string {
    throw new Error("Method not implemented.");
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
    return this.supers().includes(t) && !this.same(t);
  }
  issuperof(t : StorageLocation) : boolean {
    return this.subs().includes(t) && !this.same(t);
  }
}

export class StorageLocationProvider {
  private static m_storage_pointer : StorageLocation = new StoragePointer();
  private static m_storage_ref : StorageLocation = new StorageRef();
  private static m_memory_location : StorageLocation = new Memory();
  private static m_calldata_location : StorageLocation = new Calldata();
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
}