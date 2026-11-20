/**
 * DeepTime Earth — Paleontological, Geological & Geographic Reference Data
 * 5 Major Prehistoric Stages from Earth's Formation (4.4 Ga) to the Last Ice Age (20 ka)
 */

export const STAGES = [
  {
    id: "4400ma",
    index: 0,
    shortAge: "4.4 Ga",
    fullAge: "4.4 Billion Years Ago",
    name: "Hadean Earth",
    subtitle: "Birth of the Planet",
    eraTag: "Hadean Eon",
    hasDinosaurs: false,
    atmosphere: {
      o2: "0.0%",
      co2: "~100,000 ppm",
      seaLevel: "Proto-oceans forming",
      dayLength: "10.2 hrs",
      globalTemp: "+78°C",
      skyNote: "Dense orange CO₂, N₂ & steam haze · Moon 3× closer"
    },
    globe: {
      albedo: "assets/textures/earth_4400ma.jpg",
      normal: "assets/textures/earth_modern_normal.jpg",
      spec: "assets/textures/earth_modern_spec.jpg",
      emissive: "assets/textures/earth_4400ma_emissive.jpg",
      atmoColor: [1.0, 0.42, 0.14],
      cloudTint: [0.95, 0.56, 0.28],
      cloudOpacity: 0.48,
      moonDist: 2.45,
      moonScale: 0.34,
      specStrength: 0.15,
      emissiveStrength: 1.35
    },
    paleoLabels: [
      { lat: 18, lon: -32, text: "MAGMA RIFT BELT" },
      { lat: -22, lon: 55, text: "BASALTIC PROTO-CRUST" },
      { lat: 10, lon: 135, text: "PRIMORDIAL OCEAN BASIN" },
      { lat: -40, lon: -95, text: "LATE VENEER IMPACT BASIN" }
    ],
    summary:
      "Only ~150 million years after the Moon-forming giant impact, Earth's molten silicate mantle is beginning to solidify beneath a choking orange steam-and-CO₂ atmosphere. Jack Hills zircon crystals prove liquid water already pooled in scorching primordial basins under a gigantic looming Moon."
  },
  {
    id: "300ma",
    index: 1,
    shortAge: "300 Ma",
    fullAge: "300 Million Years Ago",
    name: "Carboniferous",
    subtitle: "Pangaea & Giant Swamps",
    eraTag: "Late Paleozoic",
    hasDinosaurs: false,
    atmosphere: {
      o2: "35.0%",
      co2: "320 ppm",
      seaLevel: "-30 m",
      dayLength: "22.4 hrs",
      globalTemp: "+12°C",
      skyNote: "Hyper-oxygenated air fuels giant arthropods & towering lycopsid forests"
    },
    globe: {
      albedo: "assets/textures/earth_300ma.jpg",
      normal: "assets/textures/earth_300ma_normal.jpg",
      spec: "assets/textures/earth_300ma_spec.jpg",
      emissive: null,
      atmoColor: [0.28, 0.62, 0.96],
      cloudTint: [0.96, 0.98, 1.0],
      cloudOpacity: 0.36,
      moonDist: 4.5,
      moonScale: 0.17,
      specStrength: 0.72,
      emissiveStrength: 0.0
    },
    paleoLabels: [
      { lat: 6, lon: -4, text: "PANGAEA (EQUATORIAL COAL BELT)" },
      { lat: -62, lon: 35, text: "GONDWANA ICE SHEET" },
      { lat: 15, lon: -120, text: "PANTHALASSIC OCEAN" },
      { lat: -10, lon: 78, text: "PALEO-TETHYS SEA" },
      { lat: 46, lon: 62, text: "SIBERIA" }
    ],
    summary:
      "Earth's continents have collided into the supercontinent Pangaea. While southern Gondwana (India, Australia, Southern Africa, South America, Antarctica) lies buried beneath a colossal South Polar ice sheet, North America and Europe straddle the Equator in steamy 35%-oxygen coal forests inhabited by eagle-sized dragonflies."
  },
  {
    id: "150ma",
    index: 2,
    shortAge: "150 Ma",
    fullAge: "150 Million Years Ago",
    name: "Late Jurassic",
    subtitle: "Age of Giant Sauropods",
    eraTag: "Dinosaur Era I",
    hasDinosaurs: true,
    atmosphere: {
      o2: "26.0%",
      co2: "1,950 ppm",
      seaLevel: "+110 m",
      dayLength: "23.2 hrs",
      globalTemp: "+21°C",
      skyNote: "Ice-free greenhouse planet · Pangaea rifting apart"
    },
    globe: {
      albedo: "assets/textures/earth_150ma.jpg",
      normal: "assets/textures/earth_150ma_normal.jpg",
      spec: "assets/textures/earth_150ma_spec.jpg",
      emissive: null,
      atmoColor: [0.30, 0.66, 0.98],
      cloudTint: [0.98, 0.97, 0.94],
      cloudOpacity: 0.32,
      moonDist: 4.9,
      moonScale: 0.15,
      specStrength: 0.75,
      emissiveStrength: 0.0
    },
    paleoLabels: [
      { lat: 34, lon: -56, text: "LAURASIA" },
      { lat: -24, lon: 5, text: "GONDWANA" },
      { lat: 18, lon: -26, text: "YOUNG ATLANTIC RIFT" },
      { lat: 16, lon: 68, text: "TETHYS OCEAN" },
      { lat: 40, lon: 14, text: "SOLNHOFEN ARCHIPELAGO" },
      { lat: 8, lon: -135, text: "PANTHALASSA" }
    ],
    summary:
      "Pangaea is tearing apart as the narrow Central Atlantic opens between North America and Africa. Warm ice-free climates, vast fern prairies, and conifer forests sustain the largest land animals to ever walk Earth—colossal sauropods hunted by Allosaurus beneath pterosaur-filled skies."
  },
  {
    id: "68ma",
    index: 3,
    shortAge: "68 Ma",
    fullAge: "68 Million Years Ago",
    name: "Late Cretaceous",
    subtitle: "Twilight of the Dinosaurs",
    eraTag: "Dinosaur Era II",
    hasDinosaurs: true,
    atmosphere: {
      o2: "29.0%",
      co2: "1,100 ppm",
      seaLevel: "+170 m",
      dayLength: "23.7 hrs",
      globalTemp: "+22°C",
      skyNote: "Peak sea levels split continents · Flowering plants bloom · 2 Myr before Chicxulub"
    },
    globe: {
      albedo: "assets/textures/earth_68ma.jpg",
      normal: "assets/textures/earth_68ma_normal.jpg",
      spec: "assets/textures/earth_68ma_spec.jpg",
      emissive: null,
      atmoColor: [0.27, 0.68, 0.98],
      cloudTint: [0.98, 0.98, 0.96],
      cloudOpacity: 0.33,
      moonDist: 5.1,
      moonScale: 0.14,
      specStrength: 0.78,
      emissiveStrength: 0.0
    },
    paleoLabels: [
      { lat: 46, lon: -102, text: "LARAMIDIA" },
      { lat: 44, lon: -84, text: "WESTERN INTERIOR SEAWAY" },
      { lat: 40, lon: -65, text: "APPALACHIA" },
      { lat: -20, lon: 66, text: "ISOLATED INDIA (DECCAN)" },
      { lat: 48, lon: 14, text: "EUROPEAN CHALK ARCHIPELAGO" },
      { lat: -74, lon: 25, text: "GREEN ANTARCTICA" }
    ],
    summary:
      "Just two million years before the Chicxulub asteroid impact, high seas flood continental interiors—splitting North America with the Mosasaurus-haunted Western Interior Seaway—while isolated island India erupts with Deccan flood basalts and Tyrannosaurus rex rules Laramidia."
  },
  {
    id: "20ka",
    index: 4,
    shortAge: "20 ka",
    fullAge: "20,000 Years Ago",
    name: "Last Ice Age",
    subtitle: "Glacial Maximum",
    eraTag: "Late Pleistocene",
    hasDinosaurs: false,
    atmosphere: {
      o2: "20.9%",
      co2: "185 ppm",
      seaLevel: "-125 m",
      dayLength: "24.0 hrs",
      globalTemp: "+8.5°C",
      skyNote: "3–4 km thick ice sheets lock away ocean water · Land bridges connect continents"
    },
    globe: {
      albedo: "assets/textures/earth_20ka.jpg",
      normal: "assets/textures/earth_20ka_normal.jpg",
      spec: "assets/textures/earth_20ka_spec.jpg",
      emissive: null,
      atmoColor: [0.38, 0.72, 1.0],
      cloudTint: [0.96, 0.98, 1.0],
      cloudOpacity: 0.34,
      moonDist: 5.3,
      moonScale: 0.13,
      specStrength: 0.72,
      emissiveStrength: 0.0
    },
    paleoLabels: [
      { lat: 56, lon: -88, text: "LAURENTIDE ICE SHEET" },
      { lat: 64, lon: 22, text: "FENNOSCANDIAN ICE SHEET" },
      { lat: 64, lon: -170, text: "BERINGIA LAND BRIDGE" },
      { lat: 54, lon: 3, text: "DOGGERLAND" },
      { lat: 3, lon: 108, text: "SUNDALAND" },
      { lat: -12, lon: 135, text: "SAHUL" }
    ],
    summary:
      "At the peak of the Last Glacial Maximum, colossal 3-kilometer-thick ice sheets bury Canada, New York, and Northern Europe. With global sea levels 125 meters lower than today, dry plains connect Asia to Alaska (Beringia), Britain to Europe (Doggerland), and Indonesia to mainland Asia (Sundaland)."
  }
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

/**
 * Photorealistic Dinosaur & Prehistoric Wildlife Profiles
 */
export const CREATURES = {
  trex: {
    id: "trex",
    name: "Tyrannosaurus rex",
    clade: "Tyrannosaurid Theropod",
    diet: "Apex Carnivore",
    lengthM: 12.3,
    heightM: 3.9,
    weightLabel: "8.8 tonnes",
    formation: "Hell Creek & Lance Formations",
    portrait: "assets/creatures/trex.jpg",
    note: "Possessed the strongest bite force of any terrestrial animal (~57,000 N), capable of crushing Triceratops bone, paired with binocular vision sharper than a modern eagle."
  },
  triceratops: {
    id: "triceratops",
    name: "Triceratops horridus",
    clade: "Ceratopsid Dinosaur",
    diet: "Herbivore",
    lengthM: 8.5,
    heightM: 3.0,
    weightLabel: "9.0 tonnes",
    formation: "Hell Creek Formation",
    portrait: "assets/creatures/triceratops.jpg",
    note: "Solid-bone neck frill and meter-long keratin-sheathed brow horns evolved for both rival combat and fending off Tyrannosaurus ambushes along coastal cypress rivers."
  },
  quetzalcoatlus: {
    id: "quetzalcoatlus",
    name: "Quetzalcoatlus northropi",
    clade: "Azhdarchid Pterosaur",
    diet: "Carnivore / Stalker",
    lengthM: 10.5,
    heightM: 5.2,
    weightLabel: "220 kg (10.5 m wingspan)",
    formation: "Javelina & Hateg Equivalents",
    portrait: "assets/creatures/quetzalcoatlus.jpg",
    note: "Standing as tall as a modern giraffe on folded wing-knuckles, giant azhdarchids stalked terrestrial floodplains snapping up juvenile dinosaurs before vaulting into soaring flight."
  },
  mosasaurus: {
    id: "mosasaurus",
    name: "Mosasaurus hoffmannii",
    clade: "Marine Squamate Reptile",
    diet: "Apex Marine Predator",
    lengthM: 15.0,
    heightM: 2.6,
    weightLabel: "14 tonnes",
    formation: "Pierre Shale & Maastricht Chalk",
    portrait: "assets/creatures/mosasaurus.jpg",
    note: "Not a dinosaur, but a colossal sea-going relative of monitor lizards with a shark-like tail fluke and double-hinged throat teeth patrolling the Western Interior Seaway and Tethys."
  },
  allosaurus: {
    id: "allosaurus",
    name: "Allosaurus fragilis",
    clade: "Allosauroid Theropod",
    diet: "Apex Carnivore",
    lengthM: 9.5,
    heightM: 3.2,
    weightLabel: "2.3 tonnes",
    formation: "Morrison & Lourinhã Formations",
    portrait: "assets/creatures/allosaurus.jpg",
    note: "The dominant Late Jurassic apex predator across Western North America and Iberia—fast, agile, and armed with hatchet-like slicing jaws and three-clawed grasping arms."
  },
  stegosaurus: {
    id: "stegosaurus",
    name: "Stegosaurus stenops",
    clade: "Stegosaurid Dinosaur",
    diet: "Low-Browser Herbivore",
    lengthM: 8.8,
    heightM: 4.0,
    weightLabel: "5.2 tonnes",
    formation: "Morrison Formation",
    portrait: "assets/creatures/stegosaurus.jpg",
    note: "Crowned with 17 vascularized bony dorsal plates for display and thermoregulation, and defended by a lethal four-spiked tail ('thagomizer') proven to have punctured Allosaurus vertebrae."
  },
  brachiosaurus: {
    id: "brachiosaurus",
    name: "Brachiosaurus / Giraffatitan",
    clade: "Macronarian Sauropod",
    diet: "High-Canopy Herbivore",
    lengthM: 23.0,
    heightM: 12.8,
    weightLabel: "38 tonnes",
    formation: "Morrison & Tendaguru Formations",
    portrait: "assets/creatures/brachiosaurus.jpg",
    note: "Towering four stories above Jurassic floodplains in both North America and East Africa, its longer forelimbs lifted its neck into the highest Araucaria conifer crowns."
  },
  archaeopteryx: {
    id: "archaeopteryx",
    name: "Archaeopteryx lithographica",
    clade: "Avialan Feathered Dinosaur",
    diet: "Insectivore / Small Prey",
    lengthM: 0.5,
    heightM: 0.3,
    weightLabel: "0.9 kg",
    formation: "Solnhofen Plattenkalk (Bavaria)",
    portrait: "assets/creatures/archaeopteryx.jpg",
    note: "Preserved with exquisite asymmetric flight feathers alongside clawed wings, bony tail, and reptilian teeth across Europe's tropical Late Jurassic limestone islands."
  },
  liopleurodon: {
    id: "liopleurodon",
    name: "Liopleurodon ferox",
    clade: "Pliosaurid Marine Reptile",
    diet: "Apex Marine Predator",
    lengthM: 7.0,
    heightM: 1.8,
    weightLabel: "3.5 tonnes",
    formation: "Oxford Clay & Kimmeridge Clay",
    portrait: "assets/creatures/liopleurodon.jpg",
    note: "Propelled by four immense hydrofoil flippers with directional underwater olfaction, pliosaurs ambushed ichthyosaurs and giant ammonites across Jurassic seas."
  },
  velociraptor: {
    id: "velociraptor",
    name: "Velociraptor mongoliensis",
    clade: "Dromaeosaurid Theropod",
    diet: "Agile Carnivore",
    lengthM: 2.0,
    heightM: 0.7,
    weightLabel: "18 kg",
    formation: "Djadokhta & Nemegt Formations",
    portrait: "assets/creatures/velociraptor.jpg",
    note: "Turkey-sized desert predator cloaked in insulating hawk-like feathers (proven by forearm quill knobs), using its curved sickle toe-claw to pin struggling Protoceratops prey."
  },
  carnotaurus: {
    id: "carnotaurus",
    name: "Carnotaurus sastrei",
    clade: "Abelisaurid Theropod",
    diet: "Pursuit Carnivore",
    lengthM: 7.8,
    heightM: 3.0,
    weightLabel: "1.8 tonnes",
    formation: "La Colonia Formation (Patagonia)",
    portrait: "assets/creatures/carnotaurus.jpg",
    note: "Built like a reptilian cheetah with massive tail-retractor thigh muscles, bull-like brow horns, pebble-armored skin, and tiny vestigial arms roaming Late Cretaceous South America."
  },
  rajasaurus: {
    id: "rajasaurus",
    name: "Rajasaurus narmadensis",
    clade: "Indian Abelisaurid",
    diet: "Apex Carnivore",
    lengthM: 7.0,
    heightM: 2.7,
    weightLabel: "2.2 tonnes",
    formation: "Lameta Formation (Narmada Valley)",
    portrait: "assets/creatures/rajasaurus.jpg",
    note: "Crowned with a distinctive horn-like nasal crest, Rajasaurus evolved in complete geographic isolation aboard the drifting Indian island continent amidst Deccan volcanic eruptions."
  },
  meganeura: {
    id: "meganeura",
    name: "Meganeura monyi",
    clade: "Giant Carboniferous Griffenfly",
    diet: "Aerial Insect Predator",
    lengthM: 0.72,
    heightM: 0.15,
    weightLabel: "70 cm wingspan",
    formation: "Commentry & Coal Measures",
    portrait: "assets/creatures/meganeura.jpg",
    note: "With 35% atmospheric oxygen supercharging insect tracheal respiration, hawk-sized griffenflies patrolled Pangaea's equatorial Lepidodendron swamps 70 million years before dinosaurs."
  },
  mammoth: {
    id: "mammoth",
    name: "Mammuthus primigenius",
    clade: "Pleistocene Proboscidean",
    diet: "Steppe Grazer",
    lengthM: 5.5,
    heightM: 3.3,
    weightLabel: "6.0 tonnes",
    formation: "Siberian & Beringian Permafrost",
    portrait: "assets/creatures/mammoth.jpg",
    note: "Engineered for -40°C Ice Age winds with meter-long outer guard hairs, dense wool undercoat, fat humps, and sweeping 4-meter tusks that cleared snow off dry Mammoth Steppe grasses."
  },
  smilodon: {
    id: "smilodon",
    name: "Smilodon fatalis",
    clade: "Machairodont Felid",
    diet: "Ambush Megafauna Predator",
    lengthM: 2.1,
    heightM: 1.0,
    weightLabel: "280 kg",
    formation: "La Brea Tar Pits & Pampas",
    portrait: "assets/creatures/smilodon.jpg",
    note: "Not built for long chases, the saber-toothed cat used bear-like forelimbs to wrestle bison, ground sloths, and juvenile mammoths to the ground before delivering a precision bite with 18 cm serrated canines."
  }
};

/**
 * Curated Modern Reference Cities & Iconic Fossil Sites
 * Used for Search Autocomplete & "Nearest Modern Reference" calculation
 */
export const MODERN_PLACES = [
  { name: "New York City", country: "USA", lat: 40.71, lon: -74.01, featured: true, tag: "Equatorial Pangaea → Ice Sheet Edge" },
  { name: "Montana (Hell Creek)", country: "USA", lat: 47.55, lon: -106.45, featured: true, tag: "T. rex & Triceratops Homeland" },
  { name: "Kansas (Seaway)", country: "USA", lat: 38.80, lon: -99.32, featured: true, tag: "Underwater Mosasaurus Sea at 68 Ma" },
  { name: "Mumbai", country: "India", lat: 19.08, lon: 72.88, featured: true, tag: "South Pole Glacier → Isolated Volcanic Island" },
  { name: "London", country: "UK", lat: 51.51, lon: -0.13, featured: true, tag: "Coal Swamp → Tropical Lagoon → Doggerland" },
  { name: "Patagonia (Neuquén)", country: "Argentina", lat: -38.95, lon: -68.06, featured: true, tag: "Carnotaurus & Colossal Titanosaurs" },
  { name: "Gobi Desert (Nemegt)", country: "Mongolia", lat: 43.50, lon: 101.05, featured: true, tag: "Feathered Velociraptor Badlands" },
  { name: "Antarctica (Peninsula)", country: "Antarctica", lat: -66.50, lon: -63.00, featured: true, tag: "Ice-Free Polar Dinosaur Rainforest" },
  { name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69, featured: false },
  { name: "Paris", country: "France", lat: 48.86, lon: 2.35, featured: false },
  { name: "Berlin", country: "Germany", lat: 52.52, lon: 13.40, featured: false },
  { name: "Bavaria (Solnhofen)", country: "Germany", lat: 48.89, lon: 10.99, featured: false },
  { name: "Cairo", country: "Egypt", lat: 30.04, lon: 31.24, featured: false },
  { name: "Sahara (Agadez)", country: "Niger", lat: 16.97, lon: 7.99, featured: false },
  { name: "Tendaguru", country: "Tanzania", lat: -9.67, lon: 39.21, featured: false },
  { name: "Nairobi", country: "Kenya", lat: -1.29, lon: 36.82, featured: false },
  { name: "Cape Town", country: "South Africa", lat: -33.92, lon: 18.42, featured: false },
  { name: "Antananarivo", country: "Madagascar", lat: -18.88, lon: 47.51, featured: false },
  { name: "Sydney", country: "Australia", lat: -33.87, lon: 151.21, featured: false },
  { name: "Melbourne (Dinosaur Cove)", country: "Australia", lat: -38.78, lon: 143.40, featured: false },
  { name: "Auckland", country: "New Zealand", lat: -36.85, lon: 174.76, featured: false },
  { name: "Beijing", country: "China", lat: 39.90, lon: 116.41, featured: false },
  { name: "Sichuan Basin", country: "China", lat: 30.66, lon: 104.07, featured: false },
  { name: "Singapore (Sundaland)", country: "Singapore", lat: 1.35, lon: 103.82, featured: false },
  { name: "Jakarta", country: "Indonesia", lat: -6.21, lon: 106.85, featured: false },
  { name: "New Delhi", country: "India", lat: 28.61, lon: 77.21, featured: false },
  { name: "Dubai", country: "UAE", lat: 25.20, lon: 55.27, featured: false },
  { name: "Moscow", country: "Russia", lat: 55.75, lon: 37.62, featured: false },
  { name: "Yakutsk (Mammoth Steppe)", country: "Russia", lat: 62.03, lon: 129.73, featured: false },
  { name: "Bering Strait (Beringia)", country: "Alaska / Siberia", lat: 65.70, lon: -168.50, featured: false },
  { name: "Anchorage", country: "USA", lat: 61.22, lon: -149.90, featured: false },
  { name: "Los Angeles (La Brea)", country: "USA", lat: 34.06, lon: -118.36, featured: false },
  { name: "Denver (Morrison)", country: "USA", lat: 39.65, lon: -105.19, featured: false },
  { name: "Chicago", country: "USA", lat: 41.88, lon: -87.63, featured: false },
  { name: "Toronto", country: "Canada", lat: 43.65, lon: -79.38, featured: false },
  { name: "Calgary (Badlands)", country: "Canada", lat: 51.05, lon: -114.07, featured: false },
  { name: "Mexico City", country: "Mexico", lat: 19.43, lon: -99.13, featured: false },
  { name: "Chicxulub (Yucatán)", country: "Mexico", lat: 21.30, lon: -89.50, featured: false },
  { name: "Rio de Janeiro", country: "Brazil", lat: -22.91, lon: -43.17, featured: false },
  { name: "Manaus (Amazon)", country: "Brazil", lat: -3.12, lon: -60.02, featured: false },
  { name: "Lima", country: "Peru", lat: -12.05, lon: -77.04, featured: false },
  { name: "Reykjavík", country: "Iceland", lat: 64.15, lon: -21.94, featured: false },
  { name: "Oslo", country: "Norway", lat: 59.91, lon: 10.75, featured: false },
  { name: "Madrid", country: "Spain", lat: 40.42, lon: -3.70, featured: false },
  { name: "Rome", country: "Italy", lat: 41.90, lon: 12.50, featured: false },
  { name: "Bucharest (Hateg Basin)", country: "Romania", lat: 45.60, lon: 22.95, featured: false },
  { name: "Istanbul", country: "Turkey", lat: 41.01, lon: 28.98, featured: false },
  { name: "Honolulu (Pacific)", country: "USA", lat: 21.31, lon: -157.86, featured: false },
  { name: "Nuuk", country: "Greenland", lat: 64.18, lon: -51.72, featured: false },
  { name: "McMurdo (Antarctica)", country: "Antarctica", lat: -77.85, lon: 166.67, featured: false },
  { name: "North Atlantic Ocean", country: "Open Ocean", lat: 36.0, lon: -40.0, featured: false },
  { name: "Central Pacific Ocean", country: "Open Ocean", lat: 5.0, lon: -140.0, featured: false },
  { name: "Indian Ocean", country: "Open Ocean", lat: -20.0, lon: 80.0, featured: false }
];
