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

/** Carries the HTTP status so callers can translate to a human message without leaking raw API text. */
export class CanvaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CanvaApiError";
    this.status = status;
  }
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? "";
  } catch {
    // response wasn't JSON — nothing more to extract
  }
  throw new CanvaApiError(res.status, `${action} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
}

export async function createAutofillJob(
  brandTemplateId: string,
  data: Record<string, AutofillFieldValue>
): Promise<AutofillJob> {
  const res = await canvaFetch("/autofills", {
    method: "POST",
    body: JSON.stringify({ brand_template_id: brandTemplateId, data }),
  });
  await assertOk(res, "Creating the Canva autofill job");
  const body = await res.json();
  return body.job as AutofillJob;
}

export async function getAutofillJob(jobId: string): Promise<AutofillJob> {
  const res = await canvaFetch(`/autofills/${jobId}`);
  await assertOk(res, "Checking the Canva autofill job");
  const body = await res.json();
  return body.job as AutofillJob;
}

export interface CanvaDesign {
  id: string;
  title: string | null;
  editUrl: string | null;
  viewUrl: string | null;
  thumbnailUrl: string | null;
  pageCount: number | null;
  updatedAt: string | null; // ISO
}

/**
 * Fetches live metadata for a design the connected account owns — including
 * a fresh edit_url (Canva's edit/view URLs are temporary, valid ~30 minutes,
 * so this must be called fresh each time "Edit in Canva" is clicked, not
 * cached). Works for any design in the account, not just Brand Templates.
 * Reference: https://www.canva.dev/docs/connect/api-reference/designs/get-design/
 */
export async function getDesign(designId: string): Promise<CanvaDesign> {
  const res = await canvaFetch(`/designs/${designId}`);
  await assertOk(res, "Fetching the Canva design");
  const body = await res.json();
  const d = body.design ?? {};
  return {
    id: d.id ?? designId,
    title: d.title ?? null,
    editUrl: d.urls?.edit_url ?? null,
    viewUrl: d.urls?.view_url ?? null,
    thumbnailUrl: d.thumbnail?.url ?? null,
    pageCount: typeof d.page_count === "number" ? d.page_count : null,
    updatedAt: typeof d.updated_at === "number" ? new Date(d.updated_at * 1000).toISOString() : null,
  };
}

/**
 * The signed-in Canva account's display name, so the connection card can
 * show *who* is connected. Requires the profile:read scope.
 * Reference: https://www.canva.dev/docs/connect/api-reference/users/users-profile/
 */
export async function getConnectedAccountName(): Promise<string | null> {
  const res = await canvaFetch(`/users/me/profile`);
  if (!res.ok) return null; // non-critical — connection still works without it
  const body = await res.json();
  return body.profile?.display_name ?? null;
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
  await assertOk(res, "Listing your Canva brand templates");
  const body = await res.json();
  return (body.items ?? []).map((t: { id: string; title: string }) => ({ id: t.id, title: t.title }));
}

/** Reads the fillable field names of a Brand Template's dataset. */
export async function getBrandTemplateDataset(templateId: string): Promise<string[]> {
  const res = await canvaFetch(`/brand-templates/${templateId}/dataset`);
  await assertOk(res, "Fetching the Canva brand template's fields");
  const body = await res.json();
  return Object.keys(body.dataset ?? {});
}
