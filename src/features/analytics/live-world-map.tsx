"use client";

import * as React from "react";
import { MapPin, Radio, Route as RouteIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useSimulatedLivePoints,
  type LiveGlobePoint,
} from "@/features/analytics/live-globe-data";
import {
  getLandMask,
  LAND_MASK_COLS,
  LAND_MASK_ROWS,
} from "@/features/analytics/world-land-mask";

const MAX_POINTS = 42;
const MAX_ROUTES = 9;

interface MapDot {
  x: number;
  y: number;
  light: number;
}

interface ProjectedPoint {
  point: LiveGlobePoint;
  x: number;
  y: number;
}

interface MapFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HoverState {
  point: LiveGlobePoint;
  x: number;
  y: number;
}

export interface LiveWorldMapProps {
  /** Pontos reais. Se ficar vazio/indefinido, entra o feed simulado. */
  points?: LiveGlobePoint[];
  className?: string;
}

/**
 * Amostra determinística da máscara Natural Earth. O mapa usa pontos em vez
 * de polígonos para continuar nítido, leve e coerente com o painel ao vivo.
 */
function buildLandDots(): MapDot[] {
  const mask = getLandMask();
  const dots: MapDot[] = [];

  for (let row = 10; row < LAND_MASK_ROWS - 14; row += 4) {
    for (let col = 0; col < LAND_MASK_COLS; col += 4) {
      if (mask[row * LAND_MASK_COLS + col] !== 1) continue;
      const seed = ((row * 37 + col * 19) % 101) / 100;
      dots.push({
        x: col / LAND_MASK_COLS,
        y: row / LAND_MASK_ROWS,
        light: seed,
      });
    }
  }

  return dots;
}

const LAND_DOTS = buildLandDots();

function mapFrame(width: number, height: number): MapFrame {
  const horizontalPadding = Math.max(18, Math.min(34, width * 0.035));
  const availableWidth = width - horizontalPadding * 2;
  const availableHeight = Math.max(150, height - 126);
  const mapHeight = Math.min(availableHeight, availableWidth * 0.51);

  return {
    x: horizontalPadding,
    y: Math.max(76, (height - mapHeight) / 2 + 8),
    width: availableWidth,
    height: mapHeight,
  };
}

function projectPoint(
  lat: number,
  lon: number,
  frame: MapFrame,
): { x: number; y: number } {
  return {
    x: frame.x + ((lon + 180) / 360) * frame.width,
    y: frame.y + ((90 - lat) / 180) * frame.height,
  };
}

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const inverse = 1 - t;
  return {
    x:
      inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y:
      inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function routeControl(
  start: { x: number; y: number },
  end: { x: number; y: number },
  frame: MapFrame,
) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    x: (start.x + end.x) / 2,
    y:
      Math.min(start.y, end.y) -
      Math.min(frame.height * 0.34, 24 + distance * 0.22),
  };
}

function drawRoute(
  context: CanvasRenderingContext2D,
  start: ProjectedPoint,
  end: ProjectedPoint,
  frame: MapFrame,
  progress: number,
  reducedMotion: boolean,
) {
  const control = routeControl(start, end, frame);

  context.save();
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.quadraticCurveTo(control.x, control.y, end.x, end.y);
  context.strokeStyle = "rgba(255, 122, 26, 0.23)";
  context.lineWidth = 1;
  context.stroke();

  const tailLength = reducedMotion ? 1 : 0.16;
  const tailStart = Math.max(0, progress - tailLength);
  const steps = reducedMotion ? 32 : 13;

  for (let index = 1; index <= steps; index += 1) {
    const fromT = tailStart + ((progress - tailStart) * (index - 1)) / steps;
    const toT = tailStart + ((progress - tailStart) * index) / steps;
    const from = quadraticPoint(start, control, end, fromT);
    const to = quadraticPoint(start, control, end, toT);

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = `rgba(255, 155, 74, ${
      reducedMotion ? 0.2 : 0.08 + (index / steps) * 0.76
    })`;
    context.lineWidth = reducedMotion ? 0.8 : 1.2 + (index / steps) * 0.8;
    context.stroke();
  }

  if (!reducedMotion) {
    const head = quadraticPoint(start, control, end, progress);
    const glow = context.createRadialGradient(
      head.x,
      head.y,
      0,
      head.x,
      head.y,
      10,
    );
    glow.addColorStop(0, "rgba(255, 232, 204, 1)");
    glow.addColorStop(0.22, "rgba(255, 122, 26, 0.92)");
    glow.addColorStop(1, "rgba(255, 122, 26, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(head.x, head.y, 10, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawMarker(
  context: CanvasRenderingContext2D,
  projected: ProjectedPoint,
  time: number,
  index: number,
  reducedMotion: boolean,
) {
  const { x, y, point } = projected;
  const pulse = reducedMotion
    ? 0.45
    : (Math.sin(time * 0.0022 + index * 1.7) + 1) / 2;
  const radius = 3.2 + Math.min(4.8, Math.sqrt(point.users) * 0.9);
  const haloRadius = radius + 7 + pulse * 7;
  const halo = context.createRadialGradient(x, y, 0, x, y, haloRadius);
  halo.addColorStop(0, "rgba(255, 205, 160, 0.95)");
  halo.addColorStop(0.18, "rgba(255, 122, 26, 0.8)");
  halo.addColorStop(1, "rgba(255, 122, 26, 0)");

  context.fillStyle = halo;
  context.beginPath();
  context.arc(x, y, haloRadius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = `rgba(255, 122, 26, ${0.24 + pulse * 0.34})`;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, radius + 4 + pulse * 4, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#f5f5f5";
  context.beginPath();
  context.arc(x, y, Math.max(1.8, radius * 0.46), 0, Math.PI * 2);
  context.fill();
}

/** Mapa-múndi plano com sessões pulsantes e pacotes viajando pelas rotas. */
function LiveWorldMapImpl({ points, className }: LiveWorldMapProps) {
  const simulated = useSimulatedLivePoints();
  const livePoints = points && points.length > 0 ? points : simulated;
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLElement>(null);
  const pointsRef = React.useRef(livePoints);
  const drawOnceRef = React.useRef<(() => void) | null>(null);
  const [hover, setHover] = React.useState<HoverState | null>(null);

  React.useEffect(() => {
    pointsRef.current = livePoints;
    drawOnceRef.current?.();
  }, [livePoints]);

  React.useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const container = containerRef.current as HTMLElement;
    if (!canvas || !container) return;

    const contextCandidate = canvas.getContext("2d");
    if (!contextCandidate) return;
    const context: CanvasRenderingContext2D = contextCandidate;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let isVisible = true;
    let isDisposed = false;

    function projectedPoints(frame: MapFrame): ProjectedPoint[] {
      return pointsRef.current
        .slice()
        .sort((a, b) => b.users - a.users)
        .slice(0, MAX_POINTS)
        .map((point) => ({
          point,
          ...projectPoint(point.lat, point.lon, frame),
        }));
    }

    function draw(time = performance.now()) {
      if (isDisposed || width === 0 || height === 0) return;

      context.clearRect(0, 0, width, height);
      const frame = mapFrame(width, height);

      context.save();
      context.setLineDash([2, 7]);
      context.lineWidth = 0.7;
      context.strokeStyle = "rgba(255, 255, 255, 0.055)";
      for (const lon of [-120, -60, 0, 60, 120]) {
        const { x } = projectPoint(0, lon, frame);
        context.beginPath();
        context.moveTo(x, frame.y);
        context.lineTo(x, frame.y + frame.height);
        context.stroke();
      }
      for (const lat of [-60, -30, 0, 30, 60]) {
        const { y } = projectPoint(lat, 0, frame);
        context.beginPath();
        context.moveTo(frame.x, y);
        context.lineTo(frame.x + frame.width, y);
        context.stroke();
      }
      context.restore();

      const dotRadius = Math.max(0.55, Math.min(1.15, width / 940));
      for (const dot of LAND_DOTS) {
        const x = frame.x + dot.x * frame.width;
        const y = frame.y + dot.y * frame.height;
        const cityLight = dot.light > 0.972;
        context.fillStyle = cityLight
          ? "rgba(255, 122, 26, 0.38)"
          : `rgba(255, 255, 255, ${0.08 + dot.light * 0.13})`;
        context.beginPath();
        context.arc(
          x,
          y,
          cityLight ? dotRadius * 1.45 : dotRadius,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      const active = projectedPoints(frame);
      if (active.length > 1) {
        const source = active[0];
        const destinations = active
          .slice(1)
          .sort(
            (a, b) =>
              Math.hypot(b.x - source.x, b.y - source.y) *
                Math.log2(b.point.users + 2) -
              Math.hypot(a.x - source.x, a.y - source.y) *
                Math.log2(a.point.users + 2),
          )
          .slice(0, MAX_ROUTES);

        destinations.forEach((destination, index) => {
          const speed = 0.000045 + (index % 3) * 0.000008;
          const progress = reducedMotion
            ? 1
            : (time * speed + index * 0.137) % 1;
          drawRoute(
            context,
            source,
            destination,
            frame,
            progress,
            reducedMotion,
          );
        });
      }

      active.forEach((point, index) =>
        drawMarker(context, point, time, index, reducedMotion),
      );

      if (!reducedMotion && isVisible && !document.hidden) {
        animationFrame = requestAnimationFrame(draw);
      }
    }

    function scheduleDraw() {
      cancelAnimationFrame(animationFrame);
      draw(performance.now());
    }

    drawOnceRef.current = scheduleDraw;

    function resize() {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scheduleDraw();
    }

    function handleMotionChange(event: MediaQueryListEvent) {
      reducedMotion = event.matches;
      scheduleDraw();
    }

    function handleVisibilityChange() {
      if (!document.hidden && isVisible) scheduleDraw();
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const frame = mapFrame(width, height);
      const nearest = projectedPoints(frame)
        .map((item) => ({
          ...item,
          distance: Math.hypot(item.x - pointerX, item.y - pointerY),
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearest && nearest.distance <= 22) {
        setHover({
          point: nearest.point,
          x: Math.max(88, Math.min(nearest.x, width - 88)),
          y: nearest.y,
        });
      } else {
        setHover(null);
      }
    }

    function handlePointerLeave() {
      setHover(null);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) scheduleDraw();
      else cancelAnimationFrame(animationFrame);
    });
    intersectionObserver.observe(container);

    motionQuery.addEventListener("change", handleMotionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    resize();

    return () => {
      isDisposed = true;
      drawOnceRef.current = null;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionQuery.removeEventListener("change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  const totalUsers = livePoints.reduce((sum, point) => sum + point.users, 0);
  const routeCount = Math.min(MAX_ROUTES, Math.max(0, livePoints.length - 1));

  return (
    <section
      ref={containerRef}
      className={cn(
        "relative isolate min-h-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_28px_80px_rgba(0,0,0,0.42)] sm:h-[520px] lg:h-full lg:min-h-[560px]",
        className,
      )}
      aria-label="Mapa global das sessões online"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none"
        aria-hidden
      />

      <div className="pointer-events-none absolute top-4 left-4 z-10 sm:top-5 sm:left-5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f5f5f5] opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[#f5f5f5]" />
          </span>
          <p className="text-sm font-semibold tracking-tight text-white">
            Fluxo global em tempo real
          </p>
        </div>
        <p className="mt-1 text-[11px] text-white/45">
          Sessões e trajetos ativos agora
        </p>
      </div>

      <div className="pointer-events-none absolute top-4 right-4 z-10 hidden items-center gap-2 sm:flex sm:top-5 sm:right-5">
        <div className="dash-map-badge flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-white/60 backdrop-blur-md">
          <Radio className="size-3 text-[#f5f5f5]" />
          <strong className="font-semibold text-white tabular-nums">
            {livePoints.length}
          </strong>
          regiões
        </div>
        <div className="dash-map-badge flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-white/60 backdrop-blur-md">
          <RouteIcon className="size-3 text-[#f5f5f5]" />
          <strong className="font-semibold text-white tabular-nums">
            {routeCount}
          </strong>
          rotas
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-10 flex items-end justify-between gap-3 sm:right-5 sm:bottom-5 sm:left-5">
        <div className="flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-white/38 uppercase sm:text-[11px]">
          <span className="size-1.5 rounded-full bg-[#f5f5f5] shadow-[0_0_12px_#f5f5f5]" />
          Visitantes
          <span className="ml-1 h-px w-6 bg-gradient-to-r from-[#f5f5f5] to-transparent" />
          Rotas
        </div>
        <p className="shrink-0 text-right text-[11px] whitespace-nowrap text-white/45">
          <strong className="font-semibold text-white tabular-nums">
            {totalUsers}
          </strong>{" "}
          <span className="sm:hidden">online</span>
          <span className="hidden sm:inline">visitantes conectados</span>
        </p>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 min-w-36 -translate-x-1/2 -translate-y-[calc(100%+16px)] rounded-xl border border-[#f5f5f5]/30 bg-black/88 px-3 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.55),0_0_28px_rgba(255,122,26,0.12)] backdrop-blur-xl"
          style={{
            left: `${hover.x}px`,
            top: `${Math.max(92, hover.y)}px`,
          }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <MapPin className="size-3 text-[#f5f5f5]" />
            {hover.point.city ?? hover.point.country}
          </p>
          <p className="mt-1 text-[11px] text-white/50">
            {hover.point.country} · {hover.point.users}{" "}
            {hover.point.users === 1 ? "visitante" : "visitantes"}
          </p>
        </div>
      )}

      <ul className="sr-only">
        {livePoints.slice(0, MAX_POINTS).map((point) => (
          <li key={point.id}>
            {point.city ?? point.country}, {point.country}: {point.users}{" "}
            {point.users === 1 ? "visitante" : "visitantes"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const LiveWorldMap = React.memo(LiveWorldMapImpl);
