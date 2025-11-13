import { db } from "../../shared/database";
import { requirementDocuments } from "../../shared/database/schema";

export interface AnalystPayload {
  audio_hash: string;
  full_text: string;
}

const SYSTEM_PROMPT = `
Você é um Engenheiro de Requisitos Sênior e Analista de Negócios de elite, especializado em traduzir diálogos entre clientes e desenvolvedores em especificações técnicas acionáveis.

Sua tarefa é analisar a transcrição de reunião fornecida e extraí-la em um documento JSON estruturado.

### REGRAS E DIRETRIZES:
1.  **FOCO TOTAL:** Ignore conversas triviais (ex: "bom dia", "como vai o tempo"). Foque *exclusivamente* em feedbacks, pedidos, problemas e requisitos relacionados ao software.
2.  **SEJA OBJETIVO:** Extraia os pontos de forma concisa. Não copie e cole frases longas da transcrição; reescreva-as como requisitos claros.
3.  **NÃO INVENTE:** Se um campo não for mencionado (ex: prioridade), deixe o valor como 	 null 	 ou 	 Não mencionado 	.
4.  **FORMATO OBRIGATÓRIO:** Sua resposta DEVE ser um único bloco de código JSON, sem nenhum texto ou explicação antes ou depois.

### ESTRUTURA JSON OBRIGATÓRIA:
Siga exatamente este schema JSON. Não adicione ou remova chaves.

{
  "project_summary": {
    "software_name": "O nome ou descrição do software discutido",
    "main_goal_of_meeting": "O objetivo principal da reunião em uma frase"
  },
  "participants": {
    "client": "O nome do cliente (se mencionado) ou 'Cliente'",
    "developer": "O nome do desenvolvedor (se mencionado) ou 'Desenvolvedor'"
  },
  "action_items": [
    {
      "type": "NEW_FEATURE",
      "title": "Título curto e descritivo da demanda",
      "description": "Descrição detalhada do que foi solicitado pelo cliente.",
      "context": "O problema ou razão pelo qual o cliente pediu isso (se mencionado).",
      "priority": "HIGH"
    }
  ]
}
`;

export class AnalystWorker {
  async perform(payload: AnalystPayload) {
    console.log("AnalystWorker received:", payload.audio_hash);

    const structuredData = await this.getStructuredDataFromLLM(payload.full_text);

    if (!structuredData) {
      console.error("Failed to get structured data from LLM.");
      return { status: "analyst_failed", reason: "LLM_NO_RESPONSE" };
    }

    console.log("Saving structured data to the database...");
    await db.insert(requirementDocuments).values({
      audio_hash: payload.audio_hash,
      document_data: structuredData,
    });
    console.log("Successfully saved document for audio_hash:", payload.audio_hash);

    return { status: "analyst_complete" };
  }

  private async getStructuredDataFromLLM(text: string): Promise<object | null> {
    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-coder",
          system: SYSTEM_PROMPT,
          prompt: text,
          stream: false,
          format: "json",
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API request failed with status ${response.status}`);
      }

      const result = await response.json();
      const jsonString = result.response;
      
      return JSON.parse(jsonString);

    } catch (error) {
      console.error("Error getting structured data from Ollama:", error);
      return null;
    }
  }
}
