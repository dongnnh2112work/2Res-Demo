"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { EventPhase, Wish } from "@/lib/types";

export type WishHome = {
  x: number;
  y: number;
  z: number;
  baseScale: number;
  /** Radians — slight diagonal tilt while floating */
  tilt: number;
};

type WishNodeProps = {
  wish: Wish;
  index: number;
  phase: EventPhase;
  home: WishHome;
  convergeProgressRef: MutableRefObject<number>;
};

/** Plane size used for non-overlap layout (must match mesh geometry). */
export const WISH_PLANE_W = 3.6;
export const WISH_PLANE_H = 1.8;

function hashSeed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededRand(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function rotatedHalfExtents(w: number, h: number, tilt: number) {
  const c = Math.abs(Math.cos(tilt));
  const s = Math.abs(Math.sin(tilt));
  return {
    hw: 0.5 * (w * c + h * s),
    hh: 0.5 * (w * s + h * c),
  };
}

function overlaps(
  ax: number,
  ay: number,
  aTilt: number,
  aScale: number,
  bx: number,
  by: number,
  bTilt: number,
  bScale: number,
  pad: number,
) {
  const a = rotatedHalfExtents(WISH_PLANE_W * aScale, WISH_PLANE_H * aScale, aTilt);
  const b = rotatedHalfExtents(WISH_PLANE_W * bScale, WISH_PLANE_H * bScale, bTilt);
  return Math.abs(ax - bx) < a.hw + b.hw + pad && Math.abs(ay - by) < a.hh + b.hh + pad;
}

/**
 * Scatter wishes randomly (with slight tilt). Shrinks scale until every card
 * fits without overlapping, including float padding.
 */
export function layoutWishHomes(count: number): WishHome[] {
  if (count <= 0) return [];

  const viewW = 13.2;
  const viewH = 7.4;
  let baseScale = Math.min(1, 2.2 / Math.sqrt(Math.max(count, 1)));

  for (let round = 0; round < 14; round++) {
    const homes: WishHome[] = [];
    const pad = 0.28 * baseScale + 0.2;
    let failed = false;

    for (let i = 0; i < count; i++) {
      const seed = hashSeed(`scatter-${count}-${i}`);
      const tilt = (seededRand(seed, 2) - 0.5) * 0.42; // ~±12°
      const ext = rotatedHalfExtents(WISH_PLANE_W * baseScale, WISH_PLANE_H * baseScale, tilt);
      const maxX = Math.max(0.2, viewW * 0.5 - ext.hw);
      const maxY = Math.max(0.2, viewH * 0.5 - ext.hh);

      let placed: WishHome | null = null;
      for (let tryN = 0; tryN < 55; tryN++) {
        const x = (seededRand(seed, 20 + tryN) - 0.5) * 2 * maxX;
        const y = (seededRand(seed, 80 + tryN) - 0.5) * 2 * maxY;
        const z = (seededRand(seed, 5) - 0.5) * 0.5;
        const hit = homes.some((h) =>
          overlaps(x, y, tilt, baseScale, h.x, h.y, h.tilt, h.baseScale, pad),
        );
        if (!hit) {
          placed = { x, y, z, baseScale, tilt };
          break;
        }
      }

      if (!placed) {
        failed = true;
        break;
      }
      homes.push(placed);
    }

    if (!failed) return homes;
    baseScale *= 0.86;
  }

  // Last resort: loose random with tiny cards
  const tiny = Math.max(0.22, baseScale);
  return Array.from({ length: count }, (_, i) => {
    const seed = hashSeed(`fallback-${count}-${i}`);
    return {
      x: (seededRand(seed, 1) - 0.5) * 12,
      y: (seededRand(seed, 2) - 0.5) * 6.5,
      z: (seededRand(seed, 3) - 0.5) * 0.4,
      baseScale: tiny,
      tilt: (seededRand(seed, 4) - 0.5) * 0.35,
    };
  });
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function breakLongToken(
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
): string[] {
  if (ctx.measureText(token).width <= maxWidth) return [token];

  const chars = Array.from(token);
  const parts: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      parts.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 5,
): string[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  const flushOverflow = () => {
    if (lines.length < maxLines) return false;
    lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1], maxWidth);
    return true;
  };

  for (const token of tokens) {
    for (const piece of breakLongToken(ctx, token, maxWidth)) {
      const test = line ? `${line} ${piece}` : piece;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = piece;
        if (flushOverflow()) return lines.slice(0, maxLines);
      } else {
        line = test;
      }
    }
  }

  if (line) {
    lines.push(line);
    if (flushOverflow()) return lines.slice(0, maxLines);
  }

  return lines.slice(0, maxLines);
}

function createWishTexture(message: string, author: string | null, tint: string) {
  const width = 768;
  const height = 384;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, width, height);

  ctx.font = "600 44px 'Be Vietnam Pro', 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, message, width - 72, 5);
  const lineHeight = 52;
  const blockHeight = lines.length * lineHeight + (author ? 40 : 0);
  let y = height / 2 - blockHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    ctx.shadowColor = tint;
    ctx.shadowBlur = 28;
    ctx.fillStyle = tint;
    ctx.fillText(line, width / 2, y);
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff8e8";
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  }

  if (author) {
    ctx.font = "400 26px 'Be Vietnam Pro', 'Helvetica Neue', Arial, sans-serif";
    ctx.shadowColor = tint;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(255, 236, 200, 0.92)";
    ctx.fillText(`— ${author}`, width / 2, y + 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export default function WishNode({
  wish,
  index,
  phase,
  home,
  convergeProgressRef,
}: WishNodeProps) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const startPos = useRef(new THREE.Vector3());
  const startScale = useRef(1);
  const startTilt = useRef(0);
  const captured = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const homeRef = useRef(home);
  homeRef.current = home;
  const seed = useMemo(() => hashSeed(wish.id), [wish.id]);

  const floatAmp = useMemo(
    () => ({
      x: 0.08 + seededRand(seed, 4) * 0.12,
      y: 0.1 + seededRand(seed, 5) * 0.14,
      speed: 0.14 + seededRand(seed, 7) * 0.12,
      phase: seededRand(seed, 8) * Math.PI * 2,
    }),
    [seed],
  );

  const tint = useMemo(() => {
    return ["#ffe8b0", "#ffc978", "#c8e7ff", "#ffd0e0", "#d4f5d0"][index % 5];
  }, [index]);

  const texture = useMemo(
    () => createWishTexture(wish.message, wish.author, tint),
    [wish.message, wish.author, tint],
  );

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useEffect(() => {
    if (phase === "collecting") captured.current = false;
  }, [phase]);

  useFrame((state) => {
    if (!group.current) return;
    const clock = state.clock.elapsedTime;
    const currentPhase = phaseRef.current;
    const h = homeRef.current;
    const floatScale = Math.min(1, h.baseScale);

    if (currentPhase === "collecting") {
      group.current.position.set(
        h.x + Math.sin(clock * floatAmp.speed + floatAmp.phase) * floatAmp.x * floatScale,
        h.y + Math.cos(clock * floatAmp.speed * 0.9 + floatAmp.phase) * floatAmp.y * floatScale,
        h.z,
      );
      // Keep the scattered diagonal tilt — no spinning
      group.current.rotation.set(0, 0, h.tilt);
      group.current.scale.setScalar(h.baseScale);
      group.current.visible = true;
      if (mat.current) mat.current.opacity = 1;
      return;
    }

    if (currentPhase === "converging") {
      if (!captured.current) {
        startPos.current.copy(group.current.position);
        startScale.current = group.current.scale.x;
        startTilt.current = group.current.rotation.z;
        captured.current = true;
      }

      // One shared progress → move + shrink happen together
      const p = Math.min(1, Math.max(0, convergeProgressRef.current));
      const t = easeInOutCubic(p);

      group.current.position.lerpVectors(startPos.current, new THREE.Vector3(0, 0, 0), t);
      group.current.rotation.set(0, 0, startTilt.current);
      group.current.scale.setScalar(Math.max(0.05, startScale.current * (1 - t * 0.95)));
      group.current.visible = true;
      if (mat.current) {
        mat.current.opacity = t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.1);
      }
      return;
    }

    group.current.visible = false;
  });

  return (
    <group
      ref={group}
      position={[home.x, home.y, home.z]}
      rotation={[0, 0, home.tilt]}
      scale={home.baseScale}
      renderOrder={index}
    >
      <mesh renderOrder={index}>
        <planeGeometry args={[WISH_PLANE_W, WISH_PLANE_H]} />
        <meshBasicMaterial
          ref={mat}
          map={texture}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest
          toneMapped={false}
          alphaTest={0.08}
        />
      </mesh>
    </group>
  );
}
