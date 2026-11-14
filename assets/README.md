Owned by Role 4. Served by the stage at `/assets/...` (via the `stage/public/assets` symlink).

Until a file exists, the stage draws a stand-in (SVG character, painted-sea map, titled scene card), so
missing art never breaks the demo.

## Files

- `characters/<id>/body.png` and `mouth-0.png` .. `mouth-3.png` (closed -> wide), all the same size
  (800x1000, transparent PNG). Ids: `athena`, `odysseus`, `poseidon`, `circe`.
- `scenes/<sceneId>.png`, 1280x720 (the stage crops to 760x300 from the centre, so keep the subject centred).
  One per `sceneId` in `story/data/episodes.json`.
- `map/base.png` (1280x720) + `map/locations.json` (x, y in percent of the image; current positions are
  placeholders until the base map exists).

## Art style: Greek red-figure vase painting

Every image uses the same prompt prefix so the set looks like one piece:

```
Ancient Greek red-figure vase painting style, terracotta-orange figures with fine black line work
on a glossy black background, flat colours, no shading gradients, elegant stylised profiles,
meander (Greek key) border motifs, museum-quality pottery art, clean edges, no text, no watermark.
```

Palette (matches `stage/app/globals.css`): terracotta `#b5532b`, ink `#1d1a16`, paper `#f4ecdc`, gold `#e8c15a`.

### Characters (layered for lip sync)

Append to the prefix:

- **Athena:** `Athena, goddess of wisdom, Corinthian helmet pushed back, spear and owl, calm knowing gaze, three-quarter view, waist up, centred, transparent background.`
- **Odysseus:** `Odysseus, weathered sailor-king, short curly beard, pilos cap, travelling cloak, clever half-smile, three-quarter view, waist up, centred, transparent background.`
- **Poseidon:** `Poseidon, god of the sea, long wild beard, trident, crown of waves, stern brooding face, three-quarter view, waist up, centred, transparent background.`
- **Circe:** `Circe, enchantress, long dark hair, ornate robe, holding a wine cup and wand, mysterious smile, three-quarter view, waist up, centred, transparent background.`

Workflow:
1. Generate `body.png` with the mouth **closed** at 800x1000.
2. Make the 4 mouth frames by editing only the mouth region of that same image (inpaint: closed, slightly
   open, open, wide open "ah"). Export each as a full 800x1000 transparent PNG where everything except the
   mouth is transparent, so the layers stack exactly. `mouth-0` can be the closed mouth cut out of `body.png`.
3. Check in the stage at `localhost:3000/stage?debug=1`, "start/stop talking".

### Scenes (1280x720)

Append the episode's one-line scene description from Role 3, e.g.:

- **sirens:** `A ship passes a rocky island; Odysseus bound to the mast, crew rowing with wax in their ears, two Sirens with bird bodies singing on the rocks. Wide 16:9 composition, subject centred.`
- **lotus-eaters:** `Sailors lounging dreamily among lotus flowers on a sunny shore while Odysseus drags one back toward the ships. Wide 16:9 composition, subject centred.`

### Journey map

`Ancient Greek red-figure style map of the Mediterranean seen from above, stylised islands and coasts,
a small ship, wave patterns, empty of labels, wide 16:9.` Then set each location's x/y in `locations.json`
by eye (percent of width/height).
