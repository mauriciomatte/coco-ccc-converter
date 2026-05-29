import React, { useState, useEffect } from 'react';
import { Terminal, X, AlertTriangle } from 'lucide-react';

interface HexInjectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (customHex: Uint8Array | null) => void;
  initialHex: Uint8Array | null;
  t: (key: string) => string;
  currentLang: string;
}

export default function HexInjectionModal({ isOpen, onClose, onApply, initialHex, t, currentLang }: HexInjectionModalProps) {
  const isEN = currentLang === 'en-us';
  // Standard 23-byte single stage bootstrap for reference
  const defaultHex = "1A 50 CE C0 1B 10 CE 00 00 A6 80 A7 A0 8C 00 00 26 F7 1C AF 7E 00 00";

  const [hexInput, setHexInput] = useState<string>(defaultHex);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (initialHex) {
        // Formata os bytes existentes como string hexadecimal legível
        const hexStr = Array.from(initialHex).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        setHexInput(hexStr);
      } else {
        setHexInput(defaultHex);
      }
      setErrorMsg('');
    }
  }, [isOpen, initialHex]);

  if (!isOpen) return null;

  const handleApply = () => {
    try {
      // Limpa os espaços e quebras de linha
      const cleanHex = hexInput.replace(/[\s\n\r]/g, '').toUpperCase();
      
      if (cleanHex.length === 0) {
        // Se estiver vazio, desativa a injeção customizada
        onApply(null);
        return;
      }
      
      if (cleanHex.length % 2 !== 0) {
        throw new Error(isEN ? "The hexadecimal string must have an even number of characters." : "A string hexadecimal deve ter um número par de caracteres.");
      }
      
      if (!/^[0-9A-F]+$/.test(cleanHex)) {
        throw new Error(isEN ? "Invalid characters found. Use only 0-9 and A-F." : "Caracteres inválidos encontrados. Use apenas de 0-9 e A-F.");
      }
      
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
      }
      
      onApply(bytes);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="glass-modal-overlay flex items-center justify-center p-8" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-[var(--border)] rounded-xl shadow-2xl flex flex-col w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)] bg-slate-950/50">
          <div className="flex items-center gap-3">
            <Terminal className="text-emerald-400 glow-text-emerald" size={24} />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Hex Injection Override
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-rose-900/50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex flex-col p-6 text-sm text-slate-300">
          <p className="mb-4">
            {isEN ? (
              <>
                Manually overwrite the hexadecimal code of the Bootstrap Loader that will be injected at memory address <code>$C004</code> (right after the 'DK' header). 
                When applied, the "Use All-RAM" setting will be ignored and this code will be pasted directly before the Payload.
              </>
            ) : (
              <>
                Sobrescreva manualmente o código hexadecimal do Bootstrap Loader que será injetado no endereço de memória <code>$C004</code> (logo após o cabeçalho 'DK'). 
                Ao aplicar, a configuração "Use All-RAM" será ignorada e este código será colado diretamente antes do Payload.
              </>
            )}
          </p>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              {isEN ? "6809E Hexadecimal Code" : "Código Hexadecimal 6809E"}
            </label>
            <textarea 
              className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-white text-lg tracking-widest focus:outline-none focus:border-emerald-500 transition-colors resize-none uppercase"
              value={hexInput}
              onChange={(e) => {
                setHexInput(e.target.value);
                setErrorMsg('');
              }}
              placeholder={isEN ? "Enter the hexadecimal code in pairs (e.g.: 1A 50 CE ...)" : "Digite o código hexadecimal em pares (ex: 1A 50 CE ...)"}
            />
          </div>

          {errorMsg && (
            <div className="mt-4 flex items-center gap-2 text-rose-400 bg-rose-950/40 border border-rose-900/50 p-3 rounded-lg text-xs font-semibold">
              <AlertTriangle size={14} />
              {errorMsg}
            </div>
          )}
          
          <div className="mt-4 text-[10px] text-slate-500">
            {isEN ? "* Leave the field blank or clear it to use the default automatic injection engine." : "* Deixe o campo em branco ou limpe-o para usar o motor de injeção automático padrão."}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-slate-950/40">
          <button 
            onClick={onClose}
            className="btn btn-secondary py-2 px-4 text-xs font-bold uppercase"
          >
            {isEN ? "Cancel" : "Cancelar"}
          </button>
          <button 
            onClick={() => {
              setHexInput('');
              onApply(null);
            }}
            className="btn py-2 px-4 text-xs font-bold uppercase text-amber-400 border border-amber-900/50 hover:bg-amber-900/20"
          >
            {isEN ? "Use Default" : "Usar Padrão"}
          </button>
          <button 
            onClick={handleApply}
            className="btn py-2 px-5 text-xs font-bold uppercase shadow-[0_0_15px_rgba(52,211,153,0.15)] text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all"
          >
            {isEN ? "Apply Injection" : "Aplicar Injeção"}
          </button>
        </div>
      </div>
    </div>
  );
}
