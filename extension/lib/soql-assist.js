/**
 * SOQL editor helpers: FROM object detection, cursor token, field/object suggestions.
 */

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/;

/**
 * First object after FROM (ignores subqueries for the simple case).
 */
export function extractFromObject(soql) {
  const text = String(soql || "");
  // Prefer outermost FROM … (skip subquery FROM by taking last non-nested if needed)
  const matches = [...text.matchAll(/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/gi)];
  if (!matches.length) return null;
  // Use the first FROM that is not clearly inside a subquery: count '(' before match
  for (const m of matches) {
    const before = text.slice(0, m.index);
    const opens = (before.match(/\(/g) || []).length;
    const closes = (before.match(/\)/g) || []).length;
    if (opens === closes) return m[1];
  }
  return matches[0][1];
}

/**
 * Token under cursor for autocomplete.
 * context: "select" | "from" | null
 */
export function getTokenAtCursor(soql, cursor) {
  const text = String(soql || "");
  const pos = Math.max(0, Math.min(Number(cursor) || 0, text.length));
  const before = text.slice(0, pos);

  let start = pos;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start -= 1;
  let end = pos;
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
  const token = text.slice(start, end);

  const quotes = (before.match(/'/g) || []).length;
  if (quotes % 2 === 1) return { token, start, end, context: null };

  if (/\bfrom\s+[a-z0-9_]*$/i.test(before.slice(0, end))) {
    // Cursor is on / just after FROM object token
    const fromToken = before.slice(0, end).match(/\bfrom\s+([a-z0-9_]*)$/i);
    if (fromToken) {
      const objStart = end - fromToken[1].length;
      return {
        token: text.slice(objStart, end),
        start: objStart,
        end,
        context: "from"
      };
    }
  }

  const selectIdx = before.toLowerCase().lastIndexOf("select");
  if (selectIdx < 0) return { token, start, end, context: null };

  const afterSelect = before.slice(selectIdx + 6);
  if (/\b(from|where|limit|order|group|having|with|offset)\b/i.test(afterSelect)) {
    return { token, start, end, context: null };
  }

  // Field list: after SELECT or a comma
  const head = before.slice(0, start);
  if (!/\bselect\b/i.test(head)) return { token, start, end, context: null };
  if (!/(?:select|,)\s*$/i.test(head) && token.length === 0) {
    return { token, start, end, context: null };
  }
  return { token, start, end, context: "select" };
}

export function filterApiNames(items, prefix, limit = 40) {
  const q = String(prefix || "").trim().toLowerCase();
  const list = Array.isArray(items) ? items : [];
  const scored = list
    .map((item) => {
      const name = typeof item === "string" ? item : item.name;
      const label = typeof item === "string" ? "" : item.label || "";
      const type = typeof item === "string" ? "" : item.type || "";
      const nl = name.toLowerCase();
      const ll = label.toLowerCase();
      if (q && !nl.includes(q) && !ll.includes(q)) return null;
      let score = 100;
      if (q) {
        if (nl.startsWith(q)) score = 0;
        else if (nl.includes(`.${q}`) || nl.includes(q)) score = 10;
        else if (ll.startsWith(q)) score = 20;
        else score = 40;
      }
      score += Math.min(nl.length, 40) / 100;
      return { name, label, type, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}

/**
 * Replace [start,end) with value. For select fields, append ", " when another
 * field can follow; do not insert a comma immediately before FROM/WHERE/etc.
 */
export function applySuggestion(text, start, end, value, { appendComma = false } = {}) {
  const raw = String(text || "");
  const s = Math.max(0, start | 0);
  const e = Math.max(s, end | 0);
  let insert = String(value || "");
  if (appendComma) {
    const after = raw.slice(e);
    if (/^\s*,/.test(after)) {
      /* comma already ahead */
    } else if (/^\s*(from|where|limit|order|group|having|with|offset)\b/i.test(after)) {
      /* last field before next clause — no trailing comma */
      if (!/^\s/.test(after)) insert = `${insert} `;
    } else {
      insert = `${insert}, `;
    }
  }
  const next = raw.slice(0, s) + insert + raw.slice(e);
  const cursor = s + insert.length;
  return { text: next, cursor };
}

export function isValidSObjectName(name) {
  return IDENT.test(String(name || "")) && /^[A-Za-z][A-Za-z0-9_]*$/.test(String(name || ""));
}
