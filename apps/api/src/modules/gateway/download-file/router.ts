import { Elysia } from "elysia";
import { getDownloadFilePath } from "./use-case";
import fs from "fs";

export const downloadFileRouter = new Elysia().get(
    "/download/:audio_hash",
    async ({ params, status }) => {
        const filePath = await getDownloadFilePath(params.audio_hash);

        if (!filePath || !fs.existsSync(filePath)) {
            const body = {
                error: "Not Found",
                message: `No document found for audio_hash: ${params.audio_hash}`,
            };
            return status(404, body);
        }

        const file = Bun.file(filePath);
        return file;
    },
);
