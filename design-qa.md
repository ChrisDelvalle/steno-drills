final result: passed

Reviewed the focused Steno Drills redesign against Monkeytype on 2026-10-20. The user's later Monkeytype references supersede the earlier ChatGPT comparison. The homepage opens directly into a ready test, with settings behind the gear. No sidebar, headings, slogans, live speed/accuracy meters, or separate visible typing field remain.

Evidence directory: /Users/irk/.codex/visualizations/2026/10/20/01a15bac-4542-7a03-854d-233aa2b5b8c7

- Source visual truth: monkeytype-reference.png, captured from https://monkeytype.com/, plus the supplied active-test and results screenshots.
- Implementation: steno-drills-ready.png, steno-drills-hints.png, steno-drills-results.png, steno-drills-skills.png, and steno-drills-mobile.png.
- Full-view comparison: steno-drills-comparison.png. Source and implementation are together in the same image and were opened for comparison.
- Focused comparison: steno-drills-type-comparison.png. Compared typography, caret, target spacing, row rhythm, and muted/yellow tokens in a combined input.
- Source and desktop implementation: 784 × 988 CSS pixels and screenshot pixels, 1:1 density, dark theme, idle focused test. Different vocabulary is intentional; the implementation uses the eligible Plover pool. Both pages were at 100% zoom.
- Narrow implementation: a real 393 × 852 CSS-pixel iframe viewport, captured at 393 × 852 pixels without scaling, light theme. The temporary QA harness was removed after verification.
- Additional states: active typing, long mistakes, backspace corrections, second-row progression, finite final rows, hints above/below and at different sizes, settings, saved data reload, and results.

Fonts and typography: Roboto Mono 400 is served locally. Desktop target words are 32px; mobile targets are 25px. The timer is 32px on desktop and 25px on mobile and displays total seconds. Small labels remain readable. Mistakes appear above the target in a reserved annotation band, shrink from 12px to 9px when needed, and truncate inside the target width with the full text available on hover. Expected words determine layout; user input never changes their dimensions.

Spacing and layout: the test is the primary content and starts without a button. The default viewport contains exactly three complete rows. Rows are explicitly wrapped and selected rather than scrolled; the current row stays second, except at the beginning and finite end. The user can choose 3–8 rows. Desktop 64px and mobile 56px rows deliberately exceed Monkeytype's row spacing to reserve room for error annotations. The keyboard's center aligns with the test container's center; hint text stays to its left. Hidden hints retain reserved geometry. The settings dialog contains the five areas and fits the tested narrow width without horizontal overflow. Skills columns have subtle vertical dividers.

Colors and tokens: the dark canvas uses Monkeytype's #323437, elevated surfaces #2c2e31, text #d1d0c5, and yellow #e2b714. Secondary text and errors use slightly stronger contrast than the reference (#9b9d9f and #ef7c89). Upcoming large target text remains muted. Light mode uses a neutral gray canvas with dark text and subdued yellow. Focus, errors, disabled controls, and selected controls remain distinguishable.

Image quality and assets: no decorative raster assets are needed. The app uses its own text name, Steno Drills, and MIT-licensed Heroicons for standard controls. No Monkeytype logo, ads, account UI, or approximate brand assets are included. The steno keyboard is a functional key-state diagram, not a replacement for an image asset. Roboto Mono and Chart.js license notices are included in the generated notices.

Copy and content: navigation uses Skills throughout. Older default saved-filter names migrate to Skills without changing criteria. A/O/E/U use the conventional Short A/O/E/U labels. Functional field labels, validation messages, dictionary exclusions, and raw-Plover setup instructions remain; promotional prose and the results scoring explanation are removed. Unrestricted exercises are explicitly identified in settings.

Comparison history:

- P1: the previous practice setup/sidebar and visible textarea competed with the test. Replaced them with the immediate focused test and a gear-triggered modal. Post-fix evidence: steno-drills-ready.png and steno-drills-comparison.png.
- P1: clipping a scrolling passage exposed partial rows. Replaced scrolling with measured complete-row wrapping and a pure row-window function. Verified three 64px rows at desktop, three 56px rows at mobile, active row second after progression, and a four-row finite end with the final row reachable. Evidence: steno-drills-ready.png and steno-drills-mobile.png.
- P1: input and long mistakes could change wrapping. Target geometry is now independent of typed content; absolute error annotations shrink/truncate within each target. A 400-character mistake changed none of the visible word coordinates or widths. Backspace cleared the annotation. Evidence: /tmp/steno-design-reference/steno-row-error.png.
- P2: narrow rendered letter spans rounded slightly wider than whole-word measurements, causing ellipses. Measurement now uses the same per-letter spans plus a 0.25px allowance. Reloaded and recaptured the 393px viewport: no document overflow, no clipped normal words, and the keyboard centered at 196.5px. Evidence: steno-drills-mobile.png.
- P2: the hint panel centered its text and keyboard together. Equal outer grid columns now center the keyboard itself; independent text and keyboard sizing and above/below position persist. Evidence: steno-drills-hints.png.
- P2: repeated graph error marks represented a persistent incorrect word every second. Error events are now recorded at submission and plotted separately. Burst speed uses a rolling one-second translated-character window. Verified one submitted error produces one X at its actual event time, alongside WPM, raw, and burst. Evidence: steno-drills-results.png and the accessible chart-data tables.
- P2: right-aligned chord labels could be read as belonging to the next checkbox. Added subtle column separators and verified SKWR belongs to initial J. Evidence: steno-drills-skills.png.

Validation: 54 tests pass across eight files, TypeScript passes, pinned dictionary/source validation passes, the production build passes, and Wrangler's deployment dry run passes. Browser checks cover immediate input, ordinary Plover text replacements/backspaces, case-insensitive scoring, newline/Enter restart during tests and results, IME confirmation, hints and caret navigation, empty pools, settings persistence, custom exercise modes, both themes, direct hash links, visible keyboard focus, narrow settings, and console errors. No browser console errors remain in the final local checks.

The dictionary audit verifies all 92 supported concepts and 117,902 indexed word/outline mappings against the pinned effective main/commands dictionaries. The user's supplied main.json and commands.json exactly match those snapshots, and user.json is empty. Corrected the be brief to -B and removed an unsupported final-S rule; initial J was already SKWR. The generated concept audit and source examples are linked from Settings.

No actionable P0/P1/P2 findings remain. Intentional adaptations are the app's own brand/icons, absence of ads/accounts, eligible steno vocabulary, error-annotation row spacing, and clearer secondary-text contrast. Deployment and live HTTPS checks are recorded separately in docs/cloudflare.md.
