import {Directive, Type} from '@angular/core';
import {NgDocDemoAssets} from '@ng-doc/app/interfaces';
import {NgDocPlayground} from '@ng-doc/builder';

export abstract class NgDocRootPage {
	abstract readonly pageContent: string;
	abstract readonly module?: Type<object>;
	abstract readonly demo?: Record<string, Type<object>>;
	abstract readonly demoAssets?: NgDocDemoAssets;
	abstract readonly playground?: NgDocPlayground;
}
