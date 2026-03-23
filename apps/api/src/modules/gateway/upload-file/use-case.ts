import busboy from "busboy";
import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { db } from "../../../shared/database";
import { processingStatus } from "../../../shared/database/schema";
import { queueService } from "../../../shared/queue/services/queue.service";
import { ProcessingStatus, QueueNames } from "../../../shared/utils/constants";
import { logger } from "../../../shared/utils/logger";

const MAX_FILE_SIZE = 500 * 1024 * 1024;

interface ParsedUpload {
  filePath: string;
  audioHash: string;
  extension: string;
  apiKey?: string;
  provider?: string;
}

function parseMultipartStream(
  request: Request,
  dataDir: string,
): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let fileProcessed = false;

    const bb = busboy({
      headers: Object.fromEntries(request.headers.entries()),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (_fieldname, stream, info) => {
      fileProcessed = true;
      const ext = path.extname(info.filename) || ".wav";
      const tempPath = path.join(dataDir, `upload_${Date.now()}${ext}`);
      const hash = createHash("sha256");
      const writeStream = createWriteStream(tempPath);

      stream.on("data", (chunk: Buffer) => {
        hash.update(chunk);
      });

      stream.on("limit", () => {
        writeStream.destroy();
        reject(
          new Error(`File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`),
        );
      });

      stream.pipe(writeStream);

      writeStream.on("finish", () => {
        resolve({
          filePath: tempPath,
          audioHash: hash.digest("hex"),
          extension: ext,
          apiKey: fields.api_key,
          provider: fields.provider,
        });
      });

      writeStream.on("error", reject);
      stream.on("error", reject);
    });

    bb.on("error", reject);

    bb.on("close", () => {
      if (!fileProcessed) {
        reject(new Error("No audio file provided"));
      }
    });

    const readable = Readable.fromWeb(request.body as any);
    readable.pipe(bb);
  });
}

export async function handleAudioUpload(request: Request) {
  const dataDir = path.join(process.cwd(), "data", "audio_files");
  await mkdir(dataDir, { recursive: true });

  const { filePath: tempPath, audioHash, extension, apiKey, provider } =
    await parseMultipartStream(request, dataDir);

  const cachedDocument = await db.query.requirementDocuments.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, audioHash),
  });

  if (cachedDocument) {
    logger.info(`Cache hit for audio_hash: ${audioHash}`);
    await unlink(tempPath);
    const documentData = cachedDocument.document_data as { filePath?: string };
    return {
      isCached: true,
      data: {
        status: "COMPLETE",
        message: "Document already exists.",
        audio_hash: audioHash,
        file_path: documentData.filePath || null,
      },
    };
  }

  const finalPath = path.join(dataDir, `${audioHash}${extension}`);
  await rename(tempPath, finalPath);
  logger.info(`Audio file saved to: ${finalPath}`);

  await db
    .insert(processingStatus)
    .values({
      audio_hash: audioHash,
      status: ProcessingStatus.PENDING_VALIDATION,
    })
    .onConflictDoNothing();

  await queueService.publish(QueueNames.AUDIO_NEW, {
    audio_hash: audioHash,
    file_path: finalPath,
    api_key: apiKey,
    provider: provider,
  });

  return {
    isCached: false,
    data: {
      status: "accepted",
      message: "Audio processing started.",
      audio_hash: audioHash,
    },
  };
}
