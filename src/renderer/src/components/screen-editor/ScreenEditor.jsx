import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { SG_COLORS } from "./utils/cocoColors";
import { floydSteinberg } from "./utils/dithering";
import { useSidebarWidth } from "./utils/useSidebarWidth";
import { usePan, PAN_PADDING } from "./utils/usePan";
import { readTelaSettings, debouncedWriteTelaSettings, immediateWriteTelaSettings, vramToBase64, base64ToVram } from "./utils/screenSettings";

// ─── CoCo VDG MC6847 VRAM Encoding ───────────────────────────────────────────
//
//  $00–$3F (0–63)   : REVERSO  → Bit6=0 → fundo escuro, letra verde clara
//    $00 = espaço escuro (sólido)
//    $01–$1A = letras 'a'–'z' invertidas
//    $20 = espaço escuro (sólido) = decimal 32
//    $21–$3F = símbolos invertidos
//
//  $40–$7F (64–127) : PADRÃO   → Bit6=1 → fundo verde claro, letra escura
//    $40 = espaço claro
//    $41–$5A = letras 'A'–'Z'
//    $60 = espaço claro (sólido) = decimal 96
//    $61–$7F = símbolos padrão
//
//  $80–$FF (128–255): SG4 blocos gráficos
//
// REGRA: O valor gravado no Canvas é o código EXATO da VRAM (0–127).
// Não há conversão na exportação — o que está no Canvas vai direto para o Assembly.

const COLS = 32;
const ROWS = 16;
const CHAR_W = 8;
const CHAR_H = 12;
export const CANVAS_W = COLS * CHAR_W;
export const CANVAS_H = ROWS * CHAR_H;

const SG4_CELL_W = CHAR_W / 2;
const SG4_CELL_H = CHAR_H / 2;

// Padrão (Bit6=1, $40–$7F): fundo verde claro, letra escura
const ASCII_NORMAL_BG = [0, 210, 0];
const ASCII_NORMAL_FG = [0, 0, 0];
// Reverso (Bit6=0, $00–$3F): fundo verde escuro, letra verde clara
const ASCII_INV_BG = [0, 65, 0];
const ASCII_INV_FG = [9, 255, 6];
const SG4_BG = [0, 0, 0];

const SG4_PATTERNS = [
    [0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 0, 1, 1],
    [0, 1, 0, 0], [0, 1, 0, 1], [0, 1, 1, 0], [0, 1, 1, 1],
    [1, 0, 0, 0], [1, 0, 0, 1], [1, 0, 1, 0], [1, 0, 1, 1],
    [1, 1, 0, 0], [1, 1, 0, 1], [1, 1, 1, 0], [1, 1, 1, 1],
];

// ─── VDG glyph bitmaps ────────────────────────────────────────────────────────
const G_SPC = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const G_EXCL = [0x00, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x08, 0x00, 0x00];
const G_DQUO = [0x00, 0x00, 0x00, 0x14, 0x14, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const G_HASH = [0x00, 0x00, 0x00, 0x14, 0x14, 0x36, 0x00, 0x36, 0x14, 0x14, 0x00, 0x00];
const G_DOLR = [0x00, 0x00, 0x00, 0x08, 0x1E, 0x20, 0x1C, 0x02, 0x3C, 0x08, 0x00, 0x00];
const G_PERC = [0x00, 0x00, 0x00, 0x32, 0x32, 0x04, 0x08, 0x10, 0x26, 0x26, 0x00, 0x00];
const G_AMP = [0x00, 0x00, 0x00, 0x10, 0x28, 0x28, 0x10, 0x2A, 0x24, 0x1A, 0x00, 0x00];
const G_SQUO = [0x00, 0x00, 0x00, 0x18, 0x18, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const G_LPAR = [0x00, 0x00, 0x00, 0x08, 0x10, 0x20, 0x20, 0x20, 0x10, 0x08, 0x00, 0x00];
const G_RPAR = [0x00, 0x00, 0x00, 0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08, 0x00, 0x00];
const G_STAR = [0x00, 0x00, 0x00, 0x00, 0x08, 0x1C, 0x3E, 0x1C, 0x08, 0x00, 0x00, 0x00];
const G_PLUS = [0x00, 0x00, 0x00, 0x00, 0x08, 0x08, 0x3E, 0x08, 0x08, 0x00, 0x00, 0x00];
const G_COMM = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0x30, 0x10, 0x20, 0x00, 0x00];
const G_MINU = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3E, 0x00, 0x00, 0x00, 0x00, 0x00];
const G_DOT = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0x30, 0x00, 0x00];
const G_SLSH = [0x00, 0x00, 0x00, 0x02, 0x02, 0x04, 0x08, 0x10, 0x20, 0x20, 0x00, 0x00];
const G_0 = [0x00, 0x00, 0x00, 0x18, 0x24, 0x24, 0x24, 0x24, 0x24, 0x18, 0x00, 0x00];
const G_1 = [0x00, 0x00, 0x00, 0x08, 0x18, 0x08, 0x08, 0x08, 0x08, 0x1C, 0x00, 0x00];
const G_2 = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x02, 0x1C, 0x20, 0x20, 0x3E, 0x00, 0x00];
const G_3 = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x02, 0x0C, 0x02, 0x22, 0x1C, 0x00, 0x00];
const G_4 = [0x00, 0x00, 0x00, 0x04, 0x0C, 0x14, 0x3E, 0x04, 0x04, 0x04, 0x00, 0x00];
const G_5 = [0x00, 0x00, 0x00, 0x3E, 0x20, 0x3C, 0x02, 0x02, 0x22, 0x1C, 0x00, 0x00];
const G_6 = [0x00, 0x00, 0x00, 0x1C, 0x20, 0x20, 0x3C, 0x22, 0x22, 0x1C, 0x00, 0x00];
const G_7 = [0x00, 0x00, 0x00, 0x3E, 0x02, 0x04, 0x08, 0x10, 0x20, 0x20, 0x00, 0x00];
const G_8 = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x22, 0x1C, 0x22, 0x22, 0x1C, 0x00, 0x00];
const G_9 = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x22, 0x1E, 0x02, 0x02, 0x1C, 0x00, 0x00];
const G_COLN = [0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00, 0x00, 0x00];
const G_SEMI = [0x00, 0x00, 0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x08, 0x10, 0x00, 0x00];
const G_LT = [0x00, 0x00, 0x00, 0x04, 0x08, 0x10, 0x20, 0x10, 0x08, 0x04, 0x00, 0x00];
const G_EQ = [0x00, 0x00, 0x00, 0x00, 0x00, 0x3E, 0x00, 0x3E, 0x00, 0x00, 0x00, 0x00];
const G_GT = [0x00, 0x00, 0x00, 0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10, 0x00, 0x00];
const G_QUES = [0x00, 0x00, 0x00, 0x18, 0x24, 0x04, 0x08, 0x08, 0x00, 0x08, 0x00, 0x00];
const G_AT = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x02, 0x1A, 0x2A, 0x2A, 0x1C, 0x00, 0x00];
const G_A = [0x00, 0x00, 0x00, 0x08, 0x14, 0x22, 0x22, 0x3E, 0x22, 0x22, 0x00, 0x00];
const G_B = [0x00, 0x00, 0x00, 0x3C, 0x12, 0x12, 0x1C, 0x12, 0x12, 0x3C, 0x00, 0x00];
const G_C = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x20, 0x20, 0x20, 0x22, 0x1C, 0x00, 0x00];
const G_D = [0x00, 0x00, 0x00, 0x3C, 0x12, 0x12, 0x12, 0x12, 0x12, 0x3C, 0x00, 0x00];
const G_E = [0x00, 0x00, 0x00, 0x3E, 0x20, 0x20, 0x3C, 0x20, 0x20, 0x3E, 0x00, 0x00];
const G_F = [0x00, 0x00, 0x00, 0x3E, 0x20, 0x20, 0x3C, 0x20, 0x20, 0x20, 0x00, 0x00];
const G_G = [0x00, 0x00, 0x00, 0x1E, 0x20, 0x20, 0x26, 0x22, 0x22, 0x1E, 0x00, 0x00];
const G_H = [0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x3E, 0x22, 0x22, 0x22, 0x00, 0x00];
const G_I = [0x00, 0x00, 0x00, 0x1C, 0x08, 0x08, 0x08, 0x08, 0x08, 0x1C, 0x00, 0x00];
const G_J = [0x00, 0x00, 0x00, 0x02, 0x02, 0x02, 0x02, 0x22, 0x22, 0x1C, 0x00, 0x00];
const G_K = [0x00, 0x00, 0x00, 0x22, 0x24, 0x28, 0x30, 0x28, 0x24, 0x22, 0x00, 0x00];
const G_L = [0x00, 0x00, 0x00, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x3E, 0x00, 0x00];
const G_M = [0x00, 0x00, 0x00, 0x22, 0x36, 0x2A, 0x2A, 0x22, 0x22, 0x22, 0x00, 0x00];
const G_N = [0x00, 0x00, 0x00, 0x22, 0x32, 0x2A, 0x26, 0x22, 0x22, 0x22, 0x00, 0x00];
const G_O = [0x00, 0x00, 0x00, 0x3E, 0x22, 0x22, 0x22, 0x22, 0x22, 0x3E, 0x00, 0x00];
const G_P = [0x00, 0x00, 0x00, 0x3C, 0x22, 0x22, 0x3C, 0x20, 0x20, 0x20, 0x00, 0x00];
const G_Q = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x22, 0x22, 0x2A, 0x24, 0x1A, 0x00, 0x00];
const G_R = [0x00, 0x00, 0x00, 0x3C, 0x22, 0x22, 0x3C, 0x28, 0x24, 0x22, 0x00, 0x00];
const G_S = [0x00, 0x00, 0x00, 0x1C, 0x22, 0x10, 0x08, 0x04, 0x22, 0x1C, 0x00, 0x00];
const G_T = [0x00, 0x00, 0x00, 0x3E, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x00];
const G_U = [0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x1C, 0x00, 0x00];
const G_V = [0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x14, 0x14, 0x08, 0x08, 0x00, 0x00];
const G_W = [0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x2A, 0x2A, 0x36, 0x22, 0x00, 0x00];
const G_X = [0x00, 0x00, 0x00, 0x22, 0x22, 0x14, 0x08, 0x14, 0x22, 0x22, 0x00, 0x00];
const G_Y = [0x00, 0x00, 0x00, 0x22, 0x22, 0x14, 0x08, 0x08, 0x08, 0x08, 0x00, 0x00];
const G_Z = [0x00, 0x00, 0x00, 0x3E, 0x02, 0x04, 0x08, 0x10, 0x20, 0x3E, 0x00, 0x00];
const G_LBRK = [0x00, 0x00, 0x00, 0x38, 0x20, 0x20, 0x20, 0x20, 0x20, 0x38, 0x00, 0x00];
const G_BSLS = [0x00, 0x00, 0x00, 0x20, 0x20, 0x10, 0x08, 0x04, 0x02, 0x02, 0x00, 0x00];
const G_RBRK = [0x00, 0x00, 0x00, 0x0E, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0E, 0x00, 0x00];
const G_UPAR = [0x00, 0x00, 0x00, 0x08, 0x1C, 0x2A, 0x08, 0x08, 0x08, 0x08, 0x00, 0x00];
const G_LFAR = [0x00, 0x00, 0x00, 0x00, 0x08, 0x10, 0x3E, 0x10, 0x08, 0x00, 0x00, 0x00];

// ─── VDG_FONT: indexed by VRAM byte (0–127) ───────────────────────────────────
//
// PADRÃO ($40–$7F, Bit6=1): fundo verde claro, letra escura
//   $40 = espaço, $41='A', ..., $5A='Z', $5B='[', $5C='\', $5D=']', $5E=↑, $5F=←
//   $60 = espaço sólido, $61–$7F = símbolos padrão adicionais
//
// REVERSO ($00–$3F, Bit6=0): fundo escuro, letra verde clara
//   $00 = espaço escuro, $01='a'inv, ..., $1A='z'inv
//   $20 = espaço escuro sólido, $21–$3F = símbolos invertidos
//
// Mapeamento de glifos:
//   VRAM $40–$5F → letras A–Z e símbolos (mesmo glifo que $00–$1F mas cores normais)
//   VRAM $00–$1F → letras a–z invertidas (mesmo glifo que $40–$5F mas cores inversas)
//   VRAM $20–$3F → símbolos invertidos (mesmo glifo que $60–$7F mas cores inversas)
//   VRAM $60–$7F → símbolos padrão adicionais

function buildVDGFont() {
    const font = new Array(128).fill(null);

    // PADRÃO: $40–$5F → letras A–Z e símbolos especiais
    const normalLetters = [
        G_AT, G_A, G_B, G_C, G_D, G_E, G_F, G_G,
        G_H, G_I, G_J, G_K, G_L, G_M, G_N, G_O,
        G_P, G_Q, G_R, G_S, G_T, G_U, G_V, G_W,
        G_X, G_Y, G_Z, G_LBRK, G_BSLS, G_RBRK, G_UPAR, G_LFAR,
    ];
    for (let i = 0; i < 32; i++) font[0x40 + i] = normalLetters[i];

    // PADRÃO: $60–$7F → símbolos adicionais (espaço sólido + símbolos)
    const normalSymbols = [
        G_SPC, G_EXCL, G_DQUO, G_HASH, G_DOLR, G_PERC, G_AMP, G_SQUO,
        G_LPAR, G_RPAR, G_STAR, G_PLUS, G_COMM, G_MINU, G_DOT, G_SLSH,
        G_0, G_1, G_2, G_3, G_4, G_5, G_6, G_7,
        G_8, G_9, G_COLN, G_SEMI, G_LT, G_EQ, G_GT, G_QUES,
    ];
    for (let i = 0; i < 32; i++) font[0x60 + i] = normalSymbols[i];

    // REVERSO: $00–$1F → letras a–z invertidas (mesmo glifo que $40–$5F)
    for (let i = 0; i < 32; i++) font[0x00 + i] = normalLetters[i];

    // REVERSO: $20–$3F → símbolos invertidos (mesmo glifo que $60–$7F)
    for (let i = 0; i < 32; i++) font[0x20 + i] = normalSymbols[i];

    return font;
}

const VDG_FONT = buildVDGFont();

// ─── Render VDG screen ────────────────────────────────────────────────────────
export function renderVDGScreen(imgData, vram, sgColors) {
    const d = imgData.data;
    const stride = CANVAS_W * 4;
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const byteVal = vram[row * COLS + col];
            const baseX = col * CHAR_W;
            const baseY = row * CHAR_H;
            if (byteVal & 0x80) {
                // SG4 block
                const colorIdx = (byteVal >> 4) & 0x07;
                const patIdx = byteVal & 0x0F;
                const pat = SG4_PATTERNS[patIdx];
                const [cR, cG, cB] = sgColors[colorIdx].rgb;
                for (let sy = 0; sy < 2; sy++) {
                    for (let sx = 0; sx < 2; sx++) {
                        const lit = pat[sy * 2 + sx];
                        const r = lit ? cR : SG4_BG[0];
                        const g = lit ? cG : SG4_BG[1];
                        const b = lit ? cB : SG4_BG[2];
                        const px0 = baseX + sx * SG4_CELL_W;
                        const py0 = baseY + sy * SG4_CELL_H;
                        for (let py = py0; py < py0 + SG4_CELL_H; py++) {
                            const rowBase = py * stride + px0 * 4;
                            for (let px = 0; px < SG4_CELL_W; px++) {
                                const i = rowBase + px * 4;
                                d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
                            }
                        }
                    }
                }
            } else {
                // ASCII: Bit6=1 ($40–$7F) = PADRÃO (fundo claro), Bit6=0 ($00–$3F) = REVERSO (fundo escuro)
                const isNormal = (byteVal & 0x40) !== 0;
                const [fgR, fgG, fgB] = isNormal ? ASCII_NORMAL_FG : ASCII_INV_FG;
                const [bgR, bgG, bgB] = isNormal ? ASCII_NORMAL_BG : ASCII_INV_BG;
                const glyph = VDG_FONT[byteVal] || G_SPC;
                for (let gr = 0; gr < CHAR_H; gr++) {
                    const mask = glyph[gr];
                    const rowBase = (baseY + gr) * stride + baseX * 4;
                    for (let gc = 0; gc < CHAR_W; gc++) {
                        const bit = (mask >> (7 - gc)) & 1;
                        const i = rowBase + gc * 4;
                        if (bit) { d[i] = fgR; d[i + 1] = fgG; d[i + 2] = fgB; d[i + 3] = 255; }
                        else { d[i] = bgR; d[i + 1] = bgG; d[i + 2] = bgB; d[i + 3] = 255; }
                    }
                }
            }
        }
    }
}

function rgbStr([r, g, b]) { return `rgb(${r},${g},${b})`; }

// Default VRAM: fill with $60 (espaço sólido padrão, fundo claro, glifo em branco)
// $40 = '@', $60 = espaço (G_SPC = glifo vazio)
function initVRAM() { const v = new Uint8Array(COLS * ROWS); v.fill(0x60); return v; }

const VRAM_SIZE = COLS * ROWS; // 512 bytes

// ─── Tooltip helpers ──────────────────────────────────────────────────────────
// Bloco Padrão ($40–$7F): "Caractere: A | VRAM Hex: $41 | BASIC CHR$: 65"
// Letras Invertidas ($00–$1F): "Caractere: a | VRAM Hex: $01 | BASIC CHR$: 97"
// Símbolos Invertidos ($20–$3F): "Caractere: ! | VRAM Hex: $21 | BASIC CHR$: N/A (Apenas POKE)"
function charHint(vramByte) {
    const hex = `$${vramByte.toString(16).toUpperCase().padStart(2, "0")}`;
    if (vramByte >= 0x40 && vramByte <= 0x7F) {
        // Bloco Padrão
        let charName;
        if (vramByte === 0x40) charName = "Espaço";
        else if (vramByte === 0x60) charName = "Espaço sólido";
        else if (vramByte === 0x5E) charName = "↑ Seta Cima";
        else if (vramByte === 0x5F) charName = "← Seta Esq.";
        else charName = String.fromCharCode(vramByte);
        return `Caractere: ${charName} | VRAM Hex: ${hex} | BASIC CHR$: ${vramByte}`;
    } else if (vramByte >= 0x00 && vramByte <= 0x1F) {
        // Letras Invertidas
        let charName;
        if (vramByte === 0x00) charName = "Espaço inv.";
        else {
            // $01='a', $02='b', ..., $1A='z'
            const letter = vramByte <= 0x1A ? String.fromCharCode(0x60 + vramByte) : `$${hex}`;
            charName = letter;
        }
        const basicCode = vramByte + 96; // CHR$(vramByte+96) in Color BASIC
        return `Caractere: ${charName} | VRAM Hex: ${hex} | BASIC CHR$: ${basicCode}`;
    } else {
        // Símbolos Invertidos ($20–$3F)
        let charName;
        if (vramByte === 0x20) charName = "Espaço escuro";
        else {
            // $20–$3F maps to same glyphs as $60–$7F
            const symIdx = vramByte - 0x20; // 0–31
            const symChars = [" ", "!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
                "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";", "<", "=", ">", "?"];
            charName = symChars[symIdx] || `$${hex}`;
        }
        return `Caractere: ${charName} | VRAM Hex: ${hex} | BASIC CHR$: N/A (Apenas POKE)`;
    }
}

// ─── Component ────────────────────────────────────────────────────────────────
// ─── Inline color bar ─────────────────────────────────────────────────────────
// isSGMode: if true, black (index 8) is auto-redirected to Verde (index 0)
function SidebarColorBar({ palette, selectedColor, bgColor, onColorChange, onBgColorChange, isSGMode }) {
    if (!palette || palette.length === 0) return null;
    return (
        <div
            style={{ flexShrink: 0, borderTop: "1px solid var(--border-color)", padding: "4px 3px", backgroundColor: "var(--bg-darker)" }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div style={{ fontSize: "7px", color: "var(--text-muted)", marginBottom: "3px", paddingLeft: "1px" }}>
                Cores <span style={{ opacity: 0.6 }}>Esq=FG  Dir=BG</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                {palette.map((c, i) => {
                    const isFg = selectedColor === i;
                    const isBg = bgColor === i;
                    const isBlackRedirected = isSGMode && i === 8;
                    return (
                        <div
                            key={i}
                            onClick={() => onColorChange?.(i)}
                            onContextMenu={(e) => { e.preventDefault(); onBgColorChange?.(i); }}
                            title={isBlackRedirected
                                ? `${c.hint ?? c.name}\nPreto não é visível em blocos SG — redireciona para Verde`
                                : `${c.hint ?? c.name}\nEsq: cor frente  |  Dir: cor fundo`}
                            style={{
                                width: "16px", height: "16px", borderRadius: "3px",
                                backgroundColor: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`,
                                border: isFg
                                    ? "2px solid var(--accent-yellow)"
                                    : isBg
                                        ? "2px dashed #00e5ff"
                                        : isBlackRedirected
                                            ? "1px dashed rgba(0,210,0,0.6)"
                                            : "1px solid rgba(255,255,255,0.15)",
                                cursor: "pointer", flexShrink: 0, position: "relative",
                                boxShadow: isFg ? "0 0 5px rgba(227,179,65,0.5)" : isBg ? "0 0 5px rgba(0,229,255,0.4)" : "none",
                                transition: "all 0.1s",
                            }}
                        >
                            {isBlackRedirected && (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "rgba(0,210,0,0.9)", fontWeight: 700, lineHeight: 1, pointerEvents: "none" }}>→</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const AsciiSG4Editor = forwardRef(({ deployTarget, allRam, css, tool, showGrid, zoom, onHistoryChange, onCssChange, selectedColor, onColorChange, onBgColorChange, bgColor, palette, onScrollChange }, ref) => {
    const canvasRef = useRef(null);
    const hiddenCanvasRef = useRef(null);

    const [subMode, setSubMode] = useState("ascii");
    const [vram, setVram] = useState(initVRAM);
    const [history, setHistory] = useState([initVRAM()]);
    const [histIdx, setHistIdx] = useState(0);

    // selectedChar: the VRAM byte (0–127) of the currently selected ASCII char
    // Default: $41 = 'A' (Bloco Padrão)
    const [selectedChar, setSelectedChar] = useState(0x41);
    const selectedCharRef = useRef(0x41);
    const setSelectedCharSync = (vramByte) => {
        selectedCharRef.current = vramByte;
        setSelectedChar(vramByte);
        // Also immediately update subModeRef so paintCell sees "ascii" without waiting for useEffect
        subModeRef.current = "ascii";
    };

    const [selectedSGPattern, setSelectedSGPattern] = useState(0x0F);
    // useSGPattern: true = draw with selected pattern, false = draw with solid color block (vramSolid)
    // Set to true when user clicks a pattern in the sidebar.
    // Reset to false when user clicks the pen tool button (handled via prop change).
    const [useSGPattern, setUseSGPattern] = useState(false);
    // invMode: true = Bloco Reverso ($00–$3F), false = Bloco Padrão ($40–$7F)
    const [invMode, setInvMode] = useState(false);
    const invModeRef = useRef(false);
    const subModeRef = useRef("ascii");

    // ── Settings persistence ──────────────────────────────────────────────────
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // Load settings on mount
    useEffect(() => {
        if (settingsLoaded) return;
        const load = async () => {
            const s = await readTelaSettings();
            const t = s?.ascii_sg4;
            if (t) {
                // Restore VRAM content
                if (t.vram) {
                    const restored = base64ToVram(t.vram, VRAM_SIZE);
                    if (restored) {
                        setVram(restored);
                        setHistory([new Uint8Array(restored)]);
                        setHistIdx(0);
                    }
                }
                // Restore editor-specific state
                if (typeof t.subMode === "string") {
                    setSubMode(t.subMode);
                    subModeRef.current = t.subMode;
                }
                if (typeof t.selectedChar === "number") {
                    setSelectedChar(t.selectedChar);
                    selectedCharRef.current = t.selectedChar;
                }
                if (typeof t.selectedSGPattern === "number") {
                    setSelectedSGPattern(t.selectedSGPattern);
                }
                if (typeof t.invMode === "boolean") {
                    setInvMode(t.invMode);
                    invModeRef.current = t.invMode;
                }
            }
            setSettingsLoaded(true);
        };
        load();
    }, [settingsLoaded]);

    // Save VRAM whenever it changes (debounced — VRAM can be large and changes frequently)
    useEffect(() => {
        if (!settingsLoaded) return;
        debouncedWriteTelaSettings("ascii_sg4_vram", {
            ascii_sg4: { vram: vramToBase64(vram) }
        }, 1200);
    }, [vram, settingsLoaded]);

    // Save editor-specific state immediately on change
    useEffect(() => {
        if (!settingsLoaded) return;
        immediateWriteTelaSettings({ ascii_sg4: { subMode } });
    }, [subMode, settingsLoaded]);

    useEffect(() => {
        if (!settingsLoaded) return;
        immediateWriteTelaSettings({ ascii_sg4: { selectedChar } });
    }, [selectedChar, settingsLoaded]);

    useEffect(() => {
        if (!settingsLoaded) return;
        immediateWriteTelaSettings({ ascii_sg4: { selectedSGPattern } });
    }, [selectedSGPattern, settingsLoaded]);

    useEffect(() => {
        if (!settingsLoaded) return;
        immediateWriteTelaSettings({ ascii_sg4: { invMode } });
    }, [invMode, settingsLoaded]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState(null);
    const [drawFilled, setDrawFilled] = useState(false); // true = right-click = filled shape
    const [previewVram, setPreviewVram] = useState(null);
    const lastPenCellRef = useRef(null); // tracks last painted cell for line interpolation

    // ── Selection / clipboard state ──────────────────────────────────────────
    // sel: { col, row, w, h } in cell coords, or null
    const [sel, setSel] = useState(null);
    const selRef = useRef(null);
    // clipboard: { w, h, data: Uint8Array of VRAM bytes }
    const clipboardRef = useRef(null);
    const [pasteOffset, setPasteOffset] = useState(null);
    const pasteOffsetRef = useRef(null);

    // Keep refs in sync with state (for use in clearCanvas via useImperativeHandle)
    useEffect(() => { invModeRef.current = invMode; }, [invMode]);
    useEffect(() => { subModeRef.current = subMode; }, [subMode]);

    // ─── Pan (ALT + drag) & Zoom ──────────────────────────────────────────────
    const { panContainerRef, centerCanvas, getScrollPos, setScrollPos, panContainerProps, zoomToPoint } = usePan();
    const prevZoomRef = useRef(zoom ?? 1);

    // ─── Notifica TelaEditor da posição de scroll em tempo real ──────────────
    // Usa um ref callback combinado para adicionar o listener de scroll ao container.
    const onScrollChangeRef = useRef(onScrollChange);
    useEffect(() => { onScrollChangeRef.current = onScrollChange; }, [onScrollChange]);
    const panContainerWithScrollRef = useCallback((el) => {
        panContainerRef(el);
        if (!el) return;
        const onScroll = () => {
            onScrollChangeRef.current?.({ scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }, el);
        };
        // Remove previous listener if any
        if (el._asciiScrollListener) {
            el.removeEventListener("scroll", el._asciiScrollListener);
        }
        el._asciiScrollListener = onScroll;
        el.addEventListener("scroll", onScroll, { passive: true });
        // Notify parent of the DOM element immediately (before first scroll event)
        onScrollChangeRef.current?.({ scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }, el);
    }, [panContainerRef]); // eslint-disable-line react-hooks/exhaustive-deps

    // When pen tool is re-selected from toolbar, reset to solid block mode
    const prevToolRef = useRef(tool);
    useEffect(() => {
        if (tool === "pen" && prevToolRef.current !== "pen") {
            setUseSGPattern(false);
        }
        prevToolRef.current = tool;
    }, [tool]);

    const [textCursor, setTextCursor] = useState(null);
    const textCursorRef = useRef(null);
    const hiddenInputRef = useRef(null);
    const blinkPhaseRef = useRef(true);
    const [hoverCell, setHoverCell] = useState(null);

    const [importedImage, setImportedImage] = useState(null);
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [hue, setHue] = useState(0);
    const [showImportPanel, setShowImportPanel] = useState(false);

    const selectedSGColor = selectedColor ?? 0;

    // ─── Resizable sidebar — key "ascii_sg4" keeps this sidebar independent ──
    const { sidebarWidth, splitterProps } = useSidebarWidth("ascii_sg4");

    // ─── CapsLock listener ────────────────────────────────────────────────────
    // Reads actual CapsLock state on every key event (fixes Alt+Tab desync).
    useEffect(() => {
        const syncCapsLock = (e) => {
            if (e.getModifierState) {
                setInvMode(e.getModifierState("CapsLock"));
            }
        };
        window.addEventListener("keydown", syncCapsLock);
        window.addEventListener("keyup", syncCapsLock);
        return () => {
            window.removeEventListener("keydown", syncCapsLock);
            window.removeEventListener("keyup", syncCapsLock);
        };
    }, []);

    // ─── Blink loop ───────────────────────────────────────────────────────────
    const [blinkTick, setBlinkTick] = useState(0);
    useEffect(() => {
        if (!textCursor) { blinkPhaseRef.current = true; return; }
        const id = setInterval(() => {
            blinkPhaseRef.current = !blinkPhaseRef.current;
            setBlinkTick(t => t + 1);
        }, 500);
        return () => clearInterval(id);
    }, [textCursor]);

    // ─── Render ───────────────────────────────────────────────────────────────
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const displayVram = previewVram ?? vram;
        const imgData = ctx.createImageData(CANVAS_W, CANVAS_H);
        renderVDGScreen(imgData, displayVram, SG_COLORS);
        ctx.putImageData(imgData, 0, 0);

        // Paste preview overlay
        if (tool === "paste" && pasteOffset && clipboardRef.current) {
            const cb = clipboardRef.current;
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "#00e5ff";
            ctx.fillRect(pasteOffset.col * CHAR_W, pasteOffset.row * CHAR_H, cb.w * CHAR_W, cb.h * CHAR_H);
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(pasteOffset.col * CHAR_W + 0.5, pasteOffset.row * CHAR_H + 0.5, cb.w * CHAR_W - 1, cb.h * CHAR_H - 1);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Grid — ASCII/SG4: 32 colunas × 16 linhas = 512 blocos
        // Cada bloco = CHAR_W × CHAR_H px (8×12)
        // Cor do grid: contrasta com o fundo verde do modo ASCII
        // Usa preto semitransparente (contrasta com verde claro) e branco (contrasta com verde escuro)
        if (showGrid) {
            // Linha fina entre cada bloco (32×16) — cor escura discreta
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            for (let c = 0; c <= COLS; c++) {
                ctx.beginPath(); ctx.moveTo(c * CHAR_W + 0.5, 0); ctx.lineTo(c * CHAR_W + 0.5, CANVAS_H); ctx.stroke();
            }
            for (let r = 0; r <= ROWS; r++) {
                ctx.beginPath(); ctx.moveTo(0, r * CHAR_H + 0.5); ctx.lineTo(CANVAS_W, r * CHAR_H + 0.5); ctx.stroke();
            }
        }

        // Hover highlight (not for select/paste)
        if (hoverCell && tool !== "select" && tool !== "paste") {
            ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#fff";
            ctx.fillRect(hoverCell.col * CHAR_W, hoverCell.row * CHAR_H, CHAR_W, CHAR_H); ctx.restore();
        }

        // Selection overlay
        if (selRef.current) {
            const s = selRef.current;
            ctx.save();
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(s.col * CHAR_W + 0.5, s.row * CHAR_H + 0.5, s.w * CHAR_W - 1, s.h * CHAR_H - 1);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Selection drag preview
        if (tool === "select" && isDrawing && drawStart && hoverCell) {
            const x = Math.min(drawStart.col, hoverCell.col);
            const y = Math.min(drawStart.row, hoverCell.row);
            const w = Math.abs(hoverCell.col - drawStart.col) + 1;
            const h = Math.abs(hoverCell.row - drawStart.row) + 1;
            ctx.save();
            ctx.strokeStyle = "#ffff00";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x * CHAR_W + 0.5, y * CHAR_H + 0.5, w * CHAR_W - 1, h * CHAR_H - 1);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Text cursor
        const cur = textCursorRef.current;
        if (cur && blinkPhaseRef.current) {
            ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff";
            ctx.fillRect(cur.col * CHAR_W, cur.row * CHAR_H, 2, CHAR_H);
            ctx.globalAlpha = 0.5;
            ctx.fillRect(cur.col * CHAR_W, cur.row * CHAR_H + CHAR_H - 2, CHAR_W, 2); ctx.restore();
        }
    }, [vram, previewVram, showGrid, hoverCell, blinkTick, textCursor, tool, isDrawing, drawStart, pasteOffset, sel]);

    useEffect(() => { renderCanvas(); }, [renderCanvas]);

    // ─── History ──────────────────────────────────────────────────────────────
    const pushHistory = useCallback((newVram) => {
        const next = history.slice(0, histIdx + 1);
        next.push(new Uint8Array(newVram));
        setHistory(next); setHistIdx(next.length - 1); setVram(new Uint8Array(newVram));
    }, [history, histIdx]);

    const undo = () => { if (histIdx > 0) { const i = histIdx - 1; setHistIdx(i); setVram(new Uint8Array(history[i])); } };
    const redo = () => { if (histIdx < history.length - 1) { const i = histIdx + 1; setHistIdx(i); setVram(new Uint8Array(history[i])); } };

    useImperativeHandle(ref, () => ({
        undo, redo,
        restore: () => pushHistory(initVRAM()),
        // Returns a copy of the current VRAM for export
        getVRAM: () => new Uint8Array(vram),
        // Loads VRAM from an array/Uint8Array (for double-click open in Explorer)
        loadVRAM: (bytes) => {
            const size = COLS * ROWS;
            const newVram = new Uint8Array(size);
            const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            newVram.set(src.slice(0, size));
            pushHistory(newVram);
        },
        // Called by TelaEditor when user selects a FG color from the color bar
        // Switches to SG4 solid block mode so pen draws colored blocks
        activateSG4SolidMode: () => {
            setSubMode("sg4");
            setUseSGPattern(false);
        },
        centerCanvas: centerCanvas,
        getScrollPos: () => getScrollPos(),
        setScrollPos: (pos) => setScrollPos(pos),
        applyZoom: (newZoom, mouseX, mouseY) => {
            zoomToPoint(mouseX, mouseY, prevZoomRef.current, newZoom, CANVAS_W, CANVAS_H);
            prevZoomRef.current = newZoom;
        },
        // clearCanvas: fill entire VRAM with the background color/char
        // bgColorIndex: index into SG4 palette (0–7)
        // currentSubMode: "ascii" | "sg4"
        // currentInvMode: bool
        clearCanvas: (bgColorIndex) => {
            const newVram = new Uint8Array(COLS * ROWS);
            const curInvMode = invModeRef.current;
            const solidByte = SG_COLORS[bgColorIndex]?.vramSolid;
            if (solidByte != null) {
                // SG4 solid block: Verde=$8F, Amarelo=$9F, ..., Laranja=$FF, Preto=$80
                newVram.fill(solidByte);
            } else {
                // Fallback: fill with ASCII space
                // Padrão (invMode=false) → $60 (espaço sólido claro)
                // Reverso (invMode=true)  → $20 (espaço escuro sólido)
                newVram.fill(curInvMode ? 0x20 : 0x60);
            }
            pushHistory(newVram);
        },
        importFile: (file) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { setImportedImage(img); setShowImportPanel(true); URL.revokeObjectURL(url); };
            img.src = url;
        },
    }));

    useEffect(() => { onHistoryChange?.(histIdx > 0, histIdx < history.length - 1); }, [histIdx, history.length, onHistoryChange]);

    // ─── Canvas interaction ───────────────────────────────────────────────────
    const getCellFromEvent = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (CANVAS_W / rect.width);
        const py = (e.clientY - rect.top) * (CANVAS_H / rect.height);
        return { col: Math.max(0, Math.min(COLS - 1, Math.floor(px / CHAR_W))), row: Math.max(0, Math.min(ROWS - 1, Math.floor(py / CHAR_H))) };
    };

    const paintCell = useCallback((col, row, currentVram) => {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return currentVram;
        const newVram = new Uint8Array(currentVram);
        const idx = row * COLS + col;
        // Always read subMode from ref (avoids stale closure after sidebar click)
        const currentSubMode = subModeRef.current;
        if (tool === "eraser") {
            // Eraser: write the appropriate space for current mode
            // $60 = espaço sólido claro (G_SPC glifo vazio), $20 = espaço escuro sólido
            newVram[idx] = invModeRef.current ? 0x20 : 0x60;
        } else if (currentSubMode === "sg4") {
            if (useSGPattern) {
                // User clicked a pattern in the sidebar → draw with that specific pattern
                newVram[idx] = 0x80 | ((selectedSGColor & 0x07) << 4) | (selectedSGPattern & 0x0F);
            } else {
                // Default pen mode → draw solid color block (vramSolid)
                const solidByte = SG_COLORS[selectedSGColor]?.vramSolid;
                newVram[idx] = solidByte ?? (0x80 | ((selectedSGColor & 0x07) << 4) | 0x0F);
            }
        } else {
            // ASCII mode: use the selected char from ref (always up-to-date)
            newVram[idx] = selectedCharRef.current;
        }
        return newVram;
    }, [tool, selectedSGColor, selectedSGPattern, useSGPattern]);

    const floodFill = useCallback((col, row, currentVram) => {
        const newVram = new Uint8Array(currentVram);
        const target = newVram[row * COLS + col];
        // Always read subMode from ref (avoids stale closure)
        const currentSubMode = subModeRef.current;
        let fill;
        if (currentSubMode === "sg4") {
            if (useSGPattern) {
                // Fill with the selected SG4 pattern
                fill = 0x80 | ((selectedSGColor & 0x07) << 4) | (selectedSGPattern & 0x0F);
            } else {
                // Fill with solid color block
                fill = SG_COLORS[selectedSGColor]?.vramSolid ?? (0x80 | ((selectedSGColor & 0x07) << 4) | 0x0F);
            }
        } else {
            fill = selectedCharRef.current;
        }
        if (target === fill) return currentVram;
        const stack = [[col, row]];
        while (stack.length) {
            const [c, r] = stack.pop();
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
            if (newVram[r * COLS + c] !== target) continue;
            newVram[r * COLS + c] = fill;
            stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
        }
        return newVram;
    }, [selectedSGColor, selectedSGPattern, useSGPattern]);

    const clampCursor = useCallback((col, row) => ({
        col: Math.max(0, Math.min(col, COLS - 1)),
        row: Math.max(0, Math.min(row, ROWS - 1))
    }), []);
    const advanceCursor = useCallback((cur) => {
        if (!cur) return cur;
        let { col, row } = cur;
        col++;
        if (col >= COLS) { col = 0; row = Math.min(row + 1, ROWS - 1); }
        return { col, row };
    }, []);
    const retreatCursor = useCallback((cur) => {
        if (!cur) return cur;
        let { col, row } = cur;
        col--;
        if (col < 0) { col = COLS - 1; row = Math.max(row - 1, 0); }
        return { col, row };
    }, []);

    // ─── Write helpers ────────────────────────────────────────────────────────
    // Space: Padrão=$60 (espaço sólido, glifo vazio), Reverso=$20 (espaço escuro sólido)
    const writeBlankAt = useCallback((vramIn, col, row, isInverse) => {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return vramIn;
        const nv = new Uint8Array(vramIn);
        nv[row * COLS + col] = isInverse ? 0x20 : 0x60;
        return nv;
    }, []);

    // Convert a typed key to the correct VRAM byte
    // Padrão (isInverse=false): A–Z → $41–$5A, symbols → $60–$7F range
    // Reverso (isInverse=true):  a–z → $01–$1A, symbols → $20–$3F range
    const writeCharAt = useCallback((vramIn, col, row, keyChar, isInverse) => {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return vramIn;
        const ch = keyChar;
        const upper = ch.toUpperCase();
        const code = upper.charCodeAt(0);
        let vramByte = null;

        if (ch === " ") {
            // Space: Padrão=$60 (G_SPC = glifo vazio = bloco verde sólido), Reverso=$20 (espaço escuro sólido)
            // $40 = '@' (arroba), NÃO é espaço!
            vramByte = isInverse ? 0x20 : 0x60;
        } else if (code >= 0x41 && code <= 0x5A) {
            // Letters A–Z
            if (isInverse) {
                // Reverso: 'a'–'z' → $01–$1A
                vramByte = code - 0x40; // A=1, B=2, ..., Z=26
            } else {
                // Padrão: 'A'–'Z' → $41–$5A
                vramByte = code; // A=$41, B=$42, ..., Z=$5A
            }
        } else {
            // Symbols: map to the correct block
            // Symbols in Padrão ($60–$7F): !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /,
            //                              0–9, :, ;, <, =, >, ?
            // Symbols in Reverso ($20–$3F): same symbols but inverted
            const symMap = {
                "!": 0x01, "\"": 0x02, "#": 0x03, "$": 0x04, "%": 0x05, "&": 0x06, "'": 0x07,
                "(": 0x08, ")": 0x09, "*": 0x0A, "+": 0x0B, ",": 0x0C, "-": 0x0D, ".": 0x0E, "/": 0x0F,
                "0": 0x10, "1": 0x11, "2": 0x12, "3": 0x13, "4": 0x14, "5": 0x15, "6": 0x16, "7": 0x17,
                "8": 0x18, "9": 0x19, ":": 0x1A, ";": 0x1B, "<": 0x1C, "=": 0x1D, ">": 0x1E, "?": 0x1F,
            };
            const offset = symMap[ch];
            if (offset !== undefined) {
                // offset is 0x01–0x1F (position within the symbol block)
                vramByte = isInverse ? (0x20 + offset) : (0x60 + offset);
            }
        }

        if (vramByte === null) return vramIn;
        const nv = new Uint8Array(vramIn);
        nv[row * COLS + col] = vramByte;
        return nv;
    }, []);

    // ─── Keyboard handler ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!textCursor) return;
        const handleKeyDown = (e) => {
            // Não intercepta quando o foco está em um input/textarea (ex: campo "nome do arquivo")
            const tgt = document.activeElement;
            if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA") && tgt !== hiddenInputRef.current) return;
            const cur = textCursorRef.current;
            if (!cur) return;
            // Combinações Ctrl/Cmd/Alt (Ctrl+Z/Y/C/X/V…) NÃO devem ser digitadas como texto — deixa o
            // handler de clipboard/atalhos (e o modal: Ctrl+Z/Y) tratá-las.
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === "Escape") { e.preventDefault(); setTextCursor(null); textCursorRef.current = null; return; }
            if (e.key === "ArrowRight") { e.preventDefault(); const n = clampCursor(cur.col + 1, cur.row); textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "ArrowLeft") { e.preventDefault(); const n = clampCursor(cur.col - 1, cur.row); textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "ArrowDown") { e.preventDefault(); const n = clampCursor(cur.col, cur.row + 1); textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "ArrowUp") { e.preventDefault(); const n = clampCursor(cur.col, cur.row - 1); textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "Enter") { e.preventDefault(); const n = clampCursor(0, cur.row + 1); textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "Home") { e.preventDefault(); const n = { col: 0, row: cur.row }; textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "End") { e.preventDefault(); const n = { col: COLS - 1, row: cur.row }; textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true; return; }
            if (e.key === "Backspace") {
                e.preventDefault();
                const inv = e.getModifierState ? e.getModifierState("CapsLock") : false;
                // Recua o cursor PRIMEIRO (para a posição à esquerda)
                const n = retreatCursor(cur);
                // Atualiza o cursor imediatamente (antes do setVram)
                textCursorRef.current = n;
                setTextCursor({ ...n });
                blinkPhaseRef.current = true;
                // Apaga o bloco na posição recuada (à esquerda do cursor original)
                setVram(prev => writeBlankAt(prev, n.col, n.row, inv));
                return;
            }
            if (e.key === "Delete") {
                e.preventDefault();
                const inv = e.getModifierState ? e.getModifierState("CapsLock") : false;
                setVram(prev => writeBlankAt(prev, cur.col, cur.row, inv));
                return;
            }
            if (e.key.length === 1) {
                e.preventDefault();
                const inv = e.getModifierState ? e.getModifierState("CapsLock") : false;
                // Always type in ASCII mode when text cursor is active
                // (even if subMode was switched to sg4 by color selection)
                setSubMode("ascii");
                setVram(prev => {
                    const w = writeCharAt(prev, cur.col, cur.row, e.key, inv);
                    const n = advanceCursor(cur);
                    textCursorRef.current = n; setTextCursor({ ...n }); blinkPhaseRef.current = true;
                    return w;
                });
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [textCursor, subMode, clampCursor, advanceCursor, retreatCursor, writeBlankAt, writeCharAt]);

    // ─── Shape pixel generators (cell-based) ─────────────────────────────────
    const lineCells = (x0, y0, x1, y1) => {
        const pts = [];
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            pts.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
        return pts;
    };

    const rectCells = (x0, y0, x1, y1) => {
        const pts = [];
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        for (let x = minX; x <= maxX; x++) { pts.push([x, minY]); if (minY !== maxY) pts.push([x, maxY]); }
        for (let y = minY + 1; y < maxY; y++) { pts.push([minX, y]); if (minX !== maxX) pts.push([maxX, y]); }
        return pts;
    };

    const filledRectCells = (x0, y0, x1, y1) => {
        const pts = [];
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        for (let y = minY; y <= maxY; y++)
            for (let x = minX; x <= maxX; x++)
                pts.push([x, y]);
        return pts;
    };

    const filledCircleCells = (cx, cy, rx, ry) => {
        const pts = [];
        const r = Math.round((rx + ry) / 2);
        for (let y = -r; y <= r; y++)
            for (let x = -r; x <= r; x++)
                if (x * x + y * y <= r * r)
                    pts.push([cx + x, cy + y]);
        return pts;
    };

    const circleCells = (cx, cy, rx, ry) => {
        const set = new Set();
        const add = (x, y) => set.add(`${x},${y}`);
        const r = Math.round((rx + ry) / 2);
        let x = 0, y = r, d = 1 - r;
        while (x <= y) {
            [[x, y], [-x, y], [x, -y], [-x, -y], [y, x], [-y, x], [y, -x], [-y, -x]]
                .forEach(([dx, dy]) => add(cx + dx, cy + dy));
            if (d < 0) { d += 2 * x + 3; } else { d += 2 * (x - y) + 5; y--; }
            x++;
        }
        return [...set].map(s => s.split(",").map(Number));
    };

    const paintCells = useCallback((cells, baseVram) => {
        const newVram = new Uint8Array(baseVram);
        for (const [col, row] of cells) {
            if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
            const idx = row * COLS + col;
            if (tool === "eraser") {
                newVram[idx] = invMode ? 0x20 : 0x60;
            } else if (subMode === "sg4") {
                if (useSGPattern) {
                    newVram[idx] = 0x80 | ((selectedSGColor & 0x07) << 4) | (selectedSGPattern & 0x0F);
                } else {
                    const solidByte = SG_COLORS[selectedSGColor]?.vramSolid;
                    newVram[idx] = solidByte ?? (0x80 | ((selectedSGColor & 0x07) << 4) | 0x0F);
                }
            } else {
                newVram[idx] = selectedCharRef.current;
            }
        }
        return newVram;
    }, [tool, subMode, selectedSGColor, selectedSGPattern, useSGPattern, invMode]);

    const buildShapePreview = useCallback((startCol, startRow, endCol, endRow, filled = false) => {
        let cells = [];
        if (tool === "line") cells = lineCells(startCol, startRow, endCol, endRow);
        else if (tool === "rect") cells = filled
            ? filledRectCells(startCol, startRow, endCol, endRow)
            : rectCells(startCol, startRow, endCol, endRow);
        else if (tool === "circle") {
            const rx = Math.abs(endCol - startCol);
            const ry = Math.abs(endRow - startRow);
            cells = filled
                ? filledCircleCells(startCol, startRow, rx, ry)
                : circleCells(startCol, startRow, rx, ry);
        }
        return paintCells(cells, vram);
    }, [tool, vram, paintCells]);

    // ─── Clipboard helpers ────────────────────────────────────────────────────
    const copySelection = useCallback((currentVram, selection) => {
        if (!selection) return;
        const { col: sx, row: sy, w, h } = selection;
        const data = new Uint8Array(w * h);
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const c = sx + dx, r = sy + dy;
                if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
                    data[dy * w + dx] = currentVram[r * COLS + c];
                }
            }
        }
        clipboardRef.current = { w, h, data };
    }, []);

    const pasteClipboard = useCallback((currentVram, offsetCol, offsetRow) => {
        if (!clipboardRef.current) return currentVram;
        const { w, h, data } = clipboardRef.current;
        const newVram = new Uint8Array(currentVram);
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const c = offsetCol + dx, r = offsetRow + dy;
                if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
                    newVram[r * COLS + c] = data[dy * w + dx];
                }
            }
        }
        return newVram;
    }, []);

    const deleteSelection = useCallback((currentVram, selection) => {
        if (!selection) return currentVram;
        const { col: sx, row: sy, w, h } = selection;
        const newVram = new Uint8Array(currentVram);
        const blank = invModeRef.current ? 0x20 : 0x60;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const c = sx + dx, r = sy + dy;
                if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
                    newVram[r * COLS + c] = blank;
                }
            }
        }
        return newVram;
    }, []);

    // ─── Keyboard shortcuts for clipboard ────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't intercept when text cursor is active (handled by text cursor handler)
            if (textCursorRef.current) return;
            // Don't intercept when focus is inside a text input or textarea
            const tgt = e.target;
            if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt.isContentEditable) return;
            if (e.ctrlKey && e.key === "c") {
                if (selRef.current) copySelection(vram, selRef.current);
            }
            if (e.ctrlKey && e.key === "x") {
                if (selRef.current) {
                    copySelection(vram, selRef.current);
                    const newVram = deleteSelection(vram, selRef.current);
                    pushHistory(newVram);
                    setSel(null); selRef.current = null;
                }
            }
            if (e.ctrlKey && e.key === "v") {
                if (clipboardRef.current) {
                    const newVram = pasteClipboard(vram, 0, 0);
                    pushHistory(newVram);
                }
            }
            if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey) {
                if (selRef.current) {
                    e.preventDefault();
                    const newVram = deleteSelection(vram, selRef.current);
                    pushHistory(newVram);
                    setSel(null); selRef.current = null;
                }
            }
            if (e.key === "Escape") {
                setSel(null); selRef.current = null;
                setPasteOffset(null); pasteOffsetRef.current = null;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [vram, copySelection, deleteSelection, pasteClipboard, pushHistory]);

    // ─── Right-click paint: paint with BG color solid block ──────────────────
    const [isRightDrawing, setIsRightDrawing] = useState(false);
    const paintBgCell = useCallback((col, row, currentVram) => {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return currentVram;
        const newVram = new Uint8Array(currentVram);
        const idx = row * COLS + col;
        const bgIdx = bgColor ?? 8; // default to Preto if not set
        const solidByte = SG_COLORS[bgIdx]?.vramSolid ?? 0x80;
        newVram[idx] = solidByte;
        return newVram;
    }, [bgColor]);

    // ─── Mouse handlers ───────────────────────────────────────────────────────
    const isShapeTool = (t) => t === "line" || t === "rect" || t === "circle";

    const handleMouseDown = (e) => {
        if (e.altKey) return; // ALT reservado para pan (usePan)
        const { col, row } = getCellFromEvent(e);

        if (e.button === 2) {
            e.preventDefault();
            setTextCursor(null); textCursorRef.current = null;
            if (tool === "pen") {
                setIsRightDrawing(true);
                setVram(paintBgCell(col, row, vram));
            } else if (isShapeTool(tool)) {
                // Right-click on shape tool = start filled shape
                setIsDrawing(true);
                setDrawFilled(true);
                setDrawStart({ col, row });
                setPreviewVram(null);
            }
            return;
        }

        if (tool === "select") {
            setTextCursor(null); textCursorRef.current = null;
            setIsDrawing(true);
            setDrawStart({ col, row });
            setSel(null); selRef.current = null;
            return;
        }

        if (tool === "paste") {
            if (clipboardRef.current) {
                const newVram = pasteClipboard(vram, col, row);
                pushHistory(newVram);
                setPasteOffset(null); pasteOffsetRef.current = null;
            }
            return;
        }

        if (tool === "copy") {
            if (selRef.current) copySelection(vram, selRef.current);
            return;
        }

        if (tool === "cut") {
            if (selRef.current) {
                copySelection(vram, selRef.current);
                const newVram = deleteSelection(vram, selRef.current);
                pushHistory(newVram);
                setSel(null); selRef.current = null;
            }
            return;
        }

        if (tool === "delete") {
            if (selRef.current) {
                const newVram = deleteSelection(vram, selRef.current);
                pushHistory(newVram);
                setSel(null); selRef.current = null;
            }
            return;
        }

        if (tool === "fill") {
            pushHistory(floodFill(col, row, vram));
            const nc = clampCursor(col, row);
            textCursorRef.current = nc; setTextCursor({ ...nc }); blinkPhaseRef.current = true;
            hiddenInputRef.current?.focus({ preventScroll: true });
            return;
        }

        if (isShapeTool(tool)) {
            setTextCursor(null); textCursorRef.current = null;
            setIsDrawing(true);
            setDrawFilled(e.button === 2); // right-click = filled shape
            setDrawStart({ col, row });
            setPreviewVram(null);
            return;
        }

        // pen / eraser
        setIsDrawing(true);
        lastPenCellRef.current = { col, row };
        setVram(paintCell(col, row, vram));
        const nc = clampCursor(col, row);
        textCursorRef.current = nc; setTextCursor({ ...nc }); blinkPhaseRef.current = true;
        hiddenInputRef.current?.focus({ preventScroll: true });
    };

    const handleMouseMove = (e) => {
        const cell = getCellFromEvent(e);
        setHoverCell(cell);
        const { col, row } = cell;

        if (tool === "paste" && clipboardRef.current) {
            setPasteOffset({ col, row });
            pasteOffsetRef.current = { col, row };
            return;
        }

        if (isRightDrawing) {
            setVram(prev => paintBgCell(col, row, prev));
            return;
        }

        if (!isDrawing) return;

        if (tool === "select" && drawStart) return; // re-render via hoverCell

        if (isShapeTool(tool) && drawStart) {
            setPreviewVram(buildShapePreview(drawStart.col, drawStart.row, col, row, drawFilled));
            return;
        }

        if (tool === "pen" || tool === "eraser") {
            // Interpolate between last painted cell and current cell using Bresenham's line
            // This ensures continuous drawing even with fast mouse movement
            const last = lastPenCellRef.current;
            if (last) {
                const cells = lineCells(last.col, last.row, col, row);
                setVram(prev => paintCells(cells, prev));
            } else {
                setVram(prev => paintCell(col, row, prev));
            }
            lastPenCellRef.current = { col, row };
        }
    };

    const handleMouseUp = (e) => {
        const { col, row } = getCellFromEvent(e);

        if (tool === "select" && isDrawing && drawStart) {
            const x = Math.min(drawStart.col, col);
            const y = Math.min(drawStart.row, row);
            const w = Math.abs(col - drawStart.col) + 1;
            const h = Math.abs(row - drawStart.row) + 1;
            const newSel = { col: x, row: y, w, h };
            setSel(newSel); selRef.current = newSel;
            setIsDrawing(false); setDrawStart(null);
            return;
        }

        if (isRightDrawing) {
            pushHistory(vram); setIsRightDrawing(false);
            return;
        }

        if (!isDrawing) return;

        if (isShapeTool(tool) && drawStart) {
            const finalVram = buildShapePreview(drawStart.col, drawStart.row, col, row, drawFilled);
            pushHistory(finalVram);
            setPreviewVram(null); setDrawStart(null); setDrawFilled(false);
        } else {
            pushHistory(vram);
            const nc = clampCursor(col, row);
            textCursorRef.current = nc; setTextCursor({ ...nc }); blinkPhaseRef.current = true;
            hiddenInputRef.current?.focus({ preventScroll: true });
        }
        setIsDrawing(false);
    };

    const handleMouseLeave = () => {
        setHoverCell(null);
        setPasteOffset(null); pasteOffsetRef.current = null;

        if (tool === "select" && isDrawing) {
            setIsDrawing(false); setDrawStart(null);
            return;
        }
        if (isRightDrawing) { pushHistory(vram); setIsRightDrawing(false); }
        if (isDrawing) {
            if (isShapeTool(tool) && previewVram) {
                pushHistory(previewVram); setPreviewVram(null); setDrawStart(null);
            } else {
                pushHistory(vram);
            }
            setIsDrawing(false);
        }
    };

    // ─── Image import ─────────────────────────────────────────────────────────
    const applyImport = useCallback(() => {
        if (!importedImage) return;
        const hc = hiddenCanvasRef.current;
        hc.width = COLS; hc.height = ROWS;
        const hctx = hc.getContext("2d");
        hctx.filter = `brightness(${brightness}%) contrast(${contrast}%) hue-rotate(${hue}deg)`;
        hctx.drawImage(importedImage, 0, 0, COLS, ROWS);
        const imgData = hctx.getImageData(0, 0, COLS, ROWS);
        const indexed = floydSteinberg(imgData, COLS, ROWS, SG_COLORS);
        const newVram = new Uint8Array(COLS * ROWS); newVram.fill(0x40);
        if (subMode === "sg4") {
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
                const palIdx = indexed[r * COLS + c];
                newVram[r * COLS + c] = 0x80 | ((palIdx & 0x07) << 4) | 0x0F;
            }
        }
        pushHistory(newVram); setShowImportPanel(false);
    }, [importedImage, brightness, contrast, hue, subMode, pushHistory]);

    // ─── Sidebar char renderer ────────────────────────────────────────────────
    const renderSidebarChar = useCallback((el, vramByte) => {
        if (!el) return;
        const ctx2 = el.getContext("2d");
        const imgData = ctx2.createImageData(CHAR_W, CHAR_H);
        const d = imgData.data;
        // Determine colors from the VRAM byte itself
        const isNormal = (vramByte & 0x40) !== 0;
        const [fgR, fgG, fgB] = isNormal ? ASCII_NORMAL_FG : ASCII_INV_FG;
        const [bgR, bgG, bgB] = isNormal ? ASCII_NORMAL_BG : ASCII_INV_BG;
        const glyph = VDG_FONT[vramByte] || G_SPC;
        for (let gr = 0; gr < CHAR_H; gr++) {
            const mask = glyph[gr];
            for (let gc = 0; gc < CHAR_W; gc++) {
                const bit = (mask >> (7 - gc)) & 1;
                const i = (gr * CHAR_W + gc) * 4;
                if (bit) { d[i] = fgR; d[i + 1] = fgG; d[i + 2] = fgB; d[i + 3] = 255; }
                else { d[i] = bgR; d[i + 1] = bgG; d[i + 2] = bgB; d[i + 3] = 255; }
            }
        }
        ctx2.putImageData(imgData, 0, 0);
    }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {showImportPanel && importedImage && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px", backgroundColor: "var(--bg-darker)", borderBottom: "1px solid var(--border-color)", flexShrink: 0, flexWrap: "wrap" }}>
                    <label style={{ fontSize: "10px", color: "var(--text-muted)" }}>Brilho <input type="range" min={0} max={200} value={brightness} onChange={(e) => setBrightness(+e.target.value)} style={{ width: "55px" }} /> {brightness}%</label>
                    <label style={{ fontSize: "10px", color: "var(--text-muted)" }}>Contraste <input type="range" min={0} max={200} value={contrast} onChange={(e) => setContrast(+e.target.value)} style={{ width: "55px" }} /> {contrast}%</label>
                    <label style={{ fontSize: "10px", color: "var(--text-muted)" }}>Matiz <input type="range" min={0} max={360} value={hue} onChange={(e) => setHue(+e.target.value)} style={{ width: "55px" }} /> {hue}°</label>
                    <button onClick={applyImport} style={{ padding: "2px 8px", fontSize: "10px", border: "1px solid var(--vdg-green-dim)", borderRadius: "var(--radius-sm)", color: "var(--vdg-green)", backgroundColor: "var(--vdg-green-glow)" }}>✓ Aplicar</button>
                    <button onClick={() => setShowImportPanel(false)} style={{ padding: "2px 6px", fontSize: "10px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)" }}>✕</button>
                </div>
            )}

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* Canvas area — pan com ALT+drag */}
                <div
                    ref={panContainerWithScrollRef}
                    {...panContainerProps}
                    style={{ flex: 1, overflow: "auto", backgroundColor: "var(--bg-base)", position: "relative" }}
                >
                    <input ref={hiddenInputRef} readOnly style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none", border: "none", outline: "none" }} tabIndex={-1} aria-hidden="true" />
                    {/* Wrapper interno com padding grande para criar espaço de scroll (pan) */}
                    <div style={{ display: "inline-flex", padding: `${PAN_PADDING}px`, alignItems: "center", justifyContent: "center" }}>
                        <canvas
                            ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                            style={{
                                imageRendering: "pixelated",
                                border: sel ? "2px solid #00e5ff" : textCursor ? "2px solid var(--accent-yellow)" : "2px solid var(--border-active)",
                                borderRadius: "var(--radius-sm)",
                                cursor: tool === "fill" ? "crosshair"
                                    : tool === "select" ? "crosshair"
                                        : tool === "paste" ? (clipboardRef.current ? "copy" : "default")
                                            : tool === "copy" || tool === "cut" ? "copy"
                                                : tool === "delete" ? "not-allowed"
                                                    : tool === "eraser" ? "cell"
                                                        : tool === "line" || tool === "rect" || tool === "circle" ? "crosshair"
                                                            : "default",
                                display: "block",
                                width: `${CANVAS_W * (zoom ?? 1)}px`, height: `${CANVAS_H * (zoom ?? 1)}px`,
                                transition: "border-color 0.15s ease",
                                flexShrink: 0,
                            }}
                            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
                            onContextMenu={(e) => e.preventDefault()}
                        />
                    </div>
                </div>

                {/* Splitter handle — drag to resize sidebar */}
                <div {...splitterProps} />

                {/* Right sidebar — resizable */}
                <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, backgroundColor: "var(--bg-panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

                    {/* ASCII section */}
                    <div style={{ flexShrink: 0, borderBottom: "2px solid var(--border-color)", backgroundColor: subMode === "ascii" ? "var(--bg-active)" : "transparent" }}>
                        {/* Header with mode toggle button */}
                        <div style={{ padding: "3px 6px", fontSize: "9px", fontWeight: 700, color: subMode === "ascii" ? "var(--vdg-green)" : "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span>ASCII <span style={{ fontSize: "8px", color: "var(--text-muted)", fontWeight: 400 }}>$00–$7F</span></span>
                            <button
                                onClick={() => setInvMode(prev => !prev)}
                                title={invMode
                                    ? "Bloco Reverso ($00–$3F) — fundo escuro, letra verde clara. Clique para Padrão."
                                    : "Bloco Padrão ($40–$7F) — fundo verde claro, letra escura. Clique para Reverso."}
                                style={{
                                    display: "flex", alignItems: "center", gap: "2px",
                                    padding: "1px 5px", fontSize: "8px", fontWeight: 700,
                                    cursor: "pointer", borderRadius: "3px",
                                    border: invMode
                                        ? `1px solid rgb(${ASCII_INV_FG.join(",")})`
                                        : "1px solid var(--accent-yellow)",
                                    color: invMode
                                        ? `rgb(${ASCII_INV_FG.join(",")})`
                                        : "var(--accent-yellow)",
                                    backgroundColor: invMode
                                        ? `rgba(${ASCII_INV_BG.join(",")},0.6)`
                                        : "rgba(0,0,0,0.3)",
                                    transition: "all 0.15s ease",
                                }}
                            >
                                <span style={{ fontSize: "10px", lineHeight: 1 }}>{invMode ? "↓" : "↑"}</span>
                                <span>{invMode ? "REVERSO" : "PADRÃO"}</span>
                            </button>
                        </div>

                        {/* Char grid — auto-wrap based on sidebar width (cell=16px + 2px gap) */}
                        <div style={{ padding: "4px", overflowY: "auto", maxHeight: "260px" }}>
                            {!invMode && (
                                <>
                                    <div style={{ fontSize: "6px", color: "var(--text-muted)", marginBottom: "2px" }}>$40–$7F</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginBottom: "3px" }}>
                                        {Array.from({ length: 32 }, (_, i) => {
                                            const vb = 0x40 + i;
                                            const isSelected = selectedChar === vb && subMode === "ascii";
                                            return (
                                                <canvas key={vb} width={CHAR_W} height={CHAR_H}
                                                    onClick={() => { setSelectedCharSync(vb); setSubMode("ascii"); }}
                                                    title={charHint(vb)}
                                                    ref={(el) => renderSidebarChar(el, vb)}
                                                    style={{ width: "16px", height: "16px", imageRendering: "pixelated", cursor: "pointer", outline: isSelected ? "2px solid var(--accent-yellow)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", display: "block", flexShrink: 0 }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                                        {Array.from({ length: 32 }, (_, i) => {
                                            const vb = 0x60 + i;
                                            const isSelected = selectedChar === vb && subMode === "ascii";
                                            return (
                                                <canvas key={vb} width={CHAR_W} height={CHAR_H}
                                                    onClick={() => { setSelectedCharSync(vb); setSubMode("ascii"); }}
                                                    title={charHint(vb)}
                                                    ref={(el) => renderSidebarChar(el, vb)}
                                                    style={{ width: "16px", height: "16px", imageRendering: "pixelated", cursor: "pointer", outline: isSelected ? "2px solid var(--accent-yellow)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", display: "block", flexShrink: 0 }}
                                                />
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            {invMode && (
                                <>
                                    <div style={{ fontSize: "6px", color: "var(--text-muted)", marginBottom: "2px" }}>$00–$3F</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginBottom: "3px" }}>
                                        {Array.from({ length: 32 }, (_, i) => {
                                            const vb = 0x00 + i;
                                            const isSelected = selectedChar === vb && subMode === "ascii";
                                            return (
                                                <canvas key={vb} width={CHAR_W} height={CHAR_H}
                                                    onClick={() => { setSelectedCharSync(vb); setSubMode("ascii"); }}
                                                    title={charHint(vb)}
                                                    ref={(el) => renderSidebarChar(el, vb)}
                                                    style={{ width: "16px", height: "16px", imageRendering: "pixelated", cursor: "pointer", outline: isSelected ? "2px solid var(--accent-yellow)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", display: "block", flexShrink: 0 }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                                        {Array.from({ length: 32 }, (_, i) => {
                                            const vb = 0x20 + i;
                                            const isSelected = selectedChar === vb && subMode === "ascii";
                                            return (
                                                <canvas key={vb} width={CHAR_W} height={CHAR_H}
                                                    onClick={() => { setSelectedCharSync(vb); setSubMode("ascii"); }}
                                                    title={charHint(vb)}
                                                    ref={(el) => renderSidebarChar(el, vb)}
                                                    style={{ width: "16px", height: "16px", imageRendering: "pixelated", cursor: "pointer", outline: isSelected ? "2px solid var(--accent-yellow)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", display: "block", flexShrink: 0 }}
                                                />
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* SG4 section */}
                    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", backgroundColor: subMode === "sg4" ? "var(--bg-active)" : "transparent" }}>
                        <div style={{ padding: "3px 6px", fontSize: "9px", fontWeight: 700, color: subMode === "sg4" ? "var(--accent-purple)" : "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
                            SG4 <span style={{ fontSize: "8px", color: "var(--text-muted)", fontWeight: 400 }}>$80–$FF</span>
                        </div>
                        {/* SG4 patterns — auto-wrap based on sidebar width */}
                        <div style={{ padding: "4px", display: "flex", flexWrap: "wrap", gap: "3px" }}>
                            {SG4_PATTERNS.map((pat, i) => {
                                const byteVal = 0x80 | ((selectedSGColor & 0x07) << 4) | i;
                                const sgRgb = SG_COLORS[selectedSGColor]?.rgb || [0, 210, 0];
                                const hexHint = `$${byteVal.toString(16).toUpperCase().padStart(2, "0")}  ${SG_COLORS[selectedSGColor]?.name || ""} pat=${i}`;
                                const isSelected = selectedSGPattern === i && subMode === "sg4";
                                // Border: selected=yellow, otherwise dim version of the SG color
                                const borderStyle = isSelected
                                    ? "2px solid var(--accent-yellow)"
                                    : `1px solid rgba(${sgRgb[0]},${sgRgb[1]},${sgRgb[2]},0.45)`;
                                return (
                                    <div key={i} onClick={() => { setSelectedSGPattern(i); setSubMode("sg4"); setUseSGPattern(true); }} title={hexHint}
                                        style={{
                                            width: "18px", height: "18px", flexShrink: 0,
                                            display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
                                            gap: "2px", padding: "2px",
                                            backgroundColor: `rgba(${sgRgb[0]},${sgRgb[1]},${sgRgb[2]},0.08)`,
                                            border: borderStyle,
                                            borderRadius: "3px", cursor: "pointer",
                                            boxShadow: isSelected ? `0 0 4px rgba(${sgRgb[0]},${sgRgb[1]},${sgRgb[2]},0.4)` : "none",
                                        }}>
                                        {pat.map((lit, j) => (
                                            <div key={j} style={{ backgroundColor: lit ? rgbStr(sgRgb) : "rgba(0,0,0,0.6)", borderRadius: "1px" }} />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Bottom info + color bar — same pattern as SG8/PMODE */}
                    <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-color)" }}>
                        {/* Selection info */}
                        {sel && (
                            <div style={{ margin: "4px", padding: "4px 5px", backgroundColor: "rgba(0,229,255,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(0,229,255,0.3)", fontSize: "8px", color: "#00e5ff", lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 700, marginBottom: "2px" }}>Seleção ativa</div>
                                <div>{sel.w}×{sel.h} @ ({sel.col},{sel.row})</div>
                                <div style={{ fontSize: "7px", color: "var(--text-muted)" }}>⎘ Copiar | ✂ Recortar | 📋 Colar | 🗑 Apagar</div>
                            </div>
                        )}
                        {clipboardRef.current && (
                            <div style={{ margin: "4px", padding: "4px 5px", backgroundColor: "rgba(240,136,62,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(240,136,62,0.3)", fontSize: "8px", color: "var(--accent-orange)", lineHeight: 1.5 }}>
                                <div>📋 {clipboardRef.current.w}×{clipboardRef.current.h} chars</div>
                                <div style={{ fontSize: "7px", color: "var(--text-muted)" }}>Use 📋 Colar ou Ctrl+V</div>
                            </div>
                        )}
                        <div style={{ padding: "4px 6px", fontSize: "9px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                            <div>32×16 chars</div>
                            <div>512 bytes</div>
                            <div style={{ fontFamily: "monospace", fontSize: "8px" }}>ASCII/SG4</div>
                        </div>
                        <SidebarColorBar
                            palette={palette}
                            selectedColor={selectedColor}
                            bgColor={bgColor}
                            onColorChange={onColorChange}
                            onBgColorChange={onBgColorChange}
                            isSGMode={true}
                        />
                    </div>
                </div>
            </div>
            <canvas ref={hiddenCanvasRef} style={{ display: "none" }} />
        </div>
    );
});

AsciiSG4Editor.displayName = "AsciiSG4Editor";
export default AsciiSG4Editor;
