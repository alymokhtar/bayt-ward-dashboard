import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "تسجيل الدخول | بيت ورد",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const requestedPath = typeof params.next === "string" ? params.next : "/";
  let nextPath = "/";
  try {
    const target = new URL(requestedPath, "https://bayt-ward.invalid");
    if (target.origin === "https://bayt-ward.invalid") {
      nextPath = `${target.pathname}${target.search}${target.hash}`;
    }
  } catch {
    nextPath = "/";
  }

  return <LoginForm nextPath={nextPath} />;
}
