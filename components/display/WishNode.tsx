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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function createWishTexture(message: string, author: string | null, tint: string) {
  const width = 768;
  const height = 320;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, width, height);

  ctx.font = "600 48px 'Be Vietnam Pro', 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, message, width - 80);
  const lineHeight = 56;
  const blockHeight = lines.length * lineHeight + (author ? 44 : 0);
  let y = height / 2 - blockHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    ctx.shadowColor = tint;
    ctx.shadowBlur = 36;
    ctx.fillStyle = tint;
    ctx.fillText(line, width / 2, y);
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#fff8e8";
    ctx.fillText(line, width / 2, y);
    y += lineHeight;
  }

  if (author) {
    ctx.font = "400 28px 'Be Vietnam Pro', 'Helvetica Neue', Arial, sans-serif";
    ctx.shadowColor = tint;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255, 236, 200, 0.9)";
    ctx.fillText(`— ${author}`, width / 2, y + 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
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

  const home = useMemo(() => {
    const x = (seededRand(seed, 1) - 0.5) * 14;
    const y = (seededRand(seed, 2) - 0.5) * 7.5;
    const z = (seededRand(seed, 3) - 0.5) * 4;
    return new THREE.Vector3(x, y, z);
  }, [seed]);

  const floatAmp = useMemo(
    () => ({
      x: 0.25 + seededRand(seed, 4) * 0.45,
      y: 0.35 + seededRand(seed, 5) * 0.55,
      z: 0.15 + seededRand(seed, 6) * 0.3,
      speed: 0.4 + seededRand(seed, 7) * 0.5,
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
      group.current.position.set(
        home.x + Math.sin(t * floatAmp.speed + floatAmp.phase) * floatAmp.x,
        home.y + Math.cos(t * floatAmp.speed * 0.85 + floatAmp.phase) * floatAmp.y,
        home.z + Math.sin(t * floatAmp.speed * 0.55 + floatAmp.phase) * floatAmp.z,
      );
      group.current.rotation.z = Math.sin(t * 0.25 + floatAmp.phase) * 0.04;
      group.current.scale.setScalar(0.98 + Math.sin(t * floatAmp.speed + floatAmp.phase) * 0.02);
      group.current.visible = true;
      // Keep opacity stable — strong pulsing looked like text blinking on LED
      if (mat.current) mat.current.opacity = 0.92;
      return;
    }

    if (currentPhase === "converging") {
      if (!captured.current) {
        startPos.current.copy(group.current.position);
        captured.current = true;
      }

      const ease = easeInCubic(Math.min(1, Math.max(0, convergeProgressRef.current)));
      group.current.position.lerpVectors(startPos.current, new THREE.Vector3(0, 0, 0), ease);

      const spark = Math.max(0.04, 1 - ease * 0.96);
      group.current.scale.setScalar(spark);
      group.current.rotation.z = ease * Math.PI * 1.5;
      group.current.visible = ease < 0.97;

      if (mat.current) mat.current.opacity = Math.max(0.35, 1 - ease * 0.2);
      return;
    }

    group.current.visible = false;
  });

  return (
    <group ref={group} position={home.toArray()}>
      <mesh>
        <planeGeometry args={[3.4, 1.42]} />
        <meshBasicMaterial
          ref={mat}
          map={texture}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
