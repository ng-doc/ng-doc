import { EnumMember } from 'ts-morph';

import { DocApi, mapDocApi } from './map-docs';

export interface EnumMemberApi {
  name: string;
  value: string | number | undefined;
  docs: DocApi[];
}

/**
 *
 * @param member
 */
export function mapEnumMemberApi(member: EnumMember): EnumMemberApi {
  return {
    name: member.getName(),
    value: member.getValue(),
    docs: mapDocApi(member.getStructure()),
  };
}
