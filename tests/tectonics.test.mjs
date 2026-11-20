import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STAGES, STAGE_BY_ID, CREATURES, MODERN_PLACES } from "../src/paleoData.js";
import {
  TectonicEngine,
  latLonToVec,
  vecToLatLon,
  greatCircleKm,
  formatCoords,
  formatLatOnly
} from "../src/tectonics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadLocalEngine() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/plates_data.json"), "utf8"));
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => raw
  });
  try {
    const engine = new TectonicEngine();
    await engine.load("data/plates_data.json");
    return { engine, raw };
  } finally {
    globalThis.fetch = origFetch;
  }
}

test("plates_data.json RLE grid decodes cleanly to exact 360x180 coverage", async () => {
  const { engine, raw } = await loadLocalEngine();
  assert.equal(engine.ready, true);
  assert.equal(engine.gridW, 360);
  assert.equal(engine.gridH, 180);
  assert.equal(engine.grid.length, 360 * 180);
  assert.equal(raw.plates.length, 16); // OCN + 15 continental plates

  let rleSum = 0;
  for (let i = 1; i < raw.rle.length; i += 2) rleSum += raw.rle[i];
  assert.equal(rleSum, 360 * 180);
});

test("All 3x3 Euler rotation matrices are strictly orthogonal (R^T R = I, det = +1)", async () => {
  const { raw } = await loadLocalEngine();
  for (const stage of STAGES) {
    const stageRots = raw.rotations[stage.id];
    assert.ok(stageRots, `Missing rotations for stage ${stage.id}`);
    for (const plate of raw.plates) {
      const m = stageRots[plate.code];
      assert.equal(m.length, 9, `Invalid matrix length for ${stage.id}/${plate.code}`);

      // Check R^T * R == I
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const dot = m[0 * 3 + i] * m[0 * 3 + j] + m[1 * 3 + i] * m[1 * 3 + j] + m[2 * 3 + i] * m[2 * 3 + j];
          const expected = i === j ? 1 : 0;
          assert.ok(
            Math.abs(dot - expected) < 1e-4,
            `Non-orthogonal matrix for ${stage.id}/${plate.code} at (${i},${j}): ${dot}`
          );
        }
      }

      // Determinant == +1 (proper rotation, no mirror reflection)
      const det =
        m[0] * (m[4] * m[8] - m[5] * m[7]) -
        m[1] * (m[3] * m[8] - m[5] * m[6]) +
        m[2] * (m[3] * m[7] - m[4] * m[6]);
      assert.ok(Math.abs(det - 1) < 1e-4, `Invalid det=${det} for ${stage.id}/${plate.code}`);
    }
  }
});

test("Modern coordinates map accurately to their real tectonic plates", async () => {
  const { engine } = await loadLocalEngine();
  const cases = [
    ["New York", 40.71, -74.01, "NAM"],
    ["Montana", 47.55, -106.45, "NAM"],
    ["London", 51.51, -0.13, "EUR"],
    ["Mumbai", 19.08, 72.88, "IND"],
    ["Tokyo", 35.68, 139.69, "EAS"],
    ["Sydney", -33.87, 151.21, "AUS"],
    ["Rio", -22.91, -43.17, "SAM"],
    ["Cairo", 30.04, 31.24, "AFR"],
    ["Riyadh", 24.71, 46.67, "ARB"],
    ["Antananarivo", -18.88, 47.51, "MAD"],
    ["Nuuk", 64.18, -51.72, "GRN"],
    ["Antarctic Peninsula", -66.50, -63.00, "ANT"],
    ["East Antarctica", -80.00, 20.00, "ANT"],
    ["Central Pacific", 5.0, -140.0, "OCN"]
  ];
  for (const [label, lat, lon, expectedCode] of cases) {
    const plate = engine.getPlateAt(lat, lon);
    assert.equal(plate.code, expectedCode, `${label} mapped to ${plate.code}, expected ${expectedCode}`);
  }
});

test("Forward and inverse Euler plate reconstructions round-trip cleanly", async () => {
  const { engine } = await loadLocalEngine();
  const sampleSites = [
    [40.71, -74.01],   // NYC (NAM)
    [19.08, 72.88],    // Mumbai (IND)
    [-33.87, 151.21],  // Sydney (AUS)
    [-22.91, -43.17]   // Rio (SAM)
  ];
  for (const stageId of ["300ma", "150ma", "68ma"]) {
    for (const [lat, lon] of sampleSites) {
      const fwd = engine.reconstructPosition(lat, lon, stageId);
      const inv = engine.findModernForPaleo(fwd.paleoLat, fwd.paleoLon, stageId);
      const errKm = greatCircleKm(lat, lon, inv.lat, inv.lon);
      assert.ok(errKm < 15, `Round-trip drift error too high (${errKm} km) for (${lat},${lon}) at ${stageId}`);
    }
  }
});

test("Scientific paleogeography & regional dinosaur reconstructions across all 5 stages", async () => {
  const { engine } = await loadLocalEngine();

  // Stage 1: Hadean (4.4 Ga) — prebiotic, no dinosaurs
  const nycHadean = engine.reconstructSite(40.71, -74.01, "4400ma");
  assert.equal(nycHadean.stage.hasDinosaurs, false);
  assert.equal(nycHadean.creatureIds.length, 0);
  assert.ok(nycHadean.scene.includes("hadean_"));

  // Stage 2: Carboniferous (300 Ma) — NYC on equatorial coal swamp, Mumbai on Gondwana South Polar Ice Sheet
  const nyc300 = engine.reconstructSite(40.71, -74.01, "300ma");
  assert.ok(Math.abs(nyc300.paleoLat) < 16, `NYC at 300 Ma should be near Equator, got ${nyc300.paleoLat}`);
  assert.match(nyc300.environmentTitle, /Coal Swamp/i);
  assert.ok(nyc300.creatureIds.includes("meganeura"));

  const mumbai300 = engine.reconstructSite(19.08, 72.88, "300ma");
  assert.ok(mumbai300.paleoLat < -45, `Mumbai at 300 Ma should be in Southern Gondwana, got ${mumbai300.paleoLat}`);
  assert.match(mumbai300.environmentTitle, /Gondwanan.*Ice Sheet/i);
  assert.ok(mumbai300.driftKm > 6000);

  // Stage 3: Late Jurassic (150 Ma — Dinosaur Era I)
  const montana150 = engine.reconstructSite(47.55, -106.45, "150ma");
  assert.equal(montana150.stage.hasDinosaurs, true);
  assert.ok(montana150.creatureIds.includes("brachiosaurus"));
  assert.ok(montana150.creatureIds.includes("stegosaurus"));
  assert.ok(montana150.creatureIds.includes("allosaurus"));

  const london150 = engine.reconstructSite(51.51, -0.13, "150ma");
  assert.match(london150.environmentTitle, /Archipelago/i);
  assert.ok(london150.creatureIds.includes("archaeopteryx"));

  // Stage 4: Late Cretaceous (68 Ma — Dinosaur Era II)
  const montana68 = engine.reconstructSite(47.55, -106.45, "68ma");
  assert.match(montana68.environmentTitle, /Hell Creek|Laramidia/i);
  assert.ok(montana68.creatureIds.includes("trex"));
  assert.ok(montana68.creatureIds.includes("triceratops"));

  const kansas68 = engine.reconstructSite(38.80, -99.32, "68ma");
  assert.equal(kansas68.isUnderwater, true);
  assert.match(kansas68.environmentTitle, /Western Interior Seaway/i);
  assert.ok(kansas68.creatureIds.includes("mosasaurus"));

  const mumbai68 = engine.reconstructSite(19.08, 72.88, "68ma");
  assert.ok(mumbai68.paleoLat < -10, `Mumbai at 68 Ma should be in Southern Hemisphere, got ${mumbai68.paleoLat}`);
  assert.match(mumbai68.environmentTitle, /India.*Deccan/i);
  assert.ok(mumbai68.creatureIds.includes("rajasaurus"));

  const patagonia68 = engine.reconstructSite(-38.95, -68.06, "68ma");
  assert.ok(patagonia68.creatureIds.includes("carnotaurus"));

  const gobi68 = engine.reconstructSite(43.50, 101.05, "68ma");
  assert.ok(gobi68.creatureIds.includes("velociraptor"));

  const antarctica68 = engine.reconstructSite(-66.50, -63.00, "68ma");
  assert.match(antarctica68.environmentTitle, /Ice-Free Polar/i);

  // Stage 5: Last Glacial Maximum (20 ka)
  const nyc20k = engine.reconstructSite(40.71, -74.01, "20ka");
  assert.match(nyc20k.environmentTitle, /Laurentide/i);

  const yakutsk20k = engine.reconstructSite(62.03, 129.73, "20ka");
  assert.match(yakutsk20k.environmentTitle, /Mammoth Steppe/i);
  assert.ok(yakutsk20k.creatureIds.includes("mammoth"));

  const beringia20k = engine.reconstructSite(65.70, -168.50, "20ka");
  assert.match(beringia20k.environmentTitle, /Beringia/i);
});

test("Every referenced globe texture, scene panorama, and creature portrait exists on disk", async () => {
  const { engine } = await loadLocalEngine();
  const assetPaths = new Set([
    "assets/textures/earth_modern.jpg",
    "assets/textures/earth_modern_normal.jpg",
    "assets/textures/earth_modern_spec.jpg",
    "assets/textures/earth_clouds.png",
    "assets/textures/moon.jpg"
  ]);

  for (const st of STAGES) {
    assetPaths.add(st.globe.albedo);
    assetPaths.add(st.globe.normal);
    assetPaths.add(st.globe.spec);
    if (st.globe.emissive) assetPaths.add(st.globe.emissive);
  }
  for (const c of Object.values(CREATURES)) {
    assetPaths.add(c.portrait);
  }
  // Sweep every modern reference place across all 5 stages to collect all scene paths
  for (const place of MODERN_PLACES) {
    for (const st of STAGES) {
      const site = engine.reconstructSite(place.lat, place.lon, st.id);
      assert.ok(site.scene, `Missing scene for ${place.name} at ${st.id}`);
      assert.ok(Array.isArray(site.hotspots) && site.hotspots.length >= 2, `Missing hotspots for ${place.name} at ${st.id}`);
      assetPaths.add(site.scene);
      for (const cid of site.creatureIds) {
        assert.ok(CREATURES[cid], `Unknown creatureId '${cid}' for ${place.name} at ${st.id}`);
      }
    }
  }

  for (const rel of assetPaths) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing asset on disk: ${rel}`);
    const stat = fs.statSync(abs);
    assert.ok(stat.size > 1024, `Asset suspiciously empty (${stat.size}B): ${rel}`);
  }
});

test("Spherical math and coordinate formatting utilities", () => {
  const v = latLonToVec(40.71, -74.01);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  const [lat, lon] = vecToLatLon(...v);
  assert.ok(Math.abs(lat - 40.71) < 1e-6);
  assert.ok(Math.abs(lon - -74.01) < 1e-6);

  // Quarter circumference (Equator to North Pole) ~ 10,007.5 km
  const qDist = greatCircleKm(0, 0, 90, 0);
  assert.ok(Math.abs(qDist - 10007.54) < 5);

  assert.equal(formatCoords(40.71, -74.01), "40.7°N, 74.0°W");
  assert.equal(formatCoords(-33.87, 151.21), "33.9°S, 151.2°E");
  assert.equal(formatLatOnly(-51.9), "51.9°S");
});
