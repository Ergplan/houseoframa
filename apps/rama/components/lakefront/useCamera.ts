'use client';
// The camera in the browser (Stage 11): packages/stage's camera state, kept in the address so a view can
// be sent, moved by the ring, the wheel, a drag sideways, the arrow keys and the voice (a `rama:camera`
// event from the room). A turn fades from the last frame to the new one over 300 ms; a zoom past a
// level's hand-off point opens the next level, or falls back to the one above.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { camera, cameraQuery, type Camera, type CameraAction, type Level } from '@rama/stage';
import { placeHref } from './places';

export const CAMERA_EVENT = 'rama:camera';
export const TURN_MS = 300;

/** The address of a level with the camera on it. */
export function cameraHref(siteId: string, c: Camera): string {
  const base =
    c.level === 'street'
      ? placeHref(siteId, { level: 'street' })
      : c.level === 'building'
        ? placeHref(siteId, { level: 'building', building: c.building! })
        : placeHref(siteId, { level: 'code', building: c.building });
  const q = new URLSearchParams(cameraQuery(c));
  const s = q.toString();
  return s ? `${base}${base.includes('?') ? '&' : '?'}${s}` : base;
}

/**
 * The camera of a view. `decorate` adds what the view knows to an action before it is taken (the Street
 * adds its chosen building to a zoom with nothing pointed at), for the ring, the keys and the voice alike.
 */
export function useCamera(
  siteId: string,
  start: Camera,
  decorate: (a: CameraAction) => CameraAction = (a) => a,
) {
  const decorated = useRef(decorate);
  decorated.current = decorate;
  const router = useRouter();
  const [cam, setCam] = useState<Camera>(start);
  const [turning, setTurning] = useState(0);
  const ref = useRef(cam);
  ref.current = cam;
  const level = useRef<Level>(start.level);

  const act = useCallback(
    (given: CameraAction) => {
      const a = decorated.current(given);
      const next = camera(ref.current, a);
      if (next.level !== level.current || next.building !== ref.current.building) {
        // A hand-off: the next level is its own page.
        router.push(cameraHref(siteId, next));
        return;
      }
      if (next.orientation !== ref.current.orientation) setTurning(performance.now());
      ref.current = next;
      setCam(next);
    },
    [router, siteId],
  );

  // The address follows the camera, without a new page.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const k of ['o', 'z', 'cx', 'cy']) url.searchParams.delete(k);
    for (const [k, v] of Object.entries(cameraQuery(cam))) url.searchParams.set(k, v);
    window.history.replaceState(window.history.state, '', url);
  }, [cam]);

  // The voice drives the same state.
  useEffect(() => {
    const on = (e: Event) => act((e as CustomEvent<CameraAction>).detail);
    window.addEventListener(CAMERA_EVENT, on);
    return () => window.removeEventListener(CAMERA_EVENT, on);
  }, [act]);

  return { cam, act, turning };
}

/** The ring and the zoom buttons, in plain words. */
export const ORIENTATION_WORDS = {
  north: 'from the front',
  east: 'from the right',
  south: 'from the back',
  west: 'from the left',
} as const;
