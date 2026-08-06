/**
 * Presenter-only in-page HUD.
 *
 * This is a plain DOM element appended to `document.body` on the Meet page.
 * It is visible to the presenter locally but MUST NEVER end up in the
 * outbound video, because that video is produced entirely by the MAIN-world
 * compositor drawing the CAMERA ELEMENT plus the CANVAS-DRAWN card — the DOM
 * HUD is never one of the draw sources for `canvas.captureStream()`. See
 * `extension/src/inject/compositor.ts`: the render loop only ever calls
 * `ctx.drawImage(videoEl, ...)` and canvas-native draw calls; it has no path
 * that could rasterize arbitrary page DOM (no `html2canvas`, no
 * `SVGForeignObject`, nothing that walks `document.body`). That absence is
 * the actual guarantee — verified by code inspection, and by the Playwright
 * fixture test asserting the HUD element is absent from the captured canvas
 * pixels (see extension/test/hud-not-in-stream.spec.ts).
 */

const HUD_ID = 'stash-live-hud';

export interface HudState {
  listening: boolean;
  lastPhrase: string | null;
  tokenWarning: boolean;
}

export class Hud {
  private root: HTMLDivElement | null = null;
  private pill: HTMLDivElement | null = null;
  private label: HTMLSpanElement | null = null;
  private dismissed = false;

  constructor(private onDismiss: () => void) {}

  mount(): void {
    if (document.getElementById(HUD_ID)) return;
    const root = document.createElement('div');
    root.id = HUD_ID;
    root.setAttribute('data-stash-live', 'hud');
    root.style.position = 'fixed';
    root.style.bottom = '24px';
    root.style.left = '24px';
    root.style.zIndex = '2147483647';
    root.style.fontFamily = 'Inter, system-ui, sans-serif';
    root.style.pointerEvents = 'auto';

    const pill = document.createElement('div');
    pill.style.display = 'flex';
    pill.style.alignItems = 'center';
    pill.style.gap = '8px';
    pill.style.padding = '8px 12px';
    pill.style.borderRadius = '999px';
    pill.style.background = 'rgba(26,21,18,0.85)';
    pill.style.color = '#fff';
    pill.style.fontSize = '13px';
    pill.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';

    const label = document.createElement('span');
    label.textContent = 'Stash Live — idle';

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '✕';
    dismissBtn.setAttribute('aria-label', 'Dismiss Stash Live HUD');
    dismissBtn.style.background = 'transparent';
    dismissBtn.style.border = 'none';
    dismissBtn.style.color = '#fff';
    dismissBtn.style.cursor = 'pointer';
    dismissBtn.style.fontSize = '13px';
    dismissBtn.addEventListener('click', () => {
      this.dismiss();
      this.onDismiss();
    });

    pill.appendChild(label);
    pill.appendChild(dismissBtn);
    root.appendChild(pill);
    document.body.appendChild(root);

    this.root = root;
    this.pill = pill;
    this.label = label;
  }

  update(state: HudState): void {
    if (!this.label || !this.pill) return;
    const status = state.listening ? 'listening' : 'idle';
    const phrase = state.lastPhrase ? ` — “${state.lastPhrase}”` : '';
    this.label.textContent = `Stash Live — ${status}${phrase}`;
    this.pill.style.background = state.tokenWarning ? 'rgba(180,120,0,0.9)' : 'rgba(26,21,18,0.85)';
  }

  dismiss(): void {
    this.dismissed = true;
    this.root?.remove();
    this.root = null;
  }

  toggleVisible(): void {
    if (!this.root) return;
    this.root.style.display = this.root.style.display === 'none' ? 'flex' : 'none';
  }

  get isDismissed(): boolean {
    return this.dismissed;
  }
}
