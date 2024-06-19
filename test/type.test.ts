import * as type from "../src/type"

test("test type 0",
() => {
  expect(new type.ElementaryType("uint32", "nonpayable").issuperof(new type.ElementaryType("uint16", "nonpayable"))).toEqual(true);
}
)

test("test type 1",
() => {
  const elementary = new type.ElementaryType("uint32", "nonpayable");
  const subs = elementary.subs().map(t => t.str());
  expect(subs).toEqual(["uint32", "uint16", "uint8"]);
  const subs2 = elementary.sub_with_lowerbound(new type.ElementaryType("uint16", "nonpayable")).map(t => t.str());
  expect(subs2).toEqual(["uint32", "uint16"]);
}
)

test("test type 2",
() => {
  const ftype = new type.FunctionType("public", "pure",
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]),
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]));
  const supers = ftype.supers().map(t => t.str());
  expect(supers).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)", "function (uint32) nonpayable public returns (uint32)"]);
  const supers2 = ftype.super_with_upperbound(new type.FunctionType("public", "view",
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]),
    new type.UnionType([new type.ElementaryType("uint32", "nonpayable")]))).map(t => t.str());
  expect(supers2).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)"]);
}
)