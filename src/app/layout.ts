// Layout that depends on the viewport and on measured elements.
import { state, type Mode } from "./state.ts";

/** A wide screen has the sidebar, so Details is not a mode of its own there. */
export const isWide = () => window.matchMedia("(min-width: 980px)").matches;

/** The mode in effect: Details only on a phone. */
export function modeInEffect(): Mode {
  return state.mode === "details" && isWide() ? "shapes" : state.mode;
}

/** The artwork starts below the title, like on a plate. The title's height depends on its lines. */
export function placeArt() {
  document.querySelectorAll<HTMLElement>(".screen.shapes").forEach((screen) => {
    const h1 = screen.querySelector<HTMLElement>(".name")!;
    screen.style.setProperty("--art-top", `${h1.offsetTop + h1.offsetHeight + 56}px`);
  });
}

/** The phone interface on a screen shows its extra blocks as far as they fit, the last one first to go. */
export function fitUi() {
  document.querySelectorAll<HTMLElement>(".screen.ui .ui-wrap .m-ui").forEach((ui) => {
    const extra = [...ui.querySelectorAll<HTMLElement>(".m-projects, .m-today")];
    extra.forEach((x) => (x.hidden = false));
    for (const x of extra.reverse()) {
      if (ui.scrollHeight <= ui.clientHeight + 1) break;
      x.hidden = true;
    }
  });
}
