# Servers Tab (FujiNet WiFi + DriveWire serial)

The **Servers** tab connects the app to the CoCo/Dragon — over **WiFi** (FujiNet/TNFS) and over a **serial
cable** (DriveWire). It has **three panels**, side by side (with draggable **splitters** between them):

- **Left — Access servers:** **download** images/files from **links** and from **TNFS hubs** into the app
  (then edit/convert them like any other image).
- **Middle — WiFi server (FujiNet):** turn your PC into a **file server** that your **FujiNet** board mounts
  live over the **network**.
- **Right — DriveWire server (serial):** serve up to **4 drives** to a real CoCo over a **serial cable** (no WiFi).

All connection/error messages appear in the **console** (bottom), like the other tabs. The **?** button
(top-right) reopens this help.

At the **top of the tab** there are two **hubs** that act on the **file you download** from a server (left-side
client):
- **Send to…** — chooses **where to route** the downloaded disk: **DSK pane** (if **RS-DOS**), **OS-9 tab** (if
  **OS-9/NitrOS-9**), **XRoar** (test in the emulator) or a **DriveWire drive** (with a **D0–D3** selector).
- **Save file…** — **saves** the downloaded disk: **Save to PC** (free dialog) or **Save & point on Wi-Fi**
  (drops into the folder served by the WiFi server, so the FujiNet sees it).

> Select a file in the listing (**single click**) and use one of the hubs; **double-click** opens **Send to…**
> **right away**. **The file is only downloaded when you pick the destination** inside the hub — so the **disk
> type** (OS-9 × RS-DOS × container) is detected only then (before that, all options are enabled).

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
- **Files** — **single click selects**; **double-click** opens the **Send to…** hub **right away**. Size shows
  in **KB** on the right. With a file selected, the top **Send to…** / **Save file…** buttons open the hub
  immediately; the **download** only happens when you pick the destination.
  - The **destination** is chosen in the hub by **type**: **RS-DOS** → DSK pane; **OS-9** → OS-9 tab; or
    **DriveWire** (any type, writing to a folder and mounting on the chosen drive).
  - **`.zip`** is unzipped on the fly (see "Open by URL") and its content lands in the same hub.
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
- **"Open" button:** downloads the file (follows redirects, ~30 s timeout, up to ~64 MB) and opens the
  **Send to…** hub (just like the TNFS client) — from there you pick the destination by type (DSK pane / OS-9 tab
  / DriveWire). Once open in a pane it follows the normal pipeline: edit, inject, convert, disk map, XRoar, GW.

> **`.zip` files (e.g. Color Computer Archive):** the app **unzips automatically**. If the ZIP has **one**
> recognizable image, it goes to the hub; if it has **several**, a **picker** appears so you can choose which.

### 4) Top hubs — "Send to…" and "Save file…"

The hub **opens right away** (no waiting for a download). The file is only **downloaded when you pick the
destination**; then the **type** is detected (OS-9 × RS-DOS × container) and, if you reopen the hub, only the
compatible options are enabled.

**Send to…** (also via **double-click** on the file):
- **DSK pane** — downloads and opens in a pane (gated to **RS-DOS** once the type is known).
- **OS-9 tab** — downloads and opens **editable** in the OS-9 tab (gated to **OS-9/NitrOS-9**; shows the volume).
- **XRoar** — downloads and **mounts in the emulator** (drive 0, with a **reset**/clean boot). A `.vdk` switches the machine to Dragon.
- **DriveWire** — pick the **D0–D3** drive and click **Send**. **Folder first**: if the **WiFi server** already
  has a **folder** set, it writes **there**; otherwise the app **asks for a folder** — which then **becomes the
  Wi-Fi-served folder**. Then it downloads the disk, **writes it to the folder** and **mounts** it on the drive
  (so the FujiNet also sees it).

**Save file…** (single click selects → button):
- **Save to PC** — downloads and opens the free dialog; save anywhere.
- **Save & point on Wi-Fi** — writes the disk and **points the WiFi server** at it:
  - **Single disk** → lands in the **served folder** (the one already set, or one you pick).
  - **Container** (MiniIDE/CoCoSDC/DriveWire) → pointed as a **Container file** (each inner disk becomes a `.dsk`
    for the FujiNet).

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

## DriveWire server (serial)

The third column, **DriveWire**, turns the PC into a **disk server over a SERIAL CABLE** — the CoCo's native
transport, no WiFi. The real CoCo (with its model's **HDB-DOS/DriveWire** ROM) reads up to **4 drives** (0–3)
straight from the PC. Great for **live-testing** an image you just edited, without re-flashing a card.

- **Connection (collapsible):** pick the serial **Port** (the USB-serial adapter shows as COMx) and the
  **Machine** — **CoCo 1** (38400 baud), **CoCo 2** (57600) or **CoCo 3** (115200; requires 1.78 MHz). Use
  **Custom** for other bauds (up to 921600). The baud must **match the CoCo's ROM**. Once set, click the header
  to **collapse** it and free room for the drives.
- **The 4 drives:** each 5.25" drive takes a `.dsk` — **drag** a file onto the drive **or click** to choose.
  The label shows the disk's **name and info**. **Inside** the drive: the **lock** toggles **read-write /
  read-only** and the **arrow ejects** the disk. The **LED** lights (green) when a disk is present and
  **pulses** while the server is live.
- **Start server:** with a port chosen and at least one disk mounted, click **Start server**. Connect the
  cable, **boot** the CoCo (with the DriveWire ROM) and it will read the PC's drives. Connections show in the console.
- **On the CoCo:** you need the model's **HDB-DOS/DW** ROM (the baud matches it) and the serial cable. Anyone
  with a **FujiNet** gets the same over **WiFi** (middle column) — DriveWire is for **cable** users.

## Quick summary

- **Download and use:** Open by URL / TNFS hub → the **Send to…** hub opens → pick DSK pane / OS-9 tab /
  DriveWire (or **Save file…** → PC / Wi-Fi folder).
- **Serve to the FujiNet:** choose a folder/container → (optional) **Read-write** → **Start server** → copy the
  **"network ✓"** IP → put it in a FujiNet **host slot** (port 16384/UDP) → allow UDP 16384 through the firewall.
