import { NgDocAngularEntities, NgDocDeclarations } from '../constants';

export type NgDocDeclarationType = typeof NgDocDeclarations[number];
export type NgDocAngularEntityType = typeof NgDocAngularEntities[number];
export type NgDocKindType = NgDocDeclarationType | NgDocAngularEntityType;
