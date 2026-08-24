/**
 * Google Meet Add-ons SDK Adapter for Stash Live.
 *
 * Provides a resilient, type-safe wrapper over `@googleworkspace/meet-addons`.
 * Handles:
 * - Session creation (`createAddonSession`)
 * - Frame type detection (Side Panel vs Main Stage vs Standalone)
 * - Main stage activity promotion (`startActivity`)
 * - Frame-to-frame message synchronization (`notifyMainStage` / `notifySidePanel`)
 * - Graceful standalone / local development fallback for outside-of-Meet testing
 */

import { meet } from '@googleworkspace/meet-addons/meet.addons';
import type {
  AddonSession,
  MeetSidePanelClient,
  MeetMainStageClient,
  FrameType,
  FrameToFrameMessage,
} from '@googleworkspace/meet-addons/meet.addons';
import type { CardSpec } from '@stash/card-spec';

export type EffectiveFrameType = FrameType | 'STANDALONE';

export interface MeetSessionState {
  isMeetContext: boolean;
  frameType: EffectiveFrameType;
  meetingId?: string;
  meetingCode?: string;
  session?: AddonSession;
  sidePanelClient?: MeetSidePanelClient;
  mainStageClient?: MeetMainStageClient;
}

export interface SharedCardBroadcastState {
  activeCard: CardSpec | null;
  presenterName: string;
  timestamp: number;
  captureId?: string;
}

/**
 * Checks if the current window is executing inside a Google Meet iframe.
 */
export function isRunningInMeet(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const hasMeetParam = window.location.search.includes('meet_sdk');
    const isFramed = window.self !== window.top;
    const hasMeetObject = Boolean((window as any).meet?.addon);
    return hasMeetParam || isFramed || hasMeetObject;
  } catch {
    return false;
  }
}

/**
 * Encodes a card state into binary Uint8Array.
 */
export function encodeSharedState(state: SharedCardBroadcastState): { bytes: Uint8Array } {
  const jsonStr = JSON.stringify(state);
  const encoder = new TextEncoder();
  return {
    bytes: encoder.encode(jsonStr),
  };
}

/**
 * Decodes binary Uint8Array into shared state.
 */
export function decodeSharedState(coState: { bytes: Uint8Array }): SharedCardBroadcastState | null {
  try {
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(coState.bytes);
    return JSON.parse(jsonStr) as SharedCardBroadcastState;
  } catch (err) {
    console.warn('[Stash Meet SDK] Failed to decode binary state:', err);
    return null;
  }
}

export class MeetAddonManager {
  private session: AddonSession | null = null;
  private sidePanelClient: MeetSidePanelClient | null = null;
  private mainStageClient: MeetMainStageClient | null = null;
  private frameType: EffectiveFrameType = 'STANDALONE';
  private onStateChangeCallback: ((state: SharedCardBroadcastState) => void) | null = null;

  /**
   * Initializes the Google Meet Add-on session.
   * If running standalone (e.g. during local dev or outside Meet), establishes a fallback session.
   */
  async initialize(cloudProjectNumber = '1088492049182'): Promise<MeetSessionState> {
    const inMeet = isRunningInMeet();

    if (!inMeet) {
      this.frameType = 'STANDALONE';
      return {
        isMeetContext: false,
        frameType: 'STANDALONE',
        meetingId: 'local-standalone-test',
        meetingCode: 'sta-shli-ve0',
      };
    }

    try {
      // 1. Detect frame type from Google Meet SDK
      let sdkFrame: FrameType = 'SIDE_PANEL';
      try {
        sdkFrame = meet.addon.getFrameType();
      } catch {
        sdkFrame = 'SIDE_PANEL';
      }
      this.frameType = sdkFrame;

      // 2. Create the session with Google Meet
      this.session = await meet.addon.createAddonSession({
        cloudProjectNumber,
      });

      let meetingId = 'meet-session';
      let meetingCode = 'live-meet';

      // 3. Create context-appropriate client and bind frame-to-frame listener
      if (this.frameType === 'SIDE_PANEL') {
        this.sidePanelClient = await this.session.createSidePanelClient();
        try {
          const info = await this.sidePanelClient.getMeetingInfo();
          meetingId = info.meetingId;
          meetingCode = info.meetingCode;
        } catch {}

        this.sidePanelClient.on('frameToFrameMessage', (msg: FrameToFrameMessage) => {
          this.handleIncomingFrameMessage(msg);
        });
      } else if (this.frameType === 'MAIN_STAGE') {
        this.mainStageClient = await this.session.createMainStageClient();
        try {
          const info = await this.mainStageClient.getMeetingInfo();
          meetingId = info.meetingId;
          meetingCode = info.meetingCode;
        } catch {}

        this.mainStageClient.on('frameToFrameMessage', (msg: FrameToFrameMessage) => {
          this.handleIncomingFrameMessage(msg);
        });
      }

      return {
        isMeetContext: true,
        frameType: this.frameType,
        meetingId,
        meetingCode,
        session: this.session,
        sidePanelClient: this.sidePanelClient ?? undefined,
        mainStageClient: this.mainStageClient ?? undefined,
      };
    } catch (error) {
      console.warn('[Stash Meet SDK] Initializing in fallback standalone mode due to:', error);
      this.frameType = 'STANDALONE';
      return {
        isMeetContext: false,
        frameType: 'STANDALONE',
        meetingId: 'fallback-standalone',
        meetingCode: 'sta-shli-ve0',
      };
    }
  }

  private handleIncomingFrameMessage(msg: FrameToFrameMessage): void {
    try {
      const parsed = JSON.parse(msg.payload) as SharedCardBroadcastState;
      if (parsed && this.onStateChangeCallback) {
        this.onStateChangeCallback(parsed);
      }
    } catch (err) {
      console.warn('[Stash Meet SDK] Error parsing frameToFrameMessage:', err);
    }
  }

  /**
   * Promotes the add-on from the Side Panel to the Main Stage for everyone in the call.
   */
  async promoteToMainStage(mainStageUrl?: string): Promise<boolean> {
    if (this.sidePanelClient) {
      try {
        const targetUrl = mainStageUrl || `${window.location.origin}/meet-addon?frame=main_stage`;
        await this.sidePanelClient.startActivity({
          mainStageUrl: targetUrl,
        });
        return true;
      } catch (err) {
        console.error('[Stash Meet SDK] Failed to promote to Main Stage:', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Broadcasts a card change between frames in Google Meet.
   */
  broadcastCard(card: CardSpec | null, presenterName = 'Presenter', captureId?: string): void {
    const payload: SharedCardBroadcastState = {
      activeCard: card,
      presenterName,
      timestamp: Date.now(),
      captureId,
    };
    const jsonStr = JSON.stringify(payload);

    try {
      if (this.sidePanelClient) {
        void this.sidePanelClient.notifyMainStage(jsonStr).catch(() => {});
      } else if (this.mainStageClient) {
        void this.mainStageClient.notifySidePanel(jsonStr).catch(() => {});
      }
    } catch (err) {
      console.warn('[Stash Meet SDK] Broadcast notice:', err);
    }
  }

  /**
   * Registers a callback for remote card updates.
   */
  onRemoteCardUpdate(callback: (state: SharedCardBroadcastState) => void): () => void {
    this.onStateChangeCallback = callback;
    return () => {
      this.onStateChangeCallback = null;
    };
  }

  getEffectiveFrameType(): EffectiveFrameType {
    return this.frameType;
  }
}

export const meetAddonManager = new MeetAddonManager();
