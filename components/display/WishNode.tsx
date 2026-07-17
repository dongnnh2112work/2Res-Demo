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

/**
 * Pack wishes on a grid that fits the LED view so cards don't overlap
 * (includes margin for the gentle float drift).
 */
export function layoutWishHomes(count: number): WishHome[] {
  if (count <= 0) return [];

  const floatPad = 0.4;
  const gapX = 0.5;
  const gapY = 0.4;
  const cellW = WISH_PLANE_W + gapX + floatPad * 2;
  const cellH = WISH_PLANE_H + gapY + floatPad * 2;

  // Visible field roughly matching camera at z=11, fov 50
  const viewW = 13.5;
  const viewH = 7.6;

  const aspect = viewW / viewH;
  let cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  let rows = Math.ceil(count / cols);

  while (cols > 1 && (cols - 1) * rows >= count) {
    cols -= 1;
    rows = Math.ceil(count / cols);
  }

  const needW = cols * cellW;
  const needH = rows * cellH;
  const fit = Math.min(1, viewW / needW, viewH / needH);
  const stepX = cellW * fit;
  const stepY = cellH * fit;
  const baseScale = fit;

  const homes: WishHome[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowCount = row === rows - 1 ? count - row * cols : cols;
    const x =
      rowCount < cols
        ? (col - (rowCount - 1) / 2) * stepX
        : (col - (cols - 1) / 2) * stepX;
    const y = ((rows - 1) / 2 - row) * stepY;
    const z = ((i % 7) - 3) * 0.05;
    homes.push({ x, y, z, baseScale });
  }

  return homes;
}

function hashSeed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededRand(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function easeInCubic(t: number) {
  return t * t * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
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
  const captured = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const homeRef = useRef(home);
  homeRef.current = home;
  const seed = useMemo(() => hashSeed(wish.id), [wish.id]);

  const floatAmp = useMemo(
    () => ({
      // Keep drift smaller than layout padding so cards don't collide
      x: 0.1 + seededRand(seed, 4) * 0.14,
      y: 0.12 + seededRand(seed, 5) * 0.16,
      speed: 0.16 + seededRand(seed, 7) * 0.14,
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
    const t = state.clock.elapsedTime;
    const currentPhase = phaseRef.current;
    const h = homeRef.current;
    const floatScale = Math.min(1, h.baseScale);

    if (currentPhase === "collecting") {
      group.current.position.set(
        h.x + Math.sin(t * floatAmp.speed + floatAmp.phase) * floatAmp.x * floatScale,
        h.y + Math.cos(t * floatAmp.speed * 0.9 + floatAmp.phase) * floatAmp.y * floatScale,
        h.z,
      );
      group.current.rotation.set(0, 0, 0);
      group.current.scale.setScalar(h.baseScale);
      group.current.visible = true;
      if (mat.current) mat.current.opacity = 1;
      return;
    }

    if (currentPhase === "converging") {
      if (!captured.current) {
        startPos.current.copy(group.current.position);
        startScale.current = group.current.scale.x;
        captured.current = true;
      }

      const ease = easeInCubic(Math.min(1, Math.max(0, convergeProgressRef.current)));
      // Straight flight to center — no spin
      group.current.position.lerpVectors(startPos.current, new THREE.Vector3(0, 0, 0), ease);
      group.current.rotation.set(0, 0, 0);

      // Far→near shrink: size falls with distance to center (smooth throughout)
      const shrinkT = easeOutCubic(ease);
      const scale = Math.max(0.06, startScale.current * (1 - shrinkT * 0.94));
      group.current.scale.setScalar(scale);
      group.current.visible = true;
      if (mat.current) {
        mat.current.opacity = ease < 0.88 ? 1 : Math.max(0, 1 - (ease - 0.88) / 0.12);
      }
      return;
    }

    group.current.visible = false;
  });

  return (
    <group ref={group} position={[home.x, home.y, home.z]} scale={home.baseScale} renderOrder={index}>
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
