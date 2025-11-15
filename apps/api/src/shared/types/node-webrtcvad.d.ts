declare module 'node-webrtcvad' {
  interface VAD {
    process(frame: Buffer): boolean;
    setMode(mode: number): void;
  }

  interface VADStatic {
    new (sampleRate: number, frameSize: number): VAD;
  }

  const VAD: VADStatic;
  export = VAD;
}
