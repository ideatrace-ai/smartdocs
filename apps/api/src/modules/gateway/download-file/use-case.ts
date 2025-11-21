import { db } from "../../../shared/database";

export async function getDownloadFilePath(audio_hash: string) {
    const document = await db.query.requirementDocuments.findFirst({
        where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
    });

    if (document && document.document_data) {
        const data = document.document_data as { filePath?: string };
        return data.filePath || null;
    }

    return null;
}
