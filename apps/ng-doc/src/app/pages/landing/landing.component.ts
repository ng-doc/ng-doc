import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  NgDocButtonComponent,
  NgDocIconComponent,
  NgDocTextComponent,
  NgDocTextLeftDirective,
  NgDocTextRightDirective,
} from '@ng-doc/ui-kit';

import { BackgroundComponent } from './background/background.component';

@Component({
  selector: 'ng-doc-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackgroundComponent,
    RouterLink,
    NgDocIconComponent,
    NgDocTextComponent,
    NgDocTextLeftDirective,
    NgDocTextRightDirective,
    NgDocButtonComponent,
  ],
})
export class LandingComponent {}
