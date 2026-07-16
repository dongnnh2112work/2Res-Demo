"use client";

import { Canvas } from "@react-three/fiber";
import DisplayScene from "./DisplayScene";
import type { EventPhase, Wish } from "@/lib/types";

type Props = {
  wishes: Wish[];
  phase: EventPhase;
  onConvergeComplete: () => void;
};

export default function DisplayCanvas({ wishes, phase, onConvergeComplete }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 11], fov: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
    >
      <DisplayScene wishes={wishes} phase={phase} onConvergeComplete={onConvergeComplete} />
    </Canvas>
  );
}
