declare module '@celestial/aurora' {
  export interface DecayAnimation {
    tick(now: number): void;
    value(): number;
    velocity(): number;
    done(): boolean;
    stop(): void;
  }

  export interface SpringConfig<T> {
    stiffness?: number;
    damping?: number;
    precision?: number;
    from?: T;
  }

  export interface SpringAnimation<T> {
    tick(now: number): void;
    value(): T;
    done(): boolean;
    stop(): void;
  }

  export function decay(
    initial: number,
    config: {
      velocity: number;
      deceleration?: number;
      restDelta?: number;
      clamp?: readonly [number, number];
    },
  ): DecayAnimation;

  export function spring(target: number, config?: SpringConfig<number>): SpringAnimation<number>;
}
