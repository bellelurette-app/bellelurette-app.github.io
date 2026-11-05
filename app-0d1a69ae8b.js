window.__startLecture = (BOOK, LIB) => {
'use strict';
const $ = (s, r = document) => (r === document && /^#[A-Za-z][\w-]*$/.test(s) ? document.getElementById(s.slice(1)) : r.querySelector(s));
const byId = (i) => document.getElementById(i);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
let REDUCED = false;
try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ancien navigateur */ }

/* ================= Personnages ================= */
const POV = BOOK.pov || '';
const CAST = BOOK.personnages || {};
const GALLERY = (BOOK.galerie || []).filter((id) => CAST[id]);
const CITED = (BOOK.cites || []).filter((id) => CAST[id]);
const PF = BOOK.portraits || {};
// couleurs des personnages (clair, sombre), propres à chaque livre
{
  const cols = BOOK.couleurs || {};
  const decl = (i) => Object.keys(cols).filter((id) => /^[a-z0-9-]+$/.test(id)).map((id) => '--c-' + id + ':' + cols[id][i] + ';').join('');
  const st = document.createElement('style');
  st.id = 'bookColors';
  st.textContent = ':root{' + decl(0) + '}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + decl(1) + '}}:root[data-theme="dark"]{' + decl(1) + '}';
  document.head.append(st);
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const QUIZ = Array.isArray(BOOK.quiz) ? BOOK.quiz : [];
const UNIT = BOOK.unite || 'chapitre';           // « chapitre » : le morceau du livre lu dans l'appli
const PART = BOOK.contenu || UNIT;               // « chapitre I »
// v81 : l'année où se passe le roman (Pot-Bouille : 1861, publié en 1882) ; sans elle, l'année de parution
const AN_RECIT = BOOK.anneeRecit || BOOK.annee || 1885;
const AUTEUR_NOM = String(BOOK.auteur || '').trim().split(/\s+/).pop() || 'L’auteur';
const QUAND_T = BOOK.anneeRecit && BOOK.anneeRecit !== BOOK.annee ? 'quand commence ' + BOOK.titre : 'quand paraît ' + BOOK.titre;
const deNom = (n) => (/^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(String(n)) ? 'd’' : 'de ') + n;
const colorKey = (id) => (CAST[id] && (!CAST[id].fig || CAST[id].voix) ? id : 'fig');   // v83 : une voix collective garde sa couleur
const colorVar = (id) => 'var(--c-' + colorKey(id) + ')';
const RENOMS = Array.isArray(BOOK.renoms) ? BOOK.renoms : [];   // v59 : un personnage change de nom en cours de route
const renomAt = (id, e) => { let r = null; RENOMS.forEach((x) => { if (x.id === id && e >= (x.ep | 0) - 1) r = x; }); return r; };
const curEpSafe = () => { try { return EPI[k] | 0; } catch (_) { return 0; } };
const shortName = (id, e) => { const c = CAST[id]; if (!c) return id; const b = c._n0 || c; const r = RENOMS.length ? renomAt(id, e === undefined ? curEpSafe() : e) : null; return r ? (r.court || r.nom) : (b.court || b.nom); };
function syncNames() { const e = curEpSafe(); RENOMS.forEach((x) => { const c = CAST[x.id]; if (!c) return; if (!c._n0) c._n0 = { nom: c.nom, court: c.court }; const on = e >= (x.ep | 0) - 1; c.nom = on ? x.nom : c._n0.nom; c.court = on ? (x.court || c._n0.court) : c._n0.court; }); }
function portrait(id, cls) {
  const wrap = document.createElement('span');
  wrap.className = 'pf' + (cls ? ' ' + cls : '');
  wrap.style.setProperty('--spk', colorVar(id));
  fillPortrait(wrap, id);
  return wrap;
}
function fillPortrait(wrap, id) {
  const c = CAST[id] || { nom: id, ini: '?' };
  if (c.pf && PF[c.pf]) {
    const img = new Image();
    img.src = PF[c.pf]; img.alt = c.nom; img.decoding = 'async';
    wrap.replaceChildren(img);
  } else {
    const s = document.createElement('span');
    s.className = 'ini'; s.textContent = c.ini || c.nom.charAt(0);
    s.setAttribute('aria-hidden', 'true');
    wrap.replaceChildren(s);
  }
}

/* ================= Points, niveaux, objectifs, livres à débloquer =================
   1 mot lu = 1 point. Les points font monter le niveau (barre d'expérience), comptent pour l'objectif du jour
   et débloquent de nouveaux livres. */
const LEVELS = [
  { p: 0, t: 'Lecteur débutant' },
  { p: 500, t: 'Lecteur curieux' },
  { p: 1500, t: 'Lecteur régulier' },
  { p: 3000, t: 'Lecteur assidu' },
  { p: 5000, t: 'Dévoreur de pages' },
  { p: 8000, t: 'Grand lecteur' },
  { p: 12000, t: 'Lecteur émérite' },
  { p: 20000, t: 'Bibliophile' },
  { p: 35000, t: 'Érudit' },
  { p: 50000, t: 'Maître lecteur' }
];
const LUCK_RATE = .55;
const LUCK = [
  { w: 40, t: 'Bonus surprise', v: 25 },
  { w: 30, t: 'Bonus du flâneur', v: 50 },
  { w: 20, t: 'Super bonus', v: 100 },
  { w: 10, t: 'Jackpot !', v: 250, jackpot: true }
];
const STRAIGHT = 50;      // bonus « d'une traite, sans pause »
const GOALS = [500, 1000, 2000, 4000];
// la bibliothèque : le catalogue (livres inclus, à télécharger, ou bientôt disponibles)
const BOOKS = LIB.catalogue.livres.map((x) => ({
  id: x.id, t: x.titre, a: x.auteur, y: x.annee, ok: !(x.points > 0), pts: x.points || 0,
  b1: (x.couleurs || [])[0] || '#1d3047', b2: (x.couleurs || [])[1] || '#e6cd8c', x: x.resume || '',
  img: x.portrait || '', file: x.fichier || null, inclus: !!x.inclus, size: x.taille || 0, version: x.version || 1,
  contenu: x.contenu || ''
}));
const CUR = BOOKS.find((b) => b.id === BOOK.id) || { id: BOOK.id, t: BOOK.titre, a: BOOK.auteur, y: BOOK.annee, ok: true, pts: 0,
  b1: '#1d3047', b2: '#e6cd8c', x: '', img: '', file: null, inclus: false, size: 0, version: BOOK.version || 1, contenu: cap(PART) };

/* ================= Réglages et progression ================= */
const KEY = 'belami.lecture.v2';
const WPM_MIN = 150, WPM_MAX = 1000;
const EPS_VERSION = BOOK.episodesVersion || 1;    // découpage en épisodes du livre (Bel-Ami : 11 épisodes d'environ deux minutes)
const S = {
  k: 0, wpm: 240, size: 50, mode: 'focus', read: 'page', cue: 1, theme: '', awake: true,
  sound: true, vibe: true, auto: true, zen: true, amb: true, flow: true, defi: true, voice: false, vcast: true, voiceName: '',
  pts: 0, words: 0, readMs: 0, goal: 1000, day: { d: '', pts: 0, done: false }, unl: [], lvlSeen: 0,
  eps: {}, epsV: EPS_VERSION, hearts: [], streak: { last: '', n: 0, best: 0 }, started: false
};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* stockage indisponible */ }
// chaque livre garde sa position, ses épisodes lus et ses passages (S.lib) ; avant la version 11, seul Bel-Ami existait
if (!S.lib || typeof S.lib !== 'object') S.lib = { belami: { k: S.k, eps: S.eps, epsV: S.epsV, hearts: S.hearts } };
S.cur = BOOK.id;
{
  const mine = S.lib[BOOK.id] || {};
  S.k = mine.k | 0; S.eps = mine.eps || {}; S.hearts = mine.hearts || [];
  if (S.wpmV !== 2) { if (S.wpm === 300) S.wpm = 240; S.wpmV = 2; }   // version 27 : 240 mots/min par défaut
  S.cultes = Array.isArray(mine.cultes) ? mine.cultes : []; S.met = Array.isArray(mine.met) ? mine.met : null;
  S.paris = mine.paris && typeof mine.paris === 'object' ? mine.paris : {};
  S.quiz = mine.quiz && typeof mine.quiz === 'object' ? mine.quiz : {};
  S.mots = Array.isArray(mine.mots) ? mine.mots : []; S.jurons = Array.isArray(mine.jurons) ? mine.jurons : []; S.jeux = mine.jeux && typeof mine.jeux === 'object' ? mine.jeux : {}; S.roul = mine.roul && typeof mine.roul === 'object' ? mine.roul : {};
  S.epsV = mine.epsV === undefined ? EPS_VERSION : mine.epsV;
  S.marks = Array.isArray(mine.marks) ? mine.marks : [];
  S.later = Array.isArray(mine.later) ? mine.later : [];
}
// anciennes versions : les sous deviennent des points (1 sou = 10 mots), les cartes disparaissent
if (typeof S.sous === 'number') { S.pts = Math.max(S.pts || 0, S.sous * 10); S.words = Math.max(S.words || 0, S.sous * 10); }
['sous', 'wacc', 'cards', 'rankSeen', 'emoji'].forEach((x) => { delete S[x]; });
if (S.epsV !== EPS_VERSION) { S.eps = {}; S.epsV = EPS_VERSION; }
if (!S.started && (S.k > 0 || (S.eps && Object.keys(S.eps).length))) S.started = true;
S.mode = 'focus';                       // dialogues toujours au centre
if (!['page', 'texte'].includes(S.read)) S.read = 'page';   // v56 : plus de mode Rapide  // Immersif (page) par défaut ; Rapide (rsvp) ; Texte
if (!S.eps || typeof S.eps !== 'object') S.eps = {};
if (!Array.isArray(S.hearts)) S.hearts = [];
if (!Array.isArray(S.unl)) S.unl = [];
if (!GOALS.includes(S.goal)) S.goal = 1000;
if (!S.day || typeof S.day !== 'object') S.day = { d: '', pts: 0, done: false };
if (!S.streak || typeof S.streak !== 'object') S.streak = { last: '', n: 0, best: 0 };
S.lvlSeen = Math.max(S.lvlSeen || 0, levelOf(S.pts));
Object.values(S.quiz || {}).forEach((r) => { if (r && !r.end) { r.end = true; r.st = r.n >= 3 ? 3 : r.n === 2 ? 2 : 1; } });
// épisodes lus au total : à partir des versions précédentes, on compte les épisodes déjà terminés
if (typeof S.epN !== 'number') S.epN = Object.values(S.lib || {}).reduce((n, b) => n + Object.values((b && b.eps) || {}).filter((x) => x && x.done).length, 0);
function persist() {
  S.lib[BOOK.id] = { k: S.k, eps: S.eps, epsV: S.epsV, hearts: S.hearts, cultes: S.cultes, met: S.met, paris: S.paris, quiz: S.quiz, quizN: QUIZ_N, mots: S.mots, roul: S.roul, jurons: S.jurons, jeux: S.jeux, marks: S.marks, later: S.later };
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ }
}

/* ================= Lecture du fichier annoté =================
   {id} ou {id:pense} : début d'une réplique (après « ou —) · [ … ] : incise · » : fin de réplique
   <…> : repère d'emoji (ignoré pour l'instant) · @ emoji Titre | annonce : épisode (l'emoji n'est pas affiché) · *** : rupture · % : commentaire */
let UID = 0;
function parseRuns(line) {
  const runs = [];
  let buf = '', state = 'n', sp = null, th = false, v = '', u = -1;
  const flush = (k) => {
    if (buf.trim()) runs.push(k === 'n' ? { k: 'n', text: buf } : { k, text: buf, sp, th, v, u });
    buf = '';
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') {
      const j = line.indexOf('}', i);
      const [id, flag] = line.slice(i + 1, j).trim().split(':');
      if (state === 'n') {
        const m = buf.match(/([«—])\s*$/);
        if (m) { buf = buf.slice(0, m.index); flush('n'); runs.push({ k: 'm', text: m[1] }); } else flush('n');
      } else flush('s');
      state = 's'; sp = id; th = flag === 'pense'; v = flag === 'bas' || flag === 'fort' ? flag : ''; u = UID++;
      i = j; if (line[i + 1] === ' ') i++;
      continue;
    }
    if (state === 's' && ch === '[') {
      flush('s');
      const j = line.indexOf(']', i);
      buf = line.slice(i + 1, j); flush('i');
      i = j; continue;
    }
    if (state === 's' && ch === '»') {
      flush('s'); runs.push({ k: 'm', text: '»' });
      state = 'n'; sp = null; th = false; v = '';
      continue;
    }
    buf += ch;
  }
  flush(state === 's' ? 's' : 'n');
  return runs;
}
function parseBook(src) {
  const blocks = [];
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '%') continue;
    if (line.startsWith('## ')) blocks.push({ t: 'chap', text: line.slice(3) });
    else if (line.startsWith('# ')) blocks.push({ t: 'part', text: line.slice(2) });
    else if (line.startsWith('@ ')) {
      const body = line.slice(2);
      const bar = body.indexOf(' | ');
      const head = bar >= 0 ? body.slice(0, bar) : body;
      const sp = head.indexOf(' ');
      blocks.push({ t: 'ep', emo: head.slice(0, sp), title: head.slice(sp + 1).trim(), hook: bar >= 0 ? body.slice(bar + 3).trim() : '' });
    }
    else if (line === '***') blocks.push({ t: 'break' });
    else blocks.push({ t: 'p', runs: parseRuns(line) });
  }
  return blocks;
}

/* ================= Mots, phrases, répliques, épisodes ================= */
const BLOCKS = parseBook(BOOK.texte);
const T = [];
const EPS = [];
const PUNCT = /^[!?;:»…).,\]]+$/;
const ABBR = /^(M|MM|Dr|St|Ste)\.$/;
BLOCKS.forEach((bl, bi) => {
  if (bl.t === 'ep') { EPS.push({ emo: bl.emo, title: bl.title, hook: bl.hook, t: T.length }); return; }
  if (bl.t === 'break') { if (T.length) T[T.length - 1].brk = true; return; }
  if (bl.t !== 'p') return;
  bl.runs.forEach((r) => {
    r.first = T.length;
    if (r.k !== 'm') {
      let prev = null;
      for (const w of r.text.trim().split(/\s+/)) {
        if (/^<.+>$/u.test(w)) continue;   // repère d'emoji : non affiché

        if (PUNCT.test(w)) {
          if (prev) { prev.t += (/^[!?;:»]/.test(w) ? ' ' : '') + w; continue; }
          T.push({ t: w, k: r.k, sp: r.sp || null, th: !!r.th, v: r.v || '', u: r.k === 'n' ? -1 : r.u, b: bi, hide: true });
          continue;
        }
        prev = { t: w, k: r.k, sp: r.sp || null, th: !!r.th, v: r.v || '', u: r.k === 'n' ? -1 : r.u, b: bi };
        T.push(prev);
      }
    }
    r.last = T.length;
  });
});
/* Mise en page des paragraphes (mode Page et vue Texte) : chaque réplique va à la ligne, dans un paragraphe à elle,
   avec la photo de celui qui parle ; le récit reprend dans un nouveau paragraphe. Une courte attribution qui suit
   la réplique (« Entre », dit-il.) reste avec elle. SEGS[bloc] = liste de segments { kind: 'n' | 's', … }. */
const SEGS = new Map();
const ATT_MAX = 7;
const tokEnd = (t) => t.replace(/[\s»)\]]+$/u, '');
BLOCKS.forEach((bl, bi) => {
  if (bl.t !== 'p') return;
  const segs = [];
  let cur = null, open = null;
  const start = (kind, r) => {
    cur = { kind, sp: r ? r.sp : null, th: !!(r && r.th), v: (r && r.v) || '', u: r ? r.u : -1, open, close: '', parts: [], tail: [], att: null };
    open = null;
    segs.push(cur);
  };
  bl.runs.forEach((r) => {
    if (r.k === 'm') {
      if (r.text === '»' && cur && cur.kind === 's') cur.close = '»';
      else open = r.text;                       // « ou — : ouvre la réplique qui suit
      return;
    }
    if (r.k === 's' || r.k === 'i') {
      if (!(cur && cur.kind === 's' && cur.u === r.u && !cur.close)) start('s', r);
      cur.parts.push({ k: r.k, th: !!r.th, a: r.first, z: r.last });
      return;
    }
    let a = r.first;
    if (cur && cur.kind === 's') {
      // ponctuation collée à la réplique (« Entre », …) : elle reste avec elle
      while (a < r.last && T[a].hide && /^[,.;:!?…)]/.test(T[a].t)) cur.tail.push(a++);
      // courte attribution en minuscule (dit-il., demanda Forestier.) : elle reste aussi avec la réplique
      if (a < r.last && /^\p{Ll}/u.test(T[a].t)) {
        let n = 0;
        for (let i = a; i < r.last && n < ATT_MAX; i++) {
          if (!T[i].hide) n++;
          if (/[.!?…:;]$/.test(tokEnd(T[i].t))) { cur.att = [a, i + 1]; a = i + 1; break; }
        }
      }
    }
    if (a >= r.last) return;
    if (!(cur && cur.kind === 'n')) start('n', null);
    cur.parts.push({ k: 'n', a, z: r.last });
  });
  // fin de chaque segment : un groupe de mots ne déborde jamais d'un paragraphe à l'autre
  segs.forEach((sg) => {
    let e = -1;
    sg.parts.forEach((pt) => { e = Math.max(e, pt.z - 1); });
    sg.tail.forEach((i) => { e = Math.max(e, i); });
    if (sg.att) e = Math.max(e, sg.att[1] - 1);
    while (e >= 0 && T[e].hide) e--;
    if (e >= 0) T[e].vbrk = true;
  });
  SEGS.set(bi, segs);
});
const V = [];
const VOF = new Int32Array(T.length + 1);
T.forEach((tk, i) => { if (!tk.hide) V.push(i); });
{ let v = V.length - 1; for (let i = T.length - 1; i >= 0; i--) { if (!T[i].hide) v = V.indexOf(i, Math.max(0, v - 2)); VOF[i] = Math.max(0, v); } }
const N = V.length;

const SENT = [0];
for (let j = 0; j < N; j++) {
  const a = T[V[j]], b = j + 1 < N ? T[V[j + 1]] : null;
  a.pend = !b || b.b !== a.b;
  for (let i = V[j]; i < (b ? V[j + 1] : T.length); i++) if (T[i].brk) a.brk = true;
  if (!b) continue;
  const end = a.t.replace(/[ \s»)\]]+$/u, '');
  const stop = /[.!?…]$/.test(end) && !ABBR.test(end);
  if (a.pend || (stop && /^\P{L}*\p{Lu}/u.test(b.t))) SENT.push(j + 1);
}
function weight(tk) {
  let w = 1;
  const core = tk.t.replace(/[^\p{L}\p{N}]/gu, '');
  if (core.length > 8) w *= 1 + Math.min(.6, (core.length - 8) * .06);
  const end = tk.t.replace(/[ \s»)\]]+$/u, '');
  if (/[.!?…]$/.test(end) && !ABBR.test(end)) w *= 2.4;   // un point se marque nettement
  else if (/[;:]$/.test(end)) w *= 1.6;
  else if (/,$/.test(end)) w *= 1.35;
  if (tk.pend) w += .9;
  else if (tk.vbrk) w += .5;
  if (tk.brk) w += 2;
  if (tk.k === 's') w *= 1.15;                                // les répliques se lisent un peu plus posément
  return w;
}
const W = new Float32Array(N);
const PW = new Float64Array(N + 1);
for (let j = 0; j < N; j++) { W[j] = weight(T[V[j]]); PW[j + 1] = PW[j] + W[j]; }

// épisodes
EPS.forEach((ep, e) => { ep.a = VOF[Math.min(ep.t, T.length - 1)]; });
EPS.forEach((ep, e) => { ep.z = e + 1 < EPS.length ? EPS[e + 1].a - 1 : N - 1; ep.n = ep.z - ep.a + 1; });
const EPI = new Int16Array(N);
EPS.forEach((ep, e) => { for (let j = ep.a; j <= ep.z; j++) EPI[j] = e; });
// chapitres (« ## » du fichier) : épisodes de chacun, bornes en mots affichés
const CHAPS = [];
{
  const chb = new Int16Array(BLOCKS.length);
  let c = -1, pt = '';
  BLOCKS.forEach((bl, bi) => {
    if (bl.t === 'part') pt = bl.text;
    if (bl.t === 'chap') { c++; CHAPS.push({ num: bl.text.replace(/^[-–—\s]+|[-–—\s]+$/g, ''), part: pt, eps: [] }); }
    chb[bi] = Math.max(0, c);
  });
  if (!CHAPS.length) CHAPS.push({ num: '', eps: [] });
  EPS.forEach((ep, e) => { ep.c = chb[T[V[ep.a]].b]; ep.i = CHAPS[ep.c].eps.length; CHAPS[ep.c].eps.push(e); });
  CHAPS.forEach((ch) => { ch.a = EPS[ch.eps[0]].a; ch.z = EPS[ch.eps[ch.eps.length - 1]].z; });
}
const PSUF = (ch) => (ch && ch.part && !/^premi/i.test(ch.part) && CHAPS.some((x) => x.part && x.part !== ch.part) ? ' de la ' + ch.part.replace(/^Deuxième/, '2e').replace(/^Troisième/, '3e').replace(/^Quatrième/, '4e') : '');   // v59
const chapLabel = (ch) => cap(UNIT) + (ch && ch.num ? ' ' + ch.num : '') + PSUF(ch);
const QUIZ_N = CHAPS.filter((c, ci) => { const q = QUIZ[ci]; return q && Array.isArray(q.questions) && q.questions.length >= 3; }).length;
const chapOfEp = (e) => CHAPS[EPS[e].c];
const chapPct = (j) => { const ch = chapOfEp(EPI[j]); return Math.round((j - ch.a) / Math.max(1, ch.z - ch.a) * 100); };

// répliques et scènes (pour l'écran partagé)
const GAP = 60;
const UNITS = [];
const UIDX = new Map();
for (let j = 0; j < N; j++) {
  const tk = T[V[j]];
  if (tk.k === 'n') continue;
  let u = UIDX.get(tk.u);
  if (!u) { u = { id: tk.u, sp: tk.sp, th: tk.th, a: j, z: j }; UIDX.set(tk.u, u); UNITS.push(u); }
  u.z = j;
}
const SCENE = new Int16Array(N).fill(-1);
const SEAT = new Array(N).fill(null);
const SNAP = new Array(N).fill(null);
const SCENES = [];
UNITS.forEach((u, i) => {
  const p = UNITS[i - 1];
  let join = false;
  if (p) {
    let brk = false;
    for (let j = p.z; j < u.a; j++) if (T[V[j]].brk) brk = true;
    join = !brk && (u.a - p.z - 1) <= GAP;
  }
  if (join) SCENES[SCENES.length - 1].units.push(u); else SCENES.push({ units: [u] });
});
SCENES.forEach((sc, si) => {
  const seats = { a: null, c: null, b: POV }, used = { a: 0, c: 0 };
  let t = 0;
  sc.units.forEach((u) => {
    t++;
    let s;
    if (u.sp === POV) s = 'b';
    else if (seats.a === u.sp) s = 'a';
    else if (seats.c === u.sp) s = 'c';
    else if (!seats.a) s = 'a';
    else if (!seats.c) s = 'c';
    else s = used.a <= used.c ? 'a' : 'c';
    seats[s] = u.sp; if (s !== 'b') used[s] = t;
    u.seat = s; u.snap = { a: seats.a, c: seats.c, b: seats.b };
  });
  sc.a = sc.units[0].a; sc.z = sc.units[sc.units.length - 1].z;
  let cur = null, ui = 0;
  for (let j = sc.a; j <= sc.z; j++) {
    while (ui < sc.units.length && sc.units[ui].a <= j) cur = sc.units[ui++];
    SCENE[j] = si; SNAP[j] = cur.snap;
    const tk = T[V[j]];
    if (tk.k !== 'n') SEAT[j] = UIDX.get(tk.u).seat;
  }
});
// Groupes de mots (surlignés ensemble en mode Page) : 2 à 7 mots, coupés à la ponctuation, aux changements de voix
// et à chaque passage à la ligne,
// sans finir sur un petit mot (article, préposition, pronom…), qui passe alors à la séquence suivante.
const FUNC = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'à', 'au', 'aux', 'en', 'et', 'ou', 'mais', 'ni', 'que',
  'qui', 'ne', 'se', 'sa', 'son', 'ses', 'leur', 'leurs', 'sur', 'dans', 'par', 'pour', 'avec', 'sans', 'sous', 'vers', 'chez',
  'entre', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'votre', 'nos', 'vos', 'il', 'elle',
  'ils', 'elles', 'je', 'tu', 'on', 'nous', 'vous', 'y', 'très', 'si', 'comme', 'dont', 'où', 'lui', 'me', 'te', 'plus', 'tout',
  'tous', 'toute', 'toutes', 'quand', 'lorsque', 'puis', 'aussi', 'm', 'mm']);
function isFunc(t) {
  const w = t.toLowerCase().replace(/[^\p{L}'’-]/gu, '');
  return FUNC.has(w) || /['’]$/.test(w) || /^(d|l|qu|s|n|j|m|t|c|jusqu|lorsqu|puisqu)['’]\p{L}{1,4}$/u.test(w);
}
// mots qui ouvrent un groupe (préposition, conjonction, relatif) : on coupe juste avant eux
const STARTERS = new Set(['de', 'du', 'des', 'à', 'au', 'aux', 'en', 'et', 'ou', 'mais', 'ni', 'que', 'qui', 'dont', 'où', 'pour',
  'par', 'dans', 'sur', 'sous', 'avec', 'sans', 'vers', 'chez', 'entre', 'comme', 'puis', 'quand', 'lorsque', 'si', 'car', 'donc',
  'pendant', 'après', 'avant', 'depuis', 'contre', 'parmi', 'selon', 'tandis', 'jusque']);
function isStarter(t) {
  const w = t.toLowerCase().replace(/[^\p{L}'’-]/gu, '');
  return STARTERS.has(w) || /^(d|qu|jusqu|lorsqu|puisqu)['’]/u.test(w);
}
const MAXW = 7, MAXC = 44;
const CH = [];
const CHOF = new Int32Array(N);
function boundaryAfter(j) {
  const tk = T[V[j]], nx = j + 1 < N ? T[V[j + 1]] : null;
  if (!nx || tk.pend || tk.vbrk || nx.k !== tk.k || nx.u !== tk.u || EPI[j + 1] !== EPI[j]) return 'hard';
  const end = tk.t.replace(/[ \s»)\]]+$/u, '');
  if (/[.!?…]$/.test(end) && !ABBR.test(end)) return /^\P{L}*\p{Lu}/u.test(nx.t) ? 'hard' : 'soft';
  if (/[;:]$/.test(end)) return 'semi';
  if (/,$/.test(end)) return 'soft';
  return null;
}
// la fin du groupe (jusqu'à la prochaine ponctuation) tient-elle encore dans la séquence ?
function restFits(j, len, chars) {
  for (let r = j + 1; r < N; r++) {
    len++; chars += 1 + T[V[r]].t.length;
    if (len > MAXW || chars > MAXC) return false;
    if (boundaryAfter(r)) return true;
  }
  return true;
}
{
  let a = 0, chars = 0;
  const push = (z) => { CH.push({ a, z }); for (let j = a; j <= z; j++) CHOF[j] = CH.length - 1; a = z + 1; };
  const recount = (to) => { chars = 0; for (let i = a; i <= to; i++) chars += (i > a ? 1 : 0) + T[V[i]].t.length; };
  for (let j = 0; j < N; j++) {
    const tk = T[V[j]];
    chars += (j > a ? 1 : 0) + tk.t.length;
    const nx = j + 1 < N ? T[V[j + 1]] : null;
    const end = tk.t.replace(/[ \s»)\]]+$/u, '');
    const len = j - a + 1;
    const bd = boundaryAfter(j);
    if (bd === 'hard') { push(j); chars = 0; continue; }
    if (bd === 'semi' && len >= 2) { push(j); chars = 0; continue; }
    if (bd === 'soft' && len >= 3 && !restFits(j, len, chars)) { push(j); chars = 0; continue; }
    if (nx && (len + 1 > MAXW || chars + 1 + nx.t.length > MAXC)) {
      // trop long : couper juste avant un mot qui ouvre un groupe (de, et, qui…), sinon ne pas finir sur un petit mot
      let p = -1;
      for (let q = j; q >= a + 2; q--) if (isStarter(T[V[q]].t) && !isFunc(T[V[q - 1]].t)) { p = q; break; }
      if (p > a) push(p - 1);
      else { let z = j; while (z > a && isFunc(T[V[z]].t)) z--; push(z); }
      recount(j);
      if (a > j) chars = 0;
    }
  }
  if (a < N) push(N - 1);
}
// rythme plus régulier : une séquence d'un ou deux mots rejoint sa voisine quand la phrase continue
{
  const words = (c) => c.z - c.a + 1;
  const charsOf = (c) => { let n = 0; for (let j = c.a; j <= c.z; j++) n += (j > c.a ? 1 : 0) + T[V[j]].t.length; return n; };
  const joinable = (x, y) => {
    const b = boundaryAfter(x.z);
    return b !== 'hard' && b !== 'semi' && words(x) + words(y) <= MAXW + 1 && charsOf(x) + 1 + charsOf(y) <= MAXC + 4;
  };
  for (let i = 0; i < CH.length; i++) {
    if (words(CH[i]) > 2) continue;
    if (i + 1 < CH.length && joinable(CH[i], CH[i + 1])) { CH[i].z = CH[i + 1].z; CH.splice(i + 1, 1); i--; continue; }
    if (i > 0 && joinable(CH[i - 1], CH[i])) { CH[i - 1].z = CH[i].z; CH.splice(i, 1); i -= 2; if (i < -1) i = -1; }
  }
  CH.forEach((c, ci) => { for (let j = c.a; j <= c.z; j++) CHOF[j] = ci; });
}
// teinte d'ambiance de chaque épisode, selon le lieu
const AMB = Array.isArray(BOOK.ambiances) ? BOOK.ambiances : [];
const LINES = {};
UNITS.forEach((u) => { LINES[u.sp] = (LINES[u.sp] || 0) + 1; });
const SPEAKERS = Object.keys(LINES).sort((x, y) => (y === POV) - (x === POV) || LINES[y] - LINES[x]);

/* ================= Affichage d'un mot ================= */
const stage = byId('stage');
const centerEl = $('.center', stage);
const seatEl = { a: $('.seat[data-s="a"]', stage), c: $('.seat[data-s="c"]', stage), b: $('.seat[data-s="b"]', stage) };
const SEATS = ['a', 'c', 'b'];
const occ = { a: undefined, c: undefined, b: undefined };
const ftag = $('.ftag', centerEl);
let ftagId = null;
const meas = document.createElement('canvas').getContext('2d');

function split(t) {
  const m = t.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su);
  const lead = m[1], core = m[2], trail = m[3];
  const n = core.length;
  const i = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return [lead + core.slice(0, i), core.charAt(i), core.slice(i + 1) + trail];
}
function fit(box, say, word, parts, scale) {
  const cs = getComputedStyle(word);
  let fs = S.size * scale;
  meas.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
  const need = 2 * Math.max(meas.measureText(parts[0]).width, meas.measureText(parts[2]).width) + meas.measureText(parts[1]).width;
  const avail = say.clientWidth - fs * 1.3;
  if (avail > 0 && need > avail) fs = fs * avail / need;
  const who = box.querySelector('.who');
  const reserve = box === centerEl ? (ftag.offsetHeight * 2 + 16) : (who && who.offsetParent ? who.offsetHeight + 26 : 24);
  const h = box.clientHeight - reserve;
  if (h > 0) fs = Math.min(fs, h / 1.25);
  say.style.fontSize = Math.max(14, Math.floor(fs)) + 'px';
}
function setWord(box, tk, scale) {
  const say = box.querySelector('.say'), word = say.querySelector('.word');
  const parts = split(tk.t);
  word.children[0].textContent = parts[0];
  word.children[1].textContent = parts[1];
  word.children[2].textContent = parts[2];
  word.classList.toggle('inc', tk.k === 'i');
  word.classList.toggle('th', !!tk.th);
  word.classList.toggle('v-bas', tk.v === 'bas');
  word.classList.toggle('v-fort', tk.v === 'fort');
  fit(box, say, word, parts, scale);
}
function clearWord(box) { for (const s of box.querySelector('.word').children) s.textContent = ''; }
function setSeat(s, id) {
  if (occ[s] === id) return;
  occ[s] = id;
  const el = seatEl[s];
  el.dataset.on = id ? '1' : '0';
  if (!id) return;
  el.style.setProperty('--spk', colorVar(id));
  fillPortrait($('.pf', el), id);
  $('.nm', el).textContent = shortName(id);
}
function seatScale() { return stage.dataset.layout === 'landscape' ? .8 : .92; }
function zoneOf(j) {
  const tk = T[V[j]];
  if (S.mode === 'scene') return tk.k === 'n' || SCENE[j] < 0 ? 'n' : SEAT[j];
  return tk.k === 'n' ? 'n' : 'v:' + tk.sp;
}
function applySeats(j) {
  const snap = S.mode === 'scene' && SCENE[j] >= 0 ? SNAP[j] : null;
  stage.dataset.pair = snap && snap.a && snap.c ? '1' : '0';
  for (const s of SEATS) setSeat(s, snap ? snap[s] : null);
}
function setStates(zone, tk, cue) {
  for (const s of SEATS) {
    const el = seatEl[s], on = zone === s;
    el.dataset.talk = on && !cue ? '1' : '0';
    el.dataset.cue = on && cue ? '1' : '0';
    el.dataset.th = on && tk.th ? '1' : '0';
    el.dataset.inc = on && tk.k === 'i' ? '1' : '0';
  }
}
let zoneIndex = 0;
// au-dessus du mot : le portrait et le nom de celui qui parle
function setTag(j, tk) {
  const speech = S.mode === 'focus' && tk.k !== 'n';
  ftag.dataset.on = speech ? '1' : '0';
  ftag.dataset.kind = speech ? 's' : 'n';
  ftag.dataset.th = speech && tk.th ? '1' : '0';
  if (speech && ftagId !== tk.sp) {
    ftagId = tk.sp;
    ftag.style.setProperty('--spk', colorVar(tk.sp));
    fillPortrait($('.pf', ftag), tk.sp);
    $('.nm', ftag).textContent = shortName(tk.sp);
  }
}
function render(j) {
  if (S.read === 'page') renderPage(CHOF[j]);
  else if (S.read === 'texte') renderTexte(j);
  else renderWord(j);
}
// changement de voix : en mot à mot, le portrait du prochain locuteur apparaît ; en mode Page, le mot reste allumé
function renderCue(j) { if (S.read === 'rsvp') renderCueWord(j); }

/* ================= Mode Page ================= */
const pageview = byId('pageview');
const pvIn = byId('pvIn');
const PVS = [];          // mot (indice dans T) -> élément du mode Page
let pvBuilt = false, pvLit = [], pvPara = null, pvTarget = 0, pvAnim = 0, pvLast = 0, pvUserScroll = false;
let RL = .36;   // hauteur de la ligne lue, en part de la hauteur de la page
function sizePage() {
  const h = pageview.clientHeight;
  if (!h) return;
  RL = stage.clientWidth < 560 ? .3 : .38;
  sv73(stage, '--fsp', Math.max(16, Math.round(S.size * .42)) + 'px');
  sv73(stage, '--pvtop', Math.round(h * RL) + 'px');
  sv73(stage, '--pvbot', Math.round(h * .62) + 'px');
  placeRx();
  positionMarks();
}
// le visage des réactions se cale au bord droit du texte (et non au bord de l'écran)
function placeRx() {
  const sr = stage.getBoundingClientRect(), pr = pvIn.getBoundingClientRect();
  if (!sr.width || !pr.width) return;
  const pad = parseFloat(getComputedStyle(pvIn).paddingRight) || 0;
  const gap = sr.right - (pr.right - pad);          // espace entre la fin des lignes et le bord
  // deux colonnes dans la marge de droite : les émojis gardés juste après le texte, le visage un peu plus loin
  const rxr = Math.max(0, Math.round(gap - 66));
  sv73(stage, '--rxr', rxr + 'px');
  sv73(pvIn, '--mkx', Math.round(pr.width - pad + 12) + 'px');
  // marge de gauche, pour l'animation d'ambiance
  const padL = parseFloat(getComputedStyle(pvIn).paddingLeft) || 0;
  sv73(stage, '--ambw', Math.max(14, Math.min(96, Math.round(pr.left - sr.left + padL - 6))) + 'px');
  // milieu de la marge de gauche, près du début des lignes (coordonnées de la page qui défile)
  const marginL = pr.left - sr.left + padL;
  sv73(pvIn, '--mtx', Math.round(padL - Math.min(marginL / 2, 20)) + 'px');
  sv73(pvIn, '--mts', Math.round(Math.max(16, Math.min(30, marginL - 4))) + 'px');
}
let lgut = null;
function leftGut() {
  if (!lgut || !lgut.isConnected) { lgut = el('div', 'lgut'); lgut.setAttribute('aria-hidden', 'true'); pvIn.append(lgut); }
  return lgut;
}
function lineY(s) { const r = s.getBoundingClientRect(); return r.top - pvIn.getBoundingClientRect().top + r.height / 2; }
// fond doux derrière le paragraphe en cours ; il glisse et change de taille d'un paragraphe à l'autre
let paraEl = null;
function paraHL(p) {
  if (!paraEl || !paraEl.isConnected) { paraEl = el('div', 'pv-para'); paraEl.setAttribute('aria-hidden', 'true'); pvIn.prepend(paraEl); }
  if (!p || S.read !== 'page') { paraEl.style.opacity = '0'; return; }
  const b = pvIn.getBoundingClientRect(), r = p.getBoundingClientRect();
  paraEl.style.transform = 'translate(' + Math.round(r.left - b.left - 12) + 'px,' + Math.round(r.top - b.top - 7) + 'px)';
  paraEl.style.width = Math.round(r.width + 24) + 'px';
  paraEl.style.height = Math.round(r.height + 10) + 'px';
  paraEl.style.opacity = '1';
}
function renderPage(c) {
  if (!pvBuilt) { buildPageInto(pvIn, PVS); cvWrap62(); pvBuilt = true; sizePage(); applyMarks(); applyCultes(); applyEmos(); }
  const driven = sweepNext && playing && !REDUCED;   // pendant la lecture, la tête fait défiler la page
  const ch = CH[c];
  pvLit = [];
  for (let j = ch.a; j <= ch.z; j++) { const s = PVS[V[j]]; if (s) pvLit.push(s); }
  placeHighlight();
  const first = pvLit[0];
  if (!first) return;
  const p = first.closest('p');
  if (p !== pvPara) { if (pvPara) pvPara.classList.remove('here'); if (p) p.classList.add('here'); pvPara = p; }
  paraHL(p);
  if (pvUserScroll || driven) return;   // le lecteur parcourt la page lui-même, ou la tête s'en charge
  // le groupe en cours se place au tiers haut de l'écran ; le texte glisse en douceur jusqu'à lui
  // position mesurée par rapport à la page (les répliques sont des blocs positionnés : offsetTop serait relatif à elles)
  const fr = first.getBoundingClientRect();
  const y = fr.top - pvIn.getBoundingClientRect().top - pageview.clientHeight * RL + fr.height / 2;
  const yt = Math.max(0, Math.min(y, pageview.scrollHeight - pageview.clientHeight));
  // à la pause, la page est déjà au bon endroit : on ne la bouge pas pour moins d'une ligne et demie
  if (!playing && Math.abs(yt - pageview.scrollTop) < fr.height * 2.6) return;
  pvTarget = yt;
  if (REDUCED || Math.abs(pvTarget - pageview.scrollTop) > pageview.clientHeight * 3) { stopPageGlide(); pageview.scrollTop = pvTarget; return; }
  if (!pvAnim) { pvLast = performance.now(); pvAnim = requestAnimationFrame(pvTick); }
}
// Guide de lecture. Un ruban par ligne du groupe en cours. Pendant la lecture, une seule « tête » avance, image par
// image : elle remplit le ruban à vitesse régulière, allume le halo des mots qu'elle dépasse et fait défiler la page
// en continu (comme un prompteur). Au groupe suivant, l'ancien ruban s'efface en traîne. À l'arrêt : ruban plein.
let pvKey = '', hlCur = [], sweepNext = false, sw = null, swRaf = 0, swLast = 0;
const hlPool = [];
function hlEl() {
  let h = hlPool.pop();
  while (h && !h.isConnected) h = hlPool.pop();
  if (!h) { h = el('div', 'pv-hl'); hlLayer().append(h); void h.offsetWidth; }
  h.classList.remove('trail', 'head');
  return h;
}
// rectangles du groupe, ligne par ligne (coordonnées de la page)
function hlLines() {
  const range = document.createRange();
  range.setStartBefore(pvLit[0]);
  range.setEndAfter(pvLit[pvLit.length - 1]);
  const base = pvIn.getBoundingClientRect();
  const lines = [];
  for (const rc of range.getClientRects()) {
    if (rc.width < 2 || rc.height < 4) continue;
    const top = rc.top - base.top, bottom = rc.bottom - base.top, left = rc.left - base.left, right = rc.right - base.left;
    const L = lines.find((l) => Math.abs(l.top - top) < rc.height * .5);
    if (!L) lines.push({ top, bottom, left, right });
    else { L.top = Math.min(L.top, top); L.bottom = Math.max(L.bottom, bottom); L.left = Math.min(L.left, left); L.right = Math.max(L.right, right); }
  }
  return lines.sort((x, y) => x.top - y.top);
}
function hlPlace(h, L) {
  const w = Math.round(L.right - L.left + 12);
  h._tr = 'translate(' + Math.round(L.left - 6) + 'px,' + Math.round(L.top - 1) + 'px)';
  h.style.transform = h._tr + ' scaleX(' + (h._sx == null ? 1 : h._sx) + ')';
  h.style.height = Math.round(L.bottom - L.top + 2) + 'px';
  return w;
}
function wlClear() { pvIn.querySelectorAll('.wl').forEach((s) => s.classList.remove('wl')); }
function placeHighlight() {
  const key = pvLit.length ? pvLit[0].dataset.t + '-' + pvLit[pvLit.length - 1].dataset.t : '';
  const sweep = sweepNext && !REDUCED && S.read === 'page';
  sweepNext = false;
  if (key && key === pvKey && !sweep) {
    // même groupe (pause, écran redimensionné) : ruban plein, à la bonne place
    sw = null;
    const lines = hlLines();
    while (hlCur.length < lines.length) hlCur.push(hlEl());
    hlCur.forEach((h, i) => {
      const L = lines[i];
      if (!L) { h.style.opacity = '0'; return; }
      h.style.width = hlPlace(h, L) + 'px'; hlScale(h, 1);
      h.style.opacity = '1';
    });
    pvLit.forEach((s) => wlAdd69(s));
    paraHL(pvPara);
    return;
  }
  // l'ancien groupe s'estompe derrière la tête
  wlClear();
  hlCur.forEach((h) => {
    h.classList.add('trail'); h.classList.remove('head');
    h.style.opacity = '0';
    setTimeout(() => { if (!hlCur.includes(h)) hlPool.push(h); }, 650);
  });
  hlCur = [];
  pvKey = key;
  sw = null;
  if (!key) return;
  const lines = hlLines();
  const segs = lines.map((L) => {
    const h = hlEl();
    const w = hlPlace(h, L);
    h.style.width = w + 'px'; hlScale(h, sweep ? 0 : 1);
    h.style.opacity = '1';
    hlCur.push(h);
    return { h, x: L.left - 6, y: L.top, hh: L.bottom - L.top, w, cur: sweep ? 0 : w };
  });
  if (!sweep) { pvLit.forEach((s) => wlAdd69(s)); return; }
  // mots du groupe : sur quelle ligne, à quelle distance du début de la tête
  const base = pvIn.getBoundingClientRect();
  let acc = 0;
  const offs = segs.map((g) => { const o = acc; acc += g.w; return o; });
  const words = pvLit.map((s) => {
    const r = s.getBoundingClientRect();
    const cx = r.left - base.left + r.width * .45, cy = r.top - base.top + r.height / 2;
    let i = segs.findIndex((g) => cy >= g.y - 2 && cy <= g.y + g.hh + 2);
    if (i < 0) i = 0;
    return { s, at: offs[i] + Math.max(0, cx - segs[i].x), on: false };
  });
  const cs = getComputedStyle(pvIn);
  const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  sw = { segs, words, tot: acc || 1, t0: 0, dur: 0, lh: parseFloat(cs.lineHeight) || 30, colL: padL, colW: Math.max(1, pvIn.clientWidth - padL - padR) };
}
// lance la tête pour « ms » millisecondes : le ruban se remplit à vitesse constante sur toute la longueur du groupe
function runSweep(ms, wait) {
  if (!sw || sw.t0) return;
  sw.t0 = performance.now() + (wait || 0); sw.dur = Math.max(120, ms);
  if (!swRaf) { swLast = sw.t0; swRaf = requestAnimationFrame(swTick); }
}
// temps de lecture des mots du groupe, sans les pauses de ponctuation (les mots longs prennent un peu plus de temps)
function sweepMs(ch) {
  let t = 0;
  for (let j = ch.a; j <= ch.z; j++) {
    const core = T[V[j]].t.replace(/[^\p{L}\p{N}]/gu, '').length;
    t += (1 + (core > 8 ? Math.min(.6, (core - 8) * .06) : 0)) * (T[V[j]].k === 's' ? 1.15 : 1);
  }
  return t * baseMs();
}
function swTick(t) {
  swRaf = 0;
  const dt = Math.min(64, t - swLast); swLast = t;
  if (!playing || S.read !== 'page') { pvRst64(); return; }
  let target = null;
  if (sw && sw.t0) {
    const d = Math.min(1, Math.max(0, (t - sw.t0) / sw.dur)) * sw.tot;
    let acc = 0, head = sw.segs[sw.segs.length - 1], hx = 0;
    for (const g of sw.segs) {
      const w = Math.max(0, Math.min(g.w, d - acc));
      if (Math.abs(w - g.cur) > .4) { g.cur = w; hlScale(g.h, g.w > 0 ? w / g.w : 1); }
      if (d >= acc && d <= acc + g.w) { head = g; hx = g.x + w; }
      acc += g.w;
    }
    if (d >= sw.tot) { head = sw.segs[sw.segs.length - 1]; hx = head.x + head.w; }
    if (sw.hd !== head) { if (sw.hd) sw.hd.h.classList.remove('head'); head.h.classList.add('head'); sw.hd = head; }
    for (const wd of sw.words) if (!wd.on && wd.at <= d) { wd.on = true; wlAdd69(wd.s); if (wd.s._c64) { const f64 = wd.s._c64; wd.s._c64 = null; f64(); } }
    // hauteur de lecture : la ligne de la tête, plus la part de ligne déjà parcourue (défilement continu)
    const frac = Math.min(1, Math.max(0, (hx - sw.colL) / sw.colW));
    target = head.y + head.hh / 2 + frac * sw.lh;
  }
  if (target !== null && !pvUserScroll) {
    const ch62 = sw.ch || (sw.ch = pageview.clientHeight), sh62 = sw.sh || (sw.sh = pageview.scrollHeight);
    pvTarget = Math.max(0, Math.min(target - ch62 * RL, sh62 - ch62));
    const st64 = pageview.scrollTop;
    if (pvF64 == null || Math.abs(st64 - Math.round(pvF64)) > 1.5) { pvF64 = st64; pvV102 = 0; }
    const diff = pvTarget - pvF64;
    if (Math.abs(diff) > ch62 * 1.2) { pvF64 = pvTarget; pvV102 = 0; }
    else {
      // v102 : un ressort amorti critique, et non plus un simple rattrapage : la vitesse varie en continu, sans dépasser
      // la cible. Avant, quand la cible sautait (nouveau groupe, nouveau paragraphe), la vitesse bondissait d'un coup.
      const h = dt / 1000, w = 5;
      pvV102 += (w * w * diff - 2 * w * pvV102) * h;
      pvF64 += pvV102 * h;
    }
    const i64 = Math.round(pvF64);
    if (i64 !== st64) pageview.scrollTop = i64;
    const off64 = Math.round((i64 - pvF64) * 100) / 100;
    if (off64 !== pvO64) { pvO64 = off64; pvIn.style.transform = off64 ? 'translate3d(0,' + off64 + 'px,0)' : ''; }
  } else if (pvUserScroll) pvRst64();
  swRaf = requestAnimationFrame(swTick);
}
function pvTick(t) {
  const dt = Math.min(64, t - pvLast); pvLast = t;
  const cur = pageview.scrollTop, diff = pvTarget - cur;
  if (Math.abs(diff) < .6) { pageview.scrollTop = pvTarget; pvAnim = 0; return; }
  pageview.scrollTop = cur + diff * (1 - Math.pow(.9, dt / 16.7));
  pvAnim = requestAnimationFrame(pvTick);
}
function stopPageGlide() { if (pvAnim) cancelAnimationFrame(pvAnim); pvAnim = 0; }
// faire défiler la page soi-même met la lecture en pause (un simple toucher, lui, ne compte pas comme un défilement)
function userScrolled() {
  if (S.read !== 'page') return;
  pvUserScroll = true;
  stopPageGlide();
  if (playing) pause();
}
let pvTouchY = null;
pageview.addEventListener('touchstart', (e) => { pvTouchY = e.touches[0].clientY; }, { passive: true });
pageview.addEventListener('touchmove', (e) => {
  if (drag) return;
  if (pvTouchY === null || Math.abs(e.touches[0].clientY - pvTouchY) > 10) userScrolled();
}, { passive: true });
pageview.addEventListener('wheel', userScrolled, { passive: true });

/* ================= Mode Texte : lecture libre =================
   Le chapitre entier (mêmes paragraphes et photos qu'en mode Immersif), qu'on fait défiler soi-même.
   La position de lecture suit la ligne au tiers haut de l'écran : en repassant en Immersif ou en Rapide,
   la lecture reprend là où l'on en est. Chaque mot dépassé rapporte un point, dans la limite d'une vitesse
   plausible (1000 mots/min) pour qu'un défilement éclair ne compte pas. */
let txRaf = 0, txBudget = 0, txLast = 0, txTop = -1;
function txStart() { txBudget = 0; txLast = performance.now(); }
function renderTexte(j) {
  if (!pvBuilt) { buildPageInto(pvIn, PVS); cvWrap62(); pvBuilt = true; sizePage(); applyMarks(); applyCultes(); applyEmos(); }
  stopPageGlide();
  if (pvPara) { pvPara.classList.remove('here'); pvPara = null; }
  paraHL(null);
  pvLit = []; placeHighlight();
  const s = PVS[V[j]];
  if (!s) return;
  const r = s.getBoundingClientRect();
  pageview.scrollTop = Math.max(0, r.top - pvIn.getBoundingClientRect().top - pageview.clientHeight * RL + r.height / 2);
  txTop = pageview.scrollTop;
}
// premier mot dont le bas dépasse la ligne de lecture (recherche dichotomique : les mots sont dans l'ordre de la page)
function lineIndex() {
  const y = pageview.getBoundingClientRect().top + pageview.clientHeight * RL;
  let lo = 0, hi = N - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (PVS[V[m]].getBoundingClientRect().bottom < y) lo = m + 1; else hi = m;
  }
  return lo;
}
// toucher un mot : la lecture reprendra à cet endroit (le groupe de mots s'allume un instant)
function markResume(j) {
  k = j; S.k = k; persist(); progress();
  const ch = CH[CHOF[j]];
  pvLit = [];
  for (let i = ch.a; i <= ch.z; i++) { const sp = PVS[V[i]]; if (sp) pvLit.push(sp); }
  placeHighlight();
  txTop = pageview.scrollTop;
  toast('Reprise placée ici');
}
function texteScrolled() {
  txRaf = 0;
  if (S.read !== 'texte' || !pvBuilt || byId('reader').hidden) return;
  const j = lineIndex();
  const now = performance.now();
  txBudget = Math.min(400, txBudget + (now - txLast) * WPM_MAX / 60000);
  txLast = now;
  // un défilement de quelques pixels (toucher, ajustement du navigateur) ne déplace pas la position de lecture
  if (Math.abs(pageview.scrollTop - txTop) < 8) return;
  txTop = pageview.scrollTop;
  if (j === k) return;
  if (pvLit.length) { pvLit = []; placeHighlight(); }
  const e0 = EPI[k];
  for (let i = k; i < j; i++) if (!seen[i] && txBudget >= 1) { countWord(i); txBudget -= 1; }
  k = j;
  stage.dataset.played = '1';
  progress();
  for (let e = e0; e < EPI[k]; e++) texteEpisodeDone(e);
  if (++sinceSave >= 20) { sinceSave = 0; S.k = k; persist(); }
}
// un épisode lu en mode Texte (au moins 80 % des mots) compte comme terminé
function texteEpisodeDone(e) {
  if ((S.eps[e] && S.eps[e].done) || epRead[e] < ep80(e)) return;
  const info = settleEpisode(e, false);
  info.cheer = cheerFor(e, 0);
  openSlot(info, e === EPS.length - 1);
  if (chapterEndsAt(e)) sparkleStage();
  SFX.page(); buzz(12);
}
pageview.addEventListener('scroll', () => { if (S.read === 'texte' && !txRaf) txRaf = requestAnimationFrame(texteScrolled); }, { passive: true });

function renderWord(j) {
  const tk = T[V[j]];
  zoneIndex = j;
  applySeats(j);
  const zone = zoneOf(j);
  clearWord(centerEl);
  for (const s of SEATS) clearWord(seatEl[s]);
  const centred = S.mode === 'focus';
  const speech = tk.k !== 'n';
  centerEl.dataset.talk = zone === 'n' || centred ? '1' : '0';
  centerEl.dataset.speech = centred && speech ? '1' : '0';
  centerEl.dataset.th = centred && speech && tk.th ? '1' : '0';
  centerEl.dataset.inc = centred && tk.k === 'i' ? '1' : '0';
  sv73(centerEl, '--spk', centred && speech ? colorVar(tk.sp) : 'var(--gas)');
  setTag(j, tk);
  setStates(centred ? 'n' : zone, tk, false);
  if (!centred && zone !== 'n') setWord(seatEl[zone], tk, seatScale());
  else setWord(centerEl, tk, 1);
}
function renderCueWord(j) {
  const tk = T[V[j]];
  zoneIndex = j;
  applySeats(j);
  const zone = zoneOf(j);
  clearWord(centerEl);
  for (const s of SEATS) clearWord(seatEl[s]);
  setTag(j, tk);
  if (S.mode === 'scene') {
    setStates(zone, tk, true);
    centerEl.dataset.talk = zone === 'n' ? '1' : '0';
  } else {
    const speech = tk.k !== 'n';
    centerEl.dataset.speech = speech ? '1' : '0';
    sv73(centerEl, '--spk', speech ? colorVar(tk.sp) : 'var(--gas)');
  }
}

/* ================= Sons, vibrations, effets ================= */
let AC = null;
function unlockAudio() {
  if (!S.sound) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}
function tone(f, t0, dur, type, vol) {
  if (!S.sound || !AC) return;
  try {
    const t = AC.currentTime + t0;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur + .03);
  } catch (e) { /* audio indisponible */ }
}
function noise(t0, dur, vol) {
  if (!S.sound || !AC) return;
  try {
    const len = Math.floor(AC.sampleRate * dur);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .8; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(AC.destination);
    src.start(AC.currentTime + t0);
  } catch (e) { /* audio indisponible */ }
}
const SFX = {
  coin() { tone(1318.5, 0, .1, 'square', .03); tone(1975.5, .07, .2, 'square', .028); },
  coins(n) { for (let i = 0; i < n; i++) { tone(1568 + (i % 3) * 196, i * .07, .09, 'square', .022); } },
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .085, .22, 'triangle', .07)); },
  flip() { noise(0, .16, .25); },
  rank() { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * .09, .32, 'triangle', .075)); },
  jackpot() { for (let i = 0; i < 10; i++) tone(1046.5 + (i % 4) * 262, i * .06, .12, 'square', .025); },
  heart() { tone(880, 0, .12, 'sine', .06); tone(1174.7, .07, .18, 'sine', .055); },
  // fin d'épisode : une page qu'on tourne, et une note douce
  page() { noise(0, .24, .1); tone(783.99, .14, .3, 'sine', .028); },
  soft() { tone(659.25, 0, .25, 'sine', .03); tone(987.77, .1, .35, 'sine', .026); }
};
function buzz(p) { try { if (S.vibe && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* non pris en charge */ } }
let toastT = 0;
function hideToast() { clearTimeout(toastT); byId('toast').classList.remove('on'); }
function toast(msg) {
  const t = byId('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2400);
}

/* ================= Points et niveaux ================= */
const fmtInt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtPts = (n) => fmtInt(n) + (Math.abs(n) > 1 ? ' points' : ' point');
function levelOf(pts) { let r = 0; LEVELS.forEach((x, i) => { if (pts >= x.p) r = i; }); return r; }
// progression dans le niveau en cours : { lv, frac, need } (need = points manquants pour le suivant)
function levelInfo(pts) {
  const lv = levelOf(pts), cur = LEVELS[lv], nx = LEVELS[lv + 1];
  if (!nx) return { lv, frac: 1, need: 0 };
  return { lv, frac: (pts - cur.p) / (nx.p - cur.p), need: nx.p - pts };
}
function dayRec() {
  const t = today(0);
  if (!S.day || S.day.d !== t) S.day = { d: t, pts: 0, done: false };
  return S.day;
}
function paintPill(btn, bump) {
  const li = levelInfo(S.pts);
  $('.pv', btn).textContent = fmtInt(S.pts);
  $('.xp i', btn).style.setProperty('--p', Math.round(li.frac * 100) + '%');
  if (bump && !REDUCED) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
}
function updatePts(bump) { paintPill(byId('purse'), bump); paintPill(byId('homePts'), false); }
// live = pendant la lecture : rien ne s'affiche au milieu d'une phrase ; un nouveau niveau ou l'objectif atteint
// sont annoncés dans le bandeau de fin d'épisode
function addPoints(n, live) {
  S.pts += n;
  const d = dayRec();
  d.pts += n;
  updatePts(live && S.pts % 100 < n);
  if (!live) return;
  const lv = levelOf(S.pts);
  if (lv > S.lvlSeen) {
    S.lvlSeen = lv;
    persist();
  } else if (!d.done && d.pts >= S.goal) {
    d.done = true;
    persist();
  }
}
// livres que les points viennent de débloquer (et qu'on n'a pas encore annoncés)
function newUnlocks() {
  const out = BOOKS.filter((b) => !b.ok && S.pts >= b.pts && !S.unl.includes(b.id));
  out.forEach((b) => S.unl.push(b.id));
  return out;
}
const isOpen = (b) => b.ok || S.pts >= b.pts;
function nextLocked() { return BOOKS.find((b) => !b.ok && S.pts < b.pts) || null; }
function drawLuck() {
  if (Math.random() > LUCK_RATE) return null;
  let x = Math.random() * LUCK.reduce((s, l) => s + l.w, 0);
  for (const l of LUCK) { x -= l.w; if (x <= 0) return l; }
  return LUCK[0];
}
function today(offset) {
  const d = new Date(); d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function bumpStreak() {
  const t = today(0);
  if (S.streak.last === t) return;
  S.streak.n = S.streak.last === today(-1) ? S.streak.n + 1 : 1;
  S.streak.last = t;
  S.streak.best = Math.max(S.streak.best || 0, S.streak.n);
}
function streakNow() { return S.streak.last === today(0) || S.streak.last === today(-1) ? S.streak.n : 0; }
function countUp(node, from, to, ms) {
  if (REDUCED || from === to) { node.textContent = fmtInt(to); return; }
  const t0 = performance.now();
  const stepF = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmtInt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(stepF);
  };
  requestAnimationFrame(stepF);
}
// anneau de progression (objectif du jour)
function setRing(svg, frac) {
  const c = $('.fg', svg), r = 25, L = 2 * Math.PI * r;
  c.style.strokeDasharray = L.toFixed(1);
  c.style.strokeDashoffset = (L * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1);
  svg.classList.toggle('done', frac >= 1);
}

/* ================= Lecture ================= */
let k = Math.min(Math.max(0, S.k | 0), N - 1);
let playing = false, timer = 0, lead = false, wakeLock = null, sinceSave = 0, lastCounted = -1, speedHack = 0;
const epRead = new Array(EPS.length).fill(0);
const epPaused = new Array(EPS.length).fill(false);
const CUEF = [.55, 1, 1.6];
const SLOW_F = 1.25;   // pendant un message en haut ou quand le coffre attend : l'œil a le temps de voir, puis de revenir au texte
let rampT0 = 0;
const RAMP_MS = 6000, RAMP_F0 = .6;
function rampF() {
  if (!rampT0) return 1;
  const t = (performance.now() - rampT0) / RAMP_MS;
  if (t >= 1) { rampT0 = 0; return 1; }
  return RAMP_F0 + (1 - RAMP_F0) * t * t * (3 - 2 * t);
}
const baseMs = () => speedHack || 60000 / S.wpm * 1 / rampF();
function cueMs(j) {
  let d = baseMs() * 1.15 * CUEF[S.cue];
  if (S.mode === 'scene' && SCENE[j] !== SCENE[j - 1]) d += baseMs() * 1.2 * CUEF[S.cue];
  return d;
}
const seen = new Uint8Array(N);   // mots déjà comptés pendant cette séance
function countWord(j) {
  if (seen[j]) return;
  seen[j] = 1;
  epRead[EPI[j]]++;
  S.words = (S.words || 0) + 1;
  addPoints(1, true);
  onWord(j);
  if (S.words % 1000 === 0) milestone();
  if (BET_END.has(j)) betReveal(BET_END.get(j));
}
// mode Page : un groupe de mots à la fois ; mode Mot à mot : un mot à la fois
function step() { if (voiceOn()) { vStep(); return; } if (S.read === 'rsvp') stepWord(); else if (S.read === 'page') stepGroup(); }
// le temps que l'œil se pose sur un groupe, et sa durée minimale, suivent la vitesse choisie
// (à 300 mots/min : 120 ms de plus par groupe, 420 ms au moins), pour que 1000 mots/min soient vraiment atteints
const groupGap = () => baseMs() * .6;
const groupMin = () => baseMs() * 2.1;
// le pas suivant ; « hold » : temps d'arrêt au début (présentation d'un personnage), qu'un toucher peut abréger
let holdEnd = 0, holdCb = null, holdDue = 0;
function later(cb, d, hold) {
  const now = performance.now();
  timer = setTimeout(cb, d);
  holdCb = cb; holdDue = now + d; holdEnd = hold ? now + hold : 0;
  if (hold) stage.dataset.meet = '1';
}
function skipHold() {
  const now = performance.now();
  if (!playing || holdEnd <= now) return false;
  const cutMs = holdEnd - now;
  clearTimeout(timer);
  holdDue -= cutMs;
  timer = setTimeout(holdCb, Math.max(0, holdDue - now));
  if (sw && sw.t0 > now) sw.t0 = now;
  holdEnd = 0;
  hideMeet();
  buzz(8);
  return true;
}
function stepGroup() {
  if (!playing) return;
  const ch = CH[CHOF[k]];
  k = ch.a;
  sweepNext = !speedHack;
  render(k);
  progress();
  let w = 0;
  for (let j = ch.a; j <= ch.z; j++) { countWord(j); w += j < ch.z ? Math.min(W[j], 1.15) : W[j]; }
  let d = speedHack ? w * baseMs() : Math.max(groupMin(), w * baseMs()) + groupGap();
  if (setSuspense(ch.a) && !speedHack) d *= 1.35;
  const n = ch.z + 1;
  // quand la voix change, un petit temps d'arrêt avant la réplique (ou le récit) qui suit
  if (n < N && EPI[n] === EPI[ch.z] && zoneOf(n) !== zoneOf(ch.z)) d += cueMs(n) * (zoneOf(n) === 'n' ? 1.3 : 1.7);   // on laisse arriver la réplique
  // le ruban se remplit pendant le temps de lecture du groupe (sans la courte respiration qui suit)
  // un nouveau personnage arrive : la lecture s'arrête le temps de le présenter, puis reprend
  let hold = 0;
  if (meetHold) { hold = speedHack ? 0 : 3000; meetHold = null; }
  runSweep(d * .97, hold);
  d += hold;
  if (beatMs) { d += beatMs; beatMs = 0; }   // une pastille ou un coffre vient d'apparaître : une seconde pour le toucher
  if (!speedHack) stopPageGlide();
  if (lead) { d += speedHack ? 0 : 450; lead = false; }
  later(() => {
    if (!playing) return;
    if (ch.z >= N - 1) { k = ch.z; endEpisode(EPI[ch.z], true); return; }
    if (EPI[n] !== EPI[ch.z]) { k = n; S.k = k; endEpisode(EPI[ch.z], false); return; }
    k = n;
    tick();
  }, d, hold);
}
function stepWord() {
  if (!playing) return;
  render(k);
  progress();
  countWord(k);
  let d = W[k] * baseMs();
  let wHold = 0;
  if (meetHold) { if (!speedHack) { d += 3000; wHold = 3000; } meetHold = null; }
  if (setSuspense(k) && !speedHack) d *= 1.35;
  if (beatMs) { d += beatMs; beatMs = 0; }
  if (lead) { d += speedHack ? 0 : 450; lead = false; }
  later(() => {
    if (!playing) return;
    if (k >= N - 1) { endEpisode(EPI[k], true); return; }
    const n = k + 1;
    if (EPI[n] !== EPI[k]) { const e = EPI[k]; k = n; S.k = k; endEpisode(e, false); return; }
    if (zoneOf(n) !== zoneOf(k)) {
      renderCue(n);
      timer = setTimeout(() => { k = n; tick(); }, cueMs(n));
    } else { k = n; tick(); }
  }, d, wHold);
}
function tick() {
  if (++sinceSave >= 20) { sinceSave = 0; S.k = k; persist(); }
  step();
}
function play() {
  if (playing || S.read === 'texte') return;   // en mode Texte, on lit à son rythme

  if (k >= N - 1 && EPI[k] === EPS.length - 1 && S.eps[EPS.length - 1] && S.eps[EPS.length - 1].done && epRead[EPS.length - 1] > 0) k = 0;
  playing = true; lead = true; playT = performance.now(); segT = playT;
  inter = false;
  if (!(EPI[k] === EPS.length - 1 && k >= N - 1)) byId('epCard').hidden = true;
  stage.dataset.end = '0';
  pvUserScroll = false;
  stage.dataset.playing = '1';
  stage.dataset.played = '1';
  setPlayIcon();
  if (!inter) dropGo();
  wake();
  zenLater(1600);
  flowLater();
  step();
}
let playT = 0;   // début de la lecture en cours (pour le temps de lecture total)
function halt() {
  segStop(EPI[k]);
  playing = false;
  if (playT) { S.readMs = (S.readMs || 0) + (performance.now() - playT); playT = 0; }
  clearTimeout(timer);
  vStop(); beatMs = 0;
  if (!FRZ70) stage.dataset.playing = '0';
  setPlayIcon();
  unwake();
  if (!FRZ70) { zenOff(); flowOff(); } else { clearTimeout(zenT); clearTimeout(flowT); }
  S.k = k; persist();
}
// Immersion : les commandes s'effacent quand la lecture tourne, et reviennent à l'arrêt ou au mouvement de la souris
const readerEl = byId('reader');
let zenT = 0;
function zenOff() { clearTimeout(zenT); readerEl.dataset.zen = '0'; }
// mode « dans le flux » : après une minute de lecture sans pause ni toucher, il ne reste que le texte et le soulignement
let flowT = 0, FLOW_MS = 60000;
function flowOff() { clearTimeout(flowT); readerEl.dataset.flow = '0'; }
function flowLater() {
  clearTimeout(flowT);
  if (S.flow === false || !playing) return;
  flowT = setTimeout(() => { if (playing && S.flow !== false && S.read !== 'texte' && !byId('reader').hidden) readerEl.dataset.flow = '1'; }, FLOW_MS);
}
function zenLater(ms) {
  clearTimeout(zenT);
  if (!S.zen || !playing) return;
  zenT = setTimeout(() => { if (playing && S.zen) readerEl.dataset.zen = '1'; }, ms);
}
readerEl.addEventListener('mousemove', () => {
  if (readerEl.dataset.flow === '1') { flowOff(); flowLater(); }
  if (readerEl.dataset.zen === '1') { zenOff(); zenLater(2200); }
});
function pause() {
  clearTimeout(rxResumeT);
  if (betOpen) { clearTimeout(betT); hideBet(); }
  if (gameOpen && !gameWas) closeGame(false);   // l'icône reste : on peut rouvrir le pari
  meetHold = null; hideMeet();
  if (!playing) return;
  if (!inter) epPaused[EPI[k]] = true;
  runP = -1;
  inter = false;
  halt();
  pauseDraw68();
}
function toggle() { if (S.read === 'texte') return; if (playing) pause(); else play(); }
function seek(j) {
  j = Math.min(Math.max(0, j), N - 1);
  clearTimeout(timer);
  if (playing) vStop();
  pvUserScroll = false;
  k = j;
  render(k); progress();
  S.k = k; persist();
  if (playing) timer = setTimeout(step, 380);
}
function sentenceAt(j) {
  let lo = 0, hi = SENT.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SENT[m] <= j) lo = m; else hi = m - 1; }
  return lo;
}
function prevSentence() {
  const i = sentenceAt(k);
  const margin = S.read === 'page' ? 0 : 2;
  seek(k - SENT[i] > margin || i === 0 ? SENT[i] : SENT[i - 1]);
}
function nextSentence() {
  const i = sentenceAt(k);
  if (i + 1 < SENT.length) seek(SENT[i + 1]);
}
function setPlayIcon() {
  byId('playIcon').setAttribute('d', playing ? 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z' : 'M8 5v14l11-7z');
  byId('playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
}
function wake() {
  try {
    if (S.awake && !wakeLock && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then((l) => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
    }
  } catch (e) { /* refusé */ }
}
function unwake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignoré */ } wakeLock = null; }

/* ================= Progression ================= */
function seconds(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0');
}
// durée arrondie à la demi-minute sous 10 min (1 min 30, 2 min…), à la minute au-delà
function minutes(ms) {
  const m = ms / 60000;
  if (m >= 10) return Math.round(m) + ' min';
  const h = Math.max(1, Math.round(m * 2) / 2);
  return h % 1 ? Math.floor(h) + ' min 30' : h + ' min';
}
function spanMs(a, z) {
  let cues = 0;
  for (const u of UNITS) if (u.a >= a && u.a <= z) cues += 2;
  const base = 60000 / S.wpm;
  // en mode Page, chaque groupe de mots garde en plus un court temps de pause (voir stepGroup)
  const groups = S.read === 'page' ? CHOF[z] - CHOF[a] + 1 : 0;
  return (PW[z + 1] - PW[a]) * base + cues * base * 1.15 * CUEF[S.cue] + groups * base * .6;
}
const stories = byId('stories');
function buildStories() {
  EPS.forEach((ep, e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', chapLabel(chapOfEp(e)) + ', épisode ' + (ep.i + 1) + ' : ' + ep.title);
    b.append(document.createElement('i'));
    b.addEventListener('click', () => { unlockAudio(); startEpisode(e, playing); });
    stories.append(b);
  });
}
function progress() {
  const e = EPI[k], ep = EPS[e];
  const within = ep.n > 1 ? (k - ep.a) / (ep.n - 1) : 1;
  const full62 = stories._c !== ep.c || stories._e !== e || stories.children.length !== stories._n;
  stories._c = ep.c; stories._e = e; stories._n = stories.children.length;
  Array.from(stories.children).forEach((b, i) => {
    if (!full62 && i !== e) return;
    const hid = EPS[i].c !== ep.c;
    if (b.hidden !== hid) b.hidden = hid;
    const f = (i < e ? 100 : i === e ? Math.round(within * 100) : 0) + '%';
    if (b._f !== f) { b._f = f; b.firstChild.style.setProperty('--f', f); }
  });
  const tt62 = byId('epTitle');
  if (tt62.dataset.e62 !== String(e) || !tt62.firstChild) {
    tt62.dataset.e62 = String(e);
    tt62.innerHTML = '';
    const num = document.createElement('span'); num.className = 'num'; num.textContent = (ep.i + 1) + '/' + chapOfEp(e).eps.length;
    tt62.append(num, document.createTextNode(ep.title));
  }
  const me62 = 'Encore ' + seconds(spanMs(k, ep.z)) + ' dans cet épisode';
  if (byId('metaEp').textContent !== me62) byId('metaEp').textContent = me62;
  {
    const left = minutes(spanMs(k, chapOfEp(e).z));
    const h = byId('hudTime');
    if (h.dataset.v !== left) {
      h.dataset.v = left;
      h.replaceChildren(el('span', 'lg', 'Fin du ' + UNIT), el('b', '', 'dans ' + left));   // en haut du cadre, à l'arrêt
      h.setAttribute('aria-label', 'Fin du ' + UNIT + ' dans ' + left);
    }
  }
  { const a62 = S.amb && /^[a-z]+$/.test(AMB[e] || '') ? 'var(--amb-' + AMB[e] + ')' : 'transparent'; if (stage._amb !== a62) { stage._amb = a62; sv73(stage, '--amb', a62); } }
  if (S.amb && (S.read === 'page' || S.read === 'texte')) setAmb(AMB[e]); else stopAmb();
  paintLight(e, within);
  paintBetChips();
  paintRoulette();
  paintGames();
  chestCheck();
  if (juronC && (k > juronC.j + 12 || k < juronC.j - 40)) missJuron();
  { const mc62 = chapLabel(chapOfEp(e)) + ' · ' + chapPct(k) + ' %'; if (byId('metaChap').textContent !== mc62) byId('metaChap').textContent = mc62; }
  paintRun();
}


/* Ambiance de la marge de gauche : de petites particules, lentes et pâles, selon le lieu de l'épisode
   (ambiances du livre : cafe, nuit, redac, velours, jardin). Elles ne tournent que pendant la lecture à l'écran. */
// la lumière de l'heure : une teinte très douce sur tout le cadre (plus marquée en haut), qui glisse pendant l'épisode
// vers celle de l'épisode suivant (dans le même chapitre) ; la transition CSS, lente, rend le passage presque invisible
const LUM = BOOK.lumieres || [];
const lumEl = byId('lum');
let lumKey = '';
function paintLight(e, f) {
  const a = LUM[e];
  const b = e + 1 < EPS.length && EPS[e + 1].c === EPS[e].c && LUM[e + 1] ? LUM[e + 1] : a;
  if (!S.amb || !a || !/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b)) {
    if (lumKey) { lumEl.style.backgroundColor = 'transparent'; lumKey = ''; stage.dataset.lum = ''; }
    return;
  }
  const p = a === b ? 0 : Math.min(100, Math.round(f * 10) * 10);
  const key = a + '>' + b + ':' + p;
  if (key === lumKey) return;
  lumKey = key;
  stage.dataset.lum = p >= 50 ? b : a;
  lumEl.style.backgroundColor = p ? 'color-mix(in srgb, var(--lt-' + b + ') ' + p + '%, var(--lt-' + a + '))' : 'var(--lt-' + a + ')';
}
const ambBox = byId('ambfx');
let ambKind = '', ambTimer = 0;
const LETTERS = 'aeémrstuçàè§&?!';
const AMB_FX = {
  cafe: { every: 850, max: 7, make(o, w) {   // vapeur qui monte d'une tasse
    o.style.left = (w * (.25 + Math.random() * .5)) + 'px';
    o.style.setProperty('--s', (8 + Math.random() * 10) + 'px');
    o.style.setProperty('--d', (5 + Math.random() * 3) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 16) + 'px');
  } },
  nuit: { every: 700, max: 9, make(o, w) {   // étoiles qui scintillent
    o.style.left = (Math.random() * (w - 4)) + 'px';
    o.style.top = (5 + Math.random() * 88) + '%';
    o.style.setProperty('--s', (2 + Math.random() * 2.5) + 'px');
    o.style.setProperty('--d', (2.6 + Math.random() * 2.4) + 's');
  } },
  redac: { every: 1100, max: 6, make(o, w) { // lettres d'imprimerie qui descendent
    o.textContent = LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
    o.style.left = (Math.random() * Math.max(1, w - 12)) + 'px';
    o.style.setProperty('--s', (10 + Math.random() * 6) + 'px');
    o.style.setProperty('--d', (7 + Math.random() * 4) + 's');
    o.style.setProperty('--rot', ((Math.random() - .5) * 60) + 'deg');
  } },
  velours: { every: 750, max: 8, make(o, w) { // paillettes du music-hall qui flottent
    o.style.left = (Math.random() * (w - 6)) + 'px';
    o.style.setProperty('--s', (3 + Math.random() * 4) + 'px');
    o.style.setProperty('--d', (5 + Math.random() * 3) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 20) + 'px');
    o.style.setProperty('--c', Math.random() < .35 ? 'var(--gold)' : 'var(--fx-2)');
  } },
  salon: { every: 800, max: 8, make(o, w) {  // lueurs dorées des bougies et des cristaux, qui flottent et scintillent
    o.style.left = (Math.random() * Math.max(1, w - 6)) + 'px';
    o.style.top = (20 + Math.random() * 70) + '%';
    o.style.setProperty('--s', (2.5 + Math.random() * 3) + 'px');
    o.style.setProperty('--d', (4 + Math.random() * 3) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 14) + 'px');
  } },
  jardin: { every: 1300, max: 5, make(o, w) { // feuilles qui tombent en tournoyant
    o.style.left = (Math.random() * Math.max(1, w - 10)) + 'px';
    o.style.setProperty('--s', (7 + Math.random() * 5) + 'px');
    o.style.setProperty('--d', (7 + Math.random() * 4) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 24) + 'px');
    o.style.setProperty('--rot', (180 + Math.random() * 360) + 'deg');
  } }
};
function ambActive() {
  return S.amb && !REDUCED && !document.hidden && !byId('reader').hidden && (S.read === 'page' || S.read === 'texte') && !!AMB_FX[ambKind];
}
function ambSpawn() {
  if (!ambActive()) return;
  const fx = AMB_FX[ambKind];
  if (ambBox.childElementCount >= fx.max) return;
  const o = el('span', 'af af-' + ambKind);
  fx.make(o, ambBox.clientWidth || 20);
  o.addEventListener('animationend', () => o.remove());
  ambBox.append(o);
}
function setAmb(kind) {
  const k2 = AMB_FX[kind] ? kind : '';
  if (k2 === ambKind && (ambTimer || !k2)) return;
  ambKind = k2;
  clearInterval(ambTimer); ambTimer = 0;
  ambBox.dataset.kind = k2;
  ambBox.replaceChildren();
  if (!k2) return;
  ambSpawn();
  ambTimer = setInterval(ambSpawn, AMB_FX[k2].every);
}
function stopAmb() { clearInterval(ambTimer); ambTimer = 0; ambKind = ''; ambBox.replaceChildren(); }


/* ================= Découvertes pendant la lecture =================
   Phrases cultes (liste du livre), premières répliques des personnages, suspense et série sans pause.
   Tout se passe dans les marges ou sur la ligne lue, sans arrêter la lecture. */
const CULTE_PTS = 25;
const epCulte = new Array(EPS.length).fill(0);
const normTxt = (t) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
// v102 : les phrases normalisées sont calculées une seule fois (avant : trois fois au démarrage), puis jointes en un seul
// texte où l'on cherche d'un coup (avant : un appel par phrase et par recherche, soit des millions au démarrage)
let NS102 = null, NJ102 = '', NO102 = null;
function nsents102() {
  if (!NS102) {
    NS102 = SENT.map((a, si) => normTxt(sentenceText(si)));
    NO102 = new Int32Array(NS102.length + 1);
    let o = 0;
    for (let i = 0; i < NS102.length; i++) { NO102[i] = o; o += NS102[i].length + 1; }
    NO102[NS102.length] = o;
    NJ102 = NS102.join('\u0001');   // séparateur absent des textes normalisés : une recherche ne déborde jamais d'une phrase
  }
  return NS102;
}
// première phrase (à partir de « from ») qui contient np : même résultat que sents.findIndex((s) => s.includes(np))
function sentOf102(np, from) {
  nsents102();
  from = from || 0;
  if (from >= NS102.length) return -1;
  const pos = NJ102.indexOf(np, NO102[from]);
  if (pos < 0) return -1;
  let lo = from, hi = NS102.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (NO102[m] <= pos) lo = m; else hi = m - 1; }
  return lo;
}
// chaque phrase culte : sa phrase dans le texte (début et fin, en mots affichés)
const CULTES = [];
{
  (BOOK.cultes || []).forEach((q) => {
    const nq = normTxt(q);
    const si = sentOf102(nq);
    if (si < 0) return;
    CULTES.push({ si, a: SENT[si], z: si + 1 < SENT.length ? SENT[si + 1] - 1 : N - 1 });
  });
}
const CULTE_END = new Map(CULTES.map((c) => [c.z, c]));
const CULTE_START = new Map(CULTES.map((c) => [c.a, c]));
// paris : la question s'ouvre juste avant la phrase qui donne la réponse ; le verdict tombe à la fin de cette phrase
// mots d'émotion et gros mots : un extrait exact de la phrase et le mot ; on retrouve le mot affiché
// v102 : le résultat est gardé (le texte ne change pas ; plusieurs écrans redemandent les mêmes ancrages)
function wordIn(phrase, mot) {
  const m = wordIn.m || (wordIn.m = new Map()), k = phrase + '\u0002' + mot;
  let r = m.get(k);
  if (r === undefined) { r = wordIn0102(phrase, mot); m.set(k, r); }
  return r;
}
function wordIn0102(phrase, mot) {
  const np = normTxt(phrase), nm = normTxt(mot);
  for (let si = sentOf102(np); si >= 0; si = sentOf102(np, si + 1)) {
    const a = SENT[si], z = si + 1 < SENT.length ? SENT[si + 1] - 1 : N - 1;
    for (let j = a; j <= z; j++) {
      const t = normTxt(T[V[j]].t);
      if (t === nm || t.split(' ').includes(nm) || t.replace(/^\p{L}+'/u, '') === nm.replace(/^\p{L}+'/u, '')) return j;
    }
  }
  return -1;
}
let sentsW = null;
const EMO = { amour: '❤️', rire: '😂', triste: '😢' };
const EMOS = [].map((x) => ({ j: wordIn(x.phrase, x.mot), type: EMO[x.type] ? x.type : '' })).filter((x) => x.j >= 0 && x.type);
const JURONS = (BOOK.jurons || []).map((x, i) => ({ id: String(i), j: wordIn(x.phrase, x.mot), mot: x.mot.replace(/^\p{L}+['’]/u, '') })).filter((x) => x.j >= 0);
const JURON_AT = new Map(JURONS.map((x) => [x.j, x]));
function applyEmos() {
  if (!pvBuilt) return;
  EMOS.forEach((x) => { const s = PVS[V[x.j]]; if (s) { s.classList.add('emo-w'); s.dataset.emo = x.type; } });
}
// un mot d'émotion touché : de petits émojis sautent du mot, puis retombent
function emoBurst(w) {
  const type = w.dataset.emo, ch = EMO[type];
  if (!ch) return;
  buzz(8);
  if (type === 'amour') SFX.heart(); else SFX.soft();
  w.classList.remove('emo-pop'); void w.offsetWidth; w.classList.add('emo-pop');
  if (REDUCED) return;
  const sr = stage.getBoundingClientRect(), r = w.getBoundingClientRect();
  const x0 = r.left - sr.left + r.width / 2, y0 = r.top - sr.top + r.height / 2;
  for (let i = 0; i < 8; i++) {
    const o = el('span', 'emo-fly emo-' + type);
    o.innerHTML = '<span class="emo" aria-hidden="true">' + ch + '</span>';
    o.style.left = x0 + 'px'; o.style.top = y0 + 'px';
    o.style.setProperty('--dx', ((Math.random() - .5) * 150) + 'px');
    o.style.setProperty('--up', -(50 + Math.random() * 70) + 'px');
    o.style.setProperty('--fall', (40 + Math.random() * 60) + 'px');
    o.style.setProperty('--rot', ((Math.random() - .5) * 70) + 'deg');
    o.style.setProperty('--sz', (16 + Math.random() * 10) + 'px');
    o.style.setProperty('--dl', (i * .04) + 's');
    o.style.setProperty('--d', (1 + Math.random() * .5) + 's');
    o.addEventListener('animationend', () => o.remove());
    stage.append(o);
  }
}
/* ================= Mini-jeux : lieux, personnages historiques, étymologie =================
   Quand la lecture passe sur le mot, une pastille apparaît en haut à droite pendant une cinquantaine de mots.
   On la touche si on veut : la lecture attend (sans compter comme une pause), le jeu s'ouvre au centre. Un essai par jeu. */
const CARTES = {"monde":{"vb":[0,0,720,330],"pays":{"FJ":"M720 198.1L720 199.1L717.5 200L717.2 199.3L720 198.1ZM716.3 201L717.4 201.3L717.1 202.3L714.8 202.3L715.3 200.8L716.3 201ZM0.4 198L0 199.1L0.4 198Z","TZ":"M427.8 167.9L435.4 172.2L435.5 173.4L438.4 175.4L437.5 177.8L438.9 179.7L438.4 183L440.6 186.6L439 187.8L433 189.4L429.1 189L427.5 184.8L421.5 182.7L419.2 179L418.7 175L421.5 172.7L420.9 170.8L421.6 169.4L420.8 168.3L427.8 167.9Z","EH":"M342.7 110.7L342.6 114.2L336.1 114.1L336.1 119.3L334.3 119.4L334.1 123.3L326.3 123.3L325.9 124L326 123.2L330.5 123L332.2 118.6L335 116.5L337.2 112.2L342.4 111.8L342.7 110.7Z","CA":"M114.3 68L105.1 64.3L104 62.6L104.3 61.3L101.7 60.5L101.4 58.9L99 57.4L100 54.2L96.6 52.9L93.3 49.2L89 46.4L85.1 48.2L81.9 46L78 45.4L78 26.6L87 28.2L91.2 26.7L94.1 27L100.4 25.6L101.8 26.4L103.7 25L108.5 27L111.2 25.7L111.4 27.2L117.1 26.4L129.5 28.2L132.2 29.2L129.4 30.2L140.1 30L142.2 31.2L144.4 30.2L142.4 29.4L143.7 28.7L147.7 28.4L151.3 30L157.1 30.7L163.1 30.4L162.9 29.2L164.7 28.8L167.8 29.5L167.7 31.4L169 29.8L170.6 29.9L171.5 27.9L167.1 25.8L167.2 23.6L169.6 22.2L174.2 23.4L177 25.6L175.2 26.6L178.9 27L178.9 29.1L181.6 27.5L184 28.8L183.4 30.3L185.3 31.6L188.8 28.4L189 26.2L194.8 26.7L197.4 27.7L197.6 28.7L196.1 29.7L197.5 30.8L197.2 31.8L193.3 33.2L188.5 32.9L185.4 36.4L178.6 38.8L178.5 40.1L176.1 40.3L171.5 44.2L170.6 48.1L173.6 48.4L175.4 51.8L178.2 51.4L190 55.4L195.5 55.7L195.7 59.4L197.2 61.7L200.2 63.6L201.7 62.9L202.8 60.9L201.8 57.7L200.3 56.7L203.5 55.7L206.9 52.9L205.4 49.9L203 48.4L205.3 46.3L203.8 41.4L212.3 41.1L217.3 43.7L220.8 43.9L221.4 48.1L224.7 49.6L227.6 48.5L230.8 45.3L237.2 52.1L236.4 53.3L245.3 56.7L246.1 58.4L248.5 59.5L248.6 61.7L239.9 65.5L227.2 65.5L217.8 72.4L222.7 69.4L229.9 67.5L231.7 68.5L229.8 69.9L231.1 73.5L233.7 74.5L237 74.2L239 72L239.1 73.4L240.4 74.2L229.3 78.9L227.8 78.8L227.7 77.1L231.1 75.4L225.7 75.7L224.4 74.6L224.4 71.9L221.5 71.1L218.7 75.1L217 76L210.3 76L206.4 78.7L202.6 78.7L201.7 79.1L202.1 80.3L195.1 82.6L193.7 82L195.7 78.9L194.9 75.3L190.2 72.2L183.2 69.4L176.7 69.7L171.3 68.7L170.4 67.2L169.7 68L114.3 68ZM192 41.1L196.2 40.2L193.9 41.7L192 41.1ZM200.4 20.4L198.2 19.3L199.3 18.5L203.9 18.7L207.5 20.3L200.4 20.4ZM199.4 41.8L201.5 41.7L200.7 42.7L199.4 41.8ZM172.8 16L171.7 16.8L166.4 16.1L170.3 14.7L172.8 16ZM172.3 11L167.1 10.3L172.3 11ZM166.5 8.5L168.9 9.2L165.4 10.3L163.8 9.8L162.7 8.3L166.5 8.5ZM183.7 17.2L175.2 16.3L174.2 14.2L172.2 13.4L165.8 12.5L166.5 11.7L176.8 12.4L178.5 13.1L178.1 13.9L181.6 14.8L197.7 14.6L199.9 15.3L200.3 16.2L199.1 16.7L183.7 17.2ZM137.5 9.7L140.3 10L139.6 10.6L135.9 11.2L132.9 10.5L137.5 9.7ZM138.1 8.4L140.7 8.8L134.9 9.2L138.1 8.4ZM248.8 63.4L246.4 66.4L247.7 65.7L249.1 66.1L248.4 66.8L253 67.5L252.4 69L253.8 68.6L254.7 70.9L253.9 72.7L251.6 72.4L251.5 70.5L249.2 72.2L248 72.2L249.4 71.2L247.5 70.7L241.5 70.8L242.4 69.5L241.5 69L245.3 64.6L248.3 62.7L249.2 62.8L248.8 63.4ZM192.2 35.8L199.8 38.5L198 39.2L193.8 37.8L189 39.9L188.3 38.7L185.6 38.9L187.3 37.9L188.2 34.5L192.2 35.8ZM202.5 21.3L204.4 20.5L211.5 22.5L211.8 23.3L215.5 22.9L217.6 24.2L222.4 24.9L226.1 27.6L222.4 28.6L230.3 30.3L233.2 32.1L236.3 32.3L235.7 33.7L232.2 36L226.6 33.2L224 33.5L223.7 34.6L229.4 37.2L230.7 39.2L230 40.7L222.4 38.5L227.7 42.1L218 40.2L215.5 39.2L216.2 38.6L210.3 36.6L204.6 37.5L202.9 36.9L204.2 35.4L212.1 35.1L211.4 34.4L212.1 33.4L214.7 31.4L213.4 29.9L206.3 28.2L207.5 27.7L202.1 25.7L197.4 26.5L182.6 25.2L181 24.5L183.1 23.6L180.2 23.6L179.6 21.5L183.2 18.9L188.3 18.4L186.9 19.7L188.5 20.9L190.3 19.3L195.4 18.5L198.8 20.6L198.5 21.9L202.5 21.3ZM171 17.7L179 18.3L171.5 22L169.2 21.9L168 19.1L171 17.7ZM114.3 13.8L121.8 11L127.6 10.7L127.3 12.2L125.8 12.9L117 14.2L114.3 13.8ZM94.6 57.9L96.5 57.8L95.9 60L97.6 61.6L93.9 59.2L93.6 57.7L94.6 57.9ZM149 7.4L158.3 8.4L160.7 10.2L149.6 9.2L151.6 8.6L149.2 8.2L149 7.4ZM113 69L108.7 68.3L103.9 66L103.3 64.5L108.5 65.4L113 69ZM116.9 17.1L124.9 17.6L129 19L121.6 21L119.1 22.4L119.1 23.2L113.8 24.2L108.1 22.3L112.1 18.6L110.2 17.4L116.9 17.1ZM144.4 14.3L148.2 14.1L148.6 15L147.4 16L135.6 17.2L132.3 16.6L136.4 15.7L124.6 15.6L129.2 13L141.9 15.1L139 13.1L140.8 12.4L142.9 12.6L144.4 14.3ZM147 19.8L149.2 20.7L151.1 24L158 26L157.8 26.8L154.5 27L155.8 27.8L155.1 28.5L148.1 27.6L133.4 28.9L132.3 28L127.8 27.7L125.3 26.1L135.2 25.3L124.2 24.9L123.1 24.2L127.8 23.4L121.2 22.9L124.3 20.6L129.6 19.4L131.7 19.8L130.7 20.7L135.1 20.1L137.9 21.1L140.2 20.1L143.6 22.7L144.6 21.9L143.2 19.8L147 19.8ZM159.1 20.6L156.9 19.3L159.3 18.3L165.2 18.5L165.8 19.1L163.9 20L166.9 20.9L166.6 22.7L163.3 23.5L155 21L155 20.3L159.1 20.6ZM146.8 18.8L151 19.2L149.2 20.5L146.1 19.1L146.8 18.8ZM163 12.6L164.5 13.5L163.7 16L160.4 16.2L158.2 15.9L158.3 14.7L155 14.9L154.9 13.3L163 12.6ZM168 4.8L171.4 4L170.5 3.6L175.2 3.5L184.4 5.4L188.4 7.3L181.9 9.4L174.2 9.3L172.1 8.5L173.7 7.2L170.1 7.3L166.6 5.7L168 4.8ZM176.8 2.2L189 0.7L193.6 1.4L195.2 0.3L201.4 -0.3L236.3 0.7L224.7 3L229 3L217.6 6.4L206.2 7.4L208.9 7.6L207.6 8L209.2 8.9L200.5 11.6L204.2 12.4L198.9 13.6L181 13.1L180.8 12.1L184.5 11.6L183.5 10.2L190 10.9L184.1 9.3L189.8 7.3L186.1 5.5L196.3 5.1L184.8 5L176.8 2.2ZM209.6 31.1L206 31.8L205.5 30.8L206.4 29.7L208.2 29.4L209.8 30L209.6 31.1ZM167.5 27L168.7 27.8L167.5 28.5L160.4 27.2L163.6 25.7L167.5 27ZM231 66.3L236.4 67.8L231 66.3ZM232 71.9L232.7 72.9L236 73.1L234.3 74.1L231.7 73.2L231.2 72.5L232 71.9Z","US":"M114.3 68L169.7 68L170.4 67.2L171.3 68.7L176.7 69.7L183.2 69.4L190.2 72.2L194.9 75.3L195.7 78.9L193.8 81.8L194.6 82.6L202.1 80.3L201.7 79.1L202.6 78.7L206.4 78.7L210.3 76L217 76L218.7 75.1L221.5 71.1L224.4 71.9L224.4 74.6L226.1 76.4L219.8 78.6L218.3 81.3L220.1 82.7L212.6 84.1L216.1 84.1L212.1 84.5L210.2 88.1L208.9 87L209.9 89.2L208.1 91.6L208.6 90.1L207.3 87.7L207.3 89.8L206 89.5L207.4 90.2L208.5 94.9L201.9 99L197.3 103.1L197.4 105.9L199.9 112.2L199.2 115.6L197.7 115.6L196.6 114.3L194.3 110.2L194.7 108.9L192.6 106.1L189.8 106.7L187.2 105.2L180.8 105.7L181.2 107.7L173.5 106.4L170.6 107L165.7 110.3L165.7 114.3L164.9 114.3L162 113.3L158.1 107.2L155 106.5L153.8 108.1L152.1 107.5L147 102.5L138 103.3L130.6 100.6L125.7 100.9L123 97.9L118.8 96.8L111.2 85.4L110.9 80.5L112.2 75L110.6 69.6L113.8 69.9L114.8 71.8L114.3 68ZM49.2 125.8L50.4 127L48.6 128.2L47.9 126.6L48.3 125.5L49.2 125.8ZM48 124.5L46.6 124.1L48 124.5ZM46.5 123.6L45.3 123.8L46.5 123.6ZM43.9 122.6L44.6 123.5L43.7 123.4L43.9 122.6ZM41.3 121.6L40.4 121.9L41.3 121.6ZM27.1 45.2L28.8 46.2L25.1 45.6L27.1 45.2ZM53.5 50.1L55.7 50.8L52 52.5L51 52L50.7 51.1L53.5 50.1ZM78 26.6L78 45.4L81.9 46L85.1 48.2L89 46.4L93.3 49.2L96.6 52.9L100 54.2L98.9 56.4L96.1 55L95.5 53.3L92.9 51.6L91.8 49.8L86.7 49.6L80.3 46.9L65.8 44.2L63.6 44.7L64 46L56.6 47.7L57.2 44.5L59.3 43.9L58.8 43.4L52 47.3L53.4 48.3L51.5 49.7L47.4 51.2L43.1 54L30.1 56.9L42.6 52L44.6 50.9L45.9 48.2L41.9 49.2L39.3 47.9L36.1 48.7L36.3 46.7L35 46L32.4 46.4L29.3 45L29.3 43.9L27.8 43L28.5 41.9L30.9 39.7L33.9 39.9L38.5 38.5L37 37.2L38.4 36.4L30.1 37.1L27.1 36.6L23.8 34.7L31.1 32.8L32.7 32.8L32.4 33.8L36.6 33.8L26.5 29.3L27.6 28.2L31.1 28.2L36.2 25.3L46.8 23.3L51.3 24.6L78 26.6ZM16.5 38.4L22.6 39.4L20.9 40L16.9 39.4L16.5 38.4Z","KZ":"M534.7 67.6L531.5 69.1L531.4 71.1L530.3 72L526.4 71.3L524.9 74.9L519.9 76.2L521.7 79.6L520.4 80.2L520.5 81.3L518.3 80.3L508.4 79.4L507 81L502.4 80.6L497.3 84.7L493.4 83.7L493 82L492 82L492.2 80L489.8 78.5L484 79L477 74.8L471.9 76L471.9 83.4L468.2 81.4L465 82.4L465 80.4L462.7 79.7L460.6 76.8L462.6 77L462.6 75.5L466.1 75.5L466.1 72.3L462.4 71.9L458.2 73.2L457.2 72.9L457.4 71.8L456.1 70.5L454.6 70.6L452.9 69.2L455.1 65.1L457.2 66.3L457.4 64.8L461.5 62.6L464.7 62.6L471.4 64.8L473.6 63.9L479.3 64.9L482.7 64.4L483.2 63.5L479.9 62.1L483.4 60L482 58.7L482.9 58L490.4 57.3L498.1 55.2L501.7 55.7L502.4 57.7L507 57.9L506.9 59L513.8 57L513.1 57.6L515.6 59.2L520.1 64.3L521.1 63.2L523.9 64.4L526.8 63.9L531.1 66.6L533.7 66.3L534.7 67.6Z","UZ":"M471.9 83.4L471.9 76L477 74.8L484 79L489.8 78.5L492.2 80L492 82L493 82L493.4 83.7L496 83.7L496.5 84.7L501.9 81.5L500.8 83L506.1 84.3L503.5 85.7L501.2 85.6L501.3 84.1L498.7 84.5L497.1 86.9L495.4 86.8L494.9 87.7L496.4 88.2L496.8 89.7L495.7 91.7L493 91.3L493.1 90.1L488.3 88.2L484.7 85.9L483.8 83.8L480.9 83.6L480 81.6L477.3 80.5L473.9 82.3L474.2 83.4L471.9 83.4Z","PG":"M642 171.2L649.2 173.7L652 176.9L655.3 178.2L655.8 179.2L653.9 179.4L654.4 180.8L661.4 187.2L655.8 186.3L652.1 182.1L649.5 181.3L646.6 182.5L646.8 184L645.3 184.7L642.1 184.2L642 171.2ZM665.3 173.3L666.3 175L665.7 175.5L664.8 173.6L661.3 171.5L661.9 171L665.3 173.3ZM662.6 177.7L659.4 178.6L656.6 177.5L659.7 177L660.3 176L660.5 177.1L661.6 176.9L663.3 175.5L663.1 174.3L664.3 174.3L664.6 175.7L662.6 177.7ZM669.5 176.7L671.8 179.6L670.3 179.1L669.5 176.7Z","ID":"M642 171.2L642.1 184.2L640.3 182.6L635.2 182.8L637.3 180.6L635.9 176.8L627.3 173.1L626 174.2L625.5 172.6L624 171.6L627.4 170.4L624.5 170.4L621 167.9L624.8 166.7L628 167.6L628.8 171.5L630.9 172.7L634.9 169.4L642 171.2ZM609.9 183.8L610.2 184.8L608.9 186.3L606.9 186.5L608 184.6L609.9 183.8ZM628.4 179.8L629 176.9L629.4 178.4L628.4 179.8ZM595.8 157.7L594.6 159.5L596.1 161.4L595.8 162.3L598 164.2L595.6 164.4L595 167.6L593.1 169L592.3 174L592 173.3L589.7 174.2L588.9 173L586.5 172.2L584.1 173L583.4 172L580.4 171.9L580.1 169.2L578.2 166.9L577.9 165.2L579.3 162L581 164.5L585.7 163L587.6 163.6L589.2 163.1L591.7 157.4L595.8 157.7ZM618.7 171.6L620.9 172.2L621.7 173.7L615.8 172.8L616.3 171.7L618.7 171.6ZM613.7 173.6L612 172.4L614 172.3L614.5 172.9L613.7 173.6ZM615.9 161.7L617.4 163.7L617.3 165.5L616.2 165.3L616.2 167.8L614.8 164L615.9 161.7ZM605.9 164.2L608.2 164.2L610.1 162.7L608.9 165.1L600.4 165.5L600.1 167L601.9 168.8L606.7 167.2L606.5 168.2L605.6 167.9L603 169.8L606.3 176.7L605.3 177.3L604.5 176.6L605.4 174.9L603 175.1L603.2 174.4L601.8 173.2L601.9 171.3L600.6 171.9L600.9 177.1L599.6 177.3L598.7 176.8L599 173L597.5 171.6L599.7 165.7L601.8 163.4L605.9 164.2ZM600.6 186.5L597.9 185.1L599.8 184.7L601.6 185.9L600.6 186.5ZM602.7 183.1L605.8 182.2L605.5 183.3L602.5 183.9L599.8 183.6L599.8 182.9L602.7 183.1ZM596.5 182.7L597.8 182.6L598.3 183.4L593.5 184.1L595.8 182.2L596.5 182.7ZM577 178.8L577.2 179.6L581.1 179.8L581.5 178.9L585.2 179.9L586 181.2L591.4 182.7L589.1 183.5L572.9 180.7L572.6 179.8L570.7 179.7L572.1 177.8L577 178.8ZM568.7 168.2L569.8 170.7L572.2 172.1L571.6 177.7L569.4 177.7L562.8 171.6L557.2 162.4L550.6 155L555 155.5L561.3 161.8L563.3 161.8L565 163.2L567.7 165.8L566.9 167.4L568.7 168.2Z","AR":"M222.7 271.3L224.5 273.7L229.9 275.4L229 276.4L227.1 276.5L222.7 275.7L222.7 271.3ZM244.7 226.4L243 234.9L245.5 236.6L245.3 238L246.5 238.8L246.4 239.8L244.5 242.4L241.5 243.4L235.3 243.7L235.7 247.4L234.5 248.1L229.8 248.1L230 250.1L231.4 250.7L232.5 250.1L233.1 251.1L229.6 253L228.9 256.1L225.4 257.1L224.8 258.6L228.7 260.5L228 262.3L225.7 263.4L224.4 265.7L221.7 267.5L223.7 270.7L216.2 270L215.4 267.4L213.3 266.8L213.2 264.6L215.3 262.5L216.7 255.9L217.6 255.6L216.4 254.4L217.1 253.6L215.7 250.5L216.5 250.1L217.2 243.8L218.4 243.1L217.8 239.3L219.3 238L220.4 234.4L218.9 228.7L220.7 222.9L223.4 219.8L223.2 215L225.3 214.1L225.8 211.5L227.5 209.7L230.1 210.2L231.2 211.6L232 210L234.3 210.1L238.3 213.8L244.4 216.3L244.7 217.2L242.8 220.2L248.6 220.8L251.7 217.1L252.7 219.8L244.7 226.4Z","CL":"M222.7 271.3L222.7 275.7L226.1 275.8L223.7 277.2L218 276.1L210.7 271.7L217.8 274.1L219.5 271.9L222.7 271.3ZM220.8 201.2L223.1 204.8L222.5 206.7L224.3 211.7L226 212L225.3 214.1L223.2 215L223.4 219.8L220.7 222.9L218.9 228.7L220.4 234.4L219.3 238L217.8 239.3L218.4 243.1L217.2 243.8L216.5 250.1L215.7 250.5L217.1 253.6L216.4 254.4L217.6 255.6L216.7 255.9L215.3 262.5L213.2 264.6L213.3 266.8L215.4 267.4L216.2 270L222.9 270.6L218.3 271.8L218 273.7L217.1 273.7L210.1 270.5L208.8 263.3L209.6 261.4L211.7 259.9L208.7 259.3L210.6 257.5L211.3 254.2L213.5 254.9L214.6 250.8L213.2 250.2L212.6 252.7L211.3 252.4L213.6 244.5L212.8 240.3L213.7 240.2L217.1 230.8L217 223.7L218.2 221.3L219.8 208.8L219.3 202.7L220.8 201.2Z","CD":"M418.7 175L419.2 179L421.5 182.7L417.5 183.1L416.7 189.6L419.2 190.4L419.4 192.5L417.9 192.5L414.3 189.2L413.1 189.8L408.5 187.9L404.3 188.2L403.5 180.6L400.2 179.9L398.8 180.3L398 182L394.9 182.1L392.7 177.8L384.6 178.2L384.4 177.6L387.2 175L389.2 175.9L392 173.1L392.8 169.5L395.3 166.8L397.1 157.6L398.9 155.9L404.8 157.9L405.7 156.6L411.3 155.5L414.7 155.5L416.9 157.4L419.4 156.8L421.7 159L421.5 161.3L422.3 161.6L419.8 164.8L418 171.7L418.7 175Z","SO":"M443.2 169.4L442 167.7L442 160.4L444.3 157.5L449.9 156L457.9 147.1L457.9 143.2L462.2 142L461.1 147.6L457.2 155.3L453.1 160.3L446.3 165.4L443.2 169.4Z","KE":"M438.4 175.4L435.5 173.4L435.4 172.2L427.8 167.9L427.8 165.8L430.1 162.2L428 157.5L430.6 155L432.3 157.1L436.2 158.8L439.1 159.2L441.5 157.5L443.7 158.2L442 160.4L442 167.7L443.2 169.4L440.5 171.1L438.4 175.4Z","SD":"M409.1 149.5L406.9 148.1L407.1 145.8L404.6 140.7L403.9 140.8L406 134.6L407.8 134.8L407.7 126L410 126L410 122L433.7 122L435 128.8L436.8 130L433.7 132.1L432.5 138.9L428.5 144.7L427.9 148.6L427.4 145.3L426.4 144.6L426.4 141.6L425.5 141.5L424.1 142.1L424.8 143.8L422.7 146.4L420 145.4L417.9 147.2L413.5 147.1L411.6 145.2L410.1 145.5L409.1 148.2L407.8 148.8L409.1 149.5Z","TD":"M407.7 126.8L407.8 134.8L406 134.6L403.9 140.8L404.6 140.7L405.7 143.7L403.4 144.9L402 147L397.6 148L395.9 150.2L390.6 151.2L390 148.4L387.9 146.9L388.3 146L390.9 146L389.2 139.3L387.9 139.3L387.1 137.3L387.9 134.6L390.5 132.7L391.8 125.2L390.2 123.4L389.7 120.3L391.7 119.2L407.7 126.8Z","HT":"M216.6 126.6L216.6 129.9L211.1 129.3L211.3 128.7L215.3 128.7L214.4 127L213.2 126.7L213.6 126.2L216.6 126.6Z","DO":"M216.6 129.9L216.8 126.2L220.1 126.7L223.4 128.8L222.6 129.6L218.7 129.1L217.2 130.8L216.6 129.9Z","RU":"M717.5 23.8L720 23L720 24.3L717.5 23.8ZM458.2 73.2L453.4 76.8L457.2 82.4L455.6 83.7L450.9 81L439.9 79.1L433.4 75.5L436.5 73.5L435.3 72.7L438.3 71.9L436.4 71.8L436.5 70.9L439.5 70.2L440.1 66.8L430.7 64.8L430 63.6L428.4 63.5L428.8 62.5L427.5 61.3L423.6 61.8L422.6 59.9L425.4 59.3L421.5 56.4L421.7 54.9L416.4 53.7L414.6 51.1L415.4 50.4L414.8 48.6L418.2 45.9L416.1 45L423 40.3L420.1 38.9L420.9 37.6L419.1 36.1L420.4 34.4L418.1 32.1L420 30.6L416.9 29.3L417.2 27.9L424.3 26.2L433 27.9L442.1 31.1L442.3 32.4L436.8 34L426.4 32.7L429.6 34.2L429.9 37.2L434 38.3L434.3 37.3L433.1 36.5L434.4 35.7L439.2 37L440.9 36.5L439.5 35L444.2 33L447.9 33.9L449.1 32.5L447.4 31.3L448.4 30.1L446.9 28.9L452.5 29.5L453.6 30.6L451.1 30.9L451.1 32L452.7 32.7L455.8 32.2L456.3 31L467.4 28.3L468.9 28.4L467 29.6L477.6 28.2L479.9 29.4L482.2 28.1L480.1 27L481.1 26.3L487 26.9L497 29.8L498.4 28.8L496.3 27.3L493.9 27.1L494.5 26.1L493.4 23.9L499.9 19.9L505.2 20.4L505.6 21.6L503.7 23.2L505.6 25.2L505.1 28L507.3 29.2L502.6 33.4L504.8 33.7L510.1 30.5L508.9 29.3L509.9 28L507.7 27.9L507.2 26.7L508.8 24.7L506.2 23.1L509.8 21.8L509.3 20.3L511.4 21.4L510.6 23.3L512.7 23.7L511.8 22.3L515.2 21.5L519.3 21.4L523 22.5L521.2 20.8L521 18.7L533.6 18.1L532 17.1L534.3 15.8L546.5 13.9L553.4 14.2L561.5 13.1L564 11.4L568.7 10.6L572.1 11.3L569.4 11.7L573.9 12.1L574.5 13L582.2 12.6L588.3 14.3L587.8 15.3L578.8 17.6L586 18L587.1 19.3L591.1 18.5L606.4 20.1L606.5 18.5L614 18.9L617.2 19.9L618.1 21.2L616.9 22L622.6 24.4L624.5 22.3L627.7 23.2L639.7 23L638.3 21.2L640.9 20.3L659 21.6L665.9 24.3L678 24.3L679.7 25.1L679.4 26.6L681.9 27.1L695.7 26.8L699.2 28.6L701.6 28L700 26.7L700.9 25.8L711.4 26.2L720 28.1L720 36L714.8 36.8L718.7 40L718.5 41.4L714.7 41L707.4 42.7L700.7 46.2L697.8 44.9L692.6 46.4L691.7 45.7L689.8 46.5L687.1 46.3L684 49.5L684.1 50.3L686.4 50.8L686.1 53.7L684.3 53.8L683.4 55.4L684.2 56.3L680.7 57.3L680 59.6L677.1 60.1L676.5 62.1L673.6 64L670.9 55.2L671.8 52.5L673.6 50.3L676.7 49.9L687.3 43.7L688.9 40.9L686.5 41.1L685.3 42.7L680.2 44.9L678.6 42.5L673.4 43.1L668.4 46.5L670.1 47.7L662.5 48.4L662.7 47L659.6 46.7L657.1 47.7L644.4 47.9L630.3 56.5L633.4 56.8L636.3 58.5L637.6 57.5L639.8 57.6L642.7 59.8L640.1 69.1L629.7 79.2L627.1 80.4L624.6 79.4L621.6 81.6L621.3 80.2L622.3 80.1L622.6 77.8L622.1 76.1L626.2 75.7L630.1 69L622 70.4L621.2 68.5L618.8 67.1L615.3 66.5L611.9 60.4L607.1 59.1L602 59.5L600.4 60.5L601.5 61L601.5 62.1L598.6 65.7L595.8 67L588.7 65.5L581.3 67.7L577 67.4L573.8 65.5L567.4 65.8L564.5 65L564.1 63.5L557.7 61.9L555.7 64L556.5 65.2L554.5 66.5L544.5 64.4L534.7 67.6L533.7 66.3L531.1 66.6L526.8 63.9L523.9 64.4L521.1 63.2L520.1 64.3L515.6 59.2L513.1 57.6L513.8 57L506.9 59L507 57.9L502.4 57.7L501.7 55.7L498.1 55.2L490.4 57.3L482.9 58L482 58.7L483.4 60L479.9 62.1L483.2 63.5L482.7 64.4L479.3 64.9L473.6 63.9L471.4 64.8L464.7 62.6L461.5 62.6L457.4 64.8L457.2 66.3L455.1 65.1L452.9 69.2L454.6 70.6L456.1 70.5L457.4 71.8L457.2 72.9L458.2 73.2ZM547.6 4L551.9 3.5L560.4 6.4L559.9 8.2L549.9 7.9L542.4 5.3L547.6 4ZM565.7 7.4L570.7 8.6L570.2 9.4L558.9 10.2L562.5 7.5L565.7 7.4ZM637.7 13.7L650.2 14.9L648.6 16.4L637.9 16.8L633.9 15.5L635 14.1L637.7 13.7ZM656.4 15.3L661.5 15.8L656 16.4L652.2 15.7L652.7 15L656.4 15.3ZM639.7 19.3L644.1 18.3L647.2 19.6L639.7 19.3ZM449.7 4.8L463 4.6L455.2 6L453 5.5L454.1 4.9L449.7 4.8ZM405.5 57.3L399.3 57.1L402.5 55.6L405.5 56.3L405.5 57.3ZM467 18.5L471.8 16.7L471.3 15.8L482.3 13.5L496.3 12.1L497.7 12.9L477 17.4L470.8 21.3L471.2 22.9L475.1 24.6L467.4 24.5L466.8 23.6L463.2 23.1L462.9 22L465 21.5L464.9 20.5L468.9 18.7L467 18.5ZM645.8 58.6L646.5 62.5L649.3 68L646.3 67.4L645.1 70.3L647.1 72.3L647 73.7L645.5 72.5L644.2 74.1L644.4 64.1L643.2 62.1L643.4 59.4L645.2 58.5L644.4 57.5L645.3 57.3L645.8 58.6ZM10.1 31.6L10 32.8L11.3 33.3L10.9 31.9L16.3 32.2L20.2 34L14.9 35.1L14.9 37.1L14.1 37.5L8 36.2L7.6 35.3L3.3 35.2L2.2 34.5L2.6 33.8L0.2 34.3L1.1 35.2L0 36L0 28.1L10.1 31.6ZM2.6 24.2L0 24.3L0 23L4.8 23.5L2.6 24.2ZM426.9 74.1L433.1 75.1L427.8 77.3L426.7 76.9L427.1 75.9L424.9 75.3L426.9 74.1Z","BS":"M202 112.4L204.4 112.8L202.2 113.2L202 112.4ZM204.4 111.9L206 112.8L205.7 114.2L204.4 111.9ZM203.6 115.6L204.9 118.5L203.2 116.8L203.6 115.6Z","FK":"M237.6 269.7L242.9 268.2L244.5 269.1L241.2 270.4L240.3 269.7L238.6 270.6L237.6 269.7Z","NO":"M390.3 6.7L394 5.9L403.1 8.1L398.1 8.9L394.2 12.4L391.8 12.5L387.5 11.2L389.3 10.5L382.4 8.3L380.9 6.7L386.3 6L390.3 6.7ZM422.2 26.9L417.2 27.9L418 26.5L415.5 25.7L412.4 26.3L409.5 28.7L402.5 27.3L400.1 27.9L399.8 29.2L396 28.9L395.5 30L393.5 30L387.1 36.4L387.8 37.1L387.1 37.9L385.2 37.9L383.9 39.7L384 42.4L385.3 43.4L384.6 45.8L382.1 48.3L380.7 47.1L376.8 49.4L374.1 49.8L371.3 48.8L370 42.1L381.1 37L389.5 30.4L398.4 26.4L406 25.6L409.1 23.9L416.3 23.6L422.6 25.1L420 25.6L422.2 26.9ZM414.8 5.9L411.8 7L406 7.2L400.2 6.9L394.7 5.4L405.8 4.7L414.8 5.9ZM409.4 10.3L405 11.1L401.5 10.6L402.8 10.1L401.6 9.5L405.8 9.1L409.4 10.3Z","GL":"M266.5 0.7L282.8 -1.1L305.8 -1L318.3 0.5L297.2 2L314.2 1.8L315.9 2.5L313.7 3.7L328.5 2.2L334.5 2.6L335.6 3.4L319.9 5.6L324.5 5.7L320.6 8.5L320.7 10.7L323.1 12L316.6 12.7L320.3 13.8L320.8 15.5L318.7 15.7L321.3 17.4L316.8 17.6L319.1 18.4L318.5 19.1L312.9 19.4L315.4 20.7L315.4 21.6L310.4 21.3L315.7 23.1L316.5 24.7L312.9 25.1L308.9 23.1L309.6 24.5L307.3 25.5L315.3 25.7L304.5 29.1L296.4 29.8L291.6 32.6L280.4 35.1L278.7 36.3L277.6 39L274.4 40.6L275.2 42.2L273.2 45.8L270.4 45.9L267.5 44.3L263.5 44.3L256.7 38.7L255.4 35.6L252.7 33.8L253.4 32.3L252.1 31.6L254 29.3L257 28.5L258.3 26.1L253.1 27.4L250.6 26.8L251.3 24.4L257.2 24.9L252 22.9L248.3 22.7L250.6 20.8L245.4 16.6L242.8 15.8L242.8 15L237.5 13.8L223 13.9L217.2 12L226.5 11.2L213.4 9.9L213.7 9.1L228.6 7.2L229.4 6.5L224 5.8L235.5 3.4L234.7 2.5L245.6 1.6L253.9 2.2L259.2 1.1L271 2.7L266.2 1.6L266.5 0.7Z","TF":"M497.9 263.2L501.1 264.5L500.6 265.4L497.5 265.6L497.9 263.2Z","TL":"M609.9 183.8L614.7 182.8L610.2 184.8L609.9 183.8Z","ZA":"M392.7 223.2L393.6 222.2L394.8 223.6L396.9 224.1L399.8 222.9L399.8 215.5L401.8 219.7L403.2 219.5L406.6 216.5L408.4 217.3L411.3 217L414.2 213.1L418.9 210.2L422.4 210.5L423.9 214.7L423.7 217.7L422.1 217.5L421.4 219.5L422.6 220.6L425.7 219.5L424.4 223.5L416.4 231.5L411.6 233.9L405.1 233.7L400.1 235.6L396.8 234.3L395.9 231.2L396.4 229.3L392.7 223.2Z","LS":"M418 223.9L418.7 224.5L416.2 227.1L414 225.8L416.1 223.7L418 223.9Z","MX":"M125.7 100.9L130.6 100.6L138 103.3L147 102.5L152.1 107.5L153.8 108.1L155 106.5L156.7 106.4L161 110.9L162 113.3L165.7 114.3L164.3 121.1L168.2 128.3L171.1 129.7L177.2 128.2L178.5 127.4L179.4 124L185.9 122.9L186.3 124.3L184.3 129.5L183 129L182.3 130.2L178 130.4L178 131.5L177.1 131.5L179.1 133.9L176.5 133.9L175.5 136.9L172.2 134.1L170.6 133.6L166.9 134.7L153 129.4L149 126.1L148.5 125.1L149.5 123.2L147.9 120.5L141.5 114.8L141.4 113.1L139.2 111.7L138.7 110.3L135.5 108.1L133.7 103.7L130.4 102.4L130.7 105.7L136.8 112.7L138.7 117.4L141.2 119.3L139.9 120.4L135.6 116.5L135.4 114L129.9 110.6L130.9 110.5L131.7 108.9L129 106.9L125.7 100.9Z","UY":"M244.7 226.4L246 226.2L252.4 230.1L253.6 231.5L252.4 234.8L250.1 235.9L247.6 235.7L243.1 233.8L244.7 226.4Z","BR":"M253.3 233.5L252.7 232.4L253.6 231.5L252.4 230.1L246 226.2L244.7 226.4L252.7 219.8L252.7 218.2L251.7 217.1L250.7 217.5L251.4 214L249.2 213.9L248.4 210.7L244.1 210.2L243.7 206.4L245 202.3L243.4 200.5L243.5 198.6L239.7 198.5L239 193.6L231.4 190.9L229.2 189.1L229.3 185.5L226.7 185.9L223.5 188L218.9 188L219 185L217.4 186.2L215.6 186.1L213.5 184.9L214 184.1L212 181L213.8 179.3L214.2 176.5L218.4 174.5L220.2 174.6L221.2 168.2L220 164.9L221.5 164.8L221.6 164L220.4 163.8L220.4 162.6L224.9 161.9L225.9 163.7L228.9 164.4L233.3 161.6L231.5 161L231.3 158.4L230.4 157.9L233.8 158.5L238.1 156.9L238.5 155.6L240 156L240.9 158.1L240.1 160.5L241.9 163.4L245.3 162.1L248 162.4L248.1 161L254.1 161.8L257.4 157.6L259 162.2L260.1 162.5L260.1 163.9L258.6 165.6L259.2 166.2L262.8 166.5L262.8 168.5L264.4 167.2L270.2 169.1L271.2 170.3L270.8 171.4L273.2 170.8L280 171.7L285.6 175.6L288.8 176.3L290.5 180.7L289.7 184L282.7 192.1L281.5 201.7L278.1 209.9L276 211.9L270.7 212.7L264.7 215.8L263 217.8L262.2 223.3L253.3 233.5Z","BO":"M220.9 187.9L223.5 188L226.7 185.9L229.3 185.5L229.2 189.1L231.4 190.9L239 193.6L239.7 198.5L243.5 198.6L243.4 200.5L245 202.3L244.3 205.9L243.7 206.4L241.8 204.7L236.4 205.3L234.6 210.5L232 210L231.2 211.6L230.1 210.2L227.5 209.7L224.3 211.7L222.5 206.7L223.1 204.8L220.8 201.2L222.1 199L221.3 195.9L222.7 191.1L220.9 187.9Z","PE":"M220.2 174.6L218.4 174.5L214.2 176.5L213.8 179.3L212 181L214 184.1L213.5 184.9L215.6 186.1L217.4 186.2L219 185L218.9 188L220.9 187.9L222.7 191.1L221.3 195.9L222.1 199L219.3 202.7L208 195.3L200.5 180.4L197.5 178.3L198.1 177.4L197.2 175.5L199.4 172.8L199.1 174.9L201.6 175.9L202.7 175.1L204.3 172L206.7 171.2L208.9 169.1L209.8 166.1L213.9 170.6L218.4 170.5L219.9 171.5L218.6 173.5L220.2 174.6Z","CO":"M226.2 163.5L224.9 161.9L220.4 162.6L220.4 163.8L221.6 164L221.5 164.8L220 164.9L221.2 168.2L220.2 174.6L218.6 173.5L219.9 171.5L218.4 170.5L213.9 170.6L209.8 166.1L205.2 165.2L202 162.6L205.7 158.3L205 157.8L205.4 154.3L204.2 151.6L205.5 150.1L205.1 149L208.7 147.1L209 144.8L210.2 143.8L213.2 143.5L217.2 141.2L217.3 142.4L214.2 145.1L213.4 147.7L214.4 147.8L216.1 152L219.8 152.1L221.2 153.8L225.3 153.8L224.4 157L225.4 159.4L224.4 160.4L226.2 163.5Z","PA":"M205.3 148.7L205.5 150.1L204.2 151.6L203.1 149.9L203.6 149.4L201.8 148L199.2 149.4L200 150.9L198.2 151.6L196.6 149.8L194.3 149.9L194.1 147L197.1 148.4L202 146.9L205.3 148.7Z","CR":"M194.9 146.9L194.1 147L194.1 149.5L190 145.8L189.8 146.9L188.7 146.1L188.1 144.2L188.9 143.6L192.7 144.1L194.9 146.9Z","NI":"M192.7 144.1L188.6 143.8L184.7 140.2L190.2 136.4L193.7 136L192.7 144.1Z","HN":"M193.7 136L190.2 136.4L185.4 140L184.3 138.2L181.3 137.2L181.7 135.9L184.2 134.3L190 134L193.7 136Z","SV":"M181.3 137.2L184.6 138.4L184.2 139.7L179.8 138.5L181.3 137.2Z","GT":"M175.5 136.9L176.5 133.9L179.1 133.9L177.1 131.5L178 131.5L178 130.4L181.7 130.4L181.5 134.2L183.5 134.5L181.3 137.2L179.8 138.5L175.5 136.9Z","BZ":"M181.7 130.4L183.8 129.3L183.3 132.9L182.1 134.2L181.7 130.4Z","VE":"M238.5 155.6L238.1 156.9L233.8 158.5L230.4 157.9L231.3 158.4L231.5 161L233.3 161.6L227.3 164.6L224.4 160.4L225.4 159.4L224.4 157L225.3 153.8L221.2 153.8L219.8 152.1L216.1 152L214.4 147.8L213.4 147.7L214.2 145.1L217.3 142.4L216.1 143.2L216.7 145.1L215.9 146.3L216.6 147.9L217.5 147.7L217.2 144.1L219.7 143.2L220.1 141.7L223.6 144.9L227.5 144.7L230.2 145.8L231.4 144.7L236.2 144.6L234.5 145.2L235.2 146.1L236.8 146.3L238.3 147.2L238.7 148.8L240.5 149.3L238.9 150.4L239.4 151.9L237.7 152.6L237.2 154.1L238.5 155.6Z","GY":"M246.9 162.2L242.9 163.5L240.7 162.4L240.1 160.5L240.9 158.1L240 156L237.2 154.1L237.7 152.6L239.4 151.9L238.9 150.4L240.5 149.3L245.7 154.1L243.9 157.9L246.9 162.2Z","SR":"M251 161.4L248.1 161L248 162.4L246.9 162.2L244.8 159.3L243.9 157.9L245.7 154.1L252.1 154.5L251 156.2L252 158.8L251 161.4Z","FR":"M256.7 157.7L254.1 161.8L251 161.4L252 158.8L251 156.2L252.1 154.5L254.2 155.2L256.7 157.7ZM372.4 67.1L376.2 68L374.9 70.8L373.5 70.9L372.1 72.5L372 73.5L373 73.1L373.7 74L374.2 75.3L373.5 75.9L374 77.5L375.1 77.7L374.9 78.6L373.1 79.7L369.1 79.2L366.2 79.8L366 81.1L363.7 81.3L356.2 79.2L357.2 78L357.6 74L354.1 70.9L351 70.1L350.8 68.6L356.8 68.7L356.1 66.4L358 67.3L362.7 65.7L363.3 64.1L365 63.7L368.6 66.2L372.4 67.1ZM377.5 80.7L378.8 80L378.5 83.2L377.6 82.8L377.5 80.7Z","EC":"M209.3 166.3L208.9 169.1L206.7 171.2L204.3 172L202.7 175.1L201.6 175.9L199.1 174.9L200.5 171.3L200 170.4L199.3 171.4L198.1 170.5L198.1 168.1L199.8 164.5L202.3 163.2L205.2 165.2L207.4 165.2L209.3 166.3Z","PR":"M227.4 129L228.8 129.5L228.3 130L225.6 130.1L225.8 129L227.4 129Z","JM":"M204.9 129L207.6 130.2L204.5 130.3L203.3 129.5L204.9 129Z","CU":"M195.5 119.6L203.3 121L208.7 124.5L211.6 125.4L204.5 126.3L205.8 125.2L203.7 124.5L202.6 122.8L196.4 121.6L195.7 121.2L196.4 120.7L190.1 122.2L195.5 119.6Z","ZW":"M422.4 210.5L416 209L415.4 207L412.3 204.6L410.5 201.5L414.1 201.9L417.9 198.1L420.5 197L420.7 197.8L425.7 199.4L425.3 206.6L422.4 210.5Z","BW":"M418.9 210.2L414.2 213.1L411.3 217L408.4 217.3L406.6 216.5L403.2 219.5L401.8 219.7L399.8 215.5L399.8 209.7L401.8 209.6L401.8 202.5L406.4 201.7L407.2 202.6L410.5 201.5L412.3 204.6L415.4 207L416 209L418.9 210.2Z","NA":"M399.8 215.5L399.8 222.9L396.9 224.1L394.8 223.6L393.6 222.2L392.7 223.2L390.4 220.2L388.5 210.2L383.6 202.1L383.5 200.6L386.9 199.9L388.1 200.8L396.5 200.6L397.9 201.6L402.8 201.9L408.1 200.6L410.2 201.2L407.2 202.6L406.4 201.7L401.8 202.5L401.8 209.6L399.8 209.7L399.8 215.5Z","SN":"M326.6 138.8L324.7 136.5L327.8 133.1L330.8 132.8L335.7 136.8L337 141.1L326.6 141.2L326.3 139.7L332.3 139L329.8 138.2L326.6 138.8Z","ML":"M337 141.1L335.7 136.8L336.7 135.2L348.9 135L347.1 116.1L350.2 116.1L366.3 126.6L366.3 127.9L368.5 127.7L368.5 132.3L367.3 134.9L357.9 136.1L353.8 138.9L352 139.1L349.6 142.6L349.2 145.3L343.9 145.6L341.7 141.4L339.7 142.3L337.1 141.8L337 141.1Z","MR":"M325.9 124L326.3 123.3L334.1 123.3L334.3 119.4L336.1 119.3L336.1 114.1L342.6 114.2L342.6 111.2L350.2 116.1L347.1 116.1L348.9 135L336.7 135.2L335.7 136.8L330.8 132.8L327.1 133.7L327.4 125.8L325.9 124Z","BJ":"M365.4 153.5L363.7 153.7L363.3 147.7L361.5 145.1L362.9 142.9L365.7 141.5L367.2 142.7L367.6 144.5L365.4 149L365.4 153.5Z","NE":"M389.7 120.3L390.2 123.4L391.8 125.2L390.5 132.7L387.9 134.6L387.1 137.3L387.9 139.3L389.2 139.3L388.4 141L386.2 138.8L384.6 139.9L382 139.2L378 140.3L375.6 139.3L373.6 139.8L370.9 138.3L368.2 138.9L367.2 142.7L365.7 141.5L364.3 142.1L364.4 140.7L362 140.3L360.7 136.1L367.3 134.9L368.5 132.3L368.5 127.7L384 119.1L388.3 121L389.7 120.3Z","NG":"M365.4 153.5L365.4 149L367.4 145.9L367.4 140.9L368.7 138.5L370.9 138.3L373.6 139.8L375.6 139.3L378 140.3L382 139.2L384.6 139.9L386.2 138.8L389.2 141.8L383.5 152L382.1 152.7L380.2 151.9L378.5 153.1L377 156.5L371.8 157.5L368.7 153.5L365.4 153.5Z","CM":"M389 140.3L390.9 146L388.3 146L387.9 146.9L390 148.4L390.9 150.6L389.1 153.5L389 156.5L391.7 160L391.9 162.5L388.7 161.5L379.3 161.4L379.6 159.9L377 157L377.5 155L380.2 151.9L382.1 152.7L383.5 152L387.1 144.4L388.8 142.9L389 140.3Z","TG":"M361.8 144L361.5 145.1L363.3 147.7L363.7 153.7L362.1 154.1L359.9 144.6L361.8 144Z","GH":"M360 144L362.1 154.1L356.1 156.6L354.3 156L353.5 153.5L354.9 149.6L354.1 144.1L360 144Z","CI":"M343.9 145.6L347.6 145L347.9 145.8L349.2 145.3L351.3 146.8L354.3 146.7L354.9 149.6L353.5 153.5L354.3 156L350.7 155.7L344.6 157.3L344.9 154.6L342.8 153.1L343.4 149.4L344.3 148.8L343.4 146.4L343.9 145.6Z","GN":"M332.6 140.8L337 141.1L337.1 141.8L339.7 142.3L341.7 141.4L343.9 145.6L343.4 146.4L344.3 148.8L343.4 150.6L341.6 151.4L340.5 148.9L339 149.3L337.8 145.9L335.1 146.3L333.5 148.2L329.7 143.9L332.5 142.4L332.6 140.8Z","GW":"M326.6 141.2L332.6 140.8L332.5 142.4L329.7 143.9L326.6 141.2Z","LR":"M343.1 150.6L342.8 153.1L344.9 154.6L344.6 157.3L342 156.3L337.1 152.4L339.5 149.2L340.5 148.9L341.6 151.4L343.1 150.6Z","SL":"M333.5 148.2L335.1 146.3L337.8 145.9L339.5 149.2L337.1 152.4L334.1 150.4L333.5 148.2Z","BF":"M349.2 145.3L349.6 142.6L351.4 139.5L357.9 136.1L360.7 136.1L362 140.3L364.4 140.7L363.9 142.7L361.8 144L354.1 144.1L354.3 146.7L351.3 146.8L349.2 145.3Z","CF":"M414.7 155.5L408.8 155.8L405.7 156.6L404.8 157.9L398.9 155.9L397.1 157.6L396.9 159L394.3 158.5L392 161.5L388.9 155.1L390.6 151.2L395.9 150.2L397.6 148L402 147L403.4 144.9L405.7 143.7L407.1 145.8L406.9 148.1L410.2 150.3L414.7 155.5Z","CG":"M396.9 159L395.3 166.8L392.8 169.5L392 173.1L389.2 175.9L388.3 175L386.5 175.8L385.2 174.9L383.8 176.1L382.2 174L383.7 172.9L383 171.5L385 170.8L385.2 169.9L388 170.9L388.9 168.7L387.7 165.9L388.6 163.6L386.6 163.4L386.2 161.5L391.9 162.5L394.3 158.5L396.9 159Z","GA":"M382.6 161.5L385.9 161.4L386.6 163.4L388.6 163.6L387.7 165.9L388.9 168.7L388 170.9L385.2 169.9L385 170.8L383 171.5L383.7 172.9L382.2 174L377.6 168.2L379 164L382.6 163.9L382.6 161.5Z","GQ":"M379.3 161.4L382.6 161.5L382.6 163.9L379 164L379.3 161.4Z","ZM":"M421.5 182.7L426.5 185.4L426.6 190.9L425.4 193.4L426.4 193.9L420.4 195.6L420.5 197L417.9 198.1L414.1 201.9L409.4 200.7L406.4 201L403.8 198.2L403.9 191.8L408 191.8L407.8 187.9L411.5 189.6L414.3 189.2L417.9 192.5L419.4 192.5L419.2 190.4L416.7 189.6L416.9 184.3L418 182.8L421.5 182.7Z","MW":"M425.5 184.5L427.5 184.8L428.6 186.3L429.1 193.2L431.4 195.2L431.5 197.8L430.1 199.6L428.8 198.4L428.9 195.2L425.4 193.4L427 187.1L425.5 184.5Z","MZ":"M429.1 189L434.9 189.1L440.6 186.6L441.6 195.4L438.9 199.4L434.8 201.2L429.6 205.6L429.4 207L431.1 210.2L430.9 214.2L426 216.7L425.1 217.5L425.7 219.5L424.1 219.5L423.9 214.7L422.4 210.5L425.3 206.6L425.7 199.4L420.7 197.8L420.4 195.6L426.4 193.9L428.9 195.2L428.8 198.4L430.1 199.6L431.5 197.8L431.4 195.2L429.1 193.2L429.1 189Z","SZ":"M424.1 219.5L422.6 220.6L421.4 219.5L422.1 217.5L423.7 217.7L424.1 219.5Z","AO":"M386 175.6L384.4 177.6L383.8 176.1L385.2 174.9L386 175.6ZM384.6 178.2L392.7 177.8L394.9 182.1L398 182L398.8 180.3L400.2 179.9L403.5 180.6L404.3 188.2L406.9 187.7L408 188.5L408 191.8L403.9 191.8L403.8 198.2L406.4 201L402.8 201.9L397.9 201.6L396.5 200.6L388.1 200.8L386.9 199.9L383.5 200.6L384.4 194.9L387.5 188.6L384.6 178.2Z","BI":"M420.9 170.8L421.5 172.7L418.7 175L418 171.7L420.9 170.8Z","IL":"M431.4 100.6L429.9 102.3L430.8 103.8L429.8 107L428.5 103.6L430.2 99.8L431.6 99.4L431.4 100.6Z","LB":"M431.6 99.4L430.3 99.8L431 98.2L432 96.7L432.9 96.8L433.2 97.6L431.6 99.4Z","MG":"M459.1 190.9L460.8 197.4L459.3 197.4L459.5 199.8L454.2 215.9L450.8 217.2L448.1 216L446.7 211.6L446.9 208.7L447.8 208.3L448.9 204.9L447.9 200.8L448.9 198.4L452.6 197.6L455.4 195.2L455.7 193.3L456.6 193.6L458.4 190.1L459.1 190.9Z","PS":"M430.8 103L429.9 103.3L430.4 100.9L431.1 101.2L430.8 103Z","GM":"M326.6 138.8L329.8 138.2L332.3 139L326.3 139.7L326.6 138.8Z","TN":"M379 105.4L378.1 101.8L375.2 99.3L375 97.8L376.3 96.7L376.8 92.1L379 91.3L380.4 91.5L380.4 92.6L382.1 91.8L381.2 93.2L381.6 96.3L380.3 97.3L383 99.7L382.9 101.3L379.9 103.2L379.9 104.9L379 105.4Z","DZ":"M342.6 111.2L342.7 108.3L349.5 106L352.6 104.2L352.7 102.7L357.4 101.5L355.7 95.7L357.6 94.6L362.9 92.8L376.8 92.1L376.3 96.7L375 97.8L375.2 99.3L378.1 101.8L379.6 107.2L379.4 113L378.6 113.8L380.6 117.2L381.5 116.9L384 119.1L371.4 126.8L366.3 127.9L366.3 126.6L342.6 111.2Z","JO":"M431.1 101.2L431.4 100.6L433.7 101.4L437.6 99.2L438.4 101.7L434 103L436 105L432.1 107.6L429.8 107L431.1 101.2Z","AE":"M463.2 117.5L468 117.8L472.1 113.9L472.5 114.6L472.8 116.2L471.8 116.2L472 117.7L470 121L464 120L463.2 117.5Z","QA":"M461.6 116.5L461.5 115L462.6 113.8L463.2 115.6L462.8 116.7L461.6 116.5Z","KW":"M455.9 106L456.8 108.9L453.1 107.8L454.6 105.9L455.9 106Z","IQ":"M438.4 101.7L437.6 99.2L442 97.2L442.6 93.3L445.6 91.2L449.5 91.7L452.2 94.6L450.8 98.1L452.2 100L454.7 101.1L455.7 102.6L455.4 104L457.1 106.1L454.6 105.9L453.1 107.8L449.4 107.6L443.8 103.6L438.4 101.7Z","OM":"M470.4 120.6L471.1 118.1L472 117.7L471.8 116.2L472.8 116.2L474.8 118.2L477.5 118.9L479.6 121.4L477 125.1L475.7 125.5L475.4 128.1L473.2 128.9L472.6 130.2L471.3 130.2L469.6 132.1L466.2 132.7L464 128L470 126L471.3 122L470.4 120.6ZM472.5 114.6L472.7 113.2L472.5 114.6Z","VU":"M694.4 197.8L695.7 198.9L695 199.2L694.4 197.8ZM693.6 197.3L693.3 195.3L694.5 197.5L693.6 197.3Z","KH":"M565.2 141.6L564.7 139.2L566 137.5L568.6 137.2L572.1 138.2L573 136.9L574.8 137.6L575.2 138.9L575 141.3L571.6 142.9L572.5 144.1L567 144.7L565.2 141.6Z","TH":"M570.4 137.5L566 137.5L564.7 139.2L565.2 141.6L561.7 140.7L562 139.2L560.2 139.2L558.4 147.5L559.7 147.6L560.9 151.1L564.3 153.6L562.3 154.6L562.2 153.6L560.2 153.1L556.3 149.3L559.2 142.2L558.2 138.3L556.4 135.8L557.8 133.6L554.8 129.1L556.5 126.6L560.2 125.2L561.2 127L562.6 127.1L562.1 131L566.4 129.4L567.9 129.5L569.4 131.1L569.6 133.1L571.2 134.9L570.4 137.5Z","LA":"M574.8 137.6L573 136.9L572.1 138.2L570.4 137.5L571.2 134.9L567.9 129.5L564.2 129.8L562.1 131L562.6 127.1L561.2 127L560.2 125.2L562.4 123.1L563.6 123.7L563.3 121.4L564.3 121.1L566.4 124.5L568.9 124.5L569.6 126.2L567.8 127.5L570.2 128.7L574.6 134.2L574.8 137.6Z","MM":"M560.2 125.2L556.5 126.6L554.8 129.1L557.8 133.6L556.4 135.8L558.2 138.3L559.2 142.2L557.1 146.1L557 139.8L554.3 132.1L550.7 134.6L548.4 133.9L548.6 129.6L547.3 126.5L544.7 124.7L544.6 123L545.3 123.4L545.3 121.9L546.3 121.4L546.7 117.8L548.2 118.3L550.2 112.9L552.8 111.5L554.3 111.8L554.7 109.5L555.8 109.3L557.4 111L557.3 114.2L555.4 115.8L555.2 118.2L557.3 117.9L557.8 119.7L559.1 120.1L558.5 121.8L560.8 122.9L562.3 122.3L560.2 125.2Z","VN":"M568.7 145L572.5 144.1L571.6 142.9L575 141.3L575.1 135.6L570.2 128.7L567.8 127.5L569.6 126.2L568.9 124.5L566.4 124.5L564.3 121.1L570.7 119.3L573.5 120.4L573.1 121.6L574.1 122.4L576.1 122.9L573.4 124.6L571.3 127.9L577.8 135.4L578.4 142.7L570.3 148.8L569.6 147.5L570.2 146.2L568.7 145Z","KP":"M621.3 81.2L619.3 82.8L619.4 84.2L615.1 86.5L614.8 87.6L616.4 89.3L610.6 90.7L609.4 89.8L610.8 87.2L608.5 86.1L610.2 84.9L613.7 82.4L616.4 83.1L616.1 82L619.2 81.2L620 80L621.3 81.2Z","KR":"M612.3 90.5L616.7 88.8L618.9 92.4L618.2 95.8L613 97.2L612.2 92.5L613.7 92.2L612.3 90.5Z","MN":"M535.5 67.4L544.5 64.4L554.5 66.5L556.5 65.2L555.7 64L557.7 61.9L564.1 63.5L564.5 65L567.4 65.8L573.8 65.5L577 67.4L581.3 67.7L588.7 65.5L593.4 66.2L591 69.7L591.5 70.5L596.1 69.9L599.5 71.9L599.3 72.6L594.8 72.7L586.9 76.4L583.7 75.8L582.7 77.1L583.7 78.5L580.8 80.3L569.9 82.8L561.7 80.7L552.7 80.5L550.6 77.5L541.9 75.4L541.2 74.6L541.9 72.2L540.6 70.6L536 68.8L535.5 67.4Z","IN":"M554.7 109.5L554.3 111.8L552.8 111.5L550.2 112.9L548.2 118.3L546.7 117.8L546.3 121.4L545.3 121.9L544.3 118.7L543.4 120L542.3 119L544.8 116L539.8 115.5L539.7 114.1L537.1 113.1L536.4 114.5L537.9 115.5L536.2 117L537.4 117.5L537.8 122.6L534 123L534.1 124.5L533 125.7L530.1 127L524.4 132L524.4 132.9L520.6 134.2L519.7 145.3L518.7 145.4L517.8 146.9L518.4 147.6L516.6 148.1L515.1 150.1L513.2 148.2L507.1 134L505.3 123.3L500.9 124.2L498.3 121.8L499.3 121.1L498.7 120.3L496.4 118.6L497.7 117.3L502.1 117.3L500.3 113L499 112.1L501.2 110L503.6 110.2L508.8 104L508.8 102.6L510.5 101.5L508.9 100.5L507.5 97.4L508.5 96.5L513.7 96.7L515.7 95L517.8 97.4L518.4 100L518.4 101L516.9 100.8L517.5 103L522.2 105.6L520.2 108.4L526.6 111.3L536.1 113.2L536.2 110.2L537.5 109.8L537.7 111.8L539.5 112.6L544.1 112.3L543.4 110.5L549.1 107.4L550.8 107.9L552.2 107.1L553.2 108.3L552.5 109.2L554.7 109.5Z","BD":"M545.3 121.9L544.7 124.7L542.8 120.5L541 120.4L540.5 122.3L538.1 121.9L537.4 117.5L536.2 117L537.9 115.5L536.4 114.5L537.1 113.1L539.7 114.1L539.8 115.5L544.8 116L542.3 119L543.4 120L544.3 118.7L545.3 121.9Z","BT":"M543.4 110.5L544.1 112.3L539.5 112.6L537.7 111.8L540 109.4L543.4 110.5Z","NP":"M536.2 110.2L536.1 113.2L534.5 113.2L526.6 111.3L520.2 108.4L521 106.5L523.1 105.2L531.6 109.6L536.2 110.2Z","PK":"M515.7 95L513.7 96.7L508.5 96.5L507.5 97.4L508.9 100.5L510.5 101.5L508.8 102.6L508.8 104L503.6 110.2L501.2 110L499 112.1L500.3 113L502.1 117.3L497.7 117.3L496.4 118.6L494.9 118.1L492.7 115.1L483 115.8L483.7 113.5L486.6 112.5L485.5 109.5L481.7 106.3L485.1 107.4L492.7 106.2L493.9 103.4L498.6 102.2L498.5 101L500.6 99.3L499.9 98L501.8 98L503.2 95.7L502.5 93.9L503.7 93L510.3 91.7L512.4 94.2L515.7 95Z","AF":"M493 91.3L498.4 91.7L501.6 89L502.7 89.5L503.7 92.5L506.5 91L510.3 91.7L502.5 93.9L503.2 95.7L501.8 98L499.9 98L500.6 99.3L498.5 101L498.6 102.2L493.9 103.4L492.7 106.2L485.1 107.4L481.7 106.3L483.6 104.5L483.4 103.2L481.9 102.9L481.1 100L482.4 94.7L486 95.2L489.1 93.4L489.5 91.8L491.5 90.7L493 91.3Z","TJ":"M495.7 91.7L496.8 89.7L496.4 88.2L494.9 87.7L495.4 86.8L497.1 86.9L498.7 84.5L501.3 84.1L500.9 85L502 85.5L499.1 85.8L498.9 86.9L507.4 87.1L507.9 89L509.7 89.2L510 91.2L506.5 91L503.7 92.5L502.7 89.5L501.6 89L498.4 91.7L495.7 91.7Z","KG":"M501.9 81.5L503.7 80.3L507 81L508.4 79.4L518.3 80.3L520.5 81.3L516.4 83.6L513.8 83.9L513.1 85.1L510.9 84.9L507.6 86.2L507.4 87.1L503.6 87.4L498.9 86.9L499.1 85.8L503.5 85.7L506.1 84.3L500.8 83L501.9 81.5Z","TM":"M465 82.4L468.2 81.4L470.9 83.5L474.2 83.4L473.9 82.3L477.3 80.5L480 81.6L480.9 83.6L483.8 83.8L484.7 85.9L488.3 88.2L493.1 90.1L493 91.3L491.5 90.7L489.5 91.8L489.1 93.4L484.5 95.5L482.4 94.7L482.2 93L474.7 89.9L471 90.1L467.8 91.6L467.8 88.1L466.2 87.4L466.7 86L465.4 85.9L465.8 84.2L469.5 84.1L467.4 81.8L465.8 82.3L465.6 83.7L465 82.4Z","IR":"M457.1 106.1L455.4 104L455.7 102.6L454.7 101.1L452.2 100L450.8 98.1L452.2 94.6L450.8 94L448.5 90.1L448.2 87.1L449.6 86.6L452.3 88.5L456.1 86.8L456.7 87.4L456 88.4L458.4 90.8L464.5 92.6L467.7 92.1L471 90.1L474.7 89.9L482.2 93L481.1 98.6L481.9 98.9L481.1 100L481.9 102.9L483.4 103.2L483.6 104.5L481.7 106.3L485.5 109.5L486.6 112.5L483.7 113.5L483 115.8L474.8 114.5L473.9 112.1L469.4 113L467 112.4L463 110.3L460.2 105.7L457.9 105.4L457.1 106.1Z","SY":"M431.4 100.6L433.2 97.6L432 96.7L431.8 95.2L433.5 92.4L439 92.6L444.7 91.5L442.6 93.3L442 97.2L433.7 101.4L431.4 100.6Z","AM":"M453 88.5L447.3 85.5L447.2 83.8L449.9 83.5L451.1 84.4L451.2 86.2L453 87.1L453 88.5Z","SE":"M382.1 48.3L384.6 45.8L385.3 43.4L384 42.4L383.9 39.7L385.2 37.9L387.1 37.9L387.8 37.1L387.1 36.4L393.5 30L395.5 30L396 28.9L399.8 29.2L400.1 27.9L401.3 27.8L407.1 30.1L407.8 34L404.4 34.6L402.4 35.9L402.7 37.2L395.7 40.5L394.2 43.3L397.6 45.8L395.7 48.1L393.7 48.6L391.8 53.8L389.3 53.6L388.2 55.2L385.9 55.3L382.1 48.3Z","BY":"M416.4 53.7L421.7 54.9L421.5 56.4L425.4 59.3L422.6 59.9L423.6 61.8L421.9 61.9L421.1 63.4L410.7 62.2L407.1 62.8L406.4 61L407.6 60.6L407 58.2L411.1 57.4L413.2 55.7L413 54.8L416.4 53.7Z","UA":"M423.6 61.8L427.5 61.3L428.8 62.5L428.4 63.5L430 63.6L430.7 64.8L440.1 66.8L439.5 70.2L429.9 73.5L430 74.5L423.5 73.3L423.4 72.6L421.5 72.8L419.2 75.4L417.4 75.4L416.5 75L417.7 73.1L420 73.2L417.3 69.8L415 69.1L409.7 70.5L405.4 70.2L404.2 69.2L405.6 67.9L405 67L407.8 65.2L407.1 62.8L410.7 62.2L421.1 63.4L421.9 61.9L423.6 61.8Z","PL":"M407 58.2L407.6 60.6L406.4 61L408.1 64.6L405 67L405.6 67.9L403.2 67.1L399.7 67.6L395.1 65.3L392.4 65.2L390 63.8L388.1 60L388.2 58.5L395.2 56.3L407 58.2Z","AT":"M394 69.8L393.8 70.6L392.7 70.6L392 72.6L389.3 73.1L384.3 71.8L382.1 72.5L379 71.8L379.8 70.8L385.9 71.1L385.8 69.4L387.2 68.2L393 68.4L394 69.8Z","HU":"M404.2 69.2L405.4 70.2L402 73.4L396.9 74.5L392.4 72.3L392.7 70.6L393.8 70.6L394 69.8L395.7 70.5L401.6 68.8L404.2 69.2Z","MD":"M413.2 69.6L417.3 69.8L420 73.2L417.7 73.1L416.5 75L416.3 72.4L413.2 69.6Z","RO":"M416.5 75L419.2 75.4L417.7 76.2L417.1 78.6L414.5 77.6L411.1 78.6L405.9 78.4L405.4 76.8L403.1 76.5L400.4 73.7L406.3 69.8L409.7 70.5L413.2 69.6L416.3 72.4L416.5 75Z","LT":"M413 54.8L413.2 55.7L411.1 57.4L407 58.2L405.5 57.3L405.5 56.3L402.5 55.6L402.1 53.9L409.7 53.3L413 54.8Z","LV":"M414.6 51.1L416.4 53.7L413 54.8L409.7 53.3L402.1 53.9L403.2 51.2L405 50.5L406.6 52L408.2 51.9L408.6 50.4L410.3 50.1L414.6 51.1Z","EE":"M416 47L414.8 48.6L415.4 50.4L414.6 51.1L408.6 50.4L408.9 49.2L406.9 48.8L406.7 47.6L416 47Z","DE":"M388.2 58.5L390 63.8L384.5 65.5L385 66.9L387.2 68.2L385.8 69.4L385.9 71.1L374.9 70.8L376.2 68L373.3 67.6L372.1 65.7L372 62.3L373.7 61.5L374.2 58.6L376.2 58.9L377.6 58L377.1 56.1L379.8 56L381.9 58L385 57.1L388.2 58.5Z","BG":"M405.3 77.5L405.9 78.4L411.1 78.6L414.5 77.6L417.1 78.6L415.3 80.8L416 82L412.2 82.3L412.2 83.3L405.9 83.3L404.8 81.4L406 79.6L405 78.7L405.3 77.5Z","GR":"M412.6 95.4L409.4 96.2L407 95.4L407.4 94.6L412.6 95.4ZM405.9 83.3L413.2 82.9L412.1 84.4L407.4 84.6L408.8 85.8L405.3 85.5L406.7 87.6L405.9 88.1L408.1 89.6L408.1 90.7L406.2 90.2L406.8 91.2L405.5 91.4L406.3 93.2L405 93.2L403.3 92.3L400.3 86.8L402 84.3L405.9 83.3Z","TR":"M449.5 91.7L445.6 91.2L439 92.6L433.5 92.4L432.3 94.4L431.6 93.5L432.3 92.7L429.4 92.4L428.1 93.6L425 93.8L421.2 92.6L419.4 93.7L415.3 92.7L412.6 89.6L413.6 88L412.3 87.1L414.6 85.2L417.6 85.1L418.5 83.6L422.3 83.8L427 82L430.3 81.9L436.7 84.1L445.2 82.8L447.2 83.8L447.3 85.5L449.6 86.6L448.2 87.1L449.5 91.7ZM412.2 82.3L416 82L418 83.4L412.7 85.7L412.1 84.4L413.2 82.9L412.2 82.3Z","AL":"M402 84.3L400.3 86.8L398.8 85.5L398.6 81.6L399.5 80.6L401 81.6L401.2 83.8L402 84.3Z","HR":"M393.1 73L397.7 74.2L398.8 75.5L398 76.3L391.9 75.5L391.5 76.4L396.9 81L392 79L389.8 75.8L388.5 75.5L387.9 76.4L387.3 75.7L387.4 75L390.7 75.1L391.5 73.5L393.1 73Z","CH":"M379.2 70.9L379 71.8L380.9 72.2L379.8 73.4L374.5 74.4L373 73.1L372 73.5L373.5 70.9L379.2 70.9Z","LU":"M372.1 65.7L372.4 67.1L371.3 66.9L372.1 65.7Z","BE":"M372.3 64.4L371.3 66.9L365 63.7L369.9 63L372.3 64.4Z","NL":"M373.8 59L373.7 61.5L372 62.3L372.3 64.4L369.9 63L366.6 63.3L369.4 59.8L373.8 59Z","PT":"M341.9 82.2L343.5 81.4L344 82.4L346.7 82.2L347.2 83.2L346.3 83.8L345.9 86.6L345 86.7L345.9 89.8L344.3 92.3L342.2 92.3L342.3 89.5L340.9 88.5L342.5 84.5L341.9 82.2Z","ES":"M345.1 91.8L345.9 89.8L345 86.7L345.9 86.6L346.3 83.8L347.2 83.2L346.7 82.2L344 82.4L343.5 81.4L341.9 82.2L341.2 79.9L344 78.5L356.2 79.2L360.7 80.8L366 81.1L366.1 82.2L364.2 83.5L361.6 84L359.4 87.4L360.2 88.5L355.7 92.7L351.3 92.6L349.2 94.1L347 92.1L345.1 91.8Z","IE":"M347.6 58.3L347.9 59.7L346.4 61.5L342.9 62.7L340 62.4L341.7 60.3L340.6 58.2L344.9 55.7L344.9 57.9L347.6 58.3Z","NC":"M691.6 208.2L694.2 210.3L692.4 210.3L688.1 206.2L691.6 208.2Z","SB":"M684.2 187L684.8 187.7L683.4 187.6L682.6 186.4L684.2 187ZM683.4 185.2L681.2 182.6L683.4 185.2ZM681.7 185.7L679.7 185.6L679.4 184.5L681.7 185.7ZM679.3 182L679.8 183.1L676.4 180.8L679.3 182ZM674.3 180L673.1 179.2L674.3 180Z","NZ":"M713.8 246.1L712 248.6L710.5 249.4L709.3 248.6L710.5 246.9L707.6 245L709.1 243.6L709.4 240.8L705.3 235.1L708.7 236.5L710.7 240.4L710.7 239.1L711.6 239.6L711.9 241.1L714.9 241.9L717 241.4L715.9 244.3L714.4 244.3L713.8 246.1ZM699.3 253.1L705.6 247L706.5 248.7L707.9 247.9L708.5 248.7L705.4 252.7L706.2 253.7L702.9 254.5L701.2 257.8L698.7 259.3L693.4 258.4L693 257.7L696.6 254.2L699.3 253.1Z","AU":"M655.4 247.6L656.6 247.8L655.8 252.4L655.1 251.9L653.7 253.3L652.1 253.1L649.5 247.4L652.7 248.3L655.4 247.6ZM612.3 230.4L608.4 231.9L607.3 233.8L599.8 234L596 236.1L593.3 236.1L590.1 234.4L590.1 233.2L591.4 232.5L591.6 230.4L590.1 224.9L586.7 218.2L587.6 219.1L586.9 217.2L588.5 218.6L586.8 214.8L587.5 211L588.3 209.5L588.5 211L589.3 209.7L593.4 207.4L601.7 205.4L604.5 202.4L604.6 200.5L606 198.8L606.9 200.5L607.7 200.1L607 199.2L607.6 198.2L608.5 198.7L608.8 197.1L611.4 194.5L614.1 193.6L616.7 195.7L619.2 195.9L618.8 194.8L621.2 191.1L625.2 190.2L625.1 189.2L623.6 188.5L624.7 188.3L630.6 190.5L633 189.7L633.9 190.7L631.9 192.6L631 196L640.4 201.4L641.8 200.7L642.5 198.8L643.4 190.8L645 187.3L647.8 195.1L649.1 194.3L650.7 196L652.8 203.9L657.7 206.8L659.4 210.7L661.5 210.8L661.8 212.9L665.7 216.5L667.1 222.2L665.8 229.3L660.7 237.3L660 240.9L656.6 241.6L652.6 244.1L649.8 242.8L650.1 241.8L647.2 243.6L641.3 242L639.1 238.3L636.2 237.2L636.4 234.8L635.4 236.2L633.7 236.5L635.8 233.3L635.6 231.8L632 235.8L630.4 235L628.5 231.2L622.7 229L612.3 230.4Z","LK":"M523.6 151L523.3 153L520.7 154.1L519.4 149.6L520.3 146.4L523.6 151Z","CN":"M579 129.6L577.3 129L577.3 127.3L581.6 125.8L582 126.6L580.7 128.6L579 129.6ZM520.5 81.3L520.4 80.2L521.7 79.6L519.9 76.2L524.9 74.9L526.4 71.3L530.3 72L531.4 71.1L531.5 69.1L535.5 67.4L536 68.8L540.6 70.6L541.9 72.2L541.2 74.6L541.9 75.4L550.6 77.5L552.7 80.5L561.7 80.7L569.9 82.8L578.5 81L583.7 78.5L582.7 77.1L583.7 75.8L586.9 76.4L594.8 72.7L599.3 72.6L599.5 71.9L596.1 69.9L591.5 70.5L591 69.7L593.4 66.2L595.8 67L598.6 65.7L601.5 62.1L601.5 61L600.4 60.5L604.5 59.1L611.9 60.4L615.3 66.5L618.8 67.1L621.2 68.5L622 70.4L630.1 69L626.2 75.7L622.1 76.1L622.3 80.1L621.3 80.2L621.3 81.2L620 80L619.2 81.2L616.1 82L616.4 83.1L613.7 82.4L608.5 86.1L602.1 88.2L604.3 85.2L603.3 84.1L595.1 88.5L599.4 91.7L601.6 90.3L604.7 91.1L605 92.1L602.2 92.7L598.3 96.2L600.5 97.3L603.8 102.6L603.8 104.1L602.5 104.6L604.2 106.3L603.4 109.5L602.3 109.7L597.3 116.9L591.8 120.4L588.3 121.6L587.6 120.9L581.6 123.2L580.9 125.3L579.8 125.4L579.7 123.2L574.1 122.4L573.1 121.6L573.5 120.4L570.7 119.3L563.3 121.4L563.6 123.7L562.5 123.6L562.3 122.3L560.8 122.9L558.5 121.8L559.1 120.1L557.8 119.7L557.3 117.9L555.2 118.2L555.4 115.8L557.3 114.2L557.4 111L555.8 109.3L552.5 109.2L553.2 108.3L552.2 107.1L550.8 107.9L549.1 107.4L545 110.2L540 109.4L537.6 111.4L537.5 109.8L531.6 109.6L517.5 103L516.9 100.8L518.4 101L518.4 100L517.8 97.4L515.7 95L512.4 94.2L510 91.2L509.7 89.2L507.9 89L507.4 87.1L509.6 85.3L513.1 85.1L513.8 83.9L516.4 83.6L520.5 81.3Z","TW":"M603.6 117.2L601.5 122.1L600.2 118.9L603 115.4L603.9 116L603.6 117.2Z","IT":"M380.9 72.2L384.3 71.8L387.6 73L387.9 74.8L384.7 75.2L385.2 77.8L390.3 82.1L391.9 82.1L391.8 82.9L396.8 85.3L396.6 86.4L393.7 85.1L392.9 86.4L394.3 87.2L394.1 88.2L391.4 90.2L392.2 88.1L390.8 85.9L382.4 81.3L380.4 78.2L377.8 77.3L374.9 78.6L375.1 77.7L374 77.5L373.5 75.9L374.2 75.3L373.7 74L377.9 73.9L378.4 73.1L380.7 73L380.9 72.2ZM389.5 89.7L391 89.5L390.2 92.8L384.9 90.8L385.1 89.7L389.5 89.7ZM377.4 84.2L378.4 83.6L379.6 85L379.3 87.6L377.6 88.2L376.3 84.1L377.4 84.2Z","DK":"M379.8 56L377.1 56.1L376.2 52.9L377.1 51.8L381.2 50.5L380.5 52.2L381.8 53.1L379.3 55.1L379.8 56ZM384.7 53.8L385.4 54.8L384.2 56.4L382.1 55.3L381.8 54.4L384.7 53.8Z","GB":"M347.6 58.3L344.9 57.9L344.9 55.7L348.7 56.9L347.6 58.3ZM353.8 59.2L354.1 58L352.7 56.8L349.8 55.9L350.6 55L349.9 54.4L348.8 55.4L347.7 52.4L350 48.7L354 48.7L351.9 50.9L356.1 50.6L353.8 54.1L355.8 54.2L357.8 56.8L359.1 57.1L360.9 60.1L363.4 60.5L362.1 62.4L362.9 63.4L361.1 64.5L354.1 64.6L349.5 66.1L348.4 65.7L353.2 63.1L349.5 62L351.6 61.4L350.5 60.3L350.8 59L353.8 59.2Z","IS":"M331 33.1L330.5 34.4L332.8 35.7L330.2 37.3L322.7 39L314.5 38.1L316.4 37.2L312.1 36.2L315.5 35.2L311.3 34.8L312.7 33.5L315.7 33.2L318.8 34.5L321.9 33.4L324.4 34L327.7 32.9L331 33.1Z","AZ":"M452.8 82.3L455.6 83.7L457.2 82.4L460.8 85.5L459.1 85.6L457.8 89.4L456 88.4L456.7 87.4L456.1 86.8L453 88.5L453 87.1L451.2 86.2L451.8 85.6L449.9 83.5L453 83.9L452.8 82.3ZM452.3 88.5L449.6 86.6L451.5 87.1L452.3 88.5Z","GE":"M439.9 79.1L450.9 81L453.3 83.6L447.2 83.8L443.1 82.9L442.9 80.7L439.9 79.1Z","PH":"M601.7 140.6L600.6 139.1L603.1 139.9L602.5 141.6L601.7 140.6ZM605.2 146L605.9 144.2L607 144.1L606.7 145.5L608.2 143.5L608 145.4L606 148L605.2 146ZM612.8 149.2L613.1 151.6L612.4 153.5L611.7 151.4L610.7 152.4L610.8 154.8L608.4 153.7L608.5 151.3L607.2 150.3L604.2 152.2L603.8 151.6L604.6 149.9L607 148.6L607.7 149.5L610.9 148L610.8 146.5L612.4 147.4L612.8 149.2ZM597 147.4L594.3 149.3L599 143.3L599.4 144.9L597 147.4ZM604.7 129.6L605 131.8L603.3 134.1L603.5 137.3L607.9 138.4L608.2 140.9L605.9 138.9L605.3 139.6L604.1 138.4L601.3 138.3L602 136.9L601.4 136.5L601.1 137.2L599.8 135.2L601.4 129L604.7 129.6ZM604.1 143.2L603.8 142.2L606.2 142.8L604 145.1L604.1 143.2ZM611 141.7L611.6 143.9L610 143.4L610.6 145.3L609.6 145.7L608.6 143L609.8 143.2L609.8 142.4L608.5 140.9L611 141.7Z","MY":"M560.2 153.1L562.2 153.6L562.3 154.6L564.3 153.6L565.9 155L568.5 163.4L567 163.5L562.8 160.5L560.2 153.1ZM595.8 157.7L591.7 157.4L589.2 163.1L585.7 163L581 164.5L579.7 163.3L579.3 162L582.3 162.3L582.7 160.6L586 159.8L588.4 156.9L589.3 158L590.7 157.4L590.9 155.1L593.5 152.2L598.4 155.2L595.8 157.7Z","BN":"M590.9 155.1L590.7 157.4L589.3 158L588.4 156.9L590.9 155.1Z","SI":"M387.6 73L392.4 72.3L393.1 73L391.5 73.5L390.7 75.1L387.4 75L387.6 73Z","FI":"M417.2 27.9L416.9 29.3L420 30.6L418.1 32.1L420.4 34.4L419.1 36.1L420.9 37.6L420.1 38.9L423 40.3L422.3 41.3L416.1 45L405.7 46.3L402.6 44.6L403.1 42.6L402.1 40.8L403.1 39.6L410.8 35.8L407.1 33.2L407.1 30.1L401.3 27.8L402.5 27.3L409.5 28.7L412.4 26.3L415.5 25.7L418 26.5L417.2 27.9Z","SK":"M405.1 67.8L403.7 69.4L401.6 68.8L395.7 70.5L393.8 69.1L397.1 67L405.1 67.8Z","CZ":"M390 63.8L397.7 67L393.9 68.8L390.5 67.9L388.7 68.9L385 66.9L384.5 65.5L390 63.8Z","ER":"M432.9 137.2L433.7 132.1L436.8 130L438.5 134.2L446.2 140.6L444.7 140.9L440.1 137L437 137L435.8 136.1L435.2 137.6L432.9 137.2Z","JP":"M643.8 87.6L641.9 89.7L641.5 94.3L640.5 95.7L634.4 96.8L631.6 99.1L630.2 98.3L630.2 96.8L622 98.2L624 99.7L622.7 103.1L621.4 103.9L620.4 103.2L620.9 101.4L618.8 99.4L625.2 95.1L631.4 94.9L633.4 91.4L634.8 92.3L638.9 89.6L640.6 83.6L642.7 83.2L643.8 87.6ZM649.2 78.1L650.6 77.2L651.1 79.5L648.1 80L646.4 82L643.2 80.6L642.1 82.8L639.9 82.9L639.6 80.9L640.6 79.3L642.8 79.2L643.9 74.9L649.2 78.1ZM624.7 99.1L627.8 97.3L629.5 98.4L628.4 99.6L626.6 99.4L626 100.6L624.7 100L624.7 99.1Z","PY":"M243.7 206.4L244.1 210.2L248.4 210.7L249.2 213.9L251.4 214L250.4 219.2L248.6 220.8L242.8 220.2L244.7 217.2L244.4 216.3L238.3 213.8L234.6 210.5L236.4 205.3L241.8 204.7L243.7 206.4Z","YE":"M464 128L466.2 132.7L464.8 133.2L464.3 134.8L457.4 138L451.3 139.4L450 140.6L447 140.7L445.2 135.6L446.8 130.8L454 132.1L458.2 128.8L464 128Z","SA":"M429.9 107.3L432.1 107.6L435 106L436 105L434 103L438.4 101.7L443.8 103.6L449.4 107.6L454.9 108L460.3 112.6L460.5 114.8L462.8 116.7L464 120L470.4 120.6L471.3 122L470 126L458.2 128.8L454 132.1L446.8 130.8L445.6 133.3L441.9 127L438.3 123.4L437 118.6L435 117.4L430.3 109.9L429.3 109.9L429.9 107.3Z","CYN":"M425.5 95.7L429.2 94.7L427.9 95.9L425.5 95.7Z","CY":"M425.5 95.7L428 96L426 96.9L424.5 95.8L425.5 95.7Z","MA":"M355.7 95.7L357.4 101.5L352.7 102.7L352.6 104.2L349.5 106L342.7 108.3L342.4 111.8L337.2 112.2L335 116.5L332.2 118.6L330.5 123L326 123.2L331.1 113.5L334.8 109.9L336.6 109.7L340.9 106.1L340.4 103.6L342.7 99.5L346.2 97.8L348.1 94.5L355.7 95.7Z","EG":"M433.7 122L410 122L409.4 105.9L410.3 102.9L417.8 104.3L422 102.9L423.9 104.1L428.5 103.6L429.8 107L428.3 110.4L426.3 109.2L424.6 106.5L431.4 118.1L431.1 119.8L433.7 122Z","LY":"M410 122L410 126L407.7 126L407.7 126.8L391.7 119.2L388.3 121L381.5 116.9L380.6 117.2L378.6 113.8L379.4 113L379 105.4L379.9 104.9L379.9 103.2L382.9 101.3L383 99.7L390.5 101.5L391.4 103.2L398.2 105.5L400.1 104L399.6 102.5L401.7 100.6L405.8 100.7L406.5 101.6L409.8 102.2L410 122Z","ET":"M455.6 150L449.9 156L447.3 156.1L443.7 158.2L441.5 157.5L439.1 159.2L432.3 157.1L429.4 152.8L425.9 150.4L427.7 149.2L428.5 144.7L431.7 140.8L432.9 137.2L435.2 137.6L435.8 136.1L437 137L440.1 137L443.2 139.1L444.7 140.9L443.3 142.7L443.5 143.9L445.6 144.1L445.1 144.9L447.4 147.6L455.6 150Z","DJ":"M444.7 140.9L446.6 141.2L445.4 142.5L446.3 143.1L445.6 144.1L443.5 143.9L443.3 142.7L444.7 140.9Z","SOL":"M457.9 143.2L457.9 147.1L455.6 150L447.4 147.6L445.1 144.9L446.3 143.1L448.2 145.1L457.9 143.2Z","UG":"M427.8 167.9L419.2 168.7L419.8 164.8L422.3 161.6L421.5 161.3L421.7 159L422.5 158.4L426.8 158.4L428 157.5L429 158.9L430.1 162.2L427.8 165.8L427.8 167.9Z","RW":"M420.8 168.3L421.5 170.6L418 171.7L418.6 169.2L420.8 168.3Z","BA":"M397.1 80.7L392.9 77.9L391.5 76.4L391.9 75.5L398.7 76.3L398.9 78.9L397.1 80.7Z","MK":"M404.8 81.4L405.9 83.3L401.2 83.8L401.5 81.9L404.8 81.4Z","RS":"M397.7 74.2L400.4 73.7L403.1 76.5L405.4 76.8L404.8 78L406 79.6L405.1 81.1L403.2 81.5L403.6 80.6L401.6 79.5L400.5 80.4L398.4 79L399.2 77.9L397.7 74.2Z","ME":"M400.1 80.8L399.5 80.6L398.7 82.2L396.9 81L398.4 79L400.7 80.2L400.1 80.8Z","XK":"M401.2 82.3L400.1 80.8L401.3 79.6L403.6 80.6L401.2 82.3Z","TT":"M236.6 144.5L238.2 144.3L238.1 145.8L236.1 145.8L236.6 144.5Z","SS":"M421.7 159L419.4 156.8L416 157.2L410.2 150.3L407.8 148.8L409.1 148.2L410.1 145.5L411.6 145.2L413.5 147.1L417.9 147.2L420 145.4L422.7 146.4L424.8 143.8L424.1 142.1L426.4 141.6L426.4 144.6L427.4 145.3L427.9 148.6L425.9 150.4L428.2 151.5L430.6 155L426.8 158.4L421.7 159Z"},"proj":{"lon0":-180,"lat0":83,"k":2,"s":2}},"france":{"vb":[0,0,427,420],"path":"M412.5 347.8L411.8 353.7L413.7 357.9L414.4 374.8L410.3 383L410.1 390.8L409.5 392.8L408.4 394.9L406.2 401.6L404.4 404.6L396.4 399.4L393.9 396.5L395.9 393.3L396.1 392L391.5 389.5L391.5 387.8L392.6 385.2L392.1 383L388.8 382.8L388.6 381.6L391.1 378.3L391 376.2L389.4 375.3L387.9 373.6L387.3 371.2L388.4 369.7L390.3 368.6L388.9 366.3L387.3 365.7L389.3 362.9L391.3 358L394.1 355.7L400.4 353.5L403 350.7L404.7 350.8L407.2 352.2L407.9 351.5L408.6 349.3L408.1 347.4L408.4 342.2L409.2 339.3L410.7 339.1L412 340.8L412.5 347.8ZM361.1 156.3L357.8 158.1L355.7 161.8L353.6 162.7L349.8 162.7L347.9 160.4L345.6 160.4L343.3 161.9L341.4 164.2L342 165.6L343.7 165.9L344.2 167.1L335 178.9L329.2 182.1L327.9 189.8L321.1 195.6L318.5 201.7L318.3 202.9L320 204.9L319.3 208.8L315.8 211.4L315.9 214L316.8 214.3L319 214.1L322.1 212.3L324.2 209.9L322.8 207.2L323.1 206.7L325.5 204.3L328.5 202.8L332.6 202.5L338 203.7L338.2 207.4L339.1 209L337.9 213.4L342.9 219.3L344.8 223L342.5 225.3L338.8 227.4L338.4 230.4L338.8 231.6L340.9 233.2L344.6 240L348.4 244L346.3 250.4L343.7 251.4L339.8 254.6L335.7 254.2L333.9 255.3L334.1 257.3L335.7 259.1L337 263.1L338.7 264.7L342.5 265.7L344 266.9L345 271.3L344.4 272.4L343.1 272.9L339.9 279.6L341.3 282.9L340.7 284.3L341.4 286.6L343.3 288.8L352.9 294.5L354.4 294.9L361.7 293.4L362.8 296.7L362.1 298.7L357.4 305.4L357.8 309.3L356.3 310L355.6 309.2L355.1 309.4L354.6 310.7L349.2 313.6L340.5 322.5L336.4 325.1L334.7 329.5L332.3 332L330.2 333.2L325.1 334.5L319.8 337.1L317.5 336L311.4 336.1L307.6 332.9L300.3 330.9L297.9 326.2L292.4 326L291.1 325.3L290.8 322.2L286.7 322.9L284.8 324.2L283.2 323.9L283.3 324.8L281.2 325.1L271.9 321.7L267.7 320.8L266.1 319.9L264.7 317.5L263 316.3L259.1 317.5L255.6 321.5L241.2 332.3L235.5 343.4L235.2 346.5L236.5 356.4L239.9 362.8L238.2 362.8L233.2 361.3L231.1 361.8L225.8 363.7L225 364.3L224.4 366.4L222.1 366.2L212 363.2L207.4 365.9L206.1 365.7L204.5 362.9L198.4 359.9L199.4 357.7L198.5 355.8L192.8 354.3L190.8 356.2L188.6 352.4L187 351.6L184.7 351.5L179.2 348.8L172.5 346.5L169.9 346.6L168.8 352.4L158.5 352.3L157 351.2L150.3 352.4L143.2 347L142.1 346.8L138.2 348L135.3 348L130.4 342.4L125.7 342L119.1 339.2L116 337.6L115.6 336L113.7 338.5L112.1 338.5L111.2 337.9L110.7 337.2L112.3 334L112.6 330.4L110.9 329.3L106.6 328.7L104.3 327.7L103.2 327L102.1 325.1L102 323.7L106.5 322.5L110.6 317.4L114.4 299.2L117.1 277.6L119.2 273.5L121.8 272.4L119.7 269.4L117.2 273.3L118.7 253.5L121.7 238.7L128.7 244.8L130.3 247.4L132.4 256.3L136.3 260L135.4 257.9L133.8 256.4L131.3 244.6L129.7 241.3L127.2 238.5L119.2 232.6L118.5 231.4L118.1 229.2L120.8 229.3L123 230.4L121 223L119.9 207.5L115.3 206.9L113.1 206L102.2 199.4L98.5 192.6L94.7 187.6L93.8 185.4L93.9 183.2L95.8 178.5L94.1 175.5L92.4 174.9L90.9 173.5L93.4 169.5L95.6 169.1L103.5 171.4L97 167.6L86.6 168.8L82.5 167.5L81.8 164.7L83.3 163.5L84.6 161.2L83.1 159.5L81.1 158.9L75.2 159.4L74.4 158.5L76.2 155.9L74.7 155L69.8 156L67.1 155.1L64.5 152.2L61.5 152.6L59.8 151.5L56.6 151.6L54.9 149.9L44 146.5L39.4 146.1L35.1 147.6L32.7 147.1L31 144.9L29.5 141.2L22.6 138.4L24 136.6L27.2 136.1L30.9 134.8L32.2 133.2L29.3 131.3L27.2 130.8L25.4 128.4L26.7 127.6L30.2 128.3L34.7 127.9L33 126.1L30.5 125.3L21.5 125.5L20.3 122L21.5 118.4L26.7 115.2L39.7 111.7L45.3 112.2L49.2 111.6L53.8 109.4L55.9 107.5L62.5 106.4L68.7 108.4L74.5 116L77.3 118.5L84.1 114.1L94.2 114.2L96.3 116.7L99 112.1L100.4 113.2L101.2 114.8L113.5 113.9L110.7 112.1L108.3 107.8L107.8 91.9L104.9 87.5L101.5 80.4L99.9 76.2L100.3 72.6L107.7 73.3L113.8 71.7L116.8 72.8L116.6 76.1L117.5 80.2L120.1 84.5L125 84.3L130.4 85.6L137.1 85.8L146.9 88.1L151.1 86.8L155.2 83.9L162.9 82.1L163.5 81.1L159.1 81.5L155 79.7L154.4 77.7L156.6 71.9L168.4 65.5L176.9 63.6L185.7 60.1L190.2 56.5L193.1 51.8L195.3 49.9L194.2 48.2L194.9 30.4L195.8 27.2L197.5 24.6L204.1 20.4L218.8 17.3L221 16.1L221.3 18L223.1 21.8L222.5 23.5L222.9 25L227.4 30L229.6 31.5L237 28.8L239.1 30.7L240.5 33.5L241.6 38.7L242.7 39.7L247.2 40L250.4 40.9L251.3 41.7L252.4 47L253 47.8L254.6 46.3L260.2 46.6L262.8 47.1L266.4 50.1L265.3 54.2L266.9 56.2L266.6 57.9L265.3 60L265.7 61.1L266.4 61.6L271.7 62.2L276.6 61.6L279.6 59.9L281 56.1L284.1 53.9L285.3 54.6L283.3 61.6L284.7 63.4L285.5 68.5L289.3 68.9L292.5 71.1L296.8 72.9L303.1 79.6L310.9 78.5L311.8 79.8L317 82.2L318.7 81.8L319.9 80.6L321.6 80L323.3 80.2L326.1 81.9L329.3 82.3L331.4 84.2L332.5 87.2L336.9 93.6L338 93.8L340 91.9L341.2 91.7L344.2 92.8L345.2 95.5L347.4 94.9L349.7 95.5L356.6 93.9L358.6 96.5L361 97.5L371.7 99.6L375.4 101.1L375.6 104.5L367.3 114.6L363.6 128.8L361.2 133.7L360.3 137.4L360.9 139.9L360.5 143.8L359 149.1L358.8 153L359.7 155.7L361.1 156.3ZM119 223.8L118 227.3L116.2 224.1L113.8 221.3L113.2 218L116.1 219.9L119 223.8Z","proj":{"lon0":-5.5,"lat0":51.5,"k":27.5342,"s":40}}};
const GAME_WIN = 50, GAME_PTS = 20, MAP_LOSS = 5;
const GAMES = [];
const GKEY = { lieu: 'l', histoire: 'h', etymo: 'e', sens: 's', curseur: 'c', existait: 'x' };
[['lieu', BOOK.lieux], ['histoire', BOOK.histoire], ['etymo', BOOK.etymo], ['sens', BOOK.sens], ['curseur', BOOK.curseur], ['existait', BOOK.existait]].forEach(([kind, list]) => {
  (list || []).forEach((x, i) => {
    if (kind === 'lieu' && !CARTES[x.carte]) return;
    if ((kind === 'histoire' || kind === 'etymo' || kind === 'sens') && (!Array.isArray(x.choix) || x.choix.length < 2)) return;
    if (kind === 'curseur' && !(x.max > x.min && x.val > 0)) return;
    if (kind === 'existait' && !(Array.isArray(x.cartes) && x.cartes.length >= 2)) return;
    const j = wordIn(x.phrase, x.mot);
    if (j >= 0) GAMES.push({ key: GKEY[kind] + i, kind, j, x });
  });
});
const gameSkipped = new Set();
const GAME_ICO = {
  lieu: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M16 2.5c-5.2 0-9.3 4-9.3 9 0 6.6 9.3 18 9.3 18s9.3-11.4 9.3-18c0-5-4.1-9-9.3-9z"/><circle class="g2" cx="16" cy="11.6" r="3.6"/></svg>',
  histoire: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M5 10.5L16 4l11 6.5zM7.5 12h3v12h-3zM14.5 12h3v12h-3zM21.5 12h3v12h-3zM5 25.5h22V29H5z"/></svg>',
  etymo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M4 7c4-1.6 8-1.4 12 1 4-2.4 8-2.6 12-1v18c-4-1.6-8-1.4-12 1-4-2.4-8-2.6-12-1z"/><path class="g3" d="M16 8v18"/><text x="10" y="19.5" text-anchor="middle">?</text></svg>'
};
const GAME_LAB = { lieu: 'Situe-le sur la carte', histoire: 'Personnage historique', etymo: 'D’où vient ce mot ?' };
function paintGames() {
  const acts = byId('rail');
  GAMES.forEach((g) => {
    const live = !S.jeux[g.key] && !gameSkipped.has(g.key);
    if (live && g.shown && k > g.j + GAME_WIN && gameOpen !== g) { gameSkipped.add(g.key); g.shown = false; }   // la pastille est passée
    const on = live && !gameSkipped.has(g.key) && k >= g.j && k <= g.j + GAME_WIN && !byId('reader').hidden;
    let b = acts.querySelector('[data-game="' + g.key + '"]');
    if (on && !b) {
      b = el('button', 'rail-b rail-game rail-' + g.kind); b.type = 'button'; b.dataset.game = g.key;
      b.setAttribute('aria-label', gameAria(g));
      const ic = el('span', 'rb-ico'); ic.innerHTML = GAME_ICO[g.kind];
      b.append(ic, el('span', 'rb-t', g.x.nom));
      b.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openGame(g); });
      acts.append(b);
      b.classList.add('in');
      g.shown = true;
      beat(1000);
    } else if (!on && b) b.remove();
  });
}
let gameOpen = null, gameWas = false, gameDone = false;
function openGame(g) {
  if (gameOpen || S.jeux[g.key]) return;
  gameWas = playing;
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; }   // jouer n'est pas une pause
  gameOpen = g; gameDone = false;
  const box = byId('gameC');
  box.dataset.kind = g.kind;
  const x = g.x;
  const parts = gameHead(g);
  const body = el('div', 'gm-body');
  parts.push(body);
  if (g.kind === 'lieu') buildMap(body, g);
  else if (GAME_BUILD[g.kind]) GAME_BUILD[g.kind](body, g);
  else {
    const opts = x.choix.map((t, i) => { const b = el('button', 'qz-o gm-o', t); b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation(); answerQcm(g, i, opts); }); return b; });
    body.append(...opts);
  }
  parts.push(el('div', 'gm-fb'), el('span', 'mc-skip gm-skip', g.kind === 'lieu' ? 'Touche la carte · touche ailleurs pour passer' : 'Touche ailleurs pour passer'));
  box.replaceChildren(...parts);
  box.hidden = false;
  box.classList.remove('out', 'in');
  if (!trove) { void box.offsetWidth; box.classList.add('in'); stage.dataset.game = '1'; }
  buzz(8); SFX.soft();
}
function gameResult(g, good, delta) {
  gameDone = true;
  S.jeux[g.key] = { ok: !!good, at: Date.now() };
  if (delta > 0) addPoints(delta, true);
  else if (delta < 0) { const n = Math.min(S.pts, -delta); if (n) addPoints(-n, false); updatePts(false); }
  persist();
  if (good) { SFX.heart(); buzz([10, 40, 10]); } else buzz(8);
  $$('#acts [data-game="' + g.key + '"]').forEach((b) => b.remove());
}
function gameFeedback(good, head, text, share) {
  const box = byId('gameC'), fb = $('.gm-fb', box);
  const h = el('p', 'qz-fb-h'); const ic = el('span', 'qz-fb-ic'); ic.innerHTML = good ? ICO_OK : ICO_BOOK;
  h.append(ic, document.createTextNode(head));
  const go = el('button', 'btn primary gm-go', gameWas ? 'Continuer la lecture' : 'Fermer'); go.type = 'button';
  go.addEventListener('click', (ev) => { ev.stopPropagation(); closeGame(true); });
  fb.className = 'gm-fb qz-fb' + (good ? ' good' : '');
  fb.replaceChildren(h, el('p', 'gm-info', text), ...gameShareBtns(share), go);
  $('.gm-skip', box).hidden = true;
}
function answerQcm(g, i, opts) {
  if (gameDone) return;
  const ok = g.x.ok | 0, good = i === ok;
  opts.forEach((o, n) => { o.disabled = true; o.classList.toggle('ok', n === ok); o.classList.toggle('picked', n === i && !good); });
  gameResult(g, good, good ? GAME_PTS : 0);
  gameFeedback(good, good ? 'Bien vu ! +' + GAME_PTS + ' points' : 'La bonne réponse', (good ? '' : g.x.choix[ok] + '. ') + (g.x.info || ''));
}
// la carte : projection simple (degrés) ; on touche, on compare à l'endroit juste
function buildMap(body, g) {
  const x = g.x, C = CARTES[x.carte], pr = C.proj;
  const NS = 'http://www.w3.org/2000/svg';
  const Pj = (lon, lat) => [(lon - pr.lon0) * pr.k, (pr.lat0 - lat) * pr.s];
  let vb = C.vb;
  if (x.vue) { const a = Pj(x.vue[0], x.vue[1]), b = Pj(x.vue[2], x.vue[3]); vb = [a[0], a[1], b[0] - a[0], b[1] - a[1]]; }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', vb.map((v) => Math.round(v * 10) / 10).join(' '));
  svg.setAttribute('class', 'gm-map gm-' + x.carte);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', x.carte === 'france' ? 'Carte de France' : 'Carte du monde');
  const sea = document.createElementNS(NS, 'rect');
  sea.setAttribute('x', vb[0]); sea.setAttribute('y', vb[1]); sea.setAttribute('width', vb[2]); sea.setAttribute('height', vb[3]); sea.setAttribute('class', 'gm-sea');
  svg.append(sea);
  let target = null;
  if (x.carte === 'monde') {
    Object.entries(C.pays).forEach(([iso, d]) => {
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'gm-land');
      if (iso === x.pays) target = p;
      svg.append(p);
    });
  } else {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', C.path); p.setAttribute('class', 'gm-land'); svg.append(p);
  }
  const unit = vb[2] / 300;   // une « taille » d'épingle, quelle que soit l'échelle
  const pin = (cx, cy, cls) => {
    const gp = document.createElementNS(NS, 'g'); gp.setAttribute('class', 'gm-pin ' + cls);
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 6 * unit);
    gp.append(c); svg.append(gp); return gp;
  };
  svg.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (gameDone) return;
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const v = pt.matrixTransform(svg.getScreenCTM().inverse());
    const lon = v.x / pr.k + pr.lon0, lat = pr.lat0 - v.y / pr.s;
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat - x.lat) * rad, dLon = (lon - x.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(x.lat * rad) * Math.sin(dLon / 2) ** 2;
    const km = Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
    let inside = false;
    if (target) { try { const q = svg.createSVGPoint(); q.x = v.x; q.y = v.y; inside = target.isPointInFill(q); } catch (er) { /* ignoré */ } }
    const good = inside || km <= x.tol;
    if (target) target.classList.add('cible');
    const [tx, ty] = Pj(x.lon, x.lat);
    pin(v.x, v.y, good ? 'mine good' : 'mine');
    const t = pin(tx, ty, 'here');
    const lab = document.createElementNS(NS, 'text'); lab.setAttribute('x', tx); lab.setAttribute('y', ty - 10 * unit); lab.setAttribute('text-anchor', 'middle');
    lab.setAttribute('font-size', 13 * unit); lab.textContent = x.nom; t.append(lab);
    gameResult(g, good, good ? GAME_PTS : -MAP_LOSS);
    gameFeedback(good, good ? 'Bien vu ! +' + GAME_PTS + ' points' : 'Raté de ' + fmtInt(km) + ' km · −' + MAP_LOSS + ' points', x.info || '');
  });
  body.append(svg);
}
function closeGame(resume) {
  const g = gameOpen;
  if (!g) return;
  gameOpen = null;
  const box = byId('gameC');
  box.classList.add('out');
  if (stage.dataset.game !== '0') stage.dataset.game = '0';
  setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 380);
  if (resume && gameWas && !byId('reader').hidden) { clearTimeout(rxResumeT); rxResumeT = setTimeout(() => { if (!playing && !gameOpen) play(); }, 450); }
  gameWas = false;
  paintGames();
}
const BET_PTS = 40;
const epBet = new Array(EPS.length).fill(0);
const BETS = [];
{
  (BOOK.paris || []).forEach((b, id) => {
    const si = sentOf102(normTxt(b.avant));
    if (si < 0 || !Array.isArray(b.r) || b.r.length < 2) return;
    BETS.push({ id: String(id), q: b.q, r: b.r, ok: b.ok | 0, a: SENT[si], z: si + 1 < SENT.length ? SENT[si + 1] - 1 : N - 1, e: EPI[SENT[si]] });
  });
}
BETS.length = 0;   // version 53 : plus de paris du tout (ni pendant la lecture, ni en fin d'épisode)
const BET_END = new Map(BETS.map((b) => [b.z, b]));
let betOpen = null;
const betSkipped = new Set();   // passés pendant cette séance : on ne les repropose pas tout de suite
// l'icône du pari apparaît dans la barre de droite une vingtaine de secondes avant la phrase qui donne la réponse
const BET_LEAD = 70;   // mots
BETS.forEach((b) => { b.from = Math.max(EPS[b.e].a, b.a - BET_LEAD); });
let betWas = false, betT = 0;
const betLive = (b) => S.paris && !S.paris[b.id] && !betSkipped.has(b.id);
function railShow(btn, on) {
  if (on === !btn.hidden) return;
  if (on) { btn.hidden = false; btn.classList.remove('in'); void btn.offsetWidth; btn.classList.add('in'); beat(1000); }
  else btn.hidden = true;
}
// une fois la phrase-réponse atteinte sans avoir touché l'icône, le pari est passé
function paintBetChips() {
  const j = k;
  BETS.forEach((b) => {
    if (j >= b.from && j < b.a) b.seen = true;                       // l'icône a été proposée
    else if (b.seen && j >= b.a && betLive(b) && !betOpen) { betSkipped.add(b.id); b.seen = false; }
    else if (j < b.from) b.seen = false;
  });
  const cur = BETS.find((b) => betLive(b) && j >= b.from && j < b.a);
  const rb = byId('railBet');
  rb.dataset.bet = cur ? cur.id : '';
  railShow(rb, !!cur && !byId('reader').hidden);
}
function openBet(b) {
  if (!b || !betLive(b) || betOpen) return;
  betWas = playing;
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; }   // parier n'est pas une pause
  showBet(b);
}
function showBet(b) {
  betOpen = b;
  const box = byId('betC');
  const opts = el('div', 'bt-opts');
  b.r.forEach((txt, i) => {
    const o = el('button', 'btn bt-o', txt); o.type = 'button';
    o.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); answerBet(i); });
    opts.append(o);
  });
  const bar = el('i', 'mc-bar'); bar.style.setProperty('--wait', '20000ms');
  box.replaceChildren(el('span', 'mc-lab', 'Ton pari'), el('strong', 'bt-q', b.q), opts,
    el('span', 'mc-skip', 'Vois juste : +' + BET_PTS + ' points · touche ailleurs pour passer'), bar);
  box.hidden = false;
  box.classList.remove('out', 'in', 'done'); void box.offsetWidth; box.classList.add('in');
  stage.dataset.bet = '1';
  SFX.soft(); buzz([8, 30, 8]);
  clearTimeout(betT);
  betT = setTimeout(betSkip, speedHack ? 600000 : 20000);
}
function betResume(ms) {
  clearTimeout(rxResumeT);
  if (betWas && !byId('reader').hidden) rxResumeT = setTimeout(() => { if (!playing && !betOpen) play(); }, ms);
  betWas = false;
  paintBetChips();
}
function hideBet() {
  const box = byId('betC');
  stage.dataset.bet = '0';
  betOpen = null;
  if (box.hidden) return;
  box.classList.add('out');
  setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 380);
}
function answerBet(i) {
  const b = betOpen;
  if (!b) return;
  S.paris[b.id] = { c: i };
  persist();
  const box = byId('betC');
  box.classList.add('done');
  $$('.bt-o', box).forEach((o, n) => o.classList.toggle('on', n === i));
  buzz(10);
  clearTimeout(betT);
  betOpen = null;
  setTimeout(() => { hideBet(); }, speedHack ? 0 : 650);
  betResume(speedHack ? 10 : 900);
}
function betSkip() {
  const b = betOpen;
  if (!b) return;
  betSkipped.add(b.id);
  hideBet();
  clearTimeout(betT);
  betResume(speedHack ? 10 : 350);
}
function betReveal(b) {
  const r = S.paris && S.paris[b.id];
  if (!r || r.v) return;
  r.v = 1;
  const win = r.c === b.ok;
  if (win) { addPoints(BET_PTS, true); epBet[b.e] += BET_PTS; SFX.heart(); buzz([10, 30, 10]); } else SFX.soft();
  persist();
  if (byId('reader').hidden) return;
  cornerCard('cc-bet' + (win ? ' win' : ''), (c) => {
    const ic = el('span', 'cc-check'); ic.innerHTML = win ? CHECK_SVG : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    const t = el('span', 'cc-t');
    t.append(el('span', 'cc-lab', win ? 'Pari gagné' : 'Pari perdu'), el('strong', '', win ? '+' + BET_PTS + ' points, bien vu !' : AUTEUR_NOM + ' t’a surpris'));
    c.append(ic, t);
  }, 4200);
}
// personnages : première réplique de chacun (mot affiché où elle commence)
const FIRST_LINE = new Map();
UNITS.forEach((u) => { if (CAST[u.sp] && !CAST[u.sp].fig && !FIRST_LINE.has(u.sp)) FIRST_LINE.set(u.sp, u.a); });
const MAIN_SPEAKERS = Array.from(FIRST_LINE.keys());
if (!S.met) S.met = MAIN_SPEAKERS.filter((id) => FIRST_LINE.get(id) < k);   // reprise d'une lecture déjà commencée
if (POV && CAST[POV] && !S.met.includes(POV)) S.met.unshift(POV);           // le héros est connu dès le départ
const FIRST_AT = new Map(Array.from(FIRST_LINE.entries()).map(([id, j]) => [j, id]));
// dernière phrase de chaque épisode
const SUSP = EPS.map((ep) => SENT[sentenceAt(ep.z)]);
function setSuspense(j) {
  const on = j >= SUSP[EPI[j]] && j <= EPS[EPI[j]].z;
  stage.dataset.suspense = on ? '1' : '0';
  return on;
}
function onWord(j) {
  const c = CULTE_END.get(j);
  if (c && !S.cultes.includes(c.si) && S.read === 'rsvp') foundCulte(c);   // mode Rapide : pas de page où glisser la phrase
  const jr = JURON_AT.get(j);
  if (jr && !S.jurons.includes(jr.mot) && S.read !== 'rsvp') offerJuron(jr);
  const c0 = CULTE_START.get(j);
  if (c0 && !S.cultes.includes(c0.si) && S.read !== 'rsvp') offerCulte(c0);
  if (chestC && j >= chestC.a && j <= chestC.z && S.read !== 'rsvp') culteLight(j);
  const sp = FIRST_AT.get(j);
  if (sp && !S.met.includes(sp)) meetCharacter(sp, j);
  paintRun();
}
// --- phrase culte trouvée ---
function culteSpans(c) { const out = []; for (let j = c.a; j <= c.z; j++) { const s = PVS[V[j]]; if (s) out.push(s); } return out; }
function culteStar(c, fresh) {
  const s = PVS[V[c.a]];
  if (!s) return;
  const g = leftGut();
  const old = g.querySelector('.cultemark[data-si="' + c.si + '"]');
  if (old) old.remove();
  const m = el('span', 'cultemark' + (fresh ? ' new' : ''));
  m.dataset.si = String(c.si);
  m.style.top = Math.round(lineY(s)) + 'px';
  g.append(m);
}
function applyCultes() {
  if (!pvBuilt) return;
  CULTES.forEach((c) => { if (S.cultes.includes(c.si)) { culteSpans(c).forEach((s) => s.classList.add('culte')); culteStar(c, false); } });
}
/* Le trésor : quand la lecture arrive sur une phrase culte, elle s'illumine et un petit coffre doré s'ouvre sur le bord droit.
   On appuie sur la phrase et on la fait glisser jusqu'au coffre pour la capturer. Si on la laisse passer, le trésor s'en va
   (une soixantaine de mots plus loin) ; il reviendra à la prochaine lecture du passage. */
let chestC = null, chestHide = 0;
const CHEST_AFTER = 14;   // mots après la fin de la phrase : le coffre s'en va vite
function offerCulte(c) {
  if (!pvBuilt || byId('reader').hidden) return;
  if (chestC && chestC !== c) missCulte();
  chestC = c;
  const ch = byId('chest');
  clearTimeout(chestHide);
  ch.hidden = false; ch.tabIndex = 0; stage.dataset.chest = '1';
  ch.classList.remove('out', 'got', 'open', 'in'); void ch.offsetWidth; ch.classList.add('in');
  buzz([6, 30, 6]);
}
function chestCheck() {
  if (chestC && (k > chestC.z + CHEST_AFTER || k < chestC.a - 40)) missCulte();
}
function chestAway() {
  const ch = byId('chest');
  ch.classList.add('out'); ch.tabIndex = -1; stage.dataset.chest = '0';
  clearTimeout(chestHide);
  chestHide = setTimeout(() => { if (ch.classList.contains('out')) ch.hidden = true; }, 700);
}
function missCulte() {
  const c = chestC;
  if (!c) return;
  chestC = null;
  culteSpans(c).forEach((s) => s.classList.remove('culte-hot'));
  chestAway();
}
function captureCulte(c) {
  if (!c || S.cultes.includes(c.si)) return;
  culteSpans(c).forEach((s) => s.classList.remove('culte-hot'));
  chestC = null;
  const ch = byId('chest');
  ch.classList.remove('open'); ch.classList.add('got');
  coinBurst(ch);
  setTimeout(chestAway, REDUCED ? 300 : 1100);
  foundCulte(c, true);
}
// glisser la phrase : une étiquette dorée suit le doigt jusqu'au coffre
let juronC = null, juronHide = 0;
const epJur = new Array(EPS.length).fill(0);
const JURON_PTS = 15;
function offerJuron(jr) {
  if (!pvBuilt || byId('reader').hidden) return;
  if (juronC && juronC !== jr) missJuron();
  juronC = jr;
  const s = PVS[V[jr.j]];
  if (s) s.classList.add('juron-hot');
  const ch = byId('chestD');
  clearTimeout(juronHide);
  ch.hidden = false; ch.tabIndex = 0;
  ch.classList.remove('out', 'got', 'open', 'in'); void ch.offsetWidth; ch.classList.add('in');
  buzz([6, 30, 6]);
  beat(1000);
}
function juronAway() {
  const ch = byId('chestD');
  ch.classList.add('out'); ch.tabIndex = -1;
  clearTimeout(juronHide);
  juronHide = setTimeout(() => { if (ch.classList.contains('out')) ch.hidden = true; }, 700);
}
function missJuron() {
  const jr = juronC;
  if (!jr) return;
  juronC = null;
  const s = PVS[V[jr.j]]; if (s) s.classList.remove('juron-hot');
  juronAway();
}
function captureJuron(jr) {
  if (!jr || S.jurons.includes(jr.mot)) return;
  const s = PVS[V[jr.j]]; if (s) { s.classList.remove('juron-hot'); s.classList.add('juron-got'); }
  juronC = null;
  S.jurons.push(jr.mot);
  addPoints(JURON_PTS, true); epJur[EPI[jr.j]] += JURON_PTS;
  persist();
  const ch = byId('chestD');
  ch.classList.remove('open'); ch.classList.add('got');
  coinBurst(ch);
  setTimeout(juronAway, REDUCED ? 300 : 1100);
  buzz([12, 40, 12]);
  if (byId('reader').hidden) return;
  cornerCard('cc-juron', (c) => {
    const ic = el('span', 'cc-dev');
    const t = el('span', 'cc-t');
    t.append(el('span', 'cc-lab', 'Gros mot attrapé'), el('strong', '', '« ' + jr.mot + ' » · +' + JURON_PTS + ' points'));
    c.append(ic, t);
  }, 4200);
}
// glisser la phrase culte (coffre doré) ou le gros mot (coffre diabolique) : dès l'appui, une copie transparente
// du texte sort sous le doigt ; elle rapetisse en approchant du coffre. Un simple toucher reste un toucher.
let drag = null;
function chestHit(x, y, id) {
  const r = $(id).getBoundingClientRect();
  return x > r.left - 34 && x < r.right + 24 && y > r.top - 40 && y < r.bottom + 40;
}
function dragStart(e, kind, it) {
  clearTimeout(pressT);
  const id = kind === 'juron' ? '#chestD' : '#chest';
  const g = el('div', 'cghost' + (kind === 'juron' ? ' cg-dev' : ''));
  if (kind === 'juron') g.append(el('span', 'cg-star'), el('span', '', it.mot));
  else {
    const t = sentenceText(it.si);
    g.append(el('span', 'cg-star'), el('span', '', t.length > 64 ? t.slice(0, 62).replace(/\s+\S*$/, '') + '…' : t));
  }
  document.body.append(g);
  const cr = $(id).getBoundingClientRect();
  drag = { kind, it, id, x0: e.clientX, y0: e.clientY, g, pid: e.pointerId, moved: false, gw: g.offsetWidth, cx: cr.left + cr.width / 2, cy: cr.top + cr.height / 2 };
  drag.d0 = Math.max(60, Math.hypot(drag.cx - e.clientX, drag.cy - e.clientY));
  dragPlace(e.clientX, e.clientY);
}
function dragPlace(x, y) {
  const d = drag;
  const sc = Math.max(.32, Math.min(1, .3 + .7 * Math.hypot(d.cx - x, d.cy - y) / d.d0));
  const gw = d.gw * sc;
  const gx = Math.max(gw / 2 + 6, Math.min(innerWidth - gw / 2 - 6, x));
  d.g.style.transform = 'translate(' + Math.round(gx) + 'px,' + Math.round(y) + 'px) translate(-50%, -125%) scale(' + sc.toFixed(3) + ')';
}
function dragMove(e) {
  if (!drag) return false;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 8) return true;
    drag.moved = true;
    clearTimeout(pressT);
    drag.g.classList.add('go');
    try { readerEl.setPointerCapture(drag.pid); } catch (er) { /* ignoré */ }
    buzz(6);
  }
  dragPlace(e.clientX, e.clientY);
  $(drag.id).classList.toggle('open', chestHit(e.clientX, e.clientY, drag.id));
  return true;
}
function dragEnd(e) {
  const d = drag;
  drag = null;
  if (!d) return false;
  if (!d.moved) { d.g.remove(); return false; }   // simple toucher : pause ou reprise, comme d'habitude
  const hit = chestHit(e.clientX, e.clientY, d.id);
  if (hit) {
    const r = $(d.id).getBoundingClientRect();
    d.g.style.transition = 'transform .28s ease, opacity .28s ease';
    d.g.style.transform = 'translate(' + Math.round(r.left + r.width / 2) + 'px,' + Math.round(r.top + r.height / 2) + 'px) translate(-50%, -50%) scale(.1)';
    d.g.style.opacity = '0';
    setTimeout(() => d.g.remove(), 300);
    if (d.kind === 'juron') captureJuron(d.it); else captureCulte(d.it);
  } else {
    $(d.id).classList.remove('open');
    d.g.classList.add('back');
    setTimeout(() => d.g.remove(), 320);
  }
  return true;
}
// sur téléphone : pendant le geste, la page ne défile pas (sinon le navigateur reprend le doigt)
readerEl.addEventListener('touchmove', (ev) => { if (drag) ev.preventDefault(); }, { passive: false });
// une petite explosion de cartes qui jaillit du coffre
function coinBurst(ch) {
  if (REDUCED) return;
  const r = ch.getBoundingClientRect();
  const x0 = r.left + r.width / 2, y0 = r.top + r.height * .35;
  for (let i = 0; i < 12; i++) {
    const c = el('span', 'coin');
    c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 34 + Math.random() * 46;
    c.style.setProperty('--dx', (Math.cos(a) * v).toFixed(1) + 'px');
    c.style.setProperty('--dy', (Math.sin(a) * v).toFixed(1) + 'px');
    c.style.setProperty('--fall', (26 + Math.random() * 36).toFixed(1) + 'px');
    c.style.setProperty('--sz', (7 + Math.random() * 5).toFixed(1) + 'px');
    c.style.setProperty('--dl', (i * .025) + 's');
    c.addEventListener('animationend', () => c.remove());
    document.body.append(c);
  }
  
}
/* Roulette des mots : pendant un épisode sur 7 (le 7e, le 14e, le 21e…), une petite roue apparaît dans la barre de droite.
   On la fait tourner : elle s'arrête sur un mot ancien ou difficile du chapitre (liste « mots » du livre), avec sa définition.
   Le mot rejoint la collection du Carnet. Une roue par épisode. */
const ROUL_EVERY = 7;
let MOTS_ = null;   // calculé à la demande (le dictionnaire est lu plus loin)
function motsOf(ci) {
  if (!MOTS_) MOTS_ = (BOOK.mots || []).map((list) => (Array.isArray(list) ? list : []).map((w) => (DICO ? DICO.e.find((x) => x[0] === w) : null)).filter(Boolean));
  return MOTS_[ci] || [];
}
const roulEp = (e) => (e + 1) % ROUL_EVERY === 0;
const roulPool = (ci) => motsOf(ci).filter((x) => !S.mots.some((m) => m.w === x[0]));
let roulOpen = false, roulWas = false, roulSpun = false;
function roulAvail() { const e = EPI[k]; return roulEp(e) && !S.roul[e] && roulPool(EPS[e].c).length > 0; }
function paintRoulette() { railShow(byId('railRoul'), roulAvail() && !byId('reader').hidden && !roulOpen); }
function openRoulette() {
  if (roulOpen || !roulAvail()) return;
  const e = EPI[k], ci = EPS[e].c;
  roulWas = playing;
  if (playing) { const before = epPaused[e]; pause(); epPaused[e] = before; }   // la machine n'est pas une pause
  roulOpen = true; roulSpun = false;
  const pool = roulPool(ci).slice().sort(() => Math.random() - .5);
  const all = motsOf(ci);
  const win = pool[0];
  // le rouleau : tous les mots du chapitre, en boucle ; il tourne vite de haut en bas
  const list = all.slice().sort(() => Math.random() - .5);
  const M0 = list.length, ROW = 44;
  const box = byId('roulC');
  const reel = el('div', 'sl-reel');
  const strip = el('div', 'sl-strip');
  for (let r = 0; r < 4; r++) list.forEach((w) => strip.append(el('span', 'sl-w', w[0])));   // la liste en boucle
  reel.append(strip, el('span', 'sl-mark'));
  const lever = el('button', 'sl-lever'); lever.type = 'button'; lever.setAttribute('aria-label', 'Tirer la manivelle');
  lever.append(el('span', 'sl-rod'), el('span', 'sl-knob'));
  const mach = el('div', 'slot'); mach.append(reel, lever);
  const bar = el('i', 'mc-bar'); bar.style.setProperty('--wait', '6000ms');
  const out = el('div', 'rl-out');
  box.replaceChildren(el('span', 'mc-lab', 'Machine à mots'), el('strong', 'rl-q', 'Tire la manivelle pour arrêter un mot ancien ou difficile'), mach, bar, out,
    el('span', 'mc-skip rl-skip', 'Elle s’arrête toute seule dans quelques secondes'));
  box.hidden = false;
  box.classList.remove('out', 'in', 'done'); void box.offsetWidth; box.classList.add('in');
  stage.dataset.roul = '1';
  paintRoulette();
  buzz(8);
  const L = M0 * ROW;
  const V0 = speedHack ? 4 : 1.25;   // px par ms : rapide
  let p = Math.random() * L, last = performance.now(), stopAt = null, raf = 0;
  const show = (pp) => { const m = ((pp % L) + L) % L; strip.style.transform = 'translateY(' + (-(m + L) ).toFixed(1) + 'px)'; };
  const tick = (now) => {
    if (!roulOpen) return;
    const dt = now - last; last = now;
    if (!stopAt) { p -= V0 * dt; show(p); raf = requestAnimationFrame(tick); return; }
    const t = Math.min(1, (now - stopAt.t0) / stopAt.d);
    const q = stopAt.p0 + (stopAt.p1 - stopAt.p0) * (1 - Math.pow(1 - t, 3));
    show(q);
    if (t < 1) raf = requestAnimationFrame(tick);
    else roulDone(win, e, ci);
  };
  raf = requestAnimationFrame(tick);
  // arrêt : le mot gagné vient se poser au milieu de la fenêtre, en ralentissant
  const stop = () => {
    if (roulSpun || !roulOpen) return;
    roulSpun = true;
    lever.classList.add('pulled'); lever.disabled = true;
    setTimeout(() => lever.classList.remove('pulled'), 380);
    SFX.flip(); buzz(12);
    const wi = list.findIndex((w) => w[0] === win[0]);
    // position du haut de la fenêtre pour que le mot gagné soit au milieu (rang 1 sur 3), en descendant encore d'au moins un tour
    let target = (wi - 1) * ROW;
    const cur = ((p % L) + L) % L;
    let delta = cur - target; delta = ((delta % L) + L) % L + L;
    const p1 = p - delta;
    const d = speedHack || REDUCED ? 60 : Math.min(2600, Math.max(1200, 3 * delta / V0));
    stopAt = { t0: performance.now(), d, p0: p, p1 };
  };
  lever.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); stop(); });
  let ly = null;
  lever.addEventListener('pointerdown', (ev) => { ly = ev.clientY; });
  lever.addEventListener('pointermove', (ev) => { if (ly !== null && ev.clientY - ly > 18) { ly = null; stop(); } });
  clearTimeout(roulT);
  roulT = setTimeout(stop, speedHack ? 300 : 6000);
}
let roulT = 0;
function roulDone(w, e, ci) {
  if (!roulOpen) return;
  S.roul[e] = w[0];
  S.mots.push({ w: w[0], c: ci, at: Date.now() });
  persist();
  SFX.win(); buzz([10, 40, 10]);
  const box = byId('roulC');
  box.classList.add('done');
  const out = $('.rl-out', box);
  clearTimeout(roulT);
  const bar0 = $('.mc-bar', box); if (bar0) bar0.remove();
  const head = el('div', 'rl-head'); head.append(el('strong', 'dc-w', w[0]), el('span', 'dc-pos', w[1]));
  const en = el('p', 'dc-en'); en.append(el('span', 'dc-flag', 'EN'), document.createTextNode(w[3]));
  const ok = el('p', 'rl-ok'); ok.innerHTML = CHECK_SVG; ok.append(document.createTextNode('Mot ajouté à ta collection'));
  const act = el('div', 'rl-act');
  const see = el('button', 'btn', 'Voir ma collection'); see.type = 'button';
  see.addEventListener('click', (ev) => { ev.stopPropagation(); closeRoulette(false); openCarnet('mots'); });
  const cont = el('button', 'btn primary', roulWas ? 'Continuer la lecture' : 'Fermer'); cont.type = 'button';
  cont.addEventListener('click', (ev) => { ev.stopPropagation(); closeRoulette(true); });
  act.append(see, cont);
  out.replaceChildren(el('span', 'rl-bravo', 'Bravo !'), head, el('p', 'dc-def', w[2]), en, ok, act);
  $('.rl-skip', box).hidden = true;
}
function closeRoulette(resume) {
  if (!roulOpen) return;
  roulOpen = false;
  clearTimeout(roulT);
  const box = byId('roulC');
  box.classList.add('out');
  stage.dataset.roul = '0';
  setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 380);
  if (resume && roulWas && !byId('reader').hidden) { clearTimeout(rxResumeT); rxResumeT = setTimeout(() => { if (!playing && !roulOpen) play(); }, 450); }
  roulWas = false;
  paintRoulette();
}
// la collection, dans le Carnet
function fillJurons() {
  const box = byId('juronBox');
  box.hidden = !S.jurons.length;
  byId('juronList').replaceChildren(...S.jurons.slice().reverse().map((w) => {
    const x = dictLookup(w);
    const li = el('li');
    const h = el('div', 'mt-h'); h.append(el('strong', '', w), el('span', 'dc-pos', x ? x.pos + (x.w.toLowerCase() !== w.toLowerCase() ? ' · ' + x.w : '') : ''));
    li.append(h);
    if (x) { li.append(el('p', 'mt-d', x.def)); const en = el('p', 'dc-en'); en.append(el('span', 'dc-flag', 'EN'), document.createTextNode(x.en)); li.append(en); }
    return li;
  }));
}
function fillMots() {
  fillJurons();
  const list = byId('motList');
  const ms = S.mots.slice().reverse();
  byId('nMots').textContent = ms.length ? String(ms.length) : '';
  byId('motEmpty').hidden = ms.length > 0 || S.jurons.length > 0;
  byId('nMots').textContent = ms.length + S.jurons.length ? String(ms.length + S.jurons.length) : '';
  list.replaceChildren(...ms.map((m) => {
    const x = DICO ? DICO.e.find((y) => y[0] === m.w) : null;
    const li = el('li');
    const h = el('div', 'mt-h'); h.append(el('strong', '', m.w), el('span', 'dc-pos', x ? x[1] : ''), el('span', 'mt-c', cap(chapLab(m.c))));
    li.append(h);
    if (x) { li.append(el('p', 'mt-d', x[2])); const en = el('p', 'dc-en'); en.append(el('span', 'dc-flag', 'EN'), document.createTextNode(x[3])); li.append(en); }
    return li;
  }));
}
function foundCulte(c) {
  S.cultes.push(c.si);
  epCulte[EPI[c.z]] += CULTE_PTS;
  addPoints(CULTE_PTS, true);
  persist();
  SFX.soft(); buzz([8, 40, 8]);
  // le liseré doré se dessine sous la phrase
  if (pvBuilt) culteSpans(c).forEach((s, i) => { s.classList.add('culte', 'culte-new'); s.style.setProperty('--ci', String(i)); });
  if (REDUCED) { if (pvBuilt) culteStar(c, false); return; }
  // l'étoile dorée reste dans la marge, à côté de la phrase ; l'annonce se fait dans le coin en haut à gauche
  if (pvBuilt) culteStar(c, true);
  if (byId('reader').hidden) return;
  cornerCard('cc-culte', (cc) => {
    const st = el('span', 'cc-star');
    const t = el('span', 'cc-t');
    t.append(el('span', 'cc-lab', S.read === 'rsvp' ? 'Phrase culte trouvée' : 'Phrase culte capturée'), el('strong', '', '+' + CULTE_PTS + ' points'));
    cc.append(st, t);
    for (let i = 0; i < 6; i++) {
      const s = el('span', 'cc-spark');
      s.style.setProperty('--a', (i * 60 + Math.random() * 30) + 'deg');
      s.style.setProperty('--dl', (i * .05) + 's');
      st.append(s);
    }
  }, 4200);
}
// tous les 1 000 mots : un petit message de soutien, avec l'allure moyenne réelle (temps de lecture, pauses exclues)
function milestone() {
  if (speedHack || byId('reader').hidden) return;
  const ms = (S.readMs || 0) + (playT ? performance.now() - playT : 0);
  const wpm = ms > 30000 ? Math.round((S.words || 0) / (ms / 60000)) : 0;
  cornerCard('cc-mile', (c) => {
    const ic = el('span', 'cc-check'); ic.innerHTML = CHECK_SVG;
    const t = el('span', 'cc-t');
    t.append(el('span', 'cc-lab', fmtInt(S.words) + ' mots parcourus'), el('strong', '', wpm ? 'Allure moyenne ' + wpm + ' mots/min' : 'Continue comme ça !'));
    c.append(ic, t);
  }, 4200);
}
// coin en haut à gauche du cadre de lecture : les découvertes s'y affichent quelques secondes, l'une sous l'autre
// une notification à la fois, à la place des onglets ; les suivantes attendent leur tour
const noteQ = [];
let noteOn = false;
function cornerCard(cls, build, ms) {
  noteQ.push([cls, build, ms]);
  if (noteQ.length > 3) noteQ.shift();
  if (!noteOn) noteNext();
}
function noteNext() {
  const box = byId('corner'), bar = box.parentElement;
  const it = noteQ.shift();
  if (!it) { noteOn = false; bar.dataset.note = '0'; return; }
  noteOn = true; bar.dataset.note = '1';
  const c = el('div', 'cc ' + it[0]);
  it[1](c);
  box.replaceChildren(c);
  setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.remove(); noteNext(); }, 420); }, it[2] || 4200);
}
// --- entrée en scène d'un personnage : son portrait apparaît dans le coin en haut à gauche ---
let meetHold = null;
function meetCharacter(id, j) {
  S.met.push(id); persist();
  castBuilt = false;                       // le Carnet se mettra à jour
  buzz([10, 40, 10]);
  if (byId('reader').hidden) return;
  if (playing && S.read !== 'texte') meetHold = id;   // la lecture marque une pause (prise en compte par le pas suivant)
  const box = byId('meetC');
  const c = CAST[id];
  box.style.setProperty('--spk', colorVar(id));
  const pf = portrait(id, 'mc-pf');
  const line = (c.chap || c.cite || c.roman || '').split(/(?<=[.!?])\s/)[0];
  box.replaceChildren(pf, el('span', 'mc-lab', 'Nouveau personnage débloqué'), el('strong', 'mc-name', c.nom), el('span', 'mc-line', line));
  if (playing && S.read !== 'texte') {
    const bar = el('i', 'mc-bar'); bar.style.setProperty('--wait', '2700ms');
    box.append(el('span', 'mc-skip', 'Touche l’écran pour continuer'), bar);
  }
  box.hidden = false;
  box.classList.remove('out', 'in'); void box.offsetWidth; box.classList.add('in');
  SFX.soft();
  clearTimeout(meetT);
  meetT = setTimeout(hideMeet, S.read === 'texte' ? 3000 : 2700);
}
let meetT = 0;
function hideMeet() {
  const box = byId('meetC');
  if (box.hidden) return;
  box.classList.add('out');
  stage.dataset.meet = '0';
  setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 380);
}
// --- série sans pause : trait sur le bord gauche ---
const runBar = byId('runBar');
let runP = -1;
function paintRun() {
  const e = EPI[k];
  const lost = !!epPaused[e];
  const p = Math.min(1, epRead[e] / Math.max(1, ep80(e)));
  const q = Math.round(p * 100);
  const state = lost ? 'lost' : p >= 1 ? 'done' : 'run';
  if (q === runP && runBar.dataset.state === state) return;
  runP = q;
  runBar.dataset.state = state;
  runBar.style.setProperty('--p', q + '%');
}

/* ================= Fin d'épisode : un bandeau qui se déroule dans la page =================
   La lecture ne s'arrête pas : à la frontière entre deux épisodes, un bandeau s'ouvre dans le texte avec les points
   gagnés, la lecture marque un temps, puis reprend avec l'épisode suivant. Mode Rapide : le bandeau apparaît
   un instant au centre. Fin du chapitre : le bandeau reste ouvert, avec le bilan et la suite. */
let inter = false;          // temps de pause entre deux épisodes (une pause ici ne compte pas contre « d'une traite »)
const epMs = new Array(EPS.length).fill(0);   // temps passé à lire chaque épisode pendant cette séance
let segT = 0;
function segStop(e) { if (segT) { epMs[e] += performance.now() - segT; segT = 0; } }
const INTER_MS = 6000;   // la lecture reprend seule ; « Continuer » pour passer plus vite
// compte les points de l'épisode e et renvoie ce qu'il faut afficher
function settleEpisode(e, bonus) {
  const rec = S.eps[e] || {};
  const first = !rec.done;
  const read = epRead[e];
  const gains = [{ t: fmtInt(read) + (read > 1 ? ' mots lus' : ' mot lu'), v: read }];
  if (bonus && first && read >= ep80(e) && !epPaused[e]) gains.push({ t: 'd’une traite', v: STRAIGHT });
  let luck = null;
  if (bonus && first) { luck = drawLuck(); if (luck) gains.push({ t: luck.t.replace(/ !$/, '').toLowerCase(), v: luck.v, jackpot: !!luck.jackpot }); }
  if (epCulte[e]) gains.push({ t: epCulte[e] > CULTE_PTS ? 'phrases cultes' : 'phrase culte', v: epCulte[e], live: true });
  if (epBet[e]) gains.push({ t: 'pari gagné', v: epBet[e], live: true });
  if (epJur[e]) gains.push({ t: epJur[e] > JURON_PTS ? 'gros mots attrapés' : 'gros mot attrapé', v: epJur[e], live: true });
  const extra = gains.slice(1).filter((g) => !g.live).reduce((x, g) => x + g.v, 0);
  // les mots lus ont déjà été comptés pendant la lecture : on part du total d'avant l'épisode
  const qp = S.quizPend && S.quizPend.p > 0 ? S.quizPend : null;
  if (qp) gains.push({ t: 'défi du ' + qp.lab, v: qp.p, live: true });
  S.quizPend = null;
  const from = S.pts - read - (epCulte[e] || 0) - (epBet[e] || 0) - (epJur[e] || 0) - (qp ? qp.p : 0);
  const dayFrom = dayRec().pts - read - (epCulte[e] || 0) - (epBet[e] || 0) - (epJur[e] || 0) - (qp ? qp.p : 0);
  epCulte[e] = 0; epBet[e] = 0; epJur[e] = 0;
  addPoints(extra, false);
  const d = dayRec();
  const goalHit = dayFrom < S.goal && d.pts >= S.goal;
  if (d.pts >= S.goal) d.done = true;
  S.eps[e] = Object.assign({}, rec, { done: true, w: Math.min(EPS[e].n, Math.max(typeof rec.w === 'number' ? rec.w : (rec.done ? EPS[e].n : 0), read)) });
  S.epN = (S.epN || 0) + 1;
  bumpStreak();
  const lvFrom = levelOf(from), lvTo = levelOf(S.pts);
  S.lvlSeen = Math.max(S.lvlSeen, lvTo);
  const unlocked = newUnlocks();
  S.k = k;
  persist();
  updatePts(true);
  return { e, gains, total: S.pts - from, lvUp: lvTo > lvFrom ? lvTo : -1, unlocked, goalHit, jackpot: !!(luck && luck.jackpot) };
}
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
// contenu du bandeau
function fillEnd(box, info, isLast) {
  box.replaceChildren();
  let i = 0;
  const line = (cls, text) => { const x = el('div', cls, text); x.style.setProperty('--i', String(i++)); box.append(x); return x; };
  box.append(el('div', 'ee-rule'));
  const head = line('ee-head');
  head.innerHTML = CHECK_SVG;
  head.append(isLast || chapterEndsAt(info.e) ? chapLabel(chapOfEp(info.e)) + ' terminé' : 'Épisode ' + (EPS[info.e].i + 1) + ' lu');
  const g = line('ee-gains');
  info.gains.forEach((x, n) => {
    if (n) g.append(el('span', 'sep', '·'));
    const s = el('span', x.jackpot || x.live ? 'jk' : '', (n ? '+' + fmtInt(x.v) + ' ' : '') + x.t);
    g.append(s);
    if (!n && info.wpm) { g.append(el('span', 'sep', '·')); g.append(el('span', 'wpm', info.wpm + ' mots/min')); }
  });
  const tot = line('ee-total');
  tot.append(el('span', 'ico-pt'), el('b', '', '+' + fmtInt(info.total)), ' points');
  if (info.lvUp >= 0) line('ee-note', 'Niveau ' + (info.lvUp + 1) + ' · ' + LEVELS[info.lvUp].t);
  if (info.goalHit) line('ee-note', 'Objectif du jour atteint');
  info.unlocked.forEach((b) => line('ee-note', 'Livre débloqué : ' + b.t));
  if (info.cheer) line('ee-cheer', info.cheer);
  if (info.chap) { line('ee-cheer big', info.chap.bravo); line('ee-sum', info.chap.stats); }
  if (info.chap && quizOf(EPS[info.e].c) && S.defi !== false) { const x = line('ee-defi'); x.dataset.ci = String(EPS[info.e].c); fillDefi(x, EPS[info.e].c); }
  if (isLast) {
    const nUnl = BOOKS.filter((b) => !b.ok && isOpen(b)).length;
    line('ee-sum', fmtPts(S.pts) + ' · niveau ' + (levelOf(S.pts) + 1) + ' · ' + S.hearts.length + (S.hearts.length > 1 ? ' passages gardés' : ' passage gardé')
      + ' · ' + nUnl + (nUnl > 1 ? ' livres débloqués' : ' livre débloqué'));
    const suite = BOOK.suite || {};
    if (suite.titre) line('ee-title', suite.titre);
    if (suite.accroche) line('ee-hook', suite.accroche);
    const act = line('ee-act');
    const a = el('button', 'btn primary', 'Retour à l’accueil'); a.type = 'button';
    a.addEventListener('click', () => showHome('accueil'));
    const b = el('button', 'btn', 'Voir mes progrès'); b.type = 'button';
    b.addEventListener('click', () => showHome('progres'));
    act.append(a, b);
  } else {
    const act = line('ee-act ee-goline');
    const go = el('button', 'btn primary ee-go'); go.type = 'button';
    go.append(el('i'), el('span', '', info.chap ? 'Continuer la lecture' : 'Continuer'));
    go.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); continueNow(); });
    act.append(go);
  }
  box.append(el('div', 'ee-rule'));
}
// bandeau entre l'épisode e et le suivant (mode Immersif et mode Texte)
function endSlot(e) { return pvIn.querySelector('.epend[data-e="' + e + '"]'); }
function openSlot(info, isLast) {
  if (!pvBuilt) { buildPageInto(pvIn, PVS); cvWrap62(); pvBuilt = true; sizePage(); applyMarks(); applyCultes(); applyEmos(); }
  const slot = endSlot(info.e);
  if (!slot) return null;
  fillEnd($('.ee-in', slot), info, isLast);
  if (slot.classList.contains('open')) { slot.classList.remove('open'); void slot.offsetWidth; }
  slot.classList.add('open');
  setTimeout(() => { if (!playing && pvBuilt && S.read === 'page' && pvLit.length) { placeHighlight(); paraHL(pvPara); } }, REDUCED ? 30 : 960);
  return slot;
}
// la page glisse jusqu'au bandeau (sa hauteur finale, même pendant qu'il se déroule)
function glideToSlot(slot, isLast) {
  if (S.read !== 'page' || pvUserScroll) return;
  const inner = $('.ee-in', slot);
  const top = slot.getBoundingClientRect().top - pvIn.getBoundingClientRect().top;
  // v93 : le bandeau (bilan, Carnet des curiosités, quiz, Continuer) se place au milieu de l'écran ;
  // plus grand que l'écran, il montre son haut
  const vh93 = pageview.clientHeight, h = inner.scrollHeight + 10;
  const y = h <= vh93 * .94 ? top + h / 2 - vh93 / 2 : top - vh93 * .03;
  // la hauteur finale du bandeau compte déjà (il est encore en train de se dérouler)
  const grow = Math.max(0, inner.scrollHeight - slot.offsetHeight);
  pvTarget = Math.max(0, Math.min(y, pvIn.scrollHeight + grow - pageview.clientHeight));
  if (REDUCED) { stopPageGlide(); pageview.scrollTop = pvTarget; return; }
  if (!pvAnim) { pvLast = performance.now(); pvAnim = requestAnimationFrame(pvTick); }
}
let interGo = null;
function continueNow() {
  if (playing && inter && interGo) interGo();
  else if (!playing) { dropGo(); play(); }
}
// une fois la lecture repartie, le bouton Continuer disparaît des bandeaux
function dropGo() { $$('.ee-goline').forEach((x) => x.remove()); }
/* ================= Défi de fin de chapitre =================
   Facultatif, un seul essai par chapitre, ouvert quand 80 % des mots du chapitre ont été lus. Jamais pendant la lecture.
   Formats (champ « quiz » du livre, un par chapitre) : qcm, qui (qui a dit ça ?), relier, ordre, vraifaux. */
const QUIZ_FMT = { qcm: 'QCM', qui: 'Qui a dit ça ?', relier: 'Relier', ordre: 'Remettre dans l’ordre', vraifaux: 'Vrai ou faux' };
const QUIZ_PTS = 25;
function quizOf(ci) {
  const q = QUIZ[ci];
  if (!q || !QUIZ_FMT[q.format] || !Array.isArray(q.questions)) return null;
  return q.questions.length >= (q.format === 'ordre' ? 4 : 3) ? q : null;
}
const quizRec = (ci) => (S.quiz ? S.quiz[ci] : null);
const quizStars = (n) => (n >= 3 ? 3 : n === 2 ? 2 : 1);
const chapLab = (ci) => UNIT + (CHAPS[ci] && CHAPS[ci].num ? ' ' + CHAPS[ci].num : '') + PSUF(CHAPS[ci]);
// part du chapitre lue (meilleur passage de chaque épisode)
function chapReadPct(ci) {
  const ch = CHAPS[ci];
  if (!ch) return 0;
  let w = 0;
  ch.eps.forEach((e) => {
    const r = S.eps[e], ep = EPS[e];
    const n = r ? (typeof r.w === 'number' ? r.w : (r.done ? ep.n : 0)) : 0;
    w += Math.min(ep.n, Math.max(n, epRead[e] || 0));
  });
  return Math.floor(w / Math.max(1, ch.z - ch.a + 1) * 100);
}
function defiReady(ci) { return S.defi !== false && !!quizOf(ci) && !quizRec(ci) && chapReadPct(ci) >= 80; }
function starsEl(n, of, cls) {
  const s = el('span', 'qstars' + (cls ? ' ' + cls : ''));
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', n + (n > 1 ? ' étoiles' : ' étoile') + ' sur ' + of);
  for (let i = 0; i < of; i++) s.append(el('i', i < n ? 'on' : ''));
  return s;
}
function totalStars() { let n = 0; for (let ci = 0; ci < QUIZ_N; ci++) { const r = quizRec(ci); if (r) n += r.st || 1; } return n; }
// dans le bandeau : le bouton du défi, ou son résultat
function fillDefi(x, ci) {
  x.replaceChildren();
  const r = quizRec(ci);
  if (r) {
    x.classList.add('done');
    x.append(el('span', 'ee-defi-lab', 'Défi du ' + chapLab(ci) + ' fait'), starsEl(r.st, 3),
      el('span', 'ee-defi-note', r.n + (r.n > 1 ? ' bonnes réponses' : ' bonne réponse') + ' sur 3 · +' + r.p + ' points'));
    return;
  }
  const pct = chapReadPct(ci);
  const b = el('button', 'btn primary ee-defi-btn'); b.type = 'button';
  b.append(el('span', 'ico-star'), el('span', '', 'Défi du ' + UNIT + ' · jusqu’à +100 points'));
  if (pct < 80) {
    b.disabled = true;
    x.append(b, el('span', 'ee-defi-note', 'Lis au moins 80 % du ' + UNIT + ' pour ouvrir le défi (tu en as lu ' + pct + ' %).'));
    return;
  }
  b.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openQuiz(ci); });
  x.append(b, el('span', 'ee-defi-note', QUIZ_FMT[quizOf(ci).format] + ' · 3 questions · facultatif, tu peux passer'));
}
function refreshDefis() {
  $$('.ee-defi[data-ci]').forEach((x) => fillDefi(x, Number(x.dataset.ci)));
  if (!byId('cover').hidden) refreshCover();
}
// où se trouve un passage : « Chapitre I, épisode 7 »
// (le texte normalisé de tout le livre, phrase après phrase : un passage peut couvrir plusieurs phrases)
let fullN = null, fullAt = null;
function passageRef(passage) {
  if (!fullN) {
    fullAt = []; let s = '';
    nsents102().forEach((t) => { fullAt.push(s.length); s += t + ' '; });
    fullN = s;
  }
  const head = normTxt(String(passage).split(' […] ')[0]).split(' ').slice(0, 10).join(' ');
  const at = fullN.indexOf(head);
  if (!head || at < 0) return '';
  let lo = 0, hi = fullAt.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fullAt[m] <= at) lo = m; else hi = m - 1; }
  const e = EPI[SENT[lo]];
  return cap(chapLab(EPS[e].c)) + ', épisode ' + (EPS[e].i + 1);
}
// mélange stable (le même à chaque ouverture), jamais dans l'ordre de départ
function shuffled(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let t = 0; t < 8; t++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.some((v, i) => v !== i)) break;
  }
  return a;
}
const ICO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICO_BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5"/></svg>';

let qz = null;
function openQuiz(ci, override) {
  const q = override || quizOf(ci);
  if (!q) return false;
  if (!override && (quizRec(ci) || chapReadPct(ci) < 80)) return false;   // un seul essai ; 80 % du chapitre lus
  if (playing) pause();
  closeSheets();
  qz = { ci, q, i: 0, n: 0, given: 0, test: !!override, sel: null, links: new Map(), order: [], done: false };
  byId('qzEyebrow').textContent = 'Défi du ' + chapLab(ci);
  byId('qzTitle').textContent = QUIZ_FMT[q.format];
  byId('quizSheet').hidden = false;
  byId('quizSheet').dataset.fmt = q.format;
  renderQuiz();
  buzz(8);
  return true;
}
// une réponse : la première fige l'essai ; les points sont comptés tout de suite, une seule fois
function quizAnswer(good) {
  qz.given++;
  if (good) qz.n++;
  let rec = null;
  if (!qz.test) {
    rec = S.quiz[qz.ci] || (S.quiz[qz.ci] = { n: 0, p: 0, st: 1, at: Date.now() });
    if (good) { rec.n = qz.n; rec.p += QUIZ_PTS; addPoints(QUIZ_PTS, true); }
  }
  if (qz.given >= 3) {
    qz.done = true;
    if (qz.n >= 3 && rec) { rec.p += QUIZ_PTS; addPoints(QUIZ_PTS, true); }
  }
  if (rec) { rec.st = quizStars(rec.n); rec.end = qz.done || undefined; S.quizPend = { lab: chapLab(qz.ci), p: rec.p }; persist(); }
  if (good) SFX.soft();   // jamais de son négatif
  buzz(good ? [8, 30, 8] : 6);
  paintDots();
}
function closeQuiz() {
  if (!qz) { byId('quizSheet').hidden = true; return; }
  const rec = !qz.test && S.quiz[qz.ci];
  if (rec && !rec.end) { rec.end = true; rec.st = quizStars(rec.n); persist(); }   // défi quitté en cours : l'essai compte tel quel
  qz = null;
  byId('quizSheet').hidden = true;
  updatePts(false);
  refreshDefis();
}
function paintDots() {
  const d = byId('qzDots');
  d.replaceChildren();
  for (let i = 0; i < 3; i++) d.append(el('i', i < qz.n ? 'good' : i < qz.given ? 'seen' : i === qz.given && !qz.done ? 'cur' : ''));
}
function fbShow(good, answer, passages) {
  const fb = byId('qzFb');
  fb.hidden = false;
  fb.className = 'qz-fb' + (good ? ' good' : '');
  const h = el('p', 'qz-fb-h');
  const ic = el('span', 'qz-fb-ic'); ic.innerHTML = good ? ICO_OK : ICO_BOOK;
  h.append(ic, document.createTextNode(good ? 'Bien vu !' : 'La bonne réponse'));
  fb.replaceChildren(h);
  if (answer) fb.append(el('p', 'qz-fb-a', answer));
  (Array.isArray(passages) ? passages : [passages]).filter(Boolean).forEach((p) => {
    const bq = el('blockquote', 'qz-pass');
    bq.append(el('span', '', '« ' + p.replace(/^[«\s]+|[»\s]+$/g, '') + ' »'));
    const ref = passageRef(p);
    if (ref) bq.append(el('cite', '', ref));
    fb.append(bq);
  });
  requestAnimationFrame(() => fb.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }));
}
function footBtn(label, fn, primary) {
  const b = el('button', 'btn' + (primary === false ? '' : ' primary')); b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
  return b;
}
function quizNext() {
  if (qz.done) { quizScore(); return; }
  qz.i++;
  renderQuiz();
}
function stepFoot() {
  byId('qzFoot').replaceChildren(footBtn(qz.done ? 'Voir mon score' : 'Question suivante', quizNext));
}
function renderQuiz() {
  const q = qz.q, body = byId('qzBody');
  byId('qzFb').hidden = true; byId('qzFoot').replaceChildren();
  paintDots();
  body.replaceChildren();
  const f = q.format;
  if (f === 'qcm' || f === 'qui' || f === 'vraifaux') {
    const x = q.questions[qz.i];
    const num = el('p', 'qz-num', 'Question ' + (qz.i + 1) + ' sur 3');
    body.append(num);
    let opts;
    if (f === 'qui') {
      body.append(el('p', 'qz-q', 'Qui a dit ça ?'));
      body.append(el('blockquote', 'qz-rep', '« ' + x.replique + ' »'));
      opts = x.choix.map((id) => { const b = el('button', 'qz-o qz-pf'); b.type = 'button'; b.append(portrait(id, 'pf'), el('span', '', shortName(id))); return b; });
    } else if (f === 'qcm') {
      body.append(el('p', 'qz-q', x.q));
      opts = x.choix.map((t) => { const b = el('button', 'qz-o', t); b.type = 'button'; return b; });
    } else {
      body.append(el('p', 'qz-q', x.texte));
      opts = ['Vrai', 'Faux'].map((t) => { const b = el('button', 'qz-o', t); b.type = 'button'; return b; });
    }
    const box = el('div', 'qz-opts' + (f === 'qui' ? ' qz-opts-pf' : f === 'vraifaux' ? ' qz-opts-vf' : ''));
    const okI = f === 'vraifaux' ? (x.vrai ? 0 : 1) : x.ok;
    opts.forEach((b, i) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (box.dataset.locked) return;
        box.dataset.locked = '1';
        opts.forEach((o, n) => { o.disabled = true; o.classList.toggle('ok', n === okI); o.classList.toggle('picked', n === i && n !== okI); });
        const good = i === okI;
        quizAnswer(good);
        const who = f === 'qui' ? x.choix[okI] : '', sn = who ? shortName(who) : '';
        // « la brune » : le nom que le chapitre lui donne (pas encore de prénom), sinon le nom complet
        const ans = f === 'qui' ? 'C’est ' + (/^(La|Le|Les|L’) ?/.test(sn) ? sn.charAt(0).toLowerCase() + sn.slice(1) : (CAST[who] ? CAST[who].nom : sn)) + '.'
          : f === 'qcm' ? x.choix[okI]
          : x.vrai ? 'C’est vrai.' : (x.correction || 'Ce n’est pas ce que raconte le texte.');
        fbShow(good, ans, x.passage);
        stepFoot();
      });
      box.append(b);
    });
    body.append(box);
    return;
  }
  if (f === 'relier') { renderLink(body); return; }
  if (f === 'ordre') { renderOrder(body); }
}
// Relier : on touche un personnage puis une description (ou l'inverse) ; le trait se trace
function renderLink(body) {
  const qs = qz.q.questions.slice(0, 3);
  const rightOrder = shuffled(qs.length, qz.ci + 3);
  body.append(el('p', 'qz-q', 'Relie chaque personnage à ce qui le décrit.'), el('p', 'qz-num', 'Touche un personnage, puis une phrase.'));
  const board = el('div', 'qz-link');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'qz-lines'); svg.setAttribute('aria-hidden', 'true');
  const L = el('div', 'qz-col'), R = el('div', 'qz-col');
  const lefts = qs.map((x, i) => {
    const b = el('button', 'qz-o qz-pf qz-l'); b.type = 'button'; b.dataset.i = String(i);
    b.append(portrait(x.perso, 'pf'), el('span', '', x.nom || shortName(x.perso)));
    return b;
  });
  const rights = rightOrder.map((i) => { const b = el('button', 'qz-o qz-r', qs[i].texte); b.type = 'button'; b.dataset.i = String(i); return b; });
  L.append(...lefts); R.append(...rights);
  board.append(svg, L, R);
  body.append(board);
  const draw = () => {
    const br = board.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + Math.round(br.width) + ' ' + Math.round(br.height));
    svg.replaceChildren();
    qz.links.forEach((v, li) => {
      const a = lefts[li].getBoundingClientRect(), b = rights[rightOrder.indexOf(li)].getBoundingClientRect();
      const x1 = a.right - br.left, y1 = a.top + a.height / 2 - br.top, x2 = b.left - br.left, y2 = b.top + b.height / 2 - br.top;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (x1 + x2) / 2;
      p.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2);
      p.setAttribute('class', v ? 'good' : 'fix');
      svg.append(p);
      [[x1, y1], [x2, y2]].forEach(([cx, cy]) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 4); c.setAttribute('class', v ? 'good' : 'fix'); svg.append(c); });
    });
  };
  qz.draw = draw;
  const pick = (b) => {
    if (b.classList.contains('used')) return;
    const side = b.classList.contains('qz-l') ? 'l' : 'r';
    if (!qz.sel || qz.sel.side === side) {
      if (qz.sel) qz.sel.b.classList.remove('sel');
      qz.sel = { side, b }; b.classList.add('sel');
      return;
    }
    const lb = side === 'l' ? b : qz.sel.b, rb = side === 'r' ? b : qz.sel.b;
    qz.sel.b.classList.remove('sel'); qz.sel = null;
    const li = Number(lb.dataset.i), good = Number(rb.dataset.i) === li;
    qz.links.set(li, good);
    lb.classList.add('used', good ? 'ok' : 'fixed');
    const rr = rights[rightOrder.indexOf(li)];
    rr.classList.add('used', good ? 'ok' : 'fixed');
    lb.disabled = true; rr.disabled = true;
    draw();
    quizAnswer(good);
    const x = qs[li];
    fbShow(good, (x.nom || CAST[x.perso].nom) + ' : ' + x.texte, x.passage);
    if (qz.done) stepFoot();
  };
  [...lefts, ...rights].forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); pick(b); }));
  requestAnimationFrame(draw);
}
// Remettre dans l'ordre : on touche les 4 moments dans l'ordre du récit, puis on valide
function renderOrder(body) {
  const qs = qz.q.questions.slice(0, 4);
  const ord = shuffled(qs.length, qz.ci + 7);
  body.append(el('p', 'qz-q', 'Remets ces moments dans l’ordre du ' + UNIT + '.'), el('p', 'qz-num', 'Touche-les du premier au dernier.'));
  const list = el('div', 'qz-ord');
  const cards = ord.map((i) => {
    const b = el('button', 'qz-o qz-oc'); b.type = 'button'; b.dataset.i = String(i);
    b.append(el('b', 'qz-rank', ''), el('span', '', qs[i].texte));
    return b;
  });
  const paint = () => {
    cards.forEach((b) => { const r = qz.order.indexOf(Number(b.dataset.i)); b.querySelector('.qz-rank').textContent = r >= 0 ? String(r + 1) : ''; b.classList.toggle('sel', r >= 0); });
    const foot = byId('qzFoot');
    foot.replaceChildren();
    if (qz.order.length) foot.append(footBtn('Effacer', () => { qz.order = []; paint(); }, false));
    if (qz.order.length === qs.length) foot.append(footBtn('Valider', validate));
  };
  const validate = () => {
    cards.forEach((b) => { b.disabled = true; });
    const rank = qs.map((_, i) => qz.order.indexOf(i));
    let good = 0;
    for (let k2 = 0; k2 < qs.length - 1; k2++) { const g = rank[k2] < rank[k2 + 1]; if (g) good++; quizAnswer(g); }
    cards.forEach((b) => { const i = Number(b.dataset.i); b.classList.add(rank[i] === i ? 'ok' : 'fixed'); });
    const fb = byId('qzFb');
    fbShow(good === 3, '', null);
    $('.qz-fb-h', fb).lastChild.textContent = good === 3 ? 'Bien vu !' : 'Le bon ordre';
    const ol = el('ol', 'qz-ordfb');
    qs.forEach((x) => { const li = el('li'); li.append(el('strong', '', x.texte)); const bq = el('blockquote', 'qz-pass'); bq.append(el('span', '', '« ' + x.passage + ' »')); const rf = passageRef(x.passage); if (rf) bq.append(el('cite', '', rf)); li.append(bq); ol.append(li); });
    fb.append(ol);
    byId('qzFoot').replaceChildren(footBtn('Voir mon score', quizScore));
  };
  cards.forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const i = Number(b.dataset.i), r = qz.order.indexOf(i);
    if (r >= 0) qz.order.splice(r, 1); else qz.order.push(i);
    paint();
  }));
  list.append(...cards);
  body.append(list);
  paint();
}
function quizScore() {
  const n = qz.n, st = quizStars(n);
  const pts = n * QUIZ_PTS + (n >= 3 ? QUIZ_PTS : 0);
  byId('qzFb').hidden = true;
  const body = byId('qzBody');
  const box = el('div', 'qz-end');
  box.append(starsEl(st, 3, 'big'));
  box.append(el('p', 'qz-end-t', n >= 3 ? 'Parfait, sans une erreur !' : n === 2 ? 'Bien joué !' : 'Merci d’avoir relevé le défi !'));
  box.append(el('p', 'qz-end-s', n + (n > 1 ? ' bonnes réponses' : ' bonne réponse') + ' sur 3' + (n >= 3 ? ' · bonus du sans-faute' : '')));
  const p = el('p', 'qz-end-p'); p.append(el('span', 'ico-pt'), el('b', '', '+' + pts), ' points'); box.append(p);
  box.append(el('p', 'qz-end-n', st + (st > 1 ? ' étoiles' : ' étoile') + ' pour ce ' + UNIT + '. Ton score se retrouve dans Progrès.'));
  body.replaceChildren(box);
  paintDots();
  if (n >= 3) { SFX.win(); setTimeout(sparkleStage, 200); }
  const last = qz.ci >= CHAPS.length - 1;
  byId('qzFoot').replaceChildren(footBtn(last || !byId('cover').hidden ? 'Fermer' : 'Continuer la lecture', () => {
    const goOn = !last && byId('cover').hidden && !byId('reader').hidden;
    closeQuiz();
    if (goOn) continueNow();
  }));
}
window.addEventListener('resize', () => { if (qz && qz.draw) qz.draw(); });
function endEpisode(e, isLast) {
  segStop(e);
  stage.dataset.suspense = '0';
  const info = settleEpisode(e, true);
  // vitesse réelle de l'épisode (pauses et bandeaux exclus)
  if (epMs[e] > 20000 && epRead[e] > 60) info.wpm = Math.round(epRead[e] / (epMs[e] / 60000));
  info.cheer = chapterEndsAt(e) ? '' : cheerFor(e, info.wpm);
  if (chapterEndsAt(e)) info.chap = chapterCheer(e);
  if (pvPara) { pvPara.classList.remove('here'); pvPara = null; }
  paraHL(null);
  pvLit = []; placeHighlight();
  if (S.read === 'rsvp') {
    const card = byId('epCard');
    fillEnd($('.ee-in', card), info, isLast);
    card.hidden = false;
    card.classList.remove('open'); void card.offsetWidth; card.classList.add('open');
  } else {
    const slot = openSlot(info, isLast);
    if (slot) glideToSlot(slot, isLast);
  }
  SFX.page(); buzz(12);
  if (chapterEndsAt(e)) { setTimeout(sparkleStage, 350); setTimeout(() => SFX.soft(), 500); }
  else if (info.lvUp >= 0 || info.goalHit || info.unlocked.length || info.jackpot) setTimeout(() => SFX.soft(), 700);
  if (isLast) { stage.dataset.end = '1'; halt(); return; }
  if (!playing || !S.auto || (chapterEndsAt(e) && defiReady(EPS[e].c))) { inter = true; halt(); return; }
  inter = true;
  const wait = speedHack ? 150 : INTER_MS + (chapterEndsAt(e) ? 3000 : 0) + (info.lvUp >= 0 || info.unlocked.length ? 900 : 0) + (epqLive(e) ? 2500 : 0);
  interGo = () => {
    if (!playing) return;
    clearTimeout(timer);
    inter = false; interGo = null;
    dropGo();
    byId('epCard').hidden = true;
    lead = true;
    segT = performance.now();
    tick();
  };
  // le bouton Continuer se remplit pendant l'attente
  $$('.ee-go').forEach((b) => { b.style.setProperty('--wait', wait + 'ms'); b.classList.remove('run'); void b.offsetWidth; b.classList.add('run'); });
  timer = setTimeout(interGo, wait);
}

/* Encouragement, tous les 4 épisodes lus. La comparaison de vitesse s'appuie sur une étude publiée, pas sur les lecteurs
   de l'appli : lecture silencieuse d'un roman par des adultes, 260 mots/min en moyenne, la plupart entre 200 et 320
   (Brysbaert, 2019) ; on prend une loi normale de moyenne 260 et d'écart-type 60. */
function fasterThan(wpm) {
  const z = (wpm - 260) / 60;
  const t = 1 / (1 + .2316419 * Math.abs(z));
  const d = .3989423 * Math.exp(-z * z / 2);
  let p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return Math.min(95, Math.round(p * 20) * 5);
}
// fin d'un chapitre : bravo, et ce que le lecteur y a trouvé
const BRAVO = ['Bravo, tu as lu tout le %s !', 'Chapeau ! Le %s est à toi.', 'Magnifique : %s lu de bout en bout.', 'Bien joué, %s terminé en beauté !'];
function chapterCheer(e) {
  const ch = chapOfEp(e), ci = EPS[e].c;
  const lab = UNIT + (ch.num ? ' ' + ch.num : '') + PSUF(ch);
  const words = ch.z - ch.a + 1;
  const met = MAIN_SPEAKERS.filter((id) => FIRST_LINE.get(id) >= ch.a && FIRST_LINE.get(id) <= ch.z && S.met.includes(id)).length;
  const cs = CULTES.filter((c) => c.a >= ch.a && c.z <= ch.z);
  const found = cs.filter((c) => S.cultes.includes(c.si)).length;
  const parts = [fmtInt(words) + ' mots'];
  if (met) parts.push(met + (met > 1 ? ' nouveaux personnages' : ' nouveau personnage'));
  if (cs.length) parts.push(found + (found > 1 ? ' phrases cultes' : ' phrase culte') + ' sur ' + cs.length);
  return { bravo: BRAVO[ci % BRAVO.length].replace('%s', lab), stats: parts.map((x) => x.replace(/^(\S+) /, '$1\u00a0')).join(' · ') };
}
function cheerFor(e, wpm) {
  const n = S.epN || 0;
  if (!n || n % 6) return '';
  const left = chapOfEp(e).eps.length - 1 - EPS[e].i;
  if (left === 1) return 'Plus qu’un épisode : la fin du ' + UNIT + ' est tout près !';
  if (left >= 2 && left <= 3) return 'Encore un peu ! Tu es presque à la fin du ' + UNIT + '.';
  const list = [n + ' épisodes lus. Bravo !'];
  if (wpm && fasterThan(wpm) >= 55) list.push('Tu lis plus vite que ' + fasterThan(wpm) + ' % des adultes.');
  const st = streakNow();
  if (st >= 2) list.push(st + ' jours de lecture d’affilée. Continue !');
  list.push('Beau rythme ! Tu as déjà lu ' + fmtInt(S.words || 0) + ' mots.');
  return list[(n / 6) % list.length];
}
// fin d'un vrai chapitre du livre (les « ## » du fichier) : le dernier mot de l'épisode e est-il le dernier d'un chapitre ?
const CHAPB = new Int16Array(BLOCKS.length);
{ let c = -1; BLOCKS.forEach((bl, bi) => { if (bl.t === 'chap') c++; CHAPB[bi] = c; }); }
function chapterEndsAt(e) {
  const z = EPS[e].z;
  return z >= N - 1 || CHAPB[T[V[z]].b] !== CHAPB[T[V[z + 1]].b];
}
// paillettes dans la zone de lecture : elles tombent doucement derrière un voile léger, sans rien bloquer
function sparkleStage() {
  if (REDUCED) return;
  const box = byId('stfx');
  const h = stage.clientHeight;
  const cols = ['var(--gold)', 'var(--gold-hi)', 'var(--gas)', 'var(--fx-2)', 'var(--fx-4)', 'var(--fx-1)'];
  for (let i = 0; i < 46; i++) {
    const s = el('span', i % 3 === 0 ? 'sp st' : 'sp cf');
    s.style.left = (Math.random() * 100) + '%';
    s.style.setProperty('--c', cols[i % cols.length]);
    s.style.setProperty('--s', (i % 3 === 0 ? 10 + Math.random() * 10 : 8 + Math.random() * 6) + 'px');
    s.style.setProperty('--h', (h + 40) + 'px');
    s.style.setProperty('--d', (2.4 + Math.random() * 1.6) + 's');
    s.style.setProperty('--dl', (Math.random() * 1.4) + 's');
    s.style.setProperty('--dx', ((Math.random() - .5) * 90) + 'px');
    s.style.setProperty('--rot', ((Math.random() - .5) * 540) + 'deg');
    s.addEventListener('animationend', () => s.remove());
    box.append(s);
  }
}
// compatibilité des crochets de test
const finishEpisode = endEpisode;
function ep80(e) { return Math.floor(EPS[e].n * .8); }
function el(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
}
function startEpisode(e, autoplay) {
  e = Math.min(Math.max(0, e), EPS.length - 1);
  halt();
  k = EPS[e].a; S.k = k; persist();
  epRead[e] = 0; epPaused[e] = false;
  inter = false; byId('epCard').hidden = true;
  seen.fill(0, EPS[e].a, EPS[e].z + 1);
  showReader(autoplay);
}

/* ================= Coups de cœur et réactions ================= */
const emo = (c) => '<span class="emo" aria-hidden="true">' + c + '</span>';
const RX = {
  love: { lab: 'J’aime', svg: emo('\u2764\ufe0f') },
  dislike: { lab: 'J’aime pas', svg: emo('\ud83d\udc4e') },
  fear: { lab: 'Ça fait peur', svg: emo('\ud83d\ude31') },
  laugh: { lab: 'Ça fait rire', svg: emo('\ud83d\ude02') }
};
const RX_ORDER = ['love', 'dislike', 'fear', 'laugh'];
const FACE_SVG = emo('\ud83d\ude42');

function sentenceText(si) {
  const a = SENT[si], z = si + 1 < SENT.length ? SENT[si + 1] - 1 : N - 1;
  let out = '', inSp = false;
  for (let j = a; j <= z; j++) {
    const tk = T[V[j]];
    const sp = tk.k !== 'n';
    if (sp && !inSp) out += (out ? ' ' : '') + '« ';
    else if (!sp && inSp) out += ' »';
    else if (out) out += ' ';
    out += tk.t;
    inSp = sp;
  }
  if (inSp) out += ' »';
  return out;
}
// double-toucher : la phrase est aimée ; les cœurs s'envolent du mot touché et un petit cœur reste après lui
function loveAt(x, y, target) {
  unlockAudio();
  const w = target && target.closest ? target.closest('#pvIn [data-t]') : null;
  const j = w ? VOF[Number(w.dataset.t)] : -1;
  const si = sentenceAt(j >= 0 ? j : k);
  const h = S.hearts.find((o) => o.s === si && o.r === 'love');
  if (h) {   // déjà aimée : seulement l'envol
    const m = pvIn.querySelector('.rxmark[data-w="' + markWord(h) + '"]');
    flyFrom(x, y, m); SFX.heart(); buzz(10);
    return;
  }
  if (j >= 0) { chooseRx('love', j); return; }
  // mode Rapide : pas de page, les cœurs partent du doigt
  const si2 = sentenceAt(k);
  S.hearts.push({ s: si2, at: Date.now(), r: 'love', w: V[CH[CHOF[k]].z] }); persist();
  flyFrom(x, y, null); SFX.heart(); buzz([10, 30, 10]);
}
function flyFrom(x, y, m) {
  if (m) { reactAnim('love', m); return; }
  const sr = stage.getBoundingClientRect();
  const o = el('span', 'flo-origin'); o.style.left = (x - sr.left) + 'px'; o.style.top = (y - sr.top) + 'px';
  stage.append(o); reactAnim('love', o); o.remove();
}
function heartAt(x, y) {
  unlockAudio();
  const si = sentenceAt(k);
  const known = S.hearts.some((h) => h.s === si);
  if (!known) { S.hearts.push({ s: si, at: Date.now() }); persist(); }
  if (!REDUCED) {
    const r = stage.getBoundingClientRect();
    const b = el('span', 'burst');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2l-1.4-1.3C5.4 15.3 2 12.2 2 8.4 2 5.3 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.3 22 8.4c0 3.8-3.4 6.9-8.6 11.5z"/></svg>';
    b.style.left = (x - r.left) + 'px'; b.style.top = (y - r.top) + 'px';
    b.addEventListener('animationend', () => b.remove());
    stage.append(b);
  }
  SFX.heart(); buzz(15);
  toast(known ? 'Déjà dans ton carnet' : 'Passage gardé dans ton carnet');
}


/* Réactions : un petit visage discret sur le bord droit de la page (mode Immersif).
   Doigt maintenu dessus : la lecture se met en pause et les quatre réactions apparaissent ; on glisse le doigt sur l'une
   d'elles et on lâche (ou on la touche). La réaction est rangée dans le Carnet avec la phrase en cours, puis la lecture reprend. */
const rxBox = byId('rx'), rxBtn = byId('rxBtn'), rxMenu = byId('rxMenu');
let rxOpen = false, rxWas = false, rxTimer = 0, rxHot = null, rxDownOpen = false, rxResumeT = 0;
function openRx() {
  if (rxOpen) return;
  rxWas = playing;
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; }   // réagir n'est pas une pause
  rxOpen = true; rxBox.dataset.open = '1'; rxMenu.hidden = false;
  rxBox.dataset.down = '0';
  if (rxMenu.getBoundingClientRect().top < stage.getBoundingClientRect().top + 6) rxBox.dataset.down = '1';
  buzz(10);
}
function closeRx(resume) {
  if (!rxOpen) return;
  rxOpen = false; rxBox.dataset.open = '0'; rxMenu.hidden = true;
  if (rxHot) { rxHot.classList.remove('hot'); rxHot = null; }
  if (resume && rxWas && !byId('reader').hidden) { clearTimeout(rxResumeT); rxResumeT = setTimeout(() => { if (!playing && !rxOpen) play(); }, 650); }
}
function rxAt(x, y) { const t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('#rxMenu [data-rx]') : null; }
function chooseRx(type, at) {
  unlockAudio();
  const jj = typeof at === 'number' ? at : k;   // le mot sous le doigt, sinon la position de lecture
  const si = sentenceAt(jj);
  const w = typeof at === 'number' ? V[at] : V[CH[CHOF[k]].z];
  const h = S.hearts.find((x) => x.s === si);
  if (h) { h.r = type; h.at = Date.now(); h.w = w; } else S.hearts.push({ s: si, at: Date.now(), r: type, w });
  persist();
  applyMarks();
  const mark = pvBuilt ? pvIn.querySelector('.rxmark[data-w="' + w + '"]') : null;
  if (mark) mark.classList.add('new');

  reactAnim(type, mark);
  if (type === 'love') SFX.heart(); else SFX.soft();
  buzz(type === 'love' ? [10, 30, 10] : 12);
  closeRx(true);
}
/* Dictionnaire du livre : appui long sur un mot → mot de dictionnaire, nature, définition dans le sens du texte, anglais.
   La bulle garde aussi le cœur (garder le passage dans le carnet, ou le retirer). La lecture attend, puis reprend. */
const DICO = BOOK.dico && BOOK.dico.formes ? BOOK.dico : null;
const ELIS = /^(l|d|j|m|t|s|n|c|qu|jusqu|lorsqu|puisqu|quoiqu|presqu)'/;
function dictLookup(raw) {
  if (!DICO) return null;
  const w = String(raw).toLowerCase().replace(/[’]/g, "'").replace(/^[«»“”"(—–\-\s]+|[«»“”".,;:!?…)\]\s]+$/g, '');
  const F = DICO.formes;
  const get = (x) => (x && Object.prototype.hasOwnProperty.call(F, x) ? DICO.e[F[x]] : null);
  let r = get(w);
  if (!r && ELIS.test(w)) r = get(w.replace(ELIS, '')) || get(w.match(ELIS)[0]);
  if (!r && w.includes('-')) { const p = w.split('-').filter(Boolean); r = get(p[0]) || get(p[p.length - 1]); }
  return r ? { w: r[0], pos: r[1], def: r[2], en: r[3] } : null;
}
let dictW = null, dictWas = false;
function openDict(w) {
  if (dictW) closeDict(false);
  const t = Number(w.dataset.t), j = VOF[t];
  const ent = dictLookup(T[t].t);
  dictWas = playing;
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; }   // regarder un mot n'est pas une pause
  dictW = w; w.classList.add('dict-on');
  const box = byId('dictC');
  const head = el('div', 'dc-head');
  head.append(el('strong', 'dc-w', ent ? ent.w : T[t].t.replace(/[«»“”".,;:!?…()\]—]+/g, '')));
  if (ent && ent.pos) head.append(el('span', 'dc-pos', ent.pos));
  const x = el('button', 'dc-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer');
  x.addEventListener('click', (ev) => { ev.stopPropagation(); closeDict(true); });
  head.append(x);
  const parts = [head];
  if (ent) {
    parts.push(el('p', 'dc-def', ent.def));
    if (ent.en) { const en = el('p', 'dc-en'); en.append(el('span', 'dc-flag', 'EN'), document.createTextNode(ent.en)); parts.push(en); }
  } else parts.push(el('p', 'dc-def dc-none', 'Ce mot n’est pas encore dans le dictionnaire du livre.'));
  const si = sentenceAt(j);
  const loved = S.hearts.some((h) => h.s === si && h.r === 'love');
  const hb = el('button', 'dc-heart' + (loved ? ' on' : '')); hb.type = 'button';
  hb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2l-1.4-1.3C5.4 15.3 2 12.2 2 8.4 2 5.3 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.3 22 8.4c0 3.8-3.4 6.9-8.6 11.5z"/></svg>';
  hb.append(el('span', '', loved ? 'Retirer le cœur' : 'J’aime ce passage'));
  hb.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); closeDict(true); toggleLove(j); });
  parts.push(hb);
  box.replaceChildren(...parts);
  box.hidden = false;
  // la bulle se place au-dessus du mot (ou dessous s'il n'y a pas la place)
  const sr = stage.getBoundingClientRect(), r = w.getBoundingClientRect();
  const bw = Math.min(330, sr.width - 24);
  box.style.width = bw + 'px';
  const left = Math.max(12, Math.min(sr.width - bw - 12, r.left - sr.left + r.width / 2 - bw / 2));
  const bh = box.offsetHeight;
  const above = r.top - sr.top - bh - 12;
  const top = above >= 8 ? above : Math.min(sr.height - bh - 8, r.bottom - sr.top + 12);
  box.style.left = Math.round(left) + 'px'; box.style.top = Math.round(Math.max(8, top)) + 'px';
  box.dataset.side = above >= 8 ? 'up' : 'down';
  box.classList.remove('out', 'in'); void box.offsetWidth; box.classList.add('in');
  buzz(10); SFX.soft();
}
function closeDict(resume) {
  if (!dictW) return;
  dictW.classList.remove('dict-on'); dictW = null;
  const box = byId('dictC');
  box.classList.add('out');
  setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 260);
  if (resume && dictWas && !byId('reader').hidden) { clearTimeout(rxResumeT); rxResumeT = setTimeout(() => { if (!playing && !dictW) play(); }, 450); }
  dictWas = false;
}
// appui long : la phrase est aimée ; si elle l'était déjà, le cœur s'en va
function toggleLove(j) {
  const si = sentenceAt(j);
  const h = S.hearts.find((x) => x.s === si && x.r === 'love');
  if (!h) { chooseRx('love', j); return; }
  S.hearts = S.hearts.filter((x) => x !== h);
  persist();
  buzz(8);
  tone(587.33, 0, .12, 'sine', .03); tone(440, .08, .16, 'sine', .025);
  const m = pvBuilt && pvIn.querySelector('.rxmark[data-w="' + markWord(h) + '"]');
  if (m && !REDUCED) { m.classList.add('gone'); setTimeout(applyMarks, 340); } else applyMarks();
}
// émojis gardés : dans la marge de droite, à hauteur du mot où l'on a réagi (ils défilent avec la page)
function markWord(h) {
  if (typeof h.w === 'number') return h.w;
  const z = h.s + 1 < SENT.length ? SENT[h.s + 1] - 1 : N - 1;   // anciennes réactions : fin de la phrase
  return V[z];
}
let gut = null;
function applyMarks() {
  if (!pvBuilt) return;
  if (!gut || !gut.isConnected) { gut = el('div', 'rxgut'); gut.setAttribute('aria-hidden', 'true'); pvIn.append(gut); }
  gut.replaceChildren();
  pvIn.querySelectorAll('.rxheart').forEach((x) => x.remove());
  S.hearts.forEach((h) => {
    if (!h.r || !RX[h.r] || h.s >= SENT.length) return;
    const wi = markWord(h);
    if (!PVS[wi]) return;
    const m = el('span', 'rxmark' + (h.r === 'love' ? ' rxheart' : ''));
    m.dataset.rx = h.r; m.dataset.w = String(wi);
    m.innerHTML = RX[h.r].svg;
    if (h.r === 'love') { m.setAttribute('aria-hidden', 'true'); PVS[wi].after(m); }   // les anciennes réactions ne s'affichent plus dans le texte
  });
  positionMarks();
}
// hauteur de chaque émoji : le milieu de la ligne du mot ; deux émojis trop proches se décalent un peu
function positionMarks() {
  if (lgut && lgut.isConnected) {
    lgut.querySelectorAll('.cultemark').forEach((m) => { const c = CULTES.find((x) => x.si === Number(m.dataset.si)); if (c && PVS[V[c.a]]) m.style.top = Math.round(lineY(PVS[V[c.a]])) + 'px'; });
  }
  if (!gut || !gut.isConnected) return;
  const base = pvIn.getBoundingClientRect().top;
  const ms = Array.from(gut.children).map((m) => {
    const r = PVS[Number(m.dataset.w)].getBoundingClientRect();
    return { m, y: r.top - base + r.height / 2 };
  }).sort((a, b) => a.y - b.y);
  let last = -1e9;
  ms.forEach((o) => { const y = Math.max(o.y, last + 24); o.m.style.top = Math.round(y) + 'px'; last = y; });
}
// une animation par réaction, partie de l'émoji posé dans le texte
function reactAnim(type, mark) {
  if (REDUCED) return;
  const sr = stage.getBoundingClientRect();
  const r = (mark || rxBtn).getBoundingClientRect();
  const x0 = r.left - sr.left + r.width / 2, y0 = r.top - sr.top + r.height / 2;
  const spawn = (cls, html, x, y) => {
    const o = el('span', 'flo ' + cls);
    const s = el('span', 'flo-s');
    s.innerHTML = html;
    o.append(s);
    o.style.left = x + 'px'; o.style.top = y + 'px';
    o.addEventListener('animationend', (ev) => { if (ev.target === o) o.remove(); });
    stage.append(o);
    return [o, s];
  };
  if (type === 'love') {
    // les cœurs s'envolent jusqu'en haut en se balançant
    for (let i = 0; i < 14; i++) {
      const [o, s] = spawn('flo-love', RX.love.svg, x0 + (Math.random() - .5) * 50, y0);
      o.style.setProperty('--sz', (13 + Math.random() * 14) + 'px');
      o.style.setProperty('--rise', -(y0 + 40 + Math.random() * 60) + 'px');
      o.style.setProperty('--d', (1.7 + Math.random() * 1.1) + 's');
      o.style.setProperty('--dl', (i * .07) + 's');
      s.style.setProperty('--sway', (10 + Math.random() * 18) * (i % 2 ? 1 : -1) + 'px');
      s.style.setProperty('--sd', (.5 + Math.random() * .4) + 's');
    }
  } else if (type === 'dislike') {
    // « Bouh ! » s'écrit à droite de l'émoji, puis s'efface
    const b = el('span', 'bouh', 'Bouh !');
    stage.append(b);
    const left = x0 + 16 + b.offsetWidth > stage.clientWidth - 8 ? x0 - 16 - b.offsetWidth : x0 + 16;
    b.style.left = Math.max(8, left) + 'px';
    b.style.top = (y0 - b.offsetHeight / 2) + 'px';
    b.addEventListener('animationend', () => b.remove());
  } else if (type === 'laugh') {
    // cascade de rires qui dégringole jusqu'en bas
    const fall = stage.clientHeight - y0 + 30;
    for (let i = 0; i < 9; i++) {
      const [o, s] = spawn('flo-laugh fall', RX.laugh.svg, x0 + (Math.random() - .5) * 90, y0);
      o.style.setProperty('--sz', (16 + Math.random() * 12) + 'px');
      o.style.setProperty('--fall', fall + 'px');
      o.style.setProperty('--dx', ((Math.random() - .5) * 60) + 'px');
      o.style.setProperty('--d', (1.2 + Math.random() * .7) + 's');
      o.style.setProperty('--dl', (i * .1) + 's');
      s.style.setProperty('--sd', (.25 + Math.random() * .2) + 's');
    }
  } else if (type === 'fear' && mark) {
    // frisson : l'émoji tremble
    mark.classList.add('shake');
    mark.addEventListener('animationend', () => mark.classList.remove('shake'), { once: true });
  }
}
/* Partager : la phrase en cours, entre guillemets, avec l'auteur et le titre ; envoyée par le menu de partage
   du téléphone, ou copiée pour la coller dans un message (dans l'aperçu Claude, le partage direct est bloqué). */
let shareWas = false, shareText = '';
function openShare() {
  shareWas = playing;
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; }
  if (rxOpen) closeRx(false);
  const q = sentenceText(sentenceAt(k));
  const by = BOOK.auteur + ', ' + BOOK.titre;
  byId('shareQuote').textContent = '« ' + q.replace(/^«\s*|\s*»$/g, '') + ' »';
  byId('shareBy').textContent = by;
  shareText = byId('shareQuote').textContent + '\n— ' + by;
  byId('shareWa').href = 'https://wa.me/?text=' + encodeURIComponent(shareText);
  closeSheets(); hideToast();
  byId('shareSheet').hidden = false;
  byId('shareSend').focus({ preventScroll: true });
}
function closeShare(resume) {
  byId('shareSheet').hidden = true;
  if (resume && shareWas) { clearTimeout(rxResumeT); rxResumeT = setTimeout(() => { if (!playing) play(); }, 350); }
  shareWas = false;
}
function copyShare(msg) {
  const done = () => { closeShare(true); toast(msg || 'Citation copiée : colle-la dans ton message'); };
  try {
    navigator.clipboard.writeText(shareText).then(done, () => { selectQuote(); toast('Sélectionne la citation pour la copier'); });
  } catch (e) { selectQuote(); toast('Sélectionne la citation pour la copier'); }
}
function selectQuote() { try { const r = document.createRange(); r.selectNodeContents(byId('shareQuote').parentNode); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignoré */ } }
byId('shareBtn').addEventListener('click', openShare);
byId('shareSend').addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({ text: shareText }).then(() => closeShare(true), (err) => { if (!err || err.name !== 'AbortError') copyShare(); });
  } else copyShare();
});
byId('shareCopy').addEventListener('click', () => copyShare());
byId('shareWa').addEventListener('click', () => setTimeout(() => closeShare(true), 300));
$$('#shareSheet [data-close]').forEach((b) => b.addEventListener('click', () => closeShare(true)));
rxBtn.innerHTML = RX.love.svg;
RX_ORDER.forEach((t) => {
  const b = el('button', 'rx-item'); b.type = 'button'; b.dataset.rx = t;
  b.setAttribute('aria-label', RX[t].lab);
  const ic = el('span', 'rx-ic rx-' + t); ic.innerHTML = RX[t].svg;
  b.append(ic);
  b.addEventListener('click', () => chooseRx(t));
  rxMenu.append(b);
});
// cœur : un toucher garde le passage en cours ; le cœur rougit un instant, la lecture ne s'arrête pas
let likeT = 0;
rxBtn.addEventListener('click', () => {
  chooseRx('love');
  rxBtn.classList.remove('on'); void rxBtn.offsetWidth; rxBtn.classList.add('on');
  clearTimeout(likeT);
  likeT = setTimeout(() => rxBtn.classList.remove('on'), 1400);
});
rxBtn.addEventListener('contextmenu', (e) => e.preventDefault());

/* ================= Accueil, bibliothèque, progrès et page du livre ================= */
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0110 0V10h.5A1.5 1.5 0 0119 11.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19.5v-8A1.5 1.5 0 016.5 10zm2.2 0h5.6V7.5a2.8 2.8 0 00-5.6 0z"/></svg>';
// couverture dessinée : auteur, titre entre deux filets (ou portrait pour Bel-Ami), année
function coverEl(b, bare) {
  const w = el('div', 'bkw' + (isOpen(b) ? '' : ' lock'));
  const c = el('div', 'bk');
  c.style.setProperty('--b1', b.b1); c.style.setProperty('--b2', b.b2);
  const inn = el('div', 'bk-in');
  const mid = el('span', 'bk-mid');
  const pf = b.img || '';
  if (pf) { const m = el('span', 'bk-pf'); const img = new Image(); img.src = pf; img.alt = ''; img.decoding = 'async'; m.append(img); mid.append(m); }
  else mid.append(el('span', 'bk-orn'));
  mid.append(el('span', 'bk-t' + (b.t.length > 15 ? ' long' : ''), b.t));
  if (!pf) mid.append(el('span', 'bk-orn'));
  inn.append(el('span', 'bk-a', b.a), mid, el('span', 'bk-y', String(b.y)));
  c.append(inn); w.append(c);
  if (!bare && !b.ok) {
    const badge = el('span', 'bk-badge' + (isOpen(b) ? ' new' : ''));
    if (isOpen(b)) badge.textContent = 'Débloqué';
    else { badge.innerHTML = LOCK_SVG; badge.append(fmtInt(b.pts) + ' pts'); }
    w.append(badge);
  }
  return w;
}
// vitesse réellement lue (pauses comprises), pour estimer les durées
function effWpm() { return N / (spanMs(0, N - 1) / 60000); }
const fmtSize = (n) => (n >= 1e6 ? (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko');
let dl = null;   // téléchargement en cours : { id, p }
// état d'un livre : lock (pas assez de points), soon (débloqué, pas encore prêt), get (à télécharger), dl, ready
function bookState(b) {
  if (!isOpen(b)) return 'lock';
  if (b.id === BOOK.id) return 'ready';
  if (!b.file) return 'soon';
  if (b.inclus || LIB.has(b.id)) return 'ready';
  if (dl && dl.id === b.id) return 'dl';
  return 'get';
}
function bookStatus(b) {
  switch (bookState(b)) {
    case 'lock': return 'Encore ' + fmtInt(b.pts - S.pts) + ' pts';
    case 'soon': return 'Débloqué · bientôt';
    case 'get': return 'À télécharger · ' + fmtSize(b.size);
    case 'dl': return 'Téléchargement… ' + Math.round(dl.p * 100) + ' %';
    default: { const c0 = b.contenu || cap(PART); return c0 + (/ et |,| à /.test(c0) ? ' disponibles' : ' disponible'); }
  }
}
function paintStatus(b) {
  $$('.bkcard[data-book="' + b.id + '"] .stt').forEach((x) => { x.textContent = bookStatus(b); });
}
// ouvrir un autre livre : on enregistre, puis l'appli redémarre sur ce livre (page du livre)
function switchBook(id) {
  halt();
  S.cur = id; S.next = 'cover';
  persist();
  location.reload();
}
function startDownload(b) {
  if (dl) { toast('Un livre est déjà en cours de téléchargement.'); return; }
  dl = { id: b.id, p: 0 };
  paintStatus(b);
  let last = 0;
  LIB.download(LIB.catalogue.livres.find((x) => x.id === b.id), (p) => {
    dl.p = p;
    const now = performance.now();
    if (now - last > 120 || p >= 1) { last = now; paintStatus(b); }
  }).then(() => {
    dl = null;
    toast(b.t + ' est téléchargé.');
    SFX.win(); buzz(20);
    setTimeout(() => switchBook(b.id), 700);
  }, () => {
    dl = null;
    paintStatus(b);
    toast('Téléchargement impossible. Vérifie ta connexion, puis réessaie.');
  });
}
function bookTap(b) {
  switch (bookState(b)) {
    case 'ready': if (b.id === BOOK.id) showCover(); else switchBook(b.id); return;
    case 'get': startDownload(b); return;
    case 'dl': toast('Téléchargement en cours…'); return;
    case 'soon': toast(b.t + ' est débloqué : il arrive bientôt dans ta bibliothèque.'); return;
    default: toast('Encore ' + fmtPts(b.pts - S.pts) + ' pour débloquer ' + b.t + '.');
  }
}
function bookCard(b) {
  const x = el('button', 'bkcard'); x.type = 'button';
  x.dataset.book = b.id;
  x.append(coverEl(b, false), el('span', 't', b.t), el('span', 'a', b.a));
  const stt = bookState(b);
  const st = el('span', 'stt' + (stt === 'ready' ? ' ok' : stt === 'get' || stt === 'dl' ? ' get' : ''));
  st.textContent = bookStatus(b);
  x.append(st);
  x.setAttribute('aria-label', b.t + ', ' + b.a + ' : ' + st.textContent);
  x.addEventListener('click', () => bookTap(b));
  return x;
}
// livres gardés sur l'appareil : inclus dans l'appli, ou téléchargés (qu'on peut supprimer pour libérer de la place)
function renderStorage() {
  const list = byId('storeList');
  const rows = [];
  BOOKS.filter((b) => b.inclus).forEach((b) => rows.push({ b, sub: 'Inclus dans l’appli', del: false }));
  LIB.list().forEach((h) => {
    const b = BOOKS.find((x) => x.id === h.id) || { id: h.id, t: h.id, a: '' };
    rows.push({ b, sub: fmtSize(h.taille) + (b.id === BOOK.id ? ' · en cours de lecture' : ''), del: b.id !== BOOK.id });
  });
  list.replaceChildren(...rows.map((r) => {
    const li = el('li');
    const t = el('div');
    t.append(el('strong', '', r.b.t), el('span', '', r.sub));
    li.append(t);
    if (r.del) {
      const btn = el('button', 'ghost del', 'Supprimer'); btn.type = 'button';
      let arm = 0;
      btn.addEventListener('click', () => {
        if (!arm) { btn.textContent = 'Confirmer'; arm = setTimeout(() => { arm = 0; btn.textContent = 'Supprimer'; }, 3500); return; }
        clearTimeout(arm);
        LIB.remove(r.b.id).then(() => { toast(r.b.t + ' est supprimé de cet appareil.'); refreshHome(); }, () => toast('Suppression impossible.'));
      });
      li.append(btn);
    }
    return li;
  }));
  const used = LIB.list().reduce((n, h) => n + (h.taille || 0), 0);
  byId('storeNote').textContent = used ? 'Livres téléchargés : ' + fmtSize(used) + '. Ils restent lisibles sans connexion.'
    : 'Les livres que tu débloques se téléchargent un par un, puis restent lisibles sans connexion.';
}
function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}
const chapterDone = () => !!(S.eps[EPS.length - 1] && S.eps[EPS.length - 1].done && EPI[k] === EPS.length - 1 && k >= N - 2);
const resumeEp = () => (chapterDone() ? 0 : EPI[k]);
const hasStarted = () => k > 0 || Object.keys(S.eps).length > 0;
let curView = 'accueil', libFilter = 'tous';
function setView(v) {
  curView = v;
  $$('[data-view]').forEach((x) => { x.hidden = x.dataset.view !== v; });
  $$('[data-tabv]').forEach((x) => { if (x.dataset.tabv === v) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  byId('homeScroll').scrollTop = 0;
  if (v === 'biblio') renderLibrary();
  if (v === 'progres') renderProgress();
}
function refreshHome() {
  const nu = newUnlocks();
  if (nu.length) { persist(); toast('Nouveau livre débloqué : ' + nu[0].t); }
  updatePts(false);
  const d = dayRec();
  const started = hasStarted();
  byId('hello').textContent = greet();
  byId('helloSub').textContent = d.pts >= S.goal ? 'Objectif du jour atteint. Encore un épisode ?'
    : started ? 'Un épisode dure environ deux minutes.' : 'Commence par ' + BOOK.titre + ' : ' + EPS.length + ' épisodes d’environ deux minutes.';
  // reprise de lecture
  const e = resumeEp(), ep = EPS[e];
  byId('heroCover').replaceChildren(coverEl(CUR, true));
  byId('heroT').textContent = BOOK.titre;
  byId('heroEb').textContent = chapterDone() ? (/entier/i.test(BOOK.contenu || '') ? 'Roman terminé' : chapLabel(CHAPS[CHAPS.length - 1]) + ' terminé') : started ? 'Continuer la lecture' : 'Commencer à lire';
  byId('heroS').textContent = chapterDone() ? 'Relire depuis le début' : (CHAPS.length > 1 ? chapLabel(chapOfEp(e)) + ' · épisode ' : 'Épisode ') + (ep.i + 1) + ' sur ' + chapOfEp(e).eps.length + ' · ' + ep.title;
  const pct = chapterDone() ? 100 : chapPct(k);
  byId('heroBar').style.setProperty('--p', pct + '%');
  byId('heroM').textContent = chapterDone() ? ((BOOK.suite && BOOK.suite.court) || 'La suite arrive bientôt') : pct + ' % du ' + chapLab(EPS[e].c) + ' · ' + minutes(spanMs(k, chapOfEp(e).z)) + ' restantes';
  byId('heroPlay').setAttribute('aria-label', (started ? 'Reprendre' : 'Commencer') + ' : épisode ' + (e + 1));
  // objectif du jour et niveau
  setRing(byId('goalRing'), d.pts / S.goal);
  byId('goalBig').textContent = fmtInt(d.pts);
  byId('goalSmall').textContent = 'sur ' + fmtPts(S.goal);
  const li = levelInfo(S.pts);
  byId('lvLab').textContent = 'Niveau ' + (li.lv + 1);
  byId('lvName').textContent = LEVELS[li.lv].t;
  byId('lvBar').style.setProperty('--p', Math.round(li.frac * 100) + '%');
  byId('lvNext').textContent = LEVELS[li.lv + 1] ? 'Encore ' + fmtInt(li.need) + ' pts pour le niveau ' + (li.lv + 2) : 'Niveau maximum';
  // prochain livre à débloquer
  const nb = nextLocked();
  byId('nextBkRow').hidden = !nb;
  if (nb) {
    const btn = byId('nextBk');
    btn.replaceChildren(coverEl(nb, true));
    const t = el('span', 'nb-txt');
    const bar = el('span', 'xpbar'), fill = el('i');
    fill.style.setProperty('--p', Math.round(Math.min(1, S.pts / nb.pts) * 100) + '%');
    bar.append(fill);
    t.append(el('strong', '', nb.t), el('span', 'tile-small', nb.a + ' · ' + nb.x), bar,
      el('span', 'tile-small', 'Encore ' + fmtPts(nb.pts - S.pts) + ', environ ' + minutes((nb.pts - S.pts) * 60000 / effWpm()) + ' de lecture'));
    btn.append(t);
    btn.onclick = () => bookTap(nb);
  }
  // étagères
  byId('shelfMine').replaceChildren(...BOOKS.filter(isOpen).map(bookCard));
  byId('shelfLocked').replaceChildren(...BOOKS.filter((b) => !isOpen(b)).map(bookCard));
  if (curView === 'biblio') renderLibrary();
  if (curView === 'progres') renderProgress();
}
function renderLibrary() {
  const g = byId('libGrid');
  g.replaceChildren(...BOOKS.filter((b) => libFilter === 'tous' || (libFilter === 'dispo' ? isOpen(b) : !isOpen(b))).map(bookCard));
  renderStorage();
  $$('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === libFilter)));
}
function duration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
function renderProgress() {
  const li = levelInfo(S.pts), nx = LEVELS[li.lv + 1];
  byId('pLvLab').textContent = 'Niveau ' + (li.lv + 1);
  byId('pPts').textContent = fmtPts(S.pts);
  byId('pLvName').textContent = LEVELS[li.lv].t;
  byId('pLvBar').style.setProperty('--p', Math.round(li.frac * 100) + '%');
  byId('pLvNext').textContent = nx ? 'Encore ' + fmtPts(li.need) + ' pour le niveau ' + (li.lv + 2) + ' · ' + nx.t : 'Tu as atteint le plus haut niveau.';
  const d = dayRec();
  setRing(byId('pGoalRing'), d.pts / S.goal);
  byId('pGoalBig').textContent = fmtInt(Math.min(d.pts, S.goal)) + ' / ' + fmtInt(S.goal);
  byId('pGoalSmall').textContent = d.pts >= S.goal ? 'Atteint aujourd’hui. Bravo !' : 'Encore ' + fmtPts(S.goal - d.pts) + ' aujourd’hui';
  $$('[data-goal]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.goal) === S.goal)));
  byId('pGoalHow').textContent = 'À ta vitesse (' + S.wpm + ' mots/min), ' + fmtPts(S.goal) + ' représentent environ ' + minutes(S.goal * 60000 / effWpm()) + ' de lecture par jour.';
  const done = Object.values(S.eps).filter((x) => x && x.done).length;
  const st = streakNow();
  const nUnl = BOOKS.filter((b) => !b.ok && isOpen(b)).length;
  const stats = [
    [fmtInt(S.words || 0), 'mots lus'],
    [duration(S.readMs || 0), 'de lecture'],
    [done + ' / ' + EPS.length, 'épisodes de ' + BOOK.titre],
    [st + (st > 1 ? ' jours' : ' jour'), 'de suite · record ' + (S.streak.best || 0)],
    [nUnl + ' / ' + BOOKS.filter((b) => !b.ok).length, 'livres débloqués'],
    [String(S.hearts.length), S.hearts.length > 1 ? 'passages gardés' : 'passage gardé']
  ];
  // défis : étoiles par livre (jamais comparées à d'autres lecteurs)
  const rows = [];
  if (QUIZ_N) rows.push([BOOK.titre, totalStars(), QUIZ_N * 3]);
  Object.entries(S.lib || {}).forEach(([id, b]) => {
    if (id === BOOK.id || !b || !b.quizN) return;
    const bk = BOOKS.find((x) => x.id === id);
    const n = Object.values(b.quiz || {}).reduce((a, r) => a + ((r && r.st) || 0), 0);
    rows.push([bk ? bk.t : id, n, b.quizN * 3]);
  });
  byId('pDefis').hidden = !rows.length;
  byId('pDefiList').replaceChildren(...rows.map(([t, n, of]) => {
    const li = el('li');
    const s = el('span', 'dl-t'); s.append(el('b', '', t), el('span', '', n + (n > 1 ? ' étoiles' : ' étoile') + ' sur ' + of));
    li.append(s, starsEl(n, of, 'sm'));
    return li;
  }));
  byId('statGrid').replaceChildren(...stats.map(([v, l]) => { const x = el('div'); x.append(el('b', '', v), el('span', '', l)); return x; }));
  byId('ladder').replaceChildren(...LEVELS.map((L, i) => {
    const x = el('li', i < li.lv ? 'got' : i === li.lv ? 'cur' : '');
    x.append(el('b', '', String(i + 1)), el('span', '', L.t), el('span', '', fmtInt(L.p) + ' pts'));
    return x;
  }));
}
function showHome(view) {
  halt();
  stopAmb();
  cancelCountdown321();
  closeSheets();
  hideToast();
  byId('reader').hidden = true;
  byId('cover').hidden = true;
  byId('home').hidden = false;
  refreshHome();
  setView(view || curView);
}
function showCover() {
  halt();
  stopAmb();
  cancelCountdown321();
  closeSheets();
  hideToast();
  byId('reader').hidden = true;
  byId('home').hidden = true;
  byId('cover').hidden = false;
  byId('cover').scrollTop = 0;
  refreshCover();
}
function showReader(autoplay) {
  byId('home').hidden = true;
  byId('cover').hidden = true;
  byId('reader').hidden = false;
  layout();
  if (pvBuilt) sizePage();
  updateHint();
  updatePts(false);
  render(k); progress();
  if (S.read === 'page') { stopPageGlide(); pageview.scrollTop = pvTarget; }
  txStart();
  if (autoplay && S.read !== 'texte') { if (S.started) setTimeout(play, 280); else firstCountdown(); }
}
// Tout premier lancement : un décompte 3-2-1 qui rappelle comment faire une pause
let cdTimer = 0;
function firstCountdown() {
  S.started = true; persist();
  const box = byId('count321'), n = byId('count321n');
  box.hidden = false;
  let i = 3;
  const next = () => {
    if (box.hidden) return;
    if (i === 0) { box.hidden = true; play(); return; }
    n.textContent = String(i);
    n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
    tone(660 + (3 - i) * 110, 0, .09, 'sine', .04);
    i--;
    cdTimer = setTimeout(next, 700);
  };
  next();
}
function cancelCountdown321() { clearTimeout(cdTimer); byId('count321').hidden = true; }
function refreshCover() {
  const e = resumeEp();
  const ep = EPS[e];
  const started = hasStarted();
  byId('bpCover').replaceChildren(coverEl(CUR, true));
  byId('bpBy').textContent = BOOK.auteur + ' · ' + BOOK.annee;
  byId('bpTitle').textContent = BOOK.titre;
  const ch = BOOK.chapitre || { avant: cap(UNIT), num: '' };
  byId('bpChap').replaceChildren(ch.avant + (ch.num ? ' ' : ''), el('b', '', ch.num || ''));
  byId('bpTeaser').textContent = BOOK.accroche || '';
  byId('bpTeaser').hidden = !BOOK.accroche;
  byId('bpCredits').textContent = BOOK.credits || '';
  byId('howUnit').textContent = CHAPS.length > 1 ? 'texte' : UNIT;
  byId('bpFacts').textContent = EPS.length + ' épisodes · ' + minutes(spanMs(0, N - 1)) + ' à ta vitesse · ' + fmtInt(N) + ' mots, soit ' + fmtPts(N);
  byId('how').hidden = started;
  byId('howEps').textContent = String(EPS.length);
  byId('resume').hidden = !started;
  byId('ctaMain').textContent = chapterDone() ? (CHAPS.length > 1 ? 'Relire depuis le début' : 'Relire le ' + UNIT) : started ? 'Reprendre la lecture' : 'Commencer la lecture';
  byId('ctaSub').textContent = (CHAPS.length > 1 ? chapLabel(chapOfEp(e)) + ' · épisode ' : 'Épisode ') + (ep.i + 1) + ' · ' + ep.title + ' · ' + minutes(spanMs(ep.a, ep.z));
  if (started) {
    const pct = chapterDone() ? 100 : chapPct(k);
    const done = Object.values(S.eps).filter((x) => x && x.done).length;
    byId('resumeBar').style.setProperty('--p', pct + '%');
    byId('resumeLine').textContent = pct + ' % du ' + chapLab(EPS[e].c) + ' · ' + done + (done > 1 ? ' épisodes lus' : ' épisode lu') + ' sur ' + EPS.length;
  }
  // défis de fin de chapitre : étoiles gagnées, ou le défi à faire
  byId('bpDefis').hidden = !QUIZ_N;
  if (QUIZ_N) {
    byId('bpDefiSum').replaceChildren(el('span', 'ico-star gold'), document.createTextNode(totalStars() + ' étoiles sur ' + QUIZ_N * 3));
    byId('bpDefiList').replaceChildren(...CHAPS.map((c, ci) => {
      const q = quizOf(ci);
      if (!q) return null;
      const li = el('li');
      const t = el('span', 'dl-t'); t.append(el('b', '', cap(chapLab(ci))), el('span', '', QUIZ_FMT[q.format]));
      li.append(t);
      const r = quizRec(ci);
      if (r) li.append(starsEl(r.st, 3));
      else if (S.defi === false) li.append(el('span', 'dl-note', 'Désactivé dans les réglages'));
      else if (chapReadPct(ci) >= 80) { const b = el('button', 'chip dl-go', 'Faire le défi'); b.type = 'button'; b.addEventListener('click', () => { unlockAudio(); openQuiz(ci); }); li.append(b); }
      else li.append(el('span', 'dl-note', 'Lis 80 % du ' + UNIT + ' (' + chapReadPct(ci) + ' %)'));
      return li;
    }).filter(Boolean));
  }
  byId('epsLabel').textContent = 'Voir les ' + EPS.length + ' épisodes';
  const list = byId('epList');
  if (!epsOpen69()) { list.dataset.lazy69 = '1'; list.replaceChildren(); return; }
  delete list.dataset.lazy69;
  list.replaceChildren();
  EPS.forEach((x, i) => {
    if (CHAPS.length > 1 && x.i === 0) list.append(el('li', 'eph', chapLabel(chapOfEp(i))));
    const li = document.createElement('li');
    li.dataset.cur = started && i === e ? '1' : '0';
    const b = el('button'); b.type = 'button';
    const du = el('span', 'du');
    if (S.eps[i] && S.eps[i].done) { du.append(el('b', '', 'Lu')); du.append(' · '); }
    du.append(minutes(spanMs(x.a, x.z)));
    b.append(el('span', 'no', String(x.i + 1)), el('span', 'ti', x.title), du);
    b.addEventListener('click', () => { unlockAudio(); startEpisode(i, true); });
    li.append(b); list.append(li);
  });
}

/* ================= Panneaux ================= */
function openSheet(id) {
  closeSheets();
  hideToast();
  if (playing) pause();
  $(id).hidden = false;
  const btn = $(id + ' .panel-head [data-close], ' + id + ' .textbar [data-close]');
  if (btn) requestAnimationFrame(() => { try { btn.focus({ preventScroll: true }); } catch (e) { /* rien */ } });
}
function closeSheets() { if (qz) closeQuiz(); $$('.sheet').forEach((s) => { s.hidden = true; }); }
$$('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
byId('qzClose').addEventListener('click', closeQuiz);
byId('chestD').addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && juronC) { ev.preventDefault(); ev.stopPropagation(); captureJuron(juronC); } });
byId('chest').addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && chestC) { ev.preventDefault(); ev.stopPropagation(); captureCulte(chestC); } });
byId('railBet').addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openBet(BETS.find((x) => x.id === byId('railBet').dataset.bet)); });
byId('railRoul').addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openRoulette(); });
byId('qzBack').addEventListener('click', closeQuiz);

let castBuilt = false;
// tous les personnages du livre (hors figurants) ; ceux qu'on n'a pas encore rencontrés restent un mystère
const ALL_CAST = Object.keys(CAST).filter((id) => !CAST[id].fig);
function buildCast() {
  castBuilt = true;
  ['#castMain', '#castFigs', '#castCited', '#gallery'].forEach((s) => $(s).replaceChildren());
  const met = S.met.filter((id) => ALL_CAST.includes(id));
  const left = ALL_CAST.length - met.length;
  byId('metCount').textContent = 'Personnages débloqués : ' + met.length + ' sur ' + ALL_CAST.length;
  byId('castLab').textContent = 'Tes personnages';
  const main = byId('castMain');
  met.forEach((id) => {
    const c = CAST[id];
    const li = document.createElement('li');
    li.style.setProperty('--spk', colorVar(id));
    li.append(portrait(id));
    const d = document.createElement('div');
    const st = el('strong', '', c.nom);
    if (c.alias) st.append(el('em', '', ' ' + c.alias));
    d.append(st, el('p', '', c.chap || c.cite || ''));
    if (LINES[id]) d.append(el('div', 'count', LINES[id] + (LINES[id] > 1 ? ' répliques' : ' réplique')));
    li.append(d); main.append(li);
  });
  if (left > 0) {
    const li = el('li', 'mystery');
    const q = el('span', 'pf mq', '?');
    q.setAttribute('aria-hidden', 'true');
    const d = document.createElement('div');
    d.append(el('strong', '', 'Mystère'), el('p', '', left + (left > 1 ? ' personnages restent à découvrir au fil de ta lecture.' : ' personnage reste à découvrir au fil de ta lecture.')));
    li.append(q, d); main.append(li);
  }
  // figurants : seulement ceux déjà croisés
  const figs = byId('castFigs');
  const reached = SPEAKERS.filter((id) => (!CAST[id] || CAST[id].fig) && UNITS.some((u) => u.sp === id && u.a <= k));
  figs.parentElement.hidden = !reached.length;
  reached.forEach((id) => {
    const li = document.createElement('li');
    li.append(portrait(id), document.createTextNode((CAST[id] ? CAST[id].nom : id) + ' · ' + LINES[id]));
    figs.append(li);
  });
  // ces deux sections montraient tout le monde : retirées pour garder la surprise
  byId('castCited').parentElement.hidden = true;
  byId('gallery').closest('details').hidden = true;
}
let carnetFilter = 'tous';
const KEEP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a1 1 0 011 1v16l-6-3.6-6 3.6v-16a1 1 0 011-1z"/></svg>';
function buildCarnet() {
  byId('nHearts').textContent = S.hearts.length ? String(S.hearts.length) : '';
  // phrases cultes trouvées (les autres restent une surprise)
  byId('culteBox').hidden = !S.cultes.length;
  byId('culteLab').textContent = 'Phrases cultes · ' + S.cultes.length + ' sur ' + CULTES.length;
  byId('culteList').replaceChildren(...CULTES.filter((c) => S.cultes.includes(c.si)).map((c) => {
    const li = el('li', 'culte-li');
    li.append(el('blockquote', '', sentenceText(c.si)));
    const src = el('div', 'src');
    src.append(el('span', '', 'Phrase culte trouvée · ' + EPS[EPI[c.a]].title));
    const go = el('button', '', 'Lire ici'); go.type = 'button';
    go.addEventListener('click', () => { closeSheets(); k = c.a; S.k = k; persist(); showReader(false); });
    src.append(go); li.append(src);
    return li;
  }));
  // filtres : tous, puis chaque émotion (seulement celles déjà utilisées), puis les passages gardés d'une double-touche
  const count = (t) => S.hearts.filter((h) => (t === 'garde' ? !h.r : h.r === t) && h.s < SENT.length).length;
  const kinds = ['tous'].concat(RX_ORDER.filter((t) => count(t)), count('garde') ? ['garde'] : []);
  if (!kinds.includes(carnetFilter)) carnetFilter = 'tous';
  byId('rxFilter').hidden = kinds.length < 3;
  byId('rxFilter').replaceChildren(...kinds.map((t) => {
    const b = el('button', 'chip rxchip'); b.type = 'button';
    b.setAttribute('aria-pressed', String(t === carnetFilter));
    if (t !== 'tous') { const ic = el('span', 'rx-ic rx-' + (t === 'garde' ? 'keep' : t)); ic.innerHTML = t === 'garde' ? KEEP_SVG : RX[t].svg; b.append(ic); }
    b.append(el('span', '', t === 'tous' ? 'Tous · ' + S.hearts.length : String(count(t))));
    if (t !== 'tous') b.setAttribute('aria-label', (t === 'garde' ? 'Passages gardés' : RX[t].lab) + ' : ' + count(t));
    b.addEventListener('click', () => { carnetFilter = t; buildCarnet(); });
    return b;
  }));
  const list = byId('heartList');
  list.replaceChildren();
  S.hearts.slice().sort((x, y) => x.s - y.s)
    .filter((h) => carnetFilter === 'tous' || (carnetFilter === 'garde' ? !h.r : h.r === carnetFilter))
    .forEach((h) => {
      if (h.s >= SENT.length) return;
      const li = document.createElement('li');
      if (h.r && RX[h.r]) { li.dataset.rx = h.r; const ic = el('span', 'rx-ic rx-' + h.r); ic.innerHTML = RX[h.r].svg; ic.title = RX[h.r].lab; li.append(ic); }
      li.append(el('blockquote', '', sentenceText(h.s)));
      const src = el('div', 'src');
      const ep = EPS[EPI[SENT[h.s]]];
      src.append(el('span', '', ep.title));
      const go = el('button', '', 'Lire ici'); go.type = 'button';
      go.addEventListener('click', () => { closeSheets(); k = SENT[h.s]; S.k = k; persist(); showReader(false); });
      src.append(go);
      li.append(src); list.append(li);
    });
  byId('heartEmpty').hidden = S.hearts.length > 0 || S.cultes.length > 0;
  if (!castBuilt) buildCast();
}
function openCarnetV32(tab) {
  buildCarnet();
  fillMots();
  setTab(tab || 'coeurs');
  openSheet('#carnetSheet');
}
function setTab(t) {
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
}
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

// met en page tout le chapitre (modes Immersif et Texte) ; map[i] = élément du mot i
function buildPageInto(root, map) {
  const frag = document.createDocumentFragment();
  let epn = 0, part = '', loc = 0, slotted = false;
  // mots a..z-1 dans holder ; pas d'espace avant une virgule ou un point isolés
  const tpl = document.createElement('template');
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = (holder, a, z, space) => {
    if (z <= a) return space;
    let h = '';
    for (let i = a; i < z; i++) {
      if (space && !(T[i].hide && /^[,.)…]/.test(T[i].t))) h += ' ';
      h += '<span data-t="' + i + '">' + esc(T[i].t) + '</span>';
      space = true;
    }
    tpl.innerHTML = h;
    if (map) { const c = tpl.content.children; for (let q = 0; q < c.length; q++) map[a + q] = c[q]; }
    holder.append(tpl.content);
    return space;
  };
  BLOCKS.forEach((bl, bi) => {
    if (bl.t === 'part') { part = bl.text; return; }
    if (bl.t === 'chap') { if (epn > 0 && !slotted) { frag.append(endSlotEl(epn - 1)); slotted = true; } loc = 0; frag.append(el('p', 'tchap', (part ? part + ' · ' : '') + bl.text)); return; }
    if (bl.t === 'ep') {
      if (epn > 0 && !slotted) frag.append(endSlotEl(epn - 1));
      slotted = false; epn++; loc++;
      frag.append(el('p', 'tep', 'Épisode ' + loc + ' · ' + bl.title));
      return;
    }
    if (bl.t === 'break') { frag.append(el('p', 'tbrk', '***')); return; }
    (SEGS.get(bi) || []).forEach((sg) => {
      if (sg.kind === 'n') {
        const p = document.createElement('p');
        let sp = false;
        sg.parts.forEach((pt) => { sp = words(p, pt.a, pt.z, sp); });
        frag.append(p);
        return;
      }
      // réplique : photo et nom de celui qui parle, puis le texte, entre ses guillemets ou après son tiret
      const p = el('p', 'dlg' + (sg.th ? ' th' : '') + (sg.v ? ' v-' + sg.v : ''));
      p.style.setProperty('--spk', colorVar(sg.sp));
      p.append(portrait(sg.sp, 'dpf'));
      const nm = el('span', 'dname', shortName(sg.sp, epn - 1));
      if (sg.th) nm.append(el('i', '', ' · pense'));
      else if (sg.v === 'bas') nm.append(el('i', '', ' · à voix basse'));
      p.append(nm);
      const tx = el('span', 'dtx');
      let sp = false;
      if (sg.open) { tx.append(el('span', 'dq', sg.open)); sp = true; }
      sg.parts.forEach((pt) => {
        const h = el('span', pt.k === 's' ? 's' + (pt.th ? ' th' : '') : 'i');
        if (sp) tx.append(' ');
        tx.append(h);
        words(h, pt.a, pt.z, false);
        sp = true;
      });
      if (sg.close) tx.append(' ', el('span', 'dq', sg.close));
      sg.tail.forEach((i) => words(tx, i, i + 1, true));
      if (sg.att) { const at = el('span', 'att'); tx.append(' ', at); words(at, sg.att[0], sg.att[1], false); }
      p.append(tx);
      frag.append(p);
    });
  });
  if (epn > 0) frag.append(endSlotEl(epn - 1));
  root.append(frag);
}
function endSlotEl(e) {
  const s = el('div', 'epend');
  s.dataset.e = String(e);
  s.append(el('div', 'ee-in'));
  return s;
}

/* ================= Réglages ================= */
function applyTheme() {
  if (S.theme) document.documentElement.setAttribute('data-theme', S.theme);
  else document.documentElement.removeAttribute('data-theme');
}
function syncSettings() {
  byId('wpm').value = S.wpm; byId('wpmOut').textContent = S.wpm; byId('wpmVal').textContent = S.wpm;
  const dock = byId('wpmDock');
  dock.value = S.wpm;
  dock.style.setProperty('--f', String((S.wpm - Number(dock.min)) / (Number(dock.max) - Number(dock.min))));
  dock.setAttribute('aria-valuetext', S.wpm + ' mots par minute');
  // le surlignage glisse plus vite quand la lecture s'accélère (0,3 s jusqu'à 300 mots/min)
  sv73(stage, '--hlt', Math.round(Math.min(300, 90000 / S.wpm)) + 'ms');
  sv73(stage, '--hlf', Math.round(Math.max(120, Math.min(340, 102000 / S.wpm))) + 'ms');
  sv73(stage, '--hlw', Math.round(Math.max(110, Math.min(300, 78000 / S.wpm))) + 'ms');
  byId('size').value = S.size; byId('sizeOut').textContent = S.size;
  byId('awake').checked = !!S.awake;
  byId('optAuto').checked = !!S.auto;
  byId('optSound').checked = !!S.sound; byId('optVibe').checked = !!S.vibe;
  byId('optZen').checked = !!S.zen; byId('optAmb').checked = !!S.amb; byId('optFlow').checked = S.flow !== false; byId('optDefi').checked = S.defi !== false;
  $$('button[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $$('[data-cue]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.cue) === S.cue)));
  $$('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === S.theme)));
  $$('button[data-read]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.read === S.read)));
  stage.dataset.mode = S.mode;
  stage.dataset.read = S.read;
  readerEl.dataset.read = S.read;
  syncVoice();
}
const READ_LABEL = { page: 'Mode Immersif', rsvp: 'Mode Rapide', texte: 'Mode Texte : lecture à ton rythme' };
const HINT = {
  page: 'Touche l’écran pour lire ou faire une pause · touche deux fois un mot pour reprendre là · maintiens le doigt sur un mot pour sa définition',
  rsvp: 'Touche l’écran pour lire ou faire une pause · glisse sur le côté pour changer de phrase',
  texte: 'Fais défiler le texte à ton rythme · touche un mot pour y reprendre · maintiens-le pour sa définition'
};
function updateHint() { byId('hint').textContent = HINT[S.read]; }
function setRead(m) {
  if (S.read === m) return;
  if (m === 'texte' && playing) pause();
  if (m === 'texte' && S.voice) { S.voice = false; vStop(); toast('En mode Texte, tu lis à ton rythme : la voix est coupée'); }
  byId('epCard').hidden = true;
  S.read = m; persist(); syncSettings(); updateHint();
  requestAnimationFrame(() => { placeRx(); positionMarks(); });
  txStart();
  if (!byId('reader').hidden) {
    clearTimeout(timer);
    stopPageGlide();
    ftagId = null;
    if (m === 'page') k = CH[CHOF[k]].a;
    requestAnimationFrame(() => {
      if (m !== 'rsvp' && pvBuilt) sizePage();
      render(k); progress();
      if (m === 'page') { pageview.scrollTop = pvTarget; stopPageGlide(); }
    });
    if (playing) timer = setTimeout(step, 400);
  }
  toast(READ_LABEL[m]);
}
function rerender() { if (!byId('reader').hidden) { render(k); progress(); } }
function setMode(m) {
  S.mode = m; persist();
  for (const s of SEATS) occ[s] = undefined;
  ftagId = null;
  syncSettings(); rerender();
}
function setWpm(v) {
  S.wpm = Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(v / 10) * 10));
  if (S.voice && S.wpm > VOICE_MAX) voiceOff('Au-delà de ' + VOICE_MAX + ' mots/min, la voix se coupe : lecture silencieuse');
  persist(); syncSettings();
  if (!byId('reader').hidden) progress();
}
$$('button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$$('button[data-read]').forEach((b) => b.addEventListener('click', () => setRead(b.dataset.read)));
$$('[data-cue]').forEach((b) => b.addEventListener('click', () => { S.cue = Number(b.dataset.cue); persist(); syncSettings(); rerender(); }));
$$('[data-theme-choice]').forEach((b) => b.addEventListener('click', () => { S.theme = b.dataset.themeChoice; persist(); applyTheme(); syncSettings(); }));
byId('wpm').addEventListener('input', (e) => setWpm(Number(e.target.value)));
// barre de vitesse du lecteur : on la fait glisser du doigt, même pendant la lecture
{
  const bar = byId('speedBar'), input = byId('wpmDock');
  input.addEventListener('input', () => setWpm(Number(input.value)));
  input.addEventListener('pointerdown', () => bar.classList.add('drag'));
  ['pointerup', 'pointercancel', 'blur'].forEach((ev) => input.addEventListener(ev, () => bar.classList.remove('drag')));
}
let size68 = 0;
byId('size').addEventListener('input', (e) => {
  S.size = Number(e.target.value);
  if (size68) return;
  size68 = requestAnimationFrame(() => { size68 = 0; persist(); syncSettings(); if (pvBuilt) sizePage(); rerender(); });
});
byId('awake').addEventListener('change', (e) => { S.awake = e.target.checked; persist(); });
byId('optZen').addEventListener('change', (e) => { S.zen = e.target.checked; persist(); if (!S.zen) zenOff(); });
byId('optDefi').addEventListener('change', (e) => { S.defi = e.target.checked; persist(); });
byId('optFlow').addEventListener('change', (e) => { S.flow = e.target.checked; persist(); if (!S.flow) flowOff(); else flowLater(); });
byId('optAmb').addEventListener('change', (e) => { S.amb = e.target.checked; persist(); if (!S.amb) stopAmb(); if (!byId('reader').hidden) progress(); });
byId('optAuto').addEventListener('change', (e) => { S.auto = e.target.checked; persist(); });
byId('optSound').addEventListener('change', (e) => { S.sound = e.target.checked; persist(); if (S.sound) { unlockAudio(); SFX.coin(); } });
byId('optVibe').addEventListener('change', (e) => { S.vibe = e.target.checked; persist(); buzz(20); });
byId('toStart').addEventListener('click', () => { closeSheets(); startEpisode(chapOfEp(EPI[k]).eps[0], false); });
let resetArm = 0;
byId('resetBtn').addEventListener('click', () => {
  const b = byId('resetBtn');
  if (!resetArm) {
    b.textContent = 'Confirmer : tout effacer';
    resetArm = setTimeout(() => { resetArm = 0; b.textContent = 'Remettre ma progression à zéro'; }, 4000);
    return;
  }
  clearTimeout(resetArm); resetArm = 0;
  b.textContent = 'Remettre ma progression à zéro';
  Object.assign(S, { k: 0, pts: 0, words: 0, readMs: 0, day: { d: '', pts: 0, done: false }, unl: [], lvlSeen: 0,
    eps: {}, hearts: [], streak: { last: '', n: 0, best: 0 }, started: false, lib: {}, cultes: [], met: [], marks: [] });
  castBuilt = false;
  epRead.fill(0); epPaused.fill(false); seen.fill(0);
  k = 0; persist(); updatePts(false); rerender(); applyMarks();
  closeSheets();
  toast('Progression remise à zéro');
});

/* ================= Commandes ================= */
byId('cta').addEventListener('click', () => { unlockAudio(); startEpisode(resumeEp(), true); });
byId('toCover').addEventListener('click', showCover);
byId('toHome').addEventListener('click', () => showHome());
byId('heroOpen').addEventListener('click', showCover);
byId('heroPlay').addEventListener('click', () => { unlockAudio(); startEpisode(resumeEp(), true); });
byId('goalTile').addEventListener('click', () => setView('progres'));
byId('levelTile').addEventListener('click', () => setView('progres'));
byId('homePts').addEventListener('click', () => setView('progres'));
$$('[data-tabv]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.tabv)));
$$('[data-goview]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.goview)));
$$('[data-filter]').forEach((b) => b.addEventListener('click', () => { libFilter = b.dataset.filter; renderLibrary(); }));
$$('[data-goal]').forEach((b) => b.addEventListener('click', () => {
  S.goal = Number(b.dataset.goal);
  const d = dayRec();
  d.done = d.pts >= S.goal;
  persist(); refreshHome();
}));
byId('playBtn').addEventListener('click', () => { unlockAudio(); toggle(); });
byId('openSettings').addEventListener('click', () => { syncSettings(); openSheet('#settingsSheet'); });
byId('toStart').textContent = 'Revenir au début du ' + UNIT;
byId('toCoverLab').textContent = BOOK.titre;
byId('toCover').setAttribute('aria-label', 'Revenir à la page du livre ' + BOOK.titre);
byId('openCarnet').addEventListener('click', () => openCarnet());
byId('purse').addEventListener('click', () => {
  const li = levelInfo(S.pts), nx = LEVELS[li.lv + 1];
  toast('Niveau ' + (li.lv + 1) + ' · ' + LEVELS[li.lv].t + (nx ? ' · encore ' + fmtPts(li.need) + ' pour le suivant' : ''));
});

/* Toucher l'écran : pause tout de suite, et toucher encore pour reprendre (dans les deux modes).
   Pendant la lecture, quand les commandes sont masquées, tout l'écran sert à faire pause.
   Double-touche : garde le passage (les deux touchers s'annulent, la lecture reste dans son état).
   Mode Page : appui long sur un mot pour lire à partir de lui. Glisser sur le côté : phrase suivante ou précédente. */
let p0 = null, tapT = 0, tapPaused = false, pressT = 0, pressed = false, tapDid = '';
// mode Immersif, à l'arrêt : le groupe touché s'allume et la lecture reprendra là ; la page ne bouge pas sous le doigt
let tapWait = 0;
// la reprise vient d'être placée : le groupe touché clignote doucement, et un petit message le confirme
function cursorMark() {
  pvLit.forEach((s) => { s.classList.remove('cur-pick'); void s.offsetWidth; s.classList.add('cur-pick'); });
  toast('Reprise placée ici · touche lecture');
}
function placeCursor(j) {
  k = CH[CHOF[j]].a; S.k = k; persist();
  pvUserScroll = true; stopPageGlide();
  render(k); progress();
  buzz(8);
}
function tapZone(t) {
  if (!t || !t.closest) return false;
  if (t.closest('button, input, label, output, a, .speed, .sheet, .rx, .dict, .betc, .roulc, .chest, .slot, .gamec')) return false;
  if (t.closest('#stage')) return true;
  return readerEl.dataset.zen === '1';
}
readerEl.addEventListener('pointerdown', (e) => {
  clearTimeout(pressT);
  pressed = false;
  if (rxOpen && !(e.target.closest && e.target.closest('.rx'))) { closeRx(true); p0 = null; return; }
  if (dictW && !(e.target.closest && e.target.closest('.dict'))) { closeDict(true); p0 = null; return; }
  if (gameOpen && !(e.target.closest && e.target.closest('.gamec'))) { closeGame(gameDone); p0 = null; return; }   // toucher ailleurs : on passe (la pastille reste)
  if (roulOpen && !(e.target.closest && e.target.closest('.roulc'))) { if (roulSpun) closeRoulette(true); p0 = null; return; }   // la machine tourne : elle va s'arrêter
  if (playing && readerEl.dataset.flow !== '1') flowLater();
  const hot = e.target.closest ? e.target.closest('#pvIn [data-t].culte-hot, #pvIn [data-t].juron-hot') : null;
  if (hot && hot.classList.contains('juron-hot') && juronC) dragStart(e, 'juron', juronC);
  else if (hot && chestC) dragStart(e, 'culte', chestC);
  if ((e.pointerType === 'mouse' && e.button !== 0) || !tapZone(e.target)) { p0 = null; return; }
  p0 = { x: e.clientX, y: e.clientY };
  // doigt maintenu sur une phrase : on l'aime (la lecture continue)
  const w = (S.read === 'page' || S.read === 'texte') && byId('count321').hidden ? e.target.closest('#pvIn [data-t]') : null;
  if (w && !drag) {
    pressT = setTimeout(() => {
      pressed = true;
      openDict(w);
    }, 480);
  }
});
readerEl.addEventListener('pointermove', (e) => {
  if (dragMove(e)) { if (p0) p0.drag = true; return; }
  if (p0 && Math.abs(e.clientX - p0.x) + Math.abs(e.clientY - p0.y) > 12) clearTimeout(pressT);
});
readerEl.addEventListener('pointerup', (e) => {
  clearTimeout(pressT);
  if (dragEnd(e)) { p0 = null; pressed = false; return; }
  drag = null;
  if (!p0) return;
  const dx = e.clientX - p0.x, dy = e.clientY - p0.y;
  p0 = null;
  if (pressed) { pressed = false; return; }
  if (readerEl.dataset.flow === '1') { flowOff(); flowLater(); return; }   // mode flux : le premier toucher fait revenir l'interface
  if (S.read === 'texte') {
    if (betOpen) { betSkip(); return; }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const now = Date.now();
    if (now - tapT < 320) { tapT = 0; return; }
    tapT = now;
    const w = e.target.closest && e.target.closest('#pvIn [data-t]');
    if (w) markResume(VOF[Number(w.dataset.t)]);
    return;
  }
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) nextSentence(); else prevSentence(); return; }
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
  unlockAudio();
  if (!byId('count321').hidden) { cancelCountdown321(); play(); return; }
  if (betOpen) { betSkip(); return; }
  if (skipHold()) return;
  const now = Date.now();
  if (now - tapT < 320) {
    // deux touchers rapprochés sur un mot (Immersif) : la reprise se place sur ce mot, la lecture reste à l'arrêt ;
    // on appuie ensuite sur lecture. Ailleurs, le second toucher annule le premier.
    tapT = 0;
    clearTimeout(tapWait);
    const e0 = EPI[k];
    const w = S.read === 'page' && e.target.closest ? e.target.closest('#pvIn [data-t]') : null;
    if (w) {
      if (playing) halt();
      epPaused[e0] = tapPaused;   // choisir où reprendre ne compte pas comme une pause
      placeCursor(VOF[Number(w.dataset.t)]);
      cursorMark();
      tapDid = '';
      return;
    }
    if (tapDid === 'toggle') { toggle(); epPaused[e0] = tapPaused; }
    tapDid = '';
    return;
  }
  tapT = now;
  tapPaused = epPaused[EPI[k]];
  // à l'arrêt en Immersif : on attend un tiers de seconde, au cas où un second toucher viendrait placer la reprise
  if (!playing && S.read === 'page') {
    tapDid = 'wait';
    clearTimeout(tapWait);
    tapWait = setTimeout(() => { if (tapDid === 'wait') { tapDid = ''; tapT = 0; if (!playing) play(); } }, 330);
    return;
  }
  tapDid = 'toggle';
  toggle();
});
readerEl.addEventListener('pointercancel', (e) => { p0 = null; clearTimeout(pressT); if (drag) { dragEnd({ clientX: -9999, clientY: -9999 }); } });
pageview.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); toggle(); } });

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (readerEl.dataset.flow === '1') { flowOff(); flowLater(); }
  const open = $$('.sheet').find((s) => !s.hidden);
  if (e.key === 'Escape') {
    if (dictW) { closeDict(true); e.preventDefault(); }
    else if (rxOpen) { closeRx(true); e.preventDefault(); }
    else if (open) { closeSheets(); e.preventDefault(); }
    else if (playing) pause();
    return;
  }
  if (qz || open || byId('reader').hidden) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea')) return;
  if (t && t.closest && t.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  let done = true;
  switch (e.key) {
    case ' ': unlockAudio(); toggle(); break;
    case 'ArrowLeft': if (e.shiftKey) seek(k - 1); else prevSentence(); break;
    case 'ArrowRight': if (e.shiftKey) seek(k + 1); else nextSentence(); break;
    case 'ArrowUp': setWpm(S.wpm + 10); break;
    case 'ArrowDown': setWpm(S.wpm - 10); break;
    case 't': case 'T': setRead('texte'); break;
    case 'c': case 'C': openCarnet('coeurs'); break;
    case 'm': case 'M': { const o = ['page', 'rsvp', 'texte']; setRead(o[(o.indexOf(S.read) + 1) % o.length]); break; }
    default: done = false;
  }
  if (done) e.preventDefault();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

/* ================= Mise en page ================= */
function layout() {
  const r = stage.getBoundingClientRect();
  if (!r.width) return;
  const land = r.width >= 620 && r.width / Math.max(1, r.height) > 1.15;
  stage.dataset.layout = land ? 'landscape' : 'portrait';
}
let rafId = 0;
const ro = new ResizeObserver(() => {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    layout(); if (pvBuilt) sizePage();
    // en mode Texte, on ne déplace pas la page : on recale seulement le surlignage
    if (!byId('reader').hidden) { if (S.read === 'texte') placeHighlight(); else render(k); }
    positionMarks();
  });
});
ro.observe(stage);

/* ================= Version 33 =================
   Écouter (la voix du téléphone lit le texte), pastilles à droite près des coffres, un temps d'arrêt d'une seconde
   quand quelque chose apparaît, marque-pages, Carnet refait, phrases cultes qui s'allument au fil de la lecture,
   trois nouveaux jeux (le mot qui a changé de sens, le curseur, « Ça existait en 1885 ? »). */

// --- un temps d'arrêt : une pastille ou un coffre apparaît, on laisse une seconde pour le toucher ---
let beatMs = 0;
function beat(ms) { if (playing && !speedHack && S.read !== 'texte') beatMs = Math.max(beatMs, ms || 1000); }

/* ================= Écouter : la voix du téléphone =================
   La synthèse vocale du navigateur (gratuite, hors ligne avec les voix installées). La voix lit un segment à la fois :
   une phrase, ou un morceau de phrase quand la voix change (récit, réplique) ou quand la phrase est très longue.
   Les repères de mots du navigateur font avancer le surlignement ; sans repères, il avance à l'estimation.
   Au-delà de VOICE_MAX mots/min, la voix se coupe et la lecture redevient silencieuse. */
const VOICE_OK = (() => { try { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; } catch (e) { return false; } })();
const VOICE_MAX = 360, VOICE_BASE = 180;
const synth = VOICE_OK ? window.speechSynthesis : null;
let vGen = 0, vFallT = 0, vWatchT = 0, vCur = -1, vVoices = [], vUnlocked = false;
const vClamp = (x, a, b) => Math.min(b, Math.max(a, x));
function voiceOn() { return !!S.voice && VOICE_OK && S.read !== 'texte'; }
function vRate() { return vClamp(S.wpm / VOICE_BASE, .5, 2); }
function vLoadVoices() {
  try { vVoices = synth.getVoices().filter((v) => /^fr([-_]|$)/i.test(v.lang || '')); } catch (e) { vVoices = []; }
  fillVoiceSel();
}
const V_FEM = /am[ée]lie|audrey|aur[ée]lie|marie|julie|hortense|denise|c[ée]line|\bl[ée]a\b|virginie|sylvie|caroline|[ée]lo[iï]se|jos[ée]phine|vivienne|brigitte|charline|coralie|jacqueline|yvette|ariane|elsa|chantal|juliette|manon|clara|louise|alice|estelle|c[ée]leste|female|femme|google fran/i;
const V_MASC = /thomas|\bpaul\b|henri|nicolas|daniel|claude|\bjean\b|r[ée]m[iy]|antoine|mathieu|guillaume|fabrice|alain|j[ée]r[ôo]me|g[ée]rard|eddy|grandpa|reed|rocko|\bmale\b|homme|alexandre|maxime|\byves\b|julien|lucien|fran[çc]ois|\bluc\b|olivier/i;
function vScore(v) {
  let s = 0;
  if (/natural|neural|premium|enhanced|am[ée]lior|siri|online/i.test(v.name)) s += 3;
  if (/google/i.test(v.name)) s += 2;
  if (/^fr[-_]fr/i.test(v.lang)) s += 1;
  return s;
}
const vGender = (v) => (V_FEM.test(v.name) ? 'f' : V_MASC.test(v.name) ? 'm' : '');
function vNarr() {
  const pref = S.voiceName && vVoices.find((v) => v.name === S.voiceName);
  if (pref) return pref;
  return vVoices.slice().sort((a, b) => vScore(b) - vScore(a))[0] || null;
}
// genre du personnage (fiche du livre : « genre » f, m ou e pour un enfant)
const vSex = (sp) => (CAST[sp] && CAST[sp].genre) || 'm';
function vFor(sp) {
  const narr = vNarr();
  if (!sp || S.vcast === false) return narr;
  const want = vSex(sp) === 'm' ? 'm' : 'f';
  if (narr && vGender(narr) === want) return narr;
  return vVoices.filter((v) => vGender(v) === want).sort((a, b) => vScore(b) - vScore(a))[0] || narr;
}
// chaque personnage a sa hauteur de voix : plus grave ou plus aiguë selon la voix trouvée, un peu différente d'un personnage à l'autre
function vPitch(sp, voice) {
  if (S.vcast === false) return 1;
  let h = 0;
  for (const c of sp) h = (h * 31 + c.charCodeAt(0)) % 997;
  let p = 1 + ((h % 9) - 4) * .018;
  const sex = vSex(sp), vg = voice ? vGender(voice) : '';
  if (sex === 'e') p += .32;
  else if (sex === 'f' && vg !== 'f') p += .18;
  else if (sex === 'm' && vg === 'f') p -= .2;
  return vClamp(p, .5, 2);
}
const vZone = (j) => { const tk = T[V[j]]; return tk.k === 's' ? 's' + tk.u : 'n'; };
const vZone2 = (j) => { if (S.vcast !== false) return vZone(j); const tk = T[V[j]]; return tk.k === 's' && tk.v === 'bas' ? 'bas' : 'n'; };
// fin du segment qui commence au mot j : fin de phrase, changement de voix ou d'épisode ; les très longues phrases sont coupées à une ponctuation
function vSegEnd(j) {
  const si = sentenceAt(j);
  const sEnd = si + 1 < SENT.length ? SENT[si + 1] - 1 : N - 1;
  const z0 = vZone2(j);
  let z = j;
  while (z < sEnd && vZone2(z + 1) === z0 && EPI[z + 1] === EPI[j]) z++;
  if (z - j > 34) {
    let c = -1;
    for (let i = j + 14; i < z && i < j + 34; i++) if (/[,;:]$/.test(T[V[i]].t.replace(/[\s»)\]]+$/u, ''))) c = i;
    if (c < 0) c = CH[CHOF[j + 28]].z;
    z = Math.min(z, c);
  }
  return z;
}
// le texte à dire (sans guillemets ni tirets) et la position du début de chaque mot
function vText(a, z) {
  let s = '';
  const at = [];
  for (let j = a; j <= z; j++) {
    const t = T[V[j]].t.replace(/[«»“”"—–]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s && t) s += ' ';
    at.push(s.length);
    s += t;
  }
  return { s, at };
}
const vEstMs = (a, z) => { let c = 0; for (let j = a; j <= z; j++) c += T[V[j]].t.length + 1; return c / (14.5 * vRate()) * 1000; };
function vStop() {
  vGen++;
  clearTimeout(vFallT); clearTimeout(vWatchT);
  vCur = -1;
  if (VOICE_OK) { try { synth.cancel(); } catch (e) { /* ignoré */ } }
}
// iPhone : la voix doit être lancée une première fois par un geste (un toucher) ; une phrase vide suffit
function vUnlock() {
  if (vUnlocked || !VOICE_OK || !S.voice) return;
  vUnlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'fr-FR'; synth.speak(u); } catch (e) { /* ignoré */ }
}
// le groupe de mots (Immersif) ou le mot (Rapide) que dit la voix s'allume ; ses mots comptent
function vShow(j) {
  if (S.read === 'page') {
    const ch = CH[CHOF[j]];
    if (vCur === ch.a) return;
    vCur = ch.a;
    k = ch.a;
    sweepNext = !speedHack;
    render(k); progress();
    for (let i = ch.a; i <= ch.z; i++) countWord(i);
    setSuspense(ch.a);
    runSweep(Math.max(200, vEstMs(ch.a, ch.z) * .95), 0);
  } else {
    if (vCur === j) return;
    vCur = j;
    k = j;
    render(k); progress();
    countWord(k);
    setSuspense(k);
  }
}
function vStep() {
  if (!playing) return;
  vStop();
  const gen = vGen;
  const a = k, z = vSegEnd(k);
  vShow(a);
  let wait = 0, hold = 0;
  if (meetHold) { hold = speedHack ? 0 : 3000; meetHold = null; }
  wait += hold;
  if (beatMs) { wait += beatMs; beatMs = 0; }
  if (lead) { wait += speedHack ? 0 : 300; lead = false; }
  const go = () => { if (gen === vGen && playing) vSpeak(a, z, gen); };
  if (wait) later(go, wait, hold); else go();
}
function vSpeak(a, z, gen) {
  const { s, at } = vText(a, z);
  if (!s) { vNext(z, gen); return; }
  const tk = T[V[a]];
  const sp = tk.k === 's' ? tk.sp : null;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = 'fr-FR';
  const voice = vFor(sp);
  if (voice) u.voice = voice;
  let rate = vRate(), pitch = sp ? vPitch(sp, voice) : 1, vol = 1;
  if (sp && tk.v === 'bas') { vol = .55; rate *= .92; }
  else if (sp && tk.v === 'fort' && S.vcast !== false) { pitch += .06; rate *= 1.04; }
  if (sp && tk.th && S.vcast !== false) rate *= .94;
  u.rate = vClamp(rate, .5, 2); u.pitch = vClamp(pitch, .5, 2); u.volume = vol;
  let t0 = performance.now(), gotB = false, started = false;
  const est = vEstMs(a, z);
  const wordAt = (ci) => { let i = at.length - 1; while (i > 0 && at[i] > ci) i--; return a + i; };
  u.onboundary = (ev) => {
    if (gen !== vGen || !playing) return;
    if (ev.name && ev.name !== 'word') return;
    gotB = true;
    vShow(wordAt(ev.charIndex | 0));
  };
  // sans repères de mots : la tête avance à l'estimation, jusqu'à la fin dite par la voix
  const fall = () => {
    if (gen !== vGen || !playing) return;
    if (!gotB) vShow(wordAt(Math.min(.97, (performance.now() - t0) / est) * s.length));
    vFallT = setTimeout(fall, 110);
  };
  u.onstart = () => {
    if (gen !== vGen) return;
    started = true; t0 = performance.now();
    clearTimeout(vWatchT); clearTimeout(vFallT);
    vFallT = setTimeout(fall, 110);
  };
  u.onend = () => { if (gen !== vGen) return; clearTimeout(vFallT); clearTimeout(vWatchT); vNext(z, gen); };
  u.onerror = (ev) => {
    if (gen !== vGen) return;
    clearTimeout(vFallT); clearTimeout(vWatchT);
    if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return;
    voiceOff('La voix ne répond pas sur cet appareil : lecture silencieuse.');
  };
  try { synth.speak(u); } catch (e) { voiceOff('La voix n’est pas disponible : lecture silencieuse.'); return; }
  // si la voix ne démarre pas (aucune voix, navigateur bloqué), on repasse en lecture silencieuse
  vWatchT = setTimeout(() => { if (gen === vGen && playing && !started) voiceOff('La voix ne démarre pas sur cet appareil : lecture silencieuse.'); }, speedHack ? 600000 : 5000);
}
function vNext(z, gen) {
  if (!playing || gen !== vGen) return;
  vShow(z);   // si les repères ont manqué la fin du segment
  const n = z + 1;
  if (z >= N - 1) { k = z; endEpisode(EPI[z], true); return; }
  if (EPI[n] !== EPI[z]) { k = n; S.k = k; endEpisode(EPI[z], false); return; }
  k = n;
  // un court silence entre deux segments, plus long quand la voix change ou que la phrase se termine
  const end = T[V[z]].t.replace(/[\s»)\]]+$/u, '');
  const gap = speedHack ? 0 : (vZone2(n) !== vZone2(z) ? 300 : /[.!?…]$/.test(end) ? 240 : 80) / Math.max(.8, vRate());
  clearTimeout(timer);
  timer = setTimeout(() => { if (playing && gen === vGen) tick(); }, gap);
}
function restartStep(ms) {
  if (!playing) return;
  clearTimeout(timer); vStop();
  if (S.read === 'page') k = CH[CHOF[k]].a;
  timer = setTimeout(step, ms == null ? 250 : ms);
}
function voiceOff(msg) {
  if (!S.voice) return;
  S.voice = false; persist();
  vStop(); syncVoice();
  if (msg) toast(msg);
  restartStep(300);
}
function toggleVoice() {
  if (!VOICE_OK) { toast('La voix n’est pas disponible sur ce navigateur.'); return; }
  if (S.voice) { voiceOff('Lecture silencieuse'); return; }
  S.voice = true;
  if (S.wpm > VOICE_MAX) S.wpm = 240;
  persist(); syncSettings();
  vUnlocked = false; vUnlock();
  if (S.read === 'texte') setRead('page');
  toast(vVoices.length ? 'Écoute : la voix lit le texte (jusqu’à ' + VOICE_MAX + ' mots/min)' : 'Écoute : la voix de ton téléphone lit le texte');
  restartStep(200);
}
function syncVoice() {
  const b = byId('voiceBtn');
  if (b) {
    b.setAttribute('aria-pressed', String(!!S.voice));
    b.setAttribute('aria-label', S.voice ? 'Écoute activée : toucher pour lire en silence' : 'Écouter le texte, lu par la voix du téléphone');
  }
  readerEl.dataset.voice = S.voice ? '1' : '0';
  const note = byId('voiceLim');
  if (note) note.hidden = !S.voice;
  const sel = byId('voiceSel');
  if (sel) sel.value = S.voiceName || '';
  const vc = byId('optVcast');
  if (vc) vc.checked = S.vcast !== false;
}
function fillVoiceSel() {
  const sel = byId('voiceSel');
  if (!sel) return;
  const opts = [el('option', '', 'Automatique (la plus naturelle)')];
  opts[0].value = '';
  vVoices.slice().sort((a, b) => vScore(b) - vScore(a) || a.name.localeCompare(b.name)).forEach((v) => {
    const o = el('option', '', v.name.replace(/\s*\(.*?\)\s*$/, '') + (vGender(v) === 'f' ? ' · femme' : vGender(v) === 'm' ? ' · homme' : '') + (/^fr[-_]fr/i.test(v.lang) ? '' : ' · ' + v.lang));
    o.value = v.name;
    opts.push(o);
  });
  sel.replaceChildren(...opts);
  sel.value = S.voiceName && vVoices.some((v) => v.name === S.voiceName) ? S.voiceName : '';
  const note = byId('voiceCount');
  if (note) note.textContent = !VOICE_OK ? 'non disponible ici' : vVoices.length ? vVoices.length + (vVoices.length > 1 ? ' voix en français' : ' voix en français') : 'voix du téléphone';
}
byId('voiceBtn').addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); toggleVoice(); });
byId('voiceSel').addEventListener('change', (e) => {
  S.voiceName = e.target.value; persist();
  if (S.voice) restartStep(150);
  else if (VOICE_OK) { try { synth.cancel(); const u = new SpeechSynthesisUtterance('Bonjour, je lis Bel-Ami.'); u.lang = 'fr-FR'; const v = vNarr(); if (v) u.voice = v; synth.speak(u); } catch (er) { /* ignoré */ } }
});
byId('optVcast').addEventListener('change', (e) => { S.vcast = e.target.checked; persist(); });
// le premier toucher (lecture, reprise) débloque aussi la voix sur iPhone
{
  const ua = unlockAudio;
  unlockAudio = function () { ua(); vUnlock(); };
}

/* ================= Marque-pages =================
   La lecture reprend toujours là où l'on s'est arrêté. En plus, on pose autant de marque-pages qu'on veut, pour revenir
   vite à un passage ; ils sont rangés dans le Carnet, et une petite marque se pose dans la marge de gauche. */
const BM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10a1 1 0 011 1v16l-6-3.8-6 3.8v-16a1 1 0 011-1z"/></svg>';
const markHere = () => S.marks.find((m) => m.s === sentenceAt(k));
function where(j) {
  const e = EPI[j];
  return chapLabel(chapOfEp(e)) + ' · épisode ' + (EPS[e].i + 1);
}
function toggleMark() {
  const si = sentenceAt(k);
  const i = S.marks.findIndex((m) => m.s === si);
  if (i >= 0) { S.marks.splice(i, 1); toast('Marque-page retiré'); }
  else { S.marks.push({ s: si, at: Date.now() }); toast('Marque-page posé · ' + where(SENT[si])); SFX.soft(); buzz(10); }
  persist(); paintMarks(); paintBm();
  const b = byId('bmBtn'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
}
function paintBm() {
  const b = byId('bmBtn');
  if (!b) return;
  const on = !!markHere();
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Retirer le marque-page de ce passage' : 'Poser un marque-page sur ce passage');
}
function paintMarks() {
  if (!pvBuilt) return;
  const g = leftGut();
  g.querySelectorAll('.bmmark').forEach((m) => m.remove());
  S.marks.forEach((m) => {
    if (m.s >= SENT.length) return;
    const s = PVS[V[SENT[m.s]]];
    if (!s) return;
    const x = el('span', 'bmmark');
    x.dataset.si = String(m.s);
    x.innerHTML = BM_SVG;
    x.style.top = Math.round(lineY(s)) + 'px';
    g.append(x);
  });
}
byId('bmBtn').addEventListener('click', (ev) => { ev.stopPropagation(); toggleMark(); });
{
  const am = applyMarks, pm = positionMarks, pr = progress;
  applyMarks = function () { am(); paintMarks(); };
  positionMarks = function () {
    pm();
    if (lgut && lgut.isConnected) lgut.querySelectorAll('.bmmark').forEach((m) => { const s = PVS[V[SENT[Number(m.dataset.si)]]]; if (s) m.style.top = Math.round(lineY(s)) + 'px'; });
  };
  progress = function () { pr(); paintBm(); };
}

/* ================= Phrases cultes : l'or arrive avec la lecture =================
   Rien n'est doré à l'avance : chaque mot de la phrase s'allume quand la lecture l'atteint, scintille, puis reste doré
   tant que le coffre attend. À la fin de la phrase, la lecture marque une seconde pour laisser le temps de la glisser. */
function culteLight(j) {
  const s = PVS[V[j]];
  if (!s || s.classList.contains('culte-hot')) return;
  const ch = CH[CHOF[j]];
  const d = speedHack ? 0 : Math.round((j - ch.a) * baseMs() * .9);
  s.style.setProperty('--cd', d + 'ms');
  s.style.setProperty('--ci', String(j - chestC.a));
  s.classList.add('culte-hot');
  if (j === chestC.z) beat(1000);
  if (REDUCED || speedHack) return;
  setTimeout(() => {
    if (!s.isConnected || !s.classList.contains('culte-hot')) return;
    const b = pvIn.getBoundingClientRect(), r = s.getBoundingClientRect();
    for (let i = 0; i < 2; i++) {
      const p = el('span', 'cspark');
      p.style.left = (r.left - b.left + Math.random() * r.width) + 'px';
      p.style.top = (r.top - b.top + r.height * (.2 + Math.random() * .5)) + 'px';
      p.style.setProperty('--dx', ((Math.random() - .5) * 18).toFixed(1) + 'px');
      p.style.setProperty('--dl', (i * .12) + 's');
      p.addEventListener('animationend', () => p.remove());
      pvIn.append(p);
    }
  }, d);
}

/* ================= Trois nouveaux jeux =================
   sens : le mot qui a changé de sens (on choisit le sens ancien parmi trois) ;
   curseur : on estime un nombre en glissant un curseur, plus on est près, plus on gagne ;
   existait : « Ça existait en 1885 ? », on glisse chaque carte à gauche (pas encore) ou à droite (déjà là).
   Les trois se partagent tout de suite (WhatsApp, ou le menu de partage du téléphone). */
Object.assign(GAME_ICO, {
  sens: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g3" d="M8 12a9 9 0 0115.5-3.2M24 20a9 9 0 01-15.5 3.2"/><path class="g1" d="M24.6 4.5l.4 5.6-5.6.4zM7.4 27.5L7 21.9l5.6-.4z"/><text x="16" y="20" text-anchor="middle">a</text></svg>',
  curseur: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g3" d="M4 20h24"/><path class="g1" d="M5 23h3v4H5zM14.5 23h3v4h-3zM24 23h3v4h-3z"/><path class="g1" d="M19 6h-6a1 1 0 00-1 1v8l4 4.5 4-4.5V7a1 1 0 00-1-1z"/></svg>',
  existait: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M9 3.5h14v4c0 3.4-4 6.2-4.6 8.5.6 2.3 4.6 5.1 4.6 8.5v4H9v-4c0-3.4 4-6.2 4.6-8.5C13 13.7 9 10.9 9 7.5z"/><path class="g2" d="M12 25.5c1-2 3-3.2 4-3.2s3 1.2 4 3.2z"/></svg>'
});
Object.assign(GAME_LAB, { sens: 'Le mot a changé de sens', curseur: 'À toi d’estimer', existait: 'Ça existait en ' + AN_RECIT + ' ?' });
function gameAria(g) {
  return ({ lieu: 'Mini-jeu : situer ', histoire: 'Mini-jeu : qui était ', etymo: 'Mini-jeu : d’où vient le mot ', sens: 'Mini-jeu : le sens ancien de ', curseur: 'Mini-jeu : estimer ', existait: 'Mini-jeu : ça existait en ' + AN_RECIT + ' ?' })[g.kind] + (g.kind === 'existait' ? '' : g.x.nom);
}
function gameHead(g) {
  const x = g.x;
  const q = g.kind === 'etymo' || g.kind === 'sens' ? '« ' + x.nom + ' »' : g.kind === 'existait' ? 'Ça existait en ' + AN_RECIT + ' ?' : x.q;
  const parts = [el('span', 'mc-lab', GAME_LAB[g.kind]), el('strong', 'gm-q', q)];
  if (g.kind === 'etymo') parts.push(el('span', 'gm-sub', 'D’où vient ce mot, et que veut-il dire ?'));
  if (g.kind === 'sens') parts.push(el('span', 'gm-sub', 'Ce mot a changé de sens. Que voulait-il dire autrefois ?'));
  if (g.kind === 'existait') parts.push(el('span', 'gm-sub', 'Glisse chaque carte : à gauche si ça n’existait pas encore, à droite si c’était déjà là.'));
  return parts;
}
// partager tout de suite : WhatsApp, ou le menu de partage du téléphone (sinon la phrase est copiée)
function gameShareBtns(txt) {
  if (!txt) return [];
  const row = el('div', 'gm-share');
  const wa = el('a', 'btn gm-wa', 'WhatsApp');
  wa.href = 'https://wa.me/?text=' + encodeURIComponent(txt); wa.target = '_blank'; wa.rel = 'noopener';
  wa.addEventListener('click', (ev) => ev.stopPropagation());
  const sh = el('button', 'btn', 'Partager'); sh.type = 'button';
  sh.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const copy = () => { try { navigator.clipboard.writeText(txt).then(() => toast('Copié : colle-le dans ton message'), () => toast('Copie impossible ici')); } catch (er) { toast('Copie impossible ici'); } };
    if (navigator.share) navigator.share({ text: txt }).catch((err) => { if (!err || err.name !== 'AbortError') copy(); });
    else copy();
  });
  row.append(wa, sh);
  return [row];
}
const lowFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const BY = () => BOOK.titre + ' (' + BOOK.auteur + ')';
const GAME_BUILD = {
  sens(body, g) {
    const x = g.x;
    const opts = x.choix.map((t, i) => {
      const b = el('button', 'qz-o gm-o', t); b.type = 'button';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (gameDone) return;
        const ok = x.ok | 0, good = i === ok;
        opts.forEach((o, n) => { o.disabled = true; o.classList.toggle('ok', n === ok); o.classList.toggle('picked', n === i && !good); });
        gameResult(g, good, good ? GAME_PTS : 0);
        gameFeedback(good, good ? 'Bien vu ! +' + GAME_PTS + ' points' : 'Le sens ancien', (good ? '' : x.choix[ok] + '. ') + (x.info || ''),
          'Le savais-tu ? Le mot « ' + x.nom + ' » voulait d’abord dire : ' + lowFirst(x.choix[ok]) + '. Je l’ai découvert en lisant ' + BY() + '. Et toi, tu le savais ?');
      });
      return b;
    });
    body.append(...opts);
  },
  curseur(body, g) {
    const x = g.x;
    const big = x.max >= 1e6;
    const fmt = (v) => (big ? (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' million' + (v >= 2e6 ? 's' : '') + (x.unite === 'habitants' ? ' d’habitants' : '') : fmtInt(v) + ' ' + x.unite);
    const out = el('output', 'cs-val');
    const r = el('input', 'cs-range'); r.type = 'range';
    r.min = String(x.min); r.max = String(x.max); r.step = String(x.pas || 1);
    const mid = Math.round(((x.min + x.max) / 2) / (x.pas || 1)) * (x.pas || 1);
    r.value = String(mid);
    r.setAttribute('aria-label', x.q);
    const scale = el('div', 'cs-scale');
    scale.append(el('span', '', fmt(x.min)), el('span', '', fmt(x.max)));
    const wrap = el('div', 'cs-wrap');
    const track = el('div', 'cs-track'); track.append(r);
    wrap.append(out, track, scale);
    const paint = () => { out.textContent = fmt(Number(r.value)); track.style.setProperty('--f', String((Number(r.value) - x.min) / (x.max - x.min))); };
    paint();
    r.addEventListener('input', paint);
    ['pointerdown', 'click', 'touchstart'].forEach((t) => r.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true }));
    const go = el('button', 'btn primary cs-go', 'Valider'); go.type = 'button';
    go.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (gameDone) return;
      const v = Number(r.value), err = Math.abs(v - x.val) / x.val;
      const pts = Math.max(0, Math.round(30 * (1 - err / .5) / 5) * 5);
      r.disabled = true; go.hidden = true;
      // le bon endroit apparaît sur la règle, en or
      const pin = el('span', 'cs-true'); pin.style.setProperty('--f', String((x.val - x.min) / (x.max - x.min)));
      pin.append(el('b', '', fmt(x.val)));
      track.append(pin);
      const pct = Math.round(err * 100);
      const head = err <= .05 ? 'En plein dans le mille ! +' + pts + ' points' : pts > 0 ? 'Pas loin, à ' + pct + ' % près ! +' + pts + ' points' : 'Raté, c’était ' + fmt(x.val);
      gameResult(g, pts > 0, pts);
      gameFeedback(pts > 0, head, (pts > 0 ? 'La bonne réponse : ' + fmt(x.val) + '. ' : '') + (x.info || ''),
        'Défi tiré de ' + BY() + ' : ' + x.q + ' J’ai répondu ' + fmt(v) + (err <= .05 ? ', en plein dans le mille !' : ', à ' + pct + ' % de la bonne réponse.') + ' Et toi, tu dirais combien ?');
    });
    body.append(wrap, go);
  },
  existait(body, g) {
    const x = g.x;
    const cards = x.cartes.slice();
    const res = [];
    const deck = el('div', 'ex-deck');
    const hint = el('div', 'ex-hint');
    hint.append(el('span', 'ex-l', '‹ Pas encore'), el('span', 'ex-r', 'Déjà là ›'));
    const btns = el('div', 'ex-btns');
    const bNo = el('button', 'btn ex-no', 'Pas encore'); bNo.type = 'button';
    const bYes = el('button', 'btn ex-yes', 'Déjà là'); bYes.type = 'button';
    btns.append(bNo, bYes);
    const tally = el('div', 'ex-tally');
    let i = 0, busy = false;
    const paint = () => {
      deck.replaceChildren();
      for (let n = Math.min(cards.length - 1, i + 2); n >= i; n--) {
        const c = el('div', 'ex-card' + (n === i ? ' top' : ''));
        c.style.setProperty('--n', String(n - i));
        c.append(el('strong', '', cards[n].t), el('span', 'ex-c-h', 'Glisse à gauche ou à droite'));
        if (n === i) bind(c);
        deck.append(c);
      }
    };
    const decide = (yes, c) => {
      if (busy || i >= cards.length) return;
      busy = true;
      const cd = cards[i], good = yes === cd.oui;
      res.push(good);
      if (good) { SFX.soft(); buzz(8); } else buzz([6, 30, 6]);
      c.style.transition = 'transform .35s ease, opacity .35s ease';
      c.style.transform = 'translateX(' + (yes ? 140 : -140) + '%) rotate(' + (yes ? 18 : -18) + 'deg)';
      c.style.opacity = '0';
      const chip = el('span', 'ex-chip' + (good ? ' good' : ''));
      chip.innerHTML = good ? ICO_OK : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
      chip.append(el('b', '', cd.t), el('span', '', cd.an <= AN_RECIT ? 'déjà là en ' + cd.an : 'en ' + cd.an));
      tally.append(chip);
      setTimeout(() => {
        i++; busy = false;
        if (i < cards.length) { paint(); return; }
        deck.remove(); hint.remove(); btns.remove();
        const n = res.filter(Boolean).length;
        const pts = n * 5;
        gameResult(g, n >= 3, pts);
        gameFeedback(n >= 3, n + ' sur ' + cards.length + (pts ? ' · +' + pts + ' points' : ''), x.info || '',
          'Quiz « Ça existait en ' + AN_RECIT + ' ? », ' + (BOOK.anneeRecit && BOOK.anneeRecit !== BOOK.annee ? 'l’année où commence ' + BOOK.titre + ' (' + AUTEUR_NOM + ')' : 'quand ' + AUTEUR_NOM + ' écrivait ' + BOOK.titre) + ' : ' + cards.map((c2) => lowFirst(c2.t)).join(', ') + '. J’ai eu ' + n + ' sur ' + cards.length + '. À toi !');
      }, speedHack ? 0 : 380);
    };
    function bind(c) {
      let x0 = null, dx = 0, pid = null;
      c.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (busy) return; x0 = ev.clientX; dx = 0; pid = ev.pointerId; try { c.setPointerCapture(pid); } catch (er) { /* ignoré */ } c.style.transition = 'none'; });
      c.addEventListener('pointermove', (ev) => {
        if (x0 === null) return;
        dx = ev.clientX - x0;
        c.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18).toFixed(1) + 'deg)';
        deck.dataset.lean = dx > 30 ? 'r' : dx < -30 ? 'l' : '';
      });
      const up = (ev) => {
        if (x0 === null) return;
        ev.stopPropagation();
        x0 = null; deck.dataset.lean = '';
        if (Math.abs(dx) > 70) decide(dx > 0, c);
        else { c.style.transition = 'transform .3s cubic-bezier(.3, 1.5, .5, 1)'; c.style.transform = ''; }
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
    }
    bNo.addEventListener('click', (ev) => { ev.stopPropagation(); const c = $('.ex-card.top', deck); if (c) decide(false, c); });
    bYes.addEventListener('click', (ev) => { ev.stopPropagation(); const c = $('.ex-card.top', deck); if (c) decide(true, c); });
    paint();
    body.append(deck, hint, btns, tally);
  }
};

/* ================= Le Carnet =================
   Au centre de l'écran, un menu simple et visuel : marque-pages (d'abord), phrases cultes et gros mots (avec leurs coffres),
   citations, personnages, lieux, mots, statistiques. Chaque case ouvre sa liste ; la flèche revient au menu. */
const CN = [
  { id: 'marques', t: 'Marque-pages', ic: BM_SVG },
  { id: 'cultes', t: 'Phrases cultes', img: '#chest' },
  { id: 'jurons', t: 'Gros mots', img: '#chestD' },
  { id: 'citations', t: 'Citations', ic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="f" d="M5 17.5c0-4.6 1.6-8 5-10.5l.9 1.3c-2 1.7-2.9 3.5-3 5.6H11V19H5zM13 17.5c0-4.6 1.6-8 5-10.5l.9 1.3c-2 1.7-2.9 3.5-3 5.6H19V19h-6z"/></svg>' },
  { id: 'perso', t: 'Personnages', ic: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/></svg>' },
  { id: 'lieux', t: 'Lieux', ic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c-3.8 0-6.8 3-6.8 6.6 0 4.9 6.8 11.8 6.8 11.8s6.8-6.9 6.8-11.8c0-3.6-3-6.6-6.8-6.6z"/><circle cx="12" cy="9.4" r="2.5"/></svg>' },
  { id: 'mots', t: 'Mots', ic: ICO_BOOK },
  { id: 'stats', t: 'Statistiques', ic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-4M12 16V7M17 16v-6"/></svg>' }
];
const LIEU_G = GAMES.filter((g) => g.kind === 'lieu');
const MOT_G = GAMES.filter((g) => g.kind === 'etymo' || g.kind === 'sens');
const jeuOk = (g) => S.jeux[g.key] && S.jeux[g.key].ok;
function cnCount(id) {
  switch (id) {
    case 'marques': return S.marks.length ? S.marks.length + (S.marks.length > 1 ? ' marque-pages' : ' marque-page') : 'Où j’en suis';
    case 'cultes': return S.cultes.filter((si) => CULTES.some((c) => c.si === si)).length + ' sur ' + CULTES.length;
    case 'jurons': return S.jurons.length + ' sur ' + JURONS.length;
    case 'citations': { const n = S.hearts.filter((h) => h.s < SENT.length).length; return n + (n > 1 ? ' passages' : ' passage'); }
    case 'perso': return S.met.filter((x) => ALL_CAST.includes(x)).length + ' sur ' + ALL_CAST.length;
    case 'lieux': return LIEU_G.filter((g) => S.jeux[g.key]).length + ' sur ' + LIEU_G.length;
    case 'mots': { const n = S.mots.length + MOT_G.filter((g) => S.jeux[g.key]).length; return n + (n > 1 ? ' mots' : ' mot'); }
    case 'stats': { const w = avgWpm(); return w ? w + ' mots/min' : fmtInt(S.words || 0) + ' mots lus'; }
  }
  return '';
}
function avgWpm() { const ms = S.readMs || 0; return ms > 30000 ? Math.round((S.words || 0) / (ms / 60000)) : 0; }
function buildMenu() {
  byId('cnMenu').replaceChildren(...CN.map((c, i) => {
    const b = el('button', 'cn-t' + (i === 0 ? ' wide' : '')); b.type = 'button';
    b.dataset.cn = c.id;
    const ic = el('span', 'cn-ic' + (c.img ? ' img' : ''));
    if (c.img) { try { ic.style.backgroundImage = getComputedStyle($(c.img + ' .ch-img')).backgroundImage; } catch (e) { /* ignoré */ } }
    else ic.innerHTML = c.ic;
    const t = el('span', 'cn-tx');
    t.append(el('b', '', c.t), el('small', '', cnCount(c.id)));
    b.append(ic, t, el('span', 'cn-go', '›'));
    b.addEventListener('click', () => cnGo(c.id));
    return b;
  }));
}
function cnGo(id) {
  const c = CN.find((x) => x.id === id);
  byId('cnMenu').hidden = !!c;
  byId('cnBack').hidden = !c;
  byId('carnetTitle').textContent = c ? c.t : 'Carnet';
  $$('#carnetSheet [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== id; });
  if (id === 'marques') fillMarques();
  if (id === 'lieux') fillLieux();
  if (id === 'mots') fillMotsAll();
  if (id === 'stats') fillStats();
  if (id === 'cultes') byId('culteEmpty').hidden = S.cultes.some((si) => CULTES.some((x) => x.si === si));
  if (id === 'jurons') { byId('juronEmpty').hidden = S.jurons.length > 0; byId('juronLab').textContent = cnCount('jurons') + ' attrapés'; }
  $('#carnetSheet .panel').scrollTop = 0;
}
byId('cnBack').addEventListener('click', () => { buildMenu(); cnGo(''); });
function goRead(j) { closeSheets(); k = S.read === 'page' ? CH[CHOF[j]].a : j; S.k = k; persist(); showReader(false); }
function sentLi(si, label, actions) {
  const li = el('li');
  const t = sentenceText(si);
  li.append(el('blockquote', '', t.length > 220 ? t.slice(0, 218).replace(/\s+\S*$/, '') + '…' : t));
  const src = el('div', 'src');
  src.append(el('span', '', label));
  const act = el('span', 'src-act');
  actions.forEach((a) => act.append(a));
  src.append(act);
  li.append(src);
  return li;
}
function smallBtn(t, fn) { const b = el('button', '', t); b.type = 'button'; b.addEventListener('click', fn); return b; }
function fillMarques() {
  const here = byId('cnHere');
  const si = sentenceAt(k);
  const card = el('div', 'cn-here');
  card.append(el('p', 'eyebrow', 'Où j’en suis'), el('strong', '', where(k) + ' · ' + EPS[EPI[k]].title));
  const t = sentenceText(si);
  card.append(el('p', 'cn-here-q', t.length > 160 ? t.slice(0, 158).replace(/\s+\S*$/, '') + '…' : t));
  const go = el('button', 'btn primary', 'Reprendre la lecture'); go.type = 'button';
  go.addEventListener('click', () => goRead(k));
  card.append(go);
  here.replaceChildren(card);
  const list = S.marks.filter((m) => m.s < SENT.length).sort((a, b) => a.s - b.s);
  byId('bmList').replaceChildren(...list.map((m) => sentLi(m.s, where(SENT[m.s]), [
    smallBtn('Retirer', () => { S.marks = S.marks.filter((x) => x !== m); persist(); paintMarks(); paintBm(); fillMarques(); }),
    smallBtn('Lire ici', () => goRead(SENT[m.s]))
  ])));
  byId('bmEmpty').hidden = list.length > 0;
}
function fillLieux() {
  const got = LIEU_G.filter((g) => S.jeux[g.key]);
  byId('lieuList').replaceChildren(...got.map((g) => {
    const li = el('li', 'cn-item');
    const h = el('div', 'mt-h');
    h.append(el('strong', '', g.x.nom), el('span', 'dc-pos' + (jeuOk(g) ? ' good' : ''), jeuOk(g) ? 'trouvé sur la carte' : 'raté de peu'));
    li.append(h, el('p', 'mt-d', g.x.info || ''));
    const src = el('div', 'src'); src.append(el('span', '', where(g.j)), smallBtn('Lire ici', () => goRead(g.j)));
    li.append(src);
    return li;
  }));
  byId('lieuEmpty').hidden = got.length > 0;
}
function fillMotsAll() {
  fillMots();
  const got = MOT_G.filter((g) => S.jeux[g.key]);
  byId('etyBox').hidden = !got.length;
  byId('etyList').replaceChildren(...got.map((g) => {
    const li = el('li');
    const h = el('div', 'mt-h');
    h.append(el('strong', '', g.x.nom), el('span', 'dc-pos', g.kind === 'sens' ? 'a changé de sens' : 'étymologie'));
    li.append(h, el('p', 'mt-d', g.x.choix[g.x.ok | 0]));
    if (g.x.info) li.append(el('p', 'dc-en', g.x.info));
    return li;
  }));
  byId('motEmpty').hidden = S.mots.length > 0 || got.length > 0;
}
function fillStats() {
  const w = avgWpm();
  const box = byId('cnStats');
  const grid = el('div', 'statgrid cn-sg');
  const doneEps = Object.values(S.eps).filter((x) => x && x.done).length;
  const chDone = CHAPS.filter((ch) => ch.eps.every((e) => S.eps[e] && S.eps[e].done)).length;
  const booksStarted = Object.values(S.lib || {}).filter((b) => b && Object.values(b.eps || {}).some((x) => x && x.done)).length;
  const booksDone = chDone === CHAPS.length && CHAPS.length && /fin|entier|complet/i.test(BOOK.contenu || '') ? 1 : 0;
  [[fmtInt(S.words || 0), 'mots lus'], [duration(S.readMs || 0), 'de lecture'], [w ? w + ' mots/min' : '—', 'vitesse moyenne réelle'],
   [doneEps + ' / ' + EPS.length, 'épisodes lus'], [String(chDone), chDone > 1 ? 'chapitres terminés' : 'chapitre terminé'], [String(Math.max(1, booksStarted)), booksStarted > 1 ? 'classiques commencés' : 'classique commencé']]
    .forEach(([v, l]) => { const x = el('div'); x.append(el('b', '', v), el('span', '', l)); grid.append(x); });
  // vitesse : comparée à une étude publiée (adultes, lecture silencieuse d'un roman : 260 mots/min en moyenne)
  const sp = el('section', 'cn-cmp');
  sp.append(el('h3', 'eyebrow sect-label', 'Ta vitesse et celle d’un adulte moyen'));
  const lo = 100, hi = 600, pos = (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const gauge = el('div', 'cmp-g');
  const avg = el('span', 'cmp-avg'); avg.style.setProperty('--f', String(pos(260))); avg.append(el('b', '', '260'), el('small', '', 'adulte moyen'));
  gauge.append(el('i', 'cmp-band'), avg);
  if (w) { const me = el('span', 'cmp-me'); me.style.setProperty('--f', String(pos(w))); me.append(el('b', '', String(w)), el('small', '', 'toi')); gauge.append(me); }
  sp.append(gauge);
  const p = w ? fasterThan(w) : 0;
  sp.append(el('p', 'cmp-t', !w ? 'Lis encore quelques minutes pour connaître ta vitesse réelle.'
    : p >= 55 ? 'Tu lis plus vite que ' + p + ' % des adultes.' : 'Un adulte lit en moyenne 260 mots par minute ; la plupart entre 200 et 320.'));
  sp.append(el('p', 'cmp-src', 'Source : Brysbaert (2019), lecture silencieuse de romans par des adultes.'));
  // livres : la moyenne française, tous genres confondus
  const bk = el('section', 'cn-cmp');
  bk.append(el('h3', 'eyebrow sect-label', 'Tes classiques et la moyenne française'));
  const bars = el('div', 'cmp-bars');
  const row = (lab, n, max, cls) => { const r = el('div', 'cmp-row ' + (cls || '')); const b = el('i'); b.style.setProperty('--f', String(Math.min(1, n / max))); r.append(el('span', '', lab), b, el('b', '', String(n))); return r; };
  bars.append(row('Toi · classiques commencés', Math.max(1, booksStarted), 18, 'me'), row('Toi · chapitres terminés', chDone, 18, 'me'), row('Un adulte · livres par an', 18, 18));
  bk.append(bars, el('p', 'cmp-t', 'En France, un adulte lit en moyenne 18 livres par an, tous genres confondus.'), el('p', 'cmp-src', 'Source : CNL, baromètre « Les Français et la lecture » 2025.'));
  const st = streakNow();
  const extra = el('p', 'cmp-t', 'Série : ' + st + (st > 1 ? ' jours' : ' jour') + ' de lecture d’affilée · record ' + (S.streak.best || 0) + '.');
  box.replaceChildren(grid, sp, bk, extra);
}
function openCarnet(tab) {
  buildCarnet();
  fillMots();
  buildMenu();
  const map = { coeurs: '', passages: 'citations' };
  const t = tab in map ? map[tab] : (tab || '');
  cnGo(t);
  openSheet('#carnetSheet');
}

/* ================= Raccourcis ================= */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || byId('reader').hidden) return;
  if ($$('.sheet').some((s) => !s.hidden)) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select')) return;
  if (e.key === 'b' || e.key === 'B') { toggleMark(); e.preventDefault(); }
  else if (e.key === 'v' || e.key === 'V') { unlockAudio(); toggleVoice(); e.preventDefault(); }
});
syncVoice();
fillVoiceSel();
if (VOICE_OK) {
  vLoadVoices();
  try { synth.addEventListener('voiceschanged', vLoadVoices); } catch (e) { try { synth.onvoiceschanged = vLoadVoices; } catch (er) { /* ignoré */ } }
}

/* ================= Version 34 =================
   Barre du bas : le bouton Écouter à gauche de lecture/pause ; la barre de vitesse plus longue, sans chiffre (le chiffre
   apparaît seulement pendant qu'on la fait glisser), avec « vitesse » écrit en petit dessous ; elle s'arrête à 360 mots/min
   quand l'écoute est allumée. En haut : le marque-page tout à droite, toujours visible ; le compteur de points à côté
   pendant la lecture, d'où jaillissent des cartes quand on répond juste. Pastilles : un petit tintement et un scintillement
   à leur apparition. Voix : la tête de lecture se recale sur la vitesse réelle de la voix du téléphone. */

// --- la vitesse réelle de la voix, mesurée phrase après phrase (caractères par seconde, à la vitesse ×1) ---
if (!(S.vcps > 6 && S.vcps < 40)) S.vcps = 14.5;
const vEst2 = (a, z) => { let c = 0; for (let j = a; j <= z; j++) c += T[V[j]].t.length + 1; return c / (S.vcps * vRate()) * 1000; };
vShow = function (j) {
  if (S.read === 'page') {
    const ch = CH[CHOF[j]];
    if (vCur === ch.a) return;
    vCur = ch.a;
    k = ch.a;
    sweepNext = !speedHack;
    render(k); progress();
    for (let i = ch.a; i <= ch.z; i++) countWord(i);
    setSuspense(ch.a);
    runSweep(Math.max(200, vEst2(ch.a, ch.z) * .97), 0);
  } else {
    if (vCur === j) return;
    vCur = j;
    k = j;
    render(k); progress();
    countWord(k);
    setSuspense(k);
  }
};
vSpeak = function (a, z, gen) {
  const { s, at } = vText(a, z);
  if (!s) { vNext(z, gen); return; }
  const tk = T[V[a]];
  const sp = tk.k === 's' ? tk.sp : null;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = 'fr-FR';
  const voice = vFor(sp);
  if (voice) u.voice = voice;
  let rate = vRate(), pitch = sp ? vPitch(sp, voice) : 1, vol = 1;
  if (sp && tk.v === 'bas') { vol = .55; rate *= .92; }
  else if (sp && tk.v === 'fort' && S.vcast !== false) { pitch += .06; rate *= 1.04; }
  if (sp && tk.th && S.vcast !== false) rate *= .94;
  u.rate = vClamp(rate, .5, 2); u.pitch = vClamp(pitch, .5, 2); u.volume = vol;
  let t0 = performance.now(), lastB = 0, started = false, pos = -1;
  const wordAt = (ci) => { let i = at.length - 1; while (i > 0 && at[i] > ci) i--; return i; };
  // la tête n'avance que vers l'avant, mot par mot
  const go = (i) => { if (i > pos) { pos = i; vShow(a + i); } };
  u.onboundary = (ev) => {
    if (gen !== vGen || !playing) return;
    if (ev.name && ev.name !== 'word') return;
    lastB = performance.now();
    go(wordAt(ev.charIndex | 0));
  };
  // sans repères (ou s'ils se taisent plus d'une seconde) : la position estimée, d'après la vitesse mesurée de la voix
  const fall = () => {
    if (gen !== vGen || !playing) return;
    const now = performance.now();
    if (!lastB || now - lastB > 1100) {
      const f = Math.min(.98, (now - t0) / (s.length / (S.vcps * u.rate) * 1000));
      go(wordAt(f * s.length));
    }
    vFallT = setTimeout(fall, 90);
  };
  u.onstart = () => {
    if (gen !== vGen) return;
    started = true; t0 = performance.now();
    clearTimeout(vWatchT);
  };
  u.onend = () => {
    if (gen !== vGen) return;
    clearTimeout(vFallT); clearTimeout(vWatchT);
    // la voix vient de dire s.length caractères : on recale l'estimation sur sa vraie vitesse
    const dt = (performance.now() - t0) / 1000;
    if (started && dt > .6 && s.length > 24) {
      const m = s.length / dt / u.rate;
      if (m > 6 && m < 40) S.vcps = Math.round((.55 * S.vcps + .45 * m) * 10) / 10;
    }
    vNext(z, gen);
  };
  u.onerror = (ev) => {
    if (gen !== vGen) return;
    clearTimeout(vFallT); clearTimeout(vWatchT);
    if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return;
    voiceOff('La voix ne répond pas sur cet appareil : lecture silencieuse.');
  };
  try { synth.speak(u); } catch (e) { voiceOff('La voix n’est pas disponible : lecture silencieuse.'); return; }
  vFallT = setTimeout(fall, 90);
  vWatchT = setTimeout(() => { if (gen === vGen && playing && !started && !lastB) voiceOff('La voix ne démarre pas sur cet appareil : lecture silencieuse.'); }, speedHack ? 600000 : 5000);
};

// --- barre de vitesse : plafond de la voix, chiffre seulement pendant le geste ---
function speedRange() {
  const max = S.voice ? VOICE_MAX : WPM_MAX;
  ['#wpmDock', '#wpm'].forEach((id) => {
    const r = $(id);
    if (!r) return;
    r.max = String(max);
    r.value = String(S.wpm);
  });
  const dock = byId('wpmDock');
  const f = (S.wpm - WPM_MIN) / (max - WPM_MIN);
  dock.style.setProperty('--f', String(Math.max(0, Math.min(1, f))));
  byId('speedBar').style.setProperty('--f', String(Math.max(0, Math.min(1, f))));
  const bub = byId('spdBub');
  if (bub) bub.textContent = S.wpm + ' mots/min';
  const lab = byId('spdLab');
  if (lab) lab.textContent = S.voice ? 'vitesse de la voix' : 'vitesse';
}
{
  const sv = syncVoice;
  syncVoice = function () {
    sv();
    const b = byId('voiceBtn');
    if (b) b.classList.toggle('on', !!S.voice);
    speedRange();
  };
}
toggleVoice = function () {
  if (!VOICE_OK) { toast('La voix n’est pas disponible sur ce navigateur.'); return; }
  if (S.voice) { voiceOff('Écoute coupée'); return; }
  S.voice = true;
  if (S.wpm > VOICE_MAX) S.wpm = 240;
  persist(); syncSettings();
  vUnlocked = false; vUnlock();
  if (S.read === 'texte') setRead('page');
  toast('Écoute : la voix lit le texte');
  restartStep(200);
};

// --- le compteur de points, en haut à côté du marque-page : visible pendant la lecture ---
const purse = byId('purse');
purse.hidden = false;
let purseT = 0;
function purseShow(ms) {
  readerEl.dataset.pts = '1';
  clearTimeout(purseT);
  if (ms) purseT = setTimeout(() => { if (!playing) readerEl.dataset.pts = '0'; }, ms);
}
{
  const pl = play, ha = halt;
  play = function () { pl(); if (playing) { clearTimeout(purseT); readerEl.dataset.pts = '1'; } };
  halt = function () { ha(); purseShow(2500); };
}
// des cartes d'or jaillissent du compteur quand on répond juste
function purseWin() {
  if (byId('reader').hidden) return;
  purseShow(4000);
  updatePts(true);
  requestAnimationFrame(() => { coinBurst(purse); });
}
{
  const gr = gameResult;
  gameResult = function (g, good, delta) { gr(g, good, delta); if (good && delta > 0) purseWin(); };
  const qa = quizAnswer;
  quizAnswer = function (good) { qa(good); if (good) purseWin(); };
  const br = betReveal;
  betReveal = function (b) { const r = S.paris && S.paris[b.id]; const before = r && r.v; br(b); if (r && !before && r.c === b.ok) purseWin(); };
}

// --- pastilles : un tintement très léger et un scintillement à leur apparition ---
function chipFx(btn) {
  if (!btn || byId('reader').hidden) return;
  if (REDUCED || speedHack) return;
  const ic = btn.querySelector('.rb-ico') || btn;
  for (let i = 0; i < 5; i++) {
    const s = el('span', 'chip-spark');
    s.style.setProperty('--a', (i * 72 + Math.random() * 30) + 'deg');
    s.style.setProperty('--dl', (i * .06) + 's');
    s.addEventListener('animationend', () => s.remove());
    ic.append(s);
  }
  btn.classList.remove('shine'); void btn.offsetWidth; btn.classList.add('shine');
}
{
  const rs = railShow;
  railShow = function (btn, on) { const was = !btn.hidden; rs(btn, on); if (on && !was) chipFx(btn); };
  const pg = paintGames;
  paintGames = function () {
    const before = new Set($$('#rail [data-game]').map((b) => b.dataset.game));
    pg();
    $$('#rail [data-game]').forEach((b) => { if (!before.has(b.dataset.game)) chipFx(b); });
  };
}

// --- la barre de vitesse : le chiffre seulement pendant qu'on la fait glisser ---
{
  const input = byId('wpmDock'), bar = byId('speedBar');
  input.addEventListener('input', () => speedRange());
  input.addEventListener('pointerdown', () => { bar.classList.add('drag'); speedRange(); });
}
speedRange();

/* ================= Version 35 =================
   En haut : seulement le numéro d'épisode (« 3/11 ») ; à l'arrêt, les boutons Immersif / Texte.
   La barre verticale de gauche montre où l'on en est dans l'épisode, jusqu'à sa fin (dorée quand le bonus
   « d'une traite » est gagné). Carnet : plus de statistiques. */
{
  const pr = progress;
  progress = function () {
    pr();
    const t = byId('epTitle');
    if (t.dataset.e63 === t.dataset.e62 && t.dataset.e62) return;
    t.dataset.e63 = t.dataset.e62 || '';
    Array.from(t.childNodes).forEach((n) => { if (n.nodeType === 3) n.remove(); });
    const ep = EPS[EPI[k]];
    t.setAttribute('aria-label', 'Épisode ' + (ep.i + 1) + ' : ' + ep.title);
    t.title = ep.title;
  };
}
paintRun = function () {
  const e = EPI[k], ep = EPS[e];
  const q = Math.round(Math.min(1, Math.max(0, (k - ep.a + 1) / Math.max(1, ep.n))) * 100);
  const won = !epPaused[e] && epRead[e] >= ep80(e);
  const state = won ? 'done' : epPaused[e] ? 'lost' : 'run';
  if (q === runP && runBar.dataset.state === state) return;
  runP = q;
  runBar.dataset.state = state;
  runBar.style.setProperty('--p', q + '%');
};
{
  const pl = play, ha = halt;
  play = function () { pl(); readerEl.dataset.playing = playing ? '1' : '0'; };
  halt = function () { ha(); if (!FRZ70) { readerEl.dataset.playing = '0'; readerEl.dataset.pts = '0'; } clearTimeout(purseT); };
}
{ const i = CN.findIndex((c) => c.id === 'stats'); if (i >= 0) CN.splice(i, 1); }
readerEl.dataset.playing = '0';

/* ================= Version 41 =================
   Petit quiz de fin d'épisode : dans le bandeau de fin, un bouton « Petit quiz » (facultatif, une question, +10 points).
   Si on ne le touche pas, la lecture enchaîne comme avant (2,5 s de plus pour avoir le temps de le voir).
   Thèmes de couleur : Terre cuite (par défaut), Encre bleue, Sauge ; chacun en clair et en sombre. */
const EPQ_PTS = 10;
const EPQ = (Array.isArray(BOOK.quizEp) ? BOOK.quizEp : []).map((x, e) => (x && Array.isArray(x.choix) && x.choix.length >= 2 && EPS[e]
  ? { key: 'q' + e, kind: 'epq', e, j: EPS[e].z, x: Object.assign({ nom: 'Épisode ' + (EPS[e].i + 1) }, x) } : null));
function epqLive(e) { const g = EPQ[e]; return !!g && !S.jeux[g.key]; }
GAME_LAB.epq = 'Petit quiz';
GAME_BUILD.epq = function (body, g) {
  const x = g.x;
  const opts = x.choix.map((t, i) => {
    const b = el('button', 'qz-o gm-o', t); b.type = 'button';
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (gameDone) return;
      const ok = x.ok | 0, good = i === ok;
      opts.forEach((o, n) => { o.disabled = true; o.classList.toggle('ok', n === ok); o.classList.toggle('picked', n === i && !good); });
      gameResult(g, good, good ? EPQ_PTS : 0);
      const pas = x.passage ? '« ' + x.passage.replace(/^[«\s]+|[»\s]+$/g, '') + ' »' : '';
      gameFeedback(good, good ? 'Bien vu ! +' + EPQ_PTS + ' points' : 'La bonne réponse', (good ? '' : x.choix[ok] + '. ') + (x.info || ''),
        'Petit quiz sur ' + BOOK.titre + ' (' + BOOK.auteur + ') : ' + x.q + ' J’ai ' + (good ? 'trouvé' : 'perdu') + ' ! Et toi ?');
      if (pas) { const p = el('p', 'epq-pas', pas); const fb = $('#gameC .gm-fb .gm-info'); if (fb) fb.after(p); }
      paintEpqLines();
    });
    return b;
  });
  body.append(...opts);
};
// la ligne du bandeau : le bouton, ou le résultat
function epqLine(x, e) {
  const g = EPQ[e];
  x.replaceChildren();
  x.dataset.e = String(e);
  const r = S.jeux[g.key];
  if (r) {
    const ic = el('span', 'epq-ic'); ic.innerHTML = r.ok ? ICO_OK : ICO_BOOK;
    x.append(ic, el('span', 'epq-done', r.ok ? 'Petit quiz : bien vu ! +' + EPQ_PTS + ' points' : 'Petit quiz fait'));
    return;
  }
  const b = el('button', 'epq-b'); b.type = 'button';
  const q = el('span', 'epq-q', '?');
  b.append(q, el('span', '', 'Petit quiz'), el('small', '', '+' + EPQ_PTS + ' points'));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openGame(g); });
  x.append(b, el('span', 'epq-opt', 'facultatif'));
}
function paintEpqLines() { $$('.ee-epq').forEach((x) => { const e = Number(x.dataset.e); if (EPQ[e]) epqLine(x, e); }); }
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    fe(box, info, isLast);
    const e = info.e;
    if (!EPQ[e]) return;
    const x = el('div', 'ee-epq');
    const act = box.querySelector('.ee-act');
    const before = act || box.lastElementChild;
    x.style.setProperty('--i', before && before.style ? (before.style.getPropertyValue('--i') || '6') : '6');
    epqLine(x, e);
    box.insertBefore(x, before);
  };
  // passer le quiz (toucher ailleurs) relance la lecture comme « Continuer »
  const cg = closeGame;
  closeGame = function (resume) { const g = gameOpen; cg(g && g.kind === 'epq' ? true : resume); };
}

/* --- thèmes de couleur --- */
const PALETTES = ['', 'bleu', 'sauge'];
if (!PALETTES.includes(S.palette || '')) S.palette = '';
{
  const at = applyTheme;
  applyTheme = function () {
    at();
    if (S.palette) document.documentElement.setAttribute('data-palette', S.palette);
    else document.documentElement.removeAttribute('data-palette');
  };
  const ss = syncSettings;
  syncSettings = function () {
    ss();
    $$('[data-palette-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paletteChoice === (S.palette || ''))));
  };
}
$$('[data-palette-choice]').forEach((b) => b.addEventListener('click', () => {
  S.palette = b.dataset.paletteChoice; persist(); applyTheme(); syncSettings();
  if (pvBuilt && !byId('reader').hidden) { placeHighlight(); }
}));
applyTheme();

/* ================= Version 42 =================
   Se remettre dans la lecture après un jeu :
   – la lecture repart du début de la phrase (celle qu'on vient de lire si l'arrêt tombe entre deux phrases) ;
   – démarrage en douceur : 60 % de la vitesse choisie, puis la vitesse normale en 6 secondes (la voix aussi) ;
   – le mot de reprise s'éclaire une fois, et le soulignement attend une seconde avant d'avancer ;
   – le flou derrière une carte se dissipe en une seconde (CSS).
   Les jeux et les paris se déroulent dans la page, sous le paragraphe, sans flou ; à la fermeture, la page revient
   exactement où elle était. Ils ne s'ouvrent qu'à la fin d'une phrase : touchée en pleine phrase, la pastille attend
   le point. « Plus tard » met un jeu de côté ; les jeux gardés se jouent dans le bandeau de fin d'épisode.
   Réglage (Aa) : mini-jeux pendant la lecture, ou à la fin de l'épisode. La machine à mots quitte la lecture. */
if (!['lire', 'fin'].includes(S.gmode)) S.gmode = 'lire';
if (!Array.isArray(S.later)) S.later = [];
const gmFin = () => S.gmode === 'fin';
const SOFT_WAIT = 1000, SOFT_PAUSE = 2500;
let softT = 0, softArm = false, forceSoft = false, cursorPlaced = false, pausedAt = 0;

// --- où repartir : le début de la phrase ---
function softTarget(j) {
  const a = EPS[EPI[j]].a;
  if (j <= a) return j;
  let si = sentenceAt(j);
  if (SENT[si] === j && j - 1 >= a) si = sentenceAt(j - 1);   // arrêt entre deux phrases : on relit la précédente
  let t = Math.max(a, SENT[si]);
  if (j - t > 40) t = Math.max(a, j - 12);                     // phrase très longue : une douzaine de mots suffit
  return Math.max(a, CH[CHOF[t]].a);
}
function glowAt(j) {
  if (S.read !== 'page' || !pvBuilt) return;
  const s = PVS[V[j]];
  if (!s) return;
  s.classList.remove('rs-glow'); void s.offsetWidth; s.classList.add('rs-glow');
  setTimeout(() => s.classList.remove('rs-glow'), 1600);
}
function softCancel() { if (softT) { clearTimeout(softT); softT = 0; setPlayIcon(); } }
{
  const pl = play;
  play = function () {
    if (playing || S.read === 'texte') { pl(); return; }
    if (softT) return;
    const soft = !speedHack && !inter && !byId('reader').hidden && (forceSoft || (softArm && performance.now() - pausedAt > SOFT_PAUSE));
    softArm = false; forceSoft = false;
    if (!soft) { cursorPlaced = false; pl(); return; }
    if (!cursorPlaced) k = softTarget(k);
    cursorPlaced = false;
    S.k = k;
    pvUserScroll = false;
    render(k); progress();
    glowAt(k);
    byId('playIcon').setAttribute('d', 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z');
    softT = setTimeout(() => {
      softT = 0;
      if (playing || byId('reader').hidden) return;
      rampT0 = performance.now();
      pl();
      rampT0 = performance.now();
    }, SOFT_WAIT);
  };
  const pa = pause;
  pause = function () {
    softCancel();
    const was = playing;
    pa();
    if (was) { softArm = true; pausedAt = performance.now(); }
  };
  const tg = toggle;
  toggle = function () { if (softT) { softCancel(); return; } tg(); };
  const ha = halt;
  halt = function () { rampT0 = 0; ha(); };
  // une reprise choisie (double-toucher, phrase suivante ou précédente) est respectée au mot près
  const pc = placeCursor;
  placeCursor = function (j) { pc(j); cursorPlaced = true; };
  const sk = seek;
  seek = function (j) { sk(j); if (!playing) cursorPlaced = true; };
  const se = startEpisode;
  startEpisode = function (e, autoplay) { softCancel(); softArm = false; forceSoft = false; cursorPlaced = false; se(e, autoplay); };
  const vr = vRate;
  vRate = function () { return vClamp(vr() * rampF(), .5, 2); };
}

// --- la machine à mots quitte la lecture ---
paintRoulette = function () { const b = byId('railRoul'); if (b) b.hidden = true; };

// --- la carte du jeu, dans la page ---
let slot = null;   // { host, box, home, scroll0, expect, anchor }
const inPageMode = () => (S.read === 'page' || S.read === 'texte') && pvBuilt && !byId('reader').hidden;
function topBlock(node) {
  let n = node;
  const top62 = (x) => x === pvIn || (x.classList && x.classList.contains('cvep'));
  while (n && n.parentElement && !top62(n.parentElement)) n = n.parentElement;
  return n && n.parentElement && top62(n.parentElement) ? n : null;
}
let mountAnchor = null, fromTick = false;
function mountInPage(box) {
  let after = null, inEnd = false;
  if (mountAnchor && mountAnchor.isConnected) { after = mountAnchor; inEnd = true; }
  mountAnchor = null;
  if (!after) {
    if (!inPageMode()) return false;
    const j = fromTick ? Math.max(0, k - 1) : k;
    const w = PVS[V[j]];
    after = w ? topBlock(w) : null;
    if (!after) return false;
  }
  if (inEnd && !after.closest('#pvIn')) return false;   // mode Rapide : le bandeau est au centre, la carte aussi
  const host = el('div', 'gmslot'), inner = el('div', 'gm-in');
  host.append(inner);
  after.after(host);
  const home = box.parentElement;
  inner.append(box);
  box.classList.remove('in', 'out');
  slot = { host, box, home, scroll0: null, expect: null };
  if (!trove) stage.dataset.ingame = '1';
  void host.offsetWidth;
  host.classList.add('open');
  // la carte doit se voir en entier : la page glisse juste ce qu'il faut (la ligne lue reste visible)
  requestAnimationFrame(() => {
    if (!slot || slot.host !== host || S.read === 'texte') return;
    const pr = pageview.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const h = inner.scrollHeight + 16, vh = pageview.clientHeight;
    const need = hr.top - pr.top + h - vh * .97;
    if (need <= 4) return;
    const lit = pvLit[0] || PVS[V[k]];
    const keep = lit ? lit.getBoundingClientRect().top - pr.top - vh * .1 : need;
    const d = Math.max(0, Math.min(need, keep, hr.top - pr.top - vh * .1));
    if (d <= 4) return;
    stopPageGlide();
    slot.scroll0 = pageview.scrollTop;
    pvTarget = Math.min(pageview.scrollTop + d, pvIn.scrollHeight + h - vh);
    slot.expect = pvTarget;
    pvLast = performance.now(); pvAnim = requestAnimationFrame(pvTick);
  });
  return true;
}
// montrer le bas de la carte (après une réponse, l'explication et « Continuer » doivent se voir)
function slotReveal() {
  const s = slot;
  if (!s || S.read === 'texte') return;
  requestAnimationFrame(() => {
    if (slot !== s) return;
    const pr = pageview.getBoundingClientRect(), br = s.box.getBoundingClientRect(), vh = pageview.clientHeight;
    const need = br.bottom - pr.top + 14 - vh;
    const room = br.top - pr.top - vh * .06;          // le haut de la carte reste visible
    const d = Math.max(0, Math.min(need, room));
    if (d <= 4) return;
    if (s.scroll0 === null) s.scroll0 = pageview.scrollTop;
    stopPageGlide();
    pvTarget = Math.min(pageview.scrollTop + d, pvIn.scrollHeight - vh);
    s.expect = pvTarget;
    pvLast = performance.now(); pvAnim = requestAnimationFrame(pvTick);
  });
}
function unmountFromPage(box, after) {
  const s = slot;
  if (!s || s.box !== box) { if (after) after(); return; }
  slot = null;
  s.host.classList.add('shut');
  s.host.classList.remove('open');
  // la page revient où elle était (sauf si le lecteur l'a fait défiler lui-même)
  if (s.scroll0 !== null && Math.abs(pageview.scrollTop - s.expect) < 40) {
    stopPageGlide();
    pvTarget = s.scroll0;
    pvLast = performance.now(); pvAnim = requestAnimationFrame(pvTick);
  }
  setTimeout(() => {
    box.hidden = true;
    box.classList.remove('out', 'in');
    s.home.insertBefore(box, byId('rail'));
    s.host.remove();
    if (!slot && stage.dataset.ingame === '1') stage.dataset.ingame = '0';
    pvUserScroll = false;
    if (S.read === 'page' && pvLit.length) { placeHighlight(); paraHL(pvPara); }
    if (after) after();
  }, REDUCED ? 20 : 400);
}

// --- jeux mis de côté ---
const laterKeys = () => S.later.filter((key) => GAMES.some((g) => g.key === key) && !S.jeux[key]);
function putLater(g) {
  if (!g || S.jeux[g.key]) return;
  if (!S.later.includes(g.key)) S.later.push(g.key);
  gameSkipped.add(g.key);
  if (pend && pend.g === g) pend = null;
  persist();
}
{
  const gr = gameResult;
  gameResult = function (g, good, delta) { gr(g, good, delta); const i = S.later.indexOf(g.key); if (i >= 0) { S.later.splice(i, 1); persist(); } };
}

// --- ouvrir à la fin de la phrase ---
let pend = null;   // { g } ou { b }
const atSentenceStart = (j) => j > 0 && SENT[sentenceAt(j)] === j;
function armBtn(btn) { $$('#rail .armed').forEach((b) => b.classList.remove('armed')); if (btn) btn.classList.add('armed'); }
{
  const tk = tick;
  tick = function () {
    if (pend && playing && atSentenceStart(k)) {
      const p = pend; pend = null; armBtn(null);
      fromTick = true;
      if (p.g && !S.jeux[p.g.key]) openGame(p.g);
      else if (p.b) openBet(p.b);
      fromTick = false;
      if (gameOpen || betOpen) return;
    }
    tk();
  };
}
const ICO_LATER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
// les pastilles : un toucher en pleine phrase arme le jeu ; « Plus tard » le met de côté
byId('rail').addEventListener('click', (ev) => {
  const lt = ev.target.closest && ev.target.closest('.rail-later');
  if (lt) {
    ev.stopPropagation(); ev.preventDefault();
    const g = GAMES.find((x) => x.key === lt.dataset.later);
    putLater(g);
    paintGames();
    toast('Mis de côté pour la fin de l’épisode');
    buzz(8);
    return;
  }
  const b = ev.target.closest && ev.target.closest('.rail-b');
  if (!b || !playing) return;
  let item = null;
  if (b.dataset.game) item = { g: GAMES.find((x) => x.key === b.dataset.game) };
  else if (b.id === 'railBet') item = { b: BETS.find((x) => x.id === b.dataset.bet) };
  if (!item || (!item.g && !item.b)) return;
  ev.stopPropagation(); ev.preventDefault();
  unlockAudio();
  pend = item;
  armBtn(b);
  toast(item.g ? 'Le jeu s’ouvre à la fin de la phrase' : 'Le pari s’ouvre à la fin de la phrase');
  buzz(8);
}, true);
{
  const pg = paintGames;
  paintGames = function () {
    if (gmFin() && !byId('reader').hidden) {
      // à la fin de l'épisode : rien pendant la lecture, les jeux croisés attendent le bandeau
      GAMES.forEach((g) => {
        if (k >= g.j && EPI[g.j] === EPI[k] && !S.jeux[g.key] && !gameSkipped.has(g.key)) { if (!S.later.includes(g.key)) S.later.push(g.key); gameSkipped.add(g.key); }
      });
    }
    pg();
    if (pend && pend.g) gameSkipped.delete(pend.g.key);
    const rail = byId('rail');
    // « Plus tard » juste sous chaque pastille de jeu
    $$('.rail-later', rail).forEach((x) => { if (!rail.querySelector('[data-game="' + x.dataset.later + '"]')) x.remove(); });
    $$('[data-game]', rail).forEach((b) => {
      if (pend && pend.g && pend.g.key === b.dataset.game) b.classList.add('armed');
      const nx = b.nextElementSibling;
      if (nx && nx.classList.contains('rail-later')) return;
      const lt = el('button', 'rail-later in', 'Plus tard'); lt.type = 'button'; lt.dataset.later = b.dataset.game;
      lt.setAttribute('aria-label', 'Garder ce jeu pour la fin de l’épisode');
      b.after(lt);
    });
  };
  const pb = paintBetChips;
  paintBetChips = function () {
    if (gmFin()) {
      BETS.forEach((b) => { if (k >= b.from && k < b.a && betLive(b)) betSkipped.add(b.id); });
      if (pend && pend.b) { pend = null; armBtn(null); }
    }
    pb();
    if (pend && pend.b) { const rb = byId('railBet'); if (rb.dataset.bet === pend.b.id) rb.classList.add('armed'); }
  };
}

// --- ouverture et fermeture des jeux ---
let chain = null;   // jeux mis de côté, joués à la suite dans le bandeau : { keys, at, line }
{
  const og = openGame;
  openGame = function (g) {
    if (!g || gameOpen || S.jeux[g.key]) return;
    if (pend && pend.g === g) { pend = null; armBtn(null); }
    const anchorWas = mountAnchor;
    og(g);
    if (gameOpen !== g) { mountAnchor = null; return; }
    const box = byId('gameC');
    mountAnchor = anchorWas;
    const placed = mountInPage(box);
    if (placed) {
      box.hidden = false;
      // on lit autour : rien n'est flouté (le flou est réservé à l'ancien mode au centre)
    }
    // « Plus tard », sauf dans le bandeau
    if (!chain && g.kind !== 'epq' && gameWas) {
      const skip = $('.gm-skip', box);
      if (skip) {
        const foot = el('div', 'gm-foot');
        const lt = el('button', 'gm-later'); lt.type = 'button';
        lt.innerHTML = ICO_LATER; lt.append('Plus tard');
        lt.addEventListener('click', (ev) => { ev.stopPropagation(); putLater(g); toast('Mis de côté pour la fin de l’épisode'); closeGame(true); });
        skip.replaceWith(foot);
        foot.append(lt, skip);
      }
    }
    if (chain) { const skip = $('.gm-skip', box); if (skip) skip.textContent = 'Jeu ' + (chain.at + 1) + ' sur ' + chain.keys.length + ' · touche ailleurs pour passer'; }
  };
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    gf(good, head, text, share);
    slotReveal();
    if (!chain) return;
    const go = $('#gameC .gm-go');
    if (go) go.textContent = chain.at + 1 < chain.keys.length ? 'Jeu suivant' : 'Continuer la lecture';
    const foot = $('#gameC .gm-foot'); if (foot) foot.hidden = true;
  };
  const cg = closeGame;
  closeGame = function (resume) {
    const g = gameOpen;
    if (!g) return;
    const box = byId('gameC'), was = gameWas, inSlot = slot && slot.box === box;
    if (chain) {
      cg(false);
      unmountFromPage(box, () => chainNext());
      return;
    }
    // passer un jeu ouvert pendant la lecture relance aussi la lecture, en douceur
    const back = was && g.kind !== 'epq' ? true : resume;
    if (back && was) forceSoft = true;
    if (inSlot) {
      // la lecture repart quand la page a retrouvé sa place
      cg(false);
      unmountFromPage(box, () => {
        if (was && !byId('reader').hidden && !playing && !gameOpen) { forceSoft = true; play(); }
      });
    } else cg(back);
  };
}
// les cartes ouvertes depuis le bandeau se déroulent dans le bandeau, sous la ligne touchée
pvIn.addEventListener('click', (ev) => {
  const line = ev.target.closest && ev.target.closest('.ee-epq, .ee-later');
  if (line && ev.target.closest('button')) mountAnchor = line;
}, true);

// --- les paris aussi, dans la page ---
{
  const sb = showBet;
  showBet = function (b) {
    sb(b);
    const box = byId('betC');
    if (mountInPage(box)) box.hidden = false;
  };
  const hb = hideBet;
  hideBet = function () {
    const box = byId('betC');
    if (slot && slot.box === box) { stage.dataset.bet = '0'; betOpen = null; unmountFromPage(box, null); return; }
    hb();
  };
  const br = betResume;
  betResume = function (ms) { if (betWas) forceSoft = true; br(ms + (REDUCED ? 0 : 350)); };
}

// --- bandeau de fin d'épisode : les jeux mis de côté ---
function laterLine(x) {
  x.replaceChildren();
  const keys = laterKeys();
  if (!keys.length) {
    if (x.dataset.played === '1') x.append(el('span', 'ee-later-done', 'Jeux mis de côté : faits'));
    else x.remove();
    return;
  }
  const b = el('button', 'ee-later-b'); b.type = 'button';
  const ic = el('span', 'ico'); ic.innerHTML = ICO_LATER;
  b.append(ic, el('span', '', keys.length > 1 ? 'Jouer les ' + keys.length + ' jeux' : 'Jouer le jeu'), el('small', '', 'mis de côté'));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); chainStart(x); });
  x.append(b);
}
function chainStart(line) {
  const keys = laterKeys();
  if (!keys.length) return;
  clearTimeout(timer);                     // le bandeau attend : on joue
  $$('.ee-go').forEach((b) => b.classList.remove('run'));
  chain = { keys, at: 0, line };
  line.dataset.played = '1';
  chainOpen();
}
function chainOpen() {
  const g = GAMES.find((x) => x.key === chain.keys[chain.at]);
  if (!g || S.jeux[g.key]) { chainNext(); return; }
  mountAnchor = chain.line.isConnected ? chain.line : null;
  openGame(g);
  if (!gameOpen) chainNext();
}
function chainNext() {
  if (!chain) return;
  chain.at++;
  if (chain.at < chain.keys.length) { chainOpen(); return; }
  const line = chain.line;
  chain = null;
  if (line && line.isConnected) laterLine(line);
  if (!byId('reader').hidden) { forceSoft = false; continueNow(); }
}
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    fe(box, info, isLast);
    if (gmFin()) GAMES.forEach((g) => { if (EPI[g.j] === info.e && !S.jeux[g.key] && !S.later.includes(g.key) && g.j <= k) S.later.push(g.key); });
    if (!laterKeys().length) return;
    const x = el('div', 'ee-later');
    const act = box.querySelector('.ee-act');
    const before = act || box.lastElementChild;
    x.style.setProperty('--i', before && before.style ? (before.style.getPropertyValue('--i') || '6') : '6');
    laterLine(x);
    box.insertBefore(x, before);
  };
  const ee = endEpisode;
  endEpisode = function (e, isLast) {
    if (pend && pend.g) putLater(pend.g);   // touché trop tard : le jeu attend dans le bandeau
    pend = null; armBtn(null);
    ee(e, isLast);
    // des jeux attendent : un peu plus de temps pour les voir (le bouton Continuer reste là)
    if (!isLast && inter && interGo && playing && laterKeys().length && !speedHack) {
      clearTimeout(timer);
      const wait = 11000;
      $$('.ee-go').forEach((b) => { b.style.setProperty('--wait', wait + 'ms'); b.classList.remove('run'); void b.offsetWidth; b.classList.add('run'); });
      timer = setTimeout(interGo, wait);
    }
  };
}

// --- Aa : mini-jeux pendant la lecture, ou à la fin de l'épisode ---
{
  const ss = syncSettings;
  syncSettings = function () { ss(); $$('[data-gmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gmode === S.gmode))); };
}
$$('[data-gmode]').forEach((b) => b.addEventListener('click', () => {
  S.gmode = b.dataset.gmode;
  if (gmFin()) { pend = null; armBtn(null); }
  persist(); syncSettings();
  if (!byId('reader').hidden) { paintGames(); paintBetChips(); }
  toast(gmFin() ? 'Mini-jeux à la fin de l’épisode' : 'Mini-jeux pendant la lecture');
}));
// crochets de test
window.__v42 = { get pend() { return pend; }, get slot() { return slot; }, get chain() { return chain; }, get softT() { return softT; }, rampF, softTarget, laterKeys };

/* ================= Version 43 : une visite guidée du livre =================
   « Lis les classiques et apprends sur l'époque, l'histoire et les mots. »
   – À savoir : une pastille qui ouvre deux lignes sur ce qu'on vient de lire, sans question ni points ;
   – le prix d'aujourd'hui : les sommes du roman converties en euros (ordre de grandeur, Insee) ;
   – Avant de lire : à la première page de chaque chapitre, trente secondes de contexte et un tableau de l'époque ;
   – fin d'épisode : « Dans cet épisode : 2 découvertes, 1 mot ancien » ; la vitesse n'y est plus affichée ;
   – Carnet : Découvertes (« N choses apprises sur 1885 »), Frise, Le Paris de Duroy ; une source sous chaque fait ;
   – accueil : la promesse, le catalogue par époque, des livres « bientôt » qu'on peut demander. */
const YEAR = AN_RECIT;   // v81 : l'année du récit
const SAV = Array.isArray(BOOK.savoir) ? BOOK.savoir : [];
const PRX = Array.isArray(BOOK.prix) ? BOOK.prix : [];
const AVANT = (() => { const s = Array.isArray(BOOK.avant) ? BOOK.avant : [], a = []; s.forEach((x, i) => { if (x) a[i] = x; }); a.length = s.length; return a; })();   // v58 : chapitres sans fiche = trous
const PD = BOOK.parisDuroy && BOOK.parisDuroy.geo ? BOOK.parisDuroy : null;
const PD_T = PD ? (PD.titre || 'Le Paris ' + deNom(CAST[POV] ? shortName(POV, 0) : 'du roman')) : '';
// v81 : le plan de la maison (Pot-Bouille) : chaque logement s'allume quand le roman en parle
const IMM = !PD && BOOK.immeuble && BOOK.immeuble.logements && Array.isArray(BOOK.immeuble.niveaux) ? BOOK.immeuble : null;
// v81 : plusieurs photos ou tableaux d'époque par chapitre (BOOK.tableaux), en plus de celui du chapitre (avant)
const isPhoto = (a) => !!a && (a.type === 'photo' || /photograph/i.test(String(a.tableau || '')));
const REPERE = Object.assign({ coef: 4.57, an: 1901, ref: 2024, src: 'Insee, convertisseur franc-euro' }, BOOK.prixRepere || {});
if (!S.avant || typeof S.avant !== 'object') S.avant = {};
if (!Array.isArray(S.wish)) S.wish = [];
const PROMESSE = 'Lis les classiques et apprends sur l’époque, l’histoire et les mots.';
const nb = (n, one, many) => fmtInt(n) + ' ' + (n > 1 ? many : one);

// --- les jeux : quelques-uns quittent la lecture ; les « À savoir » et les prix rejoignent les pastilles ---
(BOOK.jeuxRetires || []).forEach((key) => {
  const i = GAMES.findIndex((g) => g.key === key); if (i >= 0) GAMES.splice(i, 1);
  const l = LIEU_G.findIndex((g) => g.key === key); if (l >= 0) LIEU_G.splice(l, 1);
});
SAV.forEach((x, i) => { if (x && x.txt) { const j = wordIn(x.phrase, x.mot); if (j >= 0) GAMES.push({ key: 'k' + i, kind: 'savoir', j, x }); } });
PRX.forEach((x, i) => { if (x && x.f > 0) { const j = wordIn(x.phrase, x.mot); if (j >= 0) GAMES.push({ key: 'p' + i, kind: 'prix', j, x }); } });
// version 54 : les objets d'époque (un objet de l'époque qu'on n'utilise plus, comment il marche, ce qui l'a remplacé)
(Array.isArray(BOOK.objets) ? BOOK.objets : []).forEach((x, i) => {
  if (!x || !x.nom || !x.phrase) return;
  const j = wordIn(x.phrase, x.mot);
  if (j >= 0) GAMES.push({ key: 'o' + i, kind: 'objet', j, x });
});
// version 49 : les tableaux d'époque sont des pastilles, ancrées dans le texte de leur chapitre
// v81 : TABS = le tableau de chaque chapitre (clé : le numéro du chapitre) + les autres (BOOK.tableaux, clé « x0 »…), dans l'ordre du texte
const TABS = (() => {
  const out = [];
  AVANT.forEach((a, ci) => { if (a) out.push({ a, ci, key: ci, gk: 't' + ci }); });
  (Array.isArray(BOOK.tableaux) ? BOOK.tableaux : []).forEach((a, i) => { if (a && a.img && CHAPS[a.chapitre | 0]) out.push({ a, ci: a.chapitre | 0, key: 'x' + i, gk: 'tx' + i }); });
  out.forEach((t) => { t.j = t.a.phrase ? wordIn(t.a.phrase, t.a.mot) : -1; });
  return out.sort((p, q) => p.ci - q.ci || (p.j < 0 ? 1e9 : p.j) - (q.j < 0 ? 1e9 : q.j));
})();
TABS.forEach((t) => {
  if (!t.a.img || t.j < 0) return;
  GAMES.push({ key: t.gk, kind: 'tableau', j: t.j, x: { nom: paintingOf(t.a).titre, ci: t.ci, a: t.a, tk: t.key } });
});
GAMES.sort((a, b) => a.j - b.j);
// version 49 : au plus 4 cartes par épisode ; on garde d'abord le tableau, puis une carte de chaque sorte, puis les premières
const PIECES_MAX = 4;
{
  const byE = new Map();
  GAMES.forEach((g) => { const e = EPI[g.j]; if (!byE.has(e)) byE.set(e, []); byE.get(e).push(g); });
  const drop = new Set();
  byE.forEach((list) => {
    if (list.length <= PIECES_MAX) return;
    const keep = [], kinds = new Set();
    const take = (g) => { keep.push(g); kinds.add(g.kind); };
    list.filter((g) => g.kind === 'tableau').forEach(take);
    list.forEach((g) => { if (keep.length < PIECES_MAX && !keep.includes(g) && !kinds.has(g.kind)) take(g); });
    list.forEach((g) => { if (keep.length < PIECES_MAX && !keep.includes(g)) take(g); });
    list.forEach((g) => { if (!keep.includes(g)) drop.add(g); });
  });
  [GAMES, LIEU_G, MOT_G].forEach((arr) => { for (let i = arr.length - 1; i >= 0; i--) if (drop.has(arr[i])) arr.splice(i, 1); });
}
const FREE = (g) => g.kind === 'savoir' || g.kind === 'prix' || g.kind === 'tableau' || g.kind === 'objet';
const isWord = (g) => g.kind === 'etymo' || g.kind === 'sens';
const learnList = () => GAMES.filter((g) => g.kind !== 'epq' && S.jeux[g.key]);
const learnedN = () => learnList().length;
const learnLine = (n) => (n > 1 ? fmtInt(n) + ' choses apprises' : n === 1 ? '1 chose apprise' : 'Rien encore') + ' sur ' + YEAR;
// jusqu'où le lecteur est allé (position, ou fin du dernier épisode lu)
function reachK() {
  let r = k;
  EPS.forEach((ep, e) => { if (S.eps[e] && S.eps[e].done) r = Math.max(r, ep.z); });
  return r;
}

// --- euros d'aujourd'hui : ordre de grandeur, arrondi ---
function euroOf(f) {
  const v = f * REPERE.coef;
  if (v < 1) return 'environ ' + Math.max(5, Math.round(v * 20) * 5) + ' centimes';
  const step = v < 20 ? 1 : v < 200 ? 5 : v < 2000 ? 10 : v < 20000 ? 100 : 1000;
  return 'environ ' + fmtInt(Math.round(v / step) * step) + ' €';
}
function euroLine(x) {
  if (x.par === 'an') return euroOf(x.f) + ' par an' + (x.mois ? ', soit ' + euroOf(x.f / 12).replace('environ ', '') + ' par mois' : '');
  if (x.par === 'mois') return euroOf(x.f) + ' par mois';
  return euroOf(x.f);
}

// --- pastilles et cartes ---
Object.assign(GAME_ICO, {
  savoir: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M16 3.5a8.6 8.6 0 00-5 15.6c1 .8 1.6 1.8 1.6 3V23h6.8v-.9c0-1.2.6-2.2 1.6-3A8.6 8.6 0 0016 3.5z"/><path class="g3" d="M12.8 26.2h6.4M13.8 29h4.4"/><path class="g2" d="M14.6 9.5a4.4 4.4 0 00-3.2 4"/></svg>',
  prix: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="g1" cx="16" cy="16" r="12.5"/><circle class="g3" cx="16" cy="16" r="9.3"/><text x="16" y="20.4" text-anchor="middle">€</text></svg>'
});
Object.assign(GAME_LAB, { savoir: 'À savoir', prix: 'Le prix d’aujourd’hui' });
{
  const ga = gameAria;
  gameAria = function (g) {
    if (g.kind === 'savoir') return 'À savoir : ' + g.x.nom;
    if (g.kind === 'prix') return 'Le prix d’aujourd’hui : ' + g.x.somme;
    return ga(g);
  };
  const gh = gameHead;
  gameHead = function (g) {
    if (g.kind === 'savoir') return [el('span', 'mc-lab', 'À savoir'), el('strong', 'gm-q', g.x.nom)];
    if (g.kind === 'prix') return [el('span', 'mc-lab', 'Le prix d’aujourd’hui'), el('strong', 'gm-q', g.x.nom)];
    return gh(g);
  };
}
function prixBox(x) {
  const box = el('div', 'px-row');
  const a = el('div', 'px-c'); a.append(el('small', '', 'En ' + YEAR), el('b', '', x.somme));
  const arr = el('span', 'px-arr', '→'); arr.setAttribute('aria-hidden', 'true');
  const b = el('div', 'px-c now'); b.append(el('small', '', 'Aujourd’hui'), el('b', '', euroLine(x).replace(/^environ /, '≈ ')));
  box.append(a, arr, b);
  return box;
}
const repereTxt = () => 'Ordre de grandeur : 1 franc de ' + REPERE.an + ' vaut environ ' + String(REPERE.coef).replace('.', ',') + ' € de ' + REPERE.ref
  + '. Le convertisseur de l’Insee ne remonte pas avant ' + REPERE.an + ' ; les prix de ' + YEAR + ' en étaient proches.';
GAME_BUILD.savoir = function (body, g) { body.append(el('p', 'sv-txt', g.x.txt)); };
GAME_BUILD.prix = function (body, g) { body.append(prixBox(g.x)); if (g.x.txt) body.append(el('p', 'sv-txt', g.x.txt)); };
function shareOf(g) {
  const x = g.x;
  if (g.kind === 'savoir') return 'Le savais-tu ? ' + x.txt + ' Découvert en lisant ' + BY() + '.';
  if (g.kind === 'prix') return 'Dans ' + BY() + ', ' + x.somme + ', c’est ' + euroLine(x) + ' d’aujourd’hui. Tu aurais deviné ?';
  return '';
}
function srcLine(t) { const p = el('p', 'gm-src'); p.append(el('span', '', 'Source : '), t); return p; }
{
  const og = openGame;
  openGame = function (g) {
    og(g);
    if (!g || gameOpen !== g || !FREE(g)) return;
    // rien à répondre : la découverte est faite dès l'ouverture, sans points
    gameResult(g, true, 0);
    gameFeedback(true, '', '', shareOf(g));
    const box = byId('gameC');
    const foot = $('.gm-foot', box); if (foot) foot.remove();
  };
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    gf(good, head, text, share);
    const g = gameOpen;
    const fb = $('#gameC .gm-fb');
    if (!g || !fb) return;
    if (FREE(g)) {
      fb.classList.add('free');
      const h = $('.qz-fb-h', fb); if (h) h.remove();
      const inf = $('.gm-info', fb); if (inf && !inf.textContent) inf.remove();
      fb.prepend(srcLine(g.kind === 'prix' ? REPERE.src : (g.x.src || BOOK.titre)));
      if (g.kind === 'prix') fb.prepend(el('p', 'gm-rep', repereTxt()));
    } else if (g.x && g.x.src) {
      const inf = $('.gm-info', fb);
      const s = srcLine(g.x.src);
      if (inf) inf.after(s); else fb.prepend(s);
    }
  };
}

// --- fin d'épisode : ce qu'on a appris, sans la vitesse ---
function epLearn(e) {
  const gs = GAMES.filter((g) => g.kind !== 'epq' && EPI[g.j] === e && S.jeux[g.key]);
  const mots = gs.filter(isWord).length;
  return { dec: gs.length - mots, mots };
}
function learnTxt(e) {
  const r = epLearn(e);
  const parts = [];
  if (r.dec) parts.push(nb(r.dec, 'découverte', 'découvertes'));
  if (r.mots) parts.push(nb(r.mots, 'mot ancien', 'mots anciens'));
  return parts.length ? 'Dans cet épisode : ' + parts.join(', ') : '';
}
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    const w = info.wpm; info.wpm = 0;
    fe(box, info, isLast);
    info.wpm = w;
    const t = learnTxt(info.e);
    const tot = box.querySelector('.ee-total');
    if (!tot) return;
    const x = el('div', 'ee-learn');
    x.style.setProperty('--i', tot.style.getPropertyValue('--i') || '2');
    const ic = el('span', 'ee-l-ic'); ic.innerHTML = GAME_ICO.savoir;
    const tx = el('span', 'ee-l-t');
    if (t) tx.append(el('b', '', t), el('span', '', ' · ' + learnLine(learnedN()).toLowerCase()));
    else tx.append(el('span', '', learnLine(learnedN())));
    x.append(ic, tx);
    tot.after(x);
  };
}
cheerFor = function (e) {
  const n = S.epN || 0;
  if (!n || n % 6) return '';
  const left = chapOfEp(e).eps.length - 1 - EPS[e].i;
  if (left === 1) return 'Plus qu’un épisode : la fin du ' + UNIT + ' est tout près !';
  if (left >= 2 && left <= 3) return 'Encore un peu ! Tu es presque à la fin du ' + UNIT + '.';
  const list = [n + ' épisodes lus. Bravo !'];
  const L = learnedN();
  if (L >= 3) list.push(learnLine(L) + ' : tu connais déjà bien l’époque.');
  const st = streakNow();
  if (st >= 2) list.push(st + ' jours de lecture d’affilée. Continue !');
  return list[(n / 6) % list.length];
};
{
  const cc = chapterCheer;
  chapterCheer = function (e) {
    const r = cc(e);
    const ch = chapOfEp(e);
    const n = GAMES.filter((g) => g.kind !== 'epq' && g.j >= ch.a && g.j <= ch.z && S.jeux[g.key]).length;
    if (n) r.stats += ' · ' + nb(n, 'découverte', 'découvertes');
    return r;
  };
}

// --- Avant de lire : la première page de chaque chapitre ---
const avSheet = el('div', 'sheet avsheet'); avSheet.id = 'avantSheet'; avSheet.hidden = true;
avSheet.innerHTML = '<div class="sheet-back"></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="avTitle">'
  + '<figure class="av-fig" id="avFig"><img id="avImg" alt=""><figcaption id="avCap"></figcaption></figure>'
  + '<div class="av-txt"><p class="eyebrow" id="avEb"></p><h2 id="avTitle"></h2><dl class="av-dl" id="avDl"></dl></div>'
  + '<div class="actions av-act"><button class="btn primary" type="button" id="avGo"></button><button class="btn" type="button" id="avSkip">Passer</button></div></div>';
document.body.append(avSheet);
let avOpen = null;   // { ci, then }
function avantDueAt(j) {
  for (let ci = 0; ci < CHAPS.length; ci++) {
    const ch = CHAPS[ci];
    if (AVANT[ci] && !S.avant[ci] && j >= ch.a && j <= ch.a + 2) return ci;
  }
  return -1;
}
function showAvant(ci, then, t) {
  const a = t ? t.a : AVANT[ci];
  if (!a) return;
  avOpen = { ci, then: then || null };
  S.avant[t ? t.key : ci] = 1; persist();
  const img = $('#avImg', avSheet), fig = $('#avFig', avSheet);
  fig.hidden = !a.img;
  if (a.img) { img.src = a.img; img.alt = a.tableau || ''; }
  $('#avCap', avSheet).replaceChildren(el('span', '', a.tableau || ''), a.musee ? el('small', '', a.musee) : '');
  $('#avEb', avSheet).textContent = (isPhoto(a) ? 'Photo d’époque · ' : 'Avant de lire · ') + chapLabel(CHAPS[ci]);
  $('#avTitle', avSheet).textContent = a.titre || '';
  const dl = $('#avDl', avSheet);
  dl.replaceChildren();
  [['Où', a.ou], ['Quand', a.quand], ['En France', a.france]].forEach(([t, d]) => { if (d) dl.append(el('dt', '', t), el('dd', '', d)); });
  $('#avGo', avSheet).textContent = then ? 'Commencer la lecture' : 'Fermer';
  $('#avSkip', avSheet).hidden = !then;
  avSheet.hidden = false;
  avSheet.classList.remove('in'); void avSheet.offsetWidth; avSheet.classList.add('in');
  $('.panel', avSheet).scrollTop = 0;
  SFX.soft();
  setTimeout(() => { const b = $('#avGo', avSheet); if (b && !avSheet.hidden) b.focus({ preventScroll: true }); }, 60);
}
function closeAvant(go) {
  if (!avOpen) return;
  const a = avOpen; avOpen = null;
  avSheet.hidden = true;
  if (go && a.then && !byId('reader').hidden) { unlockAudio(); if (typeof a.then === 'function') a.then(); else play(); }
}
$('#avGo', avSheet).addEventListener('click', () => closeAvant(true));
$('#avSkip', avSheet).addEventListener('click', () => closeAvant(true));
$('.sheet-back', avSheet).addEventListener('click', () => closeAvant(true));
{
  const pl = play;
  play = function () {
    if (!playing && !avOpen && !byId('reader').hidden && S.read !== 'texte') {
      const ci = avantDueAt(k);
      if (ci >= 0) { showAvant(ci, true); return; }
    }
    pl();
  };
  const fc = firstCountdown;
  firstCountdown = function () {
    const ci = avantDueAt(k);
    if (ci >= 0 && S.read !== 'texte') { showAvant(ci, () => fc()); return; }
    fc();
  };
  const tk = tick;
  tick = function () {
    if (playing && !inter && !avOpen && !speedHack) {
      const ci = avantDueAt(k);
      if (ci >= 0) { const e0 = EPI[k], before = epPaused[e0]; pause(); epPaused[e0] = before; showAvant(ci, true); return; }
    }
    tk();
  };
  const cs = closeSheets;
  closeSheets = function () { cs(); if (avOpen) { avOpen = null; avSheet.hidden = true; } };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && avOpen) closeAvant(true); });

// page du livre : le contexte de chaque chapitre, à revoir quand on veut
{
  const sec = el('section', 'bp-avant'); sec.id = 'bpAvant';
  byId('bpTeaser').after(sec);
  const rc = refreshCover;
  refreshCover = function () {
    rc();
    sec.hidden = !AVANT.length;
    sec.replaceChildren(el('p', 'eyebrow sect-label', 'Avant de lire'));
    const row = el('div', 'av-chips');
    AVANT.forEach((a, ci) => {
      if (!CHAPS[ci]) return;
      const b = el('button', 'av-chip'); b.type = 'button';
      if (a.img) { const im = new Image(); im.src = a.img; im.alt = ''; im.decoding = 'async'; b.append(im); }
      const t = el('span', ''); t.append(el('small', '', chapLabel(CHAPS[ci])), el('b', '', a.titre));
      b.append(t);
      b.addEventListener('click', () => showAvant(ci, false));
      row.append(b);
    });
    sec.append(row);
    const how = byId('how');
    if (how && !$('.how-v43', how)) {
      const li = el('li', 'how-v43');
      li.append(el('b', '', 'En chemin :'), ' des « À savoir », le prix des choses en euros d’aujourd’hui, et dans le Carnet une frise et ' + (PD ? PD_T.charAt(0).toLowerCase() + PD_T.slice(1) : IMM ? 'le plan de la maison' : 'les lieux du roman') + '.');
      how.append(li);
    }
  };
}

// --- la frise : les dates découvertes en lisant ---
function friseItems() {
  const out = [{ an: YEAR, t: BOOK.ici || BOOK.titre + ' paraît', here: true, got: true }];
  if (BOOK.annee && BOOK.annee !== YEAR) out.push({ an: BOOK.annee, t: AUTEUR_NOM + ' publie ' + BOOK.titre, got: true });
  SAV.forEach((x, i) => { if (x && x.an && x.frise) out.push({ an: x.an, t: x.frise, got: !!S.jeux['k' + i], key: 'k' + i }); });
  TABS.forEach(({ a, key }) => { if (a && a.an && a.frise) out.push({ an: a.an, t: a.frise, got: !!S.avant[key] }); });
  (BOOK.frise || []).forEach((x) => { if (x && x.an && x.t) out.push({ an: x.an, t: x.t, got: !!(x.cle && S.jeux[x.cle]) }); });
  GAMES.forEach((g) => {
    if (g.kind !== 'existait') return;
    g.x.cartes.forEach((c) => { if (c && c.an) out.push({ an: c.an, t: c.t, got: !!S.jeux[g.key] }); });
  });
  // un même événement, une seule fois
  const seen = new Set();
  return out.filter((x) => { const id = x.an + '|' + normTxt(x.t); if (seen.has(id)) return false; seen.add(id); return true; })
    .sort((a, b) => a.an - b.an || (a.here ? 1 : 0) - (b.here ? 1 : 0));
}
function fillFrise() {
  const box = byId('cnFrise');
  const all = friseItems();
  const got = all.filter((x) => x.got);
  const left = all.length - got.length;
  const ol = el('ol', 'frise');
  got.forEach((x) => {
    const li = el('li', x.here ? 'here' : x.an > YEAR ? 'after' : '');
    const yr = el('span', 'fr-y', String(x.an));
    const tx = el('span', 'fr-t');
    tx.append(el('b', '', x.t));
    if (x.here) tx.append(el('small', '', 'Tu es ici'));
    else if (x.an > YEAR) tx.append(el('small', '', 'dans ' + (x.an - YEAR) + ' an' + (x.an - YEAR > 1 ? 's' : '') + ' : pas encore là'));
    else tx.append(el('small', '', 'il y a ' + (YEAR - x.an) + ' an' + (YEAR - x.an > 1 ? 's' : '')));
    li.append(yr, el('i', 'fr-dot'), tx);
    ol.append(li);
  });
  box.replaceChildren(
    el('p', 'cn-lead', 'Les dates rencontrées en lisant, autour de ' + YEAR + (BOOK.annee && BOOK.annee !== YEAR ? ', l’année où commence ' : ', l’année où paraît ') + BOOK.titre + '.'),
    ol,
    el('p', 'empty', left ? 'Encore ' + nb(left, 'date', 'dates') + ' à découvrir dans les « À savoir » et les jeux.' : 'Toutes les dates du livre sont là.'));
}

// --- le Paris de Duroy : les lieux s'ajoutent au fil de la lecture ---
const NS = 'http://www.w3.org/2000/svg';
const PD_ET = PD ? (PD.etapes || []).map((x) => ({ id: x.lieu, j: wordIn(x.phrase, x.mot) })).filter((x) => x.j >= 0 && PD.lieux[x.id]) : [];
function pdPt(id) { const L = PD.lieux[id], G = PD.geo; return [(L.lon - G.lon0) * G.kx, (G.lat0 - L.lat) * G.ky]; }
function pdReached() {
  const r = reachK();
  const et = PD_ET.filter((x) => x.j <= r);
  const order = [];
  et.forEach((x) => { if (!order.includes(x.id)) order.push(x.id); });
  return { et, order };
}
function svgEl(tag, attrs, parent) { const x = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([a, v]) => x.setAttribute(a, v)); if (parent) parent.append(x); return x; }
function parisSvg(onPick) {
  const G = PD.geo;
  const { et, order } = pdReached();
  const vb = G.vue || G.vb;
  const svg = svgEl('svg', { viewBox: vb.join(' '), class: 'pd-map', role: 'img', 'aria-label': 'Plan de Paris : les lieux de ' + BOOK.titre });
  svgEl('rect', { x: vb[0] - 50, y: vb[1] - 50, width: vb[2] + 100, height: vb[3] + 100, class: 'pd-bg' }, svg);
  G.arr.forEach((d) => svgEl('path', { d, class: 'pd-arr' }, svg));
  svgEl('path', { d: G.seine, class: 'pd-seine' }, svg);
  (G.noms || []).forEach((n) => { const t = svgEl('text', { x: n.x, y: n.y, class: 'pd-lab' + (n.eau ? ' eau' : '') }, svg); t.textContent = n.t; });
  if (et.length > 1) {
    const pts = et.map((x) => pdPt(x.id));
    let d = 'M' + pts[0].join(' ');
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2 - (y1 - y0) * .18, my = (y0 + y1) / 2 + (x1 - x0) * .18;   // un trajet légèrement courbé
      d += ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
    }
    svgEl('path', { d, class: 'pd-route' }, svg);
  }
  order.forEach((id, n) => {
    const [x, y] = pdPt(id);
    const g = svgEl('g', { class: 'pd-pin' + (n === order.length - 1 ? ' last' : ''), tabindex: '0', role: 'button', 'aria-label': (n + 1) + ' : ' + PD.lieux[id].nom }, svg);
    g.dataset.lieu = id;
    svgEl('circle', { cx: x, cy: y, r: 7.5 }, g);
    const t = svgEl('text', { x, y: y + 3.4 }, g); t.textContent = String(n + 1);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); onPick(id); });
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(id); } });
  });
  return svg;
}
function fillParis(host) {
  host.replaceChildren();
  if (!PD) return;
  const { order } = pdReached();
  const total = Object.keys(PD.lieux).length;
  const wrap = el('div', 'pd-wrap');
  const list = el('ol', 'pd-list');
  const pick = (id) => {
    $$('.pd-pin', wrap).forEach((p) => p.classList.toggle('on', p.dataset.lieu === id));
    $$('li', list).forEach((li) => li.classList.toggle('on', li.dataset.lieu === id));
    const li = list.querySelector('[data-lieu="' + id + '"]');
    if (li) li.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
  };
  wrap.append(parisSvg(pick));
  host.append(el('p', 'cn-lead', order.length ? 'Le trajet ' + deNom(CAST[POV] ? shortName(POV) : 'du héros') + ', dans l’ordre du livre. Touche un numéro.' : 'Les lieux du roman apparaîtront ici au fil de ta lecture.'), wrap);
  order.forEach((id, n) => {
    const L = PD.lieux[id];
    const li = el('li'); li.dataset.lieu = id;
    const first = PD_ET.find((x) => x.id === id);
    li.append(el('span', 'pd-n', String(n + 1)));
    const t = el('div', 'pd-t'); t.append(el('strong', '', L.nom), el('p', '', L.txt || ''));
    const src = el('div', 'src'); src.append(el('span', '', where(first.j)), smallBtn('Lire ici', () => goRead(first.j)));
    t.append(src);
    li.append(t);
    li.addEventListener('click', (ev) => { if (!ev.target.closest('button')) pick(id); });
    list.append(li);
  });
  host.append(list);
  if (order.length < total) host.append(el('p', 'empty', 'Encore ' + nb(total - order.length, 'lieu', 'lieux') + ' à découvrir en lisant.'));
  host.append(el('p', 'cmp-src', 'Fond de carte : les vingt arrondissements de Paris (les mêmes qu’en ' + YEAR + ') ; emplacements approchés.'));
}

// --- le Carnet : Découvertes, Frise, Le Paris de Duroy ---
{
  const panel = $('#carnetSheet .panel');
  const mk = (id, inner) => { const s = el('section', 'pane'); s.dataset.pane = id; s.hidden = true; s.innerHTML = inner; panel.append(s); return s; };
  mk('decouv', '<div id="cnDecouv"></div>');
  mk('frise', '<div id="cnFrise"></div>');
  const lp = $('#carnetSheet [data-pane="lieux"]');
  const pdBox = el('div', 'pd-box'); pdBox.id = 'cnParis';
  lp.prepend(pdBox);
  const h = el('h3', 'eyebrow sect-label pd-ail', 'Ailleurs, sur la carte'); h.id = 'lieuAilLab';
  pdBox.after(h);
}
const ICO_FRISE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18"/><circle cx="6" cy="12" r="2"/><circle cx="12.5" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/><path d="M6 9.8V6M12.5 14.2V18M18.5 9.8V6"/></svg>';
const ICO_PARIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>';
{
  const i = CN.findIndex((c) => c.id === 'lieux');
  if (i >= 0) { CN[i].t = PD ? PD_T : IMM ? (IMM.court || 'La maison') : 'Les lieux'; CN[i].ic = ICO_PARIS; }
  const at = CN.findIndex((c) => c.id === 'marques') + 1;
  CN.splice(at, 0, { id: 'decouv', t: 'Découvertes', ic: GAME_ICO.savoir.replace('viewBox="0 0 32 32"', 'viewBox="0 0 32 32" class="dc32"') }, { id: 'frise', t: 'Frise', ic: ICO_FRISE });
  // ordre : marque-pages, découvertes, frise, Paris, puis le reste
  const li = CN.findIndex((c) => c.id === 'lieux');
  if (li > 3) { const [x] = CN.splice(li, 1); CN.splice(3, 0, x); }
}
{
  const cc = cnCount;
  cnCount = function (id) {
    if (id === 'decouv') return learnLine(learnedN());
    if (id === 'frise') { const n = friseItems().filter((x) => x.got && !x.here).length; return nb(n, 'date', 'dates'); }
    if (id === 'lieux' && PD) { const n = pdReached().order.length; return n + ' sur ' + Object.keys(PD.lieux).length + ' lieux'; }
    if (id === 'lieux' && IMM) { const n = immReached().size; return n + ' sur ' + Object.keys(IMM.logements).length + ' logements'; }
    return cc(id);
  };
  const bm = buildMenu;
  buildMenu = function () {
    bm();
    const d = $('#cnMenu [data-cn="decouv"]'); if (d) d.classList.add('wide', 'learn');
  };
  const cg = cnGo;
  cnGo = function (id) {
    cg(id);
    if (id === 'decouv') fillDecouv();
    if (id === 'frise') fillFrise();
  };
  const fl = fillLieux;
  fillLieux = function () {
    fl();
    fillParis(byId('cnParis'));
    const any = LIEU_G.some((g) => S.jeux[g.key]);
    byId('lieuAilLab').hidden = !any;
    byId('lieuEmpty').hidden = true;
  };
}
function dcItem(g, passed) {
  const x = g.x;
  const li = el('li', 'dc-item ' + g.kind + (passed ? ' pass' : ''));
  const h = el('div', 'mt-h');
  h.append(el('strong', '', g.kind === 'prix' ? x.somme : x.nom), el('span', 'dc-pos', ({ savoir: 'à savoir', prix: 'prix', histoire: 'histoire', curseur: 'en chiffres', existait: 'inventions', lieu: 'lieu', etymo: 'mot', sens: 'mot' })[g.kind] || ''));
  li.append(h);
  if (passed) {
    li.append(el('p', 'mt-d', 'Passé pendant la lecture.'));
    const b = smallBtn('Découvrir', () => { S.jeux[g.key] = { ok: true, at: Date.now() }; persist(); fillDecouv(); buzz(8); });
    const src = el('div', 'src'); src.append(el('span', '', where(g.j)), b); li.append(src);
    return li;
  }
  if (g.kind === 'prix') { li.append(prixBox(x)); if (x.txt) li.append(el('p', 'mt-d', x.txt)); }
  else if (g.kind === 'savoir') li.append(el('p', 'mt-d', x.txt));
  else if (g.kind === 'curseur') li.append(el('p', 'mt-d', x.info || ''));
  else if (g.kind === 'existait') li.append(el('p', 'mt-d', x.cartes.map((c) => c.t + ' (' + c.an + ')').join(' · ')));
  else li.append(el('p', 'mt-d', (x.choix ? x.choix[x.ok | 0] + '. ' : '') + (x.info || '')));
  const s = g.kind === 'prix' ? REPERE.src : x.src;
  if (s) li.append(el('p', 'dc-src', 'Source : ' + s));
  const src = el('div', 'src'); src.append(el('span', '', where(g.j)), smallBtn('Lire ici', () => goRead(g.j)));
  li.append(src);
  return li;
}
function fillDecouv() {
  const box = byId('cnDecouv');
  const L = learnedN();
  const r = reachK();
  const head = el('div', 'dc-head');
  head.append(el('b', '', fmtInt(L)), el('span', '', (L > 1 ? 'choses apprises' : 'chose apprise') + ' sur ' + YEAR + ' en lisant ' + BOOK.titre));
  const parts = [head];
  // avant de lire
  if (AVANT.length) {
    const sec = el('section', 'dc-sec');
    sec.append(el('h3', 'eyebrow sect-label', 'Avant de lire'));
    const row = el('div', 'av-chips');
    AVANT.forEach((a, ci) => {
      if (!CHAPS[ci]) return;
      const b = el('button', 'av-chip'); b.type = 'button';
      if (a.img) { const im = new Image(); im.src = a.img; im.alt = ''; im.decoding = 'async'; b.append(im); }
      const t = el('span', ''); t.append(el('small', '', chapLabel(CHAPS[ci])), el('b', '', a.titre));
      b.append(t);
      b.addEventListener('click', () => showAvant(ci, false));
      row.append(b);
    });
    sec.append(row);
    parts.push(sec);
  }
  const groups = [
    ['À savoir', (g) => g.kind === 'savoir'],
    ['Le prix d’aujourd’hui', (g) => g.kind === 'prix'],
    ['Histoire, chiffres et inventions', (g) => g.kind === 'histoire' || g.kind === 'curseur' || g.kind === 'existait']
  ];
  let passedN = 0;
  groups.forEach(([t, f]) => {
    const got = GAMES.filter((g) => f(g) && S.jeux[g.key]);
    const passed = GAMES.filter((g) => f(g) && FREE(g) && !S.jeux[g.key] && g.j < r && !(gameOpen === g));
    passedN += passed.length;
    if (!got.length && !passed.length) return;
    const sec = el('section', 'dc-sec');
    sec.append(el('h3', 'eyebrow sect-label', t + ' · ' + got.length));
    const ul = el('ul', 'hearts mots-list dc-list');
    got.forEach((g) => ul.append(dcItem(g, false)));
    passed.forEach((g) => ul.append(dcItem(g, true)));
    sec.append(ul);
    parts.push(sec);
  });
  const more = el('p', 'empty');
  more.textContent = L ? 'Les lieux, les mots et les dates ont aussi leur page dans le Carnet.'
    : 'En lisant, les « À savoir » et les prix d’époque montent dans ton Carnet : tu les découvres à la fin de chaque épisode, puis ils se rangent ici.';
  parts.push(more);
  box.replaceChildren(...parts);
}

// --- accueil : la promesse, le catalogue par époque, « bientôt » ---
const CATL = LIB.catalogue.livres;
const EPOQUES = Array.isArray(LIB.catalogue.epoques) ? LIB.catalogue.epoques : [];
const catOf = (id) => CATL.find((x) => x.id === id) || {};
const epoqueOf = (id) => EPOQUES.find((p) => p.id === catOf(id).epoque) || null;
const isSoon = (b) => b.id !== BOOK.id && !b.file;
nextLocked = function () { return null; };
newUnlocks = function () { return []; };
{
  const bs = bookState;
  bookState = function (b) { return isSoon(b) ? 'soon' : bs(b); };
  const bt = bookStatus;
  bookStatus = function (b) { if (isSoon(b)) return S.wish.includes(b.id) ? 'Sur ta liste' : 'Bientôt'; return bt(b); };
  const ce = coverEl;
  coverEl = function (b, bare) {
    const w = ce(b, bare);
    if (isSoon(b)) {
      w.classList.remove('lock');
      $$('.bk-badge', w).forEach((x) => x.remove());
      if (!bare) { const s = el('span', 'bk-badge soon' + (S.wish.includes(b.id) ? ' wish' : ''), S.wish.includes(b.id) ? '♥ Sur ta liste' : 'Bientôt'); w.append(s); }
    }
    return w;
  };
  const tap = bookTap;
  bookTap = function (b) { if (isSoon(b)) { openSoon(b); return; } tap(b); };
}
// la feuille d'un livre à venir : on peut dire qu'on veut le lire
const soonSheet = el('div', 'sheet soonsheet'); soonSheet.id = 'soonSheet'; soonSheet.hidden = true;
soonSheet.innerHTML = '<div class="sheet-back" data-close></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="soonTitle">'
  + '<div class="panel-head"><p class="eyebrow" id="soonEb">Bientôt</p><button class="ghost" type="button" data-close>Fermer</button></div>'
  + '<div class="soon-top"><div id="soonCv"></div><div><h2 id="soonTitle"></h2><p class="soon-by" id="soonBy"></p><p class="soon-ep" id="soonEp"></p></div></div>'
  + '<p class="teaser" id="soonTx"></p><button class="btn primary" type="button" id="soonWish"></button><p class="tile-small" id="soonNote"></p></div>';
document.body.append(soonSheet);
$$('[data-close]', soonSheet).forEach((b) => b.addEventListener('click', closeSheets));
let soonB = null;
function paintSoon() {
  const b = soonB; if (!b) return;
  const on = S.wish.includes(b.id);
  byId('soonWish').textContent = on ? '♥ Sur ta liste · retirer' : 'Je veux le lire';
  byId('soonWish').classList.toggle('on', on);
  byId('soonNote').textContent = on ? 'Noté. Les livres les plus demandés arriveront en premier.' : 'Dis-nous lequel tu veux lire : les plus demandés arriveront en premier.';
}
function openSoon(b) {
  soonB = b;
  const p = epoqueOf(b.id);
  byId('soonCv').replaceChildren(coverEl(b, true));
  byId('soonTitle').textContent = b.t;
  byId('soonBy').textContent = b.a + ' · ' + b.y;
  byId('soonEp').textContent = p ? p.nom + (p.annees ? ' · ' + p.annees : '') : '';
  byId('soonTx').textContent = b.x || '';
  paintSoon();
  openSheet('#soonSheet');
}
byId('soonWish').addEventListener('click', () => {
  const b = soonB; if (!b) return;
  const i = S.wish.indexOf(b.id);
  if (i >= 0) S.wish.splice(i, 1); else { S.wish.push(b.id); buzz(10); SFX.soft(); }
  persist(); paintSoon(); refreshHome();
});
// accueil
{
  const tiles = $('#home .tiles');
  const lt = byId('levelTile'); lt.hidden = true;
  const tile = el('button', 'tile learn-tile'); tile.type = 'button'; tile.id = 'learnTile';
  tile.innerHTML = '<span class="tile-lab">Tes découvertes</span><span class="lt-row"><span class="lt-ic" aria-hidden="true">' + GAME_ICO.savoir + '</span><span><span class="tile-big" id="learnBig"></span><span class="tile-small" id="learnSmall"></span></span></span>';
  tiles.append(tile);
  tile.addEventListener('click', () => openCarnet('decouv'));
  byId('nextBkRow').hidden = true;
  const mine = byId('shelfMine').closest('section'), locked = byId('shelfLocked').closest('section');
  mine.hidden = true; locked.hidden = true;
  const ep = el('section', 'epochs'); ep.id = 'epochs';
  locked.after(ep);
  const f = $('[data-filter="lock"]'); if (f) { f.textContent = 'Bientôt'; f.dataset.filter = 'soon'; }
}
function epochShelves(filter) {
  const out = [];
  const used = new Set();
  const groups = EPOQUES.map((p) => ({ p, books: BOOKS.filter((b) => catOf(b.id).epoque === p.id) }));
  const rest = BOOKS.filter((b) => !EPOQUES.some((p) => p.id === catOf(b.id).epoque));
  if (rest.length) groups.push({ p: { id: 'autres', nom: 'Autres classiques', annees: '', txt: '' }, books: rest });
  groups.forEach(({ p, books }) => {
    const list = books.filter((b) => !used.has(b.id) && (!filter || filter === 'tous' || (filter === 'soon' ? isSoon(b) : !isSoon(b))));
    if (!list.length) return;
    list.forEach((b) => used.add(b.id));
    const s = el('section', 'epoch');
    const h = el('div', 'ep-h');
    const tt = el('h2', '', p.nom);
    h.append(tt);
    if (p.annees) h.append(el('span', 'ep-y', p.annees));
    s.append(h);
    if (p.txt) s.append(el('p', 'ep-t', p.txt));
    const shelf = el('div', 'shelf');
    list.forEach((b) => shelf.append(bookCard(b)));
    s.append(shelf);
    out.push(s);
  });
  return out;
}
{
  const rh = refreshHome;
  refreshHome = function () {
    rh();
    byId('helloSub').textContent = PROMESSE;
    const L = learnedN();
    byId('learnBig').textContent = fmtInt(L);
    byId('learnSmall').textContent = (L > 1 ? 'choses apprises' : 'chose apprise') + ' sur ' + YEAR;
    const ep = byId('epochs');
    const head = el('div', 'row-h'); head.append(el('h2', 'ep-main', 'Voyager par époque'));
    const all = el('button', '', 'Tout voir'); all.type = 'button'; all.addEventListener('click', () => setView('biblio'));
    head.append(all);
    ep.replaceChildren(head, ...epochShelves('tous'));
  };
  const rl = renderLibrary;
  renderLibrary = function () {
    rl();
    const g = byId('libGrid');
    g.classList.add('by-epoch');
    g.replaceChildren(...epochShelves(libFilter));
    const sn = byId('storeNote'); if (sn && /débloques/.test(sn.textContent)) sn.textContent = 'Chaque livre se télécharge à part, puis reste lisible sans connexion.';
    $$('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filter === libFilter)));
  };
  const rp = renderProgress;
  renderProgress = function () {
    rp();
    const cells = $$('#statGrid > div');
    const c = cells[4];
    if (c) { const L = learnedN(); c.replaceChildren(el('b', '', fmtInt(L)), el('span', '', (L > 1 ? 'choses apprises' : 'chose apprise') + ' sur ' + YEAR)); }
    const cr = $('#home [data-view="progres"] .credits');
    if (cr) cr.textContent = '1 mot lu = 1 point. Les épisodes lus d’une traite, les jeux et les bonus surprise rapportent des points en plus ; ils font monter ton niveau. Les « À savoir » et les prix ne rapportent pas de points : ils se rangent dans tes découvertes.';
  };
}
/* ================= Version 44 : un accueil simple, et un musée des découvertes =================
   – accueil : la lecture en cours d'abord, un mot de bienvenue pour un nouveau lecteur, l'aperçu des découvertes,
     le Flash quiz, une frise des époques (on touche une époque : ses livres apparaissent) ; plus d'objectif du jour ;
   – bouton Apparence (couleurs et clair/sombre) en haut de l'accueil ; Encre bleue par défaut ;
   – onglet Découvertes (à la place de Progrès) : un musée en salles (tableaux, phrases cultes, mots, anecdotes,
     dates, lieux, personnages) et le Flash quiz sur ce qu'on a découvert ;
   – bibliothèque : une barre de recherche ;
   – boutons retour plus gros dans le lecteur et sur la page du livre. */

// --- Encre bleue par défaut (une fois pour tout le monde ; on peut revenir à Terre cuite dans Apparence ou dans Aa) ---
if (S.palV !== 44) { S.palette = 'bleu'; S.palV = 44; persist(); }
applyTheme();
{
  // dans Aa : Encre bleue en premier
  const pal = $('#settingsSheet .pal');
  const b = pal && pal.querySelector('[data-palette-choice="bleu"]');
  if (b) pal.prepend(b);
}

const ICO = {
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.6 2.3 2.7-.7.6 2.7 2.6 1-.9 2.6 1.6 2.3-2.3 1.6.4 2.8-2.8.2-1.1 2.6-2.5-1.3-2.5 1.3-1.1-2.6-2.8-.2.4-2.8-2.3-1.6 1.6-2.3-.9-2.6 2.6-1 .6-2.7 2.7.7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2.5L5 13.5h6l-1.5 8L19 10h-6z"/></svg>',
  musee: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5L12 4l9 5.5zM5.5 11v7M9.8 11v7M14.2 11v7M18.5 11v7M3.5 20.5h17"/></svg>',
  frame: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M6.5 16l4-4.5 3 3 2-2 2 3.5"/><circle cx="15.5" cy="8.8" r="1.4"/></svg>',
  quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="f" d="M5 17.5c0-4.6 1.6-8 5-10.5l.9 1.3c-2 1.7-2.9 3.5-3 5.6H11V19H5zM13 17.5c0-4.6 1.6-8 5-10.5l.9 1.3c-2 1.7-2.9 3.5-3 5.6H19V19h-6z"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5"/></svg>',
  lamp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a6.4 6.4 0 00-3.8 11.6c.8.6 1.2 1.4 1.2 2.3v.8h5.2v-.8c0-.9.4-1.7 1.2-2.3A6.4 6.4 0 0012 2.8z"/><path d="M9.8 20h4.4M10.6 22h2.8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18"/><circle cx="6" cy="12" r="2"/><circle cx="12.5" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/><path d="M6 9.8V6M12.5 14.2V18M18.5 9.8V6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c-3.8 0-6.8 3-6.8 6.6 0 4.9 6.8 11.8 6.8 11.8s6.8-6.9 6.8-11.8c0-3.6-3-6.6-6.8-6.6z"/><circle cx="12" cy="9.4" r="2.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5c.7-3.6 3.2-5.6 6.2-5.6s5.5 2 6.2 5.6"/><circle cx="16.8" cy="9.2" r="2.6"/><path d="M15.6 14.2c2.8-.2 5 1.4 5.6 4.6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>'
};
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* ================= Boutons retour : plus gros, bien visibles ================= */
{
  const th = byId('toHome');
  if (th) { th.innerHTML = ICO.back + '<span class="back-label">Accueil</span>'; th.classList.add('back44'); }
  const tc = byId('toCover');
  if (tc) { const lab = byId('toCoverLab'); tc.innerHTML = ICO.back; if (lab) tc.append(lab); tc.classList.add('back44'); }
}

/* ================= Apparence : couleurs et clair / sombre, depuis l'accueil ================= */
const apSheet = el('div', 'sheet apsheet'); apSheet.id = 'apSheet'; apSheet.hidden = true;
apSheet.innerHTML = '<div class="sheet-back" data-close></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="apTitle">'
  + '<div class="panel-head"><h2 id="apTitle">Apparence</h2><button class="ghost" type="button" data-close>Fermer</button></div>'
  + '<div class="row"><span class="lab">Couleurs</span><div class="pal ap-pal" role="group" aria-label="Couleurs de l’appli">'
  + '<button type="button" data-palette-choice="bleu"><span class="sw" aria-hidden="true"><i style="background:#f1f3f7"></i><i style="background:#2f5d9e"></i><i style="background:#0f131b"></i></span>Encre bleue</button>'
  + '<button type="button" data-palette-choice=""><span class="sw" aria-hidden="true"><i style="background:#f7f2ea"></i><i style="background:#c4472d"></i><i style="background:#17130f"></i></span>Terre cuite</button>'
  + '<button type="button" data-palette-choice="sauge"><span class="sw" aria-hidden="true"><i style="background:#f2f4ee"></i><i style="background:#3b7655"></i><i style="background:#111511"></i></span>Sauge</button>'
  + '</div></div>'
  + '<div class="row"><span class="lab">Thème</span><div class="seg wide ap-th" role="group" aria-label="Thème">'
  + '<button type="button" data-theme-choice="">Auto</button><button type="button" data-theme-choice="light">Clair</button><button type="button" data-theme-choice="dark">Sombre</button></div></div>'
  + '<p class="tile-small">Les autres réglages (vitesse, taille du texte, voix) sont dans Aa, pendant la lecture.</p></div>';
document.body.append(apSheet);
$$('[data-close]', apSheet).forEach((b) => b.addEventListener('click', closeSheets));
$$('[data-palette-choice]', apSheet).forEach((b) => b.addEventListener('click', () => { S.palette = b.dataset.paletteChoice; persist(); applyTheme(); syncSettings(); }));
$$('[data-theme-choice]', apSheet).forEach((b) => b.addEventListener('click', () => { S.theme = b.dataset.themeChoice; persist(); applyTheme(); syncSettings(); }));
{
  const top = $('#home .h-top');
  const gear = el('button', 'ghost gear44'); gear.type = 'button'; gear.id = 'apBtn';
  gear.setAttribute('aria-label', 'Apparence : couleurs, clair ou sombre');
  gear.innerHTML = ICO.gear;
  gear.addEventListener('click', () => { syncSettings(); openSheet('#apSheet'); });
  const right = el('div', 'h-right');
  const pts = byId('homePts');
  if (pts) right.append(pts);
  right.append(gear);
  top.append(right);
}

/* ================= Le musée : ce qu'on a découvert, rangé par salles ================= */
const isDone = (g) => !!S.jeux[g.key];
const ANEC = (g) => g.kind === 'savoir' || g.kind === 'prix' || g.kind === 'histoire' || g.kind === 'curseur' || g.kind === 'existait';
const WORDG = (g) => g.kind === 'etymo' || g.kind === 'sens';
function paintingOf(a) {
  const p = String(a.tableau || '').split(',').map((x) => x.trim());
  return { peintre: p[0] || '', titre: p.slice(1, p.length > 2 ? -1 : undefined).join(', ') || a.titre, an: p.length > 2 ? p[p.length - 1] : '' };
}
const ROOMS = [
  { id: 'tableaux', t: 'Les tableaux', s: 'Les peintures de l’époque', ic: ICO.frame,
    got: () => TABS.filter((t) => CHAPS[t.ci] && S.avant[t.key]).length, all: () => TABS.filter((t) => CHAPS[t.ci]).length },
  { id: 'cultes', t: 'Phrases cultes', s: 'Les répliques à retenir', ic: ICO.quote,
    got: () => CULTES.filter((c) => S.cultes.includes(c.si)).length, all: () => CULTES.length },
  { id: 'mots', t: 'Les mots', s: 'Mots anciens, sens oubliés, gros mots', ic: ICO.book,
    got: () => GAMES.filter((g) => WORDG(g) && isDone(g)).length + S.jurons.length + S.mots.length,
    all: () => GAMES.filter(WORDG).length + JURONS.length + S.mots.length },
  { id: 'anecdotes', t: 'Anecdotes', s: 'À savoir, prix, chiffres, inventions', ic: ICO.lamp,
    got: () => GAMES.filter((g) => ANEC(g) && isDone(g)).length, all: () => GAMES.filter(ANEC).length },
  { id: 'dates', t: 'Les dates', s: 'La frise de l’époque', ic: ICO.clock,
    got: () => friseItems().filter((x) => x.got && !x.here).length, all: () => friseItems().filter((x) => !x.here).length },
  { id: 'lieux', t: 'Les lieux', s: (IMM ? (IMM.court || 'La maison') : 'Le Paris ' + deNom(CAST[POV] ? shortName(POV) : 'ton héros')) + ' et ailleurs', ic: ICO.pin,
    got: () => (PD ? pdReached().order.length : IMM ? immReached().size : 0) + LIEU_G.filter(isDone).length,
    all: () => (PD ? Object.keys(PD.lieux).length : IMM ? Object.keys(IMM.logements).length : 0) + LIEU_G.length },
  { id: 'perso', t: 'Les personnages', s: 'Ceux que tu as rencontrés', ic: ICO.people,
    got: () => S.met.filter((x) => ALL_CAST.includes(x)).length, all: () => ALL_CAST.length }
];
const roomOf = (id) => ROOMS.find((r) => r.id === id);
function museumTotal() { return ROOMS.reduce((n, r) => n + r.got(), 0); }

// --- les salles ---
function cartel(cls) { return el('li', 'cartel' + (cls ? ' ' + cls : '')); }
function lockedNote(n, txt) { return n > 0 ? el('p', 'room-left', 'Encore ' + nb(n, 'carte', 'cartes') + ' à découvrir' + (txt ? ' ' + txt : ' en lisant') + '.') : el('p', 'room-left done', 'Salle complète. Bravo !'); }
const ROOM_FILL = {
  tableaux(host) {
    const ul = el('ul', 'room-grid frames');
    TABS.forEach((t) => {
      const { a, ci } = t;
      if (!CHAPS[ci]) return;
      const seen = !!S.avant[t.key], ph = isPhoto(a);
      const li = cartel('frame-li' + (seen ? '' : ' hid'));
      const p = paintingOf(a);
      const fr = el('button', 'frame'); fr.type = 'button';
      if (seen && a.img) { const im = new Image(); im.src = a.img; im.alt = p.titre; im.decoding = 'async'; fr.append(im); }
      else fr.append(el('span', 'frame-q', '?'));
      fr.addEventListener('click', () => { if (seen) showAvant(ci, false, t); else toast((ph ? 'Cette photo t’attend' : 'Ce tableau t’attend') + ' quelque part dans le ' + chapLab(ci)); });
      li.append(fr);
      const c = el('div', 'cart');
      if (seen) c.append(el('b', '', p.titre), el('span', '', p.peintre + (p.an ? ', ' + p.an : '')), el('small', '', a.musee || ''));
      else c.append(el('b', '', ph ? 'Photo mystère' : 'Tableau mystère'), el('span', '', 'À trouver dans le ' + chapLab(ci)));
      li.append(c);
      ul.append(li);
    });
    host.append(ul);
  },
  cultes(host) {
    const got = CULTES.filter((c) => S.cultes.includes(c.si));
    const ul = el('ul', 'room-list');
    got.forEach((c) => {
      const li = cartel('quote-li');
      li.append(el('blockquote', '', sentenceText(c.si)));
      const tk = T[V[c.a]];
      const who = tk && tk.k === 's' && CAST[tk.sp] ? CAST[tk.sp].nom : BOOK.auteur;
      const src = el('div', 'src'); src.append(el('span', '', who + ' · ' + where(c.a)), smallBtn('Lire ici', () => goRead(c.a)));
      li.append(src);
      ul.append(li);
    });
    host.append(ul, lockedNote(CULTES.length - got.length, ': quand une phrase s’allume en or, glisse-la dans le coffre doré'));
  },
  mots(host) {
    const ul = el('ul', 'room-list words');
    const add = (w, pos, def, extra, tag) => {
      const li = cartel('word-li');
      const h = el('div', 'wd-h'); h.append(el('strong', '', w), el('span', 'wd-tag', tag || pos || ''));
      li.append(h);
      if (def) li.append(el('p', 'wd-d', def));
      if (extra) li.append(el('p', 'wd-x', extra));
      ul.append(li);
    };
    GAMES.filter((g) => WORDG(g) && isDone(g)).forEach((g) => add(g.x.nom, '', g.x.choix[g.x.ok | 0], g.x.info || '', g.kind === 'sens' ? 'a changé de sens' : 'étymologie'));
    S.jurons.forEach((w) => { const x = dictLookup(w); add(w, '', x ? x.def : '', x ? 'En anglais : ' + x.en : '', 'gros mot d’époque'); });
    S.mots.forEach((m) => { const x = dictLookup(m.w); add(m.w, x ? x.pos : '', x ? x.def : '', x ? 'En anglais : ' + x.en : '', 'mot ancien'); });
    const left = roomOf('mots').all() - roomOf('mots').got();
    host.append(ul, lockedNote(left, ' : ils se rangent tout seuls en lisant'));
  },
  anecdotes(host) {
    const ul = el('ul', 'hearts mots-list dc-list room-list');
    GAMES.filter((g) => ANEC(g) && isDone(g)).forEach((g) => ul.append(dcItem(g, false)));
    const r = reachK();
    const passed = GAMES.filter((g) => FREE(g) && !isDone(g) && g.j < r);
    passed.forEach((g) => ul.append(dcItem(g, true)));
    host.append(ul, lockedNote(GAMES.filter((g) => ANEC(g) && !isDone(g)).length - passed.length, ' : elles montent dans ton Carnet en lisant'));
  },
  dates(host) {
    const all = friseItems();
    const ol = el('ol', 'frise room-frise');
    all.filter((x) => x.got).forEach((x) => {
      const li = el('li', x.here ? 'here' : x.an > YEAR ? 'after' : '');
      const tx = el('span', 'fr-t'); tx.append(el('b', '', x.t));
      tx.append(el('small', '', x.here ? 'Tu es ici' : x.an > YEAR ? 'dans ' + (x.an - YEAR) + ' an' + (x.an - YEAR > 1 ? 's' : '') + ' : pas encore là' : 'il y a ' + (YEAR - x.an) + ' an' + (YEAR - x.an > 1 ? 's' : '')));
      li.append(el('span', 'fr-y', String(x.an)), el('i', 'fr-dot'), tx);
      ol.append(li);
    });
    host.append(ol, lockedNote(all.filter((x) => !x.got).length, ': dans les « À savoir » et les jeux'));
  },
  lieux(host) {
    const box = el('div', 'pd-box'); host.append(box); fillParis(box);
    const done = LIEU_G.filter(isDone);
    if (done.length) {
      host.append(el('h3', 'eyebrow sect-label', 'Ailleurs, sur la carte'));
      const ul = el('ul', 'room-list');
      done.forEach((g) => { const li = cartel(); const h = el('div', 'wd-h'); h.append(el('strong', '', g.x.nom), el('span', 'wd-tag', S.jeux[g.key].ok ? 'trouvé sur la carte' : 'raté de peu')); li.append(h, el('p', 'wd-d', g.x.info || '')); ul.append(li); });
      host.append(ul);
    }
  },
  perso(host) {
    const ul = el('ul', 'room-grid faces');
    const met = S.met.filter((x) => ALL_CAST.includes(x));
    met.forEach((id) => {
      const c = CAST[id];
      const li = cartel('face-li'); li.style.setProperty('--spk', colorVar(id));
      li.append(portrait(id, 'face-pf'), el('b', '', c.nom), el('small', '', (c.chap || c.cite || '').split(/(?<=[.!?])\s/)[0]));
      ul.append(li);
    });
    for (let i = met.length; i < ALL_CAST.length; i++) { const li = cartel('face-li hid'); li.append(el('span', 'pf face-pf mq', '?'), el('b', '', 'Mystère'), el('small', '', 'À rencontrer en lisant')); ul.append(li); }
    host.append(ul);
  }
};

/* ================= Flash quiz : 5 questions sur ce que tu as découvert ================= */
if (!S.flash || typeof S.flash !== 'object') S.flash = { best: 0, plays: 0, day: '' };
const FLASH_N = 5, FLASH_MIN = 3, FLASH_PTS = 5;
function bigNum(v, unite) {
  if (v >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' millions' + (unite === 'habitants' ? ' d’habitants' : '');
  return fmtInt(v) + (unite ? ' ' + unite : '');
}
function niceRound(v) { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1)); return Math.max(1, Math.round(v / p) * p); }
function flashPool() {
  const Q = [];
  const add = (type, q) => { if (q && q.choix && q.choix.length >= 2 && new Set(q.choix).size === q.choix.length) Q.push(Object.assign({ type }, q)); };
  // les jeux déjà faits : on repose la question
  GAMES.filter(isDone).forEach((g) => {
    const x = g.x;
    if ((g.kind === 'histoire' || g.kind === 'etymo' || g.kind === 'sens' || g.kind === 'epq') && Array.isArray(x.choix)) {
      const q = g.kind === 'etymo' ? 'D’où vient le mot « ' + x.nom + ' » ?' : g.kind === 'sens' ? 'Que voulait dire « ' + x.nom + ' » autrefois ?' : x.q;
      add(g.kind, { q, choix: x.choix.slice(), ok: x.choix[x.ok | 0], info: x.info || '' });
    }
    if (g.kind === 'savoir') {
      const others = shuffle(SAV.filter((y) => y && y.nom && y.nom !== x.nom)).slice(0, 2).map((y) => y.nom);
      add('savoir', { q: 'De quoi parle cette découverte ?', quote: x.txt, choix: [x.nom].concat(others), ok: x.nom, info: x.src ? 'Source : ' + x.src : '' });
    }
    if (g.kind === 'prix') {
      const ok = euroLine(x);
      const choix = [ok, euroLine(Object.assign({}, x, { f: x.f * .2 })), euroLine(Object.assign({}, x, { f: x.f * 5 }))];
      add('prix', { q: 'En ' + YEAR + ', « ' + x.somme + ' », c’est combien d’aujourd’hui ?', choix, ok, info: x.txt || repereTxt() });
    }
    if (g.kind === 'existait') {
      const c = x.cartes[Math.floor(Math.random() * x.cartes.length)];
      add('existait', { q: '« ' + c.t + ' » existait-il déjà en ' + YEAR + ' ?', choix: ['Oui, déjà là', 'Non, pas encore'], ok: c.oui ? 'Oui, déjà là' : 'Non, pas encore', keep: true, info: c.t + ' : ' + c.an + '.' });
    }
    if (g.kind === 'curseur') {
      const v = x.val;
      add('curseur', { q: x.q, choix: [bigNum(v, x.unite), bigNum(niceRound(v * .5), x.unite), bigNum(niceRound(v * 1.8), x.unite)], ok: bigNum(v, x.unite), info: x.info || '' });
    }
  });
  // les tableaux vus
  const painters = TABS.filter((t) => !isPhoto(t.a)).map((t) => paintingOf(t.a).peintre).filter(Boolean).concat(['Auguste Renoir', 'Edgar Degas', 'Gustave Caillebotte']);
  const photogs = TABS.filter((t) => isPhoto(t.a)).map((t) => paintingOf(t.a).peintre).filter(Boolean).concat(['Nadar', 'Gustave Le Gray', 'Édouard Baldus']);
  TABS.forEach(({ a, key }) => {
    if (!S.avant[key] || !a.tableau) return;
    const p = paintingOf(a), ph = isPhoto(a);
    const others = shuffle(Array.from(new Set((ph ? photogs : painters).filter((x) => x !== p.peintre)))).slice(0, 2);
    add('tableau', { q: (ph ? 'Qui a photographié « ' : 'Qui a peint « ') + p.titre + ' » ?', img: a.img, choix: [p.peintre].concat(others), ok: p.peintre, info: p.titre + (p.an ? ', ' + p.an : '') + (a.musee ? ' · ' + a.musee : '') });
  });
  // les personnages rencontrés : qui est-ce ?
  const met = S.met.filter((id) => ALL_CAST.includes(id) && CAST[id].pf && PF[CAST[id].pf]);
  if (met.length >= 3) met.forEach((id) => {
    const others = shuffle(met.filter((x) => x !== id)).slice(0, 2).map((x) => CAST[x].nom);
    add('perso', { q: 'Qui est-ce ?', face: id, choix: [CAST[id].nom].concat(others), ok: CAST[id].nom, info: (CAST[id].chap || '').split(/(?<=[.!?])\s/)[0] });
  });
  // les phrases cultes : qui l'a dite ?
  const speakers = met.length ? met : MAIN_SPEAKERS;
  CULTES.filter((c) => S.cultes.includes(c.si)).forEach((c) => {
    const tk = T[V[c.a]];
    if (!tk || tk.k !== 's' || !CAST[tk.sp] || CAST[tk.sp].fig) return;
    const others = shuffle(speakers.filter((x) => x !== tk.sp && CAST[x])).slice(0, 2).map((x) => CAST[x].nom);
    if (others.length < 2) return;
    add('culte', { q: 'Qui dit cette phrase culte ?', quote: sentenceText(c.si), choix: [CAST[tk.sp].nom].concat(others), ok: CAST[tk.sp].nom, info: where(c.a) });
  });
  // les mots et les gros mots attrapés : que veut dire… ?
  const words = S.jurons.map((w) => ({ w, x: dictLookup(w) })).concat(S.mots.map((m) => ({ w: m.w, x: dictLookup(m.w) }))).filter((o) => o.x);
  const defs = (BOOK.mots || []).flat().map((w) => dictLookup(w)).filter(Boolean).map((x) => x.def);
  words.forEach((o) => {
    const others = shuffle(defs.filter((d) => d !== o.x.def)).slice(0, 2);
    if (others.length < 2) return;
    add('mot', { q: 'Que veut dire « ' + o.w + ' » ?', choix: [o.x.def].concat(others), ok: o.x.def, info: 'En anglais : ' + o.x.en });
  });
  // les dates découvertes : en quelle année ?
  friseItems().filter((x) => x.got && !x.here).forEach((x) => {
    const d = [3, 5, 7, 9, 12][Math.floor(Math.random() * 5)];
    const alt = shuffle([x.an - d, x.an + d, x.an + d * 2, x.an - d * 2]).slice(0, 2);
    add('date', { q: 'En quelle année ? « ' + x.t + ' »', choix: [String(x.an)].concat(alt.map(String)), ok: String(x.an), info: x.an <= YEAR ? 'Il y a ' + (YEAR - x.an) + ' ans ' + QUAND_T + '.' : 'Dans ' + (x.an - YEAR) + ' ans : pas encore là en ' + YEAR + '.' });
  });
  return Q;
}
function flashPick() {
  const by = {};
  shuffle(flashPool()).forEach((q) => { (by[q.type] = by[q.type] || []).push(q); });
  const types = shuffle(Object.keys(by));
  const out = [];
  while (out.length < FLASH_N && types.some((t) => by[t].length)) types.forEach((t) => { if (out.length < FLASH_N && by[t].length) out.push(by[t].shift()); });
  return out.map((q) => Object.assign({}, q, { choix: q.keep ? q.choix : shuffle(q.choix) }));
}
const flSheet = el('div', 'sheet flsheet'); flSheet.id = 'flashSheet'; flSheet.hidden = true;
flSheet.innerHTML = '<div class="sheet-back"></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="flTitle">'
  + '<div class="fl-head"><span class="fl-ic" aria-hidden="true">' + ICO.bolt + '</span><div><p class="eyebrow">Flash quiz</p><h2 id="flTitle">Ce que tu as découvert</h2></div>'
  + '<button class="ghost fl-x" type="button" id="flClose" aria-label="Fermer le Flash quiz"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
  + '<div class="fl-dots" id="flDots" aria-hidden="true"></div><div class="fl-body" id="flBody"></div></div>';
document.body.append(flSheet);
let FL = null;
function openFlash() {
  const qs = flashPick();
  if (qs.length < FLASH_MIN) { toast('Découvre encore quelques choses en lisant pour lancer le Flash quiz'); return; }
  FL = { qs, i: 0, n: 0, pts: S.flash.day !== today() };
  openSheet('#flashSheet');
  flRender();
}
function flClose() { FL = null; closeSheets(); if (!byId('home').hidden) { refreshHome(); if (curView === 'progres') renderProgress(); } }
byId('flClose').addEventListener('click', flClose);
$('.sheet-back', flSheet).addEventListener('click', flClose);
function flDots() {
  byId('flDots').replaceChildren(...FL.qs.map((q, i) => el('i', i < FL.i ? (q.res ? 'ok' : 'no') : i === FL.i ? 'cur' : '')));
}
function flRender() {
  const q = FL.qs[FL.i];
  flDots();
  const body = byId('flBody');
  const parts = [el('p', 'fl-n', 'Question ' + (FL.i + 1) + ' sur ' + FL.qs.length)];
  if (q.img) { const fig = el('div', 'fl-img'); const im = new Image(); im.src = q.img; im.alt = ''; fig.append(im); parts.push(fig); }
  if (q.face) parts.push(portrait(q.face, 'fl-face'));
  parts.push(el('strong', 'fl-q', q.q));
  if (q.quote) parts.push(el('blockquote', 'fl-quote', q.quote.length > 240 ? q.quote.slice(0, 238).replace(/\s+\S*$/, '') + '…' : q.quote));
  const opts = el('div', 'fl-opts');
  const bs = q.choix.map((t) => {
    const b = el('button', 'qz-o fl-o', t); b.type = 'button';
    b.addEventListener('click', () => flAnswer(t, bs));
    return b;
  });
  opts.append(...bs);
  parts.push(opts, el('div', 'fl-fb'));
  body.replaceChildren(...parts);
  body.classList.remove('in'); void body.offsetWidth; body.classList.add('in');
  $('#flashSheet .panel').scrollTop = 0;
}
function flAnswer(t, bs) {
  const q = FL.qs[FL.i];
  if (q.res !== undefined) return;
  q.res = t === q.ok;
  if (q.res) FL.n++;
  bs.forEach((b) => { b.disabled = true; b.classList.toggle('ok', b.textContent === q.ok); b.classList.toggle('picked', b.textContent === t && !q.res); });
  if (q.res) { SFX.soft(); buzz([8, 30, 8]); } else buzz(6);
  const fb = $('#flBody .fl-fb');
  fb.className = 'fl-fb qz-fb' + (q.res ? ' good' : '');
  const h = el('p', 'qz-fb-h'); const ic = el('span', 'qz-fb-ic'); ic.innerHTML = q.res ? ICO_OK : ICO_BOOK;
  h.append(ic, document.createTextNode(q.res ? 'Bien vu !' : 'La bonne réponse : ' + q.ok));
  const go = el('button', 'btn primary fl-go', FL.i + 1 < FL.qs.length ? 'Question suivante' : 'Voir mon score'); go.type = 'button';
  go.addEventListener('click', () => { FL.i++; if (FL.i < FL.qs.length) flRender(); else flEnd(); });
  fb.replaceChildren(h);
  if (q.info) fb.append(el('p', 'gm-info', q.info));
  fb.append(go);
  flDots();
  requestAnimationFrame(() => fb.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }));
}
function flEnd() {
  const n = FL.n, of = FL.qs.length;
  const pts = FL.pts ? n * FLASH_PTS : 0;
  S.flash.plays = (S.flash.plays || 0) + 1;
  S.flash.best = Math.max(S.flash.best || 0, Math.round(n / of * 100));
  if (FL.pts) S.flash.day = today();
  if (pts) addPoints(pts, false);
  persist();
  flDots();
  const box = byId('flBody');
  const st = starsEl(n === of ? 3 : n >= Math.ceil(of * .6) ? 2 : 1, 3, 'big');
  const msg = n === of ? 'Sans faute ! Tu es un vrai guide de ' + YEAR + '.' : n >= Math.ceil(of * .6) ? 'Très bien ! Tu retiens ce que tu découvres.' : 'Pas mal ! Relis tes découvertes au musée, puis retente.';
  const act = el('div', 'fl-act');
  const again = el('button', 'btn primary', 'Rejouer'); again.type = 'button'; again.addEventListener('click', () => { flClose(); openFlash(); });
  const mus = el('button', 'btn', 'Voir mon musée'); mus.type = 'button'; mus.addEventListener('click', () => { flClose(); showHome('progres'); });
  act.append(again, mus);
  box.replaceChildren(el('div', 'fl-end'), st, el('p', 'fl-score', n + ' / ' + of), el('p', 'fl-msg', msg),
    el('p', 'tile-small fl-pts', pts ? '+' + pts + ' points' : FL.pts ? 'Pas de points cette fois' : 'Entraînement : les points du Flash quiz se gagnent une fois par jour'), act);
  if (n === of && !REDUCED) setTimeout(sparkleStage, 200);
  if (pts) { SFX.win(); buzz([10, 40, 10]); }
}
function flashCard(big) {
  const pool = flashPool().length;
  const ready = pool >= FLASH_MIN;
  const b = el('button', 'flash-card' + (big ? ' big' : '') + (ready ? '' : ' wait')); b.type = 'button';
  const ic = el('span', 'fc-ic'); ic.innerHTML = ICO.bolt;
  const t = el('span', 'fc-t');
  t.append(el('b', '', 'Flash quiz'), el('span', '', ready ? FLASH_N + ' questions sur ce que tu as découvert' : 'Découvre ' + (FLASH_MIN - pool) + ' chose' + (FLASH_MIN - pool > 1 ? 's' : '') + ' de plus en lisant pour le débloquer'));
  if (ready && S.flash.plays) t.append(el('small', '', 'Meilleur score : ' + S.flash.best + ' %'));
  const go = el('span', 'fc-go', ready ? 'Jouer' : fmtInt(pool) + ' / ' + FLASH_MIN);
  b.append(ic, t, go);
  b.addEventListener('click', () => { if (ready) openFlash(); else toast('Touche les pastilles pendant la lecture : chaque découverte rejoint ton musée'); });
  return b;
}

/* ================= L'onglet Découvertes : le musée ================= */
{
  const tab = $('[data-tabv="progres"]');
  if (tab) tab.innerHTML = ICO.musee + 'Découvertes';
  const view = $('#home [data-view="progres"]');
  const m = el('div', 'musee'); m.id = 'musee';
  view.append(m);
}
let roomCur = '';
function roomTile(r, small) {
  const got = r.got(), all = r.all();
  const b = el('button', 'room' + (small ? ' sm' : '') + (got ? '' : ' empty')); b.type = 'button';
  b.dataset.room = r.id;
  const ic = el('span', 'rm-ic'); ic.innerHTML = r.ic;
  if (r.id === 'tableaux') {
    const im = TABS.map((t) => (S.avant[t.key] && t.a.img ? t.a.img : '')).find(Boolean);
    if (im) { ic.classList.add('img'); ic.style.backgroundImage = 'url("' + im + '")'; ic.innerHTML = ''; }
  }
  const t = el('span', 'rm-t');
  t.append(el('b', '', r.t));
  if (!small) t.append(el('small', '', r.s));
  const bar = el('span', 'rm-bar'); const f = el('i'); f.style.setProperty('--p', (all ? Math.round(got / all * 100) : 0) + '%'); bar.append(f);
  const row = el('span', 'rm-row'); row.append(bar, el('span', 'rm-n', got + ' / ' + all));
  t.append(row);
  b.append(ic, t);
  b.addEventListener('click', () => { if (curView !== 'progres') { roomCur = r.id; setView('progres'); } else openRoom(r.id); });
  return b;
}
function openRoom(id) { roomCur = id; renderMusee(); byId('homeScroll').scrollTop = 0; }
function renderMusee() {
  const m = byId('musee');
  if (!m) return;
  const r = roomCur && roomOf(roomCur);
  if (r) {
    const back = el('button', 'back44 room-back'); back.type = 'button'; back.innerHTML = ICO.back + '<span>Le musée</span>';
    back.addEventListener('click', () => { roomCur = ''; renderMusee(); byId('homeScroll').scrollTop = 0; });
    const head = el('div', 'room-head');
    const ic = el('span', 'rm-ic'); ic.innerHTML = r.ic;
    const tt = el('div'); tt.append(el('h1', 'view-title', r.t), el('p', 'tile-small', r.s + ' · ' + r.got() + ' sur ' + r.all()));
    head.append(ic, tt);
    const host = el('div', 'room-body');
    ROOM_FILL[r.id](host);
    m.replaceChildren(back, head, host);
    return;
  }
  const total = museumTotal();
  const hero = el('div', 'mu-hero');
  hero.innerHTML = '<span class="mu-ic" aria-hidden="true">' + ICO.musee + '</span>';
  const ht = el('div');
  ht.append(el('p', 'eyebrow', 'Ton musée · ' + BOOK.titre), el('h1', 'view-title', total ? fmtInt(total) + (total > 1 ? ' découvertes' : ' découverte') : 'Ton musée est vide'),
    el('p', 'tile-small', total ? 'Tout ce que tu as appris en lisant, rangé par salles.' : 'Lis quelques épisodes : chaque découverte vient s’exposer ici.'));
  hero.append(ht);
  const grid = el('div', 'rooms');
  ROOMS.forEach((x) => { if (x.all()) grid.append(roomTile(x, false)); });
  const li = levelInfo(S.pts);
  const foot = el('p', 'mu-foot', 'Niveau ' + (li.lv + 1) + ' · ' + LEVELS[li.lv].t + ' · ' + fmtPts(S.pts) + (QUIZ_N ? ' · ' + nb(totalStars(), 'étoile', 'étoiles') + ' aux défis' : ''));
  m.replaceChildren(hero, flashCard(true), el('h2', 'mu-h2', 'Les salles'), grid, foot);
}
{
  const rp = renderProgress;
  renderProgress = function () { rp(); renderMusee(); };
  const sv = setView;
  setView = function (v) { if (v !== 'progres') roomCur = ''; sv(v); };
}

/* ================= L'accueil ================= */
// une frise des époques : on touche une époque, ses livres apparaissent
function epochRange(p) {
  const a = String(p.annees || '');
  let m = a.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})/);
  if (m) return [Number(m[1]), Number(m[2])];
  m = a.match(/^\s*(\d{3,4})\s*$/);
  if (m) return [Number(m[1]), Number(m[1])];
  m = a.match(/([XVI]+)\s*[ᵉe]/);
  if (m) {
    const R = { I: 1, V: 5, X: 10 }; let n = 0, prev = 0;
    m[1].split('').reverse().forEach((c) => { const v = R[c]; n += v < prev ? -v : v; prev = Math.max(prev, v); });
    return [(n - 1) * 100 + 1, n * 100];
  }
  return [9999, 9999];
}
const EPOCHS_T = EPOQUES.map((p) => ({ p, r: epochRange(p) })).sort((x, y) => x.r[0] - y.r[0]);
let epochSel = (catOf(BOOK.id).epoque) || (EPOCHS_T[0] && EPOCHS_T[0].p.id) || '';
function timeline() {
  const sec = el('section', 'tl');
  const h = el('div', 'row-h'); h.append(el('h2', '', 'Voyage dans le temps'));
  sec.append(h, el('p', 'tl-lead', 'Touche une époque : les romans qui la racontent apparaissent. Glisse vers la gauche pour remonter le temps.'));
  const track = el('div', 'tl-track');
  const rail = el('div', 'tl-rail');
  EPOCHS_T.forEach(({ p, r }, i) => {
    const books = BOOKS.filter((b) => catOf(b.id).epoque === p.id);
    const b = el('button', 'tl-ep' + (p.id === epochSel ? ' on' : '')); b.type = 'button';
    b.style.setProperty('--hue', String((i * 47 + 200) % 360));
    b.style.setProperty('--w', String(Math.max(1, Math.min(3, Math.log10(Math.max(10, r[1] - r[0] + 10))))));
    b.append(el('span', 'tl-y', r[0] === r[1] ? String(r[0]) : r[0] > 1000 && r[1] - r[0] < 200 ? r[0] + '–' + r[1] : p.annees));
    const bar = el('span', 'tl-bar');
    if (books.some((x) => x.id === BOOK.id)) { const here = el('span', 'tl-here'); here.title = 'Tu lis ici'; bar.append(here); }
    b.append(bar, el('span', 'tl-n', p.nom), el('small', 'tl-c', nb(books.length, 'livre', 'livres')));
    b.setAttribute('aria-pressed', String(p.id === epochSel));
    b.addEventListener('click', () => { epochSel = p.id; buzz(6); paintTimeline(); });
    rail.append(b);
  });
  track.append(rail);
  sec.append(track);
  const pick = el('div', 'tl-pick'); pick.id = 'tlPick';
  sec.append(pick);
  return sec;
}
function paintTimeline() {
  $$('#homeTl .tl-ep').forEach((b, i) => { const on = EPOCHS_T[i].p.id === epochSel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const e = EPOCHS_T.find((x) => x.p.id === epochSel);
  const pick = byId('tlPick');
  if (!pick || !e) return;
  const books = BOOKS.filter((b) => catOf(b.id).epoque === e.p.id).sort((a, b) => isSoon(a) - isSoon(b));
  const head = el('div', 'tl-ph');
  head.append(el('b', '', e.p.nom), el('span', '', e.p.annees || ''));
  const shelf = el('div', 'shelf');
  books.forEach((b) => shelf.append(bookCard(b)));
  pick.replaceChildren(head, el('p', 'tl-txt', e.p.txt || ''), shelf);
  pick.classList.remove('in'); requestAnimationFrame(() => pick.classList.add('in'));
  const on = $('#homeTl .tl-ep.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
}
// accueil : en cours, bienvenue, découvertes, Flash quiz, frise
{
  const view = $('#home [data-view="accueil"]');
  const hero = byId('hero');
  const cur = el('h2', 'home-h2', 'En cours de lecture'); cur.id = 'curLab';
  hero.before(cur);
  const welcome = el('section', 'welcome'); welcome.id = 'welcome';
  welcome.innerHTML = '<div class="wc-top"><b>Bienvenue !</b><button class="ghost wc-x" type="button" aria-label="Masquer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
    + '<p>Ici, on lit les grands classiques par épisodes de deux minutes, et on découvre leur époque en chemin.</p>'
    + '<ol class="wc-steps"><li><span>' + ICO.book + '</span><b>Lis</b><small>2 minutes, à ton rythme</small></li>'
    + '<li><span>' + ICO.lamp + '</span><b>Découvre</b><small>à la fin de chaque épisode</small></li>'
    + '<li><span>' + ICO.bolt + '</span><b>Joue</b><small>au Flash quiz</small></li></ol>';
  cur.before(welcome);
  $('.wc-x', welcome).addEventListener('click', () => { S.welcomed = true; persist(); welcome.hidden = true; });
  const dec = el('section', 'home-dec'); dec.id = 'homeDec';
  const tl = el('div', ''); tl.id = 'homeTl';
  hero.after(dec, tl);
  view.classList.add('v44');
}
{
  const rh = refreshHome;
  refreshHome = function () {
    rh();
    const started = hasStarted();
    byId('welcome').hidden = started || !!S.welcomed;
    byId('curLab').textContent = started ? 'En cours de lecture' : 'Ton premier classique';
    byId('helloSub').textContent = started ? 'Reprends là où tu t’es arrêté.' : 'Lis les classiques et découvre leur époque.';
    // tes découvertes : un aperçu du musée, puis le Flash quiz
    const total = museumTotal();
    const head = el('div', 'row-h');
    head.append(el('h2', '', 'Tes découvertes'));
    const all = el('button', '', 'Le musée'); all.type = 'button'; all.addEventListener('click', () => setView('progres'));
    head.append(all);
    const rooms = el('div', 'rooms mini');
    ['tableaux', 'anecdotes', 'mots', 'cultes'].map(roomOf).filter((r) => r && r.all()).forEach((r) => rooms.append(roomTile(r, true)));
    const lead = el('p', 'tl-lead', total ? nb(total, 'découverte', 'découvertes') + ' dans ton musée.' : 'En lisant, les curiosités montent dans ton Carnet : tableaux, mots, anecdotes… tout s’expose ici.');
    byId('homeDec').replaceChildren(head, lead, rooms, flashCard(false));
    // la frise des époques
    const host = byId('homeTl');
    host.replaceChildren(timeline());
    paintTimeline();
  };
}

/* ================= Bibliothèque : une barre de recherche ================= */
let libQ = '';
{
  const view = $('#home [data-view="biblio"]');
  const box = el('label', 'search44');
  box.innerHTML = ICO.search;
  const inp = el('input'); inp.type = 'search'; inp.id = 'libSearch'; inp.placeholder = 'Titre, auteur ou époque';
  inp.setAttribute('aria-label', 'Chercher un livre');
  inp.autocomplete = 'off';
  box.append(inp);
  const title = $('.view-title', view);
  title.after(box);
  inp.addEventListener('input', () => { libQ = inp.value; renderLibrary(); });
}
{
  const rl = renderLibrary;
  renderLibrary = function () {
    rl();
    const q = norm(libQ).trim();
    const seg = $('#home [data-view="biblio"] .seg');
    if (seg) seg.hidden = !!q;
    if (!q) return;
    const g = byId('libGrid');
    const hits = BOOKS.filter((b) => {
      const p = epoqueOf(b.id);
      return [b.t, b.a, String(b.y), p ? p.nom : '', p ? p.annees : '', b.x].some((s) => norm(s).includes(q));
    });
    g.classList.remove('by-epoch');
    const lab = hits.length ? el('p', 'tile-small lib-hits', nb(hits.length, 'livre trouvé', 'livres trouvés')) : el('p', 'empty lib-hits', 'Aucun livre ne correspond à « ' + libQ.trim() + ' ».');
    g.replaceChildren(lab, ...hits.map(bookCard));
  };
}
// crochets de test
window.__v44 = { flashPool, flashPick, openFlash, get FL() { return FL; }, ROOMS, openRoom, renderMusee, museumTotal, EPOCHS_T, get epochSel() { return epochSel; }, paintTimeline };

// crochets de test
window.__v43 = { wordIn, PD, GAMES, SAV, PRX, AVANT, PD_ET, friseItems, learnedN, epLearn, euroOf, euroLine, reachK, showAvant, closeAvant, avantDueAt, get avOpen() { return avOpen; }, openSoon, epochShelves };

/* ================= Version 45 =================
   Demandé par Guillaume :
   – en haut, un seul bouton de mode (Immersif ▾) qui ouvre un petit menu ; plus de barre de gauche ; plus de compteur de points
     dans le lecteur ni à l'accueil (les points sont en haut de Découvertes) ;
   – les phrases cultes et les jurons d'époque se rangent tout seuls dans leur coffre, sans pause ; le coffre monte ensuite
     dans le Carnet, qui brille ; seuls les jurons anciens ou peu connus restent (paquet du livre, version 15) ;
   – les pastilles qu'on ne touche pas montent dans le Carnet, qui affiche combien il en reste ; plus de « Plus tard » ;
   – le Carnet devient le « Carnet des curiosités » : titres dorés, Flash quiz, Tableaux d'époque, Personnages célèbres,
     Géographie, Vocabulaire ; on y fait les pastilles manquées, chacune dans sa rubrique ;
   – quiz : des pouces qui s'envolent (bonne réponse) ou qui tombent (mauvaise) ; partage discret (une icône) ;
     au bandeau de fin d'épisode, la lecture attend qu'on ait tout fait, ou qu'on touche Continuer ;
     nouveaux quiz : « Qui est qui ? » (chapitres I et II) et « Question d'expert » (un détail précis de l'épisode). */
/* Version 82 : l'appli s'appelle « Enfin lu » (nom, titre, écran d'erreur, partages, transfert de progression).
   La base du téléphone et la clé de sauvegarde gardent leurs anciens noms : rien n'est perdu. */
const APP = (document.title || 'Enfin lu').replace(/\s*\(.*\)$/, '');
const SVG45 = {
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  cab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z"/><path d="M5 9.5h14M5 14.5h14M10.5 7h3M10.5 12h3M10.5 17h3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 7.2l4-3.7 4 3.7M6.5 11H5.8A1.8 1.8 0 004 12.8v6.4A1.8 1.8 0 005.8 21h12.4a1.8 1.8 0 001.8-1.8v-6.4a1.8 1.8 0 00-1.8-1.8h-.7"/></svg>',
  thumb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.2 10.2V20.5H4.6a1.1 1.1 0 01-1.1-1.1v-8.1a1.1 1.1 0 011.1-1.1zM9 20.5h7.9a2.2 2.2 0 002.1-1.7l1.4-6.3a2.1 2.1 0 00-2.1-2.6h-4.2l.8-3.6a1.9 1.9 0 00-1.9-2.4h-.4L9 10.2z"/></svg>',
  faces: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.8 19c.6-3.3 2.6-5.1 5.2-5.1s4.6 1.8 5.2 5.1M13.6 15.6c.9-.9 1.9-1.4 2.9-1.4 2.2 0 3.9 1.6 4.4 4.6"/></svg>',
  loupe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg>',
  laurel: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.6-3.8 3.3-6 6.5-6s5.9 2.2 6.5 6"/><path d="M4 9.5c-.3 2 .4 3.8 2 5M20 9.5c.3 2-.4 3.8-2 5M4.6 6.3c.2-1 .8-1.9 1.6-2.5M19.4 6.3c-.2-1-.8-1.9-1.6-2.5"/></svg>'
};

// ---------- 1. Le lecteur : un bouton de mode, et un petit menu ----------
const modeBtn = el('button', 'mode-b'); modeBtn.type = 'button'; modeBtn.id = 'modeBtn';
modeBtn.setAttribute('aria-haspopup', 'menu'); modeBtn.setAttribute('aria-expanded', 'false');
byId('epTitle').after(modeBtn);
const modeMenu = el('div', 'mode-menu'); modeMenu.id = 'modeMenu'; modeMenu.setAttribute('role', 'menu'); modeMenu.hidden = true;
[['page', 'Immersif', 'La page défile, les mots s’allument'], ['texte', 'Texte', 'Tu lis à ton rythme']].forEach(([m, t, s]) => {
  const b = el('button'); b.type = 'button'; b.dataset.mode = m; b.setAttribute('role', 'menuitemradio');
  b.append(el('span', 'mm-ck'), el('span', '', t), el('small', '', s));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); closeModeMenu(); if (S.read !== m) setRead(m); paintModeBtn(); });
  modeMenu.append(b);
});
document.body.append(modeMenu);
function paintModeBtn() {
  const lab = S.read === 'texte' ? 'Texte' : S.read === 'rsvp' ? 'Rapide' : 'Immersif';
  modeBtn.innerHTML = '<span>' + lab + '</span>' + SVG45.chev;
  modeBtn.setAttribute('aria-label', 'Mode de lecture : ' + lab + '. Changer de mode');
  $$('button', modeMenu).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.read)));
}
function closeModeMenu() { modeMenu.hidden = true; modeBtn.setAttribute('aria-expanded', 'false'); }
modeBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (!modeMenu.hidden) { closeModeMenu(); return; }
  paintModeBtn();
  const r = modeBtn.getBoundingClientRect();
  modeMenu.hidden = false;
  const w = modeMenu.offsetWidth;
  modeMenu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  modeMenu.style.top = Math.round(r.bottom + 6) + 'px';
  modeBtn.setAttribute('aria-expanded', 'true');
});
document.addEventListener('pointerdown', (ev) => { if (!modeMenu.hidden && !modeMenu.contains(ev.target) && ev.target !== modeBtn && !modeBtn.contains(ev.target)) closeModeMenu(); }, true);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !modeMenu.hidden) closeModeMenu(); });
{
  const sr = setRead;
  setRead = function (m) { sr(m); paintModeBtn(); };
  const pl = play;
  play = function () { closeModeMenu(); pl(); };
}
paintModeBtn();
// plus de cartes qui jaillissent du compteur de points : il n'est plus affiché
purseWin = function () { };

// ---------- 2. Le Carnet des curiosités : le bouton, son compteur, et ce qui y monte ----------
const cnBtn = byId('openCarnet');
cnBtn.innerHTML = '<span class="cnb-ic" aria-hidden="true">' + SVG45.cab + '</span><span class="cnb-t">Curiosités</span><span class="cnb-n" hidden></span>';
cnBtn.setAttribute('aria-label', 'Carnet des curiosités');
const PASTILLE = (g) => g.kind !== 'epq';
// une pastille « croisée » : la lecture l'a dépassée sans qu'on la touche
function passedG(g) {
  if (!PASTILLE(g) || S.jeux[g.key] || gameOpen === g || (pend && pend.g === g)) return false;
  const r = reachK();
  return g.j + GAME_WIN < r || EPI[g.j] < EPI[Math.min(k, N - 1)] || (gmFin() && g.j <= r);
}
const pendingAll = () => GAMES.filter(passedG);
let badgeN = -1, flying = 0;   // le compteur monte quand la pastille arrive, pas avant
function paintBadge() {
  const n = Math.max(0, pendingAll().length - flying);
  const b = $('.cnb-n', cnBtn);
  b.hidden = !n; b.textContent = String(n);
  cnBtn.setAttribute('aria-label', 'Carnet des curiosités' + (n ? ' : ' + n + (n > 1 ? ' curiosités à découvrir' : ' curiosité à découvrir') : ''));
  if (badgeN >= 0 && n > badgeN && !byId('reader').hidden && (REDUCED || gmFin())) carnetGlow();
  badgeN = n;
}
function carnetGlow() { cnBtn.classList.remove('glow'); void cnBtn.offsetWidth; cnBtn.classList.add('glow'); }
// un objet vole d'un endroit de l'écran jusqu'au bouton du Carnet
function flyToCarnet(rect, node, done) {
  const t = cnBtn.getBoundingClientRect();
  if (REDUCED || speedHack || !t.width || !rect || !rect.width || byId('reader').hidden) { carnetGlow(); if (done) done(); return; }
  const f = el('div', 'fly45');
  f.style.left = rect.left + 'px'; f.style.top = rect.top + 'px'; f.style.width = rect.width + 'px'; f.style.height = rect.height + 'px';
  f.append(node);
  document.body.append(f);
  const dx = t.left + t.width / 2 - (rect.left + rect.width / 2), dy = t.top + t.height / 2 - (rect.top + rect.height / 2);
  const a = f.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: 'translate(' + (dx * .35) + 'px,' + (dy * .5 - 30) + 'px) scale(.85)', opacity: 1, offset: .45 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.22)', opacity: .15 }
  ], { duration: 950, easing: 'cubic-bezier(.45, .05, .3, 1)' });
  a.onfinish = () => { f.remove(); carnetGlow(); if (done) done(); };
}
// la pastille qu'on n'a pas touchée remonte doucement l'écran et se pose dans le bouton des curiosités
let flyTold = false;
function badgePop() { const n = $('.cnb-n', cnBtn); if (!n) return; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
function flyPastille(rect, btn) {
  const t = cnBtn.getBoundingClientRect();
  if (REDUCED || speedHack || !t.width || !rect || !rect.width || byId('reader').hidden) { carnetGlow(); paintBadge(); badgePop(); return; }
  // une copie de la vraie pastille ; dans .prail, elle garde ses couleurs et son dessin
  const wrap = el('div', 'prail fly45 flyp');
  const c = btn.cloneNode(true);
  c.classList.remove('in', 'shine', 'armed'); c.removeAttribute('id'); c.tabIndex = -1; c.setAttribute('aria-hidden', 'true');
  wrap.append(c);
  wrap.style.left = rect.left + 'px'; wrap.style.top = rect.top + 'px'; wrap.style.width = rect.width + 'px';
  document.body.append(wrap);
  flying++;
  const ic = c.querySelector('.rb-ico');
  const r0 = (ic || c).getBoundingClientRect();
  const dx = t.left + t.width / 2 - (r0.left + r0.width / 2), dy = t.top + t.height / 2 - (r0.top + r0.height / 2);
  wrap.style.transformOrigin = (r0.left - rect.left + r0.width / 2) + 'px ' + (r0.top - rect.top + r0.height / 2) + 'px';
  const a = wrap.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
    { transform: 'translate(0, -16px) scale(1.12)', opacity: 1, offset: .14 },
    { transform: 'translate(' + (dx * .2) + 'px,' + (dy * .45) + 'px) scale(1)', opacity: 1, offset: .5 },
    { transform: 'translate(' + (dx * .75) + 'px,' + (dy * .9) + 'px) scale(.7)', opacity: 1, offset: .84 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.28)', opacity: 0, offset: 1 }
  ], { duration: 1000, easing: 'cubic-bezier(.42, 0, .38, 1)', fill: 'forwards' });
  a.onfinish = () => { wrap.remove(); flying = Math.max(0, flying - 1); carnetGlow(); paintBadge(); badgePop(); };
  // version 51 : plus de message quand une pastille monte au Carnet (il sortait de la lecture)
}
{
  const pg = paintGames;
  paintGames = function () {
    const rail = byId('rail');
    const was = new Map($$('[data-game]', rail).map((b) => [b.dataset.game, { r: b.getBoundingClientRect(), b }]));
    pg();
    S.later.length = 0;   // plus de « Plus tard » : ce qu'on ne touche pas monte dans le Carnet
    was.forEach((v, key) => {
      if (rail.querySelector('[data-game="' + key + '"]')) return;
      const g = GAMES.find((x) => x.key === key);
      if (!g || S.jeux[key] || gameOpen === g || (pend && pend.g === g)) return;
      flyPastille(v.r, v.b);
    });
    paintBadge();
  };
}
putLater = function () { };

// ---------- 3. Phrases cultes et jurons d'époque : dans le coffre, tout seuls ----------
S.jurons = S.jurons.filter((m) => JURONS.some((x) => x.mot === m));
$('#chest .ch-lab').textContent = 'Phrase culte';
$('#chestD .ch-lab').textContent = 'Juron d’époque';
byId('chest').setAttribute('aria-label', 'Coffre à phrases cultes');
byId('chestD').setAttribute('aria-label', 'Coffre des jurons d’époque');
let beatBlock = false;
{
  const bt = beat;
  beat = function (ms) { if (!beatBlock) bt(ms); };   // le rangement est automatique : la lecture ne marque plus d'arrêt
  const cc = cornerCard;
  cornerCard = function (cls, build, ms) {
    return cc(cls, (c) => { build(c); $$('.cc-lab', c).forEach((x) => { if (/^Gros mot/.test(x.textContent)) x.textContent = 'Juron d’époque'; }); }, ms);
  };
}
const autoBusy = new Set();
function ghostFly(text, from, chestSel, isJuron, done) {
  const ch = $(chestSel);
  const to = ch && !ch.hidden ? ch.getBoundingClientRect() : null;
  if (REDUCED || speedHack || !from || !to || !to.width) { done(); return; }
  const g = el('div', 'cghost go auto' + (isJuron ? ' cg-dev' : ''));
  g.append(el('span', 'cg-star'), el('span', '', text.length > 60 ? text.slice(0, 58).replace(/\s+\S*$/, '') + '…' : text));
  document.body.append(g);
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
  const tr = (x, y, s) => 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%, -50%) scale(' + s + ')';
  const a = g.animate([{ transform: tr(x0, y0, 1), opacity: .95 }, { transform: tr((x0 + x1) / 2, Math.min(y0, y1) - 40, .7), opacity: 1, offset: .5 },
    { transform: tr(x1, y1, .25), opacity: .2 }], { duration: 820, easing: 'cubic-bezier(.4, .1, .3, 1)' });
  ch.classList.add('open');
  a.onfinish = () => { g.remove(); ch.classList.remove('open'); done(); };
}
function chestToCarnet(sel) {
  const ch = $(sel);
  if (!ch || ch.hidden) { carnetGlow(); return; }
  setTimeout(() => {
    const img = ch.querySelector('.ch-img');
    const r = (img || ch).getBoundingClientRect();
    const node = img ? img.cloneNode(true) : el('span');
    if (img) node.style.backgroundImage = getComputedStyle(img).backgroundImage;
    ch.hidden = true; ch.classList.remove('in', 'got', 'open');
    flyToCarnet(r, node, null);
  }, REDUCED ? 0 : 650);
}
function autoCulte(c) {
  if (!c || S.cultes.includes(c.si) || autoBusy.has('c' + c.si)) return;
  autoBusy.add('c' + c.si);
  const sp = culteSpans(c);
  const r0 = sp.length ? sp[0].getBoundingClientRect() : null;
  ghostFly(sentenceText(c.si), r0, '#chest', false, () => {
    autoBusy.delete('c' + c.si);
    if (S.cultes.includes(c.si)) return;
    captureCulte(c);
    chestToCarnet('#chest');
  });
}
function autoJuron(jr) {
  if (!jr || S.jurons.includes(jr.mot) || autoBusy.has('j' + jr.j)) return;
  autoBusy.add('j' + jr.j);
  const s = PVS[V[jr.j]];
  ghostFly(jr.mot, s ? s.getBoundingClientRect() : null, '#chestD', true, () => {
    autoBusy.delete('j' + jr.j);
    if (S.jurons.includes(jr.mot)) return;
    captureJuron(jr);
    chestToCarnet('#chestD');
  });
}
{
  const cl = culteLight;
  culteLight = function (j) {
    beatBlock = true;
    try { cl(j); } finally { beatBlock = false; }
    if (chestC && j === chestC.z) autoCulte(chestC);   // la fin de la phrase : elle part dans le coffre
  };
  const oj = offerJuron;
  offerJuron = function (jr) {
    beatBlock = true;
    try { oj(jr); } finally { beatBlock = false; }
    setTimeout(() => { if (juronC === jr) autoJuron(jr); }, REDUCED || speedHack ? 30 : 700);
  };
}

// ---------- 4. Les quiz : pouces, partage discret ----------
function thumbs(good, from) {
  if (REDUCED) return;
  const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : { left: innerWidth / 2 - 50, top: innerHeight / 2 - 50, width: 100, height: 100 };
  const box = el('div', 'thumbs45');
  const cx = r.left + r.width / 2, cy = good ? r.top + Math.min(r.height * .35, 160) : r.top + Math.min(r.height * .4, 180);
  for (let i = 0; i < 9; i++) {
    const s = el('span', good ? 'up' : 'down');
    s.innerHTML = SVG45.thumb;
    const sz = 22 + Math.random() * 16;
    s.style.setProperty('--s', sz + 'px');
    s.style.setProperty('--x', (cx + (Math.random() - .5) * Math.min(260, r.width * .8)) + 'px');
    s.style.setProperty('--y', (cy + (Math.random() - .5) * 40) + 'px');
    s.style.setProperty('--dx', ((Math.random() - .5) * 120) + 'px');
    s.style.setProperty('--dy', good ? -(150 + Math.random() * 140) + 'px' : (130 + Math.random() * 120) + 'px');
    s.style.setProperty('--rot', ((Math.random() - .5) * 50) + 'deg');
    s.style.setProperty('--dl', (i * .05) + 's');
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1900);
}
{
  const gr = gameResult;
  gameResult = function (g, good, delta) {
    gr(g, good, delta);
    if (g && !FREE(g)) thumbs(!!good, byId('gameC'));
  };
  const qa = quizAnswer;
  quizAnswer = function (good) { qa(good); thumbs(!!good, $('#quizSheet .panel')); };
  const fa = flAnswer;
  flAnswer = function (t, bs) {
    const q = FL && FL.qs[FL.i];
    const before = q ? q.res : 0;
    fa(t, bs);
    if (q && before === undefined && q.res !== undefined) thumbs(!!q.res, $('#flashSheet .panel'));
  };
}
let shareInfo = '', noShare = false;
function shareMsg(info) { return 'Devine ce que j’ai appris sur ' + APP + ' : ' + String(info || '').replace(/\s+/g, ' ').trim(); }
function doShare(msg) {
  if (navigator.share) { navigator.share({ text: msg }).catch(() => { }); return; }
  try { navigator.clipboard.writeText(msg).then(() => toast('Copié : colle-le où tu veux'), () => toast(msg)); } catch (e) { toast(msg); }
}
gameShareBtns = function (txt) {
  const info = shareInfo || '';
  shareInfo = '';
  if (noShare || (!info && !txt)) return [];
  const msg = shareMsg(info || txt);
  const row = el('div', 'gm-share gm-share1');
  const b = el('button', 'gm-sharei'); b.type = 'button';
  b.innerHTML = SVG45.share;
  b.setAttribute('aria-label', 'Partager ce que tu as appris');
  b.addEventListener('click', (ev) => { ev.stopPropagation(); doShare(msg); });
  row.append(b);
  return [row];
};
{
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    const g = gameOpen;
    let info = text || '';
    if (g && g.kind === 'savoir') info = g.x.txt;
    else if (g && g.kind === 'prix') info = 'en ' + YEAR + ', ' + g.x.somme + ', c’est ' + euroLine(g.x) + ' d’aujourd’hui.';
    shareInfo = info;
    noShare = !!(g && g.kind === 'quiqui');
    gf(good, head, text, share);
    shareInfo = ''; noShare = false;
    // au bandeau, tant qu'il reste un quiz, le bouton ferme seulement la carte
    if (BANDK(g)) { const go = $('#gameC .gm-go'); if (go) go.textContent = bandLeft(g.e) > 0 ? 'Fermer' : 'Continuer la lecture'; }
  };
}

// ---------- 5. Nouveaux quiz du bandeau : « Qui est qui ? » et « Question d'expert » ----------
const FINE_PTS = 20, QQ_PTS = 10;
const QQ_NAME = { duroy: 'Georges Duroy', forestier: 'Charles Forestier', rival: 'Jacques Rival', varenne: 'Norbert de Varenne', madeleine: 'Mme Forestier',
  clotilde: 'Mme de Marelle', virginie: 'Mme Walter', walter: 'M. Walter', laurine: 'Laurine' };
const qqName = (id) => (BOOK.id === 'belami' && QQ_NAME[id]) || (CAST[id] ? CAST[id].nom : id);
const FQ = [], QQ = [];
(Array.isArray(BOOK.quizFin) ? BOOK.quizFin : []).forEach((x) => {
  if (x && EPS[x.e] && Array.isArray(x.choix) && x.choix.length >= 2) FQ[x.e] = { key: 'f' + x.e, kind: 'fine', e: x.e, j: EPS[x.e].z, x: Object.assign({ nom: 'Question d’expert' }, x) };
});
{
  // un « Qui est qui ? » dès que trois nouveaux visages ont été rencontrés, dans les deux premiers chapitres seulement
  const faces = MAIN_SPEAKERS.filter((id) => CAST[id] && CAST[id].pf && PF[CAST[id].pf] && (BOOK.id !== 'belami' || QQ_NAME[id]));
  let last = 0;
  EPS.forEach((ep, e) => {
    if (ep.c > 1) return;
    const met = faces.filter((id) => FIRST_LINE.get(id) <= ep.z).sort((a, b) => FIRST_LINE.get(a) - FIRST_LINE.get(b));
    if (met.length >= 3 && met.length - last >= 3) { last = met.length; QQ[e] = { key: 'w' + e, kind: 'quiqui', e, j: ep.z, x: { ids: met.slice(-3), nom: 'Qui est qui ?' } }; }
  });
}
Object.assign(GAME_LAB, { fine: 'Question d’expert', quiqui: 'Qui est qui ?' });
{
  const gh = gameHead;
  gameHead = function (g) {
    if (g.kind === 'quiqui') return [el('span', 'mc-lab', 'Qui est qui ?'), el('strong', 'gm-q', 'Relie chaque visage à son nom'), el('span', 'gm-sub', 'Touche un visage, puis un nom.')];
    if (g.kind === 'fine') return [el('span', 'mc-lab', 'Question d’expert'), el('strong', 'gm-q', g.x.q)];
    return gh(g);
  };
}
GAME_BUILD.fine = function (body, g) {
  const x = g.x;
  const opts = x.choix.map((t, i) => {
    const b = el('button', 'qz-o gm-o', t); b.type = 'button';
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (gameDone) return;
      const ok = x.ok | 0, good = i === ok;
      opts.forEach((o, n) => { o.disabled = true; o.classList.toggle('ok', n === ok); o.classList.toggle('picked', n === i && !good); });
      gameResult(g, good, good ? FINE_PTS : 0);
      gameFeedback(good, good ? 'Bien vu ! +' + FINE_PTS + ' points' : 'La bonne réponse', (good ? '' : x.choix[ok] + '. ') + (x.info || ''), '');
      const fb = $('#gameC .gm-fb .gm-info');
      if (fb && x.passage) fb.after(el('p', 'epq-pas', '« ' + x.passage + ' »'));
      paintBandLines();
    });
    return b;
  });
  body.append(...opts);
};
GAME_BUILD.quiqui = function (body, g) {
  const ids = g.x.ids;
  const names = [ids[2], ids[0], ids[1]];   // dans un autre ordre que les visages
  const grid = el('div', 'qq-grid');
  const cf = el('div', 'qq-col'), cn = el('div', 'qq-col');
  const pairs = new Map();   // visage -> nom
  let selF = null, selN = null, tag = 0;
  const fBtn = new Map(), nBtn = new Map();
  ids.forEach((id) => {
    const b = el('button', 'qq-f'); b.type = 'button';
    const pf = portrait(id, 'qq-pf');
    $$('img', pf).forEach((im) => { im.alt = ''; });
    b.append(pf);
    b.setAttribute('aria-label', 'Visage ' + (ids.indexOf(id) + 1));
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (gameDone || pairs.has(id)) return; selF = id; mark(); tryPair(); });
    fBtn.set(id, b); cf.append(b);
  });
  names.forEach((id) => {
    const b = el('button', 'qq-n', qqName(id)); b.type = 'button';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (gameDone || [...pairs.values()].includes(id)) return; selN = id; mark(); tryPair(); });
    nBtn.set(id, b); cn.append(b);
  });
  function mark() {
    fBtn.forEach((b, id) => b.classList.toggle('sel', id === selF));
    nBtn.forEach((b, id) => b.classList.toggle('sel', id === selN));
  }
  function tryPair() {
    if (!selF || !selN) return;
    tag++;
    pairs.set(selF, selN);
    [fBtn.get(selF), nBtn.get(selN)].forEach((b) => { b.classList.add('used'); b.classList.remove('sel'); const t = el('span', 'qq-tag', String(tag)); b.append(t); });
    selF = null; selN = null; buzz(6);
    if (pairs.size === ids.length) finish();
  }
  function finish() {
    let n = 0;
    ids.forEach((id) => {
      const good = pairs.get(id) === id; if (good) n++;
      const fb = fBtn.get(id), nb2 = nBtn.get(pairs.get(id));
      fb.classList.add(good ? 'ok' : 'no'); nb2.classList.add(good ? 'ok' : 'no');
      fb.append(el('span', 'qq-cap' + (good ? ' ok' : ''), qqName(id)));
    });
    const all = n === ids.length;
    gameResult(g, all, n * QQ_PTS);
    gameFeedback(all, all ? 'Bien vu ! +' + n * QQ_PTS + ' points' : n + ' sur ' + ids.length + (n ? ' · +' + n * QQ_PTS + ' points' : ''),
      ids.map((id) => qqName(id)).join(' · '), '');
    paintBandLines();
  }
  grid.append(cf, cn);
  body.append(grid);
};
// les lignes du bandeau
const BANDS = (e) => [EPQ[e]].filter(Boolean);   // v56 : le petit quiz seul
const bandLeft = (e) => BANDS(e).filter((g) => !S.jeux[g.key]).length;
function bandLine(x, g) {
  x.replaceChildren();
  const r = S.jeux[g.key];
  if (r) {
    const ic = el('span', 'epq-ic'); ic.innerHTML = r.ok ? ICO_OK : ICO_BOOK;
    x.append(ic, el('span', 'epq-done', g.kind === 'fine' ? (r.ok ? 'Question d’expert : bien vu ! +' + FINE_PTS + ' points' : 'Question d’expert faite') : (r.ok ? 'Qui est qui ? Sans faute !' : 'Qui est qui ? fait')));
    return;
  }
  const b = el('button', 'epq-b'); b.type = 'button';
  const q = el('span', 'epq-q'); q.innerHTML = g.kind === 'fine' ? SVG45.loupe : SVG45.faces;
  b.append(q, el('span', '', g.kind === 'fine' ? 'Question d’expert' : 'Qui est qui ?'), el('small', '', '+' + (g.kind === 'fine' ? FINE_PTS : QQ_PTS * 3) + ' points'));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); unlockAudio(); openGame(g); });
  x.append(b, el('span', 'epq-opt', 'facultatif'));
}
function paintBandLines() { $$('.ee-band').forEach((x) => { const g = [...QQ, ...FQ].find((y) => y && y.key === x.dataset.key); if (g) bandLine(x, g); }); }
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    fe(box, info, isLast);
    const e = info.e;
    const act = box.querySelector('.ee-act');
    [QQ[e], FQ[e]].forEach((g) => {
      if (!g) return;
      const x = el('div', 'ee-epq ee-band');
      x.dataset.key = g.key;
      const before = act || box.lastElementChild;
      x.style.setProperty('--i', before && before.style ? (before.style.getPropertyValue('--i') || '6') : '6');
      bandLine(x, g);
      box.insertBefore(x, before);
    });
  };
  const ee = endEpisode;
  endEpisode = function (e, isLast) {
    ee(e, isLast);
    // des quiz en plus : un peu plus de temps pour les voir
    const extra = (QQ[e] && !S.jeux[QQ[e].key] ? 1 : 0) + (FQ[e] && !S.jeux[FQ[e].key] ? 1 : 0);
    if (!isLast && extra && inter && interGo && playing && !speedHack) {
      clearTimeout(timer);
      const wait = INTER_MS + (chapterEndsAt(e) ? 3000 : 0) + (epqLive(e) ? 2500 : 0) + extra * 2500;
      $$('.ee-go').forEach((b) => { b.style.setProperty('--wait', wait + 'ms'); b.classList.remove('run'); void b.offsetWidth; b.classList.add('run'); });
      timer = setTimeout(interGo, wait);
    }
  };
}
// au bandeau : après un quiz, la lecture attend (il en reste) ou repart (tout est fait) ; « Continuer » passe
const BANDK = (g) => g && (g.kind === 'epq' || g.kind === 'quiqui' || g.kind === 'fine');

// ---------- 6. Jouer une pastille depuis le Carnet ----------
let cnSlot = null;
function openInCarnet(g, li) {
  if (!g || gameOpen || S.jeux[g.key]) return;
  mountAnchor = li;          // hors de la page : la carte n'y est pas posée
  openGame(g);
  mountAnchor = null;
  if (gameOpen !== g) return;
  const box = byId('gameC');
  const host = el('div', 'gmslot cnslot'), inner = el('div', 'gm-in');
  host.append(inner);
  li.after(host);
  inner.append(box);
  box.hidden = false; box.classList.remove('in', 'out');
  if (stage.dataset.game !== '0') stage.dataset.game = '0';
  void host.offsetWidth; host.classList.add('open');
  cnSlot = { host, box, li };
  const sk = $('.gm-skip', box);
  if (sk && !FREE(g)) { const b = el('button', 'btn gm-close', 'Fermer'); b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation(); closeGame(false); }); sk.replaceWith(b); }
  else if (sk) sk.remove();
  $$('.gm-foot', box).forEach((f) => f.remove());
  setTimeout(() => host.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' }), 60);
}
{
  const cg = closeGame;
  closeGame = function (resume) {
    const g = gameOpen;
    if (!g) return;
    const box = byId('gameC');
    if (cnSlot && cnSlot.box === box) {
      const s = cnSlot; cnSlot = null;
      gameWas = false;
      cg(false);
      s.host.classList.add('shut'); s.host.classList.remove('open');
      setTimeout(() => {
        box.hidden = true; box.classList.remove('out', 'in');
        stage.insertBefore(box, byId('rail'));
        s.host.remove();
        paintBadge();
        if (!byId('carnetSheet').hidden) { buildMenu(); const id = cnCur; if (id) cnGo(id); }
      }, REDUCED ? 20 : 420);
      return;
    }
    if (BANDK(g)) {
      gameWas = false;           // la lecture ne repart pas toute seule
      cg(resume);
      setTimeout(() => {
        paintEpqLines(); paintBandLines();
        if (!bandLeft(g.e) && !byId('reader').hidden && !playing && !gameOpen) continueNow();
      }, REDUCED ? 30 : 480);
      return;
    }
    cg(resume);
  };
  const cs = closeSheets;
  closeSheets = function () { if (cnSlot && gameOpen) closeGame(false); closeModeMenu(); cs(); };
}

// ---------- 7. Les rubriques du Carnet des curiosités ----------
const KLAB = { savoir: 'à savoir', prix: 'prix', curseur: 'en chiffres', existait: 'inventions', histoire: 'personnage célèbre', lieu: 'lieu', etymo: 'mot', sens: 'mot' };
const RUB = {
  decouv: (g) => g.kind === 'savoir' || g.kind === 'prix' || g.kind === 'curseur' || g.kind === 'existait',
  celebres: (g) => g.kind === 'histoire',
  lieux: (g) => g.kind === 'lieu',
  mots: (g) => g.kind === 'etymo' || g.kind === 'sens'
};
const pendIn = (id) => (RUB[id] ? pendingAll().filter(RUB[id]) : []);
function pendTitle(g) {
  const x = g.x;
  if (g.kind === 'prix') return x.somme;
  if (g.kind === 'etymo' || g.kind === 'sens') return '« ' + x.nom + ' »';
  if (g.kind === 'existait') return 'Ça existait en ' + YEAR + ' ?';
  return x.nom || GAME_LAB[g.kind] || 'Curiosité';
}
function pendItem(g) {
  const li = el('li', 'dc-item pend ' + g.kind);
  const h = el('div', 'mt-h');
  h.append(el('strong', '', pendTitle(g)), el('span', 'dc-pos', KLAB[g.kind] || ''));
  li.append(h, el('p', 'mt-d', FREE(g) ? 'Croisé en lisant : à découvrir.' : 'Croisé en lisant : à jouer.'));
  const go = smallBtn(FREE(g) ? 'Découvrir' : 'Jouer', () => openInCarnet(g, li));
  go.classList.add('gold');
  const src = el('div', 'src'); src.append(el('span', '', where(g.j)), go);
  li.append(src);
  return li;
}
function pendSection(id, title) {
  const list = pendIn(id);
  if (!list.length) return null;
  const sec = el('section', 'dc-sec pend-sec');
  sec.id = 'pend-' + id;
  sec.append(el('h3', 'eyebrow sect-label', (title || 'À découvrir') + ' · ' + list.length));
  const ul = el('ul', 'hearts mots-list dc-list');
  list.forEach((g) => ul.append(pendItem(g)));
  sec.append(ul);
  return sec;
}
{
  const panel = $('#carnetSheet .panel');
  const mk = (id, inner) => { const s = el('section', 'pane'); s.dataset.pane = id; s.hidden = true; s.innerHTML = inner; panel.append(s); return s; };
  mk('attente', '<div id="cnWait"></div>');
  mk('tableaux', '<div id="cnTab"></div>');
  mk('celebres', '<div id="cnCeleb"></div>');
  // ordre et noms des rubriques
  const take = (id) => { const i = CN.findIndex((c) => c.id === id); return i >= 0 ? CN.splice(i, 1)[0] : null; };
  const rename = (c, t, ic) => { if (c) { c.t = t; if (ic) c.ic = ic; } return c; };
  const marques = take('marques'), decouv = take('decouv'), frise = take('frise'), lieux = rename(take('lieux'), 'Géographie'),
    cultes = take('cultes'), jurons = rename(take('jurons'), 'Jurons d’époque'), citations = take('citations'), perso = take('perso'),
    mots = rename(take('mots'), 'Vocabulaire');
  const rest = CN.splice(0, CN.length);
  CN.push(...[marques,
    { id: 'attente', t: 'Pastilles à découvrir', ic: SVG45.cab },
    { id: 'flash', t: 'Flash quiz', ic: ICO.bolt },
    decouv,
    { id: 'tableaux', t: 'Tableaux d’époque', ic: ICO.frame },
    { id: 'celebres', t: 'Personnages célèbres', ic: SVG45.laurel },
    lieux, mots, frise, perso, cultes, jurons, citations, ...rest].filter(Boolean));
}
let cnCur = '';
{
  const cc = cnCount;
  cnCount = function (id) {
    if (id === 'flash') { const n = flashPool().length; return n >= FLASH_MIN ? 'Teste-toi sur ce que tu as appris' : 'Encore ' + (FLASH_MIN - n) + ' découverte' + (FLASH_MIN - n > 1 ? 's' : '') + ' pour le lancer'; }
    if (id === 'attente') { const n = pendingAll().length; return n ? n + (n > 1 ? ' pastilles laissées en lisant' : ' pastille laissée en lisant') : 'Rien en attente'; }
    if (id === 'tableaux') { const all = TABS.filter((t) => CHAPS[t.ci]); return all.filter((t) => S.avant[t.key]).length + ' sur ' + all.length; }
    if (id === 'celebres') { const all = GAMES.filter(RUB.celebres); return all.filter(isDone).length + ' sur ' + all.length; }
    return cc(id);
  };
  const bm = buildMenu;
  buildMenu = function () {
    bm();
    const f = $('#cnMenu [data-cn="flash"]'); if (f) f.classList.add('wide', 'flash45');
    const w = $('#cnMenu [data-cn="attente"]'); if (w) { const n = pendingAll().length; w.classList.add('wide', 'wait45'); w.hidden = !n; const tx = $('.cn-tx', w); if (tx && n) tx.append(el('span', 'cn-badge', n + ' à découvrir')); }
    Object.keys(RUB).forEach((id) => {
      const n = pendIn(id).length;
      const t = $('#cnMenu [data-cn="' + id + '"] .cn-tx');
      if (t && n) t.append(el('span', 'cn-badge', n + (n > 1 ? ' à découvrir' : ' à découvrir')));
    });
  };
  const cg = cnGo;
  cnGo = function (id) {
    if (id === 'flash') { closeSheets(); openFlash(); return; }
    cnCur = id || '';
    cg(id);
    if (!id) byId('carnetTitle').textContent = 'Carnet des curiosités';
    if (id === 'attente') fillAttente();
    if (id === 'tableaux') fillTableaux();
    if (id === 'celebres') fillCelebres();
    if (id === 'mots') { const p = $('#carnetSheet [data-pane="mots"]'); $$('.pend-sec', p).forEach((x) => x.remove()); const s = pendSection('mots'); if (s) p.prepend(s); }
  };
  const fl = fillLieux;
  fillLieux = function () {
    fl();
    const p = $('#carnetSheet [data-pane="lieux"]');
    $$('.pend-sec', p).forEach((x) => x.remove());
    const s = pendSection('lieux', 'Sur la carte, à découvrir');
    if (s) p.prepend(s);
  };
  const oc = openCarnet;
  openCarnet = function (tab) { oc(tab); if (!tab || !byId('cnMenu').hidden) { cnCur = ''; byId('carnetTitle').textContent = 'Carnet des curiosités'; } };
}
function fillAttente() {
  S.cnWaitSeen = 1;
  const host = byId('cnWait');
  const parts = [el('p', 'cn-lead45', 'Les pastilles que tu as laissées passer en lisant. Touche « Jouer » ou « Découvrir » : elles s’ouvrent ici, sous la ligne.')];
  const seen = new Set();
  Object.keys(RUB).forEach((id) => { const s = pendSection(id, (CN.find((c) => c.id === id) || {}).t); if (s && !seen.has(s.textContent)) { seen.add(s.textContent); parts.push(s); } });
  if (parts.length === 1) parts.push(el('p', 'empty', 'Rien en attente : tu as tout fait.'));
  host.replaceChildren(...parts);
}
function fillTableaux() {
  const host = byId('cnTab');
  host.replaceChildren(el('p', 'cn-lead45', 'Les peintures de l’époque, montrées au début de chaque chapitre. Touche un tableau pour le revoir.'));
  ROOM_FILL.tableaux(host);
  const all = TABS.filter((t) => CHAPS[t.ci]);
  const left = all.filter((t) => !S.avant[t.key]).length;
  if (left) host.append(el('p', 'empty', 'Encore ' + nb(left, 'image', 'images') + ' : chacune t’attend au début de son chapitre.'));
}
function fillCelebres() {
  const host = byId('cnCeleb');
  const all = GAMES.filter(RUB.celebres);
  const got = all.filter(isDone);
  const parts = [el('p', 'cn-lead45', 'Les grands noms cités dans ' + BOOK.titre + ' : qui étaient-ils ?')];
  const ps = pendSection('celebres'); if (ps) parts.push(ps);
  if (got.length) {
    const sec = el('section', 'dc-sec');
    sec.append(el('h3', 'eyebrow sect-label', 'Découverts · ' + got.length));
    const ul = el('ul', 'hearts mots-list dc-list');
    got.forEach((g) => ul.append(dcItem(g, false)));
    sec.append(ul);
    parts.push(sec);
  }
  const left = all.length - got.length - pendIn('celebres').length;
  parts.push(el('p', 'empty', left > 0 ? 'Encore ' + nb(left, 'personnage', 'personnages') + ' à croiser en lisant.' : got.length === all.length ? 'Tous les personnages célèbres du livre sont là.' : ''));
  host.replaceChildren(...parts);
}
// Découvertes : sans les tableaux (ils ont leur rubrique) ni les personnages célèbres ; les pastilles croisées en premier
fillDecouv = function () {
  const box = byId('cnDecouv');
  const L = learnedN();
  const head = el('div', 'dc-head');
  head.append(el('b', '', fmtInt(L)), el('span', '', (L > 1 ? 'choses apprises' : 'chose apprise') + ' sur ' + YEAR + ' en lisant ' + BOOK.titre));
  const parts = [head];
  const ps = pendSection('decouv'); if (ps) parts.push(ps);
  [['À savoir', (g) => g.kind === 'savoir'], ['Le prix d’aujourd’hui', (g) => g.kind === 'prix'], ['Chiffres et inventions', (g) => g.kind === 'curseur' || g.kind === 'existait']].forEach(([t, f]) => {
    const got = GAMES.filter((g) => f(g) && S.jeux[g.key]);
    if (!got.length) return;
    const sec = el('section', 'dc-sec');
    sec.append(el('h3', 'eyebrow sect-label', t + ' · ' + got.length));
    const ul = el('ul', 'hearts mots-list dc-list');
    got.forEach((g) => ul.append(dcItem(g, false)));
    sec.append(ul);
    parts.push(sec);
  });
  parts.push(el('p', 'empty', L ? 'Les tableaux, les personnages célèbres, les lieux et les mots ont leur propre rubrique.'
    : 'En lisant, les curiosités montent dans ton Carnet. Tu les découvres à la fin de l’épisode, ou ici, quand tu veux.'));
  box.replaceChildren(...parts);
};

// ---------- 8. Les points : en haut de Découvertes ----------
{
  const rm = renderMusee;
  renderMusee = function () {
    rm();
    if (roomCur) return;
    const m = byId('musee'); if (!m) return;
    const hero = $('.mu-hero', m); const foot = $('.mu-foot', m);
    if (foot) foot.remove();
    const li = levelInfo(S.pts);
    const card = el('div', 'mu-pts');
    card.append(el('span', 'ico-pt'), el('b', '', fmtInt(S.pts) + ' points'),
      el('small', '', 'Niveau ' + (li.lv + 1) + ' · ' + LEVELS[li.lv].t + (QUIZ_N ? ' · ' + nb(totalStars(), 'étoile', 'étoiles') + ' aux défis' : '') + ' · garde-les, ils serviront bientôt'));
    if (hero) hero.after(card); else m.prepend(card);
  };
  const mr = roomOf('mots'); if (mr) mr.s = 'Mots anciens, sens oubliés, jurons d’époque';
  const rc = ROOM_FILL.cultes;
  ROOM_FILL.cultes = function (host) {
    rc(host);
    $$('.room-left', host).forEach((p) => { p.textContent = p.textContent.replace(/ : quand une phrase.*$|: quand une phrase.*$/, ' : elles se rangent toutes seules, en lisant.'); });
  };
}

// ---------- 9. Aa : « Dans le Carnet » au lieu de « À la fin de l'épisode » ----------
{
  const b = $('[data-gmode="fin"]'); if (b) b.textContent = 'Dans le Carnet';
  const n = $('.gmseg + .set-note'); if (n) n.textContent = 'Pendant la lecture : touche une pastille, elle s’ouvre à la fin de la phrase. Celles que tu laisses passer montent dans le Carnet des curiosités. « Dans le Carnet » : aucune pastille pendant la lecture.';
}
paintBadge();
window.__v45 = { passedG, pendingAll, paintBadge, flyToCarnet, thumbs, openInCarnet, QQ, FQ, BANDS, bandLeft, get cnSlot() { return cnSlot; }, autoCulte, autoJuron, paintModeBtn };

/* ================= Version 47 =================
   Demandé par Guillaume :
   – l'appli change de nom (elle s'appelle « Enfin lu » depuis la version 82) ;
   – accueil épuré : plus de salutation ni de « Tes découvertes » ; « En cours de lecture » montre chaque livre commencé ;
     la frise des époques est un peu plus grande ;
   – Découvertes : chaque catégorie lance son propre quiz (les tableaux : l'image, et retrouver son titre…) ;
     nouvelles catégories : Personnages célèbres, Jurons d'époque ;
   – Carnet des curiosités refait, plus beau, sans Flash quiz ; plus de bouton de partage dans le lecteur ;
   – émotions des personnages : des cœurs quand on parle d'amour, une larme quand on est triste,
     un petit nuage d'orage quand on est en colère (champ « emotions » du paquet, version 16). */

// ---------- 1. Accueil ----------
{
  const hello = byId('hello');
  if (hello && hello.parentNode) hello.parentNode.classList.add('hello47');
  const more = el('div', 'cur47'); more.id = 'curMore';
  byId('hero').after(more);
  // la bienvenue : le Flash quiz est dans Découvertes
  const st = $('#welcome .wc-steps li:last-child small');
  if (st) st.textContent = 'dans Découvertes';
}
if (!S.libSum || typeof S.libSum !== 'object') S.libSum = {};
function otherStarted() {
  return BOOKS.filter((b) => b.id !== BOOK.id && S.lib[b.id] && (S.lib[b.id].k > 0 || Object.keys(S.lib[b.id].eps || {}).length))
    .sort((a, b) => ((S.libSum[b.id] || {}).at || 0) - ((S.libSum[a.id] || {}).at || 0));
}
function miniHero(b) {
  const sum = S.libSum[b.id] || {};
  const row = el('div', 'hero mini47');
  const open = el('button', 'hero-open'); open.type = 'button';
  const cv = el('span', 'hero-cv'); cv.append(coverEl(b, true));
  const tx = el('span');
  const bar = el('span', 'hero-bar'); const f = el('i'); f.style.setProperty('--p', (sum.pct || 0) + '%'); bar.append(f);
  tx.append(el('span', 'hero-eb', 'Continuer la lecture'), el('span', 'hero-t', b.t), el('span', 'hero-s', sum.s || b.a), bar, el('span', 'hero-m', sum.m || ''));
  open.append(cv, tx);
  const play = el('button', 'hero-play'); play.type = 'button';
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  play.setAttribute('aria-label', 'Reprendre ' + b.t);
  const go = () => bookTap(b);
  open.addEventListener('click', go); play.addEventListener('click', go);
  row.append(open, play);
  return row;
}
{
  const rh = refreshHome;
  refreshHome = function () {
    rh();
    const dec = byId('homeDec'); if (dec) { dec.replaceChildren(); dec.hidden = true; }
    const started = hasStarted();
    if (started) S.libSum[BOOK.id] = { s: byId('heroS').textContent, m: byId('heroM').textContent, pct: chapterDone() ? 100 : chapPct(k), at: (S.libSum[BOOK.id] || {}).at || Date.now() };
    const others = otherStarted();
    byId('curMore').replaceChildren(...others.map(miniHero));
    byId('curLab').textContent = started || others.length ? 'En cours de lecture' : 'Ton premier classique';
  };
  // le livre qu'on lit passe en tête : on note l'heure à chaque lecture
  const se = startEpisode;
  startEpisode = function () { S.libSum[BOOK.id] = Object.assign(S.libSum[BOOK.id] || {}, { at: Date.now() }); return se.apply(this, arguments); };
}

// ---------- 2. Découvertes : de nouvelles salles, et un quiz par salle ----------
const JURON_DEF = { bougre: 'Gaillard, individu ; « ce bougre-là » : ce sale type (familier)' };
const jDef = (w) => { const x = dictLookup(w); return (x && x.def) || JURON_DEF[normTxt(w)] || ''; };
const CELEB = (g) => g.kind === 'histoire';
{
  const take = (id) => { const i = ROOMS.findIndex((r) => r.id === id); return i >= 0 ? ROOMS.splice(i, 1)[0] : null; };
  const t = take('tableaux'), c = take('cultes'), m = take('mots'), a = take('anecdotes'), d = take('dates'), l = take('lieux'), p = take('perso');
  const rest = ROOMS.splice(0, ROOMS.length);
  t.t = 'Tableaux d’époque';
  m.t = 'Vocabulaire'; m.s = 'Mots anciens, sens oubliés';
  m.got = () => GAMES.filter((g) => WORDG(g) && isDone(g)).length + S.mots.length;
  m.all = () => GAMES.filter(WORDG).length + S.mots.length;
  l.t = 'Géographie'; d.t = 'La frise'; p.t = 'Personnages';
  a.s = 'À savoir, prix, chiffres, inventions';
  const celeb = { id: 'celebres', t: 'Personnages célèbres', s: 'Les grands noms cités dans le roman', ic: SVG45.laurel,
    got: () => GAMES.filter((g) => CELEB(g) && isDone(g)).length, all: () => GAMES.filter(CELEB).length };
  const jur = { id: 'jurons', t: 'Jurons d’époque', s: 'Les mots doux… et les autres', ic: ICO.quote, img: '#chestD',
    got: () => S.jurons.length, all: () => JURONS.length };
  ROOMS.push(...[t, celeb, a, m, jur, c, p, l, d, ...rest].filter(Boolean));
}
ROOM_FILL.mots = function (host) {
  const ul = el('ul', 'room-list words');
  const add = (w, def, extra, tag) => {
    const li = cartel('word-li');
    const h = el('div', 'wd-h'); h.append(el('strong', '', w), el('span', 'wd-tag', tag));
    li.append(h);
    if (def) li.append(el('p', 'wd-d', def));
    if (extra) li.append(el('p', 'wd-x', extra));
    ul.append(li);
  };
  GAMES.filter((g) => WORDG(g) && isDone(g)).forEach((g) => add(g.x.nom, g.x.choix[g.x.ok | 0], g.x.info || '', g.kind === 'sens' ? 'a changé de sens' : 'étymologie'));
  S.mots.forEach((mo) => { const x = dictLookup(mo.w); add(mo.w, x ? x.def : '', x ? 'En anglais : ' + x.en : '', 'mot ancien'); });
  host.append(ul, lockedNote(roomOf('mots').all() - roomOf('mots').got(), ' : ils montent dans ton Carnet en lisant'));
};
ROOM_FILL.jurons = function (host) {
  const ul = el('ul', 'room-list words');
  S.jurons.forEach((w) => {
    const x = dictLookup(w);
    const li = cartel('word-li');
    const h = el('div', 'wd-h'); h.append(el('strong', '', w), el('span', 'wd-tag', 'juron d’époque'));
    li.append(h, el('p', 'wd-d', jDef(w)));
    if (x && x.en) li.append(el('p', 'wd-x', 'En anglais : ' + x.en));
    const jr = JURONS.find((y) => y.mot === w);
    if (jr) { const src = el('div', 'src'); src.append(el('span', '', where(jr.j)), smallBtn('Lire ici', () => goRead(jr.j))); li.append(src); }
    ul.append(li);
  });
  host.append(ul, lockedNote(JURONS.length - S.jurons.length, ' : ils se rangent tout seuls en lisant'));
};
ROOM_FILL.celebres = function (host) {
  const ul = el('ul', 'room-list words');
  GAMES.filter((g) => CELEB(g) && isDone(g)).forEach((g) => {
    const li = cartel('word-li');
    const h = el('div', 'wd-h'); h.append(el('strong', '', g.x.nom), el('span', 'wd-tag', 'personnage célèbre'));
    li.append(h, el('p', 'wd-d', g.x.info || ''));
    ul.append(li);
  });
  host.append(ul, lockedNote(GAMES.filter((g) => CELEB(g) && !isDone(g)).length, ' : ils montent dans ton Carnet en lisant'));
};

// les questions de chaque salle
const FAMOUS47 = ['Le Déjeuner des canotiers', 'Bal du moulin de la Galette', 'Rue de Paris, temps de pluie', 'L’Absinthe', 'Impression, soleil levant',
  'La Gare Saint-Lazare', 'Les Raboteurs de parquet', 'Le Déjeuner sur l’herbe', 'La Classe de danse'];
const MUSEES47 = ['Musée du Louvre, Paris', 'National Gallery, Londres', 'Art Institute of Chicago', 'Musée d’Orsay, Paris', 'Musée de l’Orangerie, Paris'];
const CATS47 = {
  tableaux: ['tableau', 'tableau-t', 'tableau-m', 'tableau-a'], celebres: ['histoire'], anecdotes: ['savoir', 'prix', 'existait', 'curseur'],
  mots: ['etymo', 'sens', 'mot'], jurons: ['juron', 'juron-r'], cultes: ['culte', 'culte-c'], perso: ['perso'], lieux: ['lieu', 'paris'], dates: ['date']
};
function catPool(id) {
  const Q = [];
  const add = (type, q) => { if (q && q.choix && q.choix.length >= 2 && new Set(q.choix).size === q.choix.length && q.choix.every(Boolean)) Q.push(Object.assign({ type }, q)); };
  const types = CATS47[id] || [];
  flashPool().forEach((q) => {
    if (q.type === 'mot') q.type = /«\s*(.+?)\s*»/.test(q.q) && S.jurons.includes(q.q.match(/«\s*(.+?)\s*»/)[1]) ? 'juron-x' : 'mot';
    if (types.includes(q.type)) Q.push(q);
  });
  if (id === 'tableaux') {
    const seen = TABS.map((t) => ({ a: t.a, ci: t.ci, key: t.key, p: paintingOf(t.a) })).filter((o) => CHAPS[o.ci] && S.avant[o.key] && o.a.tableau && o.a.img);
    const titles = TABS.map((t) => paintingOf(t.a).titre).filter(Boolean);
    seen.forEach(({ a, p }) => {
      const tOthers = shuffle(Array.from(new Set(titles.concat(isPhoto(a) ? [] : FAMOUS47))).filter((x) => x !== p.titre)).slice(0, 2);
      add('tableau-t', { q: isPhoto(a) ? 'Quelle est cette photo ?' : 'Quel est ce tableau ?', img: a.img, choix: [p.titre].concat(tOthers), ok: p.titre, info: p.titre + ', ' + p.peintre + (p.an ? ', ' + p.an : '') + '.' });
      if (a.musee) {
        const mOthers = shuffle(Array.from(new Set(TABS.map((t) => t.a.musee).filter(Boolean).concat(MUSEES47))).filter((x) => x !== a.musee)).slice(0, 2);
        add('tableau-m', { q: 'Où peut-on voir « ' + p.titre + ' » aujourd’hui ?', img: a.img, choix: [a.musee].concat(mOthers), ok: a.musee, info: p.titre + ' est exposé à : ' + a.musee + '.' });
      }
      if (/^\d{4}$/.test(p.an)) {
        const y = Number(p.an);
        add('tableau-a', { q: 'En quelle année « ' + p.titre + ' » a-t-il été peint ?', img: a.img, choix: [String(y), String(y - 6), String(y + 7)], ok: String(y), info: p.peintre + ' le peint en ' + y + ((BOOK.annee || YEAR) - y > 0 ? ', ' + ((BOOK.annee || YEAR) - y) + ' ans avant ' + BOOK.titre : '') + '.' });
      }
    });
  }
  if (id === 'cultes') {
    // compléter la phrase : la fin cachée, à retrouver parmi celles d'autres phrases cultes
    const cut = (t) => { const w = t.replace(/\s+/g, ' ').trim().split(' '); const n = Math.max(2, Math.min(5, Math.round(w.length * .35))); return w.length >= 5 ? [w.slice(0, -n).join(' '), w.slice(-n).join(' ')] : null; };
    const ends = CULTES.map((c) => cut(sentenceText(c.si))).filter(Boolean).map((x) => x[1]);
    CULTES.filter((c) => S.cultes.includes(c.si)).forEach((c) => {
      const x = cut(sentenceText(c.si)); if (!x) return;
      const others = shuffle(ends.filter((e) => e !== x[1])).slice(0, 2);
      add('culte-c', { q: 'Complète la phrase culte', quote: x[0] + ' …', choix: [x[1]].concat(others), ok: x[1], info: where(c.a) });
    });
  }
  if (id === 'jurons') {
    const pool = JURONS.map((x) => ({ w: x.mot, d: jDef(x.mot) })).filter((o) => o.d);
    S.jurons.forEach((w) => {
      const d = jDef(w);
      if (!d) return;
      const others = shuffle(pool.filter((o) => o.w !== w && o.d !== d)).slice(0, 2);
      if (others.length < 2) return;
      add('juron', { q: 'Que veut dire « ' + w + ' » ?', choix: [d].concat(others.map((o) => o.d)), ok: d, info: 'Le juron d’époque, tel qu’on le disait en ' + YEAR + '.' });
      add('juron-r', { q: 'Quel juron veut dire : « ' + d + ' » ?', choix: [w].concat(others.map((o) => o.w)), ok: w, info: '« ' + w + ' » : ' + d + '.' });
    });
    Q.splice(0, Q.length, ...Q.filter((q) => q.type !== 'juron-x'));
  }
  if (id === 'lieux') {
    const names = LIEU_G.map((g) => g.x.nom);
    LIEU_G.filter(isDone).forEach((g) => {
      const others = shuffle(names.filter((n) => n !== g.x.nom)).slice(0, 2);
      add('lieu', { q: 'De quel lieu s’agit-il ? « ' + (g.x.info || '').replace(/\s*\(.*?\)\s*/g, ' ').trim() + ' »', choix: [g.x.nom].concat(others), ok: g.x.nom, info: g.x.q ? g.x.nom + ' : ' + (g.x.info || '') : '' });
    });
    if (PD) {
      const ids = pdReached().order;
      const all = Object.keys(PD.lieux);
      ids.forEach((pid) => {
        const L = PD.lieux[pid];
        if (!L || !L.txt) return;
        const others = shuffle(all.filter((x) => x !== pid)).slice(0, 2).map((x) => PD.lieux[x].nom);
        add('paris', { q: 'Dans le roman : « ' + L.txt + ' » Où est-on ?', choix: [L.nom].concat(others), ok: L.nom, info: L.nom + ', dans le Paris de ' + YEAR + '.' });
      });
    }
  }
  return Q;
}
const CAT_MIN = 2;
if (!S.flash.cat || typeof S.flash.cat !== 'object') S.flash.cat = {};
function openFlashCat(id) {
  const r = roomOf(id);
  const pool = shuffle(catPool(id));
  if (pool.length < CAT_MIN) { toast(pool.length ? 'Découvre encore une chose dans cette salle pour lancer son quiz' : 'Rien à réviser ici pour l’instant : découvre d’abord quelques cartes en lisant'); return; }
  // les tableaux : d'abord l'image, et retrouver son titre
  if (id === 'tableaux') pool.sort((a, b) => (b.type === 'tableau-t') - (a.type === 'tableau-t'));
  const qs = pool.slice(0, FLASH_N).map((q) => Object.assign({}, q, { choix: q.keep ? q.choix : shuffle(q.choix) }));
  FL = { qs, i: 0, n: 0, pts: S.flash.cat[id] !== today(), cat: id };
  byId('flTitle').textContent = r ? r.t : 'Quiz';
  $('#flashSheet .fl-head .eyebrow').textContent = 'Quiz de la salle';
  openSheet('#flashSheet');
  flRender();
}
{
  const of = openFlash;
  openFlash = function () {
    byId('flTitle').textContent = 'Ce que tu as découvert';
    $('#flashSheet .fl-head .eyebrow').textContent = 'Flash quiz';
    return of.apply(this, arguments);
  };
  const fe = flEnd;
  flEnd = function () {
    const cat = FL && FL.cat;
    if (!cat) return fe.apply(this, arguments);
    const day = S.flash.day, plays = S.flash.plays, best = S.flash.best;
    const pts = FL.pts;
    fe.apply(this, arguments);
    S.flash.day = day; S.flash.plays = plays; S.flash.best = best;   // le Flash quiz général garde ses points du jour
    if (pts) S.flash.cat[cat] = today();
    persist();
    const again = $('#flBody .fl-act .btn.primary');
    if (again) { const b2 = again.cloneNode(true); again.replaceWith(b2); b2.addEventListener('click', () => { flClose(); openFlashCat(cat); }); }
    const pl = $('#flBody .fl-pts');
    if (pl && !pts) pl.textContent = 'Entraînement : les points de ce quiz se gagnent une fois par jour';
  };
}
const ICO_BOLT47 = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.8L5.6 13.1h5.3l-1.1 8.1 7.6-10.3h-5.3z"/></svg>';
{
  const rt = roomTile;
  roomTile = function (r, small) {
    const b = rt(r, small);
    if (r.img) { const ic = $('.rm-ic', b); try { const bg = getComputedStyle($(r.img + ' .ch-img')).backgroundImage; if (bg && bg !== 'none') { ic.classList.add('chest47'); ic.style.backgroundImage = bg; ic.innerHTML = ''; } } catch (e) { /* ignoré */ } }
    if (small) return b;
    const w = el('div', 'room-w');
    const n = catPool(r.id).length;
    const q = el('button', 'rq47' + (n >= CAT_MIN ? '' : ' off')); q.type = 'button';
    q.innerHTML = ICO_BOLT47 + '<span>Quiz</span>';
    q.setAttribute('aria-label', 'Quiz : ' + r.t);
    q.addEventListener('click', (ev) => { ev.stopPropagation(); openFlashCat(r.id); });
    w.append(b, q);
    return w;
  };
  const rm = renderMusee;
  renderMusee = function () {
    rm();
    const r = roomCur && roomOf(roomCur);
    if (!r) return;
    const head = $('#musee .room-head');
    if (!head) return;
    const n = catPool(r.id).length;
    const go = el('button', 'room-quiz47' + (n >= CAT_MIN ? '' : ' off')); go.type = 'button';
    go.innerHTML = '<span class="rq-ic">' + ICO_BOLT47 + '</span><span class="rq-t"><b>Quiz : ' + r.t + '</b><small>' + (n >= CAT_MIN ? Math.min(FLASH_N, n) + ' questions sur ce que tu as vu ici' : 'Découvre encore quelques cartes pour le lancer') + '</small></span><span class="rq-go">' + (n >= CAT_MIN ? 'Jouer' : n + ' / ' + CAT_MIN) + '</span>';
    go.addEventListener('click', () => openFlashCat(r.id));
    head.after(go);
  };
}

// ---------- 3. Le Carnet des curiosités, refait ----------
{
  const i = CN.findIndex((c) => c.id === 'flash');
  if (i >= 0) CN.splice(i, 1);
  // l'ordre : les pastilles en attente, puis les tiroirs ; les marque-pages en bas
  const mi = CN.findIndex((c) => c.id === 'marques');
  if (mi >= 0) CN.push(CN.splice(mi, 1)[0]);
}
const HUE47 = { decouv: 42, tableaux: 18, celebres: 280, lieux: 160, mots: 215, frise: 195, perso: 340, cultes: 45, jurons: 8, citations: 250, stats: 120 };
{
  const bm = buildMenu;
  buildMenu = function () {
    bm();
    const menu = byId('cnMenu');
    menu.classList.add('v47');
    const pend = pendingAll();
    $$('.cn-t', menu).forEach((b) => {
      const id = b.dataset.cn;
      b.classList.remove('wide');
      const badge = $('.cn-badge', b);
      if (id === 'attente') {
        b.classList.add('wait47');
        const icons = el('span', 'w47-ics');
        pend.slice(0, 5).forEach((g) => { const s = el('span', 'w47-ic rail-game rail-' + g.kind); s.innerHTML = GAME_ICO[g.kind] || GAME_ICO.savoir || ''; icons.append(s); });
        const tx = $('.cn-tx', b);
        if (badge) badge.remove();
        const big = el('span', 'w47-n', String(pend.length));
        $('.cn-ic', b).replaceWith(big);
        tx.append(icons);
        $('small', tx).textContent = pend.length > 1 ? 'laissées en lisant : touche pour les ouvrir' : 'laissée en lisant : touche pour l’ouvrir';
        return;
      }
      if (id === 'marques') { b.classList.add('slim47'); return; }
      b.classList.add('drawer47');
      b.style.setProperty('--h', String(HUE47[id] != null ? HUE47[id] : 30));
      if (badge) { const n = parseInt(badge.textContent, 10) || 0; badge.remove(); const seal = el('span', 'seal47', String(n)); seal.setAttribute('aria-label', n + ' à découvrir'); b.append(seal); }
      b.append(el('span', 'knob47'));
    });
    if (!$('.cn-sub47', menu)) {
      const got = museumTotal();
      const sub = el('p', 'cn-sub47', 'Tout ce que tu as croisé dans ' + BOOK.titre + (got ? ' · ' + nb(got, 'curiosité rangée', 'curiosités rangées') : ''));
      menu.prepend(sub);
    }
    const w = $('.cn-t.wait47', menu);
    if (w && !w.hidden) {
      const lab = el('p', 'cn-lab47', 'Les tiroirs');
      w.after(lab);
    } else {
      const first = $('.cn-t.drawer47', menu);
      if (first) first.before(el('p', 'cn-lab47', 'Les tiroirs'));
    }
  };
}

// ---------- 4. Plus de bouton de partage dans le lecteur ---------- (CSS : #shareBtn)

// ---------- 5. Les émotions des personnages ----------
const EMO47 = (BOOK.emotions || []).map((x, i) => ({ i, e: x.e, qui: x.qui, j: wordIn(x.phrase, x.mot) }))
  .filter((x) => x.j >= 0 && ['amour', 'triste', 'colere'].includes(x.e));
const emoSeen = new Set();
const HEART47 = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.9-4.7-9.4-9.6C1.5 7.5 3.7 4.3 7 4.3c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.5 3.2 4.4 6.7-1.5 4.9-9.4 9.6-9.4 9.6z"/></svg>';
const TEAR47 = '<svg viewBox="0 0 12 18" aria-hidden="true"><path d="M6 .8C6 .8 1 7.6 1 11.6 1 14.6 3.2 17 6 17s5-2.4 5-5.4C11 7.6 6 .8 6 .8z"/><path class="hi" d="M3.6 11.2c0-1.4.8-3.2 1.6-4.6"/></svg>';
const CLOUD47 = '<svg viewBox="0 0 64 44" aria-hidden="true"><path class="cl" d="M17 30h31a10 10 0 000-20 13 13 0 00-24.6-3.6A9.5 9.5 0 0017 30z"/><path class="bolt" d="M36 22l-10 13h7l-4 11 12-15h-7l4-9z"/><path class="rain" d="M22 34l-2 5M45 34l-2 5"/></svg>';
function emoPlay(em) {
  const sp = PVS[V[em.j]];
  const p = sp && sp.closest('.dlg');
  const pf = p && $('.dpf', p);
  if (!pf) return false;
  emoSeen.add(em.i);
  if (REDUCED) return true;
  $$('.emo47', p).forEach((x) => x.remove());
  const box = el('span', 'emo47 emo-' + em.e);
  box.setAttribute('aria-hidden', 'true');
  box.style.left = pf.offsetLeft + 'px'; box.style.top = pf.offsetTop + 'px';
  box.style.width = pf.offsetWidth + 'px'; box.style.height = pf.offsetHeight + 'px';
  if (em.e === 'amour') {
    for (let i = 0; i < 6; i++) {
      const h = el('span', 'h47');
      h.innerHTML = HEART47;
      h.style.setProperty('--x', (Math.round((i % 3 - 1) * 42 + (Math.random() * 16 - 8))) + '%');
      h.style.setProperty('--dx', (Math.round(Math.random() * 40 - 20)) + 'px');
      h.style.setProperty('--d', (i * 0.22 + Math.random() * 0.1).toFixed(2) + 's');
      h.style.setProperty('--s', (0.62 + Math.random() * 0.3).toFixed(2));
      h.style.setProperty('--c', ['#ff4f7e', '#ff86a3', '#e8335f'][i % 3]);
      box.append(h);
    }
  } else if (em.e === 'triste') {
    [['30%', '0s'], ['64%', '.9s']].forEach(([x, d]) => { const t = el('span', 't47'); t.innerHTML = TEAR47; t.style.setProperty('--x', x); t.style.setProperty('--d', d); box.append(t); });
  } else {
    const c = el('span', 'c47'); c.innerHTML = CLOUD47; box.append(c);
  }
  p.append(box);
  pf.classList.remove('emo-amour', 'emo-triste', 'emo-colere'); void pf.offsetWidth; pf.classList.add('emo-' + em.e);
  setTimeout(() => { box.remove(); pf.classList.remove('emo-' + em.e); }, em.e === 'triste' ? 3600 : 3000);
  return true;
}
let emoLastK = -1;
setInterval(() => {
  if (byId('reader').hidden || S.read !== 'page' || !playing) { emoLastK = k; return; }
  if (k === emoLastK) return;
  const from = emoLastK < 0 || k < emoLastK || k - emoLastK > 40 ? k - 1 : emoLastK;
  emoLastK = k;
  EMO47.forEach((em) => { if (!emoSeen.has(em.i) && em.j > from && em.j <= k) emoPlay(em); });
}, 120);
// mode Texte : quand la réplique arrive au milieu de l'écran
let emoIO = null;
function emoWatchText() {
  if (emoIO || !('IntersectionObserver' in window)) return;
  const root = byId('pageview') || null;
  emoIO = new IntersectionObserver((ents) => {
    if (S.read !== 'texte' || byId('reader').hidden) return;
    ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const em = EMO47.find((x) => String(x.i) === en.target.dataset.emo47);
      if (em && !emoSeen.has(em.i)) setTimeout(() => { if (S.read === 'texte') emoPlay(em); }, 450);
    });
  }, { root, rootMargin: '-30% 0px -35% 0px', threshold: 0 });
  EMO47.forEach((em) => { const sp = PVS[V[em.j]]; const p = sp && sp.closest('.dlg'); if (p) { p.dataset.emo47 = String(em.i); emoIO.observe(p); } });
}
{
  const ae = applyEmos;
  applyEmos = function () { const r = ae.apply(this, arguments); setTimeout(emoWatchText, 0); return r; };
}

// crochets de test
window.__v47 = { otherStarted, miniHero, catPool, openFlashCat, CATS47, EMO47, emoPlay, emoSeen, ROOMS, jDef };

/* ================= Version 48 =================
   Demandé par Guillaume :
   – les pastilles montent plus vite dans le Carnet des curiosités (1 s au lieu de 1,9 s) ;
   – à la fin de chaque épisode, un petit menu « Les cartes de l'épisode » : toutes les pastilles croisées pendant
     l'épisode, plus le quiz ; « Tout découvrir » les enchaîne dans le bandeau, puis la lecture repart.
     On garde la tête dans l'histoire jusqu'à la fin de l'épisode, et on sait qu'une récompense attend ;
   – après une pastille, la voix reprend à sa vitesse d'avant (plus de départ ralenti pour la voix). */

// ---------- 1. La voix garde sa vitesse ----------
// une phrase lue par la voix garde la vitesse de son départ : le départ en douceur (60 %) la ralentissait toute la phrase
vRate = function () { return vClamp(S.wpm / VOICE_BASE, .5, 2); };

// ---------- 2. Les cartes de l'épisode ----------
const PIECE = (g) => g && !BANDK(g) && g.kind !== 'pari';
const piecesOf = (e) => GAMES.filter((g) => PIECE(g) && EPI[g.j] === e);
const quizOf48 = (e) => BANDS(e);
const menuAll = (e) => piecesOf(e).concat(quizOf48(e));
const menuLeft = (e) => { const left = menuAll(e).filter((g) => !S.jeux[g.key]); const q = left.filter(BANDK); const mine = left.filter((g) => !BANDK(g)); const older = pendingAll().filter((g) => !mine.includes(g) && !S.jeux[g.key]).sort((a, b) => a.j - b.j); return mine.concat(older).concat(q); };   // v56 : 3 écrans au plus
const QLAB48 = { epq: 'Petit quiz', quiqui: 'Qui est qui ?', fine: 'Question d’expert' };
function itemIcon(g) {
  const s = el('span', 'm48-ic' + (BANDK(g) ? ' m48-q' : ' rail-game rail-' + g.kind));
  if (g.kind === 'epq') s.textContent = '?';
  else if (g.kind === 'fine') s.innerHTML = SVG45.loupe;
  else if (g.kind === 'quiqui') s.innerHTML = SVG45.faces;
  else s.innerHTML = GAME_ICO[g.kind] || GAME_ICO.savoir || '';
  return s;
}
function menuItem(g, box) {
  const done = S.jeux[g.key];
  const b = el('button', 'm48-it' + (done ? ' done' : '') + (BANDK(g) ? ' quiz' : '')); b.type = 'button';
  b.dataset.key = g.key;
  const t = el('span', 'm48-t');
  t.append(el('b', '', BANDK(g) ? QLAB48[g.kind] : pendTitle(g)), el('small', '', BANDK(g) ? 'le quiz de l’épisode' : (KLAB[g.kind] || GAME_LAB[g.kind] || '')));
  b.append(itemIcon(g), t);
  if (done) { const ok = el('span', 'm48-ok'); ok.innerHTML = done.ok === false ? ICO_BOOK : ICO_OK; b.append(ok); b.disabled = true; }
  else b.append(el('span', 'm48-go', FREE(g) ? 'Voir' : 'Jouer'));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); if (!done) menuPlay(box, [g.key]); });
  return b;
}
function paintMenu(box) {
  const e = Number(box.dataset.e);
  const all = menuAll(e), left = menuLeft(e);
  box.replaceChildren();
  const head = el('div', 'm48-h');
  const ic = el('span', 'm48-hic'); ic.innerHTML = SVG45.cab;
  const ht = el('div', 'm48-ht');
  const np = piecesOf(e).length, nq = quizOf48(e).length;
  ht.append(el('b', '', left.length ? 'Les cartes de l’épisode' : 'Tout est découvert'),
    el('small', '', left.length ? (np ? nb(np, 'carte croisée', 'cartes croisées') : '') + (np && nq ? ' + ' : '') + (nq ? (nq > 1 ? 'les quiz' : 'le quiz') : '') + ' · ' + left.length + ' à faire'
      : 'Bravo : tu as tout fait pour cet épisode.'));
  head.append(ic, ht);
  box.append(head);
  const list = el('div', 'm48-list');
  all.forEach((g) => list.append(menuItem(g, box)));
  box.append(list);
  if (left.length > 1 || (left.length === 1 && !box.dataset.started)) {
    const go = el('button', 'btn primary m48-all'); go.type = 'button';
    go.append(el('span', '', left.length > 1 ? 'Tout découvrir' : 'Découvrir'), el('small', '', left.length > 1 ? left.length + ' à la suite' : ''));
    go.addEventListener('click', (ev) => { ev.stopPropagation(); menuPlay(box, menuLeft(e).map((g) => g.key)); });
    box.append(go);
  }
}
function paintMenus() { $$('.ee-menu48').forEach(paintMenu); }
function menuPlay(box, keys) {
  if (gameOpen || !keys.length) return;
  unlockAudio();
  clearTimeout(timer);                     // le bandeau attend : on découvre
  $$('.ee-go').forEach((b) => b.classList.remove('run'));
  box.dataset.started = '1';
  chain = { keys, at: 0, line: box, m48: true };
  chainOpen();
}
// une suite peut contenir les quiz du bandeau (ils ne sont pas dans GAMES)
chainOpen = function () {
  const key = chain.keys[chain.at];
  const g = GAMES.find((x) => x.key === key) || [...EPQ, ...QQ, ...FQ].find((x) => x && x.key === key);
  if (!g || S.jeux[g.key]) { chainNext(); return; }
  mountAnchor = chain.line.isConnected ? chain.line : null;
  openGame(g);
  if (!gameOpen) chainNext();
};
// la fin d'une suite lancée depuis le menu : la lecture repart quand tout est fait, sinon le menu attend
{
  const cn0 = chainNext;
  chainNext = function () {
    if (chain && chain.m48 && chain.at + 1 >= chain.keys.length) {
      const box = chain.line;
      chain = null;
      paintMenus();
      const e = Number(box.dataset.e);
      if (!menuLeft(e).length && !byId('reader').hidden && !gameOpen) { forceSoft = false; setTimeout(() => { if (!playing && !gameOpen) continueNow(); }, 650); }
      return;
    }
    cn0();
  };
}
// les quiz faits un par un : la lecture n'attend plus qu'eux, elle attend aussi les cartes
let hold48 = 0;
{
  const c0 = continueNow;
  continueNow = function () {
    if (hold48 > performance.now() && !byId('reader').hidden) return;
    return c0.apply(this, arguments);
  };
}
{
  const og = openGame;
  openGame = function (g) {
    og(g);
    if (gameOpen === g && chain && chain.m48) {
      const skip = $('#gameC .gm-skip');
      if (skip) skip.textContent = (chain.keys.length > 1 ? 'Carte ' + (chain.at + 1) + ' sur ' + chain.keys.length + ' · ' : '') + 'touche ailleurs pour passer';
    }
  };
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    gf(good, head, text, share);
    if (!chain || !chain.m48) return;
    const go = $('#gameC .gm-go');
    if (go) go.textContent = chain.at + 1 < chain.keys.length ? 'Carte suivante' : (menuLeft(Number(chain.line.dataset.e)).length ? 'Fermer' : 'Continuer la lecture');
  };
  const cg = closeGame;
  closeGame = function (resume) {
    const g = gameOpen;
    // un quiz fini alors qu'il reste des cartes : la lecture attend
    if (g && BANDK(g) && menuLeft(g.e).filter((x) => x !== g).length) hold48 = performance.now() + 900;
    cg(resume);
    setTimeout(paintMenus, REDUCED ? 30 : 500);
  };
}
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    fe(box, info, isLast);
    const e = info.e;
    if (!menuAll(e).length) return;
    const m = el('div', 'ee-menu48');
    m.dataset.e = String(e);
    const first = box.querySelector('.ee-epq, .ee-band, .ee-act');
    const before = first || box.lastElementChild;
    m.style.setProperty('--i', before && before.style ? (before.style.getPropertyValue('--i') || '6') : '6');
    box.insertBefore(m, before);
    box.classList.add('has48');
    paintMenu(m);
  };
  const ee = endEpisode;
  endEpisode = function (e, isLast) {
    ee(e, isLast);
    // des cartes à découvrir : un peu plus de temps pour les voir (le bouton Continuer reste là)
    const n = menuLeft(e).length;
    if (!isLast && n && inter && interGo && playing && !speedHack) {
      clearTimeout(timer);
      const wait = Math.min(16000, INTER_MS + (chapterEndsAt(e) ? 3000 : 0) + n * 2000);
      $$('.ee-go').forEach((b) => { b.style.setProperty('--wait', wait + 'ms'); b.classList.remove('run'); void b.offsetWidth; b.classList.add('run'); });
      timer = setTimeout(interGo, wait);
    }
  };
}

// crochets de test
window.__v48 = { vRate: () => vRate(), rampF: () => rampF(), piecesOf, menuAll, menuLeft, paintMenus, menuPlay, get chain() { return chain; } };

/* ================= Version 49 =================
   Demandé par Guillaume :
   – au plus 4 cartes par épisode (choisies variées) ;
   – les pastilles apparaissent, font un petit tintement et montent tout de suite dans le Carnet des curiosités ;
     le bouton du Carnet (le logo) reste visible tout l'épisode et son compteur monte à chaque carte ;
   – à la fin de l'épisode, le logo du Carnet s'ouvre : « Découvrir les cartes » (les mini-jeux, les À savoir, puis le quiz)
     ou « Continuer » ; sur chaque carte, « Carte suivante » ou « Reprendre la lecture » ;
   – plus d'écran « Avant de lire » : les tableaux d'époque se trouvent dans le texte, comme des pastilles. */
const LOGO96 = 'data:image/webp;base64,UklGRsgQAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSH8CAAABkCRte9pIvyw3M9+me9lVobP0aphxhUdhxts0M0ry/1VZDtnf4CoiWEuyWekcKitlVZ5u+ALpl2ZAck5N1h4/eHKONp4/efC4NjklOQeMVEorOecvP1jfVXSl7q4/uDxfWFxlMKkRWbr68RiR3vsCuizi+OPVpcICK0EiIqsfDgB4p4oeqOqi68GHVRFJKohjZP7ahzgTFH1QQ5z4cG1eTMlhjBFpbgMaFH2ybWnbTRFT5k82xgFcQEkMDohhypsckLlXgCpKpCrwak4GSnJLpL4DDSiZQbFTl8SU4pbe9vCogB7+diq2BJ19g0xRCTXDm9m+ZUBqO3CojA47NRnoU+sBARUyINRloL/vkGWolFkW8s++lVas1AtKIHWxvWlSVA5JepFERk+QK4XgZFSSHs7HsdcaQMKgr8cGTPcIt+FAQ4fbXQNY0zh2ygN1xw3T2SdJOjnx+CQdfay8bHfi8XkpnYbUrCBXMsGKSTuNP9SzwesPsR20FUe+odUmxiyeaMaHTE8WjSleLdfUgZBO18xA0f4YbUbzo9iCLkfllOUoduCnskJ/DlgxsnQB5YTiYklyn7XgQEoX1mTADnxGYEXA59xcCNFmNcOCyKVo85qXxDwCM/DITK9Hm9dcn053ubGb1k4zZmSntRfwIKbHi/vsuP+EHU8uQM4L/PfnBb3y70v8+yr/ucB/rvGfy/z3Cv57Ef+9jv9eyn+v5n8X8L9r6N9l/O9K+ncx/7uePy9Bn1ehzwvx57Xo83L8eUX6vCh9Xpc/L02fV6evC9DXNejrMvR1Jfq6GH1dj74uSV9Xpa8Ls9e16evy9H0F7H0R7H0d9H0pv3JfDX1fkAAAVlA4ICIOAAAwMgCdASpgAGAAPlkgjEUjoiEbHR3QOAWEtgBOmYTCD+N8ye0v7DcwJm8szoDzx+iTzCP1Q84f1YeYDzoPQ5/j/UA/qH+A6yb0FvLa/cT4S/7x/0v3H9q3BP9APA/xje981vHn16ak3yf75effPnvZ+O39/6hfsfd77PegX7W/Zv9l9sfpp6onhD2AP1Y/4PleeFB5l/tPcA/on+F/Yj3ZP7D/4/6D0B/Sn7N/AR/Of7J/1P777Wnsx/ar2W/2UcQsOXPE4oGvP4PuYALUY61jDX5lOWXJKePt870gIM4h4UoQJ4Q2q9r60o6/DDXRkUhu3rHhKq3tO//3mI3qSfPPUnZ+YizKlMq3Zip5/6xddtnAkQKYykwXnZZ+lhw+Z25cs2p+NedqfFG/crSKEKk4Xk4eVJUQ0KDf0E9Lw7vaF/kw1zt/Jb3wNqNCTIEho/PcLaNYtfukT24kkyC9/sI+9D5PbMhZymkFvp0Ur/7SpVzY85R5OrhHF68H8c3xzLqMoRvae6Verw92nHucqTocT0IE+LH951VDAAD+//4YULz//jiRiyKkjGatVBoJ2j+v/djeUwubvPBSOgfrrm+V8OCW8vgA7PKaCdvECNzUIyTGvXJPzB3nmuSLFARJWEP+v0zHom6uBKM9u31qFr57zAxD2bEKFTUCxxYywFk2jVnZGR6nbCvwuVbq/iJzp87Qc/eno3MgXZqLySbYu9w/KgvR31mcOSMuUUfiXN9LWL/GOgUkaWuRZKzv+4H9bc7Lf5EkTmCQX/3KOSF78FU3BWD/0vN61/dPjRrkDMinQnvnQGr0ZyGxgj2aiMRPgOZtxNFIxeTXcYVJq9+yz+IzR3n7i9fcXeopaDkkovNuqSrE1WvvMbFSf/Td/9OZb7/pz7nPxTe7Vt0OlD97t15BjEkTsBLIlFoPZkVqGSFAi7KzIsSm9jUqpscC3BFOgIZw99AIjIJHLZvUVH38yrxS8jmtWnhvGhwfBb5sIvcpTa97wKM2YC6U71OMzrig3dQNuHRnEEvACD4v9HHqvo4eo76OHu1cX6hcmuThyslEy+Hamqn9nM/VnN4rkrSmpsawRFX5weLuDVfbOnwViZ2CCwaEEbPrkMig+Zu/i3SLiO0xUHYnXULWfNtUnzCGfQXHdtdy2+fIm6XT1tBDaO0W7OdKp0011/yS///pDgC0+4ludBdX/5qy8u6kupyl9p/yT61KJXg+Un3UvXnFT2Ug9mGeXSNXGoCfJualsKi6pU1V+u8GBuj8KipUCEgoMNAAcSBVszIFb+HHUwFt8XCFb0HV8xbdQqdUAeOlZ2A5Caft4bxnE9If2ZV5PcveeyP6lg31HIjGUPxp7Ucl5yHkuHo4TzZqtHVq5O9WWCgzXPSREfsuoV7PE10uWbfFENA7PjIEp36eoG813VwTQsygQ4Cf29rqH/cBezGtGYGqIcaGxeF6zZ5+r4OpCNCi+SjflT2aBjMHchEctqCb5JcCL2sPhMsmUlcZCNyfY5bTbiXM6GL25aeP9W9i6pftFVurvjLiFlvXBBfH0O4dDzKWkJ0dbSG43unRy4ZT3I+6oN2+8vFtFiBLm8t1iCdLxrmRkT+WbNLxvfKlpxbVoa9MHxlgEZKc2jTbqvEXu8n5myQ1fkFIQTvrU1RpSpzQdkpG/Tw/lFYtKPlQPtrPuD10/0Ac/3GfZB8weThyMEfsrqbUZGvYTbqtVtq0uv+FMrQjodbtw1VzbPNCFACEyvlNC33irHdYDn+HjMUhKgAdNWo/SDfYEW1ahhUVjfOIEiVXKcsbuW24i1vTgeZEvUGrSBTfmqZrEp+JkIboA6nmKHbkWxLabO0Havz54LCuiKtG5ZWr2QrPWBUG3gbIaTYJuhPz/6yqjEQEFz/eDwVKPMj7wiDSn3IJyGACkRmbgjenfWPLCLWrHTRvH+ejtzvvY5PABEzW+h1zffeLRWetl435Txsn0Y9rSysU86RriuN06/ZHL+lUGaFOKlsmjk4AQk8FcbfW/EG91tdO13iKenPUexnjLs9/v8Ad0W/+t9dGLxvfFHF/KeaV3NlbHuuywfIUb9qMlllt+XQlssnfvEuYvYn1rQL0lrkic7B3A0xzHZqcYl2NESnxyH81IT612X9qJ6+yjadKwAoCq/IjoeqjX2pvq4f6oaLoEdSZoFBnwq21ilxmiU94HExqYaCPRAm1qib4ZHj5SC3wfAnwy+wuhosT73gbkolJrBO/Asj6aObulkiA0uXUtJbUYeZEk/I8r/iFA5R5m3ot1+tlEWtNgesOSB5g5OH3uYacAzfjcRm3akTEvhA03U7SiY49EEq4pMmVr6D4G9Byrz6RQlJp0V9eZkdAwU9jYpvg9Wfe4EC60jhX19TXnN7cu4za9EE+vvEZliJv0IXtJZzF4uuRAWnKcT1g1eJ8fCeLrQ4VqkNGgJ3UQGVkJLKBA+LCkjJCBCaFmEW8V/Xpam9b0sxYkKVKHF8BEiVOlv3I3kcTeHItDaMlc3/HfvgCLweisYJibkk16/PidOVPkqf+59oBHatRWERwaHpcuIA4Xa5Wbja67lLvK3YHfynNaTLvLb1AZp6ppvK0U0xNAMiptpY4NDYrJfx2TDhp0tjp43B2Aa1wLn03eezi+oVqrtKhTTUKMz97HmWqi63TGN4LzeS32ar4H93u6VCS3XAV/WtnuXVgoPOiVp2f3oKxSwuYsLtonqRhNRD69hk4MC4zJS4e/uK711RONl1z7ScwdCsZULr7VMeNmrCpwvt/6RWyct8iu3JGVBx/loJH7crFN8z+U1WTrWUZaQl6eTjlKt49nYN/kvPuEOvGiBfSEXV/Mo4ygQpHaf1D0bKyfsXPOHbnfMp5shBlbAb9PP1QGcTn1XqSnB59WLhyTwm/feWMsYcbN9tTTAAJBotk59bi7fZkdkE2Qdvw3sP89YwpUVSb7aZTPA2obY9eghqePwdTAaPh/PfQNqvigJzBeqiuC29nqZnOMB4VGmDIQUOGEukMfaCI+xeyGLVQX2nU6tyuf8eKng30P+/qRXcVaajVoP3+DvgPXB6IcAce9yl6yLv9N/6RCsSooj8bQx8zFfAnXqB6tYoq2dlJxuDt/ma8pw8/Cy1id6kg83BGQxrDgcXaSuElZ4IglpENsUxh/TROG/qvr2C/B3LCvxPUlO9LZKNK2twHctrc23OP7J3YffgbUjQImllGwO6Ur9CqpuasT8DQ4L9tciPhnmURxiwaPKuOB4SUScNHC9rnuwMEehm8vkTDKIUwHRNb/wU/FrM+J+R8Qx9dr54yMEe/mz8doTK4k4l80Vfle+2w0KsakapRRnFpwcnzbFklI0WrP0l9OFT2+HL6W3xLVtpw9g7LaCxG8OqqpPlRp8BaZoz+PvqW13YhgZCCHMgRcxquGq7BBV4wyp1eQnt6085QGNyCNykCd7u7uLVRk/TdQrRtmEH6yqrekE+24NNnPj8jB7kJKSFgWVeyKDGnJl6lq6/QPHF1s0IShun6rvwlGvBjPEU+i+ySnUuCf7BintW8LuQr/xUm3TCxhUCcNJ2fNBqqeNQRak70bEbGBa7bDge75cyaFtZdhqrb/fQMXBuuQS3/yKktMvqd0RRBxOqPgMrPWAwv7a9XnaKzlQQuthhgFBHifNKRRmiQc/IaMgIN3/7mQQgPY39YQ5h5s/Eln6/xAuBMmcv+6v+7CB+3BI/PDaEDury1zE7oGApZjggvo3UJOYPT/TtKFGjmrWoQUYKwZoa9chgyFrAhWx7C6DTtXgRJBSIFNg65jwvtBbVgoYN851DErav76rpIxLIkC8DZnCbhd2qmWMgdAiPQ77dkuPGHG1haV8A7lAW5LLnzSe+918EFTOX2Kxw08f2zqoU4slntPWApIRb28Dw+T9zO5yj796rJgvtMN1DAuDlGADrUhTIfBpLPlUATh493Gesd0d9M5QhKOqk92GAbF9G88PkSwEUSfJMq4K1KZApYNch+RL8Ku+EQyx2HASmAF8WOZUTMzAtkPnrfNXrnrxEb9iK2Y7bDXDWuQUICfWl1kVtrm9/3fLsju8SYDAaemlOE4aiG5bxsIuOyl0OY8oM7z7iVCoi3F4BO2kVrQnWsJCSLMB6LUlm9c0UUAda5cLfsPKLd72sQZxjjuo8t3BKkmv7HnSZEtWS2HNUqRpIN5Enp2Fead0qOuoPddKAdzs63T9oLSPchx3vjI8qPd/WiD+Xcs32vTS6dR1Vujs1/nm//+Jn//h/n//xEDa65iOuiTkNx5XeaYQ9iDetF48CvOIALEMD32BHHtINkVpOVwCk3SBk2WGwKsP6/QLcCSKibLxnwjgpkEVaKio4h1Z2ixD7FX6Drv57zzkZU6Rxtooasm2xk8GG/tdbirEB9y20U1sqge2hRUNgdkYtRx7GWcLQgYlgILP+VRFlQDjScZMvHy0ag/jogvKrh95pAtEqPpJ/UsoCw5dxG4ZP85KnCJOuyNejxmagoU86OOl1/I+5txDfurKRcbEnbmhjFHA8uIEvd6H2mGJabAhtJL4Fa5CmwENTCnjZ8D463cfupemQFQHAMhoEM57JSB3ff473pCoaCYrhXK8ogudSlzxRsAJXW3pzpnU9mZp+QkEHefwlrKiWDPKty8zMQLXblknDVd8yjfF0SrdVRsksKFIHf6zrmCf3Bl1coSnkWxWevr4/mPuuP+xj/TSHnRBQGhlskOk+wXVIFPbyZfd+eOKHMvrvnyeJWJnT+kzuiCjuuCeEw/rMkanGs1UtR/SG2VfNgV9f/2gkAZP7bCDrwOGoOev0muRPQTObsmim1J7A5JVprAAA=';
const LOGO240 = 'data:image/webp;base64,UklGRs5FAABXRUJQVlA4WAoAAAAQAAAA7wAA7wAAQUxQSO8FAAAByiDStun9+z4fi4gJkPe6dKBlbXvaSJIM1czdu6Gr4q5ey8AdNjNvpbjqamAzDalpJsexzrFlh2z9w/P9/x8RkACgjdsIqbEFNjuTtH31CxDEf72BiFDbtg3zRoosr2g1LOI0MR6OHtel2zf4Lv/mBtwAsN4WvsFLR4+r8ZCksYVpLdrP+WuPzF75fuP3nrqxoD3d+P7KrPhLA0w1cHNXbuy9dTX0KwyGBaQC1/B274bONVAB7SQet3B5643zkHFeAOM9ANCMnQfZurzgUUlsg9k5vFjnsn653wQBSFanFg+HsOF1jszdeu5zeRM3WUp96vktOeI1wqVX+J3h3LSopoZNECx9rdMvuBWA1BpBkos1OPPddnOnTY3t784Y2JAMbDWav/nCcVHvtKsB5hc67317oThdmHK0Va3PuaVQYeatcoAkBIMYODq/PVTfUvm2HjWIA3C+OHn1peMi59ZDwfzy6smO20XWYKVXH3Vj0FsxsFFnTVL/fJEVrjNA5tultqsms9X5AtwpAMwyW3p00uTU5dwNlDsHBauc6p5H6pvk3Emo75F2qhuVq0Yx6ZaHzJoo7lBXrvRHMOmch2jclaYtu7sjmHTSY7ds2k5cDpLLuctcAJA5lQRxB2Qn1xu6AWjKSZO2Xra8V++GoSnLparlsr7LOSBQllarxJMVHBSgUrU2ZYgsMKq4pXusNMoCo0Ibt2BOVt0AHCQAvKoRt67i9Xo3TE2JW5aCsjIXMGRlQtpl6VXgUluUqVnaq7MhI2UJaWtqWasKX6ogbctYS8sAAtBy2KIiM2MsexXMlKlvJpFfIc1ousk4+MGVFdDkDwdNNN27ubWBuqBCIdO8w7Nj3bwG7pYWU3uDVUe+mwveHZ4qpmW4WlWIc3VKfjFWqgpzwshUDC/2pQhzQESjuAWGxPnZ9NBakbtgQyGHUjvpHS7XRaHWCNJJi95nRcgD2ftSMyURiRqbNInCrknsFEQ0amKcfVcXhV2jYuJJef3qciYAylJaTbRHZSuOztV6JLTOTcJK8LPrMxEQxgRowaW6iAbNpbHTRic/FAM6AsUHjey4a34qMkcIMvw05hKx597lBSUBfXfOyoTW0LgksRfqayhZApuMdSzoCZSHyVhQ6GBNswUtDmZEh1SuNFnQ4qAymoPFzEtXUBTglzMWo13zz3/xeIJonLcy6jWfquDRNhFcqIqqhJExr/kUXvsFc1wWXQcZnql5VN+Zpo3VpEPvcc68cAVdAX5xxtghR/uVK4+EHdxXSIcxOxVDGbEDGU1NpjiVmpo0saSN6uSZr6ZMLNokjjGbETdn1mwW0jR/7K+mbbEKhs4pnA6ZkzgdMidxOmRO5zTGYjZwBALZoj+dwWX3hcIAS6kFbHRg0+UUhjIORLZiZr5UDIXEl5mKiLHwcUBjDGTBxA0MmUQDQydRZ+gkYjPvMUQSauLU3OHMEYnMCVLYG5SGIDVHexVDJdFTg+QdpaGJweznnM7Qz7MGdyuGTkKAb2kNmH21uzoy7+z2HftUKekU6rHjPVqjdzzZozVElz4OKI2BLD11fSYUwk9vUht6m9q4fZfauPsjtYHfeEBpgJXJBeit/9zAX8/3sfQ+D33nDO8c6Z0TvnPgd87/7nHePd27h3337O8dhXsn895BvXdu8B3je6f63iG/d+bvH8H7J/L+Abl/Xu8f3/un+f7hun/W7x/9y0lwORgv5+Tl2LicopdD9XLGXI7cywl0OZAv5/PluLqc3pfD7HK2X466y8l/cxDenAs3x+TNqXFziNycqTdHzM2Je3MA3ZzHN8fTzWl1c3jfnGU3R/vNSXdz8F3PgddjwfWUcD00XM+Q1yPF9YRxPXBczx/X4+j1dHI9rFzPLtejzPVkcz3oXM8912PQ9VR0PSRdz0zXI9T1RHU9YF3P29bj1/U0dj2cXc/q1qPb9SR3Pdhbz3nXY7/tKeD2UGh7Rrg9MtqeIG0PlLbni9vjpu3pw/Ywans2tT2q2J5cbQ8ytucasZ9j7g/i59RzewgCAFZQOCC4PwAAMKsAnQEq8ADwAD5dJI5FI6IhGjtWXDgFxLUEOADETizZn1r70PQebRX/81/df8d+vnvG7A+sfNE6R89X+y9UX9R/zf/i/xHwDfsf0qP3g9Q/7efuZ70noq/wv/D9gz+0/9jrOP8p6k3nMf/X2Uf7X/4/3i9qj//+wB///UA/93Euf1X0geM/47wX/I/qf9f/efRRx39ZupB8x/EX8n/Kel//Y/yHjD8mtQj8t/qf/B9Hp+j1/+s/8/+r9gj3R+of6T/Df5P9pPTx/3P8x6ofZz/se4F+u3+//Nv5O/0f+98Wj8n/sf+5/qvgC/oH9l/6H+Q927+8/+n+p9Af1B/6P85/rPkK/mv9l/6H9+/03v3ezj9v//j7sX7Pf+B1oU7/cH8GS5L//HL5Z3/waGNc1sR7xKQYoCzA6V9Q0rmtXw9xTTNC7aG4rXakKjsdqn0q7BSKovPdIf/+1eX2PW4zduGkvNCqg6jzmsNBtj3zV1u/EoA887uGBWlQuulouisweCv4tJPqGH9effY4gI9NmbMNEgkgqMZNgRo5TmIp0/fkOd1KrH17CPtpDoK3TDjzCOcOrSF/yk6kosapJ2pt4jfoRZqqoxzWjfBdU12/osjMTuWrVNcf40eO378dj/Tvh1j9Rikwb1Hrxb5iG4LLbZSeleMjk/UhJaRdhwMbVQcSycwjidA3FxsGr1HlE4g7h8MsWIW8vHAGFW+NGRYGGiKZg1o6vxlkPZ3iVLhIi9Sf7m64Kp5TV0TLq457xum5WARRT8dMh5zKJjp/dTdF/WGJWHbGZdzsNsV5vVGAmeLMdP+HBfzL9Bw/Cef/FYphQ5AJwsxdBVpSTkL7Y/j6kjfoR79+zJP4Vqh0IrrueHtdlgyAGX6ayEiCQyy+z8YI7I7lFU7kOPDeO31knSXlIOvNgfifQUnndVpTTumBZBS8WozhvhjSo5QhdZXu8+8QpGacutBYjkQO8XAq90Z9oIvgD90ylAYV4TlBJ1df7KIurBuqMbv+lWyfj83wPpg3iy3vumsE1NvAhw61rYMO2ve6XOJ1kzWxNUbhn2GYE7r3vZKnm7loaHlmB5xrxtPEp8vh6mMFR2SGKEQIUISrUiGuaGK6uZ7n/4HG2XmAEP78Zz7FaZCUUG+nFggIaUUHdpyJfDoTNAN+RaOk1euoHlUcTSpoO6CXLPOVTjNH+pqgfD6PfarKO9jeu9wpD6f/+PmZLsy/ilOXverWttyjrEVbOiAyyCntOZiKAJ3Vrfoi252DdKMMMOnzAsrpGJoI4MiDsb06McGrKSfo5yM7O1vg+JCk5SKB0nflttgesAq6hq8ZWjsSRVIdY2wS3cuHohuq/Nd/HmUxc1ZnUrAtrL9mQad63+1c03vQQGa+i+cJuxXm+KaiM4bvlWGX1d85AFur9VbHTcUOSNOqpVln2pX6pTyDG3M07n+u44PK25On+FEnz1bEqwCkD1f3Qlo6c6NzRJRJdGIv1sY6b+cIWuK61D0Q3h2NsXxzb6zdlZNGNwB0Lxv5hcUVjwPTze7di4b0CZX7hyI6N9F2RO/2zXNHNMMSbrzgwppSKhypyQ92BahGCmWmssyTI8LTGh3QrcB0CdEfXz7RWvTnSZ/pIGAZoP72q5gd/MRd5FcXGRQ5ousc8GbmjDjvf/kXkV4PtbXajTJ4qDTqQ8tfuF8VvPTcCOFlUoVOO66X56issD7T7izmrElsMNcSG4Hegx1AMk9yJX+OWYpr2Bxa91jIwcTAaKDizO68a02yfKPvni9oSWfXFiN+Zqf4tBbtY2vmzUM3pCTFSx5OZvbKqVYH7xRr368+C/+4CpZMod9vF8QTQAD+7npAGNmYbVtwhp6SnnFEcaxv2sEii5a4PPMkXJxj1X+CwLy+vNhGucTqqDv8bfh5k7f/Gd8y6Y5xoJiVe0f7f2oo2jkd/ICxeZzNiaQrgkASgmFzdIo3K00Xj158aaZIzbg9vL0YYezKYvmLknC5KaHn78mlLLOTHktMN3Fj3g519i+IFNoruE1k/AuMQtomZBvpFtTpGmBnBJVQ5HTpt6+wgib3IaoFYj1EpLPXP19Tmo+Pl9qFTtlI17y1tdMtuVmB4wEtRWSYE7Ybc0jlTXak3TkIPB7ER/AGTvxi2lYk/5GOyNBTAlyoWsOl/ohfcnt1pVhtdera9XjqCOepRYeBnryBaps1Ap+DU4UR70mXbdClpafghgTj77OS5mHtZeS5U8RnvwNf0iEB/vjBBU0WCkUSNAoUYaccLF7htB1Ij2U9lREspuwJVAyeL1QRpkJGFOvtxhQqPcRKhvr6NvgAjm6q7gc58dSKayH7f/HFPAUd5d1MTEsXT5ZX7Fgf2o3iuzMbSDvL5/I9+3R6pV77ZKqiBN4irr8khXz3aH83brpcX3avi4xptLULLHGD3VIdm0k4MZLs71jsugpB2aG2IESg9M5V4WD0YfFTUKzNFzY5cQv4D/plDe+6wkXXYneJPszw3nJuH8lVlsS0eEZXY+QGsUIj3ITa679ywC0LpXE0I7Iyt/tv/SVMw3Q2ZXJLTflmN6Z7rNrzWC5+zdvwanSAJ6EsnpjmhPqVnlYDEuVi43lp4KXUZUpffz0QfZRMiAkyrberrL8Z3tYwT7Sdj3v6ue4/nNu3eHVMz7wxM3XuIIrY/w9XB3sePyoZeqUcRo4/32+9kLqN997n9Fw9xfP7sEeHq5RApeuGpeLyYs/UAdbODB9JeVQRFFZlhe0eAABFxtK0tUUDTnZ/zJRT4XxchxJAzvdYw9h3Xi3VV7enqmYAhKsQT1qimf3HtwFOVPFxON1bv8x5HxuBE9pWbkEPump1rHK1yU34IBmmUVK1EpHa2QyUlb1jqdYiT0zyh9+5a8vzZh57u2P9fYeJ35OcuVC3EweVjfw6SoFk+a/VCdBdU0BMoNOBIa/O/bneew4+/OdJU7iKvzn/NPGqHLq7ZRJsxhcW/vcie5Cw3OZ2FF+Q/KXBApwJLWR/bWGVQp6TaLnxLreAWsBtfuiQzNgRuX/xJMSesmius0TY/kZSK6Aj2EnO19sqMAvMHEFsD3rTDqwBzxV554T1TNGIgqwQpmFbD2aEwAb672cVEnYjH3lPBbLHjFAGNo7LpVgOxFF7JInNltxS/sB40+ega1DGACU8mnMf/D8f8WWhIqOAmXOemxzsLR4zWoIBECmCp+TLhSLW5mujTh9zIwKx20HEWyaVUCT2A3l5szYbQ/KSSTmDrIkeTmLelCJA8oz7alrydNyDAIeVUTekgauuxP5dEr8WkZp2wR3RxJ98f76++zT3ubeZUGaOFbMiZkYpg3Liedr4Pm4Hz/GV3Cvq1rlToQCW8G6RtAycDoX76IyiiLcHcQG3xsun9w1iCnVnYZOm5TDEsbhfg7gkNBySUtL9gn19LlRRVbxdknym/48hFtno8eTFI6LAJZ/oZJ7O/+oePjHX/y9Nzmt2CGW+VWhA2C7aQZ1vTOCFX24eeMmzc80l7WAbuEZj9/tmf5bf1976Nn1iKMMug65hFaqSVPRb4B2rF48FO/6vSDQ3n1jvGm7GybuoDu3vLfEor8wE+el1zjRxqDWb0m/Wz/tq/Twz5iqRpZY4SGYNYD6lYLA8eygCOfnRz8ClnkJZvOf75BEVSO0GFnVzNiLRNbQocxgPP19Pe7r2d032ix0de/9hiik+89LfdtoIlC9M88hL7PxtUi8MH84x/2JJBMAV3svGD2PEBQli4RwflqqrCFwHGGZJn2X4FO4DFRyvD8houLGaN3RbMwW9j7ydN3Halov/vtJHhNi7pWY47AvegIw3YN8CUDshWXnlyJD6U0YAnl5xHhKPs60+nt8Q/T273+fClt09GrxrjnCwp3sKIN37vGPmPVWSW13PChEW//22S3cGt4xc6UPPNgGQOmeZf5oZI/jpeZolaN/gJcKU4XZReKTu7tbOVS5UnkOQJCW0t2aVfCoR8DyoKc/U5R6BioH+fZ2SPUlFo8Hu7Lpgl/yAo27fgNBvhv4ubvcygYFRskcDOpQ1EFzXRKWp1Z8lfwCuWEU8A//kW6tuUC9n1LluF3WQ5uwYZT/fpA9y1TQsjQMT4XeC2rmEht86iw8tdckiCuysT1dW+mR3SeHlxIM+EneqziboMMfvgob5I1yfW/uRAXOeb9FW3Td4kk1xGdsuWzt6VoZ9Tsp4RpSaNY2FbPAb+o+KStugj6CbR375/vcCx/0ULnjmo8Nbuy8WkxZVYozPRAVcW5gJLSf10+hn1YzZIP8lUPg95k932cEzDBfS698VtpyZC3g0zTXNq6cMQ4Ufz6LQdAeexohnM837R4AntJx0iuO0yByhpFYiFUoMRI7UnwZaJE5ZnaICvrWtmMz2MfkxN+2/HdP/XQVfM1Min26IdB4D31OmwkmETtbjeWJ7LIKnZmA2J50Vd872g6LV/LYCwZtQoX0J+6/Zm6tFmYmdsxxVXA4zGTjNDo3jIHwrKeQxWQwkJDT9dUGx3KJhH6t1xAaYI5yvzqpmqHnNtps3qZ+ePlxygx4L6Pq7DyM+/F5aI0kjR8WC22EIcnWQKcErVUJtKjs+lgE9OFs0MXvS1NUPfJfw3AeSuSAFsY7uHy5+vXiya9Z1fNJjJYLotwyHytPhmTslgnnz2fjd2f81vWKov8ZyA3Ll3xSjC9leyhsG1Vbf4sQM/0EmCHKGi7hg4iHNTEISNPapMGVlXZx0WAQGAQt2R08jCeOKLW9ygj1EkoW2TLHaqvSH347ASVCGEXTNIPN4VnzY/s8KhJDA/FLAhPXT2k9HZu35KQiZGDDmkcf4mOslAd+M4K6Ofh/Fj3Z7YhtwEJIZt/j4IMPXddKI6ikmenLof8BIDsIYeB/gAMEvywwrn7vfmqksdhNz9Pqq5UD4EnxwIDll6uSUcPVYqGGCXxix63dRdwfvZpjd5fajKgZqhqgtLy9BMn92oNWK5jdAnmUyiGW+vaCTiwnRUYrYF7zpxOkh3cqRb1hDWdNgij9yfC2cqEiAnXoLEz4VUP0VaiS4dIVHmgRB7jgM37NTsnWexEnsR/KDaw53T36vVf2jiwa7wSxjEReWIRFadbwl6atM8l05z9Q0CkAj3BjDEWuhD/qpCjKaRSPZs505y6S4Bu829k2NCi9PX7Ykq6vp/rTS/540uNIUyJN0MuTSz+D1SuRnmpRjp7X9bXyK0UY2CiIIORg82iWLiCee1/xBGN4qQzs7DtJQUkQvhQpqXmRj+Vwceiog3h69w1OUuIXjC2lz7d6GhEqmNATvIfRU29Gez5ccv/XBSF5hWFEMglBbf50t0e3SJu9v/1dDC9Uat2Q567P4oC8y6YYhrk2HS37wJnHfD4V8XlID0jx5LIGw6I3X6xp1YizzjROZgHml3VmhWx0ikfara7r07M/5Ji9ax95tOu8W2bPOqxZpJgqi9oSBpVxL4m2GQmbPj7RbEQ/H6dPufLmoURFHs83lsHXc68Ii3u5WEyI5mA0mPWsKg2vy7oUABCsnyBy2YtrrbEzVnlCW7ZebbbEtebUAjXg8bb7xZ4hfDpB33VBfMVHWWL/kS7RHC1VAqAQEiVeDOSaxyiV1/6CwWbRCRxOTsoAlFOt1i2AeY1ShIS9onJmkjaDfG1urwBPg4EtJWZ0zZFP1DwAZcF1wb6NmWKqt00zX+Pria/5/MfNBZzKTcY3PDZPUFbGzBWv1Axgoh2OBau5Bs//omp/hqTiBFQW10n+SUiLLcLZvTeDPNPY+fbYoMJbbNHBU88dpj6t7FqHZBtNuvNsiuF+ctSJZ4O/arb3TLfq1w3V+onP+VOB2YmYG3zrRQFih655mF78zBXESlDDZBZqlTFBlCqnuEg3r3SpLOWWuaoxpCURvEGGKpZ39Mf0eXBsmxW/1UotnCXV/Rn79xxVN0Mt4z3lIx9LWhtsopsLQLTFutzQvzX1XWQmioU9bWav7o3GzBQLYP0YC8gICFrn+fEVcvem37mgLUDezQylxqbcAb1DUYdO1Wf+KWKgtoMHT9pBKfhbtf+jril4LtmaDObmxxApD6v3vGZYXkaZ/G7V5vPQFDNWwrQiRFm3gSjNCpvRqvbW5oauJSbDBMlciI4RcOkkIKJsVSKvQpELWhM2G2L8TYp/iEpSLQXvivAW1XxegNos1J833dOph4esfC2jhGIuQ3s80elkeCO+WL7deJ+enq2HJxu0CNd5Xfe2h/ouH6yX1Rz8tWfK+OK9SHVUmv7YS8w78NfxIHTmPiudn3UL7x+jsKs2XG066SKynERHYL6nsnY+WgHZvAUEEslHCDnHqkAz/cmdG1IqWzEUrRoVUpUhq+KquONvs+fm0Wi1FaDIyHeDRVR8dL+WcJeuwzp95gGmUXVwRiTqwvTeWWF1IftDiN5QNrH7mkC2ufndV6MBdJDnSlH9absrg70O/F9K/Wr4+h+4WhrveVkL+VLg3F1XBI0+P3eD8b3oq9/UstUMdA/LhPgH6k71SNl4ACfIe+1eLc8uWZc3nnzGyZQkKGn2oZwZ/yW3LKJt7CKopUVTLrchHpR3sSy8moIaSLg0hPn6JGDOPMOuRYaYNLgvpVyis0mhQ/5J+nIB0dA71VP4erv/LPdTlVM6bT21csdU65h1TATnOCMnhYVFx1mGSi0fsnwf+/U971+AFkdVh/p9q2Ry1siRiy5LmFkRLh1OzKcLTUJbbSxnsnJ/jLYfO/Na1XCkZNEW/RIm6tXD0njvodw5mpJ+OnkBIPYgUT/u4nvlm35QTOCegCoB31zVJ+J7+dz5Yn5dQZn+tBBBFzAm/XQHXPApmYNiNbBSAwPWoKzbqI3VzxUddB4idxXum8DFyWSnTb6E25FxoxuuCkQqEIS3G1+o4lISNbeqHWNTEU9z28nWH4LiEZeveyYQs/ectSd1QuA00ae+GjRwuG+41pPtX+oB0HqlvxWdtA5USOwgKd+tETyculfVdVnHaQr88rmGZxtH14uR62e/lzFA+siRDaRkn0eeJIK7PzaU2zI1qsDHra7ZsJIHz5KCql66vPcU6YV0k/529J0C5x/TlttzFZiokA8puVMOWVme9rCNnpLmesvF+RKhZbGc3fQ0o0J6QS9k0u2njW+4bAt0drGr5QrQExSmIusgYXbQSU+gIBe5DocpCaQu/zNrO0ZHbkvXjrRCOY6MVewucHRBEwV+VwhA0T9zMEdO9sTwg6eGrXgxGu/ztiJMLkEozuRMRTx22f+V6AwHqiooF9pbM/goDGiSa0tIQXtAqACCsDBJejle9ERLb9h8DcMkg+hPVvPtcIkQtZPMCaNGMNZbCgvl/QIGYQ2JdQIkSdOfGL6bnqRHwtenqAxmU3XKR/s49ArEbbWAyYDZ8AYnrfTk53LyeDYonOkhZtcbMojSZ34cWZyM78Rn05ExBnjXO+L9oU+UupcHVv5Dc0Ej3l2JF3cAHzX3lXKzTUHF+wBr8vGct+7maORRsgwG+qqN8nDfe8BJy+/6hvXbzJ5sqjIxIR1sbakOn2qZYq5bWV9UVV/f3ERz9T90MHRKcCzIuYm52/BbfGRfeb8irdZLwVy3h1ALysXvPU4fZSdaQ8GumyhVgWa6wBL3j1RThVsHd6v5p6RcqvQECqRG/EoFneXYNakSu481KFj/gR1forJ66XzxHBPeUreVbdXVGQhH3NZCuMkWBdmDfiWVkfmNr3vC7Kmn5fzbqHzhf9Rjc6brbAOk1BVO5lnmh/NT2HqyBtBs6SHL0IBe4lSf9kM+vPAXX5y9GEUIHc/2UKYISnx8WVdC2HnVjVl6cYEkvBXrk7h441EjGm9huSpLHmiWukZbqBVARite2/xzKAXAKsQ0wzD4MnSYFlHXlZq4rRkZJowDCTkUJRcVx83OwPrUoFoBENJGBPy/Gz+2YY5VhDoDdr3+BvMOufrJ4pl8xch0sKo+M3ShVxRSSs7JehRHK/zLoG9XLxVpVJlD5Lq3sz3g27YH5dRUgjUe6vch5P0Jk/q0HNpzR3774kzQOy51xQ0xDJtsgFb/dUQ3zwG9gvjoti1FsLJXFgEC/lDHTLYh0EHur9oC5SZ521Z8t9+2rt+6gl93W+8WsMAmCyYBehhLTu3tqQsMJ98YjkXNMg9g76GrK1+CIhaWvs2uFyKPM1U0t4UDam7dyTVBxHGL9i/XCMl7eDnQGmp0EqhYQcvhLkWGdJnvQhJFptaMbv79BxV0LkmCK/FJ1lTKBx2XYykdigAvyjJrLc9OFX4ax6FtvIM27D6u7ENMIORkH9XrytmX2R8FHDWEOqYldDTNg4OB4zv4e1xSFpvLBBxqk0vSjlxTi3aE29FMX4MNkGoZhnN86VBZyytHvDAPRqKKr+tNCdJTPCEJEfYIFHcRGdvDXlJYj1MBHwhIFkNLI5GlXPFjsamnPou2gl+kVajbDlOfhifW/j+9XLSK8SdE4dbZalqevedLNBleOmMBvz3QUM7A99GLA9AVdT9FfQP8RZZYfxiwL4rh+VioQnUui4RJcX2zlDNkQVounGh41pgrL/rgof0j87kL/cFACTFD78w/cbae8+OyqySPCWpg+s6Uw93Yf2mu15GdGGajMsukraZkfadL4PwShfRpqvgmMFahHIQ5jchGY7UXzT7zVVFGCTAirCB7Yuw989inaEiu7qgCaTjgxbvnoBOL+J845GxYJ4wZ+SvwbXrsIlk1oMunWRcqEt65bmffemKo+HpB+OdyZQQVr884qYdnXY3hrT4SAPXWLbI5SC0HWWtk1tFa+if8RdE8xlZDoG2Mf2ZnAtPZxHYGt4TFdpVDebRpJzgDniCBNIYS2koEUQZ0evbZgSt9PxesGxgNiCtNk0oXwfzKvr5SfIp/kpnwCsZ+sF12YpnA/gmFB/b/4m9L6JMZoex4gtsEbujAhwf7Cze8oN3hgxvhvPtg8KIP+YptIzNV7pVw5VJmM213xye1+daYimHRos9qNxPPJ5Q1K59ECHGC62WUMLLvuZ8moa0W+Rzeq0FJuw9oBmwVgoojZsQcmDTyeIuKWkHH5jV93xCv+OH65gtnmzzXYY2lmbPFybQMsKuhyiy1M1V/sB4/JfrJQU3YzMoBWcBwcUHACynTflgQ/eXaeKXxAJm6QRKdcJCft4Mu3YWTKw9t5vzCZj6BTCl28yCoEh7DZYJdmz+KzvmneuJcMMMpEpnEAh/fMiYdMRJejQWBzhfj9ka+2YHyB7fav5jgGkel3ylEEKeVDQzooBDTaXILYN4V0OWLCerMDmTwWllYTTiySxWrlyUWivPcALnEM8H+BurZy1OtVLA7U0jVQ0acqjX7Fkz4Q25ddpd0EKrwFuTkEij76EKqoajdiU3Ph+9494bvJi9lKQzPFyr57Ny0MrlhDjNWE99AIOEVN1DPUT7rrU4ww6vml7mX5Uh5seUvapCbXwA9irqCZGnGDGf2F1zdd0NfeRzzi1HhOldaIt8M/ID+aSjZaHyN2j2uB/tm/bA9Pk7Gv/ltMibGsi/GC9qw1+h5Fp6xgKZPQJhGCfJwh/65FWv0RIhXec84f2pH90rEStsgshdAnnijINLPHF3PdtSehiDGD3OrSYcuHYyMfSxHh7wYo58TxuCjXfFeBC3zr8YjW5IXZ32Z+sYlFJKX5s9c2gfstpFSwNoqR4kj1vf8a3WMfs/IpipyEhQ81PgqpQ+hUrLkB8Ib43/VG+QTFlHgPu76T6xAIpRZUVWaxOVirZkUU/cujgSmeQSRI7/0cxZ8OsBP8BoLgYbSuzgDcevCkuo61vCDss7BnuZtT1CKmH5C44DRCDyDBdOwyQyICtPs+rWRzE7IoahK/6oQK6QjbCS5und9o/D5VY5TVLpLnGap4u46X94ZRr8hM0O5ThUg/sDW3dO52CendQPeWqS5utk+foYNj5b+KOfcSWlyMtrej10Z+UHjM0cgw1Yfajpg15pwfr75u5AW3hmNmwBIACO6RnhfsYd5KXXy3STt+81K/5P9uqN4F60/EPUsmt7dnqUX1S89ofBWFiQ5Avmcf8/tUuLmA96nDOVmFlIwAXZIfUUbpyZLJ4WylhTDrhFlCwifG5T4BmfkuGZV19WshngIRQ+7kdBa1fSCurXtRkZAwKkzToX/oRXyPzpkluXo7Owt1EBOdLTgROEU3Ci9XCmbfgdh4tlaJ8PlinR2/RwqrYXbkMD5LZLTu24qxFbIlmjCxtOj2tG8BK4nII7M4zd/vVS+ylC6cWnuLZdzmvXr98yCSjuIpIhSdapaLCHUm6vFwGGkAf9ZlU8sbHxlq5T7BUCZaNP8Iwi55vi7FnQKzQUzqEVDpkYxo9v5S7BKYMOQGxFk0AfigrW9XKKtJ1UbtNl9w/n3sfYI0wC1NMkf+sk9jsUWliyqCB7xyeV+pNYzmkN35+HWFyzIa7/TtDlh63NQiHFDPFx8n3/URKmwSC281+WHiBrC6eFa9wdPAzU3Sn6yuz86Cjm6YF2RfFMClIe+jDyH9b/9am0gA2CXd3pyO4XCoDcYtkQyJ6UHbwdMqTpCddeTvcyXGEzKUdpAgLAjfCvg2R5Z7zaLPjiPlJWrVw0PkP8ZjzrPWqUyht/pQWqTL55RJVdTdyDedtDSX7XG80GKqqkxxoi4YKgSaDlhwEWgw5H+3ez1TbAddXDOF1qPI27jkYUanzq7zFChFR5CXSMgz3qIvEqpkIgOlM7AVoWp2KQW9SDQ3+SORKwvjHf+epSOKaxNZAIXD3BPrK1vRZNf59x6bXj6FnIzjssFB5Ptuto/sLUdsEp2KUawwPo+1pcop173TA3pRdUbyrMH1YFzTgufG61WVuZrJiNNNhkHCv+3xrmbEX+UBQGJBfsiJsXsTjz2Ut0IszNmc8554iZ/hg6HvU1oaO3tAPovGe1zm6e33Luw+mbMzlCeFzZJRXLnsDIwRgm7UZ6nm/Ni1f+Mu2Dt4a86PGoCigr7rwxQSjUaLLalNp8WdQ8lH+03TZ2QeprYvvWBzuTCuvAfHsRBDShk+5uq8XcQ3jZ1UrA8SC18cFeN6dfuoWKtkjzN9jOeZd4eRSes/KrDwo1WDns+hblgbL/d8yTzzR6/nsaA66iiDWS/aa+XS5neSwxAfZIyirJIRvGh63nR8hYTof5Vt1hbkTfdKiksfLw8+qz6vFJCXVXaJBydODiNan+v3kbAiGWfTgqWQaf+jmncas9JnaI3CDTkOgUxpAOjuYL9KRo7+AYJtBGVMNYtdd46CjcaIe1T6YhQvNrQuvMio4+hW6UtiRUeqZFxtIaeDtS7DZTPjcg+zdMoy6GlQm1qO6hpn47fm+6Y9VsrqyWGGOOWW7bN4Tp/NysRjfO97HDaVTGnTYfnqqY0QIZ6sVZZtjT6CPj7ai/biNCN1V3nR2Q8k8bWV4gclooutr5sMbs3CtkUkTQmBlafH3NxYZ0dgn9FEYYqMQCAYqMTEe6ZRUmN3zcNvbZIV0g+DbstB34YcvTT38MwN24gvrXUpLqopXkWGrIu6SrG2hN+RC5L8XFCNs0nFN9iDHEqIbtyZbiWaR8IkPpLnodG9R5L/fJXxIv/CFAHdbbZBz7lhUYBfBQ0rr1r2hmwuVfcMh2WazQkbyTLBWnCjoMXOHgVg5KkxG3coIR5hSyGvotIBKEtq1p9SIGXq+SUIrep4HPodH6Qo2VR4OTjuc4rDP6tz76UN5TxdIr7x6uLiqaSmaYL/IEdocp1tQ9TxKeUHmxcoxWgHHrh0KW+7ISQEpOQsqsXuyGVrAhSQZ0TvNAqyQ3gAzgK+LOiGp2SwUSKkz+gpaZRY6fJcK+JtYp6W78+ZVY1vH6KtZQJbltyJ8Dm1NQG/iOrqgXQSEyWQZ6av5gCXtTb7Vetx9HSBBljlnSB1pmN5i9KISBJFJ4X/5g+jx2rknnw1BO1b3nRvCXT/IJN6CcH2ejbjcV+nuyW2I8NT+3sbzNUlZ4TZPAJOlOcIfmaFwTB8ghocATzTTHe87kvXl89B+1iaBfNMcuwNYCDGf5mmMgnkBqS7k7Lqbx5fYoMiNm/Ut9zP/5d6nTUehooT+ZHOA5dZkZXN7jP+vvGtwllgxc++c87oIhYS6UhMYlOpDXGePeIhnnS9+p2MsGiRh3YEGM4hWqmhZFaKZLa9TAEZV+ocq6DZRvMURHCpLFQmV/glxM6+r8dt2VHruRjElOZG+i101Uqjumj2ZFeyWT6vhsYztvoLLNiDRTnAtRb3N66hbT4CLLQohnupDFYj26QG3sMs+1SZNQ71x0ZHqO5/9e9QQILjwOLzTcByzWJYRD5Zbd+H7OeZXeWq7J8JyVPYtvPZY21/30Hzm+b1ePNNJdinV1zFIO/z8covBUgV1y//vdiu/pThvwQzYRTk+BgeKEWRvGRj/5W4WFpQB6xyX6lYCgAlHsLO8lDg67BRk3M1lpOhHC0eRzl7ckJO1r1v56i4L5JyKT2T3pvT2yb10VZvthZkW4GFTihurKca20Ui5Oe6NwQvE2agO/qINV+t4v72pfv+15ITnSIhVhFMbzEdZL6z1sOT95QOQTbJzx9G7ZjMVaEv60Hg/uYlNJxpwAxtXAOMRbn/+yyklxF+sF1jWtCxpaIJtZkQSq0ksv/fJqYkVPpxx08f+Sw9iiHlh0M2kfnG710LE2Qk1o1+tdlx0mwRsU4uGBZbF3iuT7n16iNi//6KPEMfY5Jh+rWHTiybqHoQS6oEJ7XDbT7Tv5gdPPQB4RqO0cgCDj3FeECYXxDg7WoW0YM9hVle5rZMx575dtKiSTDGljU/eoFgpiS1y/ZzytoEUhSQhYu5UMF04JQQ3luSCRVvRC7wJcBM+W9pnIkgR4iJ7TPZc3hPyVze3Y4+Q5pWTdOwDnDm+q4XqgMCtDrOZ2zgVJUYgeonLzXk98M6N1b5JSALwlIbg58Y7v1Pd6w5kKlhzgjkeHAYow55mRm0FhoUgzV3rT5L8zp6++9fLhKVzkN26wul1GGG/feA+yS3bWBJp4gY261XXeLcn9KroQws+IMMibFqiWgtkrYns/LbHeEcxDgxT53K7nLB8I8TTbRwOfpRER20KGxVLe16HgDbybxBsqtdUQxbFO1eOelQYRCNDI720qYtzxy4hdgwHC24GUW7/6vwsWwktNJorqtpmOfNTP/FwCKxVZnkb40WqgVUBIfCMVFtBG7eGIpd4zTLPaw17kbNlbCzkxDWTddcrRdDDyzkHmzPTz61sXfvxzVvQ6NHKfYWUMFVmnnLx2tDka8JktkkXJDr+klOdF/RkCWPqqXOQHyqDBtTfe8xR5eg04fJVgKlj9q++afTXA2ldUoOl0QLzWVUbC4kGg2qa2QZWxLw2MG6qF1yK49ZxlT2MHqrFiYEclSbWfemuWO5VDh0lq+zovCgpt0WOjzgxWk1gQQ5fe2c6Q1ovy6zr4OqU7qKIqiFjEWEJ9TDXY4B1rrEpf0KUKeBLeZDELuWmuJV5yuOzVNALg50f0mZdtBUjHbumFaI3i4SsmleqxmISuNb06yXtifnGG/TOkPVrHtzjBkiGHHfv4R4Y006j7JimGIQFzbZdXcsU7wICLnImVKoRY0pCfTDz0i0IowidMKkh2ShlTa8qoh1MpEqZq5WsG/NWwmKj0TkzUD4X+dZHZmZ3kkHXeRW2SeR0bpDcPcZHVQ9kf0mlpEXrojuSbmi5XJmP8CtoTu1LqIZEdnuwayEeWQy6P0VLszIABZ+MrfnDBWweN8k8VRUUAmQjpqQWzDQm2tBjeQSg5VDhGYX04Fd1/bHXrsuB2SQDS3BPgEtv4e+bzysV1/VPLXe1owdch4aYzkhbg6Wf9K71uTSTLnYNZ/3SUR2EmLhOOoNgeG22ghCGetoDfazUKy+nUCFFyx9rbo0XD9evK1fnSJ8CIinO2g4LpGIGsmHnFthr2u/A7y0vqTZtfn9KCwVND27J5qTb8zzcuXDJliL17eJddH3yvfeyxCGFQUNGRnW4m4qmkD80czTysVjyHDMMrxgRf8i5f4Wd4aHIVjRzi+YUpe2KvkBYdE8KbuDAehFxakXtUHWJn//aSkQ90ac/CV2Z+xh8bdtfPy0zlda1IICOHD2eQgvXM/W6BTN0ImoaWFGpxpAAVaDEw+4UN5lgK0HyZBkSWWuE6YKIcNmqlTQMnZDgBUS5Gap4ihJFSMzjWQ2d8mCJKGltwkTPCTRHKnbxpjijXsUl/d+s6Qd8t/ZgYQx3nkY0Q8EhVxnFtO3mw9fuseT7kCgTA2NDKbXpcti1+c4uscIrMKmLOmiiJJGbXvo/Grfixhhr6R0zg5v9RsSxv8HEUPxIZRcJCOJjD6J1j5/67tmqW0wgggr6tNeaUnFE6MGlymYoSHtJYjXA5Ul5iOWvEspeUTOzehnAYhk1RUZTAh2MBiQ/wwX2ZMuH+s24znuk7Jm7V4N7FuWWtPY30dqGxn6AVIf6wzi9wOeodcHhe+MSUAQfQQrM5Gqht23ycz5Lds5vUHWRHHZuaIKpAsqeBvnEkKsmuhDIQprAiGiRerczE+zvc31oL/cRex8iSKRwqHjbqRINXC1XTgbF6qIsudn0WCH6nmrrTpUu9ei1d7GAyVqhikhYREi53ur7N5vvaB+55qzVdYFrwOamyS4JwWpULXg9x3MP6vb+0snU8AQ3S4Vs7jjB3+YC33z/ySq1Ry3YKAUtfBf9AtfeVa22YntfnZ/l02AQSe0uBgGsUMll7erqN3fBQ0K+ll+/Lb3pczJr9BxSey3hLPyqN0EVD5lrNHDBCAvkF41KpLPzekLdliYfsYx7jv6u/doQUeUFT6aFJ+1wKCsJhvyfkKOLfmPoTxhnCyL/RYMe5hyb7ksDdYIEcNLJcr4G/5G4g3QlzHc47ExSOeCM7E5y7GcMUpq1Nk2zSASrZBfJquskh5RuvayksS+TRaAqHlvAsngIPEbSaUUN9O684nbImzFjs3FtZbVQ63SQmGYdc0vWw94L9bClM/+WQsY4YXKsSaQ3+0cdjCtEz6mc16NnOztUdEuuu5imJGEr8MJia0jdCyiRufESZJvhx5YeIvRnW1sEzdY6HMyYTsjTVId080U7ovbEkv3OfNYhnF+PYp9bEFoJHCgxQwZkhhVCak2/7CmLWANNTkIBHKbJ+qeDaP++0SOYq9YB7apivH/vj6Gun/w/demFrxTGSA8NgoKqKdr/W0WyrEgnTNDPBBW9uXvO8KYdOqEVUpfwd0AMintKB1lueuxYEj3wUFxSEd3DubxAFugfl4ihJqNsM7+Lqp9j7xYBHcX2wbOphE8HTH3F0oC3TvHGSul5fwmevP5ipsRge0GDx+Mg14pcgFhP5LN/1YrvOYGFSok8fLx9bh3YVo1ytllG3EjEs/HRhn9mw/qJxVtlGpU2E/s1Y9vWRbv1H8xMhIReoci03ec+JG6v4G6G/0n0BtD5O4umI8I6VekWZRyiHdnGQ8wbknzFdZnRWZ/+UOgxh9qX9gPpn42hT3oOMkCct6l53nQdN/mh8+fTT6OJhbeKjmss2c0nEZ7m6S+z+RtbWPj8v2SGfRTJ/kOgZM43HMF+x+toUQLVYMY5JnAgl38Rfd+qquBYOMABLSf1u/l9j81INmY3WFNTLrQgdDIj3L6cPv82Hd2KPxA269MAM8hdBMSx6VyxRv2HjLXk0zqsEh+XDxg0JyRRXKO9i6myMBrP4l94Db9uBT2E0NIwfUXbOSci9jFBiG6PprTYkwuob5oy9DACuoGFRxM2+lnz/CoICRSM7Q+BftqWtwpSgVEmWtjCjXIoNhs1NoOB2k63qGRyt42tu5n8GMGBgFny2tOQ0hmEpDuPOiuTF3yKjbK1PC1Ej4OG7ZasYe+9r/1rHG4sv3M9ljPIFFCY0iLqPLLhIEmSh/YK3i746xBHCOMkyxysAUT+AN9ylkCXao2qAIjkfz/+RYAq+Xy5gWYS/TquLfTOmocx02UWL1lD6Lq1D/hjPjsAlYLtUE2/wQNoRxjkcs5aJzZ5/5CA1mHoNZ6S/lyUobuykC1fObeSKsOJUoLHbBNWOCJRBN+3lX6qfkg97PxHP3WfhVcIYV+/zhUTaXPbKlVcvdt3teThs8mSufT3xC9EjDYDfI9FEdYZVzpZv64epmx+HU0Al1pKWb/RrkdQbYeTyQczVfmTGY7Z0KEQGHNWv61UDiHkP+8RKSI2j383rbOlR8CPBYBPofuhXehOUQESBqkP6SOYoqoh1gn5C4U2du03F6d4df3jOKeN+7rAsGfW5PvRZo/juXM3wGwyHAl2Zm2wJJe0plot7QLBWZLtzsd0fikViRGXDxdhEO0pxbAJaNUgCNLtQYZmM+QfUzOOuwadh9BNITtOxlIoMq8n4DbNle6xZcg7/HNoP+e8z8S3y2Mc7b4xKf90WqG7Xfs0w/C2gsilBai17tE0Vv2HoLZJ8YIS/dXzQgRjsFWqc7bnjGrH0p2+i/ojal5UDOPfsE6RnZBAGbJwM9ABKMtMY157EEsabJOUFZm+w8f9iIAD5AaUxJrn/2OlGlDi62AKzD5KFayPyoVUqHtZUN86JcNgqEbrpiJN53ytW7shnMlNQCFxSmPc77kWMmMDpKT59DVHo38mXr1q5NIvdDoQdaPCOxMq8QvIXQNAnkHX9Cl1Kju3yD7M1uAu3AiRy6vKws8F0KjbRJOlxVd6j49mqdBGGOzyVG+k3+FcR0hCxyaVvc+YEUfUGdW0fH+pr+gfxKllhgObxlLZuyfNiPxMHOaVRh9jRnrN98PVV+rh+OAp70EBC49wix7P3a+m7TG95kfJi8bqo3jTLSDSWkXHA4PlzfSVKzHYY3lCnk/hpWhW5ncyU7WVGSz+zyxOYVpNjjGIzBMv8u8dagTTk/gXRFjhIC2Ik3RPm1CYyBP4VKjRSFFSmdSDSR3h4viGPXKwnVOTGeMZQWD/tbcSrfsq9DI5AmuQSyox1yG3HtSB8xqBG7a6a0EDofTRzXEhR3yqy2cf5rOit2AtzyM2BW8iRyhYhOntpGKkl44/Ye1H+5YMU56WjDuVlma64e95rPHazURCJ4KDU2Mu0ChVILaH1N5v0qtSa7l6ofMYZn0UKi5O+X6k/9A5yiWFrfd81G75nDC9olGEz/Y1gUG8yUbqedL/JSQfHal1NEnlvGbxM1mz3O5mVySVAX0UESKZzp8fYTcZbHcvF/qs21Xl6VIubOzg/Fe0JZ9uHPFuwtW8lHb8j4B8V+YK7bPi/N6CTiUIIAXIJyMahwlAEIjZLRYy3H0ZW85+W1+ftrMDg+vRfRcMiI6kqrpnamA38x8fgkHM996bqXW5Iw4DUgJhUtZczl9Dc7l38qv70iiOM7WdR4hFtfzMaMPq/WEUAYMBBmwaj/s5UNZOmq0ltWv1ITAHQN+QPh00pqZ/WScrJ5SaYB+XnM5TgYhu6d4c1oRQ3uJ6ZZzndTgN64Ffc9CTwERw0a0ZXheB1DxR84iNsofatjb9kJauzFHaCgAYtWuJaZXaWVwAjd8ngh8RKvcqtf9wfk7vaCAl3+pkcElRJ1jW1cZ4Ucd5iesXovNPfqLY1PDtnXUgJAcjpupkpQOcbaudad/hvoWoRznhaoGWFa6hdgnx39qEdgyAZ4opV8WnTw5ciOsQarnWhhstlSemrMJtMdnVTYYDnUGGez96fDK/egn5UD9hoeSR6+QV0okgQj8J5j4o0N8dVb5nDITFvgKeNSv486QgC0/v11Pf25uZuc0yHiA5Tz9unnoXKt/0a3xRt9GPIIZJlzQw1E3sfqqhndw21H4ezHPmC4f97bU0yw/XRMHwT7dRJNDCmJNIp5b3mY621T0FQv/AH7qYM1zosFlSnakCVZ7TODxGrlGy+0UkRIMln5rihjVxccRf5CFygTUAy6FnPp2oAU+uP/NZQBqg7LQpO/4QyUoTMtZAo3VkdiYVKJ5NmqJBywj08XhkgoYU9MWH2UQXsSbhxkzOgGhFbSs/pyFOG40sefBa3rEE365kvg/M3V2vF12jq1u0BYT7B+8+yPbLixA+ie98dtmetH+wUn6BXHl98VQQEFYAlC02wNwlwN217+HMeZj9hLYcpvU9dGclJNXVtfsjpyc9QqhLaq5O6f6v56lIJuTFz5w+6F7KmwclY5IyfVL7ztwj/iMbh9AYZ63ARyILDOfDCfFdT4nd58o4Eu7+ARutu2JPQoRiLuDXFIjPEaNK28WzuGITw8vqvKJVKwRz9uqhiZdanDURbEXn0TB5f9UB7fmou1SHO28IuexoMTapurkR8iKrLi6+/0ggkEKbWQ84iTFLiw3RmpQ4qdHWq/PCvU27SowfEbJA/6vbyRKXHh0M332rkErXAlOR2KiNoj3W4H7c4xMp9hwidSdYN5KIVCSewHEJ30trD2h3xeGT9RE1gDYamE5CZAOiDbiUfbQrOGkER/XDXHhKWdaIH1B9mMtk7S7dH/L1No56Y2wqYHpTyFAlvmCIAl0uHT4PoFYJ6y0GjhISgETyUUljDJSADwp4tOxQIOBajxytdyv1+ikaqOhmG4EJVpS+o62cUuB0VparZX1vcEz0ckohl8CyncvbPC0jL4aOVWPGMzpO972krYDdcckXPIxP9eIenbBnH9veVIBP56JQMZUOcJrkREsztQASuzN3AkyE3xS/2kz319JhU/WWBhVtQmF73/dTqp+aPoTwrwjzntkb93wC3PDbO1V0vdWyXfH+tS1MHh2vchvRXU7kWqxQOjcaPqEayBnQR0gU8AzZKW7ZmeSbPz4ln9DpUUUZoIRPneMyO3vdLK3dZj72VzV1WZE61npfkvvxJXHIrTmxMLdsK/rBQNwP43uXf/c0MXFPOFV+nfNS4PeacON/VwZ+zuwNM77zOIRVcdRAlJGXKJmPySRqvQ3NrKhBu3629z/SzObjafB3Vm/67mTIgUTzi8Ok2kBydt3qx0+fiwLvilzRZNr29EEGZWZ58wb8j+WtpaEhzKVTalBd0Fbo8MpqZlhqnSyyBR6lzX1HwTBhWgvdv5NtQKH5HyFH4eF2MILxbFd86ztPK3j53i5/uLkhrRnp2JqG/H8zWmrIOBH2N+VvEDrgIJkjqe5f4Jt1zbtIMzHDEYcWPHBF3vh4Hlgk0KIX2HL9QV3hAeMYbXT2G/uoRk9cG1N1/2Nv0cye+r4/b2kwDzCj1QHdW5VrQvmKV4KGk56PcWNmC+OQUf4tkkyNEXxvR72XVEkUZqu2vIDt3VA0tAz2RB9jtnSF2xsuIRBexgcJnSNj2vy4yzw5cvH2FATZtlYhRL49kvDIcbvVPHfLVuTNJ6SIf5xs/8UaPg6rTaXrtXQBSqrs0SUwMMPRCFy+k6aiEW/7P7OmuvbVp+fKIyqBFmYrffc1aVoIa/nYAvBvD/8NzvaQto1GYbQ+cPRYL64eSFYFINf6k9K6IhKKI6NSCVXtQHdsdRnBbv7NNfu3PyCXmT707otun/CVFumLmElg9DgdCLcz0qy/zkSBOoLXNE31/aBIE7exmbUVsahP0OleA8+pCOaCgTpJgHMHo8gq8RdWweNCLMQF/lae9NEx/YjWadMjF6PDUf33d2cwP/aklu+CUzUwspLYAA4uCQhaxL6oxe7oKJ9LCMV+zFKJ1LEymniNAenmC2XIiBDcIn6wZppcVXKqCcS7FGcWv9eCF9FBW5yyjzF0OmgbB+Daf8A0zYxY3Qt5NN928LEYPfTOFZJmwROpeFWAKevSj5PEsFd4n7vSDEIsBDgm65/NEUQY8pAHSB7qeSK63E9lL6m307E+ackq8wBopeg6xk9nXdCa9aUApzWRgJ/ZDQq4O8YM9reIVwEXCz3G05M6PsiqSDL5FO2D0Iq1BBp5u5a+nVUhpkpbt2Q3D7IIhnBULPgKuyV/Xi1TNo1UOQ/aI2EfXbmaXwDi0gSg/gC/vzjf37HfVd5/lQ2s7Amhd/u38YgJ0KiVMvFAcDHgGeIgzrABOH0AYZ2/5N4B0Av4URgfdt2jHlEhpPKJN41zFw3/5DMsBL0ytZw8Asq8BAGXdBpDtHZyzbvJul1beYGWgaQZo5wGAUDKdlVDmKexI03hry++GMmOTsMSD3VBLFOTtkDQiKG+2TzJcz9Yvb5ryB0qyX7dgClCAQGdooqgL6dIXSRVuH8WsM6IGi7Q7jT/aBrwjQWloqdDpkbxngUrZFzk/Ze8Tfu3sQbMiPp24pzuHW8rqnsfxfGSlgDJi5jtoz7pMZonXX0AJdpeGDJWEPTVI6nVBf4Tzu9EifA5Ozm4dIXBKJwiJ6Y1Y2ktqc4Ka/Qzb2f5ei1g5cXcNIzQgpHiX/CXvkR2CQV4ffar/OpYVf72g78Kf1zxPBVt4P+0/ypfjMuZb33DqQWTasgIFCcStjM957va/ueOVfipHIU/BAZ1veYf3dcTvkthpj779Yf9j0Jv+BVsrTb3e4DuuFKlSUFTUbPsE12rITNJtuxHqq2Npdp2FKWPGbou6XNCAJvch/MecMX92fosKUn4bsqjYI01bAj+3JurGLYr7fHyToPmg65v8/Hd9WwGxZpNVtSUviLILk6y6dVOvFZ8uxgN53ft8Si9rvQ96eImQCRJyETJfOiwCMRpZaHjw20WIChlk21swUCUQFlvUaFHWyvG1T+6149smXlrTyUsfSnUkOX+2Hd4n409HrQgSeL5bWTHSZYOqb9ous8yM0gudIrf+wXbtPZ5hxv9mLI5HtnuWuAqXk+86ATtu6r89XiGV83h24P6bKOuNmJMOkYhpN+DAb/ggVldzWC4gqQi08glnEZt06AAd9opngaTQpIpMhdjSo6WBibzzatjJrf0AEBd0bx/WCa9N1Ehokme24hHJx+IazUcXEwyTFFqHszknp9EYzC2X3c/FMR/8avrGDMvfxcpzzXPB4q72fxutiacXZSAg5qKc6RqSUhrcxsfE/+3+gAAAACHj5rCMlrRy0XlQZR8GorOznoaMFLAQfGxLry+96EEPC3cx0NbMo5OdTbQQC5fH7rx/qmHVZ3gpJttsP2rK0T3zs01w7DX9q3q7+iKyKcQrKu7caxrdpynmyIpzqOPB1B8cQMQ5HPJ1DYjiPyMc5v4K3OFrq8huaZFduMaOSLhZITbosoI4V9EBzLKTpVvP71ulOZtuw9i+t0/aFONCcROzPF/Nmsk/otd8xI/4uoDuyQGNTzN/lvnRbE762hI0tJHsNPPTfUh09asp7XEJcRjPlb/F4rQcfTPCHUeJJejyNYduy5Hfj4pZG6+bC+IpxDEMDtNRzBJN85ys5auRrFWX9pCl6/gFe0BzdQx469RTxze5W3PiEEVxRaeQ1021K6lQ9MS8nn9I7RPvw+5yo4cwGscxjXL43PUOUb6/3ORd0NcMk2R5lGO68+UlVugVFousCAUifynDWR0aMR9QjrXQ2KhKxRD9BLO0RVnr8vyL7VUtPdhRt+dFFdTvZc1TnC+/5D1K0ZJZDHBkJ96iU98Mvuc4NEle6kQ/0RfChZ4dpclL+YoRtgKshIfgmOms/puP55EAYwm+0+Rs6EEGEVXwXEPCooYofGXf9lxELWMKLFMKVJQt6/UgxSMyNU4Cqd/7gCZPC1AmEzROSc76rp4Kr4zsKZDWOt56RDLUEtuOzvDQosoNQw/CWi/snX1wvRZKJw8eSD85nd+7eF7hoemZu6XBBHFMyRMG+SP+aRAES92uoRZmcuLUGqwsGI8M8/MrJ9Q9tFrJLRiK/5ajoCwEzZSpRlUmDafIeXALnTfwJ1gHSbp0wlwN8IaGKx2tYPNpOAhemWMf+kABoDQdd4DPiAN12f481BKiNR5waTSlaQAA6NhgAAAA==';

// ---------- 1. Les tableaux, des pastilles comme les autres ----------
avantDueAt = function () { return -1; };            // plus d'écran avant la lecture
GAME_ICO.tableau = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="g1" x="3.5" y="6" width="25" height="20" rx="1.5"/><rect class="g2" x="7.5" y="10" width="17" height="12"/><path class="g3" d="M8.5 21l5-5.5 3.5 3.5 2.5-2.5 4 4.5"/><circle class="g3" cx="20.5" cy="13.2" r="1.3"/></svg>';
GAME_LAB.tableau = 'Un tableau de l’époque';
KLAB.tableau = 'tableau d’époque';
RUB.tableaux = (g) => g.kind === 'tableau';
GAME_BUILD.tableau = function (body, g) {
  const a = g.x.a, p = paintingOf(a);
  S.avant[g.x.tk !== undefined ? g.x.tk : g.x.ci] = 1; persist();
  const fig = el('figure', 'tb49');
  if (a.img) { const im = new Image(); im.src = a.img; im.alt = p.titre; im.decoding = 'async'; fig.append(im); }
  const cap = el('figcaption', '');
  cap.append(el('b', '', p.titre), el('span', '', p.peintre + (p.an ? ', ' + p.an : '')), a.musee ? el('small', '', a.musee) : '');
  fig.append(cap);
  body.append(fig);
  const dl = el('dl', 'tb49-dl');
  [['Où', a.ou], ['Quand', a.quand], ['En France', a.france]].forEach(([t, d]) => { if (d) dl.append(el('dt', '', t), el('dd', '', d)); });
  if (dl.childNodes.length) body.append(el('p', 'tb49-lead', a.titre ? 'Dans le roman : ' + lowFirst(a.titre) : ''), dl);
};
{
  const gh = gameHead;
  gameHead = function (g) {
    if (g.kind !== 'tableau') return gh(g);
    const ph = isPhoto(g.x.a);
    return [el('span', 'mc-lab', ph ? 'Une photo de l’époque' : GAME_LAB.tableau), el('strong', 'gm-q', g.x.a.tete || 'Le Paris de ' + YEAR + (ph ? ' en photo' : ' en peinture'))];
  };
}
// les tableaux restent à voir dans le Carnet tant qu'on ne les a pas ouverts
{
  const ft = fillTableaux;
  fillTableaux = function () {
    ft();
    const host = byId('cnTab');
    const lead = $('.cn-lead45', host); if (lead) lead.textContent = 'Les peintures de l’époque, trouvées en lisant. Touche un tableau pour le revoir.';
    $$('.empty', host).forEach((x) => { if (/début de son chapitre/.test(x.textContent)) x.textContent = x.textContent.replace('chacun t’attend au début de son chapitre', 'à trouver en lisant'); });
    const s = pendSection('tableaux', 'Tableaux à découvrir');
    if (s) host.prepend(s);
  };
}

// ---------- 2. Les pastilles : elles apparaissent, tintent, et montent tout de suite ----------
if (!S.coll || typeof S.coll !== 'object') {
  S.coll = {};
  GAMES.forEach((g) => { if (passedG(g)) S.coll[g.key] = 1; });   // ce qui était déjà en attente le reste
}
GAMES.forEach((g) => { if (S.coll[g.key]) gameSkipped.add(g.key); });
const PIECE49 = (g) => g && g.kind !== 'pari' && !BANDK(g);
passedG = function (g) { return PIECE49(g) && !!S.coll[g.key] && !S.jeux[g.key] && gameOpen !== g; };
const APPEAR_MS = 350;   // version 52 : la pastille monte presque aussitôt
function chime() { tone(1319, 0, .18, 'sine', .028); tone(1976, .09, .32, 'sine', .022); }
function collect(key) {
  const g = GAMES.find((x) => x.key === key);
  if (!g || S.coll[key] || S.jeux[key]) return;
  S.coll[key] = 1; persist();
  gameSkipped.add(key);
  paintGames();                      // la pastille quitte la colonne : elle s'envole vers le Carnet (version 46)
}
{
  const pg = paintGames;
  paintGames = function () {
    pg();
    $$('#rail [data-game]').forEach((b) => {
      if (b.dataset.t49) return;
      b.dataset.t49 = '1';
      const key = b.dataset.game;
      if (S.coll[key]) { collect(key); return; }
      
      setTimeout(() => collect(key), speedHack ? 30 : APPEAR_MS);
    });
  };
}
// toucher une pastille l'envoie tout de suite au Carnet (elle se découvre à la fin de l'épisode)
byId('rail').addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-game]');
  if (!b) return;
  ev.stopPropagation(); ev.preventDefault();
  collect(b.dataset.game);
}, true);
// à la fin de l'épisode, toutes ses cartes sont au Carnet (même celles qu'on n'a pas vues passer)
{
  const ee = endEpisode;
  endEpisode = function (e, isLast) {
    let n = 0;
    GAMES.forEach((g) => { if (PIECE49(g) && EPI[g.j] === e && !S.coll[g.key] && !S.jeux[g.key]) { S.coll[g.key] = 1; gameSkipped.add(g.key); n++; } });
    if (n) { persist(); paintBadge(); }
    return ee(e, isLast);
  };
}
// le bouton du Carnet : le logo, et le compteur
cnBtn.innerHTML = '<span class="cnb-ic cnb-logo" aria-hidden="true"><img src="' + LOGO96 + '" alt=""></span><span class="cnb-t">Curiosités</span><span class="cnb-n" hidden></span>';
paintBadge();
{
  const head = $('#carnetSheet .panel-head');
  const lg = el('span', 'cn-logo49'); lg.innerHTML = '<img src="' + LOGO96 + '" alt="">';
  if (head) head.insertBefore(lg, byId('carnetTitle'));
}

// ---------- 3. Fin d'épisode : Découvrir les cartes, ou Continuer ----------
const KIND49 = { jeu: (g) => !FREE(g) && g.kind !== 'tableau', savoir: (g) => FREE(g) && g.kind !== 'tableau', tableau: (g) => g.kind === 'tableau' };
function piecesLine(list) {
  const tl = list.filter(KIND49.tableau), np = tl.filter((g) => isPhoto(g.x.a)).length;
  const nj = list.filter(KIND49.jeu).length, ns = list.filter(KIND49.savoir).length, nt = tl.length - np;
  return [nj ? nb(nj, 'mini-jeu', 'mini-jeux') : '', ns ? nb(ns, 'découverte', 'découvertes') : '', nt ? nb(nt, 'tableau', 'tableaux') : '', np ? nb(np, 'photo', 'photos') : ''].filter(Boolean).join(', ');
}
paintMenu = function (box) {
  const e = Number(box.dataset.e);
  const left = menuLeft(e);
  const pieces = left.filter((g) => !BANDK(g)), quiz = left.filter(BANDK);
  box.replaceChildren();
  box.classList.toggle('done49', !left.length);
  const lg = el('button', 'm49-logo'); lg.type = 'button';
  lg.innerHTML = '<img src="' + LOGO240 + '" alt="">';
  lg.setAttribute('aria-label', 'Ouvrir le Carnet des curiosités');
  const t = el('div', 'm49-t');
  t.append(el('span', 'm49-eb', 'Carnet des curiosités'));
  if (left.length) {
    t.append(el('b', '', pieces.length ? nb(pieces.length, 'carte à découvrir', 'cartes à découvrir') : (quiz.length > 1 ? 'Les quiz de l’épisode' : 'Le quiz de l’épisode')));
    t.append(el('small', '', [piecesLine(pieces), quiz.length ? (quiz.length > 1 ? 'les quiz' : 'le quiz') : ''].filter(Boolean).join(' + ')));
  } else {
    t.append(el('b', '', 'Tout est découvert'), el('small', '', 'Bravo ! Le compteur du Carnet est à jour.'));
  }
  const top = el('div', 'm49-top'); top.append(lg, t);
  box.append(top);
  if (left.length) {
    const ics = el('div', 'm49-ics');
    left.slice(0, 6).forEach((g) => ics.append(itemIcon(g)));
    box.append(ics);
    const go = el('button', 'btn primary m49-go'); go.type = 'button';
    go.textContent = box.dataset.started ? 'Reprendre les cartes' : 'Découvrir les cartes';
    const start = (ev) => {
      ev.stopPropagation();
      if (gameOpen) return;
      box.classList.add('opening');
      lg.classList.add('open');
      box.classList.remove('opening'); menuPlay(box, menuLeft(e).map((g) => g.key));
    };
    go.addEventListener('click', start); lg.addEventListener('click', start);
    box.append(go);
  }
};
// sur chaque carte : passer à la carte suivante, ou reprendre la lecture
function stopChain() {
  if (!chain || !chain.m48) return;
  const box = chain.line;
  chain = null;
  closeGame(false);
  hold48 = 0;
  setTimeout(() => { paintMenus(); if (!playing && !gameOpen && !byId('reader').hidden) continueNow(); }, REDUCED ? 40 : 520);
  if (box) box.dataset.started = '1';
}
function chainFoot(answered) {
  const box = byId('gameC');
  $$('.m49-foot', box).forEach((x) => x.remove());
  if (!chain || !chain.m48) return;
  const last = chain.at + 1 >= chain.keys.length;
  const foot = el('div', 'm49-foot');
  const lab = el('span', 'm49-n', 'Carte ' + (chain.at + 1) + ' sur ' + chain.keys.length);
  const stop = el('button', 'm49-stop'); stop.type = 'button'; stop.textContent = 'Reprendre la lecture';
  stop.addEventListener('click', (ev) => { ev.stopPropagation(); stopChain(); });
  foot.append(lab);
  if (!answered && !last) { const nx = el('button', 'm49-next'); nx.type = 'button'; nx.textContent = 'Passer'; nx.addEventListener('click', (ev) => { ev.stopPropagation(); closeGame(false); }); foot.append(nx); }
  if (!(answered && last)) foot.append(stop);
  box.append(foot);
}
{
  const og = openGame;
  openGame = function (g) {
    og(g);
    if (gameOpen === g && chain && chain.m48) {
      const sk = $('#gameC .gm-skip'); if (sk) sk.hidden = true;
      chainFoot(gameDone);
    }
  };
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    gf(good, head, text, share);
    if (!chain || !chain.m48) return;
    const go = $('#gameC .gm-go');
    if (go) go.textContent = chain.at + 1 < chain.keys.length ? 'Carte suivante' : 'Continuer la lecture';
    chainFoot(true);
  };
}
// la suite lancée depuis le Carnet : à la fin, la lecture repart (les cartes passées restent au Carnet)
{
  const cn1 = chainNext;
  chainNext = function () {
    if (chain && chain.m48 && chain.at + 1 >= chain.keys.length) {
      const box = chain.line;
      chain = null;
      paintMenus();
      if (box) box.dataset.started = '1';
      if (!byId('reader').hidden && !gameOpen) { forceSoft = false; hold48 = 0; setTimeout(() => { if (!playing && !gameOpen) continueNow(); }, 650); }
      return;
    }
    cn1();
  };
}

// crochets de test
window.__v49 = { collect, get coll() { return S.coll; }, stopChain, piecesLine, LOGO96: LOGO96.length };

/* ================= Version 50 =================
   Demandé par Guillaume :
   – le Carnet des curiosités ne s'ouvre qu'à la fin de l'épisode : c'est la récompense d'avoir lu l'épisode en entier ;
   – à la fin de l'épisode, les cartes s'enchaînent sur un écran à elles, sans repasser par le texte ;
   – plus de son quand une pastille apparaît ou arrive ; le bouton du Carnet reste visible, même en mode flux ;
   – dans l'onglet Découvertes, on peut faire toutes les cartes trouvées en lisant, et les quiz des épisodes lus. */

// ---------- 1. Le Carnet ne s'ouvre qu'à la fin de l'épisode ----------
chime = function () { };
let cnForce50 = false;   // pour les tests
function atEnd50() {
  if (byId('reader').hidden) return true;
  if (inter || stage.dataset.end === '1') return true;
  const ep = EPS[EPI[k]];
  return !!document.querySelector('#pvIn .epend.open') && !!ep && (k <= ep.a + 2 || k >= ep.z - 1);
}
{
  const oc = openCarnet;
  openCarnet = function (tab) {
    if (!atEnd50() && !cnForce50) {
      const n = pendingAll().length;
      toast(n ? 'Ton Carnet s’ouvre à la fin de l’épisode : ' + nb(n, 'carte t’attend', 'cartes t’attendent') + ' !' : 'Ton Carnet s’ouvre à la fin de l’épisode');
      cnBtn.classList.remove('nope50'); void cnBtn.offsetWidth; cnBtn.classList.add('nope50');
      buzz(6);
      return;
    }
    return oc(tab);
  };
}

// ---------- 2. L'écran des cartes : elles s'enchaînent, sans repasser par le texte ----------
const trv = el('div', 'trove50'); trv.id = 'trove'; trv.hidden = true;
trv.setAttribute('role', 'dialog'); trv.setAttribute('aria-modal', 'true'); trv.setAttribute('aria-labelledby', 'trvTitle');
trv.innerHTML = '<div class="tv-col"><header class="tv-head"><img class="tv-logo" alt="" src="' + LOGO96 + '"><div class="tv-ht"><span class="tv-eb">Carnet des curiosités</span><h2 id="trvTitle"></h2></div>'
  + '<span class="tv-n" id="trvN"></span></header><div class="tv-dots" id="trvDots" aria-hidden="true"></div>'
  + '<div class="tv-body" id="trvBody"><div class="gmslot open tv-slot"><div class="gm-in" id="trvSlot"></div></div><div class="tv-end" id="trvEnd" hidden></div></div>'
  + '<footer class="tv-foot" id="trvFoot"></footer></div>';
document.body.append(trv);
let trove = null;   // { keys, at, from: 'reader' | 'home', e, done: Set }
const allQuiz50 = () => [...EPQ, ...QQ, ...FQ].filter(Boolean);
const findG50 = (key) => GAMES.find((x) => x.key === key) || allQuiz50().find((x) => x.key === key);
function openTrove(keys, opts) {
  keys = keys.filter((key) => findG50(key) && !S.jeux[key]);
  if (!keys.length || gameOpen) return;
  clearTimeout(timer);
  $$('.ee-go').forEach((b) => b.classList.remove('run'));
  if (playing) { const e0 = EPI[k], before = epPaused[e0]; FRZ70 = true; try { pause(); } finally { FRZ70 = false; } FRZ70b = true; epPaused[e0] = before; }
  if (!FRZ70b) flowOff();
  trove = Object.assign({ keys, at: 0, from: 'reader', e: -1, played: [] }, opts || {});
  byId('trvTitle').textContent = trove.e >= 0 ? 'Les cartes de l’épisode ' + (EPS[trove.e].i + 1) : 'Tes cartes à découvrir';
  byId('trvEnd').hidden = true; $('.tv-slot', trv).hidden = false;
  trv.hidden = false;
  trv.classList.add('in');
  document.documentElement.classList.add('trove-on');
  trovePiece();
}
function troveDots() {
  byId('trvDots').replaceChildren(...trove.keys.map((key, i) => el('i', i < trove.at ? (S.jeux[key] ? (S.jeux[key].ok === false ? 'no' : 'ok') : 'skip') : i === trove.at ? 'cur' : '')));
  byId('trvN').textContent = Math.min(trove.at + 1, trove.keys.length) + ' / ' + trove.keys.length;
}
function troveFoot(answered) {
  const foot = byId('trvFoot');
  foot.replaceChildren();
  if (!trove) return;
  const last = trove.at + 1 >= trove.keys.length;
  if (!answered) {
    const nx = el('button', 'tv-skip'); nx.type = 'button'; nx.textContent = last ? 'Passer' : 'Passer cette carte';
    nx.addEventListener('click', (ev) => { ev.stopPropagation(); closeGame(false); });
    foot.append(nx);
  }
  const stop = el('button', 'tv-stop'); stop.type = 'button';
  stop.textContent = trove.from === 'reader' ? 'Reprendre la lecture' : 'Fermer';
  stop.addEventListener('click', (ev) => { ev.stopPropagation(); troveClose(true); });
  foot.append(stop);
}
function trovePiece() {
  if (!trove) return;
  while (trove.at < trove.keys.length && S.jeux[trove.keys[trove.at]]) trove.at++;
  if (trove.at >= trove.keys.length) { troveEnd(); return; }
  const g = findG50(trove.keys[trove.at]);
  troveDots();
  mountAnchor = byId('trvSlot');           // hors de la page : la carte n'est pas posée dans le texte
  openGame(g);
  mountAnchor = null;
  if (gameOpen !== g) { trove.at++; trovePiece(); return; }
  gameWas = false;                       // fermer une carte ne relance pas la lecture
  const box = byId('gameC');
  byId('trvSlot').append(box);
  box.hidden = false;
  box.classList.remove('in', 'out');
  if (stage.dataset.game !== '0') stage.dataset.game = '0';
  const sk = $('.gm-skip', box); if (sk) sk.hidden = true;
  $$('.gm-foot, .m49-foot', box).forEach((f) => f.remove());
  const slot = $('.tv-slot', trv);
  slot.classList.remove('tv-out', 'tv-in'); slide73(slot);
  { const tb73 = byId('trvBody'); requestAnimationFrame(() => { if (tb73.scrollTop) tb73.scrollTop = 0; }); }
  troveFoot(gameDone);
  if (gameDone) troveGo();
}
function troveGo() {
  const go = $('#gameC .gm-go');
  if (go && trove) go.textContent = trove.at + 1 < trove.keys.length ? 'Carte suivante' : 'Terminer';
}
function troveEnd() {
  const keys = trove.keys;
  const done = keys.filter((key) => S.jeux[key]), ok = done.filter((key) => S.jeux[key].ok !== false);
  $('.tv-slot', trv).hidden = true;
  byId('trvN').textContent = '';
  troveDots();
  const end = byId('trvEnd');
  const lg = el('img', 'tv-big'); lg.src = LOGO240; lg.alt = '';
  const left = keys.length - done.length;
  const msg = left ? nb(left, 'carte reste', 'cartes restent') + ' dans ton Carnet : tu pourras y revenir dans Découvertes.' : 'Toutes les cartes sont rangées dans ton musée.';
  const go = el('button', 'btn primary tv-go', trove.from === 'reader' ? 'Continuer la lecture' : 'Retour aux Découvertes'); go.type = 'button';
  go.addEventListener('click', (ev) => { ev.stopPropagation(); troveClose(true); });
  end.replaceChildren(lg, el('b', 'tv-et', left ? 'Bien joué !' : 'Tout est découvert !'),
    el('p', 'tv-es', nb(done.length, 'carte découverte', 'cartes découvertes') + (ok.length && ok.length < done.length ? ' · ' + ok.length + ' bonnes réponses' : '')), el('p', 'tv-em', msg), go);
  end.hidden = false;
  byId('trvFoot').replaceChildren();
  if (!left && !REDUCED) setTimeout(sparkleStage, 150);
  if (!left) { SFX.win(); buzz([10, 40, 10]); }
  setTimeout(() => go.focus({ preventScroll: true }), 60);
}
function troveClose(resume) {
  if (!trove) return;
  const t = trove;
  if (gameOpen) { trove = Object.assign({}, t, { closing: true }); closeGame(false); }
  trove = null;
  const box = byId('gameC');
  box.hidden = true; box.classList.remove('out', 'in');
  stage.insertBefore(box, byId('rail'));
  trv.hidden = true;
  document.documentElement.classList.remove('trove-on');
  paintBadge();
  paintMenus();
  if (t.from === 'reader') {
    if (resume && !byId('reader').hidden) { hold48 = 0; setTimeout(() => { if (!playing && !gameOpen) continueNow(); }, REDUCED ? 30 : 380); }
  } else { refreshHome(); if (curView === 'progres') renderMusee(); }
}
{
  const cg = closeGame;
  closeGame = function (resume) {
    if (!trove || !gameOpen) return cg(resume);
    const t = trove;
    gameWas = false;
    cg(false);
    if (t.closing) return;
    const slot = $('.tv-slot', trv);
    slot.classList.remove('tv-in'); slot.classList.add('tv-out');
    setTimeout(() => { if (trove !== t) return; t.at++; trovePiece(); }, 0);
  };
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    gf(good, head, text, share);
    if (!trove) return;
    troveGo();
    troveFoot(true);
    troveDots();
  };
  // pendant l'écran des cartes, rien ne relance la lecture en dessous
  const c1 = continueNow;
  continueNow = function () { if (trove) return; return c1.apply(this, arguments); };
}
// le menu de fin d'épisode ouvre l'écran des cartes
menuPlay = function (box, keys) {
  if (gameOpen || !keys.length) return;
  unlockAudio();
  box.dataset.started = '1';
  openTrove(keys, { from: 'reader', e: Number(box.dataset.e) });
};
document.addEventListener('keydown', (ev) => { if (trove && ev.key === 'Escape') troveClose(true); });

// ---------- 3. Découvertes : toutes les cartes trouvées en lisant, et les quiz des épisodes lus ----------
function homePending() {
  const pieces = pendingAll().sort((a, b) => a.j - b.j);
  const quiz = [];
  EPS.forEach((ep, e) => { if (S.eps[e] && S.eps[e].done) BANDS(e).forEach((g) => { if (!S.jeux[g.key]) quiz.push(g); }); });
  return { pieces, quiz };
}
function homeCarnetCard() {
  const { pieces, quiz } = homePending();
  const all = pieces.concat(quiz);
  const card = el('section', 'hc50' + (all.length ? '' : ' empty'));
  const lg = el('img', 'hc-logo'); lg.src = LOGO240; lg.alt = '';
  const t = el('div', 'hc-t');
  t.append(el('span', 'hc-eb', 'Carnet des curiosités'));
  if (all.length) {
    t.append(el('b', '', nb(all.length, 'carte à découvrir', 'cartes à découvrir')),
      el('small', '', [piecesLine(pieces), quiz.length ? nb(quiz.length, 'quiz', 'quiz') : ''].filter(Boolean).join(' + ') + ' · trouvés en lisant'));
  } else {
    t.append(el('b', '', 'Rien en attente'), el('small', '', 'Lis un épisode : les pastilles croisées viennent se ranger ici.'));
  }
  const top = el('div', 'hc-top'); top.append(lg, t);
  card.append(top);
  if (all.length) {
    const go = el('button', 'btn primary hc-go', all.length > 1 ? 'Tout découvrir' : 'Découvrir'); go.type = 'button';
    go.addEventListener('click', () => openTrove(all.map((g) => g.key), { from: 'home' }));
    card.append(go);
    const list = el('div', 'hc-list');
    all.slice(0, 12).forEach((g) => {
      const b = el('button', 'm48-it' + (BANDK(g) ? ' quiz' : '')); b.type = 'button';
      const tx = el('span', 'm48-t');
      tx.append(el('b', '', BANDK(g) ? QLAB48[g.kind] : pendTitle(g)), el('small', '', BANDK(g) ? 'Épisode ' + (EPS[g.e].i + 1) + ' · quiz' : where(g.j)));
      b.append(itemIcon(g), tx, el('span', 'm48-go', FREE(g) ? 'Voir' : 'Jouer'));
      b.addEventListener('click', () => openTrove([g.key], { from: 'home' }));
      list.append(b);
    });
    if (all.length > 12) list.append(el('p', 'hc-more', 'et ' + nb(all.length - 12, 'autre', 'autres') + ' : touche « Tout découvrir »'));
    card.append(list);
  }
  return card;
}
{
  const rm = renderMusee;
  renderMusee = function () {
    rm();
    if (roomCur) return;
    const m = byId('musee');
    const hero = m && $('.mu-hero', m);
    if (hero) hero.after(homeCarnetCard());
  };
}

// crochets de test
window.__v50 = { set force(v) { cnForce50 = !!v; }, atEnd50, openTrove, troveClose, get trove() { return trove; }, homePending };

/* ================= Version 54 =================
   Demandé par Guillaume : des pastilles « objet d'époque » : un objet de 1885 qu'on n'utilise plus, comment il marche,
   et ce qui l'a remplacé (l'ancêtre du bus, du stylo, du SMS…). On les retrouve dans le musée (Découvertes) et dans le Carnet. */
const OBJ_ART = {
  omnibus: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M48 44h88v32H48z"/><path d="M54 50h14v12H54zM74 50h14v12H74zM94 50h14v12H94zM114 50h14v12h-14z"/><path d="M50 44v-12h84v12M56 32v-6M72 32v-6M88 32v-6M104 32v-6M120 32v-6"/><circle cx="62" cy="84" r="11"/><circle cx="120" cy="84" r="11"/><path d="M62 73v22M51 84h22M120 73v22M109 84h22"/><path d="M136 76l10-4v-8M146 64l-6-6"/><path d="M48 62H38"/><path d="M38 56c-4-6-12-8-20-6-6 2-9 8-8 14l1 22M30 64l1 22M18 50l-6-10 5-3 6 8M10 64c-4 2-6 8-4 14"/></svg>',
  allumette: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M8 94h26V82h26V70h26V58h26" class="ob-faint"/><path d="M92 24c-9 9-10 17-2 22 9-4 9-13 2-22z" class="ob-flame"/><path d="M92 34c-3 4-3 7 0 9 3-2 3-5 0-9z" class="ob-flame2"/><ellipse cx="91" cy="50" rx="5" ry="6"/><path d="M90 56c-2 10 2 18 0 28-1 6 1 9 4 10"/><path d="M110 70h40v24h-40z"/><path d="M114 78h32M114 86h20"/></svg>',
  plume: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M30 92h58l-8-26H38z"/><path d="M48 66v-8h24v8"/><path d="M44 58h32"/><path d="M78 56L140 12" class="ob-thick"/><path d="M78 56l-10 12 14-4z"/><path d="M72 62l3-3"/><path d="M106 92h40v-6h-40z" class="ob-faint"/><path d="M50 84c4-3 10-3 14 0" class="ob-faint"/></svg>',
  depeche: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M28 96V12M14 20h28M16 30h24"/><path d="M42 20c30 10 70 10 112 2M40 30c34 10 74 8 114 2" class="ob-faint"/><path d="M70 44h76v50H70z"/><path d="M78 54h60"/><path d="M78 64h8M90 64h3M97 64h8M109 64h3M116 64h3"/><path d="M78 74h44M78 82h30"/><path d="M130 82l8 4-8 4" class="ob-faint"/></svg>',
  epreuve: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M60 8h72v52H60z"/><path d="M68 18h56M68 26h48M68 34h56M68 42h36" class="ob-faint"/><path d="M118 24c6-4 12 0 8 6M108 40l12 0"/><path d="M14 66h110v14H14z"/><path d="M20 68h10v10H20zM34 68h10v10H34zM48 68h10v10H48zM62 68h10v10H62z"/><path d="M23 75l2-5 2 5M37 70v6h4M51 70h3a2 2 0 010 6h-3zM65 70v6M65 70h4"/><path d="M124 72h18v4h-18zM14 88h110" class="ob-faint"/></svg>'
};
GAME_ICO.objet = '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="g1" d="M6 25h20v3.5H6z"/><path class="g3" d="M9 25V15a7 7 0 0114 0v10"/><circle class="g1" cx="16" cy="6.6" r="1.6"/><path class="g1" d="M13.2 25l2.8-6.5 2.8 6.5z"/></svg>';
GAME_LAB.objet = 'Un objet d’époque';
KLAB.objet = 'objet d’époque';
RUB.objets = (g) => g.kind === 'objet';
const OBJ_G = () => GAMES.filter((g) => g.kind === 'objet');
function objArt(x, cls) {
  const s = el('span', 'ob-art' + (cls ? ' ' + cls : ''));
  s.innerHTML = OBJ_ART[x.ic] || GAME_ICO.objet;
  return s;
}
GAME_BUILD.objet = function (body, g) {
  const x = g.x;
  const vit = el('div', 'ob-vitrine');
  vit.append(objArt(x), el('span', 'ob-depuis', x.depuis || ''));
  body.append(vit);
  if (x.role) body.append(el('p', 'ob-role', x.role));
  const h = el('p', 'ob-h', 'Comment ça marche');
  const ol = el('ol', 'ob-steps');
  (x.comment || []).forEach((t) => ol.append(el('li', '', t)));
  body.append(h, ol);
  const now = el('div', 'ob-now');
  now.append(el('span', 'ob-desc', 'Son descendant : ' + (x.descendant || '')), el('p', '', x.auj || ''));
  body.append(now);
};
{
  const gh = gameHead;
  gameHead = function (g) {
    if (g.kind !== 'objet') return gh(g);
    return [el('span', 'mc-lab', GAME_LAB.objet), el('strong', 'gm-q', g.x.nom)];
  };
  // la source, sous la carte, comme pour les À savoir
  const og = openGame;
  openGame = function (g) {
    og(g);
    if (gameOpen === g && g.kind === 'objet' && g.x.src) { const fb = $('#gameC .gm-fb'); const info = fb && $('.gm-info', fb); if (info) { info.textContent = ''; info.append(srcLine(g.x.src)); } }
  };
}

// le musée : une salle « Objets d'époque », avec son quiz
{
  const room = { id: 'objets', t: 'Objets d’époque', s: 'Ce qu’on utilisait en ' + YEAR + ', et ce qui l’a remplacé', ic: GAME_ICO.objet,
    got: () => OBJ_G().filter(isDone).length, all: () => OBJ_G().length };
  const i = ROOMS.findIndex((r) => r.id === 'tableaux');
  ROOMS.splice(i + 1, 0, room);
}
ROOM_FILL.objets = function (host) {
  const ul = el('ul', 'room-list ob-list');
  OBJ_G().forEach((g) => {
    const x = g.x, seen = isDone(g);
    const li = cartel('ob-li' + (seen ? '' : ' hid'));
    li.append(objArt(x, 'sm'));
    const t = el('div', 'ob-t');
    if (seen) {
      t.append(el('b', '', x.nom), el('span', 'wd-tag', 'son descendant : ' + x.descendant));
      const d = el('details', 'ob-more');
      d.append(el('summary', '', 'Comment ça marche'));
      const ol = el('ol', 'ob-steps'); (x.comment || []).forEach((s) => ol.append(el('li', '', s)));
      d.append(ol, el('p', 'wd-x', x.auj || ''));
      t.append(d);
    } else t.append(el('b', '', 'Objet mystère'), el('span', '', 'À trouver en lisant · ' + where(g.j)));
    li.append(t);
    ul.append(li);
  });
  host.append(ul, lockedNote(OBJ_G().filter((g) => !isDone(g)).length, ': ils se cachent dans le texte, comme les autres pastilles'));
};
CATS47.objets = ['objet-d', 'objet-r'];
{
  const cp = catPool;
  catPool = function (id) {
    const Q = cp(id);
    if (id !== 'objets') return Q;
    const all = OBJ_G().map((g) => g.x);
    OBJ_G().filter(isDone).forEach((g) => {
      const x = g.x;
      const add = (type, q) => { if (q.choix.length >= 2 && new Set(q.choix).size === q.choix.length) Q.push(Object.assign({ type }, q)); };
      const od = shuffle(all.filter((y) => y !== x).map((y) => y.descendant)).slice(0, 2);
      add('objet-d', { q: 'Quel est le descendant de cet objet de ' + YEAR + ' : ' + x.nom.charAt(0).toLowerCase() + x.nom.slice(1) + ' ?', choix: [x.descendant].concat(od), ok: x.descendant, info: x.auj });
      const orr = shuffle(all.filter((y) => y !== x).map((y) => y.role)).slice(0, 2);
      add('objet-r', { q: 'En ' + YEAR + ', à quoi sert ' + x.nom.charAt(0).toLowerCase() + x.nom.slice(1) + ' ?', choix: [x.role].concat(orr), ok: x.role, info: (x.comment || [])[0] || '' });
    });
    return Q;
  };
}

// le Carnet des curiosités : une rubrique « Objets d'époque »
HUE47.objets = 32;
{
  const panel = $('#carnetSheet .panel');
  const s = el('section', 'pane'); s.dataset.pane = 'objets'; s.hidden = true; s.innerHTML = '<div id="cnObj"></div>';
  panel.append(s);
  const i = CN.findIndex((c) => c.id === 'tableaux');
  CN.splice(i + 1, 0, { id: 'objets', t: 'Objets d’époque', ic: GAME_ICO.objet });
  const cc = cnCount;
  cnCount = function (id) { if (id === 'objets') { const all = OBJ_G(); return all.filter(isDone).length + ' sur ' + all.length; } return cc(id); };
  const cg = cnGo;
  cnGo = function (id) {
    cg(id);
    if (id !== 'objets') return;
    const host = byId('cnObj');
    host.replaceChildren(el('p', 'cn-lead45', 'Les objets de ' + YEAR + ' croisés en lisant : comment ils marchaient, et ce qui les a remplacés.'));
    const ps = pendSection('objets', 'Objets à découvrir');
    if (ps) host.append(ps);
    ROOM_FILL.objets(host);
  };
}

// crochets de test
window.__v54 = { OBJ_G, OBJ_ART, catPool: (id) => catPool(id) };

/* ================= Version 55 =================
   Chapitres IV et V de Bel-Ami : trois nouveaux objets d'époque à dessiner (la carte de visite, le petit bleu, le fer à friser). */
Object.assign(OBJ_ART, {
  carte_visite: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M22 34l84-14 10 56-84 14z" class="ob-faint"/><path d="M34 26h90l12 12v50H34z"/><path d="M124 26v12h12"/><path d="M52 52h56" class="ob-thick"/><path d="M60 64h40"/><path d="M98 78h26M44 78h20" class="ob-faint"/></svg>',
  petit_bleu: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M10 26h70v52H10z" class="ob-blue"/><path d="M10 26l35 26 35-26" /><path d="M60 32h14v14H60z"/><path d="M14 72h62" class="ob-faint"/><path d="M90 42h66M90 70h66"/><path d="M90 38v36M156 38v36" class="ob-faint"/><rect x="108" y="48" width="34" height="16" rx="8"/><path d="M116 48v16M134 48v16" class="ob-faint"/><path d="M94 52h8M96 60h8" class="ob-faint"/></svg>',
  fer_a_friser: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M70 50l52-8M70 55l52-5"/><path d="M122 42c4 0 5 8 0 8"/><circle cx="70" cy="52" r="3.5"/><path d="M66 49L42 40M66 56L42 64"/><path d="M42 40L14 30M42 64L14 74" class="ob-thick"/><path d="M114 58c-8 8-9 15-2 19 8-4 8-11 2-19z" class="ob-flame"/><path d="M114 66c-3 3-3 6 0 8 3-2 3-5 0-8z" class="ob-flame2"/><path d="M112 78v4"/><path d="M100 82h28l6 12H94z"/><path d="M94 94h40" class="ob-faint"/></svg>'
});
window.__v55 = { OBJ_ART };

/* ================= Version 56 =================
   Le grand ménage avant la mise en ligne (diagnostic du 29 octobre 2026, validé par Guillaume :
   « garde les émotions sur les portraits, garde le Carnet en haut et son compteur qui grandit ; le reste, je te fais confiance »).
   – plus de points, de niveaux, de défis de fin de chapitre, de mode Rapide ;
   – pendant la lecture : plus de colonne de pastilles ni de coffres, plus de messages ; le compteur du Carnet monte ;
     le texte reprend toute la largeur sur téléphone ; la carte « Nouveau personnage » seulement pour les personnages
     qui ont un portrait, 3 s, sans flou ; plus de petites animations dans la marge ;
   – fin d'épisode : 3 écrans au plus (2 ou 3 cartes + le petit quiz) ; le reste attend dans Découvertes ;
   – un seul rangement : le musée de Découvertes ; le Carnet ouvre les cartes en attente ;
   – Aa : six réglages ; « Revenir au début » et « Remettre à zéro » sur la page du livre, avec les marque-pages ;
   – textes d'aide réécrits. */

// ---------- 1. Réglages fixés (ils ne sont plus proposés) ----------
S.zen = true;            // masquer les commandes pendant la lecture
S.flow = true;           // mode « dans le flux »
S.defi = false;          // plus de défi de fin de chapitre
S.awake = true;          // écran allumé pendant la lecture
S.gmode = 'lire';        // les pastilles montent au Carnet pendant la lecture (le compteur grandit)
S.cue = 1;               // pause normale quand la voix change
if (S.read === 'rsvp') S.read = 'page';
persist();

// ---------- 2. Pendant la lecture : rien ne bouge autour du texte ----------
cornerCard = function () { return null; };   // plus de messages en haut (phrase culte, 1 000 mots, jurons…)
milestone = function () { };
// les phrases cultes et les jurons se rangent sans voler jusqu'à un coffre
ghostFly = function (text, from, chestSel, isJuron, done) { done(); };
chestToCarnet = function () { carnetGlow(); paintBadge(); badgePop(); };
// une pastille ne s'affiche plus : le compteur du Carnet monte, avec un petit rebond
flyPastille = function () { carnetGlow(); paintBadge(); badgePop(); };
// la carte « Nouveau personnage » : seulement pour ceux qui ont un portrait
{
  const mc = meetCharacter;
  meetCharacter = function (id, j) {
    const c = CAST[id];
    if (!c || !c.pf || !PF[c.pf]) { S.met.push(id); persist(); castBuilt = false; return; }
    return mc(id, j);
  };
}
// les figurants sans portrait : leur nom seul, sans rond avec une initiale
{
  const fp = fillPortrait;
  fillPortrait = function (wrap, id) {
    fp(wrap, id);
    const c = CAST[id];
    wrap.classList.toggle('noimg', !(c && c.pf && PF[c.pf]));
  };
}
// la consigne « Touche deux fois un mot… » : seulement les trois premières pauses
{
  const p0 = pause;
  pause = function () {
    const r = p0.apply(this, arguments);
    if (!byId('reader').hidden) {
      S.tip56 = (S.tip56 || 0) + 1;
      if (S.tip56 > 3) document.documentElement.classList.add('tip56');
    }
    return r;
  };
  if ((S.tip56 || 0) > 3) document.documentElement.classList.add('tip56');
}

// ---------- 3. Plus de points dans les réponses ----------
const noPts56 = (s) => String(s || '')
  .replace(/\s*·\s*[+−-]\s*\d[\d\s ]*points?/g, '')
  .replace(/\s*[+−-]\s*\d[\d\s ]*points?/g, '')
  .trim();
{
  const gf = gameFeedback;
  gameFeedback = function (good, head, text, share) {
    return gf(good, noPts56(head), text, share);
  };
}

// ---------- 4. Le bandeau de fin d'épisode, épuré ----------
{
  const fe = fillEnd;
  fillEnd = function (box, info, isLast) {
    fe(box, info, isLast);
    // les points, les niveaux, l'objectif, les encouragements
    $$('.ee-total, .ee-note, .ee-defi', box).forEach((x) => x.remove());
    $$('small, span', box).forEach((x) => { if (!x.children.length && /^\s*[+−-]?\s*\d[\d\s ]*points?\s*$/.test(x.textContent)) x.remove(); });
    $$('.ee-cheer', box).forEach((x) => { if (!x.classList.contains('big')) x.remove(); });
    // les mots lus seulement (plus de bonus)
    $$('.ee-gains', box).forEach((g) => {
      const kids = [...g.children];
      const first = kids.find((x) => !x.classList.contains('sep'));
      kids.forEach((x) => { if (x !== first) x.remove(); });
    });
    // « Rien encore sur 1885 » : la ligne n'apparaît que s'il y a quelque chose
    $$('*', box).forEach((x) => {
      if (x.children.length <= 2 && /^\s*Rien encore sur/.test(x.textContent || '')) {
        const line = x.closest('.ee-learn, .ee-l43, [style*="--i"]') || x;
        if (line !== box && !line.querySelector('button')) line.remove();
      }
    });
    if (isLast) {
      $$('.ee-sum', box).forEach((x) => { if (/points|niveau/.test(x.textContent)) x.remove(); });
      $$('.ee-act .btn', box).forEach((b) => { if (/progrès/i.test(b.textContent)) b.textContent = 'Voir mes découvertes'; });
    }
  };
}

// ---------- 5. Le Carnet : il ouvre les cartes en attente (le rangement, c'est le musée) ----------
{
  const oc = openCarnet;
  openCarnet = function (tab) {
    if (byId('reader').hidden) { showHome('progres'); return; }
    if (!atEnd50() && !cnForce50) return oc(tab);       // pendant la lecture : « Ton Carnet s'ouvre à la fin de l'épisode »
    const all65 = pendingAll().sort((a, b) => a.j - b.j), e65 = EPI[Math.min(k, N - 1)];
    const mine65 = all65.filter((g) => EPI[g.j] === e65);
    const keys = mine65.concat(all65.filter((g) => !mine65.includes(g)).slice(0, Math.max(0, 3 - mine65.length))).map((g) => g.key);
    if (keys.length) openTrove(keys, { from: 'reader' });
    else toast('Tout est rangé : retrouve tes curiosités dans Découvertes');
  };
}

// ---------- 6. Réglages (Aa) : six réglages ----------
{
  const panel = $('#settingsSheet .panel');
  const rowOf = (sel) => { const e = $(sel); return e ? (e.closest('.check') || e.closest('.row') || e) : null; };
  ['#optZen', '#optFlow', '#optDefi', '#optAmb', '#optSound', '#optVibe', '#awake', '.gmseg', '[data-cue="1"]'].forEach((sel) => { const r = rowOf(sel); if (r) r.hidden = true; });
  $$('[data-read="rsvp"]').forEach((b) => { b.hidden = true; });
  // l'ordre : vitesse, taille, mode, apparence, voix, enchaînement
  const order = [rowOf('#wpm'), rowOf('#size'), rowOf('#readLab'), rowOf('#themeLab'), rowOf('#palLab'), rowOf('#voiceSel'), rowOf('#optVcast'), rowOf('#optAuto')].filter(Boolean);
  const checks = $('.checks', panel);
  order.forEach((r) => panel.append(r));
  if (checks && !checks.querySelector('.check:not([hidden])')) checks.hidden = true;
  const ml = byId('readLab'); if (ml) ml.textContent = 'Mode de lecture';
  const tl = byId('themeLab'); if (tl) tl.textContent = 'Apparence';
  // la taille du texte : un pourcentage, pas une position de curseur
  const sizeTxt = () => { const o = byId('sizeOut'); if (o) o.textContent = Math.round(S.size / 50 * 100) + ' %'; };
  const ss = syncSettings;
  syncSettings = function () { const r = ss.apply(this, arguments); sizeTxt(); return r; };
  byId('size').addEventListener('input', () => setTimeout(sizeTxt, 0));
}

// ---------- 7. La page du livre : mode d'emploi court, marque-pages, actions ----------
{
  const act = el('div', 'bp-act56');
  act.append(byId('toStart'), byId('resetBtn'));
  const bm = el('section', 'bm56'); bm.id = 'bm56';
  const cred = byId('bpCredits');
  cred.before(bm, act);
  const rc = refreshCover;
  refreshCover = function () {
    const r = rc.apply(this, arguments);
    byId('bpFacts').textContent = EPS.length + ' épisodes · ' + minutes(spanMs(0, N - 1)) + ' à ta vitesse';
    byId('how').hidden = false;
    $$('#how > li').forEach((li) => { if (/^\s*En chemin/.test(li.textContent)) li.remove(); });   // ancien texte (v43)
    act.hidden = !hasStarted();
    const list = S.marks.filter((m) => m.s < SENT.length).sort((a, b) => a.s - b.s);
    bm.hidden = !list.length;
    if (list.length) {
      const ul = el('ul', 'hearts');
      list.forEach((m) => ul.append(sentLi(m.s, where(SENT[m.s]), [
        smallBtn('Retirer', () => { S.marks = S.marks.filter((x) => x !== m); persist(); paintMarks(); paintBm(); refreshCover(); }),
        smallBtn('Lire ici', () => goRead(SENT[m.s]))
      ])));
      bm.replaceChildren(el('p', 'eyebrow', list.length > 1 ? 'Tes marque-pages' : 'Ton marque-page'), ul);
    }
    return r;
  };
}

// ---------- 8. Découvertes : un seul quiz (le Flash quiz) ----------
// les boutons « Quiz » de chaque salle et les points sont cachés (styles v56) ;
// les salles restent le seul endroit où l'on range ce qu'on a découvert.

// ---------- 9. La bibliothèque : les deux livres du bac d'abord ----------
{
  const pri = { belami: 0, therese: 1, potbouille: 2 };
  if (Array.isArray(BOOKS)) BOOKS.sort((a, b) => (pri[a.id] ?? 9) - (pri[b.id] ?? 9));
}

// crochets de test
window.__v56 = { noPts56, rowsShown: () => $$('#settingsSheet .panel > .row:not([hidden]), #settingsSheet .panel > .check:not([hidden])').length };

/* ================= Version 57 =================
   Demandé par Guillaume :
   – dans Découvertes, le bandeau « Carnet des curiosités · N cartes à découvrir » se replie ;
   – les cartes y sont classées par catégorie (les mêmes salles que le musée) ;
   – dans chaque salle, on peut lancer un Flash quiz sur cette salle seulement. */

// ---------- 1. Les catégories des cartes en attente ----------
const CAT57 = [
  { id: 'tableaux', f: (g) => g.kind === 'tableau' },
  { id: 'celebres', f: (g) => g.kind === 'histoire' },
  { id: 'anecdotes', f: (g) => g.kind === 'savoir' || g.kind === 'prix' || g.kind === 'curseur' || g.kind === 'existait' },
  { id: 'mots', f: (g) => g.kind === 'etymo' || g.kind === 'sens' },
  { id: 'objets', f: (g) => g.kind === 'objet' },
  { id: 'lieux', f: (g) => g.kind === 'lieu' },
  { id: 'quiz', f: (g) => BANDK(g), t: 'Quiz des épisodes', ic: ICO_BOLT47 }
];
function cat57(g) { const c = CAT57.find((c) => c.f(g)); return c ? c.id : 'anecdotes'; }
const CHEV57 = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const open57 = new Set();          // catégories dépliées (le temps de la visite)
function pendRow57(g) {
  const b = el('button', 'm48-it' + (BANDK(g) ? ' quiz' : '')); b.type = 'button';
  const tx = el('span', 'm48-t');
  tx.append(el('b', '', BANDK(g) ? QLAB48[g.kind] : pendTitle(g)), el('small', '', BANDK(g) ? 'Épisode ' + (EPS[g.e].i + 1) + ' · quiz' : where(g.j)));
  b.append(itemIcon(g), tx, el('span', 'm48-go', FREE(g) ? 'Voir' : 'Jouer'));
  b.addEventListener('click', () => openTrove([g.key], { from: 'home' }));
  return b;
}
function catGroups57(all) {
  const by = {};
  all.forEach((g) => { (by[cat57(g)] = by[cat57(g)] || []).push(g); });
  return CAT57.filter((c) => by[c.id]).map((c) => {
    const r = roomOf(c.id);
    return { id: c.id, t: c.t || (r ? r.t : c.id), ic: c.ic || (r ? r.ic : ''), list: by[c.id] };
  });
}
function catBlock57(grp) {
  const box = el('div', 'hc57-cat' + (open57.has(grp.id) ? ' open' : ''));
  box.dataset.cat = grp.id;
  const h = el('button', 'hc57-ch'); h.type = 'button';
  h.setAttribute('aria-expanded', open57.has(grp.id) ? 'true' : 'false');
  const ic = el('span', 'hc57-ic'); ic.innerHTML = grp.ic;
  const tt = el('span', 'hc57-tt'); tt.append(el('b', '', grp.t));
  const n = el('span', 'hc57-n', String(grp.list.length));
  n.setAttribute('aria-label', grp.id === 'quiz' ? nb(grp.list.length, 'quiz', 'quiz') : nb(grp.list.length, 'carte', 'cartes'));
  const cv = el('span', 'hc57-cv'); cv.innerHTML = CHEV57;
  h.append(ic, tt, n, cv);
  const body = el('div', 'hc57-body');
  if (grp.list.length > 1) {
    const all = el('button', 'hc57-all', 'Tout découvrir dans « ' + grp.t + ' »'); all.type = 'button';
    all.addEventListener('click', () => openTrove(grp.list.map((g) => g.key), { from: 'home' }));
    body.append(all);
  }
  grp.list.forEach((g) => body.append(pendRow57(g)));
  h.addEventListener('click', () => {
    const on = !open57.has(grp.id);
    if (on) open57.add(grp.id); else open57.delete(grp.id);
    box.classList.toggle('open', on);
    h.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  box.append(h, body);
  return box;
}

// ---------- 2. Le bandeau du Carnet, repliable et classé ----------
{
  const hc = homeCarnetCard;
  homeCarnetCard = function () {
    const card = hc();
    const { pieces, quiz } = homePending();
    const all = pieces.concat(quiz);
    if (!all.length) return card;
    // la liste : remplacée par les catégories
    const old = $('.hc-list', card);
    const cats = el('div', 'hc57-cats');
    catGroups57(all).forEach((grp) => cats.append(catBlock57(grp)));
    if (old) old.replaceWith(cats); else card.append(cats);
    // replier / déplier : on touche l'en-tête
    const top = $('.hc-top', card);
    const fold = el('button', 'hc57-fold'); fold.type = 'button';
    fold.innerHTML = CHEV57;
    top.append(fold);
    top.classList.add('hc57-top');
    const set = (folded) => {
      card.classList.toggle('folded', folded);
      fold.setAttribute('aria-expanded', folded ? 'false' : 'true');
      fold.setAttribute('aria-label', folded ? 'Déplier le Carnet des curiosités' : 'Replier le Carnet des curiosités');
    };
    set(!!S.hcFold);
    top.addEventListener('click', () => { S.hcFold = !S.hcFold; persist(); set(S.hcFold); });
    return card;
  };
}

// ---------- 3. Un Flash quiz par salle ----------
{
  const ofc = openFlashCat;
  openFlashCat = function (id) {
    const r = ofc.apply(this, arguments);
    if (FL && FL.cat === id) $('#flashSheet .fl-head .eyebrow').textContent = 'Flash quiz de la salle';
    return r;
  };
  const rm = renderMusee;
  renderMusee = function () {
    rm();
    const go = $('#musee .room-quiz47');
    if (!go) return;
    const r = roomCur && roomOf(roomCur);
    const b = $('.rq-t b', go); if (b && r) b.textContent = 'Flash quiz : ' + r.t;
    go.setAttribute('aria-label', 'Lancer le Flash quiz de la salle ' + (r ? r.t : ''));
  };
}

// crochets de test
window.__v57 = { CAT57, cat57, catGroups57, open57, homeCarnetCard: () => homeCarnetCard(), openFlashCat: (id) => openFlashCat(id), catPool: (id) => catPool(id), get FL() { return FL; } };

/* ================= Version 58 =================
   Bel-Ami, lot A : la Première partie complète (chapitres VI à VIII, épisodes 64 à 103).
   Trois nouveaux objets d'époque à dessiner : le bilboquet, la boîte de pistolets de duel, le timbre électrique. */
Object.assign(OBJ_ART, {
  bilboquet: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M48 52v38" class="ob-thick"/><path d="M48 52V20"/><path d="M45 26l3-8 3 8"/><path d="M34 90c0 7 28 7 28 0z"/><path d="M52 70c22 8 44 2 54-14" class="ob-faint"/><circle cx="114" cy="42" r="16"/><circle cx="108" cy="36" r="3"/><path d="M98 50c4 4 10 6 16 6" class="ob-faint"/></svg>',
  pistolets_duel: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M14 38l12-26h108l12 26" class="ob-faint"/><path d="M14 38h132v56H14z"/><path d="M26 54h64" class="ob-thick"/><path d="M90 50h12v8H90z"/><path d="M102 54c5 2 8 8 9 14" class="ob-thick"/><path d="M93 58c0 5 5 7 8 4"/><path d="M26 78h64" class="ob-thick"/><path d="M90 74h12v8H90z"/><path d="M102 78c5 2 8 7 9 12" class="ob-thick"/><path d="M93 82c0 5 5 7 8 4"/><circle cx="128" cy="62" r="6" class="ob-faint"/><path d="M122 84h14" class="ob-faint"/></svg>',
  sonnette: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M60 72a22 22 0 0 1 44 0z"/><path d="M54 72h56"/><path d="M82 50v-6"/><path d="M118 34l-20 24" class="ob-thick"/><circle cx="96" cy="60" r="4"/><path d="M118 34l10-6"/><path d="M8 66h30v22H8z" class="ob-blue"/><path d="M16 66v-4M30 66v-4"/><path d="M38 76h22c6 0 8-4 8-8" class="ob-faint"/><path d="M128 28c10 0 18 4 18 12v38" class="ob-faint"/><circle cx="146" cy="84" r="6"/><circle cx="146" cy="84" r="2.5" class="ob-faint"/></svg>'
});
window.__v58 = { OBJ_ART };

/* ================= Version 59 =================
   Bel-Ami, lot B : Deuxième partie, chapitres I à III (épisodes 104 à 138).
   Les chapitres savent à quelle partie ils appartiennent ; « Duroy » devient « Du Roy » à l'épisode 119 (BOOK.renoms) ;
   trois nouveaux objets d'époque : le quinquet, la chancelière, le fleuret. */
Object.assign(OBJ_ART, {
  quinquet: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M50 40v52" class="ob-thick"/><path d="M34 92h32"/><path d="M40 16h20v24H40z"/><path d="M44 16v-4h12v4" class="ob-faint"/><path d="M60 32h38" class="ob-thick"/><path d="M98 30v16h10V30z"/><path d="M96 46h14"/><path d="M99 46c-3-10 1-16 1-28h6c0 12 4 18 1 28" class="ob-faint"/><path d="M103 40c-3-4-3-9 0-14c3 5 3 10 0 14z" class="ob-flame"/><path d="M118 20l8-4M120 30h9M118 40l8 4" class="ob-faint"/></svg>',
  chanceliere: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M28 46c0-10 104-10 104 0v40c0 6-104 6-104 0z"/><path d="M48 46c0-12 64-12 64 0c0 9-64 9-64 0z" class="ob-thick"/><path d="M52 40l-4-6M62 36l-2-7M74 35v-7M86 35v-7M98 36l2-7M108 40l4-6" class="ob-faint"/><path d="M36 60c4 3 8 3 12 0M56 64c4 3 8 3 12 0M76 60c4 3 8 3 12 0M96 64c4 3 8 3 12 0M116 60c4 3 8 3 12 0" class="ob-faint"/><path d="M40 78c4 3 8 3 12 0M64 80c4 3 8 3 12 0M88 80c4 3 8 3 12 0M110 78c4 3 8 3 12 0" class="ob-faint"/></svg>',
  fleuret: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M44 66L146 16"/><circle cx="148" cy="15" r="3.5" class="ob-thick"/><path d="M32 58c9-6 20 5 14 14c-9 6-20-5-14-14z" class="ob-thick"/><path d="M37 70L20 82" class="ob-thick"/><circle cx="17" cy="84" r="4"/><path d="M40 30L124 82" class="ob-faint"/><circle cx="126" cy="83.5" r="3" class="ob-faint"/></svg>'
});
window.__v59 = { OBJ_ART, CHAPS, shortName, chapLab, chapLabel, RENOMS, dictLookup };

syncNames(); setInterval(syncNames, 1500);

/* ================= Version 60 =================
   Bel-Ami, lot C : Deuxième partie, chapitres IV à VII (épisodes 139 à 173).
   Deux nouveaux objets d'époque à dessiner : le prie-Dieu et le chronomètre. */
Object.assign(OBJ_ART, {
  prie_dieu: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M58 92V30" class="ob-thick"/><path d="M102 92V30" class="ob-thick"/><path d="M50 30l8-10h44l8 10z"/><path d="M54 30h52" class="ob-thick"/><path d="M58 52h44" class="ob-faint"/><path d="M40 78h80v8H40z"/><path d="M44 86v6M116 86v6"/><path d="M66 22c4-8 24-8 28 0" class="ob-faint"/><path d="M78 40h4M80 37v8" class="ob-faint"/></svg>',
  chronometre: '<svg viewBox="0 0 160 100" aria-hidden="true"><circle cx="80" cy="56" r="34" class="ob-thick"/><circle cx="80" cy="56" r="28"/><path d="M74 14h12v8H74z"/><path d="M80 14V8" class="ob-thick"/><circle cx="80" cy="6" r="3"/><path d="M80 56V34" class="ob-thick"/><path d="M80 56l14 8"/><circle cx="80" cy="56" r="2.5"/><path d="M80 30v4M80 78v4M54 56h4M102 56h4" class="ob-faint"/><circle cx="80" cy="70" r="7" class="ob-faint"/><path d="M80 70l3-5" class="ob-faint"/></svg>'
});
window.__v60 = { OBJ_ART };

/* ================= Version 61 =================
   Bel-Ami, lot D : Deuxième partie, chapitres VIII à X (épisodes 174 à 194) — le roman est complet.
   Deux nouveaux objets d'époque à dessiner : le landau et la pendule de cheminée. */
Object.assign(OBJ_ART, {
  landau: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M30 64h96c4 0 6-3 6-7V50H24v7c0 4 2 7 6 7z"/><path d="M30 50c0-14 8-22 20-24l8 24" class="ob-thick"/><path d="M128 50c0-14-8-22-20-24l-8 24" class="ob-thick"/><path d="M40 36l10 14M118 36l-10 14" class="ob-faint"/><path d="M78 50v14" class="ob-faint"/><circle cx="44" cy="76" r="14"/><circle cx="44" cy="76" r="2.5"/><path d="M44 62v28M30 76h28" class="ob-faint"/><circle cx="116" cy="78" r="11"/><circle cx="116" cy="78" r="2.5"/><path d="M116 67v22M105 78h22" class="ob-faint"/><path d="M132 52h18l6-6" class="ob-faint"/></svg>',
  pendule: '<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M50 30h60v60H50z"/><path d="M42 90h76" class="ob-thick"/><circle cx="80" cy="50" r="14"/><path d="M80 50v-9M80 50l6 4"/><path d="M80 64v14" class="ob-faint"/><circle cx="80" cy="81" r="4" class="ob-faint"/><path d="M64 30c0-10 6-14 10-14c-2-6 2-10 6-10s8 4 6 10c4 0 10 4 10 14" class="ob-thick"/><path d="M50 30l-4-4M110 30l4-4" class="ob-faint"/></svg>'
});
window.__v61 = { OBJ_ART };

/* ================= Version 62 =================
   – lecture fluide : le ruban et le fond du paragraphe vivent dans un calque à part (calque contenu),
     et le ruban s'allonge par une transformation au lieu de changer de largeur : le texte entier
     (194 épisodes) n'est plus remis en page à chaque image ;
   – plus de tintement quand une carte arrive dans le Carnet ;
   – les cartes trouvées se voient dans le texte : le mot est surligné de la couleur de sa famille,
     avec une petite étoile de la même couleur dans la marge de gauche (comme les phrases cultes, en or) ;
   – « pièces » devient « cartes » ;
   – la liste des épisodes de la page du livre se range par chapitre, qu'on déplie ou replie. */

// ---------- 1. Le calque du surlignement ----------
var hlLay = null;
function hlLayer() {
  if (!hlLay || !hlLay.isConnected) { hlLay = el('div', 'hl-layer'); hlLay.setAttribute('aria-hidden', 'true'); pvIn.prepend(hlLay); }
  return hlLay;
}
function hlScale(h, s) {
  s = Math.max(0, Math.min(1, s));
  h._sx = s;
  h.style.transform = (h._tr || 'translate(0px,0px)') + ' scaleX(' + s.toFixed(4) + ')';
  h.style.setProperty('--isx', (1 / Math.max(s, .02)).toFixed(3));
}
// le fond du paragraphe rejoint le calque
paraEl = el('div', 'pv-para'); paraEl.setAttribute('aria-hidden', 'true');
{
  const ph = paraHL;
  paraHL = function (p) {
    if (paraEl.parentNode !== hlLayer()) hlLayer().prepend(paraEl);
    return ph(p);
  };
}

// le texte se range par épisode, dans des blocs que le navigateur ne met en page et ne dessine
// que près de l'écran (content-visibility). Le rangement se fait juste après la construction de la page,
// avant toute mise en page : l'ouverture ne calcule plus les 194 épisodes.
var VIS62 = new Set(), CV62 = [], pmQ62 = 0;
function cvWrap62() {
  if (pvIn.dataset.cv62 === '1') return;
  pvIn.dataset.cv62 = '1';
  let cur = null;
  Array.from(pvIn.children).forEach((n) => {
    const block = n.tagName === 'P' || n.classList.contains('epend') || n.classList.contains('gmslot');
    if (!block) { cur = null; return; }
    const start = n.classList.contains('tchap') || (n.classList.contains('tep') && !(cur && cur.lastElementChild && cur.lastElementChild.classList.contains('tchap')));
    if (!cur || start) { cur = el('div', 'cvep'); n.before(cur); CV62.push(cur); }
    cur.append(n);
  });
  pvIn.classList.add('cv62');
  cvSize62();
  // les blocs proches de l'écran : seuls leurs repères de marge sont recalculés
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) VIS62.add(e.target); else VIS62.delete(e.target); });
      pmSched62();
    }, { root: pageview, rootMargin: '120% 0px' });
    CV62.forEach((w) => io.observe(w));
  } else CV62.forEach((w) => VIS62.add(w));
  // un bloc change de taille (bandeau qui s'ouvre, bloc dessiné pour la première fois) : les repères se recalent
  if (window.ResizeObserver) { const ro = new ResizeObserver(pmSched62); CV62.forEach((w) => ro.observe(w)); }
}
// hauteur estimée de chaque bloc, d'après son nombre de lettres et de paragraphes,
// réglée sur les deux premiers blocs (vraiment mis en page) ; un bloc dessiné garde ensuite sa vraie hauteur
function cvSize62() {
  if (!CV62.length) return;
  const cs = getComputedStyle(pvIn);
  const fs = parseFloat(cs.fontSize) || 21, lh = parseFloat(cs.lineHeight) || fs * 1.72;
  const colW = Math.max(160, pvIn.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  const est = (w) => {
    if (!w._wt) w._wt = { c: w.textContent.length, b: w.children.length };
    return w._wt.c * fs * .5 / colW * lh + w._wt.b * fs * 1.1;
  };
  let f = 1;
  const real = (w) => {   // hauteur réelle du contenu (le bloc lui-même peut être à sa taille estimée)
    const a = w.firstElementChild, z = w.lastElementChild;
    if (!a || !z) return 0;
    return z.getBoundingClientRect().bottom - a.getBoundingClientRect().top;
  };
  const sample = CV62.slice(0, 3).map((w) => [real(w), est(w)]).filter((x) => x[0] > 50 && x[1] > 50);
  if (sample.length) f = sample.reduce((t, x) => t + x[0], 0) / sample.reduce((t, x) => t + x[1], 0);
  CV62.forEach((w) => { w.style.containIntrinsicBlockSize = 'auto ' + Math.max(40, Math.round(est(w) * f)) + 'px'; });
}
function pmSched62() { if (pmQ62) return; pmQ62 = requestAnimationFrame(() => { pmQ62 = 0; try { positionMarks(); } catch (e) { /* page pas prête */ } }); }
function vis62(s) { const w = s && s.closest('.cvep'); return !w || VIS62.has(w); }
// mode Texte : le mot à la ligne de lecture se cherche d'abord parmi les blocs d'épisode, puis dans le bon bloc
// (sans mettre en page les épisodes lointains)
var VI62 = null;
function rng62(w) {
  if (w._r62) return w._r62;
  const ss = w.querySelectorAll('[data-t]');
  if (!ss.length) return null;
  if (!VI62) { VI62 = new Map(); for (let m = 0; m < N; m++) VI62.set(V[m], m); }
  const a = VI62.get(Number(ss[0].dataset.t)), z = VI62.get(Number(ss[ss.length - 1].dataset.t));
  if (a == null || z == null) return null;
  return (w._r62 = [a, z]);
}
{
  const li = lineIndex;
  lineIndex = function () {
    if (!CV62.length) return li();
    const y = pageview.getBoundingClientRect().top + pageview.clientHeight * RL;
    let a = 0, b = CV62.length - 1;
    while (a < b) { const mid = (a + b) >> 1; if (CV62[mid].getBoundingClientRect().bottom < y) a = mid + 1; else b = mid; }
    let r = null;
    for (let q = a; q < CV62.length && !(r = rng62(CV62[q])); q++);
    if (!r) return li();
    let lo = r[0], hi = r[1];
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      const s = PVS[V[m]];
      if (s && s.getBoundingClientRect().bottom < y) lo = m + 1; else hi = m;
    }
    if (lo === r[1] && PVS[V[lo]] && PVS[V[lo]].getBoundingClientRect().bottom < y) lo = Math.min(N - 1, lo + 1);
    return lo;
  };
}
// les repères de la marge (étoiles, émojis gardés) : seulement ceux des blocs proches de l'écran ;
// les autres attendent, cachés, que leur bloc approche
positionMarks = function () {
  if (!pvBuilt) return;
  const base = pvIn.getBoundingClientRect().top;
  const yOf = (s) => { const r = s.getBoundingClientRect(); return r.top - base + r.height / 2; };
  const put = [];
  if (lgut && lgut.isConnected) {
    lgut.querySelectorAll('.cultemark').forEach((m) => {
      const c = CULTES.find((x) => x.si === Number(m.dataset.si)); const s = c && PVS[V[c.a]];
      if (!s) return;
      if (!vis62(s)) { put.push([m, null]); return; }
      put.push([m, Math.round(yOf(s))]);
    });
  }
  const cards = card62Read(yOf);
  let rx = [];
  if (gut && gut.isConnected) {
    rx = Array.from(gut.children).map((m) => {
      const s = PVS[Number(m.dataset.w)];
      if (!s || !vis62(s)) { put.push([m, null]); return null; }
      return { m, y: yOf(s) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
  }
  // on écrit tout d'un coup, après avoir tout lu
  put.forEach(([m, y]) => { if (y == null) m.style.visibility = 'hidden'; else { m.style.top = y + 'px'; m.style.visibility = ''; } });
  card62Write(cards, put.filter((x) => x[1] != null && x[0].classList.contains('cultemark')).map((x) => x[1]));
  let last = -1e9;
  rx.forEach((o) => { const y = Math.max(o.y, last + 24); o.m.style.top = Math.round(y) + 'px'; o.m.style.visibility = ''; last = y; });
};

// ---------- 2. Les cartes trouvées, en couleur dans le texte ----------
const CARD62 = {
  tableau: 'tab', etymo: 'mot', sens: 'mot', savoir: 'anec', prix: 'anec', curseur: 'anec', existait: 'anec',
  objet: 'obj', lieu: 'lieu', histoire: 'cel'
};
const CARD62_LAB = { tab: 'tableau', mot: 'mot', anec: 'anecdote', obj: 'objet', lieu: 'lieu', cel: 'personnage célèbre', jur: 'gros mot' };
function card62Spans(j, mot) {
  const n = Math.max(1, String(mot || '').trim().split(/\s+/).length);
  const out = [];
  for (let i = 0; i < n; i++) { const s = PVS[V[j + i]]; if (s) out.push(s); }
  return out;
}
function card62Mark(id, c, j, mot, fresh) {
  if (!pvBuilt || j == null || j < 0) return;
  const sp = card62Spans(j, mot);
  if (!sp.length) return;
  sp.forEach((s, i) => {
    s.classList.add('cardw'); s.dataset.cc = c;
    if (i < sp.length - 1) s.classList.add('cardw-in');
    if (fresh && !REDUCED) { s.classList.remove('cardw-new'); void s.offsetWidth; s.classList.add('cardw-new'); s.style.setProperty('--ci', String(i)); }
  });
  const g = leftGut();
  let m = g.querySelector('.cardmark[data-id="' + id + '"]');
  if (!m) { m = el('span', 'cardmark'); m.dataset.id = id; m.dataset.cc = c; m.dataset.w = String(j); m.style.visibility = 'hidden'; g.append(m); }
  if (fresh && !REDUCED) { m.classList.remove('new'); void m.offsetWidth; m.classList.add('new'); }
  card62Place();
}
// hauteur de chaque étoile : le milieu de la ligne du mot ; deux étoiles sur la même ligne se rangent côte à côte
function card62Read(yOf) {
  if (!lgut || !lgut.isConnected) return [];
  return Array.from(lgut.querySelectorAll('.cardmark')).map((m) => {
    const s = PVS[V[Number(m.dataset.w)]];
    if (!s) return null;
    if (!vis62(s)) return { m, y: null };
    return { m, y: Math.round(yOf(s)) };
  }).filter(Boolean);
}
function card62Write(list, stars) {
  const rows = [];
  list.filter((x) => x.y == null).forEach((x) => { x.m.style.visibility = 'hidden'; });
  list.filter((x) => x.y != null).sort((a, b) => a.y - b.y).forEach((x) => {
    const n = stars.filter((y) => Math.abs(y - x.y) < 9).length + rows.filter((y) => Math.abs(y - x.y) < 9).length;
    rows.push(x.y);
    x.m.style.top = x.y + 'px'; x.m.style.visibility = '';
    x.m.style.setProperty('--dx', (n * 13) + 'px');
  });
}
function card62Place() { pmSched62(); }
function card62ForGame(g, fresh) {
  const c = CARD62[g.kind];
  if (!c || !g.x) return;
  card62Mark('g' + g.key, c, g.j, g.x.mot, fresh);
}
function card62Juron(jr, fresh) { if (jr) card62Mark('j' + jr.id, 'jur', jr.j, jr.mot, fresh); }
function card62Apply() {
  if (!pvBuilt) return;
  GAMES.forEach((g) => { if (S.coll && S.coll[g.key] || S.jeux[g.key]) card62ForGame(g, false); });
  JURONS.forEach((jr) => { if (S.jurons.includes(jr.mot)) card62Juron(jr, false); });
}
{
  const co = collect;
  collect = function (key) {
    const was = !!(S.coll[key] || S.jeux[key]);
    const r = co.apply(this, arguments);
    const g = GAMES.find((x) => x.key === key);
    if (g && (S.coll[key] || S.jeux[key])) card62ForGame(g, !was && !$('#reader').hidden);
    return r;
  };
  const cj = captureJuron;
  captureJuron = function (jr) {
    const was = jr && S.jurons.includes(jr.mot);
    const r = cj.apply(this, arguments);
    if (jr && !was && S.jurons.includes(jr.mot)) card62Juron(jr, !$('#reader').hidden);
    return r;
  };
  const ac = applyCultes;
  applyCultes = function () {
    // les étoiles des phrases cultes se posent sans mesurer le livre : positionMarks les place ensuite
    const ly = lineY; lineY = () => 0;
    let r;
    try { r = ac.apply(this, arguments); } finally { lineY = ly; }
    card62Apply();
    pmSched62();
    return r;
  };
}
if (pvBuilt) { cvWrap62(); card62Apply(); pmSched62(); }
// la légende, sur la page du livre
{
  const how = $('#how');
  if (how && !how.querySelector('.how62')) {
    const li = el('li', 'how62');
    li.innerHTML = '<b>Les étoiles de couleur</b>, dans la marge de gauche, montrent les cartes trouvées en lisant : '
      + '<i class="st62" style="--cc:var(--gold)"></i>or pour une phrase culte, <i class="st62" data-cc="jur"></i>rouge pour un gros mot, '
      + '<i class="st62" data-cc="tab"></i>bleu pour un tableau, <i class="st62" data-cc="mot"></i>violet pour un mot, '
      + '<i class="st62" data-cc="anec"></i>vert pour une anecdote, <i class="st62" data-cc="obj"></i>orange pour un objet, '
      + '<i class="st62" data-cc="lieu"></i>turquoise pour un lieu, <i class="st62" data-cc="cel"></i>rose pour un personnage célèbre.';
    const hid = how.querySelector('li[hidden]');
    how.insertBefore(li, hid || null);
  }
}

// ---------- 3. La liste des épisodes, rangée par chapitre ----------
const epOpen62 = new Map();   // chapitre → déplié ou replié (le temps de la visite)
function epGroup62() {
  const list = $('#epList');
  if (!list || list.dataset.g62 === '1') return;
  const items = Array.from(list.children);
  if (!items.some((li) => li.classList.contains('eph'))) return;
  const groups = [];
  let cur = null;
  items.forEach((li) => {
    if (li.classList.contains('eph')) { cur = { t: li.textContent, lis: [] }; groups.push(cur); return; }
    if (!cur) { cur = { t: '', lis: [] }; groups.push(cur); }
    cur.lis.push(li);
  });
  const curG = groups.findIndex((g) => g.lis.some((li) => li.dataset.cur === '1'));
  list.replaceChildren(...groups.map((g, gi) => {
    const li = el('li', 'chg62');
    const d = document.createElement('details');
    const read = g.lis.filter((x) => x.querySelector('.du b')).length;
    const sm = document.createElement('summary');
    const t = el('span', 'cg-t');
    t.append(el('b', '', g.t), el('small', '', nb(g.lis.length, 'épisode', 'épisodes') + (read ? ' · ' + (read === g.lis.length ? 'tout lu' : read + ' lu' + (read > 1 ? 's' : '')) : '')));
    sm.append(t);
    if (read === g.lis.length && read) sm.classList.add('done');
    const ol = document.createElement('ol');
    ol.append(...g.lis);
    d.append(sm, ol);
    d.open = epOpen62.has(gi) ? epOpen62.get(gi) : (curG >= 0 ? gi === curG : gi === 0);
    d.addEventListener('toggle', () => { epOpen62.set(gi, d.open); });
    li.dataset.ci = String(gi);
    li.append(d);
    return li;
  }));
  list.dataset.g62 = '1';
}
{
  const rc = refreshCover;
  refreshCover = function () {
    const l = $('#epList'); if (l) delete l.dataset.g62;
    const r = rc.apply(this, arguments);
    epGroup62();
    return r;
  };
}
epGroup62();

// crochets de test
window.__v62 = { hlLayer, cvWrap62, VIS: VIS62, CV: CV62, rng62, get lineIndex() { return lineIndex; }, card62Apply, card62Place, epGroup62, CARD62, CARD62_LAB, get paraEl() { return paraEl; } };

/* ================= Version 64 =================
   – le trait ne s'arrête plus à la fin de chaque groupe de mots : il avance pendant tout le temps du groupe
     (il ralentit aux points au lieu de s'arrêter), et la page défile sans à-coups ;
   – plus de pauses ni de ralentissements invisibles (pastilles et messages cachés depuis la v56) ;
   – la page se construit par épisode, à la demande : l'épisode en cours d'abord, le reste par petits morceaux
     pendant que l'on lit ; sur les navigateurs sans content-visibility, les épisodes loin de l'écran sont rangés
     (display: none, hauteur gardée) ;
   – Réglages : « Mesurer la fluidité » (10 s de lecture, puis le résultat à l'écran). */

// le défilement : position voulue au centième de pixel (pvF64), défilement entier + décalage du texte (pvO64)
var pvF64 = null, pvO64 = 0, pvV102 = 0;
function pvRst64() { pvF64 = null; if (pvO64) { pvO64 = 0; pvIn.style.transform = ''; } }

// ---------- 1. Plus de pause invisible ----------
beat = function () { };

// ---------- 2. La page, épisode par épisode ----------
var U64 = [], U64ready = false, U64q = [], U64t = 0, dec64 = 0;
var CVOK64 = !!(window.CSS && CSS.supports && CSS.supports('content-visibility', 'auto'));
// le même déroulé que buildPageInto, mais en jetons rangés par épisode
function plan64() {
  const toks = [];
  let epn = 0, part = '', loc = 0, slotted = false;
  BLOCKS.forEach((bl, bi) => {
    if (bl.t === 'part') { part = bl.text; return; }
    if (bl.t === 'chap') { if (epn > 0 && !slotted) { toks.push({ t: 'end', e: epn - 1 }); slotted = true; } loc = 0; toks.push({ t: 'chap', text: (part ? part + ' · ' : '') + bl.text }); return; }
    if (bl.t === 'ep') {
      if (epn > 0 && !slotted) toks.push({ t: 'end', e: epn - 1 });
      slotted = false; epn++; loc++;
      toks.push({ t: 'tep', text: 'Épisode ' + loc + ' · ' + bl.title });
      return;
    }
    if (bl.t === 'break') { toks.push({ t: 'brk' }); return; }
    (SEGS.get(bi) || []).forEach((sg) => toks.push({ t: 'seg', sg, epn }));
  });
  if (epn > 0) toks.push({ t: 'end', e: epn - 1 });
  const units = [];
  let cur = null, prev = null;
  toks.forEach((tk) => {
    const start = tk.t === 'chap' || (tk.t === 'tep' && !(prev && prev.t === 'chap'));
    if (!cur || start) { cur = { toks: [], tmin: Infinity, tmax: -1, c: 0, b: 0, eps: [], built: false }; units.push(cur); }
    cur.toks.push(tk); cur.b++;
    if (tk.t === 'seg') {
      const sg = tk.sg, rg = [];
      sg.parts.forEach((pt) => rg.push([pt.a, pt.z]));
      (sg.tail || []).forEach((i) => rg.push([i, i + 1]));
      if (sg.att) rg.push([sg.att[0], sg.att[1]]);
      rg.forEach(([a, z]) => { if (z > a) { cur.tmin = Math.min(cur.tmin, a); cur.tmax = Math.max(cur.tmax, z - 1); for (let i = a; i < z; i++) cur.c += T[i].t.length + 1; } });
    } else if (tk.t === 'end') cur.eps.push(tk.e);
    else if (tk.text) cur.c += tk.text.length;
    prev = tk;
  });
  let lastMax = -1;
  units.forEach((u) => { if (u.tmax < 0) { u.tmax = lastMax; u.tmin = lastMax; } lastMax = u.tmax; });
  return units;
}
const tpl64 = document.createElement('template');
const esc64 = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function words64(holder, a, z, space) {
  if (z <= a) return space;
  let h = '';
  for (let i = a; i < z; i++) {
    if (space && !(T[i].hide && /^[,.)…]/.test(T[i].t))) h += ' ';
    h += '<span data-t="' + i + '">' + esc64(T[i].t) + '</span>';
    space = true;
  }
  tpl64.innerHTML = h;
  const c = tpl64.content.children;
  for (let q = 0; q < c.length; q++) PVS[a + q] = c[q];
  holder.append(tpl64.content);
  return space;
}
function seg64(frag, sg, epn) {
  if (sg.kind === 'n') {
    const p = document.createElement('p');
    let sp = false;
    sg.parts.forEach((pt) => { sp = words64(p, pt.a, pt.z, sp); });
    frag.append(p);
    return;
  }
  const p = el('p', 'dlg' + (sg.th ? ' th' : '') + (sg.v ? ' v-' + sg.v : ''));
  p.style.setProperty('--spk', colorVar(sg.sp));
  p.append(portrait(sg.sp, 'dpf'));
  const nm = el('span', 'dname', shortName(sg.sp, epn - 1));
  if (sg.th) nm.append(el('i', '', ' · pense'));
  else if (sg.v === 'bas') nm.append(el('i', '', ' · à voix basse'));
  p.append(nm);
  const tx = el('span', 'dtx');
  let sp = false;
  if (sg.open) { tx.append(el('span', 'dq', sg.open)); sp = true; }
  sg.parts.forEach((pt) => {
    const h = el('span', pt.k === 's' ? 's' + (pt.th ? ' th' : '') : 'i');
    if (sp) tx.append(' ');
    tx.append(h);
    words64(h, pt.a, pt.z, false);
    sp = true;
  });
  if (sg.close) tx.append(' ', el('span', 'dq', sg.close));
  sg.tail.forEach((i) => words64(tx, i, i + 1, true));
  if (sg.att) { const at = el('span', 'att'); tx.append(' ', at); words64(at, sg.att[0], sg.att[1], false); }
  p.append(tx);
  frag.append(p);
}
function build64(u) {
  if (!u || u.built) return;
  u.built = true;
  const frag = document.createDocumentFragment();
  u.toks.forEach((tk) => {
    if (tk.t === 'end') frag.append(endSlotEl(tk.e));
    else if (tk.t === 'chap') frag.append(el('p', 'tchap', tk.text));
    else if (tk.t === 'tep') frag.append(el('p', 'tep', tk.text));
    else if (tk.t === 'brk') frag.append(el('p', 'tbrk', '***'));
    else seg64(frag, tk.sg, tk.epn);
  });
  const near = VIS62.has(u.w);
  if (CVOK64) { u.w.style.containIntrinsicBlockSize = 'auto ' + u.h + 'px'; u.w.style.height = ''; }
  else if (!near) u.w.classList.add('far64');           // bloc rangé : il garde sa hauteur, sans mise en page
  else u.w.style.height = '';
  u.w.append(frag);
  if (U64ready || !pvBuilt) return;
  clearTimeout(dec64); dec64 = setTimeout(decorate64, 80);
}
function decorate64() { if (!pvBuilt) return; try { applyMarks(); applyCultes(); applyEmos(); } catch (e) { /* rien */ } }
// l'épisode d'un mot (indice de lecture j)
function unit64(j) {
  if (!U64.length) return -1;
  const t = V[Math.max(0, Math.min(N - 1, j))];
  let a = 0, b = U64.length - 1;
  while (a < b) { const m = (a + b) >> 1; if (U64[m].tmax < t) a = m + 1; else b = m; }
  return a;
}
function ensure64(j) {
  const u = unit64(j);
  if (u < 0) return;
  [u, u + 1, u - 1].forEach((i) => { const x = U64[i]; if (!x) return; build64(x); if (x.w.classList.contains('far64')) { x.w.classList.remove('far64'); x.w.style.height = ''; } });
}
function est64() {
  const cs = getComputedStyle(pvIn);
  const fs = parseFloat(cs.fontSize) || 21, lh = parseFloat(cs.lineHeight) || fs * 1.72;
  const colW = Math.max(160, pvIn.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  return (u) => u.c * fs * .5 / colW * lh + u.b * fs * 1.1;
}
const bpi64 = buildPageInto;
buildPageInto = function (root, map) {
  if (root !== pvIn || map !== PVS) return bpi64(root, map);
  U64 = plan64();
  const frag = document.createDocumentFragment();
  U64.forEach((u, i) => { u.i = i; u.w = el('div', 'cvep'); u.w._u64 = u; frag.append(u.w); });
  root.append(frag);
  CV62.length = 0; U64.forEach((u) => CV62.push(u.w));
  pvIn.dataset.cv62 = '1'; pvIn.classList.add('cv62');
  let est = est64();
  U64.forEach((u) => { u.h = Math.max(40, Math.round(est(u))); u.w.style.height = u.h + 'px'; });
  // l'épisode en cours et ses voisins tout de suite, mesurés pour régler l'estimation des autres
  const cu = Math.max(0, unit64(k));
  const now = [cu, cu + 1, cu - 1].map((i) => U64[i]).filter(Boolean);
  now.forEach((u) => { build64(u); u.w.style.height = ''; u.w.classList.remove('far64'); });
  const real = (u) => { const a = u.w.firstElementChild, z = u.w.lastElementChild; return a && z ? z.getBoundingClientRect().bottom - a.getBoundingClientRect().top : 0; };
  const smp = now.map((u) => [real(u), est(u)]).filter((x) => x[0] > 50 && x[1] > 50);
  const f = smp.length ? smp.reduce((t, x) => t + x[0], 0) / smp.reduce((t, x) => t + x[1], 0) : 1;
  U64.forEach((u) => {
    u.h = Math.max(40, Math.round(est(u) * f));
    if (!u.built) u.w.style.height = u.h + 'px';
    else if (CVOK64) u.w.style.containIntrinsicBlockSize = 'auto ' + u.h + 'px';
  });
  obs64();
  // le reste, du plus proche au plus lointain, par petits morceaux
  U64q = U64.filter((u) => !u.built).sort((a, b) => Math.abs(a.i - cu) - Math.abs(b.i - cu));
  clearTimeout(U64t); U64t = setTimeout(idle64, 300);
};
function idle64() {
  const t0 = performance.now();
  while (U64q.length && performance.now() - t0 < (playing ? 5 : 10)) build64(U64q.shift());
  if (U64q.length) { U64t = setTimeout(idle64, playing ? 60 : 16); return; }
  U64ready = true;
  clearTimeout(dec64);
  decorate64();
}
// blocs proches de l'écran : construits, dessinés ; les autres attendent (et, sans content-visibility, sont rangés)
function obs64() {
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        const u = e.target._u64;
        if (e.isIntersecting) {
          VIS62.add(e.target);
          if (u) { build64(u); if (e.target.classList.contains('far64')) { e.target.classList.remove('far64'); e.target.style.height = ''; } }
        } else {
          VIS62.delete(e.target);
          if (u && u.built && !CVOK64 && !e.target.classList.contains('far64')) {
            const h = e.target.getBoundingClientRect().height;
            if (h > 0) { u.h = Math.round(h); e.target.style.height = u.h + 'px'; }
            e.target.classList.add('far64');
          }
        }
      });
      pmSched62();
    }, { root: pageview, rootMargin: '150% 0px' });
    CV62.forEach((w) => io.observe(w));
  } else CV62.forEach((w) => { VIS62.add(w); if (w._u64) build64(w._u64); });
  if (window.ResizeObserver) { const ro = new ResizeObserver(pmSched62); CV62.forEach((w) => ro.observe(w)); }
}
{
  const rp = renderPage;
  renderPage = function (c) { if (U64.length && CH[c]) ensure64(CH[c].a); return rp.apply(this, arguments); };
  const r0 = rng62;
  rng62 = function (w) { if (w && w._u64) { build64(w._u64); if (w.classList.contains('far64')) { w.classList.remove('far64'); w.style.height = ''; } } return r0(w); };
  const es = endSlot;
  endSlot = function (e) { const u = U64.find((x) => x.eps.includes(e)); if (u) build64(u); return es(e); };
}

// ---------- 3. Mesurer la fluidité, sur le vrai téléphone ----------
function diag64() {
  closeSheets();
  if (byId('reader').hidden) { toast('Ouvre un épisode, puis relance la mesure depuis les réglages'); return; }
  if (!playing) byId('playBtn').click();
  const fr = []; let last = performance.now(), on = true;
  const f = (t) => { if (!on) return; fr.push(t - last); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  toast('Mesure en cours : 10 secondes de lecture…');
  setTimeout(() => {
    on = false;
    const s = fr.slice(3).sort((a, b) => a - b), n = s.length;
    const fps = n ? Math.round(1000 * n / s.reduce((t, x) => t + x, 0)) : 0;
    const bad = s.filter((x) => x > 50).length, worst = n ? Math.round(s[n - 1]) : 0;
    const ua = navigator.userAgent;
    const br = (/CriOS\/(\d+)/.exec(ua) && 'Chrome iOS ' + RegExp.$1) || (/FxiOS\/(\d+)/.exec(ua) && 'Firefox iOS ' + RegExp.$1)
      || (/SamsungBrowser\/(\d+)/.exec(ua) && 'Samsung ' + RegExp.$1) || (/Edg\/(\d+)/.exec(ua) && 'Edge ' + RegExp.$1)
      || (/Chrome\/(\d+)/.exec(ua) && 'Chrome ' + RegExp.$1) || (/Version\/([\d.]+).*Safari/.exec(ua) && 'Safari ' + RegExp.$1)
      || (/Firefox\/(\d+)/.exec(ua) && 'Firefox ' + RegExp.$1) || (/AppleWebKit/.test(ua) ? 'WebKit (application)' : 'autre');
    const os = (/iPhone OS ([\d_]+)/.exec(ua) && 'iOS ' + RegExp.$1.replace(/_/g, '.')) || (/Android ([\d.]+)/.exec(ua) && 'Android ' + RegExp.$1) || (/Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : '');
    const box = el('div', 'diag64');
    box.setAttribute('role', 'dialog');
    box.innerHTML = '<b>Fluidité mesurée</b>'
      + '<span>' + fps + ' images par seconde (idéal : 60)</span>'
      + '<span>' + bad + ' saccades de plus de 50 ms · pire : ' + worst + ' ms</span>'
      + '<span>' + br + (os ? ' · ' + os : '') + ' · ' + (navigator.hardwareConcurrency || '?') + ' cœurs</span>'
      + '<span>Blocs d’épisode : ' + (CVOK64 ? 'oui' : 'non (rangement manuel)') + '</span>'
      + '<small>Fais une capture d’écran et envoie-la à Claude.</small>';
    const x = el('button', 'chip', 'Fermer'); x.type = 'button'; x.addEventListener('click', (ev) => { ev.stopPropagation(); box.remove(); });
    box.append(x);
    document.body.append(box);
    window.__diag64 = { fps, bad, worst, br, os, cv: CVOK64 };
  }, 10000);
}
{
  const a = byId('awake');
  const lab = a && a.closest('label');
  if (lab && !byId('diag64')) {
    const b = el('button', 'chip diag64-go', 'Mesurer la fluidité (10 s de lecture)'); b.type = 'button'; b.id = 'diag64';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); diag64(); });
    lab.after(b);
  }
}
window.__v64 = { get pvF() { return pvF64; }, get tgt() { return pvTarget; }, get user() { return pvUserScroll; }, U64: () => U64, get ready() { return U64ready; }, CVOK64, diag64, unit64, ensure64 };

/* ================= Version 65 =================
   – une carte se souligne au moment où le trait bleu de la lecture arrive sur son mot, et le mot scintille ;
     les cartes plus loin dans le texte attendent le trait (mode Texte : elles apparaissent quand la lecture les dépasse) ;
   – lecture à voix haute : une seule voix, sans changement de voix ni de ton aux répliques, et sans pause à chaque
     changement de personnage ; les chuchotements restent comme avant (plus bas, un peu plus lents) ;
   – fin d'épisode : toutes les cartes trouvées dans l'épisode se jouent (plus de limite à 2 ou 3). */

// ---------- 1. La carte attend le trait ----------
var PEND65 = [];
const cm65 = card62Mark;
function spark65(sp, c) {
  if (REDUCED || !sp.length || byId('reader').hidden) return;
  const g = leftGut(), b = pvIn.getBoundingClientRect();
  const r0 = sp[0].getBoundingClientRect(), r1 = sp[sp.length - 1].getBoundingClientRect();
  if (!r0.width) return;
  const sameLine = Math.abs(r0.top - r1.top) < r0.height / 2;
  const x0 = r0.left - b.left, x1 = sameLine ? r1.right - b.left : x0 + r0.width, y = r0.top - b.top + r0.height / 2;
  for (let i = 0; i < 7; i++) {
    const s = el('span', 'spk65');
    s.dataset.cc = c;
    s.style.left = (x0 + (x1 - x0) * (i / 6)) + 'px';
    s.style.top = (y + (Math.random() - .5) * r0.height * .5) + 'px';
    s.style.setProperty('--dx', ((Math.random() - .5) * 26).toFixed(1) + 'px');
    s.style.setProperty('--dy', (-(10 + Math.random() * 22)).toFixed(1) + 'px');
    s.style.setProperty('--dl', (i * .05).toFixed(2) + 's');
    s.addEventListener('animationend', () => s.remove());
    g.append(s);
  }
  sp.forEach((s) => { s.classList.remove('cardw-glint'); void s.offsetWidth; s.classList.add('cardw-glint'); });
  setTimeout(() => sp.forEach((s) => s.classList.remove('cardw-glint')), 1400);
}
card62Mark = function (id, c, j, mot, fresh) {
  if (!pvBuilt || j == null || j < 0) return;
  const sp = card62Spans(j, mot);
  if (!sp.length) return;
  if (sp[0].classList.contains('cardw')) return cm65(id, c, j, mot, false);   // déjà soulignée
  const show = () => { cm65(id, c, j, mot, fresh); if (fresh) spark65(sp, c); };
  const reached = j < k || sp[0].classList.contains('wl') || (S.read !== 'page' && j <= k);
  if (reached) { show(); return; }
  // pas encore lue : la carte attend que le trait arrive sur son mot
  sp[0]._c64 = show;
  if (!PEND65.some((x) => x.s === sp[0])) PEND65.push({ j, s: sp[0] });
};
function flush65() {
  if (!PEND65.length) return;
  PEND65 = PEND65.filter((x) => {
    if (!x.s._c64) return false;
    if (x.j < k || (S.read !== 'page' && x.j <= k)) { const f = x.s._c64; x.s._c64 = null; f(); return false; }
    return true;
  });
}
// les cartes pas encore trouvées : elles se soulignent au moment même où le trait arrive sur leur mot
// (la carte rejoint ensuite le Carnet comme avant)
function pre65() {
  if (!pvBuilt) return;
  const arm = (id, c, j, mot) => {
    const sp = card62Spans(j, mot);
    if (!sp.length || sp[0].classList.contains('cardw') || sp[0]._c64) return;
    sp[0]._c64 = () => { if (!sp[0].classList.contains('cardw')) { cm65(id, c, j, mot, true); spark65(sp, c); } };
  };
  GAMES.forEach((g) => { const c = CARD62[g.kind]; if (c && g.x && !(S.coll && S.coll[g.key]) && !S.jeux[g.key]) arm('g' + g.key, c, g.j, g.x.mot); });
  JURONS.forEach((jr) => { if (!S.jurons.includes(jr.mot)) arm('j' + jr.id, 'jur', jr.j, jr.mot); });
}
{
  const ca = card62Apply;
  card62Apply = function () { const r = ca.apply(this, arguments); pre65(); return r; };
}
{
  const pr = progress;
  progress = function () { const r = pr.apply(this, arguments); flush65(); return r; };
}

// ---------- 2. La voix : une seule, sans arrêt aux répliques ----------
if (!S.vc65) { S.vc65 = 1; S.vcast = false; persist(); }

window.__v65 = { get pend() { return PEND65.length; }, flush65, menuLeft: (e) => menuLeft(e), segEnd: (j) => vSegEnd(j), pitch: (sp) => vPitch(sp, null), piecesOf: (e) => piecesOf(e) };

/* ================= Version 66 =================
   – cartes et jeux plus rapides : pendant l'écran des cartes, la page de lecture cachée dessous n'est plus dessinée,
     et le passage d'une carte à l'autre est plus court ;
   – la lumière de l'heure glisse par un fondu de deux calques (sans repeindre tout l'écran à chaque image) ;
   – une carte trouvée en lisant s'envole du mot jusqu'au Carnet, qui grandit, et son compteur monte d'un cran ;
   – la voix d'homme et la voix de femme reviennent par défaut (changement de voix aux répliques). */

// ---------- 1. L'écran des cartes : la lecture dessous n'est plus dessinée ----------
var tc66 = 0;
{
  const ot = openTrove;
  openTrove = function () {
    const r = ot.apply(this, arguments);
    if (trove) { clearTimeout(tc66); tc66 = setTimeout(() => { if (trove) document.documentElement.classList.add('trove-cover'); }, REDUCED ? 0 : 170); }
    return r;
  };
  const tcl = troveClose;
  troveClose = function () { clearTimeout(tc66); document.documentElement.classList.remove('trove-cover'); return tcl.apply(this, arguments); };
}

// ---------- 2. La lumière de l'heure : un fondu entre deux calques ----------
const lumA66 = el('i', 'lum66'), lumB66 = el('i', 'lum66');
lumEl.append(lumA66, lumB66);
lumEl.style.transition = 'none'; lumEl.style.backgroundColor = 'transparent';
let lumFrom66 = '', lumTo66 = '';
paintLight = function (e, f) {
  const a = LUM[e];
  const b = e + 1 < EPS.length && EPS[e + 1].c === EPS[e].c && LUM[e + 1] ? LUM[e + 1] : a;
  if (!S.amb || !a || !/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b)) {
    if (lumKey) { lumKey = ''; stage.dataset.lum = ''; lumA66.style.opacity = '0'; lumB66.style.opacity = '0'; lumFrom66 = lumTo66 = ''; }
    return;
  }
  const p = a === b ? 0 : Math.min(100, Math.round(f * 10) * 10);
  const key = a + '>' + b + ':' + p;
  if (key === lumKey) return;
  lumKey = key;
  stage.dataset.lum = p >= 50 ? b : a;
  if (lumFrom66 !== a || lumTo66 !== b) {   // nouvel épisode : on repart de sa lumière
    lumFrom66 = a; lumTo66 = b;
    [lumA66, lumB66].forEach((x) => { x.style.transition = 'none'; });
    lumA66.style.backgroundColor = 'var(--lt-' + a + ')'; lumB66.style.backgroundColor = 'var(--lt-' + b + ')';
    lumA66.style.opacity = String(1 - p / 100); lumB66.style.opacity = String(p / 100);
    // la transition revient deux images plus tard (sans forcer la mise en page de toute la page)
    requestAnimationFrame(() => requestAnimationFrame(() => { [lumA66, lumB66].forEach((x) => { x.style.transition = ''; }); }));
    return;
  }
  lumA66.style.opacity = String(1 - p / 100); lumB66.style.opacity = String(p / 100);
};
lumKey = ''; if (!byId('reader').hidden && pvBuilt) paintLight(EPI[k], 0);

// ---------- 3. La carte s'envole jusqu'au Carnet, qui grandit, et le compteur monte ----------
function bump66() {
  const n = $('.cnb-n', cnBtn);
  carnetGlow();
  if (n && !REDUCED) { n.classList.remove('bump66'); void n.offsetWidth; n.classList.add('bump66'); }
}
function found66(sp, c, key) {
  spark65(sp, c);
  const r = sp[0].getBoundingClientRect();
  const done = () => { flying = Math.max(0, flying - 1); if (key) collect(key); paintBadge(); bump66(); };
  if (REDUCED || speedHack || !r.width || byId('reader').hidden) { if (key) collect(key); paintBadge(); bump66(); return; }
  flying++;
  const star = el('span', 'fly66'); star.dataset.cc = c;
  // l'étoile part du mot, un instant après les étincelles
  setTimeout(() => flyToCarnet({ left: r.left + r.width / 2 - 9, top: r.top + r.height / 2 - 9, width: 18, height: 18 }, star, done), 260);
}
pre65 = function () {
  if (!pvBuilt) return;
  const arm = (id, c, j, mot, key) => {
    const sp = card62Spans(j, mot);
    if (!sp.length || sp[0].classList.contains('cardw') || sp[0]._c64) return;
    sp[0]._c64 = () => { if (!sp[0].classList.contains('cardw')) { cm65(id, c, j, mot, true); found66(sp, c, key); } };
  };
  GAMES.forEach((g) => { const c = CARD62[g.kind]; if (c && g.x && !(S.coll && S.coll[g.key]) && !S.jeux[g.key]) arm('g' + g.key, c, g.j, g.x.mot, g.key); });
  JURONS.forEach((jr) => { if (!S.jurons.includes(jr.mot)) arm('j' + jr.id, 'jur', jr.j, jr.mot, null); });
};
// le compteur ne monte qu'à l'arrivée de l'étoile (pas quand la carte est rangée en douce un peu avant)
{
  const pb = paintBadge;
  paintBadge = function () {
    const n0 = badgeN;
    const r = pb.apply(this, arguments);
    if (n0 >= 0 && badgeN > n0 && !flying && !byId('reader').hidden) bump66();
    return r;
  };
}
if (pvBuilt) pre65();

// ---------- 4. La voix : homme et femme par défaut ----------
if (!S.vc66) { S.vc66 = 1; S.vcast = true; persist(); }

window.__v66 = { get flying() { return flying; }, found66, bump66, lum: () => [lumA66.style.opacity, lumB66.style.opacity, lumFrom66, lumTo66] };

/* ================= Version 67 =================
   Le compteur du Carnet ne redescend plus pendant l'envol d'une carte : il compte les cartes en attente,
   sauf celles qui sont encore en vol, et monte d'un cran à l'arrivée de chaque étoile (une seule fois). */
var FLY67 = new Set();
paintBadge = function () {
  const n = pendingAll().filter((g) => !FLY67.has(g.key)).length;
  const b = $('.cnb-n', cnBtn);
  if (b) { b.hidden = !n; if (b.textContent !== String(n)) b.textContent = String(n); }
  cnBtn.setAttribute('aria-label', 'Carnet des curiosités' + (n ? ' : ' + n + (n > 1 ? ' curiosités à découvrir' : ' curiosité à découvrir') : ''));
  if (badgeN >= 0 && n > badgeN && !byId('reader').hidden) bump66();
  badgeN = n;
};
found66 = function (sp, c, key) {
  spark65(sp, c);
  const r = sp[0].getBoundingClientRect();
  let over = false;
  const done = () => {
    if (over) return; over = true;
    if (key) { FLY67.delete(key); collect(key); paintBadge(); } else bump66();
  };
  if (REDUCED || speedHack || !r.width || byId('reader').hidden) { done(); return; }
  if (key) FLY67.add(key);
  const star = el('span', 'fly66'); star.dataset.cc = c;
  setTimeout(() => flyToCarnet({ left: r.left + r.width / 2 - 9, top: r.top + r.height / 2 - 9, width: 18, height: 18 }, star, done), 260);
  setTimeout(done, 2200);   // au cas où l'animation ne se termine pas (onglet caché…)
};
window.__v67 = { get fly() { return FLY67.size; } };

/* ================= Version 68 =================
   Boutons plus réactifs partout :
   – pause (et tout ce qui met en pause : Aa, Carnet…) : le bouton répond tout de suite, le surlignement se replace
     à l'image suivante ;
   – écouteurs : la voix démarre et s'arrête sans attente inutile (plus de phrase vide lancée à chaque fois sur Android,
     reprise en 30 ms au lieu de 200 à 300 ms) ;
   – le temps restant (« Encore… », chapitre, liste des épisodes) se calcule d'un coup au lieu de parcourir tout le livre ;
   – plus de petites animations d'ambiance fabriquées en coulisse (elles étaient cachées depuis la v56) ;
   – la page se construit en arrière-plan par tout petits morceaux (plus de bloc de 50 à 80 ms qui fige un toucher). */

// ---------- 1. Le temps d'un passage, sans parcourir tout le livre ----------
const UA68 = UNITS.map((u) => u.a);   // les répliques, dans l'ordre du texte
function lowB68(x) { let a = 0, b = UA68.length; while (a < b) { const m = (a + b) >> 1; if (UA68[m] < x) a = m + 1; else b = m; } return a; }
spanMs = function (a, z) {
  const cues = 2 * Math.max(0, lowB68(z + 1) - lowB68(a));
  const base = 60000 / S.wpm;
  const groups = S.read === 'page' ? CHOF[z] - CHOF[a] + 1 : 0;
  return (PW[z + 1] - PW[a]) * base + cues * base * 1.15 * CUEF[S.cue] + groups * base * .6;
};

// ---------- 2. Plus d'animations d'ambiance invisibles ----------
ambSpawn = function () { };
try { clearInterval(ambTimer); ambTimer = 0; ambBox.replaceChildren(); } catch (e) { /* rien */ }

// ---------- 3. La voix : démarrer et s'arrêter sans attendre ----------
const IOS68 = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
toggleVoice = function () {
  if (!VOICE_OK) { toast('La voix n’est pas disponible sur ce navigateur.'); return; }
  if (S.voice) {
    S.voice = false; persist();
    vStop(); syncVoice();
    toast('Écoute coupée');
    restartStep(60);
    return;
  }
  S.voice = true;
  if (S.wpm > VOICE_MAX) S.wpm = 240;
  persist(); syncSettings();
  if (IOS68 && !vUnlocked) vUnlock();      // l'iPhone demande une première phrase lancée par le toucher ; Android non
  if (S.read === 'texte') setRead('page');
  toast('Écoute : la voix lit le texte');
  restartStep(30);
};

// ---------- 4. La page en arrière-plan, par petits morceaux ----------
function tok68(frag, tk) {
  if (tk.t === 'end') frag.append(endSlotEl(tk.e));
  else if (tk.t === 'chap') frag.append(el('p', 'tchap', tk.text));
  else if (tk.t === 'tep') frag.append(el('p', 'tep', tk.text));
  else if (tk.t === 'brk') frag.append(el('p', 'tbrk', '***'));
  else seg64(frag, tk.sg, tk.epn);
}
build64 = function (u, until) {
  if (!u || u.built) return true;
  if (!u._frag) { u._frag = document.createDocumentFragment(); u._ti = 0; }
  while (u._ti < u.toks.length) {
    tok68(u._frag, u.toks[u._ti++]);
    if (until && u._ti < u.toks.length && performance.now() > until) return false;   // on reprendra ici
  }
  u.built = true;
  const frag = u._frag; u._frag = null;
  const near = VIS62.has(u.w);
  if (CVOK64) { u.w.style.containIntrinsicBlockSize = 'auto ' + u.h + 'px'; u.w.style.height = ''; }
  else if (!near) u.w.classList.add('far64');
  else u.w.style.height = '';
  u.w.append(frag);
  if (!U64ready && pvBuilt) { clearTimeout(dec64); dec64 = setTimeout(decorate64, 80); }
  return true;
};
idle64 = function () {
  const until = performance.now() + (playing ? 4 : 8);
  while (U64q.length) {
    const u = U64q[0];
    if (u.built) { U64q.shift(); continue; }
    if (!build64(u, until)) break;
    U64q.shift();
    if (performance.now() > until) break;
  }
  if (U64q.length) { U64t = setTimeout(idle64, playing ? 40 : 12); return; }
  U64ready = true;
  clearTimeout(dec64);
  decorate64();
};

// ---------- 5. Pause : le bouton d'abord, le surlignement à l'image suivante ----------
var pz68 = 0;
function pauseDraw68() {
  if (pz68) cancelAnimationFrame(pz68);
  // après l'image qui montre le bouton (ou le panneau) : rAF puis tâche suivante
  pz68 = requestAnimationFrame(() => { pz68 = 0; setTimeout(() => { if (!playing && !byId('reader').hidden && !(typeof trove !== 'undefined' && trove)) { render(k); progress(); } }, 0); });
}

window.__v68 = { spanMs: (a, z) => spanMs(a, z), IOS68, cues: (a, z) => 2 * Math.max(0, lowB68(z + 1) - lowB68(a)) };

/* ================= Version 69 =================
   – fin d'épisode : le bandeau et le Carnet des curiosités s'ouvrent deux fois plus vite ;
   – écran des cartes : la carte suivante arrive sans attendre la sortie de la précédente ;
   – lecture : le surlignement des mots se défait sans parcourir toute la page ; le bandeau d'un épisode se trouve
     directement (sans chercher dans les 100 000 mots du livre). */

// ---------- 1. Les mots surlignés : une liste, plus une recherche dans toute la page ----------
var WL69 = new Set();
function wlAdd69(s) { s.classList.add('wl'); WL69.add(s); }
wlClear = function () { WL69.forEach((s) => s.classList.remove('wl')); WL69.clear(); };

// ---------- 2. Les bandeaux de fin d'épisode, rangés par numéro ----------
var EP69 = new Map();
{
  const ese = endSlotEl;
  endSlotEl = function (e) { const s = ese(e); EP69.set(Number(e), s); return s; };
  const es = endSlot;
  endSlot = function (e) {
    const s0 = EP69.get(Number(e));
    if (s0 && s0.isConnected) return s0;
    const s = es(e);   // construit l'épisode si besoin, puis cherche
    return s || ((EP69.get(Number(e)) || {}).isConnected ? EP69.get(Number(e)) : null);
  };
}
// ---------- 3. Les points (cachés depuis la v56) ne relancent plus d'animation ----------
paintPill = function (btn) {
  if (!btn) return;
  const li = levelInfo(S.pts);
  const v = $('.pv', btn); if (v) v.textContent = fmtInt(S.pts);
  const x = $('.xp i', btn); if (x) x.style.setProperty('--p', Math.round(li.frac * 100) + '%');
};
// ---------- 4. Le Flash quiz ouvert : une classe sur <html> (au lieu d'une recherche dans toute la page) ----------
{
  const fs = byId('flashSheet');
  const sync = () => document.documentElement.classList.toggle('flash-on', !!fs && !fs.hidden);
  if (fs && window.MutationObserver) new MutationObserver(sync).observe(fs, { attributes: true, attributeFilter: ['hidden'] });
  sync();
}
// ---------- 5. La liste des épisodes de la page du livre : fabriquée à l'ouverture ----------
function epsOpen69() { const d = $('.eplist'); return !!(d && d.open); }
{
  const d = $('.eplist');
  if (d) d.addEventListener('toggle', () => { const l = byId('epList'); if (d.open && l && l.dataset.lazy69 === '1') refreshCover(); });
}
window.__v69 = { get wl() { return WL69.size; }, EP69 };

/* ================= Version 70 =================
   Fin d'épisode, « Découvrir les cartes » : l'écran des cartes s'ouvre tout de suite.
   – plus d'attente de 0,52 s avant l'ouverture ;
   – la lecture, cachée sous l'écran des cartes, n'est plus redessinée à la pause (les 1 700 paragraphes autour
     ne changent plus d'aspect pour rien) : elle reprend son aspect « à l'arrêt » seulement si on ne relance pas la lecture ;
   – l'écran des cartes propose toutes les cartes qui attendent au Carnet (celles de l'épisode d'abord). */
var FRZ70 = false, FRZ70b = false;
{
  const tc70 = troveClose;
  troveClose = function (resume) {
    const fz = FRZ70b; FRZ70b = false;
    const r = tc70.apply(this, arguments);
    if (fz) {
      const still = () => { if (!playing) { stage.dataset.playing = '0'; readerEl.dataset.playing = '0'; readerEl.dataset.pts = '0'; zenOff(); flowOff(); pauseDraw68(); } };
      if (!resume || byId('reader').hidden) still(); else setTimeout(still, REDUCED ? 60 : 700);
    }
    return r;
  };
}
{
  const ot70 = openTrove;
  openTrove = function () {
    try { stopPageGlide(); } catch (e) { /* rien */ }
    const r = ot70.apply(this, arguments);
    // des cartes d'épisodes précédents s'ajoutent : le titre le dit
    if (trove && trove.e >= 0 && trove.keys.some((key) => { const g = GAMES.find((x) => x.key === key); return g && EPI[g.j] !== trove.e; })) byId('trvTitle').textContent = 'Tes cartes à découvrir';
    return r;
  };
}
window.__v70 = { get frz() { return FRZ70b; } };

/* ================= Version 71 =================
   Fin d'épisode, « Découvrir les cartes » :
   – dès que le doigt touche le bouton, le logo du Carnet tourne et le bouton affiche « Ouverture… » avec un petit
     cercle qui tourne (l'animation tourne même si le téléphone est occupé) ;
   – l'écran des cartes ne cache plus la lecture dessous (cela recalculait 1 400 éléments au milieu de l'apparition) ;
   – la première carte se prépare directement dans l'écran des cartes, sans remettre en page la lecture. */

var W71 = null, LOG71 = [], SPLIT71 = true;   // { box, b, t, painted }
function wait71On(box) {
  if (!box) return;
  const go = box.querySelector('.m49-go'), lg = box.querySelector('.m49-logo');
  if (go && !go.classList.contains('wait71')) {
    go.dataset.t71 = go.textContent;
    go.classList.add('wait71');
    go.textContent = 'Ouverture…';
    go.setAttribute('aria-busy', 'true');
  }
  if (lg) lg.classList.add('wait71');
}
function wait71Off() {
  if (W71) { clearTimeout(W71.t); W71 = null; }
  document.querySelectorAll('.wait71').forEach((x) => {
    x.classList.remove('wait71');
    if (x.dataset.t71 != null) { x.textContent = x.dataset.t71; delete x.dataset.t71; }
    x.removeAttribute('aria-busy');
  });
}
const btn71 = (t) => (t && t.closest ? t.closest('.m49-go, .m49-logo') : null);
const box71 = (b) => (b ? b.closest('[data-e]') : null);
// le doigt se pose : l'attente se voit tout de suite (avant même que le doigt se lève)
document.addEventListener('pointerdown', (ev) => {
  const b = btn71(ev.target), box = box71(b);
  if (!b || !box || gameOpen || trove) return;
  wait71Off();
  wait71On(box);
  const w = W71 = { box, b, painted: false, t: 0 };
  requestAnimationFrame(() => requestAnimationFrame(() => { w.painted = true; }));
  // le doigt a glissé (on faisait défiler) : on remet le bouton
  w.t = setTimeout(() => { if (W71 === w && !trove) wait71Off(); }, 1200);
}, true);
document.addEventListener('pointercancel', () => { if (W71 && !trove) wait71Off(); }, true);
// le clic : si l'attente n'est pas encore à l'écran, on la montre d'abord, puis on ouvre les cartes à l'image suivante
var pass71 = false;
document.addEventListener('click', (ev) => {
  if (pass71) return;
  const b = btn71(ev.target), box = box71(b);
  if (!b || !box || gameOpen || trove) return;
  if (W71 && W71.box === box && W71.painted) return;     // déjà affichée : on ouvre tout de suite
  ev.stopImmediatePropagation(); ev.preventDefault();
  wait71On(box);
  if (W71) clearTimeout(W71.t);
  W71 = { box, b, painted: false, t: 0 };
  requestAnimationFrame(() => setTimeout(() => {
    pass71 = true;
    try { b.click(); } finally { pass71 = false; }
  }, 0));
}, true);

// la voix s'arrête juste après l'affichage (sur certains téléphones, l'arrêter tout de suite bloque l'écran un instant)
var DEFV71 = false;
{
  const vs71 = vStop;
  vStop = function () {
    if (!DEFV71) return vs71.apply(this, arguments);
    vGen++;
    clearTimeout(vFallT); clearTimeout(vWatchT);
    vCur = -1;
    if (VOICE_OK) requestAnimationFrame(() => setTimeout(() => { try { if (!playing) synth.cancel(); } catch (e) { /* ignoré */ } }, 0));
  };
}
// pendant que le bandeau de fin d'épisode attend, l'écran des cartes se prépare, invisible : il s'affichera d'un coup
var PT71 = 0, PRE71 = true;
function pre71() { if (!PRE71 || trove || !trv.hidden || byId('reader').hidden) return; trv.classList.remove('in'); trv.classList.add('pre71'); trv.hidden = false; }
{
  const pm71 = paintMenu;
  paintMenu = function (box) {
    const r = pm71.apply(this, arguments);
    if (box && box.querySelector('.m49-go') && trv.hidden) { clearTimeout(PT71); PT71 = setTimeout(pre71, 700); }
    return r;
  };
}
{
  const ot71 = openTrove;
  openTrove = function () {
    // la première carte se prépare dans l'écran des cartes (pas dans la page de lecture)
    const gb = byId('gameC'), sl = byId('trvSlot');
    if (gb && sl && gb.parentNode !== sl && !gameOpen) { gb.hidden = true; sl.append(gb); }
    // l'écran s'affiche d'abord (titre, logo qui tourne) ; la première carte se pose à l'image suivante
    const tp = trovePiece; let later = false;
    if (SPLIT71) trovePiece = function () { later = true; };
    let r;
    clearTimeout(PT71); trv.classList.remove('pre71');
    DEFV71 = true;
    try { r = ot71.apply(this, arguments); } finally { trovePiece = tp; DEFV71 = false; }
    if (later && trove) {
      const t = trove;
      trv.classList.add('load71');
      requestAnimationFrame(() => setTimeout(() => {
        trv.classList.remove('load71');
        const t0 = performance.now();
        if (trove === t && !gameOpen) trovePiece();
        LOG71.push(['carte', Math.round(t0), Math.round(performance.now() - t0), !!gameOpen]);
      }, 0));
    }
    clearTimeout(tc66);           // la lecture reste dessous, immobile : la cacher coûtait plus qu'elle ne rapportait
    if (W71) clearTimeout(W71.t);
    // le bouton retrouve son texte une fois l'écran des cartes affiché
    setTimeout(() => { if (trove) wait71Off(); }, REDUCED ? 0 : 400);
    if (!trove) wait71Off();
    return r;
  };
  const tc71 = troveClose;
  troveClose = function () { wait71Off(); return tc71.apply(this, arguments); };
}

window.__v71 = { get pre() { return PRE71; }, set pre(v) { PRE71 = !!v; }, LOG71, get split() { return SPLIT71; }, set split(v) { SPLIT71 = !!v; }, get w() { return W71; }, wait71On, wait71Off };

/* ================= Version 72 =================
   « Découvrir les cartes » : sur un vrai écran tactile, le bouton qui affichait « Ouverture… » ne recevait plus le
   toucher (il ignorait le doigt dès qu'il était posé) : le logo tournait mais rien ne s'ouvrait. Le bouton reste
   touchable, et si le doigt se lève sur le bouton sans que le clic arrive, les cartes s'ouvrent quand même. */
document.addEventListener('pointerup', (ev) => {
  const w = W71;
  if (!w || trove || gameOpen || !w.b.isConnected) return;
  const r = w.b.getBoundingClientRect();
  const inside = ev.clientX >= r.left - 12 && ev.clientX <= r.right + 12 && ev.clientY >= r.top - 12 && ev.clientY <= r.bottom + 12;
  if (!inside) return;
  // le clic normal arrive juste après ; s'il ne vient pas, on ouvre nous-mêmes
  setTimeout(() => {
    if (W71 !== w || trove || gameOpen || !w.b.isConnected) return;
    pass71 = true;
    try { w.b.click(); } finally { pass71 = false; }
  }, 350);
}, true);
// un second toucher (ou le clic qui arrive après) n'ouvre pas l'écran des cartes une deuxième fois
{
  const ot72 = openTrove;
  openTrove = function () { if (trove) return; return ot72.apply(this, arguments); };
}
window.__v72 = true;

/* ================= Version 73 =================
   Plus rapide partout, surtout sur téléphone :
   – la page ne garde plus tout le livre en mémoire : seuls les épisodes autour de la lecture sont construits
     (avant : les 194 épisodes, soit 125 000 éléments et 340 000 nœuds, que le téléphone devait sans cesse
     parcourir pour ranger sa mémoire) ; un épisode lointain se construit quand on y va ;
   – l'écran des cartes : la lecture dessous est mise de côté (ni calculée ni dessinée), et rien n'y est
     redessiné pendant qu'on joue (le menu de fin d'épisode, les pastilles et le compteur se mettent à jour
     à la fermeture) ; d'une carte à l'autre, la nouvelle glisse plus vite ;
   – Réglages : « Journal de vitesse » : les gestes les plus lents mesurés sur le téléphone, à copier pour Claude. */

// ---------- 1. La page : seulement les épisodes autour de la lecture ----------
var WIN73 = 2, CU73 = -1;
function win73() {
  if (!U64.length || !pvBuilt) return;
  const cu = Math.max(0, unit64(k));
  if (cu === CU73) return;
  CU73 = cu;
  let add = false;
  for (let d = 0; d <= WIN73; d++) {
    for (const i of (d ? [cu + d, cu - d] : [cu])) {
      const u = U64[i];
      if (u && !u.built && !U64q.includes(u)) { U64q.push(u); add = true; }
    }
  }
  if (!add) return;
  U64q.sort((a, b) => (b._frag ? 1 : 0) - (a._frag ? 1 : 0) || Math.abs(a.i - cu) - Math.abs(b.i - cu));
  U64ready = false;
  clearTimeout(U64t); U64t = setTimeout(idle64, playing ? 60 : 20);
}
idle64 = function () {
  const cu = Math.max(0, unit64(k));
  // un épisode commencé se termine ; les autres seulement s'ils sont près de la lecture
  U64q = U64q.filter((u) => !u.built && (u._frag || Math.abs(u.i - cu) <= WIN73));
  const until = performance.now() + (playing ? 4 : 8);
  while (U64q.length) {
    const u = U64q[0];
    if (u.built) { U64q.shift(); continue; }
    if (!build64(u, until)) break;
    U64q.shift();
    if (performance.now() > until) break;
  }
  if (U64q.length) { U64t = setTimeout(idle64, playing ? 40 : 12); return; }
  U64ready = true;
  clearTimeout(dec64);
  decorate64();
};
// un épisode construit à la demande (on fait défiler, on saute ailleurs) reçoit aussi ses cartes, étoiles et marque-pages
{
  const b73 = build64;
  build64 = function (u) {
    const was = !!(u && u.built);
    const r = b73.apply(this, arguments);
    if (u && !was && u.built && U64ready && pvBuilt) { clearTimeout(dec64); dec64 = setTimeout(decorate64, 80); }
    return r;
  };
}
{
  const pr73 = progress;
  progress = function () { const r = pr73.apply(this, arguments); win73(); return r; };
}

// ---------- 1 bis. Plus de calcul à chaque image quand rien ne bouge ----------
// le glissement de la page s'arrête quand il ne peut plus avancer (bout de la page, ou dernier pixel) :
// avant, il continuait à chaque image tant que le bandeau de fin d'épisode était affiché
pvTick = function (t) {
  const dt = Math.min(64, t - pvLast); pvLast = t;
  const cur = pageview.scrollTop, diff = pvTarget - cur;
  if (Math.abs(diff) < .6) { pageview.scrollTop = pvTarget; pvAnim = 0; return; }
  pageview.scrollTop = cur + diff * (1 - Math.pow(.9, dt / 16.7));
  if (Math.abs(pageview.scrollTop - cur) < .5) { pageview.scrollTop = pvTarget; pvAnim = 0; return; }
  pvAnim = requestAnimationFrame(pvTick);
};
// le trait de lecture ne tourne plus à vide : sa boucle s'arrête quand le groupe est lu et la page posée,
// et repart avec le groupe suivant
{
  const st73 = swTick;
  swTick = function (t) {
    st73.call(this, t);
    if (!swRaf) return;
    const settled = pvUserScroll || pvF64 == null || Math.abs(pvTarget - pvF64) < .05;
    if (!sw || !sw.t0 || (t >= sw.t0 + sw.dur && settled)) { cancelAnimationFrame(swRaf); swRaf = 0; }
  };
}

// ---------- 1 ter. Moins de recalculs de toute la page ----------
// une variable de style posée sur le cadre de lecture oblige le navigateur à recalculer tout le texte affiché :
// on ne la repose que si sa valeur change (sv73 est utilisée aussi par le code d'origine)
function sv73(el, n, v) {
  const m = el._v73 || (el._v73 = {});
  if (m[n] === v) return;
  m[n] = v;
  el.style.setProperty(n, v);
}
// les mesures d'abord, les écritures ensuite (avant : trois recalculs de toute la page à l'ouverture de la lecture)
placeRx = function () {
  const sr = stage.getBoundingClientRect(), pr = pvIn.getBoundingClientRect();
  if (!sr.width || !pr.width) return;
  const cs = getComputedStyle(pvIn);
  const pad = parseFloat(cs.paddingRight) || 0, padL = parseFloat(cs.paddingLeft) || 0;
  const gap = sr.right - (pr.right - pad);
  const marginL = pr.left - sr.left + padL;
  sv73(stage, '--rxr', Math.max(0, Math.round(gap - 66)) + 'px');
  sv73(pvIn, '--mkx', Math.round(pr.width - pad + 12) + 'px');
  sv73(stage, '--ambw', Math.max(14, Math.min(96, Math.round(pr.left - sr.left + padL - 6))) + 'px');
  sv73(pvIn, '--mtx', Math.round(padL - Math.min(marginL / 2, 20)) + 'px');
  sv73(pvIn, '--mts', Math.round(Math.max(16, Math.min(30, marginL - 4))) + 'px');
};
// pause et lecture : les paragraphes s'éclairent ou s'atténuent d'un coup (avant : un fondu sur une centaine de
// paragraphes à la fois, que le téléphone calculait image par image)
function noTr73() {
  stage.classList.add('notr73');
  cancelAnimationFrame(noTr73.r);
  noTr73.r = requestAnimationFrame(() => { noTr73.r = requestAnimationFrame(() => { noTr73.r = 0; stage.classList.remove('notr73'); }); });
}
{
  const pl73 = play;
  play = function () { noTr73(); return pl73.apply(this, arguments); };
  const ha73 = halt;
  halt = function () { if (!FRZ70) noTr73(); return ha73.apply(this, arguments); };
}
// les pastilles de droite sont cachées depuis la v56 : plus d'étincelles invisibles (elles forçaient une mise en page chacune)
chipFx = function () { };

// ---------- 2. L'écran des cartes : la lecture dessous est mise de côté ----------
var SK73 = 0, PG73 = false;
function skip73(on) {
  clearTimeout(SK73);
  if (on) SK73 = setTimeout(() => { if (trove) document.documentElement.classList.add('trove-skip73'); }, REDUCED ? 0 : 260);
  else document.documentElement.classList.remove('trove-skip73');
}
{
  const ot73 = openTrove;
  openTrove = function () { const r = ot73.apply(this, arguments); if (trove) skip73(true); return r; };
  const tc73 = troveClose;
  troveClose = function () {
    skip73(false);                    // la lecture revient dans la même image que la fermeture
    const r = tc73.apply(this, arguments);
    if (!trove && PG73) { PG73 = false; paintGames(); }
    return r;
  };
  // pendant qu'on joue, la lecture cachée n'est pas redessinée : tout se met à jour à la fermeture
  const pm73 = paintMenus;
  paintMenus = function () { if (trove) return; return pm73.apply(this, arguments); };
  const pg73 = paintGames;
  paintGames = function () { if (trove) { PG73 = true; return; } return pg73.apply(this, arguments); };
  const pb73 = paintBadge;
  paintBadge = function () { if (trove) return; return pb73.apply(this, arguments); };
}

// ---------- 3. Des animations que la carte graphique fait seule (le téléphone n'a plus à les calculer image par image) ----------
// la carte suivante glisse sans forcer de mise en page
function slide73(slot) {
  if (REDUCED) return;
  try {
    if (slot._a73) slot._a73.cancel();
    slot._a73 = slot.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2, .8, .3, 1)' });
  } catch (e) { /* rien */ }
}
// les étincelles sur le mot d'une carte (pas dans la page cachée par l'écran des cartes)
spark65 = function (sp, c) {
  if (trove || REDUCED || !sp.length || byId('reader').hidden) return;
  const g = leftGut(), b = pvIn.getBoundingClientRect();
  const r0 = sp[0].getBoundingClientRect(), r1 = sp[sp.length - 1].getBoundingClientRect();
  if (!r0.width) return;
  const sameLine = Math.abs(r0.top - r1.top) < r0.height / 2;
  const x0 = r0.left - b.left, x1 = sameLine ? r1.right - b.left : x0 + r0.width, y = r0.top - b.top + r0.height / 2;
  for (let i = 0; i < 7; i++) {
    const s = el('span', 'spk65');
    s.dataset.cc = c;
    s.style.animation = 'none';
    s.style.left = (x0 + (x1 - x0) * (i / 6)) + 'px';
    s.style.top = (y + (Math.random() - .5) * r0.height * .5) + 'px';
    const dx = (Math.random() - .5) * 26, dy = -(10 + Math.random() * 22);
    g.append(s);
    try {
      const a = s.animate([
        { opacity: 0, transform: 'translate(0px, 0px) scale(.2) rotate(0deg)' },
        { opacity: 1, transform: 'translate(' + (dx * .4).toFixed(1) + 'px, ' + (dy * .4).toFixed(1) + 'px) scale(1.15) rotate(50deg)', offset: .3 },
        { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px) scale(.4) rotate(140deg)' }
      ], { duration: 950, delay: i * 50, easing: 'ease-out', fill: 'both' });
      a.onfinish = () => s.remove();
    } catch (e) { s.remove(); }
  }
  sp.forEach((s) => s.classList.remove('cardw-glint'));
  requestAnimationFrame(() => sp.forEach((s) => s.classList.add('cardw-glint')));
  setTimeout(() => sp.forEach((s) => s.classList.remove('cardw-glint')), 1400);
};
// les pouces après une réponse
thumbs = function (good, from) {
  if (REDUCED) return;
  const r = from && from.getBoundingClientRect ? from.getBoundingClientRect() : { left: innerWidth / 2 - 50, top: innerHeight / 2 - 50, width: 100, height: 100 };
  const box = el('div', 'thumbs45');
  const cx = r.left + r.width / 2, cy = good ? r.top + Math.min(r.height * .35, 160) : r.top + Math.min(r.height * .4, 180);
  const todo = [];
  for (let i = 0; i < 9; i++) {
    const s = el('span', good ? 'up' : 'down');
    s.innerHTML = SVG45.thumb;
    const sz = 22 + Math.random() * 16;
    s.style.animation = 'none';
    s.style.setProperty('--s', sz + 'px');
    s.style.setProperty('--x', (cx + (Math.random() - .5) * Math.min(260, r.width * .8)) + 'px');
    s.style.setProperty('--y', (cy + (Math.random() - .5) * 40) + 'px');
    box.append(s);
    todo.push([s, (Math.random() - .5) * 120, good ? -(150 + Math.random() * 140) : (130 + Math.random() * 120), (Math.random() - .5) * 50, i]);
  }
  document.body.append(box);
  todo.forEach(([s, dx, dy, rot, i]) => {
    try {
      s.animate(good ? [
        { opacity: 0, transform: 'translate(0px, 10px) scale(.4) rotate(0deg)' },
        { opacity: 1, offset: .15 },
        { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px) scale(1.05) rotate(' + rot.toFixed(1) + 'deg)' }
      ] : [
        { opacity: 0, transform: 'translate(0px, -6px) scale(.5) rotate(0deg)' },
        { opacity: .95, offset: .15 },
        { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px) scale(.9) rotate(' + rot.toFixed(1) + 'deg)' }
      ], { duration: good ? 1350 : 1250, delay: i * 50, easing: good ? 'cubic-bezier(.2, .7, .3, 1)' : 'cubic-bezier(.5, 0, .8, .6)', fill: 'both' });
    } catch (e) { /* rien */ }
  });
  setTimeout(() => box.remove(), 1900);
};
// le Carnet qui brille et son compteur qui saute : sans mise en page forcée, sans ombre recalculée à chaque image
carnetGlow = function () { cnBtn.classList.remove('glow'); requestAnimationFrame(() => cnBtn.classList.add('glow')); };
bump66 = function () {
  const n = $('.cnb-n', cnBtn);
  carnetGlow();
  if (!n || REDUCED) return;
  n.classList.add('bump66');
  try { n.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)', offset: .35 }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3, 1.6, .5, 1)' }); } catch (e) { /* rien */ }
  clearTimeout(n._b73); n._b73 = setTimeout(() => n.classList.remove('bump66'), 650);
};
// le bouton « Ouverture… » se retrouve sans parcourir toute la page
{
  const W73 = new Set();
  const on73 = wait71On;
  wait71On = function (box) {
    const r = on73.apply(this, arguments);
    if (box) box.querySelectorAll('.wait71').forEach((x) => W73.add(x));
    return r;
  };
  wait71Off = function () {
    if (W71) { clearTimeout(W71.t); W71 = null; }
    W73.forEach((x) => {
      x.classList.remove('wait71');
      if (x.dataset.t71 != null) { x.textContent = x.dataset.t71; delete x.dataset.t71; }
      x.removeAttribute('aria-busy');
    });
    W73.clear();
  };
}

// ---------- 4. Journal de vitesse : ce que vit le vrai téléphone ----------
var JV73 = { ev: new Map(), lf: [], evOK: false, lfOK: false };
function lab73(t) {
  try {
    if (!t || !t.getAttribute) return '?';
    if (t.closest && t.closest('#pvIn')) return 'le texte';
    const x = (t.closest && t.closest('button, a, summary, label, input, [role="button"]')) || t;
    const parts = Array.from(x.childNodes).map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const s = x.getAttribute('aria-label') || parts.join(' · ') || x.id || String(x.className || '') || x.tagName;
    return String(s).replace(/\s+/g, ' ').slice(0, 42);
  } catch (e) { return '?'; }
}
try {
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    if (!e.interactionId) return;
    const c = JV73.ev.get(e.interactionId);
    if (c && c.d >= e.duration) return;
    JV73.ev.set(e.interactionId, { d: e.duration, lab: lab73(e.target), at: e.startTime,
      wait: Math.max(0, e.processingStart - e.startTime), js: Math.max(0, e.processingEnd - e.processingStart) });
    if (JV73.ev.size > 400) JV73.ev.delete(JV73.ev.keys().next().value);
  })).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  JV73.evOK = true;
} catch (e) { /* non pris en charge */ }
try {
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    const sc = (e.scripts || []).slice().sort((a, b) => b.duration - a.duration);
    const top = sc[0];
    JV73.lf.push({ d: e.duration, at: e.startTime,
      style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
      js: sc.reduce((t, s) => t + s.duration, 0), forced: sc.reduce((t, s) => t + (s.forcedStyleAndLayoutDuration || 0), 0),
      fn: top ? ((top.sourceFunctionName || '?') + ' ← ' + (top.invoker || top.invokerType || '')).slice(0, 64) : '' });
    if (JV73.lf.length > 500) JV73.lf.splice(0, 100);
  })).observe({ type: 'long-animation-frame', buffered: true });
  JV73.lfOK = true;
} catch (e) { /* non pris en charge */ }
function report73() {
  const ms = (x) => Math.round(x) + ' ms';
  const ua = navigator.userAgent;
  const br = (/Chrome\/(\d+)/.exec(ua) && 'Chrome ' + RegExp.$1) || (/Version\/([\d.]+).*Safari/.exec(ua) && 'Safari ' + RegExp.$1) || (/Firefox\/(\d+)/.exec(ua) && 'Firefox ' + RegExp.$1) || 'autre';
  const os = (/iPhone OS ([\d_]+)/.exec(ua) && 'iOS ' + RegExp.$1.replace(/_/g, '.')) || (/Android ([\d.]+)/.exec(ua) && 'Android ' + RegExp.$1) || '';
  const ev = [...JV73.ev.values()].sort((a, b) => b.d - a.d);
  const lf = JV73.lf.slice().sort((a, b) => b.d - a.d);
  const ds = ev.map((x) => x.d).sort((a, b) => a - b);
  const L = [];
  L.push(APP + ' · journal de vitesse · ' + Math.round(performance.now() / 60000) + ' min d’utilisation');
  L.push(br + (os ? ' · ' + os : '') + ' · ' + (navigator.hardwareConcurrency || '?') + ' cœurs' + (navigator.deviceMemory ? ' · ' + navigator.deviceMemory + ' Go' : ''));
  L.push('Page : ' + document.getElementsByTagName('*').length + ' éléments · épisodes construits ' + U64.filter((u) => u.built).length + '/' + U64.length);
  if (!JV73.evOK) L.push('(Ce navigateur ne mesure pas la durée des gestes.)');
  else {
    L.push('Gestes lents (plus de 16 ms) : ' + ds.length + (ds.length ? ' · médiane ' + ms(ds[ds.length >> 1]) + ' · pire ' + ms(ds[ds.length - 1]) : ''));
    ev.slice(0, 12).forEach((x) => L.push('• ' + ms(x.d) + ' · ' + x.lab + ' (attente ' + ms(x.wait) + ', calcul ' + ms(x.js) + ', affichage ' + ms(Math.max(0, x.d - x.wait - x.js)) + ')'));
  }
  if (JV73.lfOK) {
    L.push('Images les plus longues :');
    lf.slice(0, 8).forEach((x) => L.push('• ' + ms(x.d) + ' · script ' + ms(x.js) + (x.forced > 1 ? ' (dont mise en page forcée ' + ms(x.forced) + ')' : '') + ', styles et dessin ' + ms(x.style) + (x.fn ? ' · ' + x.fn : '')));
  }
  return L.join('\n');
}
function journal73() {
  closeSheets();
  const txt = report73();
  const box = el('div', 'diag64 jv73'); box.setAttribute('role', 'dialog');
  const pre = el('pre', 'jv73-t', txt);
  const row = el('div', 'jv73-row');
  const cp = el('button', 'chip', 'Copier'); cp.type = 'button';
  const sel = () => { try { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); cp.textContent = 'Texte sélectionné : copie-le'; } catch (e) { /* rien */ } };
  cp.addEventListener('click', (ev) => {
    ev.stopPropagation();
    try { navigator.clipboard.writeText(txt).then(() => { cp.textContent = 'Copié'; }, sel); } catch (e) { sel(); }
  });
  const x = el('button', 'chip', 'Fermer'); x.type = 'button'; x.addEventListener('click', (ev) => { ev.stopPropagation(); box.remove(); });
  row.append(cp, x);
  box.append(el('b', '', 'Journal de vitesse'), el('small', '', 'Les gestes les plus lents depuis l’ouverture de l’appli. Copie ce texte (ou fais une capture) et envoie-le à Claude.'), pre, row);
  document.body.append(box);
}
{
  const d = byId('diag64');
  if (d && !byId('jv73')) {
    const b = el('button', 'chip diag64-go', 'Journal de vitesse (gestes les plus lents)'); b.type = 'button'; b.id = 'jv73';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); journal73(); });
    d.after(b);
  }
}

window.__v73 = { buildAll() { U64.forEach((u) => build64(u)); decorate64(); return U64.filter((u) => u.built).length; }, report73, JV73, get cu() { return CU73; }, get win() { return WIN73; }, set win(v) { WIN73 = v; CU73 = -1; win73(); } };

/* ================= Version 74 =================
   Réglages → « Transférer ma progression » : pour passer d'un appareil à l'autre, ou de l'appli Claude à l'appli
   installée sur le téléphone (chacune garde sa propre mémoire). On copie un texte d'un côté, on le colle de l'autre. */
function prog74() {
  try { persist(); } catch (e) { /* rien */ }
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  return JSON.stringify({ enfinLu: 1, copie: new Date().toISOString().slice(0, 10), S: s || S });
}
function read74(txt) {
  try {
    const t = String(txt || '').trim();
    const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return o && (o.enfinLu === 1 || o.belleLurette === 1) && o.S && typeof o.S === 'object' ? o : null;
  } catch (e) { return null; }
}
function transfer74() {
  closeSheets();
  const box = el('div', 'diag64 jv73 tr74'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Transférer ma progression');
  const txt = prog74();
  const nb = (S.coll ? Object.keys(S.coll).length : 0) + (S.jeux ? Object.keys(S.jeux).length : 0);
  const cp = el('button', 'btn primary', 'Copier ma progression'); cp.type = 'button';
  const out = el('textarea', 'tr74-t'); out.readOnly = true; out.value = txt; out.hidden = true; out.setAttribute('aria-label', 'Ma progression');
  cp.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const shown = () => { out.hidden = false; out.focus(); out.select(); cp.textContent = 'Texte sélectionné : copie-le'; };
    try { navigator.clipboard.writeText(txt).then(() => { cp.textContent = 'Copié ✓ — colle-le dans l’autre appli'; }, shown); } catch (e) { shown(); }
  });
  const inp = el('textarea', 'tr74-t'); inp.placeholder = 'Colle ici une progression copiée dans l’autre appli'; inp.setAttribute('aria-label', 'Progression à reprendre');
  const msg = el('small', 'tr74-m', '');
  const go = el('button', 'btn', 'Reprendre cette progression'); go.type = 'button';
  let armed = null;
  go.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const o = read74(inp.value);
    if (!o) { msg.textContent = 'Ce texte n’est pas une progression d’' + APP + '. Copie-la de nouveau dans l’autre appli.'; armed = null; go.textContent = 'Reprendre cette progression'; return; }
    if (armed !== inp.value) {
      armed = inp.value;
      const n = (o.S.coll ? Object.keys(o.S.coll).length : 0) + (o.S.jeux ? Object.keys(o.S.jeux).length : 0);
      msg.textContent = 'Progression du ' + (o.copie || '?') + ' : ' + n + ' cartes. Elle remplacera celle de cette appli.';
      go.textContent = 'Confirmer : remplacer ma progression';
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(o.S));
      msg.textContent = 'Progression reprise. L’appli redémarre…';
      setTimeout(() => { try { location.reload(); } catch (e) { msg.textContent = 'Progression reprise : ferme et rouvre l’appli.'; } }, 600);
    } catch (e) { msg.textContent = 'Impossible d’enregistrer ici (mémoire du navigateur indisponible).'; }
  });
  const x = el('button', 'chip', 'Fermer'); x.type = 'button'; x.addEventListener('click', (ev) => { ev.stopPropagation(); box.remove(); });
  const row = el('div', 'jv73-row'); row.append(x);
  box.append(
    el('b', '', 'Transférer ma progression'),
    el('small', '', 'Chaque appli garde sa propre mémoire (l’appli Claude, l’appli installée, un autre téléphone). Copie ta progression ici, puis colle-la dans l’autre appli.'),
    el('span', 'tr74-h', 'Ici : ' + nb + ' cartes, épisode ' + ((typeof k === 'number' && EPS[EPI[Math.min(k, N - 1)]]) ? (EPI[Math.min(k, N - 1)] + 1) : 1) + ' sur ' + EPS.length),
    cp, out, el('span', 'tr74-h', 'Reprendre une progression copiée ailleurs :'), inp, go, msg, row);
  document.body.append(box);
}
{
  const d = byId('jv73') || byId('diag64');
  if (d && !byId('tr74')) {
    const b = el('button', 'chip diag64-go', 'Transférer ma progression (autre appareil, appli installée)'); b.type = 'button'; b.id = 'tr74';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); transfer74(); });
    d.after(b);
  }
}
window.__v74 = { prog74, read74, transfer74 };

/* ================= Versions 75 et 76 =================
   v75 : ouverture animée d'un chapitre (Bel-Ami, chapitre I : le boulevard au crépuscule, Duroy et ses trois francs quarante).
   v76 : elle ne prend plus tout l'écran avant la lecture. C'est un bandeau vivant en tête du chapitre, au-dessus du texte :
   il s'anime une fois (6 s), puis reste comme illustration du chapitre. On peut lire tout de suite.
   Un toucher sur le bandeau ouvre la version plein écran (10 s, avec son). Son discret, réglé par « Sons » et « Ambiances ».
   v78 : à la fin de l'animation, le carton « Épisode 1 » et le titre de l'épisode s'affichent sur l'image.
   Données dans le livre : avant[ci].ouverture = { scene, titre, legende, duree, son }. */
const OUV_SCENES = {};
OUV_SCENES['belami-boulevard'] = function (cv, DPR, OPT) {
  OPT = OPT || {};
  const CWL = OPT.wide ? 400 : 432, CHL = OPT.wide ? 300 : 768;
  cv.width = Math.round(CWL * DPR); cv.height = Math.round(CHL * DPR);
  const MAIN = cv.getContext('2d'); let ctx = MAIN;
  const OFF = document.createElement('canvas'); OFF.width = cv.width; OFF.height = cv.height; const OCTX = OFF.getContext('2d');
/* ---------- utilitaires ---------- */
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,k)=>a+(b-a)*k;
const sm=(a,b,x)=>{const k=clamp((x-a)/(b-a));return k*k*(3-2*k)};
const eio=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
function h1(n){const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)}
function vn(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(h1(i),h1(i+1),u)}

/* ---------- caméra ---------- */
const CX=216, CY=440;
const VIEW=OPT.wide?{x:-185,y:170,s:CWL/797}:{x:0,y:0,s:1};
const DX0=OPT.wide?-250:-95, LX=OPT.wide?-150:-10;
function camZ(s){return 1+0.075*eio(clamp(s/10.4))}
function camX(s){return 54*eio(clamp(s/10.4))}
let S=0;
function layer(d){const z=camZ(S),v=VIEW.s;ctx.setTransform(DPR*v*z,0,0,DPR*v*z,DPR*v*(CX-CX*z-VIEW.x),DPR*v*(CY-CY*z-VIEW.y));ctx.translate(-camX(S)*d,0)}
function screen(){ctx.setTransform(DPR,0,0,DPR,0,0)}

/* ---------- décor (déterministe) ---------- */
const GF=503, FS=568, ROAD0=574, CURB=652;
const R=rng(11);
const BLD=[];{let x=-270;while(x<820){const w=98+R()*42;BLD.push({x,w,top:236+R()*24,tone:R(),cafe:false});x+=w}}
for(const b of BLD){if(b.x<=318&&318<b.x+b.w)b.cafe=true}
for(const b of BLD){
  const fh=(GF-b.top)/5;b.fh=fh;
  b.cols=Math.max(3,Math.round(b.w/31));const cell=b.w/b.cols;b.win=[];
  for(let f=0;f<5;f++)for(let i=0;i<b.cols;i++){
    const r=R();let lt=Infinity;
    if(r<0.18)lt=-1;else if(r<0.62)lt=0.4+R()*8.5;
    b.win.push({x:b.x+cell*(i+.5)-cell*0.21,y:b.top+fh*f+fh*0.22,w:cell*0.42,h:fh*(f===0?0.5:0.58),lt,warm:R(),fl:R()<0.12,f})
  }
  b.dorm=[];const nd=2+Math.floor(R()*2);for(let i=0;i<nd;i++){b.dorm.push({x:b.x+b.w*(i+.5)/nd,lt:R()<.45?(R()<.5?-1:1+R()*7):Infinity})}
  b.chim=[];const nc=1+Math.floor(R()*3);for(let i=0;i<nc;i++){b.chim.push({x:b.x+8+R()*(b.w-24),w:9+R()*10,h:12+R()*14})}
  b.bays=[];const nb=b.cafe?0:2+Math.floor(R()*2);for(let i=0;i<nb;i++){b.bays.push({lit:R()<.55,a:.35+R()*.4})}
}
const FAR=[];{let x=-290;const r2=rng(5);while(x<840){const w=30+r2()*60;FAR.push({x,w,h:22+r2()*40,ch:r2()<.6});x+=w}}
const TREES=[-262,-30,232,470,712].map((x,i)=>{const r3=rng(30+i);const c=[];for(let k=0;k<70;k++){const a=r3()*Math.PI*2,rr=Math.sqrt(r3());c.push({x:x+Math.cos(a)*rr*68,y:418+Math.sin(a)*rr*48,r:9+r3()*15,ph:r3()*6})}return {x,c}});
const LAMPS=[{x:-166,t:-5},{x:44,t:1.2},{x:254,t:1.8},{x:464,t:2.4},{x:674,t:2.9}];
const COB=[];{const r4=rng(9);for(let row=0;row<15;row++){const y=ROAD0+4+row*row*0.34+row*3.4;for(let k=0;k<44;k++)COB.push({x:-320+k*26+(row%2)*13+r4()*5,y,w:9+row*0.5})}}
const PFAR=[];{const r5=rng(17);for(let i=0;i<18;i++)PFAR.push({x0:-300+r5()*1200,v:(7+r5()*11)*(r5()<.5?-1:1),g:r5()<.45?'f':'m',h:36+r5()*6,ph:r5()*6,cane:r5()<.3})}
const SEAT=[{x:270,g:'m',raise:[3.1,4.3]},{x:291,g:'f'},{x:333,g:'m'},{x:352,g:'m',raise:[6.0,7.3]},{x:380,g:'f'},{x:400,g:'m'}];
const PNEAR=[
  {x0:430,v:-19,g:'m',h:114,ph:0.4,cane:true},
  {x0:458,v:-19,g:'f',h:106,ph:1.9,fan:true},
  {x0:-140,v:30,g:'m',h:118,ph:2.2,cane:false}
];
const BIRDS=[];{const r6=rng(23);for(let i=0;i<9;i++)BIRDS.push({x0:-300+r6()*1200,v:(40+r6()*55)*(r6()<.5?-1:1),y0:110+r6()*120,a:10+r6()*22,w:0.9+r6()*1.4,ph:r6()*6,sz:5+r6()*3})}
const MOTES=[];{const r7=rng(41);for(let i=0;i<110;i++)MOTES.push({x:r7()*900,y:470+r7()*250,vx:(r7()-.5)*6,vy:-2-r7()*5,r:.5+r7()*1.2,ph:r7()*6})}
const GRAIN=document.createElement('canvas');GRAIN.width=GRAIN.height=256;{const g=GRAIN.getContext('2d'),id=g.createImageData(256,256),r8=rng(3);for(let i=0;i<id.data.length;i+=4){const v=r8()*255;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255}g.putImageData(id,0,0)}

/* ---------- lumière des réverbères ---------- */
function lampI(i,s){const L=LAMPS[i];if(s<L.t)return 0;const k=sm(L.t,L.t+.45,s);return k*(0.9+0.1*vn(s*6+i*17))+0.55*Math.exp(-(s-L.t)*7)}

/* ---------- personnages ---------- */
const INK='#110d0c';
function ik(sx,sy,tx,ty,l1,l2,bend){let dx=tx-sx,dy=ty-sy;let d=Math.hypot(dx,dy);const m=l1+l2-0.01;if(d>m){dx*=m/d;dy*=m/d;d=m}
  const a=Math.atan2(dy,dx),c=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),b=Math.acos(c)*bend;return [sx+Math.cos(a+b)*l1,sy+Math.sin(a+b)*l1,sx+dx,sy+dy]}
function limb(pts,w){ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.stroke()}
function legs(phase,amp,stance){
  const out=[];let low=0;
  for(let i=0;i<2;i++){const p=phase+i*Math.PI;let a=amp*0.42*Math.sin(p)+(stance?(i?-.09:.09):0);const bend=0.75*amp*Math.max(0,Math.cos(p));
    const kx=Math.sin(a)*24,ky=Math.cos(a)*24;const fx=kx+Math.sin(a-bend)*24,fy=ky+Math.cos(a-bend)*24;out.push([kx,ky,fx,fy,a-bend]);low=Math.max(low,fy)}
  return {out,low}
}
function drawMan(x,y,h,o){
  const dir=o.dir||1,ph=o.phase||0,amp=o.amp??1;
  ctx.save();ctx.translate(x,y);ctx.scale(dir*h/100,h/100);ctx.fillStyle=ctx.strokeStyle=o.col||INK;ctx.lineCap='round';ctx.lineJoin='round';
  const L=legs(ph,amp,o.stance);const hy=-L.low;// hanche
  ctx.save();ctx.translate(0,hy);
  for(const [kx,ky,fx,fy,a] of L.out){limb([0,0,kx,ky],6.2);limb([kx,ky,fx,fy],5.0);ctx.beginPath();ctx.ellipse(fx+3.4,fy-0.6,4.6,1.9,0,0,Math.PI*2);ctx.fill()}
  ctx.restore();
  const by=hy+48;// décalage du buste (0 au repos)
  ctx.save();ctx.translate(0,by);ctx.rotate(o.lean||0);
  // bras arrière
  const sw=amp*0.38*Math.sin(ph);
  const sh=[1,-78];
  const armRest=(sg)=>{const a=-sg;return [sh[0]+Math.sin(a)*15,sh[1]+Math.cos(a)*15,sh[0]+Math.sin(a)*15+Math.sin(a+.25)*14,sh[1]+Math.cos(a)*15+Math.cos(a+.25)*14]};
  {const p=armRest(-sw);limb([sh[0],sh[1],p[0],p[1],p[2],p[3]],4.6)}
  // redingote
  ctx.beginPath();ctx.moveTo(-9.5,-81);ctx.lineTo(8.5,-81.5);ctx.quadraticCurveTo(13.5,-74,11,-65);ctx.lineTo(8.2,-57);ctx.lineTo(10.5,-39);ctx.lineTo(1,-42);ctx.lineTo(-14.5,-34);ctx.lineTo(-10.5,-57);ctx.quadraticCurveTo(-12,-72,-9.5,-81);ctx.fill();
  ctx.fillRect(-3,-87,6.5,8);
  // tête
  ctx.beginPath();ctx.arc(1,-91,6.6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(7,-93);ctx.lineTo(9.2,-89.6);ctx.lineTo(7,-88.6);ctx.fill();
  if(o.must){ctx.beginPath();ctx.moveTo(5,-87.6);ctx.quadraticCurveTo(9,-88.6,11.5,-86.4);ctx.quadraticCurveTo(9,-86.6,6,-85.8);ctx.fill()}
  // chapeau haut-de-forme
  ctx.save();ctx.translate(1,-96);ctx.rotate(o.tilt||0);
  ctx.beginPath();ctx.ellipse(0,0,10,1.9,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6.4,0);ctx.lineTo(7,-15.5);ctx.quadraticCurveTo(0.4,-16.6,-6.6,-15.5);ctx.closePath();ctx.fill();
  ctx.restore();
  // bras avant
  if(o.pose){const p=o.pose;const a0=armRest(sw);const tx=lerp(a0[2],p[0],p[2]),ty=lerp(a0[3],p[1],p[2]);const e=ik(sh[0]+1,sh[1],tx,ty,15,14,-1);limb([sh[0]+1,sh[1],e[0],e[1],e[2],e[3]],4.8);ctx.beginPath();ctx.arc(e[2],e[3],2.6,0,Math.PI*2);ctx.fill();o._hand=[e[2],e[3]]}
  else{const p=armRest(sw);limb([sh[0]+1,sh[1],p[0],p[1],p[2],p[3]],4.8);
    if(o.cane){ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(p[2],p[3]);ctx.lineTo(p[2]+7+Math.sin(ph)*5,-L.low+48+0.5);ctx.stroke()}}
  ctx.restore();
  ctx.restore();
}
function drawWoman(x,y,h,o){
  const dir=o.dir||1,ph=o.phase||0;
  ctx.save();ctx.translate(x,y);ctx.scale(dir*h/100,h/100);ctx.fillStyle=ctx.strokeStyle=o.col||INK;ctx.lineCap='round';ctx.lineJoin='round';
  const bob=-0.9*Math.abs(Math.sin(ph));const sw=1.6*Math.sin(ph);
  ctx.translate(0,bob);
  // jupe à tournure
  ctx.beginPath();ctx.moveTo(-6.5,-58);ctx.lineTo(6.5,-58);ctx.quadraticCurveTo(9,-30,12.5+sw*.4,0.5);ctx.lineTo(-15+sw*.4,0.5);ctx.quadraticCurveTo(-15,-22,-16,-36);ctx.quadraticCurveTo(-22,-46,-9,-57);ctx.closePath();ctx.fill();
  // corsage
  ctx.beginPath();ctx.moveTo(-5.5,-59);ctx.lineTo(5.5,-59);ctx.quadraticCurveTo(8.5,-70,6.5,-77);ctx.lineTo(-6,-77.5);ctx.quadraticCurveTo(-7.5,-68,-5.5,-59);ctx.fill();
  ctx.fillRect(-2.6,-82,5.4,6);
  ctx.beginPath();ctx.arc(0.8,-86,5.7,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(-4.4,-87.5,3.4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(6.2,-88);ctx.lineTo(8,-85.2);ctx.lineTo(6,-84.6);ctx.fill();
  // petit chapeau + plume
  ctx.save();ctx.translate(1,-91);ctx.rotate(-0.18);ctx.beginPath();ctx.ellipse(0,0,8,2,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(0.5,-3,4.6,3.2,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-2,-4);ctx.quadraticCurveTo(-9,-12,-13,-7);ctx.stroke();ctx.restore();
  // bras
  ctx.lineWidth=4.4;
  if(o.fan){ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(6,-64);ctx.lineTo(10,-71);ctx.stroke();const fa=0.25*Math.sin(S*9+ph);ctx.save();ctx.translate(10.5,-72);ctx.rotate(-0.9+fa);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,8,-0.7,0.7);ctx.closePath();ctx.fill();ctx.restore()}
  else{ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(3+sw*.6,-62);ctx.lineTo(6,-56);ctx.stroke()}
  ctx.restore();
}
function drawSeated(x,y,h,g,raise,s){
  ctx.save();ctx.translate(x,y);ctx.scale(h/100,h/100);ctx.fillStyle=ctx.strokeStyle='#120d0d';ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.lineTo(7,-30);ctx.lineTo(-7,-30);ctx.fill();
  ctx.beginPath();ctx.arc(0,-37,6.5,0,Math.PI*2);ctx.fill();
  if(g==='m'){ctx.fillRect(-6,-52,12,10);ctx.beginPath();ctx.ellipse(0,-43,10,2,0,0,Math.PI*2);ctx.fill()}else{ctx.beginPath();ctx.ellipse(0,-44,8,3,0,0,Math.PI*2);ctx.fill()}
  let up=0;if(raise){up=sm(raise[0],raise[0]+.35,s)*(1-sm(raise[1]-.35,raise[1],s))}
  ctx.lineWidth=4.5;ctx.beginPath();ctx.moveTo(4,-24);ctx.lineTo(13,-14+(-14)*up);ctx.stroke();
  ctx.restore();
  return up;
}
function drawFiacre(x,y,sc,dir,dist,s){
  ctx.save();ctx.translate(x,y);ctx.scale(dir*sc,sc);ctx.fillStyle=ctx.strokeStyle='#18120f';ctx.lineCap='round';ctx.lineJoin='round';
  // voiture (derrière le cheval)
  const wr=dist/18,wf=dist/14;
  const wheel=(cx,cy,r,a)=>{ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1.1;for(let k=0;k<12;k++){const t=a+k*Math.PI/6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(t)*r,cy+Math.sin(t)*r);ctx.stroke()}ctx.beginPath();ctx.arc(cx,cy,2.4,0,Math.PI*2);ctx.fill()};
  ctx.beginPath();ctx.moveTo(-98,-28);ctx.lineTo(-98,-66);ctx.quadraticCurveTo(-96,-74,-86,-74);ctx.lineTo(-56,-74);ctx.lineTo(-48,-56);ctx.lineTo(-40,-50);ctx.lineTo(-40,-34);ctx.quadraticCurveTo(-60,-26,-98,-28);ctx.fill();
  // siège et cocher
  ctx.fillRect(-52,-60,14,4);
  ctx.beginPath();ctx.moveTo(-50,-60);ctx.lineTo(-40,-60);ctx.lineTo(-41,-80);ctx.lineTo(-49,-80);ctx.fill();
  ctx.beginPath();ctx.arc(-45,-85,4.6,0,Math.PI*2);ctx.fill();
  ctx.fillRect(-49,-99,8,11);ctx.beginPath();ctx.ellipse(-45,-88.5,7,1.4,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-40,-72);ctx.quadraticCurveTo(-10,-108,24,-92);ctx.stroke();
  // fenêtre éclairée
  ctx.fillStyle='rgba(246,190,110,0.85)';ctx.fillRect(-88,-66,22,15);ctx.fillStyle='#18120f';
  wheel(-80,-17,17,wr);wheel(-46,-13,13,wf);
  // brancards
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-42,-34);ctx.lineTo(10,-40);ctx.stroke();
  // cheval (trot : paires diagonales)
  const gp=dist/46*Math.PI*2;const bob=-1.4*Math.abs(Math.sin(gp));
  ctx.save();ctx.translate(0,bob);
  const leg=(hx,p,back)=>{const a=0.42*Math.sin(p);const lift=Math.max(0,Math.cos(p))*0.9;const kx=hx+Math.sin(a)*15,ky=-30+Math.cos(a)*15;const b2=back?a+lift:a-lift;ctx.lineWidth=3.6;ctx.beginPath();ctx.moveTo(hx,-34);ctx.lineTo(kx,ky);ctx.lineTo(kx+Math.sin(b2)*16,ky+Math.cos(b2)*16);ctx.stroke()};
  leg(-12,gp+Math.PI,true);leg(18,gp,false);
  ctx.beginPath();ctx.ellipse(3,-40,24,10.5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(16,-46);ctx.lineTo(27,-66);ctx.lineTo(33,-67);ctx.lineTo(27,-36);ctx.fill();
  ctx.beginPath();ctx.moveTo(27,-66);ctx.lineTo(31,-73);ctx.lineTo(33,-69);ctx.lineTo(45,-56);ctx.quadraticCurveTo(44,-52,40,-53);ctx.lineTo(31,-60);ctx.fill();
  ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-20,-44);ctx.quadraticCurveTo(-27,-38,-25,-24);ctx.stroke();
  leg(-17,gp,true);leg(13,gp+Math.PI,false);
  ctx.restore();
  ctx.restore();
}

/* ---------- Duroy ---------- */
function duroyX(s){if(s<1.3)return DX0;if(s<4.0)return lerp(DX0,150,1-Math.pow(1-(s-1.3)/2.7,2.2));if(s<6.6)return 150;return 150+430*Math.pow(clamp((s-6.6)/3.6),1.7)}
const DH=238, DL=DH*0.78;
function duroyPhase(s){return (duroyX(s)-DX0)/DL*Math.PI*2}
function duroySpeed(s){return Math.abs(duroyX(s+0.02)-duroyX(s-0.02))/0.04}
function fiacreX(s){return 690-168*(s-2.7)}

/* ---------- rendu ---------- */
function draw(s){
  S=s;screen();ctx.clearRect(0,0,CWL,CHL);
  // ciel
  layer(0.05);
  let g=ctx.createLinearGradient(0,-40,0,330);
  g.addColorStop(0,'#15132a');g.addColorStop(.3,'#2c2342');g.addColorStop(.55,'#5e3448');g.addColorStop(.75,'#a3534a');g.addColorStop(.9,'#dc8a58');g.addColorStop(1,'#f2b46e');
  ctx.fillStyle=g;ctx.fillRect(-320,-60,1240,700);
  // première étoile
  ctx.fillStyle='rgba(255,240,220,'+(0.5+0.3*vn(s*2))+')';ctx.beginPath();ctx.arc(92,64,1.1,0,7);ctx.fill();
  // martinets
  layer(0.15);ctx.strokeStyle='#1b1520';ctx.lineWidth=1.4;ctx.lineCap='round';
  for(const b of BIRDS){let x=b.x0+b.v*s;x=((x+300)%1200+1200)%1200-300;const y=b.y0+b.a*Math.sin(s*b.w+b.ph);const f=Math.sin(s*15+b.ph*3)*0.5;const d=Math.sign(b.v);
    ctx.beginPath();ctx.moveTo(x-b.sz,y-b.sz*(0.35+f));ctx.quadraticCurveTo(x-b.sz*.4,y-0.6,x,y);ctx.quadraticCurveTo(x+b.sz*.4,y-0.6,x+b.sz,y-b.sz*(0.35+f));ctx.stroke()}
  // toits lointains
  layer(0.25);ctx.fillStyle='#3a2a3a';
  for(const f of FAR){const top=330-f.h;ctx.beginPath();ctx.moveTo(f.x,340);ctx.lineTo(f.x,top+8);ctx.lineTo(f.x+6,top);ctx.lineTo(f.x+f.w-6,top);ctx.lineTo(f.x+f.w,top+8);ctx.lineTo(f.x+f.w,340);ctx.fill();if(f.ch){ctx.fillRect(f.x+f.w*.6,top-9,6,10)}}
  // immeubles haussmanniens
  layer(0.5);
  for(const b of BLD){
    const l=40+b.tone*12;
    g=ctx.createLinearGradient(0,b.top,0,FS);g.addColorStop(0,`hsl(345,12%,${l*0.62}%)`);g.addColorStop(1,`hsl(340,10%,${l*0.42}%)`);
    ctx.fillStyle=g;ctx.fillRect(b.x,b.top,b.w+0.6,FS-b.top);
    // reflet chaud du couchant sur le haut
    ctx.fillStyle='rgba(240,150,100,0.07)';ctx.fillRect(b.x,b.top,b.w,40);
    // mansarde
    ctx.fillStyle='#2b2029';ctx.beginPath();ctx.moveTo(b.x-2,b.top);ctx.lineTo(b.x+9,b.top-34);ctx.lineTo(b.x+b.w-9,b.top-34);ctx.lineTo(b.x+b.w+2,b.top);ctx.fill();
    for(const c of b.chim){ctx.fillRect(c.x,b.top-34-c.h,c.w,c.h+2);ctx.fillRect(c.x-1.5,b.top-34-c.h-2.5,c.w+3,3)}
    for(const d of b.dorm){const on=d.lt<=s;ctx.fillStyle='#2b2029';ctx.beginPath();ctx.moveTo(d.x-8,b.top-6);ctx.lineTo(d.x-8,b.top-24);ctx.lineTo(d.x,b.top-31);ctx.lineTo(d.x+8,b.top-24);ctx.lineTo(d.x+8,b.top-6);ctx.fill();
      ctx.fillStyle=on?'rgba(245,185,105,.9)':'#1c151b';ctx.fillRect(d.x-4.5,b.top-21,9,13)}
    // corniche
    ctx.fillStyle='rgba(20,14,18,.55)';ctx.fillRect(b.x,b.top,b.w,3);ctx.fillStyle='rgba(255,220,190,.06)';ctx.fillRect(b.x,b.top+3,b.w,1);
    // fenêtres
    for(const w of b.win){
      const on=sm(w.lt,w.lt+.5,s);
      ctx.fillStyle='#211920';ctx.fillRect(w.x-1.2,w.y-1.2,w.w+2.4,w.h+2.4);
      if(on>0){const fl=w.fl?0.8+0.2*vn(s*5+w.x):1;const a=on*fl;
        ctx.fillStyle=w.warm<.7?`rgba(244,178,96,${a})`:`rgba(250,206,140,${a})`;ctx.fillRect(w.x,w.y,w.w,w.h);
        ctx.fillStyle=`rgba(90,40,30,${0.35*a})`;ctx.fillRect(w.x,w.y,w.w*0.28,w.h);ctx.fillRect(w.x+w.w*0.72,w.y,w.w*0.28,w.h)}
      else{ctx.fillStyle='#2c2229';ctx.fillRect(w.x,w.y,w.w,w.h)}
      ctx.fillStyle='rgba(20,14,18,.6)';ctx.fillRect(w.x+w.w/2-.4,w.y,.8,w.h);
    }
    // balcons filants (2e et 5e étages)
    for(const f of [0,3]){const y=b.top+b.fh*f+b.fh*0.8;ctx.fillStyle='#1d151b';ctx.fillRect(b.x+3,y,b.w-6,2.2);ctx.fillRect(b.x+3,y+7,b.w-6,1.4);for(let k=b.x+5;k<b.x+b.w-4;k+=3.2)ctx.fillRect(k,y+2,.9,5)}
    // rez-de-chaussée
    ctx.fillStyle='#21181c';ctx.fillRect(b.x,GF,b.w,FS-GF);
    ctx.fillStyle='rgba(255,220,190,.05)';ctx.fillRect(b.x,GF-2,b.w,2);
    if(!b.cafe){const n=b.bays.length;const bw=b.w/n;b.bays.forEach((y,i)=>{const x0=b.x+bw*i+5;ctx.fillStyle=y.lit?`rgba(232,160,90,${y.a*sm(0,1.2,s+.6)})`:'#1a1317';ctx.fillRect(x0,GF+16,bw-10,FS-GF-16);ctx.fillStyle='rgba(20,13,15,.7)';ctx.fillRect(x0,GF+8,bw-10,6)})}
    else{
      // le café
      g=ctx.createLinearGradient(0,GF+10,0,FS);g.addColorStop(0,'rgba(255,196,120,.95)');g.addColorStop(1,'rgba(214,128,70,.9)');ctx.fillStyle=g;ctx.fillRect(b.x+6,GF+14,b.w-12,FS-GF-14);
      for(let k=0;k<5;k++){ctx.fillStyle='rgba(60,30,20,.55)';ctx.fillRect(b.x+6+(b.w-12)*k/4-1,GF+14,2,FS-GF-14)}
      // enseigne
      ctx.fillStyle='#1a1215';ctx.fillRect(b.x+4,GF+1,b.w-8,12);
      ctx.font="600 8.5px 'Bodoni Moda', serif";ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(244,214,160,.95)';ctx.fillText('C A F É   ·   B R A S S E R I E',b.x+b.w/2,GF+7.5);
      // store rayé
      const ax0=b.x+2,ax1=b.x+b.w-2,ay=GF+13;const n=14;
      for(let k=0;k<n;k++){const xa=lerp(ax0,ax1,k/n),xb=lerp(ax0,ax1,(k+1)/n);ctx.fillStyle=k%2?'#8f3f2f':'#b9a084';ctx.beginPath();ctx.moveTo(xa,ay);ctx.lineTo(xb,ay);ctx.lineTo(xb+(xb-b.x-b.w/2)*0.06,ay+16);ctx.lineTo(xa+(xa-b.x-b.w/2)*0.06,ay+16);ctx.fill()}
      ctx.fillStyle='rgba(15,8,8,.35)';ctx.fillRect(ax0-4,ay+12,ax1-ax0+8,4);
      for(let k=0;k<n;k++){const xa=lerp(ax0,ax1,(k+.5)/n);ctx.fillStyle=k%2?'#7a3428':'#a08a70';ctx.beginPath();ctx.arc(xa+(xa-b.x-b.w/2)*0.06,ay+16,2.6,0,Math.PI);ctx.fill()}
    }
  }
  // terrasse du café
  layer(0.5);
  for(const p of SEAT){const up=drawSeated(p.x,FS-1,26,p.g,p.raise,s);if(up>0.6){ctx.fillStyle=`rgba(255,226,150,${(up-0.6)*2})`;const z=26/100;ctx.beginPath();ctx.arc(p.x+13*z,FS-1+(-14-14*up)*z-2,1.4,0,7);ctx.fill()}}
  ctx.fillStyle='#120d0d';for(const tx of [281,343,391]){ctx.beginPath();ctx.ellipse(tx,FS-8,7,1.8,0,0,Math.PI*2);ctx.fill();ctx.fillRect(tx-.6,FS-8,1.2,8)}
  // trottoir d'en face + brume chaude
  layer(0.55);ctx.fillStyle='#2a2023';ctx.fillRect(-320,FS,1240,ROAD0-FS+1);
  g=ctx.createLinearGradient(0,430,0,FS);g.addColorStop(0,'rgba(230,140,90,0)');g.addColorStop(1,'rgba(230,140,90,0.10)');ctx.fillStyle=g;ctx.fillRect(-320,430,1240,FS-430);
  for(const p of PFAR){let x=p.x0+p.v*s;x=((x+300)%1200+1200)%1200-300;const ph=p.ph+Math.abs(p.v)*s/(p.h*0.78)*Math.PI*2;
    if(p.g==='m')drawMan(x,FS+3,p.h,{dir:Math.sign(p.v),phase:ph,amp:.8,cane:p.cane,col:'#1c1416'});else drawWoman(x,FS+3,p.h,{dir:Math.sign(p.v),phase:ph,col:'#1c1416'})}
  // arbres du boulevard
  layer(0.65);ctx.fillStyle='#171215';
  for(const t of TREES){ctx.beginPath();ctx.moveTo(t.x-4,ROAD0-2);ctx.lineTo(t.x-2.4,440);ctx.lineTo(t.x+2.4,440);ctx.lineTo(t.x+4,ROAD0-2);ctx.fill();
    ctx.fillRect(t.x-12,ROAD0-6,24,3);
    for(const c of t.c){const sw=Math.sin(s*0.9+c.ph)*1.6*(1-(c.y-370)/120);ctx.beginPath();ctx.arc(c.x+sw,c.y,c.r,0,Math.PI*2);ctx.fill()}}
  // chaussée
  layer(0.75);
  g=ctx.createLinearGradient(0,ROAD0,0,CURB);g.addColorStop(0,'#2b2226');g.addColorStop(1,'#211a1d');ctx.fillStyle=g;ctx.fillRect(-320,ROAD0,1240,CURB-ROAD0+2);
  ctx.strokeStyle='rgba(255,215,170,0.045)';ctx.lineWidth=1;for(const c of COB){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.quadraticCurveTo(c.x+c.w/2,c.y-1.6,c.x+c.w,c.y);ctx.stroke()}
  // reflets des réverbères sur les pavés
  layer(0.9);ctx.globalCompositeOperation='lighter';
  LAMPS.forEach((L,i)=>{const I=lampI(i,s);if(!I)return;g=ctx.createRadialGradient(L.x,630,0,L.x,630,60);g.addColorStop(0,`rgba(255,175,95,${0.16*I})`);g.addColorStop(1,'rgba(255,175,95,0)');ctx.save();ctx.translate(L.x,630);ctx.scale(0.45,1);ctx.translate(-L.x,-630);ctx.fillStyle=g;ctx.fillRect(L.x-70,570,140,120);ctx.restore()});
  ctx.globalCompositeOperation='source-over';
  // fiacre
  layer(0.75);{const fx=fiacreX(s);if(fx>-400&&fx<1000)drawFiacre(fx,641,0.95,-1,(690-fx),s);
    if(fx>-400&&fx<1000){ctx.globalCompositeOperation='lighter';const lx=fx-36*0.95*-1*-1;g=ctx.createRadialGradient(fx+38,641-58,0,fx+38,641-58,22);g.addColorStop(0,'rgba(255,200,120,.45)');g.addColorStop(1,'rgba(255,200,120,0)');ctx.fillStyle=g;ctx.fillRect(fx+10,641-90,60,60);ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(255,214,150,.9)';ctx.fillRect(fx+36,641-61,4,5)}}
  // trottoir proche
  layer(0.9);
  ctx.fillStyle='#1d1718';ctx.fillRect(-320,CURB,1240,140);
  ctx.fillStyle='rgba(255,205,160,0.09)';ctx.fillRect(-320,CURB,1240,1.4);ctx.fillStyle='#161112';ctx.fillRect(-320,CURB+1.4,1240,5);
  ctx.strokeStyle='rgba(255,215,170,0.035)';ctx.lineWidth=1;for(let y=CURB+18;y<780;y+=y*0.032){ctx.beginPath();ctx.moveTo(-320,y);ctx.lineTo(920,y);ctx.stroke()}
  // flaques de lumière au sol
  ctx.globalCompositeOperation='lighter';
  LAMPS.forEach((L,i)=>{const I=lampI(i,s);if(!I)return;ctx.save();ctx.translate(L.x,703);ctx.scale(1,0.2);g=ctx.createRadialGradient(0,0,0,0,0,110);g.addColorStop(0,`rgba(255,180,100,${0.26*I})`);g.addColorStop(1,'rgba(255,180,100,0)');ctx.fillStyle=g;ctx.fillRect(-120,-120,240,240);ctx.restore()});
  ctx.globalCompositeOperation='source-over';
  // réverbères
  LAMPS.forEach((L,i)=>{const I=lampI(i,s);const x=L.x;ctx.fillStyle='#120d0d';
    ctx.beginPath();ctx.moveTo(x-9,703);ctx.lineTo(x-6,686);ctx.lineTo(x+6,686);ctx.lineTo(x+9,703);ctx.fill();
    ctx.beginPath();ctx.moveTo(x-3.6,688);ctx.lineTo(x-2.2,548);ctx.lineTo(x+2.2,548);ctx.lineTo(x+3.6,688);ctx.fill();
    ctx.fillRect(x-5,600,10,3);ctx.fillRect(x-7,546,14,3);
    ctx.beginPath();ctx.moveTo(x-6,546);ctx.lineTo(x-11,519);ctx.lineTo(x+11,519);ctx.lineTo(x+6,546);ctx.closePath();
    if(I>0){g=ctx.createLinearGradient(0,519,0,546);g.addColorStop(0,`rgba(255,236,190,${Math.min(1,.55+.5*I)})`);g.addColorStop(1,`rgba(255,180,96,${Math.min(1,.5+.5*I)})`);ctx.fillStyle=g}else ctx.fillStyle='#2d2427';
    ctx.fill();ctx.strokeStyle='#120d0d';ctx.lineWidth=1.3;ctx.stroke();ctx.beginPath();ctx.moveTo(x,519);ctx.lineTo(x,546);ctx.stroke();
    ctx.fillStyle='#120d0d';ctx.beginPath();ctx.moveTo(x-14,520);ctx.lineTo(x,508);ctx.lineTo(x+14,520);ctx.fill();ctx.fillRect(x-1,500,2,9);
  });
  // passants proches
  for(const p of PNEAR){const x=p.x0+p.v*s;if(x<-320||x>820)continue;const ph=p.ph+Math.abs(p.v)*s/(p.h*0.78)*Math.PI*2;
    if(p.g==='m')drawMan(x,714,p.h,{dir:Math.sign(p.v),phase:ph,amp:.85,cane:p.cane,tilt:0,must:true});else drawWoman(x,714,p.h,{dir:Math.sign(p.v),phase:ph,fan:p.fan})}
  // halos des réverbères
  ctx.globalCompositeOperation='lighter';
  LAMPS.forEach((L,i)=>{const I=lampI(i,s);if(!I)return;g=ctx.createRadialGradient(L.x,532,0,L.x,532,130);g.addColorStop(0,`rgba(255,200,120,${0.42*I})`);g.addColorStop(0.25,`rgba(255,170,90,${0.16*I})`);g.addColorStop(1,'rgba(255,160,80,0)');ctx.fillStyle=g;ctx.fillRect(L.x-140,392,280,280)});
  // poussières dans la lumière
  for(const m of MOTES){let x=((m.x+m.vx*s)%900+900)%900-260,y=m.y+m.vy*s+Math.sin(s*1.3+m.ph)*3;let b=0;LAMPS.forEach((L,i)=>{const I=lampI(i,s);if(I){const d2=((x-L.x)**2+(y-560)**2);b+=I*Math.exp(-d2/(2*85*85))}});if(b<0.03)continue;ctx.fillStyle=`rgba(255,215,160,${Math.min(.8,b*0.75)*(0.6+0.4*Math.sin(s*3+m.ph))})`;ctx.beginPath();ctx.arc(x,y,m.r,0,7);ctx.fill()}
  ctx.globalCompositeOperation='source-over';
  // lumière de la porte du restaurant (hors champ, à gauche)
  layer(1.0);
  {const a=sm(0.0,0.6,s)*(1-sm(2.3,3.0,s));if(a>0){ctx.globalCompositeOperation='lighter';
      ctx.save();ctx.translate(LX,722);ctx.scale(1,0.28);g=ctx.createRadialGradient(0,0,0,0,0,170);g.addColorStop(0,`rgba(255,185,105,${0.34*a})`);g.addColorStop(1,'rgba(255,185,105,0)');ctx.fillStyle=g;ctx.fillRect(-180,-180,360,360);ctx.restore();
      g=ctx.createRadialGradient(LX-30,620,0,LX-30,620,190);g.addColorStop(0,`rgba(255,180,100,${0.22*a})`);g.addColorStop(1,'rgba(255,180,100,0)');ctx.fillStyle=g;ctx.fillRect(LX-50,420,280,380);ctx.globalCompositeOperation='source-over'}}
  // Duroy
  {const x=duroyX(s);if(x>-320&&x<820){const sp=duroySpeed(s);const amp=clamp(sp/55,0,1);const ph=duroyPhase(s);
    // gestes à l'arrêt : il frise sa moustache, puis regarde sa monnaie
    let pose=null;const m1=sm(4.05,4.45,s)*(1-sm(4.95,5.3,s));const m2=sm(5.2,5.6,s)*(1-sm(6.3,6.65,s));
    if(m1>0.001)pose=[10.5,-86.5,m1];else if(m2>0.001)pose=[13,-60,m2];
    // ombre portée au sol
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(x+4,750,36,5.5,0,0,Math.PI*2);ctx.fill();
    const o={dir:1,phase:ph,amp,tilt:-0.13,lean:-0.035,must:true,pose,stance:amp<0.2,col:'#0e0a09'};
    {const T=MAIN.getTransform();
     // seule la zone de Duroy est redessinée (moins de calcul pour le halo, utile sur téléphone)
     const pad=12*DPR,bx0=Math.max(0,Math.floor(T.a*(x-75)+T.e-pad)),bx1=Math.min(OFF.width,Math.ceil(T.a*(x+80)+T.e+pad)),by0=Math.max(0,Math.floor(T.d*(750-DH*1.18)+T.f-pad)),by1=Math.min(OFF.height,Math.ceil(T.d*765+T.f+pad));
     ctx=OCTX;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(bx0,by0,bx1-bx0,by1-by0);ctx.setTransform(T);drawMan(x,750,DH,o);ctx=MAIN;
     if(bx1>bx0&&by1>by0){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.shadowColor='rgba(255,168,92,0.42)';ctx.shadowBlur=7*DPR;ctx.shadowOffsetX=-1.5*DPR;ctx.drawImage(OFF,bx0,by0,bx1-bx0,by1-by0,bx0,by0,bx1-bx0,by1-by0);ctx.restore()}ctx.setTransform(T)}
    if(m2>0.5&&o._hand){// pièces qui brillent dans sa main
      const k=DH/100,hx=x+o._hand[0]*k,hy=750+(o._hand[1])*k;
      ctx.globalCompositeOperation='lighter';
      [[-3,-5,0],[3,-6,.25],[0,-9,.5]].forEach(([dx,dy,dl])=>{const tw=Math.max(0,Math.sin((s-5.5-dl)*5));if(s<5.5+dl)return;const r=2.2+tw*5;
        g=ctx.createRadialGradient(hx+dx,hy+dy,0,hx+dx,hy+dy,r*2.2);g.addColorStop(0,`rgba(255,226,140,${0.9*(m2-0.5)*2})`);g.addColorStop(1,'rgba(255,200,90,0)');ctx.fillStyle=g;ctx.fillRect(hx+dx-r*3,hy+dy-r*3,r*6,r*6);
        ctx.strokeStyle=`rgba(255,240,190,${tw*(m2-0.5)*1.6})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(hx+dx-r,hy+dy);ctx.lineTo(hx+dx+r,hy+dy);ctx.moveTo(hx+dx,hy+dy-r);ctx.lineTo(hx+dx,hy+dy+r);ctx.stroke()});
      ctx.globalCompositeOperation='source-over'}
  }}
  // finitions écran
  screen();
  g=ctx.createRadialGradient(CWL/2,CHL*0.55,CHL*0.24,CWL/2,CHL*0.55,CHL*0.73);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,OPT.wide?'rgba(6,3,4,0.45)':'rgba(6,3,4,0.62)');ctx.fillStyle=g;ctx.fillRect(0,0,CWL,CHL);
  ctx.globalAlpha=0.06;ctx.globalCompositeOperation='overlay';const fr=Math.floor(s*30);const ox=(h1(fr)*256)|0,oy=(h1(fr+.5)*256)|0;
  for(let x=-ox;x<CWL;x+=256)for(let y=-oy;y<CHL;y+=256)ctx.drawImage(GRAIN,x,y);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}


  const caps = {
    c1: 'Paris · le 28 juin',
    c2: '« Il lui restait juste en poche trois francs quarante pour finir le mois. »',
    k: 'Bel‑Ami · Épisode 1',
    t: 'Trois francs<br>quarante'
  };
  function frame(s, set) {
    draw(s);
    screen();
    if (OPT.wide) return;
    const a = Math.max(1 - sm(0, 1.0, s), sm(8.3, 9.4, s));
    if (a > 0) { ctx.fillStyle = 'rgba(23,19,15,' + a + ')'; ctx.fillRect(0, 0, CWL, CHL); }
    set('c1', sm(0.6, 1.4, s) * (1 - sm(3.7, 4.3, s)), (1 - sm(0.6, 1.4, s)) * 6);
    set('c2', sm(4.9, 5.6, s) * (1 - sm(7.6, 8.2, s)), (1 - sm(4.9, 5.6, s)) * 8);
    const a3 = sm(8.6, 9.4, s); set('c3', a3, (1 - a3) * 8);
  }
  // bandeau : 6,3 s d'animation, puis l'image s'arrête sur Duroy, ses pièces à la main, sous les réverbères
  return { dur: 10, banner: 6.3, caps, frame };
};

const ICO76 = {
  big: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
};
{
  const st = document.createElement('style');
  st.textContent = `
/* v75 : ouverture animée en plein écran (au toucher sur le bandeau) */
.o75 { position: fixed; inset: 0; z-index: 80; background: #0b0907; overflow: hidden; opacity: 1; transition: opacity .45s ease; }
.o75.out { opacity: 0; }
.o75-stage { position: absolute; left: 0; top: 0; width: 432px; height: 768px; transform-origin: 0 0; overflow: hidden; background: #17130f; color: #f4ede3; }
.o75-stage canvas { position: absolute; left: 0; top: 0; width: 432px; height: 768px; }
.o75-c { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; pointer-events: none; }
.o75-c1, .o75-k { font: 600 11px/1.3 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .32em; text-transform: uppercase; }
.o75-c1 { top: 74px; color: rgba(244,237,227,.86); }
.o75-c2 { top: 96px; padding: 0 40px; font: italic 400 19px/1.38 Spectral, Georgia, serif; text-shadow: 0 1px 14px rgba(10,6,4,.9), 0 0 3px rgba(10,6,4,.6); }
.o75-c3 { top: 300px; }
.o75-k { color: rgba(244,237,227,.62); }
.o75-t { font-family: "Bodoni Moda", Didot, Georgia, serif; font-style: italic; font-size: 40px; font-variation-settings: 'opsz' 28; line-height: 1.05; margin-top: 12px; }
.o75-r { width: 34px; height: 1px; background: #d9a521; margin: 16px auto 0; opacity: .8; }
.o75-skip { position: absolute; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  font: 600 13px "Schibsted Grotesk", system-ui, sans-serif; color: rgba(244,237,227,.88); background: rgba(23,19,15,.55);
  border: 1px solid rgba(244,237,227,.22); border-radius: 999px; padding: 9px 15px; cursor: pointer; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.o75-btn { width: 100%; margin-top: 14px; }
/* v76 : le bandeau vivant en tête du chapitre */
.ov76 { position: relative; margin: 4px auto 22px; max-width: 560px; aspect-ratio: 4 / 3; border-radius: 14px; overflow: hidden; background: #2a2131;
  cursor: pointer; box-shadow: 0 12px 28px -14px rgba(10,6,4,.55); -webkit-tap-highlight-color: transparent; outline-offset: 3px; }
.ov76 canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ov76-c { position: absolute; left: 14px; top: 12px; margin: 0; font: 600 10px/1.2 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .28em;
  text-transform: uppercase; color: rgba(244,237,227,.9); text-shadow: 0 1px 8px rgba(8,5,6,.7); pointer-events: none; }
.ov76-b { position: absolute; bottom: 10px; width: 32px; height: 32px; border-radius: 50%; border: 0; padding: 0; display: grid; place-items: center;
  background: rgba(23,19,15,.55); color: #f4ede3; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); cursor: pointer; }
.ov76-b svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ov76-big { right: 10px; pointer-events: none; }
.ov76-snd { left: 10px; }
`;
  document.head.append(st);
}

// --- plein écran ---
const ouvEl = el('div', 'o75'); ouvEl.id = 'ouverture75'; ouvEl.hidden = true;
ouvEl.setAttribute('role', 'dialog'); ouvEl.setAttribute('aria-label', 'Ouverture animée du chapitre');
ouvEl.innerHTML = '<div class="o75-stage"><canvas aria-hidden="true"></canvas>'
  + '<div class="o75-c o75-c1"></div><div class="o75-c o75-c2"></div>'
  + '<div class="o75-c o75-c3"><div class="o75-k"></div><div class="o75-t"></div><div class="o75-r"></div></div></div>'
  + '<button class="o75-skip" type="button">Fermer ›</button>';
document.body.append(ouvEl);
if (!S.ouv || typeof S.ouv !== 'object') S.ouv = {};
let ouvOpen = null;   // { finish }
function ouvData(ci) { const a = AVANT[ci]; return a && a.ouverture && OUV_SCENES[a.ouverture.scene] ? a.ouverture : null; }
function ouvKey(ci) { return BOOK.id + ':' + ci; }
const sonOk76 = () => S.sound && S.amb !== false;
function playOuverture(ci, then) {
  const o = ouvData(ci);
  if (!o || ouvOpen) { if (then) then(); return; }
  stopBanners76();
  const st = $('.o75-stage', ouvEl), cv = $('canvas', ouvEl);
  // téléphone : plein écran (un peu recadré sur les côtés) ; écran large : la scène entière
  const fit = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const k = w / h < 432 / 768 ? Math.max(w / 432, h / 768) : Math.min(w / 432, h / 768);
    st.style.transform = 'translate(' + ((w - 432 * k) / 2) + 'px,' + ((h - 768 * k) / 2) + 'px) scale(' + k + ')';
    return k;
  };
  const k = fit();
  const sc = OUV_SCENES[o.scene](cv, Math.min(2, (window.devicePixelRatio || 1) * k));
  const box = { c1: $('.o75-c1', ouvEl), c2: $('.o75-c2', ouvEl), c3: $('.o75-c3', ouvEl) };
  box.c1.textContent = sc.caps.c1; box.c2.textContent = sc.caps.c2;
  $('.o75-k', ouvEl).textContent = sc.caps.k; $('.o75-t', ouvEl).innerHTML = sc.caps.t;
  const set = (id, a, dy) => { const e = box[id]; e.style.opacity = a.toFixed(3); e.style.transform = 'translateY(' + (dy || 0).toFixed(2) + 'px)'; };
  let au = null;
  if (S.sound && o.son) {
    try { au = new Audio(o.son); au.volume = 0.9; const p = au.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { au = null; }
  }
  const t0 = performance.now();
  let raf = 0, done = false;
  const finish = (go) => {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
    document.removeEventListener('visibilitychange', onVis);
    if (au) { const a = au; const f = () => { if (a.volume > 0.06) { a.volume = Math.max(0, a.volume - 0.08); setTimeout(f, 40); } else a.pause(); }; f(); }
    ouvEl.classList.add('out');
    setTimeout(() => { ouvEl.hidden = true; ouvEl.classList.remove('out'); ouvOpen = null; if (go !== false && then) then(); }, 450);
  };
  const onVis = () => { if (document.hidden) finish(false); };
  const loop = () => {
    if (done) return;
    const t = (performance.now() - t0) / 1000;
    sc.frame(Math.min(t, sc.dur), set);
    if (t >= sc.dur) { finish(true); return; }
    raf = requestAnimationFrame(loop);
  };
  ouvOpen = { finish };
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', onVis);
  ouvEl.classList.remove('out'); ouvEl.hidden = false;
  sc.frame(0, set);
  raf = requestAnimationFrame(loop);
}
$('.o75-skip', ouvEl).addEventListener('click', () => { if (ouvOpen) ouvOpen.finish(true); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvOpen) ouvOpen.finish(true); });

// --- le bandeau vivant, en tête du chapitre ---
const BAN76 = new Set();   // bandeaux en cours d'animation
function stopBanners76() { BAN76.forEach((b) => b.stop()); }
function bannerInit76(fig) {
  if (fig._sc) return fig._sc;
  const ci = +fig.dataset.ci, o = ouvData(ci);
  const w = fig.clientWidth || 360;
  fig._sc = OUV_SCENES[o.scene]($('canvas', fig), Math.min(2.5, Math.max(1, (window.devicePixelRatio || 1) * w / 400)), { wide: true });
  return fig._sc;
}
function bannerStill76(fig) { const sc = bannerInit76(fig); sc.frame(sc.banner); fig.dataset.state = 'still'; fig.classList.add('end'); }
function bannerPlay76(fig) {
  const ci = +fig.dataset.ci, o = ouvData(ci), sc = bannerInit76(fig);
  S.ouv[ouvKey(ci)] = 1; persist();
  fig.dataset.state = 'play'; fig.classList.remove('end'); animStart79(fig);
  const snd = $('.ov76-snd', fig);
  let au = null;
  if (sonOk76() && o.son) {
    try { au = new Audio(o.son); au.volume = 0.7; const p = au.play(); if (p && p.catch) p.catch(() => { snd.hidden = true; }); snd.hidden = false; snd.innerHTML = ICO76.on; } catch (e) { au = null; }
  }
  const t0 = performance.now();
  let raf = 0;
  const end = sc.banner;
  const fadeOut = () => { if (!au) return; const a = au; au = null; const f = () => { if (a.volume > 0.05) { a.volume = Math.max(0, a.volume - 0.05); setTimeout(f, 50); } else { a.pause(); snd.hidden = true; } }; f(); };
  const h = {
    stop() { cancelAnimationFrame(raf); BAN76.delete(h); fadeOut(); snd.hidden = true; if (fig.isConnected) bannerStill76(fig); animDone79(fig); },
    mute() { if (au) { au.muted = !au.muted; snd.innerHTML = au.muted ? ICO76.off : ICO76.on; snd.setAttribute('aria-label', au.muted ? 'Remettre le son' : 'Couper le son'); } }
  };
  fig._h = h;
  BAN76.add(h);
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    if (!fig.isConnected || document.hidden) { h.stop(); return; }
    sc.frame(Math.min(t, end));
    if (t >= end - 0.8) fadeOut();
    if (t >= end) { BAN76.delete(h); fig.dataset.state = 'still'; fig.classList.add('end'); animDone79(fig); return; }
    raf = requestAnimationFrame(loop);
  };
  sc.frame(0);
  raf = requestAnimationFrame(loop);
}
const io76 = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    const fig = en.target;
    if (!en.isIntersecting || fig.dataset.state) return;
    const ci = +fig.dataset.ci;
    const due = !REDUCED && !S.ouv[ouvKey(ci)] && !byId('reader').hidden;
    // en lecture Immersive, l'animation attend que la lecture arrive au chapitre (elle la mettra alors en pause)
    if (due && waitReach79(CHAPS[ci].a)) { if (!fig._sc) { try { bannerInit76(fig).frame(0); } catch (e) { /* rien */ } } return; }
    if (due) bannerPlay76(fig); else bannerStill76(fig);
  });
}, { threshold: 0.55 }) : null;
function makeBanner76(ci) {
  const o = ouvData(ci);
  const fig = el('figure', 'ov76'); fig.dataset.ci = String(ci);
  fig.tabIndex = 0; fig.setAttribute('role', 'button');
  fig.setAttribute('aria-label', (o.titre || 'Ouverture du chapitre') + ' : voir en plein écran');
  fig.innerHTML = '<canvas aria-hidden="true"></canvas><figcaption class="ov76-c"></figcaption>'
    + '<button type="button" class="ov76-b ov76-snd" aria-label="Couper le son" hidden></button>'
    + '<span class="ov76-b ov76-big" aria-hidden="true">' + ICO76.big + '</span>'
    + '<button type="button" class="ill-skip">Passer ›</button>';
  $('.ov76-c', fig).textContent = o.legende || '';
  { const e0 = CHAPS[ci] && CHAPS[ci].eps ? CHAPS[ci].eps[0] : -1; if (e0 >= 0) fig.insertBefore(endCard78(e0, true), $('.ov76-b', fig)); }
  // le bandeau ne met pas la lecture en pause ni ne la relance : ses touchers restent à lui
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((t) => fig.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
  $('.ov76-snd', fig).addEventListener('click', (e) => { e.stopPropagation(); if (fig._h) fig._h.mute(); });
  $('.ill-skip', fig).addEventListener('click', (e) => { e.stopPropagation(); skipAnim79(fig); });
  const open = (e) => { e.stopPropagation(); if (e.target.closest('.ov76-snd, .ill-skip')) return; if (playing) pause(); unlockAudio(); playOuverture(ci); };
  fig.addEventListener('click', open);
  fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  if (io76) io76.observe(fig); else setTimeout(() => bannerStill76(fig), 0);
  return fig;
}
// (le bandeau est posé dans la page par la v77, avec les vignettes)
// « Avant de lire » : un bouton pour voir l'ouverture en plein écran
const ouvBtn = el('button', 'btn o75-btn', '▶ Voir l’ouverture animée'); ouvBtn.type = 'button'; ouvBtn.hidden = true;
$('#avDl', avSheet).after(ouvBtn);
ouvBtn.addEventListener('click', () => {
  const a = avOpen; if (!a) return;
  avOpen = null; avSheet.hidden = true; unlockAudio();
  const then = a.then;
  playOuverture(a.ci, () => { if (then && !byId('reader').hidden) { if (typeof then === 'function') then(); else play(); } });
});
{
  const sa = showAvant;
  showAvant = function (ci, then) { sa(ci, then); ouvBtn.hidden = !ouvData(ci); };
  const cs = closeSheets;
  closeSheets = function () { cs(); if (ouvOpen) ouvOpen.finish(false); };
  // mode Immersif, à l'arrêt au tout début du chapitre : la page descend un peu pour montrer le bandeau en entier
  // (la ligne lue reste plus bas ; dès qu'on lance la lecture, la page reprend sa place en glissant)
  function showBanner76() {
    if (pvUserScroll) return;
    for (let ci = 0; ci < CHAPS.length; ci++) {
      const ch = CHAPS[ci];
      if (!ouvData(ci) || k < ch.a || k > ch.a + 2) continue;
      const fig = pvIn.querySelector('.ov76[data-ci="' + ci + '"]');
      if (!fig) return;
      const head = fig.previousElementSibling && fig.previousElementSibling.matches('p.tchap') ? fig.previousElementSibling : fig;
      const y = Math.max(0, Math.round(head.getBoundingClientRect().top - pvIn.getBoundingClientRect().top - (head === fig ? 46 : 22)));
      if (pvAnim) { if (pvTarget > y) pvTarget = y; } else if (pageview.scrollTop > y + 2) { pageview.scrollTop = y; pvTarget = y; }
      return;
    }
  }
  const rp = renderPage;
  renderPage = function (c) { rp(c); if (!playing && S.read === 'page') showBanner76(); };
  if (typeof txStart === 'function') {
    const tx = txStart;
    txStart = function () { const r = tx.apply(this, arguments); if (S.read === 'texte') showBanner76(); return r; };
  }
  // en quittant la lecture, le bandeau se tait
  const sc = showCover;
  showCover = function () { stopBanners76(); return sc.apply(this, arguments); };
}
window.__v75 = window.__v76 = { OUV_SCENES, playOuverture, makeBanner76, stopBanners76, get ouvOpen() { return ouvOpen; }, BAN76 };

/* ================= Versions 77 et 78 =================
   v77 : une illustration en tête de certains épisodes, dans le style du bandeau du chapitre, avec une courte légende tirée du texte.
   v78 : ce sont de petites animations (5 à 6 s, sans son) qui se jouent une fois quand elles arrivent à l'écran,
   puis s'arrêtent sur le carton « Épisode X » et le titre de l'épisode (qui remplace alors le titre écrit au-dessus).
   Un toucher sur l'animation la rejoue. Bel-Ami, chapitre I : épisodes 3 (la terrasse), 4 (place de l'Opéra),
   6 (La Vie Française), 9 (le trapèze). Données dans le livre : vignettes = [{ ep, id, legende, alt }] (ep à partir de 0). */
/* Petites animations d'épisode (ombres chinoises, même style que le bandeau du chapitre). Toile logique 400 × 200.
   VIG76(toile, densité, id) -> { dur, frame(t), refresh() } ; frame(t) dessine l'instant t (en secondes), de 0 à dur. */
const VIG76 = function (cv, DPR, id) {
  const W = 400, H = 200;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  let ctx = cv.getContext('2d');
  let S = 0;
/* ---------- utilitaires ---------- */
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,k)=>a+(b-a)*k;
const sm=(a,b,x)=>{const k=clamp((x-a)/(b-a));return k*k*(3-2*k)};
const eio=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
function h1(n){const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)}
function vn(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(h1(i),h1(i+1),u)}

/* ---------- personnages ---------- */
const INK='#110d0c';
function ik(sx,sy,tx,ty,l1,l2,bend){let dx=tx-sx,dy=ty-sy;let d=Math.hypot(dx,dy);const m=l1+l2-0.01;if(d>m){dx*=m/d;dy*=m/d;d=m}
  const a=Math.atan2(dy,dx),c=clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1),b=Math.acos(c)*bend;return [sx+Math.cos(a+b)*l1,sy+Math.sin(a+b)*l1,sx+dx,sy+dy]}
function limb(pts,w){ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.stroke()}
function legs(phase,amp,stance){
  const out=[];let low=0;
  for(let i=0;i<2;i++){const p=phase+i*Math.PI;let a=amp*0.42*Math.sin(p)+(stance?(i?-.09:.09):0);const bend=0.75*amp*Math.max(0,Math.cos(p));
    const kx=Math.sin(a)*24,ky=Math.cos(a)*24;const fx=kx+Math.sin(a-bend)*24,fy=ky+Math.cos(a-bend)*24;out.push([kx,ky,fx,fy,a-bend]);low=Math.max(low,fy)}
  return {out,low}
}
function drawMan(x,y,h,o){
  const dir=o.dir||1,ph=o.phase||0,amp=o.amp??1;
  ctx.save();ctx.translate(x,y);ctx.scale(dir*h/100,h/100);ctx.fillStyle=ctx.strokeStyle=o.col||INK;ctx.lineCap='round';ctx.lineJoin='round';
  const L=legs(ph,amp,o.stance);const hy=-L.low;// hanche
  ctx.save();ctx.translate(0,hy);
  for(const [kx,ky,fx,fy,a] of L.out){limb([0,0,kx,ky],6.2);limb([kx,ky,fx,fy],5.0);ctx.beginPath();ctx.ellipse(fx+3.4,fy-0.6,4.6,1.9,0,0,Math.PI*2);ctx.fill()}
  ctx.restore();
  const by=hy+48;// décalage du buste (0 au repos)
  ctx.save();ctx.translate(0,by);ctx.rotate(o.lean||0);
  // bras arrière
  const sw=amp*0.38*Math.sin(ph);
  const sh=[1,-78];
  const armRest=(sg)=>{const a=-sg;return [sh[0]+Math.sin(a)*15,sh[1]+Math.cos(a)*15,sh[0]+Math.sin(a)*15+Math.sin(a+.25)*14,sh[1]+Math.cos(a)*15+Math.cos(a+.25)*14]};
  {const p=armRest(-sw);limb([sh[0],sh[1],p[0],p[1],p[2],p[3]],4.6)}
  // redingote
  ctx.beginPath();ctx.moveTo(-9.5,-81);ctx.lineTo(8.5,-81.5);ctx.quadraticCurveTo(13.5,-74,11,-65);ctx.lineTo(8.2,-57);ctx.lineTo(10.5,-39);ctx.lineTo(1,-42);ctx.lineTo(-14.5,-34);ctx.lineTo(-10.5,-57);ctx.quadraticCurveTo(-12,-72,-9.5,-81);ctx.fill();
  ctx.fillRect(-3,-87,6.5,8);
  // tête
  ctx.beginPath();ctx.arc(1,-91,6.6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(7,-93);ctx.lineTo(9.2,-89.6);ctx.lineTo(7,-88.6);ctx.fill();
  if(o.must){ctx.beginPath();ctx.moveTo(5,-87.6);ctx.quadraticCurveTo(9,-88.6,11.5,-86.4);ctx.quadraticCurveTo(9,-86.6,6,-85.8);ctx.fill()}
  // chapeau haut-de-forme
  if(!o.nohat){ctx.save();ctx.translate(1,-96);ctx.rotate(o.tilt||0);
  ctx.beginPath();ctx.ellipse(0,0,10,1.9,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6.4,0);ctx.lineTo(7,-15.5);ctx.quadraticCurveTo(0.4,-16.6,-6.6,-15.5);ctx.closePath();ctx.fill();
  ctx.restore();}else{ctx.beginPath();ctx.arc(0.5,-95,5.6,Math.PI*1.05,Math.PI*1.95);ctx.fill()}
  if(o.apron){ctx.save();ctx.fillStyle=o.apron;ctx.beginPath();ctx.moveTo(-6,-58);ctx.lineTo(9,-58);ctx.lineTo(10.5,-14);ctx.lineTo(-5,-14);ctx.closePath();ctx.fill();ctx.restore()}
  // bras avant
  if(o.pose){const p=o.pose;const a0=armRest(sw);const tx=lerp(a0[2],p[0],p[2]),ty=lerp(a0[3],p[1],p[2]);const e=ik(sh[0]+1,sh[1],tx,ty,15,14,-1);limb([sh[0]+1,sh[1],e[0],e[1],e[2],e[3]],4.8);ctx.beginPath();ctx.arc(e[2],e[3],2.6,0,Math.PI*2);ctx.fill();o._hand=[e[2],e[3]]}
  else{const p=armRest(sw);limb([sh[0]+1,sh[1],p[0],p[1],p[2],p[3]],4.8);
    if(o.cane){ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(p[2],p[3]);ctx.lineTo(p[2]+7+Math.sin(ph)*5,-L.low+48+0.5);ctx.stroke()}}
  ctx.restore();
  ctx.restore();
}
function drawWoman(x,y,h,o){
  const dir=o.dir||1,ph=o.phase||0;
  ctx.save();ctx.translate(x,y);ctx.scale(dir*h/100,h/100);ctx.fillStyle=ctx.strokeStyle=o.col||INK;ctx.lineCap='round';ctx.lineJoin='round';
  const bob=-0.9*Math.abs(Math.sin(ph));const sw=1.6*Math.sin(ph);
  ctx.translate(0,bob);
  // jupe à tournure
  ctx.beginPath();ctx.moveTo(-6.5,-58);ctx.lineTo(6.5,-58);ctx.quadraticCurveTo(9,-30,12.5+sw*.4,0.5);ctx.lineTo(-15+sw*.4,0.5);ctx.quadraticCurveTo(-15,-22,-16,-36);ctx.quadraticCurveTo(-22,-46,-9,-57);ctx.closePath();ctx.fill();
  // corsage
  ctx.beginPath();ctx.moveTo(-5.5,-59);ctx.lineTo(5.5,-59);ctx.quadraticCurveTo(8.5,-70,6.5,-77);ctx.lineTo(-6,-77.5);ctx.quadraticCurveTo(-7.5,-68,-5.5,-59);ctx.fill();
  ctx.fillRect(-2.6,-82,5.4,6);
  ctx.beginPath();ctx.arc(0.8,-86,5.7,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(-4.4,-87.5,3.4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(6.2,-88);ctx.lineTo(8,-85.2);ctx.lineTo(6,-84.6);ctx.fill();
  // petit chapeau + plume
  if(!o.nohat){ctx.save();ctx.translate(1,-91);ctx.rotate(-0.18);ctx.beginPath();ctx.ellipse(0,0,8,2,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(0.5,-3,4.6,3.2,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-2,-4);ctx.quadraticCurveTo(-9,-12,-13,-7);ctx.stroke();ctx.restore();}else{ctx.beginPath();ctx.arc(-2.5,-90.5,3.8,0,Math.PI*2);ctx.fill()}
  // bras
  ctx.lineWidth=4.4;
  if(o.fan){ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(6,-64);ctx.lineTo(10,-71);ctx.stroke();const fa=0.25*Math.sin(S*9+ph);ctx.save();ctx.translate(10.5,-72);ctx.rotate(-0.9+fa);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,8,-0.7,0.7);ctx.closePath();ctx.fill();ctx.restore()}
  else if(o.pose){const e=ik(1,-75,o.pose[0],o.pose[1],13,12,-1);ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(e[0],e[1]);ctx.lineTo(e[2],e[3]);ctx.stroke();o._hand=[e[2],e[3]];}
  else{ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(3+sw*.6,-62);ctx.lineTo(6,-56);ctx.stroke()}
  ctx.restore();
}
function drawSeated(x,y,h,g,raise,s){
  ctx.save();ctx.translate(x,y);ctx.scale(h/100,h/100);ctx.fillStyle=ctx.strokeStyle='#120d0d';ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.lineTo(7,-30);ctx.lineTo(-7,-30);ctx.fill();
  ctx.beginPath();ctx.arc(0,-37,6.5,0,Math.PI*2);ctx.fill();
  if(g==='m'){ctx.fillRect(-6,-52,12,10);ctx.beginPath();ctx.ellipse(0,-43,10,2,0,0,Math.PI*2);ctx.fill()}else{ctx.beginPath();ctx.ellipse(0,-44,8,3,0,0,Math.PI*2);ctx.fill()}
  let up=0;if(raise){up=sm(raise[0],raise[0]+.35,s)*(1-sm(raise[1]-.35,raise[1],s))}
  ctx.lineWidth=4.5;ctx.beginPath();ctx.moveTo(4,-24);ctx.lineTo(13,-14+(-14)*up);ctx.stroke();
  ctx.restore();
  return up;
}
function drawFiacre(x,y,sc,dir,dist,s){
  ctx.save();ctx.translate(x,y);ctx.scale(dir*sc,sc);ctx.fillStyle=ctx.strokeStyle='#18120f';ctx.lineCap='round';ctx.lineJoin='round';
  // voiture (derrière le cheval)
  const wr=dist/18,wf=dist/14;
  const wheel=(cx,cy,r,a)=>{ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1.1;for(let k=0;k<12;k++){const t=a+k*Math.PI/6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(t)*r,cy+Math.sin(t)*r);ctx.stroke()}ctx.beginPath();ctx.arc(cx,cy,2.4,0,Math.PI*2);ctx.fill()};
  ctx.beginPath();ctx.moveTo(-98,-28);ctx.lineTo(-98,-66);ctx.quadraticCurveTo(-96,-74,-86,-74);ctx.lineTo(-56,-74);ctx.lineTo(-48,-56);ctx.lineTo(-40,-50);ctx.lineTo(-40,-34);ctx.quadraticCurveTo(-60,-26,-98,-28);ctx.fill();
  // siège et cocher
  ctx.fillRect(-52,-60,14,4);
  ctx.beginPath();ctx.moveTo(-50,-60);ctx.lineTo(-40,-60);ctx.lineTo(-41,-80);ctx.lineTo(-49,-80);ctx.fill();
  ctx.beginPath();ctx.arc(-45,-85,4.6,0,Math.PI*2);ctx.fill();
  ctx.fillRect(-49,-99,8,11);ctx.beginPath();ctx.ellipse(-45,-88.5,7,1.4,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-40,-72);ctx.quadraticCurveTo(-10,-108,24,-92);ctx.stroke();
  // fenêtre éclairée
  ctx.fillStyle='rgba(246,190,110,0.85)';ctx.fillRect(-88,-66,22,15);ctx.fillStyle='#18120f';
  wheel(-80,-17,17,wr);wheel(-46,-13,13,wf);
  // brancards
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-42,-34);ctx.lineTo(10,-40);ctx.stroke();
  // cheval (trot : paires diagonales)
  const gp=dist/46*Math.PI*2;const bob=-1.4*Math.abs(Math.sin(gp));
  ctx.save();ctx.translate(0,bob);
  const leg=(hx,p,back)=>{const a=0.42*Math.sin(p);const lift=Math.max(0,Math.cos(p))*0.9;const kx=hx+Math.sin(a)*15,ky=-30+Math.cos(a)*15;const b2=back?a+lift:a-lift;ctx.lineWidth=3.6;ctx.beginPath();ctx.moveTo(hx,-34);ctx.lineTo(kx,ky);ctx.lineTo(kx+Math.sin(b2)*16,ky+Math.cos(b2)*16);ctx.stroke()};
  leg(-12,gp+Math.PI,true);leg(18,gp,false);
  ctx.beginPath();ctx.ellipse(3,-40,24,10.5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(16,-46);ctx.lineTo(27,-66);ctx.lineTo(33,-67);ctx.lineTo(27,-36);ctx.fill();
  ctx.beginPath();ctx.moveTo(27,-66);ctx.lineTo(31,-73);ctx.lineTo(33,-69);ctx.lineTo(45,-56);ctx.quadraticCurveTo(44,-52,40,-53);ctx.lineTo(31,-60);ctx.fill();
  ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-20,-44);ctx.quadraticCurveTo(-27,-38,-25,-24);ctx.stroke();
  leg(-17,gp,true);leg(13,gp+Math.PI,false);
  ctx.restore();
  ctx.restore();
}


  const base = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const MAIN = ctx, OFF = document.createElement('canvas'); OFF.width = cv.width; OFF.height = cv.height; const OC = OFF.getContext('2d');
  // personnages en contre-jour : dessinés à part, puis posés d'un seul tenant avec un liseré de lumière chaude
  function rim(fn, blur, a) {
    OC.setTransform(1, 0, 0, 1, 0, 0); OC.clearRect(0, 0, OFF.width, OFF.height);
    ctx = OC; base(); fn(); ctx = MAIN;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.shadowColor = 'rgba(255,168,92,' + (a || 0.5) + ')'; ctx.shadowBlur = (blur || 6) * DPR; ctx.shadowOffsetX = -1.2 * DPR;
    ctx.drawImage(OFF, 0, 0); ctx.restore(); base();
  }
  const eo = (x) => 1 - Math.pow(1 - clamp(x), 2.2);       // arrivée en douceur
  const walkTo = (t, t0, t1, x0, x1) => lerp(x0, x1, eo((t - t0) / (t1 - t0)));
  function glow(x, y, r, rgb, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function lamp(x, yb, h, I) {
    ctx.fillStyle = '#110c0c';
    ctx.beginPath(); ctx.moveTo(x - 5, yb); ctx.lineTo(x - 3.4, yb - 10); ctx.lineTo(x + 3.4, yb - 10); ctx.lineTo(x + 5, yb); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 2, yb - 9); ctx.lineTo(x - 1.2, yb - h + 16); ctx.lineTo(x + 1.2, yb - h + 16); ctx.lineTo(x + 2, yb - 9); ctx.fill();
    const ly = yb - h;
    ctx.beginPath(); ctx.moveTo(x - 3.5, ly + 16); ctx.lineTo(x - 6.5, ly + 2); ctx.lineTo(x + 6.5, ly + 2); ctx.lineTo(x + 3.5, ly + 16); ctx.closePath();
    const g = ctx.createLinearGradient(0, ly, 0, ly + 16); g.addColorStop(0, 'rgba(255,238,195,' + I + ')'); g.addColorStop(1, 'rgba(255,182,98,' + I + ')');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#110c0c'; ctx.beginPath(); ctx.moveTo(x - 8.5, ly + 2.5); ctx.lineTo(x, ly - 5); ctx.lineTo(x + 8.5, ly + 2.5); ctx.fill();
    glow(x, ly + 9, 70, '255,190,110', 0.38 * I);
  }
  const GR = (() => { const r = rng(77), a = []; for (let i = 0; i < 900; i++) a.push([r() * W, r() * H]); return a; })();
  function finish(vig, t) {
    base();
    const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(6,3,4,' + (vig || 0.5) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // grain léger, qui bouge un peu
    const o = (Math.floor(t * 24) % 7) * 13;
    ctx.fillStyle = 'rgba(255,240,220,0.035)';
    for (let i = 0; i < GR.length; i++) ctx.fillRect((GR[i][0] + o) % W, (GR[i][1] + o * 0.7) % H, 0.7, 0.7);
  }
  function seated(x, y, h, g, up, hatTall) {
    ctx.save(); ctx.translate(x, y); ctx.scale(h / 100, h / 100); ctx.fillStyle = ctx.strokeStyle = '#120c0d'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(8, -32); ctx.lineTo(-8, -32); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -40, 7, 0, Math.PI * 2); ctx.fill();
    if (g === 'm') { if (hatTall) ctx.fillRect(-6.5, -60, 13, 14); else { ctx.beginPath(); ctx.ellipse(0, -48, 7, 5, 0, Math.PI, 0); ctx.fill(); } ctx.beginPath(); ctx.ellipse(0, -46, 11, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(0, -47, 9, 3.4, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-3, -49); ctx.quadraticCurveTo(-11, -60, -15, -53); ctx.stroke(); }
    const hy = lerp(-14, -40, up), hx = lerp(14, 11, up);
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(5, -26); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,120,0.9)'; ctx.fillRect(hx - 2, hy - 9, 4.5, 9);
    ctx.restore();
  }
  // 0 -> 1 -> 0 : un verre levé puis reposé
  const lift = (t, t0) => sm(t0, t0 + 0.4, t) * (1 - sm(t0 + 1.1, t0 + 1.5, t));

  /* ---------- épisode 3 : la terrasse du café ; Duroy passe et jauge les consommateurs ---------- */
  const CAFE_WIN = (() => { const r = rng(31), a = []; for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) a.push({ x: 10 + i * 33, y: 4 + row * 20, on: r() < 0.5 ? -1 : (r() < 0.35 ? 0.6 + r() * 4 : 99) }); return a; })();
  function cafe(t) {
    base();
    ctx.fillStyle = '#251b1f'; ctx.fillRect(0, 0, W, H);
    let g = ctx.createLinearGradient(0, 0, 0, 46); g.addColorStop(0, '#30242b'); g.addColorStop(1, '#3a2b31'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 46);
    CAFE_WIN.forEach((w) => { const a = w.on < 0 ? 1 : sm(w.on, w.on + 0.4, t); ctx.fillStyle = '#1d151a'; ctx.fillRect(w.x - 1, w.y - 1, 13, 15); ctx.fillStyle = '#2b2128'; ctx.fillRect(w.x, w.y, 11, 13); if (a > 0) { ctx.fillStyle = 'rgba(244,178,96,' + (0.85 * a) + ')'; ctx.fillRect(w.x, w.y, 11, 13); } });
    ctx.fillStyle = '#1b1317'; ctx.fillRect(0, 44, W, 2); for (let x = 2; x < W; x += 3) ctx.fillRect(x, 38, 0.8, 6);
    ctx.fillStyle = '#16100f'; ctx.fillRect(0, 46, W, 14);
    ctx.font = "600 9px 'Bodoni Moda', Didot, Georgia, serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(244,214,160,.95)'; ctx.fillText('C A F É  ·  G L A C I E R  ·  R E S T A U R A N T', W / 2, 53.5);
    g = ctx.createLinearGradient(0, 74, 0, 152); g.addColorStop(0, 'rgba(255,200,124,1)'); g.addColorStop(1, 'rgba(206,120,66,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 74, W, 78);
    for (let i = 0; i < 4; i++) glow(50 + i * 100, 92, 34, '255,240,200', 0.46 + 0.06 * vn(t * 3 + i * 5));
    ctx.fillStyle = 'rgba(70,34,22,.55)'; for (let x = 0; x <= W; x += 50) ctx.fillRect(x - 1.5, 74, 3, 78);
    drawMan(118 + 10 * Math.sin(t * 0.6), 152, 52, { dir: 1, phase: t * 3, amp: 0.25, col: 'rgba(90,45,30,.55)' });
    drawMan(262, 152, 50, { dir: -1, phase: 0, amp: 0, stance: true, col: 'rgba(90,45,30,.5)' });
    const n = 22;
    for (let k = 0; k < n; k++) { const xa = k * W / n, xb = (k + 1) * W / n; ctx.fillStyle = k % 2 ? '#8f3f2f' : '#bea686'; ctx.beginPath(); ctx.moveTo(xa, 60); ctx.lineTo(xb, 60); ctx.lineTo(xb, 78); ctx.lineTo(xa, 78); ctx.fill(); ctx.beginPath(); ctx.arc((xa + xb) / 2, 78, W / n / 2, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = 'rgba(10,6,6,.3)'; ctx.fillRect(0, 74, W, 4);
    g = ctx.createLinearGradient(0, 150, 0, H); g.addColorStop(0, '#3a2a26'); g.addColorStop(1, '#1d1617'); ctx.fillStyle = g; ctx.fillRect(0, 150, W, 50);
    glow(200, 160, 220, '255,170,90', 0.14);
    // les consommateurs boivent, chacun à son tour
    const T = [[34, 0.3, 2.6], [86, 1.4, 3.9], [140, 0.8, 3.2], [196, 2.0, 4.6], [250, 1.1, 3.6]];
    T.forEach(([x, a, b], i) => {
      seated(x - 13, 186, 52, i % 2 ? 'm' : 'f', lift(t, a), i % 3 === 0);
      seated(x + 13, 186, 54, 'm', lift(t, b), i % 2 === 0);
      ctx.fillStyle = '#120c0d'; ctx.beginPath(); ctx.ellipse(x, 172, 10, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 0.8, 172, 1.6, 16);
    });
    // le garçon traverse la terrasse, plateau levé
    const wx = walkTo(t, 0, 3.4, 330, 284), wsp = t < 3.4 ? 1 : 0;
    drawMan(wx, 192, 74, { dir: -1, phase: (330 - wx) / 50 * Math.PI * 2, amp: 0.7 * wsp + 0.05, col: '#120c0d', nohat: true, apron: 'rgba(236,226,206,.92)', pose: [13, -92, 1] });
    ctx.fillStyle = '#120c0d'; ctx.fillRect(wx - 20, 122, 26, 2.2);
    ctx.fillStyle = 'rgba(255,214,120,.9)'; ctx.fillRect(wx - 14, 116, 3, 6); ctx.fillRect(wx - 6, 117, 3, 5);
    // Duroy arrive par la droite, l'air crâne, et s'arrête pour regarder les buveurs
    const dx = walkTo(t, 0.2, 3.8, 470, 352);
    const dsp = t > 0.2 && t < 3.8 ? (1 - clamp((t - 0.2) / 3.6)) * 1.3 + 0.25 : 0;
    rim(() => drawMan(dx, 203, 150, { dir: -1, phase: (470 - dx) / 117 * Math.PI * 2, amp: Math.min(1, dsp), stance: dsp < 0.2, tilt: -0.13, lean: -0.035, must: true, col: '#0d0909' }), 6, 0.55);
    finish(0.55, t);
  }

  /* ---------- épisode 4 : place de l'Opéra, l'horloge lumineuse ; Duroy croise Forestier ---------- */
  const OP_WIN = (() => { const r = rng(12), a = []; for (let i = 0; i < 18; i++) a.push(r() < 0.55); return a; })();
  function opera(t) {
    base();
    let g = ctx.createLinearGradient(0, 0, 0, 130); g.addColorStop(0, '#0f1328'); g.addColorStop(0.6, '#2b2440'); g.addColorStop(1, '#5c3a4c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 130);
    [[40, 18], [330, 12], [372, 30], [96, 8]].forEach(([x, y], i) => { ctx.fillStyle = 'rgba(255,240,220,' + (0.45 + 0.35 * vn(t * 2 + i * 7)) + ')'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#1f1823'; ctx.fillRect(0, 56, 70, 76); ctx.fillRect(330, 50, 70, 82);
    for (let i = 0; i < 18; i++) { const side = i < 9; const x = side ? 6 + (i % 3) * 21 : 336 + (i % 3) * 21; const y = 62 + Math.floor((i % 9) / 3) * 20; ctx.fillStyle = OP_WIN[i] ? 'rgba(244,178,96,.8)' : '#2a2129'; ctx.fillRect(x, y, 9, 12); }
    const O = '#1a1520';
    ctx.fillStyle = O;
    ctx.beginPath(); ctx.moveTo(176, 30); ctx.lineTo(200, 12); ctx.lineTo(224, 30); ctx.fill();
    ctx.fillRect(198.6, 4, 2.8, 9); ctx.beginPath(); ctx.arc(200, 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(200, 52, 40, 16, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(196, 30, 8, 8);
    ctx.fillRect(96, 56, 208, 76); ctx.fillRect(88, 50, 30, 82); ctx.fillRect(282, 50, 30, 82);
    [[103, 46], [297, 46]].forEach(([x, y]) => { ctx.fillStyle = '#c99a3c'; ctx.beginPath(); ctx.moveTo(x - 7, y + 4); ctx.lineTo(x - 3, y - 8); ctx.lineTo(x, y - 3); ctx.lineTo(x + 3, y - 9); ctx.lineTo(x + 7, y + 4); ctx.fill(); glow(x, y - 2, 16, '255,200,110', 0.35); });
    ctx.fillStyle = 'rgba(255,196,120,.55)';
    for (let i = 0; i < 7; i++) { const x = 116 + i * 25; ctx.fillRect(x, 74, 10, 18); ctx.beginPath(); ctx.arc(x + 5, 74, 5, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,200,130,.75)'; for (let i = 0; i < 7; i++) { const x = 114 + i * 25; ctx.fillRect(x, 104, 14, 26); ctx.beginPath(); ctx.arc(x + 7, 104, 7, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = O; for (let i = 0; i < 8; i++) { const x = 109 + i * 25; ctx.fillRect(x, 70, 2.2, 24); ctx.fillRect(x + 3.6, 70, 2.2, 24); }
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(111 + i * 23.5, 64, 2.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,214,150,.6)'; ctx.fill(); }
    glow(200, 118, 150, '255,180,100', 0.22);
    g = ctx.createLinearGradient(0, 132, 0, H); g.addColorStop(0, '#2b2226'); g.addColorStop(1, '#1b1517'); ctx.fillStyle = g; ctx.fillRect(0, 132, W, 68);
    ctx.strokeStyle = 'rgba(255,215,170,.05)'; for (let y = 140; y < H; y += 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // un fiacre traverse au loin, des promeneurs
    const fx = 440 - 82 * t; drawFiacre(fx, 150, 0.32, -1, 440 - fx, t);
    const p1 = 40 + 9 * t; drawMan(p1, 150, 30, { dir: 1, phase: p1 / 23 * Math.PI * 2, amp: .8, cane: true, col: '#1c1416' }); drawWoman(p1 + 16, 150, 28, { dir: 1, phase: p1 / 22 * Math.PI * 2, col: '#1c1416' });
    lamp(26, 196, 96, 0.92 + 0.08 * vn(t * 6)); lamp(386, 196, 96, 0.92 + 0.08 * vn(t * 6 + 9));
    // l'horloge lumineuse : l'aiguille passe à neuf heures un quart
    const cx = 314, cy = 84;
    ctx.fillStyle = '#110c0c'; ctx.fillRect(cx - 10, 192, 20, 4); ctx.beginPath(); ctx.moveTo(cx - 5, 192); ctx.lineTo(cx - 2.5, 100); ctx.lineTo(cx + 2.5, 100); ctx.lineTo(cx + 5, 192); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
    glow(cx, cy, 52, '255,236,190', 0.5);
    ctx.fillStyle = 'rgba(255,246,222,.97)'; ctx.beginPath(); ctx.arc(cx, cy, 12.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1e1a'; ctx.lineWidth = 0.8; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * 10, cy - Math.cos(a) * 10); ctx.lineTo(cx + Math.sin(a) * 11.6, cy - Math.cos(a) * 11.6); ctx.stroke(); }
    ctx.lineCap = 'round';
    const mn = t < 1.6 ? 14 : 14 + sm(1.6, 1.75, t);
    const ah = ((9 + mn / 60) / 12) * Math.PI * 2, am = (mn / 60) * Math.PI * 2;
    ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(ah) * 6.5, cy - Math.cos(ah) * 6.5); ctx.stroke();
    ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(am) * 9.5, cy - Math.cos(am) * 9.5); ctx.stroke();
    ctx.fillStyle = '#110c0c'; ctx.beginPath(); ctx.moveTo(cx - 9, cy - 15); ctx.lineTo(cx, cy - 24); ctx.lineTo(cx + 9, cy - 15); ctx.fill();
    glow(cx, 196, 70, '255,200,130', 0.12);
    // Duroy arrive de la gauche, Forestier (« un gros jeune homme ») de la droite ; ils se reconnaissent et se serrent la main
    const dX = walkTo(t, 0, 3.0, -40, 146), fX = walkTo(t, 0.3, 3.3, 470, 222);
    const dWalk = t < 3.0 ? 1 - clamp(t / 3.0) * 0.6 : 0, fWalk = t > 0.3 && t < 3.3 ? 1 - clamp((t - 0.3) / 3.0) * 0.6 : 0;
    const hs = sm(3.3, 3.9, t), shake = t > 3.9 ? Math.sin((t - 3.9) * 14) * 2.2 * (1 - sm(4.6, 5.0, t)) : 0;
    rim(() => {
      drawMan(dX, 199, 132, { dir: 1, phase: (dX + 40) / 103 * Math.PI * 2, amp: dWalk, stance: dWalk < 0.1, tilt: -0.13, lean: -0.04, must: true, col: '#0d0909', pose: hs > 0.01 ? [21, -55 + shake / 1.32, hs] : null });
      ctx.save(); ctx.translate(fX, 199); ctx.scale(1.32, 1);
      drawMan(0, 0, 118, { dir: -1, phase: (470 - fX) / 92 * Math.PI * 2, amp: fWalk * 0.85, stance: fWalk < 0.1, tilt: 0.04, must: true, col: '#0d0909', pose: hs > 0.01 ? [27, -62 + shake / 1.18, hs] : null });
      ctx.restore();
    }, 5, 0.5);
    finish(0.5, t);
  }

  /* ---------- épisode 6 : La Vie Française ; les passants surgissent dans la clarté, puis Forestier et Duroy entrent ---------- */
  let FIRE = null;
  function firePoints() {
    const tc = document.createElement('canvas'); tc.width = 400; tc.height = 70;
    const tx = tc.getContext('2d'); tx.fillStyle = '#fff'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.font = "italic 700 40px 'Bodoni Moda', Didot, Georgia, serif"; tx.fillText('La Vie Française', 200, 37);
    const im = tx.getImageData(0, 0, 400, 70).data, pts = [];
    for (let y = 2; y < 70; y += 2.6) for (let x = 2; x < 400; x += 2.6) if (im[((y | 0) * 400 + (x | 0)) * 4 + 3] >= 140) pts.push([x, y + 15, Math.random() * 50]);
    return pts;
  }
  // un promeneur s'éclaire en passant sous les lettres de feu
  const litCol = (x) => { const k = clamp(1 - Math.abs(x - 200) / 150); const c = (a, b) => Math.round(lerp(a, b, k * k)); return 'rgb(' + c(14, 74) + ',' + c(9, 44) + ',' + c(10, 34) + ')'; };
  function journal(t) {
    base();
    ctx.fillStyle = '#161012'; ctx.fillRect(0, 0, W, H);
    const r = rng(8);
    for (let i = 0; i < 11; i++) { const x = 10 + i * 36; ctx.fillStyle = '#100b0d'; ctx.fillRect(x - 1, 3, 18, 20); ctx.fillStyle = r() < 0.6 ? 'rgba(246,196,120,.55)' : '#211a1e'; ctx.fillRect(x, 4, 16, 18); }
    const dx = 138, dw = 124, dy = 84, dh = 108;
    const open = sm(3.4, 3.9, t) * (1 - sm(5.0, 5.5, t));     // la porte s'ouvre pour eux
    let g = ctx.createLinearGradient(0, dy, 0, dy + dh); g.addColorStop(0, 'rgba(255,214,150,1)'); g.addColorStop(1, 'rgba(214,138,76,1)');
    ctx.fillStyle = g; ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(110,60,36,.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const y = dy + dh - 8 - i * 9, x0 = dx + 30 + i * 8; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 34, y); ctx.stroke(); }
    ctx.fillStyle = '#1a1214'; ctx.fillRect(dx - 5, dy - 5, dw + 10, 5); ctx.fillRect(dx - 5, dy, 5, dh); ctx.fillRect(dx + dw, dy, 5, dh);
    // vantail de droite : il pivote quand on entre
    const lw = dw / 2, rx = dx + lw, rwid = lw * (1 - 0.75 * open);
    ctx.fillRect(dx + lw - 2.5, dy, 5, dh);
    const paper = (x, y, wd) => { ctx.fillStyle = '#ece3cf'; ctx.fillRect(x, y, wd, 54); ctx.fillStyle = '#3a302a'; ctx.fillRect(x + 3 * wd / 43, y + 3, 37 * wd / 43, 5); ctx.fillStyle = 'rgba(70,60,52,.55)'; for (let l = 0; l < 13; l++) { ctx.fillRect(x + 3 * wd / 43, y + 12 + l * 3.2, 17 * wd / 43, 1); ctx.fillRect(x + 23 * wd / 43, y + 12 + l * 3.2, 17 * wd / 43, 1); } };
    paper(dx + 10, dy + 14, 43);
    if (open > 0.01) { ctx.fillStyle = 'rgba(255,236,190,' + (0.5 * open) + ')'; ctx.fillRect(rx + rwid, dy, lw - rwid, dh); ctx.fillStyle = '#1a1214'; ctx.fillRect(rx + rwid - 2, dy, 4, dh); }
    paper(rx + 9 * (rwid / lw), dy + 14, 43 * (rwid / lw));
    // les lettres de feu, dessinées par des flammes de gaz qui tremblent
    if (!FIRE) FIRE = firePoints();
    const fl = 0.9 + 0.1 * vn(t * 5);
    glow(200, 50, 230, '255,170,80', 0.42 * fl);
    glow(200, 50, 120, '255,200,120', 0.35 * fl);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [fx, fy, ph] of FIRE) {
      const a = 0.55 + 0.45 * vn(t * 9 + ph);
      ctx.fillStyle = 'rgba(255,150,60,' + (0.33 * a) + ')'; ctx.beginPath(); ctx.arc(fx, fy, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,160,' + a + ')'; ctx.beginPath(); ctx.ellipse(fx, fy - 0.5 - a * 0.4, 0.75, 1.2 + a * 0.5, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
    if (open > 0.01) glow(rx + lw * 0.6, dy + dh * 0.7, 80, '255,210,140', 0.25 * open);
    g = ctx.createLinearGradient(0, 188, 0, H); g.addColorStop(0, '#3b2a24'); g.addColorStop(1, '#22191a'); ctx.fillStyle = g; ctx.fillRect(0, 188, W, 12);
    // trois personnes arrêtées lisent le journal
    drawMan(170, 199, 82, { dir: 1, phase: 0, amp: 0, stance: true, col: '#0f0a0b', cane: true });
    drawWoman(201, 199, 76, { dir: 1, phase: 0, col: '#0f0a0b' });
    drawMan(234, 199, 84, { dir: -1, phase: 0, amp: 0, stance: true, col: '#0f0a0b' });
    // des promeneurs « apparaissaient tout à coup en pleine lumière… puis rentraient aussitôt dans l'ombre »
    const w1 = -40 + 70 * t, w2 = 440 - 62 * t;
    drawWoman(w1, 199, 88, { dir: 1, phase: (w1 + 40) / 64 * Math.PI * 2, col: litCol(w1) });
    drawMan(w2, 199, 92, { dir: -1, phase: (440 - w2) / 70 * Math.PI * 2, amp: .8, col: litCol(w2), cane: true });
    // Forestier pousse la porte, Duroy le suit ; ils entrent et disparaissent dans l'escalier
    const fX = walkTo(t, 0, 3.4, 430, 262), dX = walkTo(t, 0.15, 3.7, 480, 296);
    const fIn = sm(3.7, 4.6, t), dIn = sm(4.0, 4.9, t);
    const fX2 = lerp(fX, 214, fIn), dX2 = lerp(dX, 222, dIn);
    rim(() => {
      if (fIn < 0.98) { ctx.globalAlpha = 1 - fIn; ctx.save(); ctx.translate(fX2, 199); ctx.scale(1.28, 1); drawMan(0, 0, 104, { dir: -1, phase: (430 - fX2) / 80 * Math.PI * 2, amp: t < 3.4 || fIn > 0 ? 0.6 : 0.05, col: '#0d0909', must: true }); ctx.restore(); }
      if (dIn < 0.98) { ctx.globalAlpha = 1 - dIn; drawMan(dX2, 199, 118, { dir: -1, phase: (480 - dX2) / 92 * Math.PI * 2, amp: t < 3.7 || dIn > 0 ? 0.7 : 0.05, tilt: -0.13, lean: -0.035, must: true, col: '#0d0909' }); }
      ctx.globalAlpha = 1;
    }, 5, 0.5);
    finish(0.6, t);
  }

  /* ---------- épisode 9 : le trapèze ; « comme une roue lancée », puis « couché horizontalement dans le vide » ---------- */
  function acrobat(x, y, h, arm, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale((dir || 1) * h / 100, h / 100); ctx.fillStyle = ctx.strokeStyle = '#120b0c'; ctx.lineCap = 'round';
    ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(-3, -48); ctx.lineTo(-5, 0); ctx.moveTo(3, -48); ctx.lineTo(6, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, -82); ctx.lineTo(8, -82); ctx.lineTo(6, -48); ctx.lineTo(-6, -48); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -90, 6.4, 0, 7); ctx.fill();
    ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(-7, -79); ctx.lineTo(-11, -56); ctx.moveTo(7, -79);
    ctx.lineTo(lerp(11, 18, arm), lerp(-56, -104, arm)); ctx.stroke();
    ctx.restore();
  }
  const AUD = (() => { const r = rng(19), a = []; for (let i = 0; i < 17; i++) a.push({ x: 6 + i * 24 + r() * 6, y: 176 + r() * 8, kind: r(), ph: r() * 6 }); return a; })();
  function trapeze(t) {
    base();
    ctx.fillStyle = '#100a0c'; ctx.fillRect(0, 0, W, H);
    let g = ctx.createLinearGradient(0, 14, 0, 150); g.addColorStop(0, '#3a2530'); g.addColorStop(1, '#6a4038'); ctx.fillStyle = g; ctx.fillRect(56, 14, 288, 136);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    g = ctx.createLinearGradient(80, 0, 220, 110); g.addColorStop(0, 'rgba(255,236,190,0.0)'); g.addColorStop(1, 'rgba(255,236,190,' + (0.2 + 0.03 * vn(t * 4)) + ')');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(70, 14); ctx.lineTo(110, 14); ctx.lineTo(272, 150); ctx.lineTo(150, 150); ctx.fill(); ctx.restore();
    glow(214, 92, 90, '255,230,180', 0.45);
    // la barre fixe
    ctx.strokeStyle = 'rgba(230,214,190,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(176, 14); ctx.lineTo(180, 66); ctx.moveTo(232, 14); ctx.lineTo(228, 66); ctx.stroke();
    ctx.strokeStyle = '#d8c7a6'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(178, 66); ctx.lineTo(230, 66); ctx.stroke();
    // l'acrobate : deux grands tours autour de la barre, puis il se fige à l'horizontale
    const bx = 199, by = 66;
    const spin = t < 3.0 ? (Math.PI * 2) * 2 * (1 - Math.pow(1 - t / 3.0, 1.6)) : Math.PI * 4;   // angle depuis la verticale basse
    const toLever = sm(3.0, 3.8, t);
    const ang = lerp(spin, Math.PI * 4 + Math.PI / 2, toLever);    // à la fin : corps pointé vers la droite
    const dirx = Math.sin(ang), diry = Math.cos(ang);
    // épaules : dans l'axe du corps pendant la roue, à la verticale de la barre à la fin (bras raides)
    const shx = lerp(bx + dirx * 21, bx, toLever), shy = lerp(by + diry * 21, by + 21, toLever);
    const len = 76;
    ctx.fillStyle = ctx.strokeStyle = '#120b0c'; ctx.lineCap = 'round';
    ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(shx - 3, shy); ctx.moveTo(bx + 3, by); ctx.lineTo(shx + 3, shy); ctx.stroke();
    ctx.save(); ctx.translate(shx, shy); ctx.rotate(-ang + Math.PI / 2);
    ctx.beginPath(); ctx.arc(-9, 0, 6, 0, 7); ctx.fill();                                        // tête (raie au milieu)
    ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(32, -4); ctx.lineTo(32, 5); ctx.lineTo(-3, 5); ctx.fill();   // corps droit
    ctx.lineWidth = 5.6; ctx.beginPath(); ctx.moveTo(32, -2); ctx.lineTo(len - 8, -1.5); ctx.moveTo(32, 2); ctx.lineTo(len - 8, 2); ctx.stroke();
    ctx.restore();
    // les deux autres, le moyen et le petit, saluent quand il se fige
    const sal = sm(3.9, 4.4, t);
    acrobat(112, 150, 66, sal, 1); acrobat(300, 150, 54, sal, -1);
    ctx.fillStyle = '#2a1a18'; ctx.fillRect(56, 146, 288, 6);
    for (let x = 66; x < 340; x += 11) { glow(x, 151, 12, '255,200,120', 0.5 + 0.08 * vn(t * 7 + x)); ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.beginPath(); ctx.arc(x, 151, 1.3, 0, 7); ctx.fill(); }
    const curtain = (x0, x1) => { for (let x = x0; x < x1; x += 6) { const gg = ctx.createLinearGradient(x, 0, x + 6, 0); gg.addColorStop(0, '#5d1416'); gg.addColorStop(0.5, '#8e2324'); gg.addColorStop(1, '#4a0f12'); ctx.fillStyle = gg; ctx.fillRect(x, 10, 6.4, 142); } };
    curtain(34, 72); curtain(328, 366);
    for (let x = 34; x < 366; x += 16) { ctx.fillStyle = '#7d1d1f'; ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x + 16, 10); ctx.lineTo(x + 16, 22); ctx.quadraticCurveTo(x + 8, 32, x, 22); ctx.fill(); ctx.fillStyle = '#c9a04a'; ctx.fillRect(x + 7, 27, 2, 4); }
    ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 2.4; ctx.strokeRect(32, 6, 336, 148);
    glow(200, 8, 40, '255,210,130', 0.4);
    // la salle : têtes et chapeaux ; on applaudit à la fin
    const clap = sm(4.2, 4.6, t);
    ctx.fillStyle = ctx.strokeStyle = '#0a0607';
    AUD.forEach((a) => {
      const x = a.x, y = a.y - clap * Math.abs(Math.sin(t * 9 + a.ph)) * 1.6, kind = a.kind;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.fillRect(x - 10, y + 6, 20, 30);
      if (kind < 0.4) { ctx.fillRect(x - 6, y - 19, 12, 13); ctx.beginPath(); ctx.ellipse(x, y - 6, 10, 2, 0, 0, 7); ctx.fill(); }
      else if (kind < 0.7) { ctx.beginPath(); ctx.ellipse(x, y - 7, 7.5, 6, 0, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y - 6, 10.5, 2, 0, 0, 7); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(x - 1, y - 7, 9, 3.4, -0.15, 0, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 4, y - 9); ctx.quadraticCurveTo(x - 12, y - 21, x - 16, y - 13); ctx.stroke(); }
    });
    finish(0.45, t);
  }

  const DRAW = { cafe, opera, journal, trapeze };
  const DUR = { cafe: 5.0, opera: 5.4, journal: 5.6, trapeze: 5.4 };
  /* ---------- boîte à outils des scènes (v80) ---------- */
  const INK2 = '#0d0909', FAR = '#1c1416';
  function sky(stops, y1) { const g = ctx.createLinearGradient(0, 0, 0, y1 || H); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, y1 || H); }
  function stars(t, n, seed, ymax) { const r = rng(seed || 5); for (let i = 0; i < n; i++) { const x = r() * W, y = r() * (ymax || 90); ctx.fillStyle = 'rgba(255,240,220,' + (0.3 + 0.45 * vn(t * 2 + i * 3.1)) + ')'; ctx.beginPath(); ctx.arc(x, y, 0.5 + r() * 0.6, 0, 7); ctx.fill(); } }
  function flame(x, y, s, t, ph) {
    const f = 0.85 + 0.15 * vn(t * 9 + (ph || 0)), sw = Math.sin(t * 7 + (ph || 0)) * 0.4;
    ctx.fillStyle = 'rgba(255,170,70,.9)'; ctx.beginPath(); ctx.ellipse(x + sw * 0.5, y - 3 * s * f, 1.6 * s, 3.6 * s * f, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,244,210,1)'; ctx.beginPath(); ctx.ellipse(x + sw * 0.3, y - 2.6 * s * f, 0.8 * s, 2 * s * f, 0, 0, 7); ctx.fill();
    glow(x, y - 3 * s, 46 * s, '255,190,110', 0.42 * f);
  }
  function candle(x, y, t, ph, s) { s = s || 1; ctx.fillStyle = '#eadfc8'; ctx.fillRect(x - 1.6 * s, y, 3.2 * s, 12 * s); flame(x, y, s, t, ph); }
  function candelabra(x, y, t, ph) {
    ctx.fillStyle = ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = 1.6;
    ctx.fillRect(x - 6, y + 30, 12, 3); ctx.fillRect(x - 1.2, y + 4, 2.4, 27);
    ctx.beginPath(); ctx.moveTo(x - 14, y + 2); ctx.quadraticCurveTo(x, y + 14, x + 14, y + 2); ctx.stroke();
    [-14, -7, 0, 7, 14].forEach((dx, i) => { ctx.fillStyle = '#eadfc8'; ctx.fillRect(x + dx - 1.2, y - 6 + (dx ? 4 : 0), 2.4, 8); flame(x + dx, y - 6 + (dx ? 4 : 0), 0.75, t, ph + i * 1.7); });
  }
  function room(wall, wall2, floorY, floor) {
    let g = ctx.createLinearGradient(0, 0, 0, floorY); g.addColorStop(0, wall); g.addColorStop(1, wall2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, floorY);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, floorY - 26, W, 26); ctx.fillStyle = 'rgba(255,220,180,.06)'; ctx.fillRect(0, floorY - 27, W, 1.2);
    g = ctx.createLinearGradient(0, floorY, 0, H); g.addColorStop(0, floor); g.addColorStop(1, '#120d0c'); ctx.fillStyle = g; ctx.fillRect(0, floorY, W, H - floorY);
  }
  function frameRect(x, y, w, h, inner) {
    ctx.fillStyle = '#7a5a26'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.fillStyle = '#c99a3c'; ctx.fillRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); inner(x, y, w, h); ctx.restore();
  }
  function windowView(x, y, w, h, outside) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); outside(x, y, w, h); ctx.restore();
    ctx.fillStyle = '#16100f'; ctx.fillRect(x - 4, y - 4, w + 8, 4); ctx.fillRect(x - 4, y + h, w + 8, 5); ctx.fillRect(x - 4, y, 4, h); ctx.fillRect(x + w, y, 4, h);
    ctx.fillRect(x + w / 2 - 1.5, y, 3, h); ctx.fillRect(x, y + h * 0.42, w, 2.2);
  }
  function water(y0, y1, c1, c2, t, glint) {
    const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
    const r = rng(14);
    for (let i = 0; i < 70; i++) { const y = y0 + 2 + r() * (y1 - y0 - 4), x = ((r() * W + t * (8 + r() * 10)) % (W + 40)) - 20, w = 6 + r() * 18; ctx.fillStyle = 'rgba(' + (glint || '255,220,170') + ',' + (0.06 + 0.12 * vn(t * 3 + i)) + ')'; ctx.fillRect(x, y, w, 0.9); }
  }
  function tree(x, y, h, col, t, seed) {
    const r = rng(seed || 3); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 1.5, y - h * 0.55); ctx.lineTo(x + 1.5, y - h * 0.55); ctx.lineTo(x + 3, y); ctx.fill();
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, rr = Math.sqrt(r()); const cx = x + Math.cos(a) * rr * h * 0.32 + Math.sin((t || 0) * 0.9 + i) * 0.8, cy = y - h * 0.68 + Math.sin(a) * rr * h * 0.24; ctx.beginPath(); ctx.arc(cx, cy, h * (0.07 + r() * 0.07), 0, 7); ctx.fill(); }
  }
  function puffs(x, y, t, n, col, rise, spread) {
    for (let i = 0; i < n; i++) { const p = ((t * 0.35 + i / n) % 1); const px = x + p * (spread || 30) + Math.sin(p * 6 + i) * 3, py = y - p * (rise || 40), r = 3 + p * 12;
      ctx.fillStyle = 'rgba(' + (col || '220,210,200') + ',' + (0.35 * (1 - p)) + ')'; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); }
  }
  // cheval (vue de profil, tourné vers la droite), au trot ou au galop
  function horse(x, y, sc, dir, dist, col, gallop) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * sc, sc); ctx.fillStyle = ctx.strokeStyle = col || '#18120f'; ctx.lineCap = 'round';
    const gp = dist / (gallop ? 60 : 46) * Math.PI * 2, bob = -1.4 * Math.abs(Math.sin(gp));
    ctx.translate(0, bob);
    const leg = (hx, p, back) => { const a = (gallop ? 0.6 : 0.42) * Math.sin(p); const lift = Math.max(0, Math.cos(p)) * 0.9; const kx = hx + Math.sin(a) * 15, ky = -30 + Math.cos(a) * 15; const b2 = back ? a + lift : a - lift; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(hx, -34); ctx.lineTo(kx, ky); ctx.lineTo(kx + Math.sin(b2) * 16, ky + Math.cos(b2) * 16); ctx.stroke(); };
    leg(-12, gp + (gallop ? 0.6 : Math.PI), true); leg(18, gp, false);
    ctx.beginPath(); ctx.ellipse(3, -40, 24, 10.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, -46); ctx.lineTo(27, -66); ctx.lineTo(33, -67); ctx.lineTo(27, -36); ctx.fill();
    ctx.beginPath(); ctx.moveTo(27, -66); ctx.lineTo(31, -73); ctx.lineTo(33, -69); ctx.lineTo(45, -56); ctx.quadraticCurveTo(44, -52, 40, -53); ctx.lineTo(31, -60); ctx.fill();
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-20, -44); ctx.quadraticCurveTo(-27, -38, -25, -24); ctx.stroke();
    leg(-17, gp + (gallop ? 1.2 : 0), true); leg(13, gp + (gallop ? 0.4 : Math.PI), false);
    ctx.restore();
  }
  // cavalier ou amazone (jupe longue tombant d'un côté)
  function rider(x, y, sc, dir, dist, amazon, col) {
    horse(x, y, sc, dir, dist, col, false);
    const bob = -1.4 * Math.abs(Math.sin(dist / 46 * Math.PI * 2)) * sc;
    ctx.save(); ctx.translate(x + dir * 2 * sc, y - 50 * sc + bob); ctx.scale(dir * sc, sc); ctx.fillStyle = col || '#18120f';
    if (amazon) { ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.quadraticCurveTo(10, 14, 4, 26); ctx.lineTo(-12, 22); ctx.closePath(); ctx.fill(); }
    else { ctx.lineWidth = 4.5; ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 12); ctx.lineTo(2, 22); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(5, 0); ctx.lineTo(4, -20); ctx.lineTo(-4, -20); ctx.fill();
    ctx.beginPath(); ctx.arc(0.5, -25, 4.4, 0, 7); ctx.fill();
    if (amazon) { ctx.fillRect(-3.5, -36, 8, 7); ctx.beginPath(); ctx.ellipse(0.5, -29.5, 7, 1.4, 0, 0, 7); ctx.fill(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, -32); ctx.quadraticCurveTo(-6, -28, -12, -36); ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
    else { ctx.fillRect(-3.5, -38, 8, 10); ctx.beginPath(); ctx.ellipse(0.5, -29, 7, 1.4, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // voiture découverte (victoria), avec un couple
  function victoria(x, y, sc, dir, dist, col, dress) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * sc, sc); ctx.fillStyle = ctx.strokeStyle = col || '#18120f'; ctx.lineCap = 'round';
    const wheel = (cx, cy, r, a) => { ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.lineWidth = 1; for (let k = 0; k < 10; k++) { const q = a + k * Math.PI / 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(q) * r, cy + Math.sin(q) * r); ctx.stroke(); } };
    ctx.beginPath(); ctx.moveTo(-96, -30); ctx.quadraticCurveTo(-98, -52, -84, -54); ctx.lineTo(-74, -42); ctx.lineTo(-46, -40); ctx.lineTo(-40, -30); ctx.closePath(); ctx.fill();
    // le couple : la femme en robe claire, l'homme sombre
    ctx.fillStyle = dress || 'rgba(232,222,204,.95)'; ctx.beginPath(); ctx.ellipse(-70, -50, 8, 9, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-69, -63, 4.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(-69, -67, 7, 2.2, -0.2, 0, 7); ctx.fill();
    ctx.fillStyle = col || '#18120f'; ctx.beginPath(); ctx.ellipse(-82, -50, 7, 9, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-81, -63, 4.4, 0, 7); ctx.fill(); ctx.fillRect(-85, -76, 8, 9); ctx.beginPath(); ctx.ellipse(-81, -67, 7, 1.4, 0, 0, 7); ctx.fill();
    ctx.fillRect(-48, -58, 10, 4); ctx.fillRect(-46, -74, 7, 16); ctx.beginPath(); ctx.arc(-42.5, -78, 3.6, 0, 7); ctx.fill(); ctx.fillRect(-46, -89, 7, 8);
    wheel(-80, -16, 16, dist / 16); wheel(-46, -12, 12, dist / 12);
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-42, -32); ctx.lineTo(10, -40); ctx.stroke();
    ctx.restore();
    horse(x, y, sc, dir, dist, col, false);
  }
  // train : locomotive à vapeur et voitures aux fenêtres éclairées
  function train(x, y, sc, dir, t, cars, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * sc, sc); ctx.fillStyle = col || '#140e0e';
    ctx.fillRect(0, -26, 44, 18); ctx.fillRect(-6, -36, 18, 28); ctx.fillRect(30, -40, 7, 14); ctx.beginPath(); ctx.moveTo(28, -40); ctx.lineTo(39, -40); ctx.lineTo(37, -44); ctx.lineTo(30, -44); ctx.fill();
    ctx.beginPath(); ctx.moveTo(44, -8); ctx.lineTo(54, -2); ctx.lineTo(44, -2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,.9)'; ctx.beginPath(); ctx.arc(46, -18, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = col || '#140e0e';
    for (let c = 0; c < (cars || 3); c++) { const cx = -12 - (c + 1) * 50; ctx.fillRect(cx, -30, 46, 24); ctx.fillStyle = 'rgba(255,206,130,.85)'; for (let w = 0; w < 4; w++) ctx.fillRect(cx + 4 + w * 11, -25, 7, 8); ctx.fillStyle = col || '#140e0e'; ctx.fillRect(cx + 46, -18, 4, 3); }
    ctx.lineWidth = 1.4; ctx.strokeStyle = ctx.fillStyle;
    for (let w = 0; w < 4 + (cars || 3) * 2; w++) { const wx = 36 - w * 24.5; ctx.beginPath(); ctx.arc(wx, -4, 4.5, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // prêtre en soutane
  function priest(x, y, h, dir, phase, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * h / 100, h / 100); ctx.fillStyle = col || INK2;
    const sw = 1.6 * Math.sin(phase || 0);
    ctx.beginPath(); ctx.moveTo(-7, -80); ctx.lineTo(8, -80); ctx.quadraticCurveTo(11, -40, 12 + sw, 0.5); ctx.lineTo(-11 + sw, 0.5); ctx.quadraticCurveTo(-10, -40, -7, -80); ctx.fill();
    ctx.fillRect(-2.6, -86, 5.4, 7); ctx.beginPath(); ctx.arc(0.8, -90, 6, 0, 7); ctx.fill();
    ctx.restore();
  }
  // personnage assis de profil (sur une chaise), avec une option pour écrire
  function sitter(x, y, h, dir, o) {
    o = o || {};
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * h / 100, h / 100); ctx.fillStyle = ctx.strokeStyle = o.col || INK2; ctx.lineCap = 'round';
    if (!o.nochair) { ctx.fillRect(-14, -46, 3, 46); ctx.fillRect(-14, -46, 22, 3); ctx.fillRect(6, -46, 3, 46); }       // chaise
    ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(-6, -50); ctx.lineTo(14, -50); ctx.lineTo(16, -6); ctx.stroke();
    if (o.f) { ctx.beginPath(); ctx.moveTo(-8, -52); ctx.lineTo(12, -52); ctx.quadraticCurveTo(22, -24, 18, 0); ctx.lineTo(-4, 0); ctx.quadraticCurveTo(-12, -26, -8, -52); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-8, -50); ctx.lineTo(4, -50); ctx.lineTo(5 + (o.lean || 0), -80); ctx.lineTo(-6 + (o.lean || 0), -80); ctx.fill();
    ctx.beginPath(); ctx.arc(1 + (o.lean || 0) * 1.4, -88, 6.4, 0, 7); ctx.fill();
    if (o.f) { ctx.beginPath(); ctx.arc(-4 + (o.lean || 0) * 1.4, -91, 3.6, 0, 7); ctx.fill(); }
    const hx = o.hand ? o.hand[0] : 18, hy = o.hand ? o.hand[1] : -54;
    const e = ik(1 + (o.lean || 0), -76, hx, hy, 15, 14, -1); ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(1 + (o.lean || 0), -76); ctx.lineTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); ctx.stroke();
    if (o.pen) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e[2], e[3]); ctx.lineTo(e[2] + 5, e[3] - 8); ctx.stroke(); }
    if (o.cig) { ctx.fillStyle = '#eadfc8'; ctx.fillRect(e[2], e[3] - 1, 6, 1.6); ctx.fillStyle = 'rgba(255,120,60,.95)'; ctx.fillRect(e[2] + 6, e[3] - 1, 1.4, 1.6); }
    ctx.restore();
  }
  function table(x, y, w, h, cloth) {
    ctx.fillStyle = cloth || '#efe6d4'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x + 2, y + 4, w - 4, h || 18);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x + 2, y + 4, w - 4, 2);
  }
  // personnage dans la lumière : silhouette plus claire quand il est près d'une source
  const lit = (x, cx, rr) => { const k = clamp(1 - Math.abs(x - cx) / (rr || 150)); const c = (a, b) => Math.round(lerp(a, b, k * k)); return 'rgb(' + c(14, 74) + ',' + c(9, 44) + ',' + c(10, 34) + ')'; };
  /* ---------- II, ép. 12 : « Une excellente invention » — la haute glace du palier ---------- */
  DRAW.miroir = function (t) {
    base();
    room('#3a2c2a', '#4a3632', 200, '#2a1f1d');
    // la glace en pied, dans son cadre doré : une longue perspective de galerie
    const mx = 40, my = 26, mw = 132, mh = 156, axis = mx + mw + 26;
    const dx = t < 2.6 ? walkTo(t, 0, 2.6, 380, 262) : 262 + 6 * sm(2.6, 2.9, t) * (1 - sm(3.1, 3.6, t));
    const dy = 196 - clamp((380 - Math.min(dx, 380)) / 118) * 10;
    const tw = sm(3.4, 3.8, t) * (1 - sm(4.6, 5.0, t));            // il frise sa moustache
    const pose = tw > 0.01 ? [10.5, -86.5, tw] : null;
    const walking = t < 2.6;
    const o = { dir: -1, phase: (380 - dx) / 110 * Math.PI * 2, amp: walking ? 0.8 : 0, stance: !walking, tilt: -0.1, lean: -0.03 - 0.03 * sm(3.2, 3.8, t), must: true, col: INK2, pose };
    frameRect(mx, my, mw, mh, (x, y, w, h) => {
      let g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#5b4a48'); g.addColorStop(1, '#3d302e'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // la galerie reflétée qui s'enfonce
      ctx.strokeStyle = 'rgba(255,230,200,.10)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { const k = i / 6; ctx.strokeRect(x + w * k * 0.32, y + h * k * 0.22, w * (1 - k * 0.64), h * (1 - k * 0.4)); }
      glow(x + w * 0.7, y + 30, 50, '255,200,140', 0.25);
      // le reflet : « c'était lui-même »
      const rx = 2 * axis - dx;
      ctx.globalAlpha = 0.9;
      drawMan(rx - 40, dy - 6, 132, Object.assign({}, o, { dir: 1, col: '#1d1514', pose: pose ? [10.5, -86.5, tw] : null }));
      ctx.globalAlpha = 1;
      g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.06)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    });
    // applique à gaz
    ctx.fillStyle = '#2a1d16'; ctx.fillRect(214, 58, 3, 18); flame(215.5, 58, 0.9, t, 1);
    // l'escalier qui monte vers la droite, le tapis, la rampe
    ctx.fillStyle = '#2b201d'; ctx.beginPath(); ctx.moveTo(250, 200); ctx.lineTo(400, 200); ctx.lineTo(400, 150); ctx.fill();
    ctx.fillStyle = '#6a2a24'; for (let i = 0; i < 8; i++) ctx.fillRect(262 + i * 18, 196 - i * 6, 16, 3);
    ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(236, 128); ctx.lineTo(400, 74); ctx.stroke();
    for (let i = 0; i < 9; i++) { const x = 244 + i * 19; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 126 - i * 6.2); ctx.lineTo(x, 196 - i * 6); ctx.stroke(); }
    rim(() => drawMan(dx, dy, 150, o), 5, 0.5);
    finish(0.5, t);
  };
  DUR.miroir = 5.2;

  /* ---------- II, ép. 17 : souvenirs d'un chasseur d'Afrique — tous les regards sont sur lui ---------- */
  DRAW.diner = function (t) {
    base();
    room('#2c2226', '#3a2b2c', 150, '#1d1516');
    // le mirage du désert qu'il raconte : « ces contrées jaunes et nues »
    const m = sm(1.2, 2.4, t) * (1 - sm(4.4, 5.2, t));
    if (m > 0.01) {
      ctx.save(); ctx.globalAlpha = m * 0.85;
      const g = ctx.createRadialGradient(200, 52, 10, 200, 52, 120); g.addColorStop(0, 'rgba(240,190,110,.75)'); g.addColorStop(1, 'rgba(240,190,110,0)'); ctx.fillStyle = g; ctx.fillRect(60, 0, 280, 110);
      ctx.fillStyle = 'rgba(150,96,46,.8)'; ctx.beginPath(); ctx.moveTo(110, 82); ctx.quadraticCurveTo(170, 56, 230, 78); ctx.quadraticCurveTo(270, 66, 300, 82); ctx.closePath(); ctx.fill();
      // un chameau sur ses hautes jambes, à l'horizon
      const cx = 150 + t * 8; ctx.fillStyle = 'rgba(70,40,24,.85)'; ctx.beginPath(); ctx.ellipse(cx, 62, 9, 4, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(cx - 1, 57, 4, Math.PI, 0); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.moveTo(cx + 7, 61); ctx.lineTo(cx + 12, 53); ctx.lineTo(cx + 15, 54); ctx.stroke();
      [-6, -2, 3, 7].forEach((d, i) => { ctx.beginPath(); ctx.moveTo(cx + d, 64); ctx.lineTo(cx + d + Math.sin(t * 5 + i) * 1.2, 74); ctx.stroke(); });
      ctx.restore();
    }
    // la table, ses candélabres
    candelabra(70, 108, t, 0); candelabra(330, 108, t, 3);
    // les convives, de face ; ils se tournent vers lui
    const turn = sm(0.6, 1.6, t);
    const guest = (x, f, toward, glasses) => {
      ctx.save(); ctx.translate(x, 152); ctx.fillStyle = '#120c0d';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(11, -30); ctx.lineTo(-11, -30); ctx.fill();
      const hx = toward * 2.5 * turn;
      ctx.beginPath(); ctx.arc(hx, -38, 7.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + toward * 6.5, -40); ctx.lineTo(hx + toward * 9.5, -37); ctx.lineTo(hx + toward * 6.5, -35); ctx.fill();
      if (f) { ctx.beginPath(); ctx.arc(hx - toward * 4, -44, 4.6, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(240,226,206,.18)'; ctx.fillRect(-9, -30, 18, 6); }
      if (glasses) { ctx.strokeStyle = 'rgba(255,230,190,.8)'; ctx.lineWidth = 0.8; ctx.strokeRect(hx + toward * 2 - 3, -41 + 2 * sm(2.6, 3.0, t), 5, 2.5); }
      ctx.restore();
    };
    guest(40, true, 1); guest(92, false, 1, true); guest(146, true, 1);
    guest(256, true, -1); guest(306, false, -1); guest(360, true, -1);
    // Duroy, au centre, qui raconte avec de grands gestes
    const g1 = Math.sin(t * 3.2) * sm(0.4, 1.0, t) * (1 - sm(4.6, 5.2, t));
    rim(() => {
      ctx.save(); ctx.translate(200, 152); ctx.fillStyle = INK2; ctx.strokeStyle = INK2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.lineTo(13, -36); ctx.lineTo(-13, -36); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -45, 8.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -40); ctx.quadraticCurveTo(0, -38, 6, -40); ctx.lineTo(9, -38); ctx.lineTo(-9, -38); ctx.fill();
      ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(12, -32); ctx.lineTo(24, -40 - 10 * g1); ctx.lineTo(32 + 6 * g1, -56 - 8 * Math.abs(g1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -32); ctx.lineTo(-22, -22); ctx.lineTo(-14, -14); ctx.stroke();
      ctx.restore();
    }, 6, 0.55);
    table(0, 150, W, 50);
    for (let i = 0; i < 7; i++) { const x = 30 + i * 57; ctx.fillStyle = 'rgba(255,250,240,.9)'; ctx.beginPath(); ctx.ellipse(x, 158, 11, 2.6, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(200,220,240,.55)'; ctx.fillRect(x + 12, 146, 3, 10); ctx.fillStyle = 'rgba(150,40,60,.75)'; ctx.fillRect(x + 17, 148, 3, 8); }
    finish(0.5, t);
  };
  DUR.diner = 5.2;

  /* ---------- III, ép. 24 : à la fenêtre de la rue Boursault, un train sort du tunnel ---------- */
  DRAW.fenetre = function (t) {
    base();
    ctx.fillStyle = '#140f10'; ctx.fillRect(0, 0, W, H);
    windowView(70, 18, 260, 130, (x, y, w, h) => {
      sky([[0, '#16182a'], [0.7, '#2d2a3c'], [1, '#463645']], y + h);
      stars(t, 18, 9, 60);
      ctx.fillStyle = '#1e1a24'; for (let i = 0; i < 9; i++) { const bx = 70 + i * 32, bh = 22 + (i * 37 % 19); ctx.fillRect(bx, 76 - bh, 30, bh + 6); ctx.fillStyle = 'rgba(244,178,96,.7)'; if (i % 3 === 1) ctx.fillRect(bx + 8, 60, 5, 6); ctx.fillStyle = '#1e1a24'; }
      // la tranchée des voies, et la bouche du tunnel
      ctx.fillStyle = '#231c22'; ctx.fillRect(70, 82, 260, 66);
      ctx.strokeStyle = 'rgba(200,190,180,.25)'; ctx.lineWidth = 0.9; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(70, 104 + i * 8); ctx.lineTo(330, 100 + i * 9); ctx.stroke(); }
      ctx.fillStyle = '#0d0a0b'; ctx.beginPath(); ctx.moveTo(70, 148); ctx.lineTo(70, 96); ctx.arc(104, 104, 30, Math.PI, 0); ctx.lineTo(134, 148); ctx.fill();
      ctx.fillStyle = '#2e252b'; ctx.fillRect(66, 70, 74, 6);
      [[180, 96, '255,80,60'], [292, 92, '120,220,140']].forEach(([sx, sy, c]) => { ctx.fillStyle = '#0d0a0b'; ctx.fillRect(sx - 0.8, sy, 1.6, 20); ctx.fillStyle = 'rgba(' + c + ',.95)'; ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 7); ctx.fill(); glow(sx, sy, 10, c, 0.5); });
      // le train sort « avec un bruit subit et violent » et file vers la mer
      const tx = 80 + Math.max(0, t - 0.6) * 78;
      if (t > 0.6) { train(tx, 134, 0.55, 1, t, 4, '#0e0a0a'); puffs(tx + 18, 112, t, 9, '205,196,186', 46, 34); }
      glow(tx + 26, 120, 60, '255,190,120', 0.12 * sm(0.6, 1.2, t));
    });
    // la table et la page blanche, la bougie
    ctx.fillStyle = '#211816'; ctx.fillRect(0, 160, W, 40);
    ctx.fillStyle = '#efe6d4'; ctx.fillRect(18, 166, 52, 26); ctx.fillStyle = 'rgba(80,60,50,.5)'; ctx.fillRect(24, 172, 30, 1.2);
    candle(86, 152, t, 2);
    // Duroy accoudé à la fenêtre, de dos
    rim(() => {
      ctx.fillStyle = INK2; ctx.save(); ctx.translate(232, 200);
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.lineTo(26, -60); ctx.quadraticCurveTo(0, -68, -26, -60); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-30, -54, 12, 7, -0.3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(30, -54, 12, 7, 0.3, 0, 7); ctx.fill();
      const hr = 0.1 * sm(1.2, 2.2, t);
      ctx.beginPath(); ctx.arc(2 + hr * 30, -78, 12, 0, 7); ctx.fill(); ctx.fillRect(-5, -70, 12, 12);
      ctx.restore();
    }, 5, 0.35);
    finish(0.55, t);
  };
  DUR.fenetre = 5.4;

  /* ---------- III, ép. 28 : « Je ferai la sauce » — elle fume et dicte, il écrit ---------- */
  DRAW.dictee = function (t) {
    base();
    room('#2e2427', '#3a2c2c', 170, '#211818');
    // bibliothèque
    for (let s = 0; s < 3; s++) { ctx.fillStyle = '#1d1517'; ctx.fillRect(250, 22 + s * 38, 140, 3); const r = rng(40 + s); for (let b = 0; b < 16; b++) { ctx.fillStyle = ['#5a2a24', '#2c3a44', '#4a3a22', '#3a2430'][b % 4]; const bh = 22 + r() * 10; ctx.fillRect(252 + b * 8.6, 22 + s * 38 - bh, 7, bh); } }
    // la lampe, la grande table, la page qui se remplit
    glow(150, 100, 140, '255,200,130', 0.3);
    table(70, 128, 170, 30, '#3b2d24');
    ctx.fillStyle = '#efe6d4'; ctx.fillRect(126, 124, 42, 6);
    ctx.fillStyle = '#2a1d16'; ctx.fillRect(208, 106, 3, 22); ctx.fillStyle = 'rgba(255,214,150,.9)'; ctx.beginPath(); ctx.moveTo(200, 106); ctx.lineTo(220, 106); ctx.lineTo(214, 96); ctx.lineTo(206, 96); ctx.fill(); glow(210, 102, 50, '255,200,130', 0.4);
    // Duroy écrit
    const wr = Math.sin(t * 10) * 2.5;
    rim(() => sitter(108, 170, 96, 1, { pen: true, hand: [26 + wr * 0.6, -46], lean: 4 }), 5, 0.45);
    // Mme Forestier, debout, la cigarette ; elle va et vient
    const mx = 292 + Math.sin(t * 0.9) * 18, mdir = Math.cos(t * 0.9) > 0 ? 1 : -1;
    const hand = sm(0.6, 1.2, t) * (1 - sm(3.6, 4.0, t)) + sm(4.4, 4.9, t);
    rim(() => drawWoman(mx, 186, 116, { dir: -1, phase: t * 2.2 * (mdir !== 0 ? 1 : 0), col: INK2, nohat: true, pose: [11, -86 + 4 * (1 - hand)] }), 5, 0.45);
    // la fumée qui monte en volutes
    const sx = mx - 13 * 1.16, sy = 186 - 88 * 1.16;
    for (let i = 0; i < 10; i++) { const p = ((t * 0.22 + i / 10) % 1); const px = sx + Math.sin(p * 9 + i) * (4 + p * 14) - p * 10, py = sy - p * 70; ctx.strokeStyle = 'rgba(225,215,205,' + (0.35 * (1 - p)) + ')'; ctx.lineWidth = 1 + p * 3; ctx.beginPath(); ctx.arc(px, py, 2 + p * 6, p * 6, p * 6 + 2.4); ctx.stroke(); }
    finish(0.5, t);
  };
  DUR.dictee = 5.4;

  /* ---------- III, ép. 32 : le bilboquet de Forestier, devant la cheminée ---------- */
  DRAW.bilboquet = function (t) {
    base();
    room('#2a2a24', '#34332a', 160, '#1d1a16');
    // la cheminée, la pendule, le feu
    ctx.fillStyle = '#3c3530'; ctx.fillRect(60, 92, 120, 8); ctx.fillStyle = '#2b2522'; ctx.fillRect(68, 100, 104, 60); ctx.fillStyle = '#120d0c'; ctx.fillRect(84, 112, 72, 48);
    for (let i = 0; i < 6; i++) { const fx = 100 + i * 8, fh = 10 + 8 * vn(t * 6 + i * 2); ctx.fillStyle = 'rgba(255,' + (120 + i * 12) + ',60,.85)'; ctx.beginPath(); ctx.ellipse(fx, 158 - fh / 2, 3, fh / 2, 0, 0, 7); ctx.fill(); }
    glow(120, 150, 70, '255,150,70', 0.35);
    ctx.fillStyle = '#c99a3c'; ctx.fillRect(108, 74, 24, 18); ctx.fillStyle = '#f3ead6'; ctx.beginPath(); ctx.arc(120, 82, 6, 0, 7); ctx.fill();
    // la grande table verte et les rédacteurs
    ctx.fillStyle = '#2f4a36'; ctx.fillRect(196, 138, 196, 6); ctx.fillStyle = '#1d1715'; ctx.fillRect(200, 144, 6, 30); ctx.fillRect(382, 144, 6, 30);
    [[226, 1], [262, 1], [334, -1], [370, -1]].forEach(([x, d], i) => { ctx.fillStyle = '#efe6d4'; ctx.fillRect(x + d * 10 - 6, 134, 14, 4); sitter(x, 178, 74, d, { pen: true, hand: [24 + Math.sin(t * 9 + i) * 2, -48], lean: 3, col: '#140e0e' }); });
    glow(300, 110, 90, '255,210,150', 0.2);
    // Forestier joue : la boule de buis monte et retombe sur la pointe
    const fx = 150, fy = 182;
    const cyc = 1.05, ph = (t % cyc) / cyc, up = Math.sin(ph * Math.PI);
    const n = 22 + Math.min(3, Math.floor(t / cyc));
    rim(() => {
      drawMan(fx, fy, 128, { dir: 1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true, pose: [18, -62 - 4 * up, 1] });
    }, 5, 0.5);
    const hx = fx + 18 * 1.28 + 1, hy = fy + (-62 - 4 * up) * 1.28;
    ctx.strokeStyle = '#d8b878'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 2, hy - 18); ctx.stroke();
    const by = hy - 20 - up * 46, bx = hx + 2 + Math.sin(ph * Math.PI * 2) * 3;
    ctx.strokeStyle = 'rgba(230,220,200,.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 8); ctx.quadraticCurveTo(hx + 10, (hy + by) / 2, bx, by); ctx.stroke();
    ctx.fillStyle = '#e1b85c'; ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 7); ctx.fill(); glow(bx, by, 10, '255,220,140', 0.3);
    // il compte à voix haute
    if (t < 4.4) {
      ctx.font = "italic 600 15px 'Bodoni Moda', Didot, Georgia, serif"; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(244,237,227,' + (0.9 * (1 - ph * 0.6)) + ')'; ctx.fillText(String(n), bx + 26, by + 4 - ph * 8);
    } else {
      ctx.font = "italic 600 15px 'Bodoni Moda', Didot, Georgia, serif"; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(244,237,227,' + sm(4.4, 4.8, t) + ')'; ctx.fillText('« Vingt-six. »', 300, 40);
    }
    finish(0.5, t);
  };
  DUR.bilboquet = 5.4;

  /* ---------- IV, ép. 35 : à l'aube, le kiosque de la gare Saint-Lazare ---------- */
  DRAW.kiosque = function (t) {
    base();
    const d = sm(0, 5, t);
    sky([[0, 'rgb(' + Math.round(lerp(40, 92, d)) + ',' + Math.round(lerp(44, 92, d)) + ',' + Math.round(lerp(70, 120, d)) + ')'], [1, 'rgb(' + Math.round(lerp(120, 236, d)) + ',' + Math.round(lerp(96, 170, d)) + ',' + Math.round(lerp(110, 130, d)) + ')']], 150);
    // la gare : la grande façade, l'horloge
    ctx.fillStyle = '#2a2230'; ctx.fillRect(40, 34, 320, 116); ctx.fillRect(170, 18, 60, 20);
    ctx.fillStyle = 'rgba(255,214,150,' + (0.35 + 0.2 * (1 - d)) + ')'; for (let i = 0; i < 9; i++) { ctx.fillRect(56 + i * 34, 74, 18, 40); ctx.beginPath(); ctx.arc(65 + i * 34, 74, 9, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#f3ead6'; ctx.beginPath(); ctx.arc(200, 52, 11, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a1e1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(200, 52); ctx.lineTo(200, 45); ctx.moveTo(200, 52); ctx.lineTo(205, 54); ctx.stroke();
    ctx.fillStyle = '#2b2226'; ctx.fillRect(0, 150, W, 50);
    // le kiosque : sa boutique de verre s'ouvre et s'éclaire
    const open = sm(0.4, 1.2, t);
    const kx = 300;
    ctx.fillStyle = '#16100f'; ctx.beginPath(); ctx.moveTo(kx - 26, 98); ctx.lineTo(kx, 82); ctx.lineTo(kx + 26, 98); ctx.fill(); ctx.fillRect(kx - 1, 74, 2, 9);
    ctx.fillStyle = '#1b1414'; ctx.fillRect(kx - 22, 98, 44, 92);
    ctx.fillStyle = 'rgba(255,208,140,' + (0.25 + 0.65 * open) + ')'; ctx.fillRect(kx - 18, 104, 36, 46);
    ctx.fillStyle = 'rgba(70,50,40,.55)'; for (let i = 0; i < 5; i++) ctx.fillRect(kx - 16 + i * 7, 108, 5, 38);
    glow(kx, 128, 70, '255,200,130', 0.3 * open);
    ctx.fillStyle = '#efe6d4'; for (let i = 0; i < 4; i++) ctx.fillRect(kx - 20 + i * 10, 152, 8, 12);
    // le porteur qui court, des journaux sur la tête
    const px = walkTo(t, 0.2, 2.6, -40, 262);
    if (t < 3.0) { drawMan(px, 192, 92, { dir: 1, phase: (px + 40) / 60 * Math.PI * 2, amp: 1, col: '#120c0d', nohat: true, pose: [6, -104, 1] }); ctx.fillStyle = '#e6dcc6'; ctx.fillRect(px - 10, 192 - 112, 24, 9); }
    // Duroy arrive, achète, déplie le journal
    const dx = walkTo(t, 1.0, 3.2, -60, 238), rd = sm(3.4, 3.9, t);
    rim(() => drawMan(dx, 196, 132, { dir: 1, phase: (dx + 60) / 103 * Math.PI * 2, amp: t < 3.2 ? 0.8 : 0, stance: t >= 3.2, tilt: -0.12, must: true, col: INK2, pose: rd > 0.01 ? [17, -70, rd] : null }), 5, 0.45);
    if (rd > 0.01) { ctx.fillStyle = 'rgba(238,230,212,' + rd + ')'; const nx = dx + 14, ny = 196 - 92 * 1.32 / 1.32 - 14; ctx.fillRect(nx, ny - 26, 34, 40); ctx.fillStyle = 'rgba(60,48,40,' + 0.7 * rd + ')'; ctx.fillRect(nx + 3, ny - 22, 28, 3); for (let l = 0; l < 7; l++) ctx.fillRect(nx + 3, ny - 15 + l * 4, 12, 1); for (let l = 0; l < 7; l++) ctx.fillRect(nx + 18, ny - 15 + l * 4, 12, 1); }
    finish(0.45, t);
  };
  DUR.kiosque = 5.0;

  /* ---------- V, ép. 46 : le café Riche, un salon rouge, douze bougies ---------- */
  DRAW.riche = function (t) {
    base();
    room('#5a1a1c', '#4a1517', 168, '#2a1414');
    // la fenêtre sur le boulevard : la tache vert clair des feuilles éclairées
    windowView(150, 18, 100, 92, (x, y, w, h) => {
      ctx.fillStyle = '#1a1d22'; ctx.fillRect(x, y, w, h);
      const r = rng(21); for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(' + (120 + r() * 40) + ',' + (190 + r() * 40) + ',' + (110 + r() * 30) + ',' + (0.55 + 0.3 * vn(t + i)) + ')'; ctx.beginPath(); ctx.arc(x + 10 + r() * 80, y + 10 + r() * 60, 5 + r() * 8, 0, 7); ctx.fill(); }
      glow(x + 50, y + 40, 60, '210,255,190', 0.25);
    });
    // les tentures, les deux hauts candélabres
    ctx.fillStyle = 'rgba(30,6,8,.35)'; for (let x = 0; x < W; x += 14) ctx.fillRect(x, 0, 4, 168);
    const cand = (x) => { ctx.fillStyle = '#2a1d16'; ctx.fillRect(x - 2, 96, 4, 44); ctx.fillRect(x - 8, 138, 16, 3); ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 18, 92); ctx.quadraticCurveTo(x, 104, x + 18, 92); ctx.stroke(); [-18, -11, -4, 4, 11, 18].forEach((d, i) => { ctx.fillStyle = '#eadfc8'; ctx.fillRect(x + d - 1, 84 + Math.abs(d) * 0.2, 2, 8); flame(x + d, 84 + Math.abs(d) * 0.2, 0.7, t, x + i); }); };
    // la table carrée, nappe blanche si luisante qu'elle semble vernie
    table(120, 140, 160, 28, '#f5efe2');
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(130, 141, 140, 1.4);
    [140, 175, 225, 260].forEach((x) => { ctx.fillStyle = 'rgba(220,235,245,.7)'; ctx.fillRect(x, 128, 3, 11); ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.ellipse(x + 1, 141, 7, 1.6, 0, 0, 7); ctx.fill(); });
    cand(116); cand(284);
    // le canapé très bas, rouge comme les tentures
    ctx.fillStyle = '#7a2224'; ctx.fillRect(300, 160, 96, 22); ctx.fillRect(300, 136, 96, 26); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(300, 158, 96, 3);
    // Duroy arrive le premier et s'assied : « la sensation de tomber dans un trou »
    const dx = walkTo(t, 0, 2.2, -40, 330);
    if (t < 2.4) rim(() => drawMan(dx, 196, 128, { dir: 1, phase: (dx + 40) / 100 * Math.PI * 2, amp: 0.8, col: INK2, must: true, nohat: true }), 5, 0.5);
    else {
      const sink = sm(2.4, 2.9, t) * 9 - sm(2.9, 3.3, t) * 3;
      rim(() => sitter(352, 186 + sink, 118, -1, { hand: [16, -52], lean: -2, nochair: true, col: INK2 }), 5, 0.5);
    }
    finish(0.5, t);
  };
  DUR.riche = 5.0;

  /* ---------- V, ép. 49 : dans le fiacre, la boîte noire et les becs de gaz ---------- */
  DRAW.fiacrenuit = function (t) {
    base();
    ctx.fillStyle = '#0e0a0b'; ctx.fillRect(0, 0, W, H);
    // la portière : la rue qui défile
    windowView(250, 30, 120, 90, (x, y, w, h) => {
      ctx.fillStyle = '#17141c'; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 4; i++) { const lx = x + w + 40 - ((t * 120 + i * 90) % 360); ctx.fillStyle = '#0c0a0b'; ctx.fillRect(lx - 1, y + 40, 2, 60); ctx.fillStyle = 'rgba(255,214,150,.95)'; ctx.beginPath(); ctx.arc(lx, y + 38, 3, 0, 7); ctx.fill(); glow(lx, y + 38, 26, '255,200,130', 0.5); }
      ctx.fillStyle = 'rgba(30,24,30,.6)'; for (let i = 0; i < 5; i++) { const bx = x + w - ((t * 70 + i * 50) % 260); ctx.fillRect(bx, y + 4, 34, 30); }
    });
    // la lumière d'un bec de gaz balaie l'intérieur, par instants
    const sweep = (t * 120 / 90) % 4, bx = 400 - (sweep % 1) * 520, a = Math.max(0, 1 - Math.abs((sweep % 1) - 0.5) * 2.2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(bx - 60, 0, bx + 60, 0); g.addColorStop(0, 'rgba(255,200,130,0)'); g.addColorStop(0.5, 'rgba(255,200,130,' + (0.32 * a) + ')'); g.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    // la banquette, les deux silhouettes serrées
    ctx.fillStyle = '#1d1415'; ctx.fillRect(40, 150, 220, 50); ctx.fillRect(40, 60, 18, 140);
    const turn = sm(1.6, 3.4, t);
    // elle : chapeau à plume, de profil vers la droite
    rim(() => {
      ctx.save(); ctx.translate(150, 200); ctx.fillStyle = INK2;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(22, 0); ctx.lineTo(16, -62); ctx.lineTo(-14, -62); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -74, 9, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, -77); ctx.lineTo(13, -73); ctx.lineTo(10, -71); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -82, 13, 3.4, -0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(-1, -86, 7, 4.6, 0, 0, 7); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = INK2; ctx.beginPath(); ctx.moveTo(-4, -88); ctx.quadraticCurveTo(-16, -100, -22, -90); ctx.stroke();
      ctx.restore();
      // lui, à sa gauche ; il se tourne vers elle
      ctx.save(); ctx.translate(96, 200); ctx.fillStyle = INK2;
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(26, 0); ctx.lineTo(20, -70); ctx.lineTo(-18, -70); ctx.fill();
      ctx.beginPath(); ctx.arc(2 + 4 * turn, -82, 10, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10 + 5 * turn, -84); ctx.lineTo(14 + 5 * turn, -80); ctx.lineTo(10 + 5 * turn, -78); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6 + 5 * turn, -77); ctx.quadraticCurveTo(12 + 5 * turn, -78, 16 + 5 * turn, -75); ctx.lineTo(8 + 5 * turn, -75); ctx.fill();
      ctx.save(); ctx.translate(2 + 4 * turn, -92); ctx.rotate(-0.1); ctx.fillRect(-8, -16, 16, 16); ctx.beginPath(); ctx.ellipse(0, 0, 13, 2.4, 0, 0, 7); ctx.fill(); ctx.restore();
      ctx.restore();
    }, 5, 0.45 + 0.4 * a);
    finish(0.6, t);
  };
  DUR.fiacrenuit = 5.0;

  /* ---------- V, ép. 55 : La Reine Blanche, le bastringue ---------- */
  DRAW.bal = function (t) {
    base();
    room('#3a2a2a', '#4a3230', 150, '#2a1f1c');
    // lustres à gaz, guirlandes
    [100, 300].forEach((x, i) => { ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 22); ctx.stroke(); ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(x, 24, 24, 4, 0, 0, 7); ctx.fill(); for (let k = -2; k <= 2; k++) flame(x + k * 10, 22, 0.6, t, i * 5 + k); });
    ctx.strokeStyle = 'rgba(220,80,70,.6)'; ctx.lineWidth = 1.4; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(k * 100, 8); ctx.quadraticCurveTo(k * 100 + 50, 30, k * 100 + 100, 8); ctx.stroke(); }
    // l'orchestre sur son estrade
    ctx.fillStyle = '#2a1d18'; ctx.fillRect(150, 92, 100, 8);
    [165, 190, 215, 238].forEach((x, i) => { drawMan(x, 92, 40, { dir: 1, phase: 0, amp: 0, stance: true, col: '#1d1416', nohat: true, pose: [14, -70 + 4 * Math.sin(t * 6 + i), 1] }); });
    // les couples qui tournent
    const C = [[90, 150, 0], [200, 160, 2.1], [310, 152, 4.2], [150, 176, 1.1], [258, 182, 3.1]];
    C.forEach(([cx, cy, p], i) => {
      const a = t * 2.4 + p, x = cx + Math.cos(a) * 14, y = cy + Math.sin(a) * 4, s = 0.82 + (cy - 150) / 120;
      const d = Math.sin(a) > 0 ? 1 : -1;
      drawWoman(x + 5 * d, y, 78 * s, { dir: -d, phase: a * 2, col: '#1a1213' });
      drawMan(x - 5 * d, y, 84 * s, { dir: d, phase: a * 2, amp: 0.5, col: '#160f10', nohat: i % 2 === 0, pose: [12, -70, 1] });
    });
    // le municipal, grave et immobile
    drawMan(372, 196, 112, { dir: -1, phase: 0, amp: 0, stance: true, col: '#101820', nohat: true });
    ctx.fillStyle = '#101820'; ctx.fillRect(366, 196 - 116, 12, 8); ctx.fillRect(364, 196 - 110, 16, 2.4);
    // Clotilde, serrée contre Duroy, à l'entrée
    const ex = walkTo(t, 0, 2.4, -30, 64);
    rim(() => { drawMan(ex, 200, 132, { dir: 1, phase: (ex + 30) / 100 * Math.PI * 2, amp: t < 2.4 ? 0.7 : 0, stance: t >= 2.4, tilt: -0.1, must: true, col: INK2 }); drawWoman(ex + 18, 200, 112, { dir: 1, phase: (ex + 30) / 80 * Math.PI * 2, col: INK2 }); }, 5, 0.5);
    finish(0.5, t);
  };
  DUR.bal = 5.0;

  /* ---------- VI, ép. 72 : « Vous regardez mes tableaux ? » — Walter et sa lampe ---------- */
  DRAW.tableaux = function (t) {
    base();
    room('#2a2224', '#33292a', 170, '#1d1617');
    const lx = walkTo(t, 0.2, 4.2, 70, 300);            // la lampe passe d'une toile à l'autre
    const paint = (x, y, w, h, fn) => { frameRect(x, y, w, h, (X, Y, Wd, Hd) => { fn(X, Y, Wd, Hd); const k = clamp(1 - Math.abs(lx - (X + Wd / 2)) / 90); ctx.fillStyle = 'rgba(10,6,6,' + (0.62 - 0.55 * k) + ')'; ctx.fillRect(X, Y, Wd, Hd); }); };
    // une plage de Normandie sous un ciel d'orage (Guillemet)
    paint(40, 34, 92, 62, (x, y, w, h) => { let g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#3c4552'); g.addColorStop(0.55, '#7d8790'); g.addColorStop(0.56, '#46606a'); g.addColorStop(0.8, '#5d6e70'); g.addColorStop(1, '#c2b292'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(30,34,44,.6)'; ctx.beginPath(); ctx.ellipse(x + 30, y + 14, 34, 10, 0, 0, 7); ctx.fill(); });
    // un bois (Harpignies)
    paint(150, 34, 70, 62, (x, y, w, h) => { ctx.fillStyle = '#b9a87e'; ctx.fillRect(x, y, w, h); for (let i = 0; i < 4; i++) tree(x + 12 + i * 16, y + h, 54, '#3d4a2c', 0, 7 + i); });
    // une plaine d'Algérie, avec un chameau à l'horizon (Guillaumet)
    paint(238, 34, 120, 62, (x, y, w, h) => { let g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#e8c58a'); g.addColorStop(0.6, '#f3dcaa'); g.addColorStop(0.61, '#c9a067'); g.addColorStop(1, '#a87b46'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); const cx = x + 80, cy = y + 36; ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.ellipse(cx, cy, 7, 3.4, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(cx - 1, cy - 3, 3.4, Math.PI, 0); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#4a3020'; ctx.beginPath(); ctx.moveTo(cx + 6, cy - 1); ctx.lineTo(cx + 10, cy - 7); ctx.lineTo(cx + 12, cy - 6); ctx.stroke(); [-5, -2, 2, 5].forEach((d) => { ctx.beginPath(); ctx.moveTo(cx + d, cy + 2); ctx.lineTo(cx + d, cy + 12); ctx.stroke(); }); });
    // M. Walter, petit et gros, qui promène sa lampe ; Duroy et un invité suivent
    const k = (lx - 70) / 230;
    rim(() => {
      ctx.save(); ctx.translate(lx - 18, 194); ctx.scale(1.25, 1); drawMan(0, 0, 104, { dir: 1, phase: t * 5, amp: t > 0.2 && t < 4.2 ? 0.5 : 0, stance: t >= 4.2, col: INK2, nohat: true, pose: [18, -76, 1] }); ctx.restore();
      drawMan(lx - 82, 196, 132, { dir: 1, phase: t * 4.2, amp: t > 0.4 && t < 4.4 ? 0.5 : 0, stance: t >= 4.4, col: INK2, must: true, nohat: true, tilt: -0.1 });
      drawWoman(lx - 120, 196, 118, { dir: 1, phase: t * 4, col: INK2, nohat: true });
    }, 5, 0.45);
    const hx = lx - 18 + 18 * 1.25 * 1.04, hy = 194 - 76 * 1.04;
    ctx.fillStyle = '#c99a3c'; ctx.fillRect(hx - 2, hy - 2, 4, 6); ctx.fillStyle = 'rgba(255,236,190,.95)'; ctx.beginPath(); ctx.ellipse(hx, hy - 8, 5, 6.5, 0, 0, 7); ctx.fill();
    glow(hx, hy - 8, 120, '255,200,130', 0.45);
    finish(0.5, t);
  };
  DUR.tableaux = 5.0;

  /* ---------- VI, ép. 76 : la nuit, le vieux poète parle de la mort ---------- */
  DRAW.poete = function (t) {
    base();
    sky([[0, '#0e1222'], [1, '#2a2638']], 140);
    stars(t, 26, 31, 80);
    ctx.fillStyle = 'rgba(240,236,220,.9)'; ctx.beginPath(); ctx.arc(330, 34, 10, 0, 7); ctx.fill(); glow(330, 34, 50, '230,230,255', 0.2);
    // les façades endormies, les arbres nus, les réverbères qui défilent
    const off = t * 22;
    ctx.fillStyle = '#1a1622'; for (let i = -1; i < 8; i++) { const bx = ((i * 64 - off * 0.5) % 520 + 520) % 520 - 60; ctx.fillRect(bx, 50 + (i * 23 % 20), 60, 100); ctx.fillStyle = 'rgba(244,178,96,.35)'; if (i % 3 === 0) ctx.fillRect(bx + 22, 80, 6, 8); ctx.fillStyle = '#1a1622'; }
    ctx.fillStyle = '#211b22'; ctx.fillRect(0, 150, W, 50);
    for (let i = 0; i < 4; i++) { const lx = ((i * 150 - off) % 600 + 600) % 600 - 100; lamp(lx, 190, 92, 0.9); }
    for (let i = 0; i < 3; i++) { const tx = ((i * 190 + 80 - off * 0.8) % 570 + 570) % 570 - 80; ctx.strokeStyle = '#151118'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, 150); ctx.lineTo(tx, 90); for (let b = 0; b < 6; b++) { ctx.moveTo(tx, 110 - b * 4); ctx.lineTo(tx + (b % 2 ? 1 : -1) * (14 + b * 2), 92 - b * 6); } ctx.stroke(); }
    // ils marchent lentement, côte à côte ; le poète voûté, l'haleine qui fume dans le froid
    const ph = t * 4.2;
    rim(() => {
      ctx.save(); ctx.translate(176, 196); ctx.scale(1.22, 1); drawMan(0, 0, 112, { dir: 1, phase: ph, amp: 0.45, lean: 0.12, cane: true, col: INK2, tilt: 0.05 }); ctx.restore();
      drawMan(228, 198, 134, { dir: 1, phase: ph + 1, amp: 0.55, col: INK2, must: true, tilt: -0.1 });
    }, 5, 0.4);
    for (let i = 0; i < 4; i++) { const p = ((t * 0.5 + i / 4) % 1); ctx.fillStyle = 'rgba(230,230,240,' + (0.3 * (1 - p)) + ')'; ctx.beginPath(); ctx.arc(192 + p * 16, 196 - 98 - p * 10, 2 + p * 5, 0, 7); ctx.fill(); }
    finish(0.55, t);
  };
  DUR.poete = 5.0;

  /* ---------- VI, ép. 78 : l'avenue du Bois, un matin de soleil d'avril ---------- */
  DRAW.avenue = function (t) {
    base();
    sky([[0, '#8fb6d8'], [1, '#e8e2cf']], 120);
    ctx.fillStyle = 'rgba(255,250,230,.9)'; ctx.beginPath(); ctx.arc(60, 26, 12, 0, 7); ctx.fill(); glow(60, 26, 90, '255,240,200', 0.35);
    // l'arc de triomphe au loin
    ctx.fillStyle = 'rgba(120,120,140,.6)'; ctx.fillRect(176, 62, 48, 46); ctx.fillStyle = '#d9d6cc'; ctx.beginPath(); ctx.arc(200, 108, 11, Math.PI, 0); ctx.fill(); ctx.fillRect(189, 97, 22, 11);
    ctx.fillStyle = '#b7a98a'; ctx.fillRect(0, 108, W, 92);
    ctx.fillStyle = '#a89878'; ctx.fillRect(0, 140, W, 14);
    for (let i = 0; i < 7; i++) tree(-10 + i * 70, 112, 70, 'rgba(90,128,70,.92)', t, 50 + i);
    // les cavaliers et les amazones qui trottent, une victoria
    const r1 = 440 - t * 40, r2 = 520 - t * 52, r3 = -80 + t * 46;
    rider(r1, 140, 0.62, -1, 440 - r1, true, '#2a2220');
    rider(r2, 138, 0.58, -1, 520 - r2, false, '#2a2220');
    victoria(r3, 150, 0.6, 1, r3 + 80, '#2a2220');
    // Duroy se promène sur l'autre côté, en regardant passer les riches
    const dx = walkTo(t, 0, 4.6, 70, 230);
    ctx.fillStyle = 'rgba(40,30,20,.25)'; ctx.beginPath(); ctx.ellipse(dx + 18, 199, 30, 4, 0, 0, 7); ctx.fill();
    drawMan(dx, 198, 120, { dir: 1, phase: (dx - 70) / 94 * Math.PI * 2, amp: t < 4.6 ? 0.7 : 0, stance: t >= 4.6, tilt: -0.12, must: true, col: '#1a1311', cane: true });
    finish(0.3, t);
  };
  DUR.avenue = 5.0;

  /* ---------- VII, ép. 84 : la cave de Rival, la ligne de becs de gaz et l'homme de fer ---------- */
  DRAW.cave = function (t) {
    base();
    ctx.fillStyle = '#1a1414'; ctx.fillRect(0, 0, W, H);
    // les voûtes qui s'enfoncent, la ligne de becs de gaz jusqu'au fond
    for (let i = 5; i >= 0; i--) { const k = i / 6, x0 = lerp(0, 160, k), x1 = lerp(W, 240, k), y0 = lerp(0, 66, k), y1 = lerp(H, 136, k); ctx.fillStyle = 'rgb(' + Math.round(42 - i * 4) + ',' + Math.round(34 - i * 3) + ',' + Math.round(32 - i * 3) + ')'; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0 + (y1 - y0) * 0.3); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 10 * (1 - k), x1, y0 + (y1 - y0) * 0.3); ctx.lineTo(x1, y1); ctx.fill(); }
    for (let i = 0; i < 7; i++) { const k = i / 7, x = lerp(60, 190, k), y = lerp(30, 76, k); flame(x, y, 0.9 - k * 0.5, t, i); }
    // l'homme de fer peint en rouge et en bleu, au fond
    const hits = [1.3, 2.5, 3.7], shot = hits.reduce((a, h) => a + Math.exp(-Math.max(0, t - h) * 8) * (t > h ? 1 : 0), 0);
    ctx.save(); ctx.translate(202 + Math.sin(t * 40) * 1.5 * shot, 134); ctx.rotate(0.04 * shot);
    ctx.fillStyle = '#7a2a26'; ctx.fillRect(-7, -40, 14, 22); ctx.fillStyle = '#2a3a6a'; ctx.fillRect(-6, -18, 5, 18); ctx.fillRect(1, -18, 5, 18); ctx.fillStyle = '#7a2a26'; ctx.beginPath(); ctx.arc(0, -46, 5, 0, 7); ctx.fill();
    ctx.restore();
    glow(202, 112, 34, '255,210,150', 0.18);
    // Rival, droit, qui commande ; Duroy, le bras tendu, qui tire
    rim(() => {
      drawMan(330, 198, 132, { dir: -1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true });
      drawMan(96, 198, 148, { dir: 1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true, pose: [30, -82, sm(0.4, 0.9, t)] });
    }, 5, 0.45);
    const gx = 96 + 30 * 1.48 + 4, gy = 198 - 82 * 1.48;
    ctx.fillStyle = INK2; ctx.fillRect(gx - 4, gy - 2, 12, 3.4); ctx.fillRect(gx - 3, gy, 3, 6);
    hits.forEach((h) => { if (t > h - 0.02) { const d = t - h; if (d < 0.08) { glow(gx + 10, gy, 30, '255,220,140', 0.9); ctx.fillStyle = 'rgba(255,240,200,.95)'; ctx.beginPath(); ctx.arc(gx + 10, gy, 3, 0, 7); ctx.fill(); } puffs(gx + 10 + d * 30, gy - 2, d * 2, 3, '200,196,190', 20, 20); } });
    finish(0.55, t);
  };
  DUR.cave = 4.8;

  /* ---------- VII, ép. 86 : « Aurais-je peur ? » — la bougie rallumée, la glace ---------- */
  DRAW.peur = function (t) {
    base();
    ctx.fillStyle = '#100c0d'; ctx.fillRect(0, 0, W, H);
    const lit = sm(0.5, 0.9, t);
    ctx.globalAlpha = 0.25 + 0.75 * lit;
    room('#2a2024', '#2f2427', 176, '#1a1314');
    // le lit défait, le coucou au mur
    ctx.fillStyle = '#d9cfbf'; ctx.beginPath(); ctx.moveTo(10, 150); ctx.quadraticCurveTo(60, 138, 120, 148); ctx.lineTo(124, 176); ctx.lineTo(10, 176); ctx.fill(); ctx.fillStyle = '#2a1d18'; ctx.fillRect(6, 128, 6, 60); ctx.fillRect(122, 140, 5, 48);
    const ck = sm(3.4, 3.55, t) * (1 - sm(4.0, 4.2, t));
    ctx.fillStyle = '#3a2618'; ctx.beginPath(); ctx.moveTo(150, 40); ctx.lineTo(166, 28); ctx.lineTo(182, 40); ctx.fill(); ctx.fillRect(152, 40, 28, 26); ctx.fillStyle = '#efe6d4'; ctx.beginPath(); ctx.arc(166, 52, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 1; const pa = Math.sin(t * 5) * 0.3; ctx.beginPath(); ctx.moveTo(166, 66); ctx.lineTo(166 + Math.sin(pa) * 24, 66 + Math.cos(pa) * 24); ctx.stroke(); ctx.beginPath(); ctx.arc(166 + Math.sin(pa) * 24, 66 + Math.cos(pa) * 24, 3, 0, 7); ctx.fillStyle = '#c99a3c'; ctx.fill();
    if (ck > 0.01) { ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.ellipse(166, 36 - 6 * ck, 4, 3, 0, 0, 7); ctx.fill(); }
    // la glace
    const mx = 262, my = 36, mw = 92, mh = 110;
    frameRect(mx, my, mw, mh, (x, y, w, h) => {
      ctx.fillStyle = '#2b2328'; ctx.fillRect(x, y, w, h);
      // son visage reflété : « il était pâle, très pâle »
      const ra = sm(1.8, 2.6, t);
      if (ra > 0.01) {
        ctx.globalAlpha = (0.25 + 0.75 * lit) * ra;
        // le reflet : la même silhouette, livide dans la lueur de la bougie
        const fx = x + w * 0.46;
        ctx.fillStyle = '#b9ada2'; ctx.beginPath(); ctx.moveTo(fx - 24, y + h); ctx.lineTo(fx - 16, y + 70); ctx.lineTo(fx + 14, y + 70); ctx.lineTo(fx + 22, y + h); ctx.fill();
        ctx.fillStyle = '#d9d0c6'; ctx.beginPath(); ctx.arc(fx - 2, y + 50, 15, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 15, y + 46); ctx.lineTo(fx - 21, y + 52); ctx.lineTo(fx - 15, y + 55); ctx.fill();
        ctx.fillStyle = '#2a1e1e'; ctx.beginPath(); ctx.arc(fx - 2, y + 44, 15.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
        glow(x + w * 0.7, y + 70, 30, '255,200,130', 0.5 * ra);
        ctx.globalAlpha = 0.25 + 0.75 * lit;
      }
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, w, h);
    });
    ctx.globalAlpha = 1;
    // Duroy en chemise de nuit, la bougie à la main ; il sursaute quand le coucou grince
    const dx = walkTo(t, 1.0, 2.4, 160, 236), jump = sm(3.45, 3.6, t) * (1 - sm(3.8, 4.1, t)) * 4;
    rim(() => {
      ctx.save(); ctx.translate(dx, 198 - jump); ctx.fillStyle = '#e6ddcf';
      ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(16, -4); ctx.lineTo(10, -84); ctx.lineTo(-8, -84); ctx.fill();
      ctx.fillStyle = INK2; ctx.fillRect(-7, -4, 5, 6); ctx.fillRect(4, -4, 5, 6);
      ctx.beginPath(); ctx.arc(2, -94, 9, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(9, -97); ctx.lineTo(12, -93); ctx.lineTo(9, -91); ctx.fill();
      ctx.strokeStyle = '#e6ddcf'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(6, -76); ctx.lineTo(16, -60); ctx.lineTo(24, -66); ctx.stroke();
      ctx.restore();
    }, 4, 0.35);
    const cx = dx + 24, cy = 198 - jump - 72;
    if (t > 0.5) { ctx.fillStyle = '#c99a3c'; ctx.fillRect(cx - 5, cy + 6, 10, 2); ctx.fillStyle = '#eadfc8'; ctx.fillRect(cx - 1.6, cy - 4, 3.2, 10); flame(cx, cy - 4, 0.9, t, 4); }
    else { const m = sm(0.25, 0.45, t); glow(cx, cy - 4, 20 * m, '255,200,120', 0.6 * m); }
    finish(0.6, t);
  };
  DUR.peur = 5.2;

  /* ---------- VII, ép. 89 : la clairière, le sol gelé, « Feu ! » ---------- */
  DRAW.duel = function (t) {
    base();
    sky([[0, '#8a93a6'], [0.7, '#c9c3bf'], [1, '#e2d4c4']], 120);
    for (let i = 0; i < 9; i++) tree(-20 + i * 52, 128 + (i % 2) * 6, 96 + (i % 3) * 10, 'rgba(56,62,70,.85)', 0, 80 + i);
    ctx.fillStyle = '#d9d6d2'; ctx.fillRect(0, 128, W, 72);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; const r = rng(66); for (let i = 0; i < 60; i++) ctx.fillRect(r() * W, 130 + r() * 70, 1.4, 1);
    // la voiture arrêtée au bout de la clairière, les témoins
    drawFiacre(366, 140, 0.35, -1, 0, 0);
    [[150, 1], [168, 1], [236, -1], [254, -1]].forEach(([x, d]) => drawMan(x, 150, 46, { dir: d, phase: 0, amp: 0, stance: true, col: '#3a3d44' }));
    drawMan(200, 152, 48, { dir: 1, phase: 0, amp: 0, stance: true, col: '#3a3d44', nohat: true });
    // les deux cannes enfoncées dans le sol gelé
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(84, 190); ctx.lineTo(86, 170); ctx.moveTo(318, 190); ctx.lineTo(316, 170); ctx.stroke();
    // les deux adversaires ; au « Feu ! », deux petits nuages blancs
    const aim = sm(1.8, 2.3, t) * (1 - sm(3.9, 4.4, t)), shot = 2.6;
    rim(() => {
      drawMan(70, 198, 138, { dir: 1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true, pose: aim > 0.01 ? [30, -82, aim] : null });
      drawMan(332, 196, 132, { dir: -1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true, pose: aim > 0.01 ? [30, -82, aim] : null });
    }, 4, 0.3);
    if (t > shot) {
      const d = t - shot;
      [[70 + 30 * 1.38 + 10, 198 - 82 * 1.38, 1], [332 - 30 * 1.32 - 10, 196 - 82 * 1.32, -1]].forEach(([x, y, dd]) => {
        if (d < 0.07) { glow(x, y, 26, '255,230,170', 0.9); }
        for (let i = 0; i < 4; i++) { const p = Math.min(1, d * 0.5 + i * 0.08); ctx.fillStyle = 'rgba(250,250,250,' + (0.7 * (1 - p)) + ')'; ctx.beginPath(); ctx.arc(x + dd * (6 + p * 26 + i * 4), y - p * 20 - i * 2, 4 + p * 9, 0, 7); ctx.fill(); }
      });
    }
    // l'haleine dans l'air glacé
    for (let i = 0; i < 2; i++) { const p = ((t * 0.6 + i * 0.5) % 1); ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - p)) + ')'; ctx.beginPath(); ctx.arc(70 + 18 + p * 10, 198 - 124 - p * 6, 2 + p * 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(332 - 18 - p * 10, 196 - 118 - p * 6, 2 + p * 4, 0, 7); ctx.fill(); }
    finish(0.3, t);
  };
  DUR.duel = 5.0;

  /* ---------- VIII, ép. 94 : « C'est l'Estérel » — le soleil se couche sur la mer ---------- */
  DRAW.esterel = function (t) {
    base();
    room('#2c2226', '#33282a', 168, '#1e1718');
    const d = sm(0, 5, t);
    windowView(30, 14, 340, 140, (x, y, w, h) => {
      sky([[0, 'rgb(' + Math.round(lerp(80, 40, d)) + ',' + Math.round(lerp(60, 34, d)) + ',' + Math.round(lerp(90, 70, d)) + ')'], [0.55, 'rgb(' + Math.round(lerp(230, 170, d)) + ',' + Math.round(lerp(90, 50, d)) + ',' + Math.round(lerp(60, 50, d)) + ')'], [1, '#f2b46e']], 110);
      const sy = lerp(70, 102, d); ctx.fillStyle = 'rgba(255,214,140,.95)'; ctx.beginPath(); ctx.arc(300, sy, 13, 0, 7); ctx.fill(); glow(300, sy, 120, '255,160,80', 0.55 * (1 - d * 0.6));
      // la ligne bizarre des sommets, et le grand mont en pyramide qui plonge dans la mer
      ctx.fillStyle = '#2a1e2c'; ctx.beginPath(); ctx.moveTo(180, 110); ctx.lineTo(196, 96); ctx.lineTo(206, 100); ctx.lineTo(222, 84); ctx.lineTo(232, 92); ctx.lineTo(244, 80); ctx.lineTo(256, 94); ctx.lineTo(270, 86); ctx.lineTo(286, 98); ctx.lineTo(310, 76); ctx.lineTo(346, 110); ctx.closePath(); ctx.fill();
      water(110, 154, '#2b3d5c', '#1b2638', t, '255,170,100');
      ctx.fillStyle = 'rgba(255,170,90,' + (0.35 * (1 - d)) + ')'; ctx.fillRect(282, 112, 36, 40);
      // les îles de Lérins, deux taches plates sur l'eau
      ctx.fillStyle = '#2e3a2c'; ctx.beginPath(); ctx.ellipse(110, 122, 26, 3, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(160, 126, 18, 2.6, 0, 0, 7); ctx.fill();
      // la ville sur le rivage, le vieux beffroi
      ctx.fillStyle = '#231a20'; ctx.fillRect(30, 104, 90, 8); ctx.fillRect(56, 92, 6, 14); for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(255,200,130,' + (0.6 * d) + ')'; ctx.fillRect(34 + i * 9, 106, 2, 2); }
    });
    // Forestier dans son fauteuil, Madeleine appuyée à la fenêtre, Duroy debout
    rim(() => {
      sitter(70, 200, 120, 1, { nochair: true, lean: 6, hand: [18, -50], col: INK2 });
      ctx.fillStyle = INK2; ctx.fillRect(48, 140, 56, 60);
      drawWoman(214, 200, 132, { dir: 1, phase: 0, col: INK2, nohat: true, pose: [24 * sm(0.6, 1.2, t), -86 - 6 * sm(0.6, 1.2, t)] });
      drawMan(330, 200, 140, { dir: -1, phase: 0, amp: 0, stance: true, col: INK2, must: true, nohat: true });
    }, 5, 0.5);
    finish(0.4, t);
  };
  DUR.esterel = 5.2;

  /* ---------- VIII, ép. 100 : la veillée, deux bougies et une branche de mimosa ---------- */
  DRAW.veillee = function (t) {
    base();
    room('#1d1719', '#231b1d', 170, '#141011');
    // la fenêtre ouverte sur la nuit douce, le rideau qui bouge
    windowView(250, 22, 80, 86, (x, y, w, h) => { sky([[0, '#0f1426'], [1, '#273046']], y + h); stars(t, 10, 77, 100); ctx.fillStyle = 'rgba(240,236,220,.9)'; ctx.beginPath(); ctx.arc(x + 58, y + 22, 7, 0, 7); ctx.fill(); water(y + 66, y + h, '#1e2b44', '#141c2e', t, '220,220,255'); });
    ctx.fillStyle = 'rgba(232,226,214,.55)'; ctx.beginPath(); ctx.moveTo(244, 18); ctx.quadraticCurveTo(252 + Math.sin(t * 1.4) * 6, 60, 246, 112); ctx.lineTo(240, 112); ctx.lineTo(240, 18); ctx.fill();
    // le lit, le drap sur le corps
    ctx.fillStyle = '#2a1d18'; ctx.fillRect(20, 110, 8, 70); ctx.fillRect(196, 128, 6, 52);
    ctx.fillStyle = '#ddd3c2'; ctx.beginPath(); ctx.moveTo(26, 150); ctx.quadraticCurveTo(40, 132, 70, 140); ctx.quadraticCurveTo(110, 130, 150, 142); ctx.quadraticCurveTo(180, 138, 198, 146); ctx.lineTo(198, 176); ctx.lineTo(26, 176); ctx.fill();
    ctx.fillStyle = '#efe7da'; ctx.beginPath(); ctx.ellipse(46, 140, 18, 8, 0, 0, 7); ctx.fill();
    // la table de nuit, les deux bougies, l'assiette et le mimosa
    ctx.fillStyle = '#2a1d18'; ctx.fillRect(204, 136, 30, 4); ctx.fillRect(208, 140, 22, 36);
    candle(212, 124, t, 1, 0.9); candle(226, 124, t, 3, 0.9);
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.ellipse(219, 135, 9, 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4a5a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(214, 134); ctx.lineTo(206, 126); ctx.stroke(); const r = rng(3); for (let i = 0; i < 12; i++) { ctx.fillStyle = 'rgba(245,214,60,.95)'; ctx.beginPath(); ctx.arc(204 + r() * 10, 122 + r() * 8, 1.1, 0, 7); ctx.fill(); }
    // les deux fauteuils ; Madeleine, tête baissée ; Duroy qui la contemple
    const look = sm(1.4, 3.2, t);
    rim(() => {
      ctx.fillStyle = INK2; ctx.fillRect(262, 150, 44, 46); ctx.fillRect(340, 150, 44, 46);
      sitter(282, 196, 104, -1, { nochair: true, f: true, lean: -5, hand: [12, -50], col: INK2 });
      sitter(360, 198, 116, -1, { nochair: true, lean: -2 - 4 * look, hand: [16, -52], col: INK2 });
    }, 5, 0.45);
    finish(0.6, t);
  };
  DUR.veillee = 5.0;

  /* ---------- 2e partie, I, ép. 112 : le train longe la Seine ; la nuit tombe ---------- */
  DRAW.trainrouen = function (t) {
    base();
    const d = sm(0, 5.2, t);
    sky([[0, 'rgb(' + Math.round(lerp(120, 30, d)) + ',' + Math.round(lerp(80, 30, d)) + ',' + Math.round(lerp(100, 56, d)) + ')'], [1, 'rgb(' + Math.round(lerp(240, 90, d)) + ',' + Math.round(lerp(130, 60, d)) + ',' + Math.round(lerp(80, 70, d)) + ')']], 112);
    if (d > 0.5) stars(t, 14, 12, 60);
    ctx.fillStyle = '#3a2a36'; ctx.beginPath(); ctx.moveTo(0, 96); ctx.quadraticCurveTo(80, 70, 170, 92); ctx.quadraticCurveTo(260, 76, 400, 94); ctx.lineTo(400, 112); ctx.lineTo(0, 112); ctx.fill();
    // le fleuve, « comme un large ruban de métal poli », avec des reflets rouges qui s'éteignent
    water(112, 150, 'rgb(' + Math.round(lerp(200, 40, d)) + ',' + Math.round(lerp(110, 40, d)) + ',' + Math.round(lerp(90, 70, d)) + ')', '#1c1a26', t, '255,140,90');
    ctx.fillStyle = '#1e1820'; ctx.fillRect(0, 150, W, 50);
    ctx.strokeStyle = 'rgba(200,190,180,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 168); ctx.lineTo(W, 168); ctx.stroke();
    // le train ; à Mantes, on a allumé le quinquet : dans une portière, deux têtes serrées
    const tx = -40 + t * 66;
    train(tx, 170, 0.8, 1, t, 3, '#0f0b0c');
    puffs(tx + 28, 134, t, 8, '160,150,150', 30, -40);
    const wx = tx - 12 * 0.8 - 2 * 50 * 0.8 + 4 * 0.8, wy = 170 - 25 * 0.8;
    ctx.fillStyle = '#0f0b0c'; ctx.beginPath(); ctx.arc(wx + 13, wy + 3, 2.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(wx + 17, wy + 3.4, 2.2, 0, 7); ctx.fill();
    finish(0.45, t);
  };
  DUR.trainrouen = 5.2;

  /* ---------- 2e partie, I, ép. 114 : la côte de Canteleu, Rouen d'un coup d'œil ---------- */
  DRAW.canteleu = function (t) {
    base();
    sky([[0, '#9fbcd6'], [1, '#e9e2d2']], 110);
    // la vallée, le fleuve clair, les îles
    ctx.fillStyle = '#8a9a7a'; ctx.fillRect(0, 96, W, 104);
    ctx.fillStyle = '#c9d6dc'; ctx.beginPath(); ctx.moveTo(0, 120); ctx.quadraticCurveTo(120, 104, 220, 116); ctx.quadraticCurveTo(320, 128, 400, 112); ctx.lineTo(400, 122); ctx.quadraticCurveTo(320, 138, 220, 126); ctx.quadraticCurveTo(120, 114, 0, 130); ctx.fill();
    ctx.fillStyle = '#7d9070'; ctx.beginPath(); ctx.ellipse(90, 118, 16, 2.4, 0, 0, 7); ctx.fill();
    // la ville, ses mille clochers, la flèche aiguë de la cathédrale
    ctx.fillStyle = '#8c8a94'; ctx.fillRect(150, 92, 170, 18);
    const r = rng(9); for (let i = 0; i < 14; i++) { const x = 156 + r() * 156, h = 8 + r() * 14; ctx.beginPath(); ctx.moveTo(x - 3, 96); ctx.lineTo(x, 96 - h); ctx.lineTo(x + 3, 96); ctx.fill(); }
    ctx.fillStyle = '#6e6c78'; ctx.fillRect(228, 74, 12, 22); ctx.beginPath(); ctx.moveTo(229, 74); ctx.lineTo(234, 22); ctx.lineTo(239, 74); ctx.fill();
    // les cheminées d'usines de Saint-Sever, leur haleine noire de charbon
    [[320, 60], [338, 66], [356, 56], [304, 70]].forEach(([x, y], i) => { ctx.fillStyle = '#7a5a4a'; ctx.fillRect(x - 2, y, 4, 128 - y); puffs(x, y, t, 6, '50,46,50', 40, 30 + i * 4); });
    glow(240, 96, 160, '255,240,210', 0.15);
    // la route ; les deux vieux qui arrivent ; Georges et Madeleine qui montent
    ctx.fillStyle = '#b7a888'; ctx.beginPath(); ctx.moveTo(0, 200); ctx.quadraticCurveTo(200, 150, 400, 168); ctx.lineTo(400, 200); ctx.fill();
    ctx.fillStyle = '#6a7a52'; for (let i = 0; i < 5; i++) tree(20 + i * 90, 168 + (i % 2) * 4, 48, 'rgba(80,100,60,.9)', t, 30 + i);
    const ox = walkTo(t, 0, 4.4, 430, 300), gx = walkTo(t, 0, 4.0, -30, 170);
    drawMan(ox, 186, 92, { dir: -1, phase: (430 - ox) / 70 * Math.PI * 2, amp: 0.6, lean: 0.08, col: '#2a2420', nohat: true });
    drawWoman(ox + 22, 186, 84, { dir: -1, phase: (430 - ox) / 64 * Math.PI * 2, col: '#2a2420', nohat: true });
    drawMan(gx, 196, 120, { dir: 1, phase: (gx + 30) / 94 * Math.PI * 2, amp: t < 4 ? 0.7 : 0, stance: t >= 4, tilt: -0.1, must: true, col: '#1a1311' });
    drawWoman(gx - 22, 196, 108, { dir: 1, phase: (gx + 30) / 84 * Math.PI * 2, col: '#1a1311' });
    finish(0.25, t);
  };
  DUR.canteleu = 5.0;

  /* ---------- 2e partie, II, ép. 124 : une nuit d'étuve, un fleuve de fiacres vers le Bois ---------- */
  DRAW.nuitbois = function (t) {
    base();
    sky([[0, '#0f1228'], [1, '#33283c']], 132);
    stars(t, 40, 51, 90);
    // la voûte des arbres de l'avenue
    for (let i = 0; i < 8; i++) tree(-30 + i * 62, 132, 120, 'rgba(20,18,24,.95)', t * 0.3, 90 + i);
    ctx.fillStyle = '#1e1a1e'; ctx.fillRect(0, 128, W, 72);
    for (let i = 0; i < 4; i++) lamp(30 + i * 115, 150, 70, 0.85);
    // « une armée de fiacres » : la femme en robe claire, l'homme sombre ; l'un derrière l'autre, sans cesse
    for (let i = 0; i < 6; i++) { const x = ((i * 120 + t * 46) % 720) - 160; victoria(x, 168, 0.55, 1, x + 200, '#141014'); }
    for (let i = 0; i < 5; i++) { const x = ((i * 150 + t * 34 + 60) % 750) - 170; victoria(x, 196, 0.72, 1, x + 200, '#0f0b0f', 'rgba(240,232,216,.95)'); }
    finish(0.5, t);
  };
  DUR.nuitbois = 5.0;

  /* ---------- 2e partie, III, ép. 132 : « Touché ! » — le petit Planton et le gros Carapin ---------- */
  DRAW.assaut = function (t) {
    base();
    ctx.fillStyle = '#1e1716'; ctx.fillRect(0, 0, W, H);
    // la cave voûtée, les drapeaux, les lustres
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#2a201e'; ctx.beginPath(); ctx.arc(50 + i * 100, 60, 52, Math.PI, 0); ctx.fill(); }
    ['#2a3a7a', '#e8e2d4', '#8a2a26'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(170 + i * 20, 10, 20, 26); });
    [100, 300].forEach((x, i) => { for (let k = -1; k <= 1; k++) flame(x + k * 10, 22, 0.6, t, i * 3 + k); });
    // l'estrade, le jury de six messieurs
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(40, 140, 320, 10);
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(110, 92, 180, 4);
    for (let i = 0; i < 6; i++) { const x = 122 + i * 31, nod = Math.max(0, Math.sin((t - 2.2) * 6)) * (t > 2.2 && t < 2.8 ? 3 : 0) + Math.max(0, Math.sin((t - 4.1) * 6)) * (t > 4.1 && t < 4.7 ? 3 : 0); ctx.fillStyle = '#1a1312'; ctx.fillRect(x - 6, 74, 12, 18); ctx.beginPath(); ctx.arc(x, 68 + nod, 5, 0, 7); ctx.fill(); }
    // les deux tireurs, en toile et peau blanche : l'un saute comme un singe, l'autre est un ballon
    const lunge = Math.max(0, Math.sin(t * 2.6)), hop = Math.abs(Math.sin(t * 7)) * 6;
    const px = 160 + lunge * 22 + Math.sin(t * 1.3) * 8, cx = 252 - Math.max(0, Math.sin(t * 2.6 + 2)) * 10;
    const W1 = '#ece6da';
    drawMan(px, 140 - hop, 78, { dir: 1, phase: t * 5, amp: 0.6, col: W1, nohat: true, pose: [30, -66, 1] });
    ctx.save(); ctx.translate(cx, 140); ctx.scale(1.55, 1); drawMan(0, 0, 96, { dir: -1, phase: t * 2, amp: 0.25, col: W1, nohat: true, pose: [28, -64, 1] }); ctx.restore();
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 1; const h1x = px + 30 * 0.78, h1y = 140 - hop - 66 * 0.78, h2x = cx - 28 * 1.55 * 0.96, h2y = 140 - 64 * 0.96;
    ctx.beginPath(); ctx.moveTo(h1x, h1y); ctx.lineTo(h1x + 34, h1y - 4); ctx.moveTo(h2x, h2y); ctx.lineTo(h2x - 34, h2y - 6); ctx.stroke();
    [2.2, 4.1].forEach((tt) => { const a = sm(tt, tt + 0.15, t) * (1 - sm(tt + 0.9, tt + 1.2, t)); if (a > 0.01) { ctx.font = "italic 700 17px 'Bodoni Moda', Didot, Georgia, serif"; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(244,237,227,' + a + ')'; ctx.fillText('« Touché ! »', 206, 44 - (t - tt) * 6); } });
    glow(206, 110, 140, '255,210,150', 0.2);
    // le public, devant : des têtes, des chapeaux, on rit
    const r = rng(29); ctx.fillStyle = '#0b0708';
    for (let i = 0; i < 18; i++) { const x = 4 + i * 23 + r() * 6, y = 180 + r() * 6 - Math.abs(Math.sin(t * 6 + i)) * (t > 2.3 ? 1.4 : 0); ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.fillRect(x - 10, y + 6, 20, 30); if (r() < 0.5) { ctx.fillRect(x - 6, y - 19, 12, 13); ctx.beginPath(); ctx.ellipse(x, y - 6, 10, 2, 0, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.ellipse(x - 1, y - 7, 9, 3.4, -0.15, 0, 7); ctx.fill(); } }
    finish(0.45, t);
  };
  DUR.assaut = 5.0;

  /* ---------- 2e partie, IV, ép. 142 : « Oh ! sauvez-moi ! » — la Trinité ---------- */
  DRAW.trinite = function (t) {
    base();
    ctx.fillStyle = '#1c1719'; ctx.fillRect(0, 0, W, H);
    // la nef, les piliers, les vitraux
    for (let i = 0; i < 5; i++) { const x = 30 + i * 86; ctx.fillStyle = '#2b2326'; ctx.fillRect(x, 0, 18, 200); ctx.beginPath(); ctx.arc(x + 52, 70, 34, Math.PI, 0); ctx.lineTo(x + 86, 200); ctx.lineTo(x + 18, 200); ctx.fill(); }
    [[78, '#7a2a3a'], [164, '#2a4a7a'], [250, '#6a5a2a'], [336, '#2a6a5a']].forEach(([x, c], i) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 9, 64); ctx.lineTo(x - 9, 34); ctx.arc(x, 34, 9, Math.PI, 0); ctx.lineTo(x + 9, 64); ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,16,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, 64); ctx.moveTo(x - 9, 46); ctx.lineTo(x + 9, 46); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x, 64, x + 50, 190); g.addColorStop(0, 'rgba(255,230,190,.12)'); g.addColorStop(1, 'rgba(255,230,190,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 9, 64); ctx.lineTo(x + 9, 64); ctx.lineTo(x + 70, 200); ctx.lineTo(x + 30, 200); ctx.fill(); ctx.restore();
    });
    ctx.fillStyle = '#251e20'; ctx.fillRect(0, 168, W, 32);
    // les chaises, les cierges au fond
    for (let i = 0; i < 9; i++) { ctx.fillStyle = '#140f10'; ctx.fillRect(14 + i * 14, 170, 2, 18); ctx.fillRect(14 + i * 14, 178, 10, 2); }
    for (let i = 0; i < 6; i++) candle(344 + i * 8, 150, t, i, 0.6);
    // Du Roy attend, au loin, contre un pilier
    drawMan(118, 176, 64, { dir: 1, phase: 0, amp: 0, stance: true, col: '#151012', must: true });
    // le prêtre, qui s'arrête, surpris
    priest(300, 196, 136, -1, t * 3);
    // Mme Walter, voilée, court vers lui en tendant ses mains jointes
    const mx = walkTo(t, 0.4, 2.6, 150, 262), run = t > 0.4 && t < 2.6;
    rim(() => drawWoman(mx, 196, 120, { dir: 1, phase: (mx - 150) / 40 * Math.PI * 2 * (run ? 1 : 0), col: INK2, pose: [18, -84 + 4 * Math.sin(t * 6) * (t > 2.6 ? 1 : 0)] }), 5, 0.45);
    ctx.fillStyle = 'rgba(30,24,28,.7)'; ctx.beginPath(); ctx.moveTo(mx - 6, 196 - 112); ctx.lineTo(mx + 10, 196 - 112); ctx.lineTo(mx + 12, 196 - 92); ctx.lineTo(mx - 8, 196 - 92); ctx.fill();
    finish(0.55, t);
  };
  DUR.trinite = 5.0;

  /* ---------- 2e partie, V, ép. 150 : un été au bord de l'eau, en bateau à cueillir des fleurs ---------- */
  DRAW.bordeleau = function (t) {
    base();
    sky([[0, '#9cc4e4'], [1, '#eef0e0']], 90);
    // la berge d'en face, une guinguette sous sa tonnelle
    ctx.fillStyle = '#6f8f58'; ctx.fillRect(0, 70, W, 26);
    for (let i = 0; i < 6; i++) tree(20 + i * 70, 90, 62, 'rgba(70,104,60,.95)', t, 60 + i);
    ctx.fillStyle = '#e9e1cf'; ctx.fillRect(300, 70, 46, 20); ctx.fillStyle = '#9a4a3a'; ctx.beginPath(); ctx.moveTo(296, 70); ctx.lineTo(323, 58); ctx.lineTo(350, 70); ctx.fill();
    water(90, 200, '#5d8aa0', '#3a6478', t, '255,255,240');
    // des canotiers au loin
    const cx = 60 + t * 18; ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.moveTo(cx - 18, 112); ctx.lineTo(cx + 18, 112); ctx.lineTo(cx + 12, 116); ctx.lineTo(cx - 12, 116); ctx.fill(); ctx.fillRect(cx - 2, 100, 4, 12); ctx.fillStyle = '#e8d9a0'; ctx.fillRect(cx - 4, 98, 8, 2);
    // les roseaux et les fleurs de la berge proche
    ctx.strokeStyle = '#4a6a3a'; ctx.lineWidth = 1.4; for (let i = 0; i < 26; i++) { const x = 250 + i * 6, s = Math.sin(t * 1.5 + i) * 2; ctx.beginPath(); ctx.moveTo(x, 200); ctx.quadraticCurveTo(x + s, 175, x + s * 2, 150 + (i % 3) * 6); ctx.stroke(); }
    for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#f4d24a', '#f0f0f0', '#e46a8a'][i % 3]; ctx.beginPath(); ctx.arc(256 + i * 18, 152 + (i % 3) * 6, 2.6, 0, 7); ctx.fill(); }
    // la barque : lui rame, elle cueille des fleurs, l'ombrelle sur l'épaule
    const bx = 150 + Math.sin(t * 0.8) * 10 + t * 8, by = 168 + Math.sin(t * 1.6) * 1.5;
    ctx.fillStyle = '#5a3a24'; ctx.beginPath(); ctx.moveTo(bx - 70, by); ctx.lineTo(bx + 60, by); ctx.quadraticCurveTo(bx + 78, by - 4, bx + 82, by - 12); ctx.lineTo(bx - 76, by - 10); ctx.closePath(); ctx.fill();
    const row = Math.sin(t * 3);
    ctx.save(); ctx.translate(bx - 30, by - 8); ctx.fillStyle = '#1a1311'; ctx.fillRect(-10, -30, 18, 30); ctx.beginPath(); ctx.arc(-1 + row * 2, -38, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#e8d9a0'; ctx.beginPath(); ctx.ellipse(-1 + row * 2, -44, 10, 2.2, 0, 0, 7); ctx.fill(); ctx.fillRect(-6 + row * 2, -50, 10, 6);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(40 + row * 12, 10 - row * 4); ctx.stroke(); ctx.restore();
    const reach = sm(2.4, 3.2, t) * (1 - sm(4.2, 4.8, t));
    drawWoman(bx + 34, by - 8, 70, { dir: 1, phase: 0, col: '#f0e8da', pose: [12 + 8 * reach, -66 + 22 * reach] });
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + 30, by - 70); ctx.lineTo(bx + 22, by - 40); ctx.stroke();
    ctx.fillStyle = 'rgba(228,106,138,.9)'; ctx.beginPath(); ctx.arc(bx + 30, by - 72, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    finish(0.25, t);
  };
  DUR.bordeleau = 5.0;

  /* ---------- 2e partie, VI, ép. 158 : l'église tendue de noir ---------- */
  DRAW.enterrement = function (t) {
    base();
    sky([[0, '#8e939c'], [1, '#c2c0bc']], 120);
    // le portail tendu de noir, l'écusson coiffé d'une couronne
    ctx.fillStyle = '#6e6a6a'; ctx.fillRect(110, 20, 180, 130); ctx.beginPath(); ctx.moveTo(100, 22); ctx.lineTo(200, 0); ctx.lineTo(300, 22); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#5d5959'; ctx.fillRect(120 + i * 30, 30, 10, 120); }
    ctx.fillStyle = '#121012'; ctx.beginPath(); ctx.moveTo(156, 150); ctx.lineTo(156, 70); ctx.arc(200, 70, 44, Math.PI, 0); ctx.lineTo(244, 150); ctx.fill();
    ctx.fillStyle = '#18141a'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(110 + i * 20, 22); ctx.lineTo(130 + i * 20, 22); ctx.quadraticCurveTo(120 + i * 20, 40 + Math.sin(t * 2 + i) * 1.5, 110 + i * 20, 22); ctx.fill(); }
    ctx.fillStyle = '#1a1416'; ctx.beginPath(); ctx.moveTo(186, 38); ctx.lineTo(214, 38); ctx.lineTo(214, 56); ctx.quadraticCurveTo(200, 68, 186, 56); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c9a04a'; ctx.fillRect(190, 30, 20, 6); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(191 + i * 4.5, 29, 1.8, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#8a8682'; for (let i = 0; i < 4; i++) ctx.fillRect(90 - i * 10, 150 + i * 7, 220 + i * 20, 7);
    ctx.fillStyle = '#9a968e'; ctx.fillRect(0, 178, W, 22);
    // les assistants qui s'en vont lentement
    for (let i = 0; i < 6; i++) { const x = 170 + i * 14 + ((t * 8 + i * 30) % 60) * (i % 2 ? 1 : -1), y = 150 + (i % 3) * 7; drawMan(x, y, 44, { dir: i % 2 ? 1 : -1, phase: t * 3 + i, amp: 0.4, col: '#1d1a1c' }); }
    // Georges et Madeleine marchent côte à côte, préoccupés ; il se tourne vers elle
    const gx = walkTo(t, 0, 4.4, 196, 300), turn = sm(3.4, 4.0, t);
    drawWoman(gx - 26, 198, 118, { dir: 1, phase: (gx - 196) / 80 * Math.PI * 2, col: INK2 });
    drawMan(gx + 6, 198, 130, { dir: turn > 0.5 ? -1 : 1, phase: (gx - 196) / 100 * Math.PI * 2, amp: t < 4.4 ? 0.7 : 0, stance: t >= 4.4, must: true, col: INK2 });
    finish(0.35, t);
  };
  DUR.enterrement = 5.0;

  /* ---------- 2e partie, VII, ép. 168 : le tableau — « un homme immobile, debout sur la mer » ---------- */
  DRAW.jesus = function (t) {
    base();
    ctx.fillStyle = '#16120f'; ctx.fillRect(0, 0, W, H);
    // le tableau, au milieu d'un bosquet de plantes singulières
    frameRect(130, 22, 140, 100, (x, y, w, h) => {
      ctx.fillStyle = '#0c0e16'; ctx.fillRect(x, y, w, h); stars(t, 12, 41, 40);
      water(y + 62, y + h, '#141a26', '#0c0f16', t * 0.5, '160,170,200');
      // la barque coupée par le cadre, la lanterne, les apôtres
      ctx.fillStyle = '#0a0a0e'; ctx.beginPath(); ctx.moveTo(x - 10, y + 74); ctx.lineTo(x + 44, y + 74); ctx.lineTo(x + 36, y + 86); ctx.lineTo(x - 10, y + 86); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 6 + i * 11, y + 66, 3.4, 0, 7); ctx.fill(); ctx.fillRect(x + 3 + i * 11, y + 68, 6, 8); }
      const lan = 0.8 + 0.2 * vn(t * 7); glow(x + 38, y + 62, 30, '255,200,120', 0.6 * lan);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(x + 38, y + 62, x + 100, y + 60); g.addColorStop(0, 'rgba(255,214,150,' + 0.35 * lan + ')'); g.addColorStop(1, 'rgba(255,214,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + 38, y + 60); ctx.lineTo(x + 112, y + 30); ctx.lineTo(x + 116, y + 86); ctx.fill(); ctx.restore();
      // le Christ, qui avance le pied sur une vague
      ctx.fillStyle = 'rgba(232,222,200,' + (0.8 * lan) + ')'; ctx.beginPath(); ctx.moveTo(x + 98, y + 38); ctx.lineTo(x + 104, y + 38); ctx.lineTo(x + 110, y + 76); ctx.lineTo(x + 92, y + 76); ctx.fill(); ctx.beginPath(); ctx.arc(x + 101, y + 34, 3.6, 0, 7); ctx.fill();
    });
    const leaf = (x, y, s, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.sin(t * 1.6 + x) * 0.06); ctx.fillStyle = '#1e2a1e'; for (let i = 0; i < 6; i++) { ctx.rotate(0.45); ctx.beginPath(); ctx.ellipse(0, -s, s * 0.18, s, 0, 0, 7); ctx.fill(); } ctx.restore(); };
    leaf(118, 120, 46, -1.4); leaf(286, 116, 48, -1.0); leaf(104, 70, 34, -1.8); leaf(300, 60, 36, -0.6); leaf(200, 140, 30, -1.2);
    glow(200, 72, 160, '255,210,150', 0.18);
    // la foule des invités, en habit et en robe de soirée, qui regarde
    const r = rng(17);
    for (let i = 0; i < 11; i++) { const x = 10 + i * 38 + Math.sin(t * 0.8 + i) * 3, h = 68 + r() * 16; if (i % 3 === 1) drawWoman(x, 202, h * 0.9, { dir: x < 200 ? 1 : -1, phase: 0, col: '#0f0b0c', nohat: true }); else drawMan(x, 202, h, { dir: x < 200 ? 1 : -1, phase: 0, amp: 0, stance: true, col: '#0f0b0c', nohat: true }); }
    finish(0.55, t);
  };
  DUR.jesus = 5.0;

  /* ---------- 2e partie, VIII, ép. 177 : rue des Martyrs, quatre hommes montent l'escalier ---------- */
  DRAW.martyrs = function (t) {
    base();
    room('#2a2324', '#30282a', 200, '#1a1414');
    // la cage d'escalier, le bec de gaz, la porte du second
    ctx.fillStyle = '#211a1b'; ctx.beginPath(); ctx.moveTo(0, 200); ctx.lineTo(270, 70); ctx.lineTo(400, 70); ctx.lineTo(400, 82); ctx.lineTo(276, 82); ctx.lineTo(12, 200); ctx.fill();
    for (let i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(255,220,180,.05)'; ctx.fillRect(10 + i * 16.5, 196 - i * 8, 16, 1.2); }
    ctx.strokeStyle = '#141011'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(272, 26); ctx.stroke(); for (let i = 0; i < 16; i++) { const x = 6 + i * 16.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 148 - i * 7.5); ctx.lineTo(x, 196 - i * 8); ctx.stroke(); }
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(330, 14, 40, 56); ctx.fillStyle = '#c99a3c'; ctx.beginPath(); ctx.arc(362, 44, 2, 0, 7); ctx.fill(); ctx.fillStyle = '#efe6d4'; ctx.fillRect(316, 34, 6, 6);
    ctx.fillStyle = '#2a1d16'; ctx.fillRect(300, 26, 2, 14); flame(301, 26, 0.9, t, 2);
    // ils montent : Du Roy devant, puis le commissaire et deux agents
    const climb = (d) => { const k = clamp((t - d) / 3.0); const e = 1 - Math.pow(1 - k, 1.6); return [lerp(40, 300 - d * 22, e), lerp(186 - 8 * 0, 70, e), k < 1]; };
    const M = [[0, 68, true], [0.35, 66, false], [0.7, 64, false], [1.05, 65, false]];
    rim(() => M.slice().reverse().forEach(([d, h, me]) => { const [x, y, mv] = climb(d); drawMan(x - (me ? 0 : 0), y, h, { dir: 1, phase: (x - 30) / 60 * Math.PI * 2, amp: mv ? 0.8 : 0, stance: !mv, col: INK2, must: me, tilt: me ? -0.12 : 0, lean: mv ? 0.06 : 0, pose: me && t > 3.4 ? [24, -80, sm(3.4, 3.8, t)] : null }); }), 4, 0.45);
    // il sonne : le timbre vibre
    if (t > 3.8) { const v = Math.sin(t * 40) * (1 - sm(4.4, 4.8, t)); ctx.strokeStyle = 'rgba(244,237,227,' + (0.7 * Math.abs(v)) + ')'; ctx.lineWidth = 1; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.arc(319, 37, 4 + i * 4, -0.8, 0.8); ctx.stroke(); } }
    finish(0.55, t);
  };
  DUR.martyrs = 5.0;

  /* ---------- 2e partie, IX, ép. 184 : place de la Concorde, minuit — elle ne viendra pas ? ---------- */
  DRAW.concorde = function (t) {
    base();
    sky([[0, '#0b0e1c'], [1, '#232236']], 152);
    stars(t, 22, 83, 70);
    // les arcades du ministère de la Marine, l'obélisque, les fontaines
    ctx.fillStyle = '#1c1a24'; ctx.fillRect(0, 50, 190, 100); for (let i = 0; i < 9; i++) { ctx.fillStyle = '#12101a'; ctx.beginPath(); ctx.moveTo(8 + i * 20, 150); ctx.lineTo(8 + i * 20, 116); ctx.arc(16 + i * 20, 116, 8, Math.PI, 0); ctx.lineTo(24 + i * 20, 150); ctx.fill(); ctx.fillStyle = '#26232e'; ctx.fillRect(6 + i * 20, 62, 4, 40); }
    ctx.fillStyle = '#26222c'; ctx.beginPath(); ctx.moveTo(276, 150); ctx.lineTo(280, 48); ctx.lineTo(283, 42); ctx.lineTo(286, 48); ctx.lineTo(290, 150); ctx.fill();
    ctx.fillStyle = '#1e1b24'; ctx.beginPath(); ctx.ellipse(350, 140, 28, 6, 0, 0, 7); ctx.fill(); ctx.fillRect(346, 118, 8, 22);
    for (let i = 0; i < 5; i++) lamp(214 + i * 46, 160, 60, 0.85);
    ctx.fillStyle = '#1b181c'; ctx.fillRect(0, 150, W, 50);
    // les horloges sonnent minuit, l'une après l'autre, de loin en loin
    [[1.4, 330, 40], [2.0, 120, 30], [2.4, 230, 26], [2.7, 380, 50]].forEach(([tt, x, y]) => { if (t > tt && t < tt + 1.6) { const p = (t - tt) / 1.6; ctx.strokeStyle = 'rgba(230,220,255,' + (0.4 * (1 - p)) + ')'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, 4 + p * 30 + i * 6, 0, 7); ctx.stroke(); } } });
    // le fiacre qui attend ; Du Roy passe la tête à la portière et enflamme une allumette
    drawFiacre(250, 196, 0.95, 1, 0, 0);
    const out = sm(0.6, 1.0, t) * (1 - sm(4.4, 4.8, t));
    const hx = 250 - 70 * 0.95 + 4, hy = 196 - 58 * 0.95;
    ctx.fillStyle = INK2; ctx.beginPath(); ctx.arc(hx - 12 * out, hy, 6, 0, 7); ctx.fill(); ctx.fillRect(hx - 12 * out - 5, hy - 15, 10, 9); ctx.beginPath(); ctx.ellipse(hx - 12 * out, hy - 6, 8, 1.6, 0, 0, 7); ctx.fill();
    const m = (t > 1.1 && t < 2.3) ? 1 - sm(1.9, 2.3, t) : 0;
    if (m > 0) { const mx = hx - 12 * out - 10, my = hy + 8; glow(mx, my, 40, '255,190,110', 0.8 * m); ctx.fillStyle = 'rgba(255,230,170,' + m + ')'; ctx.beginPath(); ctx.ellipse(mx, my - 2, 1.6, 3, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c99a3c'; ctx.beginPath(); ctx.arc(mx + 5, my + 2, 2.4, 0, 7); ctx.fill(); }
    finish(0.6, t);
  };
  DUR.concorde = 5.0;

  /* ---------- 2e partie, IX, ép. 187 : seule dans la serre, la nuit, devant le tableau ---------- */
  DRAW.serre = function (t) {
    base();
    ctx.fillStyle = '#0a0b0c'; ctx.fillRect(0, 0, W, H);
    // le dôme de verre
    ctx.strokeStyle = 'rgba(120,140,160,.25)'; ctx.lineWidth = 1; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * 36, 0); ctx.quadraticCurveTo(200, 40, 400 - i * 36, 0); ctx.stroke(); }
    const mx = walkTo(t, 0, 4.0, 30, 236);
    const light = (x, y) => clamp(1 - Math.hypot(x - mx - 14, (y - 120) * 1.4) / 150);
    // les plantes extravagantes, révélées par la lueur errante de la bougie
    const P = [[40, 150, 60], [110, 130, 50], [170, 160, 44], [330, 150, 58], [380, 120, 46], [70, 100, 40], [360, 80, 36]];
    P.forEach(([x, y, s], i) => { const L = light(x, y); ctx.save(); ctx.translate(x, y); ctx.rotate(-1.6 + Math.sin(t + i) * 0.04); const c = Math.round(18 + 40 * L); ctx.fillStyle = 'rgb(' + c + ',' + Math.round(c * 1.3) + ',' + c + ')'; for (let k = 0; k < 7; k++) { ctx.rotate(0.42); ctx.beginPath(); ctx.ellipse(0, -s * 0.6, s * 0.12, s * 0.6, 0, 0, 7); ctx.fill(); } ctx.restore(); });
    // la petite chapelle vitrée, le Jésus au bout
    frameRect(262, 40, 70, 90, (x, y, w, h) => { ctx.fillStyle = '#0c0e16'; ctx.fillRect(x, y, w, h); water(y + 56, y + h, '#141a26', '#0c0f16', t * 0.4, '160,170,200'); const L = light(297, 85); ctx.fillStyle = 'rgba(232,222,200,' + (0.25 + 0.6 * L) + ')'; ctx.fillRect(x + 32, y + 26, 6, 34); ctx.beginPath(); ctx.arc(x + 35, y + 22, 3.4, 0, 7); ctx.fill(); });
    // Mme Walter avance, sa bougie à la main ; arrivée, elle tend les bras vers la toile
    const reach = sm(4.0, 4.6, t);
    rim(() => drawWoman(mx, 196, 128, { dir: 1, phase: (mx - 30) / 50 * Math.PI * 2 * (t < 4 ? 1 : 0), col: INK2, nohat: true, pose: [14 + 18 * reach, -76 - 30 * reach] }), 5, 0.45);
    const cx = mx + 14 * 1.28 + 6 * (1 - reach), cy = 196 - 76 * 1.28 + 8;
    if (reach < 0.9) { ctx.fillStyle = '#eadfc8'; ctx.fillRect(cx - 1.4, cy, 2.8, 9); flame(cx, cy, 0.85, t, 1); }
    glow(mx + 14, 120, 150, '255,190,110', 0.18);
    finish(0.6, t);
  };
  DUR.serre = 5.0;

  /* ---------- 2e partie, X, ép. 194 : sur le perron de la Madeleine ; là-bas, la Chambre des députés ---------- */
  DRAW.perron = function (t) {
    base();
    sky([[0, '#8fb6dc'], [1, '#f2e6c8']], 130);
    ctx.fillStyle = 'rgba(255,248,220,.9)'; ctx.beginPath(); ctx.arc(340, 30, 14, 0, 7); ctx.fill(); glow(340, 30, 120, '255,240,200', 0.4);
    // au loin, derrière la place de la Concorde, le portique du Palais-Bourbon, dans le soleil
    const dream = sm(2.8, 4.0, t);
    ctx.fillStyle = 'rgba(160,150,140,.8)'; ctx.fillRect(236, 98, 60, 22); ctx.beginPath(); ctx.moveTo(232, 98); ctx.lineTo(266, 86); ctx.lineTo(300, 98); ctx.fill();
    ctx.fillStyle = 'rgba(120,110,104,.8)'; for (let i = 0; i < 6; i++) ctx.fillRect(240 + i * 10, 100, 3, 20);
    glow(266, 104, 60, '255,230,170', 0.25 + 0.45 * dream);
    ctx.fillStyle = 'rgba(140,130,124,.8)'; ctx.fillRect(196, 70, 4, 50);
    // les colonnes de la Madeleine, le haut perron
    for (let i = 0; i < 4; i++) { const x = i < 2 ? 14 + i * 40 : 316 + (i - 2) * 40; ctx.fillStyle = '#d6cdbc'; ctx.fillRect(x, 0, 26, 130); ctx.fillStyle = 'rgba(120,100,80,.25)'; ctx.fillRect(x + 18, 0, 8, 130); }
    ctx.fillStyle = '#e2d9c8'; for (let i = 0; i < 6; i++) ctx.fillRect(0, 128 + i * 12, W, 12); ctx.fillStyle = 'rgba(120,100,80,.18)'; for (let i = 0; i < 6; i++) ctx.fillRect(0, 128 + i * 12, W, 2);
    // deux haies de spectateurs ; on agite les chapeaux
    for (let i = 0; i < 7; i++) { const x = 10 + i * 16, wave = Math.max(0, Math.sin(t * 5 + i)) * 6; drawMan(x, 200, 92, { dir: 1, phase: 0, amp: 0, stance: true, col: '#2a2420', pose: i % 2 ? [8, -110 - wave, 1] : null }); }
    for (let i = 0; i < 7; i++) { const x = 300 + i * 16, wave = Math.max(0, Math.sin(t * 5 + i + 2)) * 6; if (i % 3 === 1) drawWoman(x, 200, 84, { dir: -1, phase: 0, col: '#2a2420' }); else drawMan(x, 200, 92, { dir: -1, phase: 0, amp: 0, stance: true, col: '#2a2420', pose: i % 2 ? [8, -110 - wave, 1] : null }); }
    // Du Roy descend avec lenteur, Suzanne à son bras ; il relève les yeux vers la Chambre
    const k = clamp(t / 3.8), dy = lerp(150, 196, k), sc = lerp(0.8, 1, k), dx = 168;
    drawWoman(dx - 20, dy, 112 * sc, { dir: 1, phase: k * 12, col: '#f2ece0' });
    ctx.fillStyle = 'rgba(242,236,224,.9)'; ctx.beginPath(); ctx.moveTo(dx - 30, dy); ctx.quadraticCurveTo(dx - 60, dy + 2, dx - 74, dy - 4); ctx.lineTo(dx - 30, dy - 20); ctx.fill();
    drawMan(dx + 8, dy, 132 * sc, { dir: 1, phase: k * 12, amp: k < 1 ? 0.5 : 0, stance: k >= 1, tilt: -0.1 - 0.06 * dream, lean: -0.04 * dream, must: true, col: '#141010' });
    finish(0.25, t);
  };
  DUR.perron = 5.0;

  const fn = DRAW[id] || cafe;
  return { dur: DUR[id] || 5, frame(t) { S = t; fn(t); }, refresh() { FIRE = null; } };
};

{
  const st = document.createElement('style');
  st.textContent = `
/* v77-78 : animations d'épisode et carton de fin */
.vg76 { margin: 2px auto 20px; max-width: 560px; }
.vg76-i { position: relative; aspect-ratio: 2 / 1; border-radius: 10px; overflow: hidden; background: #211a1e; box-shadow: 0 10px 24px -14px rgba(10,6,4,.5); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ill-end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 18px;
  background: radial-gradient(ellipse at center, rgba(14,10,8,.72) 0%, rgba(14,10,8,.5) 60%, rgba(14,10,8,.35) 100%);
  color: #f4ede3; opacity: 0; transition: opacity .8s ease; pointer-events: none; }
.end > .ill-end, .end > .vg76-i > .ill-end, .vg76.end .ill-end { opacity: 1; }
.ill-k { font: 600 10px/1.2 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .3em; text-transform: uppercase; color: rgba(244,237,227,.78); }
.ill-t { font-family: "Bodoni Moda", Didot, Georgia, serif; font-style: italic; font-size: 25px; font-variation-settings: 'opsz' 24; line-height: 1.08; margin-top: 7px; text-shadow: 0 2px 14px rgba(8,5,6,.8); }
.ov76 .ill-t { font-size: 32px; }
.ill-r { width: 28px; height: 1px; background: #d9a521; margin: 10px auto 0; opacity: .85; }
.ill-end .ill-t, .ill-end .ill-k { transform: translateY(5px); transition: transform .8s ease; }
.end .ill-end .ill-t, .end .ill-end .ill-k { transform: none; }
/* le titre écrit de l'épisode laisse la place au carton de l'animation (il reste pour les lecteurs d'écran) */
p.tep.ill78 { height: 0; margin: 0; padding: 0; overflow: hidden; opacity: 0; }
.vg76-i canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.vg76 figcaption { margin: 7px 0 0; padding: 0 12px; text-align: center; font: italic 400 14px/1.35 Spectral, Georgia, serif; color: var(--muted); }
`;
  document.head.append(st);
}
const VIGS = Array.isArray(BOOK.vignettes) ? BOOK.vignettes.filter((v) => v && typeof v.ep === 'number' && v.id) : [];
const vigAt = (e) => VIGS.find((v) => v.ep === e) || null;
// carton de fin : « Épisode X » et le titre de l'épisode
function endCard78(e, big) {
  const ep = EPS[e], ch = chapOfEp(e);
  const n = ch && ch.eps ? ch.eps.indexOf(e) + 1 : e + 1;
  const c = el('div', 'ill-end'); c.setAttribute('aria-hidden', 'true');
  c.append(el('div', 'ill-k', 'Épisode ' + n), el('div', 'ill-t', ep ? ep.title : ''), el('div', 'ill-r'));
  return c;
}
const VIGLIVE = new Set();
function vigScene(fig) {
  if (fig._sc) return fig._sc;
  const cv = $('canvas', fig), w = fig.clientWidth || 360;
  fig._sc = VIG76(cv, Math.min(2.5, Math.max(1, (window.devicePixelRatio || 1) * w / 400)), fig.dataset.id);
  VIGLIVE.add(fig);
  return fig._sc;
}
function vigKey(e) { return BOOK.id + ':e' + e; }
function vigStill(fig) {
  try { const sc = vigScene(fig); sc.frame(sc.dur); } catch (e) { /* dessin impossible : l'image reste sombre */ }
  fig.dataset.state = 'still'; fig.classList.add('end');
}
function vigPlay(fig) {
  let sc; try { sc = vigScene(fig); } catch (e) { return; }
  cancelAnimationFrame(fig._raf);
  S.ouv[vigKey(+fig.dataset.ep)] = 1; persist();
  fig.dataset.state = 'play'; fig.classList.remove('end'); animStart79(fig);
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    if (!fig.isConnected || document.hidden) { vigStill(fig); animDone79(fig); return; }
    sc.frame(Math.min(t, sc.dur));
    if (t >= sc.dur) { fig.dataset.state = 'still'; fig.classList.add('end'); animDone79(fig); return; }
    fig._raf = requestAnimationFrame(loop);
  };
  sc.frame(0);
  fig._raf = requestAnimationFrame(loop);
}
// dessinée à l'approche, jouée une fois quand elle est bien à l'écran
const vio77 = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    const fig = en.target;
    if (!en.isIntersecting || fig.dataset.state) return;
    if (en.intersectionRatio < 0.55) { if (!fig._sc) { try { vigScene(fig).frame(0); } catch (e) { /* rien */ } } return; }
    const due = !REDUCED && !S.ouv[vigKey(+fig.dataset.ep)] && !byId('reader').hidden;
    if (due && waitReach79(EPS[+fig.dataset.ep].a)) { if (!fig._sc) { try { vigScene(fig).frame(0); } catch (e) { /* rien */ } } return; }
    if (due) vigPlay(fig); else vigStill(fig);
  });
}, { threshold: [0, 0.55] }) : null;
// les lettres (enseignes, lettres de feu) attendent les polices de l'appli
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
  VIGLIVE.forEach((f) => { if (!f.isConnected) { VIGLIVE.delete(f); return; } if (f._sc) f._sc.refresh(); if (f.dataset.state === 'still') vigStill(f); });
});
function makeVignette77(v) {
  const fig = el('figure', 'vg76'); fig.dataset.id = v.id; fig.dataset.ep = String(v.ep);
  const box = el('div', 'vg76-i'); const cv = document.createElement('canvas'); cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', v.alt || v.legende || 'Illustration de l’épisode');
  box.tabIndex = 0; box.setAttribute('role', 'button'); box.setAttribute('aria-label', 'Rejouer l’animation de l’épisode');
  const skip = el('button', 'ill-skip', 'Passer ›'); skip.type = 'button';
  skip.addEventListener('click', (e) => { e.stopPropagation(); skipAnim79(fig); });
  box.append(cv, endCard78(v.ep), skip); fig.append(box);
  if (v.legende) fig.append(el('figcaption', '', v.legende));
  // un toucher rejoue l'animation (sans mettre la lecture en pause ni la relancer)
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
  const again = (e) => { e.stopPropagation(); if (e.target.closest('.ill-skip')) return; if (fig.dataset.state !== 'play') vigPlay(fig); };
  box.addEventListener('click', again);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); again(e); } });
  if (vio77) vio77.observe(fig); else setTimeout(() => vigStill(fig), 0);
  return fig;
}
// le titre écrit d'un épisode illustré cède la place au carton de l'animation
const illEp78 = (e) => !!vigAt(e) || CHAPS.some((ch, ci) => ch.eps && ch.eps[0] === e && ouvData(ci));
// bandeau de chapitre et vignettes d'épisode, posés dans la page au moment où elle se construit.
// Depuis la v64, la page se construit épisode par épisode (U64, tok68) : chaque titre de chapitre ou d'épisode
// reçoit son numéro dans le livre, et l'illustration est ajoutée juste après lui.
function decor77(frag, tk, head) {
  if (tk.t === 'chap' && tk._ci != null && ouvData(tk._ci)) frag.append(makeBanner76(tk._ci));
  else if (tk.t === 'tep' && tk._ep != null) {
    const h = head || frag.lastElementChild;
    if (h && h.matches && h.matches('p.tep') && illEp78(tk._ep)) h.classList.add('ill78');
    const v = vigAt(tk._ep); if (v) frag.append(makeVignette77(v));
  }
}
{
  const t68 = tok68;
  tok68 = function (frag, tk) { t68(frag, tk); decor77(frag, tk); };
  const bpi = buildPageInto;
  buildPageInto = function (root, map) {
    bpi(root, map);
    if (root === pvIn && Array.isArray(U64) && U64.length && U64[0].toks) {
      let ne = 0, nc = 0;
      U64.forEach((u) => u.toks.forEach((tk) => { if (tk.t === 'tep') tk._ep = ne++; else if (tk.t === 'chap') tk._ci = nc++; }));
      // les épisodes déjà construits
      U64.forEach((u) => {
        if (!u.built || !u.w) return;
        const ts = u.toks.filter((tk) => tk.t === 'tep' || tk.t === 'chap');
        const els = u.w.querySelectorAll('p.tep, p.tchap');
        ts.forEach((tk, i) => { const e = els[i]; if (!e) return; const f = document.createDocumentFragment(); decor77(f, tk, e); if (f.childNodes.length) e.after(f); });
      });
    } else {
      // page construite d'un seul coup
      root.querySelectorAll('p.tchap').forEach((h, ci) => { if (ouvData(ci)) h.after(makeBanner76(ci)); });
      root.querySelectorAll('p.tep').forEach((h, e) => { if (illEp78(e)) h.classList.add('ill78'); const v = vigAt(e); if (v) h.after(makeVignette77(v)); });
    }
  };
  // à l'arrêt, au tout début d'un épisode illustré : la page montre le titre de l'épisode et sa vignette
  const rp = renderPage;
  renderPage = function (c) {
    rp(c);
    if (playing || pvUserScroll || (S.read !== 'page' && S.read !== 'texte')) return;
    const e = EPI[k];
    if (e == null || !vigAt(e) || k > EPS[e].a + 2) return;
    const fig = pvIn.querySelector('.vg76[data-ep="' + e + '"]');
    if (!fig) return;
    const head = fig.previousElementSibling && fig.previousElementSibling.matches('p.tep') ? fig.previousElementSibling : fig;
    const y = Math.max(0, Math.round(head.getBoundingClientRect().top - pvIn.getBoundingClientRect().top - 34));
    if (pvAnim) { if (pvTarget > y) pvTarget = y; } else if (pageview.scrollTop > y + 2) { pageview.scrollTop = y; pvTarget = y; }
  };
}
// mode Texte : même chose, au début d'un chapitre ou d'un épisode illustré
function illusTop77(j) {
  const top = (fig, sel, gap) => {
    const head = fig.previousElementSibling && fig.previousElementSibling.matches(sel) ? fig.previousElementSibling : fig;
    return Math.max(0, Math.round(head.getBoundingClientRect().top - pvIn.getBoundingClientRect().top - gap));
  };
  for (let ci = 0; ci < CHAPS.length; ci++) {
    const ch = CHAPS[ci];
    if (!ouvData(ci) || j < ch.a || j > ch.a + 2) continue;
    const fig = pvIn.querySelector('.ov76[data-ci="' + ci + '"]');
    return fig ? top(fig, 'p.tchap', 22) : -1;
  }
  const e = EPI[j];
  if (e == null || !vigAt(e) || j > EPS[e].a + 2) return -1;
  const fig = pvIn.querySelector('.vg76[data-ep="' + e + '"]');
  return fig ? top(fig, 'p.tep', 34) : -1;
}
{
  const rt = renderTexte;
  renderTexte = function (j) {
    rt(j);
    const y = illusTop77(j);
    if (y >= 0 && pageview.scrollTop > y + 2) { pageview.scrollTop = y; txTop = y; }
  };
}
window.__v77 = window.__v78 = { VIGS, VIG76, makeVignette77, vigPlay, vigStill };

/* ================= Version 79 =================
   En lecture Immersive, la lecture s'arrête le temps d'une animation (bandeau de chapitre ou animation d'épisode),
   puis repart toute seule à la fin. Un bouton « Passer » sur l'animation la saute et relance la lecture aussitôt.
   L'animation ne démarre que quand la lecture arrive à son épisode (pas quand elle apparaît en bas de l'écran). */
{
  const st = document.createElement('style');
  st.textContent = `
/* v79 : bouton « Passer » pendant une animation */
.ill-skip { position: absolute; right: 10px; bottom: 10px; z-index: 3; display: none; font: 600 12px/1 "Schibsted Grotesk", system-ui, sans-serif;
  color: #f4ede3; background: rgba(23,19,15,.62); border: 1px solid rgba(244,237,227,.28); border-radius: 999px; padding: 8px 13px; cursor: pointer;
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.vg76[data-state="play"] .ill-skip, .ov76[data-state="play"] .ill-skip { display: block; }
.ov76[data-state="play"] .ov76-big { display: none; }
`;
  document.head.append(st);
}
let ANIM79 = null, hold79 = false;
function animStart79(fig) { ANIM79 = fig; }
function animDone79(fig) {
  if (ANIM79 !== fig) return;
  ANIM79 = null;
  const go = hold79; hold79 = false;
  if (go && !byId('reader').hidden && !playing && S.read === 'page') play();
}
function skipAnim79(fig) {
  if (fig.dataset.state !== 'play') return;
  if (fig.classList.contains('ov76')) { if (fig._h) fig._h.stop(); else animDone79(fig); }
  else { cancelAnimationFrame(fig._raf); vigStill(fig); animDone79(fig); }
}
// en lecture Immersive, tant que la lecture n'est pas arrivée à cet endroit, l'animation attend
function waitReach79(a) { return S.read === 'page' && playing && k < a; }
// l'animation à jouer au mot j (bandeau au début d'un chapitre, ou animation au début d'un épisode), si elle n'a pas encore été vue
function animDueAt79(j) {
  if (REDUCED) return null;
  const e = EPI[j];
  if (e == null || j > EPS[e].a + 2) return null;
  const ci = CHAPS.findIndex((ch) => ch.eps && ch.eps[0] === e);
  if (ci >= 0 && ouvData(ci) && !S.ouv[ouvKey(ci)]) { const f = pvIn.querySelector('.ov76[data-ci="' + ci + '"]'); if (f && f.dataset.state !== 'still' && f.dataset.state !== 'play') return f; }
  if (vigAt(e) && !S.ouv[vigKey(e)]) { const f = pvIn.querySelector('.vg76[data-ep="' + e + '"]'); if (f && f.dataset.state !== 'still' && f.dataset.state !== 'play') return f; }
  return null;
}
// l'illustration du début de l'épisode lu (vue ou non)
function figAt79(j) {
  const e = EPI[j];
  if (e == null || j > EPS[e].a + 2) return null;
  const ci = CHAPS.findIndex((ch) => ch.eps && ch.eps[0] === e);
  if (ci >= 0 && ouvData(ci)) return pvIn.querySelector('.ov76[data-ci="' + ci + '"]');
  return vigAt(e) ? pvIn.querySelector('.vg76[data-ep="' + e + '"]') : null;
}
function startAnim79(fig) { if (fig.classList.contains('ov76')) bannerPlay76(fig); else vigPlay(fig); }
{
  // lancer la lecture pendant une animation : elle attendra la fin (ou « Passer »)
  const pl = play;
  play = function () {
    if (!playing && S.read === 'page' && !byId('reader').hidden) {
      if (ANIM79 && ANIM79.isConnected && ANIM79.dataset.state === 'play') {
        if (ANIM79 === figAt79(k)) { hold79 = true; return; }
        hold79 = false; skipAnim79(ANIM79);     // une animation rejouée ailleurs dans le livre : on la termine, sans attendre
      }
      const f = animDueAt79(k);
      if (f) { hold79 = true; startAnim79(f); return; }
    }
    pl();
  };
  // en lisant, arrivée au début d'un épisode illustré : pause, animation, puis la lecture repart
  const tk = tick;
  tick = function () {
    if (playing && S.read === 'page' && !inter && !ANIM79 && !speedHack) {
      const f = animDueAt79(k);
      if (f) {
        const e0 = EPI[k], before = epPaused[e0];
        pause(); epPaused[e0] = before;
        hold79 = true;
        render(k);
        startAnim79(f);
        return;
      }
    }
    tk();
  };
  // plein écran ou retour à la page du livre : on ne relance pas la lecture derrière
  const po = playOuverture;
  playOuverture = function () { hold79 = false; return po.apply(this, arguments); };
  const scv = showCover;
  showCover = function () { hold79 = false; return scv.apply(this, arguments); };
}
window.__v79 = { get anim() { return ANIM79; }, get hold() { return hold79; }, skipAnim79, animDueAt79 };

/* ================= Version 80 =================
   Animations d'épisode pour tout le livre : 29 scènes de plus (chapitres II à XVIII), sur les épisodes les plus forts,
   avec la même règle (une fois, la lecture attend, « Passer », carton « Épisode X »). Elles sont dessinées par VIG76 ;
   la liste et les légendes (citations exactes) sont dans le livre : vignettes. */
/* ================= Version 81 =================
   Pot-Bouille, chapitre I (lot A) :
   – le plan de la maison de la rue de Choiseul (BOOK.immeuble) prend la place du Paris du héros : chaque logement
     s'allume quand le texte le nomme ; les noms s'ajoutent quand le roman les donne (étapes « ajoute ») ;
   – plusieurs photos ou tableaux d'époque par chapitre (BOOK.tableaux), en pastilles dans le texte (TABS) ;
   – l'année du récit (BOOK.anneeRecit) pour les jeux, la frise et les prix ; le nom de l'auteur vient du livre ;
   – trois ambiances : maison (l'air chaud de l'escalier), cour (la cour des cuisines), magasin (les soieries). */
const IMM_ET = IMM ? (IMM.etapes || []).map((x) => ({ id: x.logement, add: x.ajoute || '', j: wordIn(x.phrase, x.mot) }))
  .filter((x) => x.j >= 0 && IMM.logements[x.id]).sort((a, b) => a.j - b.j) : [];
const immName = (id) => (IMM && IMM.noms && IMM.noms[id]) || (CAST[id] ? CAST[id].nom : id);
// les logements déjà nommés par le roman : id -> { j (première mention), qui (noms connus) }
function immReached() {
  const lit = new Map();
  if (!IMM) return lit;
  const r = reachK();
  IMM_ET.forEach((x) => {
    if (x.j > r) return;
    if (!lit.has(x.id)) lit.set(x.id, { j: x.j, qui: (IMM.logements[x.id].qui || []).slice() });
    const o = lit.get(x.id);
    if (x.add && !o.qui.includes(x.add)) o.qui.push(x.add);
  });
  return lit;
}
let immSeen = null;   // logements déjà montrés (pour faire briller les nouveaux)
function fillImm(host) {
  host.replaceChildren();
  if (!IMM) return;
  const lit = immReached();
  const ids = Object.keys(IMM.logements);
  const order = Array.from(lit.keys()).sort((a, b) => lit.get(a).j - lit.get(b).j);
  if (!immSeen) { try { immSeen = new Set(JSON.parse(localStorage.getItem('lecture.imm.' + BOOK.id) || '[]')); } catch (e) { immSeen = new Set(); } }
  const house = el('div', 'im-house');
  house.setAttribute('role', 'group');
  house.setAttribute('aria-label', IMM.titre || 'La maison');
  const sides = el('div', 'im-sides'); sides.setAttribute('aria-hidden', 'true');
  sides.append(el('span', '', 'Côté rue'), el('span', '', 'Côté cour'));
  const roof = el('div', 'im-roof'); roof.setAttribute('aria-hidden', 'true');
  house.append(sides, roof);
  const cells = new Map();
  const list = el('ol', 'pd-list im-list');
  const pick = (id) => {
    cells.forEach((c, k2) => c.classList.toggle('on', k2 === id));
    $$('li', list).forEach((li) => li.classList.toggle('on', li.dataset.lg === id));
    const li = list.querySelector('[data-lg="' + id + '"]');
    if (li) li.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
  };
  const rank = { rue: 0, '': 1, cour: 2 };
  const lvOf = (nv) => nv.court || nv.nom;
  IMM.niveaux.forEach((nv) => {
    const here = ids.filter((id) => IMM.logements[id].niveau === nv.id)
      .sort((a, b) => (rank[IMM.logements[a].cote || ''] | 0) - (rank[IMM.logements[b].cote || ''] | 0));
    const row = el('div', 'im-row im-' + String(nv.id).replace(/[^a-z0-9]/gi, ''));
    row.append(el('span', 'im-lv', lvOf(nv)));
    const box = el('div', 'im-cells');
    box.style.setProperty('--n', String(Math.max(1, here.length)));
    if (!here.length) { const b = el('span', 'im-band'); b.setAttribute('aria-hidden', 'true'); box.append(b); }
    here.forEach((id) => {
      const L = IMM.logements[id], on = lit.get(id);
      const b = el('button', 'im-cell' + (on ? ' lit' : '')); b.type = 'button';
      if (on) {
        const names = on.qui.map(immName);
        b.append(el('b', '', L.court || names.join(', ') || L.nom));
        if (L.court && names.length) b.append(el('small', '', names.join(', ')));
        b.setAttribute('aria-label', L.nom + (names.length ? ' : ' + names.join(', ') : ''));
        if (!immSeen.has(id)) b.classList.add('fresh');
        b.addEventListener('click', () => { pick(id); buzz(6); });
      } else {
        b.append(el('span', 'im-q', '?'));
        b.setAttribute('aria-label', lvOf(nv) + ' : logement encore inconnu');
        b.addEventListener('click', () => toast('Ce logement s’allumera quand le roman en parlera.'));
      }
      cells.set(id, b);
      box.append(b);
    });
    row.append(box);
    house.append(row);
  });
  host.append(el('p', 'cn-lead', order.length ? 'Chaque logement s’allume quand le roman en parle. Touche un logement.' : 'Les logements de la maison s’allumeront ici au fil de ta lecture.'), house);
  order.forEach((id) => {
    const L = IMM.logements[id], on = lit.get(id), nv = IMM.niveaux.find((x) => x.id === L.niveau) || {};
    const li = el('li'); li.dataset.lg = id;
    li.append(el('span', 'pd-n im-n', nv.court || nv.nom || ''));
    const t = el('div', 'pd-t');
    t.append(el('strong', '', L.nom));
    const names = on.qui.map(immName);
    if (names.length) t.append(el('p', 'im-who', names.join(' · ')));
    if (L.txt) t.append(el('p', '', L.txt));
    const src = el('div', 'src'); src.append(el('span', '', where(on.j)), smallBtn('Lire ici', () => goRead(on.j)));
    t.append(src);
    li.append(t);
    li.addEventListener('click', (ev) => { if (!ev.target.closest('button')) pick(id); });
    list.append(li);
  });
  if (order.length) host.append(list);
  const left = ids.length - order.length;
  if (left > 0) host.append(el('p', 'empty', 'Encore ' + nb(left, 'logement', 'logements') + ' à découvrir en lisant.'));
  if (IMM.adresse) host.append(el('p', 'cmp-src', IMM.adresse));
  order.forEach((id) => immSeen.add(id));
  try { localStorage.setItem('lecture.imm.' + BOOK.id, JSON.stringify(Array.from(immSeen))); } catch (e) { /* stockage plein */ }
}
// la carte de Paris laisse la place au plan de la maison quand le livre en a un
{
  const fp = fillParis;
  fillParis = function (host) { if (!PD && IMM) return fillImm(host); return fp(host); };
}
// le Flash quiz : « Qui habite là ? », sur les logements déjà allumés
{
  const pool = flashPool;
  flashPool = function () {
    const Q = pool();
    if (!IMM) return Q;
    const lit = immReached();
    const all = [];
    lit.forEach((o, id) => { o.qui.forEach((w) => all.push(immName(w))); });
    lit.forEach((o, id) => {
      const L = IMM.logements[id];
      if (!o.qui.length) return;
      const ok = immName(o.qui[0]);
      const others = shuffle(Array.from(new Set(all.filter((n) => !o.qui.map(immName).includes(n))))).slice(0, 2);
      if (others.length < 2) return;
      Q.push({ type: 'maison', q: 'Dans la maison : qui habite « ' + lowFirst(L.nom) + ' » ?', choix: shuffle([ok].concat(others)), ok, info: L.txt || '' });
    });
    return Q;
  };
}
if (CATS47.lieux && !CATS47.lieux.includes('maison')) CATS47.lieux.push('maison');
// une photo d'époque se dit « photo » dans les pastilles
{
  const ga = gameAria;
  gameAria = function (g) {
    if (g && g.kind === 'tableau' && isPhoto(g.x.a)) return 'Une photo de l’époque : ' + g.x.nom;
    return ga(g);
  };
  const ft = fillTableaux;
  fillTableaux = function () {
    ft();
    const host = byId('cnTab');
    const lead = host && $('.cn-lead45', host);
    if (lead && TABS.some((t) => isPhoto(t.a))) lead.textContent = TABS.every((t) => isPhoto(t.a))
      ? 'Les photos de l’époque, trouvées en lisant. Touche une photo pour la revoir.'
      : 'Les peintures et les photos de l’époque, trouvées en lisant. Touche une image pour la revoir.';
  };
}
// trois ambiances de plus
Object.assign(AMB_FX, {
  maison: { every: 900, max: 7, make(o, w) {   // l'air chaud de l'escalier : de fines poussières dorées qui montent
    o.style.left = (Math.random() * Math.max(1, w - 4)) + 'px';
    o.style.setProperty('--s', (2 + Math.random() * 2.5) + 'px');
    o.style.setProperty('--d', (6 + Math.random() * 3) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 12) + 'px');
  } },
  cour: { every: 1250, max: 5, make(o, w) {    // la cour des cuisines : des gouttes qui glissent le long du mur
    o.style.left = (Math.random() * Math.max(1, w - 5)) + 'px';
    o.style.setProperty('--s', (5 + Math.random() * 4) + 'px');
    o.style.setProperty('--d', (3.4 + Math.random() * 2) + 's');
  } },
  magasin: { every: 1150, max: 6, make(o, w) { // le magasin de nouveautés : des chutes de soie et de ruban
    o.style.left = (Math.random() * Math.max(1, w - 10)) + 'px';
    o.style.setProperty('--s', (7 + Math.random() * 6) + 'px');
    o.style.setProperty('--d', (7 + Math.random() * 4) + 's');
    o.style.setProperty('--sw', ((Math.random() - .5) * 22) + 'px');
    o.style.setProperty('--rot', (160 + Math.random() * 300) + 'deg');
    o.style.setProperty('--c', ['var(--fx-2)', 'var(--fx-4)', 'var(--gold)', 'var(--fx-1)'][Math.floor(Math.random() * 4)]);
  } }
});
window.__v81 = { IMM, IMM_ET, immReached, fillImm, TABS, isPhoto, AN_RECIT, AUTEUR_NOM, dictLookup, openCarnet, cnGo, openGame, GAMES, showAvant, friseItems, flashPool, learnLine, openRoom, ROOMS, troveClose, closeGame, closeSheets, get trove() { return trove; }, get gameOpen() { return gameOpen; } };

/* ================= Version 83 =================
   Pot-Bouille, chapitres I à IV : les voix collectives (BOOK.personnages[id].voix, ex. « La cour », « Le chœur »)
   sont des figurants avec leur propre couleur. Le reste vient du livre (texte, contenus, plan de la maison). */
/* ================= Version 92 (animations des décors renforcées) =================
   Les effets des décors sont plus forts dans le livre (Bel-Ami v32). Dans le code, un seul ajout : le paramètre v
   (profondeur du vacillement) pour 'glow' (défaut 0,45, comme avant) et 'fire' (défaut 0,15, comme avant). */
/* ================= Version 91 (le salon d'attente du journal, Bel-Ami ch. I ép. 7) =================
   Un décor de plus, animé en code avec un seul effet : 'haze', un voile de fumée de tabac texturé qui sort de la porte
   entrouverte et monte (une tuile de bruit pavable qui défile, prise dans un panache puis teintée ; boucle parfaite).
   fx : { t:'haze', x, y, h, w0, w1, lean, box:[u0,v0,u1,v1], ts, life, a, c, tex }.
   Décor : fixe = true → caméra fixe (ni zoom ni glissement de l'image). */
/* ================= Version 88 (décor du lieu : fenêtre sous le texte, colonne sur grand écran) =================
   Choix de Guillaume après les maquettes (toile « Enfin lu · où placer l'image du lieu ») : B sur téléphone, F sur ordinateur et tablette.
   L'image du lieu a sa propre place, nette, hors du cadre de lecture : rien ne passe derrière le texte, rien ne bouge en lisant.
   - Téléphone (B) : une fenêtre panoramique 3:1 entre le cadre de lecture et les commandes, le nom du lieu en petites capitales.
   - Ordinateur et tablette, à partir de 760 × 560 px (F) : une colonne à gauche du cadre, sur toute sa hauteur.
   Livre : decors = [{ id, eps, nom, alt, cx, sy, img, fx }] (eps à partir de 0 ; img : l'image entière ; cx, sy : le centre à garder).
   L'image passe en fondu d'un lieu à l'autre ; animations en code très douces (gaz, fumée, eau, scintillements, lettres de feu).
   Réglage « Ambiance selon le lieu » coupé : pas d'image. Animations réduites : image fixe. */
{
  const st84 = document.createElement('style');
  st84.textContent = `
.lxbar84 { position: relative; flex: none; aspect-ratio: 3 / 1; max-height: 24vh; border-radius: 16px; overflow: hidden; background: #141018; margin: 6px 0 0; padding: 0;
  box-shadow: 0 10px 24px -16px rgba(20,12,8,.7); }
.lxbar84[hidden] { display: none; }
.lxbar84 canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity 1.1s ease; }
.lxbar84 canvas.cur { opacity: 1; }
.lxbar84 .lxn88 { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 24px 14px 9px; pointer-events: none;
  background: linear-gradient(to bottom, rgba(8,6,10,0), rgba(8,6,10,.72)); color: rgba(255,244,228,.95);
  font: 600 10.5px/1.2 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; transition: opacity .6s ease; }
.reader.lxf88 { position: relative; }
.reader.lxf88 .lxbar84 { position: absolute; left: 0; margin: 0; top: var(--lxt88, 0px); height: var(--lxh88, 0px); width: var(--lxw88, 360px);
  aspect-ratio: auto; max-height: none; border-radius: 20px; box-shadow: 0 16px 36px -22px rgba(20,12,8,.7); }
.reader.lxf88 .lxbar84 .lxn88 { padding: 48px 20px 16px; font-size: 11px; }
.reader.lxf88 .stage { margin-left: calc(var(--lxw88, 360px) + 22px); }
`;
  document.head.append(st84);
}
const DEC84 = Array.isArray(BOOK.decors) ? BOOK.decors.filter((d) => d && d.img && Array.isArray(d.eps)) : [];
const decAt84 = (e) => (e == null ? null : DEC84.find((d) => d.eps.includes(e)) || null);
const anim84 = () => S.amb !== false && !REDUCED && !document.hidden && !byId('reader').hidden;

const IMG84 = new Map();
const LIVE84 = new Set();          // scènes à l'écran (bande et images de la page)
function img84(d) {
  let im = IMG84.get(d.id);
  if (!im) {
    im = new Image(); im.decoding = 'async';
    im.onload = () => { LIVE84.forEach((s) => { if (s.d === d) s.dirty = true; }); kick84(); };
    im.src = d.img; IMG84.set(d.id, im);
  }
  return im;
}
const fr84 = (x) => x - Math.floor(x);
const rnd84 = (i, j) => fr84(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453);
const vn84 = (x) => 0.5 + 0.25 * Math.sin(x * 1.7) + 0.15 * Math.sin(x * 3.1 + 1.3) + 0.1 * Math.sin(x * 7.3 + 2.1);

function bigTile91(h, n) {
  n = Math.min(8, Math.max(2, n));
  if (h.big && h.bn >= n) return h.big;
  const tw = h.tex.naturalWidth, c = document.createElement('canvas'); c.width = c.height = tw * n;
  const x = c.getContext('2d');
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) x.drawImage(h.tex, i * tw, j * tw);
  h.big = c; h.bn = n; return c;
}
// v91 : le voile de fumée (effet 'haze') : la tuile et le masque du panache, préparés une fois par effet
const HZ91 = new Map();
function haze91(e, ei) {
  let h = HZ91.get(e);
  if (h) return h;
  if (!e.box || !e.tex) return null;
  const tex = new Image(); tex.decoding = 'async'; tex.onload = () => { LIVE84.forEach((s) => { s.dirty = true; }); kick84(); }; tex.src = e.tex;
  const [b0, b1, b2, b3] = e.box, MW = 120, MH = Math.max(16, Math.round(MW * (b3 - b1) / (b2 - b0)));
  const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
  const mx = mc.getContext('2d'), id = mx.createImageData(MW, MH);
  const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const u = b0 + (b2 - b0) * (i + 0.5) / MW, v = b1 + (b3 - b1) * (j + 0.5) / MH;
    const yr = Math.min(1.2, Math.max(0, (e.y - v) / e.h));
    const sg = e.w0 + (e.w1 - e.w0) * Math.pow(yr, e.k || 1.3), cx = e.x + (e.lean || 0) * yr;
    let m = Math.exp(-0.5 * Math.pow((u - cx) / sg, 2)) * sm((yr - 0.01) / 0.13) * sm((1.05 - yr) / 0.45);
    m *= sm(i / (MW * 0.2)) * sm((MW - 1 - i) / (MW * 0.2)) * sm(j / (MH * 0.15));
    id.data[(j * MW + i) * 4 + 3] = Math.round(255 * m);
  }
  mx.putImageData(id, 0, 0);
  h = { tex, mask: mc, oc: document.createElement('canvas'), big: null, bn: 0 };
  HZ91.set(e, h);
  return h;
}
// une scène : l'image du lieu (cadrée autour de sy), qui respire à peine, et ses effets
function scene84(cv, d, sy) {
  const ctx = cv.getContext('2d');
  const im = img84(d);
  const sc = { d, sy: sy == null ? 0.5 : sy, dirty: true, resized: true, cv };
  let W = 0, H = 0, FIRE = null;
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (w !== cv.width || h !== cv.height) { cv.width = w; cv.height = h; }
    W = w; H = h; sc.resized = false;
  }
  function firePts(e) {
    const tc = document.createElement('canvas'); tc.width = 600; tc.height = 110;
    const tx = tc.getContext('2d'); tx.fillStyle = '#fff'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.font = "italic 700 66px 'Bodoni Moda', Didot, Georgia, serif";
    const tw = Math.min(590, tx.measureText(e.text).width);
    tx.fillText(e.text, 300, 56, 590);
    const px = tx.getImageData(0, 0, 600, 110).data, pts = [];
    for (let y = 2; y < 110; y += 4) for (let x = 2; x < 600; x += 4) if (px[(y * 600 + x) * 4 + 3] >= 140) pts.push([x, y, rnd84(x, y) * 40]);
    return { pts, tw };
  }
  sc.refresh = () => { FIRE = null; sc.dirty = true; };
  sc.draw = function (t) {
    if (sc.resized || !W) size();
    if (!im.complete || !im.naturalWidth) { ctx.fillStyle = '#141018'; ctx.fillRect(0, 0, W, H); return false; }
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const live = t != null;
    const tt = live ? t : 0;
    const fixe = !!d.fixe;   // v91 : caméra fixe pour ce décor (ni zoom ni glissement)
    const z = fixe ? 1 : live ? 1.03 + 0.012 * Math.sin(tt * 2 * Math.PI / 52) : 1.035;
    const s = Math.max(W / iw, H / ih) * z, dw = iw * s, dh = ih * s;
    const cx = (d.cx == null ? 0.5 : d.cx) + (live && !fixe ? 0.012 * Math.sin(tt * 2 * Math.PI / 70) : 0);
    const dx = Math.min(0, Math.max(W - dw, W / 2 - cx * dw));
    const dy = Math.min(0, Math.max(H - dh, H / 2 - sc.sy * dh));
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(im, dx, dy, dw, dh);
    if (!live) return true;
    const X = (u) => dx + u * dw, Y = (v) => dy + v * dh, R = (r) => r * dw;
    const blob = (x, y, r, c, a, mid) => {
      if (a <= 0.004 || r < 0.5 || x < -r || x > W + r || y < -r || y > H + r) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c + ',' + a + ')'); g.addColorStop(mid || 0.4, 'rgba(' + c + ',' + (a * 0.35) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    };
    (d.fx || []).forEach((e, ei) => {
      const c = e.c || '255,200,140';
      if (e.t === 'glow') {
        ctx.globalCompositeOperation = 'lighter';
        (e.p || []).forEach(([u, v], i) => blob(X(u), Y(v), R(e.r), c, e.a * (1 - (e.v || 0.45) + (e.v || 0.45) * vn84(tt * (e.f || 1) + i * 2.3 + ei))));
      } else if (e.t === 'twk') {
        ctx.globalCompositeOperation = 'lighter';
        (e.p || []).forEach(([u, v], i) => {
          const q = Math.max(0, Math.sin(tt * (e.f || 1) * (0.55 + rnd84(i, ei)) + rnd84(ei, i) * 6.3));
          const a = e.a * Math.pow(q, 6);
          if (a < 0.02) return;
          const x = X(u), y = Y(v), r = R(e.r);
          blob(x, y, r, c, a, 0.25);
          ctx.strokeStyle = 'rgba(' + c + ',' + (a * 0.7) + ')'; ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.beginPath(); ctx.moveTo(x - r * 1.3, y); ctx.lineTo(x + r * 1.3, y); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x, y + r * 1.3); ctx.stroke();
        });
      } else if (e.t === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < e.n; i++) {
          const p = fr84(tt / e.life + rnd84(i, ei + 1));
          const x = X(e.x + (rnd84(i, ei + 2) - 0.5) * e.w + (e.dx || 0) * p), y = Y(e.y - e.h * p);
          blob(x, y, R(e.r) * (0.45 + 1.2 * p), c, e.a * Math.pow(Math.sin(Math.PI * p), 1.5), 0.5);
        }
      } else if (e.t === 'fog') {
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < e.n; i++) {
          const p = fr84(rnd84(i, ei + 3) + tt * e.sp);
          const x = X(e.x - e.w / 2 + e.w * p), y = Y(e.y - e.h * rnd84(i, ei + 4));
          blob(x, y, R(e.r) * (0.8 + 0.5 * rnd84(i, ei + 5)), c, e.a * Math.sin(Math.PI * p), 0.5);
        }
      } else if (e.t === 'water') {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, R(0.0022));
        for (let i = 0; i < e.n; i++) {
          const p = fr84(tt / e.life + rnd84(i, ei + 6));
          const u = e.x0 + (e.x1 - e.x0) * rnd84(i, ei + 7);
          const y = Y(e.y0 + (e.y1 - e.y0) * p * p), y2 = Y(e.y0 + (e.y1 - e.y0) * Math.max(0, p - 0.12) * Math.max(0, p - 0.12));
          ctx.strokeStyle = 'rgba(' + c + ',' + (e.a * (1 - p * 0.7)) + ')';
          ctx.beginPath(); ctx.moveTo(X(u), y2); ctx.lineTo(X(u), y); ctx.stroke();
        }
      } else if (e.t === 'haze') {
        // v91 : voile de fumée texturé (tuile pavable qui monte), pris dans un panache, puis teinté
        const H91 = haze91(e, ei);
        if (!H91) return;
        const [b0, b1, b2, b3] = e.box;
        const bx = X(b0), by = Y(b1), bw = X(b2) - bx, bh = Y(b3) - by;
        if (bx > W || by > H || bx + bw < 0 || by + bh < 0) return;
        const ow = Math.max(8, Math.min(700, Math.ceil(bw / 2))), oh = Math.max(8, Math.min(900, Math.ceil(bh / 2)));
        const oc = H91.oc; if (oc.width !== ow || oc.height !== oh) { oc.width = ow; oc.height = oh; }
        const ox = oc.getContext('2d'), k = ow / bw;
        ox.globalCompositeOperation = 'source-over'; ox.globalAlpha = 1; ox.clearRect(0, 0, ow, oh);
        if (H91.tex.complete && H91.tex.naturalWidth) {
          const ph = fr84(tt / e.life), sw = Math.sin(2 * Math.PI * tt / e.life);
          const lay = (ts, rise, dxs, al) => {
            ox.globalAlpha = al;
            const s0 = Math.max(4, ts * k), tw = H91.tex.naturalWidth;
            // une seule copie, prise dans une grande planche de tuiles déjà raccordées : aucune ligne aux raccords
            const nw = ow / s0, nh = oh / s0, big = bigTile91(H91, Math.ceil(Math.max(nw, nh)) + 1);
            const sx = fr84(dxs) * tw, sy = fr84(ph * rise) * tw;
            ox.drawImage(big, sx, sy, nw * tw, nh * tw, 0, 0, ow, oh);
          };
          lay(R(e.ts), 1, 0.5 + 0.035 * sw, 1);
          lay(R(e.ts) / 2, 3, 0.2 - 0.05 * sw, 0.6);
        }
        ox.globalAlpha = 1;
        ox.globalCompositeOperation = 'destination-in'; ox.drawImage(H91.mask, 0, 0, ow, oh);
        ox.globalCompositeOperation = 'source-in'; ox.fillStyle = 'rgb(' + c + ')'; ox.fillRect(0, 0, ow, oh);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = e.a;
        ctx.drawImage(oc, bx, by, bw, bh); ctx.globalAlpha = 1;
      } else if (e.t === 'fire') {
        if (!FIRE) FIRE = firePts(e);
        const k = R(e.w) / FIRE.tw, ox = X(e.x) - 300 * k, oy = Y(e.y) - 56 * k;
        const fl = 1 - (e.v || 0.15) + (e.v || 0.15) * vn84(tt * 5);
        ctx.globalCompositeOperation = 'lighter';
        blob(X(e.x), Y(e.y), R(e.w) * 0.62, c, 0.20 * fl, 0.5);
        const rr = Math.max(0.8, 2.2 * k);
        for (const [fx2, fy2, ph] of FIRE.pts) {
          const vd = Math.min(0.8, (e.v || 0.15) * 3), a = 1 - vd + vd * vn84(tt * 9 + ph);
          ctx.fillStyle = 'rgba(' + c + ',' + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(ox + fx2 * k, oy + fy2 * k, rr * 1.9, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,236,190,' + (0.8 * a) + ')'; ctx.beginPath(); ctx.arc(ox + fx2 * k, oy + (fy2 - 1.2) * k, rr * 0.75, 0, 7); ctx.fill();
        }
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    return true;
  };
  sc.size = () => { sc.resized = true; sc.dirty = true; };
  return sc;
}
// tout tourne dans une seule boucle, à 30 images par seconde, et seulement quand une scène est à l'écran
let raf84 = 0, last84 = 0;
function kick84() { if (!raf84) raf84 = requestAnimationFrame(tick84); }
function tick84(now) {
  raf84 = 0;
  if (!LIVE84.size) return;
  if (!anim84()) {
    LIVE84.forEach((sc) => { if (sc.dirty) { if (sc.draw(null)) sc.dirty = false; } });
    return;
  }
  if (now - last84 >= 31) { last84 = now; const t = now / 1000; LIVE84.forEach((sc) => { sc.draw(t); sc.dirty = false; }); }
  raf84 = requestAnimationFrame(tick84);
}
document.addEventListener('visibilitychange', () => { LIVE84.forEach((s) => { s.dirty = true; }); kick84(); });
const ro84 = window.ResizeObserver ? new ResizeObserver((es) => { es.forEach((en) => { const s = en.target._sc84; if (s) s.size(); }); kick84(); }) : null;


// la fenêtre du lieu : sous le cadre de lecture (téléphone), ou dans une colonne à sa gauche (grand écran)
const BAR84 = { el: null, cv: [], cur: -1, d: null, on: false };
{
  const b = el('figure', 'lxbar84'); b.hidden = true; b.setAttribute('role', 'img');
  for (let i = 0; i < 2; i++) { const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); b.append(cv); BAR84.cv.push(cv); }
  BAR84.nm = el('figcaption', 'lxn88'); BAR84.nm.setAttribute('aria-hidden', 'true'); b.append(BAR84.nm);
  BAR84.el = b; stage.after(b);
}
function barSet84(d) {
  if (d && d !== BAR84.d) {
    const old = BAR84.cur >= 0 ? BAR84.cv[BAR84.cur] : null;
    const nx = BAR84.cur === 0 ? 1 : 0, cv = BAR84.cv[nx];
    if (cv._sc84) LIVE84.delete(cv._sc84);
    cv._sc84 = scene84(cv, d, d.sy); if (ro84) ro84.observe(cv);
    if (old) { old.classList.remove('cur'); if (old._sc84) { const o = old._sc84; setTimeout(() => { if (BAR84.cv[BAR84.cur] !== old) LIVE84.delete(o); }, 900); } }
    cv.classList.add('cur'); BAR84.cur = nx; BAR84.d = d;
    BAR84.nm.textContent = d.nom || ''; BAR84.el.setAttribute('aria-label', d.alt || d.nom || 'Le lieu de l’épisode');
  }
  const on = !!d;
  if (on !== BAR84.on) {
    BAR84.on = on; BAR84.el.hidden = !on; place88();
  }
  const sc = BAR84.cur >= 0 ? BAR84.cv[BAR84.cur]._sc84 : null;
  if (sc) { if (on) { if (!LIVE84.has(sc)) { sc.dirty = true; LIVE84.add(sc); } } else setTimeout(() => { if (!BAR84.on) BAR84.cv.forEach((c) => c._sc84 && LIVE84.delete(c._sc84)); }, 800); }
  kick84();
}
// grand écran : la colonne prend la hauteur du cadre de lecture, et le cadre se décale à droite
const WIDE88 = window.matchMedia ? window.matchMedia('(min-width: 760px) and (min-height: 560px)') : null;
function place88() {
  const rd = byId('reader');
  const wide = !!(WIDE88 && WIDE88.matches && BAR84.on);
  rd.classList.toggle('lxf88', wide);
  if (!wide) return;
  const w = Math.round(Math.min(440, Math.max(260, rd.clientWidth * (rd.clientHeight > rd.clientWidth ? 0.36 : 0.31))));
  sv73(rd, '--lxw88', w + 'px');
  sv73(rd, '--lxt88', stage.offsetTop + 'px');
  sv73(rd, '--lxh88', stage.offsetHeight + 'px');
}
if (window.ResizeObserver) new ResizeObserver(() => { if (BAR84.on) place88(); }).observe(stage);
if (WIDE88) { const f = () => place88(); if (WIDE88.addEventListener) WIDE88.addEventListener('change', f); else if (WIDE88.addListener) WIDE88.addListener(f); }
function upd84() {
  if (byId('reader').hidden || S.amb === false) { barSet84(null); return; }
  let e = null; try { e = EPI[k]; } catch (_) { e = null; }
  barSet84(decAt84(e));
}
let q84 = 0;
function sched84() { if (!q84) q84 = requestAnimationFrame(() => { q84 = 0; upd84(); }); }
if (DEC84.length) {
  const pg = progress;
  progress = function () { const r = pg.apply(this, arguments); sched84(); return r; };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { BAR84.cv.forEach((c) => c._sc84 && c._sc84.refresh()); kick84(); });
}
window.__v84 = { fast: (ms) => { speedHack = ms; }, pause: () => { if (playing) halt(); }, get playing() { return playing; }, get ep() { try { return EPI[k]; } catch (_) { return null; } }, DEC84, decAt84, upd: upd84, BAR: BAR84, LIVE: LIVE84, startEpisode: (e, a) => startEpisode(e, a), get k() { return k; } };

/* ================= Version 85 (saut d'épisode) =================
   Changer d'épisode (barre du haut, page du livre, marque-page…) amène bien la page jusqu'au mot,
   en mode Texte comme en Immersif.
   Depuis la v64, la page se construit épisode par épisode, avec une hauteur estimée pour les épisodes pas encore construits.
   Deux problèmes :
   - en mode Texte, l'épisode visé n'était pas construit avant la mesure : la page restait où elle était ;
   - dans les deux modes, après le saut, les épisodes situés au-dessus se construisaient peu à peu et prenaient leur vraie
     hauteur, ce qui repoussait le texte vers le bas (souvent d'un millier de pixels) : le mot sortait de l'écran.
   Maintenant :
   - l'épisode visé et ses voisins sont construits avant la mesure (mode Texte, comme l'Immersif depuis la v64) ;
   - quand un épisode qui commence au-dessus de l'écran (et où l'on n'est pas en train de lire) change de hauteur, la page défile d'autant :
     ce qu'on lit ne bouge pas (ancrage du défilement, fait à la main car le navigateur l'a coupé pour le glissement de la page). */
{
  const rt85 = renderTexte;
  renderTexte = function (j) {
    if (pvBuilt && Array.isArray(U64) && U64.length) ensure64(j);
    return rt85.apply(this, arguments);
  };
  const H85 = new WeakMap();
  const ro85 = window.ResizeObserver ? new ResizeObserver((es) => {
    if (!pvBuilt || !es.length) return;
    const top = pageview.getBoundingClientRect().top;
    const list = es.map((en) => en.target).filter((w) => w.isConnected && w._u64).sort((a, b) => a._u64.i - b._u64.i);
    const cur = PVS[V[k]];
    let cum = 0, d = 0;
    list.forEach((w) => {
      const r = w.getBoundingClientRect(), h = r.height, old = H85.get(w);
      H85.set(w, h);
      if (old == null || Math.abs(h - old) < 0.5) return;
      // un épisode qui commençait au-dessus du haut de l'écran, et où l'on n'est pas en train de lire : ce qui suit ne doit pas bouger
      if (r.top - cum < top - 1 && !(cur && w.contains(cur)) && !(inter && w.querySelector('.epend.open'))) d += h - old;
      cum += h - old;
    });
    // à l'arrêt, le ruban et le fond du paragraphe en cours suivent le texte qui a bougé dans la page
    if (Math.abs(cum) >= 0.5 && !playing && (S.read === 'page' || S.read === 'texte')) { placeHighlight(); paraHL(pvPara); }
    if (Math.abs(d) < 1 || pageview.scrollTop <= 0) return;
    pageview.scrollTop += d;
    pvTarget += d;
    if (pvF64 != null) pvF64 += d;
    if (S.read === 'texte') txTop = pageview.scrollTop;
  }) : null;
  const bpi85 = buildPageInto;
  buildPageInto = function (root, map) {
    const r = bpi85.apply(this, arguments);
    if (root === pvIn && ro85 && Array.isArray(U64)) U64.forEach((u) => { if (u.w) ro85.observe(u.w); });
    return r;
  };
}
window.__v85 = { word: () => { const s = PVS[V[k]]; if (!s) return null; const r = s.getBoundingClientRect(), p = pageview.getBoundingClientRect(); return { conn: s.isConnected, off: Math.round(r.top - p.top), h: pageview.clientHeight, st: Math.round(pageview.scrollTop) }; } };

/* ================= Versions 93 et 94 (ombres chinoises en plein écran, fin d'épisode au centre, barre du haut) =================
   v94 (précision de Guillaume) : seules les animations en ombres chinoises passent en plein écran. Les lieux animés (image du
   lieu et ses effets) restent comme en v88 : la fenêtre en bas sur téléphone, la colonne à gauche sur tablette et ordinateur.
   Demande de Guillaume (5 nov.) :
   - les animations en ombres chinoises prennent tout l'écran au début de l'épisode, avec « Passer », puis disparaissent :
     elles encombraient la page. Pas de médaillon pour les revoir (v94 : « plus simple ») ;
   - à la fin d'un épisode, le bilan (Carnet des curiosités, quiz, Continuer) se place au milieu de l'écran ;
   - téléphone : toucher Curiosités pendant la lecture n'ouvre plus Aa (Aa ne laisse plus sa place pendant la lecture) ;
   - ordinateur : le panneau Aa (Réglages) s'ouvre en haut, sous la barre, et non plus en bas de l'écran.
   Ce qui se joue au début d'un épisode, une fois (S.ouv["livre:iN"]) :
   - premier épisode d'un chapitre qui a une ouverture animée : l'ouverture en plein écran (v75), avec « Passer » ;
   - épisode qui a une animation (vignettes du livre) : l'animation en grand, sur le décor du lieu flouté s'il y en a un ;
   Le bandeau du chapitre et les animations dans le texte (v76-78) ne sont plus dans la page ; la fenêtre et la colonne du lieu restent.
   Animations réduites : rien ne se lance. */
{
  const st93 = document.createElement('style');
  st93.textContent = `
.in93 { position: fixed; inset: 0; z-index: 80; background: #0b0907; overflow: hidden; color: #f4ede3; opacity: 0; transition: opacity .5s ease;
  -webkit-tap-highlight-color: transparent; cursor: pointer; }
.in93[hidden] { display: none; }
.in93.on { opacity: 1; }
.in93-bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.in93.vig .in93-bg { filter: blur(18px) brightness(.4) saturate(.9); transform: scale(1.1); }
.in93-v { position: absolute; left: 50%; top: 50%; width: min(94vw, 1040px, calc((100vh - 150px) * 2)); aspect-ratio: 2 / 1; transform: translate(-50%, -50%);
  border-radius: 14px; overflow: hidden; background: #211a1e; box-shadow: 0 26px 60px -22px rgba(0,0,0,.85); }
.in93:not(.vig) .in93-v { display: none; }
.in93-v canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.in93-v .ill-t { font-size: clamp(24px, 4vw, 46px); }
.in93-v .ill-k { font-size: clamp(10px, 1.1vw, 13px); }
.in93-card { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; pointer-events: none;
  padding: 130px 24px calc(86px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to bottom, rgba(11,9,7,0), rgba(11,9,7,.55) 42%, rgba(11,9,7,.84));
  opacity: 0; transform: translateY(10px); transition: opacity 1s ease, transform 1s ease; }
.in93.vig .in93-card { display: none; }
.in93.card .in93-card { opacity: 1; transform: none; }
.in93-k { font: 600 11px/1.2 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .32em; text-transform: uppercase; color: rgba(244,237,227,.74); }
.in93-t { font-family: "Bodoni Moda", Didot, Georgia, serif; font-style: italic; font-size: clamp(32px, 6vw, 58px); font-variation-settings: 'opsz' 28;
  line-height: 1.06; margin: 10px auto 0; max-width: 760px; text-wrap: balance; text-shadow: 0 2px 18px rgba(8,5,6,.7); }
.in93-r { width: 34px; height: 1px; background: #d9a521; margin: 16px auto 0; opacity: .85; }
.in93-p { margin-top: 12px; font: 600 10px/1.2 "Schibsted Grotesk", system-ui, sans-serif; letter-spacing: .24em; text-transform: uppercase; color: rgba(244,237,227,.55); }
.in93-p:empty { display: none; }
.o93-bk { position: absolute; inset: 0; width: 100%; height: 100%; display: block; filter: blur(22px) brightness(.42) saturate(.9); transform: scale(1.12); }
.o93-bk[hidden] { display: none; }
.in93-skip:focus-visible { outline: 2px solid rgba(244,237,227,.55); outline-offset: 2px; }
.in93-skip:focus:not(:focus-visible) { outline: none; }
.in93-skip { position: absolute; z-index: 2; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  font: 600 13px "Schibsted Grotesk", system-ui, sans-serif; color: rgba(244,237,227,.92); background: rgba(23,19,15,.55);
  border: 1px solid rgba(244,237,227,.24); border-radius: 999px; padding: 9px 16px; cursor: pointer; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
/* téléphone : pendant la lecture, Aa devient invisible mais garde sa place : Curiosités ne bouge plus sous le doigt */
.reader[data-zen="1"] .rbar > .aa { display: block; visibility: hidden; pointer-events: none; }
/* ordinateur et tablette : le panneau Aa s'ouvre en haut, sous la barre */
@media (min-width: 720px) and (min-height: 520px) {
  #settingsSheet { align-items: flex-start; }
  #settingsSheet .panel { margin-top: 68px; max-width: 640px; border-radius: 22px; max-height: calc(100% - 88px); box-shadow: 0 24px 60px -28px rgba(10,6,4,.55); }
}
`;
  document.head.append(st93);
}

// ---------- ce qui s'ouvre au début d'un épisode ----------
const key93 = (e) => BOOK.id + ':i' + e;
function introOf93(e) {
  if (e == null || !EPS[e]) return null;
  const dec = S.amb !== false ? decAt84(e) : null;
  const ci = CHAPS.findIndex((ch, i) => ch.eps && ch.eps[0] === e && ouvData(i));
  if (ci >= 0) return { t: 'ouv', ci, e, d: dec };
  const v = vigAt(e);
  if (v) return { t: 'vig', v, e, d: dec };
  return null;
}
// au mot j : l'ouverture à jouer (tout début d'un épisode, pas encore vue)
function introDue93(j) {
  if (REDUCED || !S.ouv) return null;
  const e = EPI[j];
  if (e == null || !EPS[e] || j > EPS[e].a + 2 || S.ouv[key93(e)]) return null;
  return introOf93(e) ? e : null;
}
const epNum93 = (e) => { const ch = chapOfEp(e); return ch && ch.eps ? ch.eps.indexOf(e) + 1 : e + 1; };

const IN93 = { el: null, on: null };
{
  const o = el('div', 'in93'); o.id = 'intro93'; o.hidden = true;
  o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = '<canvas class="in93-bg" aria-hidden="true"></canvas><div class="in93-v"><canvas aria-hidden="true"></canvas></div>'
    + '<div class="in93-card" aria-hidden="true"><div class="in93-k"></div><div class="in93-t"></div><div class="in93-r"></div><div class="in93-p"></div></div>'
    + '<button class="in93-skip" type="button">Passer ›</button>';
  document.body.append(o);
  IN93.el = o;
  // « Passer », ou un toucher n'importe où
  o.addEventListener('click', (ev) => { ev.stopPropagation(); if (IN93.on) IN93.on.finish(true); });
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((t) => o.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true }));
}
document.addEventListener('keydown', (ev) => {
  if (!IN93.on || !IN93.el || IN93.el.hidden) return;
  if (ev.key === 'Escape' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); IN93.on.finish(true); }
}, true);

function playIntro93(e, then) {
  const it = introOf93(e);
  if (!it || IN93.on) { if (then) then(); return false; }
  S.ouv[key93(e)] = 1; persist();
  stopBanners76();
  // l'ouverture du chapitre : son plein écran à elle (v75), avec « Passer »
  if (it.t === 'ouv') {
    const btn = $('.o75-skip', ouvEl), lab = btn.textContent;
    let over = false, iv = 0;
    const end = (go) => { if (over) return; over = true; btn.textContent = lab; clearInterval(iv); IN93.on = null; paintMd93(true); if (go && then) then(); };
    IN93.on = { e, finish: () => { if (ouvOpen) ouvOpen.finish(true); else end(true); } };
    btn.textContent = 'Passer ›';
    playOuverture(it.ci, () => end(true));
    // écran large : les côtés reprennent la scène, agrandie et floutée (comme derrière les animations d'épisode)
    if (ouvOpen && window.innerWidth / window.innerHeight > 0.7) {
      let bk = $('.o93-bk', ouvEl);
      if (!bk) { bk = document.createElement('canvas'); bk.className = 'o93-bk'; bk.width = 192; bk.height = 108; bk.setAttribute('aria-hidden', 'true'); ouvEl.prepend(bk); }
      const src = $('.o75-stage canvas', ouvEl), bx = bk.getContext('2d');
      bk.width = 192; bk.height = Math.max(60, Math.round(192 * window.innerHeight / window.innerWidth));
      let n = 0;
      const paint = () => {
        if (!ouvOpen || ouvEl.hidden) return;
        if (!(n++ % 2) && src.width) {
          const sc = Math.max(bk.width / src.width, bk.height / src.height), dw = src.width * sc, dh = src.height * sc;
          try { bx.drawImage(src, (bk.width - dw) / 2, (bk.height - dh) / 2, dw, dh); } catch (err) { /* rien */ }
        }
        requestAnimationFrame(paint);
      };
      bk.hidden = false;
      requestAnimationFrame(paint);
    } else { const bk = $('.o93-bk', ouvEl); if (bk) bk.hidden = true; }
    // fermée sans suite (l'appli passe en arrière-plan) : on range
    if (!over) iv = setInterval(() => { if (!ouvOpen && ouvEl.hidden) end(false); }, 600);
    return true;
  }
  const o = IN93.el, bg = $('.in93-bg', o), vbox = $('.in93-v', o), vcv = $('canvas', vbox);
  o.classList.toggle('vig', it.t === 'vig');
  o.classList.remove('card', 'on');
  $('.in93-k', o).textContent = 'Épisode ' + epNum93(e);
  $('.in93-t', o).textContent = EPS[e].title || '';
  $('.in93-p', o).textContent = it.t === 'dec' && it.d ? (it.d.nom || '') : '';
  o.setAttribute('aria-label', 'Épisode ' + epNum93(e) + ' : ' + (EPS[e].title || '') + (it.d && it.d.alt ? '. ' + it.d.alt : ''));
  // le fond : le décor du lieu, animé (flouté derrière une animation d'épisode)
  let sc = null;
  if (it.d) {
    bg.hidden = false;
    sc = scene84(bg, it.d, it.d.sy); bg._sc84 = sc; sc.size();
    if (ro84) ro84.observe(bg);
    LIVE84.add(sc);
  } else bg.hidden = true;
  // l'animation de l'épisode, en grand
  let vs = null;
  vbox.classList.remove('end');
  vbox.querySelectorAll('.ill-end').forEach((x) => x.remove());
  o.hidden = false;
  if (it.t === 'vig') {
    vbox.append(endCard78(e));
    const w = vbox.clientWidth || 360;
    try { vs = VIG76(vcv, Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * w / 400)), it.v.id); } catch (err) { vs = null; }
    if (vs) { try { vs.frame(REDUCED ? vs.dur : 0); } catch (err) { vs = null; } }
    if (!vs || REDUCED) vbox.classList.add('end');
  }
  if (REDUCED) o.classList.add('card');
  const DUR = REDUCED ? 4 : it.t === 'vig' ? (vs ? vs.dur + 1.9 : 3.5) : 6.5;
  const t0 = performance.now();
  let raf = 0, done = false;
  const finish = (go) => {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    o.classList.remove('on');
    setTimeout(() => {
      o.hidden = true; o.classList.remove('card');
      if (sc) { LIVE84.delete(sc); if (ro84) ro84.unobserve(bg); bg._sc84 = null; }
      IN93.on = null; paintMd93(true);
      if (go !== false && then) then();
    }, REDUCED ? 60 : 500);
  };
  const onVis = () => { if (document.hidden) finish(false); };
  const loop = () => {
    if (done) return;
    const t = (performance.now() - t0) / 1000;
    if (vs && !REDUCED) {
      try { vs.frame(Math.min(t, vs.dur)); } catch (err) { /* rien */ }
      if (t >= vs.dur && !vbox.classList.contains('end')) vbox.classList.add('end');
    }
    if (it.t === 'dec' && t >= 0.9 && !o.classList.contains('card')) o.classList.add('card');
    if (t >= DUR) { finish(true); return; }
    raf = requestAnimationFrame(loop);
  };
  IN93.on = { e, finish };
  document.addEventListener('visibilitychange', onVis);
  void o.offsetWidth;
  o.classList.add('on');
  kick84();
  raf = requestAnimationFrame(loop);
  try { $('.in93-skip', o).focus({ preventScroll: true }); } catch (err) { /* rien */ }
  return true;
}

// ---------- la lecture : l'ouverture se joue au début de l'épisode, puis la lecture repart ----------
const pl93 = play;
{
  const resume = () => { if (!byId('reader').hidden && !playing) pl93(); };
  const modeOk = () => S.read === 'page' || S.read === 'rsvp';
  play = function () {
    if (!playing && !byId('reader').hidden && modeOk()) {
      if (IN93.on) return;                     // l'ouverture se joue : la lecture repartira à la fin
      const e = introDue93(k);
      if (e != null) { playIntro93(e, resume); return; }
    }
    return pl93.apply(this, arguments);
  };
  const tk93 = tick;
  tick = function () {
    if (playing && modeOk() && !inter && !IN93.on && !speedHack) {
      const e = introDue93(k);
      if (e != null) {
        const e0 = EPI[k], before = epPaused[e0];
        pause(); epPaused[e0] = before;
        render(k);
        playIntro93(e, resume);
        return;
      }
    }
    return tk93.apply(this, arguments);
  };
}

// v94 : pas de médaillon
function paintMd93() {}

// ---------- plus d'animations dans le texte (la fenêtre et la colonne du lieu restent) ----------
decor77 = function () {};
{
  const bpi93 = buildPageInto;
  buildPageInto = function (root) {
    const r = bpi93.apply(this, arguments);
    if (root && root.querySelectorAll) {
      root.querySelectorAll('.ov76, .vg76').forEach((f) => f.remove());
      root.querySelectorAll('p.tep.ill78').forEach((p) => p.classList.remove('ill78'));
    }
    return r;
  };
}

// ---------- fin d'épisode : une fois le bandeau entièrement déroulé, il se recentre ----------
{
  const ee93 = endEpisode;
  endEpisode = function (e, isLast) {
    const r = ee93.apply(this, arguments);
    if (S.read === 'page') setTimeout(() => {
      const s = endSlot(e);
      if (s && s.classList.contains('open') && !pvUserScroll && !IN93.on) glideToSlot(s, isLast);
    }, REDUCED ? 60 : 900);
    return r;
  };
}

// ---------- barre du haut : un toucher qui fait revenir la barre ne doit pas tomber sur un autre bouton ----------
{
  let pd = null;
  document.addEventListener('pointerdown', (ev) => {
    const bar = ev.target && ev.target.closest ? ev.target.closest('#reader .rbar') : null;
    pd = bar ? { b: ev.target.closest('button'), t: performance.now() } : null;
  }, true);
  document.addEventListener('click', (ev) => {
    const p = pd; pd = null;
    if (!p || performance.now() - p.t > 900 || !ev.isTrusted) return;
    const b = ev.target && ev.target.closest ? ev.target.closest('#reader .rbar button') : null;
    if (!b || b === p.b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (p.b && p.b.isConnected && p.b.offsetParent !== null) p.b.click();
  }, true);
}
window.__v93 = {
  introOf: introOf93, introDue: introDue93, play: playIntro93, get on() { return IN93.on; }, key: key93,
  get k() { return k; }, get playing() { return playing; }, get inter() { return inter; }, get read() { return S.read; },
  seek: (j) => seek(j), go: () => play(), EPS, EPI, endSlot,
  forget: (e) => { if (S.ouv) { delete S.ouv[key93(e)]; persist(); } }
};

/* ================= Versions 96 à 98 (téléphone : l'image du lieu en haut, la barre incrustée dedans) =================
   v96 (essai) : l'image du lieu tout en haut. v97 : juste sous les points, Curiosités et marque-page dans l'image.
   v98 (Guillaume, 5 nov.) : toute la barre du haut passe dans l'image, en haut : le retour (‹ Bel-Ami), 2/11,
   Immersif / Texte, Curiosités, Aa et le marque-page. Le texte remonte juste sous l'image (marge minimale),
   pour garder le plus de place à la lecture. Pendant la lecture, les mêmes icônes s'effacent qu'avant
   (seuls Curiosités et le marque-page restent), et elles reviennent à la pause : ce sont les mêmes règles,
   car c'est la même barre, simplement posée sur l'image.
   Ordre sur téléphone : les points, l'image (la barre incrustée en haut, le nom du lieu en bas), le texte, les commandes.
   Sans image (chapitre II et suivants, Pot-Bouille, « Ambiance selon le lieu » coupé) : la barre reprend sa place, sous les points.
   Tablette et ordinateur : rien ne change (colonne à gauche, barre au-dessus du texte).
   Pour revenir en arrière : TOP96 = false. */
const TOP96 = true;
{
  const st96 = document.createElement('style');
  st96.textContent = `
.reader:not(.lxf88) > .lxbar84.top96 { margin: 0; }
/* la barre posée sur l'image */
.lxbar84 > .rbar { position: absolute; top: 0; left: 0; right: 0; z-index: 3; min-height: 0; padding: 7px 8px 0; margin: 0; }
.lxbar84.bar98::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 64px; z-index: 2; pointer-events: none;
  background: linear-gradient(to bottom, rgba(8,6,10,.55), rgba(8,6,10,0)); transition: opacity .5s ease; }
.reader[data-zen="1"] .lxbar84.bar98::before { opacity: .45; }
.lxbar84 > .rbar > button, .lxbar84 > .rbar .mode-b {
  height: 36px !important; min-height: 36px !important; min-width: 36px; border-radius: 999px !important; color: #f7f0e5 !important;
  background: rgba(14,11,9,.46) !important; border: 1px solid rgba(255,244,228,.24) !important; box-shadow: 0 6px 14px -8px rgba(0,0,0,.7) !important;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); -webkit-tap-highlight-color: transparent; }
.reader .lxbar84 > .rbar > #toCover.back44 { width: 36px; min-width: 36px; height: 36px; min-height: 36px; }
.lxbar84 > .rbar > .aa { width: 36px; padding: 0; font-size: 17px; }
.lxbar84 > .rbar > .bmb { width: 36px; padding: 0; }
.lxbar84 > .rbar > .bmb.on { color: #f5c96a !important; }
.reader .lxbar84 > .rbar > .carnet-b { padding: 0 6px 0 3px; gap: 3px; }
.lxbar84 > .rbar .mode-b { height: 30px !important; min-height: 30px !important; padding: 0 10px 0 12px; }
.lxbar84 > .rbar .eptitle, .lxbar84 > .rbar .eptitle .num { color: rgba(247,240,229,.92) !important; text-shadow: 0 1px 6px rgba(0,0,0,.7); }
.lxbar84 > .rbar svg { color: inherit; }
`;
  document.head.append(st96);
}
const RBAR98 = $('.rbar', byId('reader'));
const HOME98 = document.createComment('place de la barre (v98)');
if (RBAR98) RBAR98.before(HOME98);
{
  const b = BAR84.el, dots = byId('stories');
  if (TOP96 && b && dots) { b.classList.add('top96'); dots.after(b); }
}
function place96() {
  const rd = byId('reader'), b = BAR84.el;
  if (!RBAR98 || !b) return;
  const inImg = !!(TOP96 && BAR84.on && !b.hidden && !rd.classList.contains('lxf88'));
  if (inImg) { if (RBAR98.parentElement !== b) b.append(RBAR98); }
  else if (RBAR98.parentElement === b) HOME98.after(RBAR98);
  b.classList.toggle('bar98', inImg);
  // l'image porte maintenant des boutons : un groupe nommé par la description du lieu, et non plus une image muette
  b.setAttribute('role', inImg ? 'group' : 'img');
  rd.classList.toggle('bar98', inImg);
}
{
  const p88 = place88;
  place88 = function () { const r = p88.apply(this, arguments); place96(); return r; };
}
place96();

/* ================= Version 99 (images des lieux sans titre) =================
   Guillaume (5 nov.) : enlever les titres écrits sur les images des lieux (« Les grands cafés du boulevard »,
   « La place de l'Opéra »…), pour une image épurée. Sur téléphone comme dans la colonne (tablette, ordinateur).
   Le nom reste pour les lecteurs d'écran (description de l'image). */
{
  const st99 = document.createElement('style');
  st99.textContent = `.lxbar84 .lxn88 { display: none !important; }`;
  document.head.append(st99);
}


/* ================= Version 101 (les images des objets d'époque et des « À savoir ») =================
   Guillaume (5 nov.) a envoyé les images : chaque objet et certains « À savoir » ont maintenant une image
   (tableau, photo d'époque, ou illustration créée par IA), avec sa source dessous. Champs du livre : x.img, x.imgSrc. */
{
  const st101 = document.createElement('style');
  st101.textContent = `
.im101 { margin: 0 0 14px; }
.im101 img { display: block; width: auto; max-width: 100%; max-height: min(34vh, 260px); margin: 0 auto; border-radius: 12px;
  object-fit: contain; box-shadow: 0 10px 26px -16px rgba(20,12,8,.65); background: var(--surface); }
.im101 figcaption { margin: 7px auto 0; max-width: 34em; text-align: center; font: italic 400 12px/1.4 var(--f-ui, system-ui);
  color: var(--ink); opacity: .66; text-wrap: pretty; }
.ob-vitrine.im101v .ob-art { display: none; }
.ob-vitrine.im101v { justify-content: center; }
.ob-art.sm.ob-ph101 { padding: 0; overflow: hidden; aspect-ratio: 1; }
.ob-art.sm.ob-ph101 img { display: block; width: 100%; height: 100%; object-fit: cover; }
`;
  document.head.append(st101);

  const fig101 = (x, alt) => {
    const f = el('figure', 'im101');
    const im = new Image(); im.decoding = 'async'; im.src = x.img; im.alt = alt || '';
    f.append(im);
    if (x.imgSrc) f.append(el('figcaption', '', x.imgSrc));
    return f;
  };

  // la carte de l'objet : l'image remplace le dessin, la date reste
  const ob101 = GAME_BUILD.objet;
  GAME_BUILD.objet = function (body, g) {
    ob101(body, g);
    const x = g && g.x;
    if (!x || !x.img) return;
    const v = $('.ob-vitrine', body);
    const f = fig101(x, x.nom);
    if (v) { v.classList.add('im101v'); v.before(f); } else body.prepend(f);
  };

  // la carte « À savoir » : l'image au-dessus du texte
  const sv101 = GAME_BUILD.savoir;
  GAME_BUILD.savoir = function (body, g) {
    if (g && g.x && g.x.img) body.append(fig101(g.x, g.x.nom));
    sv101(body, g);
  };

  // la salle des objets du musée : la vignette devient l'image, une fois l'objet découvert
  const oa101 = objArt;
  objArt = function (x, cls) {
    if (x && x.img && cls === 'sm') {
      const g = OBJ_G().find((o) => o.x === x);
      if (g && isDone(g)) {
        const s = el('span', 'ob-art sm ob-ph101');
        const im = new Image(); im.decoding = 'async'; im.src = x.img; im.alt = '';
        s.append(im);
        return s;
      }
    }
    return oa101(x, cls);
  };
  // crochets de test
  window.__v101 = {
    fig: fig101, get BOOK() { return BOOK; }, get GAMES() { return GAMES; }, get TABS() { return TABS; }, get EPS() { return EPS; },
    get DEC() { return DEC84; }, dec: (e) => decAt84(e), get BAR() { return BAR84; }, get GALLERY() { return GALLERY; },
    open: (g) => openGame(g), close: () => { closeGame(false); closeSheets(); }, reader: (a) => showReader(a)
  };
}


/* ================= Version 102 (fluidité) =================
   1. Les décors sans effet animé (la plupart) : l'image est dessinée une seule fois ; sa lente respiration (zoom et
      glissement à peine visibles) passe au compositeur, en CSS. Avant, toute l'image était redessinée 30 fois par seconde.
   2. L'écran de démarrage s'efface dès que l'accueil est prêt. */
{
  const st102 = document.createElement('style');
  st102.textContent = `
html.br102 canvas.st102 { will-change: transform; animation: br102 26s ease-in-out infinite alternate; }
@keyframes br102 { from { transform: scale(1.02) translate3d(-0.7%, 0, 0); } to { transform: scale(1.04) translate3d(0.7%, 0, 0); } }
@media (prefers-reduced-motion: reduce) { html.br102 canvas.st102 { animation: none; } }
`;
  document.head.append(st102);

  const sc102 = scene84;
  scene84 = function (cv, d, sy) {
    const sc = sc102(cv, d, sy);
    if (!(d && Array.isArray(d.fx) && d.fx.length)) {
      const draw0 = sc.draw;
      let ok = false;
      sc.still = true;
      sc.draw = function () { if (!ok || sc.resized) ok = draw0(null); return ok; };
      cv.classList.add('st102');
    }
    return sc;
  };
  let br102 = null;
  const breathe102 = (on) => { if (on !== br102) { br102 = on; document.documentElement.classList.toggle('br102', on); } };
  tick84 = function (now) {
    raf84 = 0;
    if (!LIVE84.size) { breathe102(false); return; }
    const live = anim84();
    let moving = false;
    LIVE84.forEach((sc) => { if (!sc.still) moving = true; });
    breathe102(live);
    if (!live || !moving) {
      LIVE84.forEach((sc) => { if (sc.dirty) { if (sc.draw(null)) sc.dirty = false; } });
      return;
    }
    if (now - last84 >= 31) { last84 = now; const t = now / 1000; LIVE84.forEach((sc) => { sc.draw(t); sc.dirty = false; }); }
    raf84 = requestAnimationFrame(tick84);
  };

  // l'écran de démarrage : il s'efface après la première image de l'accueil
  const sp = document.getElementById('splash102');
  if (sp) requestAnimationFrame(() => { sp.classList.add('fin'); setTimeout(() => sp.remove(), 320); });
  try { performance.mark('enfinlu-pret'); } catch (e) { /* ignoré */ }

  // crochets de test
  window.__v102 = { get pvV() { return pvV102; }, get still() { return [...LIVE84].map((s) => !!s.still); }, sentOf: (p, f) => sentOf102(normTxt(p), f), NS: () => nsents102(), norm: normTxt, get CULTES() { return CULTES; } };
}

/* ================= Démarrage ================= */
applyTheme();
syncSettings();
buildStories();
refreshHome();
setView('accueil');
if (S.next === 'cover') { delete S.next; persist(); showCover(); }
document.documentElement.dataset.ready = '1';
setPlayIcon();
updateHint();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!byId('reader').hidden) render(k); });
window.__lecture = {
  T, V, N, EPS, EPI, UNITS, SCENES, SENT, BOOKS, LEVELS, CH, CHOF, SEGS, BLOCKS, isFunc, S, split, levelOf, showHome, showCover,
  spanMs, get k() { return k; }, get playing() { return playing; }, seek, render, setMode, setRead, startEpisode, finishEpisode, sentenceText,
  fast(ms) { speedHack = ms || 0; }, chooseRx, openRx, closeRx, applyMarks, CHAPS, chapterCheer, milestone, hideMeet, openBet, captureCulte, captureJuron, emoBurst, GAMES, openGame, closeGame, CARTES, get gameOpen() { return gameOpen; }, toggleVoice, toggleMark, openCarnet, cnGo, get voiceOn() { return voiceOn(); }, VOICE_MAX, beat, get chestOn() { return !!chestC; }, CULTES, EMOS, JURONS, get juronOn() { return !!juronC; }, loveAt, baseMs, sentenceAt, openRoulette, closeRoulette, motsOf, get roulOpen() { return roulOpen; }, get chestOn() { return !!chestC; }, get noteOn() { return noteOn; },  QUIZ, openQuiz, closeQuiz, chapReadPct, get qz() { return qz; },  BETS, answerBet, betSkip, get betOpen() { return betOpen; }, skipHold, get holdLeft() { return Math.max(0, holdEnd - performance.now()); }, flowMs(ms) { FLOW_MS = ms; }, openDict, closeDict, dictLookup, get dictOpen() { return !!dictW; }, get lumKey() { return lumKey; }, continueNow, get inter() { return inter; }, toggleLove, CULTES, get met() { return S.met; }, get runState() { return runBar.dataset.state; }, setAmb, get ambKind() { return ambKind; }, openShare, get shareText() { return shareText; }, cheerFor, fasterThan, chapterEndsAt, placeCursor, get pvKey() { return pvKey; }, get hlSeg() { return hlCur.length; }, get sweeping() { return !!(sw && sw.t0); }, BOOK, LIB, bookState, refreshHome, setView, persist
};
};
