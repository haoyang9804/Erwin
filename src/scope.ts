import { LinkedListNode } from "./dataStructor";
import { decl_db } from "./db";
import { assert } from './utility'

export enum scopeKind {
  CONSTRUCTOR = "scopeKind::CONSTRUCTOR",
  CONSTRUCTOR_PARAMETERS = "scopeKind::CONSTRUCTOR_PARAMETERS",
  FUNC = "scopeKind::FUNC",
  FUNC_PARAMETER = "scopeKind::FUNC_PARAMETER",
  FUNC_RETURNS = "scopeKind::FUNC_RETURNS",
  CONTRACT = "scopeKind::CONTRACT",
  GLOBAL = "scopeKind::GLOBAL",
  IF_CONDITION = "scopeKind::IF_CONDITION",
  IF_BODY = "scopeKind::IF_BODY",
  FOR_CONDITION = "scopeKind::FOR_CONDITION",
  FOR_BODY = "scopeKind::FOR_BODY",
  WHILE_CONDITION = "scopeKind::WHILE_CONDITION",
  WHILE_BODY = "scopeKind::WHILE_BODY",
  DOWHILE_BODY = "scopeKind::DOWHILE_BODY",
  DOWHILE_COND = "scopeKind::DOWHILE_COND",
  STRUCT = "scopeKind::STRUCT",
  MAPPING = "scopeKind::MAPPING",
  ARRAY = "scopeKind::ARRAY",
}

export function inside_function_body(scope_kind : scopeKind) : boolean {
  return scope_kind === scopeKind.FUNC ||
    scope_kind === scopeKind.DOWHILE_BODY ||
    scope_kind === scopeKind.DOWHILE_COND ||
    scope_kind === scopeKind.WHILE_BODY ||
    scope_kind === scopeKind.WHILE_CONDITION ||
    scope_kind === scopeKind.FOR_BODY ||
    scope_kind === scopeKind.FOR_CONDITION ||
    scope_kind === scopeKind.IF_BODY ||
    scope_kind === scopeKind.IF_CONDITION;
}

type scopeT = {
  id : number,
  kind : scopeKind
};

export const global_scope : number = 1;
let scope_id : number = global_scope;
const scope_id_to_scope : Map<number, ScopeList> = new Map();

export class ScopeList extends LinkedListNode<scopeT> {
  constructor(value : scopeT) {
    super(value);
  }

  // Create a new scope and return it
  new(kind : scopeKind) : ScopeList {
    scope_id++;
    const new_scope : scopeT = {
      id: scope_id,
      kind: kind
    };
    decl_db.new_scope(new_scope.id, this.m_value!.id);
    this.m_next = new ScopeList(new_scope);
    scope_id_to_scope.set(new_scope.id, this.m_next as ScopeList);
    this.m_next.set_pre(this);
    return this.m_next as ScopeList;
  }

  snapshot() : ScopeList {
    return this;
  }

  // Roll back to the previous scope
  rollback() : ScopeList {
    assert(this.m_pre !== undefined, "The previous node must exist.");
    this.m_pre!.set_next(undefined);
    return this.m_pre! as ScopeList;
  }

  id() : number {
    return this.value().id;
  }

  kind() : scopeKind {
    return this.value().kind;
  }

  pre() : ScopeList {
    return this.m_pre! as ScopeList;
  }
}

export function initScope() {
  const scope = new ScopeList({ id: scope_id, kind: scopeKind.GLOBAL })
  scope_id_to_scope.set(scope_id, scope);
  return scope;
}

export function inside_struct_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.STRUCT) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function get_scope_from_scope_id(scope_id : number) : ScopeList {
  const scope = scope_id_to_scope.get(scope_id);
  assert(scope !== undefined, "The scope must exist.");
  return scope;
}