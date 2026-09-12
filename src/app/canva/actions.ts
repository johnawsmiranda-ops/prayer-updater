"use server";

import { revalidatePath } from "next/cache";
import {
  getCanvaConnection,
  saveTemplateSelection,
  disconnectCanva,
  recordSync,
} from "@/lib/canva/connection";
import { createAutofillJob, waitForAutofillJob, listBrandTemplates, CanvaNotConnectedError } from "@/lib/canva/autofill";
import { buildAutofillTextData, buildCopyForCanvaText, summarizeCounts, DEFAULT_FIELD_MAPPING } from "@/lib/canva/mapping";
import { getPrayersForCanvaSelection } from "@/lib/prayers";
import type { PrayerFilters } from "@/lib/prayers";
import type { CanvaSyncSummary } from "@/types/prayer";

function parseCanvaDesignId(input: string): string | null {
  const trimmed = input.trim();
  // Accept a raw ID, or a share URL like https://www.canva.com/design/DAF.../view
  const match = trimmed.match(/canva\.com\/design\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{6,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function connectManualTemplateAction(formData: FormData): Promise<{ error?: string }> {
  const url = String(formData.get("canva_url") ?? "");
  const id = parseCanvaDesignId(url);
  if (!id) return { error: "That doesn't look like a valid Canva design link." };

  await saveTemplateSelection({
    designId: id,
    templateId: id, // best-effort: works for Autofill only if this is actually a Brand Template id
    templateName: "Pasted Canva link",
    fieldMapping: DEFAULT_FIELD_MAPPING,
  });
  revalidatePath("/canva");
  return {};
}

export async function selectBrandTemplateAction(templateId: string, templateName: string) {
  await saveTemplateSelection({
    templateId,
    designId: templateId,
    templateName,
    fieldMapping: DEFAULT_FIELD_MAPPING,
  });
  revalidatePath("/canva");
}

export async function listAvailableBrandTemplatesAction(): Promise<
  { id: string; title: string }[] | { error: string }
> {
  try {
    return await listBrandTemplates();
  } catch (err) {
    if (err instanceof CanvaNotConnectedError) return { error: "Connect Canva first." };
    return { error: err instanceof Error ? err.message : "Couldn't load your Canva brand templates." };
  }
}

export async function updateFieldMappingAction(fieldMapping: Record<string, string>) {
  await saveTemplateSelection({ fieldMapping });
  revalidatePath("/canva");
}

export async function disconnectCanvaAction() {
  await disconnectCanva();
  revalidatePath("/canva");
}

export interface UpdateCanvaResult {
  mode: "autofill" | "copy" | "error";
  summary?: CanvaSyncSummary;
  designUrl?: string;
  copyText?: string;
  error?: string;
}

export async function updateCanvaAction(selection: {
  ids?: string[];
  filters?: PrayerFilters;
}): Promise<UpdateCanvaResult> {
  const prayers = await getPrayersForCanvaSelection(selection);
  const connection = await getCanvaConnection();
  const { total, byBucket } = summarizeCounts(prayers);

  const isConnected = connection.connection_status === "CONNECTED" && connection.template_id;

  if (!isConnected) {
    return { mode: "copy", copyText: buildCopyForCanvaText(prayers) };
  }

  try {
    const mapping = Object.keys(connection.field_mapping).length > 0 ? connection.field_mapping : DEFAULT_FIELD_MAPPING;
    const data = buildAutofillTextData(prayers, mapping);
    const job = await createAutofillJob(connection.template_id as string, data);
    const finished = await waitForAutofillJob(job.id);

    if (finished.status !== "success") {
      const message = finished.error?.message ?? "Canva is still processing this update — check back in Canva shortly.";
      return { mode: "error", error: message };
    }

    const summary: CanvaSyncSummary = {
      total,
      byCategory: byBucket,
      syncedAt: new Date().toISOString(),
      mode: "autofill",
    };
    await recordSync(summary);

    return { mode: "autofill", summary, designUrl: finished.result?.design.url };
  } catch (err) {
    if (err instanceof CanvaNotConnectedError) {
      return { mode: "copy", copyText: buildCopyForCanvaText(prayers) };
    }
    return { mode: "error", error: err instanceof Error ? err.message : "Canva update failed." };
  }
}

export async function previewSelectionAction(selection: { ids?: string[]; filters?: PrayerFilters }) {
  const prayers = await getPrayersForCanvaSelection(selection);
  return summarizeCounts(prayers);
}
