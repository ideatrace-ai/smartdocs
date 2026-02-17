import { Elysia } from "elysia";
import { getDownloadFilePath } from "./use-case";
import fs from "fs";

export const downloadFileRouter = new Elysia().get(
    "/download/:audio_hash",
    async ({ params, status, set }) => {
        const filePath = await getDownloadFilePath(params.audio_hash);

        if (!filePath || !fs.existsSync(filePath)) {
            const body = {
                error: "Not Found",
                message: `No document found for audio_hash: ${params.audio_hash}`,
            };
            return status(404, body);
        }

        set.headers["content-type"] = "text/markdown; charset=utf-8";
        set.headers["content-disposition"] = `attachment; filename="${params.audio_hash}.md"`;

        const file = Bun.file(filePath);
        return file;
    },
);
