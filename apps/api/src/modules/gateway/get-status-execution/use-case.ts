import { db } from "../../../shared/database";

export async function getProcessingStatus(audio_hash: string) {
  const status = await db.query.processingStatus.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
    orderBy: (fields, { desc }) => desc(fields.updated_at),
  });

  if (status) {
    if (status.status === "COMPLETE") {
      const document = await db.query.requirementDocuments.findFirst({
        where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
      });

      if (document) {
        const data = document.document_data as { filePath?: string };
        return {
          ...status,
          file_path: data.filePath || null,
        };
      }
    }
    return status;
  }

  const document = await db.query.requirementDocuments.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
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
