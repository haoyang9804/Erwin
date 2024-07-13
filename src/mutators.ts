import * as ast from "solc-typed-ast";

export async function readSourceUnit(file_path : string) : Promise<ast.SourceUnit> {
  const result = await ast.compileSol(file_path, "auto");
  const reader = new ast.ASTReader();
  return reader.read(result.data)[0];
}

export function typeMutateSourceUnit(source_unit : ast.SourceUnit) : string[] {
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
  })
  source_unit.getChildren().forEach((node) => {
    if (node instanceof ast.ElementaryTypeName && integer_types.includes((node as ast.ElementaryTypeName).name)) {
      const original_typename = (node as ast.ElementaryTypeName).name;
      integer_types.forEach((typename) => {
        if (typename !== original_typename) {
          (node as ast.ElementaryTypeName).name = typename;
          mutants.push(writer.write(source_unit));
        }
      });
      (node as ast.ElementaryTypeName).name = original_typename;
    }
  });
  return mutants;
}
