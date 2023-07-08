# {{ NgDocPage.title }}

In this article, you will learn how to add your custom icons to the documentation
application. NgDoc uses `featherIcons`, but you can add your own icons
to the application.

## Changing icons path

By default, NgDoc expects icons to be located in the `assets/icons` folder.
But you can change this location by setting the `customIconsPath` option
when you provide the `NgDocUiKitModule`:

```ts name="app.module.ts"
@NgModule({
  imports: [
    NgDocUiKitModule.forRoot({
      customIconsPath: 'assets/my-icons',
    }),
  ],
})
export class AppModule {}
```

## Adding custom icons

To add your custom icons, you need to create a folder with SVG files in the
location you specified in the `customIconsPath` option (or in the default
`assets/icons` folder) and put your SVG files there. All SVG files in this
folder will be added to the icon registry, so if you have e.g. `my-icon.svg`
you can use it as `my-icon` icon in the documentation application.

