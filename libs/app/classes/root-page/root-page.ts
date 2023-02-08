import {Type} from '@angular/core';
import {NgDocDemoAssets} from '@ng-doc/app/interfaces';
import {NgDocPlayground} from '@ng-doc/core';

export abstract class NgDocRootPage {
	abstract readonly pageContent: string;
	abstract readonly editSourceFileUrl?: string;
	abstract readonly viewSourceFileUrl?: string;
	abstract readonly module?: Type<object>;
	abstract readonly demo?: Record<string, Type<object>>;
	abstract readonly demoAssets?: NgDocDemoAssets;
	abstract readonly playground?: NgDocPlayground;
}
