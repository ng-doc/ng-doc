import {OverlayModule} from '@angular/cdk/overlay';
import {NgModule} from '@angular/core';

import {NgDocOverlayService} from './overlay.service';

@NgModule({
	providers: [NgDocOverlayService],
	imports: [OverlayModule],
})
export class NgDocOverlayModule {}
