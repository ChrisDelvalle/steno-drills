final result: passed

Reviewed Steno Drills against the live ChatGPT interface on 2026-10-20. This is a reference for shared controls and visual language; the practice workflows and information architecture belong to Steno Drills. The requested omission of headings, slogans, account UI, and conversation UI is intentional.

- Source visual truth: `/tmp/steno-design-reference/chatgpt-appearance.png` and `chatgpt-general.png`, captured from `https://chatgpt.com/settings/appearance` and `/settings/general-settings`. No ChatGPT preferences were changed.
- Implementation: `/tmp/steno-design-reference/steno-settings-final-normalized.png`, `steno-practice-final-normalized.png`, `steno-desktop-normalized.png`, and `steno-words-mobile-fixed-normalized.png`.
- Full-view comparison: `/tmp/steno-design-reference/comparison-full.png`. Source and implementation were opened together and compared in the same image.
- Focused comparison: `/tmp/steno-design-reference/comparison-controls-final.png`. Compared select heights, typography, colors, borders, radii, and chevron placement.
- State: dark Settings and Practice setup; light Settings also checked. Medium source viewport 784 × 988 CSS pixels, implementation 783 × 988; desktop implementation 1279 × 900; narrow implementation 389 × 845.
- Density normalization: source captures are 784 × 988 pixels. The local origin retains 67% browser zoom; its capture includes blank padding beyond the CSS viewport (1169 × 1475 pixels at the medium size). Cropping that padding to the measured 783 × 988 viewport preserves one image pixel per CSS pixel without scaling. Narrow raw captures are 581 × 1260 and normalized to 389 × 845. The one-pixel medium viewport difference does not change a breakpoint or wrapping.

Typography: shared system font stack matches the measured source. Navigation and controls use 14px text, 20px navigation/button line height, regular body weight, and 500-weight buttons. Smaller metadata and monospace outlines are functional app-specific choices. Labels wrap without hiding controls; keyboard focus remains visible.

Spacing and layout: navigation uses 36px rows, 8px corners, 20px outline icons, and 6px/10px padding. Selects and buttons use the source's 36px size and pill shape. The two-column practice setup becomes one column on narrow screens; navigation becomes a compact top row. The single sidebar, absence of decorative page titles, and steno keyboard preview are intentional adaptations. No document overflow was found on the tested screens.

Colors: measured dark surfaces map to #0e0e0e, elevated #212121, controls #303030, text #ededed, secondary text #afafaf, and white at 15% for borders. Light mode uses a neutral white/gray counterpart and was checked separately. Focus, errors, selected state, and disabled controls remain distinguishable.

Assets: standard outline icons and the favicon use MIT-licensed Heroicons; no approximate OpenAI logo or decorative image assets are included. The steno keyboard is a functional key-state diagram. Icon sizing and weight were compared with the source. See https://github.com/tailwindlabs/heroicons for the library and license.

Copy: all five app areas have no heading elements or motivational copy. Field labels, exercise names, validation, exclusion explanations, and raw-Plover setup instructions remain because they support decisions and operation.

Comparison history:

- P1: the previous dark palette used #212121 for the main canvas. Replaced it with the measured source tokens. Post-fix evidence: `comparison-full.png`.
- P2: controls and navigation were taller and used smaller labels than the source. Matched measured dimensions, font stack, border opacity, and row spacing. Post-fix evidence: `comparison-full.png` and `comparison-controls-final.png`.
- P2: inconsistent hand-drawn icons and edge-aligned native select arrows. Replaced them with a consistent library and inset 20px chevrons. Post-fix evidence: `comparison-controls-final.png` and `steno-desktop-normalized.png`.
- P2: narrow Word Bank status text was clipped. Search and status now occupy separate full-width rows. Before: `steno-words-mobile.png`; after: `steno-words-mobile-fixed-normalized.png`.
- Removed the always-visible storage status to reduce chrome. Storage errors still appear, and Settings explains local persistence.

Validation: Practice, My Skills, Word Bank, Exercises, and Settings render without document overflow at the checked widths. Verified light/dark themes, hash navigation, visible keyboard focus, select controls, custom-list practice, word corrections/replacements, completion/restart, backup import preview and restore, and vocabulary exclusions. The production build loaded directly at `/#/skills`; dictionary loading and console were checked. TypeScript, 28 tests, source validation, and Vite production build pass.

No actionable P0/P1/P2 findings remain. Native checkbox/radio details may differ by operating system; this is acceptable for accessible controls. Cloudflare account/domain association and live-domain HTTPS verification remain deployment tasks and are outside this local visual QA result.
