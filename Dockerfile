# Use an official Bun image as a base
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Install system dependencies required for the application, like ffmpeg for audio processing.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Use a new stage for installing dependencies to leverage Docker's layer caching.
FROM base as deps
WORKDIR /usr/src/app

# Copy dependency definition files for the entire monorepo
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN bun install --frozen-lockfile

# The final stage, which will be the running container.
FROM deps as runner
WORKDIR /usr/src/app

# Copy the rest of the application code
COPY . .

# Expose the port the API server will listen on
EXPOSE 8080

# The default command to run when the container starts.
# This will be overridden by docker-compose for the consumer services.
CMD ["bun", "run", "apps/api/src/shared/http/index.ts"]
