// Server finto che risponde come l'API di Classeviva con dati plausibili e
// generati in modo deterministico rispetto alla data di oggi.
// Usato dalla modalità "Prova la demo": funziona interamente nel browser.

import {
  startOfDay, addDays, isWeekend, dayKey, schoolYear, isoLocal, parseAPIDate, SeededRandom, sleep,
} from './util.js';
import { makePDF } from './pdf.js';

const subjects = [
  { id: 101, name: 'ITALIANO', teacher: 'BIANCHI LAURA',
    topics: ['Dante, Inferno: canto V', 'Il Dolce Stil Novo', 'Analisi del testo: Petrarca', 'Boccaccio, Decameron', 'Tipologia B: testo argomentativo'] },
  { id: 102, name: 'LINGUA E CULTURA LATINA', teacher: 'BIANCHI LAURA',
    topics: ['Cicerone, De Officiis', 'Sintassi dei casi: il genitivo', 'Lucrezio, De rerum natura'] },
  { id: 103, name: 'MATEMATICA', teacher: 'ROSSI GIORGIO',
    topics: ['Funzioni esponenziali', 'Logaritmi e proprietà', 'Equazioni logaritmiche', 'Goniometria: archi associati', 'Esercitazione in vista della verifica'] },
  { id: 104, name: 'FISICA', teacher: 'ROSSI GIORGIO',
    topics: ['Termodinamica: primo principio', 'Trasformazioni adiabatiche', 'Macchine termiche'] },
  { id: 105, name: 'LINGUA E CULTURA STRANIERA (INGLESE)', teacher: 'SMITH JANE',
    topics: ['The Romantic Age', 'William Wordsworth', 'Past perfect continuous', 'Listening practice'] },
  { id: 106, name: 'STORIA', teacher: 'VERDI ANDREA',
    topics: ["La guerra dei Trent'anni", "L'assolutismo di Luigi XIV", 'La rivoluzione inglese'] },
  { id: 107, name: 'FILOSOFIA', teacher: 'VERDI ANDREA',
    topics: ['Cartesio: il metodo', 'Spinoza', 'Leibniz e le monadi'] },
  { id: 108, name: 'SCIENZE NATURALI', teacher: 'GALLI FRANCESCA',
    topics: ['Il DNA e la replicazione', 'Sintesi proteica', 'Equilibrio chimico'] },
  { id: 109, name: "DISEGNO E STORIA DELL'ARTE", teacher: 'MORETTI PAOLO',
    topics: ['Il Rinascimento a Firenze', 'Brunelleschi', 'Proiezioni assonometriche'] },
  { id: 110, name: 'SCIENZE MOTORIE E SPORTIVE', teacher: 'CONTI MARCO',
    topics: ['Pallavolo: fondamentali', 'Test di resistenza', 'Atletica: salto in lungo'] },
  { id: 111, name: 'RELIGIONE CATTOLICA', teacher: 'DE LUCA ANNA',
    topics: ['Etica e responsabilità', 'Il dialogo interreligioso'] },
];

/** Orario settimanale (lun–ven), indici in `subjects`. */
const timetable = [
  [2, 2, 0, 4, 5, 9],
  [0, 1, 3, 7, 6, 8],
  [2, 4, 0, 0, 7, 10],
  [3, 2, 5, 6, 1, 8],
  [4, 0, 2, 7, 9, 6],
];

const demoNotices = [
  ['Circ. 45 – Uscita didattica al Museo della Scienza', 'Circolare', true, false],
  ['Circ. 41 – Elezioni dei rappresentanti di classe', 'Circolare', false, false],
  ['Sciopero del comparto scuola', 'Comunicazione', false, true],
  ['Circ. 38 – Corsi di recupero pomeridiani', 'Circolare', false, false],
  ['Orario definitivo delle lezioni', 'Avviso', false, false],
  ['Autorizzazione uscita anticipata', 'Modulistica', true, false],
];

const row = (day) => timetable[((day.getDay() + 6) % 7) % 5];
const dayIndex = (day) => Math.floor(day.getTime() / 86_400_000);
const minuteIndex = (day) => Math.floor(day.getTime() / 60_000);

export class DemoTransport {
  /** Spostamento in anni (0 = anno corrente, -1 = anno precedente). */
  constructor(yearOffset = 0) {
    this.yearOffset = yearOffset;
    // Le adesioni e le firme della demo restano finché la pagina è aperta.
    this.replies = new Map();
  }

  get referenceDate() {
    const d = startOfDay(new Date());
    d.setFullYear(d.getFullYear() + this.yearOffset);
    return d;
  }

  get schoolYear() { return schoolYear(this.referenceDate); }
  get firstSchoolDay() { return new Date(this.schoolYear.startYear, 8, 14); }
  get lastSchoolDay() { return new Date(this.schoolYear.startYear + 1, 5, 8); }

  /** Per l'anno corrente i dati arrivano fino a oggi; per l'archivio, tutto l'anno. */
  get gradesUntil() {
    const today = startOfDay(new Date());
    return this.yearOffset < 0 ? this.lastSchoolDay : (today < this.lastSchoolDay ? today : this.lastSchoolDay);
  }

  // MARK: Instradamento

  async send(method, path, body) {
    await sleep(150 + Math.random() * 300);

    if (path === '/auth/login') {
      return json({
        ident: 'S1234567X', firstName: 'GIULIA', lastName: 'ESPOSITO',
        token: 'demo-token', release: isoLocal(new Date()),
        expire: isoLocal(new Date(Date.now() + 90 * 60_000)),
      });
    }

    const parts = path.split('/').filter(Boolean);
    if (parts.length < 3 || parts[0] !== 'students') return notFound();
    const route = parts.slice(2);

    switch (route[0]) {
      case 'card': case 'cards': return json({ card: this.card() });
      case 'grades': case 'grades2': case 'grades2324': return json({ grades: this.grades() });
      case 'periods': return json({ periods: this.periods() });
      case 'subjects': return json({ subjects: this.subjectsJSON() });
      case 'agenda': {
        const from = parseAPIDate(route[2]);
        const to = parseAPIDate(route[3]);
        if (!from || !to) return notFound();
        return json({ agenda: this.agenda(from, to) });
      }
      case 'lessons': {
        const from = parseAPIDate(route[1]);
        const to = parseAPIDate(route[2]);
        const today = startOfDay(new Date());
        return json({ lessons: this.lessons(from ?? today, to ?? today) });
      }
      case 'absences': return json({ events: this.absences() });
      case 'noticeboard':
        if (route[1] === 'read') return json(this.noticeDetail(Number(route[3]) || 0, body));
        if (route[1] === 'attach') {
          return file(makePDF('Circolare', 'Allegato dimostrativo della comunicazione.'), 'circolare.pdf', 'application/pdf');
        }
        return json({ items: this.notices() });
      case 'notes':
        if (route.length >= 4 && route[2] === 'read') {
          const id = Number(route[3]) || 0;
          const note = this.notesList().find((n) => n.evtId === id);
          return json({ event: { evtId: id, evtText: note?.evtText ?? '', readStatus: true } });
        }
        return json(this.notes());
      case 'didactics':
        if (route[1] === 'item') {
          const id = Number(route[2]) || 0;
          if (id % 10 === 2) return json({ item: { link: 'https://it.wikipedia.org/wiki/Logaritmo' } });
          if (id % 10 === 3) {
            return json({ item: { text: 'Ripassare i capitoli 4 e 5 del libro di testo e svolgere gli esercizi di fine capitolo.' } });
          }
          return file(makePDF('Dispensa', 'Materiale didattico dimostrativo di BCW.'), `dispensa-${id}.pdf`, 'application/pdf');
        }
        return json({ didacticts: this.didactics() });
      case 'documents':
        if (route[1] === 'check') return json({ document: { available: true } });
        if (route[1] === 'read') {
          return file(makePDF('Pagella', 'Documento di valutazione dimostrativo.'), 'pagella.pdf', 'application/pdf');
        }
        return json(this.documents());
      case 'calendar': return json({ calendar: this.calendarDays() });
      case 'schoolbooks': return json({ schoolbooks: this.schoolbooks() });
      default: return notFound();
    }
  }

  // MARK: Generatori

  card() {
    return {
      ident: 'S1234567X', usrType: 'S', usrId: 1234567,
      firstName: 'GIULIA', lastName: 'ESPOSITO', birthDate: '2009-03-21',
      fiscalCode: 'SPSGLI09C61F205X', schCode: 'MIPS00000', schName: 'LICEO SCIENTIFICO STATALE',
      schDedication: 'ALESSANDRO VOLTA', schCity: 'MILANO', schProv: 'MI',
      miurSchoolCode: 'MIPS00000X', miurDivisionCode: '4B',
    };
  }

  periods() {
    const y = this.schoolYear.startYear;
    return [
      { periodCode: 'Q1', periodPos: 1, periodDesc: 'TRIMESTRE', isFinal: false, dateStart: `${y}-09-01`, dateEnd: `${y}-12-22` },
      { periodCode: 'Q3', periodPos: 3, periodDesc: 'PENTAMESTRE', isFinal: true, dateStart: `${y}-12-23`, dateEnd: `${y + 1}-06-30` },
    ];
  }

  subjectsJSON() {
    return subjects.map((s, index) => ({
      id: s.id, description: s.name, order: index + 1,
      teachers: [{ teacherId: `T${s.id}`, teacherName: s.teacher }],
    }));
  }

  schoolDays(from, to) {
    const days = [];
    let day = startOfDay(from) > this.firstSchoolDay ? startOfDay(from) : this.firstSchoolDay;
    const end = startOfDay(to) < this.lastSchoolDay ? startOfDay(to) : this.lastSchoolDay;
    while (day <= end) {
      if (!isWeekend(day) && !this.isHoliday(day)) days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }

  isHoliday(day) {
    const m = day.getMonth() + 1;
    const d = day.getDate();
    if ((m === 11 && d === 1) || (m === 12 && d === 8) || (m === 4 && d === 25) || (m === 5 && d === 1) || (m === 6 && d === 2)) return true;
    if (m === 12 && d >= 23) return true;
    if (m === 1 && d <= 6) return true;
    return false;
  }

  grades() {
    const rng = new SeededRandom(this.schoolYear.startYear);
    const result = [];
    let id = 900_000;
    const trimesterEnd = new Date(this.schoolYear.startYear, 11, 22);
    const bases = [7.5, 6.5, 6.8, 7.0, 8.0, 7.2, 7.8, 7.4, 8.3, 8.8, 0];
    for (const day of this.schoolDays(addDays(this.firstSchoolDay, 3), this.gradesUntil)) {
      const count = rng.next(3) + 1;
      for (let i = 0; i < count; i++) {
        const sIndex = row(day)[rng.next(6)];
        const s = subjects[sIndex];
        if (s.id === 111) continue;
        const raw = Math.min(10, Math.max(3.5, bases[sIndex] + (rng.next(9) - 4) * 0.5));
        const value = Math.round(raw * 4) / 4;
        const isOral = rng.next(3) === 0;
        const code = s.id === 110 ? 'GRV2' : (isOral ? 'GRV1' : 'GRV0');
        const isBlue = rng.next(18) === 0;
        const isFirst = day <= trimesterEnd;
        id += 1;
        result.push({
          subjectId: s.id, subjectCode: '', subjectDesc: s.name, evtId: id, evtCode: code,
          evtDate: dayKey(day), decimalValue: value, displayValue: display(value), displaPos: 1,
          notesForFamily: rng.next(3) === 0 ? s.topics[rng.next(s.topics.length)] : '',
          color: isBlue ? 'blue' : (value >= 6 ? 'green' : 'red'),
          canceled: false, underlined: false,
          periodPos: isFirst ? 1 : 3, periodDesc: isFirst ? 'TRIMESTRE' : 'PENTAMESTRE',
          componentPos: 1, componentDesc: code === 'GRV0' ? 'Scritto' : (code === 'GRV1' ? 'Orale' : 'Pratico'),
          weightFactor: 1.0, noAverage: isBlue, teacherName: s.teacher,
        });
      }
    }
    return result.reverse();
  }

  agenda(from, to) {
    const result = [];
    for (const day of this.schoolDays(from, to)) {
      const rng = new SeededRandom(dayIndex(day));
      const r = row(day);
      const homeworkCount = rng.next(3);
      for (let i = 0; i < homeworkCount; i++) {
        const s = subjects[r[rng.next(r.length)]];
        const tasks = [
          `Esercizi da pag. ${rng.next(200) + 20} n. ${rng.next(30) + 1}–${rng.next(20) + 31}`,
          `Studiare: ${s.topics[rng.next(s.topics.length)]}`,
          `Leggere e riassumere il capitolo ${rng.next(12) + 1}`,
          'Ripassare gli appunti della lezione',
        ];
        result.push(event(minuteIndex(day) + i, 'AGHW', day, 8, tasks[rng.next(tasks.length)], s));
      }
      if (rng.next(5) === 0) {
        const s = subjects[r[rng.next(r.length)]];
        const kinds = [`Verifica scritta: ${s.topics[rng.next(s.topics.length)]}`, 'Interrogazioni programmate', 'Compito in classe'];
        result.push(event(minuteIndex(day) + 10, 'AGNT', day, 9 + rng.next(3), kinds[rng.next(kinds.length)], s));
      }
      if (rng.next(9) === 0) {
        const events = ['Uscita didattica al Museo della Scienza', 'Assemblea di classe',
          'Incontro di orientamento universitario', 'Consiglio di classe (solo docenti)'];
        result.push(event(minuteIndex(day) + 20, 'AGNT', day, 11, events[rng.next(events.length)], null));
      }
    }
    return result;
  }

  lessons(from, to) {
    const result = [];
    const today = startOfDay(new Date());
    for (const day of this.schoolDays(from, to < today ? to : today)) {
      const rng = new SeededRandom(dayIndex(day) + 7);
      const r = row(day);
      let hour = 1;
      let index = 0;
      while (index < r.length) {
        let duration = 1;
        while (index + duration < r.length && r[index + duration] === r[index]) duration += 1;
        const s = subjects[r[index]];
        result.push({
          evtId: minuteIndex(day) + hour, evtDate: dayKey(day), evtCode: 'LSF0', evtHPos: hour,
          evtDuration: duration, classDesc: '4B LICEO SCIENTIFICO', authorName: s.teacher,
          subjectId: s.id, subjectCode: '', subjectDesc: s.name,
          lessonType: rng.next(4) === 0 ? 'Esercitazione' : 'Lezione',
          lessonArg: s.topics[rng.next(s.topics.length)],
        });
        hour += duration;
        index += duration;
      }
    }
    return result;
  }

  absences() {
    const days = this.schoolDays(this.firstSchoolDay, this.gradesUntil);
    if (days.length <= 6) return [];
    const rng = new SeededRandom(42 + this.schoolYear.startYear);
    const picks = new Set();
    const count = Math.max(3, Math.floor(days.length / 12));
    for (let i = 0; i < count; i++) picks.add(rng.next(days.length));
    const sorted = [...picks].sort((a, b) => a - b);
    return sorted.map((index, n) => {
      // L'ultimo evento è sempre un ritardo da giustificare, per mostrare anche quel caso.
      const isLast = n === sorted.length - 1;
      const code = isLast ? 'ABR0' : ['ABA0', 'ABR0', 'ABU0', 'ABA0', 'ABR1'][n % 5];
      const justified = !isLast && (index < days.length - 4 || n % 2 === 0);
      const hour = code === 'ABU0' ? 5 : (code === 'ABA0' ? null : 2);
      return {
        evtId: 700_000 + n, evtCode: code, evtDate: dayKey(days[index]), evtHPos: hour,
        evtValue: 1, isJustified: justified,
        justifReasonCode: justified ? 'A' : '', justifReasonDesc: justified ? 'Motivi di salute' : '',
        hoursAbsence: [],
      };
    });
  }

  notices() {
    return demoNotices.map((n, index) => {
      const date = addDays(new Date(), -index * 4 - 1);
      return {
        pubId: 5000 + index, pubDT: isoLocal(date), readStatus: index > 2, evtCode: 'CF',
        cntId: 9000 + index, cntValidFrom: dayKey(date), cntValidTo: dayKey(addDays(date, 60)),
        cntValidInRange: true, cntStatus: 'active', cntTitle: n[0], cntCategory: n[1], cntHasChanged: false,
        cntHasAttach: index % 2 === 0, needJoin: n[2], needReply: false, needFile: false, needSign: n[3],
        evento_id: String(index),
        attachments: index % 2 === 0 ? [{ fileName: `circolare_${index + 1}.pdf`, attachNum: 1 }] : [],
      };
    });
  }

  noticeDetail(pubId, body) {
    const index = Math.max(0, Math.min(demoNotices.length - 1, pubId - 5000));
    const saved = this.replies.get(pubId) ?? { joined: false, signed: false, text: null };
    if (body) {
      try {
        const payload = JSON.parse(body);
        if (payload.join === true) saved.joined = true;
        if (payload.sign === true) saved.signed = true;
        if (typeof payload.text === 'string') saved.text = payload.text;
      } catch { /* corpo vuoto */ }
    }
    this.replies.set(pubId, saved);
    return {
      item: {
        title: demoNotices[index][0],
        text: 'Si comunica alle famiglie e agli studenti quanto segue.\n\nLe attività si svolgeranno secondo il calendario allegato. Si raccomanda la puntualità.\n\nIl Dirigente Scolastico',
      },
      reply: { replJoin: saved.joined, replSign: saved.signed, replText: saved.text },
    };
  }

  notesList() {
    const today = new Date();
    return [
      { evtId: 801, evtCode: 'NTTE', evtText: 'Lo studente ha dimenticato il materiale di disegno.',
        evtDate: dayKey(addDays(today, -6)), authorName: 'MORETTI PAOLO', readStatus: true },
      { evtId: 802, evtCode: 'NTTE', evtText: 'Ottima partecipazione al dibattito in classe.',
        evtDate: dayKey(addDays(today, -11)), authorName: 'VERDI ANDREA', readStatus: false },
      { evtId: 803, evtCode: 'NTCL', evtText: 'Uso del cellulare durante la lezione.',
        evtDate: dayKey(addDays(today, -15)), authorName: 'ROSSI GIORGIO', readStatus: false },
    ];
  }

  notes() {
    const grouped = { NTTE: [], NTCL: [], NTWN: [], NTST: [] };
    for (const note of this.notesList()) grouped[note.evtCode].push(note);
    return grouped;
  }

  didactics() {
    const data = [
      ['ROSSI GIORGIO', [['Logaritmi', ['Teoria dei logaritmi.pdf', 'Video spiegazione', 'Compiti per le vacanze']],
        ['Fisica – Termodinamica', ['Formulario termodinamica.pdf', 'Esercizi svolti.pdf']]]],
      ['BIANCHI LAURA', [['Dante', ['Inferno – canti scelti.pdf', 'Schema canto V.pptx']],
        ['Uncategorized', ['Griglia di valutazione.pdf']]]],
      ['SMITH JANE', [['Romanticism', ['Wordsworth poems.pdf', 'BBC documentary', 'Reading list']]]],
    ];
    let contentId = 40_000;
    const now = new Date();
    return data.map(([teacher, folders], tIndex) => {
      const parts = teacher.split(' ');
      return {
        teacherId: `D${tIndex}`, teacherName: teacher,
        teacherFirstName: parts[parts.length - 1], teacherLastName: parts[0],
        folders: folders.map(([folder, items], fIndex) => ({
          folderId: tIndex * 10 + fIndex, folderName: folder,
          lastShareDT: isoLocal(addDays(now, -(tIndex * 3 + fIndex * 5 + 1))),
          contents: items.map((name, cIndex) => {
            contentId += 10;
            const isLink = name.includes('Video') || name.includes('BBC');
            const isText = !name.includes('.') && !isLink;
            const id = contentId + (isLink ? 2 : (isText ? 3 : 1));
            return {
              contentId: id, contentName: name, objectId: id,
              objectType: isLink ? 'link' : (isText ? 'text' : 'file'),
              shareDT: isoLocal(addDays(now, -(tIndex * 3 + fIndex * 5 + cIndex + 1))),
            };
          }),
        })),
      };
    });
  }

  documents() {
    const docs = [];
    if (this.yearOffset < 0 || new Date() > new Date(this.schoolYear.startYear + 1, 0, 20)) {
      docs.push({ hash: 'demo-trimestre', desc: 'Pagella trimestre' });
    }
    if (this.yearOffset < 0) {
      docs.push({ hash: 'demo-finale', desc: 'Pagella finale' });
      docs.push({ hash: 'demo-certificato', desc: 'Certificato delle competenze' });
    }
    return { documents: docs, schoolReports: [] };
  }

  calendarDays() {
    const result = [];
    let day = this.schoolYear.start;
    while (day <= this.schoolYear.end) {
      let status;
      if (day < this.firstSchoolDay || day > this.lastSchoolDay) status = 'NW';
      else if (isWeekend(day)) status = 'ND';
      else if (this.isHoliday(day)) status = 'HD';
      else status = 'SD';
      result.push({ dayDate: dayKey(day), dayOfWeek: day.getDay() + 1, dayStatus: status });
      day = addDays(day, 1);
    }
    return result;
  }

  schoolbooks() {
    const book = (id, isbn, title, volume, author, publisher, subject, price, toBuy) => ({
      bookId: id, isbnCode: isbn, title, volume: volume ?? '', author, publisher, subjectDesc: subject,
      price, toBuy, alreadyOwned: !toBuy, alreadyInUse: !toBuy, recommended: false,
    });
    return [{
      courseId: 1, courseDesc: 'LICEO SCIENTIFICO – CLASSE 4ª',
      books: [
        book(1, '9788808220851', 'MATEMATICA.BLU 2.0', 'Volume 4', 'Bergamini Massimo', 'Zanichelli', 'MATEMATICA', 34.9, false),
        book(2, '9788808520470', "L'AMALDI PER I LICEI SCIENTIFICI", 'Volume 2', 'Amaldi Ugo', 'Zanichelli', 'FISICA', 38.5, false),
        book(3, '9788839536143', 'PERFORMER HERITAGE', 'Volume 1', 'Spiazzi Marina', 'Zanichelli', 'INGLESE', 31.2, true),
        book(4, '9788822173843', 'LA DIVINA COMMEDIA', null, 'Alighieri Dante', 'Le Monnier', 'ITALIANO', 24.0, false),
      ],
    }];
  }
}

function event(id, code, day, hour, notes, subject) {
  const begin = new Date(day);
  begin.setHours(hour, 0, 0, 0);
  const e = {
    evtId: id, evtCode: code, evtDatetimeBegin: isoLocal(begin),
    evtDatetimeEnd: isoLocal(new Date(begin.getTime() + 3_600_000)), isFullDay: false, notes,
    authorName: subject?.teacher ?? 'SEGRETERIA DIDATTICA', classDesc: '4B LICEO SCIENTIFICO',
  };
  if (subject) {
    e.subjectId = subject.id;
    e.subjectDesc = subject.name;
  }
  return e;
}

function display(value) {
  const whole = Math.floor(value);
  switch (value - whole) {
    case 0.25: return `${whole}+`;
    case 0.5: return `${whole}½`;
    case 0.75: return `${whole + 1}-`;
    default: return `${whole}`;
  }
}

function json(object) {
  const text = JSON.stringify(object);
  return { status: 200, contentType: 'application/json', fileName: null, data: new TextEncoder().encode(text) };
}

function file(data, name, type) {
  return { status: 200, contentType: type, fileName: name, data };
}

function notFound() {
  return json404({ statusCode: 404, message: 'Non disponibile nella demo' });
}

function json404(object) {
  return { ...json(object), status: 404 };
}
