// Sezioni dell'app: le schede di iOS più le pagine che su iPhone stanno dentro "Tu",
// con titolo, icona, colore e scorciatoia (come la barra laterale di macOS).

export const sections = {
  dashboard: { title: 'Dashboard', icon: 'timeline', tint: 'var(--accent)', shortcut: '1' },
  grades: { title: 'Voti', icon: 'chart', tint: 'var(--accent)', shortcut: '2' },
  you: { title: 'Tu', icon: 'userCircle', tint: 'var(--accent)', shortcut: '3' },
  search: { title: 'Cerca', icon: 'search', tint: 'var(--accent)', shortcut: '4' },
  noticeboard: { title: 'Bacheca', icon: 'megaphone', tint: 'var(--accent)', shortcut: '5' },
  notes: { title: 'Note e annotazioni', icon: 'messageAlert', tint: 'var(--poor)' },
  reports: { title: 'Scrutini e pagelle', icon: 'fileSearch', tint: 'var(--neutral)' },
  previous: { title: 'Anni precedenti', icon: 'history', tint: 'var(--ink2)' },
  absences: { title: 'Assenze e ritardi', icon: 'userClock', tint: 'var(--fair)', shortcut: '6' },
  didactics: { title: 'Materiale didattico', icon: 'folder', tint: 'var(--subject-3)', shortcut: '8' },
  lessons: { title: 'Registro delle lezioni', icon: 'bookText', tint: 'var(--subject-1)', shortcut: '9' },
  agenda: { title: 'Agenda completa', icon: 'checklist', tint: 'var(--subject-5)', shortcut: '7' },
  subjects: { title: 'Materie e docenti', icon: 'users', tint: 'var(--subject-2)' },
  schoolbooks: { title: 'Libri di testo', icon: 'library', tint: 'var(--subject-4)' },
  calendar: { title: 'Calendario scolastico', icon: 'calendarClock', tint: 'var(--subject-7)' },
};

/** Solo per il menu di "Tu" su iPhone (su schermi larghi si apre dal menu dell'account). */
export const extraRows = {
  settings: { title: 'Impostazioni', icon: 'gear', tint: 'var(--ink2)' },
};

export const sectionGroups = [
  { title: null, sections: ['dashboard', 'grades', 'you', 'search'] },
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
    case 'settings': return 'Medie, promemoria, sicurezza';
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
