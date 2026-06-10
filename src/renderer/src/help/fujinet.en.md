# FujiNet / Direct Online Access Tab

The **FujiNet / Direct Online Access** tab connects the app to the CoCo/Dragon **FujiNet/TNFS** network
ecosystem. It has two sides, side by side:

- **Left — Access servers:** **download** images/files from **links** and from **TNFS hubs** into the app
  (then edit/convert them like any other image).
- **Right — WiFi server (FujiNet):** turn your PC into a **file server** that your **FujiNet** board mounts
  live over the network.

All connection/error messages appear in the **console** (bottom), like the other tabs. The **?** button
(top-right) reopens this help.

> The FujiNet board talks to the **CoCo** and the **Internet** — the app's role is to be the **source/server
> of images**, not a "driver" for the board.

---

## LEFT SIDE — Access servers

Two ways to bring images in: the **FujiNet-native** one (TNFS, on top) and the **manual** one (URL, below).

### 1) TNFS servers (FujiNet hubs)

The "FujiNet" way to access files over the network (TNFS is **UDP, port 16384**). Each control in the block:

- **"— choose server —" dropdown:** a ready-made list with two groups:
  - **My servers** — your saved **favorites**.
  - **Community (live)** — fetched from the public `fujinet.online/tnfs-server-status` list. Servers that are
    **UDP-down** show "(UDP down)" and are **disabled** (TNFS is UDP; no UDP means no listing).
  - Picking an item **connects immediately** (using the favorite's start folder, if any).
- **"Manage" button (★):** opens the **favorites modal** (detailed below).
- **Host field:** type the server address (e.g. `tnfs.fujinet.online`, or an IP/host on your network).
  **Enter** connects.
- **★ (star, next to the host):** **saves the current host** to favorites (turns gold when the host is already
  a favorite).
- **"Connect" button:** opens the server listing. Turns **orange with a spinner** while searching and **green**
  when connected.
- **"Disconnect" / "Abort" button:** while **connecting** it becomes **"Abort"** and **really cancels** the
  attempt (closes the socket, doesn't wait the ~12 s of retransmission of a down server). When already
  connected it becomes **"Disconnect"** and **clears the listing** (TNFS is per-operation; there is no held
  connection).

**Browsing the listing (after connecting):**
- **Path bar** with the **↑** button (go up one level) and the current path.
- **Folders** (purple icon) — click to **enter**.
- **Files** — click to **download and open** in the active pane. Size shows in **KB** on the right.
  - **OS-9** disks go automatically to the **OS-9** tab; the rest opens on the **DSK** tab.
  - **`.zip`** is unzipped on the fly (see "Open by URL").
  - **Large downloads:** TNFS transfers **512 bytes per round-trip**, so big files are slow. Above **4 MB** the
    app **asks for confirmation** first (files that size are usually CoCoSDC card images, not floppies). During
    the download a **progress bar** (KB and %) appears with a **Cancel** button.

> E.g.: `tnfs.fujinet.online` → **COCO** folder → `news.dsk` / `weather.dsk` / `wiki.dsk`…

### 2) "Manage" modal (favorites + community)

Opened by the **Manage (★)** button. Three areas:

- **Add server:** **host** (required), **label** (optional, friendly name) and **start folder** (optional, e.g.
  `/COCO`) fields + **Add** button.
- **Favorites list:** each item shows the name (label/host + folder) with a button to **connect** and a **trash**
  icon to **remove**.
- **Community (live):** the **Refresh** button re-fetches the public list; each server shows **UDP ✓/✗**, a
  button to **connect** (disabled if UDP-down) and the **★** to **save to favorites**.

> **Why don't I see the same servers as my FujiNet board?** The app doesn't read the board's config (it talks
> to the CoCo + Internet, not the PC). To access another server, **type its host** (or save it to favorites).
> The board's own **SD card** isn't reachable over the network; servers needing a **login** (user/password)
> aren't supported yet.

### 3) Open by URL (HTTP/HTTPS)

A generic convenience, below the TNFS block:

- **URL field:** paste a direct **link** to a `.dsk/.vdk/.sdf/.os9/.dmk/.jvc/.img/.vhd/.ccc/.cas/.bin/.rom`…
  (or a **`.zip`** containing one). **Enter** or the **Open** button download it.
- **"Open" button:** downloads the file (follows redirects, ~30 s timeout, up to ~64 MB) and **opens it in a
  pane** — OS-9 goes to the **OS-9** tab, the rest to the **DSK** tab. From there it's the normal pipeline:
  edit, inject, convert, disk map, test in XRoar, write GW.

> **`.zip` files (e.g. Color Computer Archive):** the app **unzips automatically**. If the ZIP has **one**
> recognizable image, it opens directly; if it has **several**, a **picker** appears so you can choose which.

---

## RIGHT SIDE — WiFi file server

The app becomes a **TNFS server** (UDP **16384**) that your **FujiNet** mounts live — you edit/organize here
and the **CoCo sees it instantly**, with no floppy or reflash. Compatible with the **real FujiNet file
browser** (implements the extended directory commands the firmware uses).

### "Settings" block — each control

1. **Source (Folder / Container):**
   - **Folder** — serves a PC folder with various files.
   - **Container** — serves a `.img/.vhd/.dsk` from **MiniIDE / CoCoSDC / DriveWire**; **each inner disk** is
     exposed as a separate `.dsk`.
2. **Path field (typable, with history):** a **single** field where you **paste/type** the path **or** pick a
   **recent** one from the dropdown arrow (recents are kept across sessions). The **folder** button next to it
   opens the **system picker** (folder in Folder mode, file in Container mode). Picking a recent from another
   mode **switches the mode** automatically.
3. **Access (Read-only / Read-write):**
   - **Read-only** (default) — the CoCo only reads.
   - **Read-write** — the CoCo can **create/overwrite** real files. *Available only in **Folder** mode*
     (Container is always read-only).
4. **"Hide files from FujiNet" button:** opens the manager for files that are **not** sent to the FujiNet
   (see below). Only shown in **Folder** mode.
5. **"Port" line:** reminds you it's **16384 (UDP)** and the current access mode.
6. **"Start server" / "Stop server" button:** starts/stops the server. While running, a **"live"** badge
   appears at the top of the block.
7. **Allow the port through the firewall** (essential step, below).

### Allow the port through the firewall (essential)

For the FujiNet to **reach the server**, the **Windows Firewall must allow UDP 16384**. Without it, even with the
right IP, the board **won't connect** (or connects and lists nothing). Allow **UDP 16384** for both the **Public
AND Private** profiles (WiFi is sometimes classed as "Public"). If it fails **only on WiFi**, it's almost always
the firewall profile.

### Green box (with the server running) — which IP to use

When started, a **green box** shows the PC's **IP(s)** and the port. Each IP has a **copy** button. Put the IP
in a **host slot** on your FujiNet.

- If the PC has **more than one network** (e.g. Ethernet **and** WiFi), the box lists them all and **highlights**
  the one tagged **"network ✓"** — that's the interface with **a route out** (default route), the only one the
  FujiNet can actually reach. **Use that one.** The others are dimmed (tags "WiFi"/"wired").
- The FujiNet and the PC must be on the **SAME network** (same router/subnet). An IP from a WiFi with **no
  gateway** (e.g. a Windows Hotspot `192.168.137.x`) **won't work** — that's why it gets **no** "network ✓" tag.
- **Windows Firewall:** allow **UDP 16384** for both the **Public AND Private** profiles (WiFi is sometimes
  classed as "Public"). If it fails only on WiFi, it's almost always the firewall profile.

### "Shared files" block

Lists (with a count) what **will be / is being** served — updated as soon as you pick the folder/container,
**before you even start** the server, so you can check it.

> **System files are hidden automatically.** The server **does not transmit** `desktop.ini`, `Thumbs.db`,
> `.DS_Store` and other **Windows, macOS and Linux** system files (and dotfiles starting with "."). Without
> this, the FujiNet sometimes auto-selected `desktop.ini` instead of the disk. These files don't appear in the
> list and can't be downloaded.

### Managing "Hide files from FujiNet" (button)

The **Hide files from FujiNet** button (Folder mode) opens a manager with three parts:
- **Built-in defaults** — the embedded list (Windows · macOS · Linux) + anything starting with ".". Not editable.
- **Also hide (your patterns)** — add **more** names/patterns to hide. Accepts **wildcards** `*` and `?`
  (e.g. `*.tmp`, `~$*`, `readme.txt`).
- **Never hide (exceptions)** — terms that **must show** even if they match a built-in pattern (handy if an
  embedded one gets in the way). The exception **wins** over the pattern.

Changes are **saved** and apply when you **(re)start** the server; the "Shared files" preview reflects the
filter immediately.

### Read-write (writing from the CoCo)

In **Folder** + **Read-write** mode, the real CoCo can **create** and **overwrite** actual files in your
folder (e.g. `SAVE`, or write a sector of an image mounted as a drive). Caveats:
- **One client at a time** is the safe use (no concurrency lock).
- Writing is **slow** (512 bytes per round-trip, like reading) — great for small files.
- **Container is always read-only** (writing inside a MiniIDE/CoCoSDC/DriveWire image would require remapping
  sectors with corruption risk — left for a future phase).
- A write is only committed when the CoCo **closes** the file; write messages appear in the **console**.

---

## Persistence, console and limits

- **Persistence:** favorites, last host, server source (folder/container), path, access mode and the **recent
  folders** are **remembered** across sessions. The tab stays mounted → the listing/path **survive tab switches**.
- **Console (bottom):** tracks downloads, client connections to your server, writes and errors.
- **Not supported yet:** TNFS login (user/password), access to the **board's own SD card**, and **writing into a
  container** (MiniIDE/CoCoSDC/DriveWire).

## Quick summary

- **Download and use:** Open by URL / TNFS hub → the file opens in a pane → edit normally.
- **Serve to the FujiNet:** choose a folder/container → (optional) **Read-write** → **Start server** → copy the
  **"network ✓"** IP → put it in a FujiNet **host slot** (port 16384/UDP) → allow UDP 16384 through the firewall.
