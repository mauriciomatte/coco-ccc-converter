import React, { useState, useEffect, useRef } from 'react';

interface HexEditorProps {
  buffer: Uint8Array;
  onChange?: (newBuffer: Uint8Array) => void;
  baseAddress?: number;
  t: (key: string) => string;
}

export default function HexEditor({ buffer, onChange, baseAddress = 0x0000, t }: HexEditorProps) {
  const [columns, setColumns] = useState<number>(16);
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null);
  const [editingPart, setEditingPart] = useState<'hex' | 'ascii' | null>(null);
  const [editNibble, setEditNibble] = useState<0 | 1>(0); // 0 = high nibble, 1 = low nibble
  const [screenMode, setScreenMode] = useState<'coco-green' | 'coco-orange' | 'standard'>('coco-green');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Focus container for keyboard control
  useEffect(() => {
    if (selectedOffset !== null && containerRef.current) {
      containerRef.current.focus();
    }
  }, [selectedOffset]);

  // Handle byte edits
  const updateByte = (offset: number, value: number) => {
    const newBuf = new Uint8Array(buffer);
    newBuf[offset] = Math.max(0, Math.min(255, value));
    if (onChange) {
      onChange(newBuf);
    }
  };

  // Keyboard navigation and editing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedOffset === null) return;

    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    // Navigation
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedOffset(Math.min(buffer.length - 1, selectedOffset + 1));
      setEditNibble(0);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedOffset(Math.max(0, selectedOffset - 1));
      setEditNibble(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedOffset(Math.max(0, selectedOffset - columns));
      setEditNibble(0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedOffset(Math.min(buffer.length - 1, selectedOffset + columns));
      setEditNibble(0);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSelectedOffset(null);
      setEditingPart(null);
    }

    // Direct Editing
    if (editingPart === 'hex') {
      const key = e.key.toUpperCase();
      if (/^[0-9A-F]$/.test(key)) {
        e.preventDefault();
        const num = parseInt(key, 16);
        const currentByte = buffer[selectedOffset];

        let newByte = currentByte;
        if (editNibble === 0) {
          // Edit high nibble
          newByte = (num << 4) | (currentByte & 0x0F);
          updateByte(selectedOffset, newByte);
          setEditNibble(1); // switch to low nibble
        } else {
          // Edit low nibble
          newByte = (currentByte & 0xF0) | num;
          updateByte(selectedOffset, newByte);
          setEditNibble(0);
          
          // Auto-advance
          if (selectedOffset < buffer.length - 1) {
            setSelectedOffset(selectedOffset + 1);
          }
        }
      }
    } else if (editingPart === 'ascii') {
      if (e.key.length === 1) {
        e.preventDefault();
        const code = e.key.charCodeAt(0);
        updateByte(selectedOffset, code);
        
        // Auto-advance
        if (selectedOffset < buffer.length - 1) {
          setSelectedOffset(selectedOffset + 1);
        }
      }
    }
  };

  // Search functionality
  const executeSearch = () => {
    if (!searchQuery) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results: number[] = [];
    
    // Check if query is hex string (e.g. "1A 50" or "1A50") or standard text
    const cleanQuery = searchQuery.replace(/\s+/g, '');
    const isHex = /^[0-9A-Fa-f]+$/.test(cleanQuery) && cleanQuery.length % 2 === 0;

    if (isHex) {
      // Hex Search
      const searchBytes: number[] = [];
      for (let i = 0; i < cleanQuery.length; i += 2) {
        searchBytes.push(parseInt(cleanQuery.substring(i, i + 2), 16));
      }

      for (let i = 0; i <= buffer.length - searchBytes.length; i++) {
        let match = true;
        for (let j = 0; j < searchBytes.length; j++) {
          if (buffer[i + j] !== searchBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) results.push(i);
      }
    } else {
      // Text Search
      const searchStr = searchQuery.toLowerCase();
      const bufferStr = Array.from(buffer).map(b => String.fromCharCode(b)).join('').toLowerCase();
      
      let index = bufferStr.indexOf(searchStr);
      while (index !== -1) {
        results.push(index);
        index = bufferStr.indexOf(searchStr, index + 1);
      }
    }

    setSearchResults(results);
    if (results.length > 0) {
      setCurrentSearchIndex(0);
      setSelectedOffset(results[0]);
    } else {
      setCurrentSearchIndex(-1);
    }
  };

  const nextSearch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIdx);
    setSelectedOffset(searchResults[nextIdx]);
  };

  const prevSearch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIdx);
    setSelectedOffset(searchResults[prevIdx]);
  };

  // Character cell renderer for standard and VDG modes
  const renderChar = (byte: number, offset: number, isHovered: boolean, isSelected: boolean) => {
    const isEditing = editingPart === 'ascii' && isSelected;
    
    // Search highlight check
    let isSearchHighlight = false;
    if (searchResults.length > 0) {
      // Check if this offset is within any matching query size
      const cleanQuery = searchQuery.replace(/\s+/g, '');
      const matchLen = /^[0-9A-Fa-f]+$/.test(cleanQuery) && cleanQuery.length % 2 === 0
        ? cleanQuery.length / 2 
        : searchQuery.length;
      
      isSearchHighlight = searchResults.some(res => offset >= res && offset < res + matchLen);
    }

    const baseClass = `coco-char ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''} ${isSearchHighlight ? 'border-b-2 border-cyan-400 bg-cyan-950/40' : ''}`;

    if (screenMode === 'standard') {
      // Standard printable ASCII
      const isPrintable = byte >= 32 && byte <= 126;
      const charStr = isPrintable ? String.fromCharCode(byte) : '.';
      return (
        <span
          key={`ascii-${offset}`}
          className={`${baseClass} ${!isPrintable ? 'coco-char-control' : ''}`}
          onClick={() => {
            setSelectedOffset(offset);
            setEditingPart('ascii');
          }}
        >
          {isEditing ? '_' : charStr}
        </span>
      );
    } else {
      // --- TRS-80 Color Computer MC6847 VDG screen mapping simulation ---
      const useOrange = screenMode === 'coco-orange';
      
      if (byte < 0x20) {
        // Control range (0-31): Show standard control code symbol or dot
        const symbols = ['@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_'];
        return (
          <span
            key={`ascii-${offset}`}
            className={`${baseClass} coco-char-control`}
            onClick={() => {
              setSelectedOffset(offset);
              setEditingPart('ascii');
            }}
          >
            {isEditing ? '_' : `.`}
          </span>
        );
      } else if (byte >= 0x20 && byte <= 0x5F) {
        // Printable standard range (32-95): normal uppercase VDG green-on-dark or orange-on-dark
        const charStr = String.fromCharCode(byte);
        return (
          <span
            key={`ascii-${offset}`}
            className={baseClass}
            style={{ color: useOrange ? 'var(--vdg-orange-bg)' : 'var(--vdg-green-bg)', fontWeight: 'bold' }}
            onClick={() => {
              setSelectedOffset(offset);
              setEditingPart('ascii');
            }}
          >
            {isEditing ? '_' : charStr}
          </span>
        );
      } else if (byte >= 0x60 && byte <= 0x7F) {
        // Simulated lowercase range (96-127): Inverse video (Green/Orange background with black text)
        const charStr = String.fromCharCode(byte - 0x40); // Standard VDG maps these to inverted uppercase
        return (
          <span
            key={`ascii-${offset}`}
            className={`${baseClass} ${useOrange ? 'coco-char-inverse-orange' : 'coco-char-inverse'}`}
            onClick={() => {
              setSelectedOffset(offset);
              setEditingPart('ascii');
            }}
          >
            {isEditing ? '_' : charStr}
          </span>
        );
      } else {
        // Semigraphics 4 Mode (128-255): 2x2 grid based on subpixels
        // Bit 0 = Top Left, Bit 1 = Top Right, Bit 2 = Bottom Left, Bit 3 = Bottom Right
        const tl = (byte & 0x01) !== 0;
        const tr = (byte & 0x02) !== 0;
        const bl = (byte & 0x04) !== 0;
        const br = (byte & 0x08) !== 0;

        const subPixelClass = useOrange ? 'coco-graphic-subpixel active-orange' : 'coco-graphic-subpixel active';

        return (
          <span
            key={`ascii-${offset}`}
            className={`${baseClass} coco-char-graphics`}
            onClick={() => {
              setSelectedOffset(offset);
              setEditingPart('ascii');
            }}
            title={`Semigraphics $${byte.toString(16).toUpperCase()}`}
          >
            {/* Top Left */}
            <div className={`${subPixelClass} ${tl ? 'active' : ''}`} style={{ top: 0, left: 0 }} />
            {/* Top Right */}
            <div className={`${subPixelClass} ${tr ? 'active' : ''}`} style={{ top: 0, right: 0 }} />
            {/* Bottom Left */}
            <div className={`${subPixelClass} ${bl ? 'active' : ''}`} style={{ bottom: 0, left: 0 }} />
            {/* Bottom Right */}
            <div className={`${subPixelClass} ${br ? 'active' : ''}`} style={{ bottom: 0, right: 0 }} />
          </span>
        );
      }
    }
  };

  // Group lines
  const lines: number[][] = [];
  for (let i = 0; i < buffer.length; i += columns) {
    const line: number[] = [];
    for (let c = 0; c < columns; c++) {
      if (i + c < buffer.length) {
        line.push(i + c);
      }
    }
    lines.push(line);
  }

  return (
    <div className="hex-editor-wrapper h-full flex flex-col">
      {/* Editor toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-[var(--border)] bg-slate-900/40">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">{t('hexCols')}</span>
          <select
            className="input-select py-1 px-2 text-xs"
            value={columns}
            onChange={(e) => setColumns(parseInt(e.target.value))}
          >
            <option value={8}>8 {t('hexCols')}</option>
            <option value={16}>16 {t('hexCols')}</option>
            <option value={24}>24 {t('hexCols')}</option>
          </select>

          <span className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider ml-4">{t('vdgMode')}</span>
          <select
            className="input-select py-1 px-2 text-xs"
            value={screenMode}
            onChange={(e) => setScreenMode(e.target.value as any)}
          >
            <option value="coco-green">{t('vdgGreenOption')}</option>
            <option value="standard">{t('vdgStandardOption')}</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            className="input-text py-1 px-3 text-xs w-48 font-mono"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
          />
          <button onClick={executeSearch} className="btn btn-secondary py-1 px-2 text-xs">{t('searchBtn')}</button>
          {searchResults.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <span>{currentSearchIndex + 1}/{searchResults.length}</span>
              <button onClick={prevSearch} className="hover:text-white px-1">◀</button>
              <button onClick={nextSearch} className="hover:text-white px-1">▶</button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto p-4 font-mono select-none outline-none bg-slate-950/20"
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-[10px] font-bold tracking-wider text-left">
              <th className="pb-2 w-14">{t('hexHeaderAddress')}</th>
              <th className="pb-2 text-left pl-2" style={{ minWidth: columns * 17 }}>{t('hexHeaderValues')}</th>
              <th className="pb-2 pl-4">{t('hexHeaderChars')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, lineIdx) => {
              const lineAddr = baseAddress + lineIdx * columns;
              return (
                <tr key={`line-${lineIdx}`} className="hover:bg-slate-900/10">
                  {/* Address */}
                  <td className="text-[var(--text-muted)] text-[11px] font-bold py-1 select-text">
                    ${lineAddr.toString(16).toUpperCase().padStart(4, '0')}
                  </td>

                  {/* Hex bytes */}
                  <td className="py-1 text-left pl-2 select-none">
                    {line.map((offset) => {
                      const isSelected = selectedOffset === offset;
                      const isEditing = editingPart === 'hex' && isSelected;
                      const isHovered = selectedOffset === offset;
                      const byte = buffer[offset];
                      
                      // Highlight search
                      let isSearchHighlight = false;
                      if (searchResults.length > 0) {
                        const cleanQuery = searchQuery.replace(/\s+/g, '');
                        const matchLen = /^[0-9A-Fa-f]+$/.test(cleanQuery) && cleanQuery.length % 2 === 0
                          ? cleanQuery.length / 2 
                          : searchQuery.length;
                        isSearchHighlight = searchResults.some(res => offset >= res && offset < res + matchLen);
                      }

                      return (
                        <span
                          key={`hex-${offset}`}
                          className={`hex-cell text-[11px] font-medium cursor-pointer 
                            ${isSelected ? 'selected text-slate-900 font-bold bg-[var(--primary)]' : 'text-[var(--text-secondary)]'}
                            ${isEditing ? 'editing bg-[var(--secondary)] text-white' : ''}
                            ${isSearchHighlight && !isSelected ? 'border-b-2 border-cyan-400 bg-cyan-950/40 text-cyan-200' : ''}
                          `}
                          onClick={() => {
                            setSelectedOffset(offset);
                            setEditingPart('hex');
                            setEditNibble(0);
                          }}
                        >
                          {isEditing && editNibble === 1
                            ? (byte >> 4).toString(16).toUpperCase() + '_'
                            : byte.toString(16).toUpperCase().padStart(2, '0')}
                        </span>
                      );
                    })}
                    {/* Padding for short lines at EOF */}
                    {line.length < columns && 
                      Array.from({ length: columns - line.length }).map((_, idx) => (
                        <span key={`hex-pad-${idx}`} className="hex-cell inline-block opacity-10 mx-1">--</span>
                      ))
                    }
                  </td>

                  {/* ASCII Characters */}
                  <td className="py-1 pl-4 border-l border-[var(--border)] whitespace-nowrap select-none">
                    {line.map((offset) => {
                      const byte = buffer[offset];
                      const isSelected = selectedOffset === offset;
                      const isHovered = selectedOffset === offset;
                      return renderChar(byte, offset, isHovered, isSelected);
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Editor footer */}
      {selectedOffset !== null && (
        <div className="flex justify-between items-center px-4 py-2 border-t border-[var(--border)] bg-slate-900/60 text-xs text-[var(--text-secondary)]">
          <div className="flex gap-4">
            <span>{t('offsetLabel')} <strong className="text-white">${selectedOffset.toString(16).toUpperCase()}</strong> (<span className="font-sans">{selectedOffset}</span>)</span>
            <span>{t('romAddressLabel')} <strong className="text-white">${(baseAddress + selectedOffset).toString(16).toUpperCase()}</strong></span>
            <span>{t('valueLabel')} <strong className="text-white">${buffer[selectedOffset].toString(16).toUpperCase().padStart(2, '0')}</strong> (<span className="font-sans">{buffer[selectedOffset]}</span>)</span>
          </div>
          <span className="text-[var(--text-muted)]">{t('hexEditorInstructions')}</span>
        </div>
      )}
    </div>
  );
}
