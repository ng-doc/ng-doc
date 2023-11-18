import { AnimationMetadata } from '@angular/animations';
import { OverlayConfig } from '@angular/cdk/overlay';
import { ViewContainerRef } from '@angular/core';
import { Constructor } from '@ng-doc/core/types';

import { NgDocOverlayContainer } from './overlay-container';
import { NgDocOverlayProperties } from './overlay-properties';

export interface NgDocOverlayConfig extends OverlayConfig, NgDocOverlayProperties {
	readonly overlayContainer: Constructor<NgDocOverlayContainer>;
	readonly viewContainerRef?: ViewContainerRef;
	readonly disableClose?: boolean;
	readonly openAnimation?: AnimationMetadata[];
	readonly closeAnimation?: AnimationMetadata[];
}
