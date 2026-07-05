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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --sky: #d0ecff;
      --cloud: #ffffff;
      --panel: #fff8ee;
      --panel-2: #fff3de;
      --panel-border: #ffd68a;
      --text: #3a2e24;
      --text-secondary: #6b5a4e;
      --muted: #9b8a7c;
      --accent: #ff8a5c;
      --accent-hover: #ff7040;
      --accent-glow: rgba(255,138,92,0.25);
      --mint: #7edcb5;
      --mint-bg: #e8faf2;
      --mint-border: #5cc99a;
      --blueberry: #7ba7f7;
      --blueberry-bg: #e5efff;
      --blueberry-border: #5b8de8;
      --pink-bg: #fff0f4;
      --pink-border: #e87a9a;
      --danger: #e85d5d;
      --yellow-deep: #ffd426;
      --radius: 20px;
      --radius-sm: 14px;
      --radius-xs: 10px;
      --shadow-soft: 0 4px 20px rgba(0,0,0,0.06);
      --shadow-btn: 0 3px 0 rgba(0,0,0,0.1);
      font-family: 'Nunito', 'Comic Sans MS', ui-rounded, system-ui, sans-serif;
    }
    *{box-sizing:border-box;margin:0}
    body{
      background: var(--sky);
      background-image:
        radial-gradient(ellipse 120px 60px at 8% 15%,rgba(255,255,255,.6) 0%,transparent 100%),
        radial-gradient(ellipse 180px 80px at 85% 8%,rgba(255,255,255,.5) 0%,transparent 100%),
        radial-gradient(ellipse 100px 50px at 50% 22%,rgba(255,255,255,.4) 0%,transparent 100%),
        radial-gradient(ellipse 140px 55px at 25% 6%,rgba(255,255,255,.45) 0%,transparent 100%),
        linear-gradient(180deg,#c4e4ff 0%,#d8f0ff 40%,#e8f6ff 100%);
      background-attachment:fixed;
      color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;
    }
    body::before{
      content:'';position:fixed;top:0;left:0;right:0;height:200px;
      background:
        radial-gradient(ellipse 80px 40px at 10% 85%,rgba(255,255,255,.7) 0%,transparent 100%),
        radial-gradient(ellipse 120px 50px at 92% 75%,rgba(255,255,255,.6) 0%,transparent 100%),
        radial-gradient(ellipse 60px 30px at 70% 90%,rgba(255,255,255,.5) 0%,transparent 100%);
      pointer-events:none;z-index:0;
    }
    .top-bar,.container{position:relative;z-index:1}
    .top-bar{
      background:linear-gradient(135deg,#ffe8a8 0%,#ffd06a 50%,#ffbe42 100%);
      border-bottom:3px solid #e6a520;padding:18px 0;
      box-shadow:0 4px 16px rgba(230,165,32,.2);
    }
    .top-bar-inner{
      width:min(1100px,calc(100vw - 40px));margin:0 auto;
      display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;
    }
    .brand{display:flex;align-items:center;gap:12px}
    .brand-icon{
      width:46px;height:46px;display:flex;align-items:center;justify-content:center;
      font-size:30px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.12));
      animation:bobble 3s ease-in-out infinite;
    }
    @keyframes bobble{
      0%,100%{transform:translateY(0) rotate(-3deg)}
      50%{transform:translateY(-4px) rotate(3deg)}
    }
    .brand h1{font-size:24px;font-weight:900;color:#5a3e14;letter-spacing:-.01em;text-shadow:0 1px 0 rgba(255,255,255,.5)}
    .brand p{color:#7a5c28;font-size:13px;font-weight:600;line-height:1.3;margin-top:1px}
    .auth{display:flex;gap:8px;align-items:center}
    .container{width:min(1100px,calc(100vw - 40px));margin:0 auto;padding:28px 0 60px}
    .sections{display:grid;gap:24px}
    .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .section-title{font-size:16px;font-weight:800;color:#5a3e14;letter-spacing:.02em;display:flex;align-items:center;gap:6px}
    .section-title::before{content:'\u2B50';font-size:14px}
    .panel{
      background:var(--panel);border:3px solid var(--panel-border);
      border-radius:var(--radius);padding:22px;
      box-shadow:var(--shadow-soft),0 3px 0 #f0d080;
    }
    input,button{font:inherit;font-size:14px}
    input{
      width:100%;min-width:0;color:var(--text);background:#fff;
      border:2.5px solid #e0cdb8;border-radius:var(--radius-xs);
      padding:10px 14px;outline:none;
      transition:border-color 150ms ease,box-shadow 150ms ease;
    }
    input::placeholder{color:var(--muted)}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-glow)}
    button{
      border:0;border-radius:var(--radius-xs);padding:10px 18px;
      color:#fff;background:var(--accent);font-weight:800;
      cursor:pointer;white-space:nowrap;
      box-shadow:var(--shadow-btn);position:relative;top:0;
      transition:transform 100ms ease,box-shadow 100ms ease,background 120ms ease;
    }
    button:hover{background:var(--accent-hover);transform:translateY(-1px);box-shadow:0 4px 0 rgba(0,0,0,.12)}
    button:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.1)}
    button.secondary{color:var(--text);background:var(--cloud);border:2.5px solid #ddd0c0;box-shadow:0 2px 0 #e8ddd0}
    button.secondary:hover{background:#fff8ee;border-color:#ccbfaa;transform:translateY(-1px);box-shadow:0 3px 0 #e0d4c6}
    button:disabled{opacity:.45;cursor:not-allowed;transform:none!important}
    .upload-layout{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
    .upload-left{display:grid;gap:12px}
    .dropzone{
      min-height:200px;display:grid;place-items:center;text-align:center;
      border:3px dashed #d4c0a8;border-radius:var(--radius);
      background:linear-gradient(170deg,#fffdf8 0%,#fff5e8 100%);
      padding:28px 20px;cursor:pointer;
      transition:border-color 200ms ease,background 200ms ease,transform 200ms ease;
    }
    .dropzone:hover{border-color:var(--accent);background:linear-gradient(170deg,#fff8ee,#ffeedd);transform:scale(1.01)}
    .dropzone.dragging{border-color:var(--mint-border);background:var(--mint-bg);transform:scale(1.02)}
    .dropzone-icon{
      width:56px;height:56px;border-radius:50%;
      background:linear-gradient(135deg,#ffe4b8,#ffd080);
      border:3px solid #e6b850;display:grid;place-items:center;
      margin:0 auto 12px;box-shadow:0 3px 8px rgba(230,184,80,.25);
    }
    .dropzone-icon svg{width:22px;height:22px;stroke:#8a6520;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
    .dropzone strong{display:block;font-size:16px;font-weight:800;color:#5a3e14;margin-bottom:4px}
    .dropzone p{color:var(--muted);font-size:13px;font-weight:600;line-height:1.5;max-width:260px;margin:0 auto}
    .file-input{display:none}
    .pick-btn-wrap{text-align:center}
    .progress{height:10px;border-radius:999px;background:#f0e4d4;border:2px solid #ddd0be;overflow:hidden}
    .progress>span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--yellow-deep),var(--mint));border-radius:999px;transition:width 180ms ease}
    .status{min-height:20px;color:var(--muted);font-size:13px;font-weight:600}
    .status.error{color:var(--danger)}
    .upload-result{display:grid;gap:12px}
    .link-row{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:8px;align-items:center}
    .link-row label{color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .link-row a{color:var(--blueberry);overflow-wrap:anywhere;text-decoration:none;font-size:13px;font-weight:600;transition:color 120ms ease}
    .link-row a:hover{color:#4a72d0}
    .link-row button{font-size:12px;padding:6px 10px}
    .list{display:grid;gap:14px}
    .asset{
      background:var(--cloud);border:2.5px solid #e0d4c4;
      border-radius:var(--radius-sm);padding:18px 20px;
      box-shadow:0 2px 0 #eae0d2;
      transition:border-color 150ms ease,transform 150ms ease,box-shadow 150ms ease;
    }
    .asset:hover{border-color:var(--panel-border);transform:translateY(-2px);box-shadow:0 5px 16px rgba(0,0,0,.06),0 3px 0 #e8dcc8}
    .asset-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .asset-info{flex:1;min-width:0}
    .asset-title{font-weight:800;font-size:15px;line-height:1.4;overflow-wrap:anywhere;margin-bottom:5px;color:#3a2e24}
    .asset-meta{color:var(--muted);font-size:13px;font-weight:600;line-height:1.6}
    .asset-meta+.asset-meta{margin-top:2px}
    .asset-actions{display:flex;gap:8px;flex-shrink:0;align-items:flex-start}
    .asset-actions button{padding:7px 12px;font-size:12px}
    .badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .badge{
      display:inline-flex;align-items:center;gap:4px;
      min-height:26px;border-radius:999px;border:2px solid #e0d4c4;background:#faf5ee;
      color:var(--muted);padding:3px 12px;font-size:11px;font-weight:800;line-height:1.3;white-space:nowrap;
    }
    .badge-human{color:#2e8b64;border-color:var(--mint-border);background:var(--mint-bg)}
    .badge-human::before{content:'\uD83D\uDC26';font-size:10px}
    .badge-discord{color:#4a6ec0;border-color:var(--blueberry-border);background:var(--blueberry-bg)}
    .badge-discord::before{content:'\uD83D\uDCAC';font-size:10px}
    .badge-bot{color:#c04a5a;border-color:var(--pink-border);background:var(--pink-bg)}
    .badge-bot::before{content:'\uD83E\uDD16';font-size:10px}
    .asset-links{display:grid;gap:8px;margin-top:14px;padding-top:14px;border-top:2px dashed #eee2d2}
    .sessions{margin-top:14px;display:none;border-top:2px dashed #eee2d2;padding-top:14px}
    .sessions.open{display:block}
    .sessions-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--radius-xs);border:2px solid #e8dcc8}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{text-align:left;border-bottom:1.5px solid #f0e8dc;padding:10px;vertical-align:top}
    th{color:#8a7460;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:#fef8ee;position:sticky;top:0}
    td{overflow-wrap:anywhere;color:var(--text-secondary);font-weight:600}
    tr:hover td{background:#fffbf4}
    .empty{color:var(--muted);font-size:13px;font-weight:600;padding:8px 0}
    .stat-row{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600;color:var(--text-secondary)}
    .stat-sep{color:#d4c4b0;margin:0 2px}
    @media(max-width:860px){
      .top-bar-inner,.container{width:calc(100vw - 28px)}
      .top-bar-inner{flex-direction:column;align-items:stretch;gap:12px}
      .auth{width:100%}
      .upload-layout{grid-template-columns:1fr}
      .link-row{grid-template-columns:1fr;gap:6px}
      .link-row label{font-size:10px}
      .asset{padding:14px 16px}
      .asset-top{flex-direction:column;gap:10px}
      .asset-actions{align-self:flex-start}
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="top-bar-inner">
      <div class="brand">
        <div class="brand-icon">\uD83D\uDC26</div>
        <div>
          <h1>Safi Media</h1>
          <p>Upload MP4s to R2. Get Discord friendly native links.</p>
        </div>
      </div>
      <form class="auth" id="authForm">
        <input id="tokenInput" type="password" autocomplete="current-password" placeholder="Admin token" style="max-width:260px">
        <button type="submit">Unlock</button>
      </form>
    </div>
  </div>

  <div class="container">
    <div class="sections">
      <section>
        <div class="section-header">
          <span class="section-title">Upload</span>
        </div>
        <div class="panel">
          <div class="upload-layout">
            <div class="upload-left">
              <input class="file-input" id="fileInput" type="file" accept="video/mp4,.mp4">
              <div class="dropzone" id="dropzone" tabindex="0" role="button">
                <div>
                  <div class="dropzone-icon">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <strong>Drop an MP4 here</strong>
                  <p>or click to browse. Max size: ${escapeHtml(formatBytes(maxUploadBytes))}.</p>
                </div>
              </div>
              <div class="pick-btn-wrap">
                <button class="secondary" id="pickButton" type="button">Choose File</button>
              </div>
            </div>
            <div class="upload-result">
              <div class="progress" aria-hidden="true"><span id="progressBar"></span></div>
              <div class="status" id="status"></div>
              <div id="resultLinks"></div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="section-header">
          <span class="section-title">Recent Uploads</span>
          <button class="secondary" id="refreshButton" type="button" style="font-size:12px;padding:6px 14px;">Refresh</button>
        </div>
        <div class="status" id="listStatus"></div>
        <div class="list" id="assetList"></div>
      </section>
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
        setStatus("Uploaded successfully.");
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
          const orig = button.textContent;
          button.textContent = "Copied!";
          setTimeout(() => button.textContent = orig, 1200);
        });
      });
    }

    function linkRow(label, href) {
      return '<div class="link-row"><label>' + escapeHtml(label) + '</label><a href="' + escapeAttr(href) + '" target="_blank" rel="noreferrer">' + escapeHtml(href) + '</a><button class="secondary" type="button" data-copy="' + escapeAttr(href) + '">Copy</button></div>';
    }

    function renderAssets(assets) {
      if (!assets.length) {
        assetList.innerHTML = '<p class="empty">No uploads yet.</p>';
        return;
      }

      assetList.innerHTML = assets.map((asset) => {
        return '<article class="asset" data-slug="' + escapeAttr(asset.slug) + '">' +
          '<div class="asset-top">' +
            '<div class="asset-info">' +
              '<div class="asset-title">' + escapeHtml(asset.originalName) + '</div>' +
              '<div class="stat-row">' +
                '<span>' + escapeHtml(formatBytes(asset.sizeBytes)) + '</span>' +
                '<span class="stat-sep">\u00b7</span>' +
                '<span>' + escapeHtml(asset.sessions || 0) + ' sessions</span>' +
                '<span class="stat-sep">\u00b7</span>' +
                '<span>' + escapeHtml(asset.requests || 0) + ' requests</span>' +
              '</div>' +
              '<div class="badges">' +
                (asset.likelyHumanSessions ? '<span class="badge badge-human">' + escapeHtml(asset.likelyHumanSessions) + ' Likely Human</span>' : '') +
                (asset.discordSessions ? '<span class="badge badge-discord">' + escapeHtml(asset.discordSessions) + ' Discord</span>' : '') +
                (asset.botSessions ? '<span class="badge badge-bot">' + escapeHtml(asset.botSessions) + ' Bot</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="asset-actions">' +
              '<button class="secondary" type="button" data-sessions="' + escapeAttr(asset.slug) + '">Sessions</button>' +
            '</div>' +
          '</div>' +
          '<div class="asset-links">' + linkRow("Native", asset.nativeUrl) + linkRow("Watch", asset.watchUrl) + '</div>' +
          '<div class="sessions"></div>' +
        '</article>';
      }).join("");

      assetList.querySelectorAll("button[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
          navigator.clipboard.writeText(button.dataset.copy);
          const orig = button.textContent;
          button.textContent = "Copied!";
          setTimeout(() => button.textContent = orig, 1200);
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
      target.innerHTML = '<p class="empty">Loading sessions\u2026</p>';

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
        target.innerHTML = '<p class="empty">No sessions logged yet.</p>';
        return;
      }

      target.innerHTML = '<div class="sessions-table-wrap"><table><thead><tr><th>Type</th><th>IP</th><th>Network</th><th>Requests</th><th>Last Seen</th><th>User Agent</th></tr></thead><tbody>' +
        sessions.map((session) => {
          const geo = [
            session.country,
            session.colo,
            session.asn ? "AS" + session.asn : "",
            session.asOrganization,
          ].filter(Boolean).join(" / ");
          const flags = session.viewerFlags ? '<div class="asset-meta" style="margin-top:4px;font-size:11px">' + escapeHtml(session.viewerFlags) + '</div>' : "";
          return '<tr>' +
            '<td>' + viewerBadge(session.viewerKind, session.viewerConfidence) + flags + '</td>' +
            '<td>' + escapeHtml(session.ip || "(unknown)") + '</td>' +
            '<td>' + escapeHtml(geo || "\u2014") + '</td>' +
            '<td>' + escapeHtml(session.requestCount) + '</td>' +
            '<td>' + escapeHtml(formatDate(session.lastSeen)) + '</td>' +
            '<td style="max-width:240px;font-size:11px">' + escapeHtml(session.userAgent || "\u2014") + '</td>' +
          '</tr>';
        }).join("") +
      '</tbody></table></div>';
    }

    function viewerBadge(kind, confidence) {
      const normalized = String(kind || "unknown");
      let className = "badge";
      if (normalized === "likely_human") className += " badge-human";
      if (normalized === "discord_preview" || normalized === "discord_proxy") className += " badge-discord";
      if (normalized === "bot") className += " badge-bot";
      return '<span class="' + className + '">' + escapeHtml(viewerLabel(normalized)) + ' \u00b7 ' + escapeHtml(confidence || "low") + '</span>';
    }

    function viewerLabel(kind) {
      const labels = {
        likely_human: "Likely Human",
        discord_preview: "Discord Preview",
        discord_proxy: "Discord Proxy",
        bot: "Bot",
        unknown: "Unknown",
      };
      return labels[kind] || "Unknown";
    }

    function currentToken() {
      return tokenInput.value.trim() || sessionStorage.getItem("mediaAdminToken") || "";
    }

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.classList.toggle("error", Boolean(isError));
    }

    function clearStatus() {
      setStatus("");
      progressBar.style.width = "0";
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/\\n/g, " ");
    }

    function formatBytes(bytes) {
      const value = Number(bytes || 0);
      if (value < 1024) return value + " B";
      const units = ["KB", "MB", "GB"];
      let size = value / 1024;
      for (const unit of units) {
        if (size < 1024 || unit === "GB") return size.toFixed(size < 10 ? 1 : 0) + " " + unit;
        size = size / 1024;
      }
    }

    function formatDate(value) {
      if (!value) return "\u2014";
      return new Date(value).toLocaleString();
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
