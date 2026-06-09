# XRoar Tab — Embedded Emulator

The **XRoar** tab is a **full CoCo/Dragon emulator** inside the app. It lets you **test instantly** the
disks, tapes and programs you open/edit in the other tabs — no hardware needed. By the end of this guide you
will know how to mount disks and tapes, pick the right machine and video, run programs and boot OS-9, and
make the screen big and sharp.

The screen has three zones: the **LEFT panel** (drives, tape, program, joystick), the **CENTER** (the
emulator's 4:3 screen) and the **RIGHT panel** (status, machine, video, filter, picture, controls, help).

---

## 1. Ready? The status indicator

At the top of the right panel, **● ready** (in the primary color) means the emulator has booted and accepts
commands. Until it is ready, most controls are disabled. **Click the screen** to capture the keyboard and
unlock audio (the browser only plays sound after a click).

---

## 2. Machine

Choose the emulated machine: **CoCo 3 (NTSC/PAL)**, **CoCo 2 (NTSC/PAL)**, **Dragon 32**, **Dragon 64**,
**Tano Dragon**, **MC-10**. Switching machines **restarts the emulator** (boots the new machine). The app
already picks the right machine for what you are testing (CoCo→CoCo 3, Dragon→Dragon 64; OS-9 forces CoCo 3,
which NitrOS-9 Level 2 requires).

---

## 3. Video: Composite vs RGB

The **Video output** selector changes how colors and text appear:
- **Composite (blue-red / orange-cyan)** — simulates the NTSC signal: the monitor "invents" **artifact
  colors** from fine pixels. This is how many CoCo 1/2 games produced color. **But it blurs fine text**, so
  it is bad for 80 columns.
- **RGB (sharp)** — the CoCo 3's exact digital signal, **no artifacts**. **Essential for OS-9's 80 columns**
  (clean text, no false colors).

Changing video **restarts** the emulator. Rule: **artifact-color games → Composite; text/OS-9 → RGB**.

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

In the left panel, each **D0–D3** row shows the mounted disk, with **Open** and **Eject**.
- **Open** picks a PC disk (`.dsk/.vdk/.jvc/.dmk/.os9`) and mounts it in that drive (a `.os9` is treated as a
  `.dsk` by geometry).
- **Eject** unmounts. **Drive 0** is the boot drive.

You usually don't do this by hand: the other tabs mount the disk for you (section 11).

---

## 8. Tape (K7) — mount a cassette + automatic CLOAD

- **Open tape** mounts a `.cas/.wav` in the deck.
- The **CLOAD(M) auto/manual** toggle: **auto** = XRoar runs `CLOAD`/`CLOADM` itself when the tape opens;
  **manual** = it only attaches the tape (you type `CLOAD`/`CLOADM` in the emulator).
- **Eject tape** unmounts.

> This tab only mounts/ejects a tape — the **play/rewind/counter** with spinning reels lives in the **K7
> tab's mini-XRoar**.

---

## 9. Program (.bin/.rom/.ccc/.hex/.sna)

- **Open & run .bin/.rom** loads and **runs** a program; XRoar detects the format.
- The **".bin AutoRun"** toggle: **on** = a `.bin/.hex` boots the emulator **with** the file and runs by
  itself; **off** = it only loads into memory (you run it with `EXEC`). Cartridges `.ccc/.rom` and snapshots
  `.sna` **always** run directly.

---

## 10. Joystick / keyboard

Two selectors configure **Joystick 0 (right)** and **Joystick 1 (left)**: **None**, **Mouse** or a
**keyboard-joystick** (cursors+Alt, WASD+O,P, IJKL+X,Z, QAOP+Space). Adjust live; on the CoCo the joystick
games use is usually **0 (right)**.

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
the screen, in a single restart.

---

## 12. Expand the screen

The button in the screen corner **expands** it: hides the side panels (and the console), and the 4:3 screen
gets **much bigger and sharper**. Ideal for reading OS-9's 80 columns. Click again to collapse.

---

## 13. Notes
- Changing **Machine**, **Video output** or **Filter** **restarts** the emulator (a pending disk/command is
  reapplied on the new boot).
- Colour/Brightness/Contrast, machine, video, filter and joysticks are **saved** between sessions.
- For **OS-9 booting** to work, the emulator boots with OS-9 geometry auto-detection on — so the `DOS`
  command finds the correct boot track.
