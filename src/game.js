'use strict';
// Spelregels: vraagtypes, scoring, levels, streaks en beloningen.
const { db } = require('./db');

const QUESTION_TYPES = ['single', 'multi', 'truefalse', 'text', 'order', 'match'];
const STEP_TYPES = ['info', ...QUESTION_TYPES];
const ON_TIME_BONUS = 0.2; // +20% XP als je vóór de deadline klaar bent

const LEVELS = [
  { level: 1, name: 'Trainee', min: 0 },
  { level: 2, name: 'Engineer', min: 1000 },
  { level: 3, name: 'Senior Engineer', min: 3000 },
  { level: 4, name: 'Netwerkarchitect', min: 6000 },
  { level: 5, name: 'NOC Legend', min: 12000 },
];

function levelFor(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > xp) || null;
  return { ...cur, next };
}

// ---------- Vragen controleren ----------
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function checkAnswer(step, response) {
  const d = step.data;
  switch (step.type) {
    case 'single':
      return Number(response) === d.correct;
    case 'multi': {
      if (!Array.isArray(response)) return false;
      const a = [...new Set(response.map(Number))].sort((x, y) => x - y);
      const b = [...d.correct].sort((x, y) => x - y);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    case 'truefalse':
      return (response === true || response === 'true') === d.correct;
    case 'text':
      return d.accepted.some((acc) => norm(acc) === norm(response));
    case 'order':
      return Array.isArray(response) && response.length === d.items.length && response.every((v, i) => Number(v) === i);
    case 'match':
      return Array.isArray(response) && response.length === d.pairs.length && response.every((v, i) => Number(v) === i);
    default:
      return true;
  }
}

function solutionFor(step) {
  const d = step.data;
  switch (step.type) {
    case 'single': return d.options[d.correct];
    case 'multi': return d.correct.map((i) => d.options[i]);
    case 'truefalse': return d.correct ? 'Waar' : 'Onwaar';
    case 'text': return d.accepted[0];
    case 'order': return d.items;
    case 'match': return d.pairs.map((p) => `${p.left} → ${p.right}`);
    default: return null;
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wat de speler te zien krijgt: nooit de juiste antwoorden.
function publicStep(step) {
  const d = step.data;
  const base = { id: step.id, type: step.type, title: step.title, body: step.body };
  switch (step.type) {
    case 'single':
    case 'multi':
      return { ...base, options: d.options };
    case 'order': {
      let items = shuffle(d.items.map((text, i) => ({ i, text })));
      if (items.every((it, idx) => it.i === idx) && items.length > 1) items = [...items.slice(1), items[0]];
      return { ...base, items };
    }
    case 'match':
      return {
        ...base,
        lefts: d.pairs.map((p) => p.left),
        rights: shuffle(d.pairs.map((p, i) => ({ i, text: p.right }))),
      };
    default:
      return base;
  }
}

// ---------- Validatie van challenges (builder) ----------
function cleanStr(v, max = 5000) {
  return String(v ?? '').slice(0, max);
}

function normalizeStep(raw, idx) {
  const where = `Stap ${idx + 1}`;
  const type = String(raw.type || '');
  if (!STEP_TYPES.includes(type)) throw new Error(`${where}: onbekend type "${type}"`);
  const step = {
    id: raw.id ? Number(raw.id) : null,
    type,
    title: cleanStr(raw.title, 300).trim(),
    body: cleanStr(raw.body),
    explanation: cleanStr(raw.explanation),
    data: {},
  };
  const d = raw.data || {};
  if (!step.title) throw new Error(`${where}: titel/vraag is verplicht`);
  const strList = (list) => (Array.isArray(list) ? list.map((s) => cleanStr(s, 500).trim()).filter(Boolean) : []);
  switch (type) {
    case 'single': {
      const options = strList(d.options);
      if (options.length < 2) throw new Error(`${where}: minimaal 2 antwoordopties nodig`);
      const correct = Number(d.correct);
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) throw new Error(`${where}: kies het juiste antwoord`);
      step.data = { options, correct };
      break;
    }
    case 'multi': {
      const options = strList(d.options);
      if (options.length < 2) throw new Error(`${where}: minimaal 2 antwoordopties nodig`);
      const correct = [...new Set((d.correct || []).map(Number))].filter((i) => i >= 0 && i < options.length);
      if (!correct.length) throw new Error(`${where}: markeer minimaal één juist antwoord`);
      step.data = { options, correct };
      break;
    }
    case 'truefalse':
      step.data = { correct: d.correct === true || d.correct === 'true' };
      break;
    case 'text': {
      const accepted = strList(d.accepted);
      if (!accepted.length) throw new Error(`${where}: geef minimaal één geaccepteerd antwoord`);
      step.data = { accepted };
      break;
    }
    case 'order': {
      const items = strList(d.items);
      if (items.length < 2) throw new Error(`${where}: minimaal 2 items om te ordenen`);
      step.data = { items };
      break;
    }
    case 'match': {
      const pairs = (Array.isArray(d.pairs) ? d.pairs : [])
        .map((p) => ({ left: cleanStr(p.left, 300).trim(), right: cleanStr(p.right, 300).trim() }))
        .filter((p) => p.left && p.right);
      if (pairs.length < 2) throw new Error(`${where}: minimaal 2 complete paren nodig`);
      step.data = { pairs };
      break;
    }
    default:
      step.data = {};
  }
  return step;
}

function normalizeChallenge(raw) {
  const c = {
    number: Number(raw.number),
    is_bonus: raw.is_bonus ? 1 : 0,
    title: cleanStr(raw.title, 200).trim(),
    summary: cleanStr(raw.summary, 2000).trim(),
    category: cleanStr(raw.category, 100).trim(),
    icon: cleanStr(raw.icon || 'network', 40),
    difficulty: Math.min(3, Math.max(1, Number(raw.difficulty) || 1)),
    xp_per_question: Math.min(1000, Math.max(10, Number(raw.xp_per_question) || 100)),
    status: raw.status === 'published' ? 'published' : 'draft',
    publish_at: Number(raw.publish_at),
    due_at: Number(raw.due_at),
  };
  if (!c.title) throw new Error('Titel is verplicht');
  if (!Number.isInteger(c.number) || c.number < 1) throw new Error('Nummer moet een positief geheel getal zijn');
  if (!c.publish_at || !c.due_at) throw new Error('Publicatiedatum en deadline zijn verplicht');
  if (c.due_at <= c.publish_at) throw new Error('De deadline moet na de publicatiedatum liggen');
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map(normalizeStep);
  if (!steps.length) throw new Error('Voeg minimaal één stap toe');
  if (!steps.some((s) => QUESTION_TYPES.includes(s.type))) throw new Error('Voeg minimaal één vraag toe');
  return { ...c, steps };
}

// ---------- Data ophalen ----------
function getSteps(challengeId) {
  return db.prepare('SELECT * FROM steps WHERE challenge_id = ? ORDER BY position').all(challengeId)
    .map((s) => ({ ...s, data: JSON.parse(s.data) }));
}

function currentSeason(now = Date.now()) {
  return db.prepare('SELECT * FROM seasons WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1').get(now, now)
    || db.prepare('SELECT * FROM seasons ORDER BY ends_at DESC LIMIT 1').get() || null;
}

function bestPerChallenge(attempts) {
  const best = new Map();
  for (const a of attempts) {
    const cur = best.get(a.challenge_id);
    if (!cur || a.xp > cur.xp) best.set(a.challenge_id, a);
  }
  return best;
}

// Statistieken voor één gebruiker, eventueel "per moment" (voor seeding).
function userStats(userId, now = Date.now(), ctx = {}) {
  const attempts = (ctx.attempts || db.prepare('SELECT * FROM attempts WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at').all(userId))
    .filter((a) => a.completed_at <= now);
  const challenges = ctx.challenges || db.prepare("SELECT id, number, is_bonus, publish_at, due_at FROM challenges WHERE status = 'published'").all();
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const season = ctx.season !== undefined ? ctx.season : currentSeason(now);

  const best = bestPerChallenge(attempts);
  let totalXp = 0;
  for (const a of best.values()) totalXp += a.xp;

  let seasonXp = 0;
  if (season) {
    const inSeason = attempts.filter((a) => a.completed_at >= season.starts_at && a.completed_at < season.ends_at);
    for (const a of bestPerChallenge(inSeason).values()) seasonXp += a.xp;
  }

  const firstTries = new Map();
  for (const a of attempts) if (!firstTries.has(a.challenge_id)) firstTries.set(a.challenge_id, a);
  let firstCorrect = 0, firstTotal = 0;
  for (const a of firstTries.values()) { firstCorrect += a.correct_count; firstTotal += a.question_count; }

  const doneIds = new Set(best.keys());
  const onTimeIds = new Set(attempts.filter((a) => a.on_time).map((a) => a.challenge_id));
  let completedRegular = 0, completedBonus = 0;
  for (const id of doneIds) {
    const c = byId.get(id);
    if (!c) continue;
    if (c.is_bonus) completedBonus++; else completedRegular++;
  }

  // Streak: aaneengesloten reguliere uitdagingen die op tijd zijn voltooid.
  const regular = challenges.filter((c) => !c.is_bonus && c.publish_at <= now).sort((a, b) => b.number - a.number);
  let streak = 0;
  for (const c of regular) {
    if (onTimeIds.has(c.id)) streak++;
    else if (c.due_at > now) continue; // loopt nog: breekt de streak niet
    else break;
  }

  const xp = totalXp;
  return {
    xp,
    seasonXp,
    level: levelFor(xp),
    reputation: firstTotal ? Math.round((firstCorrect / firstTotal) * 100) : 0,
    completedRegular,
    completedBonus,
    completedTotal: completedRegular + completedBonus,
    perfect: attempts.some((a) => a.question_count > 0 && a.correct_count === a.question_count),
    streak,
    doneIds,
    onTimeIds,
    bestXp: Object.fromEntries([...best].map(([k, v]) => [k, v.xp])),
  };
}

// ---------- Beloningen ----------
const ACHIEVEMENTS = [
  { code: 'first', icon: 'rocket', title: 'Eerste verbinding', desc: 'Voltooi je eerste uitdaging.', test: (s) => s.completedTotal >= 1 },
  { code: 'complete5', icon: 'cable', title: 'Voltooi 5 uitdagingen', desc: 'De eerste kabels liggen. Goed bezig!', test: (s) => s.completedTotal >= 5 },
  { code: 'complete10', icon: 'switch', title: 'Voltooi 10 uitdagingen', desc: 'Je netwerk groeit gestaag.', test: (s) => s.completedTotal >= 10 },
  { code: 'complete25', icon: 'tower', title: 'Voltooi 25 uitdagingen', desc: 'Backbone-materiaal: jij houdt het netwerk in de lucht.', test: (s) => s.completedTotal >= 25 },
  { code: 'bonus1', icon: 'bolt', title: 'Voltooi 1 bonusuitdaging', desc: 'Extra bandbreedte: je eerste bonus is binnen.', test: (s) => s.completedBonus >= 1 },
  { code: 'bonus5', icon: 'bolt', title: 'Voltooi 5 bonusuitdagingen', desc: 'Je haalt alles uit de link.', test: (s) => s.completedBonus >= 5 },
  { code: 'perfect', icon: 'target', title: 'Zero packet loss', desc: 'Beantwoord alle vragen in een uitdaging goed.', test: (s) => s.perfect },
  { code: 'streak3', icon: 'flame', title: 'Streak van 3 weken', desc: '3 weken op rij je uitdaging op tijd afgerond.', test: (s) => s.streak >= 3 },
  { code: 'streak6', icon: 'flame', title: 'Streak van 6 weken', desc: '6 weken op rij: dat is uptime!', test: (s) => s.streak >= 6 },
  { code: 'xp2500', icon: 'star', title: 'Behaal 2.500 XP', desc: 'Verzamel 2.500 XP met uitdagingen.', test: (s) => s.xp >= 2500 },
  { code: 'level2', icon: 'badge', title: 'Bereik level 2', desc: `Word ${LEVELS[1].name}. Minimaal ${LEVELS[1].min.toLocaleString('nl-NL')} XP.`, test: (s) => s.level.level >= 2 },
  { code: 'level3', icon: 'badge', title: 'Bereik level 3', desc: `Word ${LEVELS[2].name}. Minimaal ${LEVELS[2].min.toLocaleString('nl-NL')} XP.`, test: (s) => s.level.level >= 3 },
  { code: 'level4', icon: 'badge', title: 'Bereik level 4', desc: `Word ${LEVELS[3].name}. Minimaal ${LEVELS[3].min.toLocaleString('nl-NL')} XP.`, test: (s) => s.level.level >= 4 },
];

function evaluateAchievements(userId, now = Date.now(), ctx) {
  const stats = userStats(userId, now, ctx);
  const have = new Set(db.prepare('SELECT code FROM user_achievements WHERE user_id = ?').all(userId).map((r) => r.code));
  const ins = db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, code, unlocked_at) VALUES (?, ?, ?)');
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.code) && a.test(stats)) {
      ins.run(userId, a.code, now);
      unlocked.push({ code: a.code, icon: a.icon, title: a.title, desc: a.desc });
    }
  }
  return unlocked;
}

module.exports = {
  LEVELS, ACHIEVEMENTS, QUESTION_TYPES, STEP_TYPES, ON_TIME_BONUS,
  levelFor, checkAnswer, solutionFor, publicStep, normalizeChallenge,
  getSteps, currentSeason, userStats, evaluateAchievements,
};
