// The parts of libheif-js (the WebAssembly build of libheif, LGPL-3.0) that
// lib/heicWorker uses.
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(target: ImageData, done: (filled: ImageData | null) => void): void;
    free?(): void;
  }
  export interface HeifDecoder {
    decode(data: Uint8Array): HeifImage[];
    free?(): void;
  }
  export interface LibHeif {
    HeifDecoder: new () => HeifDecoder;
  }
  const factory: (opts?: Record<string, unknown>) => Promise<LibHeif>;
  export default factory;
}
