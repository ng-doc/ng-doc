import {NgModule} from '@angular/core';

import {NgDocDemoRendererDirective} from './demo-renderer.directive';

@NgModule({
	declarations: [NgDocDemoRendererDirective],
	exports: [NgDocDemoRendererDirective],
})
export class NgDocDemoRendererModule {}
