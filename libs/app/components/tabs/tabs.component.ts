import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocTab } from '@ng-doc/app/interfaces';
import {
  NgDocExecutePipe,
  NgDocIconComponent,
  NgDocTabComponent,
  NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-tabs',
  imports: [NgDocTabGroupComponent, NgDocTabComponent, NgDocExecutePipe, NgDocIconComponent],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabsComponent {
  @Input()
  tabs: NgDocTab[] = [];

  getActiveIndex(tabs: NgDocTab[]): number {
    return Math.max(
      tabs.findIndex((tab: NgDocTab) => tab.active),
      0,
    );
  }

  appendElement(element: Element, parent: Element): void {
    parent.appendChild(element);
  }
}
