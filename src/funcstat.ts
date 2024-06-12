import { StateVariableVisibility } from "solc-typed-ast";
import { DominanceNode } from "./dominance";

export abstract class FuncStat extends DominanceNode<StateVariableVisibility>{}
