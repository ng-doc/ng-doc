import {ChangeDetectorRef, Type, ViewContainerRef} from '@angular/core';

export abstract class NgDocBaseDemoComponent {
	abstract demo?: Type<unknown>
	abstract changeDetectorRef?: ChangeDetectorRef;
}
