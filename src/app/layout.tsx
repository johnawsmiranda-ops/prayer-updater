import type { Metadata } from "next";
import "./globals.css";
import { isAuthenticated } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Prayer List — Faith Assembly",
  description: "Prayer Updater — a simple, warm home for the church prayer list.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authed = await isAuthenticated();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col md:flex-row">
        {authed ? (
          <>
            <Nav />
            <main className="flex-1 min-w-0 min-h-screen">{children}</main>
          </>
        ) : (
          <main className="flex-1 min-h-screen">{children}</main>
        )}
      </body>
    </html>
  );
}
