import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgDocNavbarComponent, NgDocRootComponent, NgDocSidebarComponent } from '@ng-doc/app';

/** The documentation layout, below the application's fixed header. */
@Component({
  selector: 'app-docs',
  imports: [RouterOutlet, NgDocRootComponent, NgDocNavbarComponent, NgDocSidebarComponent],
  template: `
    <ng-doc-root>
      <ng-doc-navbar>
        <span ngDocNavbarLeft>My library</span>
      </ng-doc-navbar>
      <ng-doc-sidebar />
      <router-outlet />
    </ng-doc-root>
  `,
  styles: `
    :host {
      --ng-doc-layout-top: 48px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsLayout {}

/** A page of the documentation. */
@Component({
  selector: 'app-guide',
  template: `<h1 id="intro">Guide</h1>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidePage {}
