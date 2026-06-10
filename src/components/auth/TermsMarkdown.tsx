import type { ReactNode } from "react";

/** Lightweight markdown renderer for terms copy (headings, lists, blockquotes, emphasis). */

function inlineEmphasis(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={`${match.index}-a`}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="terms-markdown__link"
          >
            {link[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("**")) {
      parts.push(<strong key={`${match.index}-b`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${match.index}-i`}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function TermsBlock({ block }: { block: string }) {
  const trimmed = block.trim();
  if (!trimmed) return null;

  if (trimmed === "---") return <hr className="terms-markdown__hr" />;

  if (trimmed.startsWith("> ")) {
    return (
      <blockquote className="terms-markdown__quote">
        {inlineEmphasis(trimmed.replace(/^>\s?/gm, ""))}
      </blockquote>
    );
  }

  if (trimmed.startsWith("# ")) {
    return <h1 className="terms-markdown__h1">{inlineEmphasis(trimmed.slice(2))}</h1>;
  }
  if (trimmed.startsWith("## ")) {
    return <h2 className="terms-markdown__h2">{inlineEmphasis(trimmed.slice(3))}</h2>;
  }

  const lines = trimmed.split("\n");
  if (lines.every((line) => line.startsWith("- "))) {
    return (
      <ul className="terms-markdown__list">
        {lines.map((line) => (
          <li key={line}>{inlineEmphasis(line.slice(2))}</li>
        ))}
      </ul>
    );
  }

  return <p className="terms-markdown__p">{inlineEmphasis(trimmed)}</p>;
}

export function TermsMarkdown({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/);
  return (
    <div className="terms-markdown">
      {blocks.map((block, i) => (
        <TermsBlock key={`${i}-${block.slice(0, 24)}`} block={block} />
      ))}
    </div>
  );
}
