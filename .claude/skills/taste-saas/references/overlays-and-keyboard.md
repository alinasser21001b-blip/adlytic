# Overlays + keyboard model

> Read when: building Cmd+K, wrapping a dialog primitive, or wiring keyboard shortcuts.

## Stable anchor on growth — the universal overlay rule

Every overlay that holds growable content (modal with auto-resize textarea, popover with a filterable list, sheet that paginates) **MUST anchor on one edge** so its position doesn't shift when content grows. The eye locks onto the anchored edge as a stable reference; without one, every keystroke or item-add re-centers the overlay and reads as "jumpy".

Pick one anchor per overlay shape:

| Overlay | Anchor edge | Why |
|---|---|---|
| **Modal** (Dialog) | **TOP** at `top: 15vh`. NOT `top: 50%; translate-y: -50%` (vertical center). | Modals open with focus at the top (title / first input); user is looking there. Center moves every time the body grows. |
| **Sheet** (slide-in) | **RIGHT + TOP + BOTTOM** — sheet fills the stage height. Growth goes inside via internal scroll. | Sheet's whole point is to be a stable read surface |
| **Popover** anchored to a trigger | **TRIGGER edge** (Radix `side`/`align` props). Growth pushes away from the trigger, never toward it. | The trigger IS the user's last touch point |
| **Cmd+K palette** | **TOP** at `top: 15vh`. Same as modal. Long result list scrolls inside, palette itself doesn't grow. | User just typed; eye is at the top input |

**Growable element inside the overlay** needs its own discipline so the growth animates smoothly:

1. **Set `height` in pixels** (not `auto`) — `auto → auto` doesn't animate.
2. **`transition: height var(--dur-quick) ease-out`** so size changes are continuous, not frame-stepped.
3. **Cap at a max** (~14 lines for textareas, ~6–8 items for popover lists). After the cap, the inner element scrolls instead of pushing the overlay around.
4. **Auto-resize via ref + `scrollHeight`** for textareas; via measured-children for lists.

```tsx
const ref = React.useRef<HTMLTextAreaElement | null>(null);
const MAX_PX = 14 * 22; // 14 lines × line-height
const resize = () => {
  const el = ref.current;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_PX)}px`;
  el.style.overflowY = el.scrollHeight > MAX_PX ? "auto" : "hidden";
};
React.useEffect(() => { resize(); }, [value]);

<textarea ref={ref} value={value} onChange={...} rows={1}
  style={{ transition: "height var(--dur-quick) ease-out" }} />
```

Same shape for growable lists (cmdk results, filter chip suggestions, autocomplete): measure children → set parent `height` in px → cap → transition.

## Cold-starting a new component — always reference the existing system

Before writing a new primitive (Sheet, Drawer, ContextMenu, Combobox, custom Toast, etc.), **read the existing primitives in `src/components/ui/`** and copy their conventions wholesale. The mistakes happen at cold start:

- Native `<select>` slipping into a form — banned, see `references/forms.md` *Form controls — closed primitive set*.
- A custom button with its own padding/height that doesn't match the project's `<Button>` primitive.
- A modal that uses `bg-black/50` backdrop because shadcn's example does — this skill uses a **fully transparent backdrop** (`bg-transparent`) for ALL overlays. Modal + sheet + popover all rely on their own shadow + border + the `--bg` surface contrast for visual separation. A dimmed backdrop covers the sidebar / footer / chrome and reads as "gui occlusion" — the user sees `bg-fg/20` over their nav and asks "what's broken?". Wireless first principle: no extra layer on top of an already-quiet stage.
- A popover with its own border / shadow that doesn't match `<PopoverContent>`.
- A new icon family beside the project's chosen one (lucide etc.) — even one stray Phosphor icon stands out.

**The check before shipping a new component:**

1. Read the closest existing peer (`dropdown-menu.tsx` for menus, `dialog.tsx` for dialogs, `primitives.tsx` for buttons / popovers / checkboxes).
2. Match its color tokens, height tokens, padding tokens, transition tokens, focus-ring treatment, ARIA model.
3. Match its file structure (forwardRef'd named exports, `cn()` for classnames, primitive name re-exports at top).
4. Run a visual side-by-side at the same nominal size — the new component and an existing peer should look like they came from the same kit.

Anything that doesn't match is debt: future maintainers will spend a half-day reconciling later. It's cheaper to copy a 20-line stylistic convention now than to refactor a one-off later.

## Keyboard contracts (the chord table)

These are the bindings the rest of the skill assumes exist. Wire all of them — discoverability of one (`?`) implies the others work.

| Chord | Where | What it does |
|---|---|---|
| `Cmd+K` / `Ctrl+K` | Global | Toggle command palette |
| `g` + letter | Global (1.5 s arm window) | Navigate — `g a` → /agents, `g s` → /sessions, `g d` → /dashboard |
| `↑` / `↓` | Inside palette | Move focused item |
| `Enter` | Inside palette | Fire focused item |
| `Cmd+Enter` | Inside palette | Open focused item in new tab |
| `Esc` | Any overlay | Close, discard changes |
| `I` | Focused row on a list page | Open inline Triage panel |
| `E` | Focused row | Edit row |
| `Space` | Focused row | Select row |
| `Tab` / `Shift+Tab` | Inside Triage panel | Move between fields |
| `Enter` (last field) | Inside Triage panel | Save + close + move to next row |
| `Cmd/Ctrl+Enter` | Inside Triage panel | Save + close + stay on same row |
| `/` | Inside textarea | Open slash-command popover |
| `?` (Shift+/) | Any list page | Open searchable shortcuts overlay |

**Universal rules.**

- Bind `Cmd+K` **and** `Ctrl+K` (`e.metaKey || e.ctrlKey`). Half your users are on Windows.
- Never bind a chord that shadows a browser default — no `Cmd+S`, no `Cmd+I` (italic), no `Ctrl+I` (page info). Use bare keys for in-page shortcuts.
- Every binding must skip when the user is typing in an `<input>` / `<textarea>`. Otherwise pressing `i` in a search field opens the Triage panel.
- Use a `useChordKeybinding` hook with a 1.5 s timeout between keys for `g+letter`. Display the chord on the right of each Navigate row in Cmd+K so users learn it.
- Motion respects `prefers-reduced-motion` — no slide-down on overlay open if reduced.

---

## Modal primitive wrapper

Every dialog goes through one wrapper component your app owns — never call the lib primitive directly. The wrapper enforces a fixed shape:

- **Header:** title + optional subtitle, fixed height, never scrolls.
- **Body:** scrolling middle, used when content exceeds viewport.
- **Footer (optional):** rendered only when caller passes one (no empty bordered band at the bottom).
- **Outer:** `max-h-[85vh]` so the modal never exceeds the viewport — mobile or short windows.
- **Width:** set by the caller, not the primitive's default. Every primitive ships an opinionated default (24 rem in shadcn, 28 rem in Mantine) — your wrapper overrides it.

### When NOT to use Modal — use Sheet instead

Modal is for **submitting / committing data** — short forms, confirmations, "do this discrete thing". The user is producing input, not consuming context. If the user is instead **viewing more about a row without leaving the list** (Linear's issue preview, Notion's page preview, expand-a-chart), that's a Sheet, not a Modal. Sheet slides in beside the page (no backdrop dim), keeps the list readable, and supports an "expand to fullscreen route" affordance. Full decision table + geometry + STOP rules → `references/sheets.md`.

### The shadcn trap

shadcn ships `sm:max-w-sm` (24 rem) baked into `<DialogContent>`'s base className. At sm+ viewports it silently overrides every `max-w-lg` you pass. The fix: prepend `!` to the chosen Tailwind class so it lifts over the baked-in cap. Tailwind JIT can't see `!${maxWidth}` at build time, so you safelist the literal `!max-w-*` strings in a comment near the wrapper.

### Reference impl (shadcn)

```tsx
import { type JSX, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Tailwind JIT safelist — literal strings the bundler needs to see.
// Modal picks one at runtime via `${"!"}${maxWidth}`. Lifts over
// shadcn's baked-in `sm:max-w-sm` (24 rem) cap. Add entries when a
// caller starts passing a wider value.
//
// !max-w-sm !max-w-md !max-w-lg !max-w-xl !max-w-2xl !max-w-3xl !max-w-4xl

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Tailwind max-width class WITHOUT the `!` prefix. Default: max-w-lg. */
  maxWidth?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  open, onClose, title, subtitle,
  maxWidth = "max-w-lg",
  children, footer,
}: ModalProps): JSX.Element {
  // Strip stray `!` from caller for back-compat, then apply our own —
  // guarantees exactly one `!` in the final class.
  const widthClass = `!${maxWidth.replace(/^!/, "")}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn(
        "max-h-[85vh] flex flex-col gap-0 p-0",
        widthClass,
      )}>
        <DialogHeader className="px-6 py-4 gap-1">
          <DialogTitle className="text-lg font-semibold font-display truncate">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-sm text-fg-muted">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && (
          <DialogFooter className="m-0 px-6 py-4 bg-transparent rounded-none sm:justify-end gap-3">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Layout invariants (universal across primitives)

- Header: `px-6 py-4` — fixed, never scrolls. **NO `border-b`** (wireless: separate with whitespace and content hierarchy, not lines).
- Body: `flex-1 overflow-y-auto px-6 py-4`.
- Footer: only when `footer` prop set. `px-6 py-4`. **NO `border-t`** for the same reason.
- `gap-0 p-0` on the content element — manage internal padding yourself; primitive defaults conflict.

> **Wireless first principle.** Modal header, footer, sheet header, popover sections, sidebar groups — none of them use `border-b` / `border-t` to separate from adjacent content. Use whitespace + content hierarchy (a heading IS a section break; a button row IS the footer cue). Modals overlay the viewport in every archetype (A/B/C/D); they don't sit on the page chrome. Adding lines inside an overlay reads as "form" not "console". The ONE legitimate use of a divider is between fundamentally different surfaces (a settings section card's own border, a destructive footer in a "Danger zone" card). See `references/settings-pages.md` for the exception.

### Common widths

| Class | Pixels | Use |
|---|---|---|
| `max-w-md` | 448 | Single-input prompts (rename, delete confirm) |
| `max-w-lg` | 512 | Default — forms with 3-5 fields |
| `max-w-2xl` | 672 | Rich content, code, side-by-side |
| `max-w-4xl` | 896 | Visualization, file picker, multi-step wizard |

### Primitive escape hatches (side-by-side)

| Lib | Built-in default width | How to override |
|---|---|---|
| shadcn Dialog | `sm:max-w-sm` (24 rem) | Class string with `!` prefix; safelist literal `!max-w-*` strings (see ref impl) |
| Mantine Modal | semantic sizes (`"lg"`, `"xl"`) | `size="auto"` + `styles={{ content: { maxWidth, maxHeight: "85vh", ... } }}` |
| Headless UI Dialog | none built in | You provide all sizing via your own classes — no override needed |
| Park UI / Ark UI | data-attribute styling | Configure in your token file |

### Mantine equivalent

```tsx
import { Modal as MantineModal } from "@mantine/core";

export function Modal({ open, onClose, title, subtitle, maxWidth = 512, children, footer }) {
  return (
    <MantineModal opened={open} onClose={onClose} size="auto"
      styles={{ content: { maxWidth, maxHeight: "85vh", display: "flex", flexDirection: "column" },
                body: { flex: 1, overflowY: "auto", padding: "1rem 1.5rem" } }}
      title={<div><div style={{ fontWeight: 600 }}>{title}</div>{subtitle && <div style={{ fontSize: 13, opacity: 0.6 }}>{subtitle}</div>}</div>}>
      {children}
      {footer && <div style={{ borderTop: "1px solid var(--mantine-color-default-border)", padding: "1rem 1.5rem", display: "flex", gap: 12, justifyContent: "flex-end" }}>{footer}</div>}
    </MantineModal>
  );
}
```

---

## Command palette (Cmd+K)

Uses the Modal wrapper above (shadcn's `<CommandDialog>` is itself a Radix Dialog wrapper; same shape rules apply). **Mounted once in `AppShell`** — state persists across route changes, never a per-page concern.

### Four sections, in this order

1. **Recent** (4-6 items) — `localStorage` ring buffer of the last entities the user opened. Top of the list because it's the highest-hit-rate use. Shows entity name + breadcrumb / parent.
2. **Quick actions** — verb-first: `New session`, `New API key`, `Invite teammate`, `Switch tenant`, `Toggle theme`, `Sign out`. Each is one-shot — opens a modal, fires a mutation, or navigates with intent.
3. **Navigate** — every route in the sidebar, callable by name. `Agents`, `Sessions`, `Dashboard`, `Settings → Members`. Show the matching `g+letter` chord on the right of each row.
4. **Search** — when input has ≥ 2 chars, fan out to search endpoints in parallel; show entity results inline. Row: icon, name, type chip, secondary line (e.g. `agent-name · 3h ago`).

### Server-side search contract

- Fan out to search endpoints in parallel using a `q` query param when input length ≥ 2.
- Debounce 100–150 ms (shorter feels expensive; longer feels laggy).
- 5 results per resource type, max.
- **Never** client-side fuzzy-search already-loaded data — that only "finds" rows the user happened to load on the list page. Server `q` is the source of truth, same as list filters.

### Visual rules

- Palette `max-w-2xl` centered, `max-h-[70vh]` on the list. Don't full-screen. Don't tuck in a corner.
- Item row `h-9` (slightly denser than menu items): icon + label left, optional secondary text in `text-fg-muted`, shortcut chips far right.
- Keep the icon column. Even pure-text actions get a placeholder icon (or typed glyph like `>` for actions). Mixed iconed/icon-less rows break the left edge.
- Group headings quiet: `text-xs font-medium text-fg-subtle uppercase tracking-wider`.
- Empty state is real: "No results for 'xyz'" + hint like "Try fewer characters or check spelling." Not a hidden div.

### Library choice

| Lib | What you get | Notes |
|---|---|---|
| `cmdk` (via shadcn `ui/command`) | `<Command>` / `<CommandDialog>` / `<CommandInput>` / `<CommandList>` / `<CommandGroup>` / `<CommandItem>` / `<CommandEmpty>` / `<CommandSeparator>` | Reference impl. Built-in client-side filter still runs over rendered items — fine for Recent/Actions/Navigate; Search group fed by the server. |
| Mantine Spotlight | `<Spotlight actions={[...]} shortcut={["mod+K", "ctrl+K"]} />` | Handles keyboard nav, filtering, dual-key binding. You populate `actions` and refresh the Search group from your debounced server query. |
| Headless UI Combobox | `<Combobox>` + `<Combobox.Input>` + `<Combobox.Options>` | Bare primitive. You build dialog wrapper, focus trap, group headings, empty state, hotkey yourself. Use only when cmdk and Spotlight are off the table. |
| `ninja-keys` (web component) | `<ninja-keys data='[...]' />` | Drops into any framework (vanilla, Vue, Svelte, Angular). Flat `data` array with `section` keys. Use when host app isn't React. |

### Global mount + dual-key binding

```tsx
// AppShell.tsx — single instance, global keybinding
export function AppShell() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return <>
    <CommandPalette open={open} onOpenChange={setOpen} />
    {/* rest of shell */}
  </>;
}
```

### Skeleton (cmdk)

```tsx
<CommandDialog open={open} onOpenChange={onOpenChange}>
  <CommandInput placeholder="Search or run a command..." />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>

    {recent.length > 0 && (
      <CommandGroup heading="Recent">
        {recent.map((r) => <CommandItem key={r.id} onSelect={() => navigate(r.to)}>{r.label}</CommandItem>)}
      </CommandGroup>
    )}

    <CommandGroup heading="Actions">
      <CommandItem onSelect={() => { setOpen(false); openNewSession(); }}>
        <PlusIcon /> New session
        <CommandShortcut>C then S</CommandShortcut>
      </CommandItem>
    </CommandGroup>

    <CommandGroup heading="Navigate">
      {routes.map((r) => (
        <CommandItem onSelect={() => { setOpen(false); navigate(r.to); }}>
          <r.icon /> {r.label}
          <CommandShortcut>G then {r.chord}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>

    {query.length >= 2 && (
      <>
        <CommandSeparator />
        <CommandGroup heading="Search">
          {searchResults.map((res) => <CommandItem key={res.id} …>)}
        </CommandGroup>
      </>
    )}
  </CommandList>
</CommandDialog>
```

### Live search — the data layer

```tsx
const [query, setQuery] = useState("");
const debouncedQuery = useDebounce(query, 150);

const { data: sessionHits } = useApiQuery(
  debouncedQuery.length >= 2 ? "/v1/sessions" : null,
  { q: debouncedQuery, limit: "5" },
  { staleTime: 30_000 },
);
const { data: agentHits } = useApiQuery(
  debouncedQuery.length >= 2 ? "/v1/agents" : null,
  { q: debouncedQuery, limit: "5" },
  { staleTime: 30_000 },
);
```

`useApiQuery` with `path: null` short-circuits the fetch when the query is too short — no `enabled` flag juggling.

### STOP rules

- **Cmd+K opens a route menu only.** That's a glorified sidebar. The point is verbs (actions) + entities (search) + nouns (routes) in one keystroke.
- **Bind only `Cmd+K`.** Half your users are on Windows.
- **Skip the Recent section.** It's the highest-hit-rate group; without it Cmd+K is "type the same thing 5 times a day".
- **Client-side filter the whole dataset.** Server `q` is the source of truth.
- **Re-implement the keyboard / focus logic.** Use `cmdk` (shadcn `ui/command`).
- **Mount per-page.** One global mount in `AppShell`. State persists across route changes.

---

## Shortcuts help overlay (?)

Pressing `?` (Shift+/) anywhere on a list page opens a centered popover (not a full Dialog — smaller, faster) listing every keyboard shortcut available.

- **Sections:** **Navigation** (`g+i`, `g+p`, …), **Row actions** (`I` = triage, `E` = edit, `Space` = select), **Global** (`Cmd+K`, `?`).
- Use the same `cmdk`-style `<kbd>` glyphs as the global palette.
- Group headings quiet: `text-xs uppercase tracking-wider text-fg-subtle`.
- **Searchable.** If the list is 15+ shortcuts, add a tiny search input at the top that filters rows. GitHub does this; users who know they want "triage" but can't remember the key find it instantly.
- Discoverability is the trust contract. A user who discovers Cmd+K believes the rest of the keyboard model works. A user who *can't* find the cheatsheet believes the keyboard model is decorative — power users find shortcuts by accident, everyone else thinks the app has no keyboard support.
