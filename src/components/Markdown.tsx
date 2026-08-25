// Markdown rendering for chat content (model replies AND user entries).
//
// Security (Constitution Article 6): react-markdown parses markdown into
// React elements — there is no dangerouslySetInnerHTML and no raw-HTML
// passthrough (rehype-raw is deliberately NOT installed). HTML typed into
// a journal entry renders as literal text. Dangerous URL schemes are
// stripped by react-markdown's default urlTransform.
//
// Visual styling lives in globals.css under .md-body (LAMPLIGHT tokens).
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // External links open in a new tab without leaking opener access.
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
