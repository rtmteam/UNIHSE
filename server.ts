import express from "express";
import path from "path";

// =====================================================================
// خادم التشغيل المحلي / المعاينة فقط
// ---------------------------------------------------------------------
// كل منطق البيانات (البلاغات، الفروع، الإعدادات، تليجرام، Gemini، تسجيل الدخول)
// موجود الآن في كود جوجل (google-apps-script.js)، والواجهة تتصل به مباشرة
// عبر الطبقة الموجودة في src/main.tsx — لذلك يتصرف التطبيق محلياً تماماً
// كما يتصرف على GitHub Pages، ولا يحتفظ هذا الخادم بأي أسرار أو بيانات.
// =====================================================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");

// أي طلب /api يصل للخادم يعني أن الواجهة لم تُحمَّل بشكل صحيح
app.all("/api/*", (_req, res) => {
  res.status(410).json({
    error: "API routes moved to Google Apps Script. The frontend calls it directly (see src/main.tsx)."
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
