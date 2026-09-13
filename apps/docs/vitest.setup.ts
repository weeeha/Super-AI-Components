import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

import { clearResizeObservers, installResizeObserver } from "./test/resize-observer";

/**
 * jsdom ships no ResizeObserver and reports every element as 0x0.
 *
 * This was a passive three-no-op stub, which is all that components merely
 * constructing an observer ever needed. P2 `detail-view-shell` measures its own
 * container to choose one column or two, so its tests have to *drive* a width —
 * hence the controllable implementation, which records live observers and lets
 * a test push a width into their callbacks.
 *
 * Behaviour-compatible with the stub it replaces: it fires only when a test
 * calls `resizeTo`, so every existing test sees the same never-fires observer
 * it saw before.
 */
installResizeObserver();

afterEach(clearResizeObservers);
/**
 * Base UI's animation handling, made deterministic under jsdom. Two settings,
 * and they only work as a pair.
 *
 * `BASE_UI_ANIMATIONS_DISABLED` is the library's own documented switch ("disables
 * animation-related code, even if supported by the runtime environment",
 * `@base-ui/react/global.d.ts`). `useAnimationsFinished` reads it first and calls
 * its callback **synchronously**; without it, the callback is deferred to a
 * microtask via `Promise.all(...).then(flushSync)`. That timing is load-bearing
 * for this suite: seven tests across `whats-new`, `tool-panel`, `settings-dialog`
 * and `selection-toolbar` assert the DOM straight after a `user.click` that swaps
 * a panel, and on the async path they see the outgoing panel still mounted.
 *
 * The flag alone is not enough, because it only guards `useAnimationsFinished`.
 * `ScrollAreaViewport` calls `viewport.getAnimations({ subtree: true })` directly
 * on a timer, and jsdom implements no Web Animations API, so that call throws.
 * It lands *after* the test that triggered it has resolved, which makes it an
 * unhandled exception that fails the run while every assertion in it passes —
 * and whether it fires at all is a function of suite length, not of what the
 * component does. C2 `suggestion-chips` is short enough to escape it; a shell's
 * suite is not.
 *
 * So: the stub keeps the direct call from throwing (it returns no animations, so
 * the viewport takes its own `length === 0` early return), and the flag keeps
 * every `useAnimationsFinished` caller on the synchronous path it had before the
 * stub existed. Removing either one breaks something: drop the stub and the
 * ScrollArea suites exit 1 with green assertions, drop the flag and those seven
 * panel tests fail.
 */
(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;
window.Element.prototype.getAnimations ??= () => [];
window.HTMLElement.prototype.scrollIntoView ??= () => {};
window.HTMLElement.prototype.hasPointerCapture ??= () => false;
window.HTMLElement.prototype.setPointerCapture ??= () => {};
window.HTMLElement.prototype.releasePointerCapture ??= () => {};
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

/**
 * localStorage polyfill.
 *
 * Node 26 ships its own `localStorage` global that is inert unless the process
 * gets `--localstorage-file`, and it shadows the one jsdom would otherwise
 * provide — so `window.localStorage` is undefined here and every read of it
 * throws. Nothing in the registry needed storage until the `use-view-mode`
 * contract, which is why this is only appearing now.
 *
 * The implementation is installed on `Storage.prototype` rather than as a
 * plain object literal, so `vi.spyOn(Storage.prototype, "setItem")` still
 * intercepts it — the storage-denied and storage-full paths are tested that
 * way, and a literal would leave those tests silently exercising nothing.
 */
if (typeof window !== "undefined" && !window.localStorage) {
  const StorageCtor: { prototype: Storage } =
    (globalThis as { Storage?: { prototype: Storage } }).Storage ?? (class Storage {} as never);
  (globalThis as { Storage?: unknown }).Storage ??= StorageCtor;

  const backing = new Map<string, string>();
  const proto = StorageCtor.prototype as unknown as Record<string, unknown>;

  proto.getItem = (key: string) => (backing.has(String(key)) ? backing.get(String(key))! : null);
  proto.setItem = (key: string, value: string) => void backing.set(String(key), String(value));
  proto.removeItem = (key: string) => void backing.delete(String(key));
  proto.clear = () => backing.clear();
  proto.key = (index: number) => [...backing.keys()][index] ?? null;
  Object.defineProperty(proto, "length", { get: () => backing.size, configurable: true });

  Object.defineProperty(window, "localStorage", {
    value: Object.create(proto),
    configurable: true,
    writable: true,
  });
}

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;
