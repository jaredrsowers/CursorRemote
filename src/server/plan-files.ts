import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import type { PlanTodo } from './types.js';

export interface PlanFileData {
  todos: PlanTodo[];
  body: string;
}

export function readPlanFile(label: string): PlanFileData | null {
  const planPath = resolve(homedir(), '.cursor', 'plans', label);
  try {
    const raw = readFileSync(planPath, 'utf-8');
    return parsePlanMd(raw);
  } catch {
    return null;
  }
}

export function parsePlanFrontmatter(raw: string): { name?: string; overview?: string } {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return {};
  const fm = fmMatch[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const overviewMatch = fm.match(/^overview:\s*(.+)$/m);
  let overview = overviewMatch?.[1]?.trim();
  if (overview?.startsWith('"') && overview.endsWith('"')) overview = overview.slice(1, -1);
  if (overview?.startsWith("'") && overview.endsWith("'")) overview = overview.slice(1, -1);
  return { name, overview };
}

export function resolvePlanFile(opts: {
  label?: string;
  title?: string;
  description?: string;
}): { label: string; data: PlanFileData } | null {
  if (opts.label) {
    const data = readPlanFile(opts.label);
    if (data) return { label: opts.label, data };
  }

  const plansDir = resolve(homedir(), '.cursor', 'plans');
  let files: string[] = [];
  try {
    files = readdirSync(plansDir).filter((file) => file.endsWith('.plan.md'));
  } catch {
    return null;
  }

  const title = (opts.title || '').trim().toLowerCase();
  const description = (opts.description || '').trim().toLowerCase().slice(0, 240);
  if (!title && !description) return null;

  let best: { label: string; data: PlanFileData; score: number } | null = null;
  for (const file of files) {
    const planPath = resolve(plansDir, file);
    let raw: string;
    try {
      raw = readFileSync(planPath, 'utf-8');
    } catch {
      continue;
    }
    const meta = parsePlanFrontmatter(raw);
    const data = parsePlanMd(raw);
    let score = 0;
    const metaName = (meta.name || '').trim().toLowerCase();
    const metaOverview = (meta.overview || '').trim().toLowerCase();
    if (title && metaName && title === metaName) score += 12;
    if (description && metaOverview) {
      if (metaOverview === description) score += 24;
      else if (metaOverview.startsWith(description.slice(0, 80)) || description.startsWith(metaOverview.slice(0, 80)))
        score += 18;
      else if (metaOverview.includes(description.slice(0, 60)) || description.includes(metaOverview.slice(0, 60)))
        score += 10;
    }
    if (score > 0 && (!best || score > best.score)) best = { label: file, data, score };
  }

  return best;
}

export function parsePlanMd(raw: string): PlanFileData {
  const todos: PlanTodo[] = [];
  let body = raw;

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    body = raw.slice(fmMatch[0].length);
    const fm = fmMatch[1];
    const todoRe = /- id:\s*\S+\n\s+content:\s*["']?(.*?)["']?\s*\n\s+status:\s*(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = todoRe.exec(fm)) !== null) {
      const status = m[2] as PlanTodo['status'];
      todos.push({ text: m[1], status });
    }
  }

  return { todos, body: body.trim() };
}

export function markdownToWebHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    if (inCodeBlock) {
      if (line.startsWith('```')) {
        const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
        out.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.startsWith('```')) {
      inCodeBlock = true;
      codeLang = line.slice(3).trim();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      out.push(`<h${level}>${inlineMarkdown(line.slice(level).trim())}</h${level}>`);
      continue;
    }

    if (line.match(/^\s*[-*]\s/)) {
      const content = line.replace(/^\s*[-*]\s+/, '');
      out.push(`<li>${inlineMarkdown(content)}</li>`);
      continue;
    }

    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (olMatch) {
      out.push(`<li>${inlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.match(/^\|[\s:-]+\|$/)) continue;
      const cells = line.split('|').slice(1, -1).map((c) => `<td>${inlineMarkdown(c.trim())}</td>`);
      out.push(`<table><tbody><tr>${cells.join('')}</tr></tbody></table>`);
      continue;
    }

    if (line.trim() === '') {
      out.push('');
      continue;
    }

    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inCodeBlock && codeLines.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return out.join('\n').replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
}

function inlineMarkdown(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  result = result.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<em>$1</em>');
  result = result.replace(/`([^`]+?)`/g, '<code>$1</code>');
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    if (href.startsWith('http')) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
    return `<code>${escapeHtml(label)}</code>`;
  });
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
