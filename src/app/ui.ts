// The interface previews shown in feed screens and grid tiles.
import type { Entry } from "./entry.ts";
import type { Theme } from "../core/tokens.ts";
import type { Role } from "../core/palette.ts";
import { createRng } from "../core/random.ts";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const themeVars = (t: Theme) => Object.entries(t).map(([k, v]) => `--t-${k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase())}:${v}`).join(";");

/** activity bars: the days before in the series colors (alternating with 4 colors), today in the loud color, the days to come empty */
function activityBars(e: Entry): string {
  const rng = createRng(e.seed ^ 0x5bd1);
  return Array.from({ length: 7 }, (_, i) => `<i class="${i < 4 ? (i % 2 ? "past alt" : "past") : i === 4 ? "on" : ""}" style="height:${30 + rng() * 70}%"></i>`).join("");
}

const D_ICONS = {
  home: `<path d="M3 7.5 8 3l5 4.5V13H3z"/>`,
  folder: `<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>`,
  users: `<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c.5-2.3 1.8-3.4 3.5-3.4s3 1.1 3.5 3.4"/><path d="M10.5 4.2a2 2 0 0 1 0 3.8M11.5 9.8c1 .5 1.7 1.5 2 3.2"/>`,
  chart: `<path d="M3 13V8M8 13V3M13 13V6"/>`,
  gear: `<circle cx="8" cy="8" r="2.2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/>`,
};
const dIcon = (k: keyof typeof D_ICONS) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${D_ICONS[k]}</svg>`;

/** with two data series (four colors), a legend for the bars */
const seriesLegend = (t: Theme, cls: string) => t.accent2 === t.accent ? "" :
  `<div class="${cls}"><span><i style="background:var(--t-accent)"></i>Design</span><span><i style="background:var(--t-accent2)"></i>Research</span></div>`;

// Interface preview: the loud color only in small fills (main action, logo,
// badge, today's bar, toggle), its own tint as the second series, the next
// color darkened for tags with white text; cards on a calm background.
// Sized in container widths, so it reads the same as a tile and as a screen.
export function mobileUi(t: Theme, e: Entry): string {
  return `<div class="m-ui" style="${themeVars(t)}">
    <div class="m-top"><div class="m-logo">${esc(e.name[0])}</div><b>${esc(e.name.split(" & ")[0])}</b><div class="m-avatar"></div></div>
    <div class="m-card"><div class="m-label">Weekly activity</div>
      <div class="m-row"><span class="m-big">2,481</span><span class="m-badge">+12.4%</span></div>
      <div class="m-bars">${activityBars(e)}</div>${seriesLegend(t, "m-legend")}</div>
    <div class="m-pair"><span class="m-chip second">Design<b>12</b></span><span class="m-chip">Research<b>7</b></span></div>
    <ul class="m-list"><li>Notifications<span class="m-toggle"></span></li></ul>
    <div class="m-more m-projects"><div class="m-label">Projects</div><ul class="m-list">${(["companion", "anchor", "dark"] as Role[]).map((r, i) => `<li><b>${esc(e.names[r])}</b><span class="m-tag${i % 2 ? "" : " second"}">${["Design", "Research", "Launch"][i]}</span></li>`).join("")}</ul></div>
    <div class="m-more m-today"><div class="m-label">Today</div><ul class="m-list m-tasks"><li class="done"><i></i>Review the palette</li><li><i></i>Ship the new theme</li></ul></div>
    <div class="m-btns"><span class="m-btn p">Create</span><span class="m-btn o">Import</span></div>
    <div class="m-more m-tabs">${(["home", "folder", "users", "gear"] as const).map((k, i) => `<span${i ? "" : ` class="on"`}>${dIcon(k)}</span>`).join("")}</div>
  </div>`;
}

// The same interface on a wide screen, in a desktop app's sizes: navigation,
// key figures, a table of projects (named after the palette's colors) and
// settings. The colors play the same parts as on the phone.
export function desktopUi(t: Theme, e: Entry): string {
  const rng = createRng(e.seed ^ 0xd35c);
  const nav = ([["home", "Overview"], ["folder", "Projects"], ["users", "Team"], ["chart", "Reports"], ["gear", "Settings"]] as const)
    .map(([icon, label], i) => `<li${i ? "" : ` class="on"`}>${dIcon(icon)}${label}</li>`).join("");
  const tags = [["Design", "second"], ["Research", ""], ["Launch", "second"], ["Content", ""]];
  const status = ["In review", "Active", "Active", "Draft"];
  const projects = (["companion", "anchor", "light", "dark"] as Role[]).map((r, i) => {
    const done = Math.round(20 + rng() * 75);
    return `<tr><td><b>${esc(e.names[r])}</b></td><td><span class="w-tag ${tags[i][1]}">${tags[i][0]}</span></td><td class="w-muted">${status[i]}</td><td><span class="w-progress"><i style="width:${done}%"></i></span></td><td class="w-num">${done}%</td></tr>`;
  }).join("");
  const toggle = (label: string, on: boolean) => `<li>${label}<span class="w-toggle${on ? "" : " off"}"></span></li>`;
  return `<div class="w-ui" style="${themeVars(t)}">
    <div class="w-nav">
      <div class="w-brand"><div class="w-logo">${esc(e.name[0])}</div><b>${esc(e.name.split(" & ")[0])}</b></div>
      <ul>${nav}</ul>
      <div class="w-plan"><div class="w-label">Storage</div><span class="w-progress"><i style="width:72%"></i></span><div class="w-muted">7.2 of 10 GB</div></div>
    </div>
    <div class="w-main">
      <div class="w-head"><b class="w-h">Overview</b><span class="w-search">Search…</span><span class="w-btn p">Create</span><span class="w-avatar"></span></div>
      <div class="w-stats">
        <div class="w-card"><div class="w-label">Weekly activity</div><div class="w-row"><span class="w-big">2,481</span><span class="w-badge">+12.4%</span></div><div class="m-bars w-bars">${activityBars(e)}</div>${seriesLegend(t, "w-legend")}</div>
        <div class="w-card"><div class="w-label">Open tasks</div><div class="w-row"><span class="w-big">38</span><span class="w-muted">6 due today</span></div><span class="w-progress"><i style="width:64%"></i></span><div class="w-muted">64% of the sprint done</div></div>
        <div class="w-card"><div class="w-label">Team</div><div class="w-row"><span class="w-big">12</span><span class="w-muted">members</span></div><div class="w-pair"><span class="w-tag second">Design 5</span><span class="w-tag">Research 7</span></div></div>
      </div>
      <div class="w-split">
        <div class="w-card w-table"><div class="w-title">Projects<span class="w-link">View all</span></div><table>${projects}</table></div>
        <div class="w-card"><div class="w-title">Notifications</div>
          <ul class="w-list">${toggle("Mentions", true)}${toggle("Weekly report", true)}${toggle("Product news", false)}</ul>
          <div class="w-btns"><span class="w-btn p">Save</span><span class="w-btn o">Cancel</span></div></div>
      </div>
    </div>
  </div>`;
}

