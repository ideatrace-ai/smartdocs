import { createHash } from "crypto";
import { db } from "../../shared/database";
import { requirementDocuments } from "../../shared/database/schema";
import { publishMessage } from "../../shared/queue";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { t } from "elysia";

export async function handleAudioUpload(audioFile: t.File) {
  const audioBuffer = await audioFile.arrayBuffer();

  const hash = createHash("sha256").update(Buffer.from(audioBuffer)).digest("hex");

  const cachedDocument = await db.query.requirementDocuments.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, hash),
  });

  if (cachedDocument) {
    console.log(`Cache hit for audio_hash: ${hash}`);
    return { isCached: true, data: cachedDocument.document_data };
  }

  console.log(`Cache miss for audio_hash: ${hash}. Processing...`);

  const dataDir = path.join(process.cwd(), "data", "audio_files");
  await mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, `${hash}${path.extname(audioFile.name)}`);
  await writeFile(filePath, Buffer.from(audioBuffer));
  console.log(`Audio file saved to: ${filePath}`);

  await publishMessage("q.audio.new", { audio_hash: hash, file_path: filePath });

  return { isCached: false, data: { status: "accepted", message: "Audio processing started.", audio_hash: hash } };
}
