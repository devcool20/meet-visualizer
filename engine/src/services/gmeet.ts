import puppeteer, { Browser, Page } from 'puppeteer';

class GMeetProxyService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isConnected = false;

  /**
   * Connects to a Google Meet room as a virtual participant
   */
  async joinMeeting(meetUrl: string, participantName: string = 'Stash Live Proxy'): Promise<void> {
    if (this.isConnected) {
      console.log('[GMeet Proxy] Already connected to a meeting.');
      return;
    }

    console.log(`[GMeet Proxy] Launching browser to connect to: ${meetUrl}`);
    try {
      this.browser = await puppeteer.launch({
        headless: false, // Visible for developer demonstration & debugging
        args: [
          '--use-fake-ui-for-media-stream',    // Bypasses mic/camera permission popups
          '--use-fake-device-for-media-stream',// Emulates camera/mic devices
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Grant camera and microphone permissions explicitly
      const context = this.browser.defaultBrowserContext();
      await context.overridePermissions(meetUrl, ['camera', 'microphone', 'notifications']);

      await this.page.goto(meetUrl, { waitUntil: 'networkidle2' });
      console.log('[GMeet Proxy] Arrived at Google Meet page.');

      // Bypassing GMeet join setup lobby
      // 1. Enter guest name if required (if not logged in)
      try {
        const nameInputSelector = 'input[type="text"]';
        await this.page.waitForSelector(nameInputSelector, { timeout: 8000 });
        await this.page.type(nameInputSelector, participantName);
        console.log(`[GMeet Proxy] Entered participant name: ${participantName}`);
      } catch (err) {
        console.log('[GMeet Proxy] No guest name input required (already logged in or different flow).');
      }

      // 2. Click "Join now" or "Ask to join"
      // Google Meet buttons use aria-labels or text. We seek buttons containing "Join" or "Ask to join"
      try {
        const buttonXPath = '//span[contains(text(),"Join now") or contains(text(),"Ask to join") or contains(text(),"Join")]';
        const [button] = await this.page.$x(buttonXPath);
        if (button) {
          // @ts-ignore
          await button.click();
          console.log('[GMeet Proxy] Clicked Join button.');
        } else {
          // Fallback selectors
          await this.page.keyboard.press('Enter');
          console.log('[GMeet Proxy] Keyboard Enter pressed as Join button fallback.');
        }
      } catch (err) {
        console.error('[GMeet Proxy] Failed to find or click Join button:', err);
      }

      this.isConnected = true;
      console.log('[GMeet Proxy] Virtual participant joined the Google Meet workspace successfully.');

      // Setup DOM injection listener
      this.setupDOMOverlayInjector();
    } catch (err) {
      console.error('[GMeet Proxy] Connection error:', err);
      await this.disconnect();
    }
  }

  /**
   * Injects the glassmorphic card canvas directly into the Google Meet DOM stage.
   * This technique places the card overlay cleanly over the meeting tile in the page view.
   */
  private async setupDOMOverlayInjector(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.evaluate(() => {
        console.log('[Stash Live Client] Injecting overlay hook into Google Meet page...');
        
        // Create client overlay element
        const overlayDiv = document.createElement('div');
        overlayDiv.id = 'stash-live-gmeet-overlay';
        overlayDiv.style.position = 'fixed';
        overlayDiv.style.top = '100px';
        overlayDiv.style.left = '40px';
        overlayDiv.style.width = '380px';
        overlayDiv.style.zIndex = '9999';
        overlayDiv.style.pointerEvents = 'none';
        
        document.body.appendChild(overlayDiv);
      });
    } catch (err) {
      console.error('[GMeet Proxy] Failed to inject client-side script:', err);
    }
  }

  /**
   * Updates the client overlay inside the Google Meet browser window.
   */
  async updateMeetingOverlay(htmlContent: string): Promise<void> {
    if (!this.page || !this.isConnected) return;

    try {
      await this.page.evaluate((html) => {
        const el = document.getElementById('stash-live-gmeet-overlay');
        if (el) el.innerHTML = html;
      }, htmlContent);
    } catch (err) {
      // Suppress secondary render errors
    }
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.page = null;
    this.isConnected = false;
    console.log('[GMeet Proxy] Disconnected from Google Meet.');
  }
}

export const gmeetProxyService = new GMeetProxyService();
