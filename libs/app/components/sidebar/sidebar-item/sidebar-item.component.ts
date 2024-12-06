import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import {
  NgDocColor,
  NgDocDotComponent,
  NgDocTagComponent,
  NgDocTextComponent,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-sidebar-item',
  templateUrl: './sidebar-item.component.html',
  styleUrls: ['./sidebar-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLinkActive, RouterLink, NgDocDotComponent, NgDocTextComponent, NgDocTagComponent],
})
export class NgDocSidebarItemComponent {
  item = input.required<NgDocNavigation>();
  statuses = computed(() => {
    const statuses = this.item().metadata?.tags['status'] ?? [];

    return statuses.map((status) => {
      const [type, text] = status.split(/\s+(.+)/);

      return { type: type.replace(/^:/, '') as NgDocColor, text };
    });
  });
}
