import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";

const links = [
  { href: "/prayers", label: "Prayer List", icon: "🙏" },
  { href: "/prayers/add", label: "Add Prayer", icon: "➕" },
  { href: "/archive", label: "Archive", icon: "🗄" },
  { href: "/canva", label: "Canva", icon: "🎨" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Nav() {
  return (
    <nav className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--surface)] flex md:flex-col">
      <div className="px-5 py-5 hidden md:block">
        <div className="font-[family-name:var(--font-app-serif)] text-lg font-semibold text-[var(--accent-strong)]">
          Prayer List
        </div>
        <div className="text-xs text-[var(--muted)] mt-0.5">Faith Assembly of God Int&apos;l</div>
      </div>
      <ul className="flex md:flex-col flex-1 md:px-3 md:pb-4 overflow-x-auto md:overflow-visible">
        {links.map((link) => (
          <li key={link.href} className="flex-1 md:flex-none">
            <Link
              href={link.href}
              className="flex items-center justify-center md:justify-start gap-2 px-3 py-3 md:py-2.5 md:rounded-lg text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent-soft)] transition-colors"
            >
              <span aria-hidden>{link.icon}</span>
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="hidden md:block px-6 pb-5">
        <button type="submit" className="btn btn-ghost text-xs w-full justify-start px-0">
          Sign out
        </button>
      </form>
    </nav>
  );
}
