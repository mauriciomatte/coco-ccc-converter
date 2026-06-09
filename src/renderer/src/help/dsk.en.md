# DSK Tab — RS-DOS / Dragon Floppies

The **DSK** tab is the editor for CoCo **floppy disk images** (RS-DOS / Disk BASIC) and **Dragon**
(Dragon DOS / `.vdk`). It has **two panes** (A and B) side by side to compare, copy files between disks
and build collections.

## The two panes (A and B)
Each pane opens an independent image. The **active pane** (highlighted) is the target of the toolbar
actions — click a pane to make it active. To the right of each pane are the **file list**, the **disk
map** and a **status bar** with occupancy and fragmentation.

## Toolbar (buttons)
- **New** — creates a blank disk in the chosen format (see "Create a new disk").
- **Import image** — opens `.dsk`/`.vdk`/`.jvc`/**DMK**/**SDF** and **container** images (DriveWire,
  MiniIDE, CoCoSDC).
- **Inject** — inserts a PC file (`.bin`/`.bas`/`.cas`…) into the active disk.
- **Copy / Cut / Paste** — a **file** clipboard: copy/cut a file from one disk and paste it into another
  (or the same). **Delete** removes the selected file.
- **Undo / Redo** — undo/redo the last disk edits (insert, delete, rename, defrag…).
- **Sort A-Z** — alphabetizes the directory of the **active disk**. **Sort All** — sorts every disk in a
  **container**.
- **Copy Pane A → B** — copies pane A's **active disk** into pane B as a standalone `.dsk`.
- **Test Pane** — mounts the active pane's disk in **XRoar** (drive 0) to test instantly.
- **Write GW** — writes the active pane's disk to a **physical floppy** (GW / Greaseweazle tab).
- **Save / Save As** — writes the disk (see "Saving").
- **?** (Help) — this help, at the right of the toolbar.

## Open / import images
- **Import image** opens: `.dsk` (RS-DOS), `.vdk` (Dragon), `.jvc`, **DMK** (track image), **SDF**
  (CoCoSDC) and large **container** images — **DriveWire** (many disks in one file), **MiniIDE/HDBDOS**
  and **CoCoSDC** (FAT card). Containers open as a navigable collection.
- **Dragging** a disk file from Windows onto the pane also opens it.
- Dropping a file on an **empty pane** creates a new `.dsk` with that file already inside.

## Navigating containers (many disks)
When you open a container, the pane gains a selector: **◀ ▶** arrows, a **disk number** field, and a
**magnifier ("Find disk")** that searches by **disk name OR file name**. Each disk is read on demand
(it does not reload the whole image).

## Create a new disk
**New** creates a blank disk in the pane's format ("New: format" selector in the status bar):
**CoCo 35T** (standard DECB, 160K), **CoCo 40T** (JDOS/CODIMEX, 180K) or **Dragon 40T**. Then just insert
files and save. (There is also an option to **re-create** the image in another format keeping its files.)

## Working with files
- **Extract**: drag the file out (to Windows) or use copy/paste.
- **Inject/Insert**: adds `.bin`/`.bas`/`.cas`… to the disk. A `.cas` is interpreted: each program on the
  tape becomes a file (ML → `.BIN` with a LOADM preamble; BASIC → `.BAS`; data → `.DAT`).
- **Rename / Delete** the selected file.
- **Double-click** a file: mounts the disk in XRoar and **runs** it (RUN for BASIC, LOADM/EXEC for
  machine code). The XRoar machine follows the disk's format (CoCo/Dragon).

## Drag and drop
- **Between panes A ↔ B:** drag a file from one pane and drop it on the other. **Ctrl** = copy,
  **Shift** = move (the highlight shows the action).
- **From Windows into a pane:** drag a `.dsk`/image (opens) or a `.bin`/`.bas`/`.cas` (inserts; on an
  empty pane it creates a new `.dsk`).
- **From a pane to Windows:** drag a file from the list to the Explorer to **extract** it.

## Disk map and defragmentation
On the right is the **disk map** (concentric rings): tracks/sectors color-coded —
**used / free / directory / fragmented / selected**. Hover for details; clicking a cell selects the file
occupying it. Geometry is auto-detected (35/40 tracks). The **status bar** shows **% occupancy** and
**% fragmentation**.
- **DEFRAG** — reorganizes the disk (with a nostalgic floppy animation) making files contiguous; pick the
  order (keep / alphabetical / by size); you can cancel mid-way with a partial result.
- **DEFRAG FILE** — defragments only the selected file.

## "Art" disks (read-only)
Some disks have names made of **semigraphic characters** (directory art). They are listable and
extractable, but stay **read-only** (editing blocked) so the drawing isn't scrambled.

## Hex / 6809 disassembler (HEX/DISASM button)
Opens a **hex editor** and a **6809 disassembler** side by side, to inspect the bytes/code of a selected
file. You can set the **origin address**, toggle **flow** (recursive-descent) vs linear, and **mark**
regions as **code / data / vector table** — handy for studying ML binaries.

## Saving
- **Save** — overwrites the source file.
- **Save As** — writes a new `.dsk`/`.vdk`. For a single RS-DOS disk, the dialog also offers the **`.sdf`**
  type (CoCoSDC) — see "SDF images".
- **Write back into the container** — when editing a disk from **MiniIDE** or **CoCoSDC**, "Save" can
  write the disk **back into the container slot/file** (with confirmation, since it may be your real
  media). Working on a **copy** is recommended.

## SDF images (CoCoSDC)
`.SDF` is the **CoCoSDC** format for non-standard / protected / mixed-density disks (a "pre-indexed DMK").
The app **reads** SDF (open/extract/edit) and **writes** SDF for standard geometry (RS-DOS, 256 B/sector):
in "Save As", choose the **`.sdf`** type. Detection is by content (the `SDF1` signature), not by
extension. (FM/protected layouts: reading yes; generation no.)

## Writing to a real floppy (Greaseweazle)
**Write GW** sends the active pane's disk to the **GW** tab and writes it to a physical floppy (needs a
Greaseweazle board). See the GW tab's Help.

## Important notes
- RS-DOS/DECB is **single-sided** (160K/35T or 180K/40T). **Double-sided** disks are usually **OS-9**
  (use the OS-9 tab) or containers.
- A disk that shows as "unsupported/illegible" in the pane is usually **OS-9, double-sided or
  header-bearing (JVC)** — if it's OS-9, the app offers to open it in the **OS-9 tab**.
