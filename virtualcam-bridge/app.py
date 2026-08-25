"""
High-Performance Stash Live Virtual Camera Streaming Bridge (Windows / OBS Virtual Cam).

Features:
- Audience-First Orientation (mirror=False by default so other meeting attendees see 100% normal un-mirrored text)
- Safe-Zone Positioning: 52px top padding (never clipped by Google Meet header or bottom name bar)
- Compact Card Dimensions: 330px width, max 360px height
- Threaded Camera reader for 30 FPS 720p HD with zero stutter
- Continuous voice recognition (PyAudio + SpeechRecognition)
"""

import sys
import os
import time
import json
import threading
import argparse
from typing import Optional, Dict, Any

import cv2
import numpy as np
import requests
import pyvirtualcam
from pyvirtualcam import PixelFormat
import speech_recognition as sr

from renderer import CardOverlayRenderer


class ThreadedCamera:
    """Decoupled background camera reader to guarantee 30 FPS without blocking the stream."""
    def __init__(self, src: int = 0, width: int = 1280, height: int = 720):
        self.src = src
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.frame: Optional[np.ndarray] = None
        self.running = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    def start(self):
        self.running = True
        self._init_cap()
        self.thread = threading.Thread(target=self._update_loop, daemon=True)
        self.thread.start()
        return self

    def _init_cap(self):
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

        for idx in [self.src, 0, 1]:
            try:
                backend = cv2.CAP_DSHOW if os.name == 'nt' else cv2.CAP_ANY
                cap = cv2.VideoCapture(idx, backend)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                    cap.set(cv2.CAP_PROP_FPS, 30)
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        print(f"[Stash Live] Camera active on device {idx} ({frame.shape[1]}x{frame.shape[0]})")
                        self.cap = cap
                        with self.lock:
                            self.frame = frame
                        return
                    cap.release()
            except Exception:
                pass

    def _update_loop(self):
        while self.running:
            if self.cap and self.cap.isOpened():
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    with self.lock:
                        self.frame = frame
                else:
                    time.sleep(0.05)
                    self._init_cap()
            else:
                time.sleep(0.5)
                self._init_cap()

    def read(self) -> Optional[np.ndarray]:
        with self.lock:
            return self.frame.copy() if self.frame is not None else None

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.cap:
            try:
                self.cap.release()
            except Exception:
                pass


class StashVirtualCamBridge:
    def __init__(
        self,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
        mirror: bool = False,
        engine_url: str = "http://localhost:5000",
    ):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.target_fps = fps
        self.mirror = mirror
        self.engine_url = engine_url

        # State
        self.running = False
        self.active_card: Optional[Dict[str, Any]] = None
        self.active_source = "Google Drive"
        self.card_progress = 0.0
        self.target_card_progress = 0.0
        self.side = "right"
        self.hud_state = "idle"
        self.transcript = ""
        self.audio_level = 0.0
        self.last_card_id = ""

        self.renderer = CardOverlayRenderer(screen_width=width, screen_height=height, engine_url=self.engine_url)
        self.camera: Optional[ThreadedCamera] = None

    def get_camera_frame(self) -> np.ndarray:
        if self.camera:
            raw = self.camera.read()
            if raw is not None:
                if raw.shape[1] != self.width or raw.shape[0] != self.height:
                    raw = cv2.resize(raw, (self.width, self.height), interpolation=cv2.INTER_LINEAR)
                return raw

        fallback = np.full((self.height, self.width, 3), 32, dtype=np.uint8)
        cv2.putText(fallback, "STASH LIVE PRESENTER FEED", (60, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (120, 120, 120), 2)
        return fallback

    def trigger_card(self, utterance: str):
        cleaned = utterance.strip()
        if not cleaned:
            return
        print(f"[Stash Live] Synthesizing topic: '{cleaned}'...")
        self.hud_state = "generating"
        self.transcript = cleaned
        try:
            resp = requests.post(
                f"{self.engine_url}/api/virtualcam/trigger",
                json={"utterance": cleaned, "userId": "local-dev-user"},
                timeout=8.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ok") and data.get("card"):
                    source = data.get("state", {}).get("activeCardSource", "Google Drive")
                    self.show_card(data["card"], source=source)
                    self.hud_state = "idle"
                    return
        except Exception as e:
            print(f"[Stash Live] Trigger error: {e}")
        self.hud_state = "idle"

    def show_card(self, card: Dict[str, Any], source: str = "Google Drive"):
        self.active_card = card
        self.active_source = source
        self.last_card_id = str(card.get("id", ""))
        self.target_card_progress = 1.0
        print(f"[Stash Live] Showing card: '{card.get('title')}' on {self.side} shoulder (Source: {source})")

    def dismiss_card(self):
        self.target_card_progress = 0.0

    def start_engine_sync(self):
        def sync_loop():
            while self.running:
                try:
                    resp = requests.get(f"{self.engine_url}/api/virtualcam/status", timeout=1.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        st = data.get("state", {})
                        card = st.get("activeCard")
                        if card:
                            cid = str(card.get("id", ""))
                            if cid != self.last_card_id:
                                self.show_card(card, source=st.get("activeCardSource", "Google Drive"))
                        elif st.get("cardVisible") is False and self.target_card_progress > 0:
                            self.dismiss_card()

                        self.hud_state = st.get("hudState", self.hud_state)
                        if "side" in st:
                            self.side = st["side"]
                        if "mirror" in st:
                            self.mirror = bool(st["mirror"])
                except Exception:
                    pass
                time.sleep(0.35)

        t = threading.Thread(target=sync_loop, daemon=True)
        t.start()

    def start_voice_listener(self):
        def voice_loop():
            recognizer = sr.Recognizer()
            recognizer.energy_threshold = 300
            recognizer.dynamic_energy_threshold = True
            recognizer.pause_threshold = 0.8

            try:
                mic = sr.Microphone()
                with mic as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.8)
                print("[Stash Live] Microphone voice listener active and calibrated.")

                while self.running:
                    try:
                        with mic as source:
                            self.hud_state = "idle"
                            self.audio_level = 0.1
                            audio = recognizer.listen(source, timeout=4.0, phrase_time_limit=8.0)
                            self.audio_level = 0.8
                            self.hud_state = "listening"
                            text = recognizer.recognize_google(audio)
                            if text and len(text.strip()) > 2:
                                print(f"[Stash Live] Heard voice: '{text}'")
                                self.trigger_card(text)
                    except sr.WaitTimeoutError:
                        pass
                    except sr.UnknownValueError:
                        pass
                    except Exception:
                        time.sleep(0.5)
            except Exception as e:
                print(f"[Stash Live] Microphone notice: {e}")

        t = threading.Thread(target=voice_loop, daemon=True)
        t.start()

    def start_hotkey_listener(self):
        try:
            import keyboard
            hotkey_topics = [
                "Akshay Kumar",
                "Drake (musician)",
                "Stash Live YC W25 Pitch Metrics and Traction ARR gross margins",
                "Q2 SaaS Revenue and Growth",
            ]
            topic_idx = [0]

            def on_hotkey():
                topic = hotkey_topics[topic_idx[0] % len(hotkey_topics)]
                topic_idx[0] += 1
                print(f"[Stash Live] Hotkey triggered topic: '{topic}'")
                threading.Thread(target=self.trigger_card, args=(topic,), daemon=True).start()

            keyboard.add_hotkey("alt+shift+space", on_hotkey)
            print("[Stash Live] Registered global hotkey: Alt+Shift+Space")
        except Exception as e:
            print(f"[Stash Live] Hotkey notice: {e}")

    def run(self):
        self.running = True
        self.camera = ThreadedCamera(src=self.camera_index, width=self.width, height=self.height).start()
        self.start_engine_sync()
        self.start_voice_listener()
        self.start_hotkey_listener()

        # Seed initial topic card
        threading.Thread(target=self.trigger_card, args=("Akshay Kumar",), daemon=True).start()

        print("[Stash Live] Opening OBS Virtual Camera at 720p HD (1280x720 @ 30 FPS)...")
        try:
            with pyvirtualcam.Camera(
                width=self.width,
                height=self.height,
                fps=self.target_fps,
                fmt=PixelFormat.BGR,
                backend="obs",
            ) as vcam:
                print("==================================================================")
                print(f"  [STASH LIVE] STREAMING TO VIRTUAL CAMERA: {vcam.device}")
                print(f"  Resolution: {self.width}x{self.height} @ {self.target_fps} FPS (720p HD)")
                print(f"  Audience-First Mode: {'ENABLED (Un-mirrored for all meeting attendees)' if not self.mirror else 'PRESENTER SELFIE MIRROR'}")
                print("  ----------------------------------------------------------------")
                print("  1. In Google Meet, Zoom, or Teams:")
                print("     Settings -> Video -> Camera -> Select 'OBS Virtual Camera'")
                print("  2. Speak into your mic or press [Alt+Shift+Space] for live cards.")
                print("  3. Web dashboard controls: http://localhost:5173/virtualcam")
                print("==================================================================")

                last_time = time.time()

                while self.running:
                    now = time.time()
                    dt = now - last_time
                    last_time = now

                    # Smooth spring progression
                    if self.card_progress < self.target_card_progress:
                        self.card_progress = min(1.0, self.card_progress + dt * 4.5)
                    elif self.card_progress > self.target_card_progress:
                        self.card_progress = max(0.0, self.card_progress - dt * 5.0)

                    # 1. Grab camera frame
                    cam_bgr = self.get_camera_frame()

                    # 2. Fast SIMD alpha blend GlassCard onto frame (Audience-First or Presenter Mirror)
                    composited_bgr = self.renderer.composite_fast_bgr(
                        base_frame_bgr=cam_bgr,
                        active_card=self.active_card,
                        card_progress=self.card_progress,
                        side=self.side,
                        source=self.active_source,
                        hud_state=self.hud_state,
                        transcript=self.transcript,
                        audio_level=self.audio_level,
                        mirror=self.mirror,
                    )

                    # 3. Stream to Virtual Camera
                    try:
                        vcam.send(composited_bgr)
                        vcam.sleep_until_next_frame()
                    except Exception as send_err:
                        time.sleep(0.033)

        except Exception as e:
            print(f"[Stash Live] Virtual camera stream error: {e}")
        finally:
            if self.camera:
                self.camera.stop()
            self.running = False


def main():
    parser = argparse.ArgumentParser(description="Stash Live Virtual Camera Broadcaster")
    parser.add_argument("--camera", type=int, default=0, help="Physical webcam index")
    parser.add_argument("--width", type=int, default=1280, help="Output width")
    parser.add_argument("--height", type=int, default=720, help="Output height")
    parser.add_argument("--fps", type=int, default=30, help="Frame rate")
    parser.add_argument("--mirror", action="store_true", help="Enable mirror for presenter self-view")
    parser.add_argument(
        "--engine-url",
        type=str,
        default=os.environ.get("STASH_ENGINE_URL", "https://stash-live-engine.onrender.com"),
        help="Backend AI Engine URL (defaults to cloud Render URL with local fallback)",
    )
    args = parser.parse_args()

    # If cloud is unreachable and local is up, fall back gracefully
    engine_url = args.engine_url
    if "onrender.com" in engine_url:
        try:
            requests.get(f"{engine_url}/health", timeout=1.5)
        except Exception:
            try:
                if requests.get("http://localhost:5000/health", timeout=1.0).status_code == 200:
                    engine_url = "http://localhost:5000"
            except Exception:
                pass

    print(f"[Stash Live] Connecting to Backend AI Engine at: {engine_url}")

    bridge = StashVirtualCamBridge(
        camera_index=args.camera,
        width=args.width,
        height=args.height,
        fps=args.fps,
        mirror=args.mirror,
        engine_url=engine_url,
    )
    bridge.run()


if __name__ == "__main__":
    main()
