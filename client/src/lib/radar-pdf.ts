import { jsPDF } from "jspdf";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type RadarEvent = {
  id: string;
  created_at: string;
  message: string;
  detail?: string | null;
  email_status?: string | null;
  alert_id?: string | null;
};

type AlertLite = { id: string; prompt?: string | null; frequency?: string | null };

function header(doc: jsPDF) {
  doc.setFillColor(18, 181, 166);
  doc.rect(0, 0, 210, 6, "F");
  doc.setFontSize(11);
  doc.setTextColor(14, 14, 16);
  doc.text("Maal Radar", 20, 18);
  doc.setFontSize(9);
  doc.setTextColor(107, 111, 118);
  doc.text(`Exported ${fmt(new Date().toISOString())}`, 20, 24);
}

function disclaimer(doc: jsPDF, y: number) {
  doc.setDrawColor(232, 232, 234);
  doc.line(20, y, 190, y);
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    "Maal does not provide financial advice. Information is for educational purposes only.",
    20, y + 6, { maxWidth: 170 },
  );
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, w: number, lineH = 5) {
  const lines = doc.splitTextToSize(text, w);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

// Compute the wrapped lines and FULL rendered height of an event block without
// drawing anything, so callers can paginate BEFORE writing (not after an
// overflow has already been drawn).
function layoutEvent(doc: jsPDF, ev: RadarEvent, alert: AlertLite | undefined) {
  doc.setFontSize(14);
  const messageLines: string[] = doc.splitTextToSize(ev.message || "(no message)", 170);
  let detailLines: string[] = [];
  if (ev.detail) {
    doc.setFontSize(10);
    detailLines = doc.splitTextToSize(ev.detail, 170);
  }
  let promptLines: string[] = [];
  if (alert?.prompt) {
    doc.setFontSize(9);
    promptLines = doc.splitTextToSize(`Radar watch: ${alert.prompt}`, 162);
  }
  const promptBoxH = promptLines.length ? promptLines.length * 4.5 + 6 : 0;
  const height =
    7 + // meta row (date / frequency / email status)
    messageLines.length * 6 + 2 +
    (detailLines.length ? detailLines.length * 5 + 3 : 0) +
    (promptLines.length ? promptBoxH + 4 : 0) +
    8; // divider + trailing gap
  return { messageLines, detailLines, promptLines, promptBoxH, height };
}

function renderEvent(
  doc: jsPDF,
  ev: RadarEvent,
  alert: AlertLite | undefined,
  y: number,
  layout?: ReturnType<typeof layoutEvent>,
) {
  const L = layout ?? layoutEvent(doc, ev, alert);
  doc.setFontSize(9);
  doc.setTextColor(107, 111, 118);
  doc.text(fmt(ev.created_at).toUpperCase(), 20, y);
  if (alert?.frequency) {
    doc.text(`· ${alert.frequency}`, 65, y);
  }
  if (ev.email_status === "queued" || ev.email_status === "sent" || ev.email_status === "delivered") {
    doc.setTextColor(18, 181, 166);
    // "sent" is reserved for a delivered status; queued mail is shown as queued.
    doc.text(ev.email_status === "queued" ? "· EMAIL QUEUED" : "· EMAIL SENT", 90, y);
  }
  y += 7;

  doc.setFontSize(14);
  doc.setTextColor(14, 14, 16);
  doc.text(L.messageLines, 20, y);
  y += L.messageLines.length * 6 + 2;

  if (L.detailLines.length) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 65);
    doc.text(L.detailLines, 20, y);
    y += L.detailLines.length * 5 + 3;
  }

  if (L.promptLines.length) {
    doc.setFillColor(244, 244, 245);
    doc.roundedRect(20, y, 170, L.promptBoxH, 2, 2, "F");
    doc.setFontSize(9);
    doc.setTextColor(107, 111, 118);
    doc.text(L.promptLines, 24, y + 5);
    y += L.promptBoxH + 4;
  }

  doc.setDrawColor(232, 232, 234);
  doc.line(20, y, 190, y);
  return y + 8;
}

export function exportEventPdf(ev: RadarEvent, alert?: AlertLite) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc);
  let y = 38;
  doc.setFontSize(18);
  doc.setTextColor(14, 14, 16);
  doc.text("Radar update", 20, y);
  y += 10;
  y = renderEvent(doc, ev, alert, y);
  disclaimer(doc, 280);
  doc.save(`maal-radar-${ev.id.slice(0, 8)}.pdf`);
}

export function exportAllEventsPdf(events: RadarEvent[], alerts: AlertLite[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const byId = new Map(alerts.map((a) => [a.id, a]));
  header(doc);
  let y = 38;
  doc.setFontSize(18);
  doc.setTextColor(14, 14, 16);
  doc.text("Radar updates", 20, y);
  doc.setFontSize(10);
  doc.setTextColor(107, 111, 118);
  doc.text(`${events.length} update${events.length === 1 ? "" : "s"}`, 20, y + 6);
  y += 16;

  const PAGE_BOTTOM = 280; // leave room above the disclaimer line at 285
  for (const ev of events) {
    const alert = ev.alert_id ? byId.get(ev.alert_id) : undefined;
    // Measure the FULL rendered height (message + detail + prompt box) and
    // paginate BEFORE writing anything, so an oversized update starts on a
    // fresh page instead of being clipped mid-block.
    const layout = layoutEvent(doc, ev, alert);
    if (y + layout.height > PAGE_BOTTOM && y > 38) { doc.addPage(); header(doc); y = 38; }
    y = renderEvent(doc, ev, alert, y, layout);
  }
  disclaimer(doc, 285);
  doc.save(`maal-radar-history.pdf`);
}