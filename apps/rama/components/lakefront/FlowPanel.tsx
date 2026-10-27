'use client';
// The flow of a figure, in words (Stage 11): each step of the water from the ground to the screen, the
// one playing lit, with play and pause, a step back and a step on. Each step's sentence is handed to the
// voice as builder text when a session is open (the `rama:tell` event the room listens for).
import type { Flow } from '@rama/trace';

export function FlowPanel({
  flow,
  step,
  playing,
  done,
  onPlay,
  onPause,
  onStep,
  onClose,
}: {
  flow: Flow;
  step: number;
  playing: boolean;
  done: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: (by: number) => void;
  onClose: () => void;
}) {
  return (
    <section className="eg-glass rama-card flow-panel" data-flow={flow.key} data-step={step}>
      <div className="eg-overline">The flow of {flow.title}</div>
      {!flow.full ? (
        <p className="eg-muted" style={{ margin: 0 }}>
          Part of this flow is untraced: the water runs as far as the trail reaches, and the rest is
          dry.
        </p>
      ) : null}
      <ol className="flow-steps">
        {flow.steps.map((s, i) => (
          <li
            key={i}
            className={`${i === step ? 'on' : ''}${s.value === null ? ' dry' : ''}`}
            data-step={i}
          >
            {s.sentence}
          </li>
        ))}
      </ol>
      <div className="rama-row">
        <button
          type="button"
          className="eg-btn eg-btn--sm"
          onClick={() => onStep(-1)}
          disabled={step === 0}
        >
          ◀ Step back
        </button>
        {playing ? (
          <button type="button" className="eg-btn eg-btn--sm" onClick={onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className="eg-btn eg-btn--sm" onClick={onPlay}>
            {done ? 'Play again' : 'Play'}
          </button>
        )}
        <button
          type="button"
          className="eg-btn eg-btn--sm"
          onClick={() => onStep(1)}
          disabled={step >= flow.steps.length - 1}
        >
          Step on ▶
        </button>
        <button type="button" className="eg-btn eg-btn--ghost eg-btn--sm" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
