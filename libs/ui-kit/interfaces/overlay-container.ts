import {NgDocOverlayAnimationEvent} from '@ng-doc/ui-kit/types';
import {PolymorpheusContent} from '@tinkoff/ng-polymorpheus';
import {Observable} from 'rxjs';

import {NgDocOverlayConfig} from './overlay-config';

export interface NgDocOverlayContainer {
	animationEvent: Observable<NgDocOverlayAnimationEvent>;
	config?: NgDocOverlayConfig;
	content: PolymorpheusContent;
	isFocused: boolean;

	close(): void;

	markForCheck(): void;

	focus(): void;
}
