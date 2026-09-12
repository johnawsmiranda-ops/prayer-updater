// See the note in workbook.ts — no "server-only" import here so the Excel
// import script (run via tsx, outside Next's build) can use this module too.
import fs from "fs/promises";
import path from "path";

/**
 * Raw byte storage for the app's single "database" file — an actual .xlsx
 * workbook. Vercel's deployed functions have no persistent local disk (every
 * write to the filesystem there is thrown away, possibly before the next
 * request even lands on the same instance), so in production this reads and
 * writes the workbook to Vercel Blob storage instead. Locally, with no blob
 * store configured, it just uses a file on disk — simpler for day-to-day
 * development, and it's exactly the file you'd `import:excel` from.
 *
 * Whichever backend is active, the rest of the app never touches this file
 * directly — see workbook.ts.
 */

const BLOB_PATHNAME = "prayer-updater/prayer-list.xlsx";
const LOCAL_PATH = path.join(process.cwd(), "data", "prayer-list.xlsx");

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readWorkbookBytes(): Promise<Buffer | null> {
  if (blobConfigured()) {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch prayer list blob (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  try {
    return await fs.readFile(LOCAL_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeWorkbookBytes(bytes: Buffer): Promise<void> {
  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PATHNAME, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, bytes);
}

export function storageBackendLabel(): "Vercel Blob" | "local file" {
  return blobConfigured() ? "Vercel Blob" : "local file";
}
