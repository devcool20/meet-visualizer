// Injected script running in the main page context of meet.google.com.
// Monkeypatches getUserMedia to intercept webcam and blend Stash Live cards.

(function() {
  console.log('[Stash Live Interceptor] Initializing WebRTC MediaStream interceptor...');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[Stash Live Interceptor] getUserMedia not available on navigator.mediaDevices.');
    return;
  }

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  
  // Keep track of active socket connections and canvas rendering loops
  let socket = null;
  let latestOverlayBlobUrl = '';
  let hasOverlay = false;
  const overlayImage = new Image();

  overlayImage.onload = () => {
    hasOverlay = true;
  };

  overlayImage.onerror = () => {
    hasOverlay = false;
  };

  // Manage local WebSocket connection to the engine server
  function connectEngineSocket() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log('[Stash Live Interceptor] Connecting to local server ws://localhost:5000 ...');
    socket = new WebSocket('ws://localhost:5000');
    socket.binaryType = 'blob';

    socket.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Revoke the old blob URL to prevent rapid memory leaks (running at 30fps)
        const oldUrl = latestOverlayBlobUrl;
        latestOverlayBlobUrl = URL.createObjectURL(event.data);
        
        // Setting source will trigger image load
        overlayImage.src = latestOverlayBlobUrl;

        if (oldUrl && oldUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl);
        }
      } else {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'dismiss') {
            hasOverlay = false;
          }
        } catch(e) {}
      }
    };

    socket.onclose = () => {
      console.log('[Stash Live Interceptor] Connection to engine lost. Retrying in 3s...');
      hasOverlay = false;
      socket = null;
      setTimeout(connectEngineSocket, 3000);
    };

    socket.onerror = () => {
      if (socket) socket.close();
    };
  }

  // Connect socket immediately
  connectEngineSocket();

  // Override standard browser getUserMedia
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    // Only intercept when video stream is requested
    if (constraints && constraints.video) {
      console.log('[Stash Live Interceptor] Intercepting video constraints:', constraints);
      
      // Ensure we are connected to the orchestrator socket
      connectEngineSocket();

      try {
        // Fetch raw camera stream from device
        const rawStream = await originalGetUserMedia(constraints);
        const videoTracks = rawStream.getVideoTracks();

        if (videoTracks.length === 0) {
          return rawStream;
        }

        console.log(`[Stash Live Interceptor] Intercepted camera track: "${videoTracks[0].label}". Launching Canvas Blender...`);

        // 1. Create offscreen video element to parse incoming camera frames
        const videoEl = document.createElement('video');
        videoEl.srcObject = rawStream;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.muted = true;
        
        // Wait for video element to resolve sizes
        await new Promise((resolve) => {
          videoEl.onloadedmetadata = () => {
            videoEl.play().then(resolve).catch(resolve);
          };
        });

        // 2. Build offscreen compositing canvas matching standard HD stream resolution
        const canvasEl = document.createElement('canvas');
        const width = videoEl.videoWidth || 1280;
        const height = videoEl.videoHeight || 720;
        canvasEl.width = width;
        canvasEl.height = height;
        const ctx = canvasEl.getContext('2d');

        console.log(`[Stash Live Interceptor] Canvas initialized at: ${width}x${height}`);

        // 3. Rendering loop combining camera stream and transparent cards
        let isLoopActive = true;
        
        function renderLoop() {
          if (!isLoopActive) return;

          try {
            // Draw raw camera feed frame
            ctx.drawImage(videoEl, 0, 0, width, height);

            // Blend the transparent glassmorphic overlay frame on top
            if (hasOverlay && overlayImage.complete && overlayImage.naturalWidth > 0) {
              ctx.drawImage(overlayImage, 0, 0, width, height);
            }
          } catch (e) {
            // Suppress minor render exceptions
          }

          requestAnimationFrame(renderLoop);
        }
        
        renderLoop();

        // 4. Capture composited stream from Canvas
        const compositeStream = canvasEl.captureStream(30);

        // 5. Append original audio tracks (so microphone keeps working in Google Meet)
        rawStream.getAudioTracks().forEach(track => {
          compositeStream.addTrack(track);
        });

        // Handle stream ending cleanups
        videoTracks[0].addEventListener('ended', () => {
          console.log('[Stash Live Interceptor] Camera stream ended. Cleaning up canvas blender loop.');
          isLoopActive = false;
          rawStream.getTracks().forEach(t => t.stop());
        });

        return compositeStream;
      } catch (err) {
        console.error('[Stash Live Interceptor] Error intercepting stream. Falling back to raw webcam:', err);
        return originalGetUserMedia(constraints);
      }
    }

    return originalGetUserMedia(constraints);
  };

  console.log('[Stash Live Interceptor] navigator.mediaDevices.getUserMedia monkeypatched successfully.');
})();
