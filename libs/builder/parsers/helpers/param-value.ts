import * as P from 'parsimmon';

export const paramValue = () => P.regexp(/.+?(?=")/).wrap(P.string('"'), P.string('"'));
