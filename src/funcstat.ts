// import { StateVariableVisibility } from "solc-typed-ast";
// import { DominanceNode } from "./dominance";

// export abstract class FuncStat extends DominanceNode<StateVariableVisibility> { }

// export class Pure extends FuncStat {
//   str(): string {
//     return "pure";
//   }
//   subs(): FuncStat[] {
//     return [];
//   }
//   sub_with_lowerbound(lower_bound: DominanceNode<StateVariableVisibility>): DominanceNode<StateVariableVisibility>[] {
//     return [];
//   }
//   supers(): DominanceNode<StateVariableVisibility>[] {
//     return [];
//   }
//   super_with_upperbound(upper_bound: DominanceNode<StateVariableVisibility>): DominanceNode<StateVariableVisibility>[] {
//     return [];
//   }
//   same(t: DominanceNode<StateVariableVisibility>): boolean {
//     return t instanceof Pure;
//   }
//   copy(): DominanceNode<StateVariableVisibility> {
//     return new Pure();
//   }
//   issubof(t: DominanceNode<StateVariableVisibility>): boolean {
//     return t instanceof Pure;
//   }
//   issuperof(t: DominanceNode<StateVariableVisibility>): boolean {
//     return t instanceof Pure;
//   }
// }