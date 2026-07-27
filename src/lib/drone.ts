"use client";

// Drone: nada dasar yang dibunyikan terus-menerus sebagai acuan telinga.
// Ini alat latihan intonasi paling tua dan paling ampuh — nada yang meleset
// bakal "berdenyut" (beating) lawan drone, kedengeran jelas walau kupingnya
// belum terlatih.

import { useCallback, useEffect, useRef, useState } from "react";
import { midiToFreq } from "@/lib/notes";

const ATTACK = 0.35;
const RELEASE = 0.4;

export function useDrone() {
  const [midi, setMidi] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(0.25);

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscsRef = useRef<OscillatorNode[]>([]);
  const volRef = useRef(volume);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + RELEASE);
    const oscs = oscsRef.current;
    oscs.forEach((o) => o.stop(now + RELEASE + 0.05));
    // context-nya baru ditutup setelah suaranya benar-benar habis, biar gak "klik"
    const closing = ctx;
    window.setTimeout(() => closing.close().catch(() => {}), (RELEASE + 0.2) * 1000);
    ctxRef.current = null;
    gainRef.current = null;
    oscsRef.current = [];
    setMidi(null);
  }, []);

  const play = useCallback(
    (targetMidi: number) => {
      // ganti nada selagi bunyi: cukup geser frekuensinya, gak usah restart
      if (ctxRef.current && oscsRef.current.length) {
        const ctx = ctxRef.current;
        const f = midiToFreq(targetMidi);
        const now = ctx.currentTime;
        oscsRef.current.forEach((o, i) => {
          const target = i === 2 ? f * 2 : f; // osilator ke-3 = oktaf atas
          o.frequency.setTargetAtTime(target, now, 0.05);
        });
        setMidi(targetMidi);
        return;
      }

      const ctx = new AudioContext();
      const f = midiToFreq(targetMidi);
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;

      // 3 osilator: dasar + detune tipis (bikin "hidup", gak kayak sinyal tes)
      // + oktaf atas pelan biar nada dasarnya gampang dikenali kuping pemula.
      const specs: { type: OscillatorType; freq: number; gain: number }[] = [
        { type: "sawtooth", freq: f, gain: 0.5 },
        { type: "sawtooth", freq: f * 1.002, gain: 0.35 },
        { type: "sine", freq: f * 2, gain: 0.18 },
      ];

      const oscs = specs.map((s) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = s.type;
        osc.frequency.value = s.freq;
        g.gain.value = s.gain;
        osc.connect(g).connect(filter);
        osc.start();
        return osc;
      });

      filter.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volRef.current, now + ATTACK);

      ctxRef.current = ctx;
      gainRef.current = gain;
      oscsRef.current = oscs;
      setMidi(targetMidi);
    },
    []
  );

  const setVolume = useCallback((v: number) => {
    volRef.current = v;
    setVolumeState(v);
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (ctx && gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }, []);

  const toggle = useCallback(
    (targetMidi: number) => {
      if (midi === targetMidi) stop();
      else play(targetMidi);
    },
    [midi, play, stop]
  );

  useEffect(() => stop, [stop]);

  return { midi, playing: midi !== null, volume, play, stop, toggle, setVolume };
}
