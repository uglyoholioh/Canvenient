// CanvasHtml — sanitized Canvas HTML (pages, syllabus, front page) rendered
// in the instrument's type voice. Content styling lives under
// .ins-canvashtml in modules.css.

import DOMPurify from "dompurify";

export default function CanvasHtml({ html, className = "" }) {
  if (!html) return null;
  return (
    <div
      className={`ins-canvashtml ${className}`}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}
