/**
 * Moves a pop-over's transform origin to the point of its box nearest what
 * opened it, so it grows from there (`--grow-from`, `.popover` in
 * `src/app/globals.css`). Called by the opener's click, before the browser
 * shows it: in the next frame, before it's painted, it's laid out where it
 * opens. Offsets leave out the scale it grows from; for the top layer's fixed
 * box they're the viewport's, as `getBoundingClientRect` gives the opener's.
 */
export function growFrom(popover: HTMLElement, opener: HTMLElement) {
  requestAnimationFrame(() => {
    if (!popover.matches(":popover-open")) return;
    const from = opener.getBoundingClientRect();
    const x = from.left + from.width / 2 - popover.offsetLeft;
    const y = from.top + from.height / 2 - popover.offsetTop;
    popover.style.setProperty(
      "--grow-from",
      `${within(x, popover.offsetWidth)}px ${within(y, popover.offsetHeight)}px`,
    );
  });
}

function within(offset: number, size: number): number {
  return Math.round(Math.min(Math.max(offset, 0), size));
}
