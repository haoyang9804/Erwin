import * as ct from "../src/constrant"

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
  dag.connect(2, 3);
  dag.connect(0, 6);
  dag.connect(3, 4);
  dag.connect(4, 5);
  dag.connect(5, 6);
  dag.connect(1, 5);
  const heads = dag.preprocess();
  expect(heads.size).toBe(1);
  expect(heads.values().next().value).toBe(0);
  expect(dag.dag_nodes[0].depth).toBe(0);
  expect(dag.dag_nodes[2].depth).toBe(1);
  expect(dag.dag_nodes[3].depth).toBe(2);
  expect(dag.dag_nodes[4].depth).toBe(3);
  expect(dag.dag_nodes[5].depth).toBe(4);
  expect(dag.dag_nodes[6].depth).toBe(5);
  expect(dag.dag_nodes[1].depth).toBe(3);
}
)