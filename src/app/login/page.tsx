import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/prayers";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🙏</div>
          <h1 className="font-[family-name:var(--font-app-serif)] text-2xl font-semibold text-[var(--accent-strong)]">
            Prayer List
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">Faith Assembly of God International</p>
        </div>
        <div className="card p-6">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
