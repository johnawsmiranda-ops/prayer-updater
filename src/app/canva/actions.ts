"use server";

import { revalidatePath } from "next/cache";
import {
  getCanvaConnection,
  saveTemplateSelection,
  disconnectCanva,
  recordSync,
} from "@/lib/canva/connection";
import {
  createAutofillJob,
  waitForAutofillJob,
  listBrandTemplates,
  getDesign,
  CanvaNotConnectedError,
} from "@/lib/canva/autofill";
import { describeCanvaError } from "@/lib/canva/errors";
import {
  buildAutofillTextData,
  buildCopyForCanvaText,
  buildCopyForCanvaTextByMinistry,
  buildCopyBlocksByMinistry,
  buildCopyBlocksByCategory,
  summarizeCounts,
  DEFAULT_FIELD_MAPPING,
} from "@/lib/canva/mapping";
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
    templateName: null,
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
    return { error: describeCanvaError(err) };
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
  /** autofill: Canva was actually updated live. prepared: Canva is connected but this
   *  design can't be autofilled (not a Brand Template) or Canva isn't connected at all —
   *  either way, here's ready-to-paste text instead. error: something failed outright. */
  mode: "autofill" | "prepared" | "error";
  summary?: CanvaSyncSummary;
  designUrl?: string;
  copyText?: string;
  /** Same content as copyText, but split into one block per ministry/category
   *  section so the admin can copy just one section at a time when pasting
   *  into a multi-slide Canva design. */
  copyBlocks?: { label: string; count: number; text: string }[];
  error?: string;
  reason?: string;
}

export async function updateCanvaAction(
  selection: {
    ids?: string[];
    filters?: PrayerFilters;
  },
  groupBy: "ministry" | "category" = "category"
): Promise<UpdateCanvaResult> {
  const prayers = await getPrayersForCanvaSelection(selection);
  const connection = await getCanvaConnection();
  const { total, byBucket } = summarizeCounts(prayers);
  const buildCopyText = groupBy === "ministry" ? buildCopyForCanvaTextByMinistry : buildCopyForCanvaText;
  const buildCopyBlocks = groupBy === "ministry" ? buildCopyBlocksByMinistry : buildCopyBlocksByCategory;
  const preparedFields = () => ({ copyText: buildCopyText(prayers), copyBlocks: buildCopyBlocks(prayers) });

  const isConnected = connection.connection_status === "CONNECTED" && connection.template_id;

  if (!isConnected) {
    return {
      mode: "prepared",
      ...preparedFields(),
      reason: "Canva isn't connected yet, so this can't be sent automatically.",
    };
  }

  try {
    const mapping = Object.keys(connection.field_mapping).length > 0 ? connection.field_mapping : DEFAULT_FIELD_MAPPING;
    const data = buildAutofillTextData(prayers, mapping);
    const job = await createAutofillJob(connection.template_id as string, data);
    const finished = await waitForAutofillJob(job.id);

    if (finished.status !== "success") {
      return {
        mode: "prepared",
        ...preparedFields(),
        reason:
          finished.error?.message ??
          "Canva didn't finish this update in time. Here's the content prepared so nothing is lost — try Update Canva again shortly.",
      };
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
      return {
        mode: "prepared",
        ...preparedFields(),
        reason: "Canva isn't connected yet, so this can't be sent automatically.",
      };
    }
    // Most common real-world case here: the connected design isn't actually a
    // Brand Template, so Autofill can't target it (Canva returns 403/404).
    return {
      mode: "prepared",
      ...preparedFields(),
      reason: `${describeCanvaError(err)} Here's the update prepared as text instead — connect a Canva Brand Template for one-click updates.`,
    };
  }
}

export async function previewSelectionAction(selection: { ids?: string[]; filters?: PrayerFilters }) {
  const prayers = await getPrayersForCanvaSelection(selection);
  return summarizeCounts(prayers);
}

export interface EditInCanvaResult {
  editUrl?: string;
  error?: string;
}

/**
 * Fetches a FRESH edit URL right before opening it — Canva's edit_url is
 * temporary (expires ~30 min), so it can never be cached from connection
 * time. Requires design:meta:read, already in our OAuth scope list.
 */
export async function getEditInCanvaUrlAction(): Promise<EditInCanvaResult> {
  const connection = await getCanvaConnection();
  if (connection.connection_status !== "CONNECTED") {
    return { error: "Canva isn't connected. Connect Canva first." };
  }
  if (!connection.design_id) {
    return { error: "No Canva design is connected yet. Paste a design link or pick a Brand Template first." };
  }

  try {
    const design = await getDesign(connection.design_id);
    if (!design.editUrl) {
      return { error: "Canva didn't provide an edit link for this design. Open it directly from your Canva account instead." };
    }
    return { editUrl: design.editUrl };
  } catch (err) {
    return { error: describeCanvaError(err) };
  }
}

export interface SyncFromCanvaResult {
  available: boolean;
  title?: string | null;
  updatedAt?: string | null;
  pageCount?: number | null;
  thumbnailUrl?: string | null;
  viewUrl?: string | null;
  limitationNote: string;
  error?: string;
}

/**
 * "Sync From Canva" — pulls whatever Canva's API actually exposes about the
 * connected design (title, last-modified time, page count, a thumbnail).
 * Canva's Connect API does not offer a way to read a design's live text
 * content back out (Autofill is write-only; Brand Template "datasets" list
 * field NAMES, not their current filled values) — so this deliberately never
 * touches the master prayer list. It's informational only, by design, not a
 * missing feature.
 */
export async function syncFromCanvaAction(): Promise<SyncFromCanvaResult> {
  const limitationNote =
    "Canva's API doesn't expose a design's live text content for reading — only Canva's own editor can. " +
    "So nothing here can be auto-imported into the prayer list; this just shows what Canva can tell us about the design itself.";

  const connection = await getCanvaConnection();
  if (connection.connection_status !== "CONNECTED") {
    return { available: false, limitationNote, error: "Canva isn't connected. Connect Canva first." };
  }
  if (!connection.design_id) {
    return { available: false, limitationNote, error: "No Canva design is connected yet." };
  }

  try {
    const design = await getDesign(connection.design_id);
    return {
      available: true,
      title: design.title,
      updatedAt: design.updatedAt,
      pageCount: design.pageCount,
      thumbnailUrl: design.thumbnailUrl,
      viewUrl: design.viewUrl,
      limitationNote,
    };
  } catch (err) {
    return { available: false, limitationNote, error: describeCanvaError(err) };
  }
}
