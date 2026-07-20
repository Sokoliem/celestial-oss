export interface RecordedInputEvent<E = unknown> {
  at: number;
  input: E;
}

export interface InputRecording<E = unknown> {
  startedAt: number;
  duration: number;
  events: readonly RecordedInputEvent<E>[];
}

export interface InputRecorder<E = unknown> {
  record(input: E, now?: number): void;
  finish(now?: number): InputRecording<E>;
  readonly recording: InputRecording<E>;
  replay(handler: (input: E) => void): void;
}

export function recordInput<E = unknown>(handler: (input: E) => void): InputRecorder<E> {
  let startedAt = 0;
  let started = false;
  let duration = 0;
  const events: RecordedInputEvent<E>[] = [];

  function snapshot(): InputRecording<E> {
    return {
      startedAt,
      duration,
      events: [...events],
    };
  }

  return {
    record(input: E, now = Date.now()): void {
      if (!started) {
        startedAt = now;
        started = true;
      }

      duration = now - startedAt;
      events.push({
        at: duration,
        input: typeof structuredClone === 'function' ? structuredClone(input) : input,
      });

      handler(input);
    },

    finish(now = Date.now()): InputRecording<E> {
      if (!started) {
        startedAt = now;
        duration = 0;
        started = true;
      } else {
        duration = now - startedAt;
      }
      return snapshot();
    },

    get recording(): InputRecording<E> {
      return snapshot();
    },

    replay(replayHandler: (input: E) => void): void {
      for (const event of events) {
        replayHandler(event.input);
      }
    },
  };
}

export function replayInput<E = unknown>(recording: InputRecording<E>, handler: (input: E) => void): void {
  for (const event of [...recording.events].sort((a, b) => a.at - b.at)) {
    handler(event.input);
  }
}
