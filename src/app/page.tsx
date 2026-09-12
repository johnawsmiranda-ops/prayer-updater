import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function RootPage() {
  redirect((await isAuthenticated()) ? "/prayers" : "/login");
}
