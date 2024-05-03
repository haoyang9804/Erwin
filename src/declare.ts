import {
  DataLocation,
  StateVariableVisibility,
  Mutability,
  ASTNode,
  TypeName
} from "solc-typed-ast"

import { assert } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { constantLock } from "./constrant";
import { IRNode, FieldFlag, factory } from "./node";

export abstract class IRDeclare extends IRNode {
  name : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string) {
    super(id, scope, field_flag);
    this.name = name;
  }
}

export class IRVariableDeclare extends IRDeclare {
  indexed : boolean = false;
  constant : boolean | undefined; // duplicated with attribute `mutable`. but required by solc-typed-ast.
  state : boolean;
  memory : DataLocation = DataLocation.Default;
  visibility : StateVariableVisibility = StateVariableVisibility.Default;
  mutable : Mutability = Mutability.Mutable;
  type : Type | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string) {
    super(id, scope, field_flag, name);
    if (field_flag === FieldFlag.CONTRACT_GLOBAL) {
      this.state = true;
    }
    else {
      this.state = false;
    }
    if (field_flag !== FieldFlag.EVENT) {
      this.indexed = false;
    }
    else {
      if (Math.random() > 0.5) this.indexed = true;
      else this.indexed = false;
    }
    if (!this.state) this.constant = false;
  }
  lower() : ASTNode {
    if (this.constant === undefined) {
      if (this.id in constantLock) this.constant = false;
      else {
        if (Math.random() > 0.5) this.constant = true;
        else this.constant = false;
      }
    }
    if (this.constant) this.mutable = Mutability.Constant;
    assert(this.type !== undefined, "IRVariableDeclare: type is not generated");

    let typename : TypeName | undefined = undefined;
    if (this.type.kind === TypeKind.ElementaryType) {
      const type = this.type as ElementaryType;
      typename = factory.makeElementaryTypeName("", type.name);
      if (type.name !== "string" && type.name !== "bytes") {
        this.memory = DataLocation.Default;
      }
    }
    else {
      this.memory = DataLocation.Default;
    }
    //TODO: add support for memory
    //TODO: add support for visibility
    //TODO: add support for mutability


    //TODO: add support for other types, firstly function type
    assert(typename !== undefined, "IRVariableDeclare: typename is not generated")
    return factory.makeVariableDeclaration(this.constant, this.indexed, this.name, this.scope, this.state, this.memory, this.visibility, this.mutable, "", undefined, typename);
  }
}