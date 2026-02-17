import { db } from "../database";
import { processingStatus } from "../database/schema";

export async function updateStatus(
  audio_hash: string,
  status: string,
  details?: string,
) {
  await db
    .insert(processingStatus)
    .values({ audio_hash, status, details })
    .onConflictDoUpdate({
      target: processingStatus.audio_hash,
      set: { status, details, updated_at: new Date() },
    });
}
