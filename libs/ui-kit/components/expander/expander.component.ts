import { AnimationCallbackEvent, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

/** Component helps to expand or collapse content */
@Component({
  selector: 'ng-doc-expander',
  templateUrl: './expander.component.html',
  styleUrls: ['./expander.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PolymorpheusOutlet],
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
    container
      .animate(
        [
          { opacity: '0', height: '0px' },
          { opacity: '1', height: container.scrollHeight + 'px' },
        ],
        {
          duration: 225,
          easing: 'cubic-bezier(0.4,0.0,0.2,1)',
        },
      )
      .finished.then(() => event.animationComplete());
  }

  protected leave(container: HTMLElement, event: AnimationCallbackEvent): void {
    container
      .animate(
        [
          { opacity: '1', height: container.scrollHeight + 'px' },
          { opacity: '0', height: '0px' },
        ],
        {
          duration: 225,
          easing: 'cubic-bezier(0.4,0.0,0.2,1)',
        },
      )
      .finished.then(() => event.animationComplete());
  }
}
