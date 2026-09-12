"use server";

import { revalidatePath } from "next/cache";
import { createPrayer } from "@/lib/prayers";

export interface AddPrayerState {
  error?: string;
  success?: boolean;
}

export async function addPrayerAction(_prev: AddPrayerState, formData: FormData): Promise<AddPrayerState> {
  const name = String(formData.get("name") ?? "").trim();
  const prayer_request = String(formData.get("prayer_request") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "");
  const category = String(formData.get("category") ?? "").trim();

  if (!name) return { error: "Name / Family is required." };
  if (!prayer_request) return { error: "Prayer request is required." };
  const year = Number(yearRaw) || new Date().getFullYear();
  if (!category) return { error: "Category is required." };

  await createPrayer({
    year,
    name,
    prayer_request,
    requested_by: String(formData.get("requested_by") ?? "").trim() || null,
    category,
    assigned_ministry: String(formData.get("assigned_ministry") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  revalidatePath("/prayers");
  // No server-side redirect here (on purpose) -- the client shows a
  // confirmation the admin has to dismiss with OK/close first, then
  // navigates back to the list itself.
  return { success: true };
}
