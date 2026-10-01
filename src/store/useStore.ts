import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Language } from "../i18n/translations";

interface User {
  id: string;
  name: string;
  role: "admin" | "supervisor" | "employee";
  language: Language;
}

interface AppState {
  user: User | null;
  /** رمز جلسة المدير الصادر من كود جوجل */
  token: string | null;
  /** وقت انتهاء الجلسة (ISO) */
  expiresAt: string | null;
  language: Language;
  isRTL: boolean;
  setUser: (user: User | null, token?: string | null, expiresAt?: string | null) => void;
  logout: () => void;
  setLanguage: (lang: Language) => void;
}

// تخزين آمن: لو المتصفح يمنع localStorage لا يتعطل التطبيق
const safeStorage = createJSONStorage(() => {
  try {
    const testKey = "__uni_hse_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
  }
});

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      expiresAt: null,
      language: "ar",
      isRTL: true,
      setUser: (user, token = null, expiresAt = null) =>
        set(user ? { user, token, expiresAt } : { user: null, token: null, expiresAt: null }),
      logout: () => set({ user: null, token: null, expiresAt: null }),
      setLanguage: (language) => set({
        language,
        isRTL: language === "ar"
      }),
    }),
    {
      name: "uni-hse-session",
      storage: safeStorage,
      partialize: (s) => ({ user: s.user, token: s.token, expiresAt: s.expiresAt, language: s.language, isRTL: s.isRTL }),
      onRehydrateStorage: () => (state) => {
        // إنهاء الجلسة تلقائياً بعد انتهاء صلاحيتها
        if (state?.expiresAt && new Date(state.expiresAt).getTime() <= Date.now()) {
          state.logout();
        }
      },
    }
  )
);

/** يُرجع رمز الجلسة الصالح فقط (أو null إذا انتهت) */
export function getValidToken(): string | null {
  const { token, expiresAt, logout } = useStore.getState();
  if (!token) return null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    logout();
    return null;
  }
  return token;
}
