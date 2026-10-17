type GraphResponse = Record<string, unknown>;

export class MetaGraphError extends Error {
  constructor(message: string, readonly outcomeUnknown: boolean) {
    super(message);
    this.name = "MetaGraphError";
  }
}

type MetaAccountSettings = {
  accessToken: string;
  facebookPageId: string;
  instagramAccountId: string;
};

function graphBaseUrl(version = process.env.META_GRAPH_API_VERSION) {
  if (!version || !/^v\d+\.\d+$/.test(version)) {
    throw new Error("اضبطي META_GRAPH_API_VERSION في إعدادات الخادم.");
  }
  return `https://graph.facebook.com/${version}`;
}

async function graphRequest(
  path: string,
  method: "GET" | "POST",
  values: Record<string, string>,
  accessToken: string,
  apiVersion?: string,
): Promise<GraphResponse> {
  const url = new URL(`${graphBaseUrl(apiVersion)}/${path.replace(/^\/+/, "")}`);
  const headers = new Headers();
  const options: RequestInit = {
    method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", accessToken);
  } else {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    const body = new URLSearchParams(values);
    body.set("access_token", accessToken);
    options.body = body;
  }

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new MetaGraphError("انتهت مهلة الاتصال بمنصة Meta.", true);
    }
    throw new MetaGraphError("تعذّر الاتصال بمنصة Meta.", true);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new MetaGraphError("أعادت منصة Meta استجابة غير مفهومة.", method === "POST");
  }

  if (!data || typeof data !== "object") {
    throw new MetaGraphError("أعادت منصة Meta استجابة غير صالحة.", false);
  }

  const result = data as GraphResponse;
  if (!response.ok || "error" in result) {
    const graphError = result.error;
    const message =
      graphError &&
      typeof graphError === "object" &&
      "message" in graphError &&
      typeof graphError.message === "string"
        ? accessToken
          ? graphError.message.replaceAll(accessToken, "[محجوب]")
          : graphError.message
        : "رفضت منصة Meta طلب النشر.";
    throw new MetaGraphError(message.slice(0, 900), false);
  }

  return result;
}

function responseId(response: GraphResponse, fallbackField?: string, outcomeUnknown = false) {
  const value = (fallbackField ? response[fallbackField] : undefined) ?? response.id;
  if (typeof value !== "string" || !value) {
    throw new MetaGraphError("لم تُرجع منصة Meta معرّف المنشور.", outcomeUnknown);
  }
  return value;
}

async function getFacebookPageAccessToken(
  pageId: string,
  systemUserAccessToken: string,
) {
  let after: string | undefined;
  const seenCursors = new Set<string>();

  do {
    const response = await graphRequest(
      "me/accounts",
      "GET",
      {
        fields: "id,access_token",
        ...(after ? { after } : {}),
      },
      systemUserAccessToken,
      "v20.0",
    );
    const accounts = response.data;
    if (!Array.isArray(accounts)) {
      throw new MetaGraphError("أعادت Meta قائمة صفحات غير صالحة.", false);
    }

    for (const account of accounts) {
      if (!account || typeof account !== "object" || !("id" in account)) continue;
      if (account.id !== pageId) continue;
      if (!("access_token" in account) || typeof account.access_token !== "string" || !account.access_token) {
        throw new MetaGraphError("لم تُرجع Meta رمز وصول صالحاً لصفحة Facebook.", false);
      }
      return account.access_token;
    }

    const paging = response.paging;
    const cursors =
      paging && typeof paging === "object" && "cursors" in paging ? paging.cursors : undefined;
    const nextCursor =
      cursors && typeof cursors === "object" && "after" in cursors ? cursors.after : undefined;
    const hasNextPage =
      paging && typeof paging === "object" && "next" in paging && typeof paging.next === "string";

    if (!hasNextPage || typeof nextCursor !== "string" || !nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  } while (after);

  throw new MetaGraphError(
    "لم يُعثر على صفحة Facebook المطلوبة ضمن الصفحات المتاحة لمستخدم النظام.",
    false,
  );
}

export async function publishFacebookPost(
  settings: MetaAccountSettings,
  input: { caption: string; mediaUrl: string; mediaType: "image" | "video" },
) {
  if (!/^\d+$/.test(settings.facebookPageId)) {
    throw new Error("معرّف صفحة Facebook يجب أن يكون رقمياً.");
  }

  const isVideo = input.mediaType === "video";
  const pageAccessToken = await getFacebookPageAccessToken(
    settings.facebookPageId,
    settings.accessToken,
  );
  const result = await graphRequest(
    `${settings.facebookPageId}/${isVideo ? "videos" : "photos"}`,
    "POST",
    isVideo
      ? { file_url: input.mediaUrl, description: input.caption, published: "true" }
      : { url: input.mediaUrl, caption: input.caption, published: "true" },
    pageAccessToken,
  );

  return responseId(result, "post_id", true);
}

async function getInstagramBusinessAccountId(settings: MetaAccountSettings) {
  if (/^\d+$/.test(settings.instagramAccountId)) return settings.instagramAccountId;
  if (!/^\d+$/.test(settings.facebookPageId)) {
    throw new Error("أدخلي معرّف صفحة Facebook الرقمي لقراءة حساب Instagram المرتبط.");
  }

  let result: GraphResponse;
  try {
    result = await graphRequest(
      settings.facebookPageId,
      "GET",
      { fields: "instagram_business_account" },
      settings.accessToken,
    );
  } catch (error) {
    if (error instanceof MetaGraphError && error.outcomeUnknown) {
      throw new MetaGraphError(error.message, false);
    }
    throw error;
  }
  const businessAccount = result.instagram_business_account;
  if (
    !businessAccount ||
    typeof businessAccount !== "object" ||
    !("id" in businessAccount) ||
    typeof businessAccount.id !== "string"
  ) {
    throw new Error("لم يُعثر على حساب Instagram تجاري مرتبط بصفحة Facebook.");
  }
  return businessAccount.id;
}

export async function publishInstagramPost(
  settings: MetaAccountSettings,
  input: { caption: string; mediaUrl: string; mediaType: "image" | "video" },
) {
  const instagramAccountId = await getInstagramBusinessAccountId(settings);
  let container: GraphResponse;
  try {
    container = await graphRequest(
      `${instagramAccountId}/media`,
      "POST",
      input.mediaType === "video"
        ? {
            video_url: input.mediaUrl,
            media_type: "REELS",
            caption: input.caption,
            share_to_feed: "true",
          }
        : { image_url: input.mediaUrl, caption: input.caption },
      settings.accessToken,
    );
  } catch (error) {
    if (error instanceof MetaGraphError && error.outcomeUnknown) {
      throw new MetaGraphError(error.message, false);
    }
    throw error;
  }
  const containerId = responseId(container);

  let status = "";
  const deadline = Date.now() + 80_000;
  for (let attempt = 0; attempt < 18 && Date.now() < deadline; attempt += 1) {
    if (attempt > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, remaining)));
    }
    if (Date.now() >= deadline) break;
    let statusResponse: GraphResponse;
    try {
      statusResponse = await graphRequest(
        containerId,
        "GET",
        { fields: "status_code,status" },
        settings.accessToken,
      );
    } catch (error) {
      if (error instanceof MetaGraphError && error.outcomeUnknown) {
        throw new MetaGraphError(error.message, false);
      }
      throw error;
    }
    status = typeof statusResponse.status_code === "string" ? statusResponse.status_code : "";
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      const description = typeof statusResponse.status === "string" ? statusResponse.status : "";
      throw new Error(description || `تعذّر تجهيز محتوى Instagram (${status}).`);
    }
  }

  if (status !== "FINISHED") {
    throw new Error("استغرق تجهيز محتوى Instagram وقتاً أطول من المتوقع. تحققي من الحساب قبل إعادة المحاولة.");
  }

  const published = await graphRequest(
    `${instagramAccountId}/media_publish`,
    "POST",
    { creation_id: containerId },
    settings.accessToken,
  );
  return responseId(published, undefined, true);
}
