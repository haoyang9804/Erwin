import { TypeDominanceDAG } from "../src/constraint";
import { uinteger_types } from "../src/type";
import { config } from "../src/config";
config.unit_test_mode = true;
test("test dominance dag 1",
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 4);
  type_dag.connect(4, 5);
  type_dag.connect(1, 3);
  type_dag.connect(3, 5, "sub_dominance");
  await type_dag.resolve();
  type_dag.verify();
}
)

test("test dominance dag 2",
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.insert(7, uinteger_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 3);
  type_dag.connect(3, 4);
  type_dag.connect(3, 7, "sub_dominance");
  type_dag.connect(1, 5);
  type_dag.connect(5, 6, "sub_dominance");
  type_dag.connect(6, 4);
  await type_dag.resolve();
  type_dag.verify();
}
)

test("test dominance dag 3",
async () => {
  const type_dag = new TypeDominanceDAG();
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
  type_dag.connect(1, 3, "sub_dominance");
  type_dag.connect(1, 2);
  type_dag.connect(3, 4);
  type_dag.connect(4, 5, "sub_dominance");
  type_dag.connect(6, 1);
  type_dag.connect(7, 6, "sub_dominance");
  type_dag.connect(7, 8);
  type_dag.connect(8, 9);
  type_dag.connect(4, 9);
  type_dag.connect(10, 7);
  type_dag.connect(11, 10, "sub_dominance");
  type_dag.connect(11, 9);
  await type_dag.resolve();
  type_dag.verify();
}
)

test("test dominance dag 4",
async () => {
  const type_dag = new TypeDominanceDAG();
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
  type_dag.connect(2, 4, "sub_dominance");
  type_dag.connect(4, 5);
  type_dag.connect(5, 6);
  type_dag.connect(6, 3);
  type_dag.connect(5, 7, "sub_dominance");
  type_dag.connect(7, 8);
  type_dag.connect(8, 9);
  type_dag.connect(8, 10, "sub_dominance");
  type_dag.connect(10, 11);
  type_dag.connect(11, 3);
  type_dag.connect(11, 12, "sub_dominance");
  await type_dag.resolve();
  type_dag.verify();
}
)


test("test dominance pyramids 1",
// graph: constraintDAGs/constraint2
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.insert(4, uinteger_types);
  type_dag.insert(5, uinteger_types);
  type_dag.insert(6, uinteger_types);
  type_dag.connect(4, 1);
  type_dag.connect(4, 2, "sub_dominance");
  type_dag.connect(5, 2);
  type_dag.connect(5, 3);
  type_dag.connect(6, 1);
  type_dag.connect(6, 3);
  await type_dag.resolve();
  type_dag.verify();
}
)

test("test dominance pyramids 2",
  // graph: constraintDAGs/constraint3
async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.insert(4, uinteger_types);
    type_dag.insert(5, uinteger_types);
    type_dag.insert(6, uinteger_types);
    type_dag.insert(7, uinteger_types);
    type_dag.connect(4, 1);
    type_dag.connect(4, 7);
    type_dag.connect(7, 2, "sub_dominance");
    type_dag.connect(5, 2);
    type_dag.connect(5, 3);
    type_dag.connect(6, 1);
    type_dag.connect(6, 3);
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test dominance pyramids 3",
  // mutation of test dominance pyramids 2
async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.insert(4, uinteger_types);
    type_dag.insert(5, uinteger_types);
    type_dag.insert(6, uinteger_types);
    type_dag.insert(7, uinteger_types);
    type_dag.connect(4, 1);
    type_dag.connect(4, 7, "sub_dominance");
    type_dag.connect(7, 2, "sub_dominance");
    type_dag.connect(5, 2);
    type_dag.connect(5, 3);
    type_dag.connect(6, 1);
    type_dag.connect(6, 3);
    await type_dag.resolve();
    type_dag.verify();
  }
)
   
test("test dominance multi-dominance",
  // graph: constraintDAGs/constraint1
async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.insert(4, uinteger_types);
    type_dag.insert(5, uinteger_types);
    type_dag.connect(1, 2);
    type_dag.connect(1, 3, "sub_dominance");
    type_dag.connect(3, 4, "sub_dominance");
    type_dag.connect(4, 2);
    type_dag.connect(4, 5);
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test resolve 1",
async () => {
    const type_dag = new TypeDominanceDAG();
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
  }
)

test("test resolve 2",
async () => {
    const type_dag = new TypeDominanceDAG();
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
  }
)

test("test resolve 3",
async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.insert(4, uinteger_types);
    type_dag.connect(1, 2, "sub_dominance");
    type_dag.connect(3, 2, "super_dominance");
    type_dag.connect(4, 3);
    type_dag.connect(4, 2, "super_dominance");
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test resolve 4",
  async () => {
      const type_dag = new TypeDominanceDAG();
      type_dag.insert(1, uinteger_types);
      type_dag.insert(2, uinteger_types);
      type_dag.insert(3, uinteger_types);
      type_dag.insert(4, uinteger_types);
      type_dag.insert(5, uinteger_types);
      type_dag.connect(1, 2, "super_dominance");
      type_dag.connect(2, 3, "super_dominance");
      type_dag.connect(2, 4);
      type_dag.connect(2, 5, "super_dominance");
      await type_dag.resolve();
      type_dag.verify();
    }
  )

test("test subsuper support 1",
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.insert(3, uinteger_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 3, "super_dominance");
  type_dag.connect(1, 3);
  await type_dag.resolve();
  type_dag.verify();
}
)

test("test subsuper support 2",
  async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.connect(1, 2, "super_dominance");
    type_dag.connect(2, 3, "sub_dominance");
    type_dag.connect(1, 3);
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test subsuper support 3",
  async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.connect(1, 2, "sub_dominance");
    type_dag.connect(2, 3, "super_dominance");
    type_dag.connect(1, 3, "sub_dominance");
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test subsuper support 4",
  async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.connect(1, 2, "sub_dominance");
    type_dag.connect(2, 3, "super_dominance");
    type_dag.connect(1, 3, "super_dominance");
    await type_dag.resolve();
    type_dag.verify();
  }
)

test("test check_property 1",
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(1, uinteger_types);
  type_dag.insert(2, uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 1);
  expect(async() => {
    await type_dag.check_property();
  }).rejects.toThrow("ConstraintDAG: no root");
}
)

test("test check_property 2",
  async () => {
    const type_dag = new TypeDominanceDAG();
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
  }
)

test("test node2leaf 1",
  async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(1, uinteger_types);
    type_dag.insert(2, uinteger_types);
    type_dag.insert(3, uinteger_types);
    type_dag.connect(1, 2, "sub_dominance");
    type_dag.connect(1, 3);
    type_dag.connect(2, 3);
    type_dag.initialize_resolve();
    type_dag.get_roots_and_leaves(false);
    type_dag.dfs4node2leaf();
    for (let [id, leaf_infos] of type_dag.node2leaf) {
      for (const leaf_info of leaf_infos) {
        console.log(`node ${id} dominates leaf ${leaf_info.leaf_id}: sub_dominance: ${leaf_info.sub_dominance}, super_dominance: ${leaf_info.super_dominance}, subsuper_dominance: ${leaf_info.subsuper_dominance}, equal_dominance: ${leaf_info.equal_dominance}`);
      }
    }
  }
)