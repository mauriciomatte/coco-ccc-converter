# DSK Tab — RS-DOS / Dragon Floppies

The **DSK** tab is the full editor for CoCo **floppy disk images** (RS-DOS / Disk BASIC) and **Dragon**
(Dragon DOS / `.vdk`). With it you **open, read, edit, organize, compare, convert, test and write** disks —
from a single `.dsk` image to giant containers holding thousands of disks. By the end of this guide you will
know exactly what each tool delivers and how to reach every result.

---

## 1. The screen: two panes A and B

The tab has **two stacked panes** — **A (top)** and **B (bottom)** — split by a divider you drag to give one
of them more room. Each pane opens an **independent** image, so you can compare two disks and copy files from
one to the other.

- **Active pane:** click anywhere in a pane to activate it — its badge turns **orange**. Almost every
  toolbar action operates on the **active pane**.
- Each pane has three columns: **(left)** open/clear/format + image info; **(center)** the file list;
  **(right)** the **disk map** + defragment buttons.
- **Horizontal divider:** the bar between A and B is draggable — pull it up/down to give more height to the
  pane you're working in.

**Result:** you see two disks at once and move files between them by dragging.

### The left column — info buttons and badges

The left column of each pane has, at the top, the **pane badge** ("Pane A/B") and three icons: **📁 Open**
(opens an image), **🧽 Clear pane** (empties the pane without touching the file) and **💿 Format** (wipes
the disk — see section 8). Below, when a disk is loaded, the **info** appears:

- **Image name** (shortened; hover for the full name) and **size in KB**.
- **Origin badge:** **"Read: {format}"** (a disk opened from a file — the color/label show the real detected
  format) **or** **"New: {name}"** (an image created with ✚ and **not yet saved** to a file).
- **"⚠ Unsupported format"** (red) — only on containers whose disk names come out **garbled**: opens **for
  inspection only**, saving **is not recommended**.
- On containers, the **"Disk" block** (navigation) with ◀ ▶, the disk number and each type's buttons
  (section 5).

---

## 2. Opening and creating images

### Open an image (left column, folder icon)
Opens any format: **`.dsk`** (RS-DOS), **`.vdk`** (Dragon), **`.jvc`**, **DMK** (track image), **SDF**
(CoCoSDC) and **containers** — **DriveWire** (many disks in one file), **MiniIDE/HDBDOS** and **CoCoSDC**
(FAT card). OS-9 and double-sided disks are **routed automatically to the OS-9 tab**.

### Create a new disk (pane status bar: "New:")
1. In the **"New:"** selector pick the format: **CoCo 35T** (standard DECB, 160K), **CoCo 40T (JDOS)** (180K)
   or **Dragon 40T**.
2. Click **✚**. If the pane already holds a disk, the app asks before discarding it.

**Result:** a blank formatted disk, ready for files and saving.

> **Change the format of an already-open disk:** if you **switch the "New:" selector** between **CoCo 35T**
> and **CoCo 40T (JDOS)** with an RS-DOS disk loaded, the app offers to **re-create the image at the new
> track count while keeping the files** (modal "Re-create image as 35T/40T?"). If any file doesn't fit the
> new format, **nothing changes**. The operation is left **unsaved** — use "Save" afterwards.

> **Target-platform selector (CoCo / Dragon), in the global top bar:** sets the **default** for "New disk",
> the **XRoar machine** and the **Greaseweazle format**. Disks you **open** still keep their **real format**.

### Drag from Windows
Drop a `.dsk`/image onto the pane to **open** it; drop a `.bin/.bas/.cas` to **inject** it; drop a file on an
**empty pane** and it creates a new `.dsk` with that file already inside.

---

## 3. The file list — what each column tells you

For each file: **Name**, **Type** (BASIC / DATA / MACHINE / SOURCE), **Size**, **Gran.** (how many granules
it uses), **Tracks** (which tracks it lives on, as ranges like "0-2, 4") and **Format**.

- **Select:** click a row (turns orange). **Shift+click** selects a **range** (from the last anchor);
  **Ctrl+click** **toggles** individual files (sparse multi-select), so you can copy/delete/extract several
  at once.
- **Double-click:** opens the **Send to…** hub (just like the Servers tab) — from there you pick the destination,
  including **XRoar**. The file's XRoar card has a **"Send and run"** checkbox (on by default): **on** mounts the
  disk and **runs** the selected file (`RUN` for BASIC, `LOADM/EXEC` for machine code; the emulator machine follows
  the format CoCo/Dragon); **off** just **mounts** the disk in XRoar (no run).
- **Drag the row to the other pane:** copies (with **Ctrl**) or moves (with **Shift**) the file A↔B.
- **Handle ⠿ (left):** drag it to **Windows Explorer** and the file is **extracted** (native OS drag) to
  that folder — it works even inside a container (the current disk is captured when the drag starts).

> The **Gran.** column shows the granule count (RS-DOS) **or** "Ns" = sector count (Dragon). The **Tracks**
> column lists the occupied tracks as ranges (e.g. "0-2, 4").

---

## 4. Toolbar — every button and what it delivers

> The **selected-file** buttons (Copy, Rename, Delete, view .BAS, compare, convert) only appear when at
> least one file is selected.

- **Inject** — picks a PC file (`.bin/.bas/.cas`) and adds it to the active disk. A `.cas` is interpreted:
  each program on the tape becomes a file (ML → `.BIN` with a LOADM preamble; BASIC → `.BAS`; data → `.DAT`).
- **Copy / Paste** — a **file** clipboard. **Copy** (button or **Ctrl+C**) takes the selection into memory;
  **Paste** (button or **Ctrl+V**, only shown when something is copied) writes it into the active pane (same
  disk or the other one). **Cut** has **no toolbar button** — use **Ctrl+X** (or drag the row with
  **Shift**): the source is removed **after** pasting/dropping. A **📋 name ✂** indicator at the end of the
  bar shows what's on the clipboard (the ✂ marks a cut).
- **Rename** (1 selected, pencil icon) — opens a modal with **NAME (8)** and **EXT (3)** fields. Only the
  directory entry changes; the data stays in place.
- **Delete** (or **Delete** key) — removes the selection and frees its granules.
- **Quick view** (magnifier) — opens a **read-only viewer** that **detokenizes** the BASIC on the spot,
  without leaving the tab. Great to peek at a program before extracting it. (Machine Language is refused.)
- **Edit** — sends a **BASIC program** to the **BASIC tab** for full editing, **regardless of the extension**
  (`.BAS`/`.BAT`/`.TXT`…), keeping the **original name and extension**; auto-detokenizes if needed.
  **Machine Language is refused** (use **HEX/DISASM** on the General tab).
- **Extract to PC** (down arrow) — saves the selected file(s) to a Windows folder.
- **Compare** (1 selected) — opens a **hex diff** between the disk file and a PC file: tells you if they are
  **identical** or shows how many bytes differ, the first difference, and the divergent runs in red. Use it
  to verify writes/conversions.
- **Convert to Dragon** (1 machine `.BIN`, on a non-Dragon disk; cyan arrows icon) — opens a modal to
  convert the CoCo binary to Dragon. You pick **Direct load** (loads at the same CoCo address) or **With
  relocator** (loads low at `0x0C00`; a stub copies + runs) — the app **flags the recommended mode** by load
  address. The result lands on a **new Dragon disk in the other pane**; test it with "Test Pane" before
  saving. (Games rewritten for the Dragon can't be byte-converted.)
- **Sort A-Z** — alphabetizes the active disk's directory. **Sort All** (containers only) — sorts every disk
  in the container (skipping art disks).
- **Copy Pane A → B** — duplicates the active A disk into B as a standalone `.dsk`.
- **Undo / Redo** (**Ctrl+Z** / **Ctrl+Y**) — undo/redo the last edits (insert, delete, rename, defrag,
  paste…). The stack restores **both panes**.
- **Save / Save As** — see section 8.
- **Test Pane** — mounts the disk in XRoar (drive 0). See section 9.
- **Write GW** — writes the disk to a physical floppy. See section 10.
- **?** (Help) — this manual.

---

## 5. Navigating containers (thousands of disks)

When you open a container (DriveWire/MiniIDE/CoCoSDC), the pane gains a disk selector:

- **◀ ▶** and a **number field** (physical drive #, 000–255) to jump directly.
- **🔎 Find disk** — opens a browser that searches by **disk name OR file name** (it indexes the files so you
  can find where a program lives). Click a result to open it in the pane.
- **Insert disk** (CoCoSDC) — writes a new `.dsk/.os9` into the FAT card (with confirmation, since it is real
  media).
- **OS-9 · {volume}** — opens the container's OS-9 partition in the OS-9 tab (read-only for safety).
- **Name/Rename** (MiniIDE) — sets/edits the drive's SIDEKICK catalog name.
- **Clear range** (eraser icon — file-backed MiniIDE/CoCoSDC) — opens a modal asking the range **From XX to YY**
  (PHYSICAL disk #) and replaces **every disk in the range with EMPTY images**, all at once (no need to go one
  by one). ⚠️ **PERMANENTLY ERASES** those disks' data in the file (art disks are skipped). Writes straight to
  the `.img` (like the per-disk "Save"). *Validated on real CoCo/MiniIDE.*
- **Write to CF card** (orange database icon — only when the pane is a file-backed `.img`/`.vhd` container) —
  writes the container image **straight to a CF/SD/USB card**. ⚠️ **ERASES the card.** Shows **only removable**
  drives (never the system disk): select the drive and click **"Write card"** (with a progress bar). The raw
  write needs Administrator, but **you don't have to launch the app as admin**: if you aren't elevated, **Windows
  asks for confirmation (UAC) only when writing** — approve the prompt. When done, a **success notice** appears;
  if Windows offers to "format", **ignore it** (the content is RS-DOS/OS-9, not FAT). *Validated on real
  CoCo/MiniIDE.* Alternative: balenaEtcher on the saved `.img`.

> **Clear pane** with a program being **edited in the BAS tab** from it and **unsaved** → the app **warns** you
> before closing (the text stays in the BAS tab).

Each disk is read **on demand** — opening a gigabyte container is instant. Opening a large container shows a
**progress bar** ("Scanning disks…" / "Reading FAT directory…").

### Inside the "Find disk" window
- The search box matches by **disk number/name/sub-label** and by **file name** (with an "Indexing files
  X/Y…" indicator while the index builds). When a hit comes from a file, it shows as **"↳ name.ext"** under
  the disk.
- Each item shows the **physical number (#000)**, the label, a **🎨** icon if it's an art disk, and a
  **shown/total** counter. The list renders up to **500** items — refine the search past that. Click to open.

### Special slot/disk states
- **📭 Empty slot** (CoCoSDC) — slot 000–255 holds no disk. **"Insert image (.dsk)"** and **"Format"**
  buttons appear right away; use ◀ ▶ to browse slots.
- **🚫 Disk in an unsupported format** — the container disk isn't standard RS-DOS (likely OS-9, double-sided
  or a headered JVC `.dsk`). Not editable here; move to another disk with ◀ ▶, or extract this one with
  **"Save As"**.

---

## 6. Disk map — see occupancy and fragmentation

The right column shows the **disk platter** in concentric rings (track 0 = outer ring, each slice = 1
sector). The central hub shows **% full**.

Colors: **USED** (cyan) · **FRAG.** (red, non-contiguous chain) · **FREE** (gray) · **DIR** (directory,
purple) · **SEL** (selected file, orange).

- Hover a cell: it **lights up the whole file** and shows a tooltip (name, tracks, granules, bytes, whether
  fragmented). Click to **select** the file.
- The status bar shows the disk's **% occupancy** and **% fragmentation**.

---

## 7. Defragment (DEFRAG)

Files scattered across many pieces (fragmented) slow the disk on real hardware and show up red on the map.

- **DEFRAG** (whole disk) — opens a dialog where you pick the final **order** (keep directory order /
  alphabetical / by size) and runs a **nostalgic floppy animation** reorganizing everything into contiguous
  blocks. It is **non-destructive** (rewrites into a new image; the pane becomes "unsaved"). You can
  **cancel mid-way**: the app asks **"Finish current file and stop"** (keeps what it already moved, without
  corruption) or **"Cancel all (discard)"**. At the end it reports "Fragmentation X% → Y%" plus how many
  files were moved / left "no contiguous room". If the disk is already 0% fragmented, the modal just says
  there's nothing to optimize.
- **DEFRAG FILE** — defragments only the selected file (needs a contiguous free gap; disabled if the file is
  already contiguous or on Dragon).

(On Dragon, defragmentation is always whole-disk.)

---

## 8. Saving your work

The **Save** button turns **yellow with a dot** when there are unsaved changes.

- **Save** — overwrites the source file (no dialog). On a MiniIDE/CoCoSDC container it asks for confirmation
  because it writes to **real media**. A new disk with no path → falls back to "Save As".
- **Save As** — writes a new file. The offered types depend on the disk:
  - **Dragon:** `.vdk` (native) or `.dsk` (raw).
  - **Single RS-DOS:** `.dsk` or **`.sdf` (CoCoSDC)**.
  - **Container:** `.dsk` (the current disk standalone).

### Format (left column, disk icon)
Wipes the pane's disk. **Quick** = clears only the directory/FAT (instant; old data can be "recovered" with
external tools). **Full** = zeroes everything with `0xFF`.

---

## 9. Test in XRoar (writing nothing)

**Test Pane** mounts the active pane's disk into the embedded emulator's **drive 0**. You choose **Test
without reset** (swap the disk live, keep what's running) or **Reset and test** (clean boot). The XRoar
machine follows the format (Dragon → Dragon; CoCo → CoCo). To run a specific file, **double-click** it → in the
**Send to…** hub pick **XRoar** (it does `RUN`/`LOADM:EXEC` automatically).

**Result:** you validate the disk/program instantly, without physical media.

---

## 10. Write to a real floppy (Greaseweazle)

**Write GW** sends the active pane's disk to the **GW** tab and writes it to a physical floppy (needs a
Greaseweazle board). The app already picks the right **format** from the disk's contents. Confirm the prompt
and watch the track map on the GW tab. Details in the GW tab Help.

---

## 11. Hex editor + 6809 disassembler

The **HEX/DISASM** button lives in the **global top bar** (right of the tabs) and turns **green** when the
modal is open. With a file selected in the list, it opens — side by side — a **hex editor** and a **6809
disassembler** for that file. It's the tool to study and tweak ML binaries.

**Hex editor:**
- Pick **8/16/24 columns** and the **character mode**: **green VDG** (green uppercase, inverse-video
  lowercase, and bytes ≥ 128 drawn as the VDG's **2×2 semigraphic** blocks) or **standard ASCII**.
- **Search** by hex (`1A 50` / `1A50`) or text, with an **N/total** counter and ◀ ▶ navigation between
  (highlighted) matches.
- **Edit:** click a cell and type in **HEX** (high nibble, then low — auto-advances) or **ASCII** (one key
  per byte); **arrow** keys navigate and **ESC** drops the selection. The footer shows **offset**, **ROM
  address** and the byte **value**.
- The vertical divider between hex and disasm is **draggable** (resizes the two panes).
- **Save Changes** writes the file back into the disk (with Undo support); **Cancel/Close** discards.

**6809 disassembler** (right pane):
- **Origin $** — the load address where code begins (taken from the `.BIN`).
- **Follow flow** (on) — follows execution from the entry point and separates **code** from **data/strings**
  (FCB/FCC); off does **linear** disassembly. The footer reports how much of the file became code.
- **Mark selection** (select a range in the hex with click + shift-click): force it as **Data**, **Code**,
  **C-vector** (table of code addresses, followed) or **D-vector** (table of data pointers). **Clear**
  removes the marks. Marks **persist per file** across sessions.
- It resolves CoCo hardware symbols (PIA, GIME, MMU, SAM, palette, vectors), labels on branches and the DP
  register. It is read-only (selectable text for copying).

---

## 12. "Art" disks (read-only)

Disks whose directory uses **semigraphic characters** (a drawing in the DIR) open **read-only**: you **list
and extract** normally, but editing is blocked so the art isn't scrambled (badge "🎨 art · 🔒 read-only").

---

## 13. Keyboard shortcuts (in the DSK tab)

**Ctrl+C** copy · **Ctrl+X** cut (no toolbar button) · **Ctrl+V** paste · **Delete** delete · **Ctrl+Z**
undo · **Ctrl+Y** (or **Ctrl+Shift+Z**) redo. In the list: **click** selects, **Shift+click** = range,
**Ctrl+click** = toggle individual files, **double-click** opens **Send to…**. **Drag** a row between panes:
**Ctrl** = copy, **Shift** = move; the **⠿ handle** drags out (to the PC).

---

## 14. Practical workflows (start to finish)

- **Build a game disk:** New (CoCo 35T) → Inject/drag the `.bin/.bas` → Sort A-Z → DEFRAG → Test Pane →
  Save As `.dsk`.
- **Copy a program from one disk to another:** open both disks (A and B) → select the file in A → drag it to
  B (or Ctrl+C / click B / Ctrl+V) → Save.
- **Pull a file off the disk to the PC:** select it → Extract (or drag the ⠿ handle to Explorer).
- **Check a write came out right:** select the file → Compare → pick the PC file → see "IDENTICAL" or the
  diff.
- **Find a program on a huge CoCoSDC card:** open the container → 🔎 Find disk → type the program name →
  click the result.
- **Get a real disk into the PC:** GW tab → Read → Pane A; **write a disk to a floppy:** Write GW.

---

## 15. Important notes
- RS-DOS/DECB is **single-sided** (160K/35T or 180K/40T). **Double-sided** disks are usually **OS-9** (OS-9
  tab) or containers.
- A disk that shows as "unsupported/illegible" is usually **OS-9, double-sided or header-bearing (JVC)** — if
  it's OS-9, the app offers to open it in the **OS-9 tab**; use ◀▶ or "Save As" to extract the data.
