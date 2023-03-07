import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocDemoRendererComponent} from './demo-renderer.component';

@NgModule({
	declarations: [NgDocDemoRendererComponent],
	imports: [CommonModule, PolymorpheusModule],
	exports: [NgDocDemoRendererComponent],
})
export class NgDocDemoRendererModule {}
