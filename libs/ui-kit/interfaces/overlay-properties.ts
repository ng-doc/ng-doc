import {Direction, Directionality} from '@angular/cdk/bidi';
import {NgDocOverlayOrigin, NgDocOverlayPosition} from '@ng-doc/ui-kit/types';

export interface NgDocOverlayProperties {
	origin?: NgDocOverlayOrigin;
	positions?: NgDocOverlayPosition | NgDocOverlayPosition[];
	closeIfOutsideClick?: boolean;
	closeIfInnerClick?: boolean;
	withPointer?: boolean;
	contactBorder?: boolean;
	borderOffset?: number;
	panelClass?: string | string[];
	width?: number | string;
	height?: number | string;
	minWidth?: number | string;
	minHeight?: number | string;
	maxWidth?: number | string;
	maxHeight?: number | string;
	direction?: Direction | Directionality;
	disposeOnNavigation?: boolean;
	disposeOnRouteNavigation?: boolean;
}
