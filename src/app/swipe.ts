// Pointer, wheel, and keyboard navigation share one transition controller.
interface SwipeHost {
  enabled(): boolean;
  hasPrevious(): boolean;
  move(direction: 1 | -1): void;
}

export function attachSwipe(main: HTMLElement, host: SwipeHost): (direction: 1 | -1) => void {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  let moving = false;
  let pointerId = -1;
  const track = () => main.querySelector<HTMLElement>(".feed:not(.still) .track");

  const settle = (dir: 1 | -1 | 0) => {
    const t = track();
    if (!t) return;
    const canGo = dir === 1 || (dir === -1 && host.hasPrevious());
    if (!dir || !canGo) {
      t.style.transition = "transform .3s cubic-bezier(.2,.7,.2,1)";
      t.style.transform = "";
      t.addEventListener("transitionend", () => { t.style.transition = ""; }, { once: true });
      return;
    }
    moving = true;
    t.style.transition = "transform .38s cubic-bezier(.2,.7,.2,1)";
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
    // if the transition never fires (hidden tab), still move on
    setTimeout(done, 500);
  };
  const go = (dir: 1 | -1) => { if (!moving && host.enabled() && track()) settle(dir); };

  main.addEventListener("pointerdown", (ev) => {
    if (moving || ev.button !== 0 || !track()) return;
    if ((ev.target as HTMLElement).closest("button,select,a,input,textarea")) return;
    pointerId = ev.pointerId;
    startY = ev.clientY;
    dy = 0;
    dragging = false;
  });
  main.addEventListener("pointermove", (ev) => {
    if (ev.pointerId !== pointerId || moving) return;
    const t = track();
    if (!t) return;
    dy = ev.clientY - startY;
    if (!dragging && Math.abs(dy) < 8) return;
    if (!dragging) { dragging = true; main.setPointerCapture(pointerId); }
    // nothing above the first palette: resist
    const y = dy > 0 && !host.hasPrevious() ? dy * 0.3 : dy;
    t.style.transform = `translateY(${y}px)`;
  });
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    pointerId = -1;
    if (!dragging) return;
    dragging = false;
    const h = main.clientHeight;
    settle(Math.abs(dy) > Math.min(80, h * 0.15) ? (dy < 0 ? 1 : -1) : 0);
  };
  main.addEventListener("pointerup", end);
  main.addEventListener("pointercancel", end);

  let wheelAcc = 0;
  let wheelLock = 0;
  main.addEventListener("wheel", (ev) => {
    if (!track()) return;
    ev.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelAcc += ev.deltaY;
    if (Math.abs(wheelAcc) < 60) return;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    wheelLock = now + 700;
    go(dir);
  }, { passive: false });

  return go;
}
