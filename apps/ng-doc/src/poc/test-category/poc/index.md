```typescript {2,3,4}
@Component({
	template: `
    <!-- NgDocHTMLSnippetStart(Button Template) -->
    <button ng-doc-button-flat color="orange" (click)="clickEvent()">Just a button</button>
    <!-- NgDocHTMLSnippetEnd(Button Template) -->
  `,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
```
