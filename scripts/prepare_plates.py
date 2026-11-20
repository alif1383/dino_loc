#!/usr/bin/env python3
"""
Prepares all visual assets, Natural Earth tectonic plate masks, and exact
3D Euler finite rotation matrices for DeepTime Earth.
"""
import glob
import json
import math
import os
from PIL import Image, ImageDraw, ImageFilter

BRAIN_DIR = "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/5bf92cd8-694c-4c03-ac60-a5ec71173c2e"
REPO_DIR = "/home/antigravity/alif1383/dino_loc"

# 15 Continental Plates + 0 = Oceanic Crust
PLATES = [
    {"id": 0,  "code": "OCN", "name": "Oceanic Crust",             "centroid": [0.0, 0.0]},
    {"id": 1,  "code": "NAM", "name": "North American Plate",      "centroid": [45.0, -98.0]},
    {"id": 2,  "code": "GRN", "name": "Greenland Craton",          "centroid": [72.0, -42.0]},
    {"id": 3,  "code": "SAM", "name": "South American Plate",      "centroid": [-16.0, -59.0]},
    {"id": 4,  "code": "EUR", "name": "European / Baltica Plate",  "centroid": [52.0, 16.0]},
    {"id": 5,  "code": "SIB", "name": "Siberian / Eurasian Plate", "centroid": [61.0, 100.0]},
    {"id": 6,  "code": "EAS", "name": "East Asian / Cathaysia",    "centroid": [33.0, 108.0]},
    {"id": 7,  "code": "SEA", "name": "Sundaland Plate",           "centroid": [1.0, 112.0]},
    {"id": 8,  "code": "AFR", "name": "African Plate",             "centroid": [3.0, 20.0]},
    {"id": 9,  "code": "ARB", "name": "Arabian Plate",             "centroid": [24.0, 45.0]},
    {"id": 10, "code": "IND", "name": "Indian Plate",              "centroid": [21.0, 79.0]},
    {"id": 11, "code": "MAD", "name": "Madagascar Block",          "centroid": [-19.0, 47.0]},
    {"id": 12, "code": "AUS", "name": "Australian / Sahul Plate",  "centroid": [-24.0, 134.0]},
    {"id": 13, "code": "NZL", "name": "Zealandia Block",           "centroid": [-41.5, 173.0]},
    {"id": 14, "code": "ANT", "name": "Antarctic Plate",           "centroid": [-82.0, 20.0]},
    {"id": 15, "code": "ISL", "name": "Icelandic Hotspot",         "centroid": [65.0, -18.5]},
]

PLATE_BY_CODE = {p["code"]: p for p in PLATES}

# Paleogeographic target positions: [targetLat, targetLon, spinDeg]
# Derived from Scotese PALEOMAP & Matthews et al. (2016) GPlates reconstructions.
# spinDeg > 0 rotates counterclockwise around destination surface normal.
ERA_TARGETS = {
    "4400ma": {
        # Hadean proto-crust: modern continents did not exist; proto-cratonic nuclei scattered
        "NAM": [14.0, -40.0, -25.0],
        "GRN": [28.0, -18.0, -15.0],
        "SAM": [-35.0, -70.0, 20.0],
        "EUR": [22.0, 42.0, -30.0],
        "SIB": [-10.0, 125.0, 40.0],
        "EAS": [38.0, 145.0, -20.0],
        "SEA": [-24.0, 160.0, 15.0],
        "AFR": [-18.0, 5.0, -10.0],
        "ARB": [-5.0, 30.0, -10.0],
        "IND": [-48.0, 88.0, -45.0],
        "MAD": [-32.0, 48.0, -20.0],
        "AUS": [-42.0, 130.0, -35.0],
        "NZL": [-56.0, 165.0, -25.0],
        "ANT": [-68.0, -110.0, 30.0],
        "ISL": [45.0, -15.0, 0.0],
    },
    "300ma": {
        # Late Carboniferous: Supercontinent Pangaea assembling across Equator -> South Pole!
        "AFR": [-29.0, 16.0, -14.0],
        "ARB": [-16.0, 41.0, -16.0],
        "SAM": [-39.0, -20.0, 24.0],
        "NAM": [11.0, -25.0, -32.0],
        "GRN": [33.0, 7.0, -26.0],
        "EUR": [16.0, 26.0, -22.0],
        "SIB": [46.0, 62.0, 12.0],
        "EAS": [14.0, 102.0, -14.0],
        "SEA": [-10.0, 114.0, -10.0],
        "MAD": [-46.0, 38.0, -20.0],
        "IND": [-55.0, 56.0, -36.0],
        "ANT": [-75.0, 56.0, -22.0],
        "AUS": [-50.0, 102.0, -28.0],
        "NZL": [-62.0, 136.0, -26.0],
        "ISL": [28.0, 12.0, -22.0],
    },
    "150ma": {
        # Late Jurassic: Pangaea rifting! Narrow Central Atlantic opens between NAM & NW Africa.
        "AFR": [-10.0, 18.0, -10.0],
        "ARB": [6.0, 43.0, -12.0],
        "SAM": [-25.0, -20.0, 20.0],
        "NAM": [31.0, -58.0, -22.0],
        "GRN": [53.0, -17.0, -18.0],
        "EUR": [39.0, 19.0, -10.0],
        "SIB": [55.0, 82.0, -4.0],
        "EAS": [31.0, 100.0, -8.0],
        "SEA": [2.0, 112.0, -5.0],
        "MAD": [-34.0, 42.0, -14.0],
        "IND": [-44.0, 58.0, -30.0],
        "ANT": [-78.0, 40.0, -14.0],
        "AUS": [-52.0, 110.0, -24.0],
        "NZL": [-66.0, 145.0, -20.0],
        "ISL": [50.0, -6.0, -15.0],
    },
    "68ma": {
        # Late Cretaceous (Maastrichtian): Western Interior Seaway, isolated island India!
        "AFR": [-2.0, 19.0, -5.0],
        "ARB": [16.0, 44.0, -6.0],
        "SAM": [-18.0, -47.0, 8.0],
        "NAM": [46.0, -81.0, -12.0],
        "GRN": [66.0, -30.0, -10.0],
        "EUR": [47.0, 18.0, -3.0],
        "SIB": [60.0, 95.0, -1.0],
        "EAS": [34.0, 105.0, -3.0],
        "SEA": [0.0, 114.0, -2.0],
        "MAD": [-25.0, 46.0, -4.0],
        "IND": [-20.0, 66.0, -22.0],
        "ANT": [-81.0, 24.0, -6.0],
        "AUS": [-45.0, 126.0, -12.0],
        "NZL": [-56.0, 162.0, -10.0],
        "ISL": [62.0, -16.0, -5.0],
    },
    "20ka": {
        # Last Glacial Maximum: Modern plate positions (sea level -125m & ice sheets change shape!)
        p["code"]: [p["centroid"][0], p["centroid"][1], 0.0] for p in PLATES if p["id"] > 0
    },
}


def latlon_to_vec(lat_deg, lon_deg):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    cl = math.cos(lat)
    return (cl * math.cos(lon), cl * math.sin(lon), math.sin(lat))


def vec_norm(v):
    l = math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
    if l < 1e-12:
        return (0.0, 0.0, 1.0)
    return (v[0]/l, v[1]/l, v[2]/l)


def vec_cross(a, b):
    return (
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    )


def vec_dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]


def axis_angle_matrix(axis, angle_rad):
    ux, uy, uz = vec_norm(axis)
    c = math.cos(angle_rad)
    s = math.sin(angle_rad)
    t = 1.0 - c
    return [
        [t*ux*ux + c,      t*ux*uy - s*uz, t*ux*uz + s*uy],
        [t*ux*uy + s*uz,   t*uy*uy + c,    t*uy*uz - s*ux],
        [t*ux*uz - s*uy,   t*uy*uz + s*ux, t*uz*uz + c   ],
    ]


def mat_mul(A, B):
    return [
        [sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)]
        for i in range(3)
    ]


def compute_plate_rotation(src_lat, src_lon, dst_lat, dst_lon, spin_deg):
    u0 = latlon_to_vec(src_lat, src_lon)
    u1 = latlon_to_vec(dst_lat, dst_lon)
    dot = max(-1.0, min(1.0, vec_dot(u0, u1)))
    angle = math.acos(dot)
    if angle < 1e-6:
        R_trans = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    else:
        axis = vec_cross(u0, u1)
        R_trans = axis_angle_matrix(axis, angle)
    if abs(spin_deg) < 1e-6:
        R_spin = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    else:
        R_spin = axis_angle_matrix(u1, math.radians(spin_deg))
    R = mat_mul(R_spin, R_trans)
    return R


def classify_country(props):
    iso = (props.get("ADM0_A3") or props.get("ISO_A3") or "").upper()
    name = (props.get("NAME") or "").lower()
    cont = (props.get("CONTINENT") or "").lower()

    if iso == "GRL" or "greenland" in name:
        return "GRN"
    if iso == "ISL" or "iceland" in name:
        return "ISL"
    if iso == "MDG" or "madagascar" in name:
        return "MAD"
    if iso == "NZL" or "new zealand" in name:
        return "NZL"
    if iso == "ATA" or "antarctica" in cont:
        return "ANT"
    if iso in ("IND", "LKA", "BGD", "NPL", "BTN") or "india" in name:
        return "IND"
    if iso == "PAK":
        return "IND"
    if iso in ("SAU", "YEM", "OMN", "ARE", "QAT", "KWT", "IRQ", "SYR", "JOR", "ISR", "PSE", "LBN", "BHR"):
        return "ARB"
    if iso in ("AUS", "PNG", "SLB", "VUT", "NCL", "FJI", "TLS"):
        return "AUS"
    if iso in ("IDN", "PHL", "MYS", "BRN", "SGP"):
        return "SEA"
    if iso in ("CHN", "TWN", "JPN", "KOR", "PRK", "VNM", "THA", "MMR", "LAO", "KHM"):
        return "EAS"
    if iso in ("RUS", "KAZ", "MNG", "UZB", "TKM", "KGZ", "TJK", "AFG", "IRN", "AZE", "ARM", "GEO"):
        return "SIB"
    if "north america" in cont:
        return "NAM"
    if "south america" in cont:
        return "SAM"
    if "africa" in cont:
        return "AFR"
    if "europe" in cont or iso in ("TUR", "CYP"):
        return "EUR"
    if "oceania" in cont:
        return "AUS"
    return "EAS"


def rasterize_plates(width, height):
    """Rasterizes Natural Earth countries to a plate-ID image (0 = ocean, 1..15 = plates)."""
    gj = json.load(open(os.path.join(REPO_DIR, "raw_data/ne_110m_countries.geojson")))
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)

    def to_px(lon, lat):
        x = (lon + 180.0) / 360.0 * width
        y = (90.0 - lat) / 180.0 * height
        return (x, y)

    for feat in gj["features"]:
        code = classify_country(feat["properties"])
        pid = PLATE_BY_CODE[code]["id"]
        geom = feat["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for poly in polys:
            outer = poly[0]
            # Handle antimeridian wrap cleanly by checking lon jumps
            pts = [to_px(lon, lat) for lon, lat in outer]
            if len(pts) >= 3:
                draw.polygon(pts, fill=pid)

    # Refine Russia split along curving Ural Mountains arc (~58..64E) and West Papua (>131E -> AUS/Sahul)
    px = img.load()
    papua_x = int((131.0 + 180.0) / 360.0 * width)
    eur_id = PLATE_BY_CODE["EUR"]["id"]
    sib_id = PLATE_BY_CODE["SIB"]["id"]
    sea_id = PLATE_BY_CODE["SEA"]["id"]
    aus_id = PLATE_BY_CODE["AUS"]["id"]
    lat35_y = int((90.0 - 35.0) / 180.0 * height)
    lat12_y = int((90.0 - 12.0) / 180.0 * height)

    for y in range(height):
        lat = 90.0 - (y + 0.5) / height * 180.0
        ural_lon = 59.5 + 3.2 * math.sin((lat - 54.0) * 0.22) + 1.4 * math.cos((lat - 45.0) * 0.55)
        ural_x = int((ural_lon + 180.0) / 360.0 * width)
        for x in range(width):
            v = px[x, y]
            if v == sib_id and x < ural_x and y < lat35_y:
                px[x, y] = eur_id
            elif v == sea_id and x >= papua_x and y > lat12_y:
                px[x, y] = aus_id

    # Slight dilation of 1px at high-res isn't needed; save clean plate mask
    return img


def copy_and_optimize_assets():
    print("Optimizing photorealistic scenes and portraits...")
    scenes_map = {
        "hadean_magma_coast": "hadean_magma_coast",
        "hadean_ocean_vents": "hadean_ocean_vents",
        "carboniferous_coal_swamp": "carboniferous_coal_swamp",
        "carboniferous_gondwana_glacier": "carboniferous_gondwana_glacier",
        "paleozoic_ocean_reef": "paleozoic_ocean_reef",
        "jurassic_sauropod_floodplain": "jurassic_sauropod_floodplain",
        "jurassic_conifer_highlands": "jurassic_conifer_highlands",
        "jurassic_tethys_archipelago": "jurassic_tethys_archipelago",
        "jurassic_open_ocean": "jurassic_open_ocean",
        "cretaceous_laramidia_forest": "cretaceous_laramidia_forest",
        "cretaceous_patagonia_gondwana": "cretaceous_patagonia_gondwana",
        "cretaceous_deccan_india": "cretaceous_deccan_india",
        "cretaceous_interior_seaway": "cretaceous_interior_seaway",
        "cretaceous_polar_forest": "cretaceous_polar_forest",
        "cretaceous_mongolia_badlands": "cretaceous_mongolia_badlands",
        "iceage_mammoth_steppe": "iceage_mammoth_steppe",
        "iceage_laurentide_glacier": "iceage_laurentide_glacier",
        "iceage_pleistocene_savanna": "iceage_pleistocene_savanna",
        "iceage_glacial_ocean": "iceage_glacial_ocean",
    }
    for prefix, out_name in scenes_map.items():
        matches = sorted(glob.glob(os.path.join(BRAIN_DIR, f"{prefix}_*.jpg")))
        if not matches:
            raise FileNotFoundError(f"Missing generated scene: {prefix}")
        im = Image.open(matches[-1]).convert("RGB")
        im = im.resize((1360, 765), Image.Resampling.LANCZOS)
        out_path = os.path.join(REPO_DIR, "assets/scenes", f"{out_name}.jpg")
        im.save(out_path, "JPEG", quality=86, optimize=True, progressive=True)

    creatures_map = {
        "dino_trex_portrait": "trex",
        "dino_triceratops_portrait": "triceratops",
        "dino_mosasaurus_portrait": "mosasaurus",
        "dino_allosaurus_portrait": "allosaurus",
        "dino_stegosaurus_portrait": "stegosaurus",
        "dino_brachiosaurus_portrait": "brachiosaurus",
        "dino_velociraptor_portrait": "velociraptor",
        "dino_carnotaurus_portrait": "carnotaurus",
        "dino_rajasaurus_portrait": "rajasaurus",
        "dino_archaeopteryx_portrait": "archaeopteryx",
        "dino_liopleurodon_portrait": "liopleurodon",
        "dino_quetzalcoatlus_portrait": "quetzalcoatlus",
        "creature_meganeura_portrait": "meganeura",
        "creature_mammoth_portrait": "mammoth",
        "creature_smilodon_portrait": "smilodon",
    }
    for prefix, out_name in creatures_map.items():
        matches = sorted(glob.glob(os.path.join(BRAIN_DIR, f"{prefix}_*.jpg")))
        if not matches:
            raise FileNotFoundError(f"Missing generated portrait: {prefix}")
        im = Image.open(matches[-1]).convert("RGB")
        im = im.resize((600, 400), Image.Resampling.LANCZOS)
        out_path = os.path.join(REPO_DIR, "assets/creatures", f"{out_name}.jpg")
        im.save(out_path, "JPEG", quality=85, optimize=True, progressive=True)

    # Copy NASA Modern Earth textures
    for src, dst, sz in [
        ("raw_data/earth_modern.jpg",   "assets/textures/earth_modern.jpg", (2048, 1024)),
        ("raw_data/earth_normal.jpg",   "assets/textures/earth_modern_normal.jpg", (2048, 1024)),
        ("raw_data/earth_specular.jpg", "assets/textures/earth_modern_spec.jpg", (2048, 1024)),
        ("raw_data/moon_1024.jpg",      "assets/textures/moon.jpg", (1024, 512)),
    ]:
        im = Image.open(os.path.join(REPO_DIR, src)).convert("RGB")
        if im.size != sz:
            im = im.resize(sz, Image.Resampling.LANCZOS)
        im.save(os.path.join(REPO_DIR, dst), "JPEG", quality=88, optimize=True)

    # Clouds PNG
    cl = Image.open(os.path.join(REPO_DIR, "raw_data/earth_clouds.png")).convert("RGBA")
    cl.save(os.path.join(REPO_DIR, "assets/textures/earth_clouds.png"), "PNG", optimize=True)

    # Process Hadean protoplanet seamless 2048x1024 + emissive lava glow mask + amber clouds
    h_matches = sorted(glob.glob(os.path.join(BRAIN_DIR, "hadean_protoplanet_map_*.jpg")))
    him = Image.open(h_matches[-1]).convert("RGB").resize((2048, 1024), Image.Resampling.LANCZOS)
    # Seamless horizontal edge blend across 96px wrap zone so there's zero seam on the 3D sphere!
    hpx = him.load()
    blend_w = 96
    for y in range(1024):
        for i in range(blend_w):
            t = 0.5 * (1.0 - math.cos(math.pi * i / blend_w))  # 0 at seam -> 1 inside
            # Blend left edge with mirrored wrap from right edge
            r1, g1, b1 = hpx[i, y]
            r2, g2, b2 = hpx[2047 - blend_w + i, y]
            # Average seamlessly near x=0 and x=2047
            alpha = i / float(blend_w)
            nr = int(r1 * (0.5 + 0.5 * alpha) + r2 * (0.5 - 0.5 * alpha))
            ng = int(g1 * (0.5 + 0.5 * alpha) + g2 * (0.5 - 0.5 * alpha))
            nb = int(b1 * (0.5 + 0.5 * alpha) + b2 * (0.5 - 0.5 * alpha))
            hpx[i, y] = (nr, ng, nb)
            r3, g3, b3 = hpx[2047 - i, y]
            r4, g4, b4 = hpx[blend_w - 1 - i, y]
            hpx[2047 - i, y] = (
                int(r3 * (0.5 + 0.5 * alpha) + r4 * (0.5 - 0.5 * alpha)),
                int(g3 * (0.5 + 0.5 * alpha) + g4 * (0.5 - 0.5 * alpha)),
                int(b3 * (0.5 + 0.5 * alpha) + b4 * (0.5 - 0.5 * alpha)),
            )

    him.save(os.path.join(REPO_DIR, "assets/textures/earth_4400ma.jpg"), "JPEG", quality=88, optimize=True)

    # Extract glowing incandescent lava mask for Hadean emissive lighting!
    em = Image.new("RGB", (2048, 1024))
    epx = em.load()
    for y in range(1024):
        for x in range(2048):
            r, g, b = hpx[x, y]
            # Glowing lava is strongly warm orange-red (r >> b and bright r)
            heat = max(0, (r - b) - 55)
            if heat > 0 and r > 110:
                scale = min(1.0, heat / 130.0)
                epx[x, y] = (int(r * scale), int(g * scale * 0.85), int(b * scale * 0.35))
            else:
                epx[x, y] = (0, 0, 0)
    em = em.filter(ImageFilter.GaussianBlur(radius=1.2))
    em.save(os.path.join(REPO_DIR, "assets/textures/earth_4400ma_emissive.jpg"), "JPEG", quality=85, optimize=True)

    # Also save modern raw binary RGB for fast C99 synthesis
    modern_rgb = Image.open(os.path.join(REPO_DIR, "assets/textures/earth_modern.jpg")).convert("RGB")
    modern_spec = Image.open(os.path.join(REPO_DIR, "assets/textures/earth_modern_spec.jpg")).convert("L")
    modern_norm = Image.open(os.path.join(REPO_DIR, "assets/textures/earth_modern_normal.jpg")).convert("RGB")
    with open(os.path.join(REPO_DIR, "raw_data/earth_modern.rgb"), "wb") as f:
        f.write(modern_rgb.tobytes())
    with open(os.path.join(REPO_DIR, "raw_data/earth_modern_spec.gray"), "wb") as f:
        f.write(modern_spec.tobytes())
    with open(os.path.join(REPO_DIR, "raw_data/earth_modern_norm.rgb"), "wb") as f:
        f.write(modern_norm.tobytes())

    print("Copied & optimized all 19 scenes, 15 creature portraits, and NASA/Hadean base textures!")


def export_plates_and_matrices():
    print("Rasterizing Natural Earth tectonic plates...")
    mask_2048 = rasterize_plates(2048, 1024)
    mask_2048.save(os.path.join(REPO_DIR, "raw_data/plate_mask_2048.png"))
    with open(os.path.join(REPO_DIR, "raw_data/plate_mask_2048.gray"), "wb") as f:
        f.write(mask_2048.tobytes())

    # 360x180 (1-degree) RLE grid for lightweight O(1) JS runtime plate lookup!
    mask_360 = rasterize_plates(360, 180)
    raw_bytes = list(mask_360.tobytes())
    rle = []
    cur = raw_bytes[0]
    cnt = 1
    for b in raw_bytes[1:]:
        if b == cur:
            cnt += 1
        else:
            rle.append(cur)
            rle.append(cnt)
            cur = b
            cnt = 1
    rle.append(cur)
    rle.append(cnt)

    # Compute exact 3x3 Euler rotation matrices for every plate & era
    matrices_json = {}
    c_lines = []
    for era_id, targets in ERA_TARGETS.items():
        matrices_json[era_id] = {}
        for p in PLATES:
            if p["id"] == 0:
                R = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            else:
                src_lat, src_lon = p["centroid"]
                dst_lat, dst_lon, spin = targets[p["code"]]
                R = compute_plate_rotation(src_lat, src_lon, dst_lat, dst_lon, spin)
            flat = [round(R[i][j], 7) for i in range(3) for j in range(3)]
            matrices_json[era_id][p["code"]] = flat
            c_lines.append(f"{era_id} {p['id']} " + " ".join(f"{v:.7f}" for v in flat))

    out_data = {
        "gridWidth": 360,
        "gridHeight": 180,
        "plates": PLATES,
        "rotations": matrices_json,
        "rle": rle,
    }
    with open(os.path.join(REPO_DIR, "data/plates_data.json"), "w") as f:
        json.dump(out_data, f, separators=(",", ":"))

    with open(os.path.join(REPO_DIR, "raw_data/plate_matrices.txt"), "w") as f:
        f.write("\n".join(c_lines) + "\n")

    print(f"Exported data/plates_data.json ({os.path.getsize(os.path.join(REPO_DIR, 'data/plates_data.json'))/1024:.1f} KB, RLE len={len(rle)})")


if __name__ == "__main__":
    copy_and_optimize_assets()
    export_plates_and_matrices()
