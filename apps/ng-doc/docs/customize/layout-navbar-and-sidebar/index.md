---
keyword: LayoutPage
---

The layout of a documentation site is three components from `@ng-doc/app`: `NgDocRootComponent`
holds the page, `NgDocNavbarComponent` is the header bar, and `NgDocSidebarComponent` lists your
pages. This page shows what you can put in them, how to size them, and how to replace the navbar or
the sidebar with your own component.

## See it

The root component of this site uses the whole layout:

```html name="app.component.html"
<ng-doc-root>
  <ng-doc-navbar>
    <a ngDocNavbarLeft routerLink="/">My library</a>
    <nav ngDocNavbarCenter aria-label="Primary">
      <a routerLink="/docs/get-started/installation">Guides</a>
      <a routerLink="/docs/api">API</a>
    </nav>
    <ng-doc-theme-toggle ngDocNavbarRight />
  </ng-doc-navbar>

  <ng-doc-sidebar />
  <router-outlet />
</ng-doc-root>
```

`ng-doc-root` places the navbar at the top, the sidebar on the left and everything else, usually
the `router-outlet`, in the page area. Its first focusable element is a "Skip to content" link,
shown only while it has focus, that moves keyboard focus past the navbar and the sidebar.

## Root

| Input           | Type           | Default | Description                                                                                            |
| --------------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `sidebar`       | `boolean`      | `true`  | Shows the sidebar. Turn it off on pages without navigation, such as a landing page.                    |
| `noWidthLimit`  | `boolean`      | `false` | Lets the page use the full width of the window instead of `--ng-doc-app-max-width`.                    |
| `footerContent` | `NgDocContent` | `''`    | Content below the page: a string, a template or a component. Without it, the layout renders no footer. |

A footer from a template:

```html name="app.component.html"
<ng-doc-root [footerContent]="footer">
  <!-- The navbar, the sidebar and the router outlet -->
</ng-doc-root>

<ng-template #footer>MIT License</ng-template>
```

## Navbar

The navbar lays out, from left to right:

1. A menu button that opens the sidebar. It shows only at 900px and below, where the sidebar is an
   overlay.
2. The content marked with `ngDocNavbarLeft`, such as the logo.
3. The content marked with `ngDocNavbarCenter`, such as links to the sections of the site. It is
   hidden at 1024px and below.
4. The search field (`*SearchPage`).
5. The content marked with `ngDocNavbarRight`, such as the theme toggle or a link to your
   repository.

The markers are plain attributes, so you don't need to import anything for them. Put any element
in the navbar:

```html name="app.component.html"
<ng-doc-navbar>
  <a ngDocNavbarLeft routerLink="/">
    <img src="images/logo.svg" alt="" width="28" height="28" />
    My library
  </a>
  <ng-doc-theme-toggle ngDocNavbarRight />
  <a ngDocNavbarRight ng-doc-button-icon size="large" href="https://github.com/me/my-library" target="_blank" rel="noopener" aria-label="My library on GitHub" ngDocTooltip="Repository on GitHub">
    <ng-doc-icon customIcon="github" size="24" />
  </a>
</ng-doc-navbar>
```

`ng-doc-theme-toggle` switches between the Auto, Light and Dark themes in turn
(`*ThemesAndColorsPage`). Import `NgDocThemeToggleComponent` from `@ng-doc/app`, and
`NgDocButtonIconComponent`, `NgDocIconComponent` and `NgDocTooltipDirective` from
`@ng-doc/ui-kit`. The `github` icon is a custom icon (`*IconsPage`).

| Input         | Type      | Default | Description                                                                                                    |
| ------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `search`      | `boolean` | `true`  | Shows the search field.                                                                                        |
| `hamburger`   | `boolean` | `true`  | Shows the menu button at 900px and below. Turn it off on pages without a sidebar.                              |
| `glassEffect` | `boolean` | `true`  | Makes the bar translucent and blurs the page behind it. Without it, the bar uses `--ng-doc-navbar-background`. |

Escape closes the sidebar overlay and returns focus to the menu button.

## Sidebar

`ng-doc-sidebar` lists your categories and pages, in the order and with the options that you set in
`ng-doc.category.ts` and `ng-doc.page.ts` (`*PagesAndCategoriesPage`). It has no inputs. On wide
screens it is always shown; at 900px and below it is an overlay that the menu button opens and a
navigation closes.

## Sizes and colors

Override these CSS variables in your global styles, for example in `styles.css`:

```css name="styles.css"
:root {
  --ng-doc-app-max-width: 1600px;
  --ng-doc-sidebar-width: 320px;
}
```

| Variable                              | Default                                | Description                                                      |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `--ng-doc-app-max-width`              | `1440px`                               | The widest the navbar content and the page area get.             |
| `--ng-doc-app-horizontal-padding`     | `24px`                                 | Padding at the sides of the navbar, the sidebar and the page.    |
| `--ng-doc-navbar-height`              | `60px`                                 | The height of the navbar. The page starts below it.              |
| `--ng-doc-navbar-background`          | `--ng-doc-base-0`                      | The navbar color. With `glassEffect`, it is mixed with the page. |
| `--ng-doc-navbar-border`              | `1px solid var(--ng-doc-border-color)` | The line below the navbar.                                       |
| `--ng-doc-navbar-horizontal-padding`  | `--ng-doc-app-horizontal-padding`      | Padding at the sides of the navbar.                              |
| `--ng-doc-sidebar-width`              | `288px`                                | The width of the sidebar.                                        |
| `--ng-doc-sidebar-background`         | `--ng-doc-base-0`                      | The sidebar color.                                               |
| `--ng-doc-sidebar-horizontal-padding` | `--ng-doc-app-horizontal-padding`      | Padding at the sides of the sidebar.                             |
| `--ng-doc-content-max-width`          | `760px`                                | The widest the text of a guide page gets.                        |
| `--ng-doc-api-content-max-width`      | `880px`                                | The widest an API page gets.                                     |
| `--ng-doc-toc-width`                  | `240px`                                | The width of the "On this page" rail on the right of a page.     |

Colors are described in `*ThemesAndColorsPage`. If you build your own navbar or sidebar, read these
variables too, so that it lines up with the rest of the layout.

## Custom navbar

To replace the navbar, put your own component in `ng-doc-root` instead of `ng-doc-navbar`, and mark
it with the `ngDocCustomNavbar` attribute:

```html name="app.component.html"
<ng-doc-root>
  <app-navbar ngDocCustomNavbar />
  <ng-doc-sidebar />
  <router-outlet />
</ng-doc-root>
```

`ng-doc-root` gives it the navbar's place. At 900px and below, your navbar needs a button that opens
the sidebar. Toggle it with `NgDocSidebarService`, and add the search with `NgDocSearchComponent`:

```typescript name="navbar.component.ts"
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocSearchComponent, NgDocSidebarService } from '@ng-doc/app';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, NgDocSearchComponent],
  template: `
    <button type="button" aria-controls="ng-doc-sidenav" [attr.aria-expanded]="sidebar.expandedState()" (click)="sidebar.toggle()">Menu</button>
    <a routerLink="/">My library</a>
    <ng-doc-search />
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 16px;
      height: var(--ng-doc-navbar-height);
      padding: 0 var(--ng-doc-app-horizontal-padding);
      background: var(--ng-doc-navbar-background);
      border-bottom: var(--ng-doc-navbar-border);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  protected readonly sidebar = inject(NgDocSidebarService);
}
```

`expandedState()` tells whether the sidebar is open, and `isMobile` whether the window is narrow
enough for the sidebar to be an overlay. `show()` and `hide()` open and close it.

## Custom sidebar

To replace the sidebar, mark your own component with the `ngDocCustomSidebar` attribute:

```html name="app.component.html"
<ng-doc-root>
  <ng-doc-navbar />
  <app-sidebar ngDocCustomSidebar />
  <router-outlet />
</ng-doc-root>
```

The categories and pages come from the `NG_DOC_CONTEXT` token. Its `navigation` is a tree of
`NgDocNavigation` items: a category has `children`, and every item has a `title` and a `route`.

```typescript name="sidebar.component.ts"
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NG_DOC_CONTEXT } from '@ng-doc/app';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Documentation">
      @for (item of navigation; track item.route) {
        @if (item.children?.length) {
          <h2>{{ '{{ item.title }}' }}</h2>
          @for (child of item.children; track child.route) {
            <a [routerLink]="child.route" routerLinkActive="active">{{ '{{ child.title }}' }}</a>
          }
        } @else {
          <a [routerLink]="item.route" routerLinkActive="active">{{ '{{ item.title }}' }}</a>
        }
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  protected readonly navigation = inject(NG_DOC_CONTEXT).navigation;
}
```

Categories can be nested more deeply than this example shows. Items with `hidden` set are not meant
to be listed.

## Serve the docs under a route

By default, the documentation routes start at the root of the application, such as
`/getting-started`. To keep other pages at the root, for example a landing page, serve the
documentation under its own route, such as `/docs`.

Create a component for the documentation layout, and export its routes:

```typescript name="docs.routes.ts"
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet, Routes } from '@angular/router';
import { NgDocNavbarComponent, NgDocRootComponent, NgDocSidebarComponent } from '@ng-doc/app';
import { NG_DOC_ROUTING } from '@ng-doc/generated';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {}

const routes: Routes = [{ path: '', component: DocsComponent, children: NG_DOC_ROUTING }];

export default routes;
```

Load these routes lazily under the `docs` path of the application router:

```typescript name="app.config.ts"
provideRouter([{ path: 'docs', loadChildren: () => import('./docs/docs.routes') }], withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }));
```

NgDoc generates the links between pages, so it needs to know the route too. Set `routePrefix` in
the configuration file (`*ConfigurationReference`):

```typescript name="ng-doc.config.ts"
import { NgDocConfiguration } from '@ng-doc/builder';

const config: NgDocConfiguration = {
  routePrefix: 'docs',
};

export default config;
```

## Gotchas

> **Warning**
> The `ng-doc-root` component places only its direct children marked as the navbar or the sidebar. A navbar or
> sidebar wrapped in another element, such as a `div`, lands in the page area.

{% index false %}

## Related

- `*PageSkeletonPage`
- `*ThemesAndColorsPage`
- `*SearchPage`

{% endindex %}

Next: `*PageSkeletonPage`
