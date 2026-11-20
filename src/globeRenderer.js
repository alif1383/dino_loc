/**
 * DeepTime Earth — Photorealistic WebGL2 3D Earth, Atmosphere, Clouds, Moon & HUD Projection Engine
 * Features real NASA Blue Marble + synthesized Paleo-Earth crossfading, normal-mapped terrain relief,
 * specular ocean sun glints, glowing Hadean magma, drifting clouds, 3D orbiting Moon, and exact ray-sphere picking.
 */
import { STAGES, STAGE_BY_ID } from "./paleoData.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// =============================================================================
// GLSL Shaders
// =============================================================================

const EARTH_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUv;
attribute vec3 aTan;
attribute vec3 aBitan;

uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormalMat;

varying vec2 vUv;
varying vec3 vWorldNorm;
varying vec3 vViewPos;
varying vec3 vTan;
varying vec3 vBitan;

void main() {
  vUv = aUv;
  vec4 mvPos = uModelView * vec4(aPos, 1.0);
  vViewPos = mvPos.xyz;
  vWorldNorm = normalize(uNormalMat * aNorm);
  vTan = normalize(uNormalMat * aTan);
  vBitan = normalize(uNormalMat * aBitan);
  gl_Position = uProj * mvPos;
}
`;

const EARTH_FS = `
precision highp float;

varying vec2 vUv;
varying vec3 vWorldNorm;
varying vec3 vViewPos;
varying vec3 vTan;
varying vec3 vBitan;

uniform sampler2D uAlbedoA;
uniform sampler2D uAlbedoB;
uniform sampler2D uNormA;
uniform sampler2D uNormB;
uniform sampler2D uSpecA;
uniform sampler2D uSpecB;
uniform sampler2D uEmissive;

uniform float uBlend;
uniform float uEmissiveWeight;
uniform float uSpecStrength;
uniform vec3 uSunDir;
uniform vec3 uAtmoColor;
uniform float uTime;

void main() {
  vec3 albA = texture2D(uAlbedoA, vUv).rgb;
  vec3 albB = texture2D(uAlbedoB, vUv).rgb;
  vec3 albedo = mix(albA, albB, uBlend);

  vec3 nTexA = texture2D(uNormA, vUv).rgb * 2.0 - 1.0;
  vec3 nTexB = texture2D(uNormB, vUv).rgb * 2.0 - 1.0;
  vec3 nTex = normalize(mix(nTexA, nTexB, uBlend));

  float specA = texture2D(uSpecA, vUv).r;
  float specB = texture2D(uSpecB, vUv).r;
  float oceanMask = mix(specA, specB, uBlend);

  // Tangent-space perturbed normal for realistic mountain & glacier relief
  vec3 Ngeom = normalize(vWorldNorm);
  vec3 T = normalize(vTan);
  vec3 B = normalize(vBitan);
  float reliefScale = 0.62;
  vec3 N = normalize(Ngeom + (nTex.x * T - nTex.y * B) * reliefScale);

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(-vViewPos);
  vec3 H = normalize(L + V);

  // Softened planetary diffuse illumination with crisp NASA satellite contrast
  float ndlGeom = dot(Ngeom, L);
  float ndl = dot(N, L);
  float dayFactor = smoothstep(-0.18, 0.22, ndlGeom);
  float diff = max(ndl, 0.0) * 1.05 + 0.06;
  // Warm golden-amber twilight scatter right along the day/night terminator
  float terminator = exp(-pow((ndlGeom + 0.02) * 5.8, 2.0));
  vec3 termTint = vec3(1.0, 0.52, 0.22) * terminator * 0.18;

  // Blinn-Phong ocean specular sun glint (masked strictly to water!)
  float spec = pow(max(dot(N, H), 0.0), 48.0) * oceanMask * dayFactor * uSpecStrength;
  vec3 specCol = vec3(1.0, 0.96, 0.88) * spec * 0.55;

  // Fresnel Rayleigh atmospheric limb scatter across planet surface
  float fresnel = pow(1.0 - max(dot(Ngeom, V), 0.0), 3.6);
  float atmoSun = smoothstep(-0.35, 0.55, ndlGeom) * 0.85 + 0.15;
  vec3 atmoRim = uAtmoColor * fresnel * atmoSun * 0.52;

  // Hadean incandescent magma glow (blazes brightly especially across the dark hemisphere!)
  vec3 emis = vec3(0.0);
  if (uEmissiveWeight > 0.01) {
    vec3 lava = texture2D(uEmissive, vUv).rgb;
    float pulse = 0.92 + 0.08 * sin(uTime * 1.8 + vUv.x * 18.0 + vUv.y * 12.0);
    emis = lava * uEmissiveWeight * pulse * (1.45 - 0.35 * dayFactor);
  }

  vec3 nightAmbient = albedo * vec3(0.11, 0.15, 0.23) * (1.0 - dayFactor);
  vec3 litDay = albedo * diff * dayFactor;
  vec3 color = litDay + nightAmbient + termTint + specCol + atmoRim + emis;

  // Subtle rich contrast curve (preserves deep navy oceans and crisp satellite foliage)
  color = clamp(color, 0.0, 1.0);
  color = pow(color, vec3(0.96)) * 1.04;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const CLOUD_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUv;

uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormalMat;

varying vec2 vUv;
varying vec3 vNorm;
varying vec3 vViewPos;

void main() {
  vUv = aUv;
  vec4 mv = uModelView * vec4(aPos, 1.0);
  vViewPos = mv.xyz;
  vNorm = normalize(uNormalMat * aNorm);
  gl_Position = uProj * mv;
}
`;

const CLOUD_FS = `
precision highp float;

varying vec2 vUv;
varying vec3 vNorm;
varying vec3 vViewPos;

uniform sampler2D uClouds;
uniform float uDrift;
uniform vec3 uSunDir;
uniform vec3 uCloudTint;
uniform float uOpacity;

void main() {
  vec2 uv = vec2(fract(vUv.x + uDrift), vUv.y);
  vec4 c = texture2D(uClouds, uv);
  // Use strictly smooth alpha channel (avoids RGB compression artifacts in transparent ocean pixels!)
  float mask = smoothstep(0.08, 0.92, c.a);
  float alpha = mask * uOpacity;
  if (alpha < 0.01) discard;
  vec3 N = normalize(vNorm);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.22, 0.32, ndl) * 0.88 + 0.12;
  vec3 col = uCloudTint * lit;
  gl_FragColor = vec4(col, alpha * (0.30 + 0.70 * lit));
}
`;

const ATMO_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;

uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormalMat;

varying vec3 vNorm;
varying vec3 vViewPos;

void main() {
  vec4 mv = uModelView * vec4(aPos, 1.0);
  vViewPos = mv.xyz;
  vNorm = normalize(uNormalMat * aNorm);
  gl_Position = uProj * mv;
}
`;

const ATMO_FS = `
precision highp float;
varying vec3 vNorm;
varying vec3 vViewPos;
uniform vec3 uAtmoColor;
uniform vec3 uSunDir;

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uSunDir);
  // Back-face halo shell: brightest right outside Earth's silhouette limb
  float viewDot = clamp(dot(-N, V), 0.0, 1.0);
  float rim = pow(viewDot, 2.8) * 1.15;
  float sunSide = smoothstep(-0.45, 0.5, dot(N, L)) * 0.72 + 0.28;
  float alpha = clamp(rim * sunSide, 0.0, 0.88);
  gl_FragColor = vec4(uAtmoColor * 1.25, alpha);
}
`;

const MOON_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUv;
uniform mat4 uProj;
uniform mat4 uModelView;
uniform mat3 uNormalMat;
varying vec2 vUv;
varying vec3 vNorm;
void main() {
  vUv = aUv;
  vNorm = normalize(uNormalMat * aNorm);
  gl_Position = uProj * (uModelView * vec4(aPos, 1.0));
}
`;

const MOON_FS = `
precision highp float;
varying vec2 vUv;
varying vec3 vNorm;
uniform sampler2D uMoon;
uniform vec3 uSunDir;
uniform float uWarmth;
void main() {
  vec3 alb = texture2D(uMoon, vUv).rgb;
  float ndl = max(dot(normalize(vNorm), normalize(uSunDir)), 0.0);
  vec3 tint = mix(vec3(0.95, 0.94, 0.91), vec3(1.0, 0.78, 0.56), uWarmth);
  vec3 col = alb * tint * (0.14 + 0.96 * ndl);
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VS = `
attribute vec3 aPos;
attribute float aSize;
attribute vec3 aCol;
uniform mat4 uProj;
uniform mat4 uRot;
varying vec3 vCol;
void main() {
  vCol = aCol;
  vec4 p = uRot * vec4(aPos, 1.0);
  gl_Position = uProj * p;
  gl_PointSize = aSize;
}
`;

const STAR_FS = `
precision highp float;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float alpha = smoothstep(0.5, 0.05, r);
  gl_FragColor = vec4(vCol, alpha * 0.92);
}
`;

// =============================================================================
// Globe Renderer Class
// =============================================================================

export class GlobeRenderer {
  constructor(glCanvas, overlayCanvas, opts = {}) {
    this.canvas = glCanvas;
    this.overlay = overlayCanvas;
    this.ctx2d = overlayCanvas.getContext("2d");
    this.onReady = opts.onReady || (() => {});
    this.readyFired = false;

    this.gl = null;
    this.fallback2d = false;
    this.bgCtx2d = null;
    this.fallbackImages = {};
    this.fallbackBuffers = {};

    const glOpts = {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    };
    try {
      this.gl =
        glCanvas.getContext("webgl", glOpts) ||
        glCanvas.getContext("experimental-webgl", glOpts) ||
        null;
    } catch {
      this.gl = null;
    }

    // Camera state (Google Earth-like orbital controller)
    this.camLat = 22.0;
    this.camLon = -34.0;
    this.camDist = 3.62;
    this.targetLat = 22.0;
    this.targetLon = -34.0;
    this.targetDist = 3.62;
    this.velLat = 0;
    this.velLon = 0;
    this.autoRotate = true;
    this.userInteracting = false;

    // Mode & era state
    this.mode = "modern"; // 'modern' | 'paleo'
    this.stageId = "68ma";
    this.activeTexKey = "modern";
    this.prevTexKey = "modern";
    this.blend = 1.0;
    this.blendStartTs = 0;

    // Animated visual parameters (smoothly lerped)
    this.curAtmo = [0.28, 0.64, 1.0];
    this.curCloudTint = [1.0, 1.0, 1.0];
    this.curCloudOpacity = 0.42;
    this.curSpecStrength = 0.78;
    this.curEmissive = 0.0;
    this.curMoonDist = 5.1;
    this.curMoonScale = 0.14;

    // Pin, Hover & Drift Arc State
    this.hoverCoords = null;
    this.pinState = null;
    this.pinAnimT = 0.0;
    this.diving = false;
    this.diveCb = null;
    this.fovDeg = 38;
    this.sunDir = normalize3([0.74, 0.34, 0.58]);

    this.textures = {};
    this.time = 0;
    this.lastTs = 0;
    this.rafId = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    if (this.gl) {
      try {
        this._initGL();
        this._preloadTextures();
        glCanvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          this._enableFallback2D();
        });
      } catch (err) {
        console.warn("WebGL init failed, switching to 2D Canvas Earth fallback:", err);
        this.gl = null;
        this._enableFallback2D();
      }
    } else {
      this._enableFallback2D();
    }

    this.resize();
    if (typeof ResizeObserver !== "undefined" && glCanvas.parentElement) {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(glCanvas.parentElement);
    }
  }

  _enableFallback2D() {
    this.fallback2d = true;
    this.gl = null;
    this.bgCtx2d = this.canvas.getContext("2d");
    this.fallbackStars = [];
    this._activeImgLoads = new Set();
    let s = 42193;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 420; i++) {
      this.fallbackStars.push({ x: rnd(), y: rnd(), r: 0.5 + Math.pow(rnd(), 2.8) * 1.6, a: 0.25 + rnd() * 0.7 });
    }
    const sources = { modern: "assets/textures/earth_modern.jpg" };
    for (const st of STAGES) sources[st.id] = st.globe.albedo;
    for (const [key, url] of Object.entries(sources)) {
      this._loadFallbackImage(key, url, 0);
    }
  }

  _loadFallbackImage(key, url, attempt) {
    const img = new Image();
    this._activeImgLoads.add(img);
    img.onload = () => {
      this._activeImgLoads.delete(img);
      this.fallbackImages[key] = img;
      try {
        const off = document.createElement("canvas");
        off.width = 512;
        off.height = 256;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0, 512, 256);
        this.fallbackBuffers[key] = octx.getImageData(0, 0, 512, 256).data;
      } catch {
        this.fallbackBuffers[key] = null;
      }
      if (key === "modern" && !this.readyFired) {
        this.readyFired = true;
        this.onReady();
      }
    };
    img.onerror = () => {
      this._activeImgLoads.delete(img);
      if (attempt < 3) {
        setTimeout(() => this._loadFallbackImage(key, url, attempt + 1), 350 * (attempt + 1));
      }
    };
    img.src = attempt > 0 ? `${url}?r=${attempt}` : url;
  }

  _initGL() {
    const gl = this.gl;
    this._activeImgLoads = new Set();
    this.pendingTexKey = null;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.015, 0.020, 0.036, 1.0);

    this.earthProg = this._createProgram(EARTH_VS, EARTH_FS);
    this.cloudProg = this._createProgram(CLOUD_VS, CLOUD_FS);
    this.atmoProg  = this._createProgram(ATMO_VS, ATMO_FS);
    this.moonProg  = this._createProgram(MOON_VS, MOON_FS);
    this.starProg  = this._createProgram(STAR_VS, STAR_FS);

    this.sphere = this._buildSphere(96, 64, 1.0);
    this.cloudSphere = this._buildSphere(64, 48, 1.011);
    this.atmoSphere = this._buildSphere(64, 48, 1.064);
    this.moonSphere = this._buildSphere(40, 28, 1.0);
    this.stars = this._buildStarfield(2400);

    this.blackTex = this._createSolidTex(0, 0, 0, 255);
    this.flatNormTex = this._createSolidTex(128, 128, 255, 255);
    this.oceanTex = this._createSolidTex(14, 34, 68, 255);
  }

  _createSolidTex(r, g, b, a) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _loadTexture(url, fallback, onLoaded = null) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));
    // Set valid linear filtering immediately so WebGL1 never considers the placeholder incomplete!
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const tryLoad = (attempt) => {
      const img = new Image();
      this._activeImgLoads.add(img);
      img.onload = () => {
        this._activeImgLoads.delete(img);
        if (!this.gl) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        const isPow2 = (v) => (v & (v - 1)) === 0;
        if (isPow2(img.width) && isPow2(img.height)) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
        if (aniso) {
          const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
        }
        if (onLoaded) onLoaded();
      };
      img.onerror = () => {
        this._activeImgLoads.delete(img);
        if (attempt < 3) {
          setTimeout(() => tryLoad(attempt + 1), 350 * (attempt + 1));
        } else {
          console.warn(`Texture load failed after retries: ${url}`);
        }
      };
      img.src = attempt > 0 ? `${url}?r=${attempt}` : url;
    };

    tryLoad(0);
    return tex;
  }

  _preloadTextures() {
    // Load Modern Earth + Clouds + Moon first for fast startup, then quietly prefetch all 5 Paleo eras
    // sequentially so toggling Paleo Earth & scrubbing eras is instantaneous and never shows empty water!
    const modernEntry = {
      albedoLoaded: false,
      albedo: null,
      normal: null,
      spec: null
    };
    this.textures.modern = modernEntry;
    modernEntry.albedo = this._loadTexture("assets/textures/earth_modern.jpg", [18, 42, 82, 255], () => {
      modernEntry.albedoLoaded = true;
      if (!this.readyFired) {
        this.readyFired = true;
        this.onReady();
      }
      this._prefetchPaleoStagesStaggered();
    });
    modernEntry.normal = this._loadTexture("assets/textures/earth_modern_normal.jpg", [128, 128, 255, 255]);
    modernEntry.spec   = this._loadTexture("assets/textures/earth_modern_spec.jpg", [180, 180, 180, 255]);

    this.emissiveHadean = this.blackTex;
    this._hadeanEmissiveLoaded = false;
    this.cloudsTex = this._loadTexture("assets/textures/earth_clouds.png", [0, 0, 0, 0]);
    this.moonTex = this._loadTexture("assets/textures/moon.jpg", [150, 150, 150, 255]);
  }

  _prefetchPaleoStagesStaggered() {
    if (this._prefetchStarted || !this.gl) return;
    this._prefetchStarted = true;
    // Prefetch active stage first, then remaining 4 stages strictly one-by-one after each finishes
    const queue = [this.stageId, ...STAGES.map(s => s.id).filter(id => id !== this.stageId)];
    const next = () => {
      if (!this.gl || queue.length === 0) return;
      const id = queue.shift();
      this._ensureTexKey(id, () => {
        setTimeout(next, 120);
      });
    };
    setTimeout(next, 150);
  }

  _ensureTexKey(key, onAlbedoReady = null) {
    if (!this.gl || key === "modern") {
      if (onAlbedoReady) onAlbedoReady();
      return;
    }
    if (this.textures[key]) {
      if (onAlbedoReady) {
        if (this.textures[key].albedoLoaded) onAlbedoReady();
        else this.textures[key]._callbacks.push(onAlbedoReady);
      }
      return;
    }
    const s = STAGE_BY_ID[key];
    if (!s) {
      if (onAlbedoReady) onAlbedoReady();
      return;
    }
    const entry = {
      albedoLoaded: false,
      albedo: null,
      normal: null,
      spec: null,
      _callbacks: onAlbedoReady ? [onAlbedoReady] : []
    };
    this.textures[key] = entry;
    entry.albedo = this._loadTexture(s.globe.albedo, [20, 42, 74, 255], () => {
      entry.albedoLoaded = true;
      // If user is currently waiting on this Paleo stage, smoothly transition into it now!
      if (this.pendingTexKey === key) {
        this.pendingTexKey = null;
        this.prevTexKey = this.activeTexKey;
        this.activeTexKey = key;
        this.blend = 0.0;
        this.blendStartTs = performance.now();
      }
      for (const cb of entry._callbacks) cb();
      entry._callbacks.length = 0;
    });
    entry.normal = this._loadTexture(s.globe.normal, [128, 128, 255, 255]);
    entry.spec   = this._loadTexture(s.globe.spec, [160, 160, 160, 255]);
    if (key === "4400ma" && !this._hadeanEmissiveLoaded) {
      this._hadeanEmissiveLoaded = true;
      this.emissiveHadean = this._loadTexture("assets/textures/earth_4400ma_emissive.jpg", [0, 0, 0, 255]);
    }
  }

  _createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const vs = this._compile(gl.VERTEX_SHADER, vsSrc);
    const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Shader link error: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _compile(type, src) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _buildSphere(segLon, segLat, radius) {
    const pos = [], norm = [], uv = [], tan = [], bitan = [], idx = [];

    for (let j = 0; j <= segLat; j++) {
      const v = j / segLat;
      const lat = (0.5 - v) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);

      for (let i = 0; i <= segLon; i++) {
        const u = i / segLon;
        const lon = (u - 0.5) * Math.PI * 2;
        const cs = Math.cos(lon), sn = Math.sin(lon);

        const nx = cl * sn;
        const ny = sl;
        const nz = cl * cs;

        pos.push(nx * radius, ny * radius, nz * radius);
        norm.push(nx, ny, nz);
        uv.push(u, v);

        tan.push(cs, 0, -sn);
        bitan.push(-sl * sn, -cl, -sl * cs);
      }
    }

    const stride = segLon + 1;
    for (let j = 0; j < segLat; j++) {
      for (let i = 0; i < segLon; i++) {
        const a = j * stride + i;
        const b = a + 1;
        const c = (j + 1) * stride + i;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    return {
      posBuf: this._makeBuf(new Float32Array(pos)),
      normBuf: this._makeBuf(new Float32Array(norm)),
      uvBuf: this._makeBuf(new Float32Array(uv)),
      tanBuf: this._makeBuf(new Float32Array(tan)),
      bitanBuf: this._makeBuf(new Float32Array(bitan)),
      idxBuf: this._makeIdxBuf(new Uint16Array(idx)),
      count: idx.length
    };
  }

  _buildStarfield(count) {
    const pos = [], size = [], col = [];
    let s = 42193;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const theta = rnd() * Math.PI * 2;
      const r = 45.0;
      const w = Math.sqrt(1 - u * u);
      pos.push(r * w * Math.cos(theta), r * u, r * w * Math.sin(theta));
      const mag = Math.pow(rnd(), 3.2);
      size.push(1.0 + mag * 2.6);
      const temp = rnd();
      const b = 0.45 + mag * 0.55;
      if (temp < 0.22) col.push(0.82 * b, 0.89 * b, 1.0 * b);
      else if (temp < 0.78) col.push(0.96 * b, 0.96 * b, 0.95 * b);
      else col.push(1.0 * b, 0.88 * b, 0.72 * b);
    }
    return {
      posBuf: this._makeBuf(new Float32Array(pos)),
      sizeBuf: this._makeBuf(new Float32Array(size)),
      colBuf: this._makeBuf(new Float32Array(col)),
      count
    };
  }

  _makeBuf(arr) {
    const gl = this.gl;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    return b;
  }

  _makeIdxBuf(arr) {
    const gl = this.gl;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    return b;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth || 1024;
    const h = this.canvas.clientHeight || window.innerHeight || 768;
    if (w <= 0 || h <= 0) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.bgCtx2d) {
      this.bgCtx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ===========================================================================
  // Public Control API
  // ===========================================================================

  setViewConfig(mode, stageId) {
    const nextKey = mode === "paleo" ? stageId : "modern";
    this.mode = mode;
    this.stageId = stageId;
    this._ensureTexKey(nextKey);
    if (nextKey === this.activeTexKey) {
      this.pendingTexKey = null;
      return;
    }
    if (this.gl) {
      const entry = this.textures[nextKey];
      if (!entry || !entry.albedoLoaded) {
        // Hold current crisp Earth visible until target Paleo map finishes loading (never show empty water!)
        this.pendingTexKey = nextKey;
        return;
      }
    }
    this.pendingTexKey = null;
    this.prevTexKey = this.activeTexKey;
    this.activeTexKey = nextKey;
    this.blend = 0.0;
    this.blendStartTs = performance.now();
  }

  isTextureReady(key) {
    if (this.fallback2d) return Boolean(this.fallbackBuffers[key] || this.fallbackImages[key]);
    return Boolean(this.textures[key]?.albedoLoaded);
  }

  setPin(pinData) {
    this.pinState = pinData;
  }

  setHover(coords) {
    this.hoverCoords = coords;
  }

  focusOn(lat, lon, dist = 3.1) {
    this.autoRotate = false;
    this.targetLat = clamp(lat, -82, 82);
    this.targetLon = lon;
    this.targetDist = clamp(dist, 1.48, 5.2);
  }

  rotateByDelta(dx, dy) {
    this.autoRotate = false;
    const sens = 0.24 * (this.camDist / 3.2);
    this.targetLon = wrapLon(this.targetLon - dx * sens);
    this.targetLat = clamp(this.targetLat + dy * sens, -82, 82);
    this.velLon = -dx * sens * 0.35;
    this.velLat = dy * sens * 0.35;
  }

  zoomByDelta(deltaY) {
    const factor = 1 + deltaY * 0.0011;
    this.targetDist = clamp(this.targetDist * factor, 1.42, 5.2);
  }

  /**
   * Google Earth-style orbital dive straight into the dropped coordinate!
   */
  flyToAndDive(lat, lon, onComplete) {
    this.autoRotate = false;
    this.diving = true;
    this.targetLat = clamp(lat, -85, 85);
    this.targetLon = lon;
    this.targetDist = 1.18;
    this.diveCb = onComplete;
    this.diveStartTs = performance.now();
  }

  zoomBackToOrbit() {
    this.diving = false;
    this.diveCb = null;
    this.targetDist = 3.38;
  }

  // ===========================================================================
  // Exact 3D Ray-Sphere Picking & Screen Projection
  // ===========================================================================

  _getMatrices() {
    const aspect = this.width / Math.max(1, this.height);
    const proj = mat4Perspective(this.fovDeg * DEG, aspect, 0.05, 100.0);
    const rot = mat4Mul(mat4RotX(this.camLat * DEG), mat4RotY(-this.camLon * DEG));
    const mv = mat4Mul(mat4Translate(0, 0, -this.camDist), rot);
    return { proj, rot, mv };
  }

  screenToLatLon(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;

    const aspect = rect.width / Math.max(1, rect.height);
    const tanHalf = Math.tan((this.fovDeg * DEG) / 2);

    let rdx = nx * aspect * tanHalf;
    let rdy = ny * tanHalf;
    let rdz = -1.0;
    const rlen = Math.hypot(rdx, rdy, rdz);
    rdx /= rlen; rdy /= rlen; rdz /= rlen;

    const halfB = rdz * this.camDist;
    const c = this.camDist * this.camDist - 1.0;
    const disc = halfB * halfB - c;
    if (disc < 0) return null;

    const t = -halfB - Math.sqrt(disc);
    if (t <= 0) return null;

    const hx = t * rdx;
    const hy = t * rdy;
    const hz = t * rdz + this.camDist;

    const clat = Math.cos(-this.camLat * DEG), slat = Math.sin(-this.camLat * DEG);
    const x1 = hx;
    const y1 = hy * clat - hz * slat;
    const z1 = hy * slat + hz * clat;

    const clon = Math.cos(this.camLon * DEG), slon = Math.sin(this.camLon * DEG);
    const wx = x1 * clon + z1 * slon;
    const wy = y1;
    const wz = -x1 * slon + z1 * clon;

    const lat = Math.asin(clamp(wy, -1, 1)) * RAD;
    const lon = Math.atan2(wx, wz) * RAD;
    return { lat, lon };
  }

  latLonToScreen(latDeg, lonDeg, radius = 1.004) {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const wx = Math.cos(lat) * Math.sin(lon) * radius;
    const wy = Math.sin(lat) * radius;
    const wz = Math.cos(lat) * Math.cos(lon) * radius;

    const { proj, mv } = this._getMatrices();
    const vx = mv[0] * wx + mv[4] * wy + mv[8] * wz + mv[12];
    const vy = mv[1] * wx + mv[5] * wy + mv[9] * wz + mv[13];
    const vz = mv[2] * wx + mv[6] * wy + mv[10] * wz + mv[14];

    const nx = vx, ny = vy, nz = vz + this.camDist;
    const facing = -(nx * vx + ny * vy + nz * vz);

    const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12];
    const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13];
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15];
    if (cw <= 0.0001) return { x: -999, y: -999, visible: false, facing: -1 };

    const sx = (cx / cw * 0.5 + 0.5) * this.width;
    const sy = (0.5 - cy / cw * 0.5) * this.height;
    return { x: sx, y: sy, visible: facing > 0.08, facing };
  }

  // ===========================================================================
  // Render Loop
  // ===========================================================================

  start() {
    if (this.rafId) return;
    this.lastTs = performance.now();
    const tick = (ts) => {
      const cw = this.canvas.clientWidth;
      const ch = this.canvas.clientHeight;
      if (cw > 0 && ch > 0 && (cw !== this.width || ch !== this.height)) {
        this.resize();
      }
      const realDt = Math.min(0.25, Math.max(0.001, (ts - this.lastTs) / 1000));
      this.lastTs = ts;
      this._update(realDt, ts);
      if (this.gl) {
        this._renderWebGL();
      } else if (this.bgCtx2d) {
        this._renderFallback2D();
      }
      this._renderOverlay();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _renderFallback2D() {
    const ctx = this.bgCtx2d;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    // 1. Deep space + starfield
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, w, h);
    for (const st of this.fallbackStars || []) {
      ctx.fillStyle = `rgba(235, 240, 255, ${st.a})`;
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exact apparent globe radius matching perspective camera!
    const tanHalf = Math.tan((this.fovDeg * DEG) / 2);
    const sinAlpha = 1.0 / Math.max(1.05, this.camDist);
    const apparentR = (sinAlpha / Math.sqrt(1 - sinAlpha * sinAlpha)) / tanHalf * (h * 0.5);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.max(24, apparentR);

    // 2. Outer Rayleigh atmospheric glow
    const [ar, ag, ab] = this.curAtmo;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r * 1.14);
    glow.addColorStop(0, `rgba(${Math.round(ar * 255)}, ${Math.round(ag * 255)}, ${Math.round(ab * 255)}, 0.45)`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
    ctx.fill();

    // 3. Textured 3D raycasted sphere (rendered cleanly to a fast offscreen 260x260 buffer & drawn crisp!)
    const buf = this.fallbackBuffers[this.activeTexKey] || this.fallbackBuffers.modern;
    if (buf) {
      const sz = 260;
      if (!this._fbCanvas) {
        this._fbCanvas = document.createElement("canvas");
        this._fbCanvas.width = sz;
        this._fbCanvas.height = sz;
        this._fbCtx = this._fbCanvas.getContext("2d");
        this._fbImg = this._fbCtx.createImageData(sz, sz);
      }
      const out = this._fbImg.data;
      const half = sz * 0.5;
      const clat = Math.cos(-this.camLat * DEG), slat = Math.sin(-this.camLat * DEG);
      const clon = Math.cos(this.camLon * DEG), slon = Math.sin(this.camLon * DEG);
      const sx = this.sunDir[0], sy = this.sunDir[1], szSun = this.sunDir[2];

      for (let py = 0; py < sz; py++) {
        const ny = (half - (py + 0.5)) / half;
        const ny2 = ny * ny;
        for (let px = 0; px < sz; px++) {
          const nx = ((px + 0.5) - half) / half;
          const r2 = nx * nx + ny2;
          const o = (py * sz + px) * 4;
          if (r2 > 1.0) {
            out[o + 3] = 0;
            continue;
          }
          const nz = Math.sqrt(1.0 - r2);
          // Inverse camera rotation -> world coords
          const x1 = nx;
          const y1 = ny * clat - nz * slat;
          const z1 = ny * slat + nz * clat;
          const wx = x1 * clon + z1 * slon;
          const wy = y1;
          const wz = -x1 * slon + z1 * clon;

          const lat = Math.asin(clamp(wy, -1, 1));
          const lon = Math.atan2(wx, wz);
          const u = ((lon / (2 * Math.PI)) + 0.5) * 512;
          const v = (0.5 - lat / Math.PI) * 256;
          const tx = Math.max(0, Math.min(511, u | 0));
          const ty = Math.max(0, Math.min(255, v | 0));
          const ti = (ty * 512 + tx) * 4;

          const ndl = nx * sx + ny * sy + nz * szSun;
          const lit = ndl > -0.15 ? Math.min(1.08, Math.max(0.18, ndl * 0.98 + 0.22)) : 0.16;
          const rim = Math.pow(1.0 - nz, 3.0) * 0.55;
          out[o + 0] = Math.min(255, buf[ti + 0] * lit + ar * 255 * rim);
          out[o + 1] = Math.min(255, buf[ti + 1] * lit + ag * 255 * rim);
          out[o + 2] = Math.min(255, buf[ti + 2] * lit + ab * 255 * rim);
          out[o + 3] = 255;
        }
      }
      this._fbCtx.putImageData(this._fbImg, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this._fbCanvas, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } else if (this.fallbackImages[this.activeTexKey] || this.fallbackImages.modern) {
      const img = this.fallbackImages[this.activeTexKey] || this.fallbackImages.modern;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - r * 1.4, cy - r, r * 2.8, r * 2);
      const shade = ctx.createRadialGradient(cx + r * 0.32, cy - r * 0.25, r * 0.15, cx, cy, r * 1.05);
      shade.addColorStop(0, "rgba(255, 255, 255, 0.04)");
      shade.addColorStop(0.7, "rgba(0, 0, 0, 0.18)");
      shade.addColorStop(1, "rgba(0, 0, 0, 0.72)");
      ctx.fillStyle = shade;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } else {
      // Clean blue planetary disc while first satellite image loads
      const disc = ctx.createRadialGradient(cx + r * 0.3, cy - r * 0.25, r * 0.1, cx, cy, r);
      disc.addColorStop(0, "#1c4a82");
      disc.addColorStop(1, "#081428");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _update(dt, ts) {
    this.time += Math.min(dt, 0.05);

    if (this.autoRotate && !this.userInteracting && !this.diving) {
      this.targetLon = wrapLon(this.targetLon + Math.min(dt, 0.05) * 2.0);
    } else if (!this.userInteracting && !this.diving) {
      this.targetLon = wrapLon(this.targetLon + this.velLon);
      this.targetLat = clamp(this.targetLat + this.velLat, -82, 82);
      this.velLon *= 0.88;
      this.velLat *= 0.88;
    }

    // Frame-rate-independent exponential smoothing!
    const rate = this.diving ? 6.2 : 9.0;
    const smooth = 1 - Math.exp(-dt * rate);
    const dLon = wrapLon(this.targetLon - this.camLon);
    this.camLon = wrapLon(this.camLon + dLon * smooth);
    this.camLat += (this.targetLat - this.camLat) * smooth;
    this.camDist += (this.targetDist - this.camDist) * smooth;

    if (this.diving && this.diveCb) {
      const elapsed = ts - this.diveStartTs;
      if (this.camDist < 1.38 || elapsed > 760) {
        const cb = this.diveCb;
        this.diveCb = null;
        this.diving = false;
        cb();
      }
    }

    // Wall-clock smooth texture crossfade (always completes in 550ms regardless of FPS!)
    if (this.blend < 1.0) {
      this.blend = clamp((ts - this.blendStartTs) / 550, 0, 1);
    }

    const targetPinT = this.mode === "paleo" ? 1.0 : 0.0;
    const pinSmooth = 1 - Math.exp(-dt * 6.5);
    this.pinAnimT += (targetPinT - this.pinAnimT) * pinSmooth;

    const st = STAGE_BY_ID[this.stageId] || STAGES[3];
    const isPaleo = this.mode === "paleo";
    const tgtAtmo = isPaleo ? st.globe.atmoColor : [0.24, 0.60, 1.0];
    const tgtCloudTint = isPaleo ? st.globe.cloudTint : [1.0, 1.0, 1.0];
    const tgtCloudOp = isPaleo ? st.globe.cloudOpacity : 0.42;
    const tgtSpec = isPaleo ? st.globe.specStrength : 0.78;
    const tgtEmis = isPaleo ? st.globe.emissiveStrength : 0.0;
    const tgtMoonDist = isPaleo ? st.globe.moonDist : 5.3;
    const tgtMoonScale = isPaleo ? st.globe.moonScale : 0.13;

    const k = 1 - Math.exp(-dt * 6.0);
    for (let i = 0; i < 3; i++) {
      this.curAtmo[i] += (tgtAtmo[i] - this.curAtmo[i]) * k;
      this.curCloudTint[i] += (tgtCloudTint[i] - this.curCloudTint[i]) * k;
    }
    this.curCloudOpacity += (tgtCloudOp - this.curCloudOpacity) * k;
    this.curSpecStrength += (tgtSpec - this.curSpecStrength) * k;
    this.curEmissive += (tgtEmis - this.curEmissive) * k;
    this.curMoonDist += (tgtMoonDist - this.curMoonDist) * k;
    this.curMoonScale += (tgtMoonScale - this.curMoonScale) * k;
  }

  _renderWebGL() {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { proj, rot, mv } = this._getMatrices();
    const normMat = mat3FromMat4(mv);

    // 1. Starfield Backdrop
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.starProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.starProg, "uProj"), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.starProg, "uRot"), false, rot);
    this._bindAttr(this.starProg, "aPos", this.stars.posBuf, 3);
    this._bindAttr(this.starProg, "aSize", this.stars.sizeBuf, 1);
    this._bindAttr(this.starProg, "aCol", this.stars.colBuf, 3);
    gl.drawArrays(gl.POINTS, 0, this.stars.count);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    // 2. Orbiting 3D Moon (clearly visible in upper-right sky; looms 3x closer & huge in Hadean 4.4 Ga!)
    const isHadean = this.curEmissive > 0.25;
    const moonShift = Math.sin(this.time * 0.14) * 0.12;
    const moonX = isHadean ? 1.48 + moonShift : 1.72 + moonShift;
    const moonY = isHadean ? 0.62 : 0.78;
    const moonZ = isHadean ? -this.camDist + 0.32 : -this.camDist - 0.65;
    const moonScaleM = mat4Scale(this.curMoonScale * (isHadean ? 1.15 : 0.92));
    const moonSpinM = mat4RotY(this.time * 0.08 + 1.1);
    const moonMV = mat4Mul(mat4Translate(moonX, moonY, moonZ), mat4Mul(moonSpinM, moonScaleM));
    const moonNormMat = mat3FromMat4(moonMV);

    gl.cullFace(gl.BACK);
    gl.useProgram(this.moonProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.moonProg, "uProj"), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.moonProg, "uModelView"), false, moonMV);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.moonProg, "uNormalMat"), false, moonNormMat);
    gl.uniform3fv(gl.getUniformLocation(this.moonProg, "uSunDir"), this.sunDir);
    gl.uniform1f(gl.getUniformLocation(this.moonProg, "uWarmth"), this.curEmissive > 0.2 ? 0.6 : 0.0);
    this._bindTex(this.moonProg, "uMoon", this.moonTex, 0);
    this._drawSphere(this.moonProg, this.moonSphere, false);

    // 3. Photorealistic Planet Surface
    const texA = this.textures[this.prevTexKey] || this.textures.modern;
    const texB = this.textures[this.activeTexKey] || this.textures.modern;

    gl.useProgram(this.earthProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.earthProg, "uProj"), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.earthProg, "uModelView"), false, mv);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.earthProg, "uNormalMat"), false, normMat);
    gl.uniform1f(gl.getUniformLocation(this.earthProg, "uBlend"), smoothstepJS(this.blend));
    gl.uniform1f(gl.getUniformLocation(this.earthProg, "uEmissiveWeight"), this.curEmissive);
    gl.uniform1f(gl.getUniformLocation(this.earthProg, "uSpecStrength"), this.curSpecStrength);
    gl.uniform3fv(gl.getUniformLocation(this.earthProg, "uSunDir"), this.sunDir);
    gl.uniform3fv(gl.getUniformLocation(this.earthProg, "uAtmoColor"), this.curAtmo);
    gl.uniform1f(gl.getUniformLocation(this.earthProg, "uTime"), this.time);

    this._bindTex(this.earthProg, "uAlbedoA", texA.albedo, 0);
    this._bindTex(this.earthProg, "uAlbedoB", texB.albedo, 1);
    this._bindTex(this.earthProg, "uNormA",   texA.normal, 2);
    this._bindTex(this.earthProg, "uNormB",   texB.normal, 3);
    this._bindTex(this.earthProg, "uSpecA",   texA.spec,   4);
    this._bindTex(this.earthProg, "uSpecB",   texB.spec,   5);
    this._bindTex(this.earthProg, "uEmissive", this.emissiveHadean, 6);
    this._drawSphere(this.earthProg, this.sphere, true);

    // 4. Drifting Cloud Layer
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.cloudProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.cloudProg, "uProj"), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.cloudProg, "uModelView"), false, mv);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.cloudProg, "uNormalMat"), false, normMat);
    gl.uniform1f(gl.getUniformLocation(this.cloudProg, "uDrift"), (this.time * 0.0045) % 1.0);
    gl.uniform3fv(gl.getUniformLocation(this.cloudProg, "uSunDir"), this.sunDir);
    gl.uniform3fv(gl.getUniformLocation(this.cloudProg, "uCloudTint"), this.curCloudTint);
    gl.uniform1f(gl.getUniformLocation(this.cloudProg, "uOpacity"), this.curCloudOpacity);
    this._bindTex(this.cloudProg, "uClouds", this.cloudsTex, 0);
    this._drawSphere(this.cloudProg, this.cloudSphere, false);

    // 5. Outer Atmospheric Rayleigh Halo Shell (rendered on back faces around globe silhouette)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.cullFace(gl.FRONT);
    gl.useProgram(this.atmoProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.atmoProg, "uProj"), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.atmoProg, "uModelView"), false, mv);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.atmoProg, "uNormalMat"), false, normMat);
    gl.uniform3fv(gl.getUniformLocation(this.atmoProg, "uAtmoColor"), this.curAtmo);
    gl.uniform3fv(gl.getUniformLocation(this.atmoProg, "uSunDir"), this.sunDir);
    this._drawSphere(this.atmoProg, this.atmoSphere, false);

    gl.cullFace(gl.BACK);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  _bindTex(prog, name, tex, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  _bindAttr(prog, name, buf, size) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  _drawSphere(prog, s, withTangents) {
    const gl = this.gl;
    this._bindAttr(prog, "aPos", s.posBuf, 3);
    this._bindAttr(prog, "aNorm", s.normBuf, 3);
    this._bindAttr(prog, "aUv", s.uvBuf, 2);
    if (withTangents) {
      this._bindAttr(prog, "aTan", s.tanBuf, 3);
      this._bindAttr(prog, "aBitan", s.bitanBuf, 3);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.idxBuf);
    gl.drawElements(gl.TRIANGLES, s.count, gl.UNSIGNED_SHORT, 0);
  }

  // ===========================================================================
  // Crisp 2D Canvas Spatial HUD Overlay (Labels, Tectonic Drift Arc, Pegman Target)
  // ===========================================================================

  _renderOverlay() {
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Subtle Geographic / Paleogeographic Landmass Labels
    if (this.mode === "paleo") {
      const stage = STAGE_BY_ID[this.stageId];
      if (stage && stage.paleoLabels) {
        ctx.save();
        ctx.font = "600 10.5px ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        for (const lbl of stage.paleoLabels) {
          const p = this.latLonToScreen(lbl.lat, lbl.lon, 1.006);
          if (!p.visible || p.facing < 0.25) continue;
          const alpha = clamp((p.facing - 0.25) * 1.4, 0, 0.72);
          ctx.fillStyle = `rgba(6, 10, 16, ${alpha * 0.65})`;
          ctx.fillText(lbl.text, p.x + 1, p.y + 1);
          ctx.fillStyle = `rgba(245, 238, 224, ${alpha})`;
          ctx.fillText(lbl.text, p.x, p.y);
        }
        ctx.restore();
      }
    } else {
      const modernAnchors = [
        { lat: 40.7, lon: -74.0, text: "New York" },
        { lat: 51.5, lon: -0.1, text: "London" },
        { lat: 35.7, lon: 139.7, text: "Tokyo" },
        { lat: 19.1, lon: 72.9, text: "Mumbai" },
        { lat: -33.9, lon: 151.2, text: "Sydney" },
        { lat: -22.9, lon: -43.2, text: "Rio" },
        { lat: 30.0, lon: 31.2, text: "Cairo" },
        { lat: 47.5, lon: -106.5, text: "Hell Creek" },
        { lat: -38.9, lon: -68.1, text: "Patagonia" }
      ];
      ctx.save();
      ctx.font = "500 11px ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      for (const a of modernAnchors) {
        const p = this.latLonToScreen(a.lat, a.lon, 1.004);
        if (!p.visible || p.facing < 0.30) continue;
        const alpha = clamp((p.facing - 0.30) * 1.6, 0, 0.76);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(243, 239, 230, ${alpha})`;
        ctx.fill();
        ctx.fillStyle = `rgba(6, 10, 16, ${alpha * 0.75})`;
        ctx.fillText(a.text, p.x + 7, p.y + 4);
        ctx.fillStyle = `rgba(243, 239, 230, ${alpha * 0.9})`;
        ctx.fillText(a.text, p.x + 6, p.y + 3);
      }
      ctx.restore();
    }

    // 2. Tectonic Drift Geodesic Arc & Active Dropped Pin
    if (this.pinState) {
      const { modernLat, modernLon, paleoLat, paleoLon } = this.pinState;
      const dist = Math.hypot(modernLat - paleoLat, modernLon - paleoLon);

      // Draw glowing geodesic tectonic drift trajectory arc when continent moved noticeably!
      if (dist > 2.5) {
        this._drawGeodesicArc(modernLat, modernLon, paleoLat, paleoLon);
      }

      // Draw ghost anchor at modern location when viewing Paleo Earth
      if (this.mode === "paleo" && dist > 2.5) {
        const mp = this.latLonToScreen(modernLat, modernLon, 1.006);
        if (mp.visible) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(mp.x, mp.y, 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(243, 239, 230, 0.55)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = "rgba(243, 239, 230, 0.65)";
          ctx.textAlign = "center";
          ctx.fillText("Today", mp.x, mp.y + 15);
          ctx.restore();
        }
      }

      // Current interpolated pin coordinate along the sphere
      const curCoord = slerpLatLon(modernLat, modernLon, paleoLat, paleoLon, this.pinAnimT);
      const sp = this.latLonToScreen(curCoord[0], curCoord[1], 1.008);
      if (sp.visible) {
        this._drawDroppedPin(sp.x, sp.y);
      }
    }

    // 3. Live Pegman Drag Targeting Reticle on Globe Surface
    if (this.hoverCoords) {
      const hp = this.latLonToScreen(this.hoverCoords.lat, this.hoverCoords.lon, 1.006);
      if (hp.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 8.0);
        ctx.save();
        // Ground shadow ring directly under dangling Pegman
        ctx.beginPath();
        ctx.ellipse(hp.x, hp.y, 12 + pulse * 4, 6 + pulse * 2, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(235, 174, 66, 0.92)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(hp.x, hp.y, 20 + pulse * 8, 10 + pulse * 4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(235, 174, 66, ${0.42 - pulse * 0.28})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#f7c45f";
        ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawGeodesicArc(lat1, lon1, lat2, lon2) {
    const ctx = this.ctx2d;
    const steps = 44;
    ctx.save();
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [lat, lon] = slerpLatLon(lat1, lon1, lat2, lon2, t);
      const lift = 1.008 + Math.sin(t * Math.PI) * 0.085;
      const pt = this.latLonToScreen(lat, lon, lift);
      if (pt.visible) {
        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      } else {
        started = false;
      }
    }
    ctx.strokeStyle = "rgba(235, 174, 66, 0.72)";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -this.time * 18;
    ctx.stroke();
    ctx.restore();
  }

  _drawDroppedPin(x, y) {
    const ctx = this.ctx2d;
    const pulse = (this.time * 1.1) % 1.0;
    ctx.save();
    // Expanding surface radar ripple
    ctx.beginPath();
    ctx.arc(x, y, 5 + pulse * 18, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(235, 174, 66, ${(1 - pulse) * 0.75})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Base shadow dot
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ebb244";
    ctx.fill();
    ctx.strokeStyle = "#0b0e14";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Mini stood-up explorer silhouette pin right on the dropped spot
    ctx.translate(x, y - 3);
    ctx.fillStyle = "#f4be52";
    ctx.strokeStyle = "#0b0e14";
    ctx.lineWidth = 1.6;
    // Head
    ctx.beginPath();
    ctx.arc(0, -21, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.roundRect(-4.5, -15.5, 9, 9.5, 3);
    ctx.fill();
    ctx.stroke();
    // Legs
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(-2.2, 0);
    ctx.moveTo(2, -6);
    ctx.lineTo(2.2, 0);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#f4be52";
    ctx.stroke();
    ctx.restore();
  }
}

// =============================================================================
// Minimal Zero-Dependency 3D Matrix & Spherical Math
// =============================================================================

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function wrapLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }
function smoothstepJS(t) { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); }

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return new Float32Array([v[0] / l, v[1] / l, v[2] / l]);
}

function slerpLatLon(lat1, lon1, lat2, lon2, t) {
  const a1 = lat1 * DEG, o1 = lon1 * DEG;
  const a2 = lat2 * DEG, o2 = lon2 * DEG;
  const u = [Math.cos(a1) * Math.sin(o1), Math.sin(a1), Math.cos(a1) * Math.cos(o1)];
  const v = [Math.cos(a2) * Math.sin(o2), Math.sin(a2), Math.cos(a2) * Math.cos(o2)];
  const dot = clamp(u[0]*v[0] + u[1]*v[1] + u[2]*v[2], -1, 1);
  const omega = Math.acos(dot);
  let x, y, z;
  if (omega < 1e-4) {
    x = u[0] + (v[0] - u[0]) * t;
    y = u[1] + (v[1] - u[1]) * t;
    z = u[2] + (v[2] - u[2]) * t;
  } else {
    const s = Math.sin(omega);
    const w1 = Math.sin((1 - t) * omega) / s;
    const w2 = Math.sin(t * omega) / s;
    x = u[0] * w1 + v[0] * w2;
    y = u[1] * w1 + v[1] * w2;
    z = u[2] * w1 + v[2] * w2;
  }
  const len = Math.hypot(x, y, z) || 1;
  return [Math.asin(clamp(y / len, -1, 1)) * RAD, Math.atan2(x / len, z / len) * RAD];
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function mat4Translate(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function mat4Scale(s) {
  return new Float32Array([
    s, 0, 0, 0,
    0, s, 0, 0,
    0, 0, s, 0,
    0, 0, 0, 1
  ]);
}

function mat4RotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4RotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat3FromMat4(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10]
  ]);
}
