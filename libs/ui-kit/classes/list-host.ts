import {ElementRef} from '@angular/core';

export abstract class NgDocListHost {
	abstract listHostOrigin: ElementRef<HTMLElement> | HTMLElement | undefined;
}
