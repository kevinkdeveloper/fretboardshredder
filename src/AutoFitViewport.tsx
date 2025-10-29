import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Scales the entire app to fit within the current viewport whenever
 * the device rotates or the window resizes. It ONLY scales down.
 */
export default function AutoFitViewport({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    outer.style.position = "fixed";
    outer.style.inset = "0";
    outer.style.overflow = "hidden";
    outer.style.background = "var(--app-bg, transparent)"; // optional
  }, []);

  useEffect(() => {
    let raf = 0;

    const fit = () => {
      const el = scaleRef.current!;
      if (!el) return;

      // Reset to natural size to measure
      el.style.transform = "none";
      // force reflow
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.getBoundingClientRect();

      const naturalW = Math.max(el.scrollWidth, el.getBoundingClientRect().width);
      const naturalH = Math.max(el.scrollHeight, el.getBoundingClientRect().height);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const scale = Math.min(vw / naturalW, vh / naturalH, 1);
      el.style.transformOrigin = "top left";
      el.style.transform = `scale(${scale})`;
    };

    const scheduleFit = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };

    scheduleFit();
    window.addEventListener("orientationchange", scheduleFit, { passive: true });
    window.addEventListener("resize", scheduleFit);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("orientationchange", scheduleFit);
      window.removeEventListener("resize", scheduleFit);
    };
  }, []);

  return (
    <div ref={outerRef}>
      <div ref={scaleRef} style={{ transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
