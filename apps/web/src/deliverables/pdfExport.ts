/** Inline styles for a standalone print/PDF window (matches .library-paper-sheet). */
const PAPER_PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  @page {
    size: letter;
    margin: 0.75in 0.85in;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1a1a1a;
    font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
    font-size: 11pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .paper-print-root {
    max-width: 6.5in;
    margin: 0 auto;
  }

  .paper-print-root h1 {
    margin: 0 0 0.35em;
    font-size: 20pt;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: #111;
  }

  .paper-print-root h2, .paper-print-root h3, .paper-print-root h4, .paper-print-root h5 {
    font-family: "Source Serif 4", Georgia, serif;
    color: #111;
    font-weight: 700;
    margin: 1.25em 0 0.5em;
    line-height: 1.3;
  }

  .paper-print-root h2 { font-size: 14pt; }
  .paper-print-root h3 { font-size: 12pt; }
  .paper-print-root h4 { font-size: 11pt; }
  .paper-print-root h5 { font-size: 10.5pt; }

  .paper-kicker {
    margin: 0 0 0.5em;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #666;
  }

  .paper-meta {
    margin: 0 0 1.25em;
    padding-bottom: 1em;
    border-bottom: 1px solid #ccc;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 9pt;
    color: #555;
    line-height: 1.5;
  }

  .paper-abstract {
    margin: 0 0 1.5em;
    padding: 0.75em 1em;
    background: #f8f8f8;
    border-left: 3px solid #333;
  }

  .paper-abstract-label {
    margin: 0 0 0.35em;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #444;
  }

  .paper-abstract p { margin: 0; }

  .paper-section {
    margin-bottom: 1.25em;
    page-break-inside: avoid;
  }

  .paper-section-title {
    margin: 0 0 0.5em;
    font-size: 11pt;
    font-weight: 700;
    color: #111;
    border-bottom: 1px solid #ddd;
    padding-bottom: 0.25em;
  }

  .paper-prose {
    margin: 0;
    text-align: justify;
    hyphens: auto;
    color: #222;
  }

  .paper-prose + .paper-prose { margin-top: 0.75em; }

  ul, ol {
    margin: 0.35em 0 0.75em;
    padding-left: 1.35em;
    color: #222;
  }

  li { margin-bottom: 0.35em; }

  .paper-ref {
    margin-bottom: 0.85em;
    padding-bottom: 0.85em;
    border-bottom: 1px solid #eee;
    page-break-inside: avoid;
  }

  .paper-ref:last-child { border-bottom: none; }

  .paper-ref-title {
    margin: 0 0 0.2em;
    font-weight: 600;
    font-size: 10.5pt;
  }

  .paper-ref-meta {
    margin: 0 0 0.35em;
    font-size: 9pt;
    color: #555;
    font-style: italic;
  }

  .paper-ref-abstract {
    margin: 0;
    font-size: 9.5pt;
    color: #333;
    text-align: justify;
  }

  .paper-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5em 0 1em;
    font-size: 9.5pt;
  }

  .paper-table th,
  .paper-table td {
    border: 1px solid #ccc;
    padding: 0.35em 0.5em;
    text-align: left;
  }

  .paper-table th {
    background: #f0f0f0;
    font-weight: 600;
  }

  .paper-masthead {
    text-align: center;
    margin-bottom: 1.5em;
    padding-bottom: 1em;
    border-bottom: 1px solid #ccc;
  }

  .paper-byline {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 9pt;
    color: #555;
    margin-bottom: 0;
  }

  .paper-byline-sep { opacity: 0.45; }

  .paper-content { color: #1a1a1a; }

  .paper-agent-section {
    margin-bottom: 1.5em;
    page-break-inside: avoid;
  }

  .paper-agent-section + .paper-agent-section {
    padding-top: 1em;
    border-top: 1px solid #e5e5e5;
  }

  .paper-agent-title {
    margin: 0 0 0.5em;
    font-size: 13pt;
    font-weight: 700;
  }

  .paper-agent-body { margin-top: 0.5em; }

  .paper-bullet-list {
    margin: 0.35em 0 0.75em;
    padding-left: 1.35em;
  }

  .paper-summary-text {
    white-space: pre-wrap;
    text-align: left;
    hyphens: none;
  }

  .paper-methodology {
    margin-top: 0.75em;
    padding-top: 0.75em;
    border-top: 1px dashed #ccc;
  }

  .paper-colophon {
    margin-top: 2em;
    padding-top: 0.75em;
    border-top: 1px solid #ccc;
    text-align: center;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 8pt;
    color: #777;
  }

  .paper-stat-value.up { color: #166534; }
  .paper-stat-value.down { color: #991b1b; }

  .paper-inline-meta {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 9pt;
    color: #555;
    margin: 0 0 0.5em;
  }

  .paper-numbered-list {
    margin: 0.35em 0 0.75em;
    padding-left: 1.35em;
  }

  .paper-step-label {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #888;
    margin: 0 0 0.25em;
  }

  pre {
    font-family: ui-monospace, monospace;
    font-size: 8pt;
    background: #f5f5f5;
    border: 1px solid #ddd;
    padding: 0.75em;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .paper-stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5em;
    margin: 0.5em 0 1em;
  }

  .paper-stat {
    padding: 0.5em;
    border: 1px solid #ddd;
    background: #fafafa;
  }

  .paper-stat-label {
    display: block;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 7.5pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
  }

  .paper-stat-value {
    display: block;
    font-size: 11pt;
    font-weight: 700;
    margin-top: 0.15em;
  }

  @media screen {
    body { padding: 1.5rem; background: #e8e8e8; }
    .paper-print-root {
      background: #fff;
      padding: 1.25in 1in;
      box-shadow: 0 2px 24px rgba(0,0,0,0.12);
    }
  }
`;

export function exportPaperPdf(contentHtml: string, title: string) {
  const safeTitle = title.replace(/[<>]/g, "");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <style>${PAPER_PRINT_CSS}</style>
</head>
<body>
  <div class="paper-print-root">${contentHtml}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.src = url;
  document.body.appendChild(frame);

  frame.onload = () => {
    try {
      const win = frame.contentWindow;
      if (!win) return;
      win.document.title = safeTitle;
      win.focus();
      win.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(frame);
        URL.revokeObjectURL(url);
      }, 1000);
    }
  };
}
