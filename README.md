# github-trending-ai-digest

> GitHub 트렌딩에 **새로 진입한 AI 관련 레포**만 골라 한국어로 요약해 매일 Discord로 보내는 봇.
> *A daily bot that detects newly-trending AI repositories on GitHub, summarizes them in Korean, and posts to Discord.*

매일 아침, "어제는 없었는데 오늘 트렌딩에 새로 뜬 AI 레포"만 추려서 한 줄 요약과 함께 Discord 채널로 알려줍니다. 트렌딩 전체를 훑는 피로 없이, **놓치면 아까운 신규 AI 프로젝트만** 받아봅니다.

## 동작 방식

```
GitHub Trending(daily) 스크랩
      │
      ├─ 어제 스냅샷과 비교 → 신규 진입 레포만 추출
      ├─ AI 키워드 필터 (단어경계 매칭으로 오탐 방지)
      ├─ Gemini(gemini-2.5-flash-lite)로 한국어 40자 요약
      │
      ▼
Discord 웹훅으로 임베드 전송  +  오늘 스냅샷 커밋(다음 비교용)
```

1. **스크랩** — `https://github.com/trending?since=daily` HTML 파싱 (레포/언어/오늘 스타/설명).
2. **신규 diff** — 직전 실행분(`trending/latest.json`)과 비교해 새로 올라온 레포만 남김.
3. **AI 필터** — `ai / llm / agent / gpt / claude / rag / diffusion / mcp …` 단어경계 정규식. `maigret`의 'ai' 같은 부분일치 오탐 방지.
4. **요약** — Gemini `flash-lite` + `thinkingBudget:0`으로 과장 없이 "무엇을 하는지"만 한 문장. 키/쿼터 문제 시 레포 설명으로 자동 폴백.
5. **전송 & 영속화** — Discord 임베드 게시 후, 오늘 목록을 `trending/latest.json` + `trending/snapshots/<날짜>.json`으로 저장(다음날 diff 기준).

첫 실행은 비교 대상이 없어 baseline만 저장하고, **다음날부터** 신규 레포를 요약해 보냅니다.

## 실행 스케줄

- 매일 **KST 08:00** (GitHub Actions cron `0 23 * * *` UTC) 자동 실행.
- `workflow_dispatch`로 수동 실행/테스트 가능.
- GitHub 클라우드에서 돌기 때문에 로컬 PC가 꺼져 있어도 동작합니다.

## 셋업

### 1. 필요한 Secrets (repo → Settings → Secrets and variables → Actions)

| 이름 | 필수 | 용도 |
|------|------|------|
| `DISCORD_WEBHOOK` | ✅ | 메시지를 보낼 Discord 채널 웹훅 URL |
| `GEMINI_API_KEY` | 선택 | 한국어 요약용. 없으면 레포 원본 설명으로 폴백 |

> `DISCORD_WEBHOOK`은 Discord 채널 → 설정 → 연동 → 웹훅에서 발급합니다.
> `GEMINI_API_KEY`는 [Google AI Studio](https://aistudio.google.com/apikey)에서 무료 발급.

### 2. 로컬 테스트

```bash
DISCORD_WEBHOOK="https://discord.com/api/webhooks/..." \
GEMINI_API_KEY="AIza..." \
node scripts/trending-discord.mjs
```

## 왜 flash-lite인가

무료 `gemini-2.5-flash`는 **하루 20 요청** 캡 + thinking 토큰이 출력 한도를 잡아먹어 요약이 잘리는 문제가 있습니다. `gemini-2.5-flash-lite`는 별도의 넉넉한 무료 쿼터를 쓰고, `thinkingBudget:0`으로 thinking을 꺼 온전한 요약을 반환합니다.

## 구조

```
.github/workflows/trending-discord.yml   # 스케줄 + 실행 워크플로
scripts/trending-discord.mjs             # 스크랩·필터·요약·전송 (의존성 없는 순수 Node)
trending/latest.json                     # 직전 실행 스냅샷(diff 기준)
trending/snapshots/<날짜>.json            # 일자별 보관
```

의존성 없음(Node 20+ 내장 `fetch`만 사용). 봇이 매 실행마다 스냅샷을 커밋하므로 트렌딩 히스토리가 레포에 함께 쌓입니다.

## 라이선스

MIT
