"use server";

import { revalidatePath } from "next/cache";
import { restoreDbFromBytes } from "@/lib/store/workbook";

export interface RestoreResult {
  error?: string;
  success?: boolean;
  prayerCount?: number;
}

/**
 * Admin-only "Restore from Excel file" tool — replaces the ENTIRE current
 * database with whatever's in the uploaded .xlsx. This route runs inside the
 * live deployment, so (unlike a script run from outside Vercel) it has real
 * access to however Blob storage is actually configured here — a static
 * BLOB_READ_WRITE_TOKEN, or the newer OIDC-based connection.
 */
export async function restoreWorkbookAction(formData: FormData): Promise<RestoreResult> {
  const file = formData.get("workbook");
  if (!(file instanceof File)) {
    return { error: "No file was uploaded." };
  }
  if (file.size === 0) {
    return { error: "That file is empty." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const db = await restoreDbFromBytes(bytes);
    revalidatePath("/prayers");
    revalidatePath("/archive");
    revalidatePath("/canva");
    revalidatePath("/settings");
    return { success: true, prayerCount: db.prayers.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that file as a prayer list workbook." };
  }
}
