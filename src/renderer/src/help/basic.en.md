# BASIC Tab — BASIC program editor

The **BASIC** tab is a text editor for **Color Computer BASIC** programs (and clones like the CP-400) and
**Dragon**. It **detokenizes** programs (turns the disk/tape bytes into readable text), lets you **edit** with
a CoCo-screen look, and then **runs in XRoar**, **writes to a disk**, or **saves** as `.bas`/`.cas`. By the
end of this guide you will know how to bring in a program from any source, edit it, and send it back running.

---

## 1. How a program gets here

- **Open .BAS text file** (toolbar) — opens a PC `.bas/.txt` in **ASCII**.
- **From the K7 tab** — the **"Open in BASIC"** button: sends the BASIC read from the tape (already
  detokenized).
- **From the DSK tab** — the **"Edit .BAS"** button: sends a `.BAS` from the disk (must be **ASCII**; see
  section 6).

If a program is already in the editor, the app asks before replacing it. When opened from a disk, a
**"Editing {file}"** badge appears along with a **Save** button that writes back **into the source disk**
(section 5).

---

## 2. The editing area and the three "screens"

You edit free text (no automatic line numbering or syntax highlighting). The **Screen** selector (footer)
changes only the **look**, so you can see how it will appear on the CoCo:
- **Normal** — plain monospace text; the **Colors** selector picks the scheme (green/black, orange/black,
  etc.).
- **VDG** — mimics the CoCo screen: uppercase in black on green; **lowercase in inverse video** (the VDG has
  no real lowercase glyphs).
- **VDG 6847 (authentic)** — draws the **real pixelated glyphs** of the MC6847 chip, with **Scale**
  (Small/Medium/Large) and **32 columns** (the real screen width).

The **Auto uppercase** option (on by default) forces UPPERCASE as you type (classic Color BASIC); turn it off
to allow lowercase (CoCo 3 / Disk BASIC accept it). **Bold** thickens the font (except on the 6847 screen,
which is a fixed bitmap).

> **Up-arrow ↑ (= `^`, exponentiation):** click the **↑** button or press **Alt+↑** to insert it. On the VDG
> screens `^` shows as ↑, like the real CoCo.

---

## 3. Editing text: cut/copy/paste and find

- **Cut / Copy / Paste** in the toolbar (pasted text is also uppercased if "Auto uppercase" is on).
- **Find** and **Find & replace** open a bar: type the term (the search is case-insensitive), use **Next**
  (wraps to the start), and **Replace / All**. (No regex; "All" uppercases the whole result.)

---

## 4. Run in XRoar

- **Run in XRoar** — types `NEW` + your program into the emulator (you must be at the `OK` prompt).
- **Run + reset** — restarts the emulator (clean boot, no `NEW` — the reset already clears RAM) and then types
  the program.

The footer options control the injection: **NEW before injecting**, **RUN at the end** (runs by itself) and
**ENTER at the end** (ensures the last line registers). **Code export speed** sets how fast the keys are typed
into XRoar (Fast 12 ms / Standard 25 ms).

---

## 5. Save and export

- **Save as .BAS text file** — writes the program in **ASCII** (like `SAVE"…",A` on the CoCo), as `.bas` or
  `.txt`.
- **Save as .CAS tape** — wraps the program in a `.CAS` loadable by **CLOAD** in XRoar/MAME (and re-importable
  on the K7 tab).
- **New DSK + Save → A/B** — creates/uses the chosen pane's disk and writes the program as **.BAS ASCII** (the
  CoCo loads it with `LOAD"NAME"`). Set the **Pane** (A/B) and the **name** (up to 8 chars A-Z/0-9).
- **Save (in-place on the DSK)** — appears when the program came from a disk (the "Editing" badge): it
  **updates the file inside that disk**. If the disk/pane changed since you opened it, the app warns and offers
  to save as a new file.

> The editor always saves in **ASCII** — the CoCo/Dragon re-tokenizes on load. There is no tokenized-format
> writing.

---

## 6. About detokenizing (and the ASCII limit)

The app understands **tokenized BASIC** (the memory image the disk/tape stores) and converts it to text: it
recognizes CoCo and Dragon DOS headers, and both dialects' command/function tables (verified against the
official disassemblies). The **dialect** (CoCo vs Dragon) is chosen by the source platform/format. Unknown
tokens come out marked as `[?XX]` (instead of silently corrupting) — if you see that, it's worth reporting.

> **Important:** to **edit** a `.BAS` from a disk, it must be in **ASCII**. If it is tokenized, the app tells
> you to first save it as ASCII on the CoCo (`SAVE"NAME",A`) and try again. To just **peek** at a tokenized
> BASIC without editing, use **"Quick .BAS view"** on the DSK tab (read-only, detokenizes on the spot).

---

## 7. Practical flows
- **Edit a tape program:** K7 → "Open in BASIC" → edit → **Run + reset** to test → **Save as .CAS** or **New
  DSK + Save**.
- **Edit a disk .BAS:** DSK → select the `.BAS` → "Edit .BAS" → edit → **Save** (in-place).
- **Type a program from scratch:** pick the screen (Normal/VDG) → type → **Run in XRoar** → **Save as .BAS**.
- **See how it looks on the CoCo screen:** switch **Screen** to **VDG 6847** + **32 columns**.
