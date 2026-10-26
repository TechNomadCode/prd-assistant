import "./animation-event";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no ResizeObserver, and nothing there has a size that changes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no Popover API, and its stylesheet hides every pop-over. A
// stand-in shows and hides one, from script or from a click on a button that
// names it (`popovertarget`), and fires its `toggle` event. It doesn't light
// dismiss, move focus or match `:popover-open`; the end-to-end tests check
// those in a real browser.
if (
  typeof HTMLElement !== "undefined" &&
  !("showPopover" in HTMLElement.prototype)
) {
  const shown = new WeakSet<HTMLElement>();
  const toggle = (popover: HTMLElement, show: boolean) => {
    if (shown.has(popover) === show) return;
    if (show) {
      shown.add(popover);
      popover.style.display = "block";
    } else {
      shown.delete(popover);
      popover.style.removeProperty("display");
    }
    popover.dispatchEvent(
      Object.assign(new Event("toggle"), {
        oldState: show ? "closed" : "open",
        newState: show ? "open" : "closed",
      }),
    );
  };
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      toggle(this, true);
    },
    hidePopover(this: HTMLElement) {
      toggle(this, false);
    },
    togglePopover(this: HTMLElement, force?: boolean) {
      toggle(this, force ?? !shown.has(this));
      return shown.has(this);
    },
  });
  document.addEventListener("click", (event) => {
    const invoker =
      event.target instanceof Element &&
      event.target.closest("button[popovertarget]");
    if (!invoker) return;
    const popover = document.getElementById(
      invoker.getAttribute("popovertarget") ?? "",
    );
    if (!popover) return;
    const action = invoker.getAttribute("popovertargetaction") ?? "toggle";
    toggle(
      popover,
      action === "toggle" ? !shown.has(popover) : action === "show",
    );
  });
}

afterEach(() => {
  cleanup();
  // The workspace keeps the conversation in the browser; no test inherits one.
  if (typeof window !== "undefined") window.localStorage.clear();
});
