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
 *
 * Extended with four HUD phases for hold-to-talk (plan §"HUD states"):
 * idle, listening, generating, error.
 */

const HUD_ID = 'stash-live-hud';

export type HudPhase = 'idle' | 'listening' | 'generating' | 'error';

export interface HudState {
  phase: HudPhase;
  lastPhrase: string | null;
  tokenWarning: boolean;
  message: string | null;
}

const PHASE_LABELS: Record<HudPhase, string> = {
  idle: 'Stash Live — idle  (Alt+Shift+Space to talk)',
  listening: 'Stash Live — listening',
  generating: 'Stash Live — generating card…',
  error: 'Stash Live — error',
};

export class Hud {
  private root: HTMLDivElement | null = null;
  private pill: HTMLDivElement | null = null;
  private label: HTMLSpanElement | null = null;
  private messageEl: HTMLSpanElement | null = null;
  private dismissed = false;
  private currentPhase: HudPhase = 'idle';

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
    pill.style.flexDirection = 'column';
    pill.style.gap = '4px';
    pill.style.padding = '8px 12px';
    pill.style.borderRadius = '12px';
    pill.style.background = 'rgba(26,21,18,0.85)';
    pill.style.color = '#fff';
    pill.style.fontSize = '13px';
    pill.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '8px';

    const label = document.createElement('span');
    label.textContent = PHASE_LABELS.idle;

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

    topRow.appendChild(label);
    topRow.appendChild(dismissBtn);
    pill.appendChild(topRow);

    const messageEl = document.createElement('div');
    messageEl.style.fontSize = '11px';
    messageEl.style.color = 'rgba(255,255,255,0.7)';
    messageEl.style.display = 'none';
    pill.appendChild(messageEl);

    root.appendChild(pill);
    document.body.appendChild(root);

    this.root = root;
    this.pill = pill;
    this.label = label;
    this.messageEl = messageEl;
  }

  update(state: HudState): void {
    if (!this.label || !this.pill || !this.messageEl) return;

    this.currentPhase = state.phase;

    // Set the phase label
    const labelText = PHASE_LABELS[state.phase];
    const phrase = state.lastPhrase ? ` — “${state.lastPhrase?.slice(0, 60)}”` : '';
    this.label.textContent = `${labelText}${phrase}`;

    // Show/hide message line
    if (state.message && (state.phase === 'error' || state.phase === 'generating')) {
      this.messageEl.textContent = state.message;
      this.messageEl.style.display = 'block';
    } else {
      this.messageEl.style.display = 'none';
    }

    // Phase-based styling
    if (state.phase === 'error') {
      this.pill.style.background = 'rgba(200,40,40,0.9)';
    } else if (state.tokenWarning) {
      this.pill.style.background = 'rgba(180,120,0,0.9)';
    } else {
      this.pill.style.background = 'rgba(26,21,18,0.85)';
    }
  }

  /** Expose the current phase for testing. */
  getPhase(): HudPhase {
    return this.currentPhase;
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
