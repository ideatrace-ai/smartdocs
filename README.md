# SmartDocs: AI Meeting Analysis

SmartDocs is a local-first, AI-powered system designed to process audio recordings of meetings, transcribe them, and automatically generate structured software requirements documents. It runs entirely on your local machine, leveraging local AI models via Ollama to ensure privacy and control.

## Overview

The core philosophy of SmartDocs is "local-first." Your data is processed on your own hardware without being sent to third-party cloud services. The system listens for an audio file, processes it through an asynchronous pipeline, and saves a detailed, structured JSON document into your local database.

### Features

-   **Local-First Processing**: All processing, from transcription to AI analysis, happens on your machine.
-   **Event-Driven Architecture**: Built on a robust, scalable architecture using RabbitMQ for asynchronous job processing.
-   **AI-Powered Filtering**: A "Gatekeeper" worker uses a lightweight LLM to quickly discard irrelevant audio (e.g., music, non-technical conversations).
-   **High-Quality Transcription**: Utilizes a local Whisper.cpp model for accurate speech-to-text conversion.
-   **Intelligent Analysis**: A powerful LLM analyzes the transcription to identify action items, features, and bug fixes, structuring them into a formal document.
-   **Processing Cache**: Avoids re-processing by caching results based on the audio file's hash.
-   **Status Tracking**: An API endpoint allows you to monitor the real-time status of your processing job.

## Architecture

The system is a TypeScript monorepo managed by Turborepo. The backend is built with Bun and ElysiaJS, communicating with a series of background workers via RabbitMQ.

1.  **API (`apps/api`)**: The main entry point. It receives an audio file, generates a hash, checks for a cached result, and if none exists, places a new job in the `q.audio.new` queue.
2.  **Gatekeeper Worker**: Consumes from `q.audio.new`. It validates the audio for speech and context. If valid, it passes the job to the `q.audio.transcribe` queue.
3.  **Transcriber Worker**: Consumes from `q.audio.transcribe`. It performs a full transcription of the audio and places the resulting text in the `q.transcript.analyze` queue.
4.  **Analyst Worker**: Consumes from `q.transcript.analyze`. It uses a powerful LLM to parse the text into a structured JSON document and saves it to the PostgreSQL database.

## Tech Stack

-   **Runtime**: Bun
-   **Backend Framework**: ElysiaJS
-   **Database**: PostgreSQL with Drizzle ORM
-   **Message Broker**: RabbitMQ
-   **Local AI**: Ollama
-   **AI Models**:
    -   `phi-3:mini` (for classification)
    -   `deepseek-coder` (for analysis)
    -   `whisper.cpp` (`tiny.en` & `small.en`) (for transcription)
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
2.  Upload an audio file (MP3, WAV, M4A).
3.  The system will process the file through the pipeline. You can watch the terminal logs to see the progress of each worker.
