'use client';
// The camera's controls (Stage 11), in Harmony's small buttons: turn left and right in quarter steps,
// the side the picture is seen from, closer and further. The words are the voice's own commands.
import type { Camera, CameraAction } from '@rama/stage';
import { ORIENTATION_WORDS, useCamera } from './useCamera';

export function CameraRing({
  cam,
  act,
  zoomOnly,
}: {
  cam: Camera;
  act: (a: CameraAction) => void;
  /** The code has no sides to turn to: only closer and further. */
  zoomOnly?: boolean;
}) {
  return (
    <div className="camera-ring rama-row" role="group" aria-label="Turn and zoom the picture">
      {zoomOnly ? null : (
        <>
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => act({ type: 'turn', by: 'left' })}
          >
            ↺ Turn left
          </button>
          <span className="eg-chip" data-orientation={cam.orientation}>
            Seen {ORIENTATION_WORDS[cam.orientation]}
          </span>
          <button
            type="button"
            className="eg-btn eg-btn--sm"
            onClick={() => act({ type: 'turn', by: 'right' })}
          >
            Turn right ↻
          </button>
        </>
      )}
      <button
        type="button"
        className="eg-btn eg-btn--sm"
        aria-label="Closer"
        onClick={() => act({ type: 'zoom', factor: 1.25 })}
      >
        + Closer
      </button>
      <button
        type="button"
        className="eg-btn eg-btn--sm"
        aria-label="Further"
        onClick={() => act({ type: 'zoom', factor: 0.8 })}
      >
        − Further
      </button>
      {cam.scale !== 1 || cam.centre.x !== 0.5 || cam.centre.y !== 0.5 ? (
        <button
          type="button"
          className="eg-btn eg-btn--ghost eg-btn--sm"
          onClick={() => act({ type: 'reset' })}
        >
          The whole picture
        </button>
      ) : null}
    </div>
  );
}

/** The ring at the code: further falls back to the building (or the Street) it came from. */
export function CodeCamera({ siteId, start }: { siteId: string; start: Camera }) {
  const { cam, act } = useCamera(siteId, start);
  return (
    <CameraRing
      cam={cam}
      act={(a) => act(a.type === 'zoom' && a.factor < 1 ? { ...a, factor: 0.5 / cam.scale } : a)}
      zoomOnly
    />
  );
}
