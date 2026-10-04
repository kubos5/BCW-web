// Raccolta di voti e periodi con tutti i calcoli sulle medie.

import { syntheticPeriod } from './models.js';
import { groupBy, startOfDay, byName } from './util.js';

export const AverageMode = {
  allGrades: 'Media di tutti i voti',
  subjectAverages: 'Media delle medie per materia',
};

export class GradeBook {
  constructor(grades, periods, mode = 'allGrades', weighted = false) {
    this.grades = grades;
    this.periods = periods;
    this.mode = mode;
    this.weighted = weighted;
  }

  /** Periodi che hanno almeno un voto, ordinati. */
  get activePeriods() {
    if (this._activePeriods) return this._activePeriods;
    const used = new Set(this.grades.map((g) => g.periodPosition));
    let result = this.periods.filter((p) => used.has(p.position)).sort((a, b) => a.position - b.position);
    // Se l'API non restituisce i periodi, li ricaviamo dai voti stessi.
    if (!result.length) {
      const names = groupBy(this.grades, (g) => g.periodPosition);
      result = [...names.keys()].sort((a, b) => a - b).map((pos) => {
        const name = names.get(pos)[0]?.periodName;
        return syntheticPeriod(pos, name || `Periodo ${pos}`);
      });
    }
    this._activePeriods = result;
    return result;
  }

  gradesIn(period) {
    if (period == null) return this.grades;
    return this.grades.filter((g) => g.periodPosition === period);
  }

  static average(grades, weighted) {
    const valid = grades.filter((g) => g.countsTowardAverage);
    if (!valid.length) return null;
    if (weighted) {
      let sum = 0;
      let weights = 0;
      for (const g of valid) {
        const w = (g.weight ?? 1) > 0 ? (g.weight ?? 1) : 1;
        sum += (g.value ?? 0) * w;
        weights += w;
      }
      return weights > 0 ? sum / weights : null;
    }
    return valid.reduce((s, g) => s + g.value, 0) / valid.length;
  }

  average(period = null) {
    const selected = this.gradesIn(period);
    if (this.mode === 'subjectAverages') {
      const averages = this.subjects(period).map((s) => s.average).filter((a) => a != null);
      if (!averages.length) return null;
      return averages.reduce((s, a) => s + a, 0) / averages.length;
    }
    return GradeBook.average(selected, this.weighted);
  }

  subjects(period = null) {
    const grouped = groupBy(this.gradesIn(period), (g) => g.subjectId);
    return [...grouped.entries()].map(([id, list]) => ({
      subjectId: id,
      id,
      name: list[0]?.subjectName ?? 'Materia',
      grades: [...list].sort((a, b) => b.date - a.date),
      average: GradeBook.average(list, this.weighted),
    })).sort((a, b) => byName(a.name, b.name));
  }

  /**
   * Andamento della media nel tempo, con un punto per giorno.
   * Più voti nello stesso giorno producono un solo punto (la media a fine giornata).
   */
  runningAverage(subjectId = null, period = null) {
    let list = this.gradesIn(period).filter((g) => g.countsTowardAverage);
    if (subjectId != null) list = list.filter((g) => g.subjectId === subjectId);
    list.sort((a, b) => a.date - b.date);
    const points = [];
    const running = [];
    for (const g of list) {
      running.push(g);
      const avg = GradeBook.average(running, this.weighted);
      if (avg == null) continue;
      const day = startOfDay(g.date);
      const last = points[points.length - 1];
      if (last && last.date.getTime() === day.getTime()) last.value = avg;
      else points.push({ date: day, value: avg });
    }
    return points;
  }

  /** Voto necessario nelle prossime `count` prove per raggiungere `target`. */
  static neededGrade(target, current, count = 1, weighted = false) {
    const valid = current.filter((g) => g.countsTowardAverage);
    const n = count;
    if (weighted) {
      const sum = valid.reduce((s, g) => s + (g.value ?? 0) * Math.max(g.weight ?? 1, 0.01), 0);
      const weights = valid.reduce((s, g) => s + Math.max(g.weight ?? 1, 0.01), 0);
      return (target * (weights + n) - sum) / n;
    }
    const sum = valid.reduce((s, g) => s + g.value, 0);
    return (target * (valid.length + n) - sum) / n;
  }
}
