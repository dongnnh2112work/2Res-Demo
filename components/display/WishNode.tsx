"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { EventPhase, Wish } from "@/lib/types";

type WishNodeProps = {
  wish: Wish;
  index: number;
  phase: EventPhase;
  convergeProgressRef: MutableRefObject<number>;
};

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
  convergeProgressRef,
}: WishNodeProps) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const startPos = useRef(new THREE.Vector3());
  const captured = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const seed = useMemo(() => hashSeed(wish.id), [wish.id]);

  // Fixed Z per wish — moving Z + transparent planes = LED flicker from depth sorting
  const home = useMemo(() => {
    const x = (seededRand(seed, 1) - 0.5) * 13;
    const y = (seededRand(seed, 2) - 0.5) * 7;
    const z = (seededRand(seed, 3) - 0.5) * 1.2;
    return new THREE.Vector3(x, y, z);
  }, [seed]);

  const floatAmp = useMemo(
    () => ({
      // Gentle drift only on X/Y — never hide, never pulse opacity
      x: 0.12 + seededRand(seed, 4) * 0.18,
      y: 0.16 + seededRand(seed, 5) * 0.22,
      speed: 0.18 + seededRand(seed, 7) * 0.16,
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

    if (currentPhase === "collecting") {
      // Soft float — position only, Z locked, scale/opacity constant
      group.current.position.set(
        home.x + Math.sin(t * floatAmp.speed + floatAmp.phase) * floatAmp.x,
        home.y + Math.cos(t * floatAmp.speed * 0.9 + floatAmp.phase) * floatAmp.y,
        home.z,
      );
      group.current.rotation.z = Math.sin(t * 0.15 + floatAmp.phase) * 0.02;
      group.current.scale.setScalar(1);
      group.current.visible = true;
      if (mat.current) mat.current.opacity = 1;
      return;
    }

    if (currentPhase === "converging") {
      if (!captured.current) {
        startPos.current.copy(group.current.position);
        captured.current = true;
      }

      const ease = easeInCubic(Math.min(1, Math.max(0, convergeProgressRef.current)));
      // Fly straight to center — no spin
      group.current.position.lerpVectors(startPos.current, new THREE.Vector3(0, 0, 0), ease);
      group.current.rotation.z = 0;

      const spark = Math.max(0.08, 1 - ease * 0.92);
      group.current.scale.setScalar(spark);
      group.current.visible = true;
      if (mat.current) mat.current.opacity = ease < 0.88 ? 1 : Math.max(0, 1 - (ease - 0.88) / 0.12);
      return;
    }

    // revealed: hide wishes (KV takes over) — only after activate completes
    group.current.visible = false;
  });

  return (
    <group ref={group} position={home.toArray()} renderOrder={index}>
      <mesh renderOrder={index}>
        <planeGeometry args={[3.6, 1.8]} />
        <meshBasicMaterial
          ref={mat}
          map={texture}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest
          toneMapped={false}
          // Cuts empty canvas pixels out of sort fights → less LED flicker
          alphaTest={0.08}
        />
      </mesh>
    </group>
  );
}
