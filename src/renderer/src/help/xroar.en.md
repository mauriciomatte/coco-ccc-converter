# XRoar Tab — Embedded Emulator

The **XRoar** tab is a **full CoCo/Dragon emulator** inside the app. It lets you **test instantly** the
disks, tapes and programs you open/edit in the other tabs — no hardware needed. By the end of this guide you
will know how to mount disks and tapes, pick the right machine and video, run programs and boot OS-9, and
make the screen big and sharp.

The screen has three zones: the **LEFT panel** (drives, tape, program, joystick), the **CENTER** (the
emulator's 4:3 screen) and the **RIGHT panel** (status, machine, video, filter, picture, controls, help).

---

## 1. Ready? The status indicator

At the top of the right panel, to the right of the **XRoar** title, is the status indicator:
- **● ready** (in the primary color) — the emulator has booted and accepts commands. The text next to the dot
  may change to **status messages sent by the emulator itself** (e.g. load progress) — it's not always just
  "ready".
- **booting…** (gray) — the emulator is still booting (or rebooting after a machine/video/filter change).

Until it is ready, **most controls are disabled** (drives, tape, program, joysticks, picture, controls).
**Click the screen** to capture the keyboard and unlock audio (the browser only plays sound after a click).

> **When the emulator mounts:** the XRoar iframe is created only the **first time** you open this tab (and the
> 4:3 screen has a real size). Before that you see **"starting emulator…"** in the center. Once mounted, it
> **keeps running** even if you switch tabs — coming back restarts nothing.

---

## 2. Machine

The **Machine** selector lists eight models:

| Selector option | What it is |
|---|---|
| **Tandy CoCo 3 (NTSC)** | US CoCo 3 (60 Hz) — the default for CoCo. |
| **Tandy CoCo 3 (PAL)** | European CoCo 3 (50 Hz). |
| **Tandy CoCo 2 (NTSC)** | US CoCo 2. |
| **Tandy CoCo 2 (PAL)** | European CoCo 2. |
| **Dragon 32** | Dragon 32K (PAL). |
| **Dragon 64** | Dragon 64K (PAL) — the default for Dragon. |
| **Tano Dragon (NTSC)** | US (Tano) version of the Dragon 64, 60 Hz. |
| **Tandy MC-10** | Tandy's entry-level micro (MC6803), much simpler. |

Switching machines **restarts the emulator** (boots the new machine) and, as a side effect, **clears the
loaded program name** and **resets the columns toggle back to 32**. The app already picks the right machine
for what you are testing (CoCo→CoCo 3, Dragon→Dragon 64; OS-9 forces CoCo 3, which NitrOS-9 Level 2 requires).

> The app's **target platform** (CoCo/Dragon toggle) sets the **default** machine: switching to Dragon picks
> **Dragon 64**, switching to CoCo picks **CoCo 3 (NTSC)**. You can pick another machine by hand afterwards —
> it holds until the next platform change.

---

## 3. Video: Composite vs RGB

The **Video output** selector has **three** options and changes how colors and text appear:
- **Composite (blue-red)** — simulates the NTSC signal: the monitor "invents" **artifact colors** from fine
  pixels. This is how many CoCo 1/2 games produced color.
- **Composite (orange-cyan)** — the **same** composite, but with the **artifact phase inverted**: colors that
  came out blue/red now come out orange/cyan. Many games only look "right" in one of the two phases — if a
  game's colors look swapped, **switch between these two options**.
- **RGB (sharp)** — the CoCo 3's exact digital signal, **no artifacts**. **Essential for OS-9's 80 columns**
  (clean text, no false colors).

Both **Composite** options enable the artifact decoder (cross-colour); **RGB** disables it. Changing video
**restarts** the emulator. Rule: **artifact-color games → Composite (try both phases); text/OS-9 → RGB**.

---

## 4. Screen filter: Sharp vs Smooth

- **Sharp (pixel)** — exact pixels; best for **games** (pixel-art preserved).
- **Smooth (80-col text)** — interpolation that **evens out the thin strokes** of 80-column characters; best
  for **OS-9/text**, because the screen is scaled to a non-integer size and "Sharp" would make the letters
  unevenly thick.

When testing OS-9, the app already forces **RGB + Smooth** for you. Changing the filter also **restarts** the
emulator.

## Columns (80/32) — real lowercase on the CoCo 3

When the machine is **CoCo 3**, a **"Columns"** block appears with an **80 ↔ 32** toggle. It types
`WIDTH 80` / `WIDTH 32` at the BASIC **`OK` prompt**:
- **80 columns** → the GIME hi-res screen, with **real lowercase**.
- **32 columns** → the legacy VDG mode, where lowercase shows as **inverse uppercase** (the real hardware
  behavior).

It does not change RGB/Composite — only the text mode. You must be at the BASIC `OK` prompt. (In OS-9, the
80-column window already shows lowercase, so the toggle isn't needed there.)

---

## 5. Live picture: Colour / Brightness / Contrast

Three sliders adjust the picture **live** (no restart). The values are saved and reapplied on each boot.

---

## 6. Controls: Pause / Reset / Hard reset

- **Pause / Resume** — freeze and resume emulation.
- **Reset** — soft CPU reset (keeps RAM).
- **Hard reset** — cold boot (clears RAM). Global shortcut: **Ctrl+Enter** (works here and in the K7 tab's
  mini-XRoar).

---

## 7. Drives D0–D3 — mount a disk

In the left panel, each **D0–D3** row shows the **mounted disk name** (or `—` if empty; the `Dx` label turns
primary-colored when a disk is present), plus three buttons:
- **Re-insert** (⟳) — re-injects the disk mounted in that drive, **re-reading the file from its source on
  disk** — so if you edited the `.dsk` outside the emulator (e.g. in the DSK tab), the **new** version goes in.
  XRoar **caches** the image, so use this after a reset (or if the image dropped out of memory) without
  reopening the picker. When the disk came from another tab (generated in memory, no file) it re-injects the
  cached bytes. Enabled only when the drive **has** a disk.
- **Open** (folder) — picks a PC disk (`.dsk/.vdk/.jvc/.dmk/.os9`) and mounts it in that drive (a `.os9` is
  treated as a `.dsk` by geometry). Disabled until the emulator is **ready**.
- **Eject** (×) — unmounts that drive. Enabled only when the drive **has** a disk.

You can also **drag and drop** a disk from Explorer **straight onto the row of the drive** you want
(`.dsk/.vdk/.jvc/.dmk/.os9`) — the row highlights while you drag over it.

**Drive 0** is the boot drive. You usually don't do this by hand: the other tabs mount the disk for you
(section 11). Switching machine/video **ejects everything** (drives are cleared on the reboot).

---

## 8. Tape (K7) — mount a cassette + automatic CLOAD

- **Open tape** mounts a `.cas/.wav` in the deck.
- The **CLOAD(M) auto/manual** toggle: **auto** = XRoar runs `CLOAD`/`CLOADM` itself when the tape opens;
  **manual** = it only attaches the tape (you type `CLOAD`/`CLOADM` in the emulator).
- **Eject tape** unmounts.

> This tab only mounts/ejects a tape — the **play/rewind/counter** with spinning reels lives in the **K7
> tab's mini-XRoar**.

---

## 9. Program (.bin/.rom/.ccc/.pak/.hex/.sna)

- The **loaded program name** is shown highlighted at the top of the block.
- **Open** loads and **runs** a program (`.bin/.rom/.ccc/.pak/.hex/.sna`); XRoar detects the format.
- **`.pak`** is the **VCC** cartridge ROM (identical to `.rom/.ccc`) — the app presents it to XRoar as a `$C000`
  cartridge automatically (the on-screen name stays `.pak`). It runs directly, like any cartridge.
- The **"AutoRun"** toggle (next to Open): **on** = a `.bin/.hex` boots the emulator **with** the file and runs by
  itself; **off** = it only loads into memory (you run it with `EXEC`). Cartridges `.ccc/.rom/.pak` and snapshots
  `.sna` **always** run directly.
- **Release** (×, next to AutoRun) — **ejects the loaded program**. This XRoar build has no "remove cartridge",
  so the app **re-mounts the emulator clean** (without the boot file) to take the `.bin/.rom/.ccc` out of the
  machine — like switching machines, **the drives are ejected** on the reboot. The name disappears and Reload
  is disabled. Enabled only when a program is loaded.
- **Reload** (⟳, next to the buttons) — reloads the **last** `.bin/.rom/.ccc` you loaded, **re-reading the file
  from its source on disk** — if you re-converted/edited the file, the **new** version goes in (not the stale
  cached bytes). Since XRoar **caches**, use this after the emulator is reset without reopening the picker.
  Enabled only when a program is loaded.

---

## 10. Joystick / keyboard

Two selectors configure **Joystick 0 (right)** and **Joystick 1 (left)**: **None**, **Mouse** or a
**keyboard-joystick** (cursors+Alt, WASD+O,P, IJKL+X,Z, QAOP+Space). Adjust live; on the CoCo the joystick
games use is usually **0 (right)**.

**Keyboard layout (the "Keyboard: …" toggle):** switches between **CoCo layout** and **PC layout**:
- **CoCo layout** (default) — **physical matrix**: each PC key maps by its **position** on the CoCo keyboard,
  like the real hardware. Best for games that read keys by position and for the authentic feel.
- **PC layout** — **translation** on: what you **type** on the PC **appears** (symbols and **Shift** match —
  `Shift+2` = `@`, etc.). More comfortable for typing BASIC/commands.

In **PC** layout a **"Keyboard language"** selector appears — pick the one for **your physical keyboard** (e.g.
**Brazil (ABNT2)**). **"Automatic"** tries to **detect** your layout from the browser (Chromium exposes the
character each physical key produces) and picks the language by itself; if detection fails or is wrong, select
your country manually.

> **Symbols like `]` depend on the PHYSICAL form (ISO vs ANSI).** On **ABNT2** (which is **ISO**) the `]` sits on
> the extra key next to **Enter**; on an **ANSI** keyboard (typical US) that key doesn't even exist. So, along with
> the language, the app passes the right `-kbd-layout` (**ISO** for Brazil and Europe, **ANSI** for US) — so both
> `[` **and** `]` come out. If a symbol is still missing, try another language in the selector.

> **Upper vs lower case:** the CoCo has **no lowercase key** — it's a keyboard state, and how you control it
> **depends on the layout**:
> - **⚠ PC layout:** in this build the translation **does NOT control case** — letters stay **stuck on uppercase**
>   and **neither Shift nor CapsLock** toggle. Use PC layout only when you need your keyboard's **symbols** and
>   uppercase-only is fine.
> - **✅ CoCo layout (recommended for typing):** works like the real CoCo — **SHIFT+0** locks **lowercase** and
>   **Shift** toggles upper/lowercase. That's how you get both cases.
> - **To see lowercase with normal glyphs:** in **VDG** mode (CoCo 1/2, or CoCo 3 at 32 columns) lowercase shows as
>   **inverse video** (MC6847 limit) — for normal glyphs use **CoCo 3** + **Columns → 80 columns**.

Switching the layout **or the language** **reboots the emulator** (like changing machine/video), so prefer
setting it **before** loading a disk. The choices are **remembered** across sessions.

---

## 11. How content arrives from the OTHER tabs

You almost never mount anything by hand — the other tabs send it here and switch to this tab:
- **DSK → "Test Pane"** — mounts the active pane's disk in drive 0 (with or without reset); the machine
  follows the disk format.
- **DSK → double-click a file** — mounts the disk and runs the file (`RUN` / `LOADM:EXEC`).
- **OS-9 → "Test"** — forces **CoCo 3 + RGB + Smooth**, mounts the disk and (in "Boot" mode) types **`DOS`**
  to boot OS-9.
- **K7 → "→ XRoar"** — attaches the tape WAV; you use `CLOAD`/`CLOADM`/`RUN`.
- **BASIC → "Run"** — types `NEW` + the program (or, with reset, boots clean and types the program).

When a tab needs a different video/filter (e.g. OS-9 wants RGB+Smooth), the app applies it **before** showing
the screen, in a single restart. Whenever content is **run** (double-click, `DOS`, `RUN`…), the app does a
**hard reset** before typing the command — so the text goes to a clean prompt (`OK`/`B:`) and not into a
program already on screen; the mounted disk stays in the drive.

> **Typing speed:** command/BASIC injection is done **one key at a time**. The cadence is controlled by the
> **"Code Export Speed"** toggle on the **BASIC** tab: **normal** ≈ 25 ms per key (default, safer) and
> **fast** ≈ 12 ms. If a line starts "dropping" characters on more sensitive machines, use normal.

> **Dragon:** on boot/reset, the Dragon ROM asks to "press a key". The app **prefixes a space** before each
> typed command to dismiss that prompt automatically (at the BASIC prompt the space is harmless).

---

## 12. Expand the screen

The button in the **top-right corner of the screen** (expand/collapse icon) toggles expanded mode: it
**hides both side panels AND the diagnostics console** (in the app), so the 4:3 screen — which is limited by
**height** — gets **much bigger and sharper**. Ideal for reading OS-9's 80 columns. Click again (or the
collapse icon) to bring the panels back.

> The screen is always **4:3 with letterbox** (black bars), centered and resized automatically to the window
> size — it never distorts the image.

---

## 13. Help button

The **Help** button (at the bottom of the right panel) reopens this guide at any time.

---

## 14. Notes
- Changing **Machine**, **Video output** or **Filter** **restarts** the emulator (a pending disk/command is
  reapplied on the new boot — so you don't have to "test twice" after a machine change).
- **Persistence:** **saved** between sessions (with a short delay after each change) are the **machine**,
  **video output**, **filter**, **Colour/Brightness/Contrast** and the two **joysticks**. The config is loaded
  **before** the first boot (avoids a double boot).
- Colour/Brightness/Contrast are **0–100 integers** (neutral = 50) applied **live**; machine, video and filter
  go in through the **boot** (which is why they restart).
- For **OS-9 booting** to work, the emulator boots with OS-9 geometry auto-detection on — so the `DOS`
  command finds the correct boot track. Internally a `.os9` is mounted as a `.dsk` (same geometry) so XRoar
  recognizes it; the name shown on the drive stays the original.
- `.pak` files are presented to XRoar as `.rom` (cartridge) internally only; the on-screen name stays `.pak`.
