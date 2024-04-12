import * as ast from "solc-typed-ast";
let result;
function traverse_node(node, depth = 0) {
    console.log(' '.repeat(depth) + node.type);
    if (node instanceof ast.ASTNodeWithChildren) {
        for (var child of node.children) {
            traverse_node(child, depth + 1);
        }
    }
}
let p = {
    name: "John",
    age: 30,
    greet: function () {
        console.log("Hello, my name is " + this.name);
    }
};
console.log(p.name);
try {
    result = await ast.compileSol("src/seed.sol", "auto");
    const formatter = new ast.PrettyFormatter(2, 0);
    const writer = new ast.ASTWriter(ast.DefaultASTWriterMapping, formatter, result.compilerVersion ? result.compilerVersion : ast.LatestCompilerVersion);
    // console.log('result is', result.data)
    // console.log('====')
    const reader = new ast.ASTReader();
    const sourceUnits = reader.read(result.data);
    const contract_node = sourceUnits[0].vContracts[0];
    const function_node = contract_node.vFunctions[0];
    const statements = function_node.vBody.vStatements;
    for (const statement of statements) {
        console.log('===================================================================');
        console.log(statement);
        console.log('>>> ', writer.write(statement));
    }
    // traverse_node(sourceUnits[0]);
    // console.log('=== SourceUnits[0] ===')
    // console.log("Used compiler version: " + result.compilerVersion);
    // console.log(sourceUnits[0]);
    // console.log('=== AST Context ===')
    // console.log(sourceUnits[0].context)
    // console.log('=== source unit ===')
    // console.log(sourceUnits[0])
    // console.log('=== Yul ===')
    // let yul_block = (sourceUnits[0].vContracts[0].vFunctions[0].vBody?.vStatements[0] as ast.InlineAssembly).yul;
    // console.log(typeof yul_block)
    // // console.log((yul_block ? yul_block.expression : 'NONE!!'))
    // console.log(Object.keys(yul_block as object))
    // for (const statement of yul_block!.statements) {
    //     console.log(Object.keys(statement as object));
    //     console.log('nodetype is ', )
    //     if ("expression" in statement) {
    //         console.log('>>> ', statement.expression);
    //     }
    //     console.log('=======================================')
    // }
    // sourceUnits[0].vContracts[0].scope = -1;
    // sourceUnits[0].vContracts[0].src = "";
    // sourceUnits[0].vContracts[0].id = -1;
    // console.log(sourceUnits[0].vContracts[0]);
    // console.log('=== Writer ===')
    // for (const sourceUnit of sourceUnits) {
    //     console.log("// " + sourceUnit.absolutePath);
    //     console.log(writer.write(sourceUnit));
    // }
}
catch (e) {
    if (e instanceof ast.CompileFailedError) {
        console.error("Compile errors encountered:");
        for (const failure of e.failures) {
            console.error(`Solc ${failure.compilerVersion}:`);
            for (const error of failure.errors) {
                console.error(error);
            }
        }
    }
    else {
        // console.error(e.message);
    }
}
/*
map: Map(12) {
      1 => [PragmaDirective],
      2 => [ElementaryTypeName],
      3 => [VariableDeclaration],
      4 => [ParameterList],
      5 => [ElementaryTypeName],
      6 => [VariableDeclaration],
      7 => [ParameterList],
      8 => [InlineAssembly],
      9 => [Block],
      10 => [FunctionDefinition],
      11 => [Circular *1],
      12 => [SourceUnit]
    }
*/ 
