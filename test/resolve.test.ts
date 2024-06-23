import { TypeDominanceDAG } from "../src/constraint";
import { all_integer_types } from "../src/type";

test("test type dominance dag 1",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1));
  type_dag.insert(type_dag.newNode(2));
  type_dag.insert(type_dag.newNode(3));
  type_dag.insert(type_dag.newNode(4));
  type_dag.insert(type_dag.newNode(5));
  type_dag.solution_range.set(1, all_integer_types);
  type_dag.solution_range.set(2, all_integer_types);
  type_dag.solution_range.set(3, all_integer_types);
  type_dag.solution_range.set(4, all_integer_types);
  type_dag.solution_range.set(5, all_integer_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 4);
  type_dag.connect(4, 5);
  type_dag.connect(1, 3);
  type_dag.connect(3, 5, "sub_dominance");
  type_dag.resolve_by_chunk();
  type_dag.verify();
}
)