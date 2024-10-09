import { TypeDominanceDAG } from "../src/constraint";
import { uinteger_types } from "../src/type";
import { config } from "../src/config";
config.unit_test_mode = true;
test("test dominance dag 1",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 4);
  type_dag.connect(4, 5);
  type_dag.connect(1, 3);
  type_dag.connect(3, 5, "sub_dominance");
  type_dag.resolve_by_stream();
  type_dag.verify();
}
)

test("test dominance dag 2",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.insert(type_dag.newNode(6), uinteger_types);
  type_dag.insert(type_dag.newNode(7), uinteger_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 3);
  type_dag.connect(3, 4);
  type_dag.connect(3, 7, "sub_dominance");
  type_dag.connect(1, 5);
  type_dag.connect(5, 6, "sub_dominance");
  type_dag.connect(6, 4);
  type_dag.resolve_by_stream();
  type_dag.verify();
}
)

test("test dominance dag 3",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.insert(type_dag.newNode(6), uinteger_types);
  type_dag.insert(type_dag.newNode(7), uinteger_types);
  type_dag.insert(type_dag.newNode(8), uinteger_types);
  type_dag.insert(type_dag.newNode(9), uinteger_types);
  type_dag.insert(type_dag.newNode(10), uinteger_types);
  type_dag.insert(type_dag.newNode(11), uinteger_types);
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
  type_dag.resolve_by_stream();
  type_dag.verify();
}
)

test("test dominance dag 4",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.insert(type_dag.newNode(6), uinteger_types);
  type_dag.insert(type_dag.newNode(7), uinteger_types);
  type_dag.insert(type_dag.newNode(8), uinteger_types);
  type_dag.insert(type_dag.newNode(9), uinteger_types);
  type_dag.insert(type_dag.newNode(10), uinteger_types);
  type_dag.insert(type_dag.newNode(11), uinteger_types);
  type_dag.insert(type_dag.newNode(12), uinteger_types);
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
  type_dag.resolve_by_stream();
  type_dag.verify();
}
)


test("test dominance pyramids 1",
// graph: constraintDAGs/constraint2
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.insert(type_dag.newNode(6), uinteger_types);
  type_dag.connect(4, 1);
  type_dag.connect(4, 2, "sub_dominance");
  type_dag.connect(5, 2);
  type_dag.connect(5, 3);
  type_dag.connect(6, 1);
  type_dag.connect(6, 3);
  type_dag.initialize_resolve();
  type_dag.get_roots_and_leaves();
  type_dag.dfs4node2leaf();
  type_dag.dfs4edge2leaf();
  type_dag.remove_removable_sub_super_dominance_in_multi_dominance();
  type_dag.node2leaf.clear();
  type_dag.dfs4node2leaf();
  type_dag.build_leaves_relation();
  type_dag.remove_removable_sub_super_dominance_in_pyramid();
  type_dag.node2leaf.clear();
  type_dag.dfs4node2leaf(); 
  expect(type_dag.sub_dominance.size).toBe(0);
}
)

test("test dominance pyramids 2",
  // graph: constraintDAGs/constraint3
  () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(type_dag.newNode(1), uinteger_types);
    type_dag.insert(type_dag.newNode(2), uinteger_types);
    type_dag.insert(type_dag.newNode(3), uinteger_types);
    type_dag.insert(type_dag.newNode(4), uinteger_types);
    type_dag.insert(type_dag.newNode(5), uinteger_types);
    type_dag.insert(type_dag.newNode(6), uinteger_types);
    type_dag.insert(type_dag.newNode(7), uinteger_types);
    type_dag.connect(4, 1);
    type_dag.connect(4, 7);
    type_dag.connect(7, 2, "sub_dominance");
    type_dag.connect(5, 2);
    type_dag.connect(5, 3);
    type_dag.connect(6, 1);
    type_dag.connect(6, 3);
    type_dag.initialize_resolve();
    type_dag.get_roots_and_leaves();
    type_dag.dfs4node2leaf();
    type_dag.dfs4edge2leaf();
    type_dag.remove_removable_sub_super_dominance_in_multi_dominance();
    type_dag.node2leaf.clear();
    type_dag.dfs4node2leaf();
    type_dag.build_leaves_relation();
    type_dag.remove_removable_sub_super_dominance_in_pyramid();
    type_dag.node2leaf.clear();
    type_dag.dfs4node2leaf();
    expect(type_dag.sub_dominance.size).toBe(0);
  }
)

test("test dominance pyramids 3",
  // mutation of test dominance pyramids 2
  () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(type_dag.newNode(1), uinteger_types);
    type_dag.insert(type_dag.newNode(2), uinteger_types);
    type_dag.insert(type_dag.newNode(3), uinteger_types);
    type_dag.insert(type_dag.newNode(4), uinteger_types);
    type_dag.insert(type_dag.newNode(5), uinteger_types);
    type_dag.insert(type_dag.newNode(6), uinteger_types);
    type_dag.insert(type_dag.newNode(7), uinteger_types);
    type_dag.connect(4, 1);
    type_dag.connect(4, 7, "sub_dominance");
    type_dag.connect(7, 2, "sub_dominance");
    type_dag.connect(5, 2);
    type_dag.connect(5, 3);
    type_dag.connect(6, 1);
    type_dag.connect(6, 3);
    type_dag.initialize_resolve();
    type_dag.get_roots_and_leaves();
    type_dag.dfs4node2leaf();
    type_dag.dfs4edge2leaf();
    type_dag.remove_removable_sub_super_dominance_in_multi_dominance();
    type_dag.node2leaf.clear();
    type_dag.dfs4node2leaf();
    type_dag.build_leaves_relation();
    type_dag.remove_removable_sub_super_dominance_in_pyramid();
    type_dag.node2leaf.clear();
    type_dag.dfs4node2leaf();
    expect(type_dag.sub_dominance.size).toBe(0);
  }
)
   
test("test dominance multi-dominance",
  // graph: constraintDAGs/constraint1
  () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(type_dag.newNode(1), uinteger_types);
    type_dag.insert(type_dag.newNode(2), uinteger_types);
    type_dag.insert(type_dag.newNode(3), uinteger_types);
    type_dag.insert(type_dag.newNode(4), uinteger_types);
    type_dag.insert(type_dag.newNode(5), uinteger_types);
    type_dag.connect(1, 2);
    type_dag.connect(1, 3, "sub_dominance");
    type_dag.connect(3, 4, "sub_dominance");
    type_dag.connect(4, 2);
    type_dag.connect(4, 5);
    type_dag.initialize_resolve();
    type_dag.get_roots_and_leaves();
    type_dag.dfs4node2leaf();
    type_dag.dfs4edge2leaf();
    type_dag.remove_removable_sub_super_dominance_in_multi_dominance();
    type_dag.node2leaf.clear();
    type_dag.dfs4node2leaf();
    expect(type_dag.sub_dominance.size).toBe(0);
  }
)

test("test neutralization",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.connect(1, 2, "super_dominance");
  type_dag.connect(2, 3, "sub_dominance");
  type_dag.initialize_resolve();
  type_dag.get_roots_and_leaves();
  type_dag.neutralize_super_and_sub();
  expect(type_dag.sub_dominance.size).toBe(0);
  expect(type_dag.super_dominance.size).toBe(0);
}
)

test("test shrink graph 1",
async () => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.insert(type_dag.newNode(5), uinteger_types);
  type_dag.insert(type_dag.newNode(6), uinteger_types);
  type_dag.insert(type_dag.newNode(7), uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 3, "sub_dominance");
  type_dag.connect(2, 4);
  type_dag.connect(1, 5, "sub_dominance");
  type_dag.connect(1, 6);
  type_dag.connect(6, 5);
  type_dag.connect(1, 7, "super_dominance");
  type_dag.relevant_nodes.add(5);
  type_dag.relevant_nodes.add(2);
  type_dag.relevant_nodes.add(3);
  type_dag.relevant_nodes.add(7);
  type_dag.relevant_nodes.add(6);
  type_dag.initialize_resolve();
  type_dag.get_roots_and_leaves();
  await type_dag.draw("./test_shink_graph1_before_shrink.svg");
  type_dag.dfs4node2leaf();
  type_dag.dfs4edge2leaf();
  type_dag.remove_removable_sub_super_dominance_in_multi_dominance();
  type_dag.node2leaf.clear();
  type_dag.dfs4node2leaf();
  type_dag.build_leaves_relation();
  type_dag.remove_removable_sub_super_dominance_in_pyramid();
  type_dag.node2leaf.clear();
  type_dag.dfs4node2leaf();
  await type_dag.shrink_graph();
  type_dag.get_roots_and_leaves();
  await type_dag.draw("./test_shink_graph2_after_shrink.svg");
}
)

test("test shrink graph 2",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1), uinteger_types);
  type_dag.insert(type_dag.newNode(2), uinteger_types);
  type_dag.insert(type_dag.newNode(3), uinteger_types);
  type_dag.insert(type_dag.newNode(4), uinteger_types);
  type_dag.connect(1, 2);
  type_dag.connect(2, 3, "sub_dominance");
  type_dag.connect(2, 4);
  type_dag.connect(1, 3, "sub_dominance");
  type_dag.connect(1, 4);
  type_dag.resolve_by_stream();
  type_dag.verify();
}
)

test("test resolve 1",
async () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(type_dag.newNode(1), uinteger_types);
    type_dag.insert(type_dag.newNode(2), uinteger_types);
    type_dag.insert(type_dag.newNode(3), uinteger_types);
    type_dag.insert(type_dag.newNode(4), uinteger_types);
    type_dag.insert(type_dag.newNode(5), uinteger_types);
    type_dag.insert(type_dag.newNode(6), uinteger_types);
    type_dag.connect(1, 2);
    type_dag.connect(2, 3);
    type_dag.connect(1, 3);
    type_dag.connect(1, 4);
    type_dag.connect(4, 3);
    type_dag.connect(4, 5);
    type_dag.connect(5, 6);
    type_dag.connect(4, 6);
    type_dag.connect(1, 6);
    await type_dag.resolve_by_stream();
    type_dag.verify();
  }
)

test("test resolve 2",
  async () => {
      const type_dag = new TypeDominanceDAG();
      type_dag.insert(type_dag.newNode(1), uinteger_types);
      type_dag.insert(type_dag.newNode(2), uinteger_types);
      type_dag.insert(type_dag.newNode(3), uinteger_types);
      type_dag.insert(type_dag.newNode(4), uinteger_types);
      type_dag.insert(type_dag.newNode(5), uinteger_types);
      type_dag.insert(type_dag.newNode(6), uinteger_types);
      type_dag.insert(type_dag.newNode(7), uinteger_types);
      type_dag.insert(type_dag.newNode(8), uinteger_types);
      type_dag.connect(1, 2);
      type_dag.connect(1, 3);
      type_dag.connect(3, 2);
      type_dag.connect(1, 4);
      type_dag.connect(4, 2);
      type_dag.connect(5, 4);
      type_dag.connect(4, 6);
      type_dag.connect(5, 6);
      type_dag.connect(7, 2);
      type_dag.connect(7, 8);
      await type_dag.resolve_by_stream();
      type_dag.verify();
    }
  )