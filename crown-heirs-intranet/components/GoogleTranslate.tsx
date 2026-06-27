"use client";

import { useEffect } from "react";

// Loads Google's website-translation engine once and gives it a hidden mount
// point. The actual language choice is driven by <LangButtons> via a cookie.
export default function GoogleTranslate() {
  useEffect(() => {
    if (document.getElementById("google-translate-script")) return;
    // Google calls this global once the script is ready.
    (window as unknown as { googleTranslateElementInit?: () => void }).googleTranslateElementInit = () => {
      const g = (window as unknown as { google?: { translate?: { TranslateElement?: new (o: object, el: string) => void } } }).google;
      try {
        if (g?.translate?.TranslateElement) {
          new g.translate.TranslateElement(
            { pageLanguage: "en", includedLanguages: "en,es,fr", autoDisplay: false },
            "google_translate_element",
          );
        }
      } catch {
        // ignore — translation just stays off
      }
    };
    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    document.body.appendChild(s);
  }, []);

  return <div id="google_translate_element" aria-hidden style={{ display: "none" }} />;
}
