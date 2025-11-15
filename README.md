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

## Running the Project with Docker (Recommended)

This is the recommended way to run the project. It uses Docker Compose to set up and run all backend services, including the database and message broker. You only need to run the AI models on your host machine.

### 1. Prerequisites

-   **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
-   **Ollama**: Must be installed and running on your host machine. [Download Ollama](https://ollama.com/)

### 2. Clone the Repository

If you haven't already, clone the project to your local machine.

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 3. Set Up AI Models

The AI models run on your host machine using Ollama to ensure high-performance GPU access.

-   **Pull Ollama Models**:
    ```bash
    ollama pull phi-3:mini
    ollama pull deepseek-coder
    ```
-   **Download Whisper Models**: The first time you run the `transcriber` and `gatekeeper` services, they will automatically download the required `small.en` and `tiny.en` models. This might take a few minutes. The models will be persisted in a Docker volume (`whisper_models`) for future runs.

### 4. Configure Environment Variables

The Docker Compose setup loads variables from `apps/api/.env`. Create this file by copying the provided example.

```bash
cp apps/api/.env.example apps/api/.env
```

The values in `.env.example` are already configured for the Docker environment, so you don't need to change anything.

### 5. Build and Run the Application

Now, you can build and run all the services with a single command from the project root.

```bash
docker-compose up --build
```

This command will:
-   Build the application's Docker image.
-   Start containers for the API, all three workers, PostgreSQL, and RabbitMQ.
-   Show you the combined logs from all services.

### 6. Run Database Migrations

With the containers running, open a **new terminal window** and run the database migrations *inside* the `api` container.

```bash
docker-compose exec api bun run apps/api/db:migrate
```

Your entire backend system is now running and ready to process audio.

### Stopping the Application

To stop all services, press `Ctrl+C` in the terminal where `docker-compose` is running, and then run:

```bash
docker-compose down
```

### Running the Frontend

With the backend running, you can now start the frontend application.

1.  **Navigate to the web directory**:
    ```bash
    cd apps/web
    ```

2.  **Set up environment variables**:
    Create a `.env.local` file by copying the example. The default URL is already configured to connect to the backend running in Docker.
    ```bash
    cp .env.example .env.local
    ```

3.  **Run the development server**:
    ```bash
    bun run dev
    ```

The frontend will be available at [http://localhost:3000](http://localhost:3000). You can now open this URL in your browser to use the web interface for uploading files.

## How to Use

You can interact with the backend in two ways:

1.  **Via the Web Interface (Recommended)**: Open [http://localhost:3000](http://localhost:3000) in your browser and use the upload form.
2.  **Via `curl`**: If you prefer to use the command line, the API is exposed on your host machine at port `8080`.

### Upload an Audio File

Use a tool like `curl` to send a `POST` request to the `/orchestrator/upload` endpoint with an audio file (`.mp3`, `.m4a`, `.wav`, etc.).

```bash
curl -X POST http://localhost:8080/orchestrator/upload \
  -F "audio=@/path/to/your/meeting.mp3"
```

If the request is successful, you will receive a `202 Accepted` response with the `audio_hash`:

```json
{
  "status": "accepted",
  "message": "Audio processing started.",
  "audio_hash": "a1b2c3d4..."
}
```

### Check Processing Status

Use the `audio_hash` from the upload response to check the status of the job.

```bash
curl http://localhost:8080/orchestrator/status/<your_audio_hash>
```

The status will update as the file moves through the pipeline, from `PENDING_VALIDATION` to `COMPLETE` or `FAILED`. Once complete, the final document will be in your `requirement_documents` table, which you can access by connecting to the PostgreSQL database on `localhost:5432`.
