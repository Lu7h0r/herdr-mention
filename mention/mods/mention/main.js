// Mention: write a message, @-mention one or more panes of the shown space, Enter sends it.
// A working pane gets the message when its turn ends (hc wait, then hc send); a blocked pane
// is never typed over. Panes of other spaces are not offered.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { agents, closeOverlay, exec, focused, hc, notify, props, shared, spaces, theme } from "herdr";

const WORD = { blocked: "needs you", done: "free", working: "working", idle: "free" };
const ORDER = { idle: 0, done: 1, working: 2, blocked: 3 };
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const MAX_ROWS = 6;

function baseName(a) {
  return a.pane_name ?? a.tab_name ?? a.address;
}

/** The pane's name; when two panes of the space share one, the program tells them apart. */
function paneName(a) {
  const base = baseName(a);
  const twins = agents().filter((x) => x.space === a.space && baseName(x) === base);
  return twins.length > 1 ? `${base} · ${a.program?.name ?? a.app ?? a.address}` : base;
}

/** Agents of one space (or of every space and machine when space is null), free first. */
function candidates(space) {
  return agents().filter((a) => space === null || a.space === space)
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || paneName(a).localeCompare(paneName(b)));
}

/** The space's Kolczyk icon when it has one, else Herdr's colored monogram. */
function spaceIcon(space, name, size, t) {
  const k = (shared("kolczyk.spaces") ?? {})[space];
  const radius = k?.shape === "circle" ? size / 2 : k?.shape === "square" ? 0 : size * 0.24;
  const box = h_flex().size(size).flex_none().items_center().justify_center().rounded(radius).overflow_hidden();
  if (k?.kind === "image" && /^assets\/kolczyk\/[a-f0-9]+\.(svg|png)$/i.test(k.image ?? "")) {
    return box.when(Boolean(k.background), (el) => el.bg(k.background)).child(image(k.image).size(size * 0.78));
  }
  if (k?.kind === "lucide" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k.name ?? "")) {
    const dir = k.library === "lucide" || !k.library ? "icons" : `icons-${k.library}`;
    return box.when(Boolean(k.background), (el) => el.bg(k.background))
      .child(svg(`mods/kolczyk/${dir}/${k.name}.svg`).size(size * 0.68).text_color(k.color ?? t.accent));
  }
  if (k?.kind === "emoji" && k.emoji) {
    return box.when(Boolean(k.background), (el) => el.bg(k.background)).child(div().text_size(size * 0.58).child(k.emoji));
  }
  if (k?.kind === "monogram" && k.text) {
    return box.when(Boolean(k.background), (el) => el.bg(k.background))
      .child(div().text_size(size * 0.43).font_semibold().text_color(k.color ?? t.foreground).child(String(k.text).toUpperCase()));
  }
  const color = (shared("space.colors") ?? {})[space] ?? "ansi6";
  const fill = color.startsWith("#") ? color : MARK[color] ?? t[color] ?? t.accent;
  return box.bg(fill).text_size(size * 0.55).font_bold().text_color("#ffffff").child([...String(name ?? "")][0]?.toUpperCase() ?? "?");
}

/** Free (idle or finished) is green, working is the theme's, blocked is red. */
function statusColor(a, t) {
  if (a.status === "idle" || a.status === "done") return "#3fae6a";
  return t[a.status] ?? t.muted;
}

function programIcon(a, size, t) {
  const p = a.program;
  if (!p?.icon) return div().size(size).flex_none();
  return (p.tint ? svg(p.icon).text_color(t.muted) : image(p.icon)).size(size).flex_none();
}

export default class Mention extends View {
  init(_props, cx) {
    this.space = focused()?.space ?? spaces().find((s) => s.active)?.id ?? null;
    this.spaceName = spaces().find((s) => s.id === this.space)?.name ?? "";
    this.targets = new Map();   // address -> agent, one per chip in the input
    this.sel = 0;
    this.query = null;          // text after the "@" being typed, null when no picker
    this.wide = false;          // "@@": every space and machine, not only the shown space
    this.range = null;          // where that "@query" sits in the input
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "@pane  what to send" });
    this.input.on("change", (_e, cx) => { this.scan(); cx.notify(); });
    this.input.on("submit", (_e, cx) => { this.enter(cx); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  /** Finds an "@query" ending at the cursor; that opens the picker. */
  scan() {
    const text = this.input.value();
    const cursor = this.input.selected_range().end;
    const before = text.slice(0, cursor);
    const m = /(@@?)([^\s@]*)$/.exec(before);
    if (!m) { this.query = null; this.range = null; return; }
    const start = cursor - m[2].length - m[1].length;
    const same = this.query !== null && this.range?.start === start;
    this.wide = m[1] === "@@";   // "@@" offers every space and machine
    this.query = m[2].toLowerCase();
    this.range = { start, end: cursor };
    if (!same) this.sel = 0;
  }

  matches() {
    if (this.query === null) return [];
    const q = this.query;
    return candidates(this.wide ? null : this.space).filter((a) => !this.targets.has(a.address))
      .filter((a) => !q || paneName(a).toLowerCase().includes(q) || a.space_name.toLowerCase().includes(q) || a.address.toLowerCase().startsWith(q))
      .slice(0, MAX_ROWS);
  }

  pick(a, cx) {
    if (!a || !this.range) return;
    this.targets.set(a.address, a);
    const label = a.space === this.space ? paneName(a) : `${paneName(a)} · ${a.space_name}`;
    this.input.replace_range_with_token(this.range, { id: a.address, text: `@${label} `, label });
    this.query = null;
    this.range = null;
    this.sel = 0;
    cx.notify();
  }

  /** A click on a footer chip: mention that pane where the cursor is. */
  mentionNow(a, cx) {
    if (this.targets.has(a.address)) return;
    const r = this.input.selected_range();
    this.range = { start: r.start, end: r.end };
    this.pick(a, cx);
    this.input.focus();
  }

  enter(cx) {
    const rows = this.matches();
    if (this.query !== null && rows.length) return this.pick(rows[this.sel] ?? rows[0], cx);
    this.send(cx);
  }

  /** The message without the chips, and the chips' agents. */
  compose() {
    const content = this.input.content();
    const spans = content.tokens.slice().sort((x, y) => y.range.start - x.range.start);
    let text = content.text;
    const chosen = [];
    for (const s of spans) {
      text = text.slice(0, s.range.start) + text.slice(s.range.end);
      const a = this.targets.get(s.token.id);
      if (a && !chosen.includes(a)) chosen.unshift(a);
    }
    return { text: text.replace(/\s+/g, " ").trim(), chosen };
  }

  send(cx) {
    if (this.busy) return;
    const { text, chosen } = this.compose();
    if (!chosen.length) { this.hint = "Type @ to pick a pane"; cx.notify(); return; }
    if (!text) { this.hint = "Nothing to send"; cx.notify(); return; }
    this.busy = true;
    this.hint = `Sending to ${chosen.map(paneName).join(", ")}`;
    cx.notify();
    // Deliver before closing: a closed mod copy cancels its pending calls.
    cx.spawn(async () => {
      await Promise.all(chosen.map((a) => deliver(a, text)));
      this.dismiss();
    });
  }

  move(d, cx) {
    const n = this.matches().length;
    if (n) this.sel = (this.sel + d + n) % n;
    cx.notify();
  }

  key(e, cx) {
    const k = e.key;
    if (k === "escape") { cx.stop_propagation(); return this.dismiss(); }
    if (this.query === null) return;
    if (k === "down" || k === "tab") { cx.stop_propagation(); return this.move(1, cx); }
    if (k === "up" || k === "shift-tab") { cx.stop_propagation(); return this.move(-1, cx); }
  }

  render() {
    const t = theme();
    const rows = this.matches();
    if (this.sel >= rows.length) this.sel = Math.max(0, rows.length - 1);
    const all = candidates(this.space);
    const chip = (ctx) => {
      const a = this.targets.get(ctx.token.id);
      return h_flex().h(ctx.line_height - 4).px(6).gap(5).items_center().rounded(6)
        .bg(ctx.selected ? t.accent : t.selected).text_color(ctx.selected ? t.solid_foreground ?? t.foreground : t.foreground)
        .when(Boolean(a), (el) => el.child(programIcon(a, 12, t)))
        .child(div().text_size(11.5).font_medium().child(ctx.token.label ?? ctx.token.text));
    };
    return v_flex().id("mention").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .p(14).gap(10).bg(t.popover).text_color(t.foreground).text_size(12)
      .child(h_flex().justify_between().items_center()
        .child(h_flex().gap(8).items_center()
          .child(svg("mods/mention/at-sign.svg").size(14).text_color(t.accent))
          .child(div().font_semibold().child("Mention a pane"))
          .child(div().text_color(t.dim).child("·"))
          .child(spaceIcon(this.space, this.spaceName, 16, t))
          .child(div().text_color(t.muted).child(this.spaceName)))
        .child(div().text_color(t.muted).child("@ here · @@ everywhere · Enter send · Esc")))
      .child(Input.new(this.input).token(chip).h(38).px(10).rounded(9).border_1()
        .border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .when(this.query !== null, (el) => el.child(v_flex().gap(2)
        .when(rows.length === 0, (el) => el.child(div().p(10).text_color(t.muted)
          .child(this.wide ? "No agent matches anywhere" : all.length ? "No pane matches here" : "No agent in this space; try @@")))
        .children(rows.map((a, i) => {
          const color = statusColor(a, t);
          return h_flex().id(`mn-${a.address}`).h(36).flex_none().px(10).gap(10).items_center().rounded(6)
            .bg(i === this.sel ? t.selected : "#00000000").hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.pick(a, cx))
            .child(this.wide ? spaceIcon(a.space, a.space_name, 16, t) : programIcon(a, 16, t))
            .child(v_flex().flex_1().min_w(0)
              .child(div().truncate().font_medium().child(paneName(a)))
              .child(div().truncate().text_size(11).text_color(t.dim)
                .child(this.wide ? `${a.space_name} · ${a.program?.name ?? "agent"} · ${a.address}` : `${a.program?.name ?? "agent"} · ${a.address}`)))
            .child(h_flex().gap(6).items_center().flex_none()
              .child(div().size(7).rounded(4).bg(color).when(a.status === "blocked", (el) => el.loop("opacity", { from: 0.3, to: 1, period: 900 })))
              .child(div().text_size(11).text_color(color).child(WORD[a.status] ?? a.status)));
        }))))
      .when(this.query === null, (el) => el.child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_size(11).text_color(t.dim).child(this.hint ?? `${all.length} agent${all.length === 1 ? "" : "s"} here:`))
        .children(this.hint ? [] : all.map((a) => {
          const picked = this.targets.has(a.address);
          return h_flex().id(`mf-${a.address}`).gap(5).items_center().px(7).h(22).rounded(6)
            .bg(picked ? t.selected : t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.mentionNow(a, cx))
            .child(programIcon(a, 12, t))
            .child(div().size(6).rounded(3).bg(statusColor(a, t)))
            .child(div().text_size(11).text_color(picked ? t.foreground : t.muted).child(paneName(a)));
        }))));
  }
}

/** Sends now when the pane is free, after its turn when it is working, never when it is blocked. */
async function deliver(a, text) {
  const name = paneName(a);
  const icon = a.program?.icon ?? undefined;
  const live = agents().find((x) => x.address === a.address) ?? a;
  if (live.status === "blocked") {
    notify({ title: `${name} is waiting on you`, body: "Answer it first; nothing was sent.", level: "warning", icon });
    return;
  }
  if (live.status === "working") {
    // hc() is capped at 30 s, so the wait runs detached in the shell: hc wait, then hc send.
    const r = await exec("/bin/sh", ["-c", 'nohup /bin/sh -c \'hc wait "$0" >/dev/null 2>&1; hc send "$0" "$1" >/dev/null 2>&1\' "$1" "$2" >/dev/null 2>&1 &', "mention", a.address, text]);
    if (r.code === 0) notify({ title: `Queued for ${name}`, body: "It gets the message when its turn ends.", level: "info", icon, timeout: 4000 });
    else notify({ title: `${name}: could not queue`, body: (r.stderr || r.stdout || "").trim().slice(0, 200), level: "error", icon });
    return;
  }
  const r = await hc(["send", a.address, text]);
  if (r.code === 0) notify({ title: `Sent to ${name}`, body: text.slice(0, 120), level: "success", icon, timeout: 3000 });
  else notify({ title: `${name}: not sent`, body: (r.stderr || r.stdout || "").trim().slice(0, 200), level: "error", icon });
}
