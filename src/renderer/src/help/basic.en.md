# BASIC Tab — BASIC program editor

The **BASIC** tab is a text editor to write **Color BASIC / Extended BASIC** programs and **run** them
in the XRoar emulator or **save** them to a floppy.

## The editor

- A text area that **forces UPPERCASE** (the CoCo prompt has no lowercase).
- A toolbar with **cut / copy / paste** and **find / find & replace**.
- The content **persists** across tab switches (it is not lost when you go to XRoar and back).

## Run in XRoar

Two buttons inject the program into the emulator (typing at the prompt, as if you used the keyboard):

- **Run** — types `NEW` + the program at the current prompt (no reset). Use when the emulator is
  already at the `OK` prompt.
- **Run with reset** — does a **reset** first (clean boot, guarantees the prompt even if something is
  running) and then types the program.

The **typing speed** is adjustable (the "Code Export Speed" toggle): **Fast** (~12 ms/key) or
**Normal** (~25 ms/key). On more sensitive setups, use Normal.

## Save as `.BAS` (to the floppy)

The **Save .BAS** button writes the text as an **ASCII BASIC file** (type 0, CR `0x0D` line endings)
into the **active pane of the DSK tab**. Since the CoCo loads ASCII BASIC with `LOAD"NAME"` just fine,
**no tokenizing is needed** — the file loads directly on the CoCo.

## Typical flow

1. Write/edit the program.
2. **Run with reset** to test from scratch in XRoar.
3. Tweak → **Run** (fast, no reset) to iterate.
4. When it's good, **Save .BAS** to keep it on the floppy (then save the image in the DSK tab).

## Tips

- If the first line "disappears" when running, use **Run with reset** (clean boot) and/or lower the
  speed to **Normal**.
- To open and edit an existing `.BAS`, bring the text in through the DSK tab/preview flow (the editor
  works on the program text).
