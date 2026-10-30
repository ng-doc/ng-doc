import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A page of the application outside the documentation. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <h1>Home</h1>
    <a routerLink="/docs">Documentation</a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
