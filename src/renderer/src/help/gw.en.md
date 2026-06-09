# GW Tab — Greaseweazle (read/write real floppies)

The **GW** tab uses the **Greaseweazle** board to **read** and **write** actual **physical** floppy
disks, bridging real media and the app's `.dsk` images.

## Prerequisites

- The **Greaseweazle board** connected over USB.
- The **`gw`** program (Greaseweazle host tools) installed. If it is not on the system PATH, set the
  **executable path** in the matching field (e.g. `C:\gw\gw.exe`). This value is saved.
- A **floppy drive** attached to the Greaseweazle ribbon cable.

## Main buttons and fields

- **Test (gw info)** — runs `gw info` to check that the board responds. Do this first.
- **Device / port** — leave empty for auto-detect; set it (e.g. `COM3` on Windows, `/dev/ttyACM0` on
  Linux) if more than one board is connected.
- **Drive** — which drive on the cable (Default lets `gw` decide; use A/B or 0/1 when there are two
  drives).
- **Target pane (A/B)** — sets which DSK-tab pane receives a read **and** which pane a write comes
  from. The buttons relabel per pane ("Read → Pane X" / "Write Pane X").

## Read a physical floppy

1. Put the floppy in the drive.
2. Choose the **target pane** (A or B).
3. Click **Read**. The image loads into the chosen pane of the **DSK** tab (if the pane already has
   content, an overwrite warning appears — cancel to save first).
4. The **track map** shows per track/side progress.

## Write to a physical floppy

1. Have the image in the pane (A or B), or choose **Write .dsk…** to pick a file.
2. Insert a **writable** floppy in the drive.
3. Click **Write Pane X → Disk**. The map shows progress.

> You can also trigger the write straight from the **DSK** tab via the **Write GW** button, which opens
> this tab already pointing to the active pane.

## Drive diagnostics

For troublesome drives:

- **Seek test** — runs `gw seek 0` to exercise/recalibrate the head (helps against seek/Track 0
  errors).
- **Show delays** — runs `gw delays` and shows the current timings.
- **Step (µs) + Apply step** — runs `gw delays --step` to **widen the head step delay** (raise to
  ~8000–12000 for slow drives). The value is saved on the device.

## Media (important tip)

The CoCo format (`coco.decb`) writes **double-density 720K (DD)**. **HD 1.44 MB** floppies work **if
you tape over the density-sensor hole** (so the drive treats them as DD). A **"Verify Failure Track
0.0"** error usually means a **physically bad** floppy, not an HD-vs-DD problem.

## Typical flow

1. **Test (gw info)** → confirm the board.
2. **Read** a floppy → edit in the DSK tab → **Write** it back (or to another floppy).
3. On read/write errors: **Seek test**, and if needed increase the **Step**.
