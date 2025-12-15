import { AnimationCallbackEvent, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

/** Component helps to expand or collapse content */
@Component({
  selector: 'ng-doc-expander',
  templateUrl: './expander.component.html',
  styleUrls: ['./expander.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusModule],
})
export class NgDocExpanderComponent {
  /** Change expand state */
  @Input()
  expanded: boolean = false;

  /** Expander content */
  @Input({ required: true })
  content!: NgDocContent;

  @Input()
  collapseMod: 'remove' | 'hide' = 'remove';

  toggle(): void {
    this.expanded = !this.expanded;
  }

  protected enter(container: HTMLElement, event: AnimationCallbackEvent): void {
    setTimeout(() => {
      container
        .animate(
          [
            { opacity: '0', maxHeight: 0 },
            { opacity: '1', maxHeight: container.scrollHeight + 'px' },
          ],
          {
            duration: 225,
            easing: 'cubic-bezier(0.4,0.0,0.2,1)',
            fill: 'forwards',
          },
        )
        .finished.then(() => event.animationComplete());
    });
  }

  protected leave(container: HTMLElement, event: AnimationCallbackEvent): void {
    container
      .animate(
        [
          { opacity: '1', maxHeight: container.offsetHeight + 'px' },
          { opacity: '0', maxHeight: 0 },
        ],
        {
          duration: 225,
          easing: 'cubic-bezier(0.4,0.0,0.2,1)',
          fill: 'forwards',
        },
      )
      .finished.then(() => event.animationComplete());
  }
}
