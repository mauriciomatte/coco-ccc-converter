# FujiNet / Online Tab

The **FujiNet / Online** tab connects the app to the CoCo/Dragon **FujiNet/TNFS** network ecosystem. It has
two sides, side by side:
- **Left — Access servers:** download images/files from **links** and from **TNFS hubs** into the app (then
  edit/convert them like any other image).
- **Right — WiFi server (FujiNet):** turn your PC into a **file server** that your **FujiNet** board mounts
  live over the network.

All connection/error messages appear in the **console** (bottom), like the other tabs.

> The FujiNet board talks to the **CoCo** and the **Internet** — our role is to be the **source/server of
> images**, not a "driver" for the board.

---

## Access servers (left side)

Two ways to bring images in — the **FujiNet-native** one (TNFS, on top) and the **manual** one (URL, below).

### TNFS servers (FujiNet hubs) — primary (ready)
The "FujiNet" way to access. Type the **host** (e.g. `tnfs.fujinet.online`) and click **Connect** (TNFS is
UDP, port 16384). The listing appears: **folders** (click to enter; use **↑** to go up) and **files**
(click to **download and open** in a pane). OS-9 disks go to the OS-9 tab; `.zip` is unzipped on the fly.
E.g.: `tnfs.fujinet.online` → **COCO** folder → `news.dsk`/`weather.dsk`/`wiki.dsk`… **Disconnect** clears
the listing (TNFS is per-operation, there is no held connection).

**Choose server (dropdown):** a selector with two groups — **My servers** (your favorites) and
**Community (live)**, the latter fetched from the public `fujinet.online/tnfs-server-status` list
(**UDP-down** servers are disabled, since TNFS is UDP). The **★** button saves the current host to favorites.

**Manage (★):** opens a modal to **add/remove** favorites (host + optional label + start folder), connect
directly, and save community servers. **Everything is saved** — favorites, last host and the shared folder
persist across restarts, and the listing/path survive tab switches.

> **Why don't I see the same servers as my FujiNet board?** The app doesn't read the board's config (it
> talks to the CoCo + Internet, not the PC). To access another server, **type its host** (or save it to
> favorites). The board's own **SD card** isn't reachable over the network; servers needing a **login**
> (user/password) aren't supported yet.

### Open by URL (HTTP/HTTPS) — manual (ready)
A generic convenience: paste a **link** to a `.dsk/.vdk/.sdf/.os9/.img/.ccc/.cas` and click **Open**. The app
downloads the file and **opens it in a pane** — OS-9 disks go automatically to the **OS-9** tab; the rest
opens on the **DSK** tab. From there it's the normal pipeline: edit, inject, convert, disk map, test in
XRoar, write GW.

> **`.zip` files (e.g. Color Computer Archive):** the app **unzips automatically**. If the ZIP has **one**
> image, it opens directly; if it has **several**, a **picker** appears so you can choose which to open.

---

## WiFi file server (right side — ready)

The app becomes a **TNFS server** (UDP **16384**, **read-only**) that your **FujiNet** mounts live — you
edit/organize here and the **CoCo sees it instantly**, with no floppy or reflash.

1. **Source:** choose **Folder** (a folder with various files) or **Container** (a `.img/.vhd/.dsk` from
   **MiniIDE / CoCoSDC / DriveWire** — each inner disk is exposed as a `.dsk`).
2. Click the folder button to **pick** the folder/file. The **"Shared files"** list shows what will be served.
3. **Start server.** The PC's **IP address** appears — put that IP in a **host slot** on your FujiNet.
4. **Stop server** when done. Connection messages go to the **console**.

> The source (folder/container and path) is **remembered** across sessions. The server is **read-only**.

---

## Summary
- **Download and use:** Open by URL → the file opens in a pane → edit normally.
- **Serve to the FujiNet:** (soon) choose a folder → start the server → put the PC's IP in a FujiNet host
  slot.
- **Console:** tracks downloads, connections and errors.
