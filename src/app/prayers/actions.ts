"use server";

import { revalidatePath } from "next/cache";
import {
  createPrayer,
  updatePrayer,
  markAnswered,
  archivePrayer,
  reactivatePrayer,
  deletePrayer,
  bulkMarkAnswered,
  bulkArchivePrayers,
  bulkReactivatePrayers,
  bulkDeletePrayers,
  type NewPrayerInput,
  type PrayerUpdateInput,
} from "@/lib/prayers";

function touch() {
  revalidatePath("/prayers");
  revalidatePath("/archive");
  revalidatePath("/canva");
}

export async function createPrayerAction(input: NewPrayerInput) {
  const prayer = await createPrayer(input);
  touch();
  return prayer;
}

export async function updatePrayerAction(id: string, input: PrayerUpdateInput) {
  const prayer = await updatePrayer(id, input);
  touch();
  return prayer;
}

export async function markAnsweredAction(id: string) {
  const prayer = await markAnswered(id);
  touch();
  return prayer;
}

export async function archivePrayerAction(id: string) {
  const prayer = await archivePrayer(id);
  touch();
  return prayer;
}

export async function reactivatePrayerAction(id: string) {
  const prayer = await reactivatePrayer(id);
  touch();
  return prayer;
}

export async function deletePrayerAction(id: string) {
  await deletePrayer(id);
  touch();
}

// --- Bulk variants, for the toolbar's multi-select actions ---
//
// These do the whole selected batch in a single read-modify-write round trip
// to Blob storage (see bulk* in lib/prayers.ts), instead of looping the
// single-item helper once per id -- that loop was the main reason deleting
// (or archiving/marking answered on) more than a row or two felt slow.

export async function bulkMarkAnsweredAction(ids: string[]) {
  await bulkMarkAnswered(ids);
  touch();
}

export async function bulkArchivePrayerAction(ids: string[]) {
  await bulkArchivePrayers(ids);
  touch();
}

export async function bulkReactivatePrayerAction(ids: string[]) {
  await bulkReactivatePrayers(ids);
  touch();
}

export async function bulkDeletePrayerAction(ids: string[]) {
  await bulkDeletePrayers(ids);
  touch();
}
