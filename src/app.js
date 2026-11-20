/**
 * DeepTime Earth — Main Application Controller
 * Connects the 3D WebGL Earth globe, Google-Maps-style draggable Explorer Pegman,
 * 5-Stage Geological Timeline, Modern/Paleo Earth Toggle, Search, and 360° Prehistoric Street View.
 */
import { STAGES, STAGE_BY_ID, MODERN_PLACES } from "./paleoData.js";
import { TectonicEngine, formatCoords, formatLatOnly, getCreatureById } from "./tectonics.js";
import { GlobeRenderer } from "./globeRenderer.js";
import { StreetViewController } from "./streetView.js";

// =============================================================================
// Application State
// =============================================================================

const state = {
  stageId: "68ma",         // Default to iconic Late Cretaceous (Dinosaur Era II)
  earthMode: "modern",     // 'modern' | 'paleo'
  inStreetView: false,
  dropMode: false,         // Click-anywhere-to-drop convenience mode
  drawerOpen: true,
  selectedModern: null,    // { lat, lon }
  currentSite: null        // Full reconstructed paleo-environment object
};

const tectonics = new TectonicEngine();
let globe = null;
let streetView = null;
const minimapImages = {};

// DOM Elements
const $ = (sel) => document.querySelector(sel);

const els = {
  globeViewport: $("#globe-viewport"),
  globeCanvas: $("#globe-canvas"),
  globeOverlay: $("#globe-overlay"),
  orbitHud: $("#orbit-hud"),
  btnModeModern: $("#btn-mode-modern"),
  btnModePaleo: $("#btn-mode-paleo"),
  toggleEraAge: $("#toggle-era-age"),
  orbitEraCaption: $("#orbit-era-caption"),
  orbitPinCard: $("#orbit-pin-card"),
  pinCardPlace: $("#pin-card-place"),
  pinCardSub: $("#pin-card-sub"),
  pinCardCoords: $("#pin-card-coords"),
  pinCardKm: $("#pin-card-km"),
  btnReenterView: $("#btn-reenter-view"),
  btnReenterLabel: $("#btn-reenter-label"),
  searchInput: $("#location-search"),
  searchResults: $("#search-results"),
  pegmanWell: $("#pegman-well"),
  pegmanHint: $("#pegman-hint"),
  dragPegman: $("#drag-pegman"),
  dragTelemetry: $("#drag-telemetry"),
  dtModern: $("#dt-modern"),
  dtCoords: $("#dt-coords"),
  dtPaleo: $("#dt-paleo"),
  btnDropMode: $("#btn-drop-mode"),
  btnZoomIn: $("#btn-zoom-in"),
  btnZoomOut: $("#btn-zoom-out"),
  btnResetGlobe: $("#btn-reset-globe"),
  timelineDock: $("#timeline-dock"),
  diveVeil: $("#dive-veil"),
  svLayer: $("#streetview-layer"),
  btnBackOrbit: $("#btn-back-orbit"),
  svEnvTitle: $("#sv-env-title"),
  svEraBadge: $("#sv-era-badge"),
  svModernPlace: $("#sv-modern-place"),
  svPaleoCoords: $("#sv-paleo-coords"),
  svDriftBadge: $("#sv-drift-badge"),
  btnDrawerToggle: $("#btn-drawer-toggle"),
  drawerToggleLabel: $("#drawer-toggle-label"),
  fieldDrawer: $("#field-drawer"),
  drawerScroll: $("#drawer-scroll"),
  svToast: $("#sv-sighting-toast"),
  toastTitle: $("#toast-title"),
  toastBody: $("#toast-body"),
  toastClose: $("#toast-close"),
  svMinimap: $("#sv-minimap"),
  minimapCanvas: $("#sv-minimap-canvas"),
  minimapEraLabel: $("#minimap-era-label"),
  bootStatus: $("#boot-status"),
  bootStatusText: $("#boot-status-text")
};

// =============================================================================
// Initialization
// =============================================================================

async function init() {
  buildTimeline();

  let earthReady = false;
  let platesReady = false;
  const maybeHideBoot = () => {
    if (earthReady && platesReady && els.bootStatus) {
      els.bootStatus.classList.add("is-hidden");
    }
  };

  globe = new GlobeRenderer(els.globeCanvas, els.globeOverlay, {
    onReady: () => {
      earthReady = true;
      maybeHideBoot();
    }
  });
  globe.setViewConfig(state.earthMode, state.stageId);
  globe.start();

  streetView = new StreetViewController(els.svLayer, {
    onHotspotSelect: handleHotspotSelect
  });

  bindGlobeInteractions();
  bindPegmanDrag();
  bindControls();
  bindSearch();
  bindKeyboard();

  window.addEventListener("resize", () => {
    globe.resize();
    if (state.inStreetView) streetView.resize();
  });

  // Expose read-only diagnostics for automated E2E tests
  window.__DEEPTIME__ = {
    get state() { return { ...state }; },
    get rendererMode() { return globe?.fallback2d ? "canvas2d" : "webgl"; },
    get activeTexKey() { return globe?.activeTexKey; },
    get platesReady() { return tectonics.ready; },
    isTextureReady(key) { return globe ? globe.isTextureReady(key) : false; }
  };

  // Load real Natural Earth plate polygons & Euler rotation matrices
  await tectonics.load("data/plates_data.json");
  platesReady = true;
  updateOrbitHeader();
  maybeHideBoot();

  // Safety fallback: dismiss spinner once plates are loaded even if texture callback races
  setTimeout(() => {
    if (platesReady && els.bootStatus && !els.bootStatus.classList.contains("is-error")) {
      els.bootStatus.classList.add("is-hidden");
    }
  }, 1500);

  // Start drawer collapsed on narrow mobile screens so imagery shines
  if (window.innerWidth < 820) {
    setDrawerOpen(false);
  }
}

function getMinimapImage(stageId) {
  if (!minimapImages[stageId]) {
    const st = STAGE_BY_ID[stageId];
    if (!st) return null;
    const img = new Image();
    img.src = st.globe.albedo;
    minimapImages[stageId] = img;
  }
  return minimapImages[stageId];
}

// =============================================================================
// 5-Stage Geological Timeline
// =============================================================================

function buildTimeline() {
  els.timelineDock.innerHTML = "";
  for (const stage of STAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `stage-tab${stage.id === state.stageId ? " is-active" : ""}`;
    btn.dataset.stageId = stage.id;
    btn.setAttribute("aria-pressed", stage.id === state.stageId ? "true" : "false");
    btn.innerHTML = `
      <div class="stage-tab-top">
        <span class="stage-age">${stage.shortAge}</span>
        ${stage.hasDinosaurs ? `<span class="stage-dino-tag">Dinosaurs</span>` : ""}
      </div>
      <div class="stage-name">${stage.name}</div>
      <div class="stage-sub">${stage.subtitle}</div>
    `;
    btn.addEventListener("click", () => selectStage(stage.id));
    els.timelineDock.appendChild(btn);
  }
}

function selectStage(stageId) {
  if (!STAGE_BY_ID[stageId]) return;
  state.stageId = stageId;

  els.timelineDock.querySelectorAll(".stage-tab").forEach((el) => {
    const active = el.dataset.stageId === stageId;
    el.classList.toggle("is-active", active);
    el.setAttribute("aria-pressed", active ? "true" : "false");
  });

  globe.setViewConfig(state.earthMode, state.stageId);
  updateOrbitHeader();

  if (state.selectedModern && tectonics.ready) {
    recomputeSelectedSite();
    preloadSiteAssets(state.currentSite);
    if (state.inStreetView) {
      renderStreetView(state.currentSite);
    } else if (state.earthMode === "paleo" && !globe.diving) {
      globe.focusOn(state.currentSite.paleoLat, state.currentSite.paleoLon, Math.max(globe.targetDist, 2.75));
    }
  }
}

function setEarthMode(mode) {
  state.earthMode = mode;
  const isPaleo = mode === "paleo";

  els.btnModeModern.classList.toggle("is-active", !isPaleo);
  els.btnModeModern.setAttribute("aria-pressed", String(!isPaleo));
  els.btnModePaleo.classList.toggle("is-active", isPaleo);
  els.btnModePaleo.setAttribute("aria-pressed", String(isPaleo));

  globe.setViewConfig(state.earthMode, state.stageId);
  updateOrbitHeader();

  // Gently pan the globe toward the reconstructed paleo-position if a pin exists!
  if (state.currentSite) {
    if (isPaleo) {
      globe.focusOn(state.currentSite.paleoLat, state.currentSite.paleoLon, Math.max(globe.targetDist, 2.75));
    } else {
      globe.focusOn(state.currentSite.modernLat, state.currentSite.modernLon, Math.max(globe.targetDist, 2.75));
    }
  }
}

function updateOrbitHeader() {
  const st = STAGE_BY_ID[state.stageId];
  els.toggleEraAge.textContent = st.shortAge;
  if (state.earthMode === "paleo") {
    els.orbitEraCaption.textContent = `${st.name} (${st.fullAge}) · ${st.atmosphere.skyNote}`;
  } else {
    els.orbitEraCaption.textContent = `Target Era: ${st.name} (${st.shortAge}) · Drag Explorer anywhere on Earth or toggle Paleo Earth`;
  }
}

// =============================================================================
// Globe Orbital Drag, Zoom & Click-to-Drop Interactions
// =============================================================================

function bindGlobeInteractions() {
  let pointerDown = false;
  let moved = false;
  let startX = 0, startY = 0, lastX = 0, lastY = 0;

  els.globeViewport.addEventListener("pointerdown", (e) => {
    if (state.inStreetView || e.button !== 0) return;
    pointerDown = true;
    moved = false;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    globe.userInteracting = true;
    els.globeViewport.classList.add("is-dragging-globe");
    els.globeViewport.setPointerCapture(e.pointerId);
    closeSearchDropdown();
  });

  els.globeViewport.addEventListener("pointermove", (e) => {
    if (pointerDown) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
        moved = true;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      globe.rotateByDelta(dx, dy);
    } else if (state.dropMode && !state.inStreetView) {
      const hit = globe.screenToLatLon(e.clientX, e.clientY);
      globe.setHover(hit);
    }
  });

  const endOrbitDrag = (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    globe.userInteracting = false;
    els.globeViewport.classList.remove("is-dragging-globe");

    // If user clicked cleanly in Drop Mode, drop Explorer right on that spot!
    if (!moved && state.dropMode && e.clientX !== undefined) {
      const hit = globe.screenToLatLon(e.clientX, e.clientY);
      if (hit) {
        setDropMode(false);
        dropExplorerAtGlobePoint(hit.lat, hit.lon);
      }
    }
  };

  els.globeViewport.addEventListener("pointerup", endOrbitDrag);
  els.globeViewport.addEventListener("pointercancel", endOrbitDrag);

  // Double-click anywhere on Earth is also a super intuitive Google-Earth shortcut to drop in!
  els.globeViewport.addEventListener("dblclick", (e) => {
    if (state.inStreetView) return;
    const hit = globe.screenToLatLon(e.clientX, e.clientY);
    if (hit) {
      dropExplorerAtGlobePoint(hit.lat, hit.lon);
    }
  });

  els.globeViewport.addEventListener(
    "wheel",
    (e) => {
      if (state.inStreetView) return;
      e.preventDefault();
      globe.zoomByDelta(e.deltaY);
    },
    { passive: false }
  );
}

// =============================================================================
// Tactile Google-Maps-Style Explorer Pegman Drag-and-Drop
// =============================================================================

function bindPegmanDrag() {
  let dragging = false;
  let prevX = 0;
  let tilt = 0;
  let currentHit = null;

  const updateDragVisuals = (clientX, clientY) => {
    const dx = clientX - prevX;
    prevX = clientX;
    // Spring-damped dangling sway tilt (just like Google Maps Pegman!)
    const targetTilt = clamp(-dx * 2.1, -34, 34);
    tilt = tilt * 0.72 + targetTilt * 0.28;

    els.dragPegman.style.transform = `translate3d(${clientX - 17}px, ${clientY - 40}px, 0) rotate(${tilt.toFixed(1)}deg)`;

    const hit = globe.screenToLatLon(clientX, clientY);
    currentHit = hit;
    globe.setHover(hit);

    if (hit && tectonics.ready) {
      const modernCoord = resolveModernFromGlobeHit(hit.lat, hit.lon);
      const preview = tectonics.reconstructSite(modernCoord.lat, modernCoord.lon, state.stageId);
      els.dtModern.textContent = preview.modernLabel;
      els.dtCoords.textContent = `${formatCoords(preview.modernLat, preview.modernLon)} · ${preview.plate.name}`;
      els.dtPaleo.textContent = `${preview.stage.shortAge} → ${formatLatOnly(preview.paleoLat)} · ${preview.environmentTitle}`;

      // Keep floating telemetry box cleanly inside viewport bounds
      const boxW = 272;
      const ox = clientX + 24 + boxW > window.innerWidth ? clientX - boxW - 20 : clientX + 24;
      const oy = clamp(clientY - 46, 14, window.innerHeight - 125);
      els.dragTelemetry.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
      els.dragTelemetry.classList.add("is-active");
    } else {
      els.dragTelemetry.classList.remove("is-active");
    }
  };

  els.pegmanWell.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    prevX = e.clientX;
    tilt = 0;
    currentHit = null;
    els.pegmanWell.classList.add("is-grabbed");
    els.pegmanHint.style.opacity = "0";
    els.dragPegman.classList.add("is-active");
    globe.autoRotate = false;
    els.pegmanWell.setPointerCapture(e.pointerId);
    updateDragVisuals(e.clientX, e.clientY);
  });

  els.pegmanWell.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    updateDragVisuals(e.clientX, e.clientY);
  });

  const finishDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    els.pegmanWell.classList.remove("is-grabbed");
    els.dragPegman.classList.remove("is-active");
    els.dragTelemetry.classList.remove("is-active");
    globe.setHover(null);

    if (currentHit) {
      dropExplorerAtGlobePoint(currentHit.lat, currentHit.lon);
    } else {
      // Quick click on Pegman well without dragging onto globe toggles Click-to-Drop mode!
      const rect = els.pegmanWell.getBoundingClientRect();
      const nearWell = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2)) < 48;
      if (nearWell) {
        setDropMode(!state.dropMode);
      } else {
        els.pegmanHint.style.opacity = "1";
      }
    }
  };

  els.pegmanWell.addEventListener("pointerup", finishDrag);
  els.pegmanWell.addEventListener("pointercancel", finishDrag);
}

function resolveModernFromGlobeHit(lat, lon) {
  if (state.earthMode === "paleo") {
    return tectonics.findModernForPaleo(lat, lon, state.stageId);
  }
  return { lat, lon };
}

function setDropMode(enabled) {
  state.dropMode = enabled;
  els.btnDropMode.classList.toggle("is-active", enabled);
  els.btnDropMode.setAttribute("aria-pressed", String(enabled));
  els.globeViewport.classList.toggle("is-drop-mode", enabled);
  if (!enabled) globe.setHover(null);
  els.pegmanHint.style.opacity = "1";
  els.pegmanHint.innerHTML = enabled
    ? `<strong>Click anywhere</strong> on Earth to drop Explorer`
    : `<strong>Drag Explorer</strong> anywhere on Earth to enter Prehistoric Street View`;
}

// =============================================================================
// Dropping Explorer -> Orbital Dive -> Interactive Prehistoric Street View
// =============================================================================

function dropExplorerAtGlobePoint(globeLat, globeLon) {
  if (!tectonics.ready) return;
  const modern = resolveModernFromGlobeHit(globeLat, globeLon);
  dropExplorerAtModern(modern.lat, modern.lon, globeLat, globeLon);
}

const preloadInflight = new Set();

function preloadSiteAssets(site) {
  if (!site) return;
  const urls = [site.scene];
  for (const cid of site.creatureIds || []) {
    const c = getCreatureById(cid);
    if (c && c.portrait) urls.push(c.portrait);
  }
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    preloadInflight.add(img);
    const done = () => preloadInflight.delete(img);
    img.onload = done;
    img.onerror = done;
    img.src = url;
  }
}

let diveSeq = 0;
let diveOpenTimer = null;
let diveVeilTimer = null;

function cancelPendingDive() {
  diveSeq += 1;
  if (diveOpenTimer) {
    clearTimeout(diveOpenTimer);
    diveOpenTimer = null;
  }
  if (diveVeilTimer) {
    clearTimeout(diveVeilTimer);
    diveVeilTimer = null;
  }
  els.diveVeil.classList.remove("is-active");
  if (globe) globe.cancelDive();
}

function dropExplorerAtModern(modernLat, modernLon, diveLat = null, diveLon = null) {
  if (!tectonics.ready) return;
  cancelPendingDive();
  const seq = diveSeq;

  state.selectedModern = { lat: modernLat, lon: modernLon };
  recomputeSelectedSite();
  // Warm panorama & creature portraits during the ~1s orbital dive so Street View opens instantly
  preloadSiteAssets(state.currentSite);

  const targetLat = diveLat !== null ? diveLat : (state.earthMode === "paleo" ? state.currentSite.paleoLat : modernLat);
  const targetLon = diveLon !== null ? diveLon : (state.earthMode === "paleo" ? state.currentSite.paleoLon : modernLon);

  // Trigger dramatic Google Earth orbital dive into the planet!
  els.orbitHud.classList.add("is-hidden");
  globe.flyToAndDive(targetLat, targetLon, () => {
    if (seq !== diveSeq) return;
    els.diveVeil.classList.add("is-active");
    diveOpenTimer = setTimeout(() => {
      diveOpenTimer = null;
      if (seq !== diveSeq) return;
      // Always recompute against the latest state.stageId (handles mid-dive era switches!)
      recomputeSelectedSite();
      openStreetView(state.currentSite);
      diveVeilTimer = setTimeout(() => {
        diveVeilTimer = null;
        els.diveVeil.classList.remove("is-active");
      }, 180);
    }, 240);
  });
}

function recomputeSelectedSite() {
  if (!state.selectedModern || !tectonics.ready) return;
  const site = tectonics.reconstructSite(state.selectedModern.lat, state.selectedModern.lon, state.stageId);
  state.currentSite = site;

  globe.setPin({
    modernLat: site.modernLat,
    modernLon: site.modernLon,
    paleoLat: site.paleoLat,
    paleoLon: site.paleoLon,
    label: site.modernLabel
  });

  // Update Top-Right Orbit Pin Summary Card & dynamic Enter Prehistoric View button label
  els.orbitPinCard.classList.add("is-visible");
  els.pinCardPlace.textContent = site.modernLabel;
  els.pinCardSub.textContent = `${site.stage.shortAge} · ${site.environmentTitle}`;
  els.pinCardCoords.textContent = `${formatLatOnly(site.modernLat)} → ${formatLatOnly(site.paleoLat)}`;
  els.pinCardKm.textContent = site.driftKm > 40 ? `${site.driftKm.toLocaleString()} km drift` : "Modern position";
  if (els.btnReenterLabel) {
    els.btnReenterLabel.textContent = `Enter ${site.stage.shortAge} Prehistoric View`;
  }
}

function openStreetView(site) {
  state.inStreetView = true;
  globe.stop();
  els.svLayer.classList.add("is-open");
  els.svLayer.setAttribute("aria-hidden", "false");
  streetView.start();
  renderStreetView(site);
}

function returnToOrbit(switchToPaleo = false) {
  cancelPendingDive();
  state.inStreetView = false;
  streetView.stop();
  globe.start();
  els.svLayer.classList.remove("is-open");
  els.svLayer.setAttribute("aria-hidden", "true");
  els.svToast.classList.remove("is-open");
  els.orbitHud.classList.remove("is-hidden");
  els.pegmanHint.style.opacity = "1";

  if (switchToPaleo && state.earthMode !== "paleo") {
    setEarthMode("paleo");
  }
  globe.zoomBackToOrbit();
}

// =============================================================================
// Street View & Field Guide Rendering
// =============================================================================

function renderStreetView(site) {
  els.svEnvTitle.textContent = site.environmentTitle;
  if (els.svEraBadge) {
    els.svEraBadge.textContent = `${site.stage.shortAge} · ${site.stage.name}`;
  }
  els.svModernPlace.textContent = site.modernLabel;
  els.svPaleoCoords.textContent = `${formatCoords(site.modernLat, site.modernLon)} → ${formatCoords(site.paleoLat, site.paleoLon)}`;
  els.svDriftBadge.textContent = site.driftKm > 40 ? `${site.driftKm.toLocaleString()} km continental drift` : "Near modern coordinates";
  els.svToast.classList.remove("is-open");

  streetView.loadScene(site);
  renderFieldDrawer(site);
  renderMiniPaleoMap(site);
}

function renderFieldDrawer(site) {
  const creatures = (site.creatureIds || []).map(getCreatureById).filter(Boolean);
  const st = site.stage;

  const creaturesHtml = creatures.length
    ? `<div class="creature-list">
        ${creatures
          .map((c) => {
            const maxBarM = 24;
            const pct = Math.min(100, Math.max(8, (c.lengthM / maxBarM) * 100));
            const humanPct = (1.75 / maxBarM) * 100;
            const ratio = (c.lengthM / 1.75).toFixed(1);
            return `
            <article class="creature-card" data-creature-id="${c.id}">
              <div class="creature-photo-wrap">
                <img class="creature-photo" src="${c.portrait}" alt="${c.name}" data-retry="0" onerror="const r=Number(this.dataset.retry||0);if(r<2){this.dataset.retry=String(r+1);this.src='${c.portrait}?r='+(r+1);}" />
                <span class="creature-diet-pill">${c.diet}</span>
              </div>
              <div class="creature-body">
                <h3 class="creature-name">${c.name}</h3>
                <div class="creature-clade">${c.clade} &middot; ${c.weightLabel}</div>
                <div class="scale-bar-row">
                  <span>Length: ${c.lengthM} m</span>
                  <span>${ratio}&times; human (1.75 m)</span>
                </div>
                <div class="scale-track" title="Length compared to an average adult human (white mark)">
                  <div class="scale-fill" style="width: ${pct.toFixed(1)}%"></div>
                  <div class="scale-human-mark" style="left: ${humanPct.toFixed(1)}%"></div>
                </div>
                <p class="creature-note">${c.note}</p>
                <div class="creature-formation">Fossil Record: ${c.formation}</div>
              </div>
            </article>`;
          })
          .join("")}
      </div>`
    : "";

  els.drawerScroll.innerHTML = `
    <section>
      <div class="drawer-section-head">
        <span class="drawer-kicker">${st.hasDinosaurs ? "Regional Dinosaurs &amp; Wildlife" : "Prehistoric Life &amp; Ecology"}</span>
        <span class="drawer-region-tag">${st.shortAge}</span>
      </div>
      <p class="fauna-intro"><strong>${site.faunaHeader}.</strong> ${site.faunaNote}</p>
      ${creaturesHtml}
    </section>

    <section class="telemetry-section">
      <div class="drawer-section-head">
        <span class="drawer-kicker">Paleo-Reconstruction Data</span>
        <span class="drawer-region-tag">${site.plate.name}</span>
      </div>
      <div class="telemetry-grid">
        <div class="tel-cell">
          <span class="tel-label">Paleo-Region</span>
          <span class="tel-value">${site.paleoRegion}</span>
        </div>
        <div class="tel-cell">
          <span class="tel-label">Paleo-Coordinates</span>
          <span class="tel-value accent">${formatCoords(site.paleoLat, site.paleoLon)}</span>
        </div>
        <div class="tel-cell">
          <span class="tel-label">Local Climate</span>
          <span class="tel-value">${site.localTempC}</span>
        </div>
        <div class="tel-cell">
          <span class="tel-label">Elevation / Depth</span>
          <span class="tel-value">${site.elevationLabel}</span>
        </div>
        <div class="tel-cell">
          <span class="tel-label">Atmosphere O₂ / CO₂</span>
          <span class="tel-value">${st.atmosphere.o2} &middot; ${st.atmosphere.co2}</span>
        </div>
        <div class="tel-cell">
          <span class="tel-label">Sea Level / Day</span>
          <span class="tel-value">${st.atmosphere.seaLevel} &middot; ${st.atmosphere.dayLength}</span>
        </div>
      </div>
    </section>

    <section class="evidence-block">
      <div class="drawer-section-head">
        <span class="drawer-kicker">Scientific Evidence</span>
        <span class="drawer-region-tag">${st.eraTag}</span>
      </div>
      <p class="evidence-text">${site.evidence}</p>
    </section>
  `;
  els.drawerScroll.scrollTop = 0;
}

function renderMiniPaleoMap(site) {
  const canvas = els.minimapCanvas;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  els.minimapEraLabel.textContent = `Paleo Earth · ${site.stage.shortAge}`;

  const draw = () => {
    if (!state.currentSite || state.currentSite.stage.id !== site.stage.id) return;
    ctx.clearRect(0, 0, w, h);
    const img = getMinimapImage(site.stage.id);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#0a1728";
      ctx.fillRect(0, 0, w, h);
    }

    // Slight dark tint so marker pops cleanly
    ctx.fillStyle = "rgba(4, 8, 14, 0.22)";
    ctx.fillRect(0, 0, w, h);

    const toXY = (lat, lon) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
    const [mx, my] = toXY(site.modernLat, site.modernLon);
    const [px, py] = toXY(site.paleoLat, site.paleoLon);

    // Draw drift line if moved significantly (and doesn't wrap wildly across antimeridian)
    if (site.driftKm > 120 && Math.abs(mx - px) < w * 0.65) {
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(px, py);
      ctx.strokeStyle = "rgba(242, 190, 92, 0.85)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ghost modern dot
      ctx.beginPath();
      ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // Active reconstructed paleo dot
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(242, 190, 92, 0.32)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f2be5c";
    ctx.fill();
    ctx.strokeStyle = "#0b0e14";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };

  const img = getMinimapImage(site.stage.id);
  if (img && !img.complete) {
    img.addEventListener("load", draw, { once: true });
  }
  draw();
}

function handleHotspotSelect(hs) {
  els.toastTitle.textContent = hs.title;
  els.toastBody.textContent = hs.detail;
  els.svToast.classList.add("is-open");

  // If sighting links to a specific dinosaur/creature card, highlight & scroll to it!
  if (hs.creatureId) {
    if (!state.drawerOpen) setDrawerOpen(true);
    els.drawerScroll.querySelectorAll(".creature-card").forEach((card) => {
      const match = card.dataset.creatureId === hs.creatureId;
      card.classList.toggle("is-highlighted", match);
      if (match) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }
}

function setDrawerOpen(open) {
  state.drawerOpen = open;
  els.fieldDrawer.classList.toggle("is-collapsed", !open);
  els.btnDrawerToggle.setAttribute("aria-expanded", String(open));
  els.drawerToggleLabel.textContent = open ? "Hide Field Guide" : "Show Field Guide";
}

// =============================================================================
// Search & Quick Expeditions
// =============================================================================

function bindSearch() {
  const renderList = (query) => {
    const q = query.trim().toLowerCase();
    const list = q
      ? MODERN_PLACES.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q) ||
            (p.tag && p.tag.toLowerCase().includes(q))
        ).slice(0, 10)
      : MODERN_PLACES.filter((p) => p.featured);

    if (!list.length) {
      els.searchResults.innerHTML = `<div class="search-section-label">No matching site — drag Explorer onto any point on Earth!</div>`;
      els.searchResults.classList.add("is-open");
      return;
    }

    els.searchResults.innerHTML = `
      <div class="search-section-label">${q ? "Matching Locations" : "Iconic Time-Travel Drop Sites"}</div>
      ${list
        .map(
          (p) => `
        <button type="button" class="search-item" data-lat="${p.lat}" data-lon="${p.lon}">
          <div class="search-item-main">
            <span class="search-item-name">${p.name}</span>
            <span class="search-item-country">${p.country}</span>
          </div>
          ${p.tag ? `<span class="search-item-tag">${p.tag}</span>` : ""}
        </button>`
        )
        .join("")}
    `;

    els.searchResults.querySelectorAll(".search-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        els.searchInput.value = "";
        closeSearchDropdown();
        dropExplorerAtModern(lat, lon);
      });
    });

    els.searchResults.classList.add("is-open");
  };

  els.searchInput.addEventListener("focus", () => renderList(els.searchInput.value));
  els.searchInput.addEventListener("input", () => renderList(els.searchInput.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) closeSearchDropdown();
  });
}

function closeSearchDropdown() {
  els.searchResults.classList.remove("is-open");
}

// =============================================================================
// Controls & Keyboard Shortcuts
// =============================================================================

function bindControls() {
  els.btnModeModern.addEventListener("click", () => setEarthMode("modern"));
  els.btnModePaleo.addEventListener("click", () => setEarthMode("paleo"));
  els.btnDropMode.addEventListener("click", () => setDropMode(!state.dropMode));
  els.btnZoomIn.addEventListener("click", () => globe.zoomByDelta(-480));
  els.btnZoomOut.addEventListener("click", () => globe.zoomByDelta(480));
  els.btnResetGlobe.addEventListener("click", () => {
    globe.focusOn(22, -34, 3.62);
    globe.autoRotate = true;
  });
  els.btnReenterView.addEventListener("click", () => {
    const coord = state.selectedModern || (state.currentSite ? { lat: state.currentSite.modernLat, lon: state.currentSite.modernLon } : null);
    if (coord) {
      dropExplorerAtModern(coord.lat, coord.lon);
    }
  });
  els.btnBackOrbit.addEventListener("click", () => returnToOrbit(false));
  els.svMinimap.addEventListener("click", () => returnToOrbit(true));
  els.btnDrawerToggle.addEventListener("click", () => setDrawerOpen(!state.drawerOpen));
  els.toastClose.addEventListener("click", () => els.svToast.classList.remove("is-open"));
}

function bindKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (document.activeElement === els.searchInput) return;
    if (e.key === "Escape" && (state.inStreetView || globe.diving || diveOpenTimer)) {
      returnToOrbit(false);
    } else if (e.key >= "1" && e.key <= "5") {
      const idx = parseInt(e.key, 10) - 1;
      if (STAGES[idx]) selectStage(STAGES[idx].id);
    } else if ((e.key === "p" || e.key === "P") && !state.inStreetView) {
      setEarthMode(state.earthMode === "modern" ? "paleo" : "modern");
    }
  });
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

init().catch((err) => {
  console.error("DeepTime Earth initialization error:", err);
  if (els.bootStatus && els.bootStatusText) {
    els.bootStatus.classList.remove("is-hidden");
    els.bootStatus.classList.add("is-error");
    els.bootStatusText.textContent = `Load error: ${err?.message || err}`;
  }
});
