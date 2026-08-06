import { test, expect } from '@playwright/test';
import { REVENUE_CARD } from '../../packages/card-core/src/fixtures.js';
import { computePlacement, CARD } from '../../packages/card-core/src/index.js';

/**
 * Compositor smoke test (plan §5.2).
 *
 * Drives the REAL MAIN-world compositor module against a local fixture page
 * (NOT meet.google.com — see the extensive comment block in
 * `test-fixtures/compositor-fixture.html` for exactly what this does and does
 * not prove). With `--use-fake-device-for-media-stream` Chromium serves a
 * deterministic synthetic camera feed, so this runs fully headlessly with no
 * live signed-in Google account and no real WebRTC signaling.
 *
 * Assertions:
 *  1. The patched `getUserMedia` returns a DIFFERENT stream than the raw
 *     camera stream (proves interception actually occurred, not a passthrough).
 *  2. After `showCard()`, pixels sampled inside the expected placement
 *     rectangle (via the same `computePlacement` math the compositor uses)
 *     differ from the corresponding pixels in the raw camera feed — i.e. a
 *     card visibly lands where expected.
 *  3. The in-page HUD element, if present in this document, never appears in
 *     the composited canvas output — sampling the DOM HUD's on-screen
 *     bounding box position on the composited video shows camera/card
 *     content, not the HUD's own background colour.
 */

test.beforeEach(async ({ page }) => {
  page.on('console', (msg) => {
    console.log('[page '+msg.type()+']', msg.text());
  });
  page.on('pageerror', (err) => console.log('[page exception]', err.message));
});

test('getUserMedia interception produces a different stream from the raw camera', async ({ page }) => {
  await page.goto('/compositor-fixture.html');
  await page.waitForFunction(() => Boolean((window as any).__stashTest));

  const raw = await page.evaluate(() => (window as any).__stashTest.requestRawCamera());
  const patched = await page.evaluate(() => (window as any).__stashTest.requestPatchedCamera());

  expect(raw.streamId).toBeTruthy();
  expect(patched.streamId).toBeTruthy();
  expect(patched.streamId).not.toBe(raw.streamId);

  // The composited stream's video track must come from `canvas.captureStream()`,
  // not the raw fake device — canvas-captured tracks report kind 'video' but are
  // NOT the same track objects/ids as the raw device's track.
  const trackIds = await page.evaluate(() => {
    const rawVideo = document.getElementById('raw-preview') as HTMLVideoElement;
    const compositedVideo = document.getElementById('composited-preview') as HTMLVideoElement;
    const rawTrack = (rawVideo.srcObject as MediaStream)?.getVideoTracks()[0];
    const compositedTrack = (compositedVideo.srcObject as MediaStream)?.getVideoTracks()[0];
    return { rawId: rawTrack?.id, compositedId: compositedTrack?.id };
  });
  expect(trackIds.rawId).toBeTruthy();
  expect(trackIds.compositedId).toBeTruthy();
  expect(trackIds.compositedId).not.toBe(trackIds.rawId);
});

test('showing a card paints pixels at the expected placement that the raw camera does not have', async ({ page }) => {
  await page.goto('/compositor-fixture.html');
  await page.waitForFunction(() => Boolean((window as any).__stashTest));

  await page.evaluate(() => (window as any).__stashTest.requestRawCamera());
  await page.evaluate(() => (window as any).__stashTest.requestPatchedCamera());

  // Let the compositor render a few frames before sampling a "no card" baseline.
  await page.waitForTimeout(300);

  const baseline = await samplePlacementPixel(page);

  await page.evaluate((card) => (window as any).__stashTest.showCard(card), REVENUE_CARD);

  // Card enter animation is a 150ms+ spring; give it time to fully settle.
  await page.waitForTimeout(1200);

  const withCard = await samplePlacementPixel(page);

  // The camera-only baseline and the with-card frame must differ at the
  // placement region: the card's glass background (light, high alpha white)
  // is visually distinct from the fake synthetic camera feed's fixed pattern.
  expect(withCard).not.toEqual(baseline);

  await page.evaluate((cardId) => (window as any).__stashTest.hideCard(cardId), REVENUE_CARD.id);
});

test('HUD DOM element never appears in the composited canvas output', async ({ page }) => {
  await page.goto('/compositor-fixture.html');
  await page.waitForFunction(() => Boolean((window as any).__stashTest));

  // Mount a HUD-shaped element (same background colour the real HUD uses,
  // same bottom-left corner) directly over the composited <video> so that if
  // the render loop ever accidentally rasterized page DOM, this test would
  // catch it by sampling that exact spot on the canvas-derived video output.
  await page.evaluate(() => {
    const hud = document.createElement('div');
    hud.id = 'fake-hud-probe';
    hud.style.position = 'fixed';
    hud.style.bottom = '24px';
    hud.style.left = '24px';
    hud.style.width = '160px';
    hud.style.height = '32px';
    hud.style.background = 'rgb(26,21,18)'; // matches Hud pill background (opaque approximation)
    hud.style.zIndex = '2147483647';
    document.body.appendChild(hud);
  });

  await page.evaluate(() => (window as any).__stashTest.requestPatchedCamera());
  await page.waitForTimeout(300);

  // Sample the composited <video> element's pixels at its own bottom-left
  // corner (same relative position the HUD probe occupies on the page, but
  // read from the CANVAS-DERIVED video frame, not the DOM). If the render
  // loop ever drew the HUD into the canvas, this pixel would be near-black
  // (26,21,18); since the render loop only ever draws the camera + card, it
  // must not be.
  const pixel = await page.evaluate(() => {
    const video = document.getElementById('composited-preview') as HTMLVideoElement;
    const probe = document.createElement('canvas');
    probe.width = video.videoWidth || 1280;
    probe.height = video.videoHeight || 720;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(video, 0, 0, probe.width, probe.height);
    const x = 40;
    const y = probe.height - 40;
    const data = ctx.getImageData(x, y, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  });

  const isHudColour = pixel.r <= 30 && pixel.g <= 30 && pixel.b <= 30;
  expect(isHudColour).toBe(false);
});

/**
 * Samples a single pixel inside the card's expected placement rectangle
 * (computed with the same `computePlacement` used by the real compositor)
 * from the `#composited-preview` video element, via a scratch canvas.
 */
async function samplePlacementPixel(page: import('@playwright/test').Page): Promise<{ r: number; g: number; b: number }> {
  const frame = await page.evaluate(() => {
    const video = document.getElementById('composited-preview') as HTMLVideoElement;
    return { width: video.videoWidth || 1280, height: video.videoHeight || 720 };
  });
  const placement = computePlacement(frame, 260, 'auto');
  const sampleX = Math.round(placement.x + (CARD.width * placement.scale) / 2);
  const sampleY = Math.round(placement.y + 40);

  return page.evaluate(
    ({ x, y }) => {
      const video = document.getElementById('composited-preview') as HTMLVideoElement;
      const probe = document.createElement('canvas');
      probe.width = video.videoWidth || 1280;
      probe.height = video.videoHeight || 720;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(video, 0, 0, probe.width, probe.height);
      const data = ctx.getImageData(x, y, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2] };
    },
    { x: sampleX, y: sampleY },
  );
}
