import { initScope, scopeKind, ScopeList } from "./scope";

const global_id_start = 1;
export let global_id = global_id_start;
export function init_global_id() {
  global_id = global_id_start;
}
export function new_global_id() {
  return global_id++;
}
export let cur_scope : ScopeList = initScope();
export function init_scope() {
  cur_scope = initScope();
}
export function new_scope(scope_kind : scopeKind) {
  cur_scope = cur_scope.new(scope_kind);
}
export function roll_back_scope() {
  cur_scope = cur_scope.rollback();
}
export function relocate_scope(scope : ScopeList) {
  cur_scope = scope.snapshot();
}
export let indent = 0;
export function init_indent() {
  indent = 0;
}
export function increase_indent() {
  indent += 2;
}
export function decrease_indent() {
  indent -= 2;
}