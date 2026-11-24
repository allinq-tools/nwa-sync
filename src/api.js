'use strict';
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword, tx } = require('./db');
const G = require('./game');
const { getForecast } = require('./weather');

const SESSION_DAYS = 14;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- Helpers ----------
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.group_id, g.name AS group_name
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN groups g ON g.id = u.group_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now());
  return row || null;
}

function challengeRow(id) {
  return db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
}

function canPlay(user, c) {
  if (!c) return false;
  if (user.role === 'admin') return true;
  return c.status === 'published' && c.publish_at <= Date.now();
}

function questionCount(challengeId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM steps WHERE challenge_id = ? AND type != 'info'`).get(challengeId).n;
}

function rankInfo(userId) {
  const lb = leaderboardRows('total');
  const idx = lb.findIndex((r) => r.id === userId);
  if (idx < 0) return { rank: null, of: lb.length, betterThan: 0 };
  const betterThan = lb.length > 1 ? Math.round(((lb.length - idx - 1) / (lb.length - 1)) * 100) : 100;
  return { rank: idx + 1, of: lb.length, betterThan };
}

function leaderboardRows(sort = 'season') {
  const users = db.prepare(`SELECT u.id, u.display_name, u.group_id, g.name AS group_name FROM users u
    LEFT JOIN groups g ON g.id = u.group_id WHERE u.role = 'learner'`).all();
  const allAttempts = db.prepare('SELECT * FROM attempts WHERE completed_at IS NOT NULL ORDER BY completed_at').all();
  const challenges = db.prepare("SELECT id, number, is_bonus, publish_at, due_at FROM challenges WHERE status = 'published'").all();
  const season = G.currentSeason();
  const byUser = new Map();
  for (const a of allAttempts) {
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id).push(a);
  }
  const rows = users.map((u) => {
    const s = G.userStats(u.id, Date.now(), { attempts: byUser.get(u.id) || [], challenges, season });
    return {
      id: u.id, name: u.display_name, group: u.group_name || '—', group_id: u.group_id,
      xp: s.xp, seasonXp: s.seasonXp, streak: s.streak, reputation: s.reputation, level: s.level.level,
    };
  });
  const key = sort === 'total' ? 'xp' : sort === 'streak' ? 'streak' : 'seasonXp';
  rows.sort((a, b) => b[key] - a[key] || b.xp - a.xp || a.name.localeCompare(b.name));
  return rows;
}

function challengeSummary(c, stats, now) {
  let state;
  if (c.publish_at > now) state = 'locked';
  else if (stats.doneIds.has(c.id)) state = stats.onTimeIds.has(c.id) ? 'done' : 'late';
  else if (c.due_at > now) state = 'open';
  else state = 'missed';
  return {
    id: c.id, number: c.number, is_bonus: !!c.is_bonus, title: c.title, summary: c.summary, category: c.category,
    icon: c.icon, difficulty: c.difficulty, xp_per_question: c.xp_per_question, publish_at: c.publish_at, due_at: c.due_at,
    questions: questionCount(c.id), state, bestXp: stats.bestXp[c.id] ?? null,
  };
}

function saveChallenge(id, input) {
  const c = G.normalizeChallenge(input);
  const now = Date.now();
  return tx(() => {
    const clash = db.prepare('SELECT id FROM challenges WHERE number = ? AND is_bonus = ? AND id != ?').get(c.number, c.is_bonus, id || 0);
    if (clash) fail(400, `Er bestaat al een ${c.is_bonus ? 'bonusuitdaging' : 'uitdaging'} met nummer ${c.number}`);
    if (id) {
      db.prepare(`UPDATE challenges SET number=?, is_bonus=?, title=?, summary=?, category=?, icon=?, difficulty=?, xp_per_question=?,
        status=?, publish_at=?, due_at=?, updated_at=? WHERE id=?`).run(c.number, c.is_bonus, c.title, c.summary, c.category, c.icon,
        c.difficulty, c.xp_per_question, c.status, c.publish_at, c.due_at, now, id);
    } else {
      id = Number(db.prepare(`INSERT INTO challenges (number, is_bonus, title, summary, category, icon, difficulty, xp_per_question, status,
        publish_at, due_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.number, c.is_bonus, c.title, c.summary,
        c.category, c.icon, c.difficulty, c.xp_per_question, c.status, c.publish_at, c.due_at, now, now).lastInsertRowid);
    }
    const existing = new Set(db.prepare('SELECT id FROM steps WHERE challenge_id = ?').all(id).map((r) => r.id));
    const keep = new Set();
    c.steps.forEach((s, pos) => {
      const data = JSON.stringify(s.data);
      if (s.id && existing.has(s.id)) {
        db.prepare('UPDATE steps SET position=?, type=?, title=?, body=?, data=?, explanation=? WHERE id=?')
          .run(pos, s.type, s.title, s.body, data, s.explanation, s.id);
        keep.add(s.id);
      } else {
        db.prepare('INSERT INTO steps (challenge_id, position, type, title, body, data, explanation) VALUES (?,?,?,?,?,?,?)')
          .run(id, pos, s.type, s.title, s.body, data, s.explanation);
      }
    });
    for (const sid of existing) if (!keep.has(sid)) db.prepare('DELETE FROM steps WHERE id = ?').run(sid);
    return id;
  });
}

// ---------- Routes ----------
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false, admin: !!opts.admin });
};

// Auth
route('POST', '/api/login', ({ body, res }) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(body.username || '').trim().toLowerCase());
  if (!u || !verifyPassword(body.password || '', u.password_hash)) fail(401, 'Onjuiste gebruikersnaam of wachtwoord');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, u.id, Date.now() + SESSION_DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  return { ok: true };
}, { auth: false });

// Weersvoorspelling (Open-Meteo, met cache)
route('GET', '/api/weather', () => getForecast());

route('POST', '/api/logout', ({ req, res }) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return { ok: true };
}, { auth: false });

route('GET', '/api/me', ({ user }) => {
  const s = G.userStats(user.id);
  G.evaluateAchievements(user.id);
  return {
    user, xp: s.xp, seasonXp: s.seasonXp, level: s.level, reputation: s.reputation, streak: s.streak,
    ...rankInfo(user.id),
  };
});

route('POST', '/api/me/password', ({ user, body }) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!verifyPassword(body.current || '', row.password_hash)) fail(400, 'Huidig wachtwoord klopt niet');
  if (String(body.next || '').length < 6) fail(400, 'Nieuw wachtwoord moet minimaal 6 tekens zijn');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.next), user.id);
  return { ok: true };
});

// Dashboard / verhaallijn
route('GET', '/api/dashboard', ({ user }) => {
  const now = Date.now();
  const s = G.userStats(user.id, now);
  const visible = user.role === 'admin' ? '' : "AND status = 'published'";
  const all = db.prepare(`SELECT * FROM challenges WHERE 1=1 ${visible} ORDER BY number DESC`).all();
  const regular = all.filter((c) => !c.is_bonus);
  // Alles wat gepubliceerd is + de eerstvolgende vergrendelde uitdaging.
  const unlocked = regular.filter((c) => c.publish_at <= now);
  const nextLocked = regular.filter((c) => c.publish_at > now).sort((a, b) => a.publish_at - b.publish_at)[0];
  const storyline = [...(nextLocked ? [nextLocked] : []), ...unlocked].map((c) => challengeSummary(c, s, now));
  const bonus = {};
  for (const c of all.filter((x) => x.is_bonus && x.publish_at <= now)) bonus[c.number] = challengeSummary(c, s, now);
  const season = G.currentSeason(now);
  return {
    me: { name: user.display_name, xp: s.xp, seasonXp: s.seasonXp, level: s.level, reputation: s.reputation, streak: s.streak, ...rankInfo(user.id) },
    storyline, bonus, season, onTimeBonus: G.ON_TIME_BONUS, levels: G.LEVELS,
  };
});

// Spelen
route('POST', '/api/challenges/:id/attempts', ({ user, params }) => {
  const c = challengeRow(params.id);
  if (!canPlay(user, c)) fail(404, 'Uitdaging niet gevonden of nog niet beschikbaar');
  const steps = G.getSteps(c.id);
  const qc = steps.filter((st) => st.type !== 'info').length;
  const id = Number(db.prepare('INSERT INTO attempts (user_id, challenge_id, started_at, question_count) VALUES (?,?,?,?)')
    .run(user.id, c.id, Date.now(), qc).lastInsertRowid);
  return {
    attemptId: id,
    challenge: { id: c.id, number: c.number, is_bonus: !!c.is_bonus, title: c.title, icon: c.icon, xp_per_question: c.xp_per_question, due_at: c.due_at },
    steps: steps.map(G.publicStep),
  };
});

function ownAttempt(user, id) {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!a) fail(404, 'Poging niet gevonden');
  return a;
}

route('POST', '/api/attempts/:id/answer', ({ user, params, body }) => {
  const a = ownAttempt(user, params.id);
  if (a.completed_at) fail(400, 'Deze poging is al afgerond');
  const st = db.prepare('SELECT * FROM steps WHERE id = ? AND challenge_id = ?').get(body.stepId, a.challenge_id);
  if (!st) fail(404, 'Vraag niet gevonden');
  const step = { ...st, data: JSON.parse(st.data) };
  if (step.type === 'info') return { correct: true };
  const prev = db.prepare('SELECT * FROM answers WHERE attempt_id = ? AND step_id = ?').get(a.id, step.id);
  const correct = prev ? !!prev.correct : G.checkAnswer(step, body.response);
  if (!prev) {
    db.prepare('INSERT INTO answers (attempt_id, step_id, response, correct, answered_at) VALUES (?,?,?,?,?)')
      .run(a.id, step.id, JSON.stringify(body.response ?? null), correct ? 1 : 0, Date.now());
  }
  const c = challengeRow(a.challenge_id);
  return {
    correct, xp: correct ? c.xp_per_question : 0,
    solution: G.solutionFor(step), explanation: step.explanation,
    correctIndex: step.type === 'single' ? step.data.correct : undefined,
    correctIndexes: step.type === 'multi' ? step.data.correct : undefined,
  };
});

route('POST', '/api/attempts/:id/complete', ({ user, params }) => {
  const a = ownAttempt(user, params.id);
  if (a.completed_at) fail(400, 'Deze poging is al afgerond');
  const c = challengeRow(a.challenge_id);
  const now = Date.now();
  const correct = db.prepare('SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ? AND correct = 1').get(a.id).n;
  const answered = db.prepare('SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ?').get(a.id).n;
  if (answered < a.question_count) fail(400, 'Beantwoord eerst alle vragen');
  const onTime = now <= c.due_at;
  const base = correct * c.xp_per_question;
  const bonus = onTime ? Math.round(base * G.ON_TIME_BONUS) : 0;
  const previousBest = db.prepare('SELECT MAX(xp) AS m FROM attempts WHERE user_id = ? AND challenge_id = ? AND completed_at IS NOT NULL').get(user.id, c.id).m;
  db.prepare('UPDATE attempts SET completed_at = ?, correct_count = ?, xp = ?, on_time = ? WHERE id = ?').run(now, correct, base + bonus, onTime ? 1 : 0, a.id);
  const before = G.levelFor(G.userStats(user.id, now - 1).xp);
  const newAchievements = G.evaluateAchievements(user.id, now);
  const s = G.userStats(user.id, now);
  return {
    correct, questions: a.question_count, baseXp: base, bonusXp: bonus, xp: base + bonus, onTime,
    previousBest: previousBest ?? null, counted: Math.max(0, base + bonus - (previousBest || 0)),
    totalXp: s.xp, level: s.level, levelUp: s.level.level > before.level, streak: s.streak, newAchievements,
  };
});

// Leaderboard
route('GET', '/api/leaderboard', ({ user, query }) => {
  const sort = query.get('sort') || 'season';
  const scope = query.get('scope') || 'org';
  const rows = leaderboardRows(sort);
  const season = G.currentSeason();
  if (scope === 'groups') {
    const groups = new Map();
    for (const r of rows) {
      if (!r.group_id) continue;
      const g = groups.get(r.group_id) || { id: r.group_id, name: r.group, members: 0, seasonXp: 0, xp: 0 };
      g.members++; g.seasonXp += r.seasonXp; g.xp += r.xp;
      groups.set(r.group_id, g);
    }
    const list = [...groups.values()].map((g) => ({ ...g, avgSeasonXp: Math.round(g.seasonXp / g.members), avgXp: Math.round(g.xp / g.members) }));
    list.sort((a, b) => (sort === 'total' ? b.avgXp - a.avgXp : b.avgSeasonXp - a.avgSeasonXp));
    return { scope, sort, season, groups: list, myGroupId: user.group_id };
  }
  let list = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  if (scope === 'mygroup') list = list.filter((r) => r.group_id === user.group_id).map((r, i) => ({ ...r, rank: i + 1 }));
  const myGroupRows = rows.filter((r) => r.group_id === user.group_id);
  const myGroupRank = myGroupRows.findIndex((r) => r.id === user.id);
  return {
    scope, sort, season, rows: list, meId: user.id,
    summary: { ...rankInfo(user.id), group: user.group_name, groupRank: myGroupRank >= 0 ? myGroupRank + 1 : null },
  };
});

// Beloningen
route('GET', '/api/achievements', ({ user }) => {
  G.evaluateAchievements(user.id);
  const got = new Map(db.prepare('SELECT code, unlocked_at FROM user_achievements WHERE user_id = ?').all(user.id).map((r) => [r.code, r.unlocked_at]));
  return G.ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, unlocked_at: got.get(a.code) || null }));
});

// ---------- Admin ----------
route('GET', '/api/admin/challenges', () => {
  const list = db.prepare('SELECT * FROM challenges ORDER BY is_bonus, number DESC').all();
  const learners = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'learner'").get().n;
  return list.map((c) => ({
    ...c, questions: questionCount(c.id), learners,
    completions: db.prepare(`SELECT COUNT(DISTINCT a.user_id) AS n FROM attempts a JOIN users u ON u.id = a.user_id
      WHERE a.challenge_id = ? AND a.completed_at IS NOT NULL AND u.role = 'learner'`).get(c.id).n,
  }));
}, { admin: true });

route('GET', '/api/admin/challenges/:id', ({ params }) => {
  const c = challengeRow(params.id);
  if (!c) fail(404, 'Niet gevonden');
  return { ...c, steps: G.getSteps(c.id) };
}, { admin: true });

route('POST', '/api/admin/challenges', ({ body }) => ({ id: saveChallenge(null, body) }), { admin: true });

route('PUT', '/api/admin/challenges/:id', ({ params, body }) => {
  if (!challengeRow(params.id)) fail(404, 'Niet gevonden');
  return { id: saveChallenge(Number(params.id), body) };
}, { admin: true });

route('DELETE', '/api/admin/challenges/:id', ({ params }) => {
  db.prepare('DELETE FROM challenges WHERE id = ?').run(params.id);
  return { ok: true };
}, { admin: true });

route('GET', '/api/admin/challenges/:id/results', ({ params }) => {
  const c = challengeRow(params.id);
  if (!c) fail(404, 'Niet gevonden');
  const steps = G.getSteps(c.id).filter((s) => s.type !== 'info');
  const perStep = steps.map((s) => {
    const r = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(an.correct),0) AS ok FROM answers an
      JOIN attempts a ON a.id = an.attempt_id JOIN users u ON u.id = a.user_id WHERE an.step_id = ? AND u.role = 'learner'`).get(s.id);
    return { id: s.id, type: s.type, title: s.title, answers: r.n, pctCorrect: r.n ? Math.round((r.ok / r.n) * 100) : null };
  });
  const people = db.prepare(`SELECT u.display_name AS name, g.name AS grp, MAX(a.xp) AS xp, MAX(a.correct_count) AS correct,
      MIN(a.completed_at) AS first_completed, MAX(a.on_time) AS on_time, COUNT(*) AS tries
    FROM attempts a JOIN users u ON u.id = a.user_id LEFT JOIN groups g ON g.id = u.group_id
    WHERE a.challenge_id = ? AND a.completed_at IS NOT NULL AND u.role = 'learner'
    GROUP BY a.user_id ORDER BY xp DESC, first_completed`).all(c.id);
  const learners = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'learner'").get().n;
  return { challenge: { id: c.id, number: c.number, is_bonus: !!c.is_bonus, title: c.title, questions: steps.length }, perStep, people, learners };
}, { admin: true });

route('GET', '/api/admin/users', () => ({
  users: db.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.group_id, g.name AS group_name, u.created_at
    FROM users u LEFT JOIN groups g ON g.id = u.group_id ORDER BY u.role, u.display_name`).all(),
  groups: db.prepare(`SELECT g.id, g.name, (SELECT COUNT(*) FROM users WHERE group_id = g.id) AS members FROM groups g ORDER BY g.name`).all(),
}), { admin: true });

function userInput(body, isNew) {
  const u = {
    username: String(body.username || '').trim().toLowerCase(),
    display_name: String(body.display_name || '').trim().slice(0, 60),
    role: body.role === 'admin' ? 'admin' : 'learner',
    group_id: body.group_id ? Number(body.group_id) : null,
    password: body.password ? String(body.password) : '',
  };
  if (!/^[a-z0-9._-]{3,40}$/.test(u.username)) fail(400, 'Gebruikersnaam: 3–40 tekens (a-z, 0-9, . _ -)');
  if (!u.display_name) fail(400, 'Weergavenaam is verplicht');
  if ((isNew || u.password) && u.password.length < 6) fail(400, 'Wachtwoord moet minimaal 6 tekens zijn');
  return u;
}

route('POST', '/api/admin/users', ({ body }) => {
  const u = userInput(body, true);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(u.username)) fail(400, 'Gebruikersnaam bestaat al');
  const id = db.prepare('INSERT INTO users (username, display_name, password_hash, role, group_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(u.username, u.display_name, hashPassword(u.password), u.role, u.group_id, Date.now()).lastInsertRowid;
  return { id: Number(id) };
}, { admin: true });

route('PUT', '/api/admin/users/:id', ({ params, body, user }) => {
  const u = userInput(body, false);
  if (db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(u.username, params.id)) fail(400, 'Gebruikersnaam bestaat al');
  if (Number(params.id) === user.id && u.role !== 'admin') fail(400, 'Je kunt je eigen beheerdersrol niet intrekken');
  db.prepare('UPDATE users SET username=?, display_name=?, role=?, group_id=? WHERE id=?').run(u.username, u.display_name, u.role, u.group_id, params.id);
  if (u.password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(u.password), params.id);
  return { ok: true };
}, { admin: true });

route('DELETE', '/api/admin/users/:id', ({ params, user }) => {
  if (Number(params.id) === user.id) fail(400, 'Je kunt jezelf niet verwijderen');
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  return { ok: true };
}, { admin: true });

route('POST', '/api/admin/groups', ({ body }) => {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) fail(400, 'Groepsnaam is verplicht');
  if (db.prepare('SELECT 1 FROM groups WHERE name = ?').get(name)) fail(400, 'Groep bestaat al');
  return { id: Number(db.prepare('INSERT INTO groups (name) VALUES (?)').run(name).lastInsertRowid) };
}, { admin: true });

route('DELETE', '/api/admin/groups/:id', ({ params }) => {
  db.prepare('DELETE FROM groups WHERE id = ?').run(params.id);
  return { ok: true };
}, { admin: true });

// ---------- Dispatcher ----------
async function readJson(req) {
  if (req.method === 'GET' || req.method === 'DELETE') return {};
  let size = 0;
  const chunks = [];
  for await (const ch of req) {
    size += ch.length;
    if (size > 2e6) throw new HttpError(413, 'Verzoek te groot');
    chunks.push(ch);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Ongeldige JSON'); }
}

async function handleApi(req, res, url) {
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const user = currentUser(req);
      if (r.auth && !user) fail(401, 'Niet ingelogd');
      if (r.admin && user.role !== 'admin') fail(403, 'Alleen voor beheerders');
      // Eenvoudige CSRF-bescherming: schrijfacties alleen vanaf dezelfde origin.
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) fail(403, 'Ongeldige origin');
      }
      const body = await readJson(req);
      const out = await r.handler({ req, res, user, params, body, query: url.searchParams });
      return send(200, out);
    }
    fail(404, 'Onbekend endpoint');
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message });
    if (e instanceof Error && !e.status && /^(Stap|Titel|Nummer|Publicatie|De deadline|Voeg)/.test(e.message)) return send(400, { error: e.message });
    console.error(e);
    return send(500, { error: 'Interne serverfout' });
  }
}

module.exports = { handleApi };
