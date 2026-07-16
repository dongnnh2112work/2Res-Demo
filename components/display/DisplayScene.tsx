"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { EventPhase, Wish } from "@/lib/types";
import WishNode from "./WishNode";

type DisplaySceneProps = {
  wishes: Wish[];
  phase: EventPhase;
  onConvergeComplete: () => void;
};

const CONVERGE_SECS = 2.1;
const REVEAL_SECS = 2.4;

function easeInCubic(t: number) {
  return t * t * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Soft radial glow disc (canvas) for additive bloom layers */
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,230,180,0.9)");
  g.addColorStop(0.5, "rgba(255,160,60,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function CenterBurst({
  convergeProgress,
  revealProgress,
  phase,
}: {
  convergeProgress: number;
  revealProgress: number;
  phase: EventPhase;
}) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const glowTex = useMemo(() => makeGlowTexture(), []);

  useEffect(() => () => glowTex.dispose(), [glowTex]);

  useFrame(() => {
    const active = phase === "converging" || phase === "revealed";
    if (!active) {
      if (core.current) core.current.visible = false;
      if (halo.current) halo.current.visible = false;
      if (ring.current) ring.current.visible = false;
      if (ring2.current) ring2.current.visible = false;
      if (flash.current) flash.current.visible = false;
      return;
    }

    // Build heat as wishes arrive (last 40% of converge = white-hot)
    const heat =
      phase === "converging"
        ? easeInCubic(Math.max(0, (convergeProgress - 0.45) / 0.55))
        : 1;
    const reveal = phase === "revealed" ? revealProgress : 0;

    // Core pulse → peak at converge end
    if (core.current) {
      core.current.visible = true;
      const peak = phase === "converging" ? heat : Math.max(0, 1 - reveal * 1.4);
      const s = 0.15 + heat * 2.8 + (phase === "converging" && heat > 0.85 ? (heat - 0.85) * 8 : 0);
      core.current.scale.setScalar(Math.max(0.01, s * (phase === "revealed" ? 1 + reveal * 6 : 1)));
      const mat = core.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(1, 0.2 + peak * 0.95);
    }

    if (halo.current) {
      halo.current.visible = true;
      const s = 0.4 + heat * 5 + reveal * 18;
      halo.current.scale.setScalar(s);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.85, heat * 0.55 + (1 - reveal) * reveal * 1.2);
    }

    // Shockwave rings — fire at end of converge / start of reveal
    const waveT =
      phase === "converging"
        ? Math.max(0, (convergeProgress - 0.82) / 0.18)
        : Math.min(1, reveal * 1.6);
    if (ring.current) {
      ring.current.visible = waveT > 0.01;
      const s = 0.2 + easeOutCubic(waveT) * 22;
      ring.current.scale.setScalar(s);
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - easeOutCubic(waveT)) * 0.95;
    }
    if (ring2.current) {
      const t2 = Math.max(0, waveT - 0.12);
      ring2.current.visible = t2 > 0.01;
      ring2.current.scale.setScalar(0.2 + easeOutCubic(t2) * 28);
      const mat = ring2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - easeOutCubic(t2)) * 0.55;
    }

    // Fullscreen white flash → washes into KV
    if (flash.current) {
      const flashIn =
        phase === "converging"
          ? easeInCubic(Math.max(0, (convergeProgress - 0.88) / 0.12))
          : reveal < 0.35
            ? 1 - reveal / 0.35
            : 0;
      const flashOut =
        phase === "revealed" && reveal >= 0.35
          ? Math.max(0, 1 - (reveal - 0.35) / 0.35)
          : phase === "revealed"
            ? 1
            : flashIn;
      const opacity = phase === "converging" ? flashIn : Math.min(1, flashOut);
      flash.current.visible = opacity > 0.01;
      flash.current.scale.setScalar(1 + (phase === "revealed" ? reveal * 0.4 : heat * 0.3));
      const mat = flash.current.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
    }
  });

  return (
    <group position={[0, 0, 0.2]}>
      <mesh ref={core} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glowTex}
          color="#fff6e0"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={halo} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glowTex}
          color="#ff9a3c"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ring} rotation={[0, 0, 0]} visible={false}>
        <ringGeometry args={[0.85, 1.05, 64]} />
        <meshBasicMaterial
          color="#ffe6a8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ring2} visible={false}>
        <ringGeometry args={[0.9, 1.02, 64]} />
        <meshBasicMaterial
          color="#ffb060"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* camera-facing flash plane big enough to wash LED */}
      <mesh ref={flash} position={[0, 0, 2]} visible={false}>
        <planeGeometry args={[40, 24]} />
        <meshBasicMaterial
          color="#fff8ec"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function KvUnveil({
  visible,
  revealProgress,
}: {
  visible: boolean;
  revealProgress: number;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useTexture("/kv.jpg");

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);

  useFrame(() => {
    if (!group.current || !mat.current) return;
    if (!visible) {
      group.current.visible = false;
      mat.current.opacity = 0;
      return;
    }

    // Hold dark until flash peaks (~0.28), then punch KV in hard
    const t = Math.max(0, (revealProgress - 0.28) / 0.55);
    const punch = easeOutCubic(Math.min(1, t));
    const overshoot = punch < 1 ? 0.92 + punch * 0.16 : 1.02 - (revealProgress - 0.85) * 0.08;

    group.current.visible = punch > 0.02;
    group.current.scale.setScalar(Math.max(0.2, overshoot));
    mat.current.opacity = punch;
    if (glowMat.current) {
      glowMat.current.opacity = (1 - punch) * punch * 1.4 + punch * 0.25;
    }
  });

  const w = 14.5;
  const h = w / (1024 / 571);

  return (
    <group ref={group} visible={false} position={[0, 0, 0.35]}>
      <mesh position={[0, 0, -0.08]} scale={[1.08, 1.1, 1]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          ref={glowMat}
          color="#ffc070"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          ref={mat}
          map={texture}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function usePhaseTimeline(phase: EventPhase, onConvergeComplete: () => void) {
  const [convergeProgress, setConvergeProgress] = useState(0);
  const [revealProgress, setRevealProgress] = useState(0);
  const convergeRef = useRef(0);
  const revealRef = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    if (phase === "converging") {
      convergeRef.current = 0;
      revealRef.current = 0;
      done.current = false;
      setConvergeProgress(0);
      setRevealProgress(0);
    } else if (phase === "collecting") {
      convergeRef.current = 0;
      revealRef.current = 0;
      done.current = false;
      setConvergeProgress(0);
      setRevealProgress(0);
    } else if (phase === "revealed") {
      // keep converge at 1, animate reveal
      convergeRef.current = 1;
      setConvergeProgress(1);
      if (revealRef.current <= 0) {
        revealRef.current = 0;
        setRevealProgress(0);
      }
    }
  }, [phase]);

  useFrame((_, delta) => {
    if (phase === "converging") {
      convergeRef.current = Math.min(1, convergeRef.current + delta / CONVERGE_SECS);
      setConvergeProgress(convergeRef.current);
      if (convergeRef.current >= 1 && !done.current) {
        done.current = true;
        onConvergeComplete();
      }
    } else if (phase === "revealed") {
      revealRef.current = Math.min(1, revealRef.current + delta / REVEAL_SECS);
      setRevealProgress(revealRef.current);
    }
  });

  return { convergeProgress, revealProgress };
}

function WishCloud({
  wishes,
  phase,
  convergeProgress,
}: {
  wishes: Wish[];
  phase: EventPhase;
  convergeProgress: number;
}) {
  return (
    <>
      {wishes.map((wish, index) => (
        <WishNode
          key={wish.id}
          wish={wish}
          index={index}
          phase={phase}
          convergeProgress={convergeProgress}
        />
      ))}
    </>
  );
}

function AmbientDust({ dim }: { dim: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 18;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.02;
    const mat = points.current.material as THREE.PointsMaterial;
    mat.opacity = 0.45 * (1 - dim);
  });

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.06}
        color="#ffd9a0"
        transparent
        opacity={0.45}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export default function DisplayScene({
  wishes,
  phase,
  onConvergeComplete,
}: DisplaySceneProps) {
  const { convergeProgress, revealProgress } = usePhaseTimeline(phase, onConvergeComplete);
  const dim = phase === "revealed" ? easeInOutCubic(Math.min(1, revealProgress * 1.4)) : phase === "converging" ? easeInCubic(convergeProgress) * 0.4 : 0;

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#05070d", 14, 30]} />
      <ambientLight intensity={1} />
      <pointLight position={[0, 2, 6]} intensity={1.4} color="#ffd9a0" />
      <pointLight position={[-5, -1, 3]} intensity={0.6} color="#7eb6ff" />

      <AmbientDust dim={dim} />
      <WishCloud wishes={wishes} phase={phase} convergeProgress={convergeProgress} />
      <CenterBurst
        phase={phase}
        convergeProgress={convergeProgress}
        revealProgress={revealProgress}
      />
      <Suspense fallback={null}>
        <KvUnveil visible={phase === "revealed"} revealProgress={revealProgress} />
      </Suspense>
    </>
  );
}
