// Impostazioni dell'app, salvate nel browser (`localStorage`).

const KEY = 'bcw.preferences';

const defaults = {
  averageMode: 'allGrades',
  weightedAverage: false,
  targetAverage: 7,
  useLock: false,
  homeworkReminders: false,
  reminderHour: 18,
  dashboardMode: 'list',
  appearance: 'system',
  accentColor: '#a23e2f',
  colorStyle: 'tonalSpot',
  contrast: 'standard',
  corners: 'standard',
  motion: 'expressive',
  roundedText: 'titles',
  hideCompletedHomework: false,
  showUpcomingDays: true,
  titleAbbreviation: 'automatic',
  collapsedSections: [],
  completedHomework: [],
  timetableMode: 'list',
  timetableShowsTests: false,
  newsNotifications: [],
};

export const DashboardMode = { list: { title: 'Lista', icon: 'list' }, calendar: { title: 'Calendario', icon: 'calendar' } };
export const TitleAbbreviation = { automatic: 'Automatica', always: 'Sempre', never: 'Mai' };
export const AppearanceMode = { system: 'Automatico', light: 'Chiaro', dark: 'Scuro' };

/** Tipi di novità che si possono notificare (Impostazioni › Notifiche › Novità). */
export const NewsKind = {
  grades: { id: 'grades', title: 'Nuovi voti', icon: 'graduationCap' },
  notices: { id: 'notices', title: 'Nuove comunicazioni', icon: 'megaphone' },
  notes: { id: 'notes', title: 'Note e annotazioni', icon: 'messageAlert' },
  absences: { id: 'absences', title: 'Assenze e ritardi', icon: 'userClock' },
  agenda: { id: 'agenda', title: 'Nuovi compiti e verifiche', icon: 'checklist' },
};

export class Preferences {
  constructor(onChange) {
    this.onChange = onChange;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* valori predefiniti */ }
    this.values = { ...defaults, ...stored };
    this.completed = new Set(this.values.completedHomework);
    this.collapsed = new Set(this.values.collapsedSections);
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.save();
  }

  save() {
    this.values.completedHomework = [...this.completed];
    this.values.collapsedSections = [...this.collapsed];
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* archiviazione piena */ }
    this.onChange?.();
  }

  get averageMode() { return this.values.averageMode; }
  get weightedAverage() { return this.values.weightedAverage; }
  get targetAverage() { return this.values.targetAverage; }
  get dashboardMode() { return this.values.dashboardMode; }
  get hideCompletedHomework() { return this.values.hideCompletedHomework; }
  get showUpcomingDays() { return this.values.showUpcomingDays; }

  get timetableShowsTests() { return this.values.timetableShowsTests; }

  newsEnabled(kind) { return this.values.newsNotifications.includes(kind); }

  setNews(kind, enabled) {
    const list = this.values.newsNotifications.filter((k) => k !== kind);
    if (enabled) list.push(kind);
    this.set('newsNotifications', list);
  }

  isCollapsed(section) { return this.collapsed.has(section); }

  toggleCollapsed(section) {
    if (this.collapsed.has(section)) this.collapsed.delete(section);
    else this.collapsed.add(section);
    this.save();
  }

  isCompleted(event) { return this.completed.has(event.id); }

  toggleCompleted(event) {
    if (this.completed.has(event.id)) this.completed.delete(event.id);
    else this.completed.add(event.id);
    this.save();
  }

  clearCompleted() {
    this.completed.clear();
    this.save();
  }
}
