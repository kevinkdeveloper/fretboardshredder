// audio.ts
// Minimal WebAudio helpers + step sequencer with LIVE BPM updates.

export type Step = { midi: number }
export type LoopHandle = { stop: () => void; setBpm: (bpm: number) => void }

// ---------- Audio bootstrap ----------
let AC: AudioContext | null = null

export async function initAudio() {
  if (!AC) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
    AC = new Ctx()
  }
  if (AC.state === 'suspended') await AC.resume()
  return AC
}

// ---------- Simple tone synth ----------
function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export async function playMidi(midi: number, noteDurationSec = 0.3) {
  const ac = await initAudio();

  const frequency = midiToFreq(midi);
  const sampleRate = ac.sampleRate;
  const length = Math.floor(sampleRate * noteDurationSec); // exact duration — no ringing past it
  const buffer = ac.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Karplus-Strong plucked string algorithm (no sustain tail — tight cutoff)
  const N = Math.round(sampleRate / frequency);
  for (let i = 0; i < N; i++) {
    data[i] = Math.random() * 2 - 1; // initial noise burst = pluck
  }
  for (let i = N; i < length; i++) {
    // decay tightened so it dies QUICKLY — prevents ringing
    data[i] = (data[i - N] + data[i - N + 1]) * 0.5 * 0.98;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.connect(ac.destination);
  source.start();
}



// ---------- Metronome (optional; restart-on-change) ----------
type MetroState = {
  alive: boolean
  bpm: number
  meter: number
  nextBeat: number
  beatIdx: number
  timer: number | null
}
let METRO: MetroState | null = null

export async function metronomeStart(bpm: number, meter: number) {
  await initAudio()
  metronomeStop()

  METRO = {
    alive: true,
    bpm,
    meter: Math.max(1, meter | 0),
    nextBeat: performance.now(),
    beatIdx: 0,
    timer: null,
  }

  const msPerBeat = () => 60000 / Math.max(1, METRO!.bpm)

  const tick = async () => {
    if (!METRO || !METRO.alive) return
    const accent = METRO.beatIdx % METRO.meter === 0
    await click(accent ? 880 : 660, accent ? 0.06 : 0.04, accent ? 0.16 : 0.11)

    METRO.beatIdx = (METRO.beatIdx + 1) % METRO.meter
    METRO.nextBeat += msPerBeat()
    const delay = Math.max(0, METRO.nextBeat - performance.now())
    METRO.timer = window.setTimeout(tick, delay)
  }

  METRO.timer = window.setTimeout(tick, 0)
  ;(window as any).__metro_on = true
}

export function metronomeStop() {
  if (!METRO) return
  METRO.alive = false
  if (METRO.timer) clearTimeout(METRO.timer)
  METRO = null
  ;(window as any).__metro_on = false
}

async function click(freq: number, dur: number, gain: number) {
  const ac = await initAudio()
  const t0 = ac.currentTime
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  g.gain.value = gain
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur)
}

// ---------- Step sequencer with LIVE BPM ----------
export async function startStepSequence(
  steps: Step[],
  bpm: number,
  onStep: (idx: number) => void
): Promise<LoopHandle> {
  await initAudio()
  if (!steps.length) {
    return { stop() {}, setBpm() {} }
  }

  let alive = true
  let idx = 0
  const state = { bpm } // mutable; updated via setBpm

  const msPerStep = () => 60000 / Math.max(1, state.bpm)

  async function loop() {
    if (!alive) return
    onStep(idx)
    // play note (fire-and-forget; okay for simple use)
    playMidi(steps[idx].midi)
    idx = (idx + 1) % steps.length
    setTimeout(loop, msPerStep()) // uses latest BPM each time
  }

  setTimeout(loop, 0)

  return {
    stop() { alive = false },
    setBpm(newBpm: number) { state.bpm = newBpm },
  }
}
