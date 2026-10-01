// مصدر واحد لحساب مستويات الخطورة (الشدة 1-10 × الاحتمالية 1-10 = 1-100)
// نفس الحدود مستخدمة في كود جوجل (riskLevelText_) لرسائل تليجرام.

export const RISK_MAX = 100;
export const RISK_THRESHOLDS = {
  veryHigh: 46,
  high: 30,
  mediumPlus: 19,
  medium: 9,
  low: 4,
} as const;

/** البلاغ "حرج" إذا كان مستواه مرتفعاً أو مرتفعاً جداً */
export const CRITICAL_RISK_SCORE = RISK_THRESHOLDS.high;

export interface RiskLevel {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export function getRiskLevel(score: number, language: string): RiskLevel {
  const en = language === "en";
  if (score >= RISK_THRESHOLDS.veryHigh) return {
    label: en ? "VH → Very High (مرتفع جداً)" : "VH → مرتفع جداً (Very High)",
    color: "text-red-500", bg: "bg-red-500/20", border: "border-red-500/30",
  };
  if (score >= RISK_THRESHOLDS.high) return {
    label: en ? "H → High (مرتفع)" : "H → مرتفع (High)",
    color: "text-orange-500", bg: "bg-orange-500/20", border: "border-orange-500/30",
  };
  if (score >= RISK_THRESHOLDS.mediumPlus) return {
    label: en ? "M+ → Medium Plus (أعلى من المتوسط)" : "M+ → أعلى من المتوسط (Medium Plus)",
    color: "text-amber-500", bg: "bg-amber-500/20", border: "border-amber-500/30",
  };
  if (score >= RISK_THRESHOLDS.medium) return {
    label: en ? "M → Medium (متوسط)" : "M → متوسط (Medium)",
    color: "text-yellow-500", bg: "bg-yellow-500/20", border: "border-yellow-500/30",
  };
  if (score >= RISK_THRESHOLDS.low) return {
    label: en ? "L → Low (منخفض)" : "L → منخفض (Low)",
    color: "text-green-500", bg: "bg-green-500/25", border: "border-green-500/30",
  };
  return {
    label: en ? "VL → Very Low (منخفض جداً)" : "VL → منخفض جداً (Very Low)",
    color: "text-cyan-400", bg: "bg-cyan-400/25", border: "border-cyan-400/30",
  };
}
