const SESSION_MINUTES = 30;

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      if (url.pathname === "/" || url.pathname === "/upload") {
        return htmlResponse(renderAdminPage(env));
      }

      if (url.pathname === "/api/upload" && request.method === "POST") {
        return handleUpload(request, env);
      }

      if (url.pathname === "/api/assets" && request.method === "GET") {
        return handleAssets(request, env);
      }

      const sessionsMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/sessions$/);
      if (sessionsMatch && request.method === "GET") {
        return handleAssetSessions(request, env, sessionsMatch[1]);
      }

      const videoMatch = url.pathname.match(/^\/v\/([^/]+)\.mp4$/);
      if (videoMatch && (request.method === "GET" || request.method === "HEAD")) {
        return handleVideo(request, env, ctx, videoMatch[1]);
      }

      const watchMatch = url.pathname.match(/^\/watch\/([^/]+)$/);
      if (watchMatch && request.method === "GET") {
        return handleWatch(request, env, watchMatch[1]);
      }

      return textResponse("Not found", 404);
    } catch (error) {
      return textResponse(`Internal error: ${error.message}`, 500);
    }
  },
};

async function handleUpload(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 100000000);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxUploadBytes) {
    return jsonResponse(
      {
        error: `File is too large. Current limit is ${formatBytes(maxUploadBytes)}.`,
      },
      413,
    );
  }

  const originalName = sanitizeFileName(request.headers.get("x-file-name") || "video.mp4");
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  if (!originalName.toLowerCase().endsWith(".mp4") && contentType !== "video/mp4") {
    return jsonResponse({ error: "Only MP4 uploads are accepted for Discord-friendly links." }, 415);
  }

  if (!request.body) {
    return jsonResponse({ error: "Missing request body." }, 400);
  }

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(env, originalName);
  const objectKey = `videos/${slug}.mp4`;
  const now = new Date().toISOString();
  const baseUrl = publicBaseUrl(env);
  const nativeUrl = `${baseUrl}/v/${slug}.mp4`;
  const watchUrl = `${baseUrl}/watch/${slug}`;

  const object = await env.MEDIA_BUCKET.put(objectKey, request.body, {
    httpMetadata: {
      contentType: "video/mp4",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      originalName,
      uploadedAt: now,
    },
  });

  const sizeBytes = contentLength || object.size || 0;

  await env.DB.prepare(
    `INSERT INTO assets (
      id, slug, object_key, original_name, content_type, size_bytes,
      uploaded_at, native_url, watch_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, slug, objectKey, originalName, "video/mp4", sizeBytes, now, nativeUrl, watchUrl)
    .run();

  return jsonResponse({
    asset: {
      id,
      slug,
      originalName,
      sizeBytes,
      nativeUrl,
      watchUrl,
      uploadedAt: now,
    },
  });
}

async function handleAssets(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const { results } = await env.DB.prepare(
    `SELECT
      a.id,
      a.slug,
      a.original_name AS originalName,
      a.size_bytes AS sizeBytes,
      a.uploaded_at AS uploadedAt,
      a.native_url AS nativeUrl,
      a.watch_url AS watchUrl,
      COUNT(v.id) AS sessions,
      COALESCE(SUM(v.request_count), 0) AS requests,
      COALESCE(SUM(CASE WHEN v.viewer_kind = 'likely_human' THEN 1 ELSE 0 END), 0) AS likelyHumanSessions,
      COALESCE(SUM(CASE WHEN v.viewer_kind IN ('discord_preview', 'discord_proxy') THEN 1 ELSE 0 END), 0) AS discordSessions,
      COALESCE(SUM(CASE WHEN v.viewer_kind = 'bot' THEN 1 ELSE 0 END), 0) AS botSessions,
      MAX(v.last_seen) AS lastSeen
    FROM assets a
    LEFT JOIN view_sessions v ON v.asset_id = a.id
    GROUP BY a.id
    ORDER BY a.uploaded_at DESC
    LIMIT 100`,
  ).all();

  return jsonResponse({ assets: results });
}

async function handleAssetSessions(request, env, slug) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const asset = await getAsset(env, slug);
  if (!asset) return jsonResponse({ error: "Asset not found." }, 404);

  const { results } = await env.DB.prepare(
    `SELECT
      id,
      ip,
      ip_hash AS ipHash,
      user_agent AS userAgent,
      referer,
      country,
      colo,
      asn,
      as_organization AS asOrganization,
      viewer_kind AS viewerKind,
      viewer_confidence AS viewerConfidence,
      viewer_flags AS viewerFlags,
      first_seen AS firstSeen,
      last_seen AS lastSeen,
      request_count AS requestCount,
      last_method AS lastMethod,
      last_range AS lastRange,
      last_path AS lastPath
    FROM view_sessions
    WHERE asset_id = ?
    ORDER BY last_seen DESC
    LIMIT 200`,
  )
    .bind(asset.id)
    .all();

  return jsonResponse({ asset, sessions: results });
}

async function handleVideo(request, env, ctx, slug) {
  const asset = await getAsset(env, slug);
  if (!asset) return textResponse("Video not found", 404);

  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader, asset.sizeBytes);
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes */${asset.sizeBytes}`,
      },
    });
  }

  const object = await env.MEDIA_BUCKET.get(
    asset.objectKey,
    range ? { range: { offset: range.offset, length: range.length } } : undefined,
  );

  if (!object) return textResponse("Video object not found", 404);

  ctx.waitUntil(logViewSession(request, env, asset, rangeHeader));

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  headers.set("x-content-type-options", "nosniff");

  if (range) {
    headers.set("content-range", `bytes ${range.offset}-${range.end}/${asset.sizeBytes}`);
    headers.set("content-length", String(range.length));
  } else if (asset.sizeBytes) {
    headers.set("content-length", String(asset.sizeBytes));
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

async function handleWatch(request, env, slug) {
  const asset = await getAsset(env, slug);
  if (!asset) return textResponse("Video not found", 404);

  return htmlResponse(renderWatchPage(asset));
}

async function logViewSession(request, env, asset, rangeHeader) {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const ip = request.headers.get("cf-connecting-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";
  const country = request.cf?.country || "";
  const colo = request.cf?.colo || "";
  const asn = Number(request.cf?.asn || 0) || null;
  const asOrganization = request.cf?.asOrganization || "";
  const viewer = classifyViewer({
    userAgent,
    referer,
    asOrganization,
    method: request.method,
    rangeHeader,
  });
  const sessionBucket = Math.floor(nowDate.getTime() / (SESSION_MINUTES * 60 * 1000));
  const ipHash = await sha256Hex(ip);
  const sessionId = await sha256Hex(`${asset.id}|${ip}|${userAgent}|${sessionBucket}`);
  const url = new URL(request.url);

  await env.DB.prepare(
    `INSERT INTO view_sessions (
      id, asset_id, slug, ip, ip_hash, user_agent, referer, country, colo, asn,
      as_organization, viewer_kind, viewer_confidence, viewer_flags,
      first_seen, last_seen, request_count, last_method, last_range, last_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_seen = excluded.last_seen,
      request_count = view_sessions.request_count + 1,
      last_method = excluded.last_method,
      last_range = excluded.last_range,
      last_path = excluded.last_path,
      as_organization = excluded.as_organization,
      viewer_kind = excluded.viewer_kind,
      viewer_confidence = excluded.viewer_confidence,
      viewer_flags = excluded.viewer_flags,
      referer = COALESCE(NULLIF(excluded.referer, ''), view_sessions.referer)`,
  )
    .bind(
      sessionId,
      asset.id,
      asset.slug,
      ip,
      ipHash,
      userAgent,
      referer,
      country,
      colo,
      asn,
      asOrganization,
      viewer.kind,
      viewer.confidence,
      viewer.flags.join(","),
      now,
      now,
      request.method,
      rangeHeader || "",
      url.pathname,
    )
    .run();
}

function classifyViewer({ userAgent, referer, asOrganization, method, rangeHeader }) {
  const ua = String(userAgent || "").toLowerCase();
  const ref = String(referer || "").toLowerCase();
  const org = String(asOrganization || "").toLowerCase();
  const flags = [];

  if (ua.includes("discordbot")) {
    flags.push("discordbot-user-agent", "link-preview");
    return {
      kind: "discord_preview",
      confidence: "high",
      flags,
    };
  }

  if (org.includes("discord")) {
    flags.push("discord-asn-organization");
    return {
      kind: "discord_proxy",
      confidence: "high",
      flags,
    };
  }

  if (ua.includes("discord")) {
    flags.push("discord-user-agent");
    return {
      kind: "discord_proxy",
      confidence: "medium",
      flags,
    };
  }

  if (isKnownBotUserAgent(ua)) {
    flags.push("bot-user-agent");
    return {
      kind: "bot",
      confidence: "high",
      flags,
    };
  }

  if (ref.includes("discord.com") || ref.includes("discordapp.com")) {
    flags.push("discord-referrer");
  }

  if (rangeHeader) {
    flags.push("range-request");
  }

  if (method === "HEAD") {
    flags.push("head-request");
  }

  if (looksLikeBrowserUserAgent(ua)) {
    flags.push("browser-user-agent");
    return {
      kind: "likely_human",
      confidence: flags.includes("discord-referrer") ? "medium" : "low",
      flags,
    };
  }

  if (rangeHeader) {
    return {
      kind: "likely_human",
      confidence: "low",
      flags,
    };
  }

  return {
    kind: "unknown",
    confidence: "low",
    flags,
  };
}

function isKnownBotUserAgent(ua) {
  return /\b(bot|crawler|spider|preview|embed|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot)\b/.test(
    ua,
  );
}

function looksLikeBrowserUserAgent(ua) {
  return (
    ua.includes("mozilla/") ||
    ua.includes("chrome/") ||
    ua.includes("safari/") ||
    ua.includes("firefox/") ||
    ua.includes("edg/") ||
    ua.includes("mobile/")
  );
}

async function getAsset(env, slug) {
  const normalizedSlug = String(slug || "").replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!normalizedSlug) return null;

  const row = await env.DB.prepare(
    `SELECT
      id,
      slug,
      object_key AS objectKey,
      original_name AS originalName,
      content_type AS contentType,
      size_bytes AS sizeBytes,
      uploaded_at AS uploadedAt,
      native_url AS nativeUrl,
      watch_url AS watchUrl
    FROM assets
    WHERE slug = ?`,
  )
    .bind(normalizedSlug)
    .first();

  return row || null;
}

async function uniqueSlug(env, originalName) {
  const nameWithoutExtension = originalName.replace(/\.[^.]+$/, "");
  const base = slugify(nameWithoutExtension) || "video";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomString(5);
    const slug = `${base}-${suffix}`;
    const existing = await env.DB.prepare("SELECT id FROM assets WHERE slug = ?").bind(slug).first();
    if (!existing) return slug;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function requireAdmin(request, env) {
  const configuredToken = env.MEDIA_ADMIN_TOKEN;
  if (!configuredToken) {
    return jsonResponse({ error: "MEDIA_ADMIN_TOKEN is not configured." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const valid = await secureCompare(token, configuredToken);
  if (!valid) {
    return jsonResponse({ error: "Unauthorized." }, 401, {
      "www-authenticate": "Bearer",
    });
  }

  return null;
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  let offset;
  let end;
  const startPart = match[1];
  const endPart = match[2];

  if (startPart === "" && endPart === "") return null;

  if (startPart === "") {
    const suffixLength = Number(endPart);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    offset = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    offset = Number(startPart);
    end = endPart === "" ? size - 1 : Number(endPart);
  }

  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(end) ||
    offset < 0 ||
    end < offset ||
    offset >= size
  ) {
    return null;
  }

  end = Math.min(end, size - 1);
  return {
    offset,
    end,
    length: end - offset + 1,
  };
}

function renderAdminPage(env) {
  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || 100000000);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Safi Media</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      color: #1a1a1a;
      min-height: 100vh;
      font-size: 14px;
      line-height: 1.5;
    }
    a { color: #0060df; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .header {
      background: #fff;
      border-bottom: 1px solid #ddd;
      padding: 16px 0;
    }
    .wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    h1 { font-size: 18px; font-weight: 600; }
    .subtitle { color: #666; font-size: 13px; margin-top: 2px; }
    .auth { display: flex; gap: 6px; }
    input {
      font: inherit;
      padding: 6px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      outline: none;
      background: #fff;
      color: #1a1a1a;
    }
    input:focus { border-color: #0060df; }
    button {
      font: inherit;
      padding: 6px 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
      color: #1a1a1a;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover { background: #f0f0f0; }
    button:active { background: #e8e8e8; }
    button.primary {
      background: #1a1a1a;
      color: #fff;
      border-color: #1a1a1a;
    }
    button.primary:hover { background: #333; }
    button:disabled { opacity: 0.4; cursor: default; }

    .content { padding: 24px 0 48px; }

    .section + .section { margin-top: 28px; }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 10px;
    }
    .section-head h2 { font-size: 14px; font-weight: 600; color: #444; }

    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 20px;
    }

    .dropzone {
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: 2px dashed #ccc;
      border-radius: 6px;
      padding: 24px;
      cursor: pointer;
      color: #666;
    }
    .dropzone:hover { border-color: #999; }
    .dropzone.dragging { border-color: #0060df; background: #f7faff; }
    .dropzone strong { display: block; color: #1a1a1a; margin-bottom: 4px; }
    .dropzone p { font-size: 13px; margin: 0; }
    .file-input { display: none; }
    .pick-wrap { margin-top: 8px; text-align: center; }
    .progress-bar {
      height: 4px;
      background: #eee;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .progress-bar > span {
      display: block;
      height: 100%;
      width: 0;
      background: #0060df;
      transition: width 150ms;
    }
    .status { font-size: 13px; color: #666; min-height: 18px; }
    .status.error { color: #d32f2f; }
    .result { margin-top: 8px; }

    .link-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 13px;
    }
    .link-row .label {
      color: #888;
      min-width: 52px;
      font-weight: 500;
    }
    .link-row a { overflow-wrap: anywhere; }
    .link-row button { font-size: 12px; padding: 3px 8px; }

    .list { display: grid; gap: 8px; }
    .asset {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .asset-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .asset-info { flex: 1; min-width: 0; }
    .asset-name { font-weight: 600; overflow-wrap: anywhere; }
    .asset-stats { font-size: 13px; color: #666; margin-top: 3px; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .tag {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 3px;
      background: #f0f0f0;
      color: #555;
    }
    .tag-human { background: #e6f4ea; color: #1b7340; }
    .tag-discord { background: #e8eeff; color: #3b5998; }
    .tag-bot { background: #fde8e8; color: #a93232; }
    .asset-links {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #eee;
    }
    .asset-actions button { font-size: 12px; padding: 4px 10px; }
    .sessions { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; }
    .sessions.open { display: block; }
    .tbl-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #eee; }
    th { font-weight: 600; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    td { color: #444; overflow-wrap: anywhere; }
    .empty { color: #888; font-size: 13px; }

    @media (max-width: 700px) {
      .header-row { flex-direction: column; align-items: stretch; }
      .asset-top { flex-direction: column; gap: 8px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="wrap header-row">
      <div>
        <h1>Safi Media</h1>
      </div>
      <form class="auth" id="authForm">
        <input id="tokenInput" type="password" autocomplete="current-password" placeholder="Admin token" style="width:200px">
        <button type="submit" class="primary">Unlock</button>
      </form>
    </div>
  </div>

  <div class="wrap content">
    <div class="section">
      <div class="section-head"><h2>Upload</h2></div>
      <div class="card">
        <input class="file-input" id="fileInput" type="file" accept="video/mp4,.mp4">
        <div class="dropzone" id="dropzone" tabindex="0" role="button">
          <div>
            <strong>Drop an MP4 here</strong>
            <p>or click to browse. Max size: ${escapeHtml(formatBytes(maxUploadBytes))}.</p>
          </div>
        </div>
        <div class="pick-wrap">
          <button id="pickButton" type="button">Choose File</button>
        </div>
        <div class="progress-bar" aria-hidden="true"><span id="progressBar"></span></div>
        <div class="status" id="status"></div>
        <div class="result" id="resultLinks"></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Recent Uploads</h2>
        <button id="refreshButton" type="button">Refresh</button>
      </div>
      <div class="status" id="listStatus"></div>
      <div class="list" id="assetList"></div>
    </div>
  </div>

  <script>
    const maxUploadBytes = ${JSON.stringify(maxUploadBytes)};
    const tokenInput = document.querySelector("#tokenInput");
    const authForm = document.querySelector("#authForm");
    const pickButton = document.querySelector("#pickButton");
    const fileInput = document.querySelector("#fileInput");
    const dropzone = document.querySelector("#dropzone");
    const progressBar = document.querySelector("#progressBar");
    const statusEl = document.querySelector("#status");
    const listStatus = document.querySelector("#listStatus");
    const resultLinks = document.querySelector("#resultLinks");
    const assetList = document.querySelector("#assetList");
    const refreshButton = document.querySelector("#refreshButton");

    tokenInput.value = sessionStorage.getItem("mediaAdminToken") || "";

    authForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sessionStorage.setItem("mediaAdminToken", tokenInput.value.trim());
      loadAssets();
    });

    pickButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const [file] = fileInput.files;
      if (file) uploadFile(file);
      fileInput.value = "";
    });

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") fileInput.click();
    });

    ["dragenter", "dragover"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      const [file] = event.dataTransfer.files;
      if (file) uploadFile(file);
    });

    refreshButton.addEventListener("click", loadAssets);

    function uploadFile(file) {
      clearStatus();
      resultLinks.innerHTML = "";

      if (!file.name.toLowerCase().endsWith(".mp4") && file.type !== "video/mp4") {
        setStatus("Only MP4 files are accepted.", true);
        return;
      }

      if (file.size > maxUploadBytes) {
        setStatus("File is too large for this free tier upload path.", true);
        return;
      }

      const token = currentToken();
      if (!token) {
        setStatus("Enter your admin token first.", true);
        tokenInput.focus();
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.setRequestHeader("Content-Type", "video/mp4");
      xhr.setRequestHeader("X-File-Name", file.name);

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          progressBar.style.width = Math.round((event.loaded / event.total) * 100) + "%";
        }
      });

      xhr.addEventListener("load", () => {
        let payload = {};
        try { payload = JSON.parse(xhr.responseText || "{}"); } catch {}
        if (xhr.status < 200 || xhr.status >= 300) {
          setStatus(payload.error || "Upload failed.", true);
          return;
        }
        progressBar.style.width = "100%";
        setStatus("Uploaded.");
        renderResult(payload.asset);
        loadAssets();
      });

      xhr.addEventListener("error", () => setStatus("Upload failed.", true));
      xhr.addEventListener("abort", () => setStatus("Upload cancelled.", true));

      setStatus("Uploading " + file.name + "\u2026");
      progressBar.style.width = "0";
      xhr.send(file);
    }

    async function loadAssets() {
      const token = currentToken();
      if (!token) {
        listStatus.textContent = "Enter your admin token to load uploads.";
        return;
      }

      listStatus.textContent = "Loading\u2026";
      assetList.innerHTML = "";

      const response = await fetch("/api/assets", {
        headers: { Authorization: "Bearer " + token },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        listStatus.textContent = payload.error || "Could not load uploads.";
        return;
      }

      listStatus.textContent = "";
      renderAssets(payload.assets || []);
    }

    function renderResult(asset) {
      resultLinks.innerHTML = [
        linkRow("Native", asset.nativeUrl),
        linkRow("Watch", asset.watchUrl),
      ].join("");
      resultLinks.querySelectorAll("button[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
          navigator.clipboard.writeText(button.dataset.copy);
          button.textContent = "Copied";
          setTimeout(() => button.textContent = "Copy", 1000);
        });
      });
    }

    function linkRow(label, href) {
      return '<div class="link-row"><span class="label">' + escapeHtml(label) + '</span><a href="' + escapeAttr(href) + '" target="_blank" rel="noreferrer">' + escapeHtml(href) + '</a><button type="button" data-copy="' + escapeAttr(href) + '">Copy</button></div>';
    }

    function renderAssets(assets) {
      if (!assets.length) {
        assetList.innerHTML = '<p class="empty">No uploads yet.</p>';
        return;
      }

      assetList.innerHTML = assets.map((asset) => {
        return '<div class="asset" data-slug="' + escapeAttr(asset.slug) + '">' +
          '<div class="asset-top">' +
            '<div class="asset-info">' +
              '<div class="asset-name">' + escapeHtml(asset.originalName) + '</div>' +
              '<div class="asset-stats">' + escapeHtml(formatBytes(asset.sizeBytes)) + ' \u00b7 ' + escapeHtml(asset.sessions || 0) + ' sessions \u00b7 ' + escapeHtml(asset.requests || 0) + ' requests</div>' +
              '<div class="tags">' +
                (asset.likelyHumanSessions ? '<span class="tag tag-human">' + escapeHtml(asset.likelyHumanSessions) + ' human</span>' : '') +
                (asset.discordSessions ? '<span class="tag tag-discord">' + escapeHtml(asset.discordSessions) + ' discord</span>' : '') +
                (asset.botSessions ? '<span class="tag tag-bot">' + escapeHtml(asset.botSessions) + ' bot</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="asset-actions">' +
              '<button type="button" data-sessions="' + escapeAttr(asset.slug) + '">Sessions</button>' +
            '</div>' +
          '</div>' +
          '<div class="asset-links">' + linkRow("Native", asset.nativeUrl) + linkRow("Watch", asset.watchUrl) + '</div>' +
          '<div class="sessions"></div>' +
        '</div>';
      }).join("");

      assetList.querySelectorAll("button[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
          navigator.clipboard.writeText(button.dataset.copy);
          button.textContent = "Copied";
          setTimeout(() => button.textContent = "Copy", 1000);
        });
      });

      assetList.querySelectorAll("button[data-sessions]").forEach((button) => {
        button.addEventListener("click", () => toggleSessions(button.dataset.sessions));
      });
    }

    async function toggleSessions(slug) {
      const row = assetList.querySelector('[data-slug="' + CSS.escape(slug) + '"]');
      const target = row.querySelector(".sessions");
      if (target.classList.contains("open")) {
        target.classList.remove("open");
        return;
      }

      target.classList.add("open");
      target.innerHTML = '<p class="empty">Loading\u2026</p>';

      const response = await fetch("/api/assets/" + encodeURIComponent(slug) + "/sessions", {
        headers: { Authorization: "Bearer " + currentToken() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        target.innerHTML = '<p class="empty">' + escapeHtml(payload.error || "Could not load sessions.") + '</p>';
        return;
      }

      const sessions = payload.sessions || [];
      if (!sessions.length) {
        target.innerHTML = '<p class="empty">No sessions yet.</p>';
        return;
      }

      target.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Type</th><th>IP</th><th>Network</th><th>Reqs</th><th>Last seen</th><th>User agent</th></tr></thead><tbody>' +
        sessions.map((session) => {
          const geo = [session.country, session.colo, session.asn ? "AS" + session.asn : "", session.asOrganization].filter(Boolean).join(" / ");
          return '<tr>' +
            '<td><span class="tag ' + tagClass(session.viewerKind) + '">' + escapeHtml(viewerLabel(session.viewerKind)) + '</span></td>' +
            '<td>' + escapeHtml(session.ip || "\u2014") + '</td>' +
            '<td>' + escapeHtml(geo || "\u2014") + '</td>' +
            '<td>' + escapeHtml(session.requestCount) + '</td>' +
            '<td>' + escapeHtml(formatDate(session.lastSeen)) + '</td>' +
            '<td style="max-width:220px;font-size:11px">' + escapeHtml(session.userAgent || "\u2014") + '</td>' +
          '</tr>';
        }).join("") +
      '</tbody></table></div>';
    }

    function tagClass(kind) {
      if (kind === "likely_human") return "tag-human";
      if (kind === "discord_preview" || kind === "discord_proxy") return "tag-discord";
      if (kind === "bot") return "tag-bot";
      return "";
    }

    function viewerLabel(kind) {
      return { likely_human: "human", discord_preview: "discord preview", discord_proxy: "discord proxy", bot: "bot", unknown: "unknown" }[kind] || "unknown";
    }

    function currentToken() {
      return tokenInput.value.trim() || sessionStorage.getItem("mediaAdminToken") || "";
    }

    function setStatus(msg, err) {
      statusEl.textContent = msg;
      statusEl.classList.toggle("error", Boolean(err));
    }

    function clearStatus() {
      setStatus("");
      progressBar.style.width = "0";
    }

    function escapeHtml(v) {
      return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    }

    function escapeAttr(v) {
      return escapeHtml(v).replace(/\\n/g, " ");
    }

    function formatBytes(b) {
      const v = Number(b || 0);
      if (v < 1024) return v + " B";
      const u = ["KB", "MB", "GB"];
      let s = v / 1024;
      for (const unit of u) {
        if (s < 1024 || unit === "GB") return s.toFixed(s < 10 ? 1 : 0) + " " + unit;
        s /= 1024;
      }
    }

    function formatDate(v) {
      if (!v) return "\u2014";
      return new Date(v).toLocaleString();
    }

    loadAssets();
  </script>
</body>
</html>`;
}

function renderWatchPage(asset) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(asset.originalName)} - Safi Media</title>
  <meta name="description" content="Video hosted by Safi.">
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${escapeHtml(asset.originalName)}">
  <meta property="og:description" content="Video hosted by Safi.">
  <meta property="og:video" content="${escapeAttr(asset.nativeUrl)}">
  <meta property="og:video:secure_url" content="${escapeAttr(asset.nativeUrl)}">
  <meta property="og:video:type" content="video/mp4">
  <meta name="twitter:card" content="player">
  <meta name="twitter:player" content="${escapeAttr(asset.watchUrl)}">
  <style>
    :root {
      color-scheme: dark;
      --bg: #101214;
      --text: #edf2f4;
      --muted: #a8b3bc;
      --line: #313942;
      --accent: #45c4b0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 20px;
    }
    main {
      width: min(980px, 100%);
    }
    video {
      display: block;
      width: 100%;
      max-height: 78vh;
      background: #050607;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    h1 {
      margin: 16px 0 8px;
      font-size: 18px;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }
    a {
      color: var(--accent);
      overflow-wrap: anywhere;
      text-decoration: none;
    }
    p {
      margin: 0;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main>
    <video controls preload="metadata" src="${escapeAttr(asset.nativeUrl)}"></video>
    <h1>${escapeHtml(asset.originalName)}</h1>
    <p><a href="${escapeAttr(asset.nativeUrl)}">Native MP4 link</a></p>
  </main>
</body>
</html>`;
}

function sanitizeFileName(value) {
  const cleaned = String(value)
    .split(/[\\/]/)
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned || "video.mp4";
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function randomString(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureCompare(input, expected) {
  if (!input || !expected) return false;
  const inputHash = await sha256Hex(input);
  const expectedHash = await sha256Hex(expected);
  return inputHash === expectedHash;
}

function publicBaseUrl(env) {
  return String(env.PUBLIC_BASE_URL || "").replace(/\/+$/, "") || "https://media.safi.dev";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  for (const unit of units) {
    if (size < 1024 || unit === "GB") return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`;
    size /= 1024;
  }
  return `${value} B`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]
  ));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-file-name",
  };
}
