import {
  DataLocation,
  StateVariableVisibility,
  Mutability,
  ASTNode,
  TypeName,
  VariableDeclaration,
  FunctionKind,
  FunctionVisibility,
  FunctionStateMutability,
  ModifierInvocation,
  ContractKind
} from "solc-typed-ast"

import { assert } from "./utility";
import { TypeKind, Type, ElementaryType, UnionType, FunctionType, ContractType, StructType } from "./type";
import { IRNode, factory } from "./node";
import { IRStatement, IRPlaceholderStatement } from "./statement";
import { IRExpression } from "./expression";

export const name2declare = new Map<string, IRDeclare>();
export abstract class IRDeclare extends IRNode {
  name : string;
  constructor(id : number, scope : number, name : string) {
    super(id, scope);
    this.name = name;
    name2declare.set(name, this);
  }
}

export class IRVariableDeclaration extends IRDeclare {
  indexed : boolean = false;
  constant : boolean = false; // duplicated with attribute `mutable`. but required by solc-typed-ast.
  state : boolean = false;
  loc : DataLocation | undefined;
  visibility : StateVariableVisibility = StateVariableVisibility.Default;
  mutable : Mutability = Mutability.Mutable;
  type : Type | undefined;
  value : IRExpression | undefined;
  typestr : string | undefined;
  constructor(id : number, scope : number, name : string, value ?: IRExpression,
    visibility ?: StateVariableVisibility, state ?: boolean, typestr ?: string, mutable ?: Mutability,
    loc ?: DataLocation, constant ?: boolean, indexed ?: boolean) {
    super(id, scope, name);
    this.value = value;
    if (visibility !== undefined) {
      this.visibility = visibility;
    }
    this.typestr = typestr;
    if (mutable !== undefined) {
      this.mutable = mutable;
    }
    this.loc = loc;
    if (constant !== undefined) {
      this.constant = constant;
    }
    if (indexed !== undefined) {
      this.indexed = indexed;
    }
  }
  lower() : ASTNode {
    let typename : TypeName | undefined = undefined;
    if (this.type !== undefined) {
      if (this.type.kind === TypeKind.ElementaryType) {
        const type = this.type as ElementaryType;
        typename = factory.makeElementaryTypeName(type.str(), type.str());
        this.loc = DataLocation.Default;
      }
      else if (this.type.kind === TypeKind.ContractType) {
        const type = this.type as ContractType;
        typename = factory.makeElementaryTypeName(type.name, type.name);
        this.loc = DataLocation.Default;
      }
      else if (this.type.kind === TypeKind.StructType) {
        const type = this.type as StructType;
        typename = factory.makeUserDefinedTypeName((type as StructType).type_str, type.name,
          type.referece_id, factory.makeIdentifierPath(type.name, type.referece_id));
      }
      else {
        throw new Error(`IRVariableDeclaration: type ${this.type.kind} is not supported`);
      }
    }
    else {
      assert(this.typestr !== undefined, "IRVariableDeclaration: typestr is not generated")
      typename = factory.makeElementaryTypeName("", this.typestr);
      this.loc = DataLocation.Default;
    }
    assert(this.loc !== undefined, "IRVariableDeclaration: loc is not generated");
    //TODO: add support for other types, firstly function type
    assert(typename !== undefined, `IRVariableDeclaration ${this.id}: typename is not generated`)
    return factory.makeVariableDeclaration(this.constant, this.indexed, this.name, this.scope, this.state, this.loc,
      this.visibility, this.mutable, "", undefined, typename, undefined, this.value?.lower());
  }
}

export class IREnumDefinition extends IRDeclare {
  values : string[] = [];
  constructor(id : number, scope : number, name : string, values : string[]) {
    super(id, scope, name);
    assert(values.length > 0, "IREnumDefinition: values is empty");
    this.values = values;
  }
  lower() : ASTNode {
    return factory.makeEnumDefinition(this.name, this.values.map((value) => factory.makeEnumValue(value)));
  }
}

export class IRUserDefinedTypeDefinition extends IRDeclare {
  type_name : string;
  constructor(id : number, scope : number, name : string, type_name : string) {
    super(id, scope, name);
    this.type_name = type_name;
  }
  lower() : ASTNode {
    return factory.makeUserDefinedValueTypeDefinition(this.name, factory.makeElementaryTypeName("", this.type_name));
  }
}


export class IRErrorDefinition extends IRDeclare {
  parameters : IRVariableDeclaration[];
  constructor(id : number, scope : number, name : string, parameters : IRVariableDeclaration[]) {
    super(id, scope, name);
    this.parameters = parameters;
  }
  lower() : ASTNode {
    return factory.makeErrorDefinition(this.name, factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)));
  }
}

export class IREventDefinition extends IRDeclare {
  anonymous : boolean;
  parameters : IRVariableDeclaration[];
  constructor(id : number, scope : number, name : string, anonymous : boolean, parameters : IRVariableDeclaration[]) {
    super(id, scope, name);
    this.anonymous = anonymous;
    this.parameters = parameters;
  }
  lower() : ASTNode {
    return factory.makeEventDefinition(this.anonymous, this.name, factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)));
  }
}

export class IRStructDefinition extends IRDeclare {
  members : IRVariableDeclaration[];
  constructor(id : number, scope : number, name : string, members : IRVariableDeclaration[]) {
    super(id, scope, name);
    assert(members.length > 0, "IRStructDefinition: members is empty")
    this.members = members;
  }
  lower() : ASTNode {
    return factory.makeStructDefinition(this.name, this.scope, "", this.members.map((member) => member.lower() as VariableDeclaration));
  }
}

export class IRModifier extends IRDeclare {
  virtual : boolean;
  override : boolean;
  visibility : string;
  parameters : IRVariableDeclaration[];
  body : IRStatement[];
  constructor(id : number, scope : number, name : string, virtual : boolean, override : boolean, visibility : string, parameters : IRVariableDeclaration[], body : IRStatement[]) {
    super(id, scope, name);
    this.virtual = virtual;
    this.override = override;
    this.visibility = visibility;
    this.parameters = parameters;
    this.body = body;
  }
  lower() : ASTNode {
    let has_placeholder = false;
    const lowered_body = this.body.map(function(stmt) {
      if (stmt instanceof IRPlaceholderStatement) {
        has_placeholder = true;
      }
      return stmt.lower();
    });
    assert(has_placeholder, "IRModifier: body does not contain placeholder");
    return factory.makeModifierDefinition(this.name, this.virtual, this.visibility,
      factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)),
      this.override ? factory.makeOverrideSpecifier([]) : undefined,
      factory.makeBlock(lowered_body));
  }
}

export type Modifier = {
  name : string;
  arg_names : string[];
};

export class IRFunctionDefinition extends IRDeclare {
  kind : FunctionKind;
  virtual : boolean;
  override : boolean;
  visibility : FunctionVisibility | undefined;
  stateMutability : FunctionStateMutability | undefined;
  parameters : IRVariableDeclaration[];
  returns : IRVariableDeclaration[];
  modifier : Modifier[];
  body : IRStatement[];
  return_type : UnionType | undefined;
  parameter_type : UnionType | undefined;
  function_type : FunctionType | undefined;
  constructor(id : number, scope : number, name : string, kind : FunctionKind,
    virtual : boolean, override : boolean, parameters : IRVariableDeclaration[], returns : IRVariableDeclaration[],
    body : IRStatement[], modifier : Modifier[], visibility ?: FunctionVisibility, stateMutability ?: FunctionStateMutability) {
    super(id, scope, name);
    this.virtual = virtual;
    this.override = override;
    this.kind = kind;
    this.visibility = visibility;
    this.stateMutability = stateMutability;
    this.parameters = parameters;
    this.returns = returns;
    this.modifier = modifier;
    this.body = body;
  }

  returnType() : UnionType {
    if (this.return_type !== undefined) return this.return_type.copy() as UnionType;
    this.returns.map(function(ret) {
      assert(ret.type !== undefined, "IRFunctionDefinition: return type is not generated");
    });
    this.return_type = new UnionType(this.returns.map((ret) => ret.type!.copy()));
    return this.return_type.copy() as UnionType;
  }

  parameterType() : UnionType {
    if (this.parameter_type !== undefined) return this.parameter_type.copy() as UnionType;
    this.parameters.map(function(param) {
      assert(param.type !== undefined, "IRFunctionDefinition: parameter type is not generated");
    });
    this.parameter_type = new UnionType(this.parameters.map((param) => param.type!.copy()));
    return this.parameter_type.copy() as UnionType;
  }

  functionType() : FunctionType {
    if (this.function_type !== undefined) return this.function_type.copy() as FunctionType;
    let t_visibility : "public" | "internal" | "external" | "private";
    switch (this.visibility) {
      case FunctionVisibility.Public: t_visibility = "public"; break;
      case FunctionVisibility.Internal: t_visibility = "internal"; break;
      case FunctionVisibility.External: t_visibility = "external"; break;
      case FunctionVisibility.Private: t_visibility = "private"; break;
      default: assert(false, "IRFunctionDefinition: visibility is not set");
    }
    let t_stateMutability : "pure" | "view" | "payable" | "nonpayable";
    assert(this.stateMutability !== undefined, "IRFunctionDefinition: stateMutability is not set");
    switch (this.stateMutability) {
      case FunctionStateMutability.Pure: t_stateMutability = "pure"; break;
      case FunctionStateMutability.View: t_stateMutability = "view"; break;
      case FunctionStateMutability.Payable: t_stateMutability = "payable"; break;
      case FunctionStateMutability.NonPayable: t_stateMutability = "nonpayable"; break;
      default: assert(false, "IRFunctionDefinition: stateMutability is not set");
    }
    return this.function_type = new FunctionType(t_visibility, t_stateMutability, this.parameterType(), this.returnType());
  }

  lower() : ASTNode {
    assert(this.visibility !== undefined,
      `IRFunctionDefinition ${this.id}: visibility is undefined, stateMutability is ${this.stateMutability}`);
    assert(this.stateMutability !== undefined,
      `IRFunctionDefinition ${this.id}: stateMutability is undefined, visibility is ${this.visibility}`);
    //WARNING: currently, we don't support visibility = default or stateMutability = constant
    assert(this.visibility !== FunctionVisibility.Default, `IRFunctionDefinition ${this.id}: visibility is default`);
    assert(this.stateMutability !== FunctionStateMutability.Constant, `IRFunctionDefinition ${this.id}: stateMutability is constant`);
    const modifier_invocation : ModifierInvocation[] = [];
    for (const modifier of this.modifier) {
      assert(name2declare.has(modifier.name), `IRFunctionDefinition: modifier ${modifier} is not declared`);
      const modifier_identifier = factory.makeIdentifier("", modifier.name, name2declare.get(modifier.name)!.id);
      for (const arg_name of modifier.arg_names) {
        assert(name2declare.has(arg_name), `IRFunctionDefinition: arg_name ${arg_name} is not declared`);
      }
      modifier_invocation.push(factory.makeModifierInvocation(modifier_identifier, modifier.arg_names.map((arg_name) => factory.makeIdentifier("", arg_name, name2declare.get(arg_name)!.id))));
    };
    const parameterList = factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration));
    const returnParameterList = factory.makeParameterList(this.returns.map((ret) => ret.lower() as VariableDeclaration));
    const lowered_body = this.body.map(function(stmt) {
      return stmt.lower();
    });
    return factory.makeFunctionDefinition(this.scope, this.kind, this.name, this.virtual, this.visibility, this.stateMutability,
      this.kind == FunctionKind.Constructor, parameterList, returnParameterList, modifier_invocation,
      this.override ? factory.makeOverrideSpecifier([]) : undefined, factory.makeBlock(lowered_body));
  }
}

export class IRContractDefinition extends IRDeclare {
  kind : ContractKind;
  abstract : boolean;
  fullyImplemented : boolean;
  body : IRNode[];
  linearizedBaseContracts : number[];
  usedErrors : number[];
  usedEvent : number[];
  constructor_parameters : IRVariableDeclaration[];
  constructor(id : number, scope : number, name : string, kind : ContractKind, abstract : boolean, fullyImplemented : boolean,
    body : IRNode[], linearizedBaseContracts : number[], usedErrors : number[], usedEvent : number[],
    constructor_parameters : IRVariableDeclaration[]) {
    super(id, scope, name);
    this.kind = kind;
    this.abstract = abstract;
    this.fullyImplemented = fullyImplemented;
    this.body = body;
    this.linearizedBaseContracts = linearizedBaseContracts;
    this.usedErrors = usedErrors;
    this.usedEvent = usedEvent;
    this.constructor_parameters = constructor_parameters;
  }
  lower() {
    const lowerecd_body = this.body.map(function(stmt) {
      return stmt.lower() as ASTNode;
    });
    return factory.makeContractDefinition(this.name, this.scope, this.kind, this.abstract, this.fullyImplemented, this.linearizedBaseContracts, this.usedErrors, this.usedEvent, undefined, lowerecd_body);
  }
}