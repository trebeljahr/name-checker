# Marketing images

`og-wordmark.png` (1200x630) is the link preview card: the name-check logo, the
headline and the search box from the landing page. It is also on ricos.site
(`public/projects/name-check-wordmark.webp`), where it was made on 2026-11-11.

The site serves it as `packages/client/src/app/opengraph-image.jpg` and
`twitter-image.jpg`, each with an `.alt.txt`. After changing the PNG, rebuild both:

```bash
for n in opengraph-image twitter-image; do
  magick docs/marketing/og-wordmark.png -strip -sampling-factor 4:4:4 -interlace JPEG -quality 88 packages/client/src/app/$n.jpg
done
```
