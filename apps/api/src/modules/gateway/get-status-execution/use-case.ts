import { db } from "../../../shared/database";

export async function getProcessingStatus(audio_hash: string) {
  const status = await db.query.processingStatus.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
    orderBy: (fields, { desc }) => desc(fields.updated_at),
  });

  if (status) {
    return status;
  }

  const document = await db.query.requirementDocuments.findFirst({
    where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
  });

  if (document) {
    return {
      audio_hash,
      status: "COMPLETE",
      details: "Document found in requirements table.",
      updated_at: new Date(),
    };
  }

  return null;
}
