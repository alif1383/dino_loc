# DeepTime Earth (`dino_loc`)

Drop an explorer mannequin anywhere on a photorealistic 3D WebGL Earth to dive straight into a ground-level prehistoric "Street View" across **5 major stages of Earth's history** — from the molten Hadean Earth (`4.4 Ga`) to the Last Glacial Maximum (`20 ka`), including **two distinct Dinosaur Ages** (`150 Ma` Late Jurassic & `68 Ma` Late Cretaceous).

## Features

- **Google Earth-Level 3D WebGL Globe**: Photorealistic NASA Blue Marble Earth with tangent-space normal-mapped mountains, ocean specular sun glints, drifting clouds, Rayleigh-scattering atmosphere, starfield, and a 3D orbiting Moon (looming 3× closer during Hadean Earth).
- **Drag-and-Drop Explorer Mannequin (Pegman)**: Drag the explorer figure directly onto any spot on Earth with live surface targeting and real-time modern → paleo coordinate telemetry, then dive into ground-level Time View.
- **Modern Earth ↔ Paleo Earth Toggle**: Smoothly crossfade the 3D globe into photorealistic satellite reconstructions of each geological era while watching your dropped pin slide along its glowing geodesic continental-drift trajectory.
- **Scientific Plate Tectonics Reconstruction**: Uses 15 Natural Earth tectonic blocks and 3×3 spherical Euler finite rotation matrices to calculate paleo-latitude, drift distance, epicontinental seaways (Western Interior Seaway, European Chalk Sea, Trans-Saharan Seaway), Gondwanan/Laurentide continental ice sheets, and lowered `-125 m` Ice Age land bridges (Beringia, Doggerland, Sundaland, Sahul).
- **Interactive Photorealistic Prehistoric Street View & Regional Dinosaur Atlas**: Pan, tilt, and zoom across documentary-grade landscapes with live atmospheric particles (volcanic embers, underwater solar caustics, snow squalls, spores), interactive sighting markers, and region-specific dinosaur & megafauna field guides with human-scale size bars and geological evidence.

## Running Locally

```bash
npm run dev
```

Then open `http://localhost:4173`.

## Running Tests

```bash
npm test
```

Runs tectonic & dual-stack HTTP server unit tests (`npm run test:unit`) followed by the Playwright visual & functional end-to-end test suite (`npm run test:e2e`).