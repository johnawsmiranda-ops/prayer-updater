import "server-only";
import { getValidAccessToken } from "./connection";

/**
 * Canva Connect API — Autofill.
 * Reference: https://www.canva.dev/docs/connect/api-reference/autofills/
 *            https://www.canva.dev/docs/connect/autofill-guide/
 *
 * Important, real limitation (not invented): Autofill only works against a
 * **Brand Template** — a template published in a Canva Enterprise org's Brand
 * Kit — identified by a `brand_template_id`. It cannot autofill an arbitrary
 * personal design a normal Canva plan shares via a regular design link. If
 * the connected org doesn't have Brand Templates available, this API will
 * 403/404 and the app should fall back to "Copy for Canva" (see copy.ts) —
 * which always works, regardless of Canva plan.
 */

const API_BASE = "https://api.canva.com/rest/v1";

export type AutofillFieldValue = { type: "text"; text: string } | { type: "image"; asset_id: string };

export interface AutofillJob {
  id: string;
  status: "in_progress" | "success" | "failed";
  result?: {
    type: "create_design";
    design: { id: string; url?: string; title?: string };
  };
  error?: { code: string; message: string };
}

async function canvaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new CanvaNotConnectedError();
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export class CanvaNotConnectedError extends Error {
  constructor() {
    super("Canva is not connected.");
    this.name = "CanvaNotConnectedError";
  }
}

export async function createAutofillJob(
  brandTemplateId: string,
  data: Record<string, AutofillFieldValue>
): Promise<AutofillJob> {
  const res = await canvaFetch("/autofills", {
    method: "POST",
    body: JSON.stringify({ brand_template_id: brandTemplateId, data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva autofill request failed (${res.status}): ${text}`);
  }
  const body = await res.json();
  return body.job as AutofillJob;
}

export async function getAutofillJob(jobId: string): Promise<AutofillJob> {
  const res = await canvaFetch(`/autofills/${jobId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Canva autofill job (${res.status}): ${text}`);
  }
  const body = await res.json();
  return body.job as AutofillJob;
}

/** Polls a just-created autofill job for up to ~15s (autofills are typically fast). */
export async function waitForAutofillJob(jobId: string, maxWaitMs = 15_000): Promise<AutofillJob> {
  const start = Date.now();
  let job = await getAutofillJob(jobId);
  while (job.status === "in_progress" && Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 1200));
    job = await getAutofillJob(jobId);
  }
  return job;
}

/** Lists the Brand Templates the connected Canva account can autofill into. */
export async function listBrandTemplates(): Promise<{ id: string; title: string }[]> {
  const res = await canvaFetch("/brand-templates");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list Canva brand templates (${res.status}): ${text}`);
  }
  const body = await res.json();
  return (body.items ?? []).map((t: { id: string; title: string }) => ({ id: t.id, title: t.title }));
}

/** Reads the fillable field names of a Brand Template's dataset. */
export async function getBrandTemplateDataset(templateId: string): Promise<string[]> {
  const res = await canvaFetch(`/brand-templates/${templateId}/dataset`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Canva brand template dataset (${res.status}): ${text}`);
  }
  const body = await res.json();
  return Object.keys(body.dataset ?? {});
}
