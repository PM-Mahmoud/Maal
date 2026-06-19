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

function renderEvent(doc: jsPDF, ev: RadarEvent, alert: AlertLite | undefined, y: number) {
  doc.setFontSize(9);
  doc.setTextColor(107, 111, 118);
  doc.text(fmt(ev.created_at).toUpperCase(), 20, y);
  if (alert?.frequency) {
    doc.text(`· ${alert.frequency}`, 65, y);
  }
  if (ev.email_status === "queued") {
    doc.setTextColor(18, 181, 166);
    doc.text("· EMAIL SENT", 90, y);
  }
  y += 7;

  doc.setFontSize(14);
  doc.setTextColor(14, 14, 16);
  y = wrapText(doc, ev.message || "(no message)", 20, y, 170, 6) + 2;

  if (ev.detail) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 65);
    y = wrapText(doc, ev.detail, 20, y, 170, 5) + 3;
  }

  if (alert?.prompt) {
    doc.setFillColor(244, 244, 245);
    const lines = doc.splitTextToSize(`Radar watch: ${alert.prompt}`, 162);
    const boxH = lines.length * 4.5 + 6;
    doc.roundedRect(20, y, 170, boxH, 2, 2, "F");
    doc.setFontSize(9);
    doc.setTextColor(107, 111, 118);
    doc.text(lines, 24, y + 5);
    y += boxH + 4;
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

  for (const ev of events) {
    if (y > 250) { doc.addPage(); header(doc); y = 38; }
    y = renderEvent(doc, ev, ev.alert_id ? byId.get(ev.alert_id) : undefined, y);
  }
  disclaimer(doc, 285);
  doc.save(`maal-radar-history.pdf`);
}