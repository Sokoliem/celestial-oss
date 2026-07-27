/**
 * Nebula Accessibility (a11y)
 *
 * Semantic roles, screen reader announcements, ARIA attributes,
 * and focus indicator helpers for terminal UI accessibility.
 */

// ─── Roles ──────────────────────────────────────────────────────────────────

export type AriaRole =
  | 'main'
  | 'navigation'
  | 'banner'
  | 'complementary'
  | 'form'
  | 'search'
  | 'alert'
  | 'dialog'
  | 'status'
  | 'log'
  | 'list'
  | 'listitem'
  | 'menu'
  | 'menuitem'
  | 'tab'
  | 'tablist'
  | 'tabpanel'
  | 'tree'
  | 'treeitem'
  | 'button'
  | 'checkbox'
  | 'radio'
  | 'listbox'
  | 'textbox'
  | 'heading'
  | 'region'
  | 'slider'
  | 'separator'
  | 'switch'
  | 'progressbar';

const INTERACTIVE_ROLES: ReadonlySet<AriaRole> = new Set([
  'menu',
  'menuitem',
  'tab',
  'form',
  'dialog',
  'tree',
  'treeitem',
  'button',
  'checkbox',
  'radio',
  'listbox',
  'textbox',
  'slider',
  'separator',
  'switch',
]);

// ─── AriaAttrs ──────────────────────────────────────────────────────────────

export interface AriaAttrs {
  role?: AriaRole;
  label?: string;
  description?: string;
  describedBy?: string;
  live?: 'polite' | 'assertive' | 'off';
  hidden?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  level?: number;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
}

// ─── Core ARIA helpers ──────────────────────────────────────────────────────

/**
 * Create an AriaAttrs object from the provided partial attributes.
 */
export function createAria(attrs: Partial<AriaAttrs>): AriaAttrs {
  const result: AriaAttrs = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Merge two AriaAttrs objects. Override wins on conflicts.
 * If base is undefined, returns a copy of override.
 */
export function mergeAria(base: AriaAttrs | undefined, override: AriaAttrs): AriaAttrs {
  if (base === undefined) {
    return { ...override };
  }
  return { ...base, ...override };
}

/**
 * Returns true if the element described by attrs is interactive.
 *
 * Interactive roles: menu, menuitem, tab, form, dialog, tree, treeitem, button, textbox.
 * A listitem is interactive only when it has checked or selected set.
 */
export function isInteractive(attrs: AriaAttrs): boolean {
  const { role } = attrs;
  if (role === undefined) return false;

  if (INTERACTIVE_ROLES.has(role)) return true;

  if (role === 'listitem') {
    return attrs.checked !== undefined || attrs.selected !== undefined;
  }

  return false;
}

/**
 * Produce a human-readable description of the element.
 *
 * Examples:
 *   "navigation: Main Menu"
 *   "checkbox (checked): Accept terms"
 *   "banner"
 *   "element"
 */
export function describeElement(attrs: AriaAttrs): string {
  const { role, label, checked, disabled } = attrs;

  // Determine the role prefix
  if (checked !== undefined) {
    const state = checked === true ? 'checked' : checked === false ? 'unchecked' : 'mixed';
    const prefix = `checkbox (${disabled === true ? `${state}, disabled` : state})`;
    return label !== undefined ? `${prefix}: ${label}` : prefix;
  }

  if (role === undefined) {
    return label !== undefined ? label : 'element';
  }

  const prefix = disabled === true ? `${role} (disabled)` : role;
  return label !== undefined ? `${prefix}: ${label}` : prefix;
}

/**
 * Returns true if the element is a live region (polite or assertive).
 */
export function isLiveRegion(attrs: AriaAttrs): boolean {
  return attrs.live === 'polite' || attrs.live === 'assertive';
}

// ─── Semantic role helper ───────────────────────────────────────────────────

/**
 * Create a minimal AriaAttrs with the given role.
 * Shorthand for `createAria({ role: r })`.
 */
export function role(r: AriaRole): AriaAttrs {
  return { role: r };
}

// ─── ARIA attribute helpers ─────────────────────────────────────────────────

/** Set an aria-label attribute */
export function ariaLabel(label: string): AriaAttrs {
  return { label };
}

/** Set an aria-describedby attribute */
export function ariaDescribedBy(describedBy: string): AriaAttrs {
  return { describedBy };
}

/** Set an aria-live attribute */
export function ariaLive(live: 'polite' | 'assertive' | 'off'): AriaAttrs {
  return { live };
}

// ─── Screen reader announcements ────────────────────────────────────────────

export type AnnouncePriority = 'polite' | 'assertive';

export interface Announcement {
  readonly message: string;
  readonly priority: AnnouncePriority;
  readonly timestamp: number;
}

/**
 * A live region queue for screen reader announcements.
 * Announcements are queued and can be drained by the runtime
 * to surface messages to assistive technology.
 */
export interface LiveRegion {
  /** Queue an announcement */
  announce(message: string, priority?: AnnouncePriority): void;
  /** Drain all pending announcements (removes them from the queue) */
  drain(): Announcement[];
  /** Peek at pending announcements without draining */
  pending(): readonly Announcement[];
  /** Clear all pending announcements */
  clear(): void;
}

export interface AccessibilitySink {
  onFocusChange?(description: string, focusedId: string | null): void;
  onAnnouncements?(items: Announcement[]): void;
}

export interface AccessibilityRuntime {
  focusChanged(focusedId: string | null, description: string): void;
  announce(message: string, priority?: AnnouncePriority): void;
  flush(): void;
  pending(): readonly Announcement[];
  liveRegion(): LiveRegion;
}

/**
 * Create a live region queue for screen reader announcements.
 */
export function createLiveRegion(): LiveRegion {
  const queue: Announcement[] = [];

  return {
    announce(message: string, priority: AnnouncePriority = 'polite'): void {
      queue.push({ message, priority, timestamp: Date.now() });
    },
    drain(): Announcement[] {
      const items = queue.splice(0, queue.length);
      return items;
    },
    pending(): readonly Announcement[] {
      return [...queue];
    },
    clear(): void {
      queue.length = 0;
    },
  };
}

/**
 * Create an announcement function that dispatches to a LiveRegion.
 * Convenience wrapper for use in app update functions.
 */
export function announce(liveRegion: LiveRegion, message: string, priority: AnnouncePriority = 'polite'): void {
  liveRegion.announce(message, priority);
}

export function createAccessibilityRuntime(sink?: AccessibilitySink): AccessibilityRuntime {
  const region = createLiveRegion();

  return {
    focusChanged(focusedId: string | null, description: string): void {
      sink?.onFocusChange?.(description, focusedId);
    },
    announce(message: string, priority: AnnouncePriority = 'polite'): void {
      region.announce(message, priority);
    },
    flush(): void {
      const items = region.drain();
      if (items.length > 0) {
        sink?.onAnnouncements?.(items);
      }
    },
    pending(): readonly Announcement[] {
      return region.pending();
    },
    liveRegion(): LiveRegion {
      return region;
    },
  };
}

// ─── Focus indicator helpers ────────────────────────────────────────────────

export interface FocusIndicatorStyle {
  readonly char: string;
  readonly prefix: string;
  readonly suffix: string;
}

const DEFAULT_FOCUS_INDICATOR: FocusIndicatorStyle = {
  char: '▸',
  prefix: '▸ ',
  suffix: ' ◂',
};

const BRACKET_FOCUS_INDICATOR: FocusIndicatorStyle = {
  char: '[',
  prefix: '[ ',
  suffix: ' ]',
};

const ARROW_FOCUS_INDICATOR: FocusIndicatorStyle = {
  char: '→',
  prefix: '→ ',
  suffix: ' ←',
};

/**
 * Get a built-in focus indicator style.
 */
export function focusIndicator(style: 'default' | 'bracket' | 'arrow' = 'default'): FocusIndicatorStyle {
  switch (style) {
    case 'bracket':
      return BRACKET_FOCUS_INDICATOR;
    case 'arrow':
      return ARROW_FOCUS_INDICATOR;
    default:
      return DEFAULT_FOCUS_INDICATOR;
  }
}

/**
 * Apply a focus indicator to a text string.
 * Returns the original text if not focused.
 */
export function withFocusIndicator(text: string, focused: boolean, indicator: FocusIndicatorStyle = DEFAULT_FOCUS_INDICATOR): string {
  if (!focused) return text;
  return `${indicator.prefix}${text}${indicator.suffix}`;
}
