import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  frets?: number
  /** Optional; defaults to standard tuning if omitted */
  tuning?: number[]
  rootPc: number
  scaleSet: Set<number>
  boxMode: boolean
  startFret: number
  windowSize: number
  preferFlats?: boolean
  onNoteClick?: (midi:number, pc:number, sIdx:number, fret:number)=>void
  playing?: { sIdx:number, fret:number, pc:number } | null
  clicked?: { sIdx:number, fret:number, pc:number } | null
  /** 0 = High E, 5 = Low E (display order) */
  highlightStringIdx?: number | null
  /** initial pixels per fret; users can zoom from here */
  pxPerFret?: number
  /** Optional fixed visible height; otherwise auto-calculated */
  visibleHeight?: number
}

const NOTE_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
const NOTE_NAMES_FLAT  = ["C","Db","D","Eb","E","Gb","G","Ab","A","Bb","B"]
const FRET_MARKERS = new Set([3,5,7,9,12,15,17,19,21,24])

export type FBNote = [sIdx:number, fret:number, pc:number, midi:number]

export function windowNotesPerString(
  frets:number, start:number, size:number,
  displayTuningMidi:number[], displayTuningPc:number[], scaleSet:Set<number>
): FBNote[][]{
  const res: FBNote[][] = []
  const last = Math.min(frets, start + Math.max(0, size) - 1)
  for(let s=0; s<6; s++){
    const openPc = displayTuningPc[s]
    const absOpen = displayTuningMidi[s]
    const out: FBNote[] = []
    for(let f=start; f<=last; f++){
      const pc = (openPc + f) % 12
      if (scaleSet.has(pc)) out.push([s,f,pc,absOpen+f])
    }
    if (out.length > 3){
      const mid = start + size/2
      out.sort((a,b)=> Math.abs(a[1]-mid) - Math.abs(b[1]-mid))
      out.splice(3)
      out.sort((a,b)=> a[1]-b[1])
    }
    res.push(out)
  }
  return res
}

export function fullNotesPerString(
  frets:number, displayTuningMidi:number[], displayTuningPc:number[], scaleSet:Set<number>
): FBNote[][]{
  const res: FBNote[][] = []
  for(let s=0; s<6; s++){
    const openPc = displayTuningPc[s]
    const absOpen = displayTuningMidi[s]
    const out: FBNote[] = []
    for(let f=0; f<=frets; f++){
      const pc = (openPc + f) % 12
      if (scaleSet.has(pc)) out.push([s,f,pc,absOpen+f])
    }
    res.push(out)
  }
  return res
}

export default function Fretboard({
  frets=24,
  tuning,
  rootPc,
  scaleSet,
  boxMode,
  startFret,
  windowSize,
  preferFlats=false,
  onNoteClick,
  playing,
  clicked,
  highlightStringIdx=null,
  pxPerFret=80,
  visibleHeight,
}: Props){
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Standard tuning fallback (LowE..HighE)
  const STANDARD_TUNING_ABS = [40,45,50,55,59,64]
  const effectiveTuning = useMemo(
    () => (tuning && tuning.length === 6 ? tuning : STANDARD_TUNING_ABS),
    [tuning]
  )

  // Display order: High E (top) .. Low E (bottom)
  const displayTuningMidi = useMemo(()=> [...effectiveTuning].reverse(), [effectiveTuning])
  const displayTuningPc = useMemo(()=> displayTuningMidi.map(m=>m%12), [displayTuningMidi])
  const name = (pc:number)=> (preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc%12]

  // ---------- Zoom model ----------
  const MAX_PX_PER_FRET = 240
  function dynamicMinPxPerFret() {
    const w = wrapperRef.current?.clientWidth ?? 360
    const totalMargins = (w < 480 ? 40 : 80) // 20px each side narrow; 40px each otherwise
    const fitPx = (w - totalMargins) / (frets + 1) // frets + nut column
    return Math.max(10, Math.min(40, fitPx))
  }
  const [zoomPxPerFret, setZoomPxPerFret] = useState(() =>
    clamp(pxPerFret, dynamicMinPxPerFret(), MAX_PX_PER_FRET)
  )
  useEffect(()=>{
    setZoomPxPerFret(clamp(pxPerFret, dynamicMinPxPerFret(), MAX_PX_PER_FRET))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerFret])

  // NEW: Orientation/resize “fit-to-card” auto-zoom (only zooms OUT so the whole card fits)
  useEffect(() => {
    const FIT_MIN_PX_PER_FRET = 6 // allow extra-small if needed to guarantee full fit

    const fitToCardIfNeeded = () => {
      const el = wrapperRef.current
      if (!el) return
      const w = el.clientWidth
      if (!w) return

      const isNarrow = w < 480
      const marginX = isNarrow ? 20 : 40
      const fbW = Math.max(1, w - 2*marginX)
      const fitPxPerFret = fbW / (frets + 1)

      // Only reduce zoom (never increase) so users don't lose their current zoom-in level
      setZoomPxPerFret(prev =>
        prev > fitPxPerFret
          ? clamp(fitPxPerFret, FIT_MIN_PX_PER_FRET, MAX_PX_PER_FRET)
          : prev
      )
    }

    // Flip-aware events
    window.addEventListener('orientationchange', fitToCardIfNeeded)
    window.addEventListener('resize', fitToCardIfNeeded)

    // Also run once on mount to normalize starting state
    fitToCardIfNeeded()

    return () => {
      window.removeEventListener('orientationchange', fitToCardIfNeeded)
      window.removeEventListener('resize', fitToCardIfNeeded)
    }
  }, [frets])

  const virtualWidth = Math.max(1, Math.round(zoomPxPerFret * (frets + 1))) + 80
  const measureVisibleHeight = () => {
    if (typeof visibleHeight === 'number') return visibleHeight
    const w = wrapperRef.current?.clientWidth ?? 800
    return Math.max(260, Math.min(560, Math.round(w * 0.5)))
  }

  // ---------- Draw pass ----------
  useEffect(()=>{
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!
    const w = virtualWidth
    const h = measureVisibleHeight()
    cvs.width = w
    cvs.height = h
    cvs.style.width = `${w}px`
    cvs.style.height = `${h}px`

    const styles = getComputedStyle(document.documentElement)
    const card = styles.getPropertyValue('--card') || '#fff'
    const text = '#2b2b2b'
    const wood = '#e7d0b6'
    const string = '#d7d7d7'
    const nut = '#888'
    const fretC = '#bba07e'
    const dot = '#666'
    const rootColor = '#2563eb'
    const scaleColor = '#0ea5b7'

    const isNarrow = (wrapperRef.current?.clientWidth ?? 800) < 480
    const marginX = isNarrow ? 20 : 40
    const marginY = 24

    const fbW = Math.max(1, w - 2*marginX)
    const fbH = Math.max(1, h - 2*marginY)
    const denom = frets + 1

    const xLine = (f:number)=> marginX + fbW * (f/denom)
    const xCenter = (n:number)=> marginX + fbW * ((n+0.5)/denom)

    ctx.clearRect(0,0,w,h)

    // card
    roundRect(ctx, marginX-8, marginY-8, fbW+16, fbH+16, 10, true)
    ctx.fillStyle = card; ctx.fill()
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.stroke()

    // wood
    ctx.fillStyle = wood; ctx.fillRect(marginX, marginY, fbW, fbH)

    // strings
    const stringY = Array.from({length:6}, (_,i)=> marginY + fbH * (i+0.5)/6)
    ctx.strokeStyle = string
    for(let i=0;i<6;i++){
      ctx.lineWidth = (i<4)?2:3
      line(ctx, marginX, stringY[i], marginX+fbW, stringY[i])
    }

    // frets
    for(let f=0; f<=frets; f++){
      const x = xLine(f)
      ctx.strokeStyle = (f===0)? '#888' : fretC
      ctx.lineWidth = (f===0)? 6 : 2
      line(ctx, x, marginY, x, marginY+fbH)
    }

    // right edge
    ctx.strokeStyle = fretC; ctx.lineWidth = 2
    line(ctx, marginX + fbW, marginY, marginX + fbW, marginY + fbH)

    // labels
    ctx.fillStyle = text
    ctx.font = `${Math.max(10, Math.min(12, Math.round(fbH * 0.03)))}px Segoe UI, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for(let n=0; n<=frets; n++){
      ctx.fillText(String(n), xCenter(n), marginY-6)
    }

    // markers
    ctx.fillStyle = dot
    for(const f of Array.from(FRET_MARKERS)){
      const xc = xCenter(f)
      if (f===12){
        for(const k of [2/6,4/6]){
          circle(ctx, xc, marginY+fbH*k, Math.max(4, Math.min(7, fbH*0.015)), dot)
        }
      } else {
        circle(ctx, xc, marginY+fbH/2, Math.max(4, Math.min(7, fbH*0.015)), dot)
      }
    }

    // note sets
    const perString = boxMode
      ? windowNotesPerString(frets, startFret, windowSize, displayTuningMidi, displayTuningPc, scaleSet)
      : fullNotesPerString(frets, displayTuningMidi, displayTuningPc, scaleSet)

    // box window shade
    if (boxMode){
      const s = startFret, size = windowSize
      const x1 = xLine(s)
      const x2 = xLine(Math.min(frets, s+size))
      ctx.fillStyle = 'rgba(14,165,183,0.15)'
      ctx.strokeStyle = '#0ea5b7'; ctx.lineWidth = 2
      ctx.fillRect(x1, marginY, x2-x1, fbH)
      ctx.strokeRect(x1, marginY, x2-x1, fbH)
    }

    // string highlight (full-neck mode)
    if (!boxMode && highlightStringIdx !== null && highlightStringIdx !== undefined){
      const sIdx = Math.max(0, Math.min(5, highlightStringIdx))
      const y = stringY[sIdx]
      const bandH = 42
      ctx.fillStyle = 'rgba(14,165,183,0.15)'
      ctx.strokeStyle = '#0ea5b7'; ctx.lineWidth = 2
      ctx.fillRect(marginX, y - bandH/2, fbW, bandH)
      ctx.strokeRect(marginX, y - bandH/2, fbW, bandH)
    }

    // draw notes
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(10, Math.min(13, Math.round(fbH/6 * 0.28)))}px Segoe UI, sans-serif`
    for(let s=0; s<perString.length; s++){
      for(const [_s, f, pc] of perString[s]){
        const xc = xCenter(f)
        const yc = stringY[s]
        const fill = (pc===rootPc) ? rootColor : scaleColor
        const noteR = Math.max(10, Math.min(16, fbH/6 * 0.35))
        circle(ctx, xc, yc, noteR, fill)
        ctx.fillStyle = '#000'
        ctx.fillText(name(pc), xc, yc)
      }
    }

    // overlays
    if (playing){
      const xc = xCenter(playing.fret)
      const yc = stringY[playing.sIdx]
      ctx.lineWidth = 4
      ctx.strokeStyle = '#f59e0b'
      ring(ctx, xc, yc, 19)
      ctx.fillStyle = (playing.pc===rootPc) ? rootColor : '#000'
      ctx.fillText(name(playing.pc), xc, yc)
    }
    if (clicked){
      const xc = xCenter(clicked.fret)
      const yc = stringY[clicked.sIdx]
      circle(ctx, xc, yc, 13, scaleColor)
      ctx.fillStyle = '#000'
      ctx.fillText(name(clicked.pc), xc, yc)
    }

    // helpers
    function line(ctx:CanvasRenderingContext2D, x1:number,y1:number,x2:number,y2:number){
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
    }
    function circle(ctx:CanvasRenderingContext2D, x:number,y:number,r:number, fillStyle:string){
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2)
      ctx.fillStyle = fillStyle; ctx.fill()
    }
    function ring(ctx:CanvasRenderingContext2D, x:number,y:number,r:number){
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke()
    }
    function roundRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number, fill:boolean){
      const radius = r
      ctx.beginPath()
      ctx.moveTo(x+radius, y)
      ctx.arcTo(x+w, y, x+w, y+h, radius)
      ctx.arcTo(x+w, y+h, x, y+h, radius)
      ctx.arcTo(x, y+h, x, y, radius)
      ctx.arcTo(x, y, x+w, y, radius)
      ctx.closePath()
      if (fill) ctx.fill()
    }
  }, [
    effectiveTuning, rootPc, boxMode, startFret, windowSize, scaleSet, preferFlats,
    playing, clicked, frets, highlightStringIdx, zoomPxPerFret, visibleHeight, virtualWidth
  ])

  // clicks -> emit nearest note midi
  useEffect(()=>{
    const cvs = canvasRef.current!
    const handler = (ev: MouseEvent)=>{
      const rect = cvs.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const w = cvs.width
      const h = cvs.height
      const isNarrow = (wrapperRef.current?.clientWidth ?? 800) < 480
      const marginX = isNarrow ? 20 : 40
      const marginY = 24
      const fbW = Math.max(1, w - 2*marginX)
      const fbH = Math.max(1, h - 2*marginY)
      const denom = (frets ?? 24) + 1
      const s = ((x - marginX) / fbW) * denom
      const fret = Math.max(0, Math.min(frets, Math.round(s - 0.5)))
      const stringY = Array.from({length:6}, (_,i)=> marginY + fbH * (i+0.5)/6)
      let sIdx = 0, best = 1e9
      for(let i=0;i<6;i++){ const d = Math.abs(y - stringY[i]); if (d<best){ best=d; sIdx=i } }
      const dispMidi = [...effectiveTuning].reverse()
      const midi = dispMidi[sIdx] + fret
      const pc = midi % 12
      onNoteClick?.(midi, pc, sIdx, fret)
    }
    cvs.addEventListener('click', handler)
    return ()=> cvs.removeEventListener('click', handler)
  }, [onNoteClick, effectiveTuning, frets])

  // Gestures: pan (1-finger), pinch (2-finger), wheel zoom, mouse pan
  useEffect(()=>{
    const el = wrapperRef.current
    if (!el) return

    // Single-finger pan with intent detection (allow vertical page scroll)
    let isPanning = false
    let hasIntent = false
    let startX = 0
    let startY = 0
    let lastX = 0
    const INTENT_THRESH_PX = 8

    // Pinch zoom (touch)
    let pinchStartDist = 0
    let pinchStartPxPerFret = zoomPxPerFret

    const getTouchDist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      return Math.hypot(dx, dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        hasIntent = false
        isPanning = false
        startX = lastX = e.touches[0].clientX
        startY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        e.preventDefault()
        isPanning = false
        pinchStartDist = getTouchDist(e.touches[0], e.touches[1])
        pinchStartPxPerFret = zoomPxPerFret
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const x = e.touches[0].clientX
        const y = e.touches[0].clientY
        const dx = x - startX
        const dy = y - startY

        if (!hasIntent) {
          if (Math.abs(dx) < INTENT_THRESH_PX && Math.abs(dy) < INTENT_THRESH_PX) {
            return
          }
          hasIntent = true
          if (Math.abs(dx) > Math.abs(dy)) {
            isPanning = true
            e.preventDefault()
          } else {
            isPanning = false
            return
          }
        }

        if (isPanning) {
          e.preventDefault()
          const deltaX = x - lastX
          el.scrollLeft -= deltaX
          lastX = x
        }
      } else if (e.touches.length === 2) {
        e.preventDefault()
        const dist = getTouchDist(e.touches[0], e.touches[1])
        const rawRatio = dist / (pinchStartDist || dist)
        const sensitivity = 6 // more responsive pinch
        const adjustedRatio = Math.pow(rawRatio, sensitivity)
        setZoomPxPerFret(clamp(pinchStartPxPerFret * adjustedRatio, dynamicMinPxPerFret(), MAX_PX_PER_FRET))
      }
    }

    const onTouchEnd = () => { isPanning = false; hasIntent = false }

    // Wheel zoom (desktop/trackpad; ctrl+wheel often = pinch)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY !== 0) {
        e.preventDefault()
        const factor = e.ctrlKey ? 0.0015 : 0.003
        const scale = Math.exp(-e.deltaY * factor)
        setZoomPxPerFret(prev => clamp(prev * scale, dynamicMinPxPerFret(), MAX_PX_PER_FRET))
      }
    }

    // Optional mouse drag to pan
    let mouseDown = false
    let mouseLastX = 0
    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true
      mouseLastX = e.clientX
      e.preventDefault()
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return
      const dx = e.clientX - mouseLastX
      el.scrollLeft -= dx
      mouseLastX = e.clientX
      e.preventDefault()
    }
    const onMouseUpOrLeave = () => { mouseDown = false }

    const opts = { passive: false } as AddEventListenerOptions
    el.addEventListener('touchstart', onTouchStart, opts)
    el.addEventListener('touchmove', onTouchMove, opts)
    el.addEventListener('touchend', onTouchEnd, opts)
    el.addEventListener('wheel', onWheel, opts)
    el.addEventListener('mousedown', onMouseDown, opts)
    el.addEventListener('mousemove', onMouseMove, opts)
    el.addEventListener('mouseup', onMouseUpOrLeave, opts)
    el.addEventListener('mouseleave', onMouseUpOrLeave, opts)

    return () => {
      el.removeEventListener('touchstart', onTouchStart as any, opts)
      el.removeEventListener('touchmove', onTouchMove as any, opts)
      el.removeEventListener('touchend', onTouchEnd as any, opts)
      el.removeEventListener('wheel', onWheel as any, opts)
      el.removeEventListener('mousedown', onMouseDown as any, opts)
      el.removeEventListener('mousemove', onMouseMove as any, opts)
      el.removeEventListener('mouseup', onMouseUpOrLeave as any, opts)
      el.removeEventListener('mouseleave', onMouseUpOrLeave as any, opts)
    }
  }, [zoomPxPerFret])

  // Wrapper scroll container; canvas is wider and zooms via px-per-fret
  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',          // allow vertical page scroll
        overscrollBehavior: 'contain', // avoid iOS bounce inside this element
      }}
    >
      <div style={{ width: virtualWidth, height: measureVisibleHeight() }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

// helpers
function clamp(n:number, min:number, max:number){ return Math.max(min, Math.min(max, n)) }
