Agente de Análise de Reuniões (Local-First)

## 1\. Visão Geral e Filosofia

Este documento descreve um sistema de IA **local-first** e orientado a eventos, construído em um **monorepo Typescript** (gerenciado por **Turborepo**). O objetivo é processar áudios de reuniões, transcrevê-los e gerar documentos de requisitos de software, tudo isso rodando na máquina do desenvolvedor (um MacBook M4 com 16GB de RAM) e utilizando modelos de IA locais via **Ollama**.

A arquitetura é desacoplada, usando **RabbitMQ** para a comunicação assíncrona entre os agentes (workers).

## 2\. Estrutura do Monorepo (Turborepo)

Para gerenciar os serviços isolados, usaremos o Turborepo. A estrutura de pastas será:

```
/meu-cli-agent
├── apps/
│   ├── api/                # API Principal (Bun + ElysiaJS)
│   ├── worker-gatekeeper/  # Agente 1 (Validação)
│   ├── worker-transcriber/ # Agente 2 (Transcrição)
│   └── worker-analyst/     # Agente 3 (Análise)
├── packages/
│   ├── db/                 # Configuração do banco (Drizzle ORM + node-postgres)
│   ├── queue/              # Lógica de conexão com RabbitMQ (amqplib)
│   └── shared-types/       # Tipos TS (ex: interfaces de mensagens)
├── package.json
└── turborepo.json
```

-----

## 3\. Detalhamento dos Agentes e Serviços

### 🚀 API Principal (Serviço de Ingestão)

  * **Localização:** `apps/api`
  * **Propósito:** Ponto de entrada (HTTP) para o usuário enviar o arquivo de áudio. Responsável pelo "trabalho rápido": hashing, verificação de cache e enfileiramento.
  * **Stack:** **Bun + ElysiaJS** (pela performance).
  * **Fluxo de Trabalho Detalhado:**
    1.  Recebe um `POST /upload` com o arquivo de áudio (ex: `.mp3`, `.m4a`).
    2.  Lê o buffer do arquivo em memória.
    3.  Gera um hash **SHA-256** do buffer do arquivo. Este é o `audio_hash`.
        ```typescript
        // Usando o 'crypto' nativo do Bun/Node
        import { createHash } from 'crypto';
        const hash = createHash('sha256').update(audioBuffer).digest('hex');
        ```
    4.  Conecta-se ao **PostgreSQL** (via `packages/db`) e executa:
        `SELECT document_data FROM requirement_documents WHERE audio_hash = $1`.
    5.  **Cache Hit:** Se o documento for encontrado, retorna o `document_data` (JSON) imediatamente.
    6.  **Cache Miss:**
        a. Salva o arquivo de áudio original em um diretório local persistente (ex: `/data/audio_files/${hash}.m4a`).
        b. Conecta-se ao **RabbitMQ** (via `packages/queue`).
        c. Publica uma mensagem na fila `q.audio.new`:
        `{ audio_hash: hash, file_path: '/data/audio_files/${hash}.m4a' }`
    7.  Retorna uma resposta 202 (Accepted) ao usuário, informando que o processamento foi iniciado.

-----

### 🤖 Agente 1: Gatekeeper (Validação de Intenção)

  * **Localização:** `apps/worker-gatekeeper`

  * **Propósito:** Filtro de "sanidade" para evitar o processamento pesado de áudios irrelevantes (música, silêncio, conversas não relacionadas).

  * **Stack:** **Typescript (Bun/Node)** + `fluent-ffmpeg` + `node-webrtcvad` + `whisper.cpp (bindings)` + `ollama (phi-3-mini)`.

  * **Fila de Entrada:** `q.audio.new`

  * **Fila de Saída:** `q.audio.transcribe` (sucesso) ou `q.audio.failed` (rejeitado).

  * **Fluxo de Trabalho Detalhado:**

    1.  Consome a mensagem `{ audio_hash, file_path }` da fila `q.audio.new`.
    2.  **Etapa de VAD (Voice Activity Detection):**
          * Usa `fluent-ffmpeg` para converter o áudio para o formato exigido pelo VAD (16-bit PCM, 16kHz, mono).
          * Usa `node-webrtcvad` para analisar o áudio. Se a porcentagem de "fala" for muito baixa (ex: \< 10%), rejeita a mensagem e a envia para `q.audio.failed` com o motivo "NO\_SPEECH".
    3.  **Etapa de Corte (Trim):**
          * Usa `fluent-ffmpeg` para extrair os primeiros 60 segundos do áudio:
            `ffmpeg -i file_path -ss 00:00:00 -t 00:01:00 temp/trimmed.wav`
    4.  **Etapa de Transcrição Leve:**
          * Chama o **`whisper.cpp`** (usando bindings Node.js como `node-whisper-cpp` ou similar, que é perfeito para seu Mac M4) no arquivo `temp/trimmed.wav`.
          * Usa um modelo leve: `tiny.en` ou `base.en`. O objetivo é apenas obter texto para classificação.
    5.  **Etapa de Classificação (LLM Rápido):**
          * Pega a transcrição dos 60s e faz uma chamada à API do **Ollama** (`http://localhost:11434/api/generate`).
          * Usa um modelo *rápido* e leve, como `phi-3:mini` ou `gemma:2b`, que são excelentes para classificação.
          * **Prompt de Classificação:**
            > "Você é um classificador de tópicos. O texto a seguir é sobre 'desenvolvimento de software' ou 'outro'? Responda apenas 'SOFTWARE' ou 'OUTRO'. Texto: [transcrição\_60s]"
    6.  **Decisão:**
          * Se a resposta for "SOFTWARE", publica a mensagem original `{ audio_hash, file_path }` na fila `q.audio.transcribe`.
          * Se for "OUTRO", publica em `q.audio.failed` com o motivo "INVALID\_CONTEXT".

-----

### 🎧 Agente 2: Transcriber (Transcrição Completa)

  * **Localização:** `apps/worker-transcriber`

  * **Propósito:** Executar a transcrição completa e de alta qualidade do áudio validado.

  * **Stack:** **Typescript (Bun/Node)** + `whisper.cpp (bindings)`.

  * **Fila de Entrada:** `q.audio.transcribe`

  * **Fila de Saída:** `q.transcript.analyze`

  * **Fluxo de Trabalho Detalhado:**

    1.  Consome a mensagem `{ audio_hash, file_path }` da fila `q.audio.transcribe`.
    2.  Este é o "trabalho pesado". O worker chama a implementação do **`whisper.cpp`** (novamente, via bindings TS/Node.js) no `file_path` completo.
    3.  **Escolha do Modelo:** Dado seu M4 com 16GB, você pode usar um modelo robusto. Recomendo o `small.en` ou até o `medium.en`. O `small` será mais rápido, o `medium` mais preciso. Comece com o `small` para garantir que não sufoque a RAM em áudios longos.
    4.  Aguarde o `whisper.cpp` concluir. Isso pode levar alguns minutos, e tudo bem, pois é um worker assíncrono.
    5.  Recebe o texto da transcrição completa.
    6.  Publica a nova mensagem na fila `q.transcript.analyze`:
        `{ audio_hash: hash, full_text: 'O cliente disse...' }`

-----

### 🧠 Agente 3: Requirements Analyst (Extração e Estruturação)

  * **Localização:** `apps/worker-analyst`

  * **Propósito:** O cérebro do sistema. Transforma o texto bruto em um documento de requisitos estruturado em JSON.

  * **Stack:** **Typescript (Bun/Node)** + **Ollama (DeepSeek R1)** + **`packages/db` (Drizzle ORM)**.

  * **Fila de Entrada:** `q.transcript.analyze`

  * **Fila de Saída:** Nenhuma (Armazena no DB).

  * **Fluxo de Trabalho Detalhado:**

    1.  Consome a mensagem `{ audio_hash, full_text }` da fila `q.transcript.analyze`.
    2.  Prepara a chamada para a API do **Ollama** (`http://localhost:11434/api/generate`).
    3.  Usa o modelo que você especificou: **`deepseek-coder`** (ou a versão R1 que você tiver, ex: `deepseek-coder:6.7b`). Esta é uma ótima escolha, pois ele entende contextos de código e engenharia.
    4.  Usa o **System Prompt** detalhado (veja abaixo) para instruir o modelo.
    5.  Envia a `full_text` como o "prompt do usuário".
    6.  Recebe a resposta do Ollama (que *deve* ser uma string JSON).
    7.  Faz o `JSON.parse()` da resposta. (Inclua `try...catch` para o caso do LLM falhar em formatar o JSON).
    8.  Conecta-se ao **PostgreSQL** (via `packages/db`).
    9.  Executa o `INSERT` final:
        ```typescript
        // Exemplo com Drizzle
        import { db } from '@packages/db';
        import { requirementDocuments } from '@packages/db/schema';

        await db.insert(requirementDocuments).values({
          audio_hash: audio_hash,
          document_data: parsedJsonDocument
        });
        ```

-----

## 🔑 Agente 3: O System Prompt Detalhado (Português)

Este é o componente mais crítico. Para rodar bem localmente (com DeepSeek) e garantir um output consistente, instrua o modelo a **SEMPRE** responder em **JSON**.

```markdown
Você é um Engenheiro de Requisitos Sênior e Analista de Negócios de elite, especializado em traduzir diálogos entre clientes e desenvolvedores em especificações técnicas acionáveis.

Sua tarefa é analisar a transcrição de reunião fornecida e extraí-la em um documento JSON estruturado.

### REGRAS E DIRETRIZES:
1.  **FOCO TOTAL:** Ignore conversas triviais (ex: "bom dia", "como vai o tempo"). Foque *exclusivamente* em feedbacks, pedidos, problemas e requisitos relacionados ao software.
2.  **SEJA OBJETIVO:** Extraia os pontos de forma concisa. Não copie e cole frases longas da transcrição; reescreva-as como requisitos claros.
3.  **NÃO INVENTE:** Se um campo não for mencionado (ex: prioridade), deixe o valor como `null` ou `Não mencionado`.
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
      "type": "NEW_FEATURE", // Tipos: "NEW_FEATURE", "BUG_FIX", "IMPROVEMENT", "NON_FUNCTIONAL"
      "title": "Título curto e descritivo da demanda",
      "description": "Descrição detalhada do que foi solicitado pelo cliente.",
      "context": "O problema ou razão pelo qual o cliente pediu isso (se mencionado).",
      "priority": "HIGH" // Valores: "HIGH", "MEDIUM", "LOW", "Não mencionado"
    }
  ]
}

### EXEMPLO DE UM ACTION ITEM:
- Se o cliente disser: "Eu não consigo achar o botão de salvar, está muito escondido. Tinha que ser lá em cima, verde e grande."
- O JSON seria:
  {
    "type": "IMPROVEMENT",
    "title": "Mover e redesenhar o botão 'Salvar'",
    "description": "O cliente solicitou que o botão 'Salvar' seja movido para uma posição mais visível (possivelmente no topo da página) e tenha maior destaque (cor verde, tamanho maior).",
    "context": "O botão atual está confuso e difícil de localizar para o usuário.",
    "priority": "MEDIUM"
  }

Agora, analise a transcrição do usuário. Lembre-se, sua resposta deve ser *apenas* o JSON.
```
