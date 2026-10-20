// jsdom has no AnimationEvent, so React listens for a vendor-prefixed
// animation end there and `fireEvent.animationEnd` never reaches
// `onAnimationEnd` (react-dom's `getVendorPrefixedEventName`). Defined before
// React loads, it makes React listen for `animationend`, as in browsers:
// imported first in `setup.ts`.
globalThis.AnimationEvent ??= class AnimationEvent extends Event {
  readonly animationName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;

  constructor(type: string, init: AnimationEventInit = {}) {
    super(type, init);
    this.animationName = init.animationName ?? "";
    this.elapsedTime = init.elapsedTime ?? 0;
    this.pseudoElement = init.pseudoElement ?? "";
  }
};
