import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {NgDocFocusControlModule} from '@ng-doc/ui-kit/components/focus-control';
import {NgDocOverlayPointerModule} from '@ng-doc/ui-kit/components/overlay-pointer';
import {NgDocEventSwitcherModule} from '@ng-doc/ui-kit/directives/event-switcher';
import {NgDocFocusCatcherModule} from '@ng-doc/ui-kit/directives/focus-catcher';
import {NgDocFocusableModule} from '@ng-doc/ui-kit/directives/focusable';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

import {NgDocOverlayContainerComponent} from './overlay-container.component';

@NgModule({
	declarations: [NgDocOverlayContainerComponent],
	imports: [
		CommonModule,
		PolymorpheusModule,
		NgDocOverlayPointerModule,
		NgDocEventSwitcherModule,
		NgDocFocusableModule,
		NgDocFocusControlModule,
		NgDocFocusCatcherModule,
	],
})
export class NgDocOverlayContainerModule {}
