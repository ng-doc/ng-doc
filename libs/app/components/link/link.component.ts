import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Router link to a path of the application.
 */
@Component({
  selector: 'ng-doc-link',
  templateUrl: './link.component.html',
  styleUrls: ['./link.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class NgDocLinkComponent {
  /** The path to link to. */
  readonly path = input<string>('');
}
