import { describe, expect, it, vi } from 'vitest';
import { type InputRecording, recordInput, replayInput } from '../input-recording.js';

describe('input-recording', () => {
  it('records relative timestamps and replays inputs in order', () => {
    const seen: string[] = [];
    const recorder = recordInput<string>((input) => {
      seen.push(input);
    });

    recorder.record('press', 1000);
    recorder.record('release', 1050);

    expect(seen).toEqual(['press', 'release']);

    const recording = recorder.recording;
    expect(recording.startedAt).toBe(1000);
    expect(recording.duration).toBe(50);
    expect(recording.events).toEqual([
      { at: 0, input: 'press' },
      { at: 50, input: 'release' },
    ]);

    const replayed: string[] = [];
    replayInput(recording, (input) => {
      replayed.push(input);
    });
    expect(replayed).toEqual(['press', 'release']);
  });

  it('keeps finish() stable when no inputs were recorded', () => {
    const recorder = recordInput<string>(() => {});
    const recording: InputRecording<string> = recorder.finish(2500);
    expect(recording.startedAt).toBe(2500);
    expect(recording.duration).toBe(0);
    expect(recording.events).toEqual([]);
  });

  it('preserves normalized event payloads', () => {
    const clone = vi.fn();
    const payload = { type: 'press' as const, x: 1, y: 2 };
    const recorder = recordInput<typeof payload>(clone);

    recorder.record(payload, 100);
    payload.x = 99;

    expect(recorder.recording.events[0]!.input).toEqual({ type: 'press', x: 1, y: 2 });
    expect(clone).toHaveBeenCalledWith(payload);
  });
});
