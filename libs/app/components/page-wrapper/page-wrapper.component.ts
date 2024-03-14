import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Routes } from '@angular/router';
import { NgDocTabRouteComponent, NgDocTabRoutesGroupComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-page-wrapper',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    NgDocTabRouteComponent,
    NgDocTabRoutesGroupComponent,
    RouterLinkActive,
  ],
  templateUrl: './page-wrapper.component.html',
  styleUrl: './page-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageWrapperComponent {
  @Input({ required: true })
  routes!: Routes;
}
