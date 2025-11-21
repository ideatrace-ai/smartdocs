export const gatekeeperPrompt = (text: string) => {
  return `O texto a seguir é uma transcrição de áudio. Se houver qualquer fala humana inteligível (em qualquer idioma), responda 'SOFTWARE'. Apenas se for ruído ou silêncio, responda 'OUTRO'. Responda APENAS com uma das duas palavras. Texto: ${text}`;
};
