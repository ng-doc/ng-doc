import {Type} from '@angular/core';

import {NgDocPlaygroundProperties} from '../interfaces';

export type NgDocPlaygroundsMetadata = Record<string, NgDocPlaygroundMetadata>;

export interface NgDocPlaygroundMetadata {
	components: Record<string, Type<unknown>>;
	properties: NgDocPlaygroundProperties;
}
