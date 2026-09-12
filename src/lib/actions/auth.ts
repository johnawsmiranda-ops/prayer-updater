"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/prayers");

  let ok: boolean;
  try {
    ok = await verifyPassword(password);
  } catch {
    return { error: "The app isn't configured yet — ADMIN_PASSWORD is missing." };
  }

  if (!ok) {
    return { error: "Incorrect password." };
  }

  await createSession();
  redirect(next.startsWith("/") ? next : "/prayers");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
