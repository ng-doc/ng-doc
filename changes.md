- the core of the builder was rewritten and optimized.
- `keyword` field was removed from the `NgDocPage` interface.
- `keyword` can be specified in the markdown file using Markdown front matter syntax.
- `mdFile` field is now array of strings instead of a single string, you can specify multiple
  markdown files for a single doc page, they will be displayed as tabs in the doc page.
- you can also specify the `title`, `icon`, `type` and `keyword` fields in the markdown file using
  Markdown front matter syntax to customize tabs.
- `title` field is now always displayed in the doc page, you don't need to specify it in the markdown
  file.
- added `description` field to the `NgDocPage` interface, it is used to specify the description of the
  doc page, and will be displayed in the doc page.
- added `headerTemplate` property to guides configuration, it is used to specify the header template
  for the guide page that can be used to customize header for each guide page.
