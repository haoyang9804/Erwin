import { ElementaryType, StructType } from "../src/type"
import { IRStructDefinition, IRVariableDeclare } from "../src/declare";
import { IRMemberAccess, IRIdentifier } from "../src/expression";
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

test("test struct",
() => {
  const v1 = new IRVariableDeclare(0, 0, 0, "x")
  v1.type = new ElementaryType("uint256", "nonpayable");
  const v2 = new IRVariableDeclare(1, 0, 0, "x")
  v2.type = new ElementaryType("uint256", "nonpayable");
  const S = new IRStructDefinition(2, 0, 0, "S", [v1]);
  const Sid = new IRIdentifier(3, 0, 0, "S", S.id);
  Sid.type = new StructType();
  const member_access = new IRMemberAccess(3, 0, 0, "x", S.id, Sid);
  member_access.type = v1.type.copy();
  expect(writer.write(member_access.lower())).toBe("S.x");
}
)