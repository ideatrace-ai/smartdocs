# Guide: Requirements Analyst Worker

This document provides a detailed explanation of the Requirements Analyst Worker, the final and most critical step in the audio processing pipeline.

## 1. Overview

The Requirements Analyst Worker acts as the "brain" of the system. Its purpose is to take the raw, unstructured text from a full audio transcription and transform it into a structured, actionable JSON document containing key software requirements, action items, and project details.

This worker is designed to:
-   Consume messages from the `q.transcript.analyze` RabbitMQ queue, which contains the full transcription text.
-   Use a powerful, local Large Language Model (`deepseek-coder` via Ollama) to perform a deep analysis of the text.
-   Leverage a detailed system prompt to instruct the LLM to extract specific information and format it according to a strict JSON schema.
-   Parse the resulting JSON from the LLM.
-   Save the final, structured JSON document to the PostgreSQL database, completing the processing loop.

## 2. What Was Implemented

-   **Worker Logic (`analyst.worker.ts`):** An `AnalystWorker` class has been created. Its `perform` method orchestrates the analysis and database insertion.
-   **LLM Integration (Ollama with `deepseek-coder`):** The worker is configured to make API calls to a local Ollama instance. It uses the `deepseek-coder` model (as specified in the project plan, also known as `deepseek-r1`) for its powerful reasoning and code-aware capabilities.
-   **Detailed System Prompt:** A comprehensive system prompt is included directly in the worker. This prompt guides the LLM to act as a Senior Requirements Engineer and strictly adhere to the desired output JSON format, ensuring consistent and high-quality results.
-   **JSON Formatting:** The worker explicitly requests JSON output from the Ollama API (`format: "json"`) to improve the reliability of parsing the LLM's response.
-   **Database Integration (`db` module):** After receiving and parsing the JSON from the LLM, the worker uses the shared Drizzle ORM client to insert the final document into the `requirement_documents` table in the PostgreSQL database.
-   **Consumer (`analyst.consumer.ts`):** A dedicated consumer listens to the `q.transcript.analyze` queue and triggers the `AnalystWorker` for each incoming transcription.

## 3. Prerequisites (What You Need on Your Computer)

To run this service, you need the following software installed and running:

1.  **Bun:** The project uses Bun as the JavaScript runtime.
2.  **RabbitMQ:** The message broker for inter-service communication.
3.  **PostgreSQL:** The database for storing the final structured documents.
4.  **Ollama:** Required to run the local LLM for analysis.
    ```bash
    # Download and install from https://ollama.com/
    ```
    Once installed, you must pull the `deepseek-coder` model. This is a large model and may take some time to download.
    ```bash
    ollama pull deepseek-coder
    ```
    *(Note: If you have a specific version like `deepseek-r1`, use that name instead).*

## 4. Step-by-Step Setup

1.  **Install Dependencies:** Ensure all dependencies are installed by running `bun install` in the `apps/api` directory.
    ```bash
    cd apps/api
    bun install
    ```

2.  **Set Up Environment Variables:** Ensure your `.env` file in the `apps/api` directory is correctly configured, especially the `DATABASE_URL` and `RABBITMQ_URL`.

3.  **Run Database Migrations:** If you haven't already, run the database migrations from the `apps/api` directory to ensure the `requirement_documents` table exists.
    ```bash
    cd apps/api
    bun run db:migrate
    ```

## 5. How to Execute the Analyst Worker

The Analyst worker runs as a consumer process, listening for completed transcriptions.

To run the Analyst consumer, open a new terminal window, navigate to the `apps/api` directory, and execute:

```bash
bun run consume:analyst
```

This consumer will start and wait for messages on the `q.transcript.analyze` queue. These messages are published by the Transcription Worker after it successfully transcribes an audio file.

## 6. Testing the Full End-to-End Pipeline

To see the entire system in action, you must run all services concurrently. Open four separate terminal windows:

1.  **Terminal 1 (API Server):**
    ```bash
    # In apps/api directory
    bun run dev
    ```
2.  **Terminal 2 (Gatekeeper Consumer):**
    ```bash
    # In apps/api directory
    bun run consume:gatekeeper
    ```
3.  **Terminal 3 (Transcription Consumer):**
    ```bash
    # In apps/api directory
    bun run consume:transcription
    ```
4.  **Terminal 4 (Analyst Consumer):**
    ```bash
    # In apps/api directory
    bun run consume:analyst
    ```

Now, when you upload an audio file via the `POST /upload` endpoint, it will be processed through the entire chain of services, and the final structured JSON document will be saved in your PostgreSQL database.
