// Promemoria: la sera prima di ogni compito o verifica.
//
// Sul web non esistono le notifiche locali programmate di iOS: il piano dei promemoria
// viene ricalcolato a ogni aggiornamento dell'agenda e le notifiche partono mentre BCW è
// aperta (anche in una scheda in secondo piano o come app installata). Per promemoria
// sempre affidabili si può esportare l'agenda nel calendario (.ics) con gli avvisi già impostati.

import { addDays, dayKey, groupBy } from './util.js';

const PLAN_KEY = 'bcw.reminders.plan';
const DELIVERED_KEY = 'bcw.reminders.delivered';

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignorato */ }
}

export const Reminders = {
  get supported() { return 'Notification' in window; },
  get permission() { return this.supported ? Notification.permission : 'denied'; },

  async requestAuthorization() {
    if (!this.supported) return false;
    if (Notification.permission === 'granted') return true;
    try {
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  },

  reschedule(events, hour, enabled, completed) {
    if (!enabled) {
      save(PLAN_KEY, []);
      return;
    }
    const now = new Date();
    const horizon = addDays(now, 14);
    const relevant = events
      .filter((e) => e.kind !== 'event' && e.begin > now && e.begin < horizon && !completed.has(e.id))
      .sort((a, b) => a.begin - b.begin);

    const plan = [];
    const byDay = [...groupBy(relevant, (e) => dayKey(e.day)).entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [key, items] of byDay.slice(0, 40)) {
      const fire = addDays(items[0].day, -1);
      fire.setHours(hour, 0, 0, 0);
      if (fire <= now) continue;
      const tests = items.filter((e) => e.kind === 'test');
      const homework = items.filter((e) => e.kind === 'homework');
      let title;
      if (tests.length) {
        title = tests.length === 1 ? `Domani: verifica di ${tests[0].title.toLowerCase()}` : `Domani: ${tests.length} verifiche`;
      } else {
        title = homework.length === 1 ? 'Compiti per domani' : `${homework.length} compiti per domani`;
      }
      plan.push({
        id: `bcw.agenda.${key}`,
        fireAt: fire.getTime(),
        title,
        body: items.map((e) => `${e.title}: ${e.notes}`).join('\n'),
      });
    }
    save(PLAN_KEY, plan);
    this.check();
  },

  /** Invia i promemoria arrivati all'orario (entro qualche ora, per non disturbare a notte fonda). */
  async check() {
    if (!this.supported || Notification.permission !== 'granted') return;
    const plan = load(PLAN_KEY, []);
    const delivered = new Set(load(DELIVERED_KEY, []));
    const now = Date.now();
    for (const item of plan) {
      if (item.fireAt > now || now - item.fireAt > 4 * 3_600_000 || delivered.has(item.id)) continue;
      delivered.add(item.id);
      save(DELIVERED_KEY, [...delivered].slice(-100));
      await this.show(item.title, item.body, item.id);
    }
  },

  async show(title, body, tag) {
    const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return;
      }
    } catch { /* si prova con l'API diretta */ }
    try { new Notification(title, options); } catch { /* non supportato */ }
  },

  start() {
    this.check();
    setInterval(() => this.check(), 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  },
};
