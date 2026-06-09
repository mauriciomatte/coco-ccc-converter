# OS-9 / NitrOS-9 Tab (RBF filesystem)

This tab is an **OS-9/NitrOS-9 disk manager** (the **RBF** filesystem — with subdirectories, dates
and permissions, unlike the RS-DOS in the DSK tab). Here you **open, browse, edit, extract, create and
make bootable** OS-9 disks.

## Screen overview

When the tab is **empty** (no disk loaded), a **single panel** is shown with the open/create options —
to avoid duplicating the information. That first panel is **A (Top)**. As soon as you **open or create**
a disk, the **second panel (B / Bottom)** appears and the tab shows **two stacked explorers** (Top and
Bottom), Windows-Explorer style:

- **Tree (left):** the disk's folders (OS-9 has real subdirectories).
- **File list (center):** the selected folder's files — name, attributes, size and date.
- **Media panel (right):** the disk "platter" showing the allocation map (which blocks are used);
  hovering a file lights up its blocks.

Each explorer works on **an independent disk**. You can **drag files/folders from one to the other**
(copy), drag in from Windows to open, and drag out to Windows Explorer to extract.

## When the tab opens (empty state)

The start screen shows two actions:

1. **Open OS-9** — pick an existing OS-9 disk file (`.os9`, `.dsk`, `.dmk`, `.sdf`).
2. **New OS-9…** (dropdown) — create a new disk (see below).

Next to these there is a **? (Help)** button that opens this manual.

## Opening an OS-9 disk

Use **Open** (or drag the file onto the explorer). The app auto-detects an OS-9 disk and opens it
**editable**. Accepted formats: raw image (`.os9`/`.dsk`), **DMK** track image and **SDF** (CoCoSDC) —
all decoded to sectors on read. OS-9 disks inside large images (MiniIDE, CoCoSDC) also open here (see
"Container partitions").

## Creating a new disk — the "New…" menu

The **New…** menu has **three groups**, each offering the four geometries:

| Geometry | Tracks | Sides | Size |
|---|---|---|---|
| `158K` | 35 | 1 (SS) | 158 KB |
| `180K` | 40 | 1 (SS) | 180 KB |
| `360K` | 40 | 2 (DS) | 360 KB |
| `720K` | 80 | 2 (DS) | 720 KB |

> **SS** = single-sided. **DS** = double-sided.

### 1) Blank
Creates an empty, formatted OS-9 disk **from scratch**. No template needed. Ready for you to insert
files. Not bootable (it is a data disk).

### 2) Bootable (NitrOS-9 template)
Creates a disk that **boots** on the CoCo. Because the OS-9 "boot apparatus" (the boot track on Track
34 + the `OS9Boot` file + the system files) is version- and geometry-specific binary content — it
**cannot be synthesized** — the app **clones a NitrOS-9 system disk**. The result is a bootable AND
**usable** disk (kernel, `sysgo`, `startup`, `CMDS`, `SYS`).

**The app ships with built-in NitrOS-9 templates** for the **360K** and **720K** geometries (flagged
**"✓ template"** in the menu). For those, the disk is created **automatically**, with no prompt. For
**158K** and **180K** (flagged **"— your reference"**) there is **no** free OS-9 system for the CoCo at
that geometry, so the app asks you to point to a **reference disk of your own** (see next section).

### 3) Bootable + programs
Same as above, but in addition to cloning the system you choose **one or more programs**. They are
inserted into the **CMDS** folder and the app **preserves the original `startup` and appends** the
program names — so they **run automatically at boot**, without erasing the system startup.

> Programs must be **OS-9 executable modules**. And the reference disk must have enough **free space**
> for them.

## What the "template" (system seed disk) is

A **template** is a genuinely **bootable** OS-9/NitrOS-9 disk used as a seed: the app clones its boot
apparatus + system files into your new disk. It must be of the **SAME geometry** you chose (the app
validates and warns on mismatch).

**Built-in templates (nothing to do):**

| Geometry | Built-in template |
|---|---|
| **360K** (40T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — included in the app |
| **720K** (80T DS) | ✅ NitrOS-9 6809 Level 1 (CoCo) — included in the app |

> The built-in templates are **NitrOS-9** images, freely distributed by the Color Computer community
> (source under the GPL). Credits in the `NOTICE.txt` shipped alongside the templates.

> **Want to use YOUR own reference even for 360K/720K?** For each of those geometries the menu also
> offers a **"— your reference"** variant (in both *Bootable* and *Bootable + programs*). Pick it when
> you want a specific system version (e.g. NitrOS-9 6309, Level 2, or a disk you already configured)
> instead of the built-in template. You are never locked into the template.

**Geometries without a built-in template (you point to your own disk):**

| Geometry | Why | What to do |
|---|---|---|
| **158K** (35T SS) | NitrOS-9 is not built for 35 tracks; only the original **Tandy OS-9** exists, which is **proprietary** (cannot be bundled) | Point to a bootable 35T OS-9 disk of **your own** |
| **180K** (40T SS) | NitrOS-9 for the CoCo only comes in 40T/80T **double-sided**; 40T single-sided is a Dragon format | Point to a bootable 40T-SS OS-9 disk of **your own** |

**Where to get a reference disk** (for 158K/180K, or other system versions): the **Color Computer
Archive** hosts a huge collection of OS-9/NitrOS-9 disks and games — `https://colorcomputerarchive.com`
(*Disks → Operating Systems*). The official NitrOS-9 distribution is at `https://nitros9.sourceforge.io`.
Download a **bootable** disk of the desired geometry and point to it when the app asks.

> The template must be **truly bootable** (bootstrap field set). A utilities-only disk (no boot) is
> rejected.

## Toolbar (with a disk open)

- **Open / New…** — as above.
- **Save** — writes back to the source file (overwrite). For a freshly created disk it opens "Save As".
- **Save As** — writes a new `.os9`/`.dsk` **or as `.sdf` (CoCoSDC)** — choose the type in the dialog.
  When editing a `.sdf`, **Save** already re-writes SDF.
- **New folder** — creates a subfolder in the current folder.
- **Rename** — renames the selected item.
- **Extract** — saves the selected file to your PC.
- **Insert** — adds a file from the PC into the current folder.
- **Delete** — removes the selected file (or an **empty** folder); frees its blocks.
- **Test** — mounts the disk in the **XRoar** emulator (see below).
- **Bootable** — makes the **already-open** disk bootable (advanced; only injects the boot apparatus
  from a template — does not add system files). For a **usable** disk, prefer **New… → Bootable**
  (which clones the full system).
- **Close** — discards the image and returns to the empty state (confirms if there are unsaved edits).
- **?** — this Help.

> ⚠️ Don't confuse the **two "Bootable"** actions: the **New… one** creates a new, complete, usable
> disk; the **toolbar button** only injects boot into an already-open disk.

## Status bar

Shows the volume name, size, file/folder counts, free space, and a **⚡ bootable / ○ non-boot**
indicator (read from the disk's bootstrap fields).

## Test / boot in XRoar

The **Test** button opens a dialog with the target drive (D0–D3) and three modes:

- **Boot OS-9** — resets and types `DOS` (the Disk BASIC command that loads OS-9). Use with a
  **bootable** disk in drive 0.
- **Mount + Reset** — mounts the disk and reboots clean (inspect with OS-9 already running).
- **Mount (no reset)** — just mounts, without rebooting.

When testing OS-9 the app **auto-configures XRoar for OS-9**: **CoCo 3** machine (NitrOS-9 Level 2
requires it), **RGB** video, and the **Smooth** filter (makes 80-column text legible). Then use the
**Expand** button on the XRoar screen to make the image big and crisp.

> Tip: the BASIC `dir` command does **not** read an OS-9 disk (it shows garbage + FS ERROR) — that's
> normal. To see the disk you must **boot** OS-9 (`DOS`) and use OS-9's own commands.

## OS-9 partitions inside container images (MiniIDE / CoCoSDC)

Large images (CF/SD cards) can contain a whole **OS-9 partition**. When you open the image via the
DSK/browser, click the **OS-9** button to browse it here. For safety it opens **read-only**; to edit,
use **Enable editing** — edits then write **directly to the container file**, with a **guard that
protects the system area** (OS9Boot/SYS/CMDS/DEFS). Working on a **copy** of the container is
recommended.

## Defragment

When a file becomes scattered across several extents (fragmented), the media panel flags it. There are
**defrag** actions (per file and whole disk) that reorganize blocks to be contiguous, preserving the
contents.

## Quick recap

- **Just want a blank disk:** New… → Blank → size.
- **Want a disk that boots (360K/720K):** New… → Bootable → `360K`/`720K` — done, it uses the built-in
  template **automatically**.
- **Want a bootable 158K/180K:** New… → Bootable → size → point to a system disk of **your own**
  (see "What the template is" → Color Computer Archive).
- **Want it to boot and run my programs:** New… → Bootable + programs → (template) + programs.
- **Want to test in the emulator:** Test → Boot OS-9 → Expand.
