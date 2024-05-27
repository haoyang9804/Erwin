import * as type from "../src/type"

test("test type 0",
() => {
  expect(new type.ElementaryType("uint32", "nonpayable").issupertypeof(new type.ElementaryType("uint16", "nonpayable"))).toEqual(true);
}
)

test("test type 1",
() => {
  const elementary = new type.ElementaryType("uint32", "nonpayable");
  const subtypes = elementary.subtype().map(t => t.str());
  expect(subtypes).toEqual(["uint32", "uint16", "uint8"]);
  const subtypes2 = elementary.subtype_with_lowerbound(new type.ElementaryType("uint16", "nonpayable")).map(t => t.str());
  expect(subtypes2).toEqual(["uint32", "uint16"]);
}
)

test("test type 2",
() => {
  const ftype = new type.FunctionType("public", "pure",
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]),
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]));
  const supertypes = ftype.supertype().map(t => t.str());
  expect(supertypes).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)", "function (uint32) nonpayable public returns (uint32)"]);
  const supertypes2 = ftype.supertype_with_upperbound(new type.FunctionType("public", "view",
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]),
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]))).map(t => t.str());
  expect(supertypes2).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)"]);
}
)