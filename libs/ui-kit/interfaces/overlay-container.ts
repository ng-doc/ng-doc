import { NgDocContent, NgDocOverlayAnimationEvent } from '@ng-doc/ui-kit/types';
import { Observable } from 'rxjs';

import { NgDocOverlayConfig } from './overlay-config';

export interface NgDocOverlayContainer {
	animationEvent: Observable<NgDocOverlayAnimationEvent>;
	config?: NgDocOverlayConfig;
	content: NgDocContent;
	isFocused: boolean;

	close(): void;

	markForCheck(): void;

	focus(): void;
}
