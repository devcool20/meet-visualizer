/**
 * Registers Inter and JetBrains Mono via the FontFace API using the fonts
 * bundled as web-accessible resources, so canvas text draws with the correct
 * glyphs instead of silently falling back to a generic sans-serif (plan
 * §3.2: "canvas cannot rely on the Meet page's fonts").
 *
 * IMPORTANT: this module runs in the MAIN world (it is imported from
 * `compositor.ts`), where `chrome.runtime` is NOT injected — MV3 does not
 * expose extension APIs to MAIN-world page scripts. `chrome-extension://`
 * URLs are therefore built directly from the extension ID constant rather
 * than via `chrome.runtime.getURL`, which only works in isolated-world
 * content scripts and the service worker.
 *
 * Safe to call multiple times; resolves once every face has loaded (or
 * failed — a font load failure degrades to the browser default rather than
 * blocking the render loop, consistent with plan §3.7).
 */
import { DEV_EXTENSION_ID } from '../shared/constants.js';

interface FontDef {
  family: string;
  file: string;
  weight: string;
}

const FONT_DEFS: FontDef[] = [
  { family: 'Inter', file: 'fonts/inter-400.woff2', weight: '400' },
  { family: 'Inter', file: 'fonts/inter-600.woff2', weight: '600' },
  { family: 'Inter', file: 'fonts/inter-700.woff2', weight: '700' },
  { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-400.woff2', weight: '400' },
  { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-500.woff2', weight: '500' },
];

let loaded: Promise<void> | null = null;

export function ensureCardFontsLoaded(): Promise<void> {
  if (loaded) return loaded;
  loaded = Promise.all(
    FONT_DEFS.map(async (def) => {
      try {
        const url = `chrome-extension://${DEV_EXTENSION_ID}/${def.file}`;
        const face = new FontFace(def.family, `url(${url})`, { weight: def.weight });
        const loadedFace = await face.load();
        document.fonts.add(loadedFace);
      } catch {
        // Missing/blocked font load degrades to system sans/mono — never
        // throws into the render loop that owns the outbound camera.
      }
    }),
  ).then(() => undefined);
  return loaded;
}
