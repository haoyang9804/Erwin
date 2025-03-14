import { LinkedListNode } from "./dataStructor";
import { decl_db } from "./db";
import { assert } from './utility'

export enum scopeKind {
  CONSTRUCTOR = "scopeKind::CONSTRUCTOR",
  CONSTRUCTOR_PARAMETERS = "scopeKind::CONSTRUCTOR_PARAMETERS",
  CONSTRUCTOR_BODY = "scopeKind::CONSTRUCTOR_BODY",
  FUNC = "scopeKind::FUNC",
  FUNC_PARAMETER = "scopeKind::FUNC_PARAMETER",
  GETTER_FUNC_PARAMETER = "scopeKind::GETTER_FUNC_PARAMETER",
  FUNC_RETURNS = "scopeKind::FUNC_RETURNS",
  FUNC_BODY = "scopeKind::FUNC_BODY",
  FUNC_ARGUMENTS = "scopeKind::FUNC_ARGUMENTS",
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
  EVENT = "scopeKind::EVENT",
  ERROR = "scopeKind::ERROR",
  MODIFIER_PARAMETER = "scopeKind::MODIFIER_PARAMETER",
  MODIFIER = "scopeKind::MODIFIER",
  MODIFIER_BODY = "scopeKind::MODIFIER_BODY",
  MODIFIER_INVOKER = "scopeKind::MODIFIER_INVOKER",
}

type scopeT = {
  id : number,
  kind : scopeKind
};

export const global_scope : number = 1;
let scope_id : number = global_scope;
const scope_id_to_scope : Map<number, ScopeList> = new Map();

/**
 * A linked-list-based scope class.
 * It's used to manage the scope of declarations, statements, and expressions.
 */
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
    this.set_next(new ScopeList(new_scope));
    scope_id_to_scope.set(new_scope.id, this.m_next as ScopeList);
    this.m_next!.set_pre(this);
    return this.m_next as ScopeList;
  }

  snapshot() : ScopeList {
    return this;
  }

  // Roll back to the previous scope
  rollback() : ScopeList {
    assert(this.m_pre !== undefined, "The previous node must exist.");
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

  next() : ScopeList {
    return this.m_next! as ScopeList;
  }

  nexts() : ScopeList[] {
    return this.m_nexts as ScopeList[];
  }
}

export function initScope() {
  scope_id = global_scope;
  scope_id_to_scope.clear();
  const scope = new ScopeList({ id: scope_id, kind: scopeKind.GLOBAL })
  scope_id_to_scope.set(scope_id, scope);
  return scope;
}

export function inside_struct_decl_scope(cur_scope : ScopeList) : boolean {
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

export function unexpected_extra_stmt_belong_to_the_parent_scope(scope : ScopeList) : boolean {
  return scope.kind() === scopeKind.FOR_CONDITION ||
    scope.kind() === scopeKind.WHILE_CONDITION ||
    scope.kind() === scopeKind.DOWHILE_COND ||
    scope.kind() === scopeKind.IF_CONDITION ||
    scope.kind() === scopeKind.MAPPING ||
    scope.kind() === scopeKind.ARRAY ||
    scope.kind() === scopeKind.FUNC_ARGUMENTS ||
    scope.kind() === scopeKind.MODIFIER_INVOKER ||
    scope.kind() === scopeKind.FUNC ||
    scope.kind() === scopeKind.CONSTRUCTOR;
}

export function inside_contract(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.CONTRACT) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_function_body(scope : ScopeList) : boolean {
  while (scope.kind() !== scopeKind.GLOBAL) {
    if (scope.kind() === scopeKind.FUNC_BODY) {
      return true;
    }
    scope = scope.pre();
  }
  return false;
}

export function inside_function(scope : ScopeList) : boolean {
  while (scope.kind() !== scopeKind.GLOBAL) {
    if (scope.kind() === scopeKind.FUNC) {
      return true;
    }
    scope = scope.pre();
  }
  return false;
}

export function inside_modifier_body(scope : ScopeList) : boolean {
  while (scope.kind() !== scopeKind.GLOBAL) {
    if (scope.kind() === scopeKind.MODIFIER_BODY) {
      return true;
    }
    scope = scope.pre();
  }
  return false;
}

export function inside_modifier(scope : ScopeList) : boolean {
  while (scope.kind() !== scopeKind.GLOBAL) {
    if (scope.kind() === scopeKind.MODIFIER) {
      return true;
    }
    scope = scope.pre();
  }
  return false;
}

export function inside_constructor_body(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.CONSTRUCTOR_BODY) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_constructor(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.CONSTRUCTOR) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_constructor_parameter_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.CONSTRUCTOR_PARAMETERS) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_function_parameter_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.FUNC_PARAMETER) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_event_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.EVENT) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_error_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.ERROR) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_mapping_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.MAPPING) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function inside_array_scope(cur_scope : ScopeList) : boolean {
  while (cur_scope.kind() !== scopeKind.GLOBAL) {
    if (cur_scope.kind() === scopeKind.ARRAY) {
      return true;
    }
    cur_scope = cur_scope.pre();
  }
  return false;
}

export function initializable_scope(cur_scope : ScopeList) : boolean {
  return (inside_constructor_body(cur_scope) ||
    inside_function_body(cur_scope) ||
    inside_modifier_body(cur_scope) ||
    cur_scope.kind() === scopeKind.CONTRACT) &&
    !inside_array_scope(cur_scope) &&
    !inside_mapping_scope(cur_scope);
}