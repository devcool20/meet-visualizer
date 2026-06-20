import puppeteer, { Browser, Page } from 'puppeteer';
import { config } from '../config.js';
import { cacheService } from './cache.js';

type FrameCallback = (frameBuffer: Buffer) => void;

class CompositorService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitialized = false;
  private frameCallbacks: FrameCallback[] = [];
  
  // Frame Rate states
  private renderInterval: NodeJS.Timeout | null = null;
  private currentFps = 1;
  private isTransitioning = false;
  private isActive = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[Compositor] Launching headless browser for canvas synthesis...');
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      
      // Load the template page hosted locally
      const templateUrl = `http://localhost:${config.port}/compositor-template.html`;
      await this.page.goto(templateUrl, { waitUntil: 'networkidle0' });
      
      this.isInitialized = true;
      console.log(`[Compositor] Synthesis canvas loaded from ${templateUrl}`);

      // Start the frame ingestion loop
      this.startFrameLoop();
    } catch (err) {
      console.error('[Compositor] Initialization failed. Headless compositing disabled.', err);
    }
  }

  onFrame(cb: FrameCallback) {
    this.frameCallbacks.push(cb);
  }

  /**
   * Pre-warms the card 1.5s early in hidden/translucent mode
   */
  async preWarm(anchor: string): Promise<void> {
    if (!this.page) return;
    console.log(`[Compositor] Pre-warming canvas for: ${anchor}`);
    
    await this.page.evaluate((anc) => {
      // @ts-ignore
      window.preWarm(anc);
    }, anchor);

    // Boost frame rate for the initial pre-warm transition
    this.triggerTransitionPeriod();
  }

  /**
   * Renders the Notion cached card on the visual overlay stage
   */
  async showCard(anchor: string): Promise<void> {
    if (!this.page) return;
    
    const cacheKey = `notion:${anchor}`;
    const cachedVal = await cacheService.get(cacheKey);
    
    if (!cachedVal) {
      console.error(`[Compositor] Cannot show card. Anchor data for "${anchor}" not found in cache.`);
      return;
    }

    console.log(`[Compositor] Rendering active glassmorphic card for anchor: ${anchor}`);
    
    await this.page.evaluate((anc, val) => {
      // @ts-ignore
      window.showCard(anc, val);
    }, anchor, cachedVal);

    this.isActive = true;
    
    // Trigger transition: run at 30fps to capture slide-in animation
    this.triggerTransitionPeriod();
  }

  /**
   * Dismisses the active card overlay
   */
  async hideCard(): Promise<void> {
    if (!this.page) return;
    console.log('[Compositor] Dismissing visual card...');
    
    await this.page.evaluate(() => {
      // @ts-ignore
      window.hideCard();
    });

    this.isActive = false;
    
    // Trigger transition: run at 30fps to capture slide-out animation
    this.triggerTransitionPeriod();
  }

  /**
   * Triggers a high-framerate rendering window (30fps) for 600ms to capture slide-in/slide-out animations.
   * After 600ms, drops down to 1fps to save CPU resources and network bandwidth.
   */
  private triggerTransitionPeriod() {
    this.isTransitioning = true;
    this.setFps(30);

    setTimeout(() => {
      this.isTransitioning = false;
      this.setFps(1);
      console.log('[Compositor] Transition complete. Locking stream overlay to 1 FPS.');
    }, 800);
  }

  private setFps(fps: number) {
    if (this.currentFps === fps) return;
    this.currentFps = fps;
    console.log(`[Compositor] Adjusting capture rate to: ${fps} FPS`);
    
    // Restart frame capture loop with new interval
    this.startFrameLoop();
  }

  private startFrameLoop() {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
    }

    const intervalMs = Math.round(1000 / this.currentFps);
    
    this.renderInterval = setInterval(async () => {
      if (!this.isInitialized || !this.page) return;
      
      try {
        // Capture transparent overlay layout screenshot (PNG contains alpha channel)
        const screenshot = await this.page.screenshot({
          type: 'png',
          omitBackground: true
        });

        // Broadcast buffer to listeners (e.g. WebSocket connections, WebRTC compositor)
        if (screenshot) {
          const frameBuffer = Buffer.from(screenshot);
          this.frameCallbacks.forEach(cb => cb(frameBuffer));
        }
      } catch (err) {
        // Ignore screenshot failures during navigation or page refresh
      }
    }, intervalMs);
  }

  async close(): Promise<void> {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.isInitialized = false;
  }
}

export const compositorService = new CompositorService();
