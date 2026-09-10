import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_svg():
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGlow" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#280c10" />
      <stop offset="60%" stop-color="#141417" />
      <stop offset="100%" stop-color="#0a0a0c" />
    </radialGradient>

    <!-- Main Netflix Ribbon Red -->
    <linearGradient id="stemRed" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FF3843" />
      <stop offset="25%" stop-color="#E50914" />
      <stop offset="85%" stop-color="#B81D24" />
      <stop offset="100%" stop-color="#800b10" />
    </linearGradient>

    <!-- Dark Red Fold Shadow -->
    <linearGradient id="hookRed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B81D24" />
      <stop offset="50%" stop-color="#8a0f15" />
      <stop offset="100%" stop-color="#550509" />
    </linearGradient>

    <!-- Jellyfin Gemstone Violet Glow -->
    <linearGradient id="gemGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C084FC" />
      <stop offset="60%" stop-color="#9333EA" />
      <stop offset="100%" stop-color="#6B21A8" />
    </linearGradient>

    <!-- Subtle Drop Shadow Filter -->
    <filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.75" />
    </filter>

    <filter id="playGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#E50914" flood-opacity="0.8" />
    </filter>
  </defs>

  <!-- Squircle Container Background -->
  <rect width="512" height="512" rx="115" fill="url(#bgGlow)" />
  <rect width="508" height="508" x="2" y="2" rx="113" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />

  <!-- Ambient Red Aura -->
  <circle cx="256" cy="270" r="170" fill="#E50914" opacity="0.18" filter="blur(30px)" />

  <!-- 3D Ribbon "J" (The JellyFlix Emblem) -->
  <g filter="url(#ribbonShadow)">
    <!-- J Hook (Deep curved ribbon that folds backwards) -->
    <path
      d="M 285 310
         C 285 385, 255 425, 195 425
         C 135 425, 105 385, 105 330
         L 105 285
         L 165 285
         L 165 325
         C 165 355, 175 370, 195 370
         C 215 370, 225 355, 225 325
         L 225 240
         Z"
      fill="url(#hookRed)"
    />

    <!-- Main Vertical Red Ribbon Pillar -->
    <path
      d="M 285 85
         L 375 85
         L 375 350
         C 375 410, 335 445, 260 445
         C 210 445, 175 430, 150 405
         L 185 360
         C 200 375, 225 388, 255 388
         C 295 388, 315 370, 315 335
         L 315 85
         Z"
      fill="url(#stemRed)"
    />
  </g>

  <!-- Top Ribbon Highlight Bevel -->
  <path d="M 285 85 L 375 85" stroke="#FFA3A8" stroke-width="3" stroke-linecap="round" />

  <!-- Cinematic Play Symbol inside counter space -->
  <polygon
    points="175,170 175,250 245,210"
    fill="#FFFFFF"
    filter="url(#playGlow)"
    opacity="0.95"
  />

  <!-- Jellyfin Violet Gemstone Glint -->
  <circle cx="175" cy="115" r="16" fill="url(#gemGlow)" filter="url(#playGlow)" />
  <circle cx="175" cy="115" r="6" fill="#FFFFFF" opacity="0.9" />
</svg>
"""
    return svg_content

def render_pngs():
    sizes = [
        ("pwa-64x64.png", 64, False),
        ("pwa-144x144.png", 144, False),
        ("pwa-192x192.png", 192, False),
        ("pwa-512x512.png", 512, False),
        ("apple-touch-icon-180x180.png", 180, False),
        ("maskable-icon-512x512.png", 512, True),
    ]

    out_dir = "public/icons"
    os.makedirs(out_dir, exist_ok=True)

    # Save SVG
    with open("public/favicon.svg", "w", encoding="utf-8") as f:
        f.write(create_svg())
    print("Generated public/favicon.svg")

    # Render each size
    for filename, size, is_maskable in sizes:
        print(f"Rendering {filename} ({size}x{size}, maskable={is_maskable})...")
        
        # Super sample factor
        SS = 3 if size >= 256 else 4
        canvas_size = size * SS
        img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Background
        for y in range(canvas_size):
            ratio = y / canvas_size
            r = int(24 * (1 - ratio) + 10 * ratio)
            g = int(24 * (1 - ratio) + 10 * ratio)
            b = int(28 * (1 - ratio) + 12 * ratio)
            draw.line([(0, y), (canvas_size, y)], fill=(r, g, b, 255))

        # Crimson ambient aura in center
        glow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        g_draw = ImageDraw.Draw(glow)
        cx, cy = canvas_size // 2, int(canvas_size * 0.52)
        gr = int(canvas_size * 0.42)
        for r_step in range(gr, 0, -8):
            a = int(50 * (1 - (r_step / gr) ** 1.8))
            g_draw.ellipse([cx - r_step, cy - r_step, cx + r_step, cy + r_step], fill=(229, 9, 20, a))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=int(canvas_size * 0.05)))
        img = Image.alpha_composite(img, glow)
        draw = ImageDraw.Draw(img)

        # Scale factor
        scale = (canvas_size * 0.72) if is_maskable else (canvas_size * 0.82)
        ox = (canvas_size - scale) / 2
        oy = (canvas_size - scale) / 2

        def P(x, y):
            return (int(ox + (x / 512.0) * scale), int(oy + (y / 512.0) * scale))

        # 1. Hook (Back dark ribbon)
        hook_pts = [
            P(285, 310), P(285, 385), P(255, 425), P(195, 425),
            P(135, 425), P(105, 385), P(105, 330), P(105, 285),
            P(165, 285), P(165, 325), P(175, 355), P(195, 370),
            P(215, 370), P(225, 355), P(225, 325), P(225, 240)
        ]
        
        # Hook shadow
        h_shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        hs_draw = ImageDraw.Draw(h_shadow)
        hs_draw.polygon(hook_pts, fill=(0, 0, 0, 180))
        h_shadow = h_shadow.filter(ImageFilter.GaussianBlur(radius=int(canvas_size * 0.025)))
        img = Image.alpha_composite(img, h_shadow)

        # Hook fill
        h_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        hl_draw = ImageDraw.Draw(h_layer)
        hl_draw.polygon(hook_pts, fill=(155, 18, 24, 255))
        img = Image.alpha_composite(img, h_layer)

        # 2. Main Stem (Vertical bright red Netflix pillar)
        stem_pts = [
            P(285, 85),
            P(375, 85),
            P(375, 350),
            P(335, 435),
            P(260, 445),
            P(210, 445),
            P(185, 360),
            P(255, 388),
            P(295, 388),
            P(315, 350),
            P(315, 85),
        ]
        s_shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        ss_draw = ImageDraw.Draw(s_shadow)
        ss_draw.polygon(stem_pts, fill=(0, 0, 0, 200))
        s_shadow = s_shadow.filter(ImageFilter.GaussianBlur(radius=int(canvas_size * 0.025)))
        img = Image.alpha_composite(img, s_shadow)

        s_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        sl_draw = ImageDraw.Draw(s_layer)
        sl_draw.polygon(stem_pts, fill=(229, 9, 20, 255))
        img = Image.alpha_composite(img, s_layer)
        draw = ImageDraw.Draw(img)

        # Gradient shading on stem
        top_y = P(0, 85)[1]
        bot_y = P(0, 445)[1]
        for y_i in range(top_y, bot_y, 2):
            t = (y_i - top_y) / float(bot_y - top_y)
            if t < 0.25:
                draw.line([(P(285, 0)[0], y_i), (P(375, 0)[0], y_i)], fill=(255, 60, 70, int(180 * (1 - t/0.25))))

        # Bevel top highlight
        draw.line([P(285, 85), P(375, 85)], fill=(255, 170, 175, 230), width=max(2, int(canvas_size * 0.008)))

        # 3. Cinematic Play symbol (▶)
        play_pts = [P(175, 170), P(175, 250), P(245, 210)]
        p_glow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        pg_draw = ImageDraw.Draw(p_glow)
        pg_draw.polygon(play_pts, fill=(229, 9, 20, 180))
        p_glow = p_glow.filter(ImageFilter.GaussianBlur(radius=int(canvas_size * 0.015)))
        img = Image.alpha_composite(img, p_glow)

        p_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        pl_draw = ImageDraw.Draw(p_layer)
        pl_draw.polygon(play_pts, fill=(255, 255, 255, 245))
        img = Image.alpha_composite(img, p_layer)

        # 4. Jellyfin Gemstone violet glint
        gx, gy = P(175, 115)
        gem_r = int(canvas_size * 0.038)
        gem_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        gl_draw = ImageDraw.Draw(gem_layer)
        gl_draw.ellipse([gx - gem_r, gy - gem_r, gx + gem_r, gy + gem_r], fill=(168, 85, 247, 230))
        gl_draw.ellipse([gx - gem_r*0.4, gy - gem_r*0.4, gx + gem_r*0.4, gy + gem_r*0.4], fill=(255, 255, 255, 255))
        gem_layer = gem_layer.filter(ImageFilter.GaussianBlur(radius=int(canvas_size * 0.006)))
        img = Image.alpha_composite(img, gem_layer)

        # Squircle / Mask
        if not is_maskable:
            mask = Image.new("L", (canvas_size, canvas_size), 0)
            mask_draw = ImageDraw.Draw(mask)
            radius = int(canvas_size * 0.22)
            mask_draw.rounded_rectangle([0, 0, canvas_size, canvas_size], radius=radius, fill=255)
            
            output = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
            output.paste(img, (0, 0), mask)
            
            # Subtle rim border
            rim_draw = ImageDraw.Draw(output)
            rim_draw.rounded_rectangle(
                [2, 2, canvas_size - 2, canvas_size - 2],
                radius=radius,
                outline=(255, 255, 255, 25),
                width=max(1, int(canvas_size * 0.006))
            )
            img = output

        # Resize to target
        final_img = img.resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(out_dir, filename)
        final_img.save(out_path, "PNG", optimize=True)
        print(f"Saved {out_path} ({os.path.getsize(out_path)} bytes)")

    # Also create a favicon.png
    fav_32 = Image.open("public/icons/pwa-64x64.png").resize((32, 32), Image.Resampling.LANCZOS)
    fav_32.save("public/favicon.png", "PNG")
    print("Saved public/favicon.png")

if __name__ == "__main__":
    render_pngs()
