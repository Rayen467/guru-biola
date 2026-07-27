"use client";

// Pemutar nada referensi. Pakai oscillator + envelope biar tidak "klik".

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function playTone(freq: number, durationSec = 1.2) {
  const ac = getCtx();
  if (ac.state === "suspended") ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sawtooth"; // lebih mirip gesekan senar daripada sine
  osc.frequency.value = freq;

  const now = ac.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
  gain.gain.setValueAtTime(0.18, now + durationSec - 0.15);
  gain.gain.linearRampToValueAtTime(0, now + durationSec);

  // filter biar sawtooth tidak terlalu kasar di kuping
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + durationSec);
}
