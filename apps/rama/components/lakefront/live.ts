'use client';
// The browser side of the lakefront: Harmony's tokens read from the page (so a theme change repaints in
// the other theme), the facades' pictures loaded once each, and whether the person asked for less motion.
import { useCallback, useEffect, useRef, useState } from 'react';
import { paletteFrom, type Palette } from '@rama/stage';

export function livePalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  return paletteFrom(
    (t) => css.getPropertyValue(`--${t}`),
    css.getPropertyValue('--font-sans').trim() || 'Urbanist, system-ui, sans-serif',
  );
}

/** The palette, re-read when the theme changes. */
export function usePalette(): Palette | null {
  const [pal, setPal] = useState<Palette | null>(null);
  useEffect(() => {
    setPal(livePalette());
    const obs = new MutationObserver(() => setPal(livePalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setPal(livePalette());
    mq.addEventListener('change', on);
    return () => {
      obs.disconnect();
      mq.removeEventListener('change', on);
    };
  }, []);
  return pal;
}

/** Loads each picture once; `version` changes when one finishes loading, so the canvas repaints. */
export function useImages(): { image: (src: string) => HTMLImageElement | null; version: number } {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [version, setVersion] = useState(0);
  // A picture asked for while the view first renders can arrive before the view is mounted: its
  // arrival is kept and counted once the view is mounted, never set on a view not there yet.
  const mounted = useRef(false);
  const arrivedEarly = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (arrivedEarly.current) setVersion((v) => v + 1);
    return () => {
      mounted.current = false;
    };
  }, []);
  // One function for the page's life: a draw effect that depends on it must not run again every render
  // (a new function each render restarted the replay's clock on every frame).
  const image = useCallback((src: string) => {
    // Rendered on the server first: there are no pictures there, only on the page.
    if (typeof Image === 'undefined') return null;
    let img = cache.current.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => {
        if (mounted.current) setVersion((v) => v + 1);
        else arrivedEarly.current = true;
      };
      img.src = src;
      cache.current.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }, []);
  return { image, version };
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
