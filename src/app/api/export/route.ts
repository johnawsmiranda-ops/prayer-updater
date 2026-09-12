import { NextResponse } from "next/server";
import { readWorkbookBytes } from "@/lib/store/blobStore";

/**
 * Lets the admin download the current "database" exactly as it is — since
 * the database IS an Excel file, this is just handing over that file.
 */
export async function GET() {
  const bytes = await readWorkbookBytes();
  if (!bytes) {
    return NextResponse.json({ error: "No prayer list data yet." }, { status: 404 });
  }

  const filename = `prayer-list-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
