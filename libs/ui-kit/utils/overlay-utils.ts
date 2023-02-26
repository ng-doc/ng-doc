import {ConnectedPosition, ConnectionPositionPair} from '@angular/cdk/overlay';
import {asArray} from '@ng-doc/core/helpers/as-array';
import {
	NgDocHorizontalAlign,
	NgDocOverlayPosition,
	NgDocOverlayRelativePosition,
	NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';

export const NG_DOC_ARROW_MARGIN: number = 32;

const POSITION_DESCRIPTION: Record<string, ConnectedPosition> = {
	'top-left': {
		originX: 'start',
		originY: 'top',
		overlayX: 'start',
		overlayY: 'bottom',
	},
	'top-center': {
		originX: 'center',
		originY: 'top',
		overlayX: 'center',
		overlayY: 'bottom',
	},
	'top-right': {
		originX: 'end',
		originY: 'top',
		overlayX: 'end',
		overlayY: 'bottom',
	},
	'bottom-left': {
		originX: 'start',
		originY: 'bottom',
		overlayX: 'start',
		overlayY: 'top',
	},
	'bottom-center': {
		originX: 'center',
		originY: 'bottom',
		overlayX: 'center',
		overlayY: 'top',
	},
	'bottom-right': {
		originX: 'end',
		originY: 'bottom',
		overlayX: 'end',
		overlayY: 'top',
	},
	'left-top': {
		originX: 'start',
		originY: 'top',
		overlayX: 'end',
		overlayY: 'top',
	},
	'left-center': {
		originX: 'start',
		originY: 'center',
		overlayX: 'end',
		overlayY: 'center',
	},
	'left-bottom': {
		originX: 'start',
		originY: 'bottom',
		overlayX: 'end',
		overlayY: 'bottom',
	},
	'right-top': {
		originX: 'end',
		originY: 'top',
		overlayX: 'start',
		overlayY: 'top',
	},
	'right-center': {
		originX: 'end',
		originY: 'center',
		overlayX: 'start',
		overlayY: 'center',
	},
	'right-bottom': {
		originX: 'end',
		originY: 'bottom',
		overlayX: 'start',
		overlayY: 'bottom',
	},
};

export class NgDocOverlayUtils {
	static getConnectedPosition(
		dropdownPositions: NgDocOverlayPosition | NgDocOverlayPosition[],
		origin: HTMLElement,
		offset: number = 0,
		withPointer: boolean = false,
	): ConnectedPosition[] {
		return asArray(dropdownPositions).map((position: NgDocOverlayPosition) => {
			const connectedPosition: ConnectedPosition = NgDocOverlayUtils.toConnectedPosition(position);
			const marginMultiplier: number = NgDocOverlayUtils.getMarginMultiplier(connectedPosition);
			const marginX: number = !NgDocOverlayUtils.isVerticalPosition(connectedPosition)
				? offset * marginMultiplier
				: 0;
			const marginY: number = NgDocOverlayUtils.isVerticalPosition(connectedPosition)
				? offset * marginMultiplier
				: 0;
			connectedPosition.offsetX = connectedPosition.offsetX || 0;
			connectedPosition.offsetY = connectedPosition.offsetY || 0;
			connectedPosition.offsetX +=
				(withPointer ? NgDocOverlayUtils.getOffsetX(origin, connectedPosition) : 0) + marginX;
			connectedPosition.offsetY +=
				(withPointer ? NgDocOverlayUtils.getOffsetY(origin, connectedPosition) : 0) + marginY;
			return connectedPosition;
		});
	}

	static toConnectedPosition(position: NgDocOverlayPosition): ConnectedPosition {
		return typeof position === 'string' ? {...POSITION_DESCRIPTION[position]} : {...position};
	}

	static toConnectedPositions(positions: NgDocOverlayPosition[]): ConnectedPosition[] {
		return positions.map(NgDocOverlayUtils.toConnectedPosition);
	}

	static getOffsetX(origin: HTMLElement, position: ConnectedPosition): number {
		const isVertical: boolean = NgDocOverlayUtils.isVerticalPosition(position);
		const offsetMultiplier: number = NgDocOverlayUtils.getOffsetMultiplier(position);
		const isCenter: boolean = NgDocOverlayUtils.isCenterPosition(position);
		const width: number =
			(position.originX === 'center' && position.overlayX !== 'center') ||
			NgDocOverlayUtils.overlayIsOutByX(position)
				? NG_DOC_ARROW_MARGIN - 24
				: origin.offsetWidth;
		return (isVertical && !isCenter ? Math.max(NG_DOC_ARROW_MARGIN - width, 0) : 0) * offsetMultiplier;
	}

	static getOffsetY(origin: HTMLElement, position: ConnectedPosition): number {
		const isVertical: boolean = NgDocOverlayUtils.isVerticalPosition(position);
		const offsetMultiplier: number = NgDocOverlayUtils.getOffsetMultiplier(position);
		const isCenter: boolean = NgDocOverlayUtils.isCenterPosition(position);
		const height: number =
			(position.originY === 'center' && position.overlayY !== 'center') ||
			NgDocOverlayUtils.overlayIsOutByY(position)
				? NG_DOC_ARROW_MARGIN - 24
				: origin.offsetHeight;
		return (!isVertical && !isCenter ? Math.max(NG_DOC_ARROW_MARGIN - height, 0) : 0) * offsetMultiplier;
	}

	static overlayIsOutByX(position: ConnectedPosition): boolean {
		return (
			(position.originX === 'start' && position.overlayX === 'end') ||
			(position.originX === 'end' && position.overlayX === 'start')
		);
	}

	static overlayIsOutByY(position: ConnectedPosition): boolean {
		return (
			(position.originY === 'top' && position.overlayY === 'bottom') ||
			(position.originY === 'bottom' && position.overlayY === 'top')
		);
	}

	static getOffsetMultiplier(position: ConnectedPosition): number {
		return (NgDocOverlayUtils.isVerticalPosition(position) && position.overlayX === 'end') ||
			(!NgDocOverlayUtils.isVerticalPosition(position) && position.overlayY === 'bottom')
			? 1
			: -1;
	}

	static getMarginMultiplier(position: ConnectedPosition): number {
		return ['right', 'bottom'].includes(NgDocOverlayUtils.getRelativePosition(position) || '') ? 1 : -1;
	}

	static isVerticalPosition(position: ConnectedPosition): boolean {
		return ['bottom', 'top'].includes(NgDocOverlayUtils.getRelativePosition(position) || '');
	}

	static isCenterPosition(position: ConnectedPosition): boolean {
		return position.overlayX === 'center' || position.overlayY === 'center';
	}

	static getPositionAlign(position: ConnectedPosition): NgDocHorizontalAlign | NgDocVerticalAlign | null {
		if (NgDocOverlayUtils.isVerticalPosition(position)) {
			return position.overlayX === 'start' ? 'left' : position.overlayX === 'end' ? 'right' : null;
		} else {
			return position.originY === 'top' ? 'top' : position.originY === 'bottom' ? 'bottom' : null;
		}
	}

	static getRelativePosition(pos: NgDocOverlayPosition): NgDocOverlayRelativePosition | null {
		const position: ConnectedPosition = NgDocOverlayUtils.toConnectedPosition(pos);
		if (position.originY === 'bottom' && position.overlayY === 'top') {
			return 'bottom';
		}
		if (position.originY === 'top' && position.overlayY === 'bottom') {
			return 'top';
		}
		if (position.originX === 'start' && position.overlayX === 'end') {
			return 'left';
		}
		if (position.originX === 'end' && position.overlayX === 'start') {
			return 'right';
		}
		return null;
	}

	static getOverlayPosition(positionPair: ConnectionPositionPair): NgDocOverlayPosition {
		const existsPosition: NgDocOverlayPosition = Object.keys(POSITION_DESCRIPTION).find((key: string) => {
			const positionDescription: ConnectedPosition = POSITION_DESCRIPTION[key];
			return (
				positionPair.originX === positionDescription.originX &&
				positionPair.originY === positionDescription.originY &&
				positionPair.overlayX === positionDescription.overlayX &&
				positionPair.overlayY === positionDescription.overlayY
			);
		}) as NgDocOverlayPosition;
		return existsPosition ? existsPosition : positionPair;
	}
}
