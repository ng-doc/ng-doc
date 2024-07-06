<a routerLink="./">test</a>
<a [routerLink]="['/']">test2</a>
<a href="http://google.com">google</a>

[Api](/docs/api)

> **Warning**
> This is a warning.



```html
<div>test</div>
<div>test</div>

@if (true) {
  <div>test</div>
}
```

```typescript
@Component({
  selector: 'ng-doc-dem',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- snippet "Test" -->
    <p>demo works!</p>
    123123
    <!-- snippet -->
  `,
})
export class DemoComponent {
}
```
