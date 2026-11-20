/**
 * DeepTime Earth — Plate Tectonics & Paleo-Environment Reconstruction Engine
 * Uses exact 3x3 Euler finite rotation matrices from Natural Earth tectonic blocks
 * paired with paleoclimate, paleobathymetry, and paleobiogeography models.
 */
import { STAGES, STAGE_BY_ID, CREATURES, MODERN_PLACES } from "./paleoData.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371.0;

export class TectonicEngine {
  constructor() {
    this.ready = false;
    this.gridW = 360;
    this.gridH = 180;
    this.grid = null;
    this.plates = [];
    this.plateById = {};
    this.rotations = {};
  }

  async load(url = "data/plates_data.json") {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Failed to load plate data: ${res.status}`);
    const data = await res.json();
    this.gridW = data.gridWidth;
    this.gridH = data.gridHeight;
    this.plates = data.plates;
    this.plateById = Object.fromEntries(data.plates.map(p => [p.id, p]));
    this.rotations = data.rotations;

    // Decode RLE plate grid
    const grid = new Uint8Array(this.gridW * this.gridH);
    const rle = data.rle;
    let idx = 0;
    for (let i = 0; i < rle.length; i += 2) {
      const val = rle[i];
      const count = rle[i + 1];
      grid.fill(val, idx, idx + count);
      idx += count;
    }
    this.grid = grid;
    this.ready = true;
    return this;
  }

  /**
   * Look up the modern tectonic plate ID (0 = Oceanic Crust, 1..15 = Continental Plates)
   */
  getPlateAt(lat, lon) {
    if (!this.ready) return this.plateById[0] || { id: 0, code: "OCN", name: "Oceanic Crust" };
    const normLon = ((((lon + 180) % 360) + 360) % 360);
    const clampLat = Math.max(-89.99, Math.min(89.99, lat));
    const gx = Math.min(this.gridW - 1, Math.floor((normLon / 360) * this.gridW));
    const gy = Math.min(this.gridH - 1, Math.floor(((90 - clampLat) / 180) * this.gridH));
    const pid = this.grid[gy * this.gridW + gx];
    return this.plateById[pid] || this.plateById[0];
  }

  /**
   * Nearest ocean basin name when dropped over water
   */
  getOceanName(lat, lon) {
    if (lat > 67) return "Arctic Ocean";
    if (lat < -60) return "Southern Ocean";
    if (lon > 20 && lon < 120 && lat < 30) return "Indian Ocean";
    if (lon > -70 && lon < 20) return lat >= 0 ? "North Atlantic Ocean" : "South Atlantic Ocean";
    return lat >= 0 ? "North Pacific Ocean" : "South Pacific Ocean";
  }

  /**
   * Nearest named modern city/landmark for intuitive spatial context
   */
  getNearestModernPlace(lat, lon) {
    let best = null;
    let bestDist = Infinity;
    for (const p of MODERN_PLACES) {
      const d = greatCircleKm(lat, lon, p.lat, p.lon);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return { place: best, distanceKm: Math.round(bestDist) };
  }

  /**
   * Apply exact 3x3 Euler finite rotation matrix to transform modern (lat, lon)
   * into reconstructed (paleoLat, paleoLon) for the selected geological stage.
   */
  reconstructPosition(lat, lon, stageId) {
    const plate = this.getPlateAt(lat, lon);
    // For oceanic crust, compute nearest continental margin drift or modest paleo-basin drift
    if (plate.code === "OCN") {
      if (stageId === "20ka") {
        return { plate, paleoLat: lat, paleoLon: lon, driftKm: 0, oceanicSubducted: false };
      }
      if (stageId === "4400ma") {
        // Early Hadean had no modern ocean plates — crust recycled continuously
        const pLat = clamp(lat * 0.72 + Math.sin(lon * DEG) * 14, -85, 85);
        const pLon = wrapLon(lon + 28);
        return {
          plate,
          paleoLat: pLat,
          paleoLon: pLon,
          driftKm: Math.round(greatCircleKm(lat, lon, pLat, pLon)),
          oceanicSubducted: true
        };
      }
      // Ancient oceanic crust older than ~180 Ma has been recycled by subduction!
      // Project onto equivalent Panthalassic / Tethys basin position smoothly
      const ageFactor = stageId === "300ma" ? 1.0 : stageId === "150ma" ? 0.55 : 0.25;
      const pLat = clamp(lat - ageFactor * 6 * Math.cos(lon * DEG), -85, 85);
      const pLon = wrapLon(lon + ageFactor * 18);
      return {
        plate,
        paleoLat: pLat,
        paleoLon: pLon,
        driftKm: Math.round(greatCircleKm(lat, lon, pLat, pLon)),
        oceanicSubducted: stageId === "300ma" || stageId === "150ma"
      };
    }

    const M = this.rotations[stageId]?.[plate.code];
    if (!M) {
      return { plate, paleoLat: lat, paleoLon: lon, driftKm: 0, oceanicSubducted: false };
    }

    const u = latLonToVec(lat, lon);
    const rx = M[0] * u[0] + M[1] * u[1] + M[2] * u[2];
    const ry = M[3] * u[0] + M[4] * u[1] + M[5] * u[2];
    const rz = M[6] * u[0] + M[7] * u[1] + M[8] * u[2];
    const [paleoLat, paleoLon] = vecToLatLon(rx, ry, rz);
    const driftKm = Math.round(greatCircleKm(lat, lon, paleoLat, paleoLon));
    return { plate, paleoLat, paleoLon, driftKm, oceanicSubducted: false };
  }

  /**
   * Inverse Euler lookup: given a clicked/dropped point on the Paleo Earth globe,
   * determine which modern continental crust sits there (if any) so dropping Pegman
   * works accurately in BOTH Modern Earth and Paleo Earth modes!
   */
  findModernForPaleo(paleoLat, paleoLon, stageId) {
    if (!this.ready || stageId === "20ka" || stageId === "4400ma") {
      return { lat: paleoLat, lon: paleoLon };
    }
    const v = latLonToVec(paleoLat, paleoLon);
    const stageRots = this.rotations[stageId] || {};
    for (const plate of this.plates) {
      if (plate.id === 0) continue;
      const M = stageRots[plate.code];
      if (!M) continue;
      // Apply inverse rotation M^T to v
      const mx = M[0] * v[0] + M[3] * v[1] + M[6] * v[2];
      const my = M[1] * v[0] + M[4] * v[1] + M[7] * v[2];
      const mz = M[2] * v[0] + M[5] * v[1] + M[8] * v[2];
      const [mLat, mLon] = vecToLatLon(mx, my, mz);
      const hitPlate = this.getPlateAt(mLat, mLon);
      if (hitPlate.id === plate.id) {
        return { lat: mLat, lon: mLon };
      }
    }
    return { lat: paleoLat, lon: paleoLon };
  }

  /**
   * Full scientific reconstruction of a dropped coordinate at a given geological stage.
   * Returns paleo-coordinates, biome, realistic temperature, scene artwork, hotspots,
   * dinosaur/wildlife roster, and scientific evidence explanation.
   */
  reconstructSite(lat, lon, stageId) {
    const stage = STAGE_BY_ID[stageId] || STAGES[3];
    const { plate, paleoLat, paleoLon, driftKm, oceanicSubducted } = this.reconstructPosition(lat, lon, stageId);
    const nearest = this.getNearestModernPlace(lat, lon);

    let modernLabel;
    if (plate.code === "OCN" && nearest.distanceKm > 280) {
      modernLabel = this.getOceanName(lat, lon);
    } else if (nearest.distanceKm < 120) {
      modernLabel = `${nearest.place.name}, ${nearest.place.country}`;
    } else if (plate.code === "OCN") {
      modernLabel = `${this.getOceanName(lat, lon)} (off ${nearest.place.name})`;
    } else {
      modernLabel = `Near ${nearest.place.name}, ${nearest.place.country}`;
    }

    const env = this._resolveEnvironment(lat, lon, paleoLat, paleoLon, plate, stage, oceanicSubducted);

    return {
      modernLat: lat,
      modernLon: lon,
      modernLabel,
      stage,
      plate,
      paleoLat,
      paleoLon,
      driftKm,
      oceanicSubducted,
      ...env
    };
  }

  _resolveEnvironment(mlat, mlon, plat, plon, plate, stage, oceanicSubducted) {
    const p = plate.code;
    const alat = Math.abs(plat);

    // =========================================================================
    // STAGE 1: HADEAN EARTH (4.4 Ga) — Birth of the Planet
    // =========================================================================
    if (stage.id === "4400ma") {
      const hash = Math.sin(mlat * 0.27 + mlon * 0.19) * Math.cos(mlat * 0.13 - mlon * 0.31);
      const isOceanVent = p === "OCN" || hash > 0.12;
      const localTemp = Math.round(68 + Math.abs(hash) * 52);

      if (isOceanVent) {
        return {
          environmentTitle: "Primordial Boiling Sea & Volcanic Vents",
          paleoRegion: "Nascent Hadean Ocean Basin",
          biomeType: "Volcanic Proto-Ocean",
          particleMode: "magma",
          isUnderwater: false,
          localTempC: `${localTemp}°C`,
          elevationLabel: "0 m · Steaming Iron-Rich Sea",
          scene: "assets/scenes/hadean_ocean_vents.jpg",
          creatureIds: [],
          faunaHeader: "Prebiotic Chemistry (No Dinosaurs Yet)",
          faunaNote:
            "Earth is 4.17 billion years away from the first dinosaurs. Inside mineral-rich alkaline hydrothermal vents along these dark basalt coasts, early RNA-world organic chemistry is just beginning to assemble.",
          hotspots: [
            { x: 70, y: 26, title: "Giant Close Moon", detail: "Orbiting ~3× closer than today (~120,000 km away), the Moon raises kilometer-high global tides across Earth's early seas every few hours." },
            { x: 25, y: 38, title: "Basaltic Arc Eruption", detail: "Extreme internal radiogenic heat drives relentless volcanic outgassing of CO₂, nitrogen, methane, and superheated steam." },
            { x: 72, y: 65, title: "Hydrothermal Mineral Vents", detail: "Iron-sulfide chimneys venting hot mineral fluids into the acidic proto-ocean—a leading scientific candidate for the origin of life." }
          ],
          evidence:
            "Oxygen-isotope ratios in 4.4-billion-year-old detrital zircon crystals from Jack Hills (Western Australia) prove liquid surface water and early granitic proto-crust existed far earlier than once believed."
        };
      }

      return {
        environmentTitle: "Basaltic Proto-Crust & Magma Rivers",
        paleoRegion: "Cooling Hadean Lithosphere",
        biomeType: "Magma Coast & Impact Field",
        particleMode: "magma",
        isUnderwater: false,
        localTempC: `${localTemp + 24}°C`,
        elevationLabel: "Basaltic Shield · Active Rifts",
        scene: "assets/scenes/hadean_magma_coast.jpg",
        creatureIds: [],
        faunaHeader: "Sterile Primordial Crust (No Life on Land)",
        faunaNote:
          "Modern continents did not yet exist—the bedrock beneath your modern city was still molten mantle or early ultramafic proto-crust being battered by Late Veneer asteroids.",
        hotspots: [
          { x: 70, y: 28, title: "Looming Hadean Moon", detail: "Freshly cooled from the Theia giant impact, the Moon dominates the amber sky and slows Earth's 10-hour spin via tidal friction." },
          { x: 35, y: 66, title: "Incandescent Lava Channels", detail: "Ultramafic komatiite lavas erupting at over 1,500°C—far hotter and runnier than modern Hawaiian basalt flows." },
          { x: 78, y: 55, title: "Steaming Proto-Coast", detail: "Dense 100-bar atmospheric pressure lets liquid water condense on cooling crust even above 100°C." }
        ],
        evidence:
          "Radiometric U-Pb dating of ancient zircons, lunar cratering records, and mantle tungsten-182 anomalies reconstruct this violent crust-forming epoch."
      };
    }

    // =========================================================================
    // STAGE 2: LATE CARBONIFEROUS (300 Ma) — Pangaea & Giant Swamps
    // =========================================================================
    if (stage.id === "300ma") {
      // Check if in ancient ocean or shallow inland sea
      const isRussianSea = p === "EUR" && mlon > 36 && mlon < 56 && mlat > 48 && mlat < 64;
      if (p === "OCN" || p === "ISL" || isRussianSea) {
        const seaName = plon < -55 || plon > 130 ? "Panthalassic Superocean" : "Paleo-Tethys Ocean";
        const tempC = Math.round(27 - alat * 0.34);
        return {
          environmentTitle: "Paleozoic Crinoid & Trilobite Reef",
          paleoRegion: seaName,
          biomeType: "Shallow Paleozoic Sea",
          particleMode: "underwater",
          isUnderwater: true,
          localTempC: `${tempC}°C water`,
          elevationLabel: oceanicSubducted ? "Subducted Ancient Seafloor" : "-45 m · Epicontinental Reef",
          scene: "assets/scenes/paleozoic_ocean_reef.jpg",
          creatureIds: [],
          faunaHeader: "Paleozoic Marine Life (70 Myr Before Dinosaurs)",
          faunaNote:
            "Long before mosasaurs or dinosaurs, Carboniferous oceans teemed with dense 'meadows' of feathery crinoid sea lilies, coiled and straight-shelled nautiloids, trilobites, and early cartilaginous sharks.",
          hotspots: [
            { x: 24, y: 56, title: "Crinoid Sea-Lily Meadows", detail: "Stalked echinoderms waving feathery filter-feeding arms—their calcite skeletons built thick Carboniferous limestone beds worldwide." },
            { x: 74, y: 26, title: "Orthocone Nautiloids", detail: "Jet-propelled cephalopods hunting along sunlit tropical shelf waters." },
            { x: 38, y: 82, title: "Late Paleozoic Trilobites", detail: "Armored marine arthropods scavenging seafloor sediments millions of years before the End-Permian extinction." }
          ],
          evidence:
            "Marine crinoidal limestones and global brachiopod/conodont fossil zones confirm warm Panthalassic & Paleo-Tethys reefs flanking equatorial Pangaea."
        };
      }

      // South Polar Gondwana Ice Sheet! (India, Australia, Antarctica, Southern Africa, Patagonia!)
      if (plat < -44) {
        const tempC = Math.round(-6 - (Math.abs(plat) - 44) * 0.65);
        return {
          environmentTitle: "Gondwanan South Polar Ice Sheet",
          paleoRegion: "Glaciated Southern Gondwana (Pangaea)",
          biomeType: "Late Paleozoic Glacial Sheet",
          particleMode: "snow",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+1,400 m · Continental Glacier",
          scene: "assets/scenes/carboniferous_gondwana_glacier.jpg",
          creatureIds: [],
          faunaHeader: "Glaciated Gondwana (Pre-Dinosaur Icehouse)",
          faunaNote:
            "Remarkably, today's warm regions like India, Southern Africa, Australia, and Brazil sat clustered near the South Pole under colossal continental glaciers—70 million years before dinosaurs appeared.",
          hotspots: [
            { x: 58, y: 45, title: "Gondwanan Ice Margin", detail: "Kilometer-thick glaciers grinding across bedrock, carving parallel striations still visible today in India, South Africa, and Australia." },
            { x: 34, y: 74, title: "Barren Glacial Outwash", detail: "With no grasses or flowering plants yet evolved, periglacial valleys are stark fields of frost-shattered bedrock and braided meltwater." }
          ],
          evidence:
            "Permo-Carboniferous glacial tillites (Dwyka, Talchir in India, Itararé in Brazil) and matching bedrock striations across southern continents provided Alfred Wegener's decisive proof of continental drift!"
        };
      }

      // Equatorial & Temperate Pangaea Coal Swamp Rainforests!
      const isEquatorial = alat < 22;
      const tempC = Math.round(29 - alat * 0.42);
      return {
        environmentTitle: isEquatorial ? "Equatorial Pangaea Coal Swamp" : "Temperate Pangaean Fern & Conifer Basin",
        paleoRegion: isEquatorial ? "Euramerica Equatorial Belt (Pangaea)" : "Interior / Northern Pangaea",
        biomeType: isEquatorial ? "Lycopsid Rainforest Swamp" : "Cordaites & Fern Forest",
        particleMode: "swamp",
        isUnderwater: false,
        localTempC: `${tempC}°C`,
        elevationLabel: "+25 m · Flooded Peat Basin",
        scene: "assets/scenes/carboniferous_coal_swamp.jpg",
        creatureIds: ["meganeura"],
        faunaHeader: "Giant Arthropods & Early Tetrapods (Pre-Dinosaur)",
        faunaNote:
          "At 35% oxygen (today is 21%), insects grew to monstrous dimensions—hawk-sized Meganeura dragonflies and 2.5-meter Arthropleura millipedes ruled wet forests alongside early crocodile-sized amphibians and the very first reptiles.",
        hotspots: [
          { x: 64, y: 44, title: "Meganeura Griffenfly", detail: "A 70 cm wingspan aerial predator empowered by hyper-oxygenated Carboniferous air.", creatureId: "meganeura" },
          { x: 20, y: 36, title: "Lepidodendron Scale Trees", detail: "40-meter-tall giant clubmosses whose undecayed trunks compacted over millions of years into the world's great coal seams." },
          { x: 46, y: 76, title: "Anoxic Peat Waters", detail: "Stagnant tannin-stained water slowed wood decay, locking away billions of tons of carbon and driving down global CO₂." }
        ],
        evidence:
          "Massive tropical coal seams across Pennsylvania, Wales, Germany, and China—combined with paleomagnetic rock inclinations—prove North America and Europe lay directly on the Equator."
      };
    }

    // =========================================================================
    // STAGE 3: LATE JURASSIC (150 Ma) — DINOSAUR ERA I (Age of Giant Sauropods)
    // =========================================================================
    if (stage.id === "150ma") {
      // Open Oceans (Panthalassa, Young Atlantic, Tethys)
      if (p === "OCN" || p === "ISL") {
        const seaName =
          plon > -45 && plon < -10 && plat > 0 && plat < 42
            ? "Young Central Atlantic Rift Sea"
            : plon > 10 && plon < 110 && plat > -25 && plat < 35
            ? "Tropical Tethys Ocean"
            : "Panthalassic Ocean";
        const tempC = Math.round(28 - alat * 0.28);
        return {
          environmentTitle: "Jurassic Pelagic Sea",
          paleoRegion: seaName,
          biomeType: "Mesozoic Open Ocean",
          particleMode: "underwater",
          isUnderwater: true,
          localTempC: `${tempC}°C water`,
          elevationLabel: "Pelagic Open Sea",
          scene: "assets/scenes/jurassic_open_ocean.jpg",
          creatureIds: ["liopleurodon"],
          faunaHeader: "Jurassic Marine Reptiles",
          faunaNote:
            "Warm, ice-free Jurassic seas were ruled by apex pliosaurs like Liopleurodon, dolphin-like Ophthalmosaurus ichthyosaurs, giant Leedsichthys filter-feeders, and abundant spiral ammonites.",
          hotspots: [
            { x: 65, y: 38, title: "Liopleurodon Pliosaur", detail: "Four-flippered marine apex predator cruising the sunlit upper ocean.", creatureId: "liopleurodon" },
            { x: 35, y: 72, title: "Ophthalmosaurus Pod", detail: "Deep-diving ichthyosaurs equipped with dinner-plate-sized eyes for hunting squid in twilight waters." },
            { x: 86, y: 78, title: "Jurassic Ammonites", detail: "Coiled chambered cephalopods whose rapid evolution lets geologists date Jurassic rock strata worldwide." }
          ],
          evidence:
            "Marine clay formations (Oxford & Kimmeridge Clays) and seafloor magnetic stripes in the Central Atlantic document early Pangaean breakup and rich pelagic ecosystems."
        };
      }

      // Europe (Solnhofen / Kimmeridge Tropical Island Archipelago!)
      if (p === "EUR") {
        const tempC = Math.round(28 - alat * 0.22);
        return {
          environmentTitle: "Solnhofen & Tethys Tropical Archipelago",
          paleoRegion: "Flooded European Island Sea (Laurasia)",
          biomeType: "Coral Limestone Lagoon & Islands",
          particleMode: "forest",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+8 m · Subtropical Limestone Islands",
          scene: "assets/scenes/jurassic_tethys_archipelago.jpg",
          creatureIds: ["archaeopteryx", "liopleurodon", "allosaurus"],
          faunaHeader: "European Archipelago Dinosaurs & Flyers",
          faunaNote:
            "High Jurassic sea levels flooded much of Europe into sun-drenched coral lagoons and cycad-draped islands—home to early feathered bird-dinosaur Archaeopteryx, pterosaurs, island sauropods (Lusotitan), and European Allosaurus in Iberia.",
          hotspots: [
            { x: 38, y: 48, title: "Rhamphorhynchus Pterosaurs", detail: "Long-tailed fish-eating pterosaurs gliding across warm European coral lagoons." },
            { x: 68, y: 72, title: "Lagoon Plesiosaur & Pliosaurs", detail: "Marine reptiles cruising turquoise shallow seas between Solnhofen and Kimmeridge islands.", creatureId: "liopleurodon" },
            { x: 14, y: 55, title: "Cycad Island Habitat", detail: "Home to feathered Archaeopteryx and small Compsognathus hunting lizards along sandy shores.", creatureId: "archaeopteryx" }
          ],
          evidence:
            "Exquisitely preserved feather impressions in Bavaria's Solnhofen lithographic limestones and Portuguese Lourinhã dinosaur beds reconstruct Europe's warm island archipelago."
        };
      }

      // Morrison Floodplain (North America) & Tendaguru (Africa / Arabia)
      if (p === "NAM" || p === "AFR" || p === "ARB") {
        const isEastAfrica = p === "AFR" && mlat < 12 && mlon > 20;
        const regionName =
          p === "NAM"
            ? mlon < -95
              ? "Morrison Basin (Western Laurasia)"
              : "Appalachian Rift Margin (Young Atlantic Coast)"
            : isEastAfrica
            ? "Tendaguru Coastal Plain (East Gondwana)"
            : "Northern Gondwana Fern Plains";
        const tempC = Math.round(29 - alat * 0.24);
        return {
          environmentTitle: "Jurassic Sauropod Fern Floodplain",
          paleoRegion: regionName,
          biomeType: "Semi-Arid Fern Prairie & Conifer River",
          particleMode: "forest",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+180 m · Seasonal Braided Floodplain",
          scene: "assets/scenes/jurassic_sauropod_floodplain.jpg",
          creatureIds: ["brachiosaurus", "stegosaurus", "allosaurus"],
          faunaHeader: "Late Jurassic Dinosaurs of This Region",
          faunaNote:
            p === "NAM"
              ? "The iconic Morrison Formation ecosystem: colossal Brachiosaurus, Diplodocus, and Apatosaurus herds browsing conifer groves while plated Stegosaurus fend off packs of Allosaurus."
              : "Gondwana's famed Tendaguru fauna closely mirrored North America's—towering Giraffatitan (Brachiosaurus), spiky Kentrosaurus (stegosaurid), and agile Jurassic theropods.",
          hotspots: [
            { x: 29, y: 40, title: "Brachiosaurus / Giraffatitan Herd", detail: "Towering 13-meter-tall sauropods migrating along seasonal braided rivers to strip high conifer crowns.", creatureId: "brachiosaurus" },
            { x: 66, y: 65, title: "Stegosaurus Browsing Ferns", detail: "With grass not yet evolved, fern prairies formed the main ground cover for low-browsing stegosaurs.", creatureId: "stegosaurus" },
            { x: 84, y: 38, title: "Araucaria & Cycad Groves", detail: "Monkey-puzzle conifers, ginkgoes, and tree ferns dominated Late Jurassic landscapes prior to flowering plants." }
          ],
          evidence:
            p === "NAM"
              ? "Extensive Morrison Formation mudstones, river channel sandstones, and bonebeds from Colorado to Montana preserve thousands of articulated Jurassic dinosaurs."
              : "Tanzania's Tendaguru Formation yields Giraffatitan and Kentrosaurus fossils showing land bridges still linked Africa and North America into the Jurassic."
        };
      }

      // Cool-Temperate / Misty Conifer Forests (East Asia, Siberia, South America, Australia, Antarctica, India, Greenland)
      const regionName =
        p === "EAS" || p === "SEA"
          ? "Sichuan & East Asian Conifer Basins"
          : p === "SAM"
          ? "Patagonian Gondwana Valleys"
          : p === "ANT" || p === "AUS" || p === "NZL"
          ? "Ice-Free Southern Gondwana Conifer Belt"
          : p === "IND" || p === "MAD"
          ? "Central Gondwana Rift Highlands"
          : "Northern Laurasian Conifer Forests";
      const tempC = Math.round(24 - alat * 0.26);
      return {
        environmentTitle: "Misty Jurassic Conifer & Ginkgo Highlands",
        paleoRegion: regionName,
        biomeType: "Temperate Araucaria Rainforest",
        particleMode: "forest",
        isUnderwater: false,
        localTempC: `${tempC}°C`,
        elevationLabel: "+420 m · Ancient Conifer Valley",
        scene: "assets/scenes/jurassic_conifer_highlands.jpg",
        creatureIds: ["brachiosaurus", "allosaurus", "stegosaurus"],
        faunaHeader: "Regional Jurassic Sauropods & Predators",
        faunaNote:
          p === "EAS"
            ? "Misty East Asian basins (Shaximiao & Tiaojishan) supported extraordinarily long-necked Mamenchisaurus sauropods, Tuojiangosaurus stegosaurs, predatory Yangchuanosaurus, and early feathered dinosaurs like Anchiornis."
            : "Without polar ice caps, towering Araucaria and ginkgo forests stretched deep into high latitudes, sustaining diverse Gondwanan sauropods (Tehuelchesaurus, Rhoetosaurus) and early megalosauroid/allosauroid hunters.",
        hotspots: [
          { x: 61, y: 40, title: "Giant Forest Sauropods", detail: "Long-necked sauropods (Mamenchisaurus & Brachiosaurids) browsing towering misty conifers.", creatureId: "brachiosaurus" },
          { x: 34, y: 24, title: "Araucaria Canopy", detail: "Living fossils today in Chile and Australia, monkey-puzzle conifers formed massive Jurassic woodlands across both hemispheres." },
          { x: 50, y: 78, title: "Fern-Lined Mountain Stream", detail: "Horsetails and mossy tree ferns carpeted cool damp valleys millions of years before grasses appeared." }
        ],
        evidence:
          "Fossilized conifer trunks, ginkgo leaves, and Shaximiao / Cañadón Calcáreo dinosaur beds document lush ice-free woodlands reaching past 65° paleo-latitude."
      };
    }

    // =========================================================================
    // STAGE 4: LATE CRETACEOUS (68 Ma) — DINOSAUR ERA II (Twilight of Dinosaurs)
    // =========================================================================
    if (stage.id === "68ma") {
      // Check iconic Cretaceous epicontinental seaways!
      // At 68 Ma (Late Maastrichtian), the Western Interior Seaway ran through Kansas/Dakotas/Manitoba,
      // leaving Hell Creek (Montana, -106.5W) and Denver (-105.2W) as lush coastal Laramidia!
      const wisCenter = -96.8 - (mlat - 34.0) * 0.16;
      const inWesternInteriorSeaway =
        p === "NAM" && mlat > 23 && mlat < 71 && Math.abs(mlon - wisCenter) < 6.2;
      const inGulfFlood = p === "NAM" && mlat < 31.5 && mlon > -99 && mlon < -79;
      const inEuroChalkSea = p === "EUR" && mlat > 47.5 && mlat < 57.5 && mlon > -8 && mlon < 22;
      const inSaharaSeaway =
        p === "AFR" && mlat > 15 && mlat < 35 && Math.abs(mlon - (4 + (mlat - 15) * 0.4)) < 7.5;

      if (p === "OCN" || p === "ISL" || inWesternInteriorSeaway || inGulfFlood || inEuroChalkSea || inSaharaSeaway) {
        const seaName = inWesternInteriorSeaway
          ? "Western Interior Seaway (Splitting North America!)"
          : inEuroChalkSea
          ? "European Chalk Sea (Forming White Cliffs of Dover!)"
          : inSaharaSeaway
          ? "Trans-Saharan Tethys Seaway"
          : inGulfFlood
          ? "Flooded Ancestral Gulf of Mexico"
          : "Late Cretaceous Pelagic Ocean";
        const tempC = Math.round(29 - alat * 0.24);
        return {
          environmentTitle: inWesternInteriorSeaway
            ? "Underwater: Western Interior Seaway"
            : inEuroChalkSea
            ? "Underwater: Cretaceous Chalk Sea"
            : "Cretaceous Pelagic Ocean",
          paleoRegion: seaName,
          biomeType: "Epicontinental Cretaceous Sea",
          particleMode: "underwater",
          isUnderwater: true,
          localTempC: `${tempC}°C water`,
          elevationLabel: inWesternInteriorSeaway ? "-160 m · Submerged Continental Interior" : "-90 m · Warm High-Sea Basin",
          scene: "assets/scenes/cretaceous_interior_seaway.jpg",
          creatureIds: ["mosasaurus", "quetzalcoatlus"],
          faunaHeader: "Cretaceous Sea Monsters (Location Underwater!)",
          faunaNote:
            inWesternInteriorSeaway
              ? "With global sea levels +170 m higher than today, central North America lay completely underwater—patrolled by 15-meter Mosasaurus, Elasmosaurus plesiosaurs, giant Archelon sea turtles, and diving Pteranodon."
              : "Global high sea levels submerged vast continental shelves into bright emerald-blue chalk seas ruled by giant Mosasaurus and colossal ammonites.",
          hotspots: [
            { x: 52, y: 54, title: "Mosasaurus hoffmannii", detail: "15-meter apex marine reptile dominating Late Cretaceous seas just before the K-Pg extinction.", creatureId: "mosasaurus" },
            { x: 84, y: 48, title: "Archelon Giant Sea Turtle", detail: "Car-sized 4-meter marine turtle with a leathery shell gliding through warm seaway currents." },
            { x: 14, y: 80, title: "Coiled Ammonites", detail: "Thriving across Cretaceous oceans until disappearing completely after the Chicxulub impact 2 Myr later." }
          ],
          evidence:
            inWesternInteriorSeaway
              ? "Thick marine Pierre Shale & Niobrara Chalk outcrops across Kansas, South Dakota, and Alberta contain abundant complete Mosasaurus, Tylosaurus, and giant fish skeletons."
              : "Microscopic coccolithophore shells accumulated on this warm Cretaceous seabed to build Europe's famous White Cliffs of Dover and Maastricht chalk."
        };
      }

      // Isolated Island Continent of India & Madagascar (Deccan Traps Volcanism!)
      if (p === "IND" || p === "MAD") {
        const tempC = Math.round(30 - alat * 0.18);
        return {
          environmentTitle:
            p === "IND" ? "Isolated India & Deccan Traps Volcanic Plains" : "Late Cretaceous Madagascar Floodplains",
          paleoRegion: p === "IND" ? "Drifting Indian Island Continent (Tethys Ocean)" : "Isolated Madagascar Island",
          biomeType: "Volcanic Tropical Palm & Fern Plains",
          particleMode: "magma",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+260 m · Deccan Basalt Margin",
          scene: "assets/scenes/cretaceous_deccan_india.jpg",
          creatureIds: ["rajasaurus", "quetzalcoatlus"],
          faunaHeader: "Island Gondwanan Dinosaurs",
          faunaNote:
            p === "IND"
              ? "Having broken free from Gondwana and not yet collided with Asia, India raced north as a massive volcanic island—inhabited by crested Rajasaurus, Isisaurus titanosaurs, and giant Sanajeh snakes amidst roaring Deccan Traps fissure eruptions."
              : "Madagascar's Maevarano ecosystem mirrored India's with cannibalistic Majungasaurus (close cousin of Rajasaurus), Rapetosaurus titanosaurs, and Beelzebufo devil frogs.",
          hotspots: [
            { x: 35, y: 66, title: "Rajasaurus narmadensis", detail: "Stout horned abelisaurid apex predator evolved in total isolation aboard drifting India.", creatureId: "rajasaurus" },
            { x: 70, y: 50, title: "Isisaurus Titanosaur Herd", detail: "Robust long-necked Indian sauropods grazing palm-rich floodplains between basalt flows." },
            { x: 84, y: 24, title: "Deccan Traps Flood Volcanism", detail: "One of Earth's largest volcanic eruptions—pouring 1.3 million km³ of basalt lava and CO₂/SO₂ right at the end of the Cretaceous." }
          ],
          evidence:
            "Paleomagnetic lava flows in the Deccan Traps prove India sat ~20° South of the Equator at 68 Ma, while Lameta Formation beds preserve Rajasaurus bones and titanosaur nesting colonies."
        };
      }

      // Ice-Free Polar Southern Beech Rainforest (Antarctica, Australia, New Zealand!)
      if (p === "ANT" || p === "AUS" || p === "NZL") {
        const tempC = Math.round(13 - Math.max(0, alat - 55) * 0.25);
        return {
          environmentTitle: "Ice-Free Polar Dinosaur Rainforest",
          paleoRegion: p === "ANT" ? "Green West Antarctica (South Polar Circle)" : "Subpolar Gondwanan Australia / Zealandia",
          biomeType: "Nothofagus Polar Temperate Rainforest",
          particleMode: "polar",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+110 m · Ice-Free Polar Fjord",
          scene: "assets/scenes/cretaceous_polar_forest.jpg",
          creatureIds: ["velociraptor", "carnotaurus"],
          faunaHeader: "Polar-Adapted Feathered Dinosaurs",
          faunaNote:
            "Antarctica had ZERO ice sheet at 68 Ma! Covered in misty southern beech (Nothofagus) and conifer rainforests, polar dinosaurs (Trinisaura, Antarctopelta, Imperobator, Australovenator) survived months of winter polar twilight with insulating feathers and enlarged optic lobes.",
          hotspots: [
            { x: 56, y: 74, title: "Feathered Polar Ornithopods", detail: "Small warm-blooded dinosaurs foraging on mossy fern floors during continuous summer twilight.", creatureId: "velociraptor" },
            { x: 24, y: 26, title: "Ancient Araucaria & Southern Beech", detail: "Fossilized tree rings and pollen cores prove lush temperate rainforests grew within 800 km of the South Pole." },
            { x: 48, y: 52, title: "Ice-Free Polar Waters", detail: "Warm ocean currents kept Antarctic fjords frost-free year-round before the Drake Passage opened." }
          ],
          evidence:
            "Fossilized Cretaceous tree stumps, Nothofagus pollen cores from West Antarctica, and James Ross Island dinosaur skeletons (Antarctopelta, Imperobator) confirm an ice-free green polar ecosystem."
        };
      }

      // Mongolia, Central & East Asia (Nemegt / Gobi Badlands!)
      if (p === "SIB" || p === "EAS" || p === "SEA") {
        const tempC = Math.round(25 - alat * 0.22);
        return {
          environmentTitle: "Nemegt Oasis & Sandstone Badlands",
          paleoRegion: "Late Cretaceous Central & East Asia",
          biomeType: "Arid Dunes & Braided River Oasis",
          particleMode: "badlands",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+680 m · Continental Basin",
          scene: "assets/scenes/cretaceous_mongolia_badlands.jpg",
          creatureIds: ["velociraptor", "trex", "quetzalcoatlus"],
          faunaHeader: "Asian Late Cretaceous Dinosaurs",
          faunaNote:
            "One of paleontology's richest treasures: feathered Velociraptor stalking arid dunes, giant Tarbosaurus (Asia's twin to T. rex), bizarre long-clawed Therizinosaurus, and duck-billed Deinocheirus gathering along desert rivers.",
          hotspots: [
            { x: 69, y: 54, title: "Feathered Velociraptor", detail: "Agile bird-like dromaeosaurid perched on sandstone cliffs scanning oasis scrub for small prey.", creatureId: "velociraptor" },
            { x: 55, y: 40, title: "Tarbosaurus (Asian Tyrannosaur)", detail: "A 10-meter close cousin of North America's T. rex patrolling the seasonal braided riverbed.", creatureId: "trex" },
            { x: 24, y: 34, title: "Flaming Cliffs Sandstone", detail: "Windblown desert dunes rapidly buried entire dinosaur nests and the famous 'Fighting Dinosaurs' fossil." }
          ],
          evidence:
            "Mongolia's Djadokhta and Nemegt Formations preserve complete feathered maniraptorans, brooding Oviraptor nests, and Tarbosaurus skeletons across ancient dune-oasis strata."
        };
      }

      // South America & Sub-Saharan Africa (Patagonia / Gondwana Mesas!)
      if (p === "SAM" || p === "AFR" || p === "ARB") {
        const tempC = Math.round(28 - alat * 0.20);
        return {
          environmentTitle: "Gondwanan Mesas & Titanosaur River Valley",
          paleoRegion: p === "SAM" ? "Late Cretaceous Patagonia & South America" : "Late Cretaceous Africa & Arabia",
          biomeType: "Semi-Arid Sandstone Plains & River Palms",
          particleMode: "badlands",
          isUnderwater: false,
          localTempC: `${tempC}°C`,
          elevationLabel: "+340 m · Braided River Valley",
          scene: "assets/scenes/cretaceous_patagonia_gondwana.jpg",
          creatureIds: ["carnotaurus", "brachiosaurus", "quetzalcoatlus"],
          faunaHeader: "Southern Hemisphere Giants & Abelisaurids",
          faunaNote:
            p === "SAM"
              ? "South America was an isolated island continent where Earth's heaviest land animals—Dreadnoughtus & Puertasaurus titanosaurs—shared semi-arid river valleys with horned sprint-predator Carnotaurus."
              : "Late Cretaceous North and Sub-Saharan Africa supported robust abelisaurids (Chenanisaurus), giant titanosaur sauropods, and huge coastal azhdarchid pterosaurs (Phosphatodraco).",
          hotspots: [
            { x: 76, y: 70, title: "Carnotaurus sastrei", detail: "Horned abelisaurid predator built for high-speed bursts across semi-arid Gondwanan plains.", creatureId: "carnotaurus" },
            { x: 37, y: 55, title: "Titanosaur Herd", detail: "Armored and colossal Late Cretaceous sauropods (Saltasaurus, Dreadnoughtus) crossing seasonal rivers.", creatureId: "brachiosaurus" },
            { x: 84, y: 26, title: "Red-Bed Sandstone Mesas", detail: "Iron-rich river sediments preserving giant nesting grounds and thousands of fossilized titanosaur eggs." }
          ],
          evidence:
            "Patagonia's La Colonia and Neuquén Group red-beds and Moroccan phosphate basins confirm that abelisaurids and titanosaurs dominated Southern Hemisphere ecosystems while tyrannosaurs ruled the North."
        };
      }

      // North America (Laramidia / Appalachia) & Surviving European Islands (Hateg / Iberia)
      const isAppalachia = p === "NAM" && mlon > wisCenter;
      const isEuropeIsland = p === "EUR";
      const regionName = isEuropeIsland
        ? "Hateg & Iberian Subtropical Island (Europe)"
        : isAppalachia
        ? "Appalachia (Eastern North America Island Continent)"
        : "Laramidia — Hell Creek Floodplains (Western North America)";
      const tempC = Math.round(26 - alat * 0.23);
      return {
        environmentTitle: isEuropeIsland
          ? "European Subtropical Dinosaur Island"
          : isAppalachia
          ? "Appalachian Coastal Cypress Floodplain"
          : "Hell Creek / Laramidia Cypress Forest",
        paleoRegion: regionName,
        biomeType: "Subtropical Angiosperm & Cypress Floodplain",
        particleMode: "forest",
        isUnderwater: false,
        localTempC: `${tempC}°C`,
        elevationLabel: "+40 m · Coastal River Delta",
        scene: "assets/scenes/cretaceous_laramidia_forest.jpg",
        creatureIds: isEuropeIsland
          ? ["quetzalcoatlus", "mosasaurus"]
          : isAppalachia
          ? ["trex", "quetzalcoatlus"]
          : ["trex", "triceratops", "quetzalcoatlus"],
        faunaHeader: isEuropeIsland
          ? "Island Dwarf Dinosaurs & Giant Pterosaurs"
          : isAppalachia
          ? "Appalachian Eastern Dinosaurs"
          : "Hell Creek Apex Dinosaurs (Laramidia)",
        faunaNote: isEuropeIsland
          ? "Cut off on European islands by high Cretaceous seas, sauropods shrank to horse-sized dwarfs (Magyarosaurus)—becoming prey for giraffe-tall island apex pterosaurs like Hatzegopteryx (twin to Quetzalcoatlus)!"
          : isAppalachia
          ? "Isolated east of the Western Interior Seaway, Appalachia evolved its own distinct tyrannosaurs (Dryptosaurus, Appalachiosaurus), duck-billed Hadrosaurus, and 10-meter Deinosuchus crocodiles."
          : "The most famous dinosaur ecosystem in history: Tyrannosaurus rex stalking herds of Triceratops, Edmontosaurus, and armored Ankylosaurus through humid magnolia-and-cypress river deltas.",
        hotspots: [
          { x: 38, y: 50, title: isAppalachia ? "Appalachian Tyrannosaur" : "Tyrannosaurus rex", detail: "Apex bone-crushing predator patrolling sunlit river sandbars in the final 2 million years of the Mesozoic.", creatureId: "trex" },
          { x: 80, y: 48, title: "Triceratops Herd", detail: "Three-horned ceratopsids forming a defensive wall along the fern-lined riverbank.", creatureId: "triceratops" },
          { x: 16, y: 26, title: "Flowering Magnolias & Bald Cypress", detail: "Unlike the Jurassic, Cretaceous forests burst with newly evolved flowering shrubs, palms, and deciduous canopy trees." }
        ],
        evidence:
          isEuropeIsland
            ? "Romania's Hateg Basin bones exhibit classic 'island dwarfism' histology alongside colossal Hatzegopteryx neck vertebrae."
            : "The Hell Creek & Lance Formations across Montana, the Dakotas, and Wyoming—capped directly above by the Chicxulub iridium clay layer—capture this ecosystem right before extinction."
      };
    }

    // =========================================================================
    // STAGE 5: LAST GLACIAL MAXIMUM (20 ka) — The Last Ice Age
    // =========================================================================
    const iceScore = estimateLgmIce(mlat, mlon);
    const landBridge = getLgmLandBridge(mlat, mlon, p);

    // Buried under Continental Ice Sheet! (Canada, NYC/Chicago, Scandinavia, Scotland, Alps, Patagonia, Antarctica!)
    if (iceScore > 0.5 && (p !== "OCN" || (mlat > 53 && mlon > -94 && mlon < -74) || mlat < -65)) {
      const sheetName =
        mlat < -60
          ? "Expanded Antarctic Ice Sheet"
          : mlon < -50 && mlat > 35
          ? "Laurentide & Cordilleran Ice Sheet"
          : mlon > -76 && mlon < -67 && mlat < -38
          ? "Patagonian Andean Ice Sheet"
          : mlat > 44 && mlat < 49 && mlon > 4 && mlon < 17
          ? "Alpine Mountain Ice Cap"
          : "Fennoscandian & British-Irish Ice Sheet";
      const tempC = Math.round(-16 - Math.max(0, Math.abs(mlat) - 42) * 0.65);
      return {
        environmentTitle: `Buried Under ${sheetName}`,
        paleoRegion: sheetName,
        biomeType: "Continental Glacial Ice Sheet",
        particleMode: "snow",
        isUnderwater: false,
        localTempC: `${tempC}°C`,
        elevationLabel: "+1,200 to +3,500 m · Solid Glacial Ice",
        scene: "assets/scenes/iceage_laurentide_glacier.jpg",
        creatureIds: ["mammoth"],
        faunaHeader: "Frozen Ice Cap (Megafauna Along Southern Margin)",
        faunaNote:
          "Modern cities like Toronto, Montreal, Chicago, Oslo, and New York's northern edge lay crushed beneath hundreds to thousands of meters of solid glacial ice! Woolly Mammoths and Ice Age hunters lived along the wind-scoured tundra just south of this towering ice cliff.",
        hotspots: [
          { x: 58, y: 52, title: "Kilometer-High Glacial Front", detail: "Towering fractured wall of compressed blue glacial ice pushing boulders into massive terminal moraines (such as Long Island, NY!)." },
          { x: 25, y: 74, title: "Frozen Glacial Outwash Plain", detail: "Katabatic winds screaming off the ice sheet whip silt ('loess') across barren braided meltwater plains." }
        ],
        evidence:
          "Terminal moraine ridges (Long Island, Cape Cod, North German Plain), glacial erratics, ice-scoured Great Lakes basins, and Greenland/Antarctic ice-core air bubbles precisely map these 20,000-year-old ice sheets."
      };
    }

    // Open Oceans (not exposed shelf land bridges!)
    if (p === "OCN" && !landBridge) {
      const tempC = Math.round(16 - alat * 0.28);
      return {
        environmentTitle: alat > 38 ? "Glacial Pack-Ice Ocean" : "Lowered-Sea Pleistocene Ocean",
        paleoRegion: `${this.getOceanName(mlat, mlon)} (Sea Level -125 m)`,
        biomeType: "Pleistocene Glacial Sea",
        particleMode: alat > 38 ? "snow" : "forest",
        isUnderwater: false,
        localTempC: `${Math.max(-2, tempC)}°C`,
        elevationLabel: "0 m · Sea Level 125 m Below Today",
        scene: "assets/scenes/iceage_glacial_ocean.jpg",
        creatureIds: [],
        faunaHeader: "Ice Age Marine Megafauna",
        faunaNote:
          "With colossal volumes of ocean water locked up in northern ice sheets, global sea level plunged 125 meters. Drifting icebergs and winter sea ice pushed far south across the North Atlantic, drawing Bowhead whales and walruses into mid-latitude waters.",
        hotspots: [
          { x: 46, y: 68, title: "Bowhead Whales", detail: "Thick-blubbered baleen whales thriving along nutrient-rich polar ice margins." },
          { x: 76, y: 46, title: "Ice-Floe Walrus Colony", detail: "Walrus fossils have been dredged from today's submerged Virginia and North Sea coastlines." },
          { x: 20, y: 42, title: "Calved Laurentide Icebergs", detail: "Armadas of icebergs periodically surged across the North Atlantic during Heinrich events." }
        ],
        evidence:
          "Submerged coral reef terraces in Barbados and Tahiti, plus deep-sea foraminifera oxygen-18 records, prove global sea level stood ~125 meters below modern shorelines at 20 ka."
      };
    }

    // Northern Mammoth Steppe, Beringia & Doggerland!
    if (mlat > 36 || landBridge === "Beringia Land Bridge" || landBridge === "Doggerland Exposed Plain") {
      const regionName = landBridge
        ? `${landBridge} (Exposed -125 m Shelf!)`
        : p === "NAM"
        ? "Periglacial North American Steppe"
        : p === "EUR"
        ? "Ice Age European Mammoth Steppe"
        : "Eurasian & Siberian Mammoth Steppe";
      const tempC = Math.round(-2 - Math.max(0, mlat - 38) * 0.55);
      return {
        environmentTitle: landBridge ? `Exposed Land Bridge: ${landBridge}` : "Ice Age Mammoth Steppe",
        paleoRegion: regionName,
        biomeType: "Subarctic Dry Grassland Steppe",
        particleMode: "snow",
        isUnderwater: false,
        localTempC: `${tempC}°C`,
        elevationLabel: landBridge ? "+15 m · Dry Exposed Seafloor" : "+240 m · Dry Permafrost Steppe",
        scene: "assets/scenes/iceage_mammoth_steppe.jpg",
        creatureIds: p === "NAM" ? ["mammoth", "smilodon"] : ["mammoth"],
        faunaHeader: "Ice Age Megafauna (Mammals — Dinosaurs Extinct 66 Myr Earlier)",
        faunaNote:
          landBridge === "Beringia Land Bridge"
            ? "Today's Bering Strait was a 1,600 km wide dry grassland bridge linking Siberia and Alaska—allowing Woolly Mammoths, Steppe Bison, and the first human ancestors of Indigenous Americans to cross."
            : landBridge === "Doggerland Exposed Plain"
            ? "Today's North Sea and English Channel were dry rolling tundra plains! You could walk directly from London to Paris or Amsterdam past herds of Woolly Mammoths and Woolly Rhinos."
            : "Earth's largest Ice Age biome stretched unbroken from France across Siberia to Alaska—dry, sunny, windswept herb-rich steppe supporting millions of Woolly Mammoths, Woolly Rhinos, Cave Lions, and Paleolithic Homo sapiens.",
        hotspots: [
          { x: 22, y: 66, title: "Woolly Mammoth Herd", detail: "Shaggy steppe giants sweeping snow away with curved ivory tusks to graze nutrient-rich dry grasses.", creatureId: "mammoth" },
          { x: 64, y: 34, title: "Distant Glacial Wall", detail: "Northern continental glaciers lock away ocean moisture, keeping the Mammoth Steppe crisp, dry, and snow-light." },
          { x: 50, y: 80, title: "Permafrost Steppe Flora", detail: "Dry sagebrush, sedges, and cold-hardy steppe grasses supported far greater wildlife biomass than modern boggy Arctic tundra." }
        ],
        evidence:
          "Frozen intact mammoths in Siberian permafrost, North Sea fishing trawlers dredging mammoth tusks from submerged Doggerland, and Paleolithic cave art at Lascaux & Chauvet directly record this world."
      };
    }

    // Lower-Latitude Americas, Africa, South Asia, Sundaland, Sahul (Pleistocene Savanna & Exposed Coastlines!)
    const regionName = landBridge
      ? `${landBridge} (Exposed -125 m Landmass!)`
      : p === "SAM"
      ? "Pleistocene Pampas & South American Savanna"
      : p === "NAM"
      ? "Ice Age Southern North America (La Brea Belt)"
      : p === "AUS"
      ? "Sahul Super-Australia Megafauna Plains"
      : p === "AFR" || p === "ARB"
      ? "Pleistocene African Savanna & Expanded Drylands"
      : "Pleistocene Tropical Plains & Exposed Coast";
    const tempC = Math.round(24 - alat * 0.26);
    return {
      environmentTitle: landBridge ? `Exposed Ice Age Landmass: ${landBridge}` : "Pleistocene Megafauna Savanna",
      paleoRegion: regionName,
      biomeType: "Cooler, Drier Glacial Savanna & Coastal Terrace",
      particleMode: "savanna",
      isUnderwater: false,
      localTempC: `${tempC}°C`,
      elevationLabel: landBridge ? "+20 m · Exposed Continental Shelf" : "+190 m · Savanna Plateau",
      scene: "assets/scenes/iceage_pleistocene_savanna.jpg",
      creatureIds: p === "NAM" || p === "SAM" ? ["smilodon", "mammoth"] : ["mammoth", "smilodon"],
      faunaHeader: "Ice Age Megafauna & Early Modern Humans",
      faunaNote:
        p === "NAM" || p === "SAM"
          ? "South of the ice sheets, La Brea and the South American Pampas teemed with Smilodon saber-toothed cats, Columbian Mammoths, car-sized Glyptodons, and elephant-sized Megatherium ground sloths."
          : p === "AUS"
          ? "With Australia, New Guinea, and Tasmania fused into 'Sahul', giant Diprotodon marsupials, marsupial lions (Thylacoleo), and early Aboriginal Australians shared drier interior grasslands."
          : "Even the tropics were ~4–5°C cooler and markedly drier during the Last Glacial Maximum—expanding golden savannas and exposing broad coastal terraces where early Homo sapiens thrived alongside giant elephants and big cats.",
      hotspots: [
        { x: 82, y: 62, title: "Smilodon / Megafauna Predator", detail: "Powerful Ice Age ambush felids (Smilodon in the Americas, Cave & African Lions in the Old World) stalking savanna herds.", creatureId: "smilodon" },
        { x: 54, y: 54, title: "Pleistocene Proboscideans", detail: "Columbian Mammoths in the Americas and colossal straight-tusked Palaeoloxodon elephants across Eurasia.", creatureId: "mammoth" },
        { x: 76, y: 24, title: "Lowered -125 m Coastline", detail: "Kilometers of modern seafloor lay exposed as coastal plains, connecting Sumatra, Java, and Borneo into Sundaland." }
      ],
      evidence:
        "La Brea asphalt deposits, submerged river valleys traced on Sundaland & Sahul sonar bathymetry, and pollen cores show expanded grasslands and rich megafauna across Ice Age low latitudes."
    };
  }
}

// =============================================================================
// Geographic & Spherical Math Helpers
// =============================================================================

export function latLonToVec(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

export function vecToLatLon(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const lat = Math.asin(clamp(z / len, -1, 1)) * RAD;
  const lon = Math.atan2(y, x) * RAD;
  return [lat, lon];
}

export function greatCircleKm(lat1, lon1, lat2, lon2) {
  const u = latLonToVec(lat1, lon1);
  const v = latLonToVec(lat2, lon2);
  const dot = clamp(u[0] * v[0] + u[1] * v[1] + u[2] * v[2], -1, 1);
  return Math.acos(dot) * EARTH_RADIUS_KM;
}

export function formatCoords(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export function formatLatOnly(lat) {
  const ns = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(1)}°${ns}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  return l;
}

function ellDome(lat, lon, clat, clon, rlat, rlon) {
  let dlon = lon - clon;
  if (dlon > 180) dlon -= 360;
  if (dlon < -180) dlon += 360;
  const d = Math.hypot((lat - clat) / rlat, dlon / rlon);
  return Math.max(0, Math.min(1, (1.05 - d) / 0.25));
}

function estimateLgmIce(lat, lon) {
  let f = 0;
  // Laurentide + Eastern Lobe (Canada, NYC/Boston/Chicago!)
  f = Math.max(f, ellDome(lat, lon, 59.5, -86.0, 19.5, 35.0));
  f = Math.max(f, ellDome(lat, lon, 48.0, -73.0, 8.0, 15.0));
  // Cordilleran
  f = Math.max(f, ellDome(lat, lon, 56.5, -124.0, 8.5, 12.5));
  // Greenland & Iceland
  f = Math.max(f, ellDome(lat, lon, 73.0, -43.0, 15.5, 34.0));
  f = Math.max(f, ellDome(lat, lon, 65.0, -19.0, 3.8, 7.5));
  // Fennoscandian & British-Irish (north of ~52.5N, keeping London ice-free!)
  f = Math.max(f, ellDome(lat, lon, 64.5, 22.0, 11.5, 22.0));
  f = Math.max(f, ellDome(lat, lon, 56.6, -4.5, 4.1, 5.2));
  // Alps & Patagonia & Antarctica
  f = Math.max(f, ellDome(lat, lon, 46.5, 10.2, 1.4, 4.2));
  f = Math.max(f, ellDome(lat, lon, -47.5, -72.0, 8.5, 2.5));
  if (lat < -63.5) f = 1;
  return f;
}

function getLgmLandBridge(lat, lon, plateCode) {
  if ((lon > 164 || lon < -158) && lat > 56 && lat < 70) return "Beringia Land Bridge";
  if (lon > -7 && lon < 9 && lat > 49.5 && lat < 57 && plateCode === "OCN") return "Doggerland Exposed Plain";
  if (lon > 98 && lon < 119 && lat > -7 && lat < 11 && plateCode === "OCN") return "Sundaland Exposed Continent";
  if (lon > 127 && lon < 148 && lat > -15 && lat < -5 && plateCode === "OCN") return "Sahul Shelf (Australia–New Guinea)";
  return null;
}

export function getCreatureById(id) {
  return CREATURES[id] || null;
}
