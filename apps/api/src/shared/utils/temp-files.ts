import { unlink } from "fs/promises";

export async function cleanupFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      await unlink(filePath);
    } catch {
      // File may not exist, ignore
    }
  }
}
