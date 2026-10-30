# Illustration style prompt

The standard prompt for every illustration on the site. `scripts/generate-illustration.mjs` reads the block under **Prompt** and puts the scene description in place of `{scene}`. Change the style here, not in the script, so every image stays consistent.

## Settings

```json
{
  "provider": "recraft",
  "model": "recraftv3_vector",
  "style": "vector_illustration",
  "size": "1536x1024",
  "colors": [
    { "rgb": [0, 87, 183], "weight": 0.35 },
    { "rgb": [255, 215, 0], "weight": 0.2 },
    { "rgb": [20, 34, 56], "weight": 0.2 },
    { "rgb": [239, 246, 255], "weight": 0.15 },
    { "rgb": [220, 228, 238], "weight": 0.1 }
  ],
  "background": [255, 255, 255]
}
```

The colours are the site tokens: blue `#0057b7`, yellow `#ffd700`, text navy `#142238`, pale blue `#eff6ff`, border grey `#dce4ee`, on white.

## Prompt

```prompt
Flat vector illustration, calm and friendly, for an educational website. {scene}. Simple geometric shapes, clean even outlines, soft rounded corners, limited palette of deep blue, warm yellow and dark navy on a white background with pale blue accents. Generous empty space, centred composition, no gradients, no shadows, no texture. No text, no letters, no numbers, no signs, no labels, no flags, no logos. People, if any, are simple and faceless, everyday modern clothing.
```

## Rules for every image

Checked by Claude before an image is used, and recorded in `images/manifest.json`:

1. **No text of any kind** inside the image. Image models garble Cyrillic. Labels go in HTML next to the image.
2. **Relevant:** it shows what the page or section is about, and helps a learner, not just decorates.
3. **Culturally sound:** nothing Russian presented as Ukrainian (onion domes, Russian-style signs or clothing), no stereotypes, no "traditional costume" unless the page is about it and it has been checked.
4. **No real people, places or brands** presented as real.
5. **On style:** matches the palette and the flat look of the images already on the site. Regenerate rather than accept an off-style image.
6. **Accessible:** real alt text describing what it shows, or `alt=""` if purely decorative.
7. **Small:** vector (SVG) preferred; raster images go through Astro's `<Image>` for WebP/AVIF.
