// Sound for Solmara: a tiny WebAudio step sequencer for the three radio stations, plus
// one-shot effects (shots, pickups, crashes, sirens). No audio files, no network — every
// sound is synthesized. The radio only starts after the first user gesture, as browsers
// require, and R cycles stations, M mutes.

import { RADIO } from './config.js';

export function createAudio() {
  let context = null;
  let master = null;
  let station = 0;
  let muted = false;
  let stepTimer = null;
  let stepIndex = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.16;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function semitone(root, n) {
    return root * Math.pow(2, n / 12);
  }

  function note(freq, when, length, wave, volume) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, when + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  function radioTick() {
    if (!context || muted) return;
    const stationDef = RADIO[station];
    const stepSeconds = 60 / stationDef.bpm / 2;
    const now = context.currentTime + 0.05;
    const n = stationDef.notes[stepIndex % stationDef.notes.length];
    note(semitone(stationDef.root, n), now, stepSeconds * 1.8, stationDef.wave, 0.5);
    if (stepIndex % 4 === 0) note(semitone(stationDef.root / 2, 0), now, stepSeconds * 3.5, 'sine', 0.7);
    stepIndex += 1;
  }

  function startRadio() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume();
    if (stepTimer !== null) return;
    const stationDef = RADIO[station];
    stepTimer = window.setInterval(radioTick, (60 / stationDef.bpm / 2) * 1000);
  }

  function stopRadio() {
    if (stepTimer !== null) {
      window.clearInterval(stepTimer);
      stepTimer = null;
    }
  }

  return {
    /** Call on the first gesture so the radio may start. */
    unlock() {
      startRadio();
    },
    stationName() {
      return RADIO[station].name;
    },
    nextStation() {
      station = (station + 1) % RADIO.length;
      stepIndex = 0;
      stopRadio();
      startRadio();
      return RADIO[station].name;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.16;
      return muted;
    },
    isMuted() { return muted; },
    shot() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      note(880, now, 0.07, 'square', 0.5);
      note(220, now, 0.1, 'sawtooth', 0.4);
    },
    pickup() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      note(660, now, 0.1, 'triangle', 0.5);
      note(990, now + 0.08, 0.14, 'triangle', 0.5);
    },
    crash() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      note(90, now, 0.25, 'sawtooth', 0.6);
      note(60, now + 0.05, 0.2, 'square', 0.4);
    },
    siren() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      note(700, now, 0.22, 'sine', 0.25);
      note(950, now + 0.22, 0.22, 'sine', 0.25);
    },
    success() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => note(f, now + i * 0.09, 0.18, 'triangle', 0.5));
    },
    fail() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      [392, 330, 262].forEach((f, i) => note(f, now + i * 0.12, 0.2, 'sawtooth', 0.4));
    },
  };
}
