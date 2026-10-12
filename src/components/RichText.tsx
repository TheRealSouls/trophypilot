import { Fragment, type ReactNode } from "react";
import clsx from "clsx";
import { parseRichText, type Block, type Inline } from "@/lib/rich-text";
import { InlineSpoiler } from "./InlineSpoiler";
import { YouTube } from "./YouTube";

/**
 * Shows text a member wrote, with its formatting (see lib/rich-text.ts).
 * Everything is rendered as React elements, so nothing they type can run as
 * HTML. Links open in a new tab and are marked as user content.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return <div className={clsx("rich-text break-words", className)}>{blocks.map((b, i) => renderBlock(b, i))}</div>;
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.t) {
    case "p":
      return (
        <p key={key}>
          {b.lines.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {renderInline(l)}
            </Fragment>
          ))}
        </p>
      );
    case "h": {
      const Tag = (["h2", "h3", "h4"] as const)[b.level - 1];
      return (
        <Tag key={key} className={clsx("rt-h", `rt-h${b.level}`)}>
          {renderInline(b.c)}
        </Tag>
      );
    }
    case "small":
      return (
        <p key={key} className="rt-small">
          {renderInline(b.c)}
        </p>
      );
    case "quote":
      return (
        <blockquote key={key}>
          {b.lines.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {renderInline(l)}
            </Fragment>
          ))}
        </blockquote>
      );
    case "ul":
    case "ol": {
      const List = b.t;
      return (
        <List key={key}>
          {b.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case "video":
      return (
        <div key={key} className="rt-video">
          <YouTube id={b.id} title="YouTube video" />
        </div>
      );
    case "image":
      return (
        <figure key={key} className="rt-image">
          {/* Linked pictures from other sites; the description is the alt text. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.src} alt={b.alt} loading="lazy" referrerPolicy="no-referrer" />
        </figure>
      );
    case "center":
      return (
        <p key={key} className="text-center">
          {renderInline(b.c)}
        </p>
      );
    case "pre":
      return (
        <pre key={key}>
          <code>{b.v}</code>
        </pre>
      );
  }
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "code":
        return <code key={i}>{n.v}</code>;
      case "link":
        return (
          <a key={i} href={n.href} target="_blank" rel="nofollow ugc noopener noreferrer">
            {renderInline(n.c)}
          </a>
        );
      case "b":
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case "i":
        return <em key={i}>{renderInline(n.c)}</em>;
      case "u":
        return <u key={i}>{renderInline(n.c)}</u>;
      case "s":
        return <s key={i}>{renderInline(n.c)}</s>;
      case "spoiler":
        return <InlineSpoiler key={i}>{renderInline(n.c)}</InlineSpoiler>;
    }
  });
}
