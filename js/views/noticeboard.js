// Bacheca: elenco delle comunicazioni con filtri e ricerca; apertura con adesione, firma,
// risposta e anteprima degli allegati. Su schermi larghi elenco e dettaglio sono affiancati.

import {
  card, chipRow, filterChip, pill, eyebrow, iconBadge, loadingCard, statusBanner, emptyState, spinner, button,
} from '../components.js';
import { icon } from '../icons.js';
import { contains, esc, fmt, uniqueSorted } from '../util.js';

function listState(ctx) {
  return ctx.state('noticeboard', { search: '', category: null, onlyUnread: false, selection: null });
}

function detailState(ctx, id) {
  return ctx.state(`notice-${id}`, { detail: null, error: null, loading: true, downloading: null, reply: '', sending: false });
}

function filtered(ctx) {
  const s = listState(ctx);
  return ctx.model.notices.filter((n) => (s.category == null || n.category === s.category) &&
    (!s.onlyUnread || !n.isRead) && contains(n.title, s.search));
}

export const noticeboard = {
  title: 'Bacheca',

  render(ctx) {
    const model = ctx.model;
    if (ctx.route.param) {
      const notice = model.notices.find((n) => String(n.id) === ctx.route.param);
      return { title: '', inline: true, body: notice ? noticeDetail(ctx, notice) : emptyState('Comunicazione non trovata', 'megaphone') };
    }
    const s = listState(ctx);
    const unread = model.unreadNoticesCount;
    const search = { value: s.search, placeholder: 'Cerca nelle comunicazioni', input: 'notice-search' };
    const isSplit = ctx.wide && ctx.mainWidth >= 820;
    const page = {
      title: 'Bacheca',
      subtitle: ctx.wide && unread ? (unread === 1 ? '1 da leggere' : `${unread} da leggere`) : null,
      search,
      refresh: () => model.loadNotices(),
    };
    if (isSplit) {
      const selected = model.notices.find((n) => n.id === s.selection);
      page.full = `<div class="mail-split">
        <div class="mail-list" data-scroll="list"><div class="column">${list(ctx, true)}</div></div>
        <div class="mail-detail" data-scroll="detail">${selected
          ? `<div class="column" data-key="nd-${selected.id}">${noticeDetail(ctx, selected)}</div>`
          : emptyState('Nessuna comunicazione aperta', 'megaphone', "Scegli una comunicazione dall'elenco per leggerla.")}</div></div>`;
      return page;
    }
    page.body = list(ctx, false);
    return page;
  },

  actions: {
    'notice-search': (ctx, el) => { listState(ctx).search = el.dataset.clear ? '' : el.value; },
    'notice-unread': (ctx) => { const s = listState(ctx); s.onlyUnread = !s.onlyUnread; },
    'notice-category': (ctx, el) => {
      const s = listState(ctx);
      const value = el.dataset.value || null;
      s.category = el.dataset.toggle && s.category === value ? null : value;
    },
    'notice-open': (ctx, el) => {
      const id = Number(el.dataset.id);
      if (ctx.wide && ctx.mainWidth >= 820 && ctx.route.name === 'noticeboard' && !ctx.route.param) listState(ctx).selection = id;
      else ctx.navigate(`noticeboard/${id}`);
    },
    'notice-join': (ctx, el) => ctx.confirm({
      title: 'Confermi?', message: 'La tua adesione verrà inviata alla scuola.', confirmLabel: 'Aderisci',
      onConfirm: () => perform(ctx, Number(el.dataset.id), { join: true }),
    }),
    'notice-sign': (ctx, el) => ctx.confirm({
      title: 'Confermi?', message: 'Confermerai la presa visione della comunicazione.', confirmLabel: 'Conferma e firma',
      onConfirm: () => perform(ctx, Number(el.dataset.id), { sign: true }),
    }),
    'notice-reply-input': (ctx, el) => { detailState(ctx, el.dataset.id).reply = el.value; },
    'notice-reply': (ctx, el) => {
      const s = detailState(ctx, el.dataset.id);
      return perform(ctx, Number(el.dataset.id), { text: s.reply });
    },
    'notice-attachment': async (ctx, el) => {
      const notice = ctx.model.notices.find((n) => n.id === Number(el.dataset.id));
      const attachment = notice?.attachments.find((a) => a.number === Number(el.dataset.number));
      if (!notice || !attachment) return;
      const s = detailState(ctx, notice.id);
      s.downloading = attachment.number;
      ctx.update();
      try {
        ctx.openFile(await ctx.model.downloadAttachment(attachment, notice));
      } catch (error) {
        s.error = error.message;
      } finally {
        s.downloading = null;
        ctx.update();
      }
    },
  },
};

async function perform(ctx, id, options) {
  const notice = ctx.model.notices.find((n) => n.id === id);
  if (!notice) return;
  const s = detailState(ctx, id);
  s.sending = true;
  ctx.update();
  try {
    s.detail = await ctx.model.openNotice(notice, options);
    s.error = null;
  } catch (error) {
    s.error = error.message;
  } finally {
    s.sending = false;
    ctx.update();
  }
}

function list(ctx, isSplit) {
  const s = listState(ctx);
  const model = ctx.model;
  const categories = uniqueSorted(model.notices.map((n) => n.category));
  const chips = chipRow(
    filterChip('Da leggere', { iconName: 'circleFill', selected: s.onlyUnread, action: 'notice-unread' }) +
    filterChip('Tutte', { selected: s.category == null, action: 'notice-category', params: { value: '' } }) +
    categories.map((c) => filterChip(c, { selected: s.category === c, action: 'notice-category', params: { value: c, toggle: 1 } })).join(''),
  );
  const items = filtered(ctx);
  if (!items.length) {
    return `<div class="stack gap-16">${chips}${model.notices.length
      ? emptyState('Nessun risultato', 'megaphone', 'Prova a cambiare i filtri.')
      : emptyState('Bacheca vuota', 'megaphone', 'Le comunicazioni della scuola appariranno qui.')}</div>`;
  }
  return `<div class="stack gap-16">${chips}<div class="stack gap-10">${items.map((n) => noticeRow(n, isSplit && s.selection === n.id)).join('')}</div></div>`;
}

function noticeRow(notice, selected) {
  const action = notice.requiresAction
    ? pill(notice.needsSign ? 'Da firmare' : (notice.needsJoin ? 'Adesione' : 'Risposta'), { color: 'var(--fair)', cls: 'small' }) : '';
  return `<button class="card notice-row ${notice.isRead ? '' : 'unread'} ${selected ? 'selected' : ''}" style="--pad:14px" data-action="notice-open" data-id="${notice.id}" data-key="n-${notice.id}">
    <span class="unread-dot"></span>
    <span class="grow"><span class="notice-title">${esc(notice.title)}</span>
      <span class="notice-meta"><span class="category">${esc(notice.category)}</span>
        ${notice.publishedAt ? `<span>${esc(fmt.shortDayWithYear(notice.publishedAt))}</span>` : ''}
        <span class="flex"></span>
        ${notice.hasAttachments || notice.attachments.length ? icon('paperclip', { cls: 'small' }) : ''}${action}</span></span></button>`;
}

export function noticeDetail(ctx, notice) {
  const s = detailState(ctx, notice.id);
  ctx.task(`notice-${notice.id}`, async () => {
    try {
      s.detail = await ctx.model.openNotice(notice);
    } catch (error) {
      s.error = error.message;
    } finally {
      s.loading = false;
    }
  });

  const detail = s.detail;
  let header = `<div class="stack gap-8">${eyebrow(notice.category, 'var(--accent)')}
    <h2 class="detail-title">${esc(detail?.title?.trim() || notice.title)}</h2>`;
  if (notice.publishedAt) header += `<p class="secondary small">Pubblicata ${esc(fmt.longDay(notice.publishedAt).toLowerCase())} ${notice.publishedAt.getFullYear()}</p>`;
  if (notice.validFrom && notice.validTo) header += `<p class="secondary small">Valida dal ${esc(fmt.shortDay(notice.validFrom))} al ${esc(fmt.shortDayWithYear(notice.validTo))}</p>`;
  header += '</div>';

  let body = '';
  if (s.loading) body = loadingCard();
  else if (s.error) body = statusBanner(s.error, 'alertTriangle');
  if (!s.loading && detail?.text?.trim()) body += card(`<div class="notice-text">${esc(detail.text)}</div>`);

  let attachments = '';
  if (notice.attachments.length) {
    attachments = `<div class="stack gap-10">${eyebrow('Allegati')}${notice.attachments.map((a) => `<button class="card attachment" style="--pad:12px" data-action="notice-attachment" data-id="${notice.id}" data-number="${a.number}">
      ${iconBadge('fileText', 'var(--neutral)', 34)}<span class="grow">${esc(a.fileName)}</span>
      ${s.downloading === a.number ? spinner() : `<span style="color:var(--accent)">${icon('download')}</span>`}</button>`).join('')}</div>`;
  }

  let actions = '';
  if ((notice.needsJoin || notice.needsSign || notice.needsReply) && detail) {
    let content = eyebrow('Richiesta della scuola');
    if (notice.needsJoin) {
      content += detail.joined
        ? `<div class="status-line" style="color:var(--good)">${icon('checkSealFill')}Hai aderito</div>`
        : button('Aderisci', { action: 'notice-join', params: { id: notice.id }, iconName: 'thumbsUp', style: 'prominent', disabled: s.sending });
    }
    if (notice.needsSign) {
      content += detail.signed
        ? `<div class="status-line" style="color:var(--good)">${icon('checkSealFill')}Presa visione confermata</div>`
        : button('Conferma presa visione', { action: 'notice-sign', params: { id: notice.id }, iconName: 'signature', style: 'prominent', disabled: s.sending });
    }
    if (notice.needsReply) {
      content += detail.replyText
        ? `<p class="secondary">La tua risposta: ${esc(detail.replyText)}</p>`
        : `<textarea class="reply" rows="3" placeholder="Scrivi una risposta" data-input="notice-reply-input" data-id="${notice.id}">${esc(s.reply)}</textarea>
           ${button('Invia risposta', { action: 'notice-reply', params: { id: notice.id }, iconName: 'send', disabled: !s.reply.trim() || s.sending })}`;
    }
    actions = card(`<div class="stack gap-12 align-start">${content}</div>`);
  }

  return `<div class="stack gap-18 notice-detail">${header}${body}${attachments}${actions}</div>`;
}
