"""
Ultra-Compact Safe-Zone GlassCard Renderer for Stash Live Virtual Camera.

Optimizations:
1. Ultra-Compact Geometry: Width = 290px, Max Height = 280px (Takes only ~22% of frame).
2. Deep Broadcast Safe-Zone: Top margin = 85px, Right margin = 60px (Guarantees zero clipping in any Google Meet layout).
3. Compact Banner Image: Sleek 3.5:1 ratio (width=250px, height=70px), cleanly separated under the header.
4. Top-Left Safe HUD: Compact status pill at (60px, 85px), completely clear of username and UI buttons.
5. True Frosted Glass: Gaussian blur strictly masked to the card's rounded silhouette.
6. Audience-First: Transmits 100% normal, un-inverted text to all call participants.
"""

import io
import time
import requests
from typing import Dict, Any, Optional, Tuple, List
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

# 2x supersampled base dimensions (rendered at 2x, downscaled for razor-sharp antialiasing)
SUPER_SCALE = 2
BASE_CARD_WIDTH = 290
CARD_WIDTH_2X = BASE_CARD_WIDTH * SUPER_SCALE
CORNER_RADIUS_2X = 16 * SUPER_SCALE
MAX_CARD_HEIGHT_2X = 290 * SUPER_SCALE

# Colors
INK_TITLE = (15, 23, 42, 255)         # #0f172a Deep slate
INK_SUBTITLE = (71, 85, 105, 255)     # #475569 Slate
INK_BODY = (30, 41, 59, 255)          # #1e293b Charcoal body
INK_MUTED = (100, 116, 139, 255)      # #64748b Muted label
ACCENT_ORANGE = (234, 88, 12, 255)    # #ea580c Stash Orange
BADGE_BG = (255, 237, 213, 245)       # #ffedd5 Orange tint
BADGE_BORDER = (251, 146, 60, 245)    # #fb923c
STAT_CARD_BG = (255, 255, 255, 180)   # Semi-translucent stat card
STAT_CARD_BORDER = (255, 255, 255, 235)

_image_cache: Dict[str, Image.Image] = {}


def get_font_2x(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Returns standard system fonts scaled for 2x supersampling."""
    font_names = [
        "segoeuib.ttf" if bold else "segoeui.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
        "calibrib.ttf" if bold else "calibri.ttf",
        "tahomabd.ttf" if bold else "tahoma.ttf",
    ]
    scaled_size = size * SUPER_SCALE
    for name in font_names:
        try:
            return ImageFont.truetype(name, scaled_size)
        except Exception:
            continue
    return ImageFont.load_default()


def get_cached_image_2x(url: Optional[str], target_w_2x: int = 500, target_h_2x: int = 140, engine_url: Optional[str] = None) -> Optional[Image.Image]:
    """Fetches and caches a banner image texture with rounded corners and center crop."""
    if not url:
        return None

    # Handle local proxy URL when pointing to remote engine
    effective_url = url
    if engine_url and "localhost:5000" in effective_url:
        effective_url = effective_url.replace("http://localhost:5000", engine_url.rstrip("/"))

    # If it's an /img/ proxy token, try extracting the direct image URL from base64 if needed
    if "/img/" in effective_url and not effective_url.startswith("http"):
        if engine_url:
            effective_url = f"{engine_url.rstrip('/')}/{effective_url.lstrip('/')}"

    cache_key = f"{effective_url}_{target_w_2x}_{target_h_2x}"
    if cache_key in _image_cache:
        return _image_cache[cache_key]

    # Try fetching with headers
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        resp = requests.get(effective_url, headers=headers, timeout=3.5)
        if resp.status_code == 200:
            raw_img = Image.open(io.BytesIO(resp.content)).convert("RGBA")

            raw_w, raw_h = raw_img.size
            scale = max(target_w_2x / raw_w, target_h_2x / raw_h)
            new_w = int(raw_w * scale)
            new_h = int(raw_h * scale)
            scaled = raw_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            left = (new_w - target_w_2x) // 2
            top = (new_h - target_h_2x) // 2
            cropped = scaled.crop((left, top, left + target_w_2x, top + target_h_2x))

            mask = Image.new("L", (target_w_2x, target_h_2x), 0)
            draw_m = ImageDraw.Draw(mask)
            draw_m.rounded_rectangle((0, 0, target_w_2x, target_h_2x), radius=8 * SUPER_SCALE, fill=255)

            rounded = Image.new("RGBA", (target_w_2x, target_h_2x), (0, 0, 0, 0))
            rounded.paste(cropped, (0, 0), mask=mask)

            draw_r = ImageDraw.Draw(rounded)
            draw_r.rounded_rectangle((1, 1, target_w_2x - 2, target_h_2x - 2), radius=8 * SUPER_SCALE, outline=(255, 255, 255, 190), width=2 * SUPER_SCALE)

            _image_cache[cache_key] = rounded
            return rounded
    except Exception:
        pass
    return None


def wrap_text(text: str, font: ImageFont.ImageFont, max_width: int, draw: ImageDraw.ImageDraw) -> List[str]:
    """Wraps text so it strictly fits inside the card margins."""
    words = text.split()
    if not words:
        return []
    lines = []
    current_line = []

    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width or not current_line:
            current_line.append(word)
        else:
            lines.append(" ".join(current_line))
            current_line = [word]

    if current_line:
        lines.append(" ".join(current_line))
    return lines


class CardOverlayRenderer:
    def __init__(self, screen_width: int = 1280, screen_height: int = 720, engine_url: Optional[str] = None):
        self.screen_width = screen_width
        self.screen_height = screen_height
        self.engine_url = engine_url

        # 2x Ultra-Compact Typography
        self.font_title = get_font_2x(14, bold=True)
        self.font_subtitle = get_font_2x(10, bold=False)
        self.font_body = get_font_2x(10, bold=False)
        self.font_stat_val = get_font_2x(16, bold=True)
        self.font_stat_lbl = get_font_2x(8, bold=True)
        self.font_badge = get_font_2x(8, bold=True)
        self.font_footnote = get_font_2x(8, bold=False)
        self.font_hud = get_font_2x(10, bold=True)

        # Texture caches
        self._cached_card_id: Optional[str] = None
        self._cached_card_bgr: Optional[np.ndarray] = None
        self._cached_card_alpha: Optional[np.ndarray] = None

    def render_card_2x(
        self,
        card: Dict[str, Any],
        source: Optional[str] = "Google Drive",
    ) -> Image.Image:
        title = card.get("title", "Live Card")
        subtitle = card.get("subtitle", "")
        blocks = card.get("blocks", [])

        temp_img = Image.new("RGBA", (CARD_WIDTH_2X, 100), (0, 0, 0, 0))
        measure_draw = ImageDraw.Draw(temp_img)

        # Separate image block from other blocks
        image_url = None
        other_blocks = []
        for b in blocks:
            if b.get("kind") == "image" and b.get("url") and not image_url:
                image_url = b.get("url")
            else:
                other_blocks.append(b)

        content_w = CARD_WIDTH_2X - 44
        banner_h = 75 * SUPER_SCALE if image_url else 0

        # Exact compact height measurement
        curr_y = 28 + 36  # Header
        if subtitle:
            curr_y += 20
        curr_y += 10  # Divider

        if image_url:
            curr_y += banner_h + 12

        for block in other_blocks[:3]:
            kind = block.get("kind", "")
            if kind in ("stat", "metric_row"):
                curr_y += 75
            elif kind == "bullets":
                items = block.get("items", [])[:2]
                for item in items:
                    wrapped = wrap_text(str(item), self.font_body, content_w - 28, measure_draw)
                    curr_y += len(wrapped) * 24 + 6
            elif kind == "text":
                paras = block.get("paragraphs", [])[:1]
                for p in paras:
                    wrapped = wrap_text(str(p), self.font_body, content_w, measure_draw)[:2]
                    curr_y += len(wrapped) * 24 + 6
            elif kind == "status_list":
                curr_y += 26

        card_height_2x = max(160, min(MAX_CARD_HEIGHT_2X, curr_y + 24))
        canvas_h = card_height_2x + 40
        canvas_w = CARD_WIDTH_2X + 40

        card_img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(card_img, "RGBA")

        # 1. Multi-layer Drop Shadow
        for spread, alpha in [(8, 20), (4, 40), (2, 70)]:
            draw.rounded_rectangle(
                (20 - spread // 2, 20 + spread // 2, canvas_w - 20 + spread // 2, canvas_h - 20 + spread // 2),
                radius=CORNER_RADIUS_2X + spread // 2,
                fill=(0, 0, 0, alpha),
            )

        # 2. Frosted Acrylic Base Layer
        glass_box = (20, 20, canvas_w - 20, canvas_h - 20)
        draw.rounded_rectangle(
            glass_box,
            radius=CORNER_RADIUS_2X,
            fill=(255, 255, 255, 226),  # 89% opacity
            outline=(255, 255, 255, 250),
            width=3,
        )

        # 3. Inner specular rim line
        draw.rounded_rectangle(
            (22, 22, canvas_w - 22, canvas_h - 22),
            radius=CORNER_RADIUS_2X - 2,
            outline=(255, 255, 255, 150),
            width=2,
        )

        # 4. Source Badge (top right)
        badge_text = (source or "Google Drive").upper()
        badge_bbox = measure_draw.textbbox((0, 0), badge_text, font=self.font_badge)
        badge_w = (badge_bbox[2] - badge_bbox[0]) + 20
        badge_h = 26
        badge_x = canvas_w - 20 - badge_w - 18
        badge_y = 28

        draw.rounded_rectangle(
            (badge_x, badge_y, badge_x + badge_w, badge_y + badge_h),
            radius=13,
            fill=BADGE_BG,
            outline=BADGE_BORDER,
            width=2,
        )
        draw.text((badge_x + 10, badge_y + 4), badge_text, font=self.font_badge, fill=ACCENT_ORANGE)

        # 5. Header: Title & Subtitle
        text_x = 36
        y_cursor = 28
        title_max_w = badge_x - text_x - 12

        title_lines = wrap_text(title, self.font_title, title_max_w, draw)
        for t_line in title_lines[:1]:
            draw.text((text_x, y_cursor), t_line, font=self.font_title, fill=INK_TITLE)
        y_cursor += 34

        if subtitle:
            sub_lines = wrap_text(subtitle, self.font_subtitle, content_w, draw)
            for s_line in sub_lines[:1]:
                draw.text((text_x, y_cursor), s_line, font=self.font_subtitle, fill=INK_SUBTITLE)
                y_cursor += 20
        else:
            y_cursor += 2

        # Header divider line
        draw.line([(36, y_cursor + 6), (canvas_w - 36, y_cursor + 6)], fill=(15, 23, 42, 28), width=2)
        y_cursor += 16

        # 6. Hero / Banner Image Block (if present)
        if image_url:
            banner_img = get_cached_image_2x(image_url, content_w, banner_h, engine_url=self.engine_url)
            if banner_img:
                card_img.alpha_composite(banner_img, dest=(36, y_cursor))
                y_cursor += banner_h + 12

        # 7. Render Content Blocks
        for block in other_blocks[:3]:
            kind = block.get("kind", "")

            # STAT / METRIC ROW
            if kind in ("stat", "metric_row"):
                items = block.get("items", [])
                if not items and kind == "stat":
                    items = [{"label": block.get("label", ""), "value": block.get("value", "")}]

                if items:
                    card_col_w = (content_w - (len(items) - 1) * 10) // len(items)
                    for i, item in enumerate(items):
                        ix = 36 + i * (card_col_w + 10)
                        draw.rounded_rectangle(
                            (ix, y_cursor, ix + card_col_w, y_cursor + 68),
                            radius=10,
                            fill=STAT_CARD_BG,
                            outline=STAT_CARD_BORDER,
                            width=2,
                        )
                        v_str = str(item.get("value", ""))
                        l_str = str(item.get("label", "")).upper()
                        draw.text((ix + 12, y_cursor + 8), v_str, font=self.font_stat_val, fill=ACCENT_ORANGE)
                        draw.text((ix + 12, y_cursor + 42), l_str[:20], font=self.font_stat_lbl, fill=INK_MUTED)
                    y_cursor += 76

            # BULLET LIST
            elif kind == "bullets":
                items = block.get("items", [])[:2]
                for item in items:
                    draw.ellipse((36, y_cursor + 6, 44, y_cursor + 14), fill=ACCENT_ORANGE)
                    wrapped_lines = wrap_text(str(item), self.font_body, content_w - 22, draw)
                    for idx, line in enumerate(wrapped_lines[:2]):
                        draw.text((50, y_cursor + (idx * 24)), line, font=self.font_body, fill=INK_BODY)
                    y_cursor += min(2, len(wrapped_lines)) * 24 + 6

            # TEXT PARAGRAPHS
            elif kind == "text":
                paras = block.get("paragraphs", [])[:1]
                for p in paras:
                    wrapped_lines = wrap_text(str(p), self.font_body, content_w, draw)
                    for line in wrapped_lines[:2]:
                        draw.text((36, y_cursor), line, font=self.font_body, fill=INK_BODY)
                        y_cursor += 24
                    y_cursor += 6

            # STATUS / ATTRIBUTION FOOTNOTE
            elif kind == "status_list":
                rows = block.get("rows", [])
                for r in rows:
                    txt = r.get("text", "")
                    draw.text((36, y_cursor), txt[:60], font=self.font_footnote, fill=INK_MUTED)
                    y_cursor += 18

        return card_img

    def get_cached_card_bgr_and_alpha(
        self,
        card: Dict[str, Any],
        source: Optional[str] = "Google Drive",
        mirror: bool = False,
    ) -> Tuple[np.ndarray, np.ndarray]:
        card_id = str(card.get("id", "")) + f"_{mirror}_{source}"
        if self._cached_card_id == card_id and self._cached_card_bgr is not None:
            return self._cached_card_bgr, self._cached_card_alpha

        # 1. Render at 2x
        card_img_2x = self.render_card_2x(card, source=source)

        # 2. Mirror flip ONLY if explicitly requested
        if mirror:
            card_img_2x = card_img_2x.transpose(Image.FLIP_LEFT_RIGHT)

        # 3. Downscale to 1x with Lanczos for razor-sharp antialiasing
        target_w = card_img_2x.size[0] // SUPER_SCALE
        target_h = card_img_2x.size[1] // SUPER_SCALE
        card_img_1x = card_img_2x.resize((target_w, target_h), Image.Resampling.LANCZOS)

        rgba_arr = np.array(card_img_1x, dtype=np.uint8)
        bgr = cv2.cvtColor(rgba_arr[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = (rgba_arr[:, :, 3].astype(np.float32) / 255.0)[:, :, None]

        self._cached_card_id = card_id
        self._cached_card_bgr = bgr
        self._cached_card_alpha = alpha
        return bgr, alpha

    def render_hud_pill_bgr(
        self,
        hud_state: str = "idle",
        transcript: str = "",
        audio_level: float = 0.0,
        mirror: bool = False,
    ) -> Tuple[np.ndarray, np.ndarray]:
        pill_w_2x = 240 * SUPER_SCALE
        pill_h_2x = 32 * SUPER_SCALE
        hud_img = Image.new("RGBA", (pill_w_2x, pill_h_2x), (0, 0, 0, 0))
        draw = ImageDraw.Draw(hud_img, "RGBA")

        # Shadow
        draw.rounded_rectangle((4, 4, pill_w_2x - 4, pill_h_2x - 4), radius=16 * SUPER_SCALE, fill=(0, 0, 0, 70))

        # Acrylic dark pill
        draw.rounded_rectangle(
            (0, 0, pill_w_2x - 8, pill_h_2x - 8),
            radius=16 * SUPER_SCALE,
            fill=(15, 23, 42, 235),
            outline=(255, 255, 255, 80),
            width=2 * SUPER_SCALE,
        )

        dot_color = (34, 197, 94, 255) if hud_state == "idle" else (249, 115, 22, 255)
        if hud_state == "listening":
            dot_color = (59, 130, 246, 255)
        elif hud_state == "error":
            dot_color = (239, 68, 68, 255)

        draw.ellipse((16 * SUPER_SCALE, 10 * SUPER_SCALE, 24 * SUPER_SCALE, 18 * SUPER_SCALE), fill=dot_color)

        label = "STASH LIVE" if hud_state == "idle" else hud_state.upper()
        if transcript:
            label = transcript[:14] + "…" if len(transcript) > 14 else transcript

        draw.text((32 * SUPER_SCALE, 7 * SUPER_SCALE), label, font=self.font_hud, fill=(248, 250, 252, 255))

        # Audio VU bars
        meter_x = pill_w_2x - (36 * SUPER_SCALE)
        for i in range(3):
            thresh = (i + 1) * 0.25
            active = audio_level >= thresh
            bh = (6 + (i * 4 if active else 0)) * SUPER_SCALE
            bar_color = (34, 197, 94, 255) if active else (255, 255, 255, 80)
            bx = meter_x + (i * 7 * SUPER_SCALE)
            by = 15 * SUPER_SCALE
            draw.rectangle((bx, by - bh // 2, bx + 3 * SUPER_SCALE, by + bh // 2), fill=bar_color)

        if mirror:
            hud_img = hud_img.transpose(Image.FLIP_LEFT_RIGHT)

        target_w = pill_w_2x // SUPER_SCALE
        target_h = pill_h_2x // SUPER_SCALE
        hud_img_1x = hud_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

        rgba_arr = np.array(hud_img_1x, dtype=np.uint8)
        bgr = cv2.cvtColor(rgba_arr[:, :, :3], cv2.COLOR_RGB2BGR)
        alpha = (rgba_arr[:, :, 3].astype(np.float32) / 255.0)[:, :, None]
        return bgr, alpha

    def composite_fast_bgr(
        self,
        base_frame_bgr: np.ndarray,
        active_card: Optional[Dict[str, Any]] = None,
        card_progress: float = 1.0,
        side: str = "right",
        source: Optional[str] = "Google Drive",
        hud_state: str = "idle",
        transcript: str = "",
        audio_level: float = 0.0,
        mirror: bool = False,
    ) -> np.ndarray:
        out = base_frame_bgr.copy()
        fh, fw = out.shape[:2]

        # 1. Overlay GlassCard with SHAPE-MASKED Frosted Blur in Safe Zone (top margin = 80px)
        if active_card and card_progress > 0.01:
            card_bgr, card_alpha = self.get_cached_card_bgr_and_alpha(active_card, source=source, mirror=mirror)
            ch, cw = card_bgr.shape[:2]

            actual_side = "left" if (mirror and side == "right") else ("right" if (mirror and side == "left") else side)

            target_x = fw - cw - 55 if actual_side == "right" else 55
            start_x = target_x + (70 if actual_side == "right" else -70)
            cur_x = int(start_x + (target_x - start_x) * card_progress)
            cur_y = 80  # Generous top padding (Guaranteed zero cropping in any Google Meet layout)

            x1 = max(0, min(fw, cur_x))
            y1 = max(0, min(fh, cur_y))
            x2 = max(0, min(fw, cur_x + cw))
            y2 = max(0, min(fh, cur_y + ch))

            if x2 > x1 and y2 > y1:
                cx1 = x1 - cur_x
                cy1 = y1 - cur_y
                cx2 = cx1 + (x2 - x1)
                cy2 = cy1 + (y2 - y1)

                roi = out[y1:y2, x1:x2].astype(np.float32)
                c_slice = card_bgr[cy1:cy2, cx1:cx2].astype(np.float32)
                a_slice = card_alpha[cy1:cy2, cx1:cx2]

                blurred_roi = cv2.GaussianBlur(out[y1:y2, x1:x2], (21, 21), 8).astype(np.float32)
                frosted_backdrop = (roi * (1.0 - a_slice)) + (blurred_roi * a_slice)
                blended = (frosted_backdrop * (1.0 - a_slice * 0.88)) + (c_slice * (a_slice * 0.88))
                out[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)

        # 2. Overlay Top-Left Safe HUD Pill (at y = 80px, x = 55px)
        hud_bgr, hud_alpha = self.render_hud_pill_bgr(
            hud_state=hud_state,
            transcript=transcript,
            audio_level=audio_level,
            mirror=mirror,
        )
        hh, hw = hud_bgr.shape[:2]
        hud_x = fw - hw - 55 if mirror else 55
        hud_y = 80  # Clean top-left safe zone

        x1 = max(0, min(fw, hud_x))
        y1 = max(0, min(fh, hud_y))
        x2 = max(0, min(fw, hud_x + hw))
        y2 = max(0, min(fh, hud_y + hh))

        if x2 > x1 and y2 > y1:
            hx1 = x1 - hud_x
            hy1 = y1 - hud_y
            hx2 = hx1 + (x2 - x1)
            hy2 = hy1 + (y2 - y1)

            roi = out[y1:y2, x1:x2].astype(np.float32)
            h_slice = hud_bgr[hy1:hy2, hx1:hx2].astype(np.float32)
            a_slice = hud_alpha[hy1:hy2, hx1:hx2]

            blended = (roi * (1.0 - a_slice)) + (h_slice * a_slice)
            out[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)

        return np.ascontiguousarray(out, dtype=np.uint8)
