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
  const threshold = opts.threshold ?? 0;
  const velocity = opts.velocity ?? 0;

  function matches(gesture: SwipeGesture): boolean {
    return gesture.gesture === 'swipe' && gesture.distance >= threshold && gesture.velocity >= velocity;
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
