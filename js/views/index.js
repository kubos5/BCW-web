// Elenco delle pagine e azioni condivise tra più pagine.

import { dashboard } from './dashboard.js';
import { grades } from './grades.js';
import { you } from './you.js';
import { search } from './search.js';
import { noticeboard } from './noticeboard.js';
import {
  notes, absences, agenda, lessons, didactics, reports, previous, subjects, schoolbooks, calendar,
} from './sections.js';
import { settings, account } from './settings.js';
import { addAccountSheet } from './login.js';
import { addToCalendar } from '../calendar-export.js';
import { fmt } from '../util.js';

export { sections, sectionGroups, sectionBadge } from './sections-meta.js';

export const routes = {
  dashboard, grades, you, search, noticeboard, notes, reports, previous, absences, didactics, lessons, agenda,
  subjects, schoolbooks, calendar, settings, account,
};

function findEvent(ctx, el) {
  return ctx.model.agenda.find((e) => String(e.id) === el.dataset.id);
}

async function share(ctx, text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  await copy(ctx, text, 'Testo copiato negli appunti.');
}

async function copy(ctx, text, message = 'Copiato negli appunti.') {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast(message);
  } catch {
    ctx.toast('Impossibile copiare il testo.', 'alertTriangle');
  }
}

export const commonActions = {
  'agenda-toggle': (ctx, el) => {
    const event = findEvent(ctx, el);
    if (!event) return;
    ctx.prefs.toggleCompleted(event);
    ctx.model.rescheduleReminders();
    if (ctx.prefs.isCompleted(event)) navigator.vibrate?.(8);
  },
  'agenda-expand': (ctx, el) => {
    const expanded = ctx.state('expanded', () => new Set());
    const key = `${el.dataset.scope ?? ''}${el.dataset.id}`;
    if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
  },
  'context-agenda': (ctx, el, event) => {
    const item = findEvent(ctx, el);
    if (!item) return;
    const done = ctx.prefs.isCompleted(item);
    const items = [];
    if (item.kind !== 'event') {
      items.push({
        label: done ? 'Segna come da fare' : 'Segna come fatto', icon: done ? 'arrowUturn' : 'checkCircle',
        run: () => { ctx.prefs.toggleCompleted(item); ctx.model.rescheduleReminders(); },
      });
    }
    items.push({ label: 'Aggiungi al Calendario', icon: 'calendarPlus', run: () => addToCalendar(item) });
    items.push({ label: 'Condividi', icon: 'share', run: () => share(ctx, `${item.title} – ${fmt.longDay(item.begin)}\n${item.notes}`) });
    items.push({ label: 'Copia testo', icon: 'copy', run: () => copy(ctx, item.notes) });
    ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, items, { align: 'start' });
  },
  'context-account': (ctx, el, event) => {
    ctx.openMenu({ x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, [
      { label: 'Rimuovi', icon: 'trash', destructive: true, run: () => ctx.run('account-remove', el) },
    ], { align: 'start' });
  },
  'add-account': (ctx) => ctx.openSheet(addAccountSheet()),
  'sign-out': (ctx) => {
    const model = ctx.model;
    ctx.confirm({
      title: model.isDemo ? 'Vuoi uscire dalla demo?' : `Vuoi uscire da ${model.displayName}?`,
      message: model.isDemo ? 'Stai usando la modalità demo.' : 'Le credenziali di questo account verranno rimosse da questo browser.',
      confirmLabel: 'Esci',
      destructive: true,
      onConfirm: () => model.signOut(),
    });
  },
};
