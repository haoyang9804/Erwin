import { IRTypeDeclare } from "../src/declare";
import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
} from "solc-typed-ast"
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
    DefaultASTWriterMapping,
    formatter,
    LatestCompilerVersion
);

test('test IRTypeDeclare',
() => {
  const ir = new IRTypeDeclare(0, 0, 0, "T", "uint256");
  expect(ir.id).toBe(0);
  expect(ir.scope).toBe(0);
  expect(ir.field_flag).toBe(0);
  expect(ir.name).toBe("T");
  expect(ir.type_name).toBe("uint256");
  expect(writer.write(ir.lower())).toEqual(
    "type T is uint256;");
})