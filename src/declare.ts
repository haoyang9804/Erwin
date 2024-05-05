import {
  DataLocation,
  StateVariableVisibility,
  Mutability,
  ASTNode,
  TypeName,
  EnumValue,
  VariableDeclaration,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability
} from "solc-typed-ast"

import { assert } from "./utility";
import { TypeKind, Type, ElementaryType } from "./type";
import { constantLock } from "./constrant";
import { IRNode, FieldFlag, factory } from "./node";
import { IREnumValue } from "./expression";
import { scope2userDefinedTypes } from "./generator";

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

export class IREnumDefinition extends IRDeclare {
  values : IREnumValue[] = [];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, values : IREnumValue[]) {
    super(id, scope, field_flag, name);
    assert(values.length > 0, "IREnumDefinition: values is empty");
    this.values = values;
  }
  lower() : ASTNode {
    return factory.makeEnumDefinition(this.name, this.values.map((value) => value.lower() as EnumValue));
  }
}

export class IRUserDefinedTypeDefinition extends IRDeclare {
  type_name : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, type_name : string) {
    super(id, scope, field_flag, name);
    this.type_name = type_name;
  }
  lower() : ASTNode {
    return factory.makeUserDefinedValueTypeDefinition(this.name, factory.makeElementaryTypeName("", this.type_name));
  }
}


export class IRErrorDefinition extends IRDeclare {
  parameters : IRVariableDeclare[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, parameters : IRVariableDeclare[]) {
    super(id, scope, field_flag, name);
    this.parameters = parameters;
  }
  lower() : ASTNode {
    return factory.makeErrorDefinition(this.name, factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)));
  }
}

export class IREventDefinition extends IRDeclare {
  anonymous: boolean;
  parameters : IRVariableDeclare[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, anonymous : boolean, parameters : IRVariableDeclare[]) {
    super(id, scope, field_flag, name);
    this.anonymous = anonymous;
    this.parameters = parameters;
  }
  lower(): ASTNode {
    return factory.makeEventDefinition(this.anonymous, this.name, factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)));
  }
}

export class IRStructDefinition extends IRDeclare {
  visibility: string = "public";
  members: IRVariableDeclare[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, members : IRVariableDeclare[]) {
    super(id, scope, field_flag, name);
    assert(members.length > 0, "IRStructDefinition: members is empty")
    this.members = members;
  }
  lower() : ASTNode {
    return factory.makeStructDefinition(this.name, this.scope, this.visibility, this.members.map((member) => member.lower() as VariableDeclaration));
  }
}

// export class IRModifier extends IRDeclare {
//   virtual: boolean;
//   visibility: string;
//   parameters : IRVariableDeclare[];
//   returns: IRVariableDeclare[];
//   body:
//   constructor(id : number, scope : number, field_flag : FieldFlag, name : string, virtual: boolean, visibility: string) {
//     super(id, scope, field_flag, name);
//     this.virtual = virtual;
//     this.visibility = visibility;
//   }
//   lower() : ASTNode {
//     return factory.makeModifierDefinition(this.name);
//   }
// }

// export class IRFunctionDefinition extends IRDeclare {
//   kind: FunctionKind | undefined;
//   virtual: boolean = false;
//   visibility: FunctionVisibility | undefined;
//   stateMutability: FunctionStateMutability | undefined;
//   parameters : IRVariableDeclare[];
//   returns: IRVariableDeclare[];
//   modifiers:
//   // return_type : Type[];
//   constructor(id : number, scope : number, field_flag : FieldFlag, name : string, parameters : IRVariableDeclare[], returns : IRVariableDeclare[]) {
//     super(id, scope, field_flag, name);
//     this.parameters = parameters;
//     this.returns = returns;
//   }
//   lower() : ASTNode {
//     return factory.makeFunctionDefinition(this.name, this.parameters.map((parameter) => parameter.lower() as VariableDeclaration), this.return_type);
//   }
// }

// export class IRContractDefinition extends IRDeclare {