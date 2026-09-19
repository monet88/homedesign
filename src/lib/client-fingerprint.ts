/**
 * Lightweight browser device fingerprint helper.
 * Generates a privacy-friendly deterministic hash from client hardware, WebGL GPU, and canvas attributes.
 * Zero external dependencies.
 */
export async function getClientFingerprint(): Promise<string> {
  if (typeof window === "undefined") {
    return "server-environment";
  }

  try {
    const components: string[] = [
      navigator.userAgent,
      navigator.language || "",
      navigator.languages ? navigator.languages.join(",") : "",
      String(window.screen.width) + "x" + String(window.screen.height),
      String(window.screen.availWidth) + "x" + String(window.screen.availHeight),
      String(window.screen.colorDepth || 24),
      String(new Date().getTimezoneOffset()),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      String(navigator.hardwareConcurrency || 4),
      String(navigator.maxTouchPoints || 0),
    ];

    // WebGL GPU unmasked renderer info (rất phân hóa giữa các card đồ họa/chip đồ họa khác nhau)
    try {
      const glCanvas = document.createElement("canvas");
      const gl = (glCanvas.getContext("webgl") || glCanvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          if (vendor) components.push(String(vendor));
          if (renderer) components.push(String(renderer));
        }
      }
    } catch {
      // Ignore WebGL disabled environments
    }

    // Canvas 2D complex drawing component
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 45;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(10, 5, 60, 20);
        ctx.fillStyle = "#069";
        ctx.font = "14px 'Arial', sans-serif";
        ctx.fillText("HomeDesign, <canvas> 2.0", 4, 17);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("HomeDesign, <canvas> 2.0", 2, 15);
        // Gradient & Arc for subpixel anti-aliasing distinction
        const grad = ctx.createLinearGradient(0, 0, 150, 0);
        grad.addColorStop(0, "rgba(255, 100, 50, 0.8)");
        grad.addColorStop(1, "rgba(50, 150, 255, 0.8)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(120, 22, 12, 0, Math.PI * 2);
        ctx.fill();
        components.push(canvas.toDataURL());
      }
    } catch {
      // Canvas rendering failed or disabled, proceed with hardware attributes
    }

    const raw = components.join("|||");
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "fp_" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    return "fp_fallback_" + Math.random().toString(36).slice(2, 10);
  }
}
