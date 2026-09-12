import AddPrayerForm from "./AddPrayerForm";
import { getFilterOptions } from "@/lib/prayers";

export const dynamic = "force-dynamic";

export default async function AddPrayerPage() {
  const options = await getFilterOptions();
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="font-[family-name:var(--font-app-serif)] text-2xl font-semibold text-[var(--accent-strong)] mb-1">
        Add Prayer
      </h1>
      <p className="text-sm text-[var(--muted)] mb-6">Add a new request to the prayer list.</p>
      <div className="card p-6">
        <AddPrayerForm categories={options.categories} ministries={options.ministries} />
      </div>
    </div>
  );
}
