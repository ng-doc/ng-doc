---
keyword: UpgradeTo22Page
---

NgDoc 22.0 is a major release. The update keeps your builders, so a site that only writes pages,
demos and playgrounds usually builds without changes. The breaking changes affect code that uses
NgDoc components and services from TypeScript, custom CSS aimed at NgDoc's markup, and custom
extensions such as type controls and page skeleton components.

The sections are ordered by who is affected. Read section 1, then the sections that match your
site:

| Section                                              | Read it if you                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Update the packages                               | use NgDoc                                                                                  |
| 2. Inputs and outputs are signals                    | use NgDoc components or directives from TypeScript, or extend them                         |
| 3. Removed APIs                                      | use `ngDocLet`, `ngDocMakePure`, the zone operators, the theme tokens or the search dialog |
| 4. Theme and CSS                                     | override NgDoc CSS variables or style NgDoc elements                                       |
| 5. Custom type controls and page skeleton components | provide your own type controls, breadcrumbs, navigation or table of contents               |
| 6. Search and keyboard shortcuts                     | customize the search, or ship your own keyboard shortcuts                                  |
| 7. The new engine                                    | want faster builds, or use `onlyForTags`                                                   |

## Prerequisites

- Angular 22. `@ng-doc/app`, `@ng-doc/ui-kit` and `@ng-doc/builder` support `>=22.0.0 <23.0.0`,
  and `@ng-doc/builder` depends on `@angular/build` 22.2.1. The Vite engine needs Angular 22.2 or
  later (`@angular/compiler` and `@angular/compiler-cli` `^22.2.0`): it stops with
  `NGDOC_VITE_ANGULAR_VERSION` on an older one, and `ng add` and `migrate-to-vite` refuse to set
  it up. Update Angular first: `ng update @angular/core@22 @angular/cli@22`.
- For the Vite engine only: Vite 8 (`vite` `^8.3.0`) and `@analogjs/vite-plugin-angular` `^2.8.0`
  (the ranges are listed under `ng-doc.viteEngine` in the `package.json` of `@ng-doc/builder`). The
  legacy builders don't use Vite, so an update that stays on them needs nothing. The migration
  schematic adds both when `package.json` doesn't list them. If an earlier setup pinned
  `vite@7.3.5`, update it with `npm i -D vite@^8.3.0 @analogjs/vite-plugin-angular@^2.8.0`: the
  Vite engine stops with `NGDOC_VITE_VERSION` on Vite 7.
- Node.js 24 (`>=24.15.0 <25`).

Zoneless applications are supported: NgDoc's own tests run with and without zone.js.

## 1. Update the packages

Update every `@ng-doc/*` package that you use to the same version. Add `@ng-doc/keywords-loaders`
if you use it.

```bash group="update" name="Angular CLI" icon="angular"
ng update @ng-doc/builder @ng-doc/app @ng-doc/core @ng-doc/ui-kit
```

```bash group="update" name="Nx" icon="nx"
npx nx migrate @ng-doc/builder@22
npm install @ng-doc/app@22 @ng-doc/core@22 @ng-doc/ui-kit@22
```

In an Nx workspace, `nx migrate @ng-doc/builder` updates only the builder, so install the other
packages yourself. If `nx migrate` created a `migrations.json` file, run
`npx nx migrate --run-migrations` afterwards.

The update keeps the **legacy builders** and changes no files. For each project that uses them, it
prints the command that previews the move to the new engine. The new engine is opt-in: see
section 7.

### Links to this documentation

The pages of this site moved to new routes, and the old routes don't redirect. For example,
`/docs/getting-started/installation` is now `/docs/get-started/installation`, and
`/docs/customization/themes` is now `/docs/customize/themes-and-colors`. If you link to a page of
this site, find it again in the sidebar and update the link. The API reference stays under
`/docs/api`, but the declarations that 22.0 removes have no page any more.

### Keywords of another NgDoc site

`ngDocKeywordsLoader` loads the page keywords of the other site only with `loadGuides: true`, as
documented. Before, it loaded them without the option, unprefixed. If your pages link to the pages
of that site, set `loadGuides: true` (`*LinkToExternalApisPage`).

## 2. Inputs and outputs are signals

The public components and directives of `@ng-doc/app` and `@ng-doc/ui-kit` declare their inputs
with `input()` or `model()`, their outputs with `output()`, and their queries with `viewChild()`
and `contentChildren()`. The exception is the `compareFn` and `displayValueFn` inputs of
`NgDocComboboxHostComponent`.

### In templates

Template bindings compile unchanged: `[sidebar]="false"`, `(ngDocCheckedChange)="save($event)"`
and two-way bindings such as `[(recreateDemo)]` work as before. `expanded` of
`ng-doc-demo-displayer` and `ng-doc-expander` is new as a two-way binding: both are `model()`
inputs now, so `[(expanded)]` works.

One input is narrower. The `size` input of `ng-doc-icon` accepts only `16`, `24`, `'16'` or `'24'`.
It accepted any number before, so a template that binds another size, or a plain `number`, no
longer compiles with strict templates. Use 16 or 24, and type bound values as `NgDocIconSize`:

```html group="step-2-icon" name="Before"
<ng-doc-icon icon="info" size="20"></ng-doc-icon>
```

```html group="step-2-icon" name="After"
<ng-doc-icon icon="info" [size]="iconSize"></ng-doc-icon>
```

```typescript group="step-2-icon" name="After (component)"
import { NgDocIconSize } from '@ng-doc/ui-kit';

protected readonly iconSize: NgDocIconSize = 24;
```

### In TypeScript: inputs

Read an input by calling it, and set it with the `setInput()` method of `ComponentRef`. An input
signal is read-only, so assigning to it no longer compiles.

```typescript group="step-2-inputs" name="Before"
const sidebar = componentRef.instance.sidebar;
componentRef.instance.sidebar = false;
```

```typescript group="step-2-inputs" name="After"
const sidebar = componentRef.instance.sidebar();
componentRef.setInput('sidebar', false);
```

A subclass that overrides an input, or code that reads inputs through a view query, needs the same
change.

### In TypeScript: outputs

Outputs are `OutputEmitterRef` objects instead of `EventEmitter`. `subscribe()` still works, but
they are not Observables: `pipe()` and `asObservable()` are gone. To use RxJS operators, convert
the output with `outputToObservable()` from `@angular/core/rxjs-interop`.

```typescript group="step-2-outputs" name="Before"
directive.ngDocCheckedChange.pipe(filter(Boolean)).subscribe(save);
```

```typescript group="step-2-outputs" name="After"
outputToObservable(directive.ngDocCheckedChange).pipe(filter(Boolean)).subscribe(save);
```

### In TypeScript: queries and state

Public queries are signals: call them. A query for several elements returns a read-only array
instead of a `QueryList`.

```typescript group="step-2-queries" name="Before"
const tabs = tabGroup.tabs.toArray();
const selected = tabGroup.selectedTab;
```

```typescript group="step-2-queries" name="After"
const tabs = tabGroup.tabs();
const selected = tabGroup.selectedTab();
tabGroup.selectTab(tabs[1]);
```

The same applies to state that became a signal, such as the `isExternalLink`, `path`, `fragment`
and `queryParams` of `NgDocPageLinkComponent`.

### Members that changed

These public members were removed, made protected, or changed kind. Host attributes and CSS
classes that they used to set are still set, unless section 4 says otherwise.

| Class                                          | Change                                                                                                                                                                                                       | Use instead                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `NgDocNavbarComponent`                         | `hasBorder` removed, with its `has-border` host class and the scroll shadow                                                                                                                                  | Nothing: the bar always has a hairline              |
| `NgDocThemeToggleComponent`                    | `currentTheme` and `nextTheme` are no longer public                                                                                                                                                          | `theme()` of `NgDocThemeService`                    |
| `NgDocTocComponent`                            | `activeItem` is read-only; `selection`, `elements` and `ngOnInit()` removed                                                                                                                                  | `activeItem()`                                      |
| `NgDocPageWrapperComponent`                    | `pageBreadcrumbs`, `pageToc` and `pageNavigation` are signal queries                                                                                                                                         | Call them                                           |
| `NgDocPageComponent`                           | `pageContainer` is a signal query; `childOutlet` removed                                                                                                                                                     | Call `pageContainer()`                              |
| `NgDocPageLinkComponent`                       | `isExternalLink`, `path`, `fragment` and `queryParams` are signals; `ngOnChanges()` removed                                                                                                                  | Call them                                           |
| `NgDocPageProcessorComponent`                  | `afterRender` is an `OutputEmitterRef`; public `ngOnChanges()` removed                                                                                                                                       | Set the inputs                                      |
| `NgDocApiListComponent`                        | `filteredApiList`, `filter`, `types` and `ngOnInit()` removed; `apiList` and `scopes` are no longer public; the `title` and `segment` inputs stay                                                            | The `?type=`, `?scope=` and `?filter=` query params |
| `NgDocSearchResultComponent`                   | `groupedResult` is a signal; `ngOnChanges()` removed                                                                                                                                                         | `groupedResult()`                                   |
| `NgDocDemoComponent`, `NgDocDemoPaneComponent` | `demo` and `assets` are signals; `ngOnInit()` removed; `getOpenedAssetId()` of the demo removed                                                                                                              | `demo()`, `assets()`                                |
| `NgDocDemoDisplayerComponent`                  | `expanded` is a `model()`                                                                                                                                                                                    | `[(expanded)]`                                      |
| `NgDocTabsComponent`                           | `getActiveIndex()` removed                                                                                                                                                                                   | –                                                   |
| `NgDocTabGroupComponent`                       | `tabs` and `tabElements` are signal queries, `selectedTab` and `selectedIndex` signals; `selectedHeaderTab` removed                                                                                          | `selectTab(tab)`                                    |
| `NgDocPaneComponent`                           | `resizer` is a signal query and `width` a signal; `dragging` is no longer public; `ngOnChanges()` removed                                                                                                    | Call them                                           |
| `NgDocCodeComponent`                           | `hasHeader` is a signal; `codeElement` is no longer public                                                                                                                                                   | Query the `pre code` element                        |
| `NgDocCopyButtonComponent`                     | `tooltip` is a signal query                                                                                                                                                                                  | `tooltip()`                                         |
| `NgDocPlaygroundPropertiesComponent`           | `recreateDemo` is a `model()`, `resetForm` an `OutputEmitterRef`; `observer`, `breakpoints` and `ngOnChanges()` removed                                                                                      | –                                                   |
| `NgDocPlaygroundComponent`                     | `id`, `pipeName`, `selectors`, `properties` and `options` are signal inputs; `recreateDemo`, `formGroup`, `defaultValues` and `configuration` are signals; `ngOnChanges()` removed                           | Call them                                           |
| `NgDocPlaygroundDemoComponent`                 | Its inputs are signal inputs, `demoOutlet` is a signal query and `code` a signal; `changeDetectorRef` removed                                                                                                | Call them                                           |
| `NgDocBasePlayground`                          | `properties`, `actionData` and `content` are signal inputs, `playground` and `viewContainerRef` signal queries; the target is the abstract `target` field instead of a constructor argument                  | Rebuild the docs with the same NgDoc version        |
| `NgDocPlaygroundPropertyComponent`             | `hasPropertyControl` is a signal; `propertyOutlet` is private and `tooltipContent` protected; `ngOnChanges()` removed                                                                                        | `hasPropertyControl()`                              |
| `NgDocMermaidViewerComponent`                  | `ngOnInit()` removed                                                                                                                                                                                         | –                                                   |
| `NgDocDropdownComponent`                       | `tabIndex` removed (the host `tabindex` stays); `ngZone` removed                                                                                                                                             | `isOpened`                                          |
| `NgDocOverlayContainerComponent`               | `contentContainer`, `focusCatcher` and `outlet` are signal queries; `relativePosition`, `overlayAlign` and `contactBorder` are protected                                                                     | Call them                                           |
| `DialogOutletComponent`                        | `outletContent` and `routerOutlet` are signal queries                                                                                                                                                        | Call them                                           |
| `NgDocFocusCatcherDirective`                   | `focused` is read-only                                                                                                                                                                                       | Don't assign it                                     |
| `NgDocTextComponent`                           | `leftContent` and `rightContent` are signal queries; `ngDocElement` removed                                                                                                                                  | Call them                                           |
| `NgDocOptionGroupComponent`                    | `options` is a signal query (an array) and `hasHeader` a signal                                                                                                                                              | Call them                                           |
| `NgDocDataListComponent`                       | `getContext()` removed                                                                                                                                                                                       | Build the context in the template                   |
| `NgDocDataListGroupComponent`                  | `groups` and `groupItems` are signals; `getGroupContext()` removed                                                                                                                                           | `groups()`, `groupItems()`                          |
| `NgDocSelectionHostDirective`                  | `selectedChange$`, `addOrigin()` and `removeOrigin()` removed                                                                                                                                                | `selected()`; origins register themselves           |
| `NgDocSelectionOriginDirective`                | `ngOnChanges()` and `ngOnDestroy()` removed                                                                                                                                                                  | –                                                   |
| `NgDocIconComponent`                           | `href` is a signal; `ngOnChanges()` and `ngOnInit()` removed                                                                                                                                                 | `href()`                                            |
| `NgDocToggleComponent`                         | the `ngOnInit()` override removed; `dragging` is a protected signal                                                                                                                                          | –                                                   |
| `NgDocComboboxComponent`                       | `data` is a signal query                                                                                                                                                                                     | `data()`                                            |
| `NgDocComboboxHostComponent`                   | `origin`, `dropdown` and `inputControl` are getters over signal queries (`origin` is `undefined` before render); `ngAfterContentInit()` removed                                                              | Read the getters                                    |
| `NgDocInputWrapperComponent`                   | `focusCatcher` is a signal query; `input` and `inputControl` are read-only; `emptyEvent()` is protected; `getBlurContext()` and `ngAfterViewChecked()` removed                                               | Don't assign them                                   |
| Host-binding helpers                           | `tabIndex` of `NgDocFocusableDirective`, `transform` of `NgDocRotatorDirective`, `hostClasses` of `NgDocBaseInput` are gone or protected                                                                     | Nothing: the host attributes are unchanged          |
| Event handlers                                 | `clickEvent()` of `NgDocOptionComponent` and `NgDocButtonToggleComponent`, `blurEvent()` and `inputEvent()` of the input directives, and `onChange()` of `NgDocCheckedChangeDirective` are gone or protected | Nothing                                             |

Lifecycle hooks were removed from several classes, such as `ngAfterContentInit()` and
`ngAfterViewInit()` of `NgDocTabGroupComponent`, `ngAfterContentInit()` of
`NgDocOptionGroupComponent`, `ngAfterContentChecked()` of `NgDocTextComponent`, `ngOnChanges()` of
`NgDocDataListGroupComponent` and `ngAfterViewInit()` of `NgDocSelectionComponent`. Code that
called these hooks directly must stop.

Subclasses lost some protected members; inject what you need yourself:

- `NgDocDropdownComponent`, `NgDocMagnifierComponent` and `NgDocComboboxHostComponent`: `ngZone`.
- `NgDocImageViewerComponent`, `NgDocMermaidViewerComponent`, `NgDocInputWrapperComponent` and
  `NgDocSidebarCategoryComponent`: `changeDetectorRef`.
- `NgDocTocComponent`: `changeDetectorRef`, `renderer`, `destroyRef` and `select()` are gone, and
  `ngZone` and `router` are private.
- `NgDocPlaygroundPropertiesComponent`: `breakpointObserver`.
- `NgDocDemoDisplayerComponent`: `expandTooltipText`.
- `NgDocPlaygroundDemoComponent`: `changeDetectorRef`.

### Playground classes

NgDoc generates a class that extends `NgDocBasePlayground` for every playground, so the generated
code and `@ng-doc/app` must come from the same NgDoc version: rebuild the documentation after you
update. The base class takes its target from the abstract `target` field instead of a constructor
argument, its `playground` and `viewContainerRef` are signal queries, and `properties`,
`actionData` and `content` are signal inputs, which templates call. Code that extends the base class
by hand changes like this:

```typescript group="playground-class" name="Before"
@Component({
  selector: 'app-tag-playground',
  template: `<my-tag [color]="properties['color']" *ngIf="content['icon']"></my-tag>`,
  imports: [CommonModule, MyTagComponent],
})
export class TagPlayground extends NgDocBasePlayground {
  static readonly selector = 'my-tag';

  @ViewChild(MyTagComponent, { static: true })
  readonly playground!: Type<unknown>;

  @ViewChild(MyTagComponent, { static: true, read: ViewContainerRef })
  readonly viewContainerRef!: ViewContainerRef;

  readonly configData = {};

  constructor() {
    super(MyTagComponent);
  }
}
```

```typescript group="playground-class" name="After"
@Component({
  selector: 'app-tag-playground',
  template: `
    @if (content()['icon']) {
      <my-tag [color]="properties()['color']"></my-tag>
    }
  `,
  imports: [MyTagComponent],
})
export class TagPlayground extends NgDocBasePlayground {
  static readonly selector = 'my-tag';

  readonly target = MyTagComponent;

  readonly playground = viewChild(MyTagComponent);

  readonly viewContainerRef = viewChild(MyTagComponent, { read: ViewContainerRef });

  readonly configData = {};
}
```

On `NgDocPlaygroundComponent`, `configuration`, `formGroup`, `defaultValues` and `recreateDemo` are
signals: call them, and write `defaultValues` and `recreateDemo` with `set()`.

Custom overlay containers declare `config` and `content` with `input()`, because
`NgDocOverlayContainer` types them as signals. If you create an `NgDocOverlayRef` by hand, its
fourth constructor argument is an `Injector` instead of `NgZone`.

## 3. Removed APIs

| Removed                                                                                                                                                                                                       | Use instead                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NgDocLetDirective`, `NgDocLetContext` and the `@ng-doc/ui-kit/directives/let` entry point                                                                                                                    | Angular's `@let`                                                                                 |
| `ngDocMakePure` and the `@ng-doc/ui-kit/decorators` entry point                                                                                                                                               | A `computed()` signal, or an object literal in the template                                      |
| `ngDocZoneAttach`, `ngDocZoneDetach`, `ngDocZoneOptimize`                                                                                                                                                     | Nothing. Remove the operator from the pipe                                                       |
| `NG_DOC_THEME`, `NgDocTheme`                                                                                                                                                                                  | A stylesheet scoped to a `data-theme` value (`*ThemesAndColorsPage#custom-theme`)                |
| `NG_DOC_DEFAULT_THEME_ID`                                                                                                                                                                                     | The `data-theme` attribute of `<html>` in `index.html` (`*ThemesAndColorsPage#theme-by-default`) |
| `NgDocSearchDialogComponent`, `NgDocSearchDialogData` and the `@ng-doc/app/components/search-dialog` entry point                                                                                              | `NgDocCommandPaletteComponent` and `NgDocCommandPaletteData` (section 6)                         |
| The `constructor(...args: unknown[])` overloads of `NgDocSanitizeHtmlPipe`, `NgDocDataDirective`, `NgDocAutofocusDirective`, `NgDocSelectionOriginDirective`, `NgDocScrollService` and `NgDocOverlayStrategy` | Call `super()` without arguments in subclasses                                                   |

`ngDocLet`:

```html group="step-3-let" name="Before"
<div *ngDocLet="user$ | async as user">{{ '{{ user.name }}' }}</div>
```

```html group="step-3-let" name="After"
@let user = user$ | async;
<div>{{ '{{ user.name }}' }}</div>
```

`ngDocMakePure`, for example:

```typescript group="step-3-pure" name="Before"
@ngDocMakePure
getContext(item: Item): { $implicit: Item } {
  return { $implicit: item };
}
```

```typescript group="step-3-pure" name="After"
readonly item = input.required<Item>();
readonly context = computed(() => ({ $implicit: this.item() }));
```

The zone operators: in a zoneless application, remove them. In a zone.js application, subscribe to
frequent event sources inside `runOutsideAngular()` of `NgZone`, and update state through signals.

```typescript group="step-3-zone" name="Before"
fromEvent(window, 'scroll')
  .pipe(ngDocZoneOptimize(this.ngZone))
  .subscribe(() => this.update());
```

```typescript group="step-3-zone" name="After"
this.ngZone.runOutsideAngular(() => {
  fromEvent(window, 'scroll').subscribe(() => this.scrollY.set(window.scrollY));
});
```

`theme` of `NgDocHighlighterConfig`, the `shiki` option of `provideNgDocApp`, is deprecated. It never
had an effect, and it now logs a warning in development mode: name the themes in `shiki.themes` of
`ng-doc.config.ts` (`*CodeHighlightingPage`).

The theme tokens had no effect: NgDoc never read them. Remove the providers, and ship a custom
theme as a stylesheet:

```typescript group="step-3-theme" name="Before"
providers: [
  { provide: NG_DOC_THEME, useValue: { id: 'custom', path: '/assets/themes/custom.css' }, multi: true },
  { provide: NG_DOC_DEFAULT_THEME_ID, useValue: 'custom' },
],
```

```scss group="step-3-theme" name="After (styles.scss)"
html[data-theme='custom'] {
  --ng-doc-primary: #7c3aed;
}
```

```typescript group="step-3-theme" name="After (switch)"
inject(NgDocThemeService).set('custom');
```

## 4. Theme and CSS

The public CSS variables keep their names and meaning, so overrides keep working. Their defaults
changed, and so did the markup of several parts of the page.

### Default theme

- **Colors:** most of the 169 public variables have new default values in the light, dark and auto
  themes. They now point at a new token layer, `tokens.scss` in `@ng-doc/ui-kit`: 156 variables
  with the palette, spacing, radius and type primitives, the page rhythm (such as
  `--ng-doc-content-max-width` and `--ng-doc-h2-border`) and tokens derived from the public
  variables, so your overrides flow into them.
- **New variables:** 25 new variables are additive, and most derive from the public ones. Seven of
  them are plain values, such as `--ng-doc-code-header-height` or `--ng-doc-search-dialog-width`.
- **Dark primary:** the dark theme's primary color is the brand blue instead of amber, and dark
  links follow the primary color. To keep amber and the previous link color, add these rules after
  the NgDoc styles:

  ```css name="styles.css"
  :root[data-theme='dark'] {
    --ng-doc-primary: #faab00;
    --ng-doc-link-color: #30a5ff;
  }

  @media (prefers-color-scheme: dark) {
    :root[data-theme='auto'] {
      --ng-doc-primary: #faab00;
      --ng-doc-link-color: #30a5ff;
    }
  }
  ```

- **Typography:** the page title is 34px at weight 700; `h2` to `h6` use weight 600, with more space
  above `h2` and `h3`. An optional divider above `h2` needs both `--ng-doc-h2-border` and `--ng-doc-h2-padding-top`
  (which defaults to `0px`).
  Sidebar items use the body font instead of the heading font.
- **Content width:** the article is capped at `--ng-doc-content-max-width` (760px), and API pages
  and the API index at `--ng-doc-api-content-max-width` (880px). `--ng-doc-article-width` still wins
  over both. To remove the caps, set both variables to `none`.
- **Code blocks:** every block shows line numbers. Hide them with
  `--ng-doc-code-line-numbers: none`. With the new engine, code is colored by the `css-variables`
  theme unless you set `shiki.themes`: override `--ng-doc-syntax-*` to recolor it
  (`*ThemesAndColorsPage#code-highlighting`).
- **Chips and badges:** API kind chips show the whole word, such as "Type alias", so they are wider.
  Modifier badges, such as `static` or `readonly`, are outlined and no longer read the
  `--ng-doc-abstract-color`, `--ng-doc-async-color`, `--ng-doc-protected-color`,
  `--ng-doc-static-color`, `--ng-doc-overriden-color` and `--ng-doc-readonly-color` variables. The
  matching background variables, such as `--ng-doc-static-background`, tint the ring: override
  those to recolor them.
- **Retired variable:** `--ng-doc-primary-rgb` is no longer read. The components that used it mix
  `--ng-doc-primary`.
- **Sidebar padding:** components read `--ng-doc-sidebar-vertical-padding` first, then the old
  misspelled `--ng-doc-sidebar-vetical-padding`. Both work.
- **Breakpoints:** the sidebar collapses at 900px instead of 1024px, and the table of contents hides
  at 1240px and below. The large `ng-doc-button-icon` is 36px instead of 40px.

`*ThemesAndColorsPage` explains how to override the variables.

### Changed markup

If your CSS targets NgDoc's internal elements, check these parts. Selectors aimed at their old
markup may stop matching.

| Part                  | What changed                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navbar                | `.navbar-container` is renamed `.ng-doc-navbar-container`. The `has-border` class is gone. The menu button is on the left at 900px and below.                                                                                                                                                                                                                                                                       |
| Sidebar               | Rows no longer render `ng-doc-dot` or `ng-doc-tag`. The header of an expandable category is a button with a chevron. Status badges use `.ng-doc-sidebar-status`.                                                                                                                                                                                                                                                    |
| Table of contents     | An "On this page" rail with progress and page actions. `.ng-doc-toc-wrapper` and `.ng-doc-toc-selection` are gone.                                                                                                                                                                                                                                                                                                  |
| Breadcrumbs and pager | New markup: check CSS aimed at `.ng-doc-breadcrumb` or `.ng-doc-navigation-controls`.                                                                                                                                                                                                                                                                                                                               |
| Callouts              | The note, warning, alert and success callouts render a title (`.ng-doc-blockquote-title`) before their content. A callout with a custom icon shows no title, and a default callout with a custom icon now shows that icon.                                                                                                                                                                                          |
| Code blocks           | The host is the bordered surface. Blocks with a name or an icon get a header with `.ng-doc-code-language`, `.ng-doc-code-range` and the copy button; other blocks keep a floating copy button.                                                                                                                                                                                                                      |
| Demos                 | In demos, a toolbar with source tabs and preview widths replaces `ng-doc-demo-displayer` and the tabs below the demo. Playgrounds still render `ng-doc-demo-displayer`.                                                                                                                                                                                                                                             |
| Tab groups            | Tabs are `.ng-doc-tab` buttons with the `tab` role in a segmented control, instead of an underline.                                                                                                                                                                                                                                                                                                                 |
| Playground            | An inspector layout. The `.vertical` class is gone; property names use `.ng-doc-playground-property-name`; Reset is `.ng-doc-playground-reset`. The type chip moved from the type-alias control to the property name.                                                                                                                                                                                               |
| Search                | `ng-doc-search` renders a `.ng-doc-search-field` and a `.ng-doc-search-button`. The results are `.ng-doc-command-palette-row` elements (section 6).                                                                                                                                                                                                                                                                 |
| API index             | The `.ng-doc-scope-item` links and the filter buttons are replaced by the `.ng-doc-api-list-*` index.                                                                                                                                                                                                                                                                                                               |
| API tables            | `.ng-doc-api-table` has a new style: a bordered panel with a label header row. With the new engine, API pages show the symbol view instead: the details as a list, a declaration panel, and one members table (`ng-doc-members`, `.ng-doc-members-table`) with tabs and a name filter. Anchors are unchanged.                                                                                                       |
| Status callouts       | Deprecated, experimental, alpha and beta callouts on API pages carry their status as the callout title instead of a bold first word.                                                                                                                                                                                                                                                                                |
| Image viewer          | The host is a focusable button (Enter or Space opens the image), except inside a link or with an empty `alt`.                                                                                                                                                                                                                                                                                                       |
| Selection highlight   | `ng-doc-selection` is placed with `transform: translate()` from the top-left corner of its host and sized with `width` and `height`, instead of `left`, `top`, `right` and `bottom`. It is `aria-hidden`, stays hidden until it is placed in the browser, and `align` accepts `null` for a highlight without a border. Tab groups, the demo toolbar, the search scopes and the API index use it as a sliding thumb. |

```css group="step-4-css" name="Before"
ng-doc-navbar .navbar-container {
  max-width: 1440px;
}
```

```css group="step-4-css" name="After"
ng-doc-navbar .ng-doc-navbar-container {
  max-width: 1440px;
}
```

### Demos and playgrounds

- **Fullscreen:** demos and demo panes have a fullscreen button that shows the demo alone in the
  browser's fullscreen. It needs no route (`*DemosPage`).
- **`fullscreenRoute`** opens the demo route in a new tab, as a standalone page with only the demo
  and a link back, instead of a dialog over the page. The route setup is unchanged.
- **`inspectorPosition`** is a new playground option: `'bottom'` puts the inspector below the demo
  (`*PlaygroundsPage`).

### Demo option `expanded`

`{{ '{{ NgDocActions.demo("MyDemo", { expanded: true }) }}' | safe }}` now opens the demo on its
source file instead of showing the code below the preview. The file is the `opened` snippet, then
`defaultTab`, then the first file (`*SnippetsPage`).

## 5. Custom type controls and page skeleton components

Type controls and page skeleton components (breadcrumbs, navigation and table of contents) may now
declare their fields as signal inputs, optional or required. `@Input()` fields keep working, and
type controls can still use plain properties and stay `ControlValueAccessor` implementations.

The playground now sets a type control field with `setInput()` when the control declares an input
with that name, and assigns it otherwise. So `ngOnChanges()` now runs for fields declared as
inputs, including `@Input()` fields, which used to be assigned without it. Page skeleton
components are created with `setInput()` as before.

```typescript group="step-5-control" name="Before"
export class MyControlComponent extends DIControl<string> implements NgDocTypeControl<string> {
  @Input()
  default?: string;

  reset(): void {
    this.updateModel(this.default ?? null);
  }
}
```

```typescript group="step-5-control" name="After"
export class MyControlComponent extends DIControl<string> implements NgDocTypeControl<string> {
  readonly default = input<string | undefined>(undefined);

  reset(): void {
    this.updateModel(this.default() ?? null);
  }
}
```

```typescript group="step-5-skeleton" name="Before"
export class BreadcrumbComponent implements NgDocPageBreadcrumbs {
  @Input({ required: true })
  breadcrumbs: string[] = [];
}
```

```typescript group="step-5-skeleton" name="After"
export class BreadcrumbComponent implements NgDocPageBreadcrumbs {
  readonly breadcrumbs = input.required<string[]>();
}
```

The fields of `NgDocTypeControl` are typed `NgDocTypeControlField`, and the fields of
`NgDocPageBreadcrumbs`, `NgDocPageNavigation` and `NgDocPageToc` are typed
`NgDocPageSkeletonField`: a value or a signal. Code that implements these interfaces is not
affected. Code that reads the fields through the interface type must handle both:

```typescript
import { isSignal } from '@angular/core';

const value = isSignal(control.default) ? control.default() : control.default;
```

The built-in controls, `NgDocBooleanControlComponent`, `NgDocNumberControlComponent`,
`NgDocStringControlComponent` and `NgDocTypeAliasControlComponent`, declare their fields as signal
inputs. See `*CustomTypeControlsPage` and `*PageSkeletonPage`.

## 6. Search and keyboard shortcuts

### Command palette

A command palette, `NgDocCommandPaletteComponent`, replaces the search dialog. The navbar search
field opens it, and so do ⌘K and Ctrl+K. It opens with an empty query.

- The `@ng-doc/app/components/search-dialog` entry point is removed. Its data type is now
  `NgDocCommandPaletteData`, with an optional `query`.
- `NgDocSearchComponent` no longer has the protected `query` and `searchResults` members: the
  palette owns them. A subclass opens the palette with a query through `open(query)`.
- `NgDocSearchEngine`, `NgDocDefaultSearchEngine` and `provideSearchEngine` are unchanged, so a
  custom search engine keeps working (`*SearchPage`).

```typescript group="step-6-search" name="Before"
this.query.next('provideNgDocApp');
this.open();
```

```typescript group="step-6-search" name="After"
this.open('provideNgDocApp');
```

### Keyboard shortcuts

Single-key shortcuts are on by default:

| Key       | Action                                                 |
| --------- | ------------------------------------------------------ |
| `/`       | Open the search                                        |
| `[` / `]` | Go to the previous or next page                        |
| `F`       | Focus the filter of the API index or the members table |
| `L`       | Copy the link to the page                              |
| `T`       | Switch between the light and dark themes               |

⌘K and Ctrl+K open and close the search. `/` now reacts on key down instead of key up. The keys are
ignored while a text field, a list or a demo has focus. Readers can turn the single-key shortcuts
off with the switch in the palette. To turn them off by default for your site, pass
`shortcuts: false` to `provideNgDocApp`:

```typescript name="app.config.ts"
provideNgDocApp({ shortcuts: false }),
```

To add your own shortcuts, use `NgDocShortcutsService`.

## 7. The new engine

The new engine is opt-in for existing projects. It builds the same pages as the legacy builders,
with a persistent cache, faster rebuilds and diagnostic codes.

- **Existing projects** stay on the legacy builders after `ng update`. When you are ready, preview
  and run the migration:

  ```bash
  ng g @ng-doc/builder:migrate-to-vite --project <project-name> --dry-run
  ng g @ng-doc/builder:migrate-to-vite --project <project-name>
  ```

  `*MigrateToNewEnginePage` explains each step, and how to roll back. After the migration, go
  through its checklist (`*MigrateToNewEnginePage#after-migrating`): the manual items of the
  report, the output folder (`<outputPath>/browser`), server rendering with
  `outputMode: 'server'`, and the Vite version (Vite 8, `^8.3.0`).

- **New projects:** `ng add` sets up the new engine with the Vite host in a new standalone
  application. NgModule applications, and projects whose build target doesn't use an Angular
  application builder, get the legacy builders. Pass `--engine legacy` to keep the legacy builders;
  `--engine vite` on an NgModule application fails with `NGDOC_ADD_ENGINE`
  (`*LegacyBuildersPage#when-ng-add-sets-them-up`).
- **Staying on the legacy builders:** see `*LegacyBuildersPage`.

What the new engine does differently:

- **`onlyForTags`** is honoured: a page or category whose tags don't match the build is left out,
  with its route, navigation item, search record and keyword. The legacy builders ignore the option
  and build every page. A link to a page that is left out fails the build with
  `CONTENT_KEYWORD_FILTERED` (`*PagesAndCategoriesPage#build-tags`).
- **Union order:** API pages list the members of a union type in a stable order that depends only
  on your code: literal types by value, and named types by their declaration position. The legacy
  builders list them in the order the TypeScript checker happened to create them. For example,
  `"warning" | "info" | "error"` becomes `"error" | "info" | "warning"`. The properties of some
  object types, such as a spread of two objects, can also be listed in another order.
- **Playground options** follow the order in which the input's type is written. The legacy
  builders use the checker's creation order, which can differ between projects. For example,
  NgDoc's own `NgDocSize`, written `'small' | 'medium' | 'large'`, now lists `small` first; the
  legacy builders listed `medium` first.
- **API pages** use the symbol view (section 4), and search previews a declaration's kind,
  signature and description.
- **Code theme:** code is colored by NgDoc's `css-variables` theme unless you set `shiki.themes`.
- **Cache, folders and errors:** the cache is on by default, the configuration file is searched from
  another folder, and errors carry a diagnostic code. See
  `*MigrateToNewEnginePage#what-changes`.

If you tried a 22.0 pre-release of the new engine with `developmentContent: 'virtual'`, remove the
option: the virtual content mode is gone, and the option fails with
`NGDOC_DEVELOPMENT_CONTENT_REMOVED`.

## 🎉 Next steps

- Try the new engine: `*MigrateToNewEnginePage`.
- Stay on the legacy builders: `*LegacyBuildersPage`.

{% index false %}

## Related

- `*OlderVersionsPage`
- `*LegacyBuildersPage`
- `*ThemesAndColorsPage`

{% endindex %}

Next: `*MigrateToNewEnginePage`
