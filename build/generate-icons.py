#!/usr/bin/env python3
"""Generate platform icons for ywcoder from source PNG."""
import os
import subprocess
from PIL import Image

SOURCE = "/Users/fangjiale/project/ywcoder/ywcoder/resources/ywcoder-logo.png"
OUT_DIR = "/Users/fangjiale/project/ywcoder/vscode/resources"

def generate_icns():
    """Generate macOS .icns using sips + iconutil."""
    iconset = "/tmp/ywcoder.iconset"
    os.makedirs(iconset, exist_ok=True)
    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
    for px, name in sizes:
        out = os.path.join(iconset, name)
        subprocess.run(["sips", "-z", str(px), str(px), SOURCE, "--out", out], check=True, capture_output=True)
    icns_out = os.path.join(OUT_DIR, "darwin", "code.icns")
    subprocess.run(["iconutil", "-c", "icns", iconset, "-o", icns_out], check=True, capture_output=True)
    print(f"Generated {icns_out}")

def generate_ico(out_path, sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]):
    """Generate Windows .ico using PIL."""
    img = Image.open(SOURCE).convert("RGBA")
    # Create images for each size
    images = []
    for size in sizes:
        resized = img.resize(size, Image.Resampling.LANCZOS)
        images.append(resized)
    images[0].save(out_path, format='ICO', sizes=sizes, append_images=images[1:])
    print(f"Generated {out_path}")

def generate_png(out_path, size):
    """Generate a PNG of specific size."""
    img = Image.open(SOURCE).convert("RGBA")
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    img.save(out_path)
    print(f"Generated {out_path}")

def main():
    # macOS icns
    generate_icns()

    # Linux png
    generate_png(os.path.join(OUT_DIR, "linux", "code.png"), 1024)

    # Windows ico
    generate_ico(os.path.join(OUT_DIR, "win32", "code.ico"))

    # Server icons
    generate_png(os.path.join(OUT_DIR, "server", "code-192.png"), 192)
    generate_png(os.path.join(OUT_DIR, "server", "code-512.png"), 512)
    generate_ico(os.path.join(OUT_DIR, "server", "favicon.ico"), sizes=[(16,16),(32,32),(48,48)])

    # Windows appx / store images
    generate_png(os.path.join(OUT_DIR, "win32", "code_150x150.png"), 150)
    generate_png(os.path.join(OUT_DIR, "win32", "code_70x70.png"), 70)

    print("All icons generated successfully.")

if __name__ == "__main__":
    main()
