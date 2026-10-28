// Moving through the feed, and the grid's pages, by pointer, wheel and keyboard.
// All three share one transition: the track slides one screen, then the host moves on.
interface SwipeHost {
  enabled(): boolean;
  hasPrevious(): boolean;
  move(direction: 1 | -1): void;
}

type Direction = 1 | -1;
const EASE = "cubic-bezier(.2,.7,.2,1)";
/** The drag that counts as a swipe, in pixels, at most this share of the height. */
const SWIPE_MIN = 80;
const SWIPE_SHARE = 0.15;

export function attachSwipe(main: HTMLElement, host: SwipeHost): (direction: Direction) => void {
  let moving = false;
  const track = () => main.querySelector<HTMLElement>(".feed:not(.still) .track, .pages .track");

  /** The track slides back into place. */
  const snapBack = (t: HTMLElement) => {
    t.style.transition = `transform .3s ${EASE}`;
    t.style.transform = "";
    t.addEventListener("transitionend", () => (t.style.transition = ""), { once: true });
  };

  /** The track slides one screen, then the host moves on. */
  const slide = (t: HTMLElement, dir: Direction) => {
    moving = true;
    t.style.transition = `transform .38s ${EASE}`;
    t.style.transform = `translateY(${dir === 1 ? -100 : 100}%)`;
    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true;
      moving = false;
      t.removeEventListener("transitionend", done);
      host.move(dir);
    };
    t.addEventListener("transitionend", done, { once: true });
    // The transition never fires in a hidden tab: move on anyway.
    setTimeout(done, 500);
  };

  /** A drag or a wheel turn ends: the track slides on, or back. */
  const settle = (dir: Direction | 0) => {
    const t = track();
    if (!t) return;
    const canGo = dir === 1 || (dir === -1 && host.hasPrevious());
    if (dir && canGo) slide(t, dir);
    else snapBack(t);
  };

  const go = (dir: Direction) => {
    if (!moving && host.enabled() && track()) settle(dir);
  };

  attachPointer(main, host, track, () => moving, settle);
  attachWheel(main, track, go);
  return go;
}

function attachPointer(
  main: HTMLElement,
  host: SwipeHost,
  track: () => HTMLElement | null,
  moving: () => boolean,
  settle: (dir: Direction | 0) => void,
) {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  let pointerId = -1;

  main.addEventListener("pointerdown", (ev) => {
    if (moving() || ev.button !== 0 || !track()) return;
    if ((ev.target as HTMLElement).closest("button,select,a,input,textarea")) return;
    pointerId = ev.pointerId;
    startY = ev.clientY;
    dy = 0;
    dragging = false;
  });
  main.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== pointerId || moving()) return;
    const t = track();
    if (!t) return;
    dy = ev.clientY - startY;
    if (!dragging && Math.abs(dy) < 8) return;
    if (!dragging) {
      dragging = true;
      main.setPointerCapture(pointerId);
    }
    // Nothing above the first palette: the track resists.
    const y = dy > 0 && !host.hasPrevious() ? dy * 0.3 : dy;
    t.style.transform = `translateY(${y}px)`;
  });
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    pointerId = -1;
    if (!dragging) return;
    dragging = false;
    const swipe = Math.abs(dy) > Math.min(SWIPE_MIN, main.clientHeight * SWIPE_SHARE);
    settle(swipe ? (dy < 0 ? 1 : -1) : 0);
  };
  main.addEventListener("pointerup", end);
  main.addEventListener("pointercancel", end);
}

/** Wheel turns add up until they make a step; then the wheel rests for a moment. */
function attachWheel(main: HTMLElement, track: () => HTMLElement | null, go: (dir: Direction) => void) {
  let acc = 0;
  let restUntil = 0;
  main.addEventListener(
    "wheel",
    (ev) => {
      if (!track()) return;
      ev.preventDefault();
      const now = Date.now();
      if (now < restUntil) return;
      acc += ev.deltaY;
      if (Math.abs(acc) < 60) return;
      const dir = acc > 0 ? 1 : -1;
      acc = 0;
      restUntil = now + 700;
      go(dir);
    },
    { passive: false },
  );
}
