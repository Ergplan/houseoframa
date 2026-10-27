// The voice's side of the hand-off (Stage 10). The session (packages/model voiceSession) never answers
// on its own; it speaks when the room sends it one of these events, built here on the server from a
// builder line and the voice's own prompt (voice.v1), so the page cannot change what the voice is told.
import { loadPrompt, VOICE_PROMPT } from '@rama/model';
import type { Line } from './conductor.ts';

/** A data-channel event that makes the voice read one line aloud, outside the conversation. */
export function sayEvent(line: Pick<Line, 'text'>, rules: string) {
  return {
    type: 'response.create',
    response: {
      conversation: 'none',
      output_modalities: ['audio'],
      instructions: `${rules.trim()}\n\nThe line to read now, word for word, and nothing else:\n\n${line.text}`,
      input: [],
    },
  };
}

/** Each line with the event that makes the voice read it. */
export async function linesToSay(
  lines: Line[],
): Promise<(Line & { event: ReturnType<typeof sayEvent> })[]> {
  const rules = (await loadPrompt(VOICE_PROMPT.name, VOICE_PROMPT.version)).text;
  return lines.map((l) => ({ ...l, event: sayEvent(l, rules) }));
}
