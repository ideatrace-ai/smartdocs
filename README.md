# Smart Docs

Smart Docs is a tool to extract requirements from audio files.

## Configuration

The backend requires several environment variables to be set for proper operation. These variables are defined in `apps/api/.env.example`. When running with Docker, you should copy this file to `apps/api/.env` and customize the values as needed.

### API Environment Variables

These variables are validated in `apps/api/src/shared/config/envs.ts`.

#### App Configuration (`loadAppEnvs`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Node.js environment. | `dev` |
| `PORT` | Port for the API server. | `8080` |
| `CLIENT_URL` | URL of the frontend application. | `http://localhost:3000` |

#### Database & Queue (`loadDbEnvs`)

| Variable | Description | Required |
| :--- | :--- | :--- |
| `DATABASE_URL`| URL for your PostgreSQL database. | Yes |
| `RABBITMQ_URL`| URL for your RabbitMQ instance. | Yes |

#### Services (`loadServicesEnvs`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OLLAMA_API_URL`| URL for your local Ollama API server. | `http://localhost:11434` |

#### Workers Configuration

##### Transcription Worker (`loadTranscriptionEnvs`)

| Variable | Description | Required |
| :--- | :--- | :--- |
| `TRANSCRIPTION_MODEL` | Model used for audio transcription (e.g., 'tiny'). | Yes |
| `TRANSCRIPTION_LANGUAGE`| Language used for transcription (e.g., 'en', 'pt'). | Yes |

##### Analyst Worker (`loadAnalyticsEnvs`)

| Variable | Description | Required |
| :--- | :--- | :--- |
| `ANALYTICS_MODEL` | Ollama model used for analysis (e.g., 'llama3'). | Yes |

##### Gatekeeper Worker (`loadGatekeeperEnvs`)

| Variable | Description | Default/Required |
| :--- | :--- | :--- |
| `GATEKEEPER_TRANSCRIPTION_MODEL` | Model used for fast transcription by the Gatekeeper. | Yes |
| `GATEKEEPER_ANALYTICS_MODEL` | Model used for context validation by the Gatekeeper. | Yes |
| `TRANSCRIPTION_LANGUAGE` | Language for transcription. | Yes |
| `MAX_RETRIES` | Maximum number of times to sample the audio. | `3` |
| `SAMPLE_DURATION` | Duration (in seconds) of each audio sample. | `30` |




#### AI Configuration (`loadAiEnvs`)

These variables allow you to switch between different AI providers. If no provider is specified and no API keys are provided, the system defaults to **Ollama** (local).

| Variable | Description | Default |
| :--- | :--- | :--- |
| `AI_PROVIDER` | Preferred provider (`gemini`, `openai`, `anthropic`, `openrouter`, `ollama`). | `ollama` |
| `GEMINI_API_KEY` | API Key for Google Gemini. | Optional |
| `OPENAI_API_KEY` | API Key for OpenAI (GPT). | Optional |
| `ANTHROPIC_API_KEY`| API Key for Anthropic (Claude). | Optional |
| `OPENROUTER_API_KEY`| API Key for OpenRouter. | Optional |
| `AI_MODEL` | Specific model to use (e.g., `gpt-4o`, `google/gemini-flash-1.5`). | Provider Default |

## Overview

The core philosophy of SmartDocs is "local-first," but it offers the flexibility to use powerful cloud-based AI models when needed. Your data can be processed entirely on your own hardware using Ollama, or you can provide your own API keys for professional-grade analysis via Gemini, OpenAI, Anthropic, or OpenRouter.

### Features

-   **Unified AI Integration**: Powered by the **Vercel AI SDK**, providing a robust and extensible interface for multiple LLM providers.
-   **Flexible AI Providers**: Choose between local-first processing (Ollama) or high-performance cloud models (Gemini, OpenAI, Anthropic, OpenRouter).
-   **Hybrid Transcription**: Support for both local transcription (via Whisper/nodejs-whisper) and high-accuracy cloud transcription (via OpenAI Whisper API).
-   **User-Provided API Keys**: Users can enter their own AI API keys directly in the web interface for custom processing.
-   **Local Fallback**: If no API keys are provided, the system seamlessly falls back to your local Ollama instance (using the OpenAI-compatible bridge).
-   **Event-Driven Architecture**: Built on a robust, scalable architecture using RabbitMQ for asynchronous job processing.
-   **AI-Powered Filtering**: A "Gatekeeper" worker uses a lightweight LLM to quickly discard irrelevant audio (e.g., music, noise).
-   **Multilingual Transcription**: Support for multiple languages with automated cleaning of timestamps and noise.
-   **Intelligent Analysis**: Generates professional Software Requirements Specification (SRS) documents using the provider of your choice.
-   **Markdown Output**: Generates well-structured, readable Markdown documents instead of raw JSON.
-   **Interactive Editor**: View and edit the generated requirements directly in the browser.
-   **Processing Cache**: Avoids re-processing by caching results based on the audio file's hash.

## Architecture

The system is a TypeScript monorepo managed by Turborepo. The backend is built with Bun and ElysiaJS, communicating with a series of background workers via RabbitMQ. AI interactions are abstracted through the **Vercel AI SDK**, ensuring consistency and resilience across different providers.

1.  **API (`apps/api`)**: The main entry point. It receives an audio file and optional AI configurations (provider/key/model), generates a hash, and places a new job in the `q.audio.new` queue.
2.  **Gatekeeper Worker**: Consumes from `q.audio.new`. It validates the audio for speech content using the selected AI provider.
3.  **Transcriber Worker**: Consumes from `q.audio.transcribe`. It performs transcription using either local Whisper or the OpenAI Whisper API based on the request parameters.
4.  **Analyst Worker**: Consumes from `q.transcript.analyze`. It uses the selected AI provider (Local or Cloud) via the AI SDK to generate a structured Markdown SRS document.

## Tech Stack

-   **Runtime**: Bun
-   **Backend Framework**: ElysiaJS
-   **Frontend**: Next.js with React & Tailwind CSS
-   **Database**: PostgreSQL with Drizzle ORM
-   **Message Broker**: RabbitMQ
-   **AI Orchestration**: **Vercel AI SDK** (`ai` package)
-   **AI Providers**:
    -   **Text Generation**: Google Gemini, OpenAI (GPT), Anthropic (Claude), OpenRouter, Ollama.
    -   **Transcription**: OpenAI Whisper (Cloud) and `nodejs-whisper` (local).
-   **Audio Processing**: FFmpeg

---

## Getting Started

The project runs in **Hybrid Mode**: infrastructure (PostgreSQL, RabbitMQ) in Docker, and the application (Web, API, Workers) locally via Bun.

### Prerequisites

-   [Docker](https://docs.docker.com/get-docker/) (or OrbStack)
-   [Bun](https://bun.sh/)
-   [FFmpeg](https://ffmpeg.org/download.html) (`brew install ffmpeg` on macOS)
-   [Ollama](https://ollama.com/) (optional, required only for local AI processing)

### Quick Setup (Automated)

Clone the repository and run the setup script. It handles everything: environment files, Docker containers, dependencies, and database migrations.

```bash
git clone <your-repository-url>
cd <repository-name>
bun install
bun run setup
```

After setup, start the application:

```bash
bun run dev
```

### Manual Setup

If you prefer to configure each step manually:

1.  **Clone and install dependencies**
    ```bash
    git clone <your-repository-url>
    cd <repository-name>
    bun install
    ```

2.  **Configure environment variables**

    Copy the example files and adjust values as needed:
    ```bash
    cp apps/api/.env.example apps/api/.env
    cp apps/web/.env.example apps/web/.env
    ```

3.  **Start infrastructure**
    ```bash
    docker compose up -d
    ```

4.  **Run database migrations**
    ```bash
    cd apps/api && bun run db:migrate
    ```

5.  **Pull Ollama models** (optional, for local AI)
    ```bash
    ollama pull llama3
    ollama pull phi3:mini
    ```

6.  **Start the application**
    ```bash
    bun run dev
    ```

### Available Services

| Service | URL |
| :--- | :--- |
| Web App | [http://localhost:3000](http://localhost:3000) |
| API Server | [http://localhost:8080](http://localhost:8080) |
| RabbitMQ Management | [http://localhost:15672](http://localhost:15672) (guest/guest) |
| Drizzle Studio | `cd apps/api && bun run db:studio` |

### Stopping the Application

-   Press `Ctrl+C` to stop the application services.
-   Run `docker compose down` to stop the infrastructure.

## How to Use

1.  Open [http://localhost:3000](http://localhost:3000) in your browser.
2.  Upload an audio file (MP3, WAV, M4A, MP4).
3.  The system will process the file through the pipeline. You can watch the progress in the web interface.
4.  Once processing is complete, click the "Download Requirements Document" button to get your Markdown file.
5.  Alternatively, access documents via the API at `http://localhost:8080/gateway/download/{audio_hash}`.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

