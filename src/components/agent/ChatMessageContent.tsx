import React, { useState } from "react";
import { marked, Tokens } from "marked";
import { Check, Copy } from "lucide-react";

interface ChatMessageContentProps {
  content: string;
  role: "user" | "assistant" | "system";
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({ content, role }) => {
  if (!content) return null;

  try {
    const tokens = marked.lexer(content);
    return (
      <div
        className={`agent-chat-content select-text leading-relaxed ${
          role === "user" ? "text-primary-foreground font-medium" : "text-foreground"
        }`}
      >
        {tokens.map((token, index) => (
          <BlockTokenView key={index} token={token} role={role} />
        ))}
      </div>
    );
  } catch {
    return <p className="whitespace-pre-wrap break-words select-text">{content}</p>;
  }
};

function HeadingView({ token }: { token: Tokens.Heading }) {
  const children = renderInlineTokens(token.tokens);
  if (token.depth === 1) {
    return <h1 className="text-sm font-bold text-foreground mt-2 mb-1">{children}</h1>;
  }
  if (token.depth === 2) {
    return <h2 className="text-xs font-bold text-foreground mt-2 mb-1">{children}</h2>;
  }
  if (token.depth === 3) {
    return <h3 className="text-xs font-semibold text-foreground mt-1.5 mb-0.5">{children}</h3>;
  }
  return <h4 className="text-xs font-semibold text-foreground mt-1 mb-0.5">{children}</h4>;
}

function ListView({ token }: { token: Tokens.List }) {
  const items = token.items.map((item, idx) => (
    <li key={idx} className="leading-relaxed">
      {renderInlineTokens(item.tokens)}
    </li>
  ));

  if (token.ordered) {
    return <ol className="list-decimal pl-4 my-1.5 space-y-0.5 text-xs">{items}</ol>;
  }
  return <ul className="list-disc pl-4 my-1.5 space-y-0.5 text-xs">{items}</ul>;
}

function TableView({ token }: { token: Tokens.Table }) {
  return (
    <div className="overflow-x-auto my-2 border border-border rounded-lg bg-card/60 shadow-xs">
      <table className="w-full text-[11px] text-left border-collapse">
        <thead>
          <tr className="bg-muted/70 border-b border-border">
            {token.header.map((col, idx) => (
              <th key={idx} className="p-1.5 font-semibold text-foreground">
                {renderInlineTokens(col.tokens)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {token.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="p-1.5 text-foreground">
                  {renderInlineTokens(cell.tokens)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockquoteView({ token, role }: { token: Tokens.Blockquote; role: string }) {
  return (
    <blockquote className="border-l-2 border-primary/60 pl-2.5 my-1.5 italic text-muted-foreground bg-muted/20 py-0.5 rounded-r text-xs">
      {token.tokens ? (
        token.tokens.map((t, idx) => <BlockTokenView key={idx} token={t as Tokens.Generic} role={role} />)
      ) : (
        <span>{token.text}</span>
      )}
    </blockquote>
  );
}

function BlockTokenView({ token, role }: { token: Tokens.Generic; role: string }) {
  if (token.type === "heading") {
    return <HeadingView token={token as Tokens.Heading} />;
  }
  if (token.type === "paragraph") {
    return <p className="my-1 leading-relaxed text-xs">{renderInlineTokens((token as Tokens.Paragraph).tokens)}</p>;
  }
  if (token.type === "list") {
    return <ListView token={token as Tokens.List} />;
  }
  if (token.type === "blockquote") {
    return <BlockquoteView token={token as Tokens.Blockquote} role={role} />;
  }
  if (token.type === "code") {
    const codeToken = token as Tokens.Code;
    return <CodeBlockView code={codeToken.text} lang={codeToken.lang} />;
  }
  if (token.type === "table") {
    return <TableView token={token as Tokens.Table} />;
  }
  if (token.type === "hr") {
    return <hr className="my-2 border-border" />;
  }
  if (token.type === "space") {
    return null;
  }
  if ("tokens" in token && Array.isArray((token as { tokens?: Tokens.Generic[] }).tokens)) {
    return <div>{renderInlineTokens((token as { tokens?: Tokens.Generic[] }).tokens)}</div>;
  }
  if ("text" in token) {
    return <p className="my-1 text-xs">{(token as { text?: string }).text}</p>;
  }
  return null;
}

function renderSingleInlineToken(t: Tokens.Generic, idx: number): React.ReactNode {
  if (t.type === "text") {
    const textToken = t as Tokens.Text;
    if (textToken.tokens && textToken.tokens.length > 0) {
      return <React.Fragment key={idx}>{renderInlineTokens(textToken.tokens)}</React.Fragment>;
    }
    return <span key={idx}>{textToken.text}</span>;
  }
  if (t.type === "strong") {
    return (
      <strong key={idx} className="font-semibold text-foreground">
        {renderInlineTokens((t as Tokens.Strong).tokens)}
      </strong>
    );
  }
  if (t.type === "em") {
    return (
      <em key={idx} className="italic">
        {renderInlineTokens((t as Tokens.Em).tokens)}
      </em>
    );
  }
  if (t.type === "codespan") {
    return (
      <code
        key={idx}
        className="px-1 py-0.5 rounded text-[10px] font-mono bg-muted/80 text-primary border border-border/50"
      >
        {(t as Tokens.Codespan).text}
      </code>
    );
  }
  if (t.type === "del") {
    return (
      <del key={idx} className="line-through text-muted-foreground">
        {renderInlineTokens((t as Tokens.Del).tokens)}
      </del>
    );
  }
  if (t.type === "link") {
    const linkToken = t as Tokens.Link;
    return (
      <a
        key={idx}
        href={linkToken.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:opacity-80"
      >
        {renderInlineTokens(linkToken.tokens)}
      </a>
    );
  }
  if (t.type === "br") {
    return <br key={idx} />;
  }
  if (t.type === "escape") {
    return <span key={idx}>{(t as Tokens.Escape).text}</span>;
  }
  if (t.type === "html") {
    const raw = (t as Tokens.HTML).text;
    if (raw === "<br>" || raw === "<br/>" || raw === "<br />") {
      return <br key={idx} />;
    }
    const stripped = raw.replace(/<[^>]+>/g, "");
    return <span key={idx}>{stripped}</span>;
  }
  if ("text" in t) {
    return <span key={idx}>{(t as { text?: string }).text}</span>;
  }
  return null;
}

function renderInlineTokens(tokens?: Tokens.Generic[]): React.ReactNode {
  if (!tokens || tokens.length === 0) return null;
  return tokens.map(renderSingleInlineToken);
}

function CodeBlockView({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-lg border border-border/80 bg-muted/40 overflow-hidden group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-muted/80 border-b border-border/60 text-[10px] font-mono text-muted-foreground">
        <span className="uppercase">{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
          title="Sao chép đoạn mã"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-500" />
              <span className="text-emerald-500">Đã chép</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-foreground leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
