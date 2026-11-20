/**
 * DeepTime Earth — Interactive Photorealistic Ground-Level "Street View" Controller
 * Features smooth drag-to-look panning, vertical tilt, telephoto zoom, live compass heading,
 * real-time atmospheric particle physics (embers, underwater caustics, snow, spores),
 * and image-locked interactive wildlife & geological sighting markers.
 */

export class StreetViewController {
  constructor(rootEl, opts = {}) {
    this.root = rootEl;
    this.stageEl = rootEl.querySelector("#sv-stage");
    this.imgEl = rootEl.querySelector("#sv-image");
    this.fxCanvas = rootEl.querySelector("#sv-fx-canvas");
    this.fxCtx = this.fxCanvas.getContext("2d");
    this.hotspotsEl = rootEl.querySelector("#sv-hotspots");
    this.compassTrack = rootEl.querySelector("#sv-compass-track");
    this.compassDegEl = rootEl.querySelector("#sv-compass-deg");
    this.onHotspotSelect = opts.onHotspotSelect || (() => {});

    // Camera pan/tilt/zoom state
    this.panX = 0;       // normalized -1..+1 across horizontal pan range
    this.panY = 0;       // normalized -1..+1 across vertical tilt range
    this.targetPanX = 0;
    this.targetPanY = 0;
    this.zoom = 1.18;
    this.targetZoom = 1.18;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.velX = 0;
    this.velY = 0;
    this.idlePhase = 0;

    // Scene & particle state
    this.active = false;
    this.particleMode = "forest";
    this.particles = [];
    this.hotspots = [];
    this.activeHotspotIdx = -1;
    this.rafId = null;
    this.lastTs = 0;
    this.imgAspect = 16 / 9;

    this._bindEvents();
  }

  _bindEvents() {
    const el = this.stageEl;

    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".sv-hotspot")) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.velX = 0;
      this.velY = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
    });

    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      const scaleX = 2.6 / Math.max(400, this.stageEl.clientWidth);
      const scaleY = 2.4 / Math.max(300, this.stageEl.clientHeight);
      this.targetPanX = clamp(this.targetPanX - dx * scaleX, -1, 1);
      this.targetPanY = clamp(this.targetPanY - dy * scaleY, -1, 1);
      this.velX = -dx * scaleX * 0.45;
      this.velY = -dy * scaleY * 0.45;
    });

    const endDrag = () => {
      this.dragging = false;
      el.classList.remove("is-dragging");
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    el.addEventListener(
      "wheel",
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.targetZoom = clamp(this.targetZoom - e.deltaY * 0.0008, 1.08, 1.72);
      },
      { passive: false }
    );
  }

  loadScene(siteData) {
    this.particleMode = siteData.particleMode || "forest";
    this.hotspots = siteData.hotspots || [];
    this.activeHotspotIdx = -1;
    this._loadToken = (this._loadToken || 0) + 1;
    const token = this._loadToken;

    // Gentle reset to center view with smooth cross-fade
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
    this.zoom = 1.22;
    this.targetZoom = 1.18;
    this.velX = 0;
    this.velY = 0;

    this._buildHotspots();
    this._initParticles();
    this._updateTransform();

    if (!this._ro && typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        if (this.active) this.resize();
      });
      this._ro.observe(this.stageEl);
    }

    const nextSrc = siteData.scene;
    const tryLoadScene = (attempt) => {
      if (token !== this._loadToken) return;
      const pre = new Image();
      this._inflightPre = pre;
      pre.onload = () => {
        if (token !== this._loadToken) return;
        this.imgAspect = pre.naturalWidth / Math.max(1, pre.naturalHeight);
        this.imgEl.src = pre.src;
        this.imgEl.classList.remove("is-loading");
        this._updateTransform();
      };
      pre.onerror = () => {
        if (token !== this._loadToken) return;
        if (attempt < 3) {
          setTimeout(() => tryLoadScene(attempt + 1), 350 * (attempt + 1));
        } else {
          console.warn(`Street View scene failed to load: ${nextSrc}`);
          this.imgEl.classList.remove("is-loading");
        }
      };
      pre.src = attempt > 0 ? `${nextSrc}?r=${attempt}` : nextSrc;
    };

    // Only dim slightly if switching to a brand-new URL
    if (!this.imgEl.src || !this.imgEl.src.endsWith(nextSrc)) {
      this.imgEl.classList.add("is-loading");
    }
    tryLoadScene(0);
  }

  _buildHotspots() {
    this.hotspotsEl.innerHTML = "";
    this.hotspots.forEach((h, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-hotspot";
      btn.style.left = `${h.x}%`;
      btn.style.top = `${h.y}%`;
      btn.setAttribute("aria-label", h.title);
      btn.innerHTML = `
        <span class="sv-hotspot-pulse"></span>
        <span class="sv-hotspot-dot"></span>
        <span class="sv-hotspot-label">${escapeHtml(h.title)}</span>
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectHotspot(idx);
      });
      this.hotspotsEl.appendChild(btn);
    });
  }

  selectHotspot(idx) {
    this.activeHotspotIdx = idx;
    const btns = this.hotspotsEl.querySelectorAll(".sv-hotspot");
    btns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
    const hs = this.hotspots[idx];
    if (hs) {
      // Gently pan toward clicked sighting
      this.targetPanX = clamp((hs.x / 100 - 0.5) * 1.4, -1, 1);
      this.targetPanY = clamp((hs.y / 100 - 0.5) * 1.1, -1, 1);
      this.onHotspotSelect(hs);
    }
  }

  start() {
    this.active = true;
    this.resize();
    if (this.rafId) return;
    this.lastTs = performance.now();
    const tick = (ts) => {
      if (!this.active) {
        this.rafId = null;
        return;
      }
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this._step(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resize() {
    const w = this.stageEl.clientWidth || window.innerWidth;
    const h = this.stageEl.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.fxCanvas.width = Math.round(w * dpr);
    this.fxCanvas.height = Math.round(h * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._updateTransform();
  }

  _step(dt) {
    this.idlePhase += dt;
    if (!this.dragging) {
      this.targetPanX = clamp(this.targetPanX + this.velX, -1, 1);
      this.targetPanY = clamp(this.targetPanY + this.velY, -1, 1);
      this.velX *= 0.88;
      this.velY *= 0.88;
    }

    const k = Math.min(1, dt * 8.0);
    this.panX += (this.targetPanX - this.panX) * k;
    this.panY += (this.targetPanY - this.panY) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;

    this._updateTransform();
    this._updateCompass();
    this._renderAtmosphere(dt);
  }

  _updateTransform() {
    const vw = this.width || this.stageEl.clientWidth || window.innerWidth;
    const vh = this.height || this.stageEl.clientHeight || window.innerHeight;
    const viewAspect = vw / Math.max(1, vh);

    // Ensure panorama always fills viewport plus generous pan headroom
    let imgW, imgH;
    if (viewAspect > this.imgAspect) {
      imgW = vw * this.zoom * 1.16;
      imgH = imgW / this.imgAspect;
    } else {
      imgH = vh * this.zoom * 1.12;
      imgW = imgH * this.imgAspect;
    }

    const maxShiftX = Math.max(0, (imgW - vw) * 0.5);
    const maxShiftY = Math.max(0, (imgH - vh) * 0.5);

    const tx = -this.panX * maxShiftX;
    const ty = -this.panY * maxShiftY;

    const wrap = this.root.querySelector("#sv-pano-wrap");
    if (wrap) {
      wrap.style.width = `${imgW}px`;
      wrap.style.height = `${imgH}px`;
      wrap.style.transform = `translate3d(${(vw - imgW) * 0.5 + tx}px, ${(vh - imgH) * 0.5 + ty}px, 0)`;
    }
  }

  _updateCompass() {
    // Map panX (-1..+1) onto heading (-65°..+65° around East/Northeast viewing azimuth)
    const heading = (Math.round(90 + this.panX * 68) + 360) % 360;
    if (this.compassDegEl) {
      const card =
        heading < 23 || heading >= 338 ? "N" :
        heading < 68 ? "NE" :
        heading < 113 ? "E" :
        heading < 158 ? "SE" :
        heading < 203 ? "S" :
        heading < 248 ? "SW" :
        heading < 293 ? "W" : "NW";
      this.compassDegEl.textContent = `${String(heading).padStart(3, "0")}° ${card}`;
    }
    if (this.compassTrack) {
      this.compassTrack.style.transform = `translateX(${-this.panX * 72}px)`;
    }
  }

  // ===========================================================================
  // Real-Time Atmospheric Particle & Lighting Effects
  // ===========================================================================

  _initParticles() {
    const mode = this.particleMode;
    const count =
      mode === "snow" ? 130 :
      mode === "magma" ? 85 :
      mode === "underwater" ? 75 : 55;
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        z: 0.35 + Math.random() * 0.85,
        vx: (Math.random() - 0.5) * 0.04,
        vy: (Math.random() - 0.5) * 0.04,
        phase: Math.random() * Math.PI * 2,
        size: 0.8 + Math.random() * 2.4
      });
    }
  }

  _renderAtmosphere(dt) {
    const ctx = this.fxCtx;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    const mode = this.particleMode;
    const t = this.idlePhase;

    // Special underwater volumetric solar caustic rays!
    if (mode === "underwater") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 6; i++) {
        const bx = w * (0.12 + i * 0.16) + Math.sin(t * 0.45 + i * 1.4) * 45 - this.panX * 40;
        const grad = ctx.createLinearGradient(bx, 0, bx + 90, h * 0.85);
        const a = 0.055 + 0.03 * Math.sin(t * 0.9 + i * 2.1);
        grad.addColorStop(0, `rgba(140, 232, 245, ${a})`);
        grad.addColorStop(1, "rgba(60, 170, 200, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx - 28, 0);
        ctx.lineTo(bx + 32, 0);
        ctx.lineTo(bx + 150, h * 0.9);
        ctx.lineTo(bx - 10, h * 0.9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Subtle volcanic heat glow pulse at bottom edge in Hadean / Deccan
    if (mode === "magma") {
      const pulse = 0.07 + 0.03 * Math.sin(t * 2.2);
      const grad = ctx.createLinearGradient(0, h, 0, h * 0.55);
      grad.addColorStop(0, `rgba(255, 108, 28, ${pulse})`);
      grad.addColorStop(1, "rgba(255, 90, 20, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }

    // Update & render atmospheric particles
    for (const p of this.particles) {
      if (mode === "magma") {
        p.y -= dt * (0.045 + p.z * 0.07);
        p.x += dt * (0.018 + Math.sin(t * 1.8 + p.phase) * 0.025);
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        if (p.x > 1.05) p.x = -0.05;
        const glow = 0.45 + 0.55 * Math.sin(t * 5 + p.phase);
        const px = p.x * w, py = p.y * h;
        ctx.beginPath();
        ctx.arc(px, py, p.size * p.z * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${Math.round(130 + glow * 95)}, 45, ${0.42 + glow * 0.45})`;
        ctx.fill();
      } else if (mode === "snow") {
        p.y += dt * (0.08 + p.z * 0.14);
        p.x += dt * (0.09 + p.z * 0.08 + Math.sin(t * 1.5 + p.phase) * 0.02);
        if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
        if (p.x > 1.05) p.x = -0.05;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.size * p.z * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(235, 244, 255, ${0.25 + p.z * 0.48})`;
        ctx.fill();
      } else if (mode === "underwater") {
        p.y -= dt * (0.015 + p.z * 0.03);
        p.x += dt * Math.sin(t * 1.2 + p.phase) * 0.012;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const px = p.x * w, py = p.y * h;
        ctx.beginPath();
        ctx.arc(px, py, p.size * p.z * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(185, 240, 250, ${0.18 + p.z * 0.25})`;
        ctx.fill();
      } else {
        // Swamp spores / forest pollen / savanna sunlit dust motes
        p.x += dt * (0.010 + p.vx * 0.35 + Math.sin(t * 0.7 + p.phase) * 0.008);
        p.y += dt * (p.vy * 0.25 + Math.cos(t * 0.6 + p.phase) * 0.006);
        if (p.x > 1.05) p.x = -0.05;
        if (p.x < -0.05) p.x = 1.05;
        if (p.y > 1.05) p.y = -0.05;
        if (p.y < -0.05) p.y = 1.05;
        const alpha = (0.14 + 0.18 * Math.sin(t * 1.4 + p.phase)) * p.z;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.size * p.z * 0.78, 0, Math.PI * 2);
        ctx.fillStyle =
          mode === "swamp"
            ? `rgba(220, 240, 175, ${alpha})`
            : mode === "badlands" || mode === "savanna"
            ? `rgba(246, 212, 152, ${alpha})`
            : `rgba(255, 244, 214, ${alpha})`;
        ctx.fill();
      }
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
