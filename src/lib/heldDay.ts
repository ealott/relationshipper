import { useRef, useState } from 'preact/hooks';

/** Whether the cursor is in a text box inside `selector`: someone is typing there. */
export function typingIn(selector: string): boolean {
  const el = document.activeElement;
  return Boolean(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && el.closest(selector));
}

/**
 * Pages that show "today" refresh in the background, so after midnight they'd swap in the new
 * day. When that happens while you're writing (`writing` says so for the day on screen), this
 * keeps that day on screen until you choose to move on. Nothing you're writing gets swept away.
 */
export function useHeldDay<T extends { day: string }>(latest: T | undefined, writing: (shown: T) => boolean) {
  const shown = useRef<T | undefined>(latest);
  const holding = useRef(false);
  const [, rerender] = useState(0);
  const current = shown.current;
  if (latest && (!current || latest.day === current.day)) {
    shown.current = latest;
    holding.current = false;
  } else if (latest && current && !holding.current) {
    if (writing(current)) holding.current = true;
    else shown.current = latest;
  }
  return {
    shown: shown.current,
    /** An earlier day is on screen, and `latest` is the new one. */
    holding: holding.current,
    moveOn() {
      shown.current = latest;
      holding.current = false;
      rerender((n) => n + 1);
    },
    /** The day on screen changed (say, you saved your answer to it). */
    update(next: T) {
      shown.current = next;
      rerender((n) => n + 1);
    },
  };
}
