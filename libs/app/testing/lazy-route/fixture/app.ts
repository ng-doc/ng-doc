import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

/** The application shell: its own header above every page, the documentation included. */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="app-header"><a routerLink="/">My app</a></header>
    <router-outlet />
  `,
  styles: `
    .app-header {
      position: fixed;
      top: 0;
      z-index: 20;
      width: 100%;
      height: 48px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
