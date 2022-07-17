import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPlaygroundPropertyModule} from '@ng-doc/app/components/playground-property';
import {NgDocButtonIconModule, NgDocIconModule} from '@ng-doc/ui-kit';

import {NgDocPlaygroundPropertiesComponent} from './playground-properties.component';

@NgModule({
	declarations: [NgDocPlaygroundPropertiesComponent],
	imports: [CommonModule, NgDocPlaygroundPropertyModule, NgDocButtonIconModule, NgDocIconModule],
	exports: [NgDocPlaygroundPropertiesComponent],
})
export class NgDocPlaygroundPropertiesModule {}
