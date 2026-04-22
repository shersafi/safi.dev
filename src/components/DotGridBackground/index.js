import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const PARTICLE_PARAMS = {
  density: 220,
  particlesScale: 0.64,
  ringWidth: 0.01,
  ringWidth2: 0.088,
  ringDisplacement: 0.44,
};

const THEME_COLORS = {
  light: {
    color1: "#22365b",
    color2: "#3a5581",
    color3: "#6382ad",
    alpha: 0.8,
    glow: 0.5,
  },
  dark: {
    color1: "#94abd7",
    color2: "#ccd8ef",
    color3: "#f6f8ff",
    alpha: 0.58,
    glow: 0.42,
  },
};

const SIZE = 256;

const NOISE_GLSL = `
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  vec4 grad4(float j, vec4 ip){
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
  }
  float snoise(vec4 v){
    const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);
    vec4 i = floor(v + dot(v, C.yyyy));
    vec4 x0 = v - i + dot(i, C.xxxx);
    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;
    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
    vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
    vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
    vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
    vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;
    i = mod(i, 289.0);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
      i.w + vec4(i1.w, i2.w, i3.w, 1.0))
      + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
      + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
      + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
    vec4 p0 = grad4(j0, ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4, p4));
    vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (
      dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
      + dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4)))
    );
  }
`;

const linearMap = (x, a, b, c, d) => ((x - a) * (d - c)) / (b - a) + c;

const getTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

class ValueNoise {
  constructor() {
    this.MAX_VERTICES = 256;
    this.MAX_VERTICES_MASK = this.MAX_VERTICES - 1;
    this.amplitude = 1;
    this.scale = 1;
    this.values = Array.from({ length: this.MAX_VERTICES }, () => Math.random());
  }

  lerp(a, b, t) {
    return a * (1 - t) + b * t;
  }

  getVal(x) {
    const scaled = x * this.scale;
    const integer = Math.floor(scaled);
    const fractional = scaled - integer;
    const smooth = fractional * fractional * (3 - 2 * fractional);
    const left = integer % this.MAX_VERTICES_MASK;
    const right = (left + 1) % this.MAX_VERTICES_MASK;
    return this.lerp(this.values[left], this.values[right], smooth) * this.amplitude;
  }
}

class MouseTracker {
  constructor() {
    this.cursor = new THREE.Vector2();
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    this.handleMove = this.handleMove.bind(this);
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("mousemove", this.handleMove);
    window.addEventListener("resize", this.handleResize);
    this.update();
  }

  handleMove(event) {
    this.cursor.x = event.clientX;
    this.cursor.y = event.clientY;
  }

  handleResize() {
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
  }

  update() {
    this.raf = requestAnimationFrame(() => this.update());
  }
}

let sharedMouseTracker = null;

const getMouseTracker = () => {
  if (!sharedMouseTracker && typeof window !== "undefined") {
    sharedMouseTracker = new MouseTracker();
  }
  return sharedMouseTracker;
};

class MainParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.lastTime = 0;
    this.everRendered = false;
    this.ringPos = new THREE.Vector2(0, 0);
    this.cursorPos = new THREE.Vector2(0, 0);
    this.colorScheme = scene.theme === "dark" ? 0 : 1;
    this.particleScale =
      (this.renderer.domElement.width / scene.pixelRatio / 2000) * scene.particlesScale;
    this.createPoints();
    this.init();
  }

  createPoints() {
    const minDistance = linearMap(this.scene.density, 0, 300, 10, 2);
    const maxDistance = linearMap(this.scene.density, 0, 300, 11, 3);
    const cellSize = minDistance / Math.SQRT2;
    const cols = Math.ceil(500 / cellSize);
    const rows = Math.ceil(500 / cellSize);
    const grid = new Int32Array(cols * rows).fill(-1);
    const points = [];
    const active = [];

    const gridIndex = (x, y) => Math.floor(y / cellSize) * cols + Math.floor(x / cellSize);

    const canPlace = (x, y) => {
      if (x < 0 || x >= 500 || y < 0 || y >= 500) {
        return false;
      }

      const baseCol = Math.floor(x / cellSize);
      const baseRow = Math.floor(y / cellSize);

      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
          const col = baseCol + colOffset;
          const row = baseRow + rowOffset;

          if (col < 0 || col >= cols || row < 0 || row >= rows) {
            continue;
          }

          const pointIndex = grid[row * cols + col];
          if (pointIndex === -1) {
            continue;
          }

          const dx = points[pointIndex * 2] - x;
          const dy = points[pointIndex * 2 + 1] - y;
          if (dx * dx + dy * dy < minDistance * minDistance) {
            return false;
          }
        }
      }

      return true;
    };

    points.push(250, 250);
    grid[gridIndex(250, 250)] = 0;
    active.push(0);

    while (active.length > 0) {
      const activeIndex = (Math.random() * active.length) | 0;
      const pointIndex = active[activeIndex];
      const px = points[pointIndex * 2];
      const py = points[pointIndex * 2 + 1];
      let found = false;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = minDistance + Math.random() * (maxDistance - minDistance);
        const x = px + Math.cos(angle) * radius;
        const y = py + Math.sin(angle) * radius;

        if (!canPlace(x, y)) {
          continue;
        }

        const nextIndex = points.length / 2;
        points.push(x, y);
        grid[gridIndex(x, y)] = nextIndex;
        active.push(nextIndex);
        found = true;
        break;
      }

      if (!found) {
        active.splice(activeIndex, 1);
      }
    }

    this.pointsData = new Float32Array(points.length);
    for (let index = 0; index < points.length; index += 2) {
      this.pointsData[index] = points[index] - 250;
      this.pointsData[index + 1] = points[index + 1] - 250;
    }

    this.count = points.length / 2;
  }

  createDataTexturePosition() {
    const textureData = new Float32Array(this.length * 4);

    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 4;
      textureData[offset] = this.pointsData[index * 2] * (1 / 250);
      textureData[offset + 1] = this.pointsData[index * 2 + 1] * (1 / 250);
      textureData[offset + 2] = 0;
      textureData[offset + 3] = 0;
    }

    const texture = new THREE.DataTexture(
      textureData,
      this.size,
      this.size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    return texture;
  }

  createRenderTarget() {
    return new THREE.WebGLRenderTarget(this.size, this.size, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  init() {
    this.size = SIZE;
    this.length = this.size * this.size;
    this.posTex = this.createDataTexturePosition();
    this.rt1 = this.createRenderTarget();
    this.rt2 = this.createRenderTarget();

    this.renderer.setRenderTarget(this.rt1);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.rt2);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.setRenderTarget(null);

    this.noise = new ValueNoise();
    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: this.posTex },
        uPosRefs: { value: this.posTex },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        uRingRadius: { value: 0.2 },
        uDeltaTime: { value: 0 },
        uRingWidth: { value: 0.05 },
        uRingWidth2: { value: 0.015 },
        uRingDisplacement: { value: this.scene.ringDisplacement },
        uTime: { value: 0 },
      },
      vertexShader: "void main() { gl_Position = vec4(position, 1.0); }",
      fragmentShader: `
        precision highp float;
        uniform sampler2D uPosition;
        uniform sampler2D uPosRefs;
        uniform vec2 uRingPos;
        uniform float uTime;
        uniform float uDeltaTime;
        uniform float uRingRadius;
        uniform float uRingWidth;
        uniform float uRingWidth2;
        uniform float uRingDisplacement;
        ${NOISE_GLSL}
        void main() {
          vec2 simTexCoords = gl_FragCoord.xy / vec2(${SIZE.toFixed(1)}, ${SIZE.toFixed(1)});
          vec4 pFrame = texture2D(uPosition, simTexCoords);
          float scale = pFrame.z;
          float velocity = pFrame.w;
          vec2 refPos = texture2D(uPosRefs, simTexCoords).xy;
          float time = uTime * 0.5;
          vec2 currentPos = refPos;
          vec2 pos = pFrame.xy;
          pos *= 0.8;
          vec2 toCenter = currentPos.xy - uRingPos;
          float noise0 = snoise(vec3(currentPos.xy * 0.2 + vec2(18.4924, 72.9744), time * 0.5));
          float shapeAngle = 0.6
            + sin((time * 0.9) + (uRingPos.x * 3.2)) * 0.28
            + snoise(vec3(uRingPos * 3.0 + vec2(14.2, 5.7), time * 0.2)) * 0.42;
          vec2 flowDir = normalize(vec2(cos(shapeAngle), sin(shapeAngle)));
          vec2 flowNormal = vec2(-flowDir.y, flowDir.x);
          float axial = dot(toCenter, flowDir);
          float lateral = dot(toCenter, flowNormal);
          float ribbonWobble = sin((axial * 10.0) - (time * 2.6) + (noise0 * 2.5)) * 0.035;
          lateral += ribbonWobble;
          float streamLength = uRingRadius * 1.95 + 0.24;
          float streamWidth = uRingWidth * 2.8 + 0.05;
          float spineMix = clamp((axial + (streamLength * 0.95)) / (streamLength * 1.55), 0.0, 1.0);
          float spineOffset = mix(-0.075, 0.09, spineMix);
          spineOffset += sin((axial * 5.8) - (time * 1.45) + (noise0 * 2.4)) * 0.03;
          spineOffset += sin((axial * 10.5) + (time * 0.8)) * 0.012;
          float curvedLateral = lateral - spineOffset;
          float streamMask = smoothstep(-streamLength * 1.05, -streamLength * 0.28, axial)
            * (1.0 - smoothstep(streamLength * 0.3, streamLength * 0.94, axial));
          float stream = (1.0 - smoothstep(streamWidth, streamWidth * 2.2, abs(curvedLateral)))
            * streamMask;
          float knot = 1.0 - smoothstep(
            0.46,
            1.0,
            length(
              vec2(
                (axial - (streamLength * 0.02)) / (uRingRadius * 0.82 + 0.1),
                (curvedLateral - 0.012) / (streamWidth * 1.35)
              )
            )
          );
          float shoulder = 1.0 - smoothstep(
            0.52,
            1.05,
            length(
              vec2(
                (axial + (streamLength * 0.23)) / (uRingRadius * 0.96 + 0.11),
                (curvedLateral + 0.045) / (streamWidth * 1.75 + 0.02)
              )
            )
          );
          float haze = 1.0 - smoothstep(
            0.86,
            1.35,
            length(
              vec2(
                (axial + (streamLength * 0.04)) / (streamLength * 1.02),
                curvedLateral / (streamWidth * 2.45)
              )
            )
          );
          float t = stream * 1.08;
          t += knot * 0.98;
          t += shoulder * 0.48;
          t += haze * 0.18;
          float t2 = clamp((stream * 0.8) + (knot * 0.72) + (shoulder * 0.34), 0.0, 1.0);
          float t3 = clamp((stream * 0.58) + (knot * 0.42) + (haze * 0.28), 0.0, 1.0);
          t += snoise(vec3(currentPos.xy * 30.0 + vec2(11.4924, 12.9744), time * 0.5))
            * (stream * 0.18 + knot * 0.14 + shoulder * 0.06);
          float nS = snoise(vec3(currentPos.xy * 2.0 + vec2(18.4924, 72.9744), time * 0.5));
          t += pow((nS + 1.5) * 0.5, 2.0) * 0.6;
          float noise1 = snoise(vec3(currentPos.xy * 4.0 + vec2(88.494, 32.4397), time * 0.35));
          float noise2 = snoise(vec3(currentPos.xy * 4.0 + vec2(50.904, 120.947), time * 0.35));
          float noise3 = snoise(vec3(currentPos.xy * 20.0 + vec2(18.4924, 72.9744), time * 0.5));
          float noise4 = snoise(vec3(currentPos.xy * 20.0 + vec2(50.904, 120.947), time * 0.5));
          vec2 disp = vec2(noise1, noise2) * 0.03;
          disp += vec2(noise3, noise4) * 0.005;
          float distanceFalloff = clamp(length(toCenter) * 1.4, 0.0, 1.0);
          disp.x += sin((refPos.x * 20.0) + (time * 4.0)) * 0.02 * distanceFalloff;
          disp.y += cos((refPos.y * 20.0) + (time * 3.0)) * 0.02 * distanceFalloff;
          vec2 streamPull = flowNormal * (-curvedLateral) * (stream * 0.44 + knot * 0.26 + shoulder * 0.16);
          vec2 bendLift = flowNormal * spineOffset * (stream * 0.22 + haze * 0.08);
          vec2 forwardSweep = flowDir * ((stream * 0.06) + (knot * 0.09) - (shoulder * 0.025));
          vec2 ribbonCurl = flowNormal
            * sin((axial * 8.0) - (time * 1.9) + (noise0 * 3.0))
            * (stream * 0.028 + t3 * 0.018);
          pos += (streamPull + bendLift + forwardSweep + ribbonCurl) * pow(t2, 0.8) * uRingDisplacement;
          float scaleDiff = t - scale;
          scaleDiff *= 0.2;
          scale += scaleDiff;
          vec2 finalPos = currentPos + disp + (pos * 0.25);
          velocity *= 0.5;
          velocity += scale * 0.25;
          gl_FragColor = vec4(finalPos, scale, velocity);
        }
      `,
    });
    this.simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial));

    const geometry = new THREE.BufferGeometry();
    const uvs = new Float32Array(this.count * 2);
    const positions = new Float32Array(this.count * 3);
    const seeds = new Float32Array(this.count * 4);

    for (let index = 0; index < this.count; index += 1) {
      uvs[index * 2] = (index % this.size) / this.size;
      uvs[index * 2 + 1] = Math.floor(index / this.size) / this.size;
      seeds[index * 4] = Math.random();
      seeds[index * 4 + 1] = Math.random();
      seeds[index * 4 + 2] = Math.random();
      seeds[index * 4 + 3] = Math.random();
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("seeds", new THREE.BufferAttribute(seeds, 4));

    this.renderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: this.posTex },
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(this.scene.colorControls.color1) },
        uColor2: { value: new THREE.Color(this.scene.colorControls.color2) },
        uColor3: { value: new THREE.Color(this.scene.colorControls.color3) },
        uAlpha: { value: this.scene.colorControls.alpha },
        uGlow: { value: this.scene.colorControls.glow },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        uRez: {
          value: new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height),
        },
        uParticleScale: { value: this.particleScale },
        uPixelRatio: { value: this.scene.pixelRatio },
        uColorScheme: { value: this.colorScheme },
      },
      vertexShader: `
        precision highp float;
        attribute vec4 seeds;
        uniform sampler2D uPosition;
        uniform float uTime;
        uniform float uParticleScale;
        uniform float uPixelRatio;
        uniform int uColorScheme;
        varying vec4 vSeeds;
        varying float vVelocity;
        varying vec2 vLocalPos;
        varying vec2 vScreenPos;
        varying float vScale;
        void main() {
          vec4 pos = texture2D(uPosition, uv);
          vSeeds = seeds;
          vVelocity = pos.w;
          vScale = pos.z;
          vLocalPos = pos.xy;
          vec4 viewSpace = modelViewMatrix * vec4(vec3(pos.xy, 0.0), 1.0);
          gl_Position = projectionMatrix * viewSpace;
          vScreenPos = gl_Position.xy;
          float lowActivityWeight = 1.0 - smoothstep(0.035, 0.165, vScale);
          float sizeVariance = mix(0.9, 1.55, seeds.x);
          float shimmer = 0.96 + (sin((uTime * mix(0.3, 0.85, seeds.y)) + (seeds.z * 6.28318530718)) * 0.08);
          float ambientSize = mix(1.28, 1.98, seeds.w) * mix(1.04, 1.72, lowActivityWeight);
          float minPointSize = mix(2.1, 3.45, lowActivityWeight);
          gl_PointSize = max(
            minPointSize,
            (ambientSize + (vScale * 5.4)) * sizeVariance * shimmer * (uPixelRatio * 0.6) * uParticleScale
          );
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vSeeds;
        varying vec2 vScreenPos;
        varying vec2 vLocalPos;
        varying float vScale;
        varying float vVelocity;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform vec2 uRingPos;
        uniform vec2 uRez;
        uniform float uAlpha;
        uniform float uGlow;
        uniform float uTime;
        uniform int uColorScheme;
        ${NOISE_GLSL}
        void main() {
          vec2 uv = gl_PointCoord.xy - vec2(0.5);
          float distanceToCenter = length(uv);
          float noiseColor = snoise(vec3(vLocalPos * 1.6 + vec2(74.664, 91.556), uTime * 0.18));
          noiseColor = (noiseColor + 1.0) * 0.5;
          float twinkle = 0.88
            + (sin((uTime * mix(0.2, 0.75, vSeeds.y)) + (vSeeds.z * 6.28318530718)) * 0.22);
          float brightness = mix(0.78, 1.24, vSeeds.x);
          brightness += clamp(vVelocity, 0.0, 1.0) * 0.12;
          float core = smoothstep(0.19, 0.0, distanceToCenter);
          float halo = smoothstep(0.6, 0.04, distanceToCenter);
          float outerFade = smoothstep(0.68, 0.12, distanceToCenter);
          float sparkleMask = smoothstep(0.8, 1.0, vSeeds.w);
          float sparkleX = smoothstep(0.06, 0.0, abs(uv.x)) * smoothstep(0.5, 0.04, abs(uv.y));
          float sparkleY = smoothstep(0.06, 0.0, abs(uv.y)) * smoothstep(0.5, 0.04, abs(uv.x));
          float sparkle = (sparkleX + sparkleY) * sparkleMask * twinkle * 0.24;
          float progress = clamp((noiseColor * 0.35) + (vSeeds.x * 0.65), 0.0, 1.0);
          vec3 col = mix(
            mix(uColor1, uColor2, progress),
            uColor3,
            smoothstep(0.72, 1.0, progress + (sparkleMask * 0.08))
          );
          vec3 color = mix(col, uColor3, (core * 0.44) + (sparkleMask * 0.08));
          vec3 inkTone = mix(uColor1, uColor2, 0.35);
          float star = (core * 1.15) + (halo * uGlow) + sparkle;
          float themeSoftness = mix(1.0, 0.96, float(uColorScheme));
          float ambientPresence = mix(0.58, 0.9, vSeeds.w);
          ambientPresence = mix(ambientPresence, min(1.0, ambientPresence + 0.16), float(uColorScheme));
          float activePresence = smoothstep(0.03, 0.16, vScale);
          float presence = mix(ambientPresence, 1.0, activePresence);
          float alpha = uAlpha * star * outerFade * brightness * twinkle * themeSoftness;
          alpha *= mix(1.0, 1.18, float(uColorScheme));
          alpha *= presence;
          if (alpha < 0.003) {
            discard;
          }
          color = mix(color, inkTone, float(uColorScheme) * 0.28);
          color = clamp(color, 0.0, 1.0);
          gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
          #ifdef SRGB_TRANSFER
            gl_FragColor = sRGBTransferOETF(gl_FragColor);
          #endif
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Points(geometry, this.renderMaterial);
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.set(5, 5, 5);
    this.scene.threeScene.add(this.mesh);
  }

  setTheme(theme) {
    this.colorScheme = theme === "dark" ? 0 : 1;
    this.renderMaterial.uniforms.uColor1.value.set(this.scene.colorControls.color1);
    this.renderMaterial.uniforms.uColor2.value.set(this.scene.colorControls.color2);
    this.renderMaterial.uniforms.uColor3.value.set(this.scene.colorControls.color3);
    this.renderMaterial.uniforms.uAlpha.value = this.scene.colorControls.alpha;
    this.renderMaterial.uniforms.uGlow.value = this.scene.colorControls.glow;
    this.renderMaterial.uniforms.uColorScheme.value = this.colorScheme;
  }

  resize() {
    this.renderMaterial.uniforms.uRez.value.set(
      this.scene.renderer.domElement.width,
      this.scene.renderer.domElement.height,
    );
    this.renderMaterial.uniforms.uPixelRatio.value = this.scene.pixelRatio;
    this.renderMaterial.needsUpdate = true;
  }

  update() {
    const elapsed = this.scene.clock.getElapsedTime();
    const deltaTime = elapsed - this.lastTime;
    this.lastTime = elapsed;

    const noiseX = (this.noise.getVal(this.scene.time * 0.66 + 94.234) - 0.5) * 2;
    const noiseY = (this.noise.getVal(this.scene.time * 0.75 + 21.028) - 0.5) * 2;

    this.cursorPos.set(noiseX * 0.2, noiseY * 0.1);

    if (this.scene.isIntersecting) {
      this.cursorPos.set(
        this.scene.intersectionPoint.x * 0.175 + noiseX * 0.1,
        this.scene.intersectionPoint.y * 0.175 + noiseY * 0.1,
      );
      this.ringPos.set(
        this.ringPos.x + (this.cursorPos.x - this.ringPos.x) * 0.02,
        this.ringPos.y + (this.cursorPos.y - this.ringPos.y) * 0.02,
      );
    } else {
      this.ringPos.set(
        this.ringPos.x + (this.cursorPos.x - this.ringPos.x) * 0.01,
        this.ringPos.y + (this.cursorPos.y - this.ringPos.y) * 0.01,
      );
    }

    this.particleScale =
      (this.scene.renderer.domElement.width / this.scene.pixelRatio / 2000) *
      this.scene.particlesScale;

    this.simMaterial.uniforms.uPosition.value = this.everRendered ? this.rt1.texture : this.posTex;
    this.simMaterial.uniforms.uTime.value = elapsed;
    this.simMaterial.uniforms.uDeltaTime.value = deltaTime;
    this.simMaterial.uniforms.uRingRadius.value =
      0.175 + Math.sin(this.scene.time) * 0.03 + Math.cos(this.scene.time * 3) * 0.02;
    this.simMaterial.uniforms.uRingPos.value = this.ringPos;
    this.simMaterial.uniforms.uRingWidth.value = this.scene.ringWidth;
    this.simMaterial.uniforms.uRingWidth2.value = this.scene.ringWidth2;
    this.simMaterial.uniforms.uRingDisplacement.value = this.scene.ringDisplacement;

    this.renderer.setRenderTarget(this.rt2);
    this.renderer.render(this.simScene, this.simCamera);
    this.renderer.setRenderTarget(null);

    this.renderMaterial.uniforms.uPosition.value = this.everRendered
      ? this.rt2.texture
      : this.posTex;
    this.renderMaterial.uniforms.uTime.value = elapsed;
    this.renderMaterial.uniforms.uRingPos.value = this.ringPos;
    this.renderMaterial.uniforms.uParticleScale.value = this.particleScale;
  }

  postRender() {
    const current = this.rt1;
    this.rt1 = this.rt2;
    this.rt2 = current;
    this.everRendered = true;
  }

  kill() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.rt1.dispose();
    this.rt2.dispose();
    this.posTex.dispose();
    this.simMaterial.dispose();
    this.renderMaterial.dispose();
  }
}

class MainParticleScene {
  constructor(container) {
    this.loaded = false;
    this.container = container;
    this.theme = getTheme();
    this.interactive = true;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.particlesScale = PARTICLE_PARAMS.particlesScale;
    this.density = PARTICLE_PARAMS.density;
    this.ringWidth = PARTICLE_PARAMS.ringWidth;
    this.ringWidth2 = PARTICLE_PARAMS.ringWidth2;
    this.ringDisplacement = PARTICLE_PARAMS.ringDisplacement;
    this.isPaused = false;
    this.time = 0;
    this.lastTime = 0;
    this.dt = 0;
    this.skipFrame = false;
    this.isIntersecting = false;
    this.mouseIsOver = false;
    this.mouse = new THREE.Vector2();
    this.intersectionPoint = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();

    this.colorControls = { ...THEME_COLORS[this.theme] };

    this.threeScene = new THREE.Scene();
    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);
    this.canvas.width = container.offsetWidth;
    this.canvas.height = container.offsetHeight;

    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      stencil: false,
      precision: "highp",
    });
    this.gl = this.renderer.getContext();
    this.renderer.extensions.get("EXT_color_buffer_float");
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.clock = new THREE.Clock();
    this.camera = new THREE.PerspectiveCamera(
      40,
      this.gl.drawingBufferWidth / this.gl.drawingBufferHeight,
      0.1,
      1000,
    );
    this.camera.position.z = 3.1;

    this.raycastPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12.5, 12.5),
      new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
      }),
    );
    this.threeScene.add(this.raycastPlane);

    this.particles = new MainParticleSystem(this);
    this.loaded = true;

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);
  }

  setTheme(theme) {
    this.theme = theme;
    this.colorControls = { ...THEME_COLORS[theme] };
    if (this.particles) {
      this.particles.setTheme(theme);
    }
  }

  handleResize() {
    this.canvas.width = this.container.offsetWidth;
    this.canvas.height = this.container.offsetHeight;
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.camera.aspect = this.canvas.width / this.canvas.height;
    this.camera.updateProjectionMatrix();

    if (this.particles) {
      this.particles.resize();
    }
  }

  preRender() {
    const elapsed = this.clock.getElapsedTime();
    this.dt = elapsed - this.lastTime;
    this.lastTime = elapsed;
    this.time += this.dt;

    this.particles.update();

    if (this.interactive && !this.skipFrame) {
      const tracker = getMouseTracker();
      const rect = this.canvas.getBoundingClientRect();

      if (tracker && rect.width > 0 && rect.height > 0) {
        this.mouse.x = (tracker.cursor.x - rect.left) * (tracker.screenWidth / rect.width);
        this.mouse.y = (tracker.cursor.y - rect.top) * (tracker.screenHeight / rect.height);
        this.mouse.x = (this.mouse.x / tracker.screenWidth) * 2 - 1;
        this.mouse.y = -(this.mouse.y / tracker.screenHeight) * 2 + 1;
        this.mouseIsOver =
          this.mouse.x >= -1 && this.mouse.x <= 1 && this.mouse.y >= -1 && this.mouse.y <= 1;
      }
    }

    this.skipFrame = !this.skipFrame;
    if (this.skipFrame) {
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.raycastPlane);

    if (hits.length > 0 && this.mouseIsOver) {
      this.intersectionPoint.copy(hits[0].point);
      this.isIntersecting = true;
      return;
    }

    this.isIntersecting = false;
  }

  render() {
    if (!this.loaded || this.isPaused) {
      return;
    }

    this.preRender();
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.render(this.threeScene, this.camera);
    this.particles.postRender();
  }

  stop() {
    this.isPaused = true;
    this.clock.stop();
  }

  resume() {
    this.isPaused = false;
    this.clock.start();
  }

  kill() {
    this.stop();
    window.removeEventListener("resize", this.handleResize);

    if (this.raycastPlane) {
      this.threeScene.remove(this.raycastPlane);
      this.raycastPlane.geometry.dispose();
      this.raycastPlane.material.dispose();
    }

    if (this.particles) {
      this.threeScene.remove(this.particles.mesh);
      this.particles.kill();
    }

    this.renderer.dispose();

    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

const wrapStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  overflow: "hidden",
  pointerEvents: "none",
  animation: "fadeIn 3.5s ease both",
};

const DotGridBackground = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const frameRef = useRef(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      return undefined;
    }

    const probeCanvas = document.createElement("canvas");
    if (!probeCanvas.getContext("webgl2")) {
      return undefined;
    }

    const scene = new MainParticleScene(containerRef.current);
    sceneRef.current = scene;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      if (visibleRef.current) {
        scene.render();
      }
    };

    animate();

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          scene.resume();
        } else {
          scene.stop();
        }
      },
      { threshold: 0 },
    );

    intersectionObserver.observe(containerRef.current);

    const mutationObserver = new MutationObserver(() => {
      scene.setTheme(getTheme());
    });

    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      cancelAnimationFrame(frameRef.current);
      scene.kill();
      sceneRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={wrapStyle} aria-hidden="true" />;
};

export default DotGridBackground;
