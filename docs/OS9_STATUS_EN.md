# OS-9 / NitrOS-9 Support in CCC-converter — Status Report (English)

> CCC-converter is an Electron/React (TypeScript) tool for the TRS-80 Color Computer (CoCo)
> and Dragon. This document summarizes everything implemented for **OS-9 / NitrOS-9 (the RBF
> filesystem)**, how it was validated, what is still pending, and — in a dedicated section — the
> **SDF (CoCoSDC Structured Disk Format)**: what we know, what we have, and exactly what we still
> need to implement it. All format handling is **clean-room** (re-implemented in TS from the
> on-disk format, which is a non-copyrightable technical fact; no GPL/Toolshed code is embedded).
>
> Status date: 2026-06-08. App version at time of writing: 1.0.31.

---

## 1. Overview — what works today

OS-9/NitrOS-9 uses **RBF** (Random Block File manager): a hierarchical filesystem with
subdirectories, a per-file **File Descriptor (FD)**, and a **bit-per-cluster allocation map**.
Everything is addressed by **LSN** (Logical Sector Number), 256 bytes/sector; byte offset = LSN × 256.

Implemented (module `src/main/converter/os9.ts`, ~860 lines, clean-room):

- **Read**: full hierarchical browsing, file extraction, free-space, attributes, dates, module types.
- **Write**: create blank disk, mkdir, rename, insert file, delete file, defrag, recursive folder copy,
  in-place container-partition editing (with a system-area write guard), and **make a disk bootable**.
- **Detection**: a strict discriminator, run **before** RS-DOS (an OS-9 disk also passes the RS-DOS
  test, but not vice-versa). Order: **OS-9(strict) → Dragon → RS-DOS → unknown**.
- **UI** (`src/renderer/src/components/Os9Tab.tsx`): a dedicated "OS-9" tab with **two stacked
  Explorer-style panes** (hierarchical tree + file list + a "disk platter" media panel that shows the
  cluster allocation bitmap). Drag-and-drop between panes, from Windows, and out to Windows. A
  "Testar" (Test) button bridges the disk to the embedded **XRoar** emulator; a "Bootável" (Bootable)
  button makes a disk bootable; a **"Fechar"/Close (X)** button clears the image (back to the empty
  state); a status bar shows volume info + an "⚡ bootable / ○ non-boot" indicator.
- **"New…" dropdown** groups: **Blank** (158K/180K/360K/720K), **Bootable** (clone system), and
  **Bootable + programs** — each in 35T/40T/DS geometries. "Bootable" clones a reference bootable system
  disk (usable, with kernel + sysgo/startup/CMDS/SYS); "+ programs" also inserts chosen programs into
  CMDS and appends the `startup` so they auto-run at boot (engine `os9CloneBootable`; see §3).

---

## 2. On-disk format we implement (verified against real disks)

Big-endian fields, 256-byte sectors.

**LSN 0 — Identification sector (`DD.*`)**

| Field | Offset | Size | Meaning |
|---|---|---|---|
| DD.TOT | $00 | 3 | total sectors on the device |
| DD.TKS | $03 | 1 | track size (sectors/track) |
| DD.MAP | $04 | 2 | bytes in the allocation bitmap (at LSN 1) |
| DD.BIT | $06 | 2 | sectors per allocation bit (cluster size; power of two) |
| DD.DIR | $08 | 3 | LSN of the root directory's FD |
| DD.OWN | $0B | 2 | owner |
| DD.ATT | $0D | 1 | disk attributes |
| DD.DSK | $0E | 2 | disk id |
| DD.FMT | $10 | 1 | format (bit0 = sides, bit1 = density) |
| DD.SPT | $11 | 2 | sectors per track |
| **DD.BT** | **$15** | **3** | **LSN of the bootstrap file (boot track / KERNELFILE)** |
| **DD.BSZ** | **$18** | **2** | **bootstrap size in bytes** |
| DD.DAT | $1A | 5 | creation timestamp |
| DD.NAM | $1F | 32 | volume name (last char has bit 7 set) |

**Allocation bitmap** (from LSN 1, `DD.MAP` bytes): 1 bit per cluster (cluster = `DD.BIT` sectors);
bit set = used.

**File Descriptor (FD)** — one sector per file:

| Field | Offset | Size |
|---|---|---|
| FD.ATT | $00 | 1 (bit7 = directory; then s/pe/pw/pr/e/w/r) |
| FD.OWN | $01 | 2 |
| FD.DAT | $03 | 5 (last-modified: year-1900, month, day, hour, min) |
| FD.LNK | $08 | 1 (link count) |
| FD.SIZ | $09 | 4 (size in bytes) |
| FD.DCR | $0D | 3 (creation date) |
| FD.SEG | $10 | up to **48** segment entries × `{LSN 3B, sector-count 2B}`, zero-terminated |

A file's data = concatenation of its segments, truncated to `FD.SIZ` (files may be fragmented).

**Directory** = a regular file whose data is an array of **32-byte entries**: 29-byte name (last char
bit-7 set; first byte 0 = unused) + 3-byte LSN of the entry's FD. `.` and `..` always present.

**Variants handled:** Level 1 × Level 2; NitrOS-9 6809 × 6309; single/double-sided — the same code
reads all of them. Validated byte-for-byte against 19+ real OS-9 disks; **byte-perfect extraction
confirmed by OS-9 module CRC** (`0x800FE3`) over 1576 modules.

---

## 3. The CoCo OS-9 BOOT mechanism (important — two parts)

This was reverse-engineered from a real NitrOS-9 disk (`NOS9_6809_L2_v030300_coco3_40d_1.dsk`) and
cross-checked with the NitrOS-9 wiki. **Booting OS-9 on a CoCo requires TWO separate things:**

1. **Boot track / KERNELFILE.** The Disk BASIC `DOS` command loads **track 34** (track 34, side 0 =
   LSN `34 × SPT × sides`, `SPT` sectors) into `$2600` and **jumps to `$2602`**. That track holds the
   `REL`+`KRN` bootstrap. It is **not** a filesystem file — it is reserved directly in the allocation
   bitmap. (On the real 40-track/2-side disk: LSN 1224..1241, starting with bytes `4F 53` = "OS ".)
2. **OS9Boot file (BOOTFILE).** A **contiguous** file in the root holding the remaining modules.
   `DD.BT` = its data LSN, `DD.BSZ` = its byte size. Once `KRN` is running it reads LSN 0, finds
   `DD.BT`, and loads OS9Boot into RAM.

> **Bug we found and fixed:** our first `os9MakeBootable` wrote only part (2). Track 34 stayed empty,
> so `DOS` read nothing and silently returned (symptom: "typing DOS does nothing"). The fix
> (`os9MakeBootable(raw, refDisk)`) now **clones both** from a reference bootable disk of the same
> geometry: copies the boot track verbatim, reserves it in the bitmap, inserts the OS9Boot file, and
> writes `DD.BT/DD.BSZ/DD.FMT`. This is what Toolshed's `os9 gen -t <KERNELFILE> -b <BOOTFILE>` does.

**Caveat:** a "made-bootable" blank disk loads the **kernel**; a *usable* system (a shell prompt) also
needs the system files (`sysgo`, `startup`, `CMDS`, `SYS`). For a usable bootable disk from scratch you
must also clone those (or clone a full system disk).

**To test in XRoar:** machine = **CoCo 3 (512K)** for NitrOS-9 L2; mount the disk in **drive 0**; type
**`DOS`**. (The `DOS` command comes from the floppy-controller ROM, attached when a disk is mounted.)

**Loading programs at boot.** OS-9 auto-loads/runs programs at boot via (a) the **OS9Boot** bootfile
(merged modules are RAM-resident immediately — os9gen's module list); (b) the **`startup`** file in the
root (a shell script run by sysgo, like autoexec.bat); (c) a **turnkey init** (initial process = a
program instead of the shell). Our `os9CloneBootable(refDisk, programs[])` clones a reference SYSTEM disk
(so the result is usable, not kernel-only), inserts each program into **CMDS**, and **preserves** the
original `startup` while **appending** the program names — the system boots normally and then runs them.
This backs the "New › Bootable + programs" dropdown. (Validated structurally by `tools/os9clone.ts`,
12/12; real boot needs XRoar. The reference must have free space for the programs.)

---

## 4. Containers & adjacent formats

- **DMK** (track-level image) — read support (`dmk.ts`); decoded to raw sectors on open, then the RBF
  parser runs normally.
- **SDF** (CoCoSDC track-level image) — read support (`sdf.ts`, see §7); same de-track-to-raw pipeline.
- **FAT (CoCoSDC SD card / RetroRewind)** — read **and write** (`fat.ts`, FAT12/16/32, MBR partitions,
  LFN). Random-access I/O, so it works on multi-GB images without loading them. We can write-back an
  edited `.dsk`, insert a new one, or delete — updating both FAT copies and growing directories.
- A `.dsk` **inside** a FAT container that is actually OS-9 now routes to the OS-9 tab (editable).
- **MiniIDE / HDBDOS**, **DriveWire**, **CoCoSDC.VHD** (a raw OS-9 partition at offset 0) — all browsable.

---

## 5. Validation (test harnesses in `tools/`, compiled with `tsconfig.tools.json`)

| Harness | What it proves | Result |
|---|---|---|
| `os9probe.ts` | RBF parse across the corpus (L1/L2, 6809/6309, 35/40/80T, blanks) | pass |
| `os9real.ts` | Insert a file into **real bootable NitrOS-9 disks**, re-parse, all originals byte-identical, bootstrap preserved | **7/7** ×2 disks |
| `os9boot.ts` | Confirms OS9Boot is a contiguous file; `DD.BT` == its data LSN; `DD.BSZ` == its size | confirmed |
| `os9mkboot.ts` | `os9MakeBootable` clones the boot apparatus; boot track byte-identical to the real disk; reserved in bitmap; OS9Boot contiguous & identical | **13/13** |
| `fatrt.ts` | FAT write on synthetic FAT12 **and** FAT32 (insert/replace/delete/dir-growth) | **28/28** |
| `fatreal.ts` | FAT write on a **copy of the real 15.85 GB RetroRewind card** (write-back, insert/grow/shrink/delete, 40 witness files intact each step) | **10/10** |
| `dmkprobe.ts` | DMK decode → valid RBF | **4/4** |

Test corpus (gitignored) at `amostras/os9/nitros9-v3.3.0-6809-L2/`: the two NitrOS-9 disks, the
extracted OS9Boot module, a `MADE_BOOTABLE_360k.dsk` (our generated bootable disk), and a README with
the XRoar boot procedure.

---

## 6. Pending (OS-9)

1. **Confirm a real BOOT in XRoar** of the disks we wrote / made bootable — the one step that needs a
   human at the emulator (structure is validated; the actual boot is not yet human-confirmed).
2. **Full-system clone** to generate a *usable* bootable OS-9 disk from scratch (also copy
   `sysgo/startup/CMDS/SYS`, not just the boot apparatus).
3. **OS-9 write round-trip harness with module-CRC checking** (insert/delete/mkdir → re-parse → verify
   bitmap × segments and that module CRCs are unchanged).
4. **Toolshed `os9 dcheck`/`dir`** as an external cross-check oracle (not installed; license unclear →
   reference/execution only, never embed its code).
5. **Dragon-flavoured OS-9**: parser is filesystem-agnostic so Dragon OS-9 disks already open; pending
   is auto-switching XRoar to a Dragon machine when testing one.
6. **SDF** — see §7.

---

## 7. SDF (CoCoSDC Structured Disk Format) — what we have and what we need

### 7.1 What SDF is
SDF is the disk-image format designed by **Darren Atkinson** for the **CoCoSDC** SD-card floppy
emulator, for disks that are **non-standard or copy-protected** (anything other than 18 sectors/track
× 256 bytes/sector). The CoCoSDC's microcontroller (**ATmega328**) lacks the RAM to decode a raw
**DMK** flux stream in real time on the CoCo bus, so SDF is effectively **"pre-indexed DMK"**: each
track carries a **Sector ID Table** in its header so the firmware can locate sectors with instant RAM
lookups instead of scanning the track. It therefore supports variable sector sizes, mixed density, and
copy-protection (deleted address marks, deliberately-bad CRCs).

### 7.2 Relevance to OS-9
**Low — and this is a firm conclusion, not a gap.** OS-9/RBF disks are *standard* geometry (18×256)
and are distributed as `.dsk` / `.os9` / `.dmk`, **not** `.sdf`. SDF holds protected *games*, not OS-9
filesystems. So SDF does **not** block anything in the OS-9 work; it belongs to the broader
disk-image / copy-protected-game support. It is included here only for completeness.

### 7.3 The COMPLETE SDF specification (now known — see source in §7.5)
A user-supplied technical study (archived at `amostras/Arquitetura e Especificação do Formato de Imagem
de Disco SDF no Ecossistema OS.docx`) provides the full byte-level format. It also **confirmed our
boot-mechanism reverse-engineering 100%** (boot routines on Track 34 Sector 1 via cobbler/os9gen; DOS
command; OS9Boot file; Toolshed injects the boot into Track 34).

**File header (512 bytes):**

| Offset | Size | Field |
|---|---|---|
| 0x000 | 4 | `'SDF1'` (ASCII) — signature, version 1 |
| 0x004 | 1 | cylinders (max 80) |
| 0x005 | 1 | sides / heads (1 or 2) |
| 0x006 | 1 | write permission (0x00 = read/write; 0xFF = read-only) |
| 0x007 | 1 | nested-sectors flag (0x00 = no; 0x01 = yes → special copy-protection decoding) |
| 0x008–0x1FF | 504 | reserved (zeros) |

**Total file size = 512 + (C × S × 6656) bytes.**

**Track record (6656 bytes, physical order by (cylinder, side)):**

| Region | Internal offset | Size | Meaning |
|---|---|---|---|
| Track Header | 0x0000–0x00FF | 256 | Info record + Sector ID Table |
| Raw Track Data | 0x0100–0x1969 | 6250 | raw flux buffer (simulated 300 RPM track) |
| Padding | 0x196A–0x19FF | 150 | zero pad to align the record to 512 |

**Track header (256 bytes):** byte `0x00` = number of active Sector-ID entries; bytes `0x01–0x07`
reserved (0); `0x08–0xFF` = the **Sector ID Table** (up to **31 entries × 8 bytes** = 248 B; active
entries packed from the start, the rest zero-filled).

**Sector ID Table entry (8 bytes):**

| Offset | Size | Field |
|---|---|---|
| 0x00 | 2 (u16 LE) | **ID Field Offset** — bits 0–13: byte offset (from start of the Track Record) to the sector's ID header. **bit 14** = ID header in Single Density (FM). **bit 15** = CRC error in the physical ID field. |
| 0x02 | 2 (u16 LE) | **Data Field Offset** — bits 0–13: byte offset to the sector's data field. **bit 14** = Deleted Data Mark. **bit 15** = CRC error in the data block (intentional or physical). |
| 0x04 | 1 (u8) | physical cylinder (from the sector ID) |
| 0x05 | 1 (u8) | physical side / head (from the sector ID) |
| 0x06 | 1 (u8) | **logical sector number** (usually 1–18) |
| 0x07 | 1 (u8) | **sector size code** (0 = 128, 1 = 256, 2 = 512, 3 = 1024 bytes) |

**FM (single density) rule:** on single-density tracks each logical byte is stored **duplicated** in the
Raw Track Data (e.g. `0x55 0xAA` → `0x55 0x55 0xAA 0xAA`). This is exactly how our `dmk.ts` already
handles FM — so the DMK sector decoder is directly reusable.

**Read algorithm (cyl/side/sector → bytes):**
1. `TrackIndex = Cylinder × TotalSides + Side`
2. `FileOffset = 512 + TrackIndex × 6656`
3. read the 256-byte Track Header at `FileOffset`
4. `count = header[0x00]`; scan the Sector ID Table from `0x08` in 8-byte steps; match `entry[0x06]`
5. `dataOffset = u16LE(entry + 0x02) & 0x3FFF`; `flags = bit14 (deleted), bit15 (CRC err)`;
   `size = 128 << entry[0x07]`
6. read `size` bytes at `FileOffset + dataOffset` (de-duplicate if the ID's bit 14 marks FM)

**Write:** when a sector changes, recompute and rewrite its Data Field Offset (LE) and integrity flags
in the Track Header. **Empty SDF:** header (`SDF1` + cyl + sides) + C×S records of 6656; every track
header zeroed (0 sectors); Raw Track Data + Padding filled with `0xE5` or `0xF6`.

**Detection caveat:** the `.sdf` extension is *also* used by PC tools (SAMdisk) for the SAM Coupé "Sam
Disk Format" — a different format. Detect SDF-CoCoSDC by the **`SDF1` magic at offset 0**, never by
extension.

### 7.4 Status: SDF READING is IMPLEMENTED and VALIDATED (read-only)
Implemented in `src/main/converter/sdf.ts` (clean-room) and wired into `normalizeDiskImage()` (dmk.ts),
so every reader/extractor/drag-drop path that already de-DMKs now also de-SDFs transparently; `.sdf`
was added to the open-image / open-OS-9 dialog filters.
- **`isSdf(buf)`** — `'SDF1'` magic + exact size match (`512 + cyl×sides×6656`); detection by content,
  never by extension (avoids the SAM Coupé clash).
- **`sdfToRaw(buf)`** — walks each track's Sector ID Table, decodes each sector (FM bytes de-duplicated,
  same as our DMK decoder), places by physical (cyl, side) + sector id (interleave normalised), and
  reports `sectorsFound/Expected` + `protectedSectors` (deleted-DAM / bad-CRC counts).

**Validation (`tools/sdfprobe.ts`)** against a REAL sample — FHL Color FLEX 5.0.4 (`fhl_flex_5_0_4.sdf`,
35 cyl / 1 side; track 0 = 10 FM 256-B sectors, exactly as expected for FLEX) — cross-checked against
the SAME disk in DMK form via our already-validated `dmkToRaw`: **630/630 sectors identical (100%)**.
Sample kept at `amostras/sdf/`.

**Writing SDF is not implemented** (read-only, like DMK) — not needed for current flows. SDF relevance
to OS-9 remains low (OS-9 disks ship as `.dsk/.os9/.dmk`); this mainly helps open protected /
mixed-density (FLEX) disks distributed as `.sdf`.

---

## 8. Quick reference — key source files
- `src/main/converter/os9.ts` — RBF read + write engine + `os9MakeBootable` / `os9BootInfo`.
- `src/main/converter/fat.ts` — FAT read + write (CoCoSDC/RetroRewind).
- `src/main/converter/dmk.ts` — DMK decode + `normalizeDiskImage()` (de-DMK / de-SDF on read).
- `src/main/converter/sdf.ts` — SDF (CoCoSDC) decode (read-only): `isSdf` / `sdfToRaw`.
- `src/renderer/src/components/Os9Tab.tsx` — the OS-9 tab UI.
- `src/main/index.ts` — IPC handlers (`os9-*`, `image-fat-*`, `os9-make-bootable`, …).
- `tools/*.ts` — validation harnesses (compile with `tsconfig.tools.json`).
- `ROADMAP_OS9.md` — the living roadmap (phases 0–4 + O0–O6).
