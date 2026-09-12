"use server";

import { revalidatePath } from "next/cache";
import {
  createPrayer,
  updatePrayer,
  markAnswered,
  archivePrayer,
  reactivatePrayer,
  deletePrayer,
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
