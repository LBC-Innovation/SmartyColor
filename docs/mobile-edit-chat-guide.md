# Mobile chat-to-edit: implementation guide

**Component:** `src/components/v2/V2SheetEditChat.tsx` (opened from the page editor via "Edit with a note").
**Scope:** phones and small tablets only, i.e. below Tailwind `lg` (1024px). **Desktop (`lg:` and up) must render exactly as it does today.**

## The problem

Below `lg` the editor stacks three things in one column: the page image (`flex-1`), the conversation (capped at `max-h-[34dvh]`, hidden when empty) and the composer (examples + input + cost notice). None of them gets enough room. When the keyboard opens the image shrinks to a sliver and the conversation feels like a cramped modal inside the screen.

## Design intent

The chat is the task; the page is the reference. On a phone the conversation should own the screen, and the page should be one tap away, never in the way.

```
┌─────────────────────────────┐
│ Edit coloring page    Done  │  header (unchanged)
├─────────────────────────────┤
│                    ┌──────┐ │
│  intro / messages  │ PiP  │ │  conversation fills ALL remaining height
│  scroll here       │ page │ │  PiP floats above it, draggable, snaps
│                    └──────┘ │  to a corner
│                             │
│   [user bubble]             │
│ [assistant bubble]          │
├─────────────────────────────┤
│ EXAMPLES  chip chip chip →  │  composer pinned at bottom (unchanged
│ ( What should we change? ➤) │  content, already keyboard-safe)
│ ✦ 2 free edits left         │
└─────────────────────────────┘
```

### 1. Layout (mobile)

- Header stays as is (title + "Done").
- The inline image pane is **not rendered in the column on mobile** (`hidden lg:flex` on the existing image pane, so desktop keeps it untouched).
- The chat column becomes `flex-1 min-h-0` on mobile, and the message list is `flex-1` with no `34dvh` cap. On `lg:` keep the existing classes (`lg:w-[380px] lg:shrink-0`, `lg:flex-1` list etc.).
- Empty state is shown on mobile too (today it is `hidden lg:flex`). On mobile it should be a short, friendly intro: what this does ("Ask for one change at a time. The rest of the page stays the same.") and the example sentence, centred in the free space. The PiP is visible from the start, so the user already sees the page.
- Composer: unchanged content, still `shrink-0` at the bottom, still uses `env(safe-area-inset-bottom)`, still inside the `useKeyboardSafeBox` container so iOS keyboard handling keeps working.

### 2. Picture-in-picture page (mobile only, `lg:hidden`)

A floating card showing the **coloring page** (always the sheet, not the photo) inside the conversation area.

- **Size:** width ~34vw, clamped to 112–150px; height from the image's natural aspect ratio (portrait and landscape pages both exist; read `naturalWidth/Height` on load, default 3:4 until known). White background, `rounded-2xl`, soft shadow + `ring-1 ring-v2-primary/15`, 4px white padding so the line art reads against the bubbles.
- **Bounds:** confined to the conversation area (the scroll container's box, not the full screen): it must never cover the header or the composer. Inset 12px from edges.
- **Default position:** top-right corner.
- **Drag / flick:** pointer events with `setPointerCapture`, `touch-action: none` on the card. Follows the finger 1:1 while dragging. On release, project the position using the release velocity (e.g. `x + vx * 0.2s`), pick the nearest of the four corners to the projected point, and animate there (`transform` transition ~280ms, `cubic-bezier(.2,.8,.2,1)`). No transition while dragging.
- **Tap vs drag:** movement < 6px and duration < 300ms = tap. A tap opens the viewer. A drag never opens it.
- **Re-clamp** on resize / keyboard open / orientation change (ResizeObserver on the bounds element). It keeps its corner, not its pixel position. When the area gets short (keyboard up), the card scales down so it is at most ~45% of the area height.
- **Busy state:** while an edit is running (`busy`), dim the thumbnail and show a small spinner / the pencil scribble in the card, plus a subtle pulsing ring. When `busy` goes from true to false and the image URL changed, show a small "Updated" pill on the card for ~4s and a brief scale pop (skip the pop under `prefers-reduced-motion`).
- **Accessibility:** the card is a `<button>` with `aria-label="Show the coloring page full screen"`; visible focus ring; keyboard Enter/Space opens the viewer. Dragging is a pointer-only enhancement; nothing depends on it.
- **Covering messages:** the card floats over the list (no reserved gutter, which would waste width on a phone). The list keeps auto-scrolling to the newest message, and the user flicks the card to another corner when it's in the way. Default top-right keeps it away from the newest messages at the bottom.

### 3. Full-screen viewer (mobile only)

Opened by tapping the PiP.

- Covers the whole edit dialog (`absolute inset-0` inside the panel, `z` above the PiP), background `v2-bg-subtle`.
- Top bar: "Back to chat" (left, with chevron) and the existing **Coloring page / Photo** segmented toggle (centred). Respect `safe-area-inset-top`.
- Image: `object-contain`, fills the space. Pinch-zoom is a nice-to-have, not required; at minimum allow double-tap to toggle 2x zoom with pan, or skip zoom entirely if it adds risk.
- `busy` shows the existing `V2WorkingOverlay` over the image here (same as the desktop pane).
- Closes with: "Back to chat", Esc (use `useModalLayer` with its own `panelRef` so Esc closes only the viewer, not the whole editor), and swipe down > 80px (nice-to-have).
- Enter/exit: fade + slight scale from the PiP (150–200ms), none under reduced motion.
- When closed, focus returns to the PiP button.
- Opening the viewer blurs the textarea so the keyboard drops.

### 4. Desktop guardrail

- Every new element is `lg:hidden`. Every changed mobile class keeps its existing `lg:` counterpart. Diff the rendered DOM classes at 1280px before/after: the desktop image pane, chat column, header, examples and composer must be identical.
- Do not change props or the parent (`ColorfulMemoriesApp.tsx`) unless strictly needed.

### 5. Implementation notes

- Split the PiP and viewer into `src/components/v2/edit-chat/` (e.g. `EditChatPip.tsx`, `EditChatPageViewer.tsx`) to keep `V2SheetEditChat.tsx` readable.
- No new dependencies. Plain pointer events + CSS transforms.
- Store PiP corner in component state only (reset to top-right each open is fine).
- `previewMode` state already exists; the viewer uses it. PiP always shows the sheet.
- Use `useSyncExternalStore` or a small `useMediaQuery` hook only if JS needs to know mobile vs desktop; prefer CSS (`lg:hidden` / `hidden lg:flex`) so SSR/first paint is right.
- Lint baseline: `V2SheetEditChat.tsx` already has a `react-hooks/set-state-in-effect` error on main; don't add new ones.

### 6. Demo harness

A dev-only route renders the dialog with sample images and a fake `onSend` (busy for ~3s, then swaps sheet image and appends assistant message), so the flow can be demoed without calling the AI or signing in. `notFound()` in production. Not to be committed.

### 7. Acceptance checklist

- [ ] At 390×844: conversation fills everything between header and composer; no 34dvh cap.
- [ ] PiP visible on open at top-right, never overlaps header or composer.
- [ ] Drag follows finger; flick toward a corner lands in that corner; slow drop snaps to nearest corner.
- [ ] Tap opens full-screen viewer; toggle switches Coloring page/Photo; Back/Esc closes; focus returns to PiP.
- [ ] Keyboard open (iOS visual viewport): composer above keyboard, PiP re-clamped and smaller, still inside bounds.
- [ ] Busy: PiP shows working state; after edit, "Updated" pill; viewer shows overlay while busy.
- [ ] Landscape and portrait pages both render with correct PiP aspect.
- [ ] Reduced motion: no pop/scale animations; snapping is instant or a short fade.
- [ ] At 1280×800: desktop identical to before.
- [ ] `tsc --noEmit` clean; eslint has no new errors vs main.
