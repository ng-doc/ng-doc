Add images, videos, and embeds to your documentation.

## Images

You can load images from the internet or use images from your project. To use images from your
project, you need to place them in the `assets` folder of your documentation app. Then you can use
the `assets/image.png` path to reference the image in your documentation.

### Using Markdown

```md
![Alt text](assets/image.png)
```

To use images from the internet you need to provide the URL of the image:

```md
![Alt text](https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg)
```

![Alt text](https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg)

### Using HTML

You can also use HTML to add images to your documentation:

```html
<img src="assets/image.png" alt="Alt text" width="200px" height="200px" />
```

```html
<img
  alt="Alt text"
  width="200px"
  height="200px"
  src="https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg" />
```

<img alt="Alt text" width="200px" height="200px" src="https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg">

### Disabling zoom

You can disable zooming on images by adding the `noZoom` attribute to the image:

```html
<img src="assets/image.png" zoom="false" />
```

## Videos

To add videos you can use native `video` HTML tags

```html
<video controls className="w-full aspect-video" src="link-to-your-video.com"></video>
```

To add a video from YouTube, you can use the `iframe` tag:

```html
<iframe
  width="560px"
  height="315px"
  src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=nR4D9IEsqKlExFeD"
  title="YouTube video player"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen>
</iframe>
```

<iframe width="560px"
height="315px"
src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=nR4D9IEsqKlExFeD?rel=0"
title="YouTube video player"
frameborder="0"
allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
referrerpolicy="strict-origin-when-cross-origin"
allowfullscreen>
</iframe>

## Iframes

You can also use `iframe` tags to embed content from other websites:

```html
<iframe
  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.073202073202!2d-73.9856806845947!3d40.748545979328!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c259f6f1b45c3d%3A0x8e0b7e6f3b1f1f1b!2sEmpire%20State%20Building!5e0!3m2!1sen!2sus!4v1629820000000!5m2!1sen!2sus"
  width="100%"
  height="450"
  style="border:0;"
  allowfullscreen=""
  loading="lazy"></iframe>
```

<iframe
src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.073202073202!2d-73.9856806845947!3d40.748545979328!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c259f6f1b45c3d%3A0x8e0b7e6f3b1f1f1b!2sEmpire%20State%20Building!5e0!3m2!1sen!2sus!4v1629820000000!5m2!1sen!2sus"
width="100%"
height="450"
style="border:0;"
allowfullscreen=""
loading="lazy"></iframe>
