// Sezioni dell'app: le destinazioni principali (Dashboard, Orario, Voti, Tu) più le pagine che
// su schermi stretti stanno dentro "Tu", con titolo, icona, colore e scorciatoia (la barra di
// navigazione espansa degli schermi larghi). La ricerca non è una sezione: è la barra in cima
// alla Dashboard sui telefoni e il campo nella barra in alto sugli schermi larghi.

export const sections = {
  dashboard: { title: 'Dashboard', icon: 'dashboard', iconSelected: 'dashboardFill', tint: 'var(--primary)', shortcut: '1' },
  timetable: { title: 'Orario', icon: 'timetable', iconSelected: 'timetableFill', tint: 'var(--primary)', shortcut: '2' },
  grades: { title: 'Voti', icon: 'grades', iconSelected: 'gradesFill', tint: 'var(--primary)', shortcut: '3' },
  you: { title: 'Tu', icon: 'you', iconSelected: 'youFill', tint: 'var(--primary)', shortcut: '4' },
  search: { title: 'Cerca', icon: 'search', tint: 'var(--primary)' },
  noticeboard: { title: 'Bacheca', icon: 'megaphone', tint: 'var(--primary)', shortcut: '5' },
  notes: { title: 'Note e annotazioni', icon: 'messageAlert', tint: 'var(--poor)', shortcut: '6' },
  reports: { title: 'Scrutini e pagelle', icon: 'fileSearch', tint: 'var(--neutral)' },
  previous: { title: 'Anni precedenti', icon: 'history', tint: 'var(--on-surface-variant)' },
  absences: { title: 'Assenze e ritardi', icon: 'userClock', tint: 'var(--fair)', shortcut: '7' },
  didactics: { title: 'Materiale didattico', icon: 'folder', tint: 'var(--subject-3)', shortcut: '9' },
  lessons: { title: 'Registro delle lezioni', icon: 'bookText', tint: 'var(--subject-1)' },
  agenda: { title: 'Agenda completa', icon: 'checklist', tint: 'var(--subject-5)', shortcut: '8' },
  subjects: { title: 'Materie e docenti', icon: 'users', tint: 'var(--subject-2)' },
  schoolbooks: { title: 'Libri di testo', icon: 'library', tint: 'var(--subject-4)' },
  calendar: { title: 'Calendario scolastico', icon: 'calendarClock', tint: 'var(--subject-7)' },
};

/** Solo per il menu di "Tu" su schermi stretti (su quelli larghi si apre dal menu dell'account). */
export const extraRows = {
  settings: { title: 'Impostazioni', icon: 'gear', tint: 'var(--on-surface-variant)' },
};

export const sectionGroups = [
  { title: null, sections: ['dashboard', 'timetable', 'grades', 'you'] },
  { title: 'Comunicazioni', sections: ['noticeboard', 'notes'] },
  { title: 'Valutazioni', sections: ['reports', 'previous'] },
  { title: 'Frequenza', sections: ['absences'] },
  { title: 'Didattica', sections: ['didactics', 'lessons', 'agenda', 'subjects', 'schoolbooks', 'calendar'] },
];

export function sectionSubtitle(model, key) {
  switch (key) {
    case 'noticeboard': {
      const unread = model.unreadNoticesCount;
      return unread === 0 ? 'Tutto letto' : (unread === 1 ? '1 comunicazione da leggere' : `${unread} comunicazioni da leggere`);
    }
    case 'notes': return model.notes.length ? `${model.notes.length} in totale` : 'Nessuna nota';
    case 'reports': return 'Documenti di valutazione';
    case 'previous': return 'Pagelle e archivio degli anni passati';
    case 'absences': {
      const pending = model.unjustifiedAbsences.length;
      return pending === 0 ? 'Tutto giustificato' : `${pending} da giustificare`;
    }
    case 'didactics': return 'File condivisi dai docenti';
    case 'lessons': return 'Argomenti svolti in classe';
    case 'agenda': return 'Tutti i compiti e le verifiche';
    case 'subjects': return `${model.subjects.length} materie`;
    case 'schoolbooks': return "Adozioni dell'anno in corso";
    case 'calendar': return 'Vacanze e giorni di lezione';
    case 'settings': return 'Medie, orario, promemoria, backup';
    default: return '';
  }
}

export function sectionBadge(model, key) {
  switch (key) {
    case 'noticeboard': return model.unreadNoticesCount;
    case 'notes': return model.unreadNotesCount;
    case 'absences': return model.unjustifiedAbsences.length;
    default: return 0;
  }
}
