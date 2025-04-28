export const config = {
  file: "",
  out_dir: "./generated_programs",

  mode: "",
  debug: false,
  stop_on_erwin_bug: false,

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
  modifier_per_function_upper_limit: 2,
  modifier_per_function_lower_limit: 0,

  // modifier
  modifier_count_per_contract_upper_limit: 2,
  modifier_count_per_contract_lower_limit: 1,

  // Struct
  struct_member_variable_count_lowerlimit: 1,
  struct_member_variable_count_upperlimit: 2,
  struct_decl_per_contract_upperlimit: 2,
  struct_decl_per_contract_lowerlimit: 1,

  // Event
  event_decl_per_contract_upperlimit: 2,
  event_decl_per_contract_lowerlimit: 1,

  // Error
  error_decl_per_contract_upperlimit: 2,
  error_decl_per_contract_lowerlimit: 1,

  // Contract
  contract_count: 2,
  state_variable_count_upperlimit: 2,
  state_variable_count_lowerlimit: 1,

  // Array
  array_length_upperlimit: 10,

  // Complexity
  expression_complexity_level: 1,
  statement_complexity__level: 1,
  type_complexity_level: 1,

  // Probability
  nonstructured_statement_prob: 0.5,
  expression_complexity_prob: 0.8,
  literal_prob: 0.5,
  tuple_prob: 0.3,
  vardecl_prob: 0.3,
  new_prob: 0.1,
  else_prob: 0.3,
  init_state_var_in_constructor_prob: 0.3,
  struct_prob: 0.5,
  contract_type_prob: 0.1,
  struct_type_prob: 0.1,
  mapping_type_prob: 0.1,
  array_type_prob: 0.1,
  string_type_prob: 0.1,
  in_func_initialization_prob: 0.5,
  contract_member_initialization_prob: 0.5,
  init_with_state_var_prob: 0.8,
  constructor_prob: 0.5,
  return_prob: 0.5,
  reuse_name_prob: 0.0,
  dynamic_array_prob: 0.5,
  event_prob: 0.5,
  error_prob: 0.5,

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

  // Test Erwin
  unit_test_mode: false,

  // The number of generation rounds
  generation_rounds: 1,

  // Log file path
  log_file_path: "./log.txt",

  // Test
  target: 'solidity',
  compiler_path: "",
  enable_test: false,
  test_out_dir: "./test_results",
  terminate_on_compiler_crash: false,
  // Refresh the folder of the generated programs before generating new programs
  refresh_folder: false,

  // Experiment
  enable_search_space_cmp: false,
}