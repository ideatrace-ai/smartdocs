import path from "path";
import { db } from "../../../shared/database";
import { logger } from "../../../shared/utils/logger";

const ALLOWED_OUTPUT_DIR = path.resolve(process.cwd(), "data", "outputs");

export async function getDownloadFilePath(audio_hash: string) {
    const document = await db.query.requirementDocuments.findFirst({
        where: (fields, { eq }) => eq(fields.audio_hash, audio_hash),
    });

    if (document && document.document_data) {
        const data = document.document_data as { filePath?: string };
        const filePath = data.filePath || null;

        if (filePath) {
            const resolvedPath = path.resolve(filePath);
            if (!resolvedPath.startsWith(ALLOWED_OUTPUT_DIR)) {
                logger.error("Path traversal attempt blocked", { filePath });
                return null;
            }
            return resolvedPath;
        }
    }

    return null;
}
