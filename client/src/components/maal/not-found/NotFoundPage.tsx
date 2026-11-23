import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { MaalMark } from "@/components/maal/MaalMark";
import { Disclaimer } from "@/components/maal/Disclaimer";
import { openAdvisorPopup } from "@/components/maal/advisor/AdvisorPopup";
import { CollapsingMark } from "./CollapsingMark";
// One stylesheet for this page and the server-rendered one (views/not-found.ejs).
import "../../../../../public/css/not-found.css";

/**
 * "Page not found" (HEL-110). Two places:
 *  - inside the app shell for unknown /app/* routes (signedIn: home is /app and
 *    the quiet link opens the advisor);
 *  - as a plain v2 page for any other unknown client route (home is /, the
 *    link goes to the contact page).
 * Unknown public URLs loaded straight from the server get the same design
 * from views/not-found.ejs with a real 404 status (lib/app-routes.js).
 */
export function NotFoundPage({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    const prev = document.title;
    document.title = "Page not found | Maal";
    return () => { document.title = prev; };
  }, []);
  const body = (
    <main className="nf-main">
      <div className="nf-inner">
        <CollapsingMark />
        <h1>Page not found</h1>
        <p className="nf-lines">
          <span>This page doesn't exist or has moved.</span> <span>Let's get you back on track.</span>
        </p>
        <div className="nf-actions">
          {signedIn ? (
            <>
              <Link to="/app" className="nf-btn">Go back home</Link>
              <button type="button" className="nf-link" onClick={() => openAdvisorPopup()}>Ask Maal</button>
            </>
          ) : (
            <>
              <a href="/" className="nf-btn">Go back home</a>
              <a href="/contact" className="nf-link">Contact support</a>
            </>
          )}
        </div>
      </div>
    </main>
  );

  if (signedIn) return <div className="nf nf-shell">{body}</div>;
  return (
    <div className="nf nf-page">
      <header className="nf-top">
        <a href="/" className="nf-logo" aria-label="Maal home"><MaalMark size={18} /><span>Maal</span></a>
      </header>
      {body}
      <footer className="nf-foot"><Disclaimer variant="inline" /></footer>
    </div>
  );
}
