import { Fragment, type ReactNode } from "react";

// Minimal, safe markdown for advisor answers: headings, bullet/numbered lists,
// **bold**, *italic*, `code`, horizontal rules, paragraphs. Builds React nodes
// only (never innerHTML), so model output can't inject markup.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h"; level: 2 | 3 | 4; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "hr" }
  | { kind: "p"; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); blocks.push({ kind: "hr" }); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = Math.min(4, Math.max(2, h[1].length + 1)) as 2 | 3 | 4;
      blocks.push({ kind: "h", level, text: h[2].replace(/\s*#+$/, "") });
      continue;
    }
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const text = (ul || ol)![1];
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === kind) prev.items.push(text);
      else blocks.push({ kind, items: [text] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function AdvisorMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="mx-adv-md">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "hr") return <hr key={k} />;
        if (b.kind === "h") {
          const Tag = (`h${b.level}` as "h2" | "h3" | "h4");
          return <Tag key={k}>{inline(b.text, k)}</Tag>;
        }
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind;
          return <List key={k}>{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</List>;
        }
        if (b.kind === "p") return <p key={k}>{inline(b.text, k).map((n, j) => <Fragment key={j}>{n}</Fragment>)}</p>;
        return null;
      })}
    </div>
  );
}
