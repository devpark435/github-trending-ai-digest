// GitHub Trending → 어제 대비 "신규 진입 AI 레포"만 → Gemini 한국어 요약 → Discord
// env: DISCORD_WEBHOOK (필수), GEMINI_API_KEY (선택, 없으면 repo description 폴백)
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from './card.mjs';

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

async function postJson(payload) {
  const r = await fetch(WEBHOOK, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`discord ${r.status} ${await r.text()}`);
}

// Discord 메시지당 임베드/첨부 최대 10 → 카드 10장씩 배치. 임베드 url=레포(제목 클릭 링크).
async function postCardBatch(batch) {
  const form = new FormData();
  const embeds = batch.map((it, i) => {
    const emb = { title: it.rep, url: `https://github.com/${it.rep}`, color: 0x2ea043 };
    if (it.png) {
      form.append(`files[${i}]`, new Blob([it.png], { type: 'image/png' }), `card${i}.png`);
      emb.image = { url: `attachment://card${i}.png` };
    } else {
      emb.description = String(it.sum || '').slice(0, 4096);   // 렌더 실패 시 텍스트 폴백
    }
    return emb;
  });
  form.append('payload_json', JSON.stringify({ username: 'GitHub Trending', embeds }));
  const r = await fetch(WEBHOOK, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`discord ${r.status} ${await r.text()}`);
}

if (!prev) {
  await postJson({ username: 'GitHub Trending', embeds: [{
    title: `GitHub Trending — ${date} (KST)`, color: 0x2ea043,
    description: '첫 baseline 저장 완료. 내일부터 신규 진입 AI 레포만 카드로 보냄.' }] });
} else if (!enteredAI.length) {
  await postJson({ username: 'GitHub Trending', embeds: [{
    title: `GitHub Trending — ${date} (KST)`, color: 0x8b949e,
    description: `오늘 신규 진입한 AI 레포 없음 (어제 ${prev.date} 대비).` }] });
} else {
  // 각 레포: 요약 + 카드 PNG 렌더
  const items = [];
  for (const r of enteredAI) {
    const sum = await geminiSummarize(r);
    let png = null;
    try { png = await renderCard({ rep: r.rep, lang: r.lang, today: r.today, sum, date }); }
    catch (e) { console.error('card render fail', r.rep, e.message); }
    items.push({ rep: r.rep, sum, png });
  }
  // 헤더 임베드 먼저, 이어서 카드 10장씩
  await postJson({ username: 'GitHub Trending', embeds: [{
    title: `🆕 신규 AI 트렌딩 — ${date} (KST) · ${enteredAI.length}건`,
    url: 'https://github.com/trending', color: 0x2ea043,
    footer: { text: `vs ${prev.date}` } }] });
  for (let i = 0; i < items.length; i += 10) await postCardBatch(items.slice(i, i + 10));
}
console.log(`posted. newAI=${enteredAI.length} total=${cur.length}`);

// 스냅샷 영속화 (다음 diff용 + 일자별)
fs.mkdirSync(SNAP_DIR, { recursive: true });
const state = { date, list: cur.map(({ rep, lang, today }) => ({ rep, lang, today })) };
fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
fs.writeFileSync(path.join(SNAP_DIR, `${date}.json`), JSON.stringify(state, null, 2));
console.log('snapshot saved', date);
