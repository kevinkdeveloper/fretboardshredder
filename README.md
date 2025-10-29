
# Guitar Fretboard — Web Starter (React + TypeScript + Vite + Tone.js)

This is a minimal, production-friendly starter that recreates your desktop app's key ideas:
- **Canvas fretboard** (0..24) with scale notes (root = blue, others = teal)
- **Box mode** window highlight (3NPS-style) vs **Full neck**
- **WebAudio metronome** and **click-to-play** notes via Tone.js

## Quick start
```bash
npm install
npm run dev
# open the URL (default http://localhost:5173)
```

## Files to peek at first
- `src/App.tsx`: UI wiring, state, toolbar/cards
- `src/Fretboard.tsx`: Canvas rendering (board, strings, frets, markers, notes)
- `src/audio.ts`: Metronome + note playback using Tone.js
- `src/theory.ts`: Scales/tunings/utility

## Notes
- Practice loop is stubbed; click any note on the board to hear it.
- Add your existing 3NPS/Full-Neck loop by walking the same sequences you use on desktop and calling `playMidi` with `await initAudio()` once on user gesture.
- Deploy as a static site: `npm run build` then host `dist/` on Netlify / Vercel / GitHub Pages.
