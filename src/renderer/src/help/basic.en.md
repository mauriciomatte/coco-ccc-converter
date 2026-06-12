# BASIC Tab — BASIC program editor

The **BASIC** tab is a text editor for **Color Computer BASIC** programs (and clones like the CP-400) and
**Dragon**. It **detokenizes** programs (turns the disk/tape bytes into readable text), lets you **edit** with
a CoCo-screen look, and then **runs in XRoar**, **writes to a disk**, or **saves** as `.bas`/`.cas`. By the
end of this guide you will know how to bring in a program from any source, edit it, and send it back running.

> **Token coverage (detokenization):** every keyword of **Color BASIC**, **Extended Color BASIC**, **Disk
> BASIC** and **Super Extended Color BASIC (CoCo 3)** — including commands like `HSCREEN`, `PALETTE`, `HCOLOR`,
> `HDRAW`, `HPRINT`, `WIDTH`, `LOCATE` and functions like `LPEEK`, `BUTTON`, `HPOINT` — plus the **Dragon**
> dialect. Text inside quotes, `REM`/`'` and `DATA` is shown **literally** (not turned into a command), just
> like the real `LIST`. Tables verified byte-by-byte against the *Unravelled* disassemblies. An unknown token
> shows as `[?XX]` (rather than corrupting the line) — if you see that, report the code so the table can be fixed.

The tab has three fixed bands: the **toolbar** (top), the **editing area** (middle, which grows) and the
**footer** of options (bottom). When you open **Find/Replace**, an extra **bar** appears between the toolbar
and the editing area. The **?** button (in the toolbar) reopens this help.

> **Editor tabs (up to 6):** above the toolbar there's a **sub-tab bar** — each tab is an independent BASIC
> editor. **+** opens a new tab; **×** closes it (asks for confirmation if the tab has content). The label is
> **`NAME.BAS`**; **double-click the name to rename** (8 chars, A-Z/0-9 — CoCo format). Each tab is born with a
> **unique** name (`SEMNOME1`…`SEMNOME6`), because **"New DSK + Save"** writes using the **active** tab's name,
> so no two can be equal. The **top buttons and save/run** always act on the **active tab**; the **footer
> settings** (Auto-uppercase, VDG screen, Colors, Bold, NEW/RUN/ENTER, 32 columns, speed) are **global**. The
> **cursor** returns to where you left it in each tab. When you **export** a program into the editor (from disk,
> K7 tape, etc.), the tab **adopts the file name**, the text comes in with a **trailing new line** and the
> cursor sits on it; it lands in an **empty tab** or a **new tab**, and if all 6 are occupied a prompt lets you
> **choose** which one to place it into (replacing it) or **cancel**. Open tabs are **remembered** on reopen.

---

## 1. How a program gets here

- **Open** (folder icon in the toolbar) — opens a PC `.bas/.txt` in **ASCII**, **or a `.CAS` tape**: it then
  extracts the **first BASIC program** from the tape and **detokenizes** it into the editor (the tab adopts the
  file name). For machine code/data on a tape, use the **K7** tab.
- **From the K7 tab** — the **"Open in BASIC"** button: sends the BASIC read from the tape (already
  detokenized).
- **From the DSK tab** — the **"Edit"** button: sends a BASIC program from the disk, **regardless of the
  extension** (`.BAS`, `.BAT`, `.TXT`…). The app **confirms the type**: a BASIC program (tokenized or ASCII)
  opens (auto-detokenized if needed) keeping the **original name and extension**; **Machine Language is
  refused** (use **HEX/DISASM** on the General tab).

If a program is already in the editor, the app asks before replacing it. When there are **unsaved changes**,
the **tab name turns red** (with "●") and the **Save** button lights up; saving dims it. **Save** writes back
**into the source disk** (section 6), keeping name/extension. Clicking **Save** opens a modal with three options:
**Cancel**, **Save** (writes and keeps editing) and **Save & close** (writes and **closes the editor tab**). If
you **close/clear the source DSK pane** with pending edits, the app **warns** you (the text stays here; write it
with "New DSK on →").

> In **Find/Replace**, next to "Next" the app shows the **occurrence count** (e.g. `3/7 match.`); the search is
> case-insensitive.

> If the editor is **empty**, every button that needs content (Save, .CAS, Run, New DSK + Save, in-place Save)
> is **disabled** (greyed out).

---

## 2. The toolbar — button by button

The toolbar (left to right) groups the file, edit and run commands. Hover any icon to see its tooltip.

| Button | Icon | What it does |
|--------|------|--------------|
| **Open .BAS file** | folder | Opens a PC `.bas/.txt` (ASCII) into the editor. |
| **Save as .BAS (text)** | floppy | Writes the program as **ASCII** to a PC `.bas`/`.txt`. |
| **Save as .CAS tape** | **.CAS** text | Wraps the program in a `.CAS` loadable by **CLOAD** (emulator cassette). |
| **Save as .WAV audio** | audio waves | Generates the tape **FSK audio** in the **period format** (mono 8-bit 9600 Hz, with lead-in silence, post-header gap and tail): loads in **XRoar at normal speed** (CLOAD) and records to a **real K7 tape** for a physical CoCo, without errors. |
| **Cut** | scissors | Cuts the selection (system clipboard). |
| **Copy** | two sheets | Copies the selection. |
| **Paste** | clipboard | Pastes at the cursor (uppercased if "Auto uppercase" is on). |
| **Find** | magnifier | Opens the search bar. |
| **Find & replace** | arrows | Opens the bar already in replace mode. |
| **Insert ↑** | up-arrow | Inserts `^` (exponentiation) at the cursor. Shortcut: **Alt+↑**. |
| **Run in XRoar** | play | Types `NEW` + program into the emulator (at the `OK` prompt). |
| **Run + reset** | circular arrow | Restarts the emulator (clean boot) and types the program. |
| **?** | question mark | Opens this help. |

Still on the toolbar, **on the right**, are the disk-saving controls:

- **"Editing" badge** (only when the program came from a disk) — recalls its source.
- **Save** (only when there is a source) — rewrites **in-place** to the source disk (section 6).
- **Pane** (A/B) — picks the target disk for "New DSK + Save".
- **Name field** (`PRG-NOME`) — the `.BAS` file name. It accepts **only A-Z and 0-9**, is **uppercased** and
  **clipped to 8 chars** as you type (spaces/symbols are dropped). Empty becomes `PRGNOME`.
- **New DSK + Save → A/B** — creates/uses the pane's disk and writes the program as `.BAS` ASCII.

---

## 3. The editing area and the three "screens"

You edit free text (no automatic line numbering or syntax highlighting). When empty, the area shows a
**ghost example** (`10 CLS` / `20 PRINT "HELLO WORLD"` / `30 GOTO 20`) just as a placeholder. The **Screen**
selector (footer) changes only the **look**, so you can see how it will appear on the CoCo:

- **Normal** — plain monospace text; the **Colors** selector picks the scheme (green/black, orange/black,
  black/green, black/orange, navy/white, black/white).
- **VDG** — mimics the CoCo screen with the system font: uppercase in **black on green**; **lowercase in
  inverse video** (light green on dark green — the VDG has no real lowercase glyphs).
- **VDG 6847 (authentic)** — draws the **real pixelated glyphs** of the MC6847 chip on a canvas, with the
  **Scale** (Small/Medium/Large) and **32 columns** options.

**All three modes are fully EDITABLE** — cursor, selection and scrolling work the same in each.

> **32 columns** (VDG modes only): instead of no-wrap with horizontal scroll, the screen wraps at the real
> CoCo width (32 columns) and becomes a **centered 32×16 frame** inside a dark "bezel", looking like a
> monitor. Off, the line does not wrap and scrolls horizontally.

The **Auto uppercase** option (on by default) forces UPPERCASE as you type (classic Color BASIC), uppercasing
**only the just-typed/pasted chunk** and preserving what was already there; turn it off to allow lowercase
(CoCo 3 / Disk BASIC accept it). **Bold** thickens the font — **except on the VDG 6847 screen**, which is a
fixed MC6847 bitmap and therefore disables Bold.

> **Up-arrow ↑ (= `^`, exponentiation):** click the toolbar **↑** button or press **Alt+↑** to insert it (the
> ↑ key alone is for navigation). On the VDG screens `^` shows as ↑, like the real CoCo.

---

## 4. Editing text: cut/copy/paste and find

- **Cut / Copy / Paste** in the toolbar (pasted text is also uppercased if "Auto uppercase" is on). Insertion
  respects the **cursor position** and restores it correctly afterward.
- **Find** and **Find & replace** open a **bar** under the toolbar:
  - **"Find…" field** — type the term (the search is **case-insensitive**; everything is handled in
    uppercase).
  - **Next** — selects the next occurrence from the cursor, **wrapping to the start** when it reaches the end.
  - **Replace…** (when only finding) — expands the bar into replace mode.
  - **"Replace with…" field**, **Replace** (swaps the current occurrence and jumps to the next) and **All**
    (replaces everything at once).
  - **X** (close) — hides the bar.

| Shortcut | Where | Action |
|----------|-------|--------|
| **Alt+↑** | editing area | Inserts `^` (up-arrow / exponentiation). |
| **Enter** | Find field | Goes to the next occurrence. |
| **Enter** | Replace field | Replaces the current occurrence and finds the next. |
| **Esc** | search fields | Closes the Find/Replace bar. |

> **No regex.** "Replace/All" work in **uppercase** and return the whole result uppercased.

---

## 5. Run in XRoar

- **Run in XRoar** — types `NEW` + your program into the emulator (you must be at the `OK` prompt).
- **Run + reset** — restarts the emulator (clean boot, **no `NEW`** — the reset already clears RAM) and then
  types the program.

The footer options control what is injected:

- **NEW before injecting** — clears memory before the program. **Only applies to "Run in XRoar"**; with "Run +
  reset" the hard reset already clears RAM and `NEW` is ignored.
- **RUN at the end** — appends `RUN` at the end, making the program run by itself.
- **ENTER at the end** — adds a final ENTER when the last line is code with no trailing newline, so it gets
  entered into the emulator. Not needed if "RUN at the end" is on (RUN already provides the ENTER).
- **Code export speed** — how fast the keys are typed into XRoar: **Fast (12 ms/key)** or **Standard (25
  ms/key)**, safer. On slow machines, "Fast" may drop a character.

> XRoar converts `\n` into `\r` (the CoCo ENTER) automatically. On **Dragon** machines, the app also sends a
> leading space to dismiss the boot "press a key" prompt.

---

## 6. Save and export

- **Save as .BAS text file** — writes the program in **ASCII** (like `SAVE"…",A` on the CoCo), as `.bas` or
  `.txt`.
- **Save as .CAS tape** — wraps the program in a `.CAS` loadable by **CLOAD** in XRoar/MAME (and re-importable
  on the K7 tab).
- **Save as .WAV audio** — the tape **FSK audio** itself, rebuilt in the **period format** (mono 8-bit,
  9600 Hz, exact 1200/2400 Hz FSK) with the same **structure as original tapes**: lead-in silence, leader +
  header (namefile), **silence after the header** (the CoCo stops the motor and processes it), leader +
  continuous data + EOF and a trailing silence. It loads in **XRoar at normal speed** (`CLOAD`) and records
  to a **real K7 tape** for a physical CoCo, with no sync error. The program is **tokenized** (like `CSAVE`);
  if the syntax is unusual and the tokenizer doesn't match, it falls back to ASCII (the CoCo tokenizes on load).
- **New DSK + Save → A/B** — creates/uses the chosen pane's disk and writes the program as **.BAS ASCII** (the
  CoCo loads it with `LOAD"NAME"`). Set the **Pane** (A/B) and the **name** (up to 8 chars A-Z/0-9).
- **Save (in-place on the DSK)** — appears when the program came from a disk (the "Editing" badge): it
  **updates the file inside that disk**. If the disk/pane changed since you opened it, the app warns and offers
  to save as a new file.

> The editor always saves in **ASCII** — the CoCo/Dragon re-tokenizes on load. There is no tokenized-format
> writing.

---

## 7. About detokenizing (and the ASCII limit)

The app understands **tokenized BASIC** (the memory image the disk/tape stores) and converts it to text: it
recognizes CoCo and Dragon DOS headers, and both dialects' command/function tables (verified against the
official disassemblies). The **dialect** (CoCo vs Dragon) is chosen by the source platform/format. Unknown
tokens come out marked as `[?XX]` (instead of silently corrupting) — if you see that, it's worth reporting.

> **Important:** to **edit** a `.BAS` from a disk, it must be in **ASCII**. If it is tokenized, the app tells
> you to first save it as ASCII on the CoCo (`SAVE"NAME",A`) and try again. To just **peek** at a tokenized
> BASIC without editing, use **"Quick .BAS view"** on the DSK tab (read-only, detokenizes on the spot).

---

## 8. What is remembered between sessions

These preferences are stored (localStorage) and return when you reopen the app: **Auto uppercase**, **Screen**
(Normal/VDG/VDG 6847), **32 columns**, the 6847 font **Scale**, **ENTER at the end** and the **Code export
speed** (shared with the XRoar tab). The **counter** at the right of the footer shows the total **lines** and
**characters** of the program in real time.

---

## 9. Practical flows
- **Edit a tape program:** K7 → "Open in BASIC" → edit → **Run + reset** to test → **Save as .CAS** or **New
  DSK + Save**.
- **Edit a disk .BAS:** DSK → select the `.BAS` → "Edit .BAS" → edit → **Save** (in-place).
- **Type a program from scratch:** pick the screen (Normal/VDG) → type → **Run in XRoar** → **Save as .BAS**.
- **See how it looks on the CoCo screen:** switch **Screen** to **VDG 6847** + **32 columns**.
