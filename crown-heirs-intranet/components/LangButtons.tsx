"use client";

import { useEffect, useState } from "react";

const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "es", label: "ES", name: "Español" },
  { code: "fr", label: "FR", name: "Français" },
];

// Google stores the active translation in the `googtrans` cookie as "/en/<lang>".
function readLang(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  if (m) {
    const code = decodeURIComponent(m[1]).split("/")[2];
    if (code) return code;
  }
  return "en";
}

function clearCookie(name: string) {
  const host = location.hostname;
  for (const scope of ["", `;domain=${host}`, `;domain=.${host}`]) {
    document.cookie = `${name}=;path=/${scope};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

function setCookie(name: string, value: string) {
  const host = location.hostname;
  document.cookie = `${name}=${value};path=/`;
  document.cookie = `${name}=${value};path=/;domain=${host}`;
  if (host.split(".").length > 1) document.cookie = `${name}=${value};path=/;domain=.${host}`;
}

// EN · ES · FR toggle. Sets Google's translation cookie and reloads so the whole
// page (including the handbook and policies) comes back in the chosen language.
export default function LangButtons({ stacked = false }: { stacked?: boolean }) {
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(readLang()), []);

  const choose = (code: string) => {
    if (code === lang) return;
    clearCookie("googtrans");
    if (code !== "en") setCookie("googtrans", `/en/${code}`);
    location.reload();
  };

  return (
    <div className={"lang-switch notranslate" + (stacked ? " stacked" : "")} translate="no" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => choose(l.code)}
          aria-pressed={lang === l.code}
          className={"lang-btn" + (lang === l.code ? " active" : "")}
          title={l.name}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
