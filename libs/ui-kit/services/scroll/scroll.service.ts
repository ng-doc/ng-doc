import {BlockScrollStrategy, ViewportRuler} from '@angular/cdk/overlay';
import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';

@Injectable({
	providedIn: 'root',
})
export class NgDocScrollService {
	scrollStrategy: BlockScrollStrategy;

	constructor(
		@Inject(DOCUMENT)
		private readonly document: Document,
		private readonly viewportRuler: ViewportRuler,
	) {
		this.scrollStrategy = new BlockScrollStrategy(this.viewportRuler, this.document);
	}

	/**
	 * Block global scroll
	 */
	block(): void {
		this.scrollStrategy.enable();
	}

	/**
	 * Unblock global scroll
	 */
	unblock(): void {
		this.scrollStrategy.disable();
	}
}
