type GraphResponse = Record<string, unknown>;

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean,
    readonly graphCode?: number,
    readonly graphSubcode?: number,
    readonly upstreamFailure = false,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

type MetaAccountSettings = {
  accessToken: string;
  facebookPageId: string;
  instagramAccountId: string;
};

const FACEBOOK_GRAPH_API_VERSION = "v25.0";

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
      throw new MetaGraphError("انتهت مهلة الاتصال بمنصة Meta.", method === "POST", undefined, undefined, true);
    }
    throw new MetaGraphError("تعذّر الاتصال بمنصة Meta.", method === "POST", undefined, undefined, true);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new MetaGraphError(
      "أعادت منصة Meta استجابة غير مفهومة.",
      method === "POST",
      undefined,
      undefined,
      true,
    );
  }

  if (!data || typeof data !== "object") {
    throw new MetaGraphError("أعادت منصة Meta استجابة غير صالحة.", false, undefined, undefined, true);
  }

  const result = data as GraphResponse;
  if (!response.ok || "error" in result) {
    const graphError = result.error;
    const graphMessage =
      graphError &&
      typeof graphError === "object" &&
      "message" in graphError &&
      typeof graphError.message === "string"
        ? accessToken
          ? graphError.message.replaceAll(accessToken, "[محجوب]")
          : graphError.message
        : "رفضت منصة Meta طلب النشر.";
    const code =
      graphError && typeof graphError === "object" && "code" in graphError &&
      typeof graphError.code === "number"
        ? graphError.code
        : undefined;
    const subcode =
      graphError && typeof graphError === "object" && "error_subcode" in graphError &&
      typeof graphError.error_subcode === "number"
        ? graphError.error_subcode
        : undefined;
    const message = code === 190
      ? `رمز Meta غير صالح أو منتهي الصلاحية. أعيدي إنشاء الرمز واحفظيه مجدداً. (${graphMessage})`
      : code === 10 || code === 200
        ? `لا يملك رمز Meta الصلاحيات اللازمة لهذا الأصل أو العملية. تحققي من صلاحيات التطبيق ومهام الصفحة وإسنادها لمستخدم النظام. (${graphMessage})`
        : code === 100
          ? `رفضت Meta معرّف الصفحة أو نقطة النهاية لهذا الطلب. تحققي من Facebook Page ID ونوع الأصل. (${graphMessage})`
          : graphMessage;
    throw new MetaGraphError(
      message.slice(0, 900),
      false,
      code,
      subcode,
      !code && !response.ok,
    );
  }

  return result;
}

function responseId(response: GraphResponse, fallbackField?: string, outcomeUnknown = false) {
  const value = (fallbackField ? response[fallbackField] : undefined) ?? response.id;
  if (typeof value !== "string" || !value) {
    throw new MetaGraphError(
      "لم تُرجع منصة Meta معرّف المنشور.",
      outcomeUnknown,
      undefined,
      undefined,
      outcomeUnknown,
    );
  }
  return value;
}

async function getFacebookPageAccessToken(
  pageId: string,
  systemUserAccessToken: string,
) {
  const identity = await graphRequest(
    "me",
    "GET",
    { fields: "id" },
    systemUserAccessToken,
    FACEBOOK_GRAPH_API_VERSION,
  );
  if (typeof identity.id !== "string" || !/^\d+$/.test(identity.id)) {
    throw new MetaGraphError("تعذّر تحديد هوية مستخدم النظام من رمز Meta.", false);
  }

  let after: string | undefined;
  const seenCursors = new Set<string>();
  const normalizedPageId = pageId.trim();

  do {
    const response = await graphRequest(
      `${identity.id}/assigned_pages`,
      "GET",
      {
        fields: "id,access_token,tasks",
        ...(after ? { after } : {}),
      },
      systemUserAccessToken,
      FACEBOOK_GRAPH_API_VERSION,
    );
    const accounts = response.data;
    if (!Array.isArray(accounts)) {
      throw new MetaGraphError("أعادت Meta قائمة صفحات غير صالحة.", false);
    }

    for (const account of accounts) {
      if (!account || typeof account !== "object" || !("id" in account)) continue;
      const accountId =
        typeof account.id === "string" || typeof account.id === "number"
          ? String(account.id)
          : "";
      if (accountId !== normalizedPageId) continue;
      if (
        "tasks" in account &&
        Array.isArray(account.tasks) &&
        !account.tasks.includes("CREATE_CONTENT")
      ) {
        throw new MetaGraphError(
          "مستخدم النظام لا يملك مهمة CREATE_CONTENT على صفحة Facebook. امنحيه صلاحية إنشاء المحتوى على الصفحة.",
          false,
          200,
        );
      }
      if (!("access_token" in account) || typeof account.access_token !== "string" || !account.access_token) {
        throw new MetaGraphError(
          "عثر Meta على الصفحة المسندة لمستخدم النظام، لكنه لم يُرجع Page Access Token. تحققي من صلاحيات التطبيق وإسناد الأصل.",
          false,
        );
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

    if (!hasNextPage) {
      break;
    }
    if (typeof nextCursor !== "string" || !nextCursor) {
      throw new MetaGraphError("أعادت Meta معلومات ترقيم صفحات غير مكتملة.", false);
    }
    if (seenCursors.has(nextCursor)) {
      throw new MetaGraphError("تعذّر إكمال ترقيم الصفحات بسبب مؤشر متكرر من Meta.", false);
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  } while (after);

  throw new MetaGraphError(
    "لم تظهر صفحة Facebook المطلوبة ضمن الأصول المسندة إلى مستخدم النظام. تحققي من Page ID ومن إسناد الصفحة إلى مستخدم النظام في Meta Business.",
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
    FACEBOOK_GRAPH_API_VERSION,
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
