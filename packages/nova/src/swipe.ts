import { finiteNumber, nonNegativeNumber } from './validation.js';

export interface SwipeGesture {
  gesture: 'swipe';
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
  velocity: number;
}

export interface SwipeNavigatorOpts<M = unknown> {
  threshold?: number;
  velocity?: number;
  onSwipeLeft?: () => M;
  onSwipeRight?: () => M;
  onSwipeUp?: () => M;
  onSwipeDown?: () => M;
}

export interface SwipeNavigator<M = unknown> {
  matches(gesture: SwipeGesture): boolean;
  handleSwipe(gesture: SwipeGesture): M | undefined;
}

export function createSwipeNavigator<M = unknown>(opts: SwipeNavigatorOpts<M>): SwipeNavigator<M> {
  const threshold = nonNegativeNumber(opts.threshold ?? 0, 'threshold');
  const velocity = nonNegativeNumber(opts.velocity ?? 0, 'velocity');

  function matches(gesture: SwipeGesture): boolean {
    const distance = finiteNumber(gesture.distance, 'gesture.distance');
    const gestureVelocity = finiteNumber(gesture.velocity, 'gesture.velocity');
    return gesture.gesture === 'swipe' && distance >= threshold && gestureVelocity >= velocity;
  }

  function handleSwipe(gesture: SwipeGesture): M | undefined {
    if (!matches(gesture)) {
      return undefined;
    }

    switch (gesture.direction) {
      case 'left':
        return opts.onSwipeLeft?.();
      case 'right':
        return opts.onSwipeRight?.();
      case 'up':
        return opts.onSwipeUp?.();
      case 'down':
        return opts.onSwipeDown?.();
      default:
        return undefined;
    }
  }

  return { matches, handleSwipe };
}
