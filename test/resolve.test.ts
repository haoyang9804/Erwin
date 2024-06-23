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

test("test type dominance dag 2",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1));
  type_dag.insert(type_dag.newNode(2));
  type_dag.insert(type_dag.newNode(3));
  type_dag.insert(type_dag.newNode(4));
  type_dag.insert(type_dag.newNode(5));
  type_dag.insert(type_dag.newNode(6));
  type_dag.insert(type_dag.newNode(7));
  type_dag.solution_range.set(1, all_integer_types);
  type_dag.solution_range.set(2, all_integer_types);
  type_dag.solution_range.set(3, all_integer_types);
  type_dag.solution_range.set(4, all_integer_types);
  type_dag.solution_range.set(5, all_integer_types);
  type_dag.solution_range.set(6, all_integer_types);
  type_dag.solution_range.set(7, all_integer_types);
  type_dag.connect(1, 2, "sub_dominance");
  type_dag.connect(2, 3);
  type_dag.connect(3, 4);
  type_dag.connect(3, 7, "sub_dominance");
  type_dag.connect(1, 5);
  type_dag.connect(5, 6, "sub_dominance");
  type_dag.connect(6, 4);
  type_dag.resolve_by_chunk();
  type_dag.verify();
}
)

test("test type dominance dag 3",
() => {
  const type_dag = new TypeDominanceDAG();
  type_dag.insert(type_dag.newNode(1));
  type_dag.insert(type_dag.newNode(2));
  type_dag.insert(type_dag.newNode(3));
  type_dag.insert(type_dag.newNode(4));
  type_dag.insert(type_dag.newNode(5));
  type_dag.insert(type_dag.newNode(6));
  type_dag.insert(type_dag.newNode(7));
  type_dag.insert(type_dag.newNode(8));
  type_dag.insert(type_dag.newNode(9));
  type_dag.insert(type_dag.newNode(10));
  type_dag.insert(type_dag.newNode(11));
  type_dag.solution_range.set(1, all_integer_types);
  type_dag.solution_range.set(2, all_integer_types);
  type_dag.solution_range.set(3, all_integer_types);
  type_dag.solution_range.set(4, all_integer_types);
  type_dag.solution_range.set(5, all_integer_types);
  type_dag.solution_range.set(6, all_integer_types);
  type_dag.solution_range.set(7, all_integer_types);
  type_dag.solution_range.set(8, all_integer_types);
  type_dag.solution_range.set(9, all_integer_types);
  type_dag.solution_range.set(10, all_integer_types);
  type_dag.solution_range.set(11, all_integer_types);
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
  type_dag.resolve_by_chunk();
  type_dag.verify();
}
)

test("test type dominance dag 4",
  () => {
    const type_dag = new TypeDominanceDAG();
    type_dag.insert(type_dag.newNode(1));
    type_dag.insert(type_dag.newNode(2));
    type_dag.insert(type_dag.newNode(3));
    type_dag.insert(type_dag.newNode(4));
    type_dag.insert(type_dag.newNode(5));
    type_dag.insert(type_dag.newNode(6));
    type_dag.insert(type_dag.newNode(7));
    type_dag.insert(type_dag.newNode(8));
    type_dag.insert(type_dag.newNode(9));
    type_dag.insert(type_dag.newNode(10));
    type_dag.insert(type_dag.newNode(11));
    type_dag.insert(type_dag.newNode(12));
    type_dag.solution_range.set(1, all_integer_types);
    type_dag.solution_range.set(2, all_integer_types);
    type_dag.solution_range.set(3, all_integer_types);
    type_dag.solution_range.set(4, all_integer_types);
    type_dag.solution_range.set(5, all_integer_types);
    type_dag.solution_range.set(6, all_integer_types);
    type_dag.solution_range.set(7, all_integer_types);
    type_dag.solution_range.set(8, all_integer_types);
    type_dag.solution_range.set(9, all_integer_types);
    type_dag.solution_range.set(10, all_integer_types);
    type_dag.solution_range.set(11, all_integer_types);
    type_dag.solution_range.set(12, all_integer_types);
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
    type_dag.resolve_by_chunk();
    type_dag.verify();
  }
  )