---
keyword: ContentTabsPage
---

Tabs show one of several blocks of content at a time. Use them for the variations of a component,
each with its own demo, or for the same example written in several ways, so the page doesn't grow
with every variation.

## 👀 See it

<ng-doc-tab group="button-variations" name="Button" icon="angular" active>

{{ NgDocActions.demo("ButtonDemoComponent") }}

</ng-doc-tab>

<ng-doc-tab group="button-variations" name="Inline button">

{{ NgDocActions.demo("ButtonInlineDemoComponent", { expanded: true }) }}

</ng-doc-tab>

<ng-doc-tab group="button-variations" name="Playground">

{{ NgDocActions.playground("TagPlayground") }}

</ng-doc-tab>

<ng-doc-tab group="button-variations" name="Notes">

Any Markdown works in a tab: text, **emphasis**, lists, callouts and code blocks, code groups
included.

```bash group="install-in-tab" name="npm"
npm install @ng-doc/core
```

```bash group="install-in-tab" name="yarn"
yarn add @ng-doc/core
```

</ng-doc-tab>

## 🧰 Use it

Wrap each block in an `<ng-doc-tab>` element. Tabs with the same `group="…"` show as one set of
tabs, where the first of them is, and `name` is the tab label:

```markdown name="index.md"
{% raw %}<ng-doc-tab group="button-variations" name="Button" icon="angular" active>

{{ NgDocActions.demo("ButtonDemoComponent") }}

</ng-doc-tab>

<ng-doc-tab group="button-variations" name="Playground">

{{ NgDocActions.playground("TagPlayground") }}

</ng-doc-tab>{% endraw %}
```

Leave an empty line after the opening tag and before the closing one: Markdown inside an HTML
element is rendered only when empty lines separate it from the tags.

## 📋 Options

| Attribute   | Description                                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| `group="…"` | Tabs with the same group form one set of tabs. Give each set on the page its own group. |
| `name="…"`  | The tab label.                                                                          |
| `icon="…"`  | An icon next to the label: the name of one of your icons (`*IconsPage`).                |
| `active`    | Opens this tab first. Without it, the first tab is open.                                |

## 🚧 Gotchas

> **Note**
> Only the open tab is on the page. Headings inside tabs stay out of the table of contents, and a
> link to a heading inside a tab that isn't open, from search for example, opens the page at the
> top. Put the headings that readers should find above the tabs.

> **Note**
> Code groups (`*CodeBlocksPage#code-groups`) are tabs too, so their `group="…"` must differ from the
> groups of your content tabs.

{% index false %}

## Related

- `*DemosPage`
- `*PlaygroundsPage`
- `*CodeBlocksPage#code-groups`

{% endindex %}

Next: `*DemosPage`
