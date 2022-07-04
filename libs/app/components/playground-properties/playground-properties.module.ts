import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocPlaygroundPropertyModule} from '@ng-doc/app/components/playground-property';

import {NgDocPlaygroundPropertiesComponent} from './playground-properties.component';

@NgModule({
	declarations: [NgDocPlaygroundPropertiesComponent],
	imports: [CommonModule, NgDocPlaygroundPropertyModule],
	exports: [NgDocPlaygroundPropertiesComponent],
})
export class NgDocPlaygroundPropertiesModule {}
