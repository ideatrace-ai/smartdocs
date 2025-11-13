# Guide: Gatekeeper Worker

This document provides a detailed explanation of the Gatekeeper Worker, what has been implemented, and how to set it up and run it.

## 1. Overview

The Gatekeeper Worker is the first line of defense in our audio processing pipeline. Its primary role is to quickly and efficiently filter out irrelevant audio files, ensuring that only potentially valuable content proceeds to more resource-intensive processing steps.

This worker is designed to:
-   Consume messages from the `q.audio.new` RabbitMQ queue, which are published by the API Principal after an audio upload.
-   Perform Voice Activity Detection (VAD) to check for the presence of speech.
-   Extract random 30-second samples from the audio.
-   Perform a lightweight transcription on these samples.
-   Use a fast, local LLM (phi-3:mini via Ollama) to classify if the audio content is related to "software development".
-   Implement a retry mechanism, attempting classification up to 3 times with different random samples if the initial attempts fail.
-   Publish the audio to the `q.audio.transcribe` queue if it passes validation, or to `q.audio.failed` if it's deemed irrelevant or too short.

## 2. What Was Implemented

-   **Worker Logic (`gatekeeper.worker.ts`):** A `GatekeeperWorker` class has been created. Its `perform` method orchestrates the entire validation process, including audio manipulation, transcription, and classification.
-   **Audio Processing (`fluent-ffmpeg`):** Integrated `fluent-ffmpeg` for:
    -   Converting audio to the specific format required by the VAD library (16kHz, 16-bit PCM, mono WAV).
    -   Extracting random 30-second segments from the original audio file.
    -   Retrieving the total duration of the audio file.
-   **Voice Activity Detection (`node-webrtcvad`):** Used `node-webrtcvad` to analyze the converted audio and determine the percentage of speech present. Audio with less than 10% speech is rejected.
-   **Lightweight Transcription (`@lumen-labs-dev/whisper-node`):** Utilizes `whisper-node` with the `tiny.en` model to quickly transcribe the 30-second audio samples.
-   **LLM Classification (Ollama with `phi-3:mini`):** Makes API calls to a local Ollama instance to classify the transcribed text. It uses a specific prompt to determine if the content is "SOFTWARE" or "OTHER".
-   **Retry Mechanism:** The worker attempts to classify the audio up to 3 times, each time with a new random 30-second sample, before definitively rejecting it.
-   **Queue Integration (`queue/index.ts`):** Uses the shared RabbitMQ module to publish messages to `q.audio.transcribe` (on success) or `q.audio.failed` (on various failure conditions).
-   **Consumer (`gatekeeper.consumer.ts`):** A dedicated consumer listens to the `q.audio.new` queue and triggers the `GatekeeperWorker` for each incoming message.

## 3. Prerequisites (What You Need on Your Computer)

To run this service, you need the following software installed on your machine:

1.  **Bun:** The project uses Bun as the JavaScript runtime. You can find installation instructions at [bun.sh](https://bun.sh/).
2.  **RabbitMQ:** A message broker is required for the worker to receive and send messages. You can run RabbitMQ locally using Docker for a quick setup.
    ```bash
    # This command starts a RabbitMQ container with the management plugin
    docker run -d --hostname my-rabbit --name some-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
    ```
3.  **FFmpeg:** Essential for audio conversion, trimming, and duration detection.
    ```bash
    # On macOS with Homebrew
    brew install ffmpeg
    ```
4.  **Ollama:** Required to run the local LLM for classification.
    ```bash
    # Download and install from https://ollama.com/
    ```
    Once installed, pull the `phi-3:mini` model:
    ```bash
    ollama pull phi-3:mini
    ```

## 4. Step-by-Step Setup

1.  **Install Dependencies:** Navigate to the `apps/api` directory and install the project dependencies.
    ```bash
    cd apps/api
    bun install
    ```

2.  **Set Up Environment Variables:** Ensure your `.env` file in the `apps/api` directory contains the `RABBITMQ_URL` and other necessary variables.
    ```env
    # Example .env content (ensure RABBITMQ_URL is correct)
    DATABASE_URL="postgresql://user:password@host:port/db"
    REDIS_URL="redis://user:password@host:port"
    RABBITMQ_URL="amqp://guest:guest@localhost:5672"
    RESEND_API_KEY="your_key"
    EMAIL_DOMAIN="your_domain"
    ```

3.  **Download the Transcription Model:** The Gatekeeper needs the `tiny.en` model for lightweight transcription. From the `apps/api` directory, run the following command:
    ```bash
    npx whisper-node download --model tiny.en
    ```
    This will download the model into the correct location within your `node_modules` directory.

## 5. How to Execute the Gatekeeper Worker

The Gatekeeper worker runs as a consumer process, listening for new audio messages.

To run the Gatekeeper consumer, open a new terminal window, navigate to the `apps/api` directory, and execute:

```bash
bun run consume:gatekeeper
```

This consumer will start and wait for messages on the `q.audio.new` queue. These messages are typically published by the API Principal's `/upload` endpoint when a new audio file is received.

## 6. Testing the Full Flow (API Principal -> Gatekeeper)

1.  Ensure your RabbitMQ server is running.
2.  Ensure Ollama is running and `phi-3:mini` is pulled.
3.  Run the API server:
    ```bash
    # In apps/api directory
    bun run dev
    ```
4.  Run the Gatekeeper consumer:
    ```bash
    # In apps/api directory
    bun run consume:gatekeeper
    ```
5.  Send a POST request to `http://localhost:8080/upload` with an audio file (e.g., .mp3, .m4a) in the request body (form-data with field name 'audio').

The API will publish a message to `q.audio.new`, which the Gatekeeper consumer will pick up and process. You should see logs from the Gatekeeper indicating its progress.
