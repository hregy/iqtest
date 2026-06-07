// Collect a device/browser profile + a canvas/WebGL fingerprint, used by the
// server for test-integrity forensics and bot detection.

async function sha256Hex(str: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    // non-crypto fallback (older/insecure contexts)
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }
}

function canvasFp(): string {
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#069";
    ctx.fillText("IQ-test-fingerprint-😀-Ω", 2, 2);
    ctx.strokeStyle = "rgba(120,0,200,0.6)";
    ctx.strokeRect(5, 5, 40, 18);
    return c.toDataURL();
  } catch {
    return "";
  }
}

function webglFp(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "";
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
    return `${vendor}|${renderer}`;
  } catch {
    return "";
  }
}

export interface ClientProfile {
  ua: string;
  platform: string;
  languages: string[];
  language: string;
  timezone: string;
  tzOffset: number;
  screen: { w: number; h: number; availW: number; availH: number; depth: number; dpr: number };
  viewport: { w: number; h: number };
  cores: number | null;
  memory: number | null;
  touch: number;
  webdriver: boolean;
  fingerprint: string;
}

export async function collectClient(): Promise<ClientProfile> {
  const n = navigator as Navigator & { deviceMemory?: number; webdriver?: boolean };
  const profile: Omit<ClientProfile, "fingerprint"> = {
    ua: n.userAgent,
    platform: n.platform || "",
    languages: Array.from(n.languages || []),
    language: n.language || "",
    timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })(),
    tzOffset: new Date().getTimezoneOffset(),
    screen: {
      w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight,
      depth: screen.colorDepth, dpr: window.devicePixelRatio || 1,
    },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    cores: n.hardwareConcurrency || null,
    memory: n.deviceMemory ?? null,
    touch: n.maxTouchPoints || 0,
    webdriver: !!n.webdriver,
  };
  const fingerprint = await sha256Hex(
    [profile.ua, profile.platform, profile.timezone, profile.languages.join(","),
     `${screen.width}x${screen.height}x${screen.colorDepth}`, profile.cores, profile.memory,
     canvasFp(), webglFp()].join("##")
  );
  return { ...profile, fingerprint };
}
