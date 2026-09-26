"use client";

import * as React from "react";
import * as THREE from "three";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";
import { isLandAt } from "@/features/analytics/world-land-mask";
import {
  useSimulatedLivePoints,
  type LiveGlobePoint,
} from "@/features/analytics/live-globe-data";

/* -------------------------------------------------------------------------- */
/* Constantes de cena                                                         */
/* -------------------------------------------------------------------------- */

const GLOBE_RADIUS = 1;
/** Quantos pontos são semeados na esfera antes de filtrar por terra firme. */
const SURFACE_SAMPLES = 46000;
const CAMERA_Z_DEFAULT = 4.6;
const CAMERA_Z_FOCUSED = 3.7;
const CAMERA_Z_HOVER = 4.35;
/** Velocidade da rotação automática, em radianos por segundo. */
const AUTO_SPIN = 0.055;
const MAX_ARCS = 7;
const ARC_LIFETIME = 3600;
const MAX_MARKERS = 64;
/** Raio, em pixels, para considerar que o rato está sobre um marcador. */
const HOVER_RADIUS = 22;

const COLOR_LAND_LOW = new THREE.Color("#3a3a3a");
const COLOR_LAND_HIGH = new THREE.Color("#c2c2c2");
const COLOR_CITY = new THREE.Color("#f5f5f5");
const COLOR_ATMOSPHERE = new THREE.Color("#8a8a8a");
const COLOR_OCEAN = new THREE.Color("#0a0a0a");

/** Escala de intensidade monocromática (design aether): point-cloud branco. */
const INTENSITY_RAMP = [
  new THREE.Color("#f5f5f5"),
  new THREE.Color("#c2c2c2"),
  new THREE.Color("#909090"),
  new THREE.Color("#6a6a6a"),
];

/* -------------------------------------------------------------------------- */
/* Utilitários                                                                */
/* -------------------------------------------------------------------------- */

/** Converte lat/lon (graus) para uma posição na esfera. */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Cor do marcador em função do número de utilizadores online. */
function intensityColor(users: number, target: THREE.Color): THREE.Color {
  const t = Math.min(1, Math.max(0, (users - 1) / 14));
  const scaled = t * (INTENSITY_RAMP.length - 1);
  const index = Math.min(INTENSITY_RAMP.length - 2, Math.floor(scaled));
  return target
    .copy(INTENSITY_RAMP[index])
    .lerp(INTENSITY_RAMP[index + 1], scaled - index);
}

/**
 * Distribuição de Fibonacci: pontos uniformemente espalhados pela esfera, sem
 * o amontoado que uma grelha lat/lon cria nos polos. Só ficam os que caem em terra.
 */
function buildLandGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const seeds: number[] = [];
  const lights: number[] = [];

  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < SURFACE_SAMPLES; i++) {
    const y = 1 - (i / (SURFACE_SAMPLES - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = Math.atan2(z, -x) * (180 / Math.PI) - 180;
    const normalizedLon = ((((lon + 180) % 360) + 360) % 360) - 180;

    if (!isLandAt(lat, normalizedLon)) continue;

    positions.push(x * GLOBE_RADIUS, y * GLOBE_RADIUS, z * GLOBE_RADIUS);
    seeds.push(Math.random());
    // Latitudes médias recebem mais "luz de cidade" — imita a densidade urbana real.
    lights.push(Math.random() * 0.55 + (1 - Math.abs(lat) / 90) * 0.45);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aLight", new THREE.Float32BufferAttribute(lights, 1));
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Shaders                                                                    */
/* -------------------------------------------------------------------------- */

const LAND_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aLight;
  varying float vFacing;
  varying float vSeed;
  varying float vLight;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * normalize(position));
    vFacing = dot(normal, normalize(-mv.xyz));
    vSeed = aSeed;
    vLight = aLight;

    float shrink = mix(0.5, 1.0, smoothstep(-0.1, 0.45, vFacing));
    gl_PointSize = uSize * uPixelRatio * shrink * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const LAND_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform vec3 uColorCity;
  varying float vFacing;
  varying float vSeed;
  varying float vLight;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;

    float mask = smoothstep(0.5, 0.15, dist);
    float twinkle = 0.82 + 0.18 * sin(uTime * 1.5 + vSeed * 43.0);

    vec3 color = mix(uColorLow, uColorHigh, vLight);
    color = mix(color, uColorCity, step(0.955, vSeed) * 0.85);

    float front = smoothstep(-0.12, 0.32, vFacing);
    float alpha = mask * twinkle * mix(0.06, 0.95, front);

    gl_FragColor = vec4(color, alpha);
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * normalize(position));
    vFacing = dot(normal, normalize(-mv.xyz));
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vFacing;

  void main() {
    // No BackSide vFacing é negativo; |vFacing| vale 1 junto ao planeta e 0 na
    // borda externa da esfera de atmosfera — daí o halo desvanecer para fora.
    float rim = pow(clamp(-vFacing, 0.0, 1.0), 2.8);
    gl_FragColor = vec4(uColor, rim * uIntensity);
  }
`;

const OCEAN_VERTEX = /* glsl */ `
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * normalize(position));
    vFacing = dot(normal, normalize(-mv.xyz));
    gl_Position = projectionMatrix * mv;
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRimColor;
  varying float vFacing;

  void main() {
    float rim = pow(1.0 - clamp(vFacing, 0.0, 1.0), 3.2);
    vec3 color = mix(uColor, uRimColor, rim * 0.85);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const MARKER_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aScale;
  attribute float aOpacity;
  attribute vec3 aColor;
  varying float vFacing;
  varying float vSeed;
  varying float vOpacity;
  varying vec3 vColor;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * normalize(position));
    vFacing = dot(normal, normalize(-mv.xyz));
    vSeed = aSeed;
    vOpacity = aOpacity;
    vColor = aColor;

    gl_PointSize = uSize * uPixelRatio * aScale * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const MARKER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying float vFacing;
  varying float vSeed;
  varying float vOpacity;
  varying vec3 vColor;

  void main() {
    // dist normalizada 0 (centro) → 1 (borda do sprite)
    float dist = length(gl_PointCoord - 0.5) * 2.0;
    if (dist > 1.0) discard;

    float core = smoothstep(0.22, 0.0, dist);
    float halo = smoothstep(0.75, 0.0, dist) * 0.28;

    // anel que expande e desvanece, sempre desfasado por ponto
    float phase = fract(uTime * 0.5 + vSeed);
    float radius = mix(0.18, 0.95, phase);
    float ring = smoothstep(0.07, 0.0, abs(dist - radius)) * (1.0 - phase) * 0.85;

    float front = smoothstep(-0.02, 0.22, vFacing);
    float alpha = (core + halo + ring) * vOpacity * front;
    if (alpha <= 0.001) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

const ARC_VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;
  varying float vFacing;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 normal = normalize(normalMatrix * normalize(position));
    vFacing = dot(normal, normalize(-mv.xyz));
    vT = aT;
    gl_Position = projectionMatrix * mv;
  }
`;

const ARC_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uOpacity;
  varying float vT;
  varying float vFacing;

  void main() {
    float trail = smoothstep(uHead - 0.28, uHead, vT) * step(vT, uHead);
    float base = 0.14 * smoothstep(0.0, 0.15, uHead);
    float front = smoothstep(-0.25, 0.1, vFacing);
    float alpha = (base + trail) * uOpacity * front;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* -------------------------------------------------------------------------- */
/* Componente                                                                 */
/* -------------------------------------------------------------------------- */

interface HoverState {
  point: LiveGlobePoint;
  x: number;
  y: number;
}

export interface LiveGlobeProps {
  /** Pontos reais. Se ficar vazio/indefinido, entra o feed simulado. */
  points?: LiveGlobePoint[];
  className?: string;
}

interface ArcInstance {
  line: THREE.Line;
  material: THREE.ShaderMaterial;
  bornAt: number;
}

function LiveGlobeImpl({ points, className }: LiveGlobeProps) {
  const simulated = useSimulatedLivePoints();
  const livePoints = points && points.length > 0 ? points : simulated;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const [hover, setHover] = React.useState<HoverState | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);

  /** Pontos sempre atualizados sem reiniciar a cena. */
  const pointsRef = React.useRef<LiveGlobePoint[]>(livePoints);
  React.useEffect(() => {
    pointsRef.current = livePoints;
  }, [livePoints]);

  /** Comandos que o React envia para o loop de render. */
  const commandRef = React.useRef<{ focus: LiveGlobePoint | null }>({
    focus: null,
  });

  React.useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    // Anotados de forma explícita: as funções declaradas abaixo são içadas e o
    // TypeScript perderia o estreitamento de tipo sem isto.
    const container: HTMLDivElement = containerRef.current;
    const canvas: HTMLCanvasElement = canvasRef.current;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    /* ---------------------------------------------------------------- cena */

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z_DEFAULT);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      // Sem WebGL o componente simplesmente não desenha — o resto do painel segue.
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);

    /** Grupo que roda. A atmosfera fica fora para o halo não oscilar. */
    const globe = new THREE.Group();
    globe.rotation.order = "XYZ";
    globe.rotation.x = 0.22;
    globe.rotation.y = 2.2; // arranca com o Atlântico Sul de frente
    scene.add(globe);

    /* --------------------------------------------------------------- oceano */

    const oceanMaterial = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        uColor: { value: COLOR_OCEAN },
        uRimColor: { value: new THREE.Color("#2a2a2a") },
      },
    });
    const oceanGeometry = new THREE.SphereGeometry(
      GLOBE_RADIUS * 0.992,
      64,
      64,
    );
    // Globo transparente, a pedido do dono: sem a esfera do oceano — só os
    // pontinhos dos continentes, vendo através (frente e verso). A malha
    // fica invisível para não ocluir os pontos de trás.
    const oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
    oceanMesh.visible = false;
    globe.add(oceanMesh);

    /* ------------------------------------------------------- pontos de terra */

    const landGeometry = buildLandGeometry();
    const landMaterial = new THREE.ShaderMaterial({
      vertexShader: LAND_VERTEX,
      fragmentShader: LAND_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 15 },
        uPixelRatio: { value: pixelRatio },
        uColorLow: { value: COLOR_LAND_LOW },
        uColorHigh: { value: COLOR_LAND_HIGH },
        uColorCity: { value: COLOR_CITY },
      },
    });
    globe.add(new THREE.Points(landGeometry, landMaterial));

    /* ---------------------------------------------------------- atmosfera */

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: COLOR_ATMOSPHERE },
        uIntensity: { value: 0.95 },
      },
    });
    const atmosphereGeometry = new THREE.SphereGeometry(
      GLOBE_RADIUS * 1.28,
      48,
      48,
    );
    scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

    /* ---------------------------------------------------------- marcadores */

    const markerGeometry = new THREE.BufferGeometry();
    const markerPositions = new Float32Array(MAX_MARKERS * 3);
    const markerColors = new Float32Array(MAX_MARKERS * 3);
    const markerSeeds = new Float32Array(MAX_MARKERS);
    const markerScales = new Float32Array(MAX_MARKERS);
    const markerOpacities = new Float32Array(MAX_MARKERS);

    markerGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(markerPositions, 3),
    );
    markerGeometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(markerColors, 3),
    );
    markerGeometry.setAttribute(
      "aSeed",
      new THREE.BufferAttribute(markerSeeds, 1),
    );
    markerGeometry.setAttribute(
      "aScale",
      new THREE.BufferAttribute(markerScales, 1),
    );
    markerGeometry.setAttribute(
      "aOpacity",
      new THREE.BufferAttribute(markerOpacities, 1),
    );
    markerGeometry.setDrawRange(0, 0);

    const markerMaterial = new THREE.ShaderMaterial({
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 190 },
        uPixelRatio: { value: pixelRatio },
      },
    });
    const markerCloud = new THREE.Points(markerGeometry, markerMaterial);
    markerCloud.frustumCulled = false;
    globe.add(markerCloud);

    /** Estado por marcador: posição na esfera + animação de entrada/saída. */
    interface MarkerState {
      point: LiveGlobePoint;
      position: THREE.Vector3;
      seed: number;
      /** 0 → invisível, 1 → totalmente presente. */
      life: number;
      leaving: boolean;
    }

    const markers = new Map<string, MarkerState>();
    /** Ordem estável usada para casar índice do buffer com o ponto sob o rato. */
    let markerOrder: MarkerState[] = [];

    function syncMarkers() {
      const incoming = pointsRef.current.slice(0, MAX_MARKERS);
      const seen = new Set<string>();

      for (const point of incoming) {
        seen.add(point.id);
        const existing = markers.get(point.id);
        if (existing) {
          existing.point = point;
          existing.leaving = false;
        } else {
          markers.set(point.id, {
            point,
            position: latLonToVector3(
              point.lat,
              point.lon,
              GLOBE_RADIUS * 1.012,
            ),
            seed: Math.random(),
            life: 0,
            leaving: false,
          });
        }
      }

      for (const [id, marker] of markers) {
        if (!seen.has(id)) marker.leaving = true;
      }
    }

    syncMarkers();

    /* ---------------------------------------------------------------- arcos */

    const arcs: ArcInstance[] = [];
    let lastArcSpawn = 0;

    function spawnArc(now: number) {
      const candidates = markerOrder.filter((m) => !m.leaving && m.life > 0.4);
      if (candidates.length < 2 || arcs.length >= MAX_ARCS) return;

      const from = candidates[Math.floor(Math.random() * candidates.length)];
      let to = candidates[Math.floor(Math.random() * candidates.length)];
      if (to === from)
        to = candidates[(candidates.indexOf(from) + 1) % candidates.length];
      if (to === from) return;

      const start = from.position
        .clone()
        .normalize()
        .multiplyScalar(GLOBE_RADIUS);
      const end = to.position.clone().normalize().multiplyScalar(GLOBE_RADIUS);
      const angle = start.angleTo(end);
      // Quanto mais longe, mais alto o arco sobe — dá noção de distância.
      const lift = 1 + 0.12 + (angle / Math.PI) * 0.45;
      const control = start.clone().add(end).normalize().multiplyScalar(lift);

      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const segments = 72;
      const positions = new Float32Array((segments + 1) * 3);
      const ts = new Float32Array(segments + 1);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const p = curve.getPoint(t);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        ts[i] = t;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      geometry.setAttribute("aT", new THREE.BufferAttribute(ts, 1));

      const material = new THREE.ShaderMaterial({
        vertexShader: ARC_VERTEX,
        fragmentShader: ARC_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: {
            value: intensityColor(
              Math.max(from.point.users, to.point.users),
              new THREE.Color(),
            ),
          },
          uHead: { value: 0 },
          uOpacity: { value: 0 },
        },
      });

      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      globe.add(line);
      arcs.push({ line, material, bornAt: now });
      lastArcSpawn = now;
    }

    function disposeArc(arc: ArcInstance) {
      globe.remove(arc.line);
      arc.line.geometry.dispose();
      arc.material.dispose();
    }

    /* --------------------------------------------------------- interações */

    let autoSpin = !reducedMotion;
    let dragging = false;
    let pointerInside = false;
    let lastPointer = { x: 0, y: 0 };
    const pointerNdc = { x: 0, y: 0, px: 0, py: 0, active: false };

    let targetRotationY = globe.rotation.y;
    let targetRotationX = globe.rotation.x;
    let targetCameraZ = CAMERA_Z_DEFAULT;
    /** Compensa cards estreitos, onde o fov vertical não chega. */
    let distanceScale = 1;

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      autoSpin = false;
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.px = event.clientX - rect.left;
      pointerNdc.py = event.clientY - rect.top;
      pointerNdc.x = (pointerNdc.px / rect.width) * 2 - 1;
      pointerNdc.y = -(pointerNdc.py / rect.height) * 2 + 1;
      pointerNdc.active = true;

      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      targetRotationY += dx * 0.005;
      targetRotationX = THREE.MathUtils.clamp(
        targetRotationX + dy * 0.005,
        -0.95,
        0.95,
      );
    }

    function onPointerUp(event: PointerEvent) {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function onPointerEnter() {
      pointerInside = true;
    }

    function onPointerLeave() {
      pointerInside = false;
      pointerNdc.active = false;
      dragging = false;
      setHover(null);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerenter", onPointerEnter);
    canvas.addEventListener("pointerleave", onPointerLeave);

    /* -------------------------------------------------------- redimensionar */

    let width = 0;
    let height = 0;

    function resize() {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      width = rect.width;
      height = rect.height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Mantém a densidade visual dos pontos em qualquer tamanho de card.
      landMaterial.uniforms.uSize.value = 15 * (height / 560);
      markerMaterial.uniforms.uSize.value = 190 * (height / 560);
      // O fov é vertical: em cards estreitos é preciso afastar a câmara para o
      // halo da atmosfera não encostar nas laterais.
      const previousScale = distanceScale;
      distanceScale = Math.max(1, 1.4 / camera.aspect);
      targetCameraZ = (targetCameraZ / previousScale) * distanceScale;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    /* -------------------------------------------------------- ciclo de vida */

    let visible = true;
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(container);

    function onVisibilityChange() {
      visible = !document.hidden;
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    /* --------------------------------------------------------------- render */

    const projected = new THREE.Vector3();
    const worldPosition = new THREE.Vector3();
    const cameraToPoint = new THREE.Vector3();
    const scratchColor = new THREE.Color();

    let hoveredId: string | null = null;
    let frame = 0;
    let lastFrameTime = performance.now();
    let elapsed = 0;
    let syncAccumulator = 0;

    function tick(now: number) {
      frame = requestAnimationFrame(tick);

      const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      if (!visible || width === 0) return;

      elapsed += delta;
      landMaterial.uniforms.uTime.value = elapsed;
      markerMaterial.uniforms.uTime.value = elapsed;

      /* --- rotação --- */
      if (autoSpin && !dragging) targetRotationY += AUTO_SPIN * delta;
      globe.rotation.y +=
        (targetRotationY - globe.rotation.y) * Math.min(1, delta * 6);
      globe.rotation.x +=
        (targetRotationX - globe.rotation.x) * Math.min(1, delta * 6);

      /* --- zoom suave --- */
      const focus = commandRef.current.focus;
      if (focus) {
        const p = latLonToVector3(focus.lat, focus.lon, GLOBE_RADIUS);
        const horizontal = Math.hypot(p.x, p.z);
        targetRotationY = Math.atan2(-p.x, p.z);
        targetRotationX = Math.atan2(p.y, horizontal);
        targetCameraZ = CAMERA_Z_FOCUSED * distanceScale;
        autoSpin = false;
        commandRef.current.focus = null;
      } else if (!dragging && pointerInside) {
        targetCameraZ = Math.min(targetCameraZ, CAMERA_Z_HOVER * distanceScale);
      }
      camera.position.z +=
        (targetCameraZ - camera.position.z) * Math.min(1, delta * 4);

      /* --- sincronizar marcadores com o React a cada 250ms --- */
      syncAccumulator += delta;
      if (syncAccumulator > 0.25) {
        syncAccumulator = 0;
        syncMarkers();
      }

      /* --- animar marcadores --- */
      markerOrder = [];
      let index = 0;
      for (const [id, marker] of markers) {
        marker.life = THREE.MathUtils.clamp(
          marker.life + (marker.leaving ? -delta * 1.6 : delta * 1.8),
          0,
          1,
        );
        if (marker.leaving && marker.life <= 0) {
          markers.delete(id);
          continue;
        }
        if (index >= MAX_MARKERS) continue;

        const eased = marker.life * marker.life * (3 - 2 * marker.life);
        markerPositions[index * 3] = marker.position.x;
        markerPositions[index * 3 + 1] = marker.position.y;
        markerPositions[index * 3 + 2] = marker.position.z;

        intensityColor(marker.point.users, scratchColor);
        markerColors[index * 3] = scratchColor.r;
        markerColors[index * 3 + 1] = scratchColor.g;
        markerColors[index * 3 + 2] = scratchColor.b;

        markerSeeds[index] = marker.seed;
        const emphasis = hoveredId === id ? 1.35 : 1;
        markerScales[index] =
          eased * emphasis * (0.75 + Math.min(marker.point.users, 16) / 24);
        markerOpacities[index] = eased * (hoveredId === id ? 1 : 0.92);

        markerOrder.push(marker);
        index += 1;
      }

      markerGeometry.setDrawRange(0, index);
      markerGeometry.attributes.position.needsUpdate = true;
      markerGeometry.attributes.aColor.needsUpdate = true;
      markerGeometry.attributes.aSeed.needsUpdate = true;
      markerGeometry.attributes.aScale.needsUpdate = true;
      markerGeometry.attributes.aOpacity.needsUpdate = true;

      /* --- arcos --- */
      if (!reducedMotion && now - lastArcSpawn > 800) spawnArc(now);
      for (let i = arcs.length - 1; i >= 0; i--) {
        const arc = arcs[i];
        const age = (now - arc.bornAt) / ARC_LIFETIME;
        if (age >= 1) {
          disposeArc(arc);
          arcs.splice(i, 1);
          continue;
        }
        arc.material.uniforms.uHead.value = Math.min(1, age * 1.35);
        arc.material.uniforms.uOpacity.value =
          Math.min(1, age * 6) * Math.min(1, (1 - age) * 4);
      }

      /* --- hover por projeção em ecrã (mais barato e estável que raycast) --- */
      globe.updateMatrixWorld();
      let nearestId: string | null = null;
      let nearest: HoverState | null = null;
      if (pointerNdc.active && !dragging) {
        let bestDistance = HOVER_RADIUS;
        for (const marker of markerOrder) {
          worldPosition.copy(marker.position).applyMatrix4(globe.matrixWorld);
          // ignora o hemisfério de trás
          cameraToPoint.copy(worldPosition).sub(camera.position);
          if (cameraToPoint.dot(worldPosition) > 0) continue;
          projected.copy(worldPosition).project(camera);
          const screenX = ((projected.x + 1) / 2) * width;
          const screenY = ((1 - projected.y) / 2) * height;
          const distance = Math.hypot(
            screenX - pointerNdc.px,
            screenY - pointerNdc.py,
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            nearestId = marker.point.id;
            nearest = { point: marker.point, x: screenX, y: screenY };
          }
        }
      }

      if (nearestId !== hoveredId) {
        hoveredId = nearestId;
        setHover(nearest);
      } else if (nearest) {
        // mantém o tooltip colado ao ponto enquanto o globo roda
        setHover((current) =>
          current &&
          Math.abs(current.x - nearest.x) + Math.abs(current.y - nearest.y) > 1
            ? { ...current, x: nearest.x, y: nearest.y }
            : current,
        );
      }

      canvas.style.cursor = dragging
        ? "grabbing"
        : hoveredId
          ? "pointer"
          : "grab";

      renderer.render(scene, camera);
    }

    function onClick() {
      if (!hoveredId) {
        // clique no vazio devolve a vista global
        targetCameraZ = CAMERA_Z_DEFAULT * distanceScale;
        autoSpin = !reducedMotion;
        setFocused(null);
        return;
      }
      const marker = markerOrder.find((m) => m.point.id === hoveredId);
      if (!marker) return;
      commandRef.current.focus = marker.point;
      setFocused(marker.point.id);
    }
    canvas.addEventListener("click", onClick);

    frame = requestAnimationFrame(tick);

    /* -------------------------------------------------------------- limpeza */

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);

      for (const arc of [...arcs]) disposeArc(arc);
      oceanGeometry.dispose();
      oceanMaterial.dispose();
      landGeometry.dispose();
      landMaterial.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  const totalUsers = React.useMemo(
    () => livePoints.reduce((sum, p) => sum + p.users, 0),
    [livePoints],
  );

  const topCountries = React.useMemo(() => {
    const grouped = new Map<string, { country: string; users: number }>();
    for (const point of livePoints) {
      const entry = grouped.get(point.countryCode);
      if (entry) entry.users += point.users;
      else
        grouped.set(point.countryCode, {
          country: point.country,
          users: point.users,
        });
    }
    return [...grouped.values()].sort((a, b) => b.users - a.users).slice(0, 4);
  }, [livePoints]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate h-[440px] w-full overflow-hidden rounded-xl sm:h-[520px] lg:h-[560px]",
        "bg-[#0b0b0f]",
        className,
      )}
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(76,95,214,0.16), transparent 70%)",
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      {/* Cabeçalho flutuante */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/80 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-foreground/80" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-white/70 uppercase">
              Ao vivo
            </span>
          </div>
          <p className="mt-1 text-2xl leading-none font-bold text-white tabular-nums">
            {totalUsers}
          </p>
          <p className="mt-1 text-[11px] text-white/50">
            visitantes online agora
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="hidden min-w-[168px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md sm:block"
        >
          <p className="text-[11px] font-medium tracking-wide text-white/50 uppercase">
            Principais regiões
          </p>
          <ul className="mt-1.5 space-y-1">
            <AnimatePresence initial={false}>
              {topCountries.map((entry) => (
                <motion.li
                  key={entry.country}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-between gap-3 text-xs text-white/80"
                >
                  <span className="truncate">{entry.country}</span>
                  <span className="font-semibold tabular-nums text-white">
                    {entry.users}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hover && (
          <motion.div
            key={hover.point.id}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-white/15 bg-[#12121b]/90 px-3 py-2 shadow-2xl shadow-black/50 backdrop-blur-md"
            style={{ left: hover.x, top: hover.y }}
          >
            <p className="text-sm font-semibold text-white">
              {hover.point.city ?? hover.point.country}
            </p>
            {hover.point.city && (
              <p className="text-[11px] text-white/50">{hover.point.country}</p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
              <span className="size-1.5 rounded-full bg-foreground/80" />
              {hover.point.users}{" "}
              {hover.point.users === 1
                ? "visitante online"
                : "visitantes online"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rodapé com dica de interação */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4">
        <p className="text-[11px] text-white/35">
          Arraste para girar · clique num ponto para focar
        </p>
        <AnimatePresence>
          {focused && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 backdrop-blur-md"
            >
              Clique fora do ponto para voltar à vista global
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Vinheta para o globo assentar no card */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 92% 88% at 50% 50%, transparent 68%, rgba(11,11,15,0.6) 100%)",
        }}
      />
    </div>
  );
}

export const LiveGlobe = React.memo(LiveGlobeImpl);
