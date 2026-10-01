/// <reference types="vite/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useStore, getValidToken } from './store/useStore';

// =====================================================================
// طبقة الاتصال بكود جوجل (Google Apps Script)
// ---------------------------------------------------------------------
// كل طلبات الصفحات إلى /api/... تُحوَّل هنا إلى كود جوجل مباشرة،
// سواء على GitHub Pages أو أثناء التشغيل المحلي، فيتصرف التطبيق بنفس الطريقة في كل مكان.
// لا توجد هنا أي أسرار: رمز تليجرام ومفتاح Gemini وكلمة سر المدير كلها داخل جوجل فقط.
// =====================================================================

const FALLBACK_SHEETS_URL = "https://script.google.com/macros/s/AKfycbzexnanBi4l1pZ9qOBUA5hO75LNW6WFAegt0oMPTYnxxHTD6sEQRVKjx8LTLTsp61xTDw/exec";
const REQUEST_TIMEOUT_MS = 90_000;

const DEFAULT_BRANCHES = [
  { name: "ورشة تجميع الهياكل (Assembly Workshop)", region: "المنطقة الغربية (Western Area)" },
  { name: "مستودع الغازات السامة (Gas Storage Area)", region: "المنطقة الغربية (Western Area)" },
  { name: "رصيف الشحن والتوزيع (Loading Dock)", region: "المنطقة الشرقية (Eastern Area)" },
  { name: "منطقة السلامة الكيميائية (Chemical Zone)", region: "المنطقة الوسطى (Central Area)" },
  { name: "مستودع قطع الغيار واللوجستيات (Parts & Logistics)", region: "المنطقة الوسطى (Central Area)" }
];

const originalFetch = window.fetch.bind(window);

// تنظيف بيانات قديمة كانت تُخزَّن على أجهزة الزوار (ومنها رمز تليجرام)
try {
  localStorage.removeItem("offline_settings");
  localStorage.removeItem("offline_incidents");
} catch { /* ignore */ }

// قراءة رابط كود جوجل من config.json مرة واحدة فقط (مسار نسبي يعمل على GitHub Pages)
let sheetsUrlPromise: Promise<string> | null = null;
function getSheetsUrl(): Promise<string> {
  if (!sheetsUrlPromise) {
    sheetsUrlPromise = (async () => {
      try {
        const res = await originalFetch(`${import.meta.env.BASE_URL}config.json`, { cache: "no-cache" });
        if (res.ok) {
          const cfg = await res.json();
          if (cfg && typeof cfg.GOOGLE_SHEET_WEBAPP_URL === "string" && cfg.GOOGLE_SHEET_WEBAPP_URL.startsWith("https://")) {
            return cfg.GOOGLE_SHEET_WEBAPP_URL;
          }
        }
      } catch (err) {
        console.warn("HSE System: could not read config.json, using built-in URL", err);
      }
      return FALLBACK_SHEETS_URL;
    })();
  }
  return sheetsUrlPromise;
}

const ERROR_STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  RATE_LIMIT: 429,
  NOT_CONFIGURED: 503,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

type SheetsResult = { ok: boolean; data?: any; status?: number; error?: string; code?: string };

async function callSheets(action: string, payload: Record<string, unknown> = {}, withToken = false): Promise<SheetsResult> {
  // قراءة الرمز قبل أي انتظار (مهم لتسجيل الخروج الذي يمسح الرمز فوراً)
  const token = withToken ? getValidToken() : null;
  const url = await getSheetsUrl();
  const body: Record<string, unknown> = { action, ...payload };
  if (withToken) body.token = token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // text/plain يمنع طلب preflight الذي لا يدعمه Apps Script
    const res = await originalFetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      return { ok: false, status: 502, code: "SERVER_ERROR", error: `Google Apps Script HTTP ${res.status}` };
    }
    let data: any;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: 502, code: "SERVER_ERROR", error: "Invalid response from Google Apps Script (check deployment access: Anyone)" };
    }
    if (!data || data.success !== true) {
      const code = (data && data.code) || "SERVER_ERROR";
      if (code === "UNAUTHORIZED" && withToken) {
        useStore.getState().logout(); // الجلسة انتهت → العودة لشاشة الدخول
      }
      return { ok: false, status: ERROR_STATUS[code] || 500, code, error: (data && data.error) || "Unknown error" };
    }
    return { ok: true, data };
  } catch (err: any) {
    const aborted = err && err.name === "AbortError";
    return { ok: false, status: 503, code: "NETWORK", error: aborted ? "Request timed out" : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

function toResponse(result: SheetsResult, pick: (data: any) => unknown, successStatus = 200): Response {
  if (!result.ok) return jsonResponse({ error: result.error, code: result.code }, result.status || 500);
  return jsonResponse(pick(result.data), successStatus);
}

function readBody(init?: RequestInit): any {
  if (!init || !init.body || typeof init.body !== "string") return {};
  try { return JSON.parse(init.body); } catch { return {}; }
}

function readCache<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function writeCache(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

async function handleApi(path: string, method: string, init?: RequestInit): Promise<Response> {
  const body = readBody(init);

  // ---------- تسجيل الدخول ----------
  if (path === "auth/login" && method === "POST") {
    return toResponse(await callSheets("login", { username: body.username, password: body.password }), (d) => d);
  }
  if (path === "auth/logout" && method === "POST") {
    return toResponse(await callSheets("logout", {}, true), () => ({ success: true }));
  }

  // ---------- البلاغات ----------
  if (path === "incidents" && method === "GET") {
    return toResponse(await callSheets("getIncidents", {}, true), (d) => d.incidents || []);
  }
  if (path === "incidents" && method === "POST") {
    return toResponse(await callSheets("createIncident", {
      employeeName: body.employeeName,
      incidentLocation: body.incidentLocation,
      agency: body.agency,
      classification: body.classification,
      description: body.description,
      severity: body.severity,
      probability: body.probability,
      correctiveAction: body.correctiveAction,
      files: Array.isArray(body.files) ? body.files : []
    }), (d) => ({ ...d.incident, fileErrors: d.fileErrors || [] }), 201);
  }
  if (path.startsWith("track/") && method === "GET") {
    const id = decodeURIComponent(path.slice("track/".length));
    return toResponse(await callSheets("trackIncident", { id }), (d) => d.incident);
  }
  if (path.startsWith("incidents/") && method === "PATCH") {
    const id = decodeURIComponent(path.slice("incidents/".length));
    const payload: Record<string, unknown> = { id };
    if (body.status !== undefined) payload.status = body.status;
    if (body.correctiveAction !== undefined) payload.correctiveAction = body.correctiveAction;
    if (Array.isArray(body.files) && body.files.length > 0) payload.files = body.files;
    return toResponse(await callSheets("updateIncident", payload), (d) => ({ ...d.incident, fileErrors: d.fileErrors || [] }));
  }

  // ---------- الإعدادات ----------
  if (path === "settings" && method === "GET") {
    return toResponse(await callSheets("getSettings", {}, true), (d) => d.settings);
  }
  if (path === "settings" && method === "POST") {
    return toResponse(await callSheets("setSettings", { settings: body }, true), (d) => ({ success: true, settings: d.settings }));
  }
  if (path === "settings/test-telegram" && method === "POST") {
    return toResponse(await callSheets("testTelegram", {}, true), (d) => d);
  }

  // ---------- الفروع ----------
  if (path === "branches" && method === "GET") {
    const result = await callSheets("getBranches");
    if (result.ok && Array.isArray(result.data.branches)) {
      writeCache("offline_branches", result.data.branches);
      return jsonResponse({ branches: result.data.branches });
    }
    // قائمة الفروع فقط تُعرض من النسخة المحفوظة عند انقطاع الاتصال
    return jsonResponse({ branches: readCache("offline_branches", DEFAULT_BRANCHES), offline: true });
  }
  if ((path === "branches" || path === "branches/push-sheets") && method === "POST") {
    const list = Array.isArray(body.branches) ? body.branches : [];
    const result = await callSheets("setBranches", { branches: list }, true);
    if (result.ok) writeCache("offline_branches", list);
    return toResponse(result, () => ({ success: true, branches: list }));
  }

  // ---------- سجل الإشعارات ----------
  if (path === "notifications" && method === "GET") {
    return toResponse(await callSheets("getNotifications", {}, true), (d) => d.notifications || []);
  }

  // ---------- الذكاء الاصطناعي ----------
  if (path === "ai/suggest-corrective-actions" && method === "POST") {
    return toResponse(await callSheets("aiSuggest", body), (d) => ({ suggestions: d.suggestions, source: d.source }));
  }
  if (path === "ai/chat" && method === "POST") {
    return toResponse(await callSheets("aiChat", {
      incident: body.incident,
      incidentId: body.incidentId,
      mode: body.mode,
      messages: body.messages
    }), (d) => ({ reply: d.reply, source: d.source }));
  }

  return jsonResponse({ error: `Unknown API route: ${method} /api/${path}` }, 404);
}

window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === "string" ? input : (input instanceof URL ? input.href : input.url);
  let url: URL;
  try {
    url = new URL(urlStr, window.location.href);
  } catch {
    return originalFetch(input, init);
  }
  const apiIndex = url.pathname.indexOf("/api/");
  if (url.origin === window.location.origin && apiIndex !== -1) {
    const path = url.pathname.slice(apiIndex + "/api/".length).replace(/\/+$/, "");
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    return handleApi(path, method, init);
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
