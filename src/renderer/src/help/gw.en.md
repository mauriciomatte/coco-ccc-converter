# GW Tab — Greaseweazle (read/write real floppies)

The **GW** tab is the bridge between the app and the **Greaseweazle** board: it **reads physical floppies**
into the app and **writes images to physical floppies**. This is how you preserve real CoCo/Dragon disks and
how you take your edited disks back to media. By the end of this guide you will know how to set up the board,
pick the right format, read/write safely, and diagnose a troublesome drive.

> **Prerequisites:** (1) the **Greaseweazle** board connected via USB; (2) the **`gw` host tools** installed
> (on PATH, or give the path in the "gw path" field); (3) a **floppy drive** connected to the ribbon.

Each field has a small **"?"** that shows its hint just below. The **Help** button (title corner) opens this
manual.

---

## 1. Format (CoCo / Dragon)

The **Format** defines the geometry `gw` will use (and the size of the track map). Pick the one matching the
physical disk:

| Format | Geometry | What it's for |
|---|---|---|
| **coco.decb** | 35 tracks, 1 side | Standard CoCo RS-DOS/Disk BASIC disk (160K) |
| **coco.decb.40t** | 40 tracks, 1 side | 40-track RS-DOS (180K) |
| **coco.os9.40ss / .40ds** | 40T, 1 or 2 sides | OS-9/NitrOS-9 40 tracks |
| **coco.os9.80ss / .80ds** | 80T, 1 or 2 sides | OS-9 80 tracks |
| **dragon.40ss / .40ds** | 40T, 1 or 2 sides | Dragon DOS 40 tracks |
| **dragon.80ss / .80ds** | 80T, 1 or 2 sides | Dragon DOS 80 tracks |

> When writing from a DSK pane, the app **deduces and adjusts the format** automatically from the disk's
> contents.

---

## 2. Board setup

- **Device / Port** — leave empty for **auto-detect**; set it (e.g. `COM3` on Windows, `/dev/ttyACM0` on
  Linux) only if more than one board is connected.
- **Drive** — which drive on the Greaseweazle ribbon: **Default (auto)**, or **A/B** (or **0/1**) when two
  drives share the cable.
- **gw path** — leave `gw` if it's on PATH; otherwise use **Browse…** to point to the executable (e.g.
  `C:\gw\gw.exe`). This value is **saved**.
- **Extra arguments** — advanced options separated by spaces, e.g. `--no-verify` (skip verification),
  `--retries=3`, `--revs=2` (more read revolutions). On reading, options that only apply to writing are
  ignored automatically.
- **Direct command (optional)** — for advanced users: when filled, the app **ignores** format/device/drive/
  extras and uses **only** this line as the `gw` arguments (the temp file path is appended at the end). Not
  saved.

---

## 3. Use pane (A / B)

Sets **which pane** (A/B of the DSK tab) the read image loads into — and **from which pane** the image is
written. If the pane already holds content, the app asks before overwriting.

---

## 4. The main actions

- **Test (gw info)** — runs `gw info`: confirms the board is connected and responding. **Do this first.** The
  output appears in the console.
- **Read → Pane A/B** — reads the physical floppy and loads the image into the chosen pane. If the pane holds
  content, it confirms first. When done, the app **jumps to the DSK tab** with the image loaded (marked
  unsaved) — review and save.
- **Write Pane A/B → Disk** — writes the pane's disk to the physical floppy (the format is auto-adjusted to
  the pane's contents).
- **Write .dsk… → disk** — picks a `.dsk` file from the PC and writes it straight to the floppy (uses the
  currently selected format).

> You can also start a write from the **DSK** tab ("Write GW" button): the app points to the active pane,
> comes to this tab and writes.

---

## 5. Track Map + progress

The second section shows a **grid**: one row per **side** (L0/L1) and one column per **track**. Each cell
**lights green** as `gw` reads/writes that track; next to it is a **done/total (%)** counter. That's your
real-time visual feedback. Errors don't show as a color — they go to the **console** at the bottom (which
shows all of `gw`'s output).

---

## 6. Drive diagnostics

When reading/writing fails (seek errors, "Verify Failure"), use:
- **Seek test** — `gw seek 0`: moves/recalibrates the head against track 0.
- **Show delays** — `gw delays`: shows the drive's current timings.
- **Step (µs) + Apply step** — adjusts the head step delay (`gw delays --step`). Increase it (e.g.
  8000–12000) for **slow drives**. The value is stored in the board itself and **saved** in the app.

---

## 7. DD vs HD media (important)

`coco.decb` writes fine to **HD 1.44 floppies** if the **density-sensor hole is taped** over — the media then
behaves like **720K DD**, which is what the CoCo expects. A **"Verify Failure Track 0.0"** almost always
means a **physically bad disk**, not HD×DD incompatibility. To skip verification on writing, use
`--no-verify` in "Extra arguments".

---

## 8. Practical flows

**Preserve a real floppy to the PC:**
1. Connect the board → **Test (gw info)**.
2. Choose the disk's **Format** (e.g. `coco.decb`) and the target **Pane**.
3. **Read → Pane A** → watch the track map → the app opens it on the DSK tab → **Save** as `.dsk`.

**Write an image to a floppy:**
- *From a pane:* **Use pane** → **Write Pane A → Disk** (auto format).
- *From a file:* **Write .dsk… → disk** → choose the `.dsk`.
- *From the DSK tab:* **Write GW** button on the active pane → confirm → writes here.

**Stubborn drive:** **Seek test** → **Show delays** → raise **Step (µs)** → try again.
