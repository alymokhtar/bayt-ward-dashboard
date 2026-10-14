import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-session";

export async function isAdminAuthenticated() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}
