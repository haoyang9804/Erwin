import * as mut from "./mutators";
import { config } from "./config";

/**
 * Mutate the source unit and write the mutants to the output directory
 * It's experimental and not used in the current version
 */
export async function mutate() {
  const source_unit = await mut.read_source_unit(config.file);
  const mutants = mut.type_mutate_source_unit(source_unit);
  let out_id = 1;
  for (let mutant of mutants) {
    if (config.out_dir !== "") {
      const file_path = `${config.out_dir}/mutant_${out_id}.sol`;
      mut.write_mutant(file_path, mutant);
      out_id++;
    }
    else {
      console.log(mutant);
    }
  }
}