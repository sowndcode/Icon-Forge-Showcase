# Ground Plane and Perspective Floor performance (0.2.0-alpha.1)

Measured with `bench/` (see bench/README.md) on the same machine for both versions: headless
Chromium with software rendering, a 1920×1080 page, synthetic icons (256 px originals, previews at
the app's usual sizes), editor view 1600×900 at device pixel ratio 1. All times in milliseconds.
A GPU-accelerated desktop will be faster in absolute terms; the comparison is what matters.

"Before" is `feat/product-workflow-overhaul` at 905a8af, "after" is this release.

## Editor frames (real editor canvas, every animation frame timed)

| Layout | Icons | Apply: first frame | Apply: worst frame | Pan frame | Wheel-zoom frame (median / worst) | Work after zoom stops (total / worst frame) |
|---|---|---|---|---|---|---|
| Ground Plane, before | 20 | 111 | 109 | 9.5 | 457 / 2588 | 0 / 0 |
| Ground Plane, after | 20 | 70 | 67 | 0.5 | 0.5 / 0.7 | 199 / 146 |
| Ground Plane, before | 180 | 379 | 374 | 12 | 439 / 8661 | 522 / 366 |
| Ground Plane, after | 180 | 158 | 153 | 0.7 | 0.7 / 0.8 | 862 / 238 |
| Ground Plane, before | 1000 | 802 | 771 | 21 | 465 / 7180 | 3181 / 1847 |
| Ground Plane, after | 1000 | 195 | 181 | 0.8 | 0.8 / 1.1 | 932 / 272 |
| Ground Plane, before | 2267 | 1258 | 1178 | 35 | 675 / 8440 | 56079 / 4381 |
| Ground Plane, after | 2267 | 541 | 464 | 1.5 | 1.4 / 1.8 | 376 / 99 |
| Perspective Floor, before | 2267 | 204 | 105 | 150 | 62 / 184 | 37404 / 318 |
| Perspective Floor, after | 2267 | 219 | 99 | 1.7 | 1.8 / 2.3 | 123 / 47 |

Zooming out again (median frame, before → after) at 2267 icons: Ground Plane 797 → 54, Perspective
Floor 59 → 45.

After the change, a Ground Plane that is applied shows every icon in the first frame; icons beyond
the frame's budget are drawn with a fast GPU warp that meets the same four corners and are replaced
by the exact warp over the next frames ("Apply: all final": 3518 ms of background work at 2267 icons,
in frames of at most 464 ms). Before, the first frame was the only frame and blocked for 1.26 s.

## Renderer without the editor's caches (export, thumbnails)

| Layout | Icons | First render | Export render 1× | Wheel-zoom render (median) |
|---|---|---|---|---|
| Ground Plane, before | 2267 | 921 | 166 | 259 |
| Ground Plane, after | 2267 | 770 | 104 | 204 |
| Ground Plane, before | 1000 | 608 | 183 | 211 |
| Ground Plane, after | 1000 | 459 | 100 | 115 |
| Perspective Floor, before | 2267 | 156 | 151 | 142 |
| Perspective Floor, after | 2267 | 137 | 151 | 146 |

Layout generation itself was not a bottleneck (Ground Plane 78 ms, Perspective Floor 98–120 ms for
2267 icons, including the undo step), nor hit testing (under 0.1 ms per pointer position).

## What was slow and what changed

- **Every pan and zoom frame re-rendered the whole page.** The editor now renders the page once per
  zoom into a page-sized bitmap (when that bitmap is of reasonable size) and panning only moves it.
  While the wheel turns, the last render is scaled into place; the sharp render follows 140 ms
  after the wheel stops. Zoomed in further, only the visible part is rendered and icons outside
  the view are skipped. This helps Perspective Floor as much as Ground Plane.
- **Ground Plane warps were redone on every zoom step** (the cache held at most 6 sizes per icon)
  and each warp read the whole source bitmap back from the GPU. Warps are now made at power-of-two
  sizes (the GPU scales them down by at most 2×), never larger than the source has pixels, from a
  copy of the source read back at about twice the output size on one shared canvas. Caches are
  bounded by memory (192 MB of warps, 96 MB of pixels) instead of by count.
- **A refinement livelock** found while measuring: when drawing the background used up the frame's
  warp budget, no frame ever finished an exact warp. The budget now starts at the first warp and
  every frame makes at least 6 exact warps.
- **Selecting thousands of objects** expanded groups with a quadratic search; it now uses a set.

Quality is unchanged: exports and previews always use exact warps at full resolution; the editor's
approximate frames only last until the exact warps are ready.
