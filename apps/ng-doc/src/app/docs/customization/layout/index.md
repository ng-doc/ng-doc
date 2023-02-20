# {{ NgDocPage.title }}

This article will help you to customize layout of the documentation app.

## Customization

By default, the documentation application has a width of `1400px`, but you can change this, as well as
many other things, such as the height of the `navbar` or the width of the `sidebar`. Below is a list of
all the available variables that affect the layout, you can change them in the `styles.css` file of
your documentation application.

> **Note**
> If you're going to create your own `sidebar` or `navbar` we recommend you to reuse
> the variables below.

```scss
:root {
	// `auto` - will stretch the app to the full width of the screen
	--ng-doc-app-max-width: auto;
	--ng-doc-app-horizontal-padding: calc(var(--ng-doc-base-gutter) * 3);
	--ng-doc-navbar-height: 60px;
	--ng-doc-sidebar-width: 300px;
}
```

## Navbar

The `navbar` is the top bar of the documentation application, it can be customized or replaced with
your own `navbar`. Below is a list of all the available variables that affect the `navbar` layout
and its style.

> **Note** > `NgDocNavbarComponent` doesn't use `--ng-doc-navbar-height` variable, it's used by the parent layout
> to restrict the height of the `NgDocNavbarComponent` or custom `navbar` component.

```scss
:root {
	// Background color of the `navbar`
	--ng-doc-navbar-background: var(--ng-doc-base-0);

	// Color of the shadow of the `navbar` when the page is scrolled
	--ng-doc-shadow-color: rgba(0, 0, 0, 0.2);

	// Horizontal padding of the `navbar`
	--ng-doc-navbar-horizontal-padding: calc(var(--ng-doc-base-gutter) * 3);

	// Maximum width of the documentation application, `navbar` uses this
	// Variable to calculate width of the `navbar` content
	--ng-doc-app-max-width: auto;
}
```

### Content

The `NgDocNavbarComponent` can be customized by adding your own content. You can do this
by providing `ng-template` to the one of its inputs like on the example below:

```html
<ng-doc-navbar [leftContent]="brand" [rightContent]="controls">
	<ng-template #brand>
		<img src="assets/images/brand.svg" />
	</ng-template>
	<ng-template #controls>
		<a
			ng-doc-button-icon
			size="large"
			href="https://github.com/me/my-repo"
			target="_blank"
			ngDocTooltip="Check my repo"
		>
			<ng-doc-icon icon="github" [size]="24"></ng-doc-icon>
		</a>
	</ng-template>
</ng-doc-navbar>
```

### Custom Navbar

If you want to replace the `NgDocNavbarComponent` with your own `navbar`, then just remove the
`<ng-doc-navbar>` tag from the `app.component.html` file, add your own `navbar` component,
and mark it with `NgDocCustomNavbarDirective` directive like on the example below:

```html
<ng-doc-root>
	<my-custom-navbar ngDocCustomNavbar></my-custom-navbar>

	<ng-doc-sidebar></ng-doc-sidebar>
	<router-outlet></router-outlet>
</ng-doc-root>
```

If you replace the `navbar` with your own component, then probably you'll need to implement
your own hamburger button for the `sidebar`, that will be used to open and close the `sidebar`
on mobile devices.

To open and close the `sidebar` you can use the `NgDocSidebarService` service, inject it into your
component and call the `toggle()` method.

```typescript
import {Component} from '@angular/core';
import {NgDocSidebarService} from '@ng-doc/app';

@Component({
	selector: 'my-custom-navbar',
	templateUrl: './my-custom-navbar.component.html',
	styleUrls: ['./my-custom-navbar.component.scss'],
})
export class MyCustomNavbarComponent {
	constructor(private sidebarService: NgDocSidebarService) {}

	toggleSidebar() {
		this.sidebarService.toggle();
	}
}
```

## Sidebar

The `sidebar` is the left bar of the documentation application, it can be customized or replaced with
your own `sidebar`. Below is a list of all the available variables that affect the `sidebar` layout:

```scss
:root {
	// Background color of the `navbar`
	--ng-doc-sidebar-background: var(--ng-doc-base-0);

	// Uses for vertical padding of the sidebar
	--ng-doc-sidebar-padding: 16px;

	// Uses to display the shadow on mobile devices
	--ng-doc-sidebar-shadow: rgba(0, 0, 0, 0.2);

	// Configures indent size of the sidebar categories
	--ng-doc-sidebar-category-indent: var(--ng-doc-base-gutter);

	// Configures indent size of the sidebar items
	--ng-doc-sidebar-item-indent: var(--ng-doc-base-gutter);
}
```

### Custom Sidebar

If you want to replace the `NgDocSidebarComponent` with your own `sidebar`, then just remove the
`<ng-doc-sidebar>` tag from the `app.component.html` file, add your own `sidebar` component,
and mark it with `NgDocCustomSidebarDirective` directive like on the example below:

```html
<ng-doc-root>
    <ng-doc-navbar></ng-doc-sidebar>

    <my-custom-sidebar ngDocCustomSidebar></my-custom-sidebar>
    <router-outlet></router-outlet>
</ng-doc-root>
```

To implement your own `sidebar` you will need a list of categories and pages of documentation.
You can get this list by injecting the `NG_DOC_CONTEXT` token, which returns the `NgDocContext`
object.

```typescript
import {Component, Inject} from '@angular/core';
import {NG_DOC_CONTEXT, NgDocContext} from '@ng-doc/app';

@Component({
	selector: 'my-custom-sidebar',
	templateUrl: './my-custom-sidebar.component.html',
	styleUrls: ['./my-custom-sidebar.component.scss'],
})
export class MyCustomSidebarComponent {
	constructor(@Inject(NG_DOC_CONTEXT) private context: NgDocContext) {
		// `context.navigation` contains the list of categories and pages of documentation
		console.log(context.navigation);
	}
}
```
