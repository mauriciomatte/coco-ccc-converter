# XRoar Tab — Emulator (CoCo / Dragon)

The **XRoar** tab runs the embedded emulator so you can **test** disks, tapes, programs and cartridges
immediately. The emulator screen is in the center, with control panels on the sides.

## Machine and video (right panel)

- **Machine** — pick the computer: **Tandy CoCo 3** (NTSC/PAL), **CoCo 2**, **Dragon 32/64**, **Tano
  Dragon**, **MC-10**. Changing the machine **reboots** the emulator. (For **OS-9 Level 2** use
  **CoCo 3**.)
- **Video output** — **Composite** (NTSC artifact colors; good for games that rely on it) or **RGB
  (sharp)** (no artifacts; better for text and hi-res screens, such as OS-9's 80 columns).
- **Screen filter** — **Sharp (pixel)** = exact pixels (games); **Smooth (80-col text)** = smooths
  thin text when the screen is at a non-integer scale (makes OS-9 legible).
- **Picture** — live **Colour / Brightness / Contrast** controls.

## Disk drives (left panel)

Four drives (**D0–D3**). In each you can **Open** an image (`.dsk/.vdk/.jvc/.dmk/.os9`) and **Eject**.
Images coming from other tabs (Test Pane / Test OS-9) are mounted here automatically, usually in
**D0**.

## Tape (K7)

A panel to **attach** a tape (`.cas`/`.wav`) and **eject**. The **auto CLOAD(M)** toggle: when **on**,
opening the tape makes XRoar run `CLOAD`/`CLOADM` by itself; when **off**, the tape is only attached
and you type `CLOAD` (BASIC) or `CLOADM` (machine) in the emulator.

## Program (.bin/.rom/.ccc/.sna)

Opens and **runs** a program. `.CCC`/`.ROM` (cartridge) and `.SNA` (snapshot) run directly. A machine
`.BIN` must **boot with the file** to run — control this with the **.bin AutoRun** toggle.

## Joystick / keyboard

Assign **joysticks** to the ports (mouse or predefined keyboard-joysticks). On the CoCo, **joystick 0**
is the right one.

## Controls

- **Pause / Resume**, **Reset** (soft) and **Hard reset**.
- Click the **screen** to capture keyboard and audio.

## Expand the screen

At the **top-right corner of the screen** there is an **Expand** button (⤢): it **hides the side panels
and the bottom diagnostic console**, giving the emulator the whole tab area. Since the 4:3 screen is
**height**-limited, gaining height **enlarges** the image and greatly improves sharpness (great for
OS-9's 80 columns). Click again (⤡) to collapse.

## OS-9 shortcut

When you use **Test/Boot** in the **OS-9** tab, XRoar is auto-configured for OS-9: **CoCo 3 + RGB +
Smooth filter**. Then just **Expand**.

## Notes

- Changing **machine / video / filter** reboots the emulator (and re-mounts what was loaded).
- The **`DOS`** command (OS-9 boot) comes from the disk-controller ROM, which is attached when a disk
  is mounted.
