# Guide: Transcription Worker

This document provides a detailed explanation of the Transcription Worker, what has been implemented, and how to set it up and run it.

## 1. Overview

The Transcription Worker is a service responsible for converting audio files into text. It's designed to be part of a larger, event-driven system for analyzing meeting recordings.

This worker is built to:
-   Listen for messages indicating a new audio file is ready for transcription.
-   Use a local, high-quality speech-to-text model to perform the transcription.
-   Publish the resulting text to another queue for further analysis.

## 2. What Was Implemented

-   **Worker Logic (`transcription.worker.ts`):** A `TranscriptionWorker` class has been created. Its `perform` method contains the core logic for transcribing an audio file.
-   **Transcription Library (`@lumen-labs-dev/whisper-node`):** We've integrated `whisper-node`, a powerful Node.js library that runs the `whisper.cpp` model locally. It's configured to use the `small` model, which offers a good balance of performance and accuracy.
-   **Queue Integration (`queue/index.ts`):** A module for connecting to a RabbitMQ message broker has been set up. The worker uses this module to publish the transcription result to the `q.transcript.analyze` queue or send an error message to the `q.audio.failed` queue.
-   **Configuration (`config/envs.ts`):** The system is configured to read the `RABBITMQ_URL` from your environment variables to connect to the message broker.

## 3. Prerequisites (What You Need on Your Computer)

To run this service, you need the following software installed on your machine:

1.  **Bun:** The project uses Bun as the JavaScript runtime. You can find installation instructions at [bun.sh](https://bun.sh/).
2.  **RabbitMQ:** A message broker is required for the worker to receive and send messages. You can run RabbitMQ locally using Docker for a quick setup.
    ```bash
    # This command starts a RabbitMQ container with the management plugin
    docker run -d --hostname my-rabbit --name some-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
    ```
3.  **Audio File Dependencies:** The `whisper-node` library may require `ffmpeg` to handle different audio formats. It's recommended to have it installed.
    ```bash
    # On macOS with Homebrew
    brew install ffmpeg
    ```

## 4. Step-by-Step Setup

1.  **Install Dependencies:** Navigate to the `apps/api` directory and install the project dependencies.
    ```bash
    cd apps/api
    bun install
    ```

2.  **Set Up Environment Variables:** Create a `.env` file in the `apps/api` directory. This file will hold your secret keys and connection URLs. Copy the following into the file and replace the placeholder values.
    ```env
    # URL for your PostgreSQL database
    DATABASE_URL="postgresql://user:password@host:port/db"

    # URL for your Redis instance
    REDIS_URL="redis://user:password@host:port"

    # URL for your RabbitMQ instance
    # If using the Docker command above, the default is:
    RABBITMQ_URL="amqp://guest:guest@localhost:5672"

    # Other service keys (if needed)
    RESEND_API_KEY="your_key"
    EMAIL_DOMAIN="your_domain"
    ```

3.  **Download the Transcription Model:** The worker needs the `small` model files to perform the transcription. From the `apps/api` directory, run the following command:
    ```bash
    npx whisper-node download --model small
    ```
    This will download the model into the correct location within your `node_modules` directory.

## 5. How to Run the Worker

The current implementation includes the worker's logic but does not yet include a *consumer* that actively listens for messages from the queue.

To test the worker, you would need to create a script that imports `TranscriptionWorker` and calls its `perform` method with a payload, for example:

```typescript
// Example test script: test-worker.ts
import { TranscriptionWorker } from './src/modules/workers/transcription.worker';

const worker = new TranscriptionWorker();

worker.perform({
  audio_hash: 'some-unique-hash',
  file_path: '/path/to/your/audio.mp3' // Make sure this file exists
}).then(result => {
  console.log('Worker finished:', result);
});
```

The next step in the project is to build the consumer that will make this worker fully operational within the event-driven architecture.
