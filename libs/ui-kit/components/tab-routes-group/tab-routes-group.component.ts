import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
} from '@ng-doc/ui-kit/components/selection';

@Component({
  selector: 'ng-doc-tab-routes-group',
  standalone: true,
  templateUrl: './tab-routes-group.component.html',
  styleUrl: './tab-routes-group.component.scss',
  imports: [CommonModule, NgDocSelectionComponent, NgDocSelectionHostDirective],
  hostDirectives: [NgDocSelectionHostDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabRoutesGroupComponent {}
