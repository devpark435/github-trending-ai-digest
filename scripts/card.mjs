// 레포 정보 → 카드 PNG (satori로 레이아웃 → resvg로 PNG). LLM/토큰 안 씀, 순수 렌더.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FONT = (w) => fs.readFileSync(path.join(DIR, '..', 'assets', 'fonts', `Pretendard-${w}.otf`));
const fonts = [
  { name: 'Pretendard', data: FONT('Regular'), weight: 400, style: 'normal' },
  { name: 'Pretendard', data: FONT('Bold'), weight: 700, style: 'normal' },
];

// GitHub 언어색(자주 뜨는 것만; 없으면 회색)
const LANG_COLOR = {
  Python: '#3572A5', TypeScript: '#3178c6', JavaScript: '#f1e05a', Shell: '#89e051',
  Rust: '#dea584', Go: '#00ADD8', Swift: '#F05138', C: '#555555', 'C++': '#f34b7d',
  Java: '#b07219', Ruby: '#701516', Kotlin: '#A97BFF', Haskell: '#5e5086',
  'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', Dart: '#00B4AB',
};

// satori vnode 헬퍼 (JSX 없이 순수 객체)
const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

const COLORS = {
  bg: '#0d1117', card: '#161b22', border: '#30363d',
  brand: '#2ea043', text: '#e6edf3', muted: '#8b949e', star: '#e3b341',
};

function cardTree({ rep, lang, today, sum, date }) {
  const langColor = LANG_COLOR[lang] || '#8b949e';
  return h('div', {
    width: 1200, height: 630, display: 'flex', flexDirection: 'column',
    backgroundColor: COLORS.bg, padding: 56, fontFamily: 'Pretendard', color: COLORS.text,
  }, [
    // 상단 바
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }, [
      h('div', { display: 'flex', alignItems: 'center' }, [
        h('div', { display: 'flex', width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.brand, marginRight: 14 }),
        h('div', { display: 'flex', fontSize: 30, fontWeight: 700, color: COLORS.brand }, '신규 AI 트렌딩'),
      ]),
      h('div', { display: 'flex', fontSize: 26, color: COLORS.muted }, `${date} · KST`),
    ]),
    // 본문 카드
    h('div', {
      display: 'flex', flexDirection: 'column', flexGrow: 1,
      backgroundColor: COLORS.card, border: `2px solid ${COLORS.border}`, borderRadius: 24, padding: 48,
    }, [
      h('div', { display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 28 }, rep),
      h('div', { display: 'flex', alignItems: 'center', marginBottom: 36 }, [
        h('div', { display: 'flex', width: 20, height: 20, borderRadius: 10, backgroundColor: langColor, marginRight: 12 }),
        h('div', { display: 'flex', fontSize: 30, color: COLORS.muted, marginRight: 32 }, lang || '—'),
        h('div', { display: 'flex', fontSize: 30, color: COLORS.star }, `★ +${today || '0'} today`),
      ]),
      h('div', { display: 'flex', fontSize: 40, lineHeight: 1.45, color: COLORS.text, flexGrow: 1 }, sum || ''),
      h('div', { display: 'flex', fontSize: 26, color: COLORS.muted, marginTop: 24 }, `github.com/${rep}`),
    ]),
  ]);
}

export async function renderCard(repo) {
  const svg = await satori(cardTree(repo), { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
