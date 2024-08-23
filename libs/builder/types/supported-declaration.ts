import {
  ClassDeclaration,
  EnumDeclaration,
  FunctionDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  VariableDeclaration,
} from 'ts-morph';

export type NgDocSupportedDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | EnumDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | TypeAliasDeclaration;
