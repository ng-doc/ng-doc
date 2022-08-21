import {Type, ViewContainerRef} from '@angular/core';

export abstract class NgDocBaseDemoComponent {
	abstract demo?: Type<unknown>;
	abstract viewContainerRef?: ViewContainerRef;
	abstract content?: Record<string, boolean>;
	abstract data?: Record<string, unknown>;
}
