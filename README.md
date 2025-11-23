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




## Overview

The core philosophy of SmartDocs is "local-first." Your data is processed on your own hardware without being sent to third-party cloud services. The system listens for an audio file, processes it through an asynchronous pipeline, and generates a structured Markdown requirements document saved to your local filesystem.

### Features

-   **Local-First Processing**: All processing, from transcription to AI analysis, happens on your machine.
-   **Event-Driven Architecture**: Built on a robust, scalable architecture using RabbitMQ for asynchronous job processing.
-   **AI-Powered Filtering**: A "Gatekeeper" worker uses a lightweight LLM to quickly discard irrelevant audio (e.g., music, noise).
-   **Multilingual Transcription**: Utilizes Whisper for accurate speech-to-text conversion with support for multiple languages.
-   **Intelligent Analysis**: A powerful LLM analyzes the transcription to generate professional Software Requirements Specification (SRS) documents.
-   **Markdown Output**: Generates well-structured, readable Markdown documents instead of raw JSON.
-   **Document Download**: Download generated requirements documents via a dedicated API endpoint.
-   **Processing Cache**: Avoids re-processing by caching results based on the audio file's hash.
-   **Status Tracking**: An API endpoint allows you to monitor the real-time status of your processing job.

## Architecture

The system is a TypeScript monorepo managed by Turborepo. The backend is built with Bun and ElysiaJS, communicating with a series of background workers via RabbitMQ.

1.  **API (`apps/api`)**: The main entry point. It receives an audio file, generates a hash, checks for a cached result, and if none exists, places a new job in the `q.audio.new` queue.
2.  **Gatekeeper Worker**: Consumes from `q.audio.new`. It validates the audio for speech content. If valid, it passes the job to the `q.audio.transcribe` queue.
3.  **Transcriber Worker**: Consumes from `q.audio.transcribe`. It performs a full transcription of the audio and places the resulting text in the `q.transcript.analyze` queue.
4.  **Analyst Worker**: Consumes from `q.transcript.analyze`. It uses a powerful LLM to generate a structured Markdown SRS document and saves it to the filesystem.

## Tech Stack

-   **Runtime**: Bun
-   **Backend Framework**: ElysiaJS
-   **Frontend**: Next.js with React
-   **Database**: PostgreSQL with Drizzle ORM
-   **Message Broker**: RabbitMQ
-   **Local AI**: Ollama
-   **AI Models**:
    -   `phi3:mini` (for classification)
    -   `deepseek-coder` (for analysis)
    -   `nodejs-whisper` with `tiny` & `small` models (for transcription)
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

