
// Mobile Enhancements: Scrollable + Pinch-to-Zoom Fretboard
(function () {
  function findFretboard() {
    const selectors = [
      '#fretboard',
      '.fretboard',
      '[data-role="fretboard"]',
      '[id*="fret"][class*="board"]',
      '[class*="fret"][class*="board"]'
    ];
    let best = null;
    let bestScore = -1;
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const rect = el.getBoundingClientRect();
        const score = (rect.width || 0) * (el.children.length || 1);
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      });
      if (best) break;
    }
    return best;
  }

  function ensureViewportAndScaler(fretboard) {
    if (fretboard && fretboard.parentElement && fretboard.parentElement.id === 'fretboardScaler') {
      return { viewport: fretboard.parentElement.parentElement, scaler: fretboard.parentElement };
    }
    const viewport = document.createElement('div');
    viewport.id = 'fretboardViewport';
    const scaler = document.createElement('div');
    scaler.id = 'fretboardScaler';

    const parent = fretboard.parentElement;
    parent.insertBefore(viewport, fretboard);
    viewport.appendChild(scaler);
    scaler.appendChild(fretboard);
    viewport.style.maxWidth = '100%';
    viewport.style.display = 'block';
    return { viewport, scaler };
  }

  // --- Pinch-to-zoom helpers ---
  function distance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function midpoint(a, b) {
    return { x: (a.clientX + b.clientX)/2, y: (a.clientY + b.clientY)/2 };
  }

  function applyScaleAt(scaler, scale, originX, originY) {
    scale = Math.max(0.5, Math.min(2.0, scale));
    // Convert page coords to scaler local transform-origin
    const rect = scaler.getBoundingClientRect();
    const ox = Math.max(0, Math.min(rect.width, originX - rect.left));
    const oy = Math.max(0, Math.min(rect.height, originY - rect.top));
    scaler.style.transformOrigin = `${ox}px ${oy}px`;
    scaler.style.transform = `scale(${scale})`;

    const inner = scaler.firstElementChild;
    if (inner) {
      const naturalWidth = inner.scrollWidth;
      inner.style.minWidth = Math.ceil(naturalWidth) + 'px';
    }
  }

  function enablePinchZoom(viewport, scaler) {
    // Use Pointer Events for robust multi-touch handling
    const active = new Map(); // pointerId -> pointerEvent
    let baseDistance = null;
    let baseScale = 1;
    let currentScale = 1;

    // prevent the browser's native pinch-zoom on the page inside the viewport
    viewport.style.touchAction = 'pan-x'; // we allow horizontal pan for scrolling, but not pinch-zoom of page

    function onPointerDown(e) {
      viewport.setPointerCapture?.(e.pointerId);
      active.set(e.pointerId, e);
      if (active.size === 2) {
        const [p1, p2] = Array.from(active.values());
        baseDistance = distance(p1, p2);
        baseScale = currentScale;
      }
    }

    function onPointerMove(e) {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, e);

      if (active.size === 2 && baseDistance) {
        const [p1, p2] = Array.from(active.values());
        const d = distance(p1, p2);
        if (d > 0) {
          const scale = baseScale * (d / baseDistance);
          const mid = midpoint(p1, p2);
          currentScale = Math.max(0.5, Math.min(2.0, scale));
          applyScaleAt(scaler, currentScale, mid.x, mid.y);
          // prevent page scroll while pinching
          e.preventDefault();
        }
      }
    }

    function onPointerUpOrCancel(e) {
      active.delete(e.pointerId);
      if (active.size < 2) {
        baseDistance = null;
        baseScale = currentScale;
      }
    }

    viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
    viewport.addEventListener('pointermove', onPointerMove, { passive: false });
    viewport.addEventListener('pointerup', onPointerUpOrCancel, { passive: true });
    viewport.addEventListener('pointercancel', onPointerUpOrCancel, { passive: true });

    // Desktop: Ctrl + wheel zoom support
    viewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        currentScale = Math.max(0.5, Math.min(2.0, (currentScale || 1) + delta));
        applyScaleAt(scaler, currentScale, e.clientX, e.clientY);
      }
    }, { passive: false });

    // Double-tap (quick 2 taps within 300ms) to toggle zoom
    let lastTap = 0;
    viewport.addEventListener('pointerup', (e) => {
      const now = performance.now();
      if (now - lastTap < 300) {
        currentScale = currentScale < 1.4 ? 1.6 : 1.0;
        applyScaleAt(scaler, currentScale, e.clientX, e.clientY);
      }
      lastTap = now;
    }, { passive: true });

    // Initialize viewport height after layout
    requestAnimationFrame(() => {
      const rect = scaler.getBoundingClientRect();
      viewport.style.height = Math.ceil(rect.height) + 'px';
      applyScaleAt(scaler, currentScale, rect.left + rect.width/2, rect.top + rect.height/2);
    });
  }

  function init() {
    const fretboard = findFretboard();
    if (!fretboard) return;
    const { viewport, scaler } = ensureViewportAndScaler(fretboard);
    // Remove any existing zoom control UI if present
    document.querySelectorAll('.fret-zoom-controls').forEach(el => el.remove());
    enablePinchZoom(viewport, scaler);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
