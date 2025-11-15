export const QueueNames = {
  AUDIO_NEW: "q.audio.new",
  AUDIO_TRANSCRIBE: "q.audio.transcribe",
  AUDIO_FAILED: "q.audio.failed",
  TRANSCRIPT_ANALYZE: "q.transcript.analyze",
} as const;

export const ProcessingStatus = {
  PENDING_VALIDATION: "PENDING_VALIDATION",
  VALIDATING: "VALIDATING",
  PENDING_TRANSCRIPTION: "PENDING_TRANSCRIPTION",
  TRANSCRIBING: "TRANSCRIBING",
  PENDING_ANALYSIS: "PENDING_ANALYSIS",
  ANALYZING: "ANALYZING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;

export const GatekeeperRejectionReason = {
  NO_SPEECH: "NO_SPEECH",
  AUDIO_TOO_SHORT: "AUDIO_TOO_SHORT",
  INVALID_CONTEXT: "INVALID_CONTEXT",
  LLM_NO_RESPONSE: "LLM_NO_RESPONSE",
} as const;
