import { LinkedListNode } from "./dataStructor";
import { decl_db } from "./db";
import { config } from './config'
import { assert } from './utility'

export enum scopeKind {
  FUNC = "scopeKind::FUNC",
  CONTRACT = "scopeKind::CONTRACT",
  GLOBAL = "scopeKind::GLOBAL",
  IF_CONDITION = "scopeKind::IF_CONDITION",
  IF_BODY = "scopeKind::IF_BODY",
}

type scopeT = {
  id : number,
  kind : scopeKind
};

export const global_scope : number = 1;
let scope_id : number = global_scope;

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
    this.m_next.set_pre(this);
    return this.m_next as ScopeList;
  }

  // Roll back to the previous scope
  rollback() : ScopeList {
    if (config.debug) {
      assert(this.m_pre !== undefined, "The previous node must exist.");
    }
    this.m_pre!.set_next(undefined);
    return this.m_pre! as ScopeList;
  }

  id() : number {
    return this.value().id;
  }

  kind() : scopeKind {
    return this.value().kind;
  }

}

export function init_scope() {
  return new ScopeList({ id: scope_id, kind: scopeKind.GLOBAL })
}