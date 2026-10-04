// Aggiornamento del DOM per confronto ("morphing"): le viste producono HTML e qui viene
// applicato solo ciò che è cambiato. Così restano intatti il fuoco, la posizione di
// scorrimento e le transizioni CSS, come con le viste dichiarative di SwiftUI.

const keyOf = (node) => (node.nodeType === 1 ? node.getAttribute('data-key') : null);

function sameType(a, b) {
  return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);
}

export function morph(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  morphChildren(target, template.content);
}

function morphChildren(fromParent, toParent) {
  const keyed = new Map();
  for (let c = fromParent.firstChild; c; c = c.nextSibling) {
    const key = keyOf(c);
    if (key != null) keyed.set(key, c);
  }
  let cursor = fromParent.firstChild;
  let next = toParent.firstChild;
  while (next) {
    const following = next.nextSibling;
    const key = keyOf(next);
    let match = null;
    if (key != null) {
      match = keyed.get(key) ?? null;
      if (match && !sameType(match, next)) match = null;
      if (match) keyed.delete(key);
    } else if (cursor && keyOf(cursor) == null && sameType(cursor, next)) {
      match = cursor;
    }
    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else fromParent.insertBefore(match, cursor);
      morphNode(match, next);
    } else {
      fromParent.insertBefore(next, cursor);
    }
    next = following;
  }
  while (cursor) {
    const following = cursor.nextSibling;
    fromParent.removeChild(cursor);
    cursor = following;
  }
}

function morphNode(from, to) {
  if (from.nodeType !== 1) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  syncAttributes(from, to);
  const tag = from.tagName;
  const focused = document.activeElement === from;
  if (tag === 'INPUT') {
    if (from.type === 'checkbox' || from.type === 'radio') {
      from.checked = to.hasAttribute('checked');
    } else if (!focused) {
      const value = to.getAttribute('value') ?? '';
      if (from.value !== value) from.value = value;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    if (!focused && from.value !== to.value) from.value = to.value;
    return;
  }
  // Contenuto disegnato a parte (es. i grafici): non va toccato.
  if (from.hasAttribute('data-morph-skip')) return;
  morphChildren(from, to);
  if (tag === 'SELECT') {
    const selected = to.querySelector('option[selected]');
    if (selected) from.value = selected.value;
  }
}

function syncAttributes(from, to) {
  for (const { name } of [...from.attributes]) {
    // `data-signature` è impostato dai grafici dopo il disegno.
    if (!to.hasAttribute(name) && name !== 'data-signature') from.removeAttribute(name);
  }
  for (const { name, value } of [...to.attributes]) {
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
}

/** Attributi `data-*` per le azioni delegate. */
export function data(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');
}
