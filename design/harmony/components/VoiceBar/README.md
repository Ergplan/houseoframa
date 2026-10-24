# VoiceBar

Real talk with ergOS: a glass pill with a living orb, the transcript or answer as captions, a waveform and one big mic button. It moves through four states, each visible at a glance.

- **idle**: muted prompt ("Ask anything"), flat dotted wave, ink mic button.
- **listening**: live transcript, ink waveform, a timer, and the mic turns Harmony green with two ripples; it becomes the stop-and-send button.
- **thinking**: shimmering status line ("Reading blocks 44–45…"), the orb spins faster, the wave breathes in accent.
- **speaking**: the answer streams as captions, the waveform and orb pulse with the voice; the button stops playback.

```html
<div class="eg-voice" data-state="idle">
  <span class="eg-voice__orb"><i></i></span>
  <div class="eg-voice__body"><div class="eg-voice__text" aria-live="polite">Ask anything</div><div class="eg-voice__wave"><canvas></canvas></div></div>
  <span class="eg-voice__timer">0:00</span>
  <button class="eg-icon-btn eg-icon-btn--sm" data-voice="keyboard" aria-label="Type instead">…</button>
  <button class="eg-voice__mic" data-voice="mic" aria-label="Start talking"><span class="i-mic">…</span><span class="i-stop">…</span><span class="i-spin"></span></button>
</div>
```

```js
var v = ErgOS.voiceBar(el, {
  live: true,                              // draw the wave from the real microphone level
  onMic: function (state, api) { /* start or stop your speech service */ },
  onKeyboard: function () { /* switch to the Ask bar */ }
});
v.setState('listening', ''); v.setText(partialTranscript); v.setState('thinking', 'Reading blocks…'); v.setState('speaking', answer);
```

- The consumer provides speech-to-text and text-to-speech; the bar renders state, captions and audio level. Without `onMic` it plays a scripted demo (as in this preview).
- Add `data-auto` to mount automatically; `eg-voice--compact` for phones. Pair it with the `eg-talk` transcript panel when the conversation should stay on screen.
- Captions are an `aria-live` region; the mic button's label changes with the state. Motion stops under reduced motion.
