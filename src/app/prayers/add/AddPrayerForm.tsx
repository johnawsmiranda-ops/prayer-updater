"use client";

import { useActionState } from "react";
import { addPrayerAction, type AddPrayerState } from "./actions";

const initialState: AddPrayerState = {};

export default function AddPrayerForm({
  categories,
  ministries,
}: {
  categories: string[];
  ministries: string[];
}) {
  const [state, formAction, pending] = useActionState(addPrayerAction, initialState);
  const currentYear = new Date().getFullYear();

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Year</label>
          <input name="year" type="number" defaultValue={currentYear} required className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Name / Family</label>
          <input name="name" required className="input" placeholder="e.g. The Cruz Family" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Prayer Request</label>
        <textarea name="prayer_request" required rows={4} className="input" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Requested By</label>
          <input name="requested_by" className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Assigned Ministry</label>
          <input name="assigned_ministry" list="ministry-options" className="input" />
          <datalist id="ministry-options">
            {ministries.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Category</label>
        <input name="category" required list="category-options" className="input" placeholder="e.g. General Healing, Strength, and Wellness" />
        <datalist id="category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
        <textarea name="notes" rows={2} className="input" />
      </div>

      {state.error && <p className="text-sm text-[var(--red)]">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding…" : "Add Prayer"}
        </button>
        <a href="/prayers" className="btn btn-secondary">
          Cancel
        </a>
      </div>
    </form>
  );
}
