import * as ct from "../src/constraint"
import * as type from "../src/type"


test('test dependence DAG 1',
() => {
  /*
  decl u = literal;
  decl v = literal;
  u = u + v;
  v += v + u;
  */
  const nd1 = new ct.ConstaintNode(1);
  const nd2 = new ct.ConstaintNode(2);
  const nd3 = new ct.ConstaintNode(3);
  const nd4 = new ct.ConstaintNode(4);
  const nd5 = new ct.ConstaintNode(5);
  const nd6 = new ct.ConstaintNode(6);
  const nd7 = new ct.ConstaintNode(7);
  const nd8 = new ct.ConstaintNode(8);
  const nd9 = new ct.ConstaintNode(9);
  const nd10 = new ct.ConstaintNode(10);
  const nd11 = new ct.ConstaintNode(11);
  const nd12 = new ct.ConstaintNode(12);
  const nd13 = new ct.ConstaintNode(13);
  const nd14 = new ct.ConstaintNode(14);
  const dag = new ct.TypeDominanceDAG();
  dag.insert(nd1);
  dag.insert(nd2);
  dag.insert(nd3);
  dag.insert(nd4);
  dag.insert(nd5);
  dag.insert(nd6);
  dag.insert(nd7);
  dag.insert(nd8);
  dag.insert(nd9);
  dag.insert(nd10);
  dag.insert(nd11);
  dag.insert(nd12);
  dag.insert(nd13);
  dag.insert(nd14);
  dag.connect(5, 6);
  dag.connect(6, 7, "subtype");
  dag.connect(7, 8);
  dag.connect(8, 9, "subtype");
  dag.connect(9, 3);
  dag.connect(4, 3, "supertype");
  dag.connect(2, 1, "supertype");
  dag.connect(6, 1);
  dag.connect(8, 1);
  dag.connect(14, 1);
  dag.connect(13, 3);
  dag.connect(11, 3);
  dag.connect(10, 11);
  dag.connect(11, 12, "subtype");
  dag.connect(12, 13);
  dag.connect(13, 14, "subtype");

  type.irnode2types.set(2, type.all_literal_types); // 15
  type.irnode2types.set(4, type.all_literal_types); // 15
  type.irnode2types.set(5, type.all_integer_types); // 12
  type.irnode2types.set(10, type.all_integer_types); // 12

  dag.resolve();
  dag.verify();
})

test('test dependence DAG 2',
() => {
  /*
  decl u = literal;
  u = u + u;
  */
  const nd1 = new ct.ConstaintNode(1);
  const nd2 = new ct.ConstaintNode(2);
  const nd3 = new ct.ConstaintNode(3);
  const nd4 = new ct.ConstaintNode(4);
  const nd5 = new ct.ConstaintNode(5);
  const nd6 = new ct.ConstaintNode(6);
  const nd7 = new ct.ConstaintNode(7);
  const dag = new ct.TypeDominanceDAG();
  dag.insert(nd1);
  dag.insert(nd2);
  dag.insert(nd3);
  dag.insert(nd4);
  dag.insert(nd5);
  dag.insert(nd6);
  dag.insert(nd7);
  dag.connect(2, 1, "supertype");
  dag.connect(3, 4);
  dag.connect(4, 1);
  dag.connect(4, 5, "subtype");
  dag.connect(5, 1);
  dag.connect(5, 6);
  dag.connect(6, 7, "subtype");
  dag.connect(7, 1);
  type.irnode2types.set(3, type.all_elementary_types);
  type.irnode2types.set(2, type.all_literal_types);
  dag.resolve();
  dag.verify();
})