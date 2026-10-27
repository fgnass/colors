let timer = 0;

/** A short message at the bottom of the screen. */
export function toast(msg: string) {
  const t = document.querySelector(".toast")!;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(timer);
  timer = window.setTimeout(() => t.classList.remove("show"), 1300);
}
