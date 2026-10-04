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
  hideCompletedHomework: false,
  showUpcomingDays: true,
  titleAbbreviation: 'automatic',
  collapsedSections: [],
  completedHomework: [],
};

export const DashboardMode = { list: { title: 'Lista', icon: 'list' }, calendar: { title: 'Calendario', icon: 'calendar' } };
export const TitleAbbreviation = { automatic: 'Automatica', always: 'Sempre', never: 'Mai' };
export const AppearanceMode = { system: 'Automatico', light: 'Chiaro', dark: 'Scuro' };

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
