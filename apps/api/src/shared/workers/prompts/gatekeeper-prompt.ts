export const gatekeeperPrompt = (text: string) => {
  return `Você é um classificador de tópicos. O texto a seguir é sobre 'desenvolvimento de software' ou 'outro'? Responda apenas 'SOFTWARE' ou 'OUTRO'. Texto: ${text}`;
};
