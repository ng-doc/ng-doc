---
keyword: ImagesVideoAndEmbedsPage
---

Add images, videos and embedded pages with Markdown or HTML. Images open in a zoom viewer when
readers click them.

## See it

Click the logo to zoom in:

![NgDoc logo](assets/images/brand/logo.svg)

## Use it

Put images in a folder that the build copies to the site, such as `public` or `src/assets`.
Then reference them by their path in the built site:

```markdown name="index.md"
![NgDoc logo](assets/images/brand/logo.svg)
```

The path is resolved against the base URL of the site, not against the Markdown file. Keep images
in your repository instead of linking to other sites, so they don't disappear or change.

## Images with HTML

Use an `img` element to set the size or other attributes:

```html name="index.md"
<img src="assets/images/brand/logo.svg" alt="NgDoc logo" width="96" height="96" />
```

<img src="assets/images/brand/logo.svg" alt="NgDoc logo" width="96" height="96" />

## Disable zoom

Add `zoom="false"` to an `img` element to turn off the zoom viewer for that image:

```html name="index.md"
<img src="assets/images/brand/logo.svg" alt="NgDoc logo" width="96" height="96" zoom="false" />
```

<img src="assets/images/brand/logo.svg" alt="NgDoc logo" width="96" height="96" zoom="false" />

Markdown image syntax can't set attributes, so use HTML for images without zoom.

## Video

Use the native `video` element for video files from your assets:

```html name="index.md"
<video controls width="640" src="assets/videos/getting-started.mp4"></video>
```

## Embedded pages

Use an `iframe` element to embed a page from another site, such as a code sandbox or a video
platform:

```html name="index.md"
<iframe src="https://example.com/embed" title="Example embed" width="100%" height="400" loading="lazy"></iframe>
```

Give every `iframe` a `title` for screen readers, and use `loading="lazy"` so it doesn't slow down
the page.

## Gotchas

> **Warning**
> Embedded pages load code from another site on every visit. Prefer demos (`*DemosPage`) for
> examples of your own components.

{% index false %}

## Related

- `*MarkdownAndCalloutsPage`
- `*CustomPageComponentsPage`

{% endindex %}

Next: `*DiagramsPage`
