import {NgDocProvidedTypeControl} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundProperty} from '@ng-doc/core/interfaces';

export interface NgDocPlaygroundPropertyControl {
	propertyName: string;
	property: NgDocPlaygroundProperty;
	typeControl: NgDocProvidedTypeControl;
}
