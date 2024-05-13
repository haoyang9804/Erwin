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
  FunctionStateMutability,
  Expression,
  ModifierInvocation,
  ContractKind
} from "solc-typed-ast"

import { assert } from "./utility";
import { TypeKind, Type, ElementaryType, UnionType, FunctionType } from "./type";
import { constantLock } from "./constrant";
import { IRNode, FieldFlag, factory } from "./node";
import { IRExpression } from "./expression";
import { IRStatement, IRPlaceholderStatement } from "./statement";

export const name2declare = new Map<string, IRDeclare>();
export const name2Event = new Map<string, IREventDefinition>();

export abstract class IRDeclare extends IRNode {
  name : string;
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string) {
    super(id, scope, field_flag);
    this.name = name;
    name2declare.set(name, this);
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
  values : string[] = [];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, values : string[]) {
    super(id, scope, field_flag, name);
    assert(values.length > 0, "IREnumDefinition: values is empty");
    this.values = values;
  }
  lower() : ASTNode {
    return factory.makeEnumDefinition(this.name, this.values.map((value) => factory.makeEnumValue(value)));
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
  anonymous : boolean;
  parameters : IRVariableDeclare[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, anonymous : boolean, parameters : IRVariableDeclare[]) {
    super(id, scope, field_flag, name);
    this.anonymous = anonymous;
    this.parameters = parameters;
  }
  lower() : ASTNode {
    return factory.makeEventDefinition(this.anonymous, this.name, factory.makeParameterList(this.parameters.map((parameter) => parameter.lower() as VariableDeclaration)));
  }
}

export class IRStructDefinition extends IRDeclare {
  visibility : string = "public";
  members : IRVariableDeclare[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, members : IRVariableDeclare[]) {
    super(id, scope, field_flag, name);
    assert(members.length > 0, "IRStructDefinition: members is empty")
    this.members = members;
  }
  lower() : ASTNode {
    return factory.makeStructDefinition(this.name, this.scope, this.visibility, this.members.map((member) => member.lower() as VariableDeclaration));
  }
}

export class IRModifier extends IRDeclare {
  virtual : boolean;
  override : boolean;
  visibility : string;
  parameters : IRVariableDeclare[];
  body : (IRStatement | IRExpression)[];
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, virtual : boolean, override : boolean, visibility : string, parameters : IRVariableDeclare[], body : (IRStatement | IRExpression)[]) {
    super(id, scope, field_flag, name);
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
      const lowered_stmt = stmt.lower();
      if (stmt instanceof IRStatement) return lowered_stmt;
      else if (stmt instanceof IRExpression) {
        assert(lowered_stmt instanceof Expression, "IRModifier: lowered_stmt is not Expression");
        return factory.makeExpressionStatement(lowered_stmt);
      }
      assert(false, "IRModifier: stmt is not IRStatement or IRExpression");
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
  visibility : FunctionVisibility;
  stateMutability : FunctionStateMutability;
  parameters : IRVariableDeclare[];
  returns : IRVariableDeclare[];
  modifier : Modifier[];
  body : (IRStatement | IRExpression)[];
  return_type : UnionType | undefined;
  parameter_type : UnionType | undefined;
  function_type : FunctionType | undefined;
  constructor(id : number, scope : number, field_flag : FieldFlag, name : string, kind : FunctionKind,
    virtual : boolean, override : boolean, visibility : FunctionVisibility, stateMutability : FunctionStateMutability,
    parameters : IRVariableDeclare[], returns : IRVariableDeclare[], body : (IRStatement | IRExpression)[],
    modifier : Modifier[]) {
    //WARNING: currently, we don't support visibility = default or stateMutability = constant
    assert(visibility !== FunctionVisibility.Default, "IRFunctionDefinition: visibility is default");
    assert(stateMutability !== FunctionStateMutability.Constant, "IRFunctionDefinition: stateMutability is constant");
    super(id, scope, field_flag, name);
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
      const lowered_stmt = stmt.lower();
      if (stmt instanceof IRStatement) return lowered_stmt;
      else if (stmt instanceof IRExpression) {
        assert(lowered_stmt instanceof Expression, "IRModifier: lowered_stmt is not Expression");
        return factory.makeExpressionStatement(lowered_stmt);
      }
      assert(false, "IRModifier: stmt is not IRStatement or IRExpression");
    });
    return factory.makeFunctionDefinition(this.scope, this.kind, this.name, this.virtual, this.visibility, this.stateMutability,
      this.kind == FunctionKind.Constructor, parameterList, returnParameterList, modifier_invocation,
      this.override ? factory.makeOverrideSpecifier([]) : undefined, factory.makeBlock(lowered_body));
  }
}

export class IRContractDefinition extends IRDeclare {
  kind: ContractKind;
  abstract: boolean;
  fullyImplemented: boolean;
  body: (IRDeclare | IRStatement | IRExpression)[];
  linearizedBaseContracts: number[];
  usedErrors: number[];
  usedEvent: number[];
  constructor(id: number, scope: number, field_flag: FieldFlag, name: string, kind: ContractKind, abstract: boolean, fullyImplemented: boolean, body: (IRDeclare | IRStatement | IRExpression)[], linearizedBaseContracts: number[], usedErrors: number[], usedEvent: number[]) {
    super(id, scope, field_flag, name);
    this.kind = kind;
    this.abstract = abstract;
    this.fullyImplemented = fullyImplemented;
    this.body = body;
    this.linearizedBaseContracts = linearizedBaseContracts;
    this.usedErrors = usedErrors;
    this.usedEvent = usedEvent;
  }
  lower() {
    const lowerecd_body = this.body.map(function (stmt) {
      return stmt.lower() as ASTNode;
    });
    return factory.makeContractDefinition(this.name, this.scope, this.kind, this.abstract, this.fullyImplemented, this.linearizedBaseContracts, this.usedErrors, this.usedEvent, undefined, lowerecd_body);
  }
}