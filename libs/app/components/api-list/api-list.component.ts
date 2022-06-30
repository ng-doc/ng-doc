import {Component, OnInit} from '@angular/core';

/**
 * Decorator that binds a DOM event to a host listener and supplies configuration metadata.
 * Angular invokes the supplied handler method when the host element emits the specified event,
 * and updates the bound element with the result.
 *
 * If the handler method returns false, applies `preventDefault` on the bound element.
 *
 * The following example declares a directive
 * that attaches a click listener to a button and counts clicks.
 *
 * ```typescript
 * @Directive({selector: 'button[counting]'})
 * class CountClicks {
 *   numberOfClicks = 0;
 *
 *   @HostListener('click', ['$event.target'])
 *   onClick(btn) {
 *     console.log('button', btn, 'number of clicks:', this.numberOfClicks++);
 *   }
 * }
 *
 * @Component({
 *   selector: 'app',
 *   template: '<button counting>Increment</button>',
 * })
 * class App {}
 *
 * ```
 *
 * The following example registers another DOM event handler that listens for `Enter` key-press
 * events on the global `window`.
 * ```typescript
 * import { HostListener, Component } from "@angular/core";
 *
 * @Component({
 *   selector: 'app',
 *   template: `<h1>Hello, you have pressed enter {{counter}} number of times!</h1> Press enter key
 * to increment the counter.
 *   <button (click)="resetCounter()">Reset Counter</button>`
 * })
 * class AppComponent {
 *   counter = 0;
 *   @HostListener('window:keydown.enter', ['$event'])
 *   handleKeyDown(event: KeyboardEvent) {
 *     this.counter++;
 *   }
 *   resetCounter() {
 *     this.counter = 0;
 *   }
 * }
 * ```
 * The list of valid key names for `keydown` and `keyup` events
 * can be found here:
 * https://www.w3.org/TR/DOM-Level-3-Events-key/#named-key-attribute-values
 *
 * Note that keys can also be combined, e.g. `@HostListener('keydown.shift.a')`.
 *
 * The global target names that can be used to prefix an event name are
 * `document:`, `window:` and `body:`.
 *
 */
@Component({
	selector: 'ng-doc-api-list',
	templateUrl: './api-list.component.html',
	styleUrls: ['./api-list.component.scss'],
})
export class NgDocApiListComponent implements OnInit {
	constructor() {}

	ngOnInit(): void {}
}
