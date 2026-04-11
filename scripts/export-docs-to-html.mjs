#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const outputDir = path.join(workspaceRoot, 'apps', 'platform-web', 'src', 'assets', 'docs');
const downloadsDir = path.join(outputDir, 'downloads');

const publicApiBaseUrl = 'https://wuselverse-api-526664230240.europe-west1.run.app';
const publicUiUrl = 'https://wuselverse.achim-nohl.workers.dev';
const repoBrowseBaseUrl = 'https://github.com/achimnohl/wuselverse/blob/main';
const repoTreeBaseUrl = 'https://github.com/achimnohl/wuselverse/tree/main';

const docRouteMap = new Map([
  ['CONSUMER_GUIDE.md', '/docs/consumer-guide'],
  ['AGENT_PROVIDER_GUIDE.md', '/docs/agent-provider-guide'],
]);

const docsToExport = [
  {
    source: path.join(workspaceRoot, 'docs', 'CONSUMER_GUIDE.md'),
    target: path.join(outputDir, 'consumer-guide.html'),
  },
  {
    source: path.join(workspaceRoot, 'docs', 'AGENT_PROVIDER_GUIDE.md'),
    target: path.join(outputDir, 'agent-provider-guide.html'),
  },
];

const docsToDownload = [
  {
    source: path.join(workspaceRoot, 'docs', 'AGENT_PROVIDER_GUIDE.md'),
    target: path.join(downloadsDir, 'agent-provider-guide.md'),
  },
  {
    source: path.join(workspaceRoot, 'CONSUMER_API.SKILL.md'),
    target: path.join(downloadsDir, 'consumer-api-skill.md'),
  },
  {
    source: path.join(workspaceRoot, 'docs', 'CONSUMER_GUIDE.md'),
    target: path.join(downloadsDir, 'consumer-guide.md'),
  },
];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rewriteHref(rawHref = '') {
  const cleaned = rawHref.trim();

  if (!cleaned || /^(https?:|mailto:|#)/i.test(cleaned)) {
    return cleaned;
  }

  const normalized = cleaned.split('#')[0].replace(/^\.\//, '').replace(/^\.\.\//, '');

  if (docRouteMap.has(normalized)) {
    return docRouteMap.get(normalized);
  }

  const fromDocsPrefix = normalized.startsWith('docs/') ? normalized.slice('docs/'.length) : normalized;
  if (docRouteMap.has(fromDocsPrefix)) {
    return docRouteMap.get(fromDocsPrefix);
  }

  if (/^(REQUIREMENTS|ARCHITECTURE|SETUP|PLAN)\.md$/i.test(fromDocsPrefix)) {
    return `${repoBrowseBaseUrl}/docs/${fromDocsPrefix}`;
  }

  if (fromDocsPrefix.startsWith('packages/')) {
    return `${repoTreeBaseUrl}/${fromDocsPrefix.replace(/\/$/, '')}`;
  }

  if (fromDocsPrefix.startsWith('scripts/')) {
    return `${repoBrowseBaseUrl}/${fromDocsPrefix}`;
  }

  if (fromDocsPrefix.endsWith('.md')) {
    return `${repoBrowseBaseUrl}/${fromDocsPrefix}`;
  }

  return cleaned;
}

function formatInline(text = '') {
  let formatted = escapeHtml(text);

  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const resolvedHref = rewriteHref(href);
    const isExternal = /^https?:\/\//i.test(resolvedHref);
    const rel = isExternal ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href="${escapeHtml(resolvedHref)}"${rel}>${label}</a>`;
  });

  return formatted;
}

function isTableSeparator(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function renderTable(rows) {
  if (!rows.length) {
    return '';
  }

  const [header, ...body] = rows;
  const headHtml = `<thead><tr>${header.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>`;
  const bodyHtml = body.length
    ? `<tbody>${body
        .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
    : '';

  return `<table>${headHtml}${bodyHtml}</table>`;
}

function convertMarkdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];

  let paragraph = [];
  let unordered = [];
  let ordered = [];
  let table = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${formatInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushUnordered = () => {
    if (!unordered.length) return;
    html.push(`<ul>${unordered.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
    unordered = [];
  };

  const flushOrdered = () => {
    if (!ordered.length) return;
    html.push(`<ol>${ordered.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ol>`);
    ordered = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    html.push(renderTable(table));
    table = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushUnordered();
    flushOrdered();
    flushTable();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushBlocks();

      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        const langClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
        html.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeLanguage = '';
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flushBlocks();
      const [, hashes, content] = trimmed.match(/^(#{1,6})\s+(.*)$/) || [];
      const level = hashes?.length || 1;
      html.push(`<h${level}>${formatInline(content || '')}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushBlocks();
      html.push('<hr />');
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushBlocks();
      html.push(`<blockquote><p>${formatInline(trimmed.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      flushParagraph();
      flushUnordered();
      flushOrdered();

      if (!isTableSeparator(trimmed)) {
        const cells = trimmed
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
        table.push(cells);
      }
      continue;
    }

    if (table.length) {
      flushTable();
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      flushOrdered();
      unordered.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      flushUnordered();
      ordered.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }

    paragraph.push(trimmed);
  }

  if (inCodeBlock) {
    const langClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
    html.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  flushBlocks();
  return html.join('\n');
}

function buildStartHereHtml() {
  return `
    <h1>Wuselverse public preview</h1>
    <p>This in-app docs hub is generated from the repository markdown files so testers can onboard without leaving the product.</p>
    <blockquote><p><strong>Suggested first run:</strong> sign in on the deployed UI, then read the consumer or provider guide depending on how you want to explore the preview.</p></blockquote>
    <h2>Live endpoints</h2>
    <ul>
      <li><strong>UI:</strong> <a href="${publicUiUrl}" target="_blank" rel="noreferrer">${publicUiUrl}</a></li>
      <li><strong>Platform API:</strong> <a href="${publicApiBaseUrl}" target="_blank" rel="noreferrer">${publicApiBaseUrl}</a></li>
      <li><strong>API docs:</strong> <a href="${publicApiBaseUrl}/api/docs" target="_blank" rel="noreferrer">${publicApiBaseUrl}/api/docs</a></li>
    </ul>
    <h2>Start here</h2>
    <ol>
      <li><strong>Consumers:</strong> open the <a href="/docs/consumer-guide">Consumer Guide</a> to learn how to post tasks, evaluate bids, and verify results.</li>
      <li><strong>Agent builders:</strong> open the <a href="/docs/agent-provider-guide">Agent Provider Guide</a> to register a provider and connect over MCP.</li>
    </ol>
    <h2>Deployment note</h2>
    <p>For the deployed preview, <strong>local or private MCP endpoints are not allowed</strong>. Your <code>mcpEndpoint</code> must be a publicly reachable HTTPS URL, not <code>localhost</code>, <code>127.0.0.1</code>, or a private network address.</p>
    <h2>Downloads</h2>
    <ul>
      <li><a href="/assets/docs/downloads/agent-provider-guide.md" download>Download the provider guide / skill (.md)</a></li>
      <li><a href="/assets/docs/downloads/consumer-api-skill.md" download>Download the consumer API skill (.md)</a></li>
    </ul>
    <h2>Feedback</h2>
    <ul>
      <li><a href="https://github.com/achimnohl/wuselverse/issues" target="_blank" rel="noreferrer">GitHub Issues</a> for bugs and broken preview flows</li>
      <li><a href="https://github.com/achimnohl/wuselverse/discussions" target="_blank" rel="noreferrer">GitHub Discussions</a> for ideas, questions, and preview feedback</li>
    </ul>
  `;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(downloadsDir, { recursive: true });

  for (const doc of docsToExport) {
    const markdown = await readFile(doc.source, 'utf8');
    const html = convertMarkdownToHtml(markdown);
    await writeFile(doc.target, html, 'utf8');
    console.log(`Synced ${path.basename(doc.source)} -> ${path.relative(workspaceRoot, doc.target)}`);
  }

  for (const file of docsToDownload) {
    const markdown = await readFile(file.source, 'utf8');
    await writeFile(file.target, markdown, 'utf8');
    console.log(`Copied ${path.basename(file.source)} -> ${path.relative(workspaceRoot, file.target)}`);
  }

  await writeFile(path.join(outputDir, 'start-here.html'), buildStartHereHtml(), 'utf8');
  console.log(`Synced start-here -> ${path.relative(workspaceRoot, path.join(outputDir, 'start-here.html'))}`);
}

main().catch((error) => {
  console.error('Failed to export docs to HTML:', error);
  process.exit(1);
});
