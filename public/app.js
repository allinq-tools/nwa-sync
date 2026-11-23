'use strict';
/* TLC – frontend (vanilla JS, hash-routing) */

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n || 0).toLocaleString('nl-NL');
const fmtDate = (ms, withTime) => new Date(ms).toLocaleDateString('nl-NL', withTime
  ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const toLocalInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const fromLocalInput = (s) => new Date(s).getTime();
function timeLeft(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return 'verlopen';
  const d = Math.floor(diff / 864e5), h = Math.floor((diff % 864e5) / 36e5), m = Math.floor((diff % 36e5) / 6e4);
  return d ? `${d}d ${h}u` : h ? `${h}u ${m}m` : `${m}m`;
}
function md(src) {
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  let out = '', list = false;
  for (const line of esc(src).split('\n')) {
    if (/^\s*[-*] /.test(line)) {
      if (!list) { out += '<ul>'; list = true; }
      out += `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`;
    } else {
      if (list) { out += '</ul>'; list = false; }
      if (line.trim()) out += `<p>${inline(line)}</p>`;
    }
  }
  return out + (list ? '</ul>' : '');
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') {
    state.me = null;
    location.hash = '#/login';
    throw new Error('Niet ingelogd');
  }
  if (!r.ok) throw new Error(data.error || 'Er ging iets mis');
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

const state = { me: null, selected: null, guard: null, lb: { scope: 'org', sort: 'season', expanded: false } };
const app = $('#app');
const actions = {};      // klik-acties: data-act
const changes = {};      // change-acties: data-change

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
});

// ---------- Layout ----------
const LEVEL_NAMES = ['Trainee', 'Engineer', 'Senior Engineer', 'Netwerkarchitect', 'NOC Legend'];
function shell(active, content) {
  const me = state.me;
  const isAdmin = me?.user.role === 'admin';
  const item = (key, href, ic, label) => `<a class="nav-item ${active === key ? 'active' : ''}" href="${href}" aria-label="${label}">${icon(ic, 22)}<span class="tip">${label}</span></a>`;
  return `<div class="shell">
    <nav class="sidebar">
      <a class="brand" href="#/" aria-label="TLC"><img src="/favicon.svg" width="40" height="40" alt=""></a>
      ${item('challenges', '#/', 'target', 'Uitdagingen')}
      ${item('leaderboard', '#/leaderboard', 'crown', 'Leaderboard')}
      ${item('achievements', '#/beloningen', 'trophy', 'Beloningen')}
      ${isAdmin ? item('admin', '#/beheer', 'tools', 'Beheer & challenge-builder') : ''}
      <div class="nav-spacer"></div>
      <div class="nav-sep"></div>
      <button class="nav-item" data-act="password" aria-label="Wachtwoord wijzigen">${icon('key', 20)}<span class="tip">Wachtwoord wijzigen</span></button>
      <button class="nav-item" data-act="logout" aria-label="Uitloggen">${icon('logout', 20)}<span class="tip">Uitloggen</span></button>
      <div class="avatar lvl-${me?.level?.level || 1}" title="${esc(me?.user.display_name)}">${esc(initials(me?.user.display_name))}</div>
    </nav>
    <main class="main"><div class="page">${content}</div></main>
  </div>`;
}

actions.logout = async () => {
  await api('POST', '/api/logout');
  state.me = null;
  location.hash = '#/login';
};

actions.password = () => {
  modal(`<h3>Wachtwoord wijzigen</h3>
    <label class="field"><span>Huidig wachtwoord</span><input class="input" type="password" id="pwCur" autocomplete="current-password"></label>
    <label class="field"><span>Nieuw wachtwoord (min. 6 tekens)</span><input class="input" type="password" id="pwNew" autocomplete="new-password"></label>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Annuleren</button><button class="btn" data-act="savePassword">Opslaan</button></div>`);
};
actions.savePassword = async () => {
  try {
    await api('POST', '/api/me/password', { current: $('#pwCur').value, next: $('#pwNew').value });
    closeModal(); toast('Wachtwoord gewijzigd');
  } catch (e) { toast(e.message, true); }
};

function modal(html) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal-back';
  el.id = 'modal';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  el.addEventListener('mousedown', (e) => { if (e.target === el) closeModal(); });
  document.body.appendChild(el);
  el.querySelector('input,select,textarea,button')?.focus();
}
function closeModal() { $('#modal')?.remove(); }
actions.closeModal = closeModal;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- Router ----------
let lastHash = location.hash;
async function router() {
  const hash = location.hash || '#/';
  if (state.guard && hash !== state.guard.hash) {
    if (!confirm(state.guard.msg)) { history.replaceState(null, '', state.guard.hash); return; }
    state.guard = null;
  }
  lastHash = hash;
  const parts = hash.slice(1).split('/').filter(Boolean);
  if (parts[0] === 'login') return renderLogin();
  if (!state.me) {
    try { state.me = await api('GET', '/api/me'); } catch { return renderLogin(); }
  }
  closeModal();
  window.scrollTo(0, 0);
  try {
    switch (parts[0]) {
      case undefined: return await viewChallenges();
      case 'play': return await viewPlay(parts[1]);
      case 'leaderboard': return await viewLeaderboard();
      case 'beloningen': return await viewAchievements();
      case 'beheer':
        if (state.me.user.role !== 'admin') return (location.hash = '#/');
        if (parts[1] === 'uitdaging') return await viewEditor(parts[2]);
        if (parts[1] === 'resultaten') return await viewResults(parts[2]);
        if (parts[1] === 'gebruikers') return await viewUsers();
        return await viewAdmin();
      default: location.hash = '#/';
    }
  } catch (e) {
    if (e.message !== 'Niet ingelogd') app.innerHTML = shell('', `<div class="error-box">${esc(e.message)}</div>`);
  }
}
window.addEventListener('hashchange', router);
window.addEventListener('beforeunload', (e) => { if (state.guard) { e.preventDefault(); e.returnValue = ''; } });

async function refreshMe() {
  try { state.me = await api('GET', '/api/me'); } catch { /* genegeerd */ }
}

// ---------- Login ----------
function renderLogin() {
  app.innerHTML = `<div class="login">
    <section class="login-art">
      <div class="logo"><img src="/favicon.svg" width="40" height="40" alt=""> TLC</div>
      <div>
        <h1>Houd je netwerkkennis <em>in de lucht</em>.</h1>
        <p>Wekelijkse uitdagingen over routing, switching, transport, mobiele netwerken en NOC-beheer. Verdien XP, bouw je streak op en klim op het leaderboard.</p>
      </div>
      <svg class="waves" viewBox="0 0 200 200" fill="none" stroke="#ffb703" stroke-width="2"><circle cx="100" cy="100" r="20"/><circle cx="100" cy="100" r="45" stroke-dasharray="4 8"/><circle cx="100" cy="100" r="70" stroke="#3a86ff" stroke-dasharray="2 10"/><circle cx="100" cy="100" r="95" stroke-dasharray="6 12"/></svg>
    </section>
    <section class="login-form">
      <form id="loginForm">
        <h2>Inloggen</h2>
        <label class="field"><span>Gebruikersnaam</span><input class="input" name="username" autocomplete="username" required></label>
        <label class="field"><span>Wachtwoord</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
        <div id="loginErr" class="error-box hidden"></div>
        <button class="btn amber lg" type="submit">Inloggen ${icon('arrowRight', 18)}</button>
        <div class="demo-hint"><b>Demo-accounts</b><br>Deelnemer: <code>demo</code> / <code>demo123</code><br>Beheerder: <code>admin</code> / <code>admin123</code></div>
      </form>
    </section>
  </div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('POST', '/api/login', { username: f.get('username'), password: f.get('password') });
      state.me = await api('GET', '/api/me');
      location.hash = '#/';
      if (lastHash === '#/' || !lastHash) router();
    } catch (err) {
      const box = $('#loginErr');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
}

// ---------- Uitdagingen (dashboard) ----------
async function viewChallenges() {
  const d = await api('GET', '/api/dashboard');
  state.dash = d;
  const sl = d.storyline;
  const playable = sl.filter((c) => c.state !== 'locked');
  if (!playable.some((c) => c.id === state.selected)) state.selected = (sl.find((c) => c.state === 'open') || playable[0])?.id ?? null;
  const me = d.me;
  const lvl = me.level;
  const pct = lvl.next ? Math.round(((me.xp - lvl.min) / (lvl.next.min - lvl.min)) * 100) : 100;
  const streakStart = Math.max(0, me.streak - 9);
  const flames = Array.from({ length: 10 }, (_, i) => {
    const n = streakStart + i + 1;
    return `<div class="flame ${n <= me.streak ? 'on' : ''}" title="Week ${n}">${icon('flame', 36)}<span>${n}</span></div>`;
  }).join('');

  app.innerHTML = shell('challenges', `
    <div class="page-head"><h1>Uitdagingen</h1></div>
    <div class="top-cards">
      <section class="panel profile">
        <div class="profile-head">
          <div class="level-medal" style="--pct:${pct}%"><span>${lvl.level}</span></div>
          <div>
            <div class="profile-name">${esc(me.name)}</div>
            <div class="muted"><b>${me.rank ? '#' + me.rank : '–'}</b> · ${esc(lvl.name)}</div>
          </div>
        </div>
        <div class="profile-meta">
          <div class="stat">${icon('star', 26)}<div><b>${fmt(me.xp)} XP</b><small>Totaal XP</small></div></div>
          <div class="stat">${icon('bolt', 26)}<div><b>${fmt(me.seasonXp)} XP</b><small>${esc(d.season?.name || 'Seizoen')}</small></div></div>
          <div class="stat">${icon('heart', 26)}<div><b>${me.reputation}%</b><small>Reputatie (1e poging goed)</small></div></div>
        </div>
        <div>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="small muted" style="margin-top:6px">${lvl.next ? `Nog <b>${fmt(lvl.next.min - me.xp)} XP</b> tot level ${lvl.next.level} – ${esc(lvl.next.name)}` : 'Hoogste level bereikt!'}</div>
        </div>
      </section>
      <section class="panel streak">
        <div>
          <h3>${me.streak ? 'Je bent goed bezig. Ga zo door!' : 'Start vandaag je streak!'}</h3>
          <p>Rond elke wekelijkse uitdaging vóór de deadline af om je streak te behouden en te verlengen.</p>
          <div class="flames">${flames}</div>
        </div>
        <div class="streak-big"><b>${me.streak}</b><small>${me.streak === 1 ? 'week' : 'weken'} streak</small></div>
      </section>
    </div>

    <div class="story-head">
      <h2>Jouw verhaallijn</h2>
      <div class="story-nav">
        <button class="icon-btn" data-act="scrollStory" data-dir="-1" aria-label="Vorige">${icon('chevronLeft', 18)}</button>
        <span>Blader door de uitdagingen</span>
        <button class="icon-btn" data-act="scrollStory" data-dir="1" aria-label="Volgende">${icon('chevronRight', 18)}</button>
      </div>
    </div>
    <div class="storyline" id="storyline"><div class="story-track">${sl.map(storyNode).join('')}</div></div>
    <details class="scoring">
      <summary>${icon('info', 18)} Hoe de puntentelling werkt ${icon('chevronDown', 18)}</summary>
      <div class="content"><ul>
        <li>Elke goed beantwoorde vraag levert XP op (meestal 100, bonusuitdagingen meer).</li>
        <li>Rond je een uitdaging vóór de deadline af, dan krijg je <b>+${Math.round(d.onTimeBonus * 100)}% bonus-XP</b> en groeit je streak.</li>
        <li>Je mag uitdagingen herstarten; alleen je <b>beste poging</b> telt mee voor je XP.</li>
        <li>Je <b>reputatie</b> is het percentage vragen dat je bij je eerste poging goed had.</li>
        <li>Levels: ${d.levels.map((l) => `${l.level}. ${esc(l.name)} (${fmt(l.min)} XP)`).join(' · ')}</li>
      </ul></div>
    </details>
    <div id="cards"></div>
  `);
  renderCards();
  const node = $('.node.selected');
  if (node) node.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function storyNode(c) {
  if (c.state === 'locked') {
    return `<button class="node state-locked" title="Beschikbaar vanaf ${fmtDate(c.publish_at, true)}" aria-label="Vergrendeld">${icon('lock', 26)}</button>`;
  }
  const badge = c.state === 'done' ? `<span class="badge">${icon('check', 14)}</span>`
    : c.state === 'late' ? `<span class="badge late" title="Te laat voltooid">${icon('check', 14)}</span>`
    : c.state === 'missed' ? `<span class="badge cal" title="Deadline gemist">${icon('calendar', 13)}</span>` : '';
  return `<button class="node state-${c.state} ${c.id === state.selected ? 'selected' : ''}" data-act="selectChallenge" data-id="${c.id}" aria-label="Uitdaging ${c.number}">${c.number}${badge}</button>`;
}

actions.selectChallenge = (el) => {
  state.selected = Number(el.dataset.id);
  document.querySelectorAll('.node').forEach((n) => n.classList.toggle('selected', n.dataset.id === el.dataset.id));
  renderCards();
};
actions.scrollStory = (el) => $('#storyline').scrollBy({ left: Number(el.dataset.dir) * 420, behavior: 'smooth' });

function challengeCard(c, bonus) {
  const label = bonus ? 'Bonusuitdaging' : 'Jouw uitdaging';
  const maxXp = Math.round(c.questions * c.xp_per_question * (c.due_at > Date.now() ? 1 + state.dash.onTimeBonus : 1));
  const status = {
    open: `<span class="pill warn">${icon('clock', 14)} Nog ${timeLeft(c.due_at)}</span>`,
    done: `<span class="pill ok">${icon('check', 14)} Voltooid · ${fmt(c.bestXp)} XP</span>`,
    late: `<span class="pill ok">${icon('check', 14)} Te laat voltooid · ${fmt(c.bestXp)} XP</span>`,
    missed: `<span class="pill">${icon('calendar', 14)} Deadline verlopen</span>`,
  }[c.state];
  const replay = c.state === 'done' || c.state === 'late';
  return `<article class="ccard ${bonus ? 'bonus' : ''}">
    <div class="tag">${label}</div>
    <div class="inner">
      <div style="display:flex;flex-direction:column">
        <div class="kicker">${bonus ? 'Bonusuitdaging' : 'Uitdaging'} ${c.number}${c.category ? ' · ' + esc(c.category) : ''}</div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.summary)}</p>
        <div class="meta">
          ${status}
          <span class="pill">${c.questions} vragen</span>
          <span class="pill">tot ${fmt(maxXp)} XP</span>
          <span class="pill" title="Moeilijkheid">${'●'.repeat(c.difficulty)}${'○'.repeat(3 - c.difficulty)}</span>
        </div>
        <div style="margin-top:auto"><a class="go" href="#/play/${c.id}">${replay ? 'Herstart' : 'Start'} ${icon('arrowRight', 22)}</a></div>
      </div>
      ${illustration(c.icon, replay)}
    </div>
  </article>`;
}

function renderCards() {
  const d = state.dash;
  const c = d.storyline.find((x) => x.id === state.selected);
  const box = $('#cards');
  if (!c) {
    box.innerHTML = '<div class="panel empty-state">Er zijn nog geen uitdagingen beschikbaar. Kom binnenkort terug!</div>';
    return;
  }
  const b = d.bonus[c.number];
  box.innerHTML = `<div class="challenge-cards">${challengeCard(c, false)}${b ? challengeCard(b, true)
    : `<article class="ccard empty"><div class="tag">Bonusuitdaging</div><div class="inner" style="grid-template-columns:1fr;place-items:center;text-align:center">
        <div>${icon('bolt', 40)}<h3 style="margin:12px 0 6px;font-size:22px">Geen bonus deze week</h3><p class="muted" style="color:inherit">Voor uitdaging ${c.number} is (nog) geen bonusuitdaging.</p></div></div></article>`}</div>`;
}

// ---------- Uitdaging spelen ----------
const TYPE_KIND = {
  info: 'Uitleg', single: 'Meerkeuzevraag', multi: 'Meerdere antwoorden mogelijk', truefalse: 'Waar of onwaar?',
  text: 'Open vraag', order: 'Zet in de juiste volgorde', match: 'Koppel de juiste paren',
};

async function viewPlay(id) {
  const data = await api('POST', `/api/challenges/${id}/attempts`);
  state.play = { ...data, idx: 0, results: {}, xp: 0, answer: null, feedback: null, busy: false };
  state.guard = { hash: location.hash, msg: 'Weet je zeker dat je de uitdaging wilt verlaten? Je voortgang in deze poging gaat verloren.' };
  initAnswer();
  renderPlay();
}

function initAnswer() {
  const p = state.play;
  const s = p.steps[p.idx];
  p.feedback = null;
  if (!s) return;
  p.answer = s.type === 'multi' ? [] : s.type === 'order' ? [...s.items] : s.type === 'match' ? s.lefts.map(() => '') : s.type === 'text' ? '' : null;
}

function answerReady() {
  const { steps, idx, answer } = state.play;
  const s = steps[idx];
  switch (s.type) {
    case 'single': case 'truefalse': return answer !== null;
    case 'multi': return answer.length > 0;
    case 'text': return answer.trim().length > 0;
    case 'match': return answer.every((v) => v !== '');
    default: return true;
  }
}

function renderPlay() {
  const p = state.play;
  const s = p.steps[p.idx];
  const dots = p.steps.map((st, i) => {
    const r = p.results[st.id];
    const cls = i === p.idx ? 'current' : r === true ? (st.type === 'info' ? 'seen' : 'ok') : r === false ? 'bad' : '';
    const ic = r === true && st.type !== 'info' && i !== p.idx ? icon('check', 14) : r === false && i !== p.idx ? icon('x', 14) : '';
    return `${i ? '<span class="dot-line"></span>' : ''}<span class="dot ${cls}" title="Stap ${i + 1}">${ic}</span>`;
  }).join('');
  app.innerHTML = `<div class="player">
    <div class="player-top">
      <div><button class="leave" data-act="leavePlay">${icon('arrowLeft', 18)} Uitdaging verlaten</button></div>
      <div class="dots">${dots}</div>
      <div class="xp-counter">${icon('star', 18)} ${fmt(p.xp)} XP</div>
    </div>
    <div class="stage"><div class="stage-inner">${s ? renderStep(s) : '<div class="muted">Bezig met afronden…</div>'}</div></div>
  </div>`;
  const ti = $('#textAnswer');
  if (ti && !p.feedback) ti.focus();
}

function renderStep(s) {
  const p = state.play;
  const fb = p.feedback;
  const locked = !!fb;
  let ui = '';
  if (s.type === 'info') {
    ui = illustration(p.challenge.icon);
  } else if (s.type === 'single' || s.type === 'multi') {
    const multi = s.type === 'multi';
    ui = `<div class="answers">${s.options.map((o, i) => {
      const sel = multi ? p.answer.includes(i) : p.answer === i;
      let cls = sel ? 'selected' : '';
      if (fb) {
        const good = multi ? fb.correctIndexes.includes(i) : fb.correctIndex === i;
        cls = good ? 'correct' : sel ? 'wrong' : '';
      }
      return `<button class="opt ${multi ? 'square' : ''} ${cls}" data-act="${multi ? 'toggleOpt' : 'pickOpt'}" data-i="${i}" ${locked ? 'disabled' : ''}>
        <span class="mark">${multi ? (sel || cls === 'correct' ? icon('check', 14) : '') : String.fromCharCode(65 + i)}</span>${esc(o)}</button>`;
    }).join('')}</div>`;
  } else if (s.type === 'truefalse') {
    ui = `<div class="answers two">${[true, false].map((v) => {
      let cls = p.answer === v ? 'selected' : '';
      if (fb) cls = (fb.solution === 'Waar') === v ? 'correct' : p.answer === v ? 'wrong' : '';
      return `<button class="opt tf ${cls}" data-act="pickTf" data-v="${v}" ${locked ? 'disabled' : ''}>${v ? 'Waar' : 'Onwaar'}</button>`;
    }).join('')}</div>`;
  } else if (s.type === 'text') {
    const cls = fb ? (fb.correct ? 'style="border-color:var(--ok)"' : 'style="border-color:var(--bad)"') : '';
    ui = `<input id="textAnswer" class="input text-answer" ${cls} placeholder="Typ je antwoord…" value="${esc(p.answer)}" ${locked ? 'disabled' : ''} autocomplete="off">`;
  } else if (s.type === 'order') {
    ui = `<ol class="order-list">${p.answer.map((it, i) => {
      const cls = fb ? (it.i === i ? 'correct' : 'wrong') : '';
      return `<li class="order-item ${cls}"><span class="n">${i + 1}</span><span class="t">${esc(it.text)}</span>
        ${locked ? '' : `<button class="icon-btn" data-act="moveItem" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Omhoog">${icon('arrowUp', 16)}</button>
        <button class="icon-btn" data-act="moveItem" data-i="${i}" data-d="1" ${i === p.answer.length - 1 ? 'disabled' : ''} aria-label="Omlaag">${icon('arrowDown', 16)}</button>`}</li>`;
    }).join('')}</ol>`;
  } else if (s.type === 'match') {
    ui = `<div class="answers">${s.lefts.map((l, i) => {
      const cls = fb ? (Number(p.answer[i]) === i ? 'correct' : 'wrong') : '';
      return `<div class="match-row ${cls}"><b>${esc(l)}</b>${icon('arrowRight', 18)}
        <select class="input" data-change="matchSel" data-i="${i}" ${locked ? 'disabled' : ''}>
          <option value="">Kies…</option>
          ${s.rights.map((r) => `<option value="${r.i}" ${String(p.answer[i]) === String(r.i) ? 'selected' : ''}>${esc(r.text)}</option>`).join('')}
        </select></div>`;
    }).join('')}</div>`;
  }

  let feedback = '';
  if (fb) {
    const sol = Array.isArray(fb.solution)
      ? `<${s.type === 'order' ? 'ol' : 'ul'}>${fb.solution.map((x) => `<li>${esc(x)}</li>`).join('')}</${s.type === 'order' ? 'ol' : 'ul'}>`
      : `<p>Juiste antwoord: <b>${esc(fb.solution)}</b></p>`;
    feedback = `<div class="feedback ${fb.correct ? 'ok' : 'bad'}">
      <span class="fi">${icon(fb.correct ? 'check' : 'x', 18)}</span>
      <div><b>${fb.correct ? `Goed zo! +${fmt(fb.xp)} XP` : 'Helaas, dat is niet juist.'}</b>
        ${!fb.correct && !['single', 'multi', 'truefalse'].includes(s.type) ? sol : ''}
        ${fb.explanation ? `<div style="margin-top:6px">${md(fb.explanation)}</div>` : ''}
      </div></div>`;
  }

  const isLast = p.idx === p.steps.length - 1;
  const btn = s.type === 'info' || fb
    ? `<button class="btn lg" data-act="nextStep">${isLast ? 'Afronden' : 'Ga verder'} ${icon('arrowRight', 18)}</button>`
    : `<button class="btn lg" id="checkBtn" data-act="checkAnswer" ${answerReady() && !p.busy ? '' : 'disabled'}>Controleer</button>`;

  return `<div class="kind">${TYPE_KIND[s.type]}</div>
    <h2>${esc(s.title)}</h2>
    ${s.body ? `<div class="body">${md(s.body)}</div>` : ''}
    ${ui}
    ${s.type === 'text' && !fb ? '<div class="hint">Druk op Enter om te controleren.</div>' : ''}
    ${feedback}
    <div class="stage-actions">${btn}</div>`;
}

actions.pickOpt = (el) => { state.play.answer = Number(el.dataset.i); renderPlay(); };
actions.toggleOpt = (el) => {
  const p = state.play, i = Number(el.dataset.i);
  p.answer = p.answer.includes(i) ? p.answer.filter((x) => x !== i) : [...p.answer, i];
  renderPlay();
};
actions.pickTf = (el) => { state.play.answer = el.dataset.v === 'true'; renderPlay(); };
actions.moveItem = (el) => {
  const a = state.play.answer, i = Number(el.dataset.i), j = i + Number(el.dataset.d);
  [a[i], a[j]] = [a[j], a[i]];
  renderPlay();
};
changes.matchSel = (el) => {
  state.play.answer[Number(el.dataset.i)] = el.value;
  $('#checkBtn').disabled = !answerReady();
};
document.addEventListener('input', (e) => {
  if (e.target.id === 'textAnswer' && state.play) {
    state.play.answer = e.target.value;
    $('#checkBtn').disabled = !answerReady();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'textAnswer' && answerReady()) actions.checkAnswer();
});

actions.checkAnswer = async () => {
  const p = state.play;
  if (p.busy || p.feedback) return;
  const s = p.steps[p.idx];
  let response = p.answer;
  if (s.type === 'order') response = p.answer.map((it) => it.i);
  if (s.type === 'match') response = p.answer.map(Number);
  p.busy = true;
  try {
    const fb = await api('POST', `/api/attempts/${p.attemptId}/answer`, { stepId: s.id, response });
    p.feedback = fb;
    p.results[s.id] = fb.correct;
    p.xp += fb.xp || 0;
  } catch (e) { toast(e.message, true); }
  p.busy = false;
  renderPlay();
};

actions.nextStep = async () => {
  const p = state.play;
  const s = p.steps[p.idx];
  if (s.type === 'info') p.results[s.id] = true;
  if (p.idx < p.steps.length - 1) {
    p.idx++;
    initAnswer();
    renderPlay();
    window.scrollTo(0, 0);
    return;
  }
  try {
    const r = await api('POST', `/api/attempts/${p.attemptId}/complete`);
    state.guard = null;
    renderResult(r);
    refreshMe();
  } catch (e) { toast(e.message, true); }
};

actions.leavePlay = () => { location.hash = '#/'; };

function renderResult(r) {
  const p = state.play;
  const pct = r.questions ? Math.round((r.correct / r.questions) * 100) : 0;
  const msg = pct === 100 ? 'Foutloos! Zero packet loss.' : pct >= 70 ? 'Sterk gedaan!' : pct >= 40 ? 'Goed geprobeerd, er valt nog wat te leren.' : 'Dat was pittig. Probeer het gerust nog eens!';
  app.innerHTML = `<div class="player"><div class="stage" style="justify-content:center"><div class="stage-inner result">
    <div class="kind">${p.challenge.is_bonus ? 'Bonusuitdaging' : 'Uitdaging'} ${p.challenge.number} voltooid</div>
    <h2>${esc(msg)}</h2>
    <div class="big">+${fmt(r.xp)} XP</div>
    <div class="muted">${r.onTime ? `Inclusief ${fmt(r.bonusXp)} XP bonus omdat je op tijd was.` : 'De deadline is verstreken, dus geen tijdsbonus deze keer.'}</div>
    ${r.previousBest !== null ? `<div class="muted small" style="margin-top:6px">Je beste eerdere poging was ${fmt(r.previousBest)} XP. Alleen je beste poging telt mee${r.counted ? ` (+${fmt(r.counted)} XP erbij)` : ''}.</div>` : ''}
    <div class="result-stats">
      <div class="card"><b>${r.correct}/${r.questions}</b><span class="muted small">vragen goed</span></div>
      <div class="card"><b>${fmt(r.totalXp)}</b><span class="muted small">totaal XP</span></div>
      <div class="card"><b>${r.streak}</b><span class="muted small">weken streak</span></div>
    </div>
    ${r.levelUp ? `<div class="new-ach"><span class="ach-icon" style="width:52px;height:52px">${icon('badge', 26)}</span><div><b>Level omhoog!</b><br>Je bent nu level ${r.level.level}: ${esc(r.level.name)}</div></div>` : ''}
    ${r.newAchievements.map((a) => `<div class="new-ach"><span class="ach-icon" style="width:52px;height:52px">${icon(a.icon, 26)}</span><div><b>Nieuwe beloning: ${esc(a.title)}</b><br><span class="small">${esc(a.desc)}</span></div></div>`).join('')}
    <div class="stage-actions">
      <a class="btn ghost lg" href="#/play/${p.challenge.id}" data-act="replay">${icon('restart', 18)} Opnieuw spelen</a>
      <a class="btn lg" href="#/">Naar uitdagingen ${icon('arrowRight', 18)}</a>
    </div>
  </div></div></div>`;
}
actions.replay = () => { viewPlay(state.play.challenge.id); };

// ---------- Leaderboard ----------
async function viewLeaderboard() {
  const { scope, sort } = state.lb;
  const d = await api('GET', `/api/leaderboard?scope=${scope}&sort=${sort}`);
  const season = d.season;
  const tabs = [['org', 'Organisatie'], ['groups', 'Groepen vs. groepen'], ['mygroup', 'Mijn groep']]
    .map(([k, l]) => `<button class="tab ${scope === k ? 'active' : ''}" data-act="lbScope" data-v="${k}">${l}</button>`).join('');
  const sortBtn = (k, label) => `<button class="${sort === k ? 'active' : ''}" data-act="lbSort" data-v="${k}">${label} ${sort === k ? icon('chevronDown', 14) : ''}</button>`;

  let table;
  if (scope === 'groups') {
    const max = Math.max(1, ...d.groups.map((g) => (sort === 'total' ? g.avgXp : g.avgSeasonXp)));
    table = `<table><thead><tr><th>#</th><th>Groep</th><th class="num">Leden</th><th>Gem. ${sort === 'total' ? 'totaal' : 'seizoens'}-XP</th>
      <th class="num">${sortBtn('season', 'Gem. Season XP')}</th><th class="num">${sortBtn('total', 'Gem. totaal XP')}</th></tr></thead><tbody>
      ${d.groups.map((g, i) => `<tr class="${g.id === d.myGroupId ? 'me' : ''}"><td class="rank">${medal(i + 1)}</td><td>${esc(g.name)}</td><td class="num">${g.members}</td>
        <td><div class="bar"><i style="width:${Math.round(((sort === 'total' ? g.avgXp : g.avgSeasonXp) / max) * 100)}%"></i></div></td>
        <td class="num">${fmt(g.avgSeasonXp)}</td><td class="num">${fmt(g.avgXp)}</td></tr>`).join('')}
      </tbody></table>`;
  } else {
    const rows = d.rows;
    const meIdx = rows.findIndex((r) => r.id === d.meId);
    let visible = rows.map((r, i) => ({ r, i }));
    let gapAfter = -1;
    if (!state.lb.expanded && rows.length > 10) {
      const keep = new Set([0, 1, 2]);
      if (meIdx >= 0) for (let k = meIdx - 2; k <= meIdx + 2; k++) if (k >= 0 && k < rows.length) keep.add(k);
      visible = visible.filter(({ i }) => keep.has(i));
      if (visible.length > 3 && visible[3].i > 3) gapAfter = 2;
    }
    table = `<table><thead><tr><th>#</th><th>Naam</th><th>Groep</th><th class="num">Level</th><th class="num">${sortBtn('streak', 'Streak')}</th>
      <th class="num">${sortBtn('season', 'Season XP')}</th><th class="num">${sortBtn('total', 'Totaal XP')}</th></tr></thead><tbody>
      ${visible.map(({ r }, k) => `<tr class="${r.id === d.meId ? 'me' : ''}">
        <td class="rank">${medal(r.rank)}</td>
        <td><div class="who"><span class="avatar lvl-${r.level}">${esc(initials(r.name))}</span>${esc(r.name)}${r.id === d.meId ? ' <span class="pill warn">jij</span>' : ''}</div></td>
        <td class="muted">${esc(r.group)}</td><td class="num">${r.level}</td><td class="num">${r.streak ? `${icon('flame', 14)} ${r.streak}` : '–'}</td>
        <td class="num"><b>${fmt(r.seasonXp)}</b></td><td class="num">${fmt(r.xp)}</td></tr>
        ${k === gapAfter ? `<tr class="more-row"><td colspan="7"><button data-act="lbExpand">+ Toon alle ${rows.length} deelnemers</button></td></tr>` : ''}`).join('')}
      ${!rows.length ? '<tr><td colspan="7" class="muted" style="text-align:center">Nog geen deelnemers.</td></tr>' : ''}
      </tbody></table>`;
  }

  const s = d.summary;
  app.innerHTML = shell('leaderboard', `
    <div class="page-head"><h1>Leaderboard</h1>
      ${season ? `<div class="muted">${icon('clock', 18)} ${esc(season.name)} eindigt over <b style="color:var(--text)">${timeLeft(season.ends_at)}</b></div>` : ''}</div>
    ${s ? `<div class="lb-summary">
      <div class="card lb-me">
        <div><small>Binnen je organisatie</small><b>${s.rank ? '#' + s.rank : '–'}</b><small>van ${s.of}</small></div>
        <div><small>Beter dan</small><b>${s.betterThan}%</b><small>van je collega's</small></div>
        <div><small>Jouw groep: ${esc(s.group || '—')}</small><b>${s.groupRank ? '#' + s.groupRank : '–'}</b><small>binnen je groep</small></div>
      </div>
      <div class="season-banner"><div><div class="small" style="color:#b9c7de">Huidig seizoen</div><div style="font:600 22px var(--font-head)">${esc(season?.name || '—')}</div></div>
        <div class="small" style="color:#b9c7de">${season ? `${fmtDate(season.starts_at)} – ${fmtDate(season.ends_at)}<br>Nog <b>${timeLeft(season.ends_at)}</b> om punten te scoren` : ''}</div></div>
    </div>` : ''}
    <div class="tabs">${tabs}</div>
    <div class="table-wrap">${table}</div>
  `);
}
function medal(n) { return n <= 3 ? `<span class="medal m${n}">${n}</span>` : n; }
actions.lbScope = (el) => { state.lb.scope = el.dataset.v; state.lb.expanded = false; viewLeaderboard(); };
actions.lbSort = (el) => { state.lb.sort = el.dataset.v; viewLeaderboard(); };
actions.lbExpand = () => { state.lb.expanded = true; viewLeaderboard(); };

// ---------- Beloningen ----------
async function viewAchievements() {
  const list = await api('GET', '/api/achievements');
  const got = list.filter((a) => a.unlocked_at).length;
  app.innerHTML = shell('achievements', `
    <div class="page-head"><div><h1>Beloningen</h1><p class="muted">Hier zie je welke beloningen je al hebt verdiend en welke je nog kunt vrijspelen. (${got}/${list.length})</p></div></div>
    <div class="ach-grid">${list.map((a) => `<div class="ach ${a.unlocked_at ? '' : 'locked'}">
      <div class="ach-head"><span class="ach-icon">${icon(a.unlocked_at ? a.icon : 'lock', 32)}</span>
        <div><h3>${esc(a.title)}</h3><small>${a.unlocked_at ? 'Ontgrendeld: ' + fmtDate(a.unlocked_at) : 'Nog niet ontgrendeld'}</small></div></div>
      <p>${esc(a.desc)}</p></div>`).join('')}</div>
  `);
}

// ---------- Beheer: overzicht ----------
function adminTabs(active) {
  return `<div class="admin-tabs">
    <a class="btn ${active === 'challenges' ? '' : 'ghost'} sm" href="#/beheer">${icon('target', 16)} Uitdagingen</a>
    <a class="btn ${active === 'users' ? '' : 'ghost'} sm" href="#/beheer/gebruikers">${icon('users', 16)} Gebruikers & groepen</a>
  </div>`;
}

async function viewAdmin() {
  const list = await api('GET', '/api/admin/challenges');
  state.adminList = list;
  const now = Date.now();
  const row = (c) => {
    const live = c.status === 'published' && c.publish_at <= now;
    const phase = c.status === 'draft' ? '<span class="pill warn">Concept</span>'
      : c.publish_at > now ? '<span class="pill blue">Gepland</span>'
      : c.due_at > now ? '<span class="pill ok">Actief</span>' : '<span class="pill">Afgelopen</span>';
    return `<tr>
      <td class="rank">${c.number}</td>
      <td><b>${esc(c.title)}</b><div class="small muted">${esc(c.category || '')}</div></td>
      <td>${c.is_bonus ? '<span class="pill coral">Bonus</span>' : '<span class="pill">Regulier</span>'}</td>
      <td>${phase}</td>
      <td class="small">${fmtDate(c.publish_at, true)}<br><span class="muted">t/m ${fmtDate(c.due_at, true)}</span></td>
      <td class="num">${c.questions}</td>
      <td class="num">${live || c.completions ? `${c.completions}/${c.learners}` : '–'}</td>
      <td><div class="actions">
        <a class="icon-btn" href="#/beheer/uitdaging/${c.id}" title="Bewerken">${icon('edit', 16)}</a>
        <a class="icon-btn" href="#/beheer/resultaten/${c.id}" title="Resultaten">${icon('chart', 16)}</a>
        <a class="icon-btn" href="#/play/${c.id}" title="Testen / voorvertonen">${icon('eye', 16)}</a>
        <button class="icon-btn" data-act="dupChallenge" data-id="${c.id}" title="Dupliceren">${icon('copy', 16)}</button>
        <button class="icon-btn" data-act="delChallenge" data-id="${c.id}" title="Verwijderen">${icon('trash', 16)}</button>
      </div></td></tr>`;
  };
  app.innerHTML = shell('admin', `
    <div class="page-head"><div><h1>Beheer</h1><p class="muted">Maak en plan uitdagingen, bekijk resultaten en beheer deelnemers.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <label class="btn ghost">${icon('upload', 18)} Importeer JSON<input type="file" accept="application/json,.json" id="importFile" hidden></label>
        <a class="btn amber" href="#/beheer/uitdaging/nieuw">${icon('plus', 18)} Nieuwe uitdaging</a>
      </div></div>
    ${adminTabs('challenges')}
    <div class="table-wrap" style="border-radius:var(--radius)"><table class="admin-list">
      <thead><tr><th>#</th><th>Titel</th><th>Type</th><th>Status</th><th>Periode</th><th class="num">Vragen</th><th class="num">Voltooid</th><th></th></tr></thead>
      <tbody>${list.map(row).join('') || '<tr><td colspan="8" class="muted" style="text-align:center">Nog geen uitdagingen. Maak je eerste!</td></tr>'}</tbody>
    </table></div>
  `);
  $('#importFile').addEventListener('change', importChallenges);
}

function stripIds(c) {
  const { id, created_at, updated_at, questions, completions, learners, ...rest } = c;
  return { ...rest, steps: (c.steps || []).map(({ id: _i, challenge_id, position, ...s }) => s) };
}

async function importChallenges(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    const items = Array.isArray(json) ? json : [json];
    let ok = 0;
    for (const c of items) {
      try { await api('POST', '/api/admin/challenges', { ...stripIds(c), status: 'draft' }); ok++; } catch (err) { toast(`"${c.title}": ${err.message}`, true); }
    }
    if (ok) toast(`${ok} uitdaging(en) geïmporteerd als concept`);
    viewAdmin();
  } catch { toast('Ongeldig JSON-bestand', true); }
}

actions.dupChallenge = async (el) => {
  const c = await api('GET', `/api/admin/challenges/${el.dataset.id}`);
  const max = Math.max(0, ...state.adminList.filter((x) => !!x.is_bonus === !!c.is_bonus).map((x) => x.number));
  try {
    const r = await api('POST', '/api/admin/challenges', { ...stripIds(c), number: max + 1, title: c.title + ' (kopie)', status: 'draft' });
    toast('Kopie aangemaakt');
    location.hash = `#/beheer/uitdaging/${r.id}`;
  } catch (e) { toast(e.message, true); }
};
actions.delChallenge = async (el) => {
  const c = state.adminList.find((x) => x.id === Number(el.dataset.id));
  if (!confirm(`Uitdaging "${c.title}" verwijderen? Alle pogingen en behaalde XP voor deze uitdaging verdwijnen ook.`)) return;
  await api('DELETE', `/api/admin/challenges/${c.id}`);
  toast('Uitdaging verwijderd');
  viewAdmin();
};

// ---------- Beheer: challenge-builder ----------
const STEP_TYPES = {
  info: { label: 'Uitleg / informatie', help: 'Een uitlegscherm zonder vraag. Handig als introductie of om kennis over te dragen.' },
  single: { label: 'Meerkeuze (1 juist antwoord)', help: 'Selecteer het rondje vóór het juiste antwoord.' },
  multi: { label: 'Meerkeuze (meerdere juist)', help: 'Vink alle juiste antwoorden aan. De speler moet precies deze combinatie kiezen.' },
  truefalse: { label: 'Waar / onwaar', help: 'Een stelling die waar of onwaar is.' },
  text: { label: 'Open antwoord (exact)', help: 'Eén geaccepteerd antwoord per regel. Hoofdletters en extra spaties worden genegeerd. Ideaal voor subnet-berekeningen, poortnummers, commando\'s.' },
  order: { label: 'Volgorde bepalen', help: 'Zet de items in de JUISTE volgorde, één per regel. De speler krijgt ze geschud te zien.' },
  match: { label: 'Combineren (koppelen)', help: 'Maak paren. De speler koppelt elk item links aan het juiste item rechts (rechts wordt geschud).' },
};
const ICON_CHOICES = ['network', 'layers', 'switch', 'router', 'globe', 'route', 'antenna', 'fiber', 'monitor', 'server', 'shield', 'bolt'];
const CATEGORIES = ['IP-adressering', 'Netwerkfundamenten', 'Switching', 'Routing', 'Transport', 'Mobiele netwerken', 'Toegangsnetwerk', 'Netwerkbeheer', 'Netwerkdiensten', 'Security'];

function defaultData(type) {
  return {
    info: {}, single: { options: ['', '', ''], correct: 0 }, multi: { options: ['', '', ''], correct: [] }, truefalse: { correct: true },
    text: { accepted: [''] }, order: { items: ['', '', ''] }, match: { pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] },
  }[type];
}

async function viewEditor(id) {
  let draft;
  if (id === 'nieuw') {
    const list = await api('GET', '/api/admin/challenges');
    const regular = list.filter((c) => !c.is_bonus);
    const last = regular.sort((a, b) => b.number - a.number)[0];
    const pub = last ? Math.max(last.publish_at + 7 * 864e5, Date.now()) : Date.now();
    draft = {
      number: (last?.number || 0) + 1, is_bonus: 0, title: '', summary: '', category: '', icon: 'network', difficulty: 1,
      xp_per_question: 100, status: 'draft', publish_at: pub, due_at: pub + 7 * 864e5,
      steps: [{ type: 'info', title: '', body: '', explanation: '', data: {} }, { type: 'single', title: '', body: '', explanation: '', data: defaultData('single') }],
    };
  } else {
    draft = await api('GET', `/api/admin/challenges/${id}`);
  }
  state.ed = { id: id === 'nieuw' ? null : Number(id), draft, error: null };
  renderEditor();
}

function setDirty(on) {
  state.guard = on ? { hash: location.hash, msg: 'Je hebt niet-opgeslagen wijzigingen. Toch verlaten?' } : null;
  const b = $('#saveBtn');
  if (b) b.innerHTML = `${icon('check', 18)} ${on ? 'Opslaan*' : 'Opgeslagen'}`;
}

function renderEditor() {
  const { draft: d, id, error } = state.ed;
  const stepCard = (s, i) => {
    const t = s.type;
    let specific = '';
    if (t === 'single' || t === 'multi') {
      specific = `<div class="field"><span>Antwoordopties</span>${s.data.options.map((o, j) => `<div class="opt-row">
        ${t === 'single'
          ? `<input type="radio" name="c${i}" data-change="setCorrect" data-s="${i}" data-o="${j}" ${s.data.correct === j ? 'checked' : ''} title="Juiste antwoord">`
          : `<input type="checkbox" data-change="toggleCorrect" data-s="${i}" data-o="${j}" ${s.data.correct.includes(j) ? 'checked' : ''} title="Juist antwoord">`}
        <input class="input" data-f="steps.${i}.data.options.${j}" value="${esc(o)}" placeholder="Optie ${String.fromCharCode(65 + j)}">
        <button class="icon-btn" data-act="delOpt" data-s="${i}" data-o="${j}" ${s.data.options.length <= 2 ? 'disabled' : ''} title="Optie verwijderen">${icon('x', 16)}</button></div>`).join('')}
        <div><button class="btn ghost sm" data-act="addOpt" data-s="${i}">${icon('plus', 16)} Optie toevoegen</button></div></div>`;
    } else if (t === 'truefalse') {
      specific = `<div class="field"><span>Juiste antwoord</span><div style="display:flex;gap:20px">
        <label class="check"><input type="radio" name="tf${i}" data-change="setTf" data-s="${i}" data-v="true" ${s.data.correct ? 'checked' : ''}> Waar</label>
        <label class="check"><input type="radio" name="tf${i}" data-change="setTf" data-s="${i}" data-v="false" ${!s.data.correct ? 'checked' : ''}> Onwaar</label></div></div>`;
    } else if (t === 'text') {
      specific = `<label class="field"><span>Geaccepteerde antwoorden (één per regel)</span>
        <textarea class="input" data-f="steps.${i}.data.accepted" data-lines rows="3" placeholder="192.168.10.64">${esc(s.data.accepted.join('\n'))}</textarea></label>`;
    } else if (t === 'order') {
      specific = `<label class="field"><span>Items in de juiste volgorde (één per regel)</span>
        <textarea class="input" data-f="steps.${i}.data.items" data-lines rows="${Math.max(4, s.data.items.length + 1)}">${esc(s.data.items.join('\n'))}</textarea></label>`;
    } else if (t === 'match') {
      specific = `<div class="field"><span>Paren (links ↔ rechts)</span>${s.data.pairs.map((p, j) => `<div class="pair-row">
        <input class="input" data-f="steps.${i}.data.pairs.${j}.left" value="${esc(p.left)}" placeholder="bijv. AMF">${icon('arrowRight', 18)}
        <input class="input" data-f="steps.${i}.data.pairs.${j}.right" value="${esc(p.right)}" placeholder="bijv. Mobiliteitsbeheer">
        <button class="icon-btn" data-act="delPair" data-s="${i}" data-o="${j}" ${s.data.pairs.length <= 2 ? 'disabled' : ''}>${icon('x', 16)}</button></div>`).join('')}
        <div><button class="btn ghost sm" data-act="addPair" data-s="${i}">${icon('plus', 16)} Paar toevoegen</button></div></div>`;
    }
    return `<div class="step-card">
      <header><span class="num">${i + 1}</span>
        <select class="input" data-change="stepType" data-s="${i}">${Object.entries(STEP_TYPES).map(([k, v]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <span class="grow"></span>
        <button class="icon-btn" data-act="moveStep" data-s="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Omhoog">${icon('arrowUp', 16)}</button>
        <button class="icon-btn" data-act="moveStep" data-s="${i}" data-d="1" ${i === d.steps.length - 1 ? 'disabled' : ''} title="Omlaag">${icon('arrowDown', 16)}</button>
        <button class="icon-btn" data-act="dupStep" data-s="${i}" title="Dupliceren">${icon('copy', 16)}</button>
        <button class="icon-btn" data-act="delStep" data-s="${i}" title="Verwijderen">${icon('trash', 16)}</button>
      </header>
      <div class="content">
        <p class="type-help">${STEP_TYPES[t].help}</p>
        <label class="field"><span>${t === 'info' ? 'Titel' : t === 'truefalse' ? 'Stelling' : 'Vraag'}</span><input class="input" data-f="steps.${i}.title" value="${esc(s.title)}"></label>
        <label class="field"><span>${t === 'info' ? 'Uitlegtekst' : 'Extra toelichting (optioneel)'} — ondersteunt **vet**, \`code\` en lijstjes met "- "</span>
          <textarea class="input" data-f="steps.${i}.body" rows="${t === 'info' ? 5 : 2}">${esc(s.body)}</textarea></label>
        ${specific}
        ${t !== 'info' ? `<label class="field"><span>Uitleg na beantwoorden (optioneel)</span><textarea class="input" data-f="steps.${i}.explanation" rows="2">${esc(s.explanation)}</textarea></label>` : ''}
      </div></div>`;
  };

  app.innerHTML = shell('admin', `
    <div class="editor-bar">
      <div style="display:flex;align-items:center;gap:12px"><a class="icon-btn" href="#/beheer" title="Terug">${icon('arrowLeft', 18)}</a>
        <h2 style="font-size:26px">${id ? 'Uitdaging bewerken' : 'Nieuwe uitdaging'}</h2></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" data-act="exportChallenge">${icon('download', 18)} Exporteer</button>
        ${id ? `<button class="btn ghost" data-act="previewChallenge">${icon('eye', 18)} Testen</button>` : ''}
        <button class="btn amber" id="saveBtn" data-act="saveChallenge">${icon('check', 18)} ${state.guard ? 'Opslaan*' : id ? 'Opgeslagen' : 'Opslaan'}</button>
      </div>
    </div>
    ${error ? `<div class="error-box" style="margin-bottom:16px">${esc(error)}</div>` : ''}
    <div class="editor">
      <section class="card meta">
        <h3>Instellingen</h3>
        <div class="grid2">
          <label class="field"><span>Nummer</span><input class="input" type="number" min="1" data-f="number" data-num value="${d.number}"></label>
          <label class="field"><span>Status</span><select class="input" data-f="status">
            <option value="draft" ${d.status === 'draft' ? 'selected' : ''}>Concept</option>
            <option value="published" ${d.status === 'published' ? 'selected' : ''}>Gepubliceerd</option></select></label>
        </div>
        <label class="check"><input type="checkbox" data-f="is_bonus" data-bool ${d.is_bonus ? 'checked' : ''}> Bonusuitdaging (hoort bij de reguliere uitdaging met hetzelfde nummer)</label>
        <label class="field"><span>Titel</span><input class="input" data-f="title" value="${esc(d.title)}" placeholder="bijv. Segment Routing in de praktijk"></label>
        <label class="field"><span>Korte omschrijving</span><textarea class="input" data-f="summary" rows="3">${esc(d.summary)}</textarea></label>
        <label class="field"><span>Categorie</span><input class="input" data-f="category" list="cats" value="${esc(d.category)}">
          <datalist id="cats">${CATEGORIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <div class="field"><span>Illustratie</span><div class="icon-pick">${ICON_CHOICES.map((n) => `<button class="${d.icon === n ? 'on' : ''}" data-act="pickIcon" data-v="${n}" title="${n}">${icon(n, 22)}</button>`).join('')}</div></div>
        <div class="grid2">
          <label class="field"><span>Moeilijkheid</span><select class="input" data-f="difficulty" data-num>
            ${[1, 2, 3].map((n) => `<option value="${n}" ${d.difficulty === n ? 'selected' : ''}>${['Basis', 'Gevorderd', 'Expert'][n - 1]}</option>`).join('')}</select></label>
          <label class="field"><span>XP per goede vraag</span><input class="input" type="number" min="10" step="10" data-f="xp_per_question" data-num value="${d.xp_per_question}"></label>
        </div>
        <label class="field"><span>Beschikbaar vanaf</span><input class="input" type="datetime-local" data-f="publish_at" data-dt value="${toLocalInput(d.publish_at)}"></label>
        <label class="field"><span>Deadline (voor tijdsbonus en streak)</span><input class="input" type="datetime-local" data-f="due_at" data-dt value="${toLocalInput(d.due_at)}"></label>
      </section>
      <section>
        <div class="steps">${d.steps.map(stepCard).join('')}</div>
        <div class="add-step" style="margin-top:16px"><span>${icon('plus', 18)} Stap toevoegen:</span>
          ${Object.entries(STEP_TYPES).map(([k, v]) => `<button class="btn ghost sm" data-act="addStep" data-t="${k}">${esc(v.label)}</button>`).join('')}
        </div>
      </section>
    </div>
  `);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-f]');
  if (!el || !state.ed || !location.hash.startsWith('#/beheer/uitdaging')) return;
  let v = el.value;
  if ('lines' in el.dataset) v = v.split('\n');
  else if ('num' in el.dataset) v = Number(v);
  else if ('bool' in el.dataset) v = el.checked ? 1 : 0;
  else if ('dt' in el.dataset) { v = fromLocalInput(v); if (!v) return; }
  setPath(state.ed.draft, el.dataset.f, v);
  setDirty(true);
});
// checkboxes vuren in sommige browsers geen input-event
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-f][data-bool]');
  if (el && state.ed) { setPath(state.ed.draft, el.dataset.f, el.checked ? 1 : 0); setDirty(true); }
});

const edStep = (el) => state.ed.draft.steps[Number(el.dataset.s)];
const edRerender = () => { setDirty(true); renderEditor(); };

changes.stepType = (el) => {
  const s = edStep(el);
  const prev = s.data;
  s.type = el.value;
  s.data = defaultData(el.value);
  // Behoud opties bij wisselen tussen meerkeuze-types.
  if (prev.options && s.data.options) {
    s.data.options = prev.options;
    if (s.type === 'single') s.data.correct = Array.isArray(prev.correct) ? (prev.correct[0] ?? 0) : prev.correct ?? 0;
    if (s.type === 'multi') s.data.correct = Array.isArray(prev.correct) ? prev.correct : [prev.correct];
  }
  edRerender();
};
changes.setCorrect = (el) => { edStep(el).data.correct = Number(el.dataset.o); setDirty(true); };
changes.toggleCorrect = (el) => {
  const s = edStep(el), j = Number(el.dataset.o);
  s.data.correct = el.checked ? [...new Set([...s.data.correct, j])] : s.data.correct.filter((x) => x !== j);
  setDirty(true);
};
changes.setTf = (el) => { edStep(el).data.correct = el.dataset.v === 'true'; setDirty(true); };

actions.addOpt = (el) => { edStep(el).data.options.push(''); edRerender(); };
actions.delOpt = (el) => {
  const s = edStep(el), j = Number(el.dataset.o);
  s.data.options.splice(j, 1);
  if (s.type === 'single') s.data.correct = s.data.correct === j ? 0 : s.data.correct > j ? s.data.correct - 1 : s.data.correct;
  else s.data.correct = s.data.correct.filter((x) => x !== j).map((x) => (x > j ? x - 1 : x));
  edRerender();
};
actions.addPair = (el) => { edStep(el).data.pairs.push({ left: '', right: '' }); edRerender(); };
actions.delPair = (el) => { edStep(el).data.pairs.splice(Number(el.dataset.o), 1); edRerender(); };
actions.addStep = (el) => {
  const t = el.dataset.t;
  state.ed.draft.steps.push({ type: t, title: '', body: '', explanation: '', data: defaultData(t) });
  edRerender();
  const cards = document.querySelectorAll('.step-card');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
actions.delStep = (el) => {
  if (!confirm('Deze stap verwijderen?')) return;
  state.ed.draft.steps.splice(Number(el.dataset.s), 1);
  edRerender();
};
actions.dupStep = (el) => {
  const i = Number(el.dataset.s);
  const { id, ...copy } = JSON.parse(JSON.stringify(state.ed.draft.steps[i]));
  state.ed.draft.steps.splice(i + 1, 0, copy);
  edRerender();
};
actions.moveStep = (el) => {
  const st = state.ed.draft.steps, i = Number(el.dataset.s), j = i + Number(el.dataset.d);
  [st[i], st[j]] = [st[j], st[i]];
  edRerender();
};
actions.pickIcon = (el) => { state.ed.draft.icon = el.dataset.v; edRerender(); };

actions.saveChallenge = async () => {
  const ed = state.ed;
  try {
    const r = ed.id
      ? await api('PUT', `/api/admin/challenges/${ed.id}`, ed.draft)
      : await api('POST', '/api/admin/challenges', ed.draft);
    ed.error = null;
    state.guard = null;
    toast('Uitdaging opgeslagen');
    if (!ed.id) { location.hash = `#/beheer/uitdaging/${r.id}`; return; }
    ed.draft = await api('GET', `/api/admin/challenges/${ed.id}`); // verse step-id's
    renderEditor();
  } catch (e) {
    ed.error = e.message;
    renderEditor();
    toast(e.message, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
actions.exportChallenge = () => {
  const data = stripIds(state.ed.draft);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `uitdaging-${data.is_bonus ? 'bonus-' : ''}${data.number}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
actions.previewChallenge = () => {
  if (state.guard) { toast('Sla je wijzigingen eerst op', true); return; }
  location.hash = `#/play/${state.ed.id}`;
};

// ---------- Beheer: resultaten ----------
async function viewResults(id) {
  const r = await api('GET', `/api/admin/challenges/${id}/results`);
  const c = r.challenge;
  const done = r.people.length;
  const avgPct = done && c.questions ? Math.round((r.people.reduce((a, p) => a + p.correct, 0) / (done * c.questions)) * 100) : 0;
  const onTime = r.people.filter((p) => p.on_time).length;
  app.innerHTML = shell('admin', `
    <div class="page-head"><div style="display:flex;align-items:center;gap:12px"><a class="icon-btn" href="#/beheer">${icon('arrowLeft', 18)}</a>
      <div><div class="muted small">${c.is_bonus ? 'Bonusuitdaging' : 'Uitdaging'} ${c.number}</div><h1 style="font-size:32px">${esc(c.title)}</h1></div></div>
      <a class="btn ghost" href="#/beheer/uitdaging/${c.id}">${icon('edit', 18)} Bewerken</a></div>
    <div class="grid4" style="margin-bottom:24px">
      <div class="card"><div class="muted small">Voltooid</div><div style="font:700 30px var(--font-head)">${done}/${r.learners}</div></div>
      <div class="card"><div class="muted small">Deelname</div><div style="font:700 30px var(--font-head)">${r.learners ? Math.round((done / r.learners) * 100) : 0}%</div></div>
      <div class="card"><div class="muted small">Gem. score (beste poging)</div><div style="font:700 30px var(--font-head)">${avgPct}%</div></div>
      <div class="card"><div class="muted small">Op tijd</div><div style="font:700 30px var(--font-head)">${onTime}</div></div>
    </div>
    <div class="grid2" style="align-items:start">
      <section class="card"><h3 style="margin-bottom:16px">Per vraag (% goed, alle pogingen)</h3>
        ${r.perStep.map((s, i) => `<div style="margin-bottom:14px"><div class="small" style="margin-bottom:4px"><b>V${i + 1}.</b> ${esc(s.title)}</div>
          <div class="qbar"><div class="bar"><i style="width:${s.pctCorrect ?? 0}%;background:${(s.pctCorrect ?? 0) < 50 ? 'var(--bad)' : (s.pctCorrect ?? 0) < 75 ? 'var(--amber)' : 'var(--ok)'}"></i></div>
          <span class="small" style="width:90px;text-align:right">${s.pctCorrect === null ? 'geen data' : `${s.pctCorrect}% · ${s.answers}×`}</span></div></div>`).join('') || '<p class="muted">Geen vragen.</p>'}
        <p class="small muted">Tip: vragen onder de 50% zijn kandidaten voor extra uitleg of een vervolgchallenge.</p>
      </section>
      <section class="table-wrap" style="border-radius:var(--radius)"><table>
        <thead><tr><th>Deelnemer</th><th>Groep</th><th class="num">Goed</th><th class="num">XP</th><th class="num">Pogingen</th><th>Op tijd</th></tr></thead>
        <tbody>${r.people.map((p) => `<tr><td>${esc(p.name)}</td><td class="muted">${esc(p.grp || '—')}</td><td class="num">${p.correct}/${c.questions}</td>
          <td class="num">${fmt(p.xp)}</td><td class="num">${p.tries}</td><td>${p.on_time ? '<span class="pill ok">ja</span>' : '<span class="pill">nee</span>'}</td></tr>`).join('')
          || '<tr><td colspan="6" class="muted" style="text-align:center">Nog niemand heeft deze uitdaging voltooid.</td></tr>'}</tbody></table></section>
    </div>
  `);
}

// ---------- Beheer: gebruikers & groepen ----------
async function viewUsers() {
  const d = await api('GET', '/api/admin/users');
  state.users = d;
  app.innerHTML = shell('admin', `
    <div class="page-head"><div><h1>Beheer</h1><p class="muted">Deelnemers, beheerders en groepen.</p></div>
      <button class="btn amber" data-act="userModal">${icon('plus', 18)} Nieuwe gebruiker</button></div>
    ${adminTabs('users')}
    <div class="editor" style="grid-template-columns:minmax(0,1fr) 340px">
      <section class="table-wrap" style="border-radius:var(--radius)"><table>
        <thead><tr><th>Naam</th><th>Gebruikersnaam</th><th>Rol</th><th>Groep</th><th></th></tr></thead>
        <tbody>${d.users.map((u) => `<tr><td><b>${esc(u.display_name)}</b></td><td class="muted">${esc(u.username)}</td>
          <td>${u.role === 'admin' ? '<span class="pill blue">Beheerder</span>' : '<span class="pill">Deelnemer</span>'}</td><td>${esc(u.group_name || '—')}</td>
          <td><div class="actions" style="display:flex;gap:6px;justify-content:flex-end">
            <button class="icon-btn" data-act="userModal" data-id="${u.id}" title="Bewerken">${icon('edit', 16)}</button>
            <button class="icon-btn" data-act="delUser" data-id="${u.id}" title="Verwijderen" ${u.id === state.me.user.id ? 'disabled' : ''}>${icon('trash', 16)}</button></div></td></tr>`).join('')}
        </tbody></table></section>
      <section class="card" style="display:grid;gap:12px;align-content:start"><h3>Groepen</h3>
        ${d.groups.map((g) => `<div style="display:flex;align-items:center;gap:10px"><span style="flex:1"><b>${esc(g.name)}</b> <span class="muted small">${g.members} leden</span></span>
          <button class="icon-btn" data-act="delGroup" data-id="${g.id}" title="Verwijderen">${icon('trash', 16)}</button></div>`).join('') || '<p class="muted">Nog geen groepen.</p>'}
        <form id="groupForm" style="display:flex;gap:8px"><input class="input" name="name" placeholder="Nieuwe groep" required><button class="btn sm">${icon('plus', 16)}</button></form>
      </section>
    </div>
  `);
  $('#groupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/admin/groups', { name: new FormData(e.target).get('name') }); toast('Groep toegevoegd'); viewUsers(); } catch (err) { toast(err.message, true); }
  });
}

actions.userModal = (el) => {
  const u = el.dataset.id ? state.users.users.find((x) => x.id === Number(el.dataset.id)) : null;
  modal(`<h3>${u ? 'Gebruiker bewerken' : 'Nieuwe gebruiker'}</h3>
    <form id="userForm" style="display:grid;gap:14px">
      <label class="field"><span>Weergavenaam (zichtbaar op leaderboard)</span><input class="input" name="display_name" value="${esc(u?.display_name)}" required></label>
      <label class="field"><span>Gebruikersnaam</span><input class="input" name="username" value="${esc(u?.username)}" required></label>
      <label class="field"><span>${u ? 'Nieuw wachtwoord (leeg laten = ongewijzigd)' : 'Wachtwoord (min. 6 tekens)'}</span><input class="input" type="password" name="password" autocomplete="new-password" ${u ? '' : 'required'}></label>
      <div class="grid2">
        <label class="field"><span>Rol</span><select class="input" name="role"><option value="learner">Deelnemer</option><option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Beheerder</option></select></label>
        <label class="field"><span>Groep</span><select class="input" name="group_id"><option value="">Geen</option>
          ${state.users.groups.map((g) => `<option value="${g.id}" ${u?.group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="closeModal">Annuleren</button><button class="btn">Opslaan</button></div>
    </form>`);
  $('#userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (u) await api('PUT', `/api/admin/users/${u.id}`, body); else await api('POST', '/api/admin/users', body);
      closeModal(); toast('Gebruiker opgeslagen'); viewUsers();
    } catch (err) { toast(err.message, true); }
  });
};
actions.delUser = async (el) => {
  const u = state.users.users.find((x) => x.id === Number(el.dataset.id));
  if (!confirm(`${u.display_name} verwijderen? Alle voortgang van deze gebruiker gaat verloren.`)) return;
  await api('DELETE', `/api/admin/users/${u.id}`);
  toast('Gebruiker verwijderd'); viewUsers();
};
actions.delGroup = async (el) => {
  if (!confirm('Groep verwijderen? Leden blijven bestaan maar zitten daarna in geen groep.')) return;
  await api('DELETE', `/api/admin/groups/${el.dataset.id}`);
  viewUsers();
};

// ---------- Start ----------
router();
