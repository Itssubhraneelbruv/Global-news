import React, { useEffect, useRef } from "react";

type Props = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  active?: boolean;
  size?: number;
};

export default function AudioOrb({
  audioRef,
  active = false,
  size = 260,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || sourceRef.current) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;

    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

    const resume = () => {
      if (ctx.state === "suspended") ctx.resume();
    };

    audio.addEventListener("play", resume);
    window.addEventListener("click", resume);

    return () => {
      audio.removeEventListener("play", resume);
      window.removeEventListener("click", resume);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const draw = (t: number) => {
      const analyser = analyserRef.current;
      const data = dataRef.current;

      ctx.clearRect(0, 0, size, size);

      let avg = 0;
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      }

      const idlePulse = 0.5 + 0.5 * Math.sin(t * 0.002);
      const energy = avg > 0.01 ? avg : active ? 0.08 + idlePulse * 0.06 : 0.04;
      const base = size * 0.22;
      const radius = base + energy * size * 0.12;
      const cx = size / 2;
      const cy = size / 2;

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.4);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.18, "rgba(130,170,255,0.95)");
      glow.addColorStop(0.45, "rgba(70,110,255,0.45)");
      glow.addColorStop(1, "rgba(0,0,0,0)");

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      const orb = ctx.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.35,
        radius * 0.15,
        cx,
        cy,
        radius
      );
      orb.addColorStop(0, "rgba(255,255,255,1)");
      orb.addColorStop(0.2, "rgba(190,210,255,1)");
      orb.addColorStop(0.55, "rgba(90,130,255,0.98)");
      orb.addColorStop(1, "rgba(20,35,120,1)");

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [size, active]);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        margin: "0 auto",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}