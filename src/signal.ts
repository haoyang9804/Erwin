
class Signal {
  public no_state_variable_in_function_body = false;
  public allow_empty_return = false;
  // A signal to indicate whether there is an external function call in the current function body.
  public external_call = false;
  // A signal to indicate there should be no function calls to the function in another contract in the current function body.
  // No external call means that the visibility range of the function is not limited to external and public.
  public forbid_external_call = false;
  /*
  ! Besides analyzing if the function reads or writes a state variable,
  ! we also need to analyze if the function
  1. contains external calls:
    1) call to function in other contracts -> not view, not pure
    2) call to function in the same contract with "this" -> not pure
  2. contains new contract expressions -> not view, not pure
  3. contains assignment exprs where left-hand side identifier refers to
    1) a mapping value -> not view, not pure
    2) an array element -> if the array is a state variable or it's storage 
                        location is storage -> not view, not pure
    3) a struct member -> if the struct instance is a state variable or it's storage
                          location is storage -> not view, not pure
  4. a mapping value -> not pure
  5. an array element -> if the array is a state variable or it's storage
                        location is storage -> not pure
  6. a struct member -> if the struct instance is a state variable or it's storage
                        location is storage -> not pure
  */
  public noview_nopure_funcdecl = false;
  public nopure_funcdecl = false;
};

export let sig = new Signal();