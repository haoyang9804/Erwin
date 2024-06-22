import * as type from "../src/type"
import { config } from '../src/config';
config.unit_test_mode = true;
test("test type 0",
() => {
  expect(type.TypeProvider.uint32().issuperof(type.TypeProvider.uint16())).toEqual(true);
}
)

test("test type 1",
() => {
  const elementary = type.TypeProvider.uint32();
  const subs = elementary.subs().map(t => t.str());
  expect(subs).toEqual(["uint32", "uint16", "uint8"]);
  const subs2 = elementary.sub_with_lowerbound(type.TypeProvider.uint16()).map(t => t.str());
  expect(subs2).toEqual(["uint32", "uint16"]);
}
)

test("test type 2",
() => {
  const ftype = new type.FunctionType("public", "pure",
    new type.UnionType([type.TypeProvider.uint32()]),
    new type.UnionType([type.TypeProvider.uint32()]));
  const supers = ftype.supers().map(t => t.str());
  expect(supers).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)", "function (uint32) nonpayable public returns (uint32)"]);
  const supers2 = ftype.super_with_upperbound(new type.FunctionType("public", "view",
    new type.UnionType([type.TypeProvider.uint32()]),
    new type.UnionType([type.TypeProvider.uint32()]))).map(t => t.str());
  expect(supers2).toEqual(["function (uint32) pure public returns (uint32)", "function (uint32) view public returns (uint32)"]);
}
)