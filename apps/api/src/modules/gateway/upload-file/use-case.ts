import { createHash } from "crypto";
import { db } from "../../../shared/database";
import { processingStatus } from "../../../shared/database/schema";
import { queueService } from "../../../shared/queue/services/queue.service";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { ProcessingStatus, QueueNames } from "../../../shared/utils/constants";
import { logger } from "../../../shared/utils/logger";

export async function handleAudioUpload(audioFile: File) {
  const audioBuffer = await audioFile.arrayBuffer();

  const hash = createHash("sha256")
    .update(Buffer.from(audioBuffer))
    .digest("hex");

  const cachedDocument = await db.query.requirementDocuments.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, hash),
  });

  if (cachedDocument) {
    logger.info(`Cache hit for audio_hash: ${hash}`);
    const documentData = cachedDocument.document_data as { filePath?: string };
    return {
      isCached: true,
      data: {
        status: "COMPLETE",
        message: "Document already exists.",
        audio_hash: hash,
        file_path: documentData.filePath || null,
      },
    };
  }

  logger.info(`Cache miss for audio_hash: ${hash}. Processing...`);

  const dataDir = path.join(process.cwd(), "data", "audio_files");
  await mkdir(dataDir, { recursive: true });

  const safeExtension = path.extname(path.basename(audioFile.name)) || ".wav";
  const filePath = path.join(dataDir, `${hash}${safeExtension}`);
  await writeFile(filePath, Buffer.from(audioBuffer));
  logger.info(`Audio file saved to: ${filePath}`);

  await db
    .insert(processingStatus)
    .values({
      audio_hash: hash,
      status: ProcessingStatus.PENDING_VALIDATION,
    })
    .onConflictDoNothing();

  await queueService.publish(QueueNames.AUDIO_NEW, {
    audio_hash: hash,
    file_path: filePath,
  });

  return {
    isCached: false,
    data: {
      status: "accepted",
      message: "Audio processing started.",
      audio_hash: hash,
    },
  };
}
