#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define W 2048
#define H 1024
#define NUM_PLATES 16
#define PI 3.14159265358979323846

typedef struct {
    double m[9]; // forward rotation R (modern -> paleo)
    double inv[9]; // inverse rotation R^T (paleo -> modern)
} Mat3;

// Fast deterministic 3D value noise on sphere (zero seams, zero polar pinch)
static inline uint32_t hash3(int x, int y, int z) {
    uint32_t h = (uint32_t)(x * 374761393 + y * 668265263 + z * 2147483647);
    h = (h ^ (h >> 13)) * 1274126177u;
    return h ^ (h >> 16);
}

static inline float rand01(int x, int y, int z) {
    return (hash3(x, y, z) & 0xFFFFFF) / 16777216.0f;
}

static inline float smooth(float t) {
    return t * t * (3.0f - 2.0f * t);
}

static inline float lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

static float noise3(float x, float y, float z) {
    int xi = (int)floorf(x), yi = (int)floorf(y), zi = (int)floorf(z);
    float xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);

    float c000 = rand01(xi, yi, zi),     c100 = rand01(xi+1, yi, zi);
    float c010 = rand01(xi, yi+1, zi),   c110 = rand01(xi+1, yi+1, zi);
    float c001 = rand01(xi, yi, zi+1),   c101 = rand01(xi+1, yi, zi+1);
    float c011 = rand01(xi, yi+1, zi+1), c111 = rand01(xi+1, yi+1, zi+1);

    float x00 = lerp(c000, c100, xf);
    float x10 = lerp(c010, c110, xf);
    float x01 = lerp(c001, c101, xf);
    float x11 = lerp(c011, c111, xf);

    float y0 = lerp(x00, x10, yf);
    float y1 = lerp(x01, x11, yf);
    return lerp(y0, y1, zf);
}

static float fbm3(float x, float y, float z, int octaves) {
    float val = 0.0f, amp = 0.5f, freq = 1.0f;
    for (int i = 0; i < octaves; i++) {
        val += amp * noise3(x * freq, y * freq, z * freq);
        freq *= 2.04f;
        amp *= 0.5f;
    }
    return val;
}

static inline uint8_t clamp8(float v) {
    if (v < 0.0f) return 0;
    if (v > 255.0f) return 255;
    return (uint8_t)(v + 0.5f);
}

static inline float clampf(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static inline float smoothstep(float e0, float e1, float x) {
    float t = clampf((x - e0) / (e1 - e0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

// Compute distance blur of a binary land mask for bathymetric continental shelf shading
static void compute_shelf_dist(const uint8_t *land, float *shelf_out) {
    // Multi-pass fast box/separable blur of binary land mask (0..1)
    float *tmp = (float *)malloc(W * H * sizeof(float));
    for (int i = 0; i < W * H; i++) shelf_out[i] = land[i] ? 1.0f : 0.0f;

    int radii[3] = {6, 14, 24};
    for (int p = 0; p < 3; p++) {
        int r = radii[p];
        float inv = 1.0f / (2 * r + 1);
        // Horizontal pass (periodic wrap)
        for (int y = 0; y < H; y++) {
            float sum = 0.0f;
            for (int dx = -r; dx <= r; dx++) {
                int xx = (dx + W) % W;
                sum += shelf_out[y * W + xx];
            }
            for (int x = 0; x < W; x++) {
                tmp[y * W + x] = sum * inv;
                int x_add = (x + r + 1) % W;
                int x_sub = (x - r + W) % W;
                sum += shelf_out[y * W + x_add] - shelf_out[y * W + x_sub];
            }
        }
        // Vertical pass
        for (int x = 0; x < W; x++) {
            float sum = 0.0f;
            for (int dy = -r; dy <= r; dy++) {
                int yy = dy < 0 ? 0 : (dy >= H ? H - 1 : dy);
                sum += tmp[yy * W + x];
            }
            for (int y = 0; y < H; y++) {
                shelf_out[y * W + x] = sum * inv;
                int y_add = y + r + 1; if (y_add >= H) y_add = H - 1;
                int y_sub = y - r;     if (y_sub < 0) y_sub = 0;
                sum += tmp[y_add * W + x] - tmp[y_sub * W + x];
            }
        }
    }
    free(tmp);
}

// Generate normal map from scalar heightfield
static void compute_normal_map(const float *height, uint8_t *norm_rgb, float strength) {
    for (int y = 0; y < H; y++) {
        int ym = y > 0 ? y - 1 : 0;
        int yp = y < H - 1 ? y + 1 : H - 1;
        for (int x = 0; x < W; x++) {
            int xm = (x - 1 + W) % W;
            int xp = (x + 1) % W;
            float dx = (height[y * W + xp] - height[y * W + xm]) * strength;
            float dy = (height[yp * W + x] - height[ym * W + x]) * strength;
            float nx = -dx, ny = -dy, nz = 1.0f;
            float len = sqrtf(nx*nx + ny*ny + nz*nz);
            nx /= len; ny /= len; nz /= len;
            int idx = (y * W + x) * 3;
            norm_rgb[idx + 0] = clamp8((nx * 0.5f + 0.5f) * 255.0f);
            norm_rgb[idx + 1] = clamp8((ny * 0.5f + 0.5f) * 255.0f);
            norm_rgb[idx + 2] = clamp8((nz * 0.5f + 0.5f) * 255.0f);
        }
    }
}

// Check if modern (lat, lon) is flooded by epicontinental seaways in era
static int is_flooded_seaway(int era_idx, int pid, float mlat, float mlon, float n_coast) {
    // era_idx: 0 = 300ma, 1 = 150ma, 2 = 68ma, 3 = 20ka
    if (pid == 15) {
        // Iceland did not exist before ~20 Ma
        if (era_idx < 3) return 1;
    }
    if (era_idx == 1) {
        // 150 Ma Late Jurassic:
        // Flood low-lying Western/Central Europe into Solnhofen/Kimmeridge island archipelago!
        if (pid == 4 && mlat > 41.0f && mlat < 58.0f && mlon > -10.0f && mlon < 35.0f) {
            if (n_coast < 0.54f) return 1;
        }
        // Sundance Sea inland margin in Western US/Canada
        if (pid == 1 && mlat > 39.0f && mlat < 60.0f && mlon > -114.0f && mlon < -102.0f) {
            if (n_coast < 0.48f) return 1;
        }
        // Shallow Tethys flooding North Africa/Arabia margins
        if ((pid == 8 || pid == 9) && mlat > 24.0f && n_coast < 0.50f) return 1;
        // West Siberian Jurassic inland sea
        if (pid == 5 && mlat > 54.0f && mlon > 60.0f && mlon < 84.0f && n_coast < 0.52f) return 1;
    } else if (era_idx == 2) {
        // 68 Ma Late Cretaceous:
        // ICONIC WESTERN INTERIOR SEAWAY splitting North America into Laramidia & Appalachia!
        if (pid == 1) {
            float center_lon = -98.0f - (mlat - 30.0f) * 0.36f + (n_coast - 0.5f) * 8.0f;
            float half_w = 8.2f + (mlat > 52.0f ? 4.0f : 0.0f) + (mlat < 33.0f ? 3.5f : 0.0f);
            if (mlat > 23.0f && mlat < 72.0f && fabsf(mlon - center_lon) < half_w) {
                return 1;
            }
            // Flooded Gulf & Atlantic coastal plain (Florida, Louisiana, Texas coast)
            if (mlat < 32.5f && mlon > -100.0f && mlon < -78.0f && n_coast < 0.62f) return 1;
        }
        // Flooded European Chalk Sea (Britain, Northern France, Germany -> archipelago + Hateg Island!)
        if (pid == 4 && mlat > 43.0f && mlat < 58.0f && mlon > -10.0f && mlon < 38.0f) {
            if (n_coast < 0.60f) return 1;
        }
        // Trans-Saharan Tethys Seaway across Mali/Niger/Libya/Egypt
        if (pid == 8 && mlat > 14.0f && mlat < 36.0f) {
            float sah_lon = 4.0f + (mlat - 15.0f) * 0.4f + (n_coast - 0.5f) * 10.0f;
            if (fabsf(mlon - sah_lon) < 7.0f || (mlat > 26.0f && mlon > 12.0f && n_coast < 0.58f)) {
                return 1;
            }
        }
        // Flooded northern Arabia (Tethys shelf)
        if (pid == 9 && mlat > 22.0f && n_coast < 0.56f) return 1;
        // Flooded Amazon / Patagonia shallow Atlantic transgression
        if (pid == 3 && mlat < -35.0f && mlon > -67.0f && n_coast < 0.52f) return 1;
        // Turgai Strait separating Europe and Siberia
        if (pid == 5 && mlon > 58.0f && mlon < 74.0f && mlat > 46.0f && mlat < 70.0f && n_coast < 0.56f) return 1;
    } else if (era_idx == 0) {
        // 300 Ma Carboniferous: shallow inland seas on western US & Russian Platform
        if (pid == 1 && mlat > 32.0f && mlat < 46.0f && mlon > -108.0f && mlon < -92.0f && n_coast < 0.44f) return 1;
        if (pid == 4 && mlon > 36.0f && mlon < 56.0f && mlat > 48.0f && mlat < 64.0f && n_coast < 0.48f) return 1;
    }
    return 0;
}

// Smooth organic glacial lobe helper: 1 inside jagged lobe, 0 outside
static inline float ell_dome(float lat, float lon, float clat, float clon, float rlat, float rlon, float n) {
    float dlon = lon - clon;
    if (dlon > 180.0f) dlon -= 360.0f;
    if (dlon < -180.0f) dlon += 360.0f;
    float d = hypotf((lat - clat) / rlat, dlon / rlon) + (n - 0.5f) * 0.52f;
    return smoothstep(1.06f, 0.80f, d);
}

// Check if (lat, lon) is buried under a Last Glacial Maximum (20 ka) continental ice sheet
static float lgm_ice_factor(float lat, float lon, float n, int is_land, float elev) {
    float f = 0.0f, v;
    // Laurentide Ice Sheet (land + Hudson Bay basin ONLY!)
    int in_hudson = (ell_dome(lat, lon, 59.0f, -83.0f, 8.5f, 14.0f, n) > 0.35f);
    if (is_land || in_hudson) {
        v = ell_dome(lat, lon, 59.5f, -86.0f, 19.5f, 35.0f, n);
        if (v > f) f = v;
        v = ell_dome(lat, lon, 48.0f, -73.0f, 8.0f, 15.0f, n);
        if (v > f) f = v;
    }
    // Cordilleran Ice Sheet (land-bound British Columbia / Southern Alaska!)
    if (is_land) {
        v = ell_dome(lat, lon, 56.5f, -124.0f, 8.5f, 12.5f, n);
        if (v > f) f = v;
    }
    // Greenland & Iceland (strictly land + narrow coastal shelf!)
    if (is_land) {
        v = ell_dome(lat, lon, 73.0f, -43.0f, 15.5f, 34.0f, n);
        if (v > f) f = v;
        v = ell_dome(lat, lon, 65.0f, -19.0f, 3.8f, 7.5f, n);
        if (v > f) f = v;
    }
    // Fennoscandian + Barents Ice Sheet (land + Barents shallow shelf ONLY!)
    int in_barents = (ell_dome(lat, lon, 74.0f, 38.0f, 6.0f, 17.0f, n) > 0.35f);
    if (is_land || in_barents) {
        v = ell_dome(lat, lon, 64.5f, 22.0f, 11.5f, 22.0f, n);
        if (v > f) f = v;
        v = ell_dome(lat, lon, 71.0f, 40.0f, 9.5f, 20.0f, n);
        if (v > f) f = v;
    }
    // British-Irish Ice Sheet (strictly land/shelf over Scotland, Ireland, Northern England!)
    if (is_land) {
        v = ell_dome(lat, lon, 56.6f, -4.5f, 4.2f, 5.5f, n);
        if (v > f) f = v;
    }
    // Alpine, Himalayan & Patagonian Ice Caps — strictly hug real high mountain topography!
    if (is_land) {
        float mtn_gate = smoothstep(0.28f, 0.56f, elev);
        v = ell_dome(lat, lon, 46.5f, 10.2f, 2.2f, 5.6f, n) * mtn_gate;
        if (v > f) f = v;
        v = ell_dome(lat, lon, 32.5f, 84.5f, 4.5f, 13.0f, n) * mtn_gate * 0.85f;
        if (v > f) f = v;
        v = ell_dome(lat, lon, -47.5f, -72.0f, 9.5f, 3.0f, n) * (0.35f + 0.65f * mtn_gate);
        if (v > f) f = v;
    }
    // Expanded Antarctic Ice Sheet
    v = smoothstep(-62.5f, -66.8f, lat - (n - 0.5f) * 4.0f);
    if (v > f) f = v;
    return clampf(f, 0.0f, 1.0f);
}

// Exposed -125m continental shelves at Last Glacial Maximum (20 ka) — ZERO rectangular cuts!
static int is_lgm_exposed_shelf(float lat, float lon, float shelf_prox, float n) {
    float bonus = 0.0f;
    // Beringia (Siberia <-> Alaska land bridge!)
    bonus = fmaxf(bonus, ell_dome(lat, lon, 63.0f, -172.0f, 8.5f, 22.0f, n) * 0.42f);
    // Doggerland (UK <-> Europe across North Sea & Channel!)
    bonus = fmaxf(bonus, ell_dome(lat, lon, 53.5f, 1.5f, 6.2f, 9.5f, n) * 0.36f);
    // Sundaland (Malay Peninsula + Sumatra + Java + Borneo fused into one landmass!)
    bonus = fmaxf(bonus, ell_dome(lat, lon, 2.5f, 108.5f, 11.5f, 12.0f, n) * 0.40f);
    // Sahul (Australia + New Guinea + Tasmania!)
    bonus = fmaxf(bonus, ell_dome(lat, lon, -10.0f, 136.0f, 7.5f, 11.0f, n) * 0.38f);
    bonus = fmaxf(bonus, ell_dome(lat, lon, -40.5f, 146.0f, 4.0f, 5.0f, n) * 0.34f);
    // Yellow Sea / East China Sea & Patagonian Atlantic shelf
    bonus = fmaxf(bonus, ell_dome(lat, lon, 33.5f, 122.5f, 8.0f, 6.5f, n) * 0.30f);
    bonus = fmaxf(bonus, ell_dome(lat, lon, -45.5f, -62.5f, 8.0f, 6.0f, n) * 0.28f);

    float thresh = 0.54f - bonus + (n - 0.5f) * 0.09f;
    return (shelf_prox > thresh) ? 1 : 0;
}

int main(void) {
    // Load input binary assets
    uint8_t *modern_rgb  = (uint8_t *)malloc(W * H * 3);
    uint8_t *modern_spec = (uint8_t *)malloc(W * H);
    uint8_t *modern_norm = (uint8_t *)malloc(W * H * 3);
    uint8_t *plate_mask  = (uint8_t *)malloc(W * H);

    FILE *f;
    f = fopen("raw_data/earth_modern.rgb", "rb");       fread(modern_rgb, 1, W * H * 3, f); fclose(f);
    f = fopen("raw_data/earth_modern_spec.gray", "rb"); fread(modern_spec, 1, W * H, f);    fclose(f);
    f = fopen("raw_data/earth_modern_norm.rgb", "rb");  fread(modern_norm, 1, W * H * 3, f); fclose(f);
    f = fopen("raw_data/plate_mask_2048.gray", "rb");   fread(plate_mask, 1, W * H, f);     fclose(f);

    // Load plate rotation matrices for the 4 synthesized eras
    const char *era_names[4] = {"300ma", "150ma", "68ma", "20ka"};
    Mat3 mats[4][NUM_PLATES];
    memset(mats, 0, sizeof(mats));

    f = fopen("raw_data/plate_matrices.txt", "r");
    char ename[32];
    int pid;
    double r[9];
    while (fscanf(f, "%31s %d %lf %lf %lf %lf %lf %lf %lf %lf %lf",
                  ename, &pid, &r[0], &r[1], &r[2], &r[3], &r[4], &r[5], &r[6], &r[7], &r[8]) == 11) {
        int ei = -1;
        for (int k = 0; k < 4; k++) if (strcmp(ename, era_names[k]) == 0) ei = k;
        if (ei >= 0 && pid >= 0 && pid < NUM_PLATES) {
            for (int i = 0; i < 9; i++) mats[ei][pid].m[i] = r[i];
            // Transpose = inverse
            for (int row = 0; row < 3; row++)
                for (int col = 0; col < 3; col++)
                    mats[ei][pid].inv[row * 3 + col] = r[col * 3 + row];
        }
    }
    fclose(f);

    // Precompute modern land binary mask & shelf proximity for 20ka LGM
    uint8_t *modern_land = (uint8_t *)malloc(W * H);
    float *modern_shelf = (float *)malloc(W * H * sizeof(float));
    for (int i = 0; i < W * H; i++) {
        // In earth_specular_2048.jpg, water is bright (~180..255) and land is dark (<60)
        modern_land[i] = (modern_spec[i] < 70 || plate_mask[i] > 0) ? 1 : 0;
    }
    compute_shelf_dist(modern_land, modern_shelf);

    // Buffers for each era synthesis
    uint8_t *land_mask   = (uint8_t *)malloc(W * H);
    uint8_t *hit_plate   = (uint8_t *)malloc(W * H);
    uint8_t *src_rgb_buf = (uint8_t *)malloc(W * H * 3);
    float   *src_elev    = (float *)malloc(W * H * sizeof(float));
    float   *shelf_map   = (float *)malloc(W * H * sizeof(float));
    float   *height_map  = (float *)malloc(W * H * sizeof(float));
    uint8_t *out_rgb     = (uint8_t *)malloc(W * H * 3);
    uint8_t *out_spec    = (uint8_t *)malloc(W * H);
    uint8_t *out_norm    = (uint8_t *)malloc(W * H * 3);

    for (int ei = 0; ei < 4; ei++) {
        printf("Synthesizing photorealistic %s satellite Earth...\n", era_names[ei]);
        memset(land_mask, 0, W * H);
        memset(hit_plate, 0, W * H);

        // PASS 1: Inverse spherical Euler mapping to find reconstructed continents & relief
        for (int y = 0; y < H; y++) {
            double lat = (0.5 - (y + 0.5) / (double)H) * PI;
            double cl = cos(lat), sl = sin(lat);
            float plat_deg = (float)(lat * 180.0 / PI);

            for (int x = 0; x < W; x++) {
                double lon = ((x + 0.5) / (double)W - 0.5) * 2.0 * PI;
                float plon_deg = (float)(lon * 180.0 / PI);
                double vx = cl * cos(lon);
                double vy = cl * sin(lon);
                double vz = sl;

                int idx = y * W + x;

                if (ei == 3) {
                    // 20 ka Last Glacial Maximum: modern plates + exposed -125m shelves!
                    float n = fbm3((float)vx * 12.0f, (float)vy * 12.0f, (float)vz * 12.0f, 4);
                    int is_land = (modern_spec[idx] < 72);
                    int is_shelf = (!is_land) && is_lgm_exposed_shelf(plat_deg, plon_deg, modern_shelf[idx], n);
                    land_mask[idx] = (is_land || is_shelf) ? 1 : 0;
                    hit_plate[idx] = plate_mask[idx] ? plate_mask[idx] : (is_shelf ? 1 : 0);
                    if (is_land) {
                        src_rgb_buf[idx*3+0] = modern_rgb[idx*3+0];
                        src_rgb_buf[idx*3+1] = modern_rgb[idx*3+1];
                        src_rgb_buf[idx*3+2] = modern_rgb[idx*3+2];
                        // Estimate local roughness from modern normal map deviation
                        float nx = (modern_norm[idx*3+0] - 128.0f) / 128.0f;
                        float ny = (modern_norm[idx*3+1] - 128.0f) / 128.0f;
                        src_elev[idx] = 0.25f + sqrtf(nx*nx + ny*ny) * 1.6f;
                    } else if (is_shelf) {
                        // Exposed coastal shelf plain (tundra/steppe at high lat, lush green in tropics)
                        float alat = fabsf(plat_deg);
                        float trop = smoothstep(26.0f, 10.0f, alat);
                        float arcd = smoothstep(42.0f, 62.0f, alat);
                        float r0 = lerp(lerp(95.0f, 36.0f, trop), 118.0f, arcd) + (n - 0.5f) * 28.0f;
                        float g0 = lerp(lerp(105.0f, 76.0f, trop), 114.0f, arcd) + (n - 0.5f) * 26.0f;
                        float b0 = lerp(lerp(68.0f, 38.0f, trop), 96.0f, arcd) + (n - 0.5f) * 20.0f;
                        src_rgb_buf[idx*3+0] = clamp8(r0);
                        src_rgb_buf[idx*3+1] = clamp8(g0);
                        src_rgb_buf[idx*3+2] = clamp8(b0);
                        src_elev[idx] = 0.08f + n * 0.12f;
                    } else {
                        src_elev[idx] = 0.0f;
                    }
                    continue;
                }

                // Deep-time eras (300ma, 150ma, 68ma): test inverse transform against every plate
                float n_coast = fbm3((float)vx * 9.0f + 4.1f, (float)vy * 9.0f - 2.3f, (float)vz * 9.0f + 1.7f, 4);
                int found_p = 0;
                int sidx = 0;
                float best_mlat = 0.0f, best_mlon = 0.0f;

                for (int p = 1; p < NUM_PLATES; p++) {
                    const double *inv = mats[ei][p].inv;
                    double mx = inv[0]*vx + inv[1]*vy + inv[2]*vz;
                    double my = inv[3]*vx + inv[4]*vy + inv[5]*vz;
                    double mz = inv[6]*vx + inv[7]*vy + inv[8]*vz;
                    if (mz > 1.0) mz = 1.0; else if (mz < -1.0) mz = -1.0;

                    double mlat = asin(mz);
                    double mlon = atan2(my, mx);

                    int sx = (int)floor((mlon / (2.0 * PI) + 0.5) * W);
                    int sy = (int)floor((0.5 - mlat / PI) * H);
                    if (sx < 0) sx += W; else if (sx >= W) sx -= W;
                    if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;

                    int cand_idx = sy * W + sx;
                    if (plate_mask[cand_idx] == p) {
                        // Refine coastline with NASA specular landmask (allows fine islands/bays!)
                        if (modern_spec[cand_idx] < 135) {
                            float mlat_d = (float)(mlat * 180.0 / PI);
                            float mlon_d = (float)(mlon * 180.0 / PI);
                            if (!is_flooded_seaway(ei, p, mlat_d, mlon_d, n_coast)) {
                                found_p = p;
                                sidx = cand_idx;
                                best_mlat = mlat_d;
                                best_mlon = mlon_d;
                                break;
                            }
                        }
                    }
                }

                if (found_p > 0) {
                    land_mask[idx] = 1;
                    hit_plate[idx] = (uint8_t)found_p;
                    src_rgb_buf[idx*3+0] = modern_rgb[sidx*3+0];
                    src_rgb_buf[idx*3+1] = modern_rgb[sidx*3+1];
                    src_rgb_buf[idx*3+2] = modern_rgb[sidx*3+2];
                    float nx = (modern_norm[sidx*3+0] - 128.0f) / 128.0f;
                    float ny = (modern_norm[sidx*3+1] - 128.0f) / 128.0f;
                    // Real terrain relief + paleo-orogeny modulation
                    float relief = sqrtf(nx*nx + ny*ny) * 1.5f;
                    // Add Deccan Traps volcanic signal for Cretaceous India (pid=10)
                    if (ei == 2 && found_p == 10 && best_mlat > 14.0f && best_mlat < 24.0f && best_mlon > 71.0f && best_mlon < 79.0f) {
                        relief += 0.65f;
                    }
                    src_elev[idx] = 0.22f + relief;
                } else {
                    src_elev[idx] = 0.0f;
                }
            }
        }

        // Compute smooth shelf / continentality proximity from reconstructed landmask
        compute_shelf_dist(land_mask, shelf_map);

        // PASS 2: Photorealistic NASA-style satellite biome, bathymetry, ice & topography coloring
        for (int y = 0; y < H; y++) {
            double lat = (0.5 - (y + 0.5) / (double)H) * PI;
            double cl = cos(lat), sl = sin(lat);
            float plat_deg = (float)(lat * 180.0 / PI);
            float alat = fabsf(plat_deg);

            for (int x = 0; x < W; x++) {
                double lon = ((x + 0.5) / (double)W - 0.5) * 2.0 * PI;
                float plon_deg = (float)(lon * 180.0 / PI);
                float vx = (float)(cl * cos(lon));
                float vy = (float)(cl * sin(lon));
                float vz = (float)sl;

                int idx = y * W + x;
                float n1 = fbm3(vx * 5.5f, vy * 5.5f, vz * 5.5f, 4);
                float n2 = fbm3(vx * 18.0f + 7.2f, vy * 18.0f - 3.1f, vz * 18.0f + 5.4f, 4);
                float n3 = fbm3(vx * 48.0f - 1.9f, vy * 48.0f + 8.3f, vz * 48.0f - 4.2f, 3);
                float shelf = shelf_map[idx]; // 0 = deep ocean, ~0.4 = coast, ~1.0 = deep continental interior

                if (!land_mask[idx]) {
                    // PHOTOREALISTIC SATELLITE OCEAN BATHYMETRY
                    float shallow = smoothstep(0.05f, 0.55f, shelf);
                    float very_shallow = smoothstep(0.32f, 0.68f, shelf);
                    float ridge = fabsf(n1 - 0.5f) * 2.0f;
                    float bathy = clampf(1.0f - ridge * 0.5f + (n2 - 0.5f) * 0.3f, 0.0f, 1.0f);

                    // Deep NASA cobalt-navy ocean -> turquoise coastal shelf
                    float r = lerp(6.0f,  16.0f, shallow) + very_shallow * 16.0f + bathy * 5.0f;
                    float g = lerp(18.0f, 60.0f, shallow) + very_shallow * 52.0f + bathy * 9.0f;
                    float b = lerp(45.0f, 105.0f, shallow) + very_shallow * 36.0f + bathy * 14.0f;

                    if ((ei == 1 || ei == 2) && alat < 48.0f) {
                        r += very_shallow * 6.0f;
                        g += very_shallow * 24.0f;
                        b += very_shallow * 10.0f;
                    }

                    // Sea ice pack & marine-grounded ice sheets (Hudson Bay, Barents Sea, Ross/Weddell shelves!)
                    float sea_ice = 0.0f;
                    if (ei == 3) {
                        float ice_n = n1 * 0.65f + n2 * 0.35f;
                        // Grounded marine ice sheets (Hudson Bay under Laurentide, Barents Sea under Fennoscandian!)
                        float grounded = lgm_ice_factor(plat_deg, plon_deg, ice_n, 0, 0.0f);
                        if (grounded > sea_ice) sea_ice = grounded;
                        // Expanded North Atlantic / Arctic & Antarctic sea ice pack
                        if (plat_deg > 50.0f) {
                            float atl = ell_dome(plat_deg, plon_deg, 62.0f, -25.0f, 11.0f, 34.0f, ice_n);
                            float lim = lerp(64.5f, 54.5f, atl);
                            float si = smoothstep(lim - 2.0f, lim + 5.5f, plat_deg + (ice_n - 0.5f) * 8.0f) * 0.88f;
                            if (si > sea_ice) sea_ice = si;
                        } else if (plat_deg < -54.0f) {
                            float si = smoothstep(-55.5f, -63.0f, plat_deg - (ice_n - 0.5f) * 7.0f) * 0.90f;
                            if (si > sea_ice) sea_ice = si;
                        }
                    } else if (ei == 0 && plat_deg < -60.0f) {
                        sea_ice = smoothstep(-61.0f, -70.0f, plat_deg - (n1 - 0.5f) * 6.5f) * 0.90f;
                    }

                    if (sea_ice > 0.01f) {
                        float ice_tex = 212.0f + (n2 - 0.5f) * 28.0f + (n3 - 0.5f) * 12.0f;
                        r = lerp(r, ice_tex - 10.0f, sea_ice);
                        g = lerp(g, ice_tex - 2.0f,  sea_ice);
                        b = lerp(b, ice_tex + 10.0f, sea_ice);
                    }

                    out_rgb[idx*3+0] = clamp8(r);
                    out_rgb[idx*3+1] = clamp8(g);
                    out_rgb[idx*3+2] = clamp8(b);
                    out_spec[idx] = clamp8(lerp(225.0f, 32.0f, sea_ice));
                    height_map[idx] = sea_ice * 0.14f;
                    continue;
                }

                // PHOTOREALISTIC SATELLITE CONTINENTAL BIOME RENDERING
                float interior = smoothstep(0.42f, 0.95f, shelf);
                float base_luma = (src_rgb_buf[idx*3+0] * 0.30f + src_rgb_buf[idx*3+1] * 0.59f + src_rgb_buf[idx*3+2] * 0.11f) / 255.0f;
                float detail = (n2 - 0.5f) * 0.52f + (n3 - 0.5f) * 0.34f + (base_luma - 0.32f) * 0.32f;
                // Broad organic continent-scale moisture & weather pattern (breaks up latitude stripes!)
                float n_macro = fbm3(vx * 3.2f - 2.4f, vy * 3.2f + 5.1f, vz * 3.2f - 1.7f, 4);
                float eff_lat = alat + (n_macro - 0.5f) * 24.0f + (n1 - 0.5f) * 14.0f;

                float r, g, b;
                float elev = src_elev[idx] + n2 * 0.38f + n3 * 0.20f;
                float ice = 0.0f;

                if (ei == 3) {
                    // 20 ka Last Glacial Maximum: preserve REAL NASA Blue Marble + glacial climate shift + ice sheets!
                    r = (float)src_rgb_buf[idx*3+0];
                    g = (float)src_rgb_buf[idx*3+1];
                    b = (float)src_rgb_buf[idx*3+2];

                    float steppe = smoothstep(42.0f, 56.0f, plat_deg + (n1 - 0.5f) * 8.0f) * (1.0f - smoothstep(0.7f, 0.95f, base_luma));
                    r = lerp(r, 118.0f + detail * 42.0f, steppe * 0.42f);
                    g = lerp(g, 108.0f + detail * 38.0f, steppe * 0.38f);
                    b = lerp(b, 76.0f  + detail * 26.0f, steppe * 0.38f);

                    float sub_arid = smoothstep(34.0f, 22.0f, eff_lat) * smoothstep(8.0f, 16.0f, eff_lat) * interior;
                    r = lerp(r, r * 1.12f + 10.0f, sub_arid * 0.28f);
                    g = lerp(g, g * 1.04f + 5.0f,  sub_arid * 0.28f);

                    float ice_n = n1 * 0.65f + n2 * 0.35f;
                    ice = lgm_ice_factor(plat_deg, plon_deg, ice_n, 1, src_elev[idx]);
                    if (ice > 0.02f) {
                        float dome = 224.0f + (n2 - 0.5f) * 28.0f + (n3 - 0.5f) * 14.0f;
                        float blue_edge = (1.0f - ice) * 18.0f;
                        r = lerp(r, clampf(dome - blue_edge * 0.7f, 184.0f, 250.0f), ice);
                        g = lerp(g, clampf(dome - blue_edge * 0.2f, 198.0f, 252.0f), ice);
                        b = lerp(b, clampf(dome + 10.0f,            212.0f, 255.0f), ice);
                        elev = lerp(elev, 1.05f + n2 * 0.42f, ice);
                    }
                } else {
                    // Deep-time Organic Satellite Biome Model (300 Ma, 150 Ma, 68 Ma)
                    float arid = 0.0f;
                    float lush = 0.0f;

                    if (ei == 0) {
                        // 300 Ma Carboniferous: equatorial coal swamps, interior dry Pangaea, South Polar Gondwana Ice Cap!
                        lush = smoothstep(26.0f, 7.0f, eff_lat) * (1.0f - interior * 0.22f)
                             + smoothstep(32.0f, 50.0f, plat_deg + (n_macro - 0.5f) * 16.0f) * 0.72f;
                        arid = smoothstep(13.0f, 25.0f, eff_lat) * smoothstep(46.0f, 33.0f, eff_lat) * (0.30f + 0.70f * interior);
                        if (plat_deg < -40.0f) {
                            ice = smoothstep(-43.0f, -52.5f, plat_deg - (n_macro - 0.5f) * 10.0f - (n1 - 0.5f) * 6.0f);
                        }
                    } else if (ei == 1) {
                        // 150 Ma Late Jurassic: greenhouse, no polar ice, arid interiors + lush coasts & polar conifers
                        arid = smoothstep(11.0f, 24.0f, eff_lat) * smoothstep(45.0f, 30.0f, eff_lat) * (0.30f + 0.70f * interior);
                        lush = (1.0f - arid) * (0.52f + 0.48f * (1.0f - interior));
                        if (alat > 50.0f) lush = fmaxf(lush, 0.76f);
                    } else {
                        // 68 Ma Late Cretaceous: peak warm angiosperm forests, ice-free green Antarctica!
                        arid = smoothstep(15.0f, 28.0f, eff_lat) * smoothstep(47.0f, 35.0f, eff_lat) * (0.24f + 0.76f * interior);
                        lush = (1.0f - arid) * (0.64f + 0.36f * (1.0f - interior));
                        if (alat > 54.0f) lush = fmaxf(lush, 0.78f);
                    }

                    // Natural patchy cloud-forest / savanna / arid transitions (ZERO stripes!)
                    arid = clampf(arid + (n1 - 0.5f) * 0.42f + (n2 - 0.5f) * 0.22f, 0.0f, 1.0f);
                    lush = clampf(lush + (0.5f - n1) * 0.32f + (n2 - 0.5f) * 0.20f, 0.0f, 1.0f);

                    float polar_cool = smoothstep(44.0f, 68.0f, alat);
                    float forest_r = lerp(20.0f, 34.0f, polar_cool);
                    float forest_g = lerp(56.0f, 64.0f, polar_cool);
                    float forest_b = lerp(24.0f, 36.0f, polar_cool);

                    float sav_r = 92.0f, sav_g = 90.0f, sav_b = 52.0f;
                    float des_r = 162.0f, des_g = 128.0f, des_b = 84.0f;

                    float veg_w = clampf(lush, 0.0f, 1.0f);
                    r = lerp(sav_r, forest_r, veg_w);
                    g = lerp(sav_g, forest_g, veg_w);
                    b = lerp(sav_b, forest_b, veg_w);

                    r = lerp(r, des_r, arid * 0.80f);
                    g = lerp(g, des_g, arid * 0.80f);
                    b = lerp(b, des_b, arid * 0.80f);

                    // Natural mountain granite/highland shading
                    float mtn = smoothstep(0.54f, 1.04f, elev);
                    r = lerp(r, 104.0f + n3 * 26.0f, mtn * 0.62f);
                    g = lerp(g, 95.0f  + n3 * 24.0f, mtn * 0.62f);
                    b = lerp(b, 82.0f  + n3 * 18.0f, mtn * 0.62f);

                    // Deccan Traps volcanic basalt & dark lava plains on 68 Ma India (pid=10)
                    if (ei == 2 && hit_plate[idx] == 10 && n1 > 0.42f) {
                        float dec = smoothstep(0.42f, 0.70f, n1) * 0.72f;
                        r = lerp(r, 68.0f, dec);
                        g = lerp(g, 46.0f, dec);
                        b = lerp(b, 38.0f, dec);
                    }

                    // High-frequency real satellite terrain grain
                    r += detail * 48.0f;
                    g += detail * 44.0f;
                    b += detail * 32.0f;

                    // Gondwana South Polar Ice Cap at 300 Ma
                    if (ice > 0.02f) {
                        float dome = 220.0f + (n2 - 0.5f) * 28.0f + (n3 - 0.5f) * 12.0f;
                        r = lerp(r, dome - 8.0f, ice);
                        g = lerp(g, dome - 2.0f, ice);
                        b = lerp(b, dome + 10.0f, ice);
                        elev = lerp(elev, 0.95f + n2 * 0.34f, ice);
                    }
                }

                // Coastal sandy/estuarine transition softening
                float coast_fade = smoothstep(0.28f, 0.52f, shelf);
                if (coast_fade < 1.0f && ice < 0.3f) {
                    r = lerp(r * 0.85f + 16.0f, r, coast_fade);
                    g = lerp(g * 0.88f + 18.0f, g, coast_fade);
                    b = lerp(b * 0.88f + 12.0f, b, coast_fade);
                }

                out_rgb[idx*3+0] = clamp8(r);
                out_rgb[idx*3+1] = clamp8(g);
                out_rgb[idx*3+2] = clamp8(b);
                out_spec[idx] = clamp8(lerp(14.0f, 38.0f, ice));
                height_map[idx] = elev;
            }
        }

        // Compute realistic Sobel topographic normal map for 3D sunlight relief
        compute_normal_map(height_map, out_norm, 3.8f);

        char path[256];
        snprintf(path, sizeof(path), "raw_data/earth_%s.rgb", era_names[ei]);
        f = fopen(path, "wb"); fwrite(out_rgb, 1, W * H * 3, f); fclose(f);

        snprintf(path, sizeof(path), "raw_data/earth_%s_spec.gray", era_names[ei]);
        f = fopen(path, "wb"); fwrite(out_spec, 1, W * H, f); fclose(f);

        snprintf(path, sizeof(path), "raw_data/earth_%s_norm.rgb", era_names[ei]);
        f = fopen(path, "wb"); fwrite(out_norm, 1, W * H * 3, f); fclose(f);
    }

    printf("All 4 photorealistic Paleo-Earth satellite maps synthesized!\n");
    return 0;
}
