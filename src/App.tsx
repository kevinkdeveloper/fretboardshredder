import { useEffect, useMemo, useRef, useState } from 'react'
import Fretboard, { fullNotesPerString, windowNotesPerString, FBNote } from './Fretboard'
import { NOTE_NAMES_SHARP, SCALES } from './theory'
import { initAudio, playMidi, startStepSequence, Step, LoopHandle } from './audio'
import AutoFitViewport from "./AutoFitViewport"

type Mode = 'box' | 'full'
const uiStringToDisplayIdx = (n: number) => Math.min(5, Math.max(0, n - 1))

// Theme support
type Theme = 'light' | 'dark'
function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export default function App(){
  // THEME
  const [theme, setTheme] = useState<Theme>(getInitialTheme())
  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  // HAMBURGER / DRAWER
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(()=>{
    const onResizeOrOrient = () => setMenuOpen(false)
    window.addEventListener('resize', onResizeOrOrient)
    window.addEventListener('orientationchange', onResizeOrOrient)
    return () => {
      window.removeEventListener('resize', onResizeOrOrient)
      window.removeEventListener('orientationchange', onResizeOrOrient)
    }
  }, [])
  useEffect(()=>{
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  // APP STATE
  const [rootName, setRootName] = useState('E')
  const [scaleName, setScaleName] = useState('Natural Minor (Aeolian)')

  const [mode, setMode] = useState<Mode>('box')
  const [startFret, setStartFret] = useState(0)
  const [win, setWin] = useState(4)
  const [fullString, setFullString] = useState<number>(1)

  const [bpm, setBpm] = useState(120)

  const rootPc = useMemo(()=> NOTE_NAMES_SHARP.indexOf(rootName), [rootName])
  const scaleSet = useMemo(()=> new Set(SCALES[scaleName].map(o => (o + rootPc) % 12)), [scaleName, rootPc])
  const frets = 24

  const [playing, setPlaying] = useState<{sIdx:number,fret:number,pc:number}|null>(null)
  const [clicked, setClicked] = useState<{sIdx:number,fret:number,pc:number}|null>(null)
  const looperRef = useRef<LoopHandle | null>(null)

  const status =
    `Mode: ${mode === 'box' ? 'Box' : ('Full Neck • String ' + fullString)} • ` +
    `Root: ${rootName} • Scale: ${scaleName} • Tuning: EADGBE • BPM: ${bpm}`

  useEffect(()=> ()=> { if (looperRef.current) looperRef.current.stop() }, [])

  function buildBoxSequence(): FBNote[] {
    // Standard tuning absolute MIDI (LowE..HighE): 40,45,50,55,59,64
    const dispMidi = [40,45,50,55,59,64].slice().reverse()
    const dispPc = dispMidi.map(m => m % 12)
    const per = windowNotesPerString(frets, startFret, win, dispMidi, dispPc, scaleSet)
    const up: FBNote[] = []
    for (let s = 5; s >= 0; s--) { up.push(...per[s]) }
    const down = [...up].reverse()
    return up.concat(down)
  }

  function buildFullSequenceOnString(selUiString: number): FBNote[] {
    const dispMidi = [40,45,50,55,59,64].slice().reverse()
    const dispPc = dispMidi.map(m => m % 12)
    const per = fullNotesPerString(frets, dispMidi, dispPc, scaleSet)
    const idx = uiStringToDisplayIdx(selUiString)
    const notes = [...per[idx]].sort((a, b) => a[1] - b[1])
    return notes
  }

  async function togglePractice(){
    if (looperRef.current){
      looperRef.current.stop()
      looperRef.current = null
      setPlaying(null)
      return
    }
    const seq = (mode === 'box') ? buildBoxSequence() : buildFullSequenceOnString(fullString)
    const steps: Step[] = seq.map(n => ({ midi: n[3] }))

    const handle = await startStepSequence(steps, bpm, (idx)=>{
      const [sIdx, fret, pc/*, midi*/] = seq[idx]
      setPlaying({ sIdx, fret, pc })
    })
    looperRef.current = handle
  }

  useEffect(()=>{
    setPlaying(null)
    if (looperRef.current){ looperRef.current.stop(); looperRef.current = null }
  }, [mode])

  // Live BPM update (no restart)
  useEffect(() => {
    looperRef.current?.setBpm(bpm)
  }, [bpm])

  // Controls for the toolbar (Root/Scale/BPM live in a card except in mobile landscape)
  const ToolbarControls = (
    <>
      <button className="btn primary" onClick={togglePractice}>
        {looperRef.current ? 'Stop Scale Practice' : 'Scale Practice'}
      </button>

      <button className="btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
        {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
      </button>

      <label>Option&nbsp;
        <select value={mode} onChange={e=> setMode(e.target.value as Mode)}>
          <option value="box">Box Mode</option>
          <option value="full">Full Neck</option>
        </select>
      </label>

      {mode === 'box' && (
        <>
          <label>Box Size&nbsp;
            <select value={win} onChange={e=> setWin(parseInt(e.target.value))}>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          <div className="row ml-auto">
            <button className="btn" onClick={()=> setStartFret(f=> Math.max(0, f-1))}>⟵ Prev</button>
            <button className="btn" onClick={()=> setStartFret(f=> Math.min(24, f+1))}>Next ⟶</button>
          </div>
        </>
      )}

      {mode === 'full' && (
        <label style={{marginLeft:8}}>String&nbsp;
          <select value={fullString} onChange={e=> setFullString(parseInt(e.target.value))}>
            <option value={1}>1 (High E)</option>
            <option value={2}>2 (B)</option>
            <option value={3}>3 (G)</option>
            <option value={4}>4 (D)</option>
            <option value={5}>5 (A)</option>
            <option value={6}>6 (Low E)</option>
          </select>
        </label>
      )}
    </>
  )

  return (
    <AutoFitViewport>
      <div className="container">
        <div className="header">
          <h1 className="title">Fretboard Shredder</h1>
          <p className="subtitle">Interactive Guitar Fretboard for Practising Scales</p>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          {/* Hamburger */}
          <button
            className="hamburger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="drawer"
            onClick={()=> setMenuOpen(v=>!v)}
          >
            <span/><span/><span/>
          </button>

          {/* Standard toolbar items (hidden in mobile landscape via CSS) */}
          <div className="toolbar-items">
            {ToolbarControls}
          </div>
        </div>

        {/* Drawer for mobile landscape */}
        <div
          id="drawer"
          className="drawer"
          data-open={menuOpen || undefined}
          role="dialog"
          aria-modal="true"
        >
          <div className="drawer-header">
            <strong>Menu</strong>
            <button className="btn sm" onClick={()=> setMenuOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="drawer-content">
            <div className="row">
              <label>Root</label>
              <select value={rootName} onChange={e=> setRootName(e.target.value)}>
                {NOTE_NAMES_SHARP.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="row" style={{marginTop:8}}>
              <label>Scale</label>
              <select value={scaleName} onChange={e=> setScaleName(e.target.value)} style={{minWidth:220}}>
                {Object.keys(SCALES).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="row" style={{marginTop:8}}>
              <label>BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={e=> setBpm(parseInt(e.target.value || '0')||0)}
                style={{width:90}}
              />
              <input
                type="range"
                min={30}
                max={540}
                step={1}
                value={bpm}
                onChange={e=> setBpm(parseInt(e.target.value || '0')||0)}
                style={{ marginLeft: 8, width: 160 }}
                aria-label="BPM slider"
                title={`BPM: ${bpm}`}
              />
            </div>

            <div className="row" style={{marginTop:12, gap:8}}>
              <button className="btn primary" onClick={()=> { togglePractice(); setMenuOpen(false) }}>
                {looperRef.current ? 'Stop Practice' : 'Start Practice'}
              </button>
              <button className="btn" onClick={()=> setMenuOpen(false)}>Close</button>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid">
          <div className="card controls-card">
            <div className="row">
              <label>Root</label>
              <select value={rootName} onChange={e=> setRootName(e.target.value)}>
                {NOTE_NAMES_SHARP.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="row" style={{marginTop:8}}>
              <label>Scale</label>
              <select value={scaleName} onChange={e=> setScaleName(e.target.value)} style={{minWidth:280}}>
                {Object.keys(SCALES).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="row">
              <label>BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={e=> setBpm(parseInt(e.target.value || '0')||0)}
                style={{width:90}}
              />
              <input
                type="range"
                min={30}
                max={540}
                step={1}
                value={bpm}
                onChange={e=> setBpm(parseInt(e.target.value || '0')||0)}
                style={{ marginLeft: 8, width: 180 }}
                aria-label="BPM slider"
                title={`BPM: ${bpm}`}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{marginTop:12}}>
          <Fretboard
            rootPc={rootPc}
            scaleSet={scaleSet}
            boxMode={mode === 'box'}
            startFret={startFret}
            windowSize={win}
            playing={playing}
            clicked={clicked}
            highlightStringIdx={mode === 'full' ? uiStringToDisplayIdx(fullString) : null}
            visibleHeight={380}
            onNoteClick={(midi, pc, sIdx, fret)=> {
              initAudio().then(()=> playMidi(midi))
              setClicked({ sIdx, fret, pc })
              setTimeout(()=> setClicked(null), 300)
            }}
          />
        </div>

        <div className="status">{status}</div>
      </div>
    </AutoFitViewport>
  )
}
