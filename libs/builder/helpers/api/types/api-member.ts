import { ClassDeclaration, InterfaceDeclaration, JSDocableNodeStructure } from 'ts-morph';

export type ParentRelationType = 'inherited' | 'implements' | 'overrides';

export interface ParentRelation {
  relation: ParentRelationType;
  parent: ClassDeclaration | InterfaceDeclaration;
}

export interface ParentApiRelation {
  relation: ParentRelationType;
  parent: string;
}

export interface ApiMember<T, D> {
  structure: T;
  declaration: D;
  parentRelation?: ParentRelation;
  docNode?: JSDocableNodeStructure;
}
