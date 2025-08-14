// Utilities to prepare AI responses for Discord rendering

'use strict';

/**
 * Convert Markdown-style tables to bullet lists for Discord.
 * Skips conversion inside existing code fences.
 */
function convertMarkdownTablesToAsciiBlocks(input) {
  if (!input || typeof input !== 'string') return input;

  const lines = input.split('\n');
  const output = [];

  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Track fenced code blocks to avoid altering inside
    if (/^```/.test(line)) {
      inFence = !inFence;
      output.push(line);
      i += 1;
      continue;
    }

    if (!inFence && line.includes('|')) {
      // Potential table start. Look ahead for header separator row like | --- | --- |
      const j = i + 1;
      const headerSepRe = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
      if (j < lines.length && headerSepRe.test(lines[j])) {
        // Collect contiguous pipe lines as table block
        const tableLines = [line];
        let k = j;
        while (k < lines.length && lines[k].includes('|')) {
          tableLines.push(lines[k]);
          k += 1;
        }

        const bullets = renderPipeTableToBullets(tableLines);
        output.push(...bullets.split('\n'));

        i = k;
        continue;
      }
    }

    output.push(line);
    i += 1;
  }

  return output.join('\n');
}

function renderPipeTableToBullets(tableLines) {
  // Parse rows and cells
  const rows = tableLines
    .filter(Boolean)
    .map((ln) => ln.trim())
    .map((ln) => {
      // Remove leading/trailing pipe if present, then split
      const trimmed = ln.replace(/^\|/, '').replace(/\|$/, '');
      return trimmed.split('|').map((c) => c.trim());
    });

  if (rows.length === 0) return tableLines.join('\n');

  const headers = rows[0] || [];
  const items = rows.slice(2); // skip separator row

  const out = [];
  for (const row of items) {
    if (row.every((c) => !c)) continue;
    out.push(`- ${row[0] ?? ''}`.trim());
    for (let i = 1; i < row.length && i < headers.length; i += 1) {
      const key = headers[i] || `Field ${i + 1}`;
      const val = row[i] || '';
      if (val) out.push(`  - ${key}: ${val}`);
    }
  }
  if (out.length === 0) {
    // Fallback to join rows if parsing failed
    return tableLines.join('\n');
  }
  return out.join('\n');
}

/**
 * Split a message into chunks not exceeding Discord's 2000 char limit.
 * Preserves fenced code blocks across chunk boundaries.
 */
function splitMessagePreservingCodeBlocks(content, maxLen = 1990) {
  if (!content || content.length <= maxLen) return [content];

  const segments = [];
  let idx = 0;
  const fenceRe = /```[\s\S]*?```/g;
  let match;
  let lastIndex = 0;
  while ((match = fenceRe.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  const chunks = [];
  for (const seg of segments) {
    if (seg.type === 'text') {
      const parts = seg.value.split(/\n\n/);
      for (const part of parts) {
        if (!part) continue;
        if (part.length <= maxLen) {
          chunks.push(part);
        } else {
          // Fallback: split by lines
          const lines = part.split('\n');
          let buf = '';
          for (const line of lines) {
            if ((buf + line + '\n').length > maxLen) {
              if (buf) chunks.push(buf);
              buf = '';
            }
            if (line.length > maxLen) {
              // Very long line: hard slice
              for (let i = 0; i < line.length; i += maxLen) {
                chunks.push(line.slice(i, i + maxLen));
              }
            } else {
              buf += (buf ? '\n' : '') + line;
            }
          }
          if (buf) chunks.push(buf);
        }
      }
    } else {
      // code fence segment; if too long, split inside while preserving fences
      if (seg.value.length <= maxLen) {
        chunks.push(seg.value);
      } else {
        const fenceHeaderMatch = seg.value.match(/^```[^\n]*\n/);
        const fenceHeader = fenceHeaderMatch ? fenceHeaderMatch[0] : '```\n';
        const inner = seg.value.replace(/^```[^\n]*\n/, '').replace(/```\s*$/, '');
        for (let i = 0; i < inner.length; i += maxLen - fenceHeader.length - 4) { // 4 ~= closing ```\n
          const slice = inner.slice(i, i + (maxLen - fenceHeader.length - 4));
          chunks.push(`${fenceHeader}${slice}\n```);
        }
      }
    }
  }

  // Merge small adjacent chunks where possible
  const merged = [];
  for (const ch of chunks) {
    if (merged.length === 0) {
      merged.push(ch);
      continue;
    }
    const last = merged[merged.length - 1];
    if ((last + '\n\n' + ch).length <= maxLen) {
      merged[merged.length - 1] = last + '\n\n' + ch;
    } else {
      merged.push(ch);
    }
  }
  return merged;
}

/**
 * High-level formatter: make AI output Discord-safe and readable.
 */
function formatForDiscord(raw) {
  const noTables = convertMarkdownTablesToAsciiBlocks(raw);
  return noTables;
}

module.exports = {
  formatForDiscord,
  convertMarkdownTablesToAsciiBlocks,
  splitMessagePreservingCodeBlocks,
};


