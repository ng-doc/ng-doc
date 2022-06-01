import {Type} from '@angular/core';

export abstract class NgDocRootPage {
	abstract readonly pageMd: string;
	abstract readonly demo: Record<string, Type<unknown>> | undefined;
}
