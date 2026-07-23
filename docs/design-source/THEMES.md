# DI rail themes

The **rail colour is a per-user theme.** Ship all five. A theme only ever restyles the
**rail** (left 340px compartment) and the review accents that read off it. It **must not**
touch: the **coral nav button**, the **coral primary CTA** (Commit & sync / Review & run /
Send to agent), the **semantic verdicts** (green = keep/add, red = revert/delete), or the
deep-ocean **main canvas** (`--di-canvas #07182a`).

Implement as `<html data-di-theme="indigo">` (default) driving the `--di-rail-*` tokens.

## Palettes (exact hex)

| token | Indigo (default) | Teal | Ember | Plum | Graphite |
|-------|------|------|-------|------|----------|
| rail bg (top→bottom) | `#171f34→#111725` | `#0d2226→#0a1922` | `#1f130c→#140f0e` | `#1e1630→#150f22` | `#161c22→#10151b` |
| rail border | `#2c3a5e` | `#1d4048` | `#3a2418` | `#3a2c58` | `#2a3540` |
| top accent (l→r) | `#4a60a8→#39d3ba` | `#0e7c8c→#39d3ba` | `#f0926e→#f8bd5e` | `#8a5cc4→#39d3ba` | `#5a6b7c→#f0926e` |
| hue (accent) | `#7f92d8` | `#39d3ba` | `#f8bd5e` | `#b98fe0` | `#93a4b5` |
| title eyebrow | `#9db0e0` | `#5fe0cc` | `#e6b078` | `#b98fe0` | `#93a4b5` |
| chip bg / border | `#182036 / #34477a` | `#0e2426 / #1f4a4a` | `#1c130a / #4a3016` | `#1e162e / #473466` | `#161d24 / #313d49` |
| row bg / border | `#1c2540 / #34477a` | `#0f2a2c / #1f4a4a` | `#241608 / #4a3016` | `#241a3a / #473466` | `#1a222b / #313d49` |
| dock bg | `#121728` | `#0b1e20` | `#150f0a` | `#171029` | `#12181e` |
| "Tighten" / awaiting-active | hue | hue | hue | hue | **coral** `#f0926e` |

## Application rules
- **Rail panel** = `background: var(--di-rail-bg)`; `border-right: 1px solid var(--di-rail-border)`;
  a **3px** top bar `background: var(--di-rail-accent)` (the l→r gradient).
- **Title eyebrow** (Session/Changes/…) = `var(--di-rail-title)`.
- **Branch chip, viewport switcher, controls** = chip bg/border/hue.
- **Change rows:** *Needs you* keep the **coral** spot bar (urgency is semantic, not themed);
  *Awaiting* active row uses the theme **hue** spot bar. Row fill/border = row bg/border.
- **Commit dock / rail docks** = dock bg + rail border top.
- **Per-hunk verdicts:** Keep green, Revert red (constant); **Tighten** = theme hue (coral in
  Graphite, whose whole point is "neutral rail, one coral accent").
- **Graphite** is the restrained option: neutral graphite rail, coral as the single accent.
- **Ember** rail is warm; the **nav stays coral** (do not recolour nav to amber) so it still
  reads as the constant action affordance.
