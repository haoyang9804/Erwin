import * as ct from "../src/constrant"
import { varID2Types, ElementaryType, all_integer_types, all_elementary_types } from "../src/type"

test('test dependence DAG 1',
() => {
  const nd1 = new ct.ConstaintNode(0);
  const nd2 = new ct.ConstaintNode(1);
  const nd3 = new ct.ConstaintNode(2);
  const nd4 = new ct.ConstaintNode(3);
  const nd5 = new ct.ConstaintNode(4);
  const nd6 = new ct.ConstaintNode(5);
  const nd7 = new ct.ConstaintNode(6);
  const dag = new ct.ForwardTypeDependenceDAG();
  dag.insert(nd1);
  dag.insert(nd2);
  dag.insert(nd3);
  dag.insert(nd4);
  dag.insert(nd5);
  dag.insert(nd6);
  dag.insert(nd7);
  dag.connect(0, 2);
  dag.connect(2, 3, "weak");
  dag.connect(0, 6);
  dag.connect(3, 4);
  dag.connect(4, 5, "weak");
  dag.connect(5, 6);
  dag.connect(1, 5);
  dag.get_heads();
  expect(dag.real_heads.size).toBe(1);
  expect(dag.real_heads.values().next().value).toBe(0);
  expect(dag.dag_nodes[0].depth).toBe(0);
  expect(dag.dag_nodes[2].depth).toBe(1);
  expect(dag.dag_nodes[3].depth).toBe(2);
  expect(dag.dag_nodes[4].depth).toBe(3);
  expect(dag.dag_nodes[5].depth).toBe(4);
  expect(dag.dag_nodes[6].depth).toBe(5);
  expect(dag.dag_nodes[1].depth).toBe(3);

  expect(dag.weak.size).toBe(2);
  expect(dag.weak.has("2 3")).toBe(true);
  expect(dag.weak.has("4 5")).toBe(true);

  varID2Types.set(0, all_integer_types);
  varID2Types.set(1, all_elementary_types);

  // should first resolve_heads
  expect(async () => { dag.resolve(); }).rejects.toThrow();

  let heads_typemap_array = dag.resolve_heads();
  expect(heads_typemap_array[0].size).toBe(1);
  for (let typemap of heads_typemap_array) {
    dag.init_resolution();
    for (let [key, value] of typemap) {
      dag.resolved_types.set(key, value);
      dag.dag_nodes[key].resolved = true;
    }
    dag.resolve();
    dag.verify();
  }
}
)
test('test dependence DAG 2',
() => {
  const nd1 = new ct.ConstaintNode(0);
  const nd2 = new ct.ConstaintNode(1);
  const nd3 = new ct.ConstaintNode(2);
  const nd4 = new ct.ConstaintNode(3);
  const nd5 = new ct.ConstaintNode(4);
  const dag = new ct.ForwardTypeDependenceDAG();
  dag.insert(nd1);
  dag.insert(nd2);
  dag.insert(nd3);
  dag.insert(nd4);
  dag.insert(nd5);
  dag.connect(0, 1, "weak");
  dag.connect(3, 2, "weak");
  dag.connect(2, 1, "weak");
  dag.connect(4, 3, "weak");
  dag.get_heads();
  expect(dag.real_heads.size).toBe(1);
  expect(dag.real_heads.values().next().value).toBe(4);
  expect(dag.dag_nodes[0].depth).toBe(2);
  expect(dag.dag_nodes[1].depth).toBe(3);
  expect(dag.dag_nodes[2].depth).toBe(2);
  expect(dag.dag_nodes[3].depth).toBe(1);
  expect(dag.dag_nodes[4].depth).toBe(0);

  expect(dag.weak.size).toBe(4);
  expect(dag.weak.has("0 1")).toBe(true);
  expect(dag.weak.has("3 2")).toBe(true);
  expect(dag.weak.has("2 1")).toBe(true);
  expect(dag.weak.has("4 3")).toBe(true);

  varID2Types.set(4, all_integer_types);
  varID2Types.set(0, all_elementary_types);

  // should first resolve_heads
  expect(async () => { dag.resolve(); }).rejects.toThrow();

  let heads_typemap_array = dag.resolve_heads();
  expect(heads_typemap_array[0].size).toBe(1);
  for (let typemap of heads_typemap_array) {
    dag.init_resolution();
    for (let [key, value] of typemap) {
      dag.resolved_types.set(key, value);
      dag.dag_nodes[key].resolved = true;
    }
    dag.resolve();
    dag.verify();
  }
}
)