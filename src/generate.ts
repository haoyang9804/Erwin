import * as gen from "./generator"
import { vismut_dag, storage_location_dag, type_dag } from "./constraint";
import { irnodes } from "./node";
import * as expr from "./expression";
import * as decl from "./declaration";
import { config } from "./config";
import { init_global_id, init_indent, init_scope } from "./genContext";
import * as fs from "fs";
import { assert, pick_random_element } from "./utility";
import { MappingType, ArrayType, Type } from './type';
import * as db from './db';
import { StorageLocation, StorageLocationProvider } from "./loc";
import { FuncVis, FuncVisProvider, VarVis, VarVisProvider } from "./visibility";
import { FuncVisMutKind, VarVisKind } from "./vismut";
import { FuncStat, FuncStatProvider } from "./funcstat";
import { Log } from "./log";

import {
  PrettyFormatter,
  ASTWriter,
  DefaultASTWriterMapping,
  LatestCompilerVersion,
  FunctionVisibility,
  DataLocation,
  StateVariableVisibility,
  FunctionStateMutability,
} from "solc-typed-ast"
import { test_solidity_compiler, test_slither, test_solang_compiler, test_solar_compiler } from "./test";
const formatter = new PrettyFormatter(2, 0);
const writer = new ASTWriter(
  DefaultASTWriterMapping,
  formatter,
  LatestCompilerVersion
);

function init_generation() {
  db.init();
  type_dag.clear();
  vismut_dag.clear();
  storage_location_dag.clear();
  irnodes.clear();
  init_scope();
  init_global_id();
  init_indent();
  Log.initialize();
}

function storageLocation2loc(sl : StorageLocation) : DataLocation {
  switch (sl) {
    case StorageLocationProvider.memory():
      return DataLocation.Memory;
    case StorageLocationProvider.storage_pointer():
    case StorageLocationProvider.storage_ref():
      return DataLocation.Storage;
    case StorageLocationProvider.calldata():
      return DataLocation.CallData;
    default:
      return DataLocation.Default;
  }
}

function varvis2statevisibility(vv : VarVis) : StateVariableVisibility {
  switch (vv) {
    case VarVisProvider.public():
      return StateVariableVisibility.Public;
    case VarVisProvider.internal():
      return StateVariableVisibility.Internal;
    case VarVisProvider.private():
      return StateVariableVisibility.Private;
    default:
      return StateVariableVisibility.Default;
  }
}

function funcvis2funcvisibility(fv : FuncVis) : FunctionVisibility {
  switch (fv) {
    case FuncVisProvider.external():
      return FunctionVisibility.External;
    case FuncVisProvider.public():
      return FunctionVisibility.Public;
    case FuncVisProvider.internal():
      return FunctionVisibility.Internal;
    case FuncVisProvider.private():
      return FunctionVisibility.Private;
    default:
      throw new Error("The function visibility is not supported.");
  }
}

function funcstat2functionstatemutability(fs : FuncStat) : FunctionStateMutability {
  switch (fs) {
    case FuncStatProvider.pure():
      return FunctionStateMutability.Pure;
    case FuncStatProvider.view():
      return FunctionStateMutability.View;
    case FuncStatProvider.empty():
      return FunctionStateMutability.NonPayable;
    case FuncStatProvider.payable():
      return FunctionStateMutability.Payable;
    default:
      throw new Error("The function state mutability is not supported.");
  }
}

function assign_newDynamicArray_type(new_dynamic_array_id : number, type_solutions : Map<number, Type>) : void {
  const base_id = (irnodes.get(new_dynamic_array_id)! as expr.IRNewDynamicArray).base_id;
  assert(type_solutions.has(base_id), `The type solution does not have the base id ${base_id}.`);
  (irnodes.get(new_dynamic_array_id)! as expr.IRNewDynamicArray).base_type = type_solutions.get(base_id)!;
}

function assign_mapping_type(mapping_decl_id : number, type_solutions : Map<number, Type>) : void {
  const [key_id, value_id] = db.decl_db.kvpair_of_mapping(mapping_decl_id);
  assert(type_solutions.has(key_id), `The type solution does not have the key id ${key_id}.`);
  assert(type_solutions.has(value_id) || db.decl_db.is_mapping_decl(value_id) || db.decl_db.is_array_decl(value_id),
    `The type solution does not have the value id ${value_id} and this id doesn't belong to a mapping/array declaration.`);
  if (type_solutions.has(value_id)) {
    (irnodes.get(mapping_decl_id) as decl.IRVariableDeclaration).type =
      new MappingType(type_solutions.get(key_id)!, type_solutions.get(value_id)!);
  }
  else {
    if (db.decl_db.is_mapping_decl(value_id)) {
      assign_mapping_type(value_id, type_solutions);
    }
    else if (db.decl_db.is_array_decl(value_id)) {
      assign_array_type(value_id, type_solutions);
    }
    else {
      throw new Error(`The value id ${value_id} is neither a mapping declaration nor an array declaration.`);
    }
    (irnodes.get(mapping_decl_id) as decl.IRVariableDeclaration).type =
      new MappingType(type_solutions.get(key_id)!, (irnodes.get(value_id) as decl.IRVariableDeclaration).type!);
  }
}

function assign_array_type(array_decl_id : number, type_solutions : Map<number, Type>) : void {
  const base_id = db.decl_db.base_of_array(array_decl_id);
  if (type_solutions.has(base_id)) {
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type !== undefined,
      `The type of the array declaration ${array_decl_id} is undefined.`);
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type!.typeName === "ArrayType",
      `The type of the array declaration ${array_decl_id} is not an instance of ArrayType.`);
    ((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type as ArrayType).base = type_solutions.get(base_id)!;
  }
  else {
    if (db.decl_db.is_array_decl(base_id)) {
      assign_array_type(base_id, type_solutions);
    }
    else if (db.decl_db.is_mapping_decl(base_id)) {
      assign_mapping_type(base_id, type_solutions);
    }
    else {
      throw new Error(`The base id ${base_id} of the array declaration ${array_decl_id} is neither a mapping declaration nor an array declaration.`);
    }
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type !== undefined,
      `The type of the array declaration ${array_decl_id} is undefined.`);
    assert((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type!.typeName === "ArrayType",
      `The type of the array declaration ${array_decl_id} is not an instance of ArrayType.`);
    ((irnodes.get(array_decl_id) as decl.IRVariableDeclaration).type as ArrayType).base = (irnodes.get(base_id) as decl.IRVariableDeclaration).type!;
  }
}

function generate_type_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${type_dag.solutions_collection.length} solution(s)`);
  //! Select one vismut solution
  if (vismut_dag.solutions_collection.length > 0) {
    const vismut_solutions = pick_random_element(vismut_dag.solutions_collection)!;
    for (let [key, value] of vismut_solutions) {
      if (irnodes.has(key) === false) continue;
      if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
        (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
          varvis2statevisibility((value.kind as VarVisKind).visibility);
      }
      else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
          funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
        (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability =
          funcstat2functionstatemutability((value.kind as FuncVisMutKind).state_mutability);
      }
    }
  }
  //! Select one storage location solution
  if (storage_location_dag.solutions_collection.length > 0) {
    const storage_location_solutions = pick_random_element(storage_location_dag.solutions_collection)!;
    for (let [key, value] of storage_location_solutions) {
      //! key may be ghost and is not in irnodes
      if (!irnodes.has(key)) continue;
      if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
        continue;
      }
      if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined) {
        (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
      }
    }
  }
  //! Traverse type solutions
  if (type_dag.solutions_collection.length === 0) {
    const program = writer.write(source_unit_gen.irnode!.lower());
    if (!fs.existsSync(`${config.out_dir}`)) {
      fs.mkdirSync(`${config.out_dir}`);
    }
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let millisecond = date.getMilliseconds();
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_0.sol`;
    fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (let type_solutions of type_dag.solutions_collection) {
      if (type_solutions.size === 0) continue;
      for (let [key, value] of type_solutions) {
        if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration) {
          (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
        }
      }
      for (const new_dynamic_array_id of db.expr_db.new_dynamic_array_exprs_ids()) {
        assign_newDynamicArray_type(new_dynamic_array_id, type_solutions);
      }
      for (const mapping_decl_id of db.decl_db.mapping_decls_ids()) {
        assign_mapping_type(mapping_decl_id, type_solutions);
      }
      for (const array_decl_id of db.decl_db.array_decls_ids()) {
        assign_array_type(array_decl_id, type_solutions);
      }
      const program = writer.write(source_unit_gen.irnode!.lower());
      if (program === pre_program) continue;
      pre_program = program;
      if (!fs.existsSync(`${config.out_dir}`)) {
        fs.mkdirSync(`${config.out_dir}`);
      }
      let date = new Date();
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hour = date.getHours();
      let minute = date.getMinutes();
      let second = date.getSeconds();
      let millisecond = date.getMilliseconds();
      let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_${cnt}.sol`;
      cnt++;
      fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
    }
  }
}

function generate_scope_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${vismut_dag.solutions_collection.length} solution(s)`);
  //! Select one type solution
  if (type_dag.solutions_collection.length > 0) {
    const type_solutions = pick_random_element(type_dag.solutions_collection)!;
    for (let [key, value] of type_solutions) {
      if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration) {
        (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
      }
    }
    for (const new_dynamic_array_id of db.expr_db.new_dynamic_array_exprs_ids()) {
      assign_newDynamicArray_type(new_dynamic_array_id, type_solutions);
    }
    for (const mapping_decl_id of db.decl_db.mapping_decls_ids()) {
      assign_mapping_type(mapping_decl_id, type_solutions);
    }
    for (const array_decl_id of db.decl_db.array_decls_ids()) {
      assign_array_type(array_decl_id, type_solutions);
    }
  }
  //! Select storage location solution
  if (storage_location_dag.solutions_collection.length > 0) {
    const storage_location_solutions = pick_random_element(storage_location_dag.solutions_collection)!;
    for (let [key, value] of storage_location_solutions) {
      //! key may be ghost and is not in irnodes
      if (!irnodes.has(key)) continue;
      if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
        continue;
      }
      if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined)
        (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
    }
  }
  //! Traverse vismut solutions
  if (vismut_dag.solutions_collection.length === 0) {
    const program = writer.write(source_unit_gen.irnode!.lower());
    if (!fs.existsSync(`${config.out_dir}`)) {
      fs.mkdirSync(`${config.out_dir}`);
    }
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let millisecond = date.getMilliseconds();
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_0.sol`;
    fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (const vismut_solutions of vismut_dag.solutions_collection) {
      if (vismut_solutions.size === 0) continue;
      for (let [key, value] of vismut_solutions) {
        if (irnodes.has(key) === false) continue;
        if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
          (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
            varvis2statevisibility((value.kind as VarVisKind).visibility);
        }
        else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
          (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
            funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
          (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability =
            funcstat2functionstatemutability((value.kind as FuncVisMutKind).state_mutability);
        }
      }
      const program = writer.write(source_unit_gen.irnode!.lower());
      if (program === pre_program) continue;
      pre_program = program;
      if (!fs.existsSync(`${config.out_dir}`)) {
        fs.mkdirSync(`${config.out_dir}`);
      }
      let date = new Date();
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hour = date.getHours();
      let minute = date.getMinutes();
      let second = date.getSeconds();
      let millisecond = date.getMilliseconds();
      let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_${cnt}.sol`;
      cnt++;
      fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
    }
  }
}

function generate_loc_mode(source_unit_gen : gen.SourceUnitGenerator) {
  console.log(`${storage_location_dag.solutions_collection.length} solution(s)`);
  //! Select one type solution
  const type_solutions = pick_random_element(type_dag.solutions_collection)!;
  for (const [key, value] of type_solutions) {
    if (irnodes.get(key)! instanceof expr.IRLiteral || irnodes.get(key)! instanceof decl.IRVariableDeclaration) {
      (irnodes.get(key)! as expr.IRLiteral | decl.IRVariableDeclaration).type = value;
    }
  }
  for (const new_dynamic_array_id of db.expr_db.new_dynamic_array_exprs_ids()) {
    assign_newDynamicArray_type(new_dynamic_array_id, type_solutions);
  }
  for (const mapping_decl_id of db.decl_db.mapping_decls_ids()) {
    assign_mapping_type(mapping_decl_id, type_solutions);
  }
  for (const array_decl_id of db.decl_db.array_decls_ids()) {
    assign_array_type(array_decl_id, type_solutions);
  }
  //! Select one vismut solution
  if (vismut_dag.solutions_collection.length > 0) {
    const vismut_solutions = pick_random_element(vismut_dag.solutions_collection)!;
    for (let [key, value] of vismut_solutions) {
      if (irnodes.has(key) === false) continue;
      if (irnodes.get(key)!.typeName === "IRVariableDeclaration") {
        (irnodes.get(key)! as decl.IRVariableDeclaration).visibility =
          varvis2statevisibility((value.kind as VarVisKind).visibility);
      }
      else if (irnodes.get(key)!.typeName === "IRFunctionDefinition") {
        (irnodes.get(key)! as decl.IRFunctionDefinition).visibility =
          funcvis2funcvisibility((value.kind as FuncVisMutKind).visibility);
        (irnodes.get(key)! as decl.IRFunctionDefinition).stateMutability =
          funcstat2functionstatemutability((value.kind as FuncVisMutKind).state_mutability);
      }
    }
  }
  //! Traverse storage location solutions
  if (storage_location_dag.solutions_collection.length === 0) {
    let program = writer.write(source_unit_gen.irnode!.lower());
    if (!fs.existsSync(`${config.out_dir}`)) {
      fs.mkdirSync(`${config.out_dir}`);
    }
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    let millisecond = date.getMilliseconds();
    let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_0.sol`;
    fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
  }
  else {
    let cnt = 0;
    let pre_program = "";
    for (let storage_location_solutions of storage_location_dag.solutions_collection) {
      if (storage_location_solutions.size === 0) continue;
      for (let [key, value] of storage_location_solutions) {
        //! key may be ghost and is not in irnodes
        if (!irnodes.has(key)) continue;
        if (irnodes.get(key)!.typeName !== "IRVariableDeclaration") {
          continue;
        }
        if ((irnodes.get(key)! as decl.IRVariableDeclaration).loc === undefined)
          (irnodes.get(key)! as decl.IRVariableDeclaration).loc = storageLocation2loc(value);
      }
      let program = writer.write(source_unit_gen.irnode!.lower());
      if (program === pre_program) continue;
      pre_program = program;
      if (!fs.existsSync(`${config.out_dir}`)) {
        fs.mkdirSync(`${config.out_dir}`);
      }
      let date = new Date();
      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hour = date.getHours();
      let minute = date.getMinutes();
      let second = date.getSeconds();
      let millisecond = date.getMilliseconds();
      let program_name = `program_${year}-${month}-${day}_${hour}:${minute}:${second}:${millisecond}_${cnt}.sol`;
      cnt++;
      fs.writeFileSync(`${config.out_dir}/${program_name}`, program, "utf-8");
    }
  }
}
/**
 * Generate programs
 */
export async function generate() {
  for (let i = 0; i < config.generation_rounds; i++) {
    Log.initialize();
    init_generation();
    if (config.refresh_folder) {
      fs.rmSync(`${config.out_dir}`, { recursive: true, force: true });
      fs.mkdirSync(`${config.out_dir}`);
    }
    if (config.target === "solang") {
      config.error_prob = 0.0;
      config.in_func_initialization_prob = 1.0;
      config.literal_prob = 0.9;
      config.new_prob = 0.9;
      config.contract_type_prob = 0.0;
      config.modifier_count_per_contract_lower_limit = 0;
      config.modifier_count_per_contract_upper_limit = 0;
    }
    const source_unit = new gen.SourceUnitGenerator();
    source_unit.generate();
    let startTime = performance.now();
    await type_dag.resolve().catch((err) => {
      console.error(err);
      process.exit(1);
    });
    let endTime = performance.now();
    console.log(`Time cost of resolving type constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await vismut_dag.resolve().catch((err) => {
      console.error(err);
      process.exit(1);
    });
    endTime = performance.now();
    console.log(`Time cost of resolving visibility and state mutability constraints: ${endTime - startTime} ms`);
    startTime = performance.now();
    await storage_location_dag.resolve().catch((err) => {
      console.error(err);
      process.exit(1);
    });
    endTime = performance.now();
    console.log(`Time cost of resolving storage location constraints: ${endTime - startTime} ms`);
    type_dag.verify();
    vismut_dag.verify();
    storage_location_dag.verify();
    try {
      if (config.mode === "type") {
        generate_type_mode(source_unit);
      }
      else if (config.mode === "scope") {
        generate_scope_mode(source_unit);
      }
      else if (config.mode === "loc") {
        generate_loc_mode(source_unit);
      }
    }
    catch (err) {
      console.error(err);
      if (config.terminate_on_failure) {
        process.exit(1);
      }
    }
    if (config.enable_test) {
      if (config.target === "solidity") {
        await test_solidity_compiler().then((result) => {
          if (result === 2 || result === 4) {
            process.exit(1);
          }
          else if (result !== 0) {
            if (config.terminate_on_failure) {
              process.exit(1);
            }
          }
        });
      }
      else if (config.target === "slither") {
        await test_slither().then((result) => {
          if (result === 5 || result === 4 || result === 2) {
            process.exit(1);
          }
          else if (result !== 0) {
            if (config.terminate_on_failure) {
              process.exit(1);
            }
          }
        });
      }
      else if (config.target === "solang") {
        await test_solang_compiler().then((result) => {
          if (result === 2 || result === 4) {
            process.exit(1);
          }
          else if (result !== 0) {
            if (config.terminate_on_failure) {
              process.exit(1);
            }
          }
        });
      }
      else if (config.target === "solar") {
        await test_solar_compiler().then((result) => {
          if (result === 2 || result === 4) {
            process.exit(1);
          }
          else if (result !== 0) {
            if (config.terminate_on_failure) {
              process.exit(1);
            }
          }
        });
      }
      else {
        throw new Error(`The testing target ${config.target} is not supported.`);
      }
    }
  }
}