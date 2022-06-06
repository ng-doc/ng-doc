import {Type} from '@angular/core';
import {NgDocDemoAssets} from '@ng-doc/app/interfaces';

export abstract class NgDocRootPage {
	abstract readonly pageMd: string;
	abstract readonly demo: Record<string, Type<object>> | undefined;
	abstract readonly demoAssets: NgDocDemoAssets | undefined;
}
