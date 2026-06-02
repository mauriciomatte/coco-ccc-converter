/// <reference types="vite/client" />

// Importação de arquivos de texto crus (ex.: VERSOES.TXT?raw) como string — usado no changelog.
declare module '*?raw' {
  const content: string;
  export default content;
}
