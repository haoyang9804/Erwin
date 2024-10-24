export const config = {
  file: "",
  out_dir: "",

  experimental: false,
  mode: "",
  debug: false,

  // Type 
  uint_num: 2,
  int_num: 2,

  // Dominance Constraint Solution
  maximum_solution_count: 500,

  // Function
  function_body_stmt_cnt_upper_limit: 1,
  function_body_stmt_cnt_lower_limit: 1,
  return_count_of_function_upperlimit: 2,
  return_count_of_function_lowerlimit: 0,
  param_count_of_function_upperlimit: 1,
  param_count_of_function_lowerlimit: 0,
  function_count_per_contract_upper_limit: 2,
  function_count_per_contract_lower_limit: 1,

  // Struct
  struct_member_variable_count_lowerlimit: 1,
  struct_member_variable_count_upperlimit: 2,

  // Contract
  contract_count: 2,
  state_variable_count_upperlimit: 2,
  state_variable_count_lowerlimit: 1,

  // Complexity
  expression_complex_level: 1,
  statement_complex_level: 1,

  // Probability
  nonstructured_statement_prob: 0.05,
  literal_prob: 0.05,
  tuple_prob: 0.3,
  vardecl_prob: 0.0,
  // The probability of "new"ing a contract or a struct instance
  new_prob: 0.1,
  else_prob: 0.1,
  terminal_prob: 0.05,
  init_state_var_in_constructor_prob: 0.3,
  struct_prob: 0.5,
  contract_instance_prob: 0.1,
  struct_instance_prob: 0.1,
  initialization_prob: 0.3,
  constructor_prob: 0.5,
  return_prob: 0.5,
  reuse_name_prob: 0.0,
  mapping_prob: 0.5,

  // Structured Statements
  for_init_cnt_upper_limit: 1,
  for_init_cnt_lower_limit: 0,
  for_body_stmt_cnt_upper_limit: 1,
  for_body_stmt_cnt_lower_limit: 0,
  while_body_stmt_cnt_upper_limit: 1,
  while_body_stmt_cnt_lower_limit: 0,
  do_while_body_stmt_cnt_upper_limit: 1,
  do_while_body_stmt_cnt_lower_limit: 0,
  if_body_stmt_cnt_upper_limit: 1,
  if_body_stmt_cnt_lower_limit: 0,

  // Test
  unit_test_mode: false,
}