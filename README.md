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
| `AI_PROVIDER` | Preferred provider (`gemini`, `openai`, `anthropic`, `ollama`). | `ollama` |
| `GEMINI_API_KEY` | API Key for Google Gemini. | Optional |
| `OPENAI_API_KEY` | API Key for OpenAI (GPT). | Optional |
| `ANTHROPIC_API_KEY`| API Key for Anthropic (Claude). | Optional |
| `AI_MODEL` | Specific model to use (e.g., `gpt-4o`, `claude-3-5-sonnet`). | Provider Default |

## Overview

The core philosophy of SmartDocs is "local-first," but it offers the flexibility to use powerful cloud-based AI models when needed. Your data can be processed entirely on your own hardware using Ollama, or you can provide your own API keys for professional-grade analysis via Gemini, OpenAI, or Anthropic.

### Features

-   **Flexible AI Providers**: Choose between local-first processing (Ollama) or high-performance cloud models (Gemini, OpenAI, Anthropic).
-   **User-Provided API Keys**: Users can enter their own AI API keys directly in the web interface for custom processing.
-   **Local Fallback**: If no API keys are provided, the system seamlessly falls back to your local Ollama instance.
-   **Event-Driven Architecture**: Built on a robust, scalable architecture using RabbitMQ for asynchronous job processing.
-   **AI-Powered Filtering**: A "Gatekeeper" worker uses a lightweight LLM to quickly discard irrelevant audio (e.g., music, noise).
-   **Multilingual Transcription**: Utilizes Whisper for accurate speech-to-text conversion with support for multiple languages.
-   **Intelligent Analysis**: Generates professional Software Requirements Specification (SRS) documents using the provider of your choice.
-   **Markdown Output**: Generates well-structured, readable Markdown documents instead of raw JSON.
-   **Interactive Editor**: View and edit the generated requirements directly in the browser.
-   **Processing Cache**: Avoids re-processing by caching results based on the audio file's hash.

## Architecture

The system is a TypeScript monorepo managed by Turborepo. The backend is built with Bun and ElysiaJS, communicating with a series of background workers via RabbitMQ.

1.  **API (`apps/api`)**: The main entry point. It receives an audio file and optional AI configurations (provider/key), generates a hash, and places a new job in the `q.audio.new` queue.
2.  **Gatekeeper Worker**: Consumes from `q.audio.new`. It validates the audio for speech content using the selected AI provider.
3.  **Transcriber Worker**: Consumes from `q.audio.transcribe`. It performs a full transcription of the audio using local Whisper.
4.  **Analyst Worker**: Consumes from `q.transcript.analyze`. It uses the selected AI provider (Local or Cloud) to generate a structured Markdown SRS document.

## Tech Stack

-   **Runtime**: Bun
-   **Backend Framework**: ElysiaJS
-   **Frontend**: Next.js with React & Tailwind CSS
-   **Database**: PostgreSQL with Drizzle ORM
-   **Message Broker**: RabbitMQ
-   **AI Services**:
    -   **Local**: Ollama (phi3, llama3, etc.)
    -   **Cloud**: Google Gemini, OpenAI (GPT), Anthropic (Claude)
    -   **Transcription**: `nodejs-whisper` (local)
-   **Audio Processing**: FFmpeg

---

## Running the Project (Hybrid Mode)

The project runs in a **Hybrid Mode**:
-   **Infrastructure**: PostgreSQL and RabbitMQ run in Docker.
-   **Application**: The Web App, API, and Workers run locally on your machine using Bun.

### 1. Prerequisites

-   **Docker**: [Install Docker](https://docs.docker.com/get-docker/) (or OrbStack)
-   **Bun**: [Install Bun](https://bun.sh/)
-   **FFmpeg**: `brew install ffmpeg`
-   **Ollama**: Must be installed and running on your host machine. [Download Ollama](https://ollama.com/)

### 2. Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 3. Set Up AI Models

The AI models run on your host machine using Ollama.

-   **Pull Ollama Models**:
    ```bash
    ollama pull phi3:mini
    ollama pull deepseek-coder
    ```

### 4. Start Infrastructure

Start the database and message broker using Docker Compose:

```bash
docker compose up -d
```

### 5. Install Dependencies & Setup Database

Install the project dependencies and run the database migrations:

```bash
bun install
cd apps/api && bun run db:migrate
```

### 6. Run the Application

You can run the entire application (Web, API, and Workers) with a single command from the project root:

```bash
bun run dev
```

This command uses Turborepo to run the following services in parallel:
-   **Web App**: [http://localhost:3000](http://localhost:3000)
-   **API Server**: [http://localhost:8080](http://localhost:8080)
-   **Gatekeeper Worker**
-   **Transcription Worker**
-   **Analyst Worker**

### Stopping the Application

-   Press `Ctrl+C` to stop the application services.
-   Run `docker compose down` to stop the infrastructure.

## How to Use

1.  Open [http://localhost:3000](http://localhost:3000) in your browser.
2.  Upload an audio file (MP3, WAV, M4A, MP4).
3.  The system will process the file through the pipeline. You can watch the progress in the web interface.
4.  Once processing is complete, click the "Download Requirements Document" button to get your Markdown file.
5.  Alternatively, access documents via the API at `http://localhost:8080/gateway/download/{audio_hash}`.

