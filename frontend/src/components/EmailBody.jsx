import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

const EMAIL_TAGS = /<(?:!doctype\b|\/?(?:html|body|div|p|table|thead|tbody|tfoot|tr|td|th|span|br|hr|img|a|ul|ol|li|h[1-6]|blockquote|pre|strong|em|b|i|u|font|center))\b/i;

function sanitizeEmailHtml(source) {
  const fragment = DOMPurify.sanitize(source, {
    USE_PROFILES: { html: true },
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: [
      'link', 'meta', 'base', 'form', 'input', 'button', 'textarea',
      'select', 'option', 'iframe', 'object', 'embed',
      'video', 'audio', 'source'
    ],
    FORBID_ATTR: ['srcdoc']
  });
  const container = document.createElement('div');
  container.append(fragment);
  container.querySelectorAll('a').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });
  return container.innerHTML;
}

export default function EmailBody({ body }) {
  const frameRef = useRef(null);
  const cleanupFrameRef = useRef(() => {});
  const [frameHeight, setFrameHeight] = useState(240);
  const content = typeof body === 'string' ? body : '';
  const isHtml = EMAIL_TAGS.test(content);
  const safeHtml = useMemo(
    () => (isHtml ? sanitizeEmailHtml(content) : ''),
    [content, isHtml]
  );
  const srcDoc = useMemo(() => (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; form-action 'none'; base-uri 'none'"></head><body>${safeHtml}<style>
      html,body{width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;box-sizing:border-box!important;overflow-wrap:anywhere!important}
      body{padding:12px!important;background:#fff!important;color:#1e293b!important;font:14px/1.6 Arial,sans-serif!important}
      img,svg,video{max-width:100%!important;height:auto!important}
      table{max-width:100%!important}
      td,th{overflow-wrap:anywhere!important;word-break:break-word!important}
      pre{max-width:100%!important;overflow-x:auto!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}
      a{overflow-wrap:anywhere!important}
    </style></body></html>`
  ), [safeHtml]);

  useEffect(() => {
    setFrameHeight(240);
    cleanupFrameRef.current();
  }, [srcDoc]);

  useEffect(() => () => cleanupFrameRef.current(), []);

  const handleFrameLoad = useCallback(() => {
    cleanupFrameRef.current();
    const document = frameRef.current?.contentDocument;
    if (!document) return;

    const updateHeight = () => {
      const contentHeight = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      setFrameHeight(Math.max(180, contentHeight));
    };

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateHeight);
    observer?.observe(document.documentElement);
    if (document.body) observer?.observe(document.body);

    const images = Array.from(document.images);
    images.forEach((image) => image.addEventListener('load', updateHeight));
    cleanupFrameRef.current = () => {
      observer?.disconnect();
      images.forEach((image) => image.removeEventListener('load', updateHeight));
    };

    updateHeight();
    requestAnimationFrame(updateHeight);
  }, []);

  if (!content.trim()) {
    return <p className="text-slate-500 dark:text-slate-400">This email has no body content.</p>;
  }

  if (isHtml) {
    return (
      <iframe
        ref={frameRef}
        title="Email message content"
        sandbox="allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={handleFrameLoad}
        className="email-message-frame"
        style={{ height: `${frameHeight}px` }}
      />
    );
  }

  return <div className="whitespace-pre-wrap break-words">{content}</div>;
}
