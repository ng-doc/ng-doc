import { NgIf, NgTemplateOutlet } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { expandCollapseAnimation, preventInitialChildAnimations } from '@ng-doc/ui-kit/animations';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

/** Component helps to expand or collapse content */
@Component({
  animations: [preventInitialChildAnimations, expandCollapseAnimation],
  selector: 'ng-doc-expander',
  templateUrl: './expander.component.html',
  styleUrls: ['./expander.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, PolymorpheusModule, NgTemplateOutlet],
})
export class NgDocExpanderComponent implements AfterViewInit {
  /** Change expand state */
  @Input()
  expanded: boolean = false;

  /** Expander content */
  @Input({ required: true })
  content!: NgDocContent;

  /** Closed height could be used to show preview of the content */
  @Input()
  from: number = 0;

  protected animationDisabled = true;

  ngAfterViewInit(): void {
    this.animationDisabled = false;
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }
}
