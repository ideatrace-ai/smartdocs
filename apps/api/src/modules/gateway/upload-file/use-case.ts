import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { db } from "../../../shared/database";
import { processingStatus } from "../../../shared/database/schema";
import { queueService } from "../../../shared/queue/services/queue.service";
import { ProcessingStatus, QueueNames } from "../../../shared/utils/constants";
import { logger } from "../../../shared/utils/logger";

export async function handleAudioUpload(
  audioFile: File,
  apiKey?: string,
  provider?: string,
) {
  const dataDir = path.join(process.cwd(), "data", "audio_files");
  await mkdir(dataDir, { recursive: true });

  const safeExtension = path.extname(path.basename(audioFile.name)) || ".wav";
  const tempPath = path.join(dataDir, `upload_${Date.now()}${safeExtension}`);

  const hash = createHash("sha256");
  const writeStream = createWriteStream(tempPath);
  const readable = Readable.fromWeb(audioFile.stream() as any);

  await pipeline(
    readable,
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    writeStream,
  );

  const audioHash = hash.digest("hex");

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

  const filePath = path.join(dataDir, `${audioHash}${safeExtension}`);
  await rename(tempPath, filePath);
  logger.info(`Audio file saved to: ${filePath}`);

  await db
    .insert(processingStatus)
    .values({
      audio_hash: audioHash,
      status: ProcessingStatus.PENDING_VALIDATION,
    })
    .onConflictDoNothing();

  await queueService.publish(QueueNames.AUDIO_NEW, {
    audio_hash: audioHash,
    file_path: filePath,
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
