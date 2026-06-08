import { useLang } from "../lib/i18n";

// Small EN / فارسی segmented toggle. Switches UI language + page direction.
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={"lang-toggle" + (className ? " " + className : "")} role="group" aria-label="Language">
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>EN</button>
      <button type="button" className={lang === "fa" ? "on" : ""} onClick={() => setLang("fa")} aria-pressed={lang === "fa"}>فا</button>
    </div>
  );
}
