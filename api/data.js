import { createClient } from '@supabase/supabase-js';

const CHILDREN = ['zsolo', 'denes'];
const INITIAL = { limit: 150, players: { zsolo: { days: {} }, denes: { days: {} } } };

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function ensureDay(state, child, date = dayKey()) {
  if (!CHILDREN.includes(child)) throw new Error('Ismeretlen gyerek');
  state.players ||= {};
  state.players[child] ||= { days: {} };
  state.players[child].days ||= {};
  state.players[child].days[date] ||= { sessions: [], active: null };
  return state.players[child].days[date];
}
function duration(s, now = Date.now()) { return Math.max(0, Math.floor(((s.end ?? now) - s.start) / 1000)); }
function total(p) { return (p?.sessions || []).reduce((n,s)=>n+duration(s),0)+(p?.active?duration(p.active):0); }
function structuredCloneSafe(x) { return JSON.parse(JSON.stringify(x)); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST szükséges' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.PARENT_PIN) {
    return res.status(503).json({ error: 'A szerver környezeti változói még nincsenek beállítva.' });
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  try {
    const { data: row, error: readError } = await supabase.from('gametime_state').select('state').eq('id',1).maybeSingle();
    if (readError) throw readError;
    let state = row?.state || structuredCloneSafe(INITIAL);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action;
    const oldLimit = Number(state.limit || 150);
    let autoClosed = false;
    const now = Date.now();
    for (const child of CHILDREN) {
      const days = state.players?.[child]?.days || {};
      for (const [date, p] of Object.entries(days)) {
        if (!p?.active) continue;
        const start = Number(p.active.start);
        const safetyEnd = start + 6 * 60 * 60 * 1000;
        const usedBefore = (p.sessions || []).reduce((n,s)=>n+duration(s),0);
        const limitEnd = start + Math.max(0, Number(state.limit || 150) * 60 * 1000 - usedBefore * 1000);
        const end = Math.min(now, safetyEnd, limitEnd);
        if (now >= safetyEnd || now >= limitEnd) {
          if (end > start) p.sessions.push({ start, end });
          p.active = null;
          autoClosed = true;
        }
      }
    }
    if (action === 'get') {
      if (autoClosed) {
        const { error: autoWriteError } = await supabase.from('gametime_state').upsert({ id:1, state, updated_at:new Date().toISOString() });
        if (autoWriteError) throw autoWriteError;
      }
      return res.status(200).json({ state });
    }
    if (action === 'getLogs') {
      const { data: logs, error: logError } = await supabase.from('gametime_audit_log').select('id,created_at,action,child,minutes,old_limit,new_limit').order('created_at',{ascending:false}).limit(100);
      if (logError) throw logError;
      return res.status(200).json({ logs: logs || [] });
    }
    if (['setLimit','adjust','reset','editSession','deleteSession'].includes(action) && req.headers['x-parent-pin'] !== process.env.PARENT_PIN) {
      return res.status(403).json({ error: 'Szülői PIN szükséges' });
    }
    if (action === 'start') {
      const p = ensureDay(state, body.child, body.date || dayKey());
      if (p.active) return res.status(409).json({ error: 'Ez a játékidő már fut' });
      p.active = { start: Date.now() };
    } else if (action === 'stop') {
      const p = ensureDay(state, body.child, body.date || dayKey());
      if (!p.active) return res.status(409).json({ error: 'Nincs elindított játékidő' });
      p.sessions.push({ start:p.active.start, end:Date.now() }); p.active = null;
    } else if (action === 'setLimit') {
      const limit = Math.floor(Number(body.limit));
      if (!Number.isFinite(limit) || limit < 1 || limit > 1440) return res.status(400).json({ error: 'A keret 1 és 1440 perc között lehet' });
      state.limit = limit;
    } else if (action === 'adjust') {
      const minutes = Math.floor(Number(body.minutes));
      if (!CHILDREN.includes(body.child) || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return res.status(400).json({ error: 'Hibás korrekció' });
      const p = ensureDay(state, body.child, body.date || dayKey());
      if (p.active) { p.sessions.push({ start:p.active.start, end:Date.now() }); p.active = null; }
      let left = minutes * 60;
      for (let i = p.sessions.length - 1; i >= 0 && left > 0; i--) {
        const s = p.sessions[i], cut = Math.min(duration(s), left);
        s.end -= cut * 1000; left -= cut;
        if (duration(s) <= 0) p.sessions.splice(i,1);
      }
    } else if (action === 'editSession') {
      if (!CHILDREN.includes(body.child) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !Number.isFinite(Number(body.start)) || !Number.isFinite(Number(body.minutes)) || Number(body.minutes)<1 || Number(body.minutes)>1440) return res.status(400).json({ error:'Hibás alkalom-módosítás' });
      const p = ensureDay(state, body.child, body.date);
      const session = (p.sessions || []).find(s=>Number(s.start)===Number(body.start));
      if (!session) return res.status(404).json({ error:'A játékalkalom nem található' });
      session.end = session.start + Math.floor(Number(body.minutes))*60000;
    } else if (action === 'deleteSession') {
      if (!CHILDREN.includes(body.child) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !Number.isFinite(Number(body.start))) return res.status(400).json({ error:'Hibás alkalom-törlés' });
      const p = ensureDay(state, body.child, body.date);
      const before = (p.sessions || []).length;
      p.sessions = (p.sessions || []).filter(s=>Number(s.start)!==Number(body.start));
      if (p.sessions.length === before) return res.status(404).json({ error:'A játékalkalom nem található' });
    } else if (action === 'reset') {
      const p = ensureDay(state, body.child, body.date || dayKey()); p.sessions = []; p.active = null;
    } else {
      return res.status(400).json({ error:'Ismeretlen művelet' });
    }
    const { error: writeError } = await supabase.from('gametime_state').upsert({ id:1, state, updated_at:new Date().toISOString() });
    if (writeError) throw writeError;
    if (['setLimit','adjust','reset'].includes(action)) {
      const logEntry = { action, child: action === 'setLimit' ? null : body.child, minutes: action === 'adjust' ? Math.floor(Number(body.minutes)) : null, old_limit: action === 'setLimit' ? oldLimit : null, new_limit: action === 'setLimit' ? Number(state.limit) : null };
      const { error: auditError } = await supabase.from('gametime_audit_log').insert(logEntry);
      if (auditError) throw auditError;
    }
    return res.status(200).json({ state });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error:'Szerverhiba, ellenőrizd az adatbázis beállítását.' });
  }
}