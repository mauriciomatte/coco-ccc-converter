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

**How the format is auto-deduced (when writing from a pane):**

| Pane contents | GW format chosen |
|---|---|
| **Dragon** disk, 40T, 1 side | `dragon.40ss` |
| **Dragon** disk, 40T, 2 sides | `dragon.40ds` |
| **Dragon** disk, 80T, 1/2 sides | `dragon.80ss` / `dragon.80ds` |
| RS-DOS of **184320 bytes** (40 tracks) | `coco.decb.40t` |
| Any other RS-DOS | `coco.decb` |

When auto-adjust changes the selected format, the app logs to the console: *"GW profile set for the disk: … (auto)."*

> **Platform (CoCo/Dragon):** switching the app's target platform also changes the **default GW format** —
> `coco.decb` for CoCo, `dragon.40ss` for Dragon. It's only a default; you can change it manually anytime in
> the dropdown.

---

## 2. Board setup

- **Device / Port** — free-text field. Leave **empty** for **auto-detect**; set it (e.g. `COM3` on Windows,
  `/dev/ttyACM0` on Linux) only if more than one board is connected. The **Test (gw info)** button next to it
  uses this port. When filled, it's passed as `--device <value>` on every operation.
- **Drive** — dropdown with fixed options: **Default (auto)** (empty — lets `gw` decide), **A**, **B**, **0**
  and **1**. Use A/B (or 0/1) when two drives share the cable. When set, it becomes `--drive <value>`.
- **gw path** — path to the `gw` executable. Leave `gw` if it's on PATH; otherwise use **Browse…** (opens a
  file dialog) to point to the executable (e.g. `C:\gw\gw.exe`). This value is **saved**.
- **Extra arguments** — advanced options separated by spaces, e.g. `--no-verify` (skip verification),
  `--retries=3`, `--revs=2` (more read revolutions). This field is **shared** between read and write, so on
  **read** the app **automatically strips** the write-only flags (`--no-verify`, `--erase-empty`,
  `--precomp…`, `--fake…`) — otherwise `gw read` would fail (exit code 1).
- **Direct command (optional)** — for advanced users. When filled, the field **gets a highlighted (glowing)
  border** and the app **completely ignores** format/device/drive/extra arguments, using **only** this line
  as the `gw` arguments. The temp `.dsk` file path is appended **at the end** automatically, for both read and
  write. **Not saved** in settings (it comes back empty on relaunch). E.g.
  `read --format coco.decb --device COM7 --drive 0 --revs 3`.

> **What gets saved:** Format, Device, Drive, gw path, Extra arguments, target pane (A/B) and the Step value
> are persisted across sessions. **The Direct command is NOT saved.**

---

## 3. Use pane (A / B)

Inline dropdown (**Pane A** / **Pane B**) next to the actions. Sets **which pane** (A/B of the DSK tab) the
read image loads into — and **from which pane** the image is written. The **Read** and **Write Pane** button
labels change dynamically to show the chosen pane (e.g. *"Read → Pane B"*). If the pane already holds content,
the app asks before overwriting (see §4.1). This choice is **saved**.

---

## 4. The main actions

- **Test (gw info)** — runs `gw info`: confirms the board is connected and responding. **Do this first.** The
  output appears in the console; the icon spins while it runs. If it fails, the app warns that the board may
  not be connected or `gw` may not be installed/on PATH.
- **Read → Pane A/B** — reads the physical floppy and loads the image into the chosen pane. If the pane
  already holds content, it opens the confirmation modal first. On success the image enters the pane with a
  generated name (`GW_READ_<format>.dsk`), is marked **unsaved** (dirty), and the app **automatically jumps to
  the DSK tab** with that pane active — review and **Save** there. The number of bytes read is logged.
- **Write Pane A/B → Disk** — writes the pane's disk to the physical floppy. **Disabled** if the chosen pane
  is empty. The **format is auto-adjusted** to the pane's contents (see the §1 table).
- **Write .dsk… → disk** — opens a dialog, you pick a `.dsk` file from the PC, and it is written straight to
  the floppy using the format **currently selected** in the dropdown (no auto-deduction).

While any operation runs, **all buttons are disabled** ("busy" state) to prevent concurrent commands to the
board.

> You can also start a write from the **DSK** tab ("Write GW" button — the HD icon in the pane toolbar): the
> app points to the active pane, **comes to this tab** and writes, honoring the current GW settings.

### 4.1. Confirmation modals

- **"Overwrite Pane A/B?"** — appears on **Read** if the target pane already has an image. It warns the read
  will **replace all content** and that unsaved changes will be lost. Buttons: **Cancel** (to save first) or
  **Read and overwrite**.
- **"Write to Greaseweazle?"** — appears when you trigger the write from the DSK tab's **Write GW** button.
  It reminds you the disk will be written **using the current GW settings**. Buttons: **Cancel** or
  **Proceed**.

---

## 5. Track Map + progress

The second section shows a **grid**: one row per **side** (labelled **L0**/**L1**) and one column per
**track**. The number of rows/columns comes from the **geometry of the selected format** (e.g. `coco.decb` =
1 row × 35 columns; `dragon.80ds` = 2 rows × 80 columns). Each cell **lights green** as `gw` reports that
track; hover to see *"Track N · Side N"*. Next to the title is a **done/total (%)** counter and, during the
run, a *"· reading"* or *"· writing"* indicator.

> **How the map sees progress:** the app **parses `gw`'s text output** and lights a track when it matches a
> pattern like `T<track>.<side>` or `Cyl=<n> Head=<n>`. The counter resets at the start of each read/write.
> **Errors do not change the cell color** — they go to the **console** at the bottom of the app, which mirrors
> **all** of `gw`'s output (lines containing "erro/error/fail" are highlighted red in the log).

---

## 6. Drive diagnostics

A separate row (below the main actions), labelled **"Drive diagnostics"**. Output from all these commands goes
to the **console** at the bottom. When reading/writing fails (seek errors, "Verify Failure"), use:
- **Seek test** — `gw seek 0`: moves/recalibrates the head against track 0. Uses the selected **Drive**; if it
  is "Default (auto)", it assumes drive **0**. The device (`--device`) is included if set.
- **Show delays** — `gw delays`: shows the drive's current timings (and their units) in the console.
- **Step (µs)** — numeric field (digits only). It is the delay between head steps.
- **Apply step** — runs `gw delays --step <value>`. Increase it (e.g. 8000–12000) for **slow drives**. It
  rejects invalid/≤ 0 values. The value is stored **in the board itself** and the field is **saved** in the app.

---

## 7. DD vs HD media (important)

`coco.decb` writes fine to **HD 1.44 floppies** if the **density-sensor hole is taped** over — the media then
behaves like **720K DD**, which is what the CoCo expects. A **"Verify Failure Track 0.0"** almost always
means a **physically bad disk**, not HD×DD incompatibility. To skip verification on writing, use
`--no-verify` in "Extra arguments".

---

## 8. The console (log) at the bottom

All of `gw`'s output — commands sent (`$ gw …`), progress, timings, and error messages — is mirrored in the
app's shared **console/log** at the bottom of the window (the same log used by the other tabs). That's where
you read the details when an operation fails. Each line is time-stamped; error lines appear in red.

---

## 9. Practical flows

**Preserve a real floppy to the PC:**
1. Connect the board → **Test (gw info)**.
2. Choose the disk's **Format** (e.g. `coco.decb`) and the target **Pane**.
3. **Read → Pane A** → watch the track map → the app opens it on the DSK tab → **Save** as `.dsk`.

**Write an image to a floppy:**
- *From a pane:* **Use pane** → **Write Pane A → Disk** (auto format).
- *From a file:* **Write .dsk… → disk** → choose the `.dsk`.
- *From the DSK tab:* **Write GW** button on the active pane → confirm → writes here.

**Stubborn drive:** **Seek test** → **Show delays** → raise **Step (µs)** → try again.
