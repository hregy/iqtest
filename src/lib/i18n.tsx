import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "fa";

// One dictionary, two languages. Keys are semantic; values may use {placeholders}.
const STR: Record<string, { en: string; fa: string }> = {
  // header / nav
  scores: { en: "Scores", fa: "امتیازها" },
  back_to_start: { en: "‹ Back to start", fa: "‹ بازگشت به شروع" },
  view_scoreboard: { en: "View scoreboard →", fa: "مشاهده جدول امتیازات →" },

  // landing hero
  hero_badge: { en: "THINK LIKE A GENIUS", fa: "مثل یک نابغه فکر کن" },
  hero_title: { en: "How smart are you, really?", fa: "واقعاً چقدر باهوشی؟" },
  hero_sub: { en: "Timed visual puzzles. One honest number. Find your IQ in minutes.", fa: "معماهای تصویری زمان‌دار. یک عدد صادقانه. آی‌کیو خود را در چند دقیقه بسنجید." },
  choose_test: { en: "Choose your test", fa: "آزمون خود را انتخاب کنید" },
  quick_test: { en: "Quick test", fa: "آزمون سریع" },
  quick_test_sub: { en: "20 puzzles · warm-up", fa: "۲۰ معما · گرم‌کردن" },
  final_test: { en: "Final IQ Test", fa: "آزمون نهایی آی‌کیو" },
  final_test_sub: { en: "30 questions · 5 levels", fa: "۳۰ سؤال · ۵ سطح" },
  your_name: { en: "Your name", fa: "نام شما" },
  name_placeholder: { en: "e.g. Albert", fa: "مثلاً: آلبرت" },
  voucher_code: { en: "Voucher code", fa: "کد دسترسی" },
  begin_test: { en: "Begin test →", fa: "شروع آزمون →" },
  err_enter_name: { en: "Enter a name to begin.", fa: "برای شروع نام خود را وارد کنید." },
  err_enter_voucher: { en: "Enter your voucher code.", fa: "کد دسترسی خود را وارد کنید." },
  rule_timed: { en: "Every question is timed — it auto-advances.", fa: "هر سؤال زمان‌دار است و خودکار جلو می‌رود." },
  rule_no_back: { en: "No going back. Each answer is final.", fa: "بازگشت ممکن نیست. هر پاسخ نهایی است." },
  rule_tap: { en: "Tap the tile you think is correct.", fa: "گزینه‌ای را که درست می‌دانید لمس کنید." },
  fineprint: { en: "For entertainment — not a clinical IQ assessment.", fa: "برای سرگرمی — نه یک سنجش بالینی آی‌کیو." },

  // test gate
  ready_name: { en: "Ready, {name}?", fa: "آماده‌ای، {name}؟" },
  gate_sub_quick: { en: "The test runs in full screen and is timed per question.", fa: "آزمون در حالت تمام‌صفحه اجرا می‌شود و هر سؤال زمان‌دار است." },
  gate_sub_final: { en: "Final IQ Test — 30 questions across 5 difficulty levels, timed per question.", fa: "آزمون نهایی آی‌کیو — ۳۰ سؤال در ۵ سطح دشواری، هر سؤال زمان‌دار." },
  gate_rule_fs: { en: "Stays in full screen — leaving is recorded.", fa: "در تمام‌صفحه می‌ماند — خروج ثبت می‌شود." },
  gate_rule_timed: { en: "Each question is timed on the server; no extra time.", fa: "هر سؤال روی سرور زمان‌دار است؛ زمان اضافه نیست." },
  gate_rule_final: { en: "No going back. Each answer is final.", fa: "بازگشت ممکن نیست. هر پاسخ نهایی است." },
  start_fullscreen: { en: "Enter full screen & start", fa: "ورود به تمام‌صفحه و شروع" },
  err_bot_check: { en: "Please complete the bot check.", fa: "لطفاً بررسی ربات را کامل کنید." },
  err_could_not_start: { en: "Could not start the test.", fa: "شروع آزمون ممکن نشد." },
  back: { en: "Back", fa: "بازگشت" },
  scoring: { en: "Scoring…", fa: "در حال محاسبه…" },

  // capture guards
  guard_fs_title: { en: "Return to full screen", fa: "بازگشت به تمام‌صفحه" },
  guard_fs_body: { en: "Exiting full screen is recorded. The timer keeps running — tap to continue.", fa: "خروج از تمام‌صفحه ثبت می‌شود. زمان‌سنج ادامه دارد — برای ادامه لمس کنید." },
  guard_fs_btn: { en: "Re-enter full screen", fa: "ورود مجدد به تمام‌صفحه" },
  guard_hidden_title: { en: "Question hidden", fa: "سؤال پنهان شد" },
  guard_hidden_body: { en: "Switching apps, opening developer tools, or taking screenshots is recorded and hides the question.", fa: "تغییر برنامه، باز کردن ابزار توسعه‌دهنده یا گرفتن اسکرین‌شات ثبت می‌شود و سؤال را پنهان می‌کند." },

  // question view
  question_of: { en: "Question {n} of {total}", fa: "سؤال {n} از {total}" },
  loading_question: { en: "Loading question…", fa: "در حال بارگذاری سؤال…" },
  odd_hint: { en: "Three of these are alike — tap the one that's different.", fa: "سه مورد شبیه هم‌اند — موردی را که متفاوت است لمس کنید." },
  answers_final: { en: "Answers are final — no going back.", fa: "پاسخ‌ها نهایی هستند — بازگشت ممکن نیست." },

  // results
  practice_badge: { en: "Practice run — not recorded", fa: "اجرای تمرینی — ثبت نمی‌شود" },
  final_weighted: { en: "Final IQ Test · level-weighted", fa: "آزمون نهایی آی‌کیو · وزن‌دهی‌شده بر اساس سطح" },
  your_iq: { en: "YOUR IQ", fa: "آی‌کیو شما" },
  correct_of: { en: "{correct} of {total} correct.", fa: "{correct} از {total} درست." },
  stat_correct: { en: "Correct", fa: "درست" },
  stat_accuracy: { en: "Accuracy", fa: "دقت" },
  stat_avg: { en: "Avg / question", fa: "میانگین هر سؤال" },
  stat_total_time: { en: "Total time", fa: "زمان کل" },
  review_show: { en: "Review your answers", fa: "مرور پاسخ‌ها" },
  review_hide: { en: "Hide answer review", fa: "پنهان کردن مرور پاسخ‌ها" },
  see_scoreboard: { en: "🏆 See the scoreboard", fa: "🏆 مشاهده جدول امتیازات" },
  back_to_start_plain: { en: "Back to start", fa: "بازگشت به شروع" },

  // scoreboard
  scoreboard: { en: "Scoreboard", fa: "جدول امتیازات" },
  sb_sub_final: { en: "Final IQ Test — level-weighted", fa: "آزمون نهایی آی‌کیو — وزن‌دهی‌شده بر اساس سطح" },
  sb_sub_quick: { en: "Quick test", fa: "آزمون سریع" },
  tab_final: { en: "Final IQ", fa: "آی‌کیو نهایی" },
  tab_quick: { en: "Quick test", fa: "آزمون سریع" },
  sb_empty: { en: "No scores yet — be the first!", fa: "هنوز امتیازی نیست — اولین نفر باشید!" },
  sb_error: { en: "Could not load scoreboard.", fa: "بارگذاری جدول امتیازات ممکن نشد." },

  // iq bands
  "Very Superior": { en: "Very Superior", fa: "بسیار برتر" },
  "Superior": { en: "Superior", fa: "برتر" },
  "High Average": { en: "High Average", fa: "بالاتر از متوسط" },
  "Average": { en: "Average", fa: "متوسط" },
  "Low Average": { en: "Low Average", fa: "پایین‌تر از متوسط" },
  "Below Average": { en: "Below Average", fa: "زیر متوسط" },

  // review list
  rv_correct: { en: "✓ Correct", fa: "✓ درست" },
  rv_timedout: { en: "⏱ Timed out", fa: "⏱ زمان تمام شد" },
  rv_wrong: { en: "✗ Wrong", fa: "✗ نادرست" },
  rv_badge_correct: { en: "✓ correct", fa: "✓ درست" },
  rv_badge_yours: { en: "your answer", fa: "پاسخ شما" },
  rv_no_answer: { en: "No answer selected.", fa: "هیچ پاسخی انتخاب نشد." },
};

function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = STR[key];
  let s = entry ? entry[lang] || entry.en : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: "rtl" | "ltr";
}

const Ctx = createContext<LangCtx | null>(null);

function applyDir(lang: Lang) {
  const dir = lang === "fa" ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lang);
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("lang");
    return saved === "fa" || saved === "en" ? saved : "en";
  });

  useEffect(() => { applyDir(lang); }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem("lang", l);
    setLangState(l);
  }, []);

  const value = useMemo<LangCtx>(() => ({
    lang,
    setLang,
    dir: lang === "fa" ? "rtl" : "ltr",
    t: (key, vars) => translate(lang, key, vars),
  }), [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang must be used within LangProvider");
  return c;
}
