// GitHub Trending → 어제 대비 "신규 진입 AI 레포"만 → Gemini 한국어 요약 → Discord
// env: DISCORD_WEBHOOK (필수), GEMINI_API_KEY (선택, 없으면 repo description 폴백)
import fs from 'node:fs';
import path from 'node:path';

const STATE = 'trending/latest.json';      // 직전 실행분(=어제)
const SNAP_DIR = 'trending/snapshots';     // 일자별 보관
const WEBHOOK = process.env.DISCORD_WEBHOOK;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
if (!WEBHOOK) { console.error('DISCORD_WEBHOOK 없음'); process.exit(1); }

// 단어경계 매칭 (maigret 의 'ai' 같은 부분일치 오탐 방지)
const AI_RE = /\b(a\.?i|llms?|agents?|agentic|gpt|claude|gemini|openai|anthropic|machine\s*learning|deep\s*learning|neural|diffusion|rag|transformers?|nlp|embeddings?|chatbots?|genai|copilot|mcp)\b/i;

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();

async function fetchTrending(since) {
  const r = await fetch(`https://github.com/trending?since=${since}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (trending-bot)' },
  });
  if (!r.ok) throw new Error(`fetch ${since} ${r.status}`);
  const h = await r.text();
  return h.split('<article').slice(1).map((a) => {
    const rep = (a.match(/<h2[\s\S]*?href="\/([^"]+)"/) || [])[1];
    if (!rep) return null;
    const lang = (a.match(/programmingLanguage">([^<]+)</) || [])[1] || '';
    const today = (a.match(/([\d,]+)\s*stars (?:today|this week)/) || [])[1] || '';
    const descM = a.match(/<p class="[^"]*color-fg-muted[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    return { rep: rep.trim(), lang: lang.trim(), today, desc: descM ? strip(descM[1]) : '' };
  }).filter(Boolean);
}

const isAI = (r) => AI_RE.test(`${r.rep} ${r.lang} ${r.desc}`);

async function geminiSummarize(r) {
  if (!GEMINI_KEY) return r.desc || '(설명 없음)';
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const prompt = `GitHub 레포를 한국어 한 문장(40자 내외)으로 요약. 과장/홍보 빼고 무엇을 하는지만.\n레포: ${r.rep}\n설명: ${r.desc || '(없음)'}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    if (!res.ok) { console.error('gemini', res.status, (await res.text()).slice(0,200)); return r.desc || '(설명 없음)'; }
    const j = await res.json();
    const t = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return t || r.desc || '(설명 없음)';
  } catch (e) { console.error('gemini err', e.message); return r.desc || '(설명 없음)'; }
}

function loadPrev() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; }
}

// ── main ──
const date = kstDate();
const cur = await fetchTrending('daily');
if (!cur.length) throw new Error('파싱 0건 — GitHub HTML 변경?');

const prev = loadPrev();
const prevSet = new Set(prev?.list?.map((x) => x.rep) || []);
const enteredAI = cur.filter((x) => !prevSet.has(x.rep) && isAI(x));

let payload;
if (!prev) {
  payload = { username: 'GitHub Trending', embeds: [{
    title: `GitHub Trending — ${date} (KST)`, color: 0x2ea043,
    description: '첫 baseline 저장 완료. 내일부터 신규 진입 AI 레포만 요약해서 보냄.' }] };
} else if (!enteredAI.length) {
  payload = { username: 'GitHub Trending', embeds: [{
    title: `GitHub Trending — ${date} (KST)`, color: 0x8b949e,
    description: `오늘 신규 진입한 AI 레포 없음 (어제 ${prev.date} 대비).` }] };
} else {
  const fields = [];
  for (const r of enteredAI) {
    const sum = await geminiSummarize(r);
    fields.push({
      name: `🤖 ${r.rep}  +${r.today || '0'} ${r.lang ? `· ${r.lang}` : ''}`,
      value: `${sum}\nhttps://github.com/${r.rep}`.slice(0, 1024),
    });
  }
  payload = { username: 'GitHub Trending', embeds: [{
    title: `🆕 신규 AI 트렌딩 — ${date} (KST) · ${enteredAI.length}건`,
    url: 'https://github.com/trending', color: 0x2ea043, fields,
    footer: { text: `vs ${prev.date} · claude-ops` } }] };
}

const post = await fetch(WEBHOOK, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
if (!post.ok) throw new Error(`discord ${post.status} ${await post.text()}`);
console.log(`posted. newAI=${enteredAI.length} total=${cur.length}`);

// 스냅샷 영속화 (다음 diff용 + 일자별)
fs.mkdirSync(SNAP_DIR, { recursive: true });
const state = { date, list: cur.map(({ rep, lang, today }) => ({ rep, lang, today })) };
fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
fs.writeFileSync(path.join(SNAP_DIR, `${date}.json`), JSON.stringify(state, null, 2));
console.log('snapshot saved', date);
