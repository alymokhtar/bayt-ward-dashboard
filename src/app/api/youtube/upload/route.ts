import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readableFile, uploadYouTubeVideo } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

function originIsValid(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseTags(formData: FormData): string[] | null {
  const values = formData.getAll("tags");
  const tags: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") return null;
    try {
      const parsed: unknown = value.trimStart().startsWith("[")
        ? JSON.parse(value)
        : value.split(",");
      if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string")) return null;
      tags.push(...parsed);
    } catch {
      return null;
    }
  }
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
  return normalized.join("").length <= 500 ? normalized : null;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return jsonError("Authentication required.", 401);
  if (!originIsValid(request)) return jsonError("Request origin is not allowed.", 403);
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_SIZE + 1024 * 1024) {
    return jsonError("The maximum video size is 100 MB.", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Request must contain valid multipart/form-data.", 400);
  }

  const file = formData.get("file");
  const title = formData.get("title");
  const description = formData.get("description");
  const privacyStatus = formData.get("privacyStatus") ?? "unlisted";
  const tags = parseTags(formData);
  if (!(file instanceof File) || file.size === 0 || !file.type.startsWith("video/")) {
    return jsonError("A non-empty video file is required.", 400);
  }
  if (file.size > MAX_VIDEO_SIZE) {
    return jsonError("The maximum video size is 100 MB.", 413);
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 100) {
    return jsonError("Title is required and must be no longer than 100 characters.", 400);
  }
  if (typeof description !== "string" || description.length > 5000) {
    return jsonError("Description is required and must be no longer than 5000 characters.", 400);
  }
  if (privacyStatus !== "public" && privacyStatus !== "unlisted") {
    return jsonError("privacyStatus must be either 'public' or 'unlisted'.", 400);
  }
  if (!tags) return jsonError("Tags must be strings with a combined length no greater than 500 characters.", 400);

  try {
    const uploaded = await uploadYouTubeVideo({
      body: readableFile(file),
      mimeType: file.type,
      title: title.trim(),
      description,
      tags,
      privacyStatus,
    });
    return NextResponse.json(uploaded, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube upload failed.";
    console.error("YouTube upload failed.", { message });
    return jsonError(message, 502);
  }
}
