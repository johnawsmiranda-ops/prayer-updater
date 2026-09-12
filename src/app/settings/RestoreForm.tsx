"use client";

import { useRef, useState, useTransition } from "react";
import { restoreWorkbookAction } from "./actions";

export default function RestoreForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean; prayerCount?: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    setResult(null);
    startTransition(() => {
      restoreWorkbookAction(formData).then((res) => {
        setResult(res);
        setConfirmOpen(false);
        formRef.current?.reset();
      });
    });
  };

  return (
    <div>
      <p className="text-xs text-[var(--red)] mb-2">
        ⚠️ This replaces the entire current prayer list with whatever is in the file you upload. Anything currently
        on the live site that isn&apos;t in this file will be gone.
      </p>
      <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="workbook"
          accept=".xlsx"
          required
          className="text-sm"
          onChange={() => setResult(null)}
        />
        {!confirmOpen ? (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(true)}>
            Restore from this file
          </button>
        ) : (
          <>
            <button type="submit" className="btn btn-purple" disabled={isPending}>
              {isPending ? "Restoring…" : "Yes, replace everything"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
          </>
        )}
      </form>
      {result?.error && <p className="text-sm text-[var(--red)] mt-2">{result.error}</p>}
      {result?.success && (
        <p className="text-sm mt-2" style={{ color: "var(--green)" }}>
          ✓ Restored {result.prayerCount} prayer{result.prayerCount === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
