Add images, videos, and embeds to your documentation.

## Images

To add an image to your documentation, you need to put the image in the `assets` folder of your
project. After that, you can use the following markdown syntax to add the image to your
documentation:

```md
![Alt text](assets/image.png)
```

You can also use images from the internet by providing the URL:

```md
![Alt text](https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg)
```

![Angular logo](https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/blogs/18725/images/DAau3fjETFmAjLVaNl3B_FallLandscape7-.jpg)

## Videos

To add a video to your documentation, you can `iframe` tag with the video URL:

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
