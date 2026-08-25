# Poliwave brand exploration

This folder contains the one-pass character exploration approved on 2026-08-25.
The public-facing brand name is **Poliwave** and the character nickname is **涡仔**.
`Poliwag` is treated only as the initial semantic reference for a mosquito-coil
tadpole; every candidate is prompted as an original character that must not
reproduce an existing franchise character.

## Candidate map

| Label | Direction | Product connection | Corner | Character colors | Background |
| --- | --- | --- | --- | --- | --- |
| A1 | 回波尾蝌蚪 | Repeating scans and signal echoes | lower-left | deep blue-green `#123F46`, bright mint `#48DDB2` | muted powder blue `#9DB8C7` |
| A2 | 回波尾蝌蚪 | Repeating scans and signal echoes | lower-right | midnight navy `#172D4D`, electric cyan `#52D5F2` | muted warm apricot `#D7AE8D` |
| B1 | 信号肚蝌蚪 | RSSI strength and connection decisions | lower-left | fresh turquoise `#20B9B5`, deep indigo `#26335B` | muted lilac `#AFA6C5` |
| B2 | 信号肚蝌蚪 | RSSI strength and connection decisions | lower-right | cobalt blue `#2769D7`, sunflower yellow `#F4C84A` | muted sage green `#AFC0A2` |
| C1 | 频道尾蝌蚪 | Finding a clearer Wi-Fi channel | lower-left | cobalt blue `#2752C9`, pale mint `#9BE8C4` | muted coral `#D39A96` |
| C2 | 频道尾蝌蚪 | Finding a clearer Wi-Fi channel | lower-right | deep teal `#086F73`, pale aqua `#9BE7E0` | muted mustard-olive `#C4B36E` |
| F1 | A1 × B1 融合 | Turns an RSSI decision arc into a continuous echo tail | lower-left | fresh turquoise `#20B9B5`, deep indigo `#26335B` | muted lilac `#AFA6C5` |
| F2 | F1 旧标配色版 | Preserves F1 while reconnecting it to the original product palette | lower-left | deep forest teal `#184A3F`, vivid mint `#2DD8B4` | dark charcoal green `#0D1B19` |
| F3 | F2 单尾轮廓修正版 | Removes the competing left-side appendage reading so the spiral remains the only tail | lower-left | deep forest teal `#184A3F`, vivid mint `#2DD8B4` | dark charcoal green `#0D1B19` |
| F4 | F3 一体化完整轮廓版 | Makes body and spiral tail one physical silhouette with the signal path inset inside | lower-left | deep forest teal `#184A3F`, vivid mint `#2DD8B4` | dark charcoal green `#0D1B19` |

## Generation record

- Route: built-in `image_gen`, one independent call per candidate.
- Backing model: not exposed by the runtime tool schema.
- Constraint delivery: `main-prompt constraints`; the tool exposes one prompt
  field and no dedicated negative-prompt parameter.
- Requested canvas: full-bleed `1:1`, approximately `1536 × 1536`.
- Initial six-candidate batch policy: preserve every returned result as-is; no reference chaining,
  ranking, automatic retry, repair, or post-processing.
- Exact prompts: [PROMPTS.md](./PROMPTS.md).

`F1` is an explicitly requested refinement generated from `A1` and `B1` as
local reference images. It keeps A1's oversized lower-left silhouette and
spiral movement, while B1 supplies the friendly face, RSSI arc, and palette.
The RSSI arc and spiral tail are merged into one continuous indigo shape.
The preserved native result is a `1254 × 1254` RGB PNG.

`F2` is the explicitly requested color-only refinement of `F1`. It uses the
existing `src-tauri/icons/icon.png` only as a palette reference. The old Wi-Fi
arcs, equalizer bars, frame, and rounded-square container were explicitly
excluded. The preserved native result is a `1254 × 1254` RGB PNG.

`F3` is the explicitly requested local contour refinement of `F2`. The
lower-left inward notch and outward bulb were replaced by one uninterrupted
body edge, leaving the right-side spiral as the only tail-like feature. The
preserved native result is a `1254 × 1254` RGB PNG.

`F4` is the explicitly requested unity and completeness refinement of `F3`.
The deep-teal body now narrows directly into the complete spiral tail as one
outer silhouette. The mint signal path is inset inside that silhouette instead
of appearing as a foreground tube, and the framing exposes the complete spiral.
The preserved native result is a `1254 × 1254` RGB PNG.

The files under `candidates/` are concept candidates and are not wired into the
application yet. The product-name integration is complete; the chosen result
still needs platform icon export.
