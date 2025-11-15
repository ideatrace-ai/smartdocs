import { treaty } from "@elysiajs/eden";
// This imports the backend's API type definition directly from the source file.
import type { App } from "../../../api/src/shared/http";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined in .env.local");
}

export const api = treaty<App>(apiUrl);
