import { eq } from "drizzle-orm";
import { db } from "../../../shared/database";
import { processingStatus, requirementDocuments } from "../../../shared/database/schema";

export async function getProcessingStatus(audio_hash: string) {
  const results = await db
    .select({
      audio_hash: processingStatus.audio_hash,
      status: processingStatus.status,
      details: processingStatus.details,
      updated_at: processingStatus.updated_at,
      document_data: requirementDocuments.document_data,
    })
    .from(processingStatus)
    .leftJoin(
      requirementDocuments,
      eq(processingStatus.audio_hash, requirementDocuments.audio_hash),
    )
    .where(eq(processingStatus.audio_hash, audio_hash))
    .limit(1);

  if (results.length > 0) {
    const row = results[0];
    const data = row.document_data as { filePath?: string } | null;
    return {
      audio_hash: row.audio_hash,
      status: row.status,
      details: row.details,
      updated_at: row.updated_at,
      ...(row.status === "COMPLETE" && data?.filePath
        ? { file_path: data.filePath }
        : {}),
    };
  }

  const document = await db.query.requirementDocuments.findFirst({
    where: (fields, ops) => ops.eq(fields.audio_hash, audio_hash),
  });

  if (document) {
    const data = document.document_data as { filePath?: string };
    return {
      audio_hash,
      status: "COMPLETE",
      details: "Document found in requirements table.",
      file_path: data.filePath || null,
      updated_at: new Date(),
    };
  }

  return null;
}
