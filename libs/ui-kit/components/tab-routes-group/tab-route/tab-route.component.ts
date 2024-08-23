import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocSelectionOriginDirective } from '@ng-doc/ui-kit/components/selection';

@Component({
  selector: 'a[ng-doc-tab-route]',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-route.component.html',
  styleUrl: './tab-route.component.scss',
  hostDirectives: [
    { directive: NgDocSelectionOriginDirective, inputs: ['ngDocSelectionOrigin: isActive'] },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabRouteComponent {
  @Input()
  isActive = false;
}
