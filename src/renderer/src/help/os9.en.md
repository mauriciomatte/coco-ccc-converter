# OS-9 / NitrOS-9 Tab (RBF filesystem)

This tab is an **OS-9/NitrOS-9 disk manager** — the **RBF** filesystem, with real subfolders, dates,
attributes and permissions (different from the RS-DOS of the DSK tab). Here you **open, browse, edit,
extract, create, make bootable, defragment and test** OS-9 disks, and even browse **OS-9 partitions inside
cards** (MiniIDE/CoCoSDC). By the end of this guide you will know how to build a bootable, usable OS-9 disk
from scratch, move files between disks, and write back into a card safely.

---

## 1. The screen: two explorers (Top and Bottom)

The tab stacks **two independent explorers** — **Top** and **Bottom** — split by a draggable divider. While
**no** disk is open, only the Top is shown (full height). When you open/create a disk, the second explorer
appears and you can **drag files/folders from one to the other** (copy).

Each explorer has three areas:
- **Tree (left):** the disk's folders (OS-9 has real subfolders). Each folder with subfolders has a
  **chevron** (▸/▾) to **expand/collapse**; a **single click** on the name **selects** the folder (shows its
  contents in the list). The root shows the **volume name** (or `/`).
- **List (center):** the files in the selected folder — columns **Name, Attributes, Size, Modified**. Folders
  come first; a **single click** selects an item; a **double-click** on a **folder** enters it, on a **file**
  **extracts** it. Large, truncated folders show a trailing **`…`**.
- **Media panel (right):** the disk "platter" with the per-cluster occupancy map (section 8). At its top there
  is a **state badge** for the disk (**editable / unsaved / read-only**) next to the file name.

Each explorer works in **one of three modes**: **EDITABLE** (in-memory disk — New/Open/dropped: all
operations + Save); **READ-ONLY** (a container partition, view/extract only); **CONTAINER EDIT** (writes
straight into the card file — section 9).

> The two explorers are labelled **Top** and **Bottom** (a purple badge in the toolbar corner). The **divider**
> between them is draggable (20–80% of the height); **Esc** cancels a drag in progress.

---

## 2. Empty state: how to start

When the tab has no disk, you see:
1. **Open OS-9** — pick an existing disk (`.os9`, `.dsk`, `.dmk`, `.sdf`).
2. **New OS-9…** (list) — create a new disk (section 4).
3. **? (Help)** — this manual.

On create/open, any error (e.g. an incompatible template) is shown right there in red; "Working…" means the
app is busy.

---

## 3. Opening an OS-9 disk

Use **Open** (or **drag** the file from Windows onto the explorer). The app detects the format, converts
DMK/SDF on read, and opens **editable**. OS-9 disks that show as "illegible" on the DSK tab (double-sided,
JVC) are **routed here automatically**. If there are unsaved edits, the app asks before switching.

---

## 4. Creating a new disk — the "New…" menu

The **New…** menu has **three groups**, each with the four geometries:

| Geometry | Tracks | Sides | Size |
|---|---|---|---|
| `158K` | 35 | 1 (SS) | 158 KB |
| `180K` | 40 | 1 (SS) | 180 KB |
| `360K` | 40 | 2 (DS) | 360 KB |
| `720K` | 80 | 2 (DS) | 720 KB |

> **SS** = single-sided. **DS** = double-sided.

### 1) Blank
Creates an empty, formatted OS-9 disk **instantly**. No template needed. Ready for files. **Not bootable**
(it is a data disk).

### 2) Bootable (NitrOS-9 template)
Creates a disk that **boots** and is **usable** (kernel, `sysgo`, `startup`, `CMDS`, `SYS`). Because the OS-9
boot apparatus (the boot track on Track 34 + the `OS9Boot` file + system files) is version- and
geometry-specific binary content — it **cannot be synthesized** — the app **clones a system disk**.
- **360K and 720K** ship a **built-in NitrOS-9 template** (the **"✓ template"** options): the disk is created
  **automatically**, with no prompt.
- **158K and 180K** (the **"— your reference"** options): there is no free OS-9 system for the CoCo at those
  geometries, so the app asks for a **reference disk of your own** (see section 5).

### 3) Bootable + programs
Same as above, but besides cloning the system you choose **one or more programs**: they go into the **CMDS**
folder and the app **preserves the original `startup` and appends** their names — so they **run at boot**. The
programs must be **OS-9 executable modules** and the disk must have enough free space (if not, the app reports
the needed size × free).

> After creating a bootable disk, it opens editable and **unsaved**: test the boot in XRoar (section 7) and
> use **"Save As"**.

---

## 5. The "template" (system seed disk)

A **template** is a genuinely **bootable** OS-9/NitrOS-9 disk used as a seed: the app clones its boot
apparatus + system files. It must be of the **SAME geometry** you chose (the app validates and rejects a
mismatch or a non-bootable disk).

**Built-in templates (nothing to do):**

| Geometry | Built-in template |
|---|---|
| **360K** (40T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — included in the app |
| **720K** (80T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — included in the app |

> The built-in templates are **NitrOS-9** images, freely distributed by the Color Computer community (source
> under the GPL). Credits in the `NOTICE.txt` shipped with the templates.

> **Want your OWN reference even for 360K/720K?** Each of those geometries also has a **"— your reference"**
> variant (in *Bootable* and *Bootable + programs*). Use it when you want a specific version (e.g. NitrOS-9
> 6309, Level 2, or a disk you already configured) instead of the built-in template. You are never locked in.

**Geometries without a built-in template (you point to your own disk):** **158K** (35T) — only the proprietary
original Tandy OS-9 exists; **180K** (40T single-sided) — CoCo NitrOS-9 only comes double-sided (40T-SS is a
Dragon format). **Where to get** a reference disk: the **Color Computer Archive**
(`colorcomputerarchive.com`, *Disks → Operating Systems*) and the official **NitrOS-9** distribution
(`nitros9.sourceforge.io`). Download a **bootable** disk of the desired geometry and point to it when asked.

---

## 6. Toolbar (with a disk open)

- **Open / New…** — as above.
- **Save** — overwrites the source file (turns green when there are changes). A freshly created disk opens
  "Save As" the first time.
- **Save As** — writes a new `.os9`/`.dsk` **or `.sdf` (CoCoSDC)** — choose the type in the dialog. Editing a
  `.sdf` and saving re-writes SDF.
- **New folder** — creates a subfolder in the current folder. Opens a **name field** (up to 28 chars; `/` `\`
  and non-ASCII characters are stripped automatically). **Enter** confirms, **Esc** cancels.
- **Rename** — renames the **selected** list item (same name field; disabled with no selection).
- **Extract** — saves the selected file to the PC (also via **double-click** on the file).
- **Insert** — adds a PC file into the current folder (opens the system file dialog).
- **Delete** — removes the selected file (or **empty** folder) and frees its clusters (asks first).
- **Test** — mounts the disk in **XRoar** (in-memory disks only — section 7).
- **Bootable** — makes the **already-open disk** bootable (advanced; injects only the boot apparatus — **not**
  the system files). For a **usable** disk, prefer **New… → Bootable**. ⚠️ If the current disk **has no
  system** (no CMDS/"shell"), the app **warns** and offers, right there, to create a **"Bootable WITH
  system"** (clones the template of the same geometry) — so you fix it on the spot instead of hitting
  "BOOT FAILED".
- **Close** — discards the on-screen image (asks if there are unsaved edits).
- **?** — this Help.

> ⚠️ Don't confuse the two "Bootable": the **one in the New… menu** creates a new, complete, usable disk; the
> **toolbar button** only injects boot into an already-open disk.

> **Loss protection:** whenever there are **unsaved edits** and you **Open**, create **New**, **drag in another
> disk**, or **Close**, the app pops an **"Unsaved changes"** modal with **Cancel / Discard / Save & continue**
> (if the save is cancelled, the action does not proceed). The state badge shows **"unsaved"** (amber) whenever
> there are pending changes.

---

## 7. Test / boot in XRoar

The **Test** button (disabled for container partitions) opens a dialog with a **drive dropdown (D0–D3)** —
**D0** is the boot drive — and three action buttons:
- **Boot OS-9 (DOS / BOOT)** — resets and types the **OS-9 boot command**. On the **CoCo** it is `DOS`; on the
  **Dragon** it is `BOOT` — the app picks it **automatically** by platform and the button label changes. Needs
  a **bootable** disk in **drive 0**.
- **Mount + Reset** — mounts on the chosen drive and reboots clean (you inspect with OS-9 already running).
- **Mount (no reset)** — just mounts on the chosen drive, leaving what's running untouched.

When testing, the app **already prepares XRoar for OS-9**: **CoCo 3** machine (NitrOS-9 Level 2 requires it),
**RGB video** and the **Smooth filter** (makes 80-column text legible). Then use **Expand** on the XRoar
screen for a large, sharp picture.

> **Test** only works with **in-memory** disks (New / Open / standalone) — not with a container partition (the
> emulator's floppy is too small). To **inspect a data disk**, mount it on a drive and, with OS-9 **already
> running**, use `dir /dX` (X = drive number). And remember: the **BASIC** `dir` command **cannot** read an
> OS-9 disk (shows garbage + FS ERROR) — that's normal; to see the disk you must **boot** OS-9 and use OS-9's
> own commands.

---

## 8. Media panel (the disk "platter")

On the right, a circular disk shows **per-cluster occupancy**:
- Colors: **USED** (teal, full cluster) · **PARTIAL** (amber) · **FREE** (gray); the hovered cluster lights
  white, and the selected/hovered file turns **magenta**. The central hub shows **% full**.
- Hover the tree/list and the panel **lights up the clusters** of that file/folder. **Click a platter cell**
  to **select the file** occupying it (the tree navigates to it).
- **Stats** below: KB used/free, clusters used/total and the cluster size.
- **Defrag** (with a fragmented count) and **Defrag file**: compact data into contiguous clusters. Available
  only on an **editable** disk (not in a container). "Defrag file" needs a selected file with more than one
  segment.

---

## 9. OS-9 partitions inside cards (MiniIDE / CoCoSDC)

Large cards can contain a whole **OS-9 partition**. Open the card on the DSK tab and click the **OS-9** button
— the partition opens here **read-only** (for safety).

To edit, click **Enable editing**: from then on, operations (new folder, rename, insert, delete) write
**straight into the card file** — there is **no "Save/Undo"**. The **system area** (OS9Boot/SYS/CMDS/DEFS) is
**protected** (only user folders can change) and every write is validated before writing. The badge
**"⚠ edits write to file"** appears. **Recommended: work on a COPY of the card.** (Test and Defrag are
unavailable on a container partition.)

---

## 10. Moving/copying files and dragging to Windows

- **Between the two explorers:** drag a file or folder from one to the other — it is **copied** into the
  **currently selected folder** of the target (folder = recursive copy, with a dir/file count). A dashed green
  highlight shows the drop target; a floating **toast** at the bottom confirms "✓ copied. Remember to Save."
  (click it to dismiss). Dropping onto the **source** list itself does nothing; a read-only target is refused.
- **From Windows into the explorer:** drag a disk to **open** it (green "Drop to open the OS-9 disk" highlight).
  Works even in the empty state. If there are unsaved edits, the app **confirms** first (Cancel / Discard /
  Save & continue).
- **From the explorer to Windows:** use the **⠿** handle to the left of a **file** to drag it straight to
  Windows Explorer (extracts the real contents). Only files have a handle, not folders.

---

## 11. Status bar

Shows: volume name · size · sides (1/2) · file/folder counts · free space · a **⚡ bootable** indicator (with
the OS9Boot LSN/size) or **○ non-boot**, the platter legend, and a card with the state (**unsaved / saved /
read-only**) + an occupancy bar.

---

## 12. Practical flows
- **Empty data disk:** New… → Blank → size → Insert files → Save As.
- **A disk that boots (360K/720K):** New… → Bootable → `360K`/`720K` (✓ template) → Save As → Test → Boot
  OS-9.
- **Bootable with a specific system version:** New… → Bootable → "— your reference" → point to your NitrOS-9
  disk of the same geometry.
- **Bootable that already runs my programs:** New… → Bootable + programs → (template/reference) + choose the
  modules → Save As → Test.
- **Copy a utility from one disk to another:** open both → drag the file from Top to Bottom → Save.
- **Edit a CoCoSDC card:** (make a copy) → DSK opens the card → OS-9 button → Enable editing → edit.
