import * as ast from "solc-typed-ast";
import { normal_number_2_ordinal_number } from "./utility";
import * as fs from "fs";

export async function read_source_unit(file_path : string) : Promise<ast.SourceUnit> {
  const result = await ast.compileSol(file_path, "auto");
  const reader = new ast.ASTReader();
  return reader.read(result.data)[0];
}

export function write_mutant(file_path : string, program_str : string) : void {
  // open the file whose file path is file_path and write program_str into it.
  fs.writeFileSync(file_path, program_str, "utf-8");
}

export function type_mutate_source_unit(source_unit : ast.SourceUnit) : string[] {
  const formatter = new ast.PrettyFormatter(2, 0);
  const writer = new ast.ASTWriter(
    ast.DefaultASTWriterMapping,
    formatter,
    ast.LatestCompilerVersion
  );
  const mutants : string[] = [];
  const integer_types = [
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "uint128",
    "uint256",
    "int8",
    "int16",
    "int32",
    "int64",
    "int128",
    "int256",
    "bool",
    "address",
    "address payable"
  ];
  source_unit.getChildren().forEach((node) => {
    if (node instanceof ast.ElementaryTypeName) {
      if ((node as ast.ElementaryTypeName).name === "uint") {
        (node as ast.ElementaryTypeName).name = "uint256";
      }
      else if ((node as ast.ElementaryTypeName).name === "int") {
        (node as ast.ElementaryTypeName).name = "int256";
      }
    }
  });
  let type_id = 1;
  source_unit.getChildren().forEach((node) => {
    if (node instanceof ast.ElementaryTypeName && integer_types.includes((node as ast.ElementaryTypeName).name)) {
      const original_typename = (node as ast.ElementaryTypeName).name;
      integer_types.forEach((typename) => {
        if (typename !== original_typename) {
          const annotation = `//Mutate the ${normal_number_2_ordinal_number(type_id)} ${original_typename} into ${typename}.\n`;
          (node as ast.ElementaryTypeName).name = typename;
          mutants.push(annotation + writer.write(source_unit));
        }
      });
      (node as ast.ElementaryTypeName).name = original_typename;
      type_id++;
    }
  });
  return mutants;
}
