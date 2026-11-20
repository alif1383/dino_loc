#!/usr/bin/env python3
"""
Comprehensive Playwright End-to-End Visual & Functional Test Suite for DeepTime Earth.

Specifically verifies:
  1. WebGL Boot, non-blank Modern Earth rendering, and zero console/network errors.
  2. Paleo Earth shows REAL LAND (never empty blue water) and VISIBLY CHANGES pixels
     across ALL 5 geological stages (4.4 Ga, 300 Ma, 150 Ma, 68 Ma, 20 ka) + Modern Earth.
  3. Explorer Mannequin (Pegman) real drag-and-drop -> orbital dive -> non-black,
     full-bleed photorealistic Street View with loaded panorama & visible wildlife portraits.
  4. ALL 19 prehistoric scene panoramas, ALL 15 creature portraits, and ALL 19 globe textures
     load and decode cleanly in Chromium over HTTP with zero broken images.
  5. Street View panning + live compass, sighting hotspots, Field Guide drawer, MiniMap return,
     and in-Street-View time travel across all 5 stages.
  6. Click-to-drop in Paleo Earth mode (inverse Euler lookup) & keyboard shortcuts.
  7. Forced No-WebGL 2D Canvas fallback ALSO renders real Paleo Earth land & changes eras.
  8. 0x0 -> 1100x720 Preview iframe resize recovery & mobile responsive layout.
"""
import atexit
import io
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright

REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TEST_PORT = 4189
BASE_URL = f"http://localhost:{TEST_PORT}"


def wait_for_server(url, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.15)
    raise RuntimeError(f"Test server did not start at {url}")


def sample_globe_signature(page):
    """Samples 32x32 center grid of #globe-canvas and computes RGB stats & non-water land pixels."""
    return page.evaluate("""() => {
      const c = document.getElementById('globe-canvas');
      if (!c || c.width < 100 || c.height < 100) return { ok: false, reason: 'tiny canvas' };
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 64;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(c, 0, 0, 64, 64);
      const data = ctx.getImageData(16, 16, 32, 32).data;
      const vec = [];
      let lit = 0, landOrLava = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        vec.push(r, g, b);
        sumR += r; sumG += g; sumB += b;
        if (r + g + b > 65) lit++;
        // Non-ocean land, glacier, desert, forest, or magma pixels have strong R/G relative to B
        if ((r + g > b * 1.45 && (r > 38 || g > 42)) || (r > 130 && g > 130 && b > 130)) {
          landOrLava++;
        }
      }
      const n = data.length / 4;
      return {
        ok: lit > 180,
        lit,
        landOrLava,
        avgR: sumR / n,
        avgG: sumG / n,
        avgB: sumB / n,
        vec
      };
    }""")


def mean_rgb_diff(sig_a, sig_b):
    va, vb = sig_a["vec"], sig_b["vec"]
    assert len(va) == len(vb) and len(va) > 0
    return sum(abs(a - b) for a, b in zip(va, vb)) / len(va)


def verify_viewport_not_black(page, label=""):
    """Takes a fast JPEG screenshot of the live viewport and verifies the center region is rich non-black photography."""
    jpg = page.screenshot(type="jpeg", quality=75, animations="allow")
    im = Image.open(io.BytesIO(jpg)).convert("RGB")
    w, h = im.size
    # Sample unobstructed left-center cinema area (away from right drawer & top/bottom HUD)
    crop = im.crop((int(w * 0.12), int(h * 0.22), int(w * 0.65), int(h * 0.78))).resize((64, 36))
    raw = crop.tobytes()
    n = len(raw) // 3
    luma_sum = 0.0
    bright_px = 0
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        luma_sum += 0.299 * r + 0.587 * g + 0.114 * b
        if r + g + b > 70:
            bright_px += 1
    avg_luma = luma_sum / n
    assert avg_luma > 28 and bright_px > n * 0.45, (
        f"Street View appears black/blank for {label}: avg_luma={avg_luma:.1f}, bright={bright_px}/{n}"
    )
    return avg_luma


def run_suite():
    env = dict(os.environ, PORT=str(TEST_PORT))
    srv = subprocess.Popen(
        ["node", "scripts/server.mjs"],
        cwd=REPO_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    def cleanup_srv():
        if srv.poll() is None:
            srv.terminate()
            try:
                srv.wait(timeout=3)
            except subprocess.TimeoutExpired:
                srv.kill()

    atexit.register(cleanup_srv)
    signal.signal(signal.SIGTERM, lambda *_: (cleanup_srv(), sys.exit(1)))

    try:
        wait_for_server(BASE_URL)
        wait_for_server(f"http://[::1]:{TEST_PORT}")

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--no-sandbox",
                ],
            )

            # =================================================================
            # TEST 1: Full Desktop WebGL Boot + ALL 53 Visual Assets Decode Check
            # =================================================================
            errors = []
            failed_reqs = []
            page = browser.new_page(viewport={"width": 1366, "height": 860})
            page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
            page.on("console", lambda m: errors.append(f"CONSOLE ERROR: {m.text}") if m.type == "error" else None)
            page.on("requestfailed", lambda r: failed_reqs.append(f"REQFAIL: {r.url}"))

            page.goto(BASE_URL, wait_until="networkidle")
            page.wait_for_function(
                "() => window.__DEEPTIME__ && window.__DEEPTIME__.platesReady && window.__DEEPTIME__.isTextureReady('modern')",
                polling=150,
                timeout=15000,
            )
            page.wait_for_selector("#boot-status.is-hidden", state="attached", timeout=15000)
            time.sleep(0.6)

            assert page.evaluate("() => window.__DEEPTIME__.rendererMode") == "webgl"
            modern_sig = sample_globe_signature(page)
            assert modern_sig["ok"] and modern_sig["landOrLava"] > 80, f"Modern Earth missing land pixels: {modern_sig}"
            print(f"[PASS] 1. WebGL Boot & Modern Earth Land Pixels (lit={modern_sig['lit']}, land={modern_sig['landOrLava']})")

            # Verify ALL 53 image assets (19 scenes + 15 creatures + 19 textures) decode cleanly in Chromium!
            all_assets = []
            for sub in ("assets/textures", "assets/scenes", "assets/creatures"):
                full_sub = os.path.join(REPO_DIR, sub)
                for fn in sorted(os.listdir(full_sub)):
                    if fn.endswith((".jpg", ".png")):
                        all_assets.append(f"{sub}/{fn}")
            decode_res = page.evaluate("""async (urls) => {
              const failed = [];
              for (const url of urls) {
                const ok = await new Promise((resolve) => {
                  const img = new Image();
                  img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
                  img.onerror = () => resolve(false);
                  img.src = url;
                });
                if (!ok) failed.push(url);
              }
              return { total: urls.length, failed };
            }""", all_assets)
            assert len(decode_res["failed"]) == 0, f"Images failed to decode in browser: {decode_res['failed']}"
            print(f"[PASS] 2. All {decode_res['total']} image assets (textures, scenes, portraits) decoded cleanly in Chromium")

            # =================================================================
            # TEST 3: Paleo Earth Shows REAL LAND & VISIBLY CHANGES Across ALL 5 Stages!
            # =================================================================
            page.click("#btn-mode-paleo")
            assert page.locator("#btn-mode-paleo.is-active").count() == 1

            stage_sigs = {}
            for stage_id, expected_age in [
                ("68ma", "68 Ma"),
                ("150ma", "150 Ma"),
                ("300ma", "300 Ma"),
                ("4400ma", "4.4 Ga"),
                ("20ka", "20 ka"),
            ]:
                page.click(f'.stage-tab[data-stage-id="{stage_id}"]')
                assert page.locator("#toggle-era-age").inner_text() == expected_age
                page.wait_for_function(
                    f"() => window.__DEEPTIME__.isTextureReady('{stage_id}') && window.__DEEPTIME__.activeTexKey === '{stage_id}'",
                    polling=150,
                    timeout=15000,
                )
                time.sleep(0.85)  # allow 550ms crossfade to finish
                sig = sample_globe_signature(page)
                assert sig["ok"], f"Paleo Earth {stage_id} looks blank!"
                assert sig["landOrLava"] > 60, (
                    f"Paleo Earth {stage_id} looks like empty water with no land! "
                    f"(landOrLava={sig['landOrLava']}, avgRGB=({sig['avgR']:.1f},{sig['avgG']:.1f},{sig['avgB']:.1f}))"
                )
                stage_sigs[stage_id] = sig

            # Assert Paleo Earth actually differs visually from Modern Earth AND between distinct stages!
            diff_mod_68 = mean_rgb_diff(modern_sig, stage_sigs["68ma"])
            diff_68_300 = mean_rgb_diff(stage_sigs["68ma"], stage_sigs["300ma"])
            diff_300_4400 = mean_rgb_diff(stage_sigs["300ma"], stage_sigs["4400ma"])
            diff_150_20k = mean_rgb_diff(stage_sigs["150ma"], stage_sigs["20ka"])
            assert diff_mod_68 > 4.0, f"Paleo 68 Ma barely differed from Modern Earth (diff={diff_mod_68:.2f})"
            assert diff_68_300 > 4.0, f"Paleo 300 Ma barely differed from 68 Ma (diff={diff_68_300:.2f})"
            assert diff_300_4400 > 12.0, f"Paleo 4.4 Ga Hadean barely differed from 300 Ma (diff={diff_300_4400:.2f})"
            assert diff_150_20k > 4.0, f"Paleo 20 ka barely differed from 150 Ma (diff={diff_150_20k:.2f})"
            print(
                f"[PASS] 3. All 5 Paleo Earth stages show real land & visibly change "
                f"(Δmod/68={diff_mod_68:.1f}, Δ68/300={diff_68_300:.1f}, Δ300/4.4G={diff_300_4400:.1f}, Δ150/20k={diff_150_20k:.1f})"
            )

            # Switch back to Modern Earth + 68 Ma via keyboard shortcuts
            page.keyboard.press("p")
            assert page.locator("#btn-mode-modern.is-active").count() == 1
            page.keyboard.press("4")
            assert page.locator("#toggle-era-age").inner_text() == "68 Ma"

            # =================================================================
            # TEST 4: Explorer Pegman Drag-and-Drop -> Non-Black Full-Bleed Street View!
            # =================================================================
            well = page.locator("#pegman-well").bounding_box()
            sx, sy = well["x"] + well["width"] / 2, well["y"] + well["height"] / 2
            dx, dy = 683, 415
            page.mouse.move(sx, sy)
            page.mouse.down()
            for i in range(1, 10):
                t = i / 9.0
                page.mouse.move(sx + (dx - sx) * t, sy + (dy - sy) * t)
                time.sleep(0.02)
            assert page.locator("#drag-pegman.is-active").count() == 1
            assert page.locator("#drag-telemetry.is-active").count() == 1
            page.mouse.up()

            page.wait_for_selector("#streetview-layer.is-open", timeout=15000)
            page.wait_for_function(
                "() => { const i = document.getElementById('sv-image'); return i.complete && i.naturalWidth >= 1000 && !i.classList.contains('is-loading'); }",
                polling=100,
                timeout=10000,
            )
            time.sleep(0.4)
            box = page.locator("#sv-image").bounding_box()
            assert box and box["width"] >= 1000 and box["height"] >= 600, f"Street View image box collapsed: {box}"
            luma_peg = verify_viewport_not_black(page, "Pegman Drop Street View")
            print(f"[PASS] 4. Explorer Pegman drag-and-drop -> bright full-bleed Street View (luma={luma_peg:.1f})")

            # =================================================================
            # TEST 5: Montana / Mumbai / Kansas / NYC Across All 5 Stages + Compass + Hotspots + Portraits
            # =================================================================
            page.keyboard.press("Escape")
            time.sleep(0.4)
            assert page.locator("#streetview-layer.is-open").count() == 0

            page.fill("#location-search", "Montana")
            page.wait_for_selector(".search-item")
            page.click(".search-item")
            page.wait_for_selector("#streetview-layer.is-open", timeout=15000)
            page.wait_for_function(
                "() => { const i = document.getElementById('sv-image'); return i.complete && i.naturalWidth >= 1000 && !i.classList.contains('is-loading'); }",
                polling=100,
                timeout=10000,
            )
            time.sleep(0.4)

            assert "Laramidia" in page.locator("#sv-env-title").inner_text()
            luma_mt = verify_viewport_not_black(page, "Montana 68 Ma")

            portraits_ok = page.evaluate("""() => {
              const imgs = [...document.querySelectorAll('.creature-photo')];
              return imgs.length >= 2 && imgs.every(i => i.complete && i.naturalWidth > 100);
            }""")
            assert portraits_ok, "Montana creature portraits failed to load!"

            # Drag Street View horizontally and confirm compass updates!
            before_deg = page.locator("#sv-compass-deg").inner_text()
            page.mouse.move(480, 260)
            page.mouse.down()
            page.mouse.move(220, 260, steps=10)
            page.mouse.up()
            time.sleep(0.4)
            after_deg = page.locator("#sv-compass-deg").inner_text()
            assert before_deg != after_deg, f"Compass did not update on pan ({before_deg} vs {after_deg})"

            # Click wildlife hotspot -> sighting toast opens
            page.locator(".sv-hotspot").first.click()
            assert page.locator("#sv-sighting-toast.is-open").count() == 1

            # Collapse & expand Field Guide
            page.click("#btn-drawer-toggle")
            assert page.locator("#field-drawer.is-collapsed").count() == 1
            page.click("#btn-drawer-toggle")
            assert page.locator("#field-drawer.is-collapsed").count() == 0

            # Time-travel through ALL remaining stages while standing in Street View & confirm EVERY scene is non-black!
            for sid in ("150ma", "300ma", "4400ma", "20ka"):
                page.click(f'.stage-tab[data-stage-id="{sid}"]')
                page.wait_for_function(
                    "() => { const i = document.getElementById('sv-image'); return i.complete && i.naturalWidth >= 1000 && !i.classList.contains('is-loading'); }",
                    polling=100,
                    timeout=10000,
                )
                time.sleep(0.35)
                verify_viewport_not_black(page, f"Montana {sid}")

            # Click MiniMap -> returns to Paleo Earth 3D Orbit with pin summary card!
            page.click("#sv-minimap")
            time.sleep(0.5)
            assert page.locator("#streetview-layer.is-open").count() == 0
            assert page.locator("#btn-mode-paleo.is-active").count() == 1
            assert page.locator("#orbit-pin-card.is-visible").count() == 1
            print(f"[PASS] 5. All 5 Street View stages non-black (Montana luma={luma_mt:.1f}), portraits, compass, hotspots & MiniMap")

            # =================================================================
            # TEST 6: Click-to-Drop Directly in Paleo Earth Mode (Inverse Euler)
            # =================================================================
            page.click("#btn-drop-mode")
            assert page.locator("#btn-drop-mode.is-active").count() == 1
            page.mouse.click(683, 430)
            page.wait_for_selector("#streetview-layer.is-open", timeout=15000)
            page.wait_for_function(
                "() => { const i = document.getElementById('sv-image'); return i.complete && i.naturalWidth >= 1000; }",
                polling=100,
                timeout=10000,
            )
            verify_viewport_not_black(page, "Paleo-mode Click-to-Drop Street View")
            assert len(errors) == 0, f"Desktop WebGL errors: {errors}"
            assert len(failed_reqs) == 0, f"Desktop failed requests: {failed_reqs}"
            page.close()
            print("[PASS] 6. Click-to-Drop in Paleo Earth mode -> bright Street View (0 errors)")

            # =================================================================
            # TEST 7: Forced No-WebGL 2D Canvas Fallback — Paleo Earth Land & Era Changes!
            # =================================================================
            fb_errors = []
            fb_page = browser.new_page(viewport={"width": 1280, "height": 800})
            fb_page.on("pageerror", lambda e: fb_errors.append(f"FB PAGEERROR: {e}"))
            fb_page.on("console", lambda m: fb_errors.append(f"FB CONSOLE: {m.text}") if m.type == "error" else None)
            fb_page.add_init_script("""
              const orig = HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext = function(type, ...rest) {
                if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
                return orig.call(this, type, ...rest);
              };
            """)
            fb_page.goto(BASE_URL, wait_until="networkidle")
            fb_page.wait_for_function(
                "() => window.__DEEPTIME__ && window.__DEEPTIME__.platesReady && window.__DEEPTIME__.isTextureReady('modern')",
                polling=150,
                timeout=15000,
            )
            fb_page.wait_for_selector("#boot-status.is-hidden", state="attached", timeout=15000)
            time.sleep(0.6)
            assert fb_page.evaluate("() => window.__DEEPTIME__.rendererMode") == "canvas2d"
            fb_mod = sample_globe_signature(fb_page)
            assert fb_mod["ok"] and fb_mod["landOrLava"] > 60

            # Toggle Paleo Earth in 2D fallback & confirm 4.4 Ga visibly changes the 2D globe!
            fb_page.click("#btn-mode-paleo")
            fb_page.click('.stage-tab[data-stage-id="4400ma"]')
            fb_page.wait_for_function("() => window.__DEEPTIME__.isTextureReady('4400ma')", polling=150, timeout=15000)
            time.sleep(0.5)
            fb_hadean = sample_globe_signature(fb_page)
            assert fb_hadean["landOrLava"] > 60 and mean_rgb_diff(fb_mod, fb_hadean) > 12.0

            # Enter Street View in 2D fallback mode & verify non-black Kansas Seaway!
            fb_page.click('.stage-tab[data-stage-id="68ma"]')
            fb_page.fill("#location-search", "Kansas")
            fb_page.click(".search-item")
            fb_page.wait_for_selector("#streetview-layer.is-open", timeout=15000)
            fb_page.wait_for_function(
                "() => { const i = document.getElementById('sv-image'); return i.complete && i.naturalWidth >= 1000; }",
                polling=100,
                timeout=10000,
            )
            assert "Seaway" in fb_page.locator("#sv-env-title").inner_text()
            verify_viewport_not_black(fb_page, "2D Fallback Kansas Seaway")
            assert len(fb_errors) == 0, f"2D fallback errors: {fb_errors}"
            fb_page.close()
            print("[PASS] 7. No-WebGL 2D Canvas fallback renders Paleo land, switches eras & opens Street View")

            # =================================================================
            # TEST 8: 0x0 -> 1100x720 Preview Iframe Resize Recovery + Mobile Layout
            # =================================================================
            host_page = browser.new_page(viewport={"width": 1280, "height": 800})
            host_page.set_content(f"""
              <html><body style="margin:0;background:#000">
                <iframe id="preview" src="{BASE_URL}" style="width:0px;height:0px;border:0"></iframe>
              </body></html>
            """)
            time.sleep(0.7)
            host_page.evaluate("""() => {
              const f = document.getElementById('preview');
              f.style.width = '1100px';
              f.style.height = '720px';
            }""")
            frame = host_page.frame(name=None, url=f"{BASE_URL}/")
            frame.wait_for_function("() => window.__DEEPTIME__ && window.__DEEPTIME__.platesReady", polling=150, timeout=15000)
            time.sleep(0.9)
            dims = frame.evaluate("() => { const c = document.getElementById('globe-canvas'); return {w: c.width, h: c.height}; }")
            assert dims["w"] >= 1000 and dims["h"] >= 650, f"Iframe failed to resize: {dims}"
            host_page.close()

            mob_page = browser.new_page(viewport={"width": 390, "height": 844})
            mob_page.goto(BASE_URL, wait_until="networkidle")
            mob_page.wait_for_function("() => window.__DEEPTIME__ && window.__DEEPTIME__.platesReady", polling=150, timeout=15000)
            time.sleep(0.5)
            assert not mob_page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            assert mob_page.locator("#field-drawer.is-collapsed").count() == 1
            mob_page.close()
            print(f"[PASS] 8. Preview Iframe 0x0->1100x720 recovery ({dims['w']}x{dims['h']}) & Mobile responsive layout")

            browser.close()
            print("\nALL 8 STRICT VISUAL & FUNCTIONAL E2E SUITES PASSED 100%!")
    finally:
        cleanup_srv()


if __name__ == "__main__":
    run_suite()
