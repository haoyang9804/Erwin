import { type_dag, storage_location_dag, TypeConstraintDAG } from "../src/constraint";
import { ArrayType, Type, TypeProvider, uinteger_types } from "../src/type";
import { config } from "../src/config";
import { StorageLocationProvider} from "../src/loc";
config.unit_test_mode = true;
test("test constraint dag 1",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(2, 4);
  type_dag.connect(4, 5);
  type_dag.connect(1, 3);
  type_dag.connect(3, 5, "sub");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test constraint dag 2",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(2, 3);
  type_dag.connect(3, 4);
  type_dag.connect(3, 7, "sub");
  type_dag.connect(1, 5);
  type_dag.connect(5, 6, "sub");
  type_dag.connect(6, 4);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test constraint dag 3",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.insert(8, uinteger_types);
  type_dag.insert(9, uinteger_types);
  type_dag.insert(10, uinteger_types);
  type_dag.insert(11, uinteger_types);
  type_dag.connect(1, 3, "sub");
  type_dag.connect(1, 2);
  type_dag.connect(3, 4);
  type_dag.connect(4, 5, "sub");
  type_dag.connect(6, 1);
  type_dag.connect(7, 6, "sub");
  type_dag.connect(7, 8);
  type_dag.connect(8, 9);
  type_dag.connect(4, 9);
  type_dag.connect(10, 7);
  type_dag.connect(11, 10, "sub");
  type_dag.connect(11, 9);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test constraint dag 4",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.insert(8, uinteger_types);
  type_dag.insert(9, uinteger_types);
  type_dag.insert(10, uinteger_types);
  type_dag.insert(11, uinteger_types);
  type_dag.insert(12, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 3);
  type_dag.connect(2, 4, "sub");
  type_dag.connect(4, 5);
  type_dag.connect(5, 6);
  type_dag.connect(6, 3);
  type_dag.connect(5, 7, "sub");
  type_dag.connect(7, 8);
  type_dag.connect(8, 9);
  type_dag.connect(8, 10, "sub");
  type_dag.connect(10, 11);
  type_dag.connect(11, 3);
  type_dag.connect(11, 12, "sub");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)


test("test constraint pyramids 1",
// graph: constraintDAGs/constraint2
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.connect(4, 1);
  type_dag.connect(4, 2, "sub");
  type_dag.connect(5, 2);
  type_dag.connect(5, 3);
  type_dag.connect(6, 1);
  type_dag.connect(6, 3);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test constraint pyramids 2",
  // graph: constraintDAGs/constraint3
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.connect(4, 1);
  type_dag.connect(4, 7);
  type_dag.connect(7, 2, "sub");
  type_dag.connect(5, 2);
  type_dag.connect(5, 3);
  type_dag.connect(6, 1);
  type_dag.connect(6, 3);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test constraint pyramids 3",
  // mutation of test constraint pyramids 2
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.connect(4, 1);
  type_dag.connect(4, 7, "sub");
  type_dag.connect(7, 2, "sub");
  type_dag.connect(5, 2);
  type_dag.connect(5, 3);
  type_dag.connect(6, 1);
  type_dag.connect(6, 3);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)
   
test("test constraint multi-constraint",
  // graph: constraintDAGs/constraint1
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(1, 3, "sub");
  type_dag.connect(3, 4, "sub");
  type_dag.connect(4, 2);
  type_dag.connect(4, 5);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test resolve 1",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 3);
  type_dag.connect(1, 3);
  type_dag.connect(1, 4);
  type_dag.connect(4, 3);
  type_dag.connect(4, 5);
  type_dag.connect(5, 6);
  type_dag.connect(4, 6);
  type_dag.connect(1, 6);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test resolve 2",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.insert(8, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(1, 3);
  type_dag.connect(3, 2);
  type_dag.connect(1, 4);
  type_dag.connect(4, 2);
  type_dag.connect(4, 6);
  type_dag.connect(5, 6);
  type_dag.connect(7, 2);
  type_dag.connect(7, 8);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test resolve 3",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(3, 2, "super");
  type_dag.connect(4, 3);
  type_dag.connect(4, 2, "super");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test resolve 4",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.connect(1, 2, "super");
  type_dag.connect(2, 3, "super");
  type_dag.connect(2, 4);
  type_dag.connect(2, 5, "super");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test subsuper support 1",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(2, 3, "super");
  type_dag.connect(1, 3);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test subsuper support 2",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.connect(1, 2, "super");
  type_dag.connect(2, 3, "sub");
  type_dag.connect(1, 3);
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test subsuper support 3",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(2, 3, "super");
  type_dag.connect(1, 3, "sub");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test subsuper support 4",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.connect(1, 2, "sub");
  type_dag.connect(2, 3, "super");
  type_dag.connect(1, 3, "super");
  await type_dag.resolve();
  type_dag.verify();
  type_dag.clear();
}
)

test("test check_property 1",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 1);
  expect(async() => {
    await type_dag.check_property();
  }).rejects.toThrow("ConstraintDAG: no root");
  type_dag.clear();
}
)

test("test check_property 2",
async () => {
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 3);
  type_dag.connect(3, 2);
  type_dag.connect(3, 4);
  expect(async() => {
    await type_dag.check_property();
  }).rejects.toThrow("ConstraintDAG: node 2 has more than one inbound edge");
  type_dag.clear();
}
)

test("test align storage loc range 1",
async() => {
  storage_location_dag.insert(1, [
    StorageLocationProvider.calldata(),
    StorageLocationProvider.memory(),
    StorageLocationProvider.storage_pointer(),
    StorageLocationProvider.storage_ref()
  ]);
  storage_location_dag.insert(2, [
    StorageLocationProvider.storage_ref()
  ]);
  storage_location_dag.connect(1, 2);
  expect(storage_location_dag.solution_range_of(1)).toEqual(
    [
      StorageLocationProvider.calldata(),
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref(),
    ]
  )
  expect(storage_location_dag.solution_range_of(2)).toEqual(
    [
      StorageLocationProvider.storage_ref()
    ]
  )
  storage_location_dag.clear();
}
)

test("test align storage loc range 2",
async() => {
  storage_location_dag.insert(1, [
    StorageLocationProvider.calldata(),
    StorageLocationProvider.memory(),
    StorageLocationProvider.storage_pointer(),
    StorageLocationProvider.storage_ref()
  ]);
  storage_location_dag.insert(2, [
    StorageLocationProvider.storage_ref()
  ]);
  storage_location_dag.insert(3, storage_location_dag.solution_range_of(2));
  storage_location_dag.connect(3, 2);
  storage_location_dag.connect(3, 1);
  expect(storage_location_dag.solution_range_of(1)).toEqual(
    [
      StorageLocationProvider.calldata(),
      StorageLocationProvider.memory(),
      StorageLocationProvider.storage_pointer(),
      StorageLocationProvider.storage_ref()
    ]
  );
  expect(storage_location_dag.solution_range_of(2)).toEqual(
    [
      StorageLocationProvider.storage_ref()
    ]
  );
  expect(storage_location_dag.solution_range_of(3)).toEqual(
    [
      StorageLocationProvider.storage_ref()
    ]
  );
  storage_location_dag.clear();
}
)

//@ts-ignore
class TestStorageLocationDominanceDAG extends TypeConstraintDAG {
  dominatee_solution_range_should_be_shrinked(dominator_id : number, dominatee_id : number) : Type[] | undefined {
    return super.dominatee_solution_range_should_be_shrinked(dominator_id, dominatee_id);
  }
  dominator_solution_range_should_be_shrinked(dominator_id: number, dominatee_id: number): Type[] | undefined {
    return super.dominator_solution_range_should_be_shrinked(dominator_id, dominatee_id);
  }
}

test("test solution_range_alignment 1",
async () => {
  const nid1 = 1;
  const nid2 = 2;
  type_dag.insert(nid1, [TypeProvider.trivial_array()]);
  const array_type = new ArrayType(TypeProvider.address());
  type_dag.insert(nid2, [array_type]);
  type_dag.connect(nid1, nid2);
  type_dag.solution_range_alignment(nid1, nid2);
  expect(type_dag.solution_range_of(nid1).length).toEqual(1);
  expect(type_dag.solution_range_of(nid1)[0]).toEqual(array_type);
});

test("test solution_range_alignment 2",
async () => {
  const nid1 = 1;
  const nid2 = 2;
  const array_type1 = new ArrayType(TypeProvider.address());
  const array_type2 = new ArrayType(TypeProvider.int128());
  type_dag.insert(nid1, [array_type1, array_type2]);
  type_dag.insert(nid2, [array_type1]);
  type_dag.connect(nid1, nid2);
  type_dag.solution_range_alignment(nid1, nid2);
  expect(type_dag.solution_range_of(nid1).length).toEqual(1);
  expect(type_dag.solution_range_of(nid1)[0]).toEqual(array_type1);
});

test("test solution_range_alignment 3",
async () => {
  const nid1 = 1;
  const nid2 = 2;
  storage_location_dag.insert(nid1, [StorageLocationProvider.memory()]);
  storage_location_dag.insert(nid2, [StorageLocationProvider.memory(), StorageLocationProvider.storage_pointer()]);
  storage_location_dag.connect(nid1, nid2, "super");
  storage_location_dag.solution_range_alignment(nid1, nid2);
  // storage pointer is the "same" as storage ref and storage ref is a super of memory
  expect(storage_location_dag.solution_range_of(nid2).length).toEqual(2);
});