# sentry-slack-setup 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 16 App Router 프로젝트에 Sentry SDK + Slack 알림 webhook + `captureError` 헬퍼를 일괄 설정하는 Claude Code 팀 스킬 `sentry-slack-setup`을 `ldx-skills` 레포에 구현한다.

**Architecture:** 단일 스킬 디렉토리에 `SKILL.md`(워크플로우)와 `templates/`(webhook 라우트, errors 헬퍼) + `references/`(환경 가이드)를 배치. Sentry SDK 셋업은 `@sentry/wizard@latest`에 위임(사용자가 별도 터미널에서 직접 실행). 우리 스킬은 wizard가 다루지 않는 webhook/captureError/프로젝트별 변수 수집만 책임진다.

**Tech Stack:** Markdown + TypeScript 템플릿(.tmpl). 검증용 Node 스크립트(`scripts/render.mjs`)로 placeholder 치환. 골드 스탠다드는 `/Users/2509-n0032/repos/dw-life-platform-frontend`의 `app/api/sentry-webhook/route.ts`와 `lib/shared/errors.ts`.

**Spec 참조:** `docs/specs/2026-04-27-sentry-slack-skill-design.md`

**작업 레포:** `/Users/2509-n0032/repos/ldx-skills` (이미 git 초기화됨, branch: `main`)

---

## 검증 철학

- **byte-equal 가정 금지.** 골드 파일과 렌더 결과가 정확히 일치해야 한다는 가정은 비현실적(변수명 rename, derive 로직 등). 대신 다음 3종 검증을 모든 템플릿에 적용한다:
  1. `{{` 잔존 없음 (placeholder 누락 검증)
  2. tsc 통과 (구문/타입 정합성)
  3. 의미 매핑 체크리스트 (특정 식별자/패턴이 출력에 포함되어 있는가)
- **항상 git을 안전망으로 사용.** tsc 검증을 위해 골드 파일을 일시 덮어쓸 때는 backup → overwrite → restore 순서를 일관 적용. 검증 후 `git diff`로 골드 파일이 원상 복구됐는지 확인.

## 파일 구조 (구현 대상)

```
ldx-skills/
├── README.md                                          # 이미 존재
├── docs/
│   ├── specs/2026-04-27-sentry-slack-skill-design.md  # 이미 존재 (수정됨)
│   └── plans/2026-04-27-sentry-slack-skill-implementation.md  # 이 파일
├── scripts/
│   └── render.mjs                                     # placeholder 치환 도구 (Node ESM)
├── fixtures/
│   └── lifecanvas.json                                # 검증용 변수 세트
├── tmp/                                               # 검증 산출물 (gitignored)
└── skills/
    └── sentry-slack-setup/
        ├── SKILL.md                                   # 스킬 워크플로우 (frontmatter + 6 phase)
        ├── config-schema.md                           # .sentry-skill.json 스키마
        ├── templates/
        │   ├── webhook-route.ts.tmpl
        │   └── errors.ts.tmpl
        └── references/
            ├── env-vars.md
            ├── sentry-console-setup.md
            ├── slack-app-setup.md
            └── test-scenarios.md
```

각 파일의 책임:
- `SKILL.md`: Claude가 로드해서 그대로 실행하는 워크플로우 (가장 중요한 산출물)
- `templates/*.tmpl`: 사용자 프로젝트에 생성될 파일의 원본. `{{VAR}}` placeholder
- `references/*.md`: Phase 5/6에서 사용자에게 출력되는 안내
- `config-schema.md`: `.sentry-skill.json` 스키마 reference
- `scripts/render.mjs`: placeholder 치환 도구 (검증·디버깅용. 스킬 자체 동작에는 불필요)
- `fixtures/lifecanvas.json`: 골드 비교용 LifeCanvas 변수 세트

---

## Task 0: 골드 파일 인벤토리

**목적:** placeholder 결정을 코드 인스펙션으로 lock-in 한다. 이 단계 없이 템플릿화하면 누락/과잉 placeholder가 나온다.

**Files:** (Read only)
- `/Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts`
- `/Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts`

- [ ] **Step 1: 두 골드 파일을 전체 읽고 다음 항목을 메모**

`webhook-route.ts`:
- `SENTRY_ORG_URL` 상수 정의 라인
- `GITLAB_COMMIT_BASE` 상수 정의 라인 (변수명 변경 대상)
- `allowedTagKeys` 배열 정의 라인
- `shortKeys` 배열 정의 라인
- Slack 메시지 text의 프로젝트 라벨 (`[LifeCanvas:...]`) 라인

`errors.ts`:
- `ErrorCategory` 타입 정의 라인
- `CaptureErrorOptions` interface 전체 (특히 `lifebookId` 같은 도메인 ID 필드)
- `scope.setTag` 호출 라인들

- [ ] **Step 2: 인벤토리 결과를 plan에 명문화**

webhook-route.ts placeholder 4개로 lock-in:
- `{{PROJECT_LABEL}}` (string): Slack text label
- `{{SENTRY_ORG_URL}}` (string): SENTRY_ORG_URL 상수 값
- `{{REPO_COMMIT_BASE_URL}}` (string): commit base 상수 값
- `{{ALLOWED_TAG_KEYS}}` (array): allowedTagKeys 정의

errors.ts placeholder 1개로 lock-in:
- `{{CATEGORY_UNION}}` (union): ErrorCategory 타입의 우변

**중요한 결정:** errors.ts.tmpl은 LifeCanvas의 errors.ts와 byte-equal을 시도하지 않는다. LifeCanvas 골드는 `lifebookId` 같은 도메인 ID 필드를 갖지만, 템플릿은 일반 captureError 헬퍼로 단순화한다 (사용자가 필요 시 도메인 필드를 추가). 이로써 `DOMAIN_ID_FIELDS`/`DOMAIN_TAG_SETTERS` 같은 추가 placeholder를 도입하지 않는다 (spec과 일치).

- [ ] **Step 3: 별도 커밋 없이 다음 task로 진행** (이 task는 인스펙션·결정 단계)

---

## Task 1: 디렉토리 구조 + Node 검증 도구 + fixture

**Files:**
- Create: `.gitignore`
- Create: `scripts/render.mjs`
- Create: `fixtures/lifecanvas.json`
- Create: `skills/sentry-slack-setup/` 빈 구조

- [ ] **Step 1: `.gitignore` 작성**

```gitignore
node_modules/
*.log
.DS_Store
/tmp/
```

- [ ] **Step 2: `fixtures/lifecanvas.json` 작성** — JSON에 직접 TS 직렬화 결과를 넣지 않고 raw 값을 둠. 직렬화는 render.mjs가 처리.

```json
{
  "PROJECT_LABEL": "LifeCanvas",
  "SENTRY_ORG_URL": "https://idstrust-lu.sentry.io",
  "REPO_COMMIT_BASE_URL": "http://10.0.101.108:3000/share/dw-life-platform-group/dw-life-platform-frontend/-/commit",
  "ALLOWED_TAG_KEYS": ["browser", "category", "device", "environment", "level", "lifebookId", "os", "release", "replayId", "url"],
  "CATEGORY_UNION": ["lifebook", "export", "viewer"]
}
```

> `CATEGORY_UNION`은 fixture에서 배열로 두고, render.mjs가 `'a' | 'b' | 'c'` 형태로 직렬화한다. 이렇게 하면 fixture가 가장 단순.

- [ ] **Step 3: `scripts/render.mjs` 작성**

```js
#!/usr/bin/env node
// Usage: node scripts/render.mjs <template> <fixture.json>
// Replaces {{KEY}} in template with fixture[KEY], serialized per type:
//   string  -> raw insert
//   array (ALLOWED_TAG_KEYS, etc) -> TS single-quote array literal: ['a', 'b']
//   array under key ending with _UNION -> TS union: 'a' | 'b' | 'c'
//
// Exits non-zero on missing template/fixture or unresolved placeholders.

import { readFileSync } from 'node:fs'
import { argv, exit, stderr } from 'node:process'

if (argv.length !== 4) {
  stderr.write(`Usage: node ${argv[1]} <template> <fixture.json>\n`)
  exit(1)
}

const [, , templatePath, fixturePath] = argv
const template = readFileSync(templatePath, 'utf8')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

const serializeArray = (arr) => `[${arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(', ')}]`
const serializeUnion = (arr) => arr.map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(' | ')

const serialize = (key, value) => {
  if (Array.isArray(value)) {
    return key.endsWith('_UNION') ? serializeUnion(value) : serializeArray(value)
  }
  if (typeof value === 'string') return value
  throw new Error(`unsupported value type for key ${key}: ${typeof value}`)
}

let output = template
for (const [key, value] of Object.entries(fixture)) {
  const serialized = serialize(key, value)
  const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
  output = output.replace(pattern, serialized)
}

const leftover = output.match(/\{\{[A-Z_]+\}\}/g)
if (leftover) {
  stderr.write(`unresolved placeholders: ${[...new Set(leftover)].join(', ')}\n`)
  exit(2)
}

process.stdout.write(output)
```

- [ ] **Step 4: render.mjs 자체 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
mkdir -p tmp
chmod +x scripts/render.mjs
# 더미 템플릿으로 직렬화 검증
cat > tmp/dummy.tmpl <<'EOF'
const label = '{{PROJECT_LABEL}}'
const tags = {{ALLOWED_TAG_KEYS}}
type Cat = {{CATEGORY_UNION}}
EOF
node scripts/render.mjs tmp/dummy.tmpl fixtures/lifecanvas.json
```

Expected output:
```
const label = 'LifeCanvas'
const tags = ['browser', 'category', 'device', 'environment', 'level', 'lifebookId', 'os', 'release', 'replayId', 'url']
type Cat = 'lifebook' | 'export' | 'viewer'
```

배열은 TS 단일 따옴표 + 공백, union은 ` | ` 구분자. 검증 OK면 dummy.tmpl 삭제.

- [ ] **Step 5: 누락 placeholder 검증**

```bash
echo 'const x = {{NOT_DEFINED}}' > tmp/missing.tmpl
node scripts/render.mjs tmp/missing.tmpl fixtures/lifecanvas.json; echo "exit=$?"
rm tmp/missing.tmpl
```

Expected: stderr에 `unresolved placeholders: {{NOT_DEFINED}}`, `exit=2`.

- [ ] **Step 6: skills 디렉토리 골격 + 커밋**

```bash
mkdir -p skills/sentry-slack-setup/{templates,references}
touch skills/sentry-slack-setup/.gitkeep
git add -A
git commit -m "chore: 검증 도구·fixture·디렉토리 구조 추가

- scripts/render.mjs: placeholder 치환 도구 (배열은 TS single-quote, _UNION은 union으로 직렬화)
- fixtures/lifecanvas.json: 골드 비교용 LifeCanvas 변수 세트
- skills/sentry-slack-setup/ 빈 구조"
```

---

## Task 2: `webhook-route.ts.tmpl`

**골드:** `/Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts`

- [ ] **Step 1: 골드 복사**

```bash
cd /Users/2509-n0032/repos/ldx-skills
cp /Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts \
   skills/sentry-slack-setup/templates/webhook-route.ts.tmpl
```

- [ ] **Step 2: placeholder 치환**

`skills/sentry-slack-setup/templates/webhook-route.ts.tmpl`을 다음과 같이 수정:

1. `const SENTRY_ORG_URL = 'https://idstrust-lu.sentry.io'` →
   `const SENTRY_ORG_URL = '{{SENTRY_ORG_URL}}'`
2. `const GITLAB_COMMIT_BASE = 'http://...'` →
   `const REPO_COMMIT_BASE = '{{REPO_COMMIT_BASE_URL}}'`
   - 변수명을 `GITLAB_COMMIT_BASE` → `REPO_COMMIT_BASE`로 변경 (GitHub 호환)
   - 사용처도 모두 업데이트 (1군데: `${GITLAB_COMMIT_BASE}/${displayValue}`)
3. `const allowedTagKeys = [ 'browser', ... ]` 배열 정의 전체를 →
   `const allowedTagKeys = {{ALLOWED_TAG_KEYS}}`
4. `const shortKeys = [...]` 배열 정의를 →
   `const shortKeys = allowedTagKeys.filter((k) => k !== 'url')` (`url`은 long-form이므로 short에서 제외, `replayId`는 short에 포함)
5. Slack text의 `[LifeCanvas:${environment}]` → `[{{PROJECT_LABEL}}:${environment}]`

- [ ] **Step 3: 렌더 + placeholder 잔존 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
node scripts/render.mjs skills/sentry-slack-setup/templates/webhook-route.ts.tmpl \
  fixtures/lifecanvas.json > tmp/webhook-route.rendered.ts
echo "exit=$?"
```

Expected: `exit=0`, `tmp/webhook-route.rendered.ts` 생성됨.

- [ ] **Step 4: 의미 매핑 체크리스트**

```bash
cd /Users/2509-n0032/repos/ldx-skills
grep -q "SENTRY_ORG_URL = 'https://idstrust-lu.sentry.io'" tmp/webhook-route.rendered.ts && echo "OK org"
grep -q "REPO_COMMIT_BASE = 'http://10.0.101.108" tmp/webhook-route.rendered.ts && echo "OK repo"
grep -q "\[LifeCanvas:\${environment}\]" tmp/webhook-route.rendered.ts && echo "OK label"
grep -q "lifebookId" tmp/webhook-route.rendered.ts && echo "OK domain tag in allowed"
grep -q "shortKeys = allowedTagKeys.filter((k) => k !== 'url')" tmp/webhook-route.rendered.ts && echo "OK shortKeys derive"
```

Expected: 5개 OK 모두 출력. 하나라도 누락 시 Step 2 재작업.

- [ ] **Step 5: tsc 검증 (backup → overwrite → restore)**

```bash
GOLD=/Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts
BACKUP=/tmp/route.ts.backup.$$
cp "$GOLD" "$BACKUP"
cp tmp/webhook-route.rendered.ts "$GOLD"
cd /Users/2509-n0032/repos/dw-life-platform-frontend
pnpm exec tsc --noEmit 2>&1 | grep -E 'sentry-webhook/route\.ts' && tsc_failed=1 || tsc_failed=0
cp "$BACKUP" "$GOLD"
rm "$BACKUP"
# 안전 복구 검증
git diff --quiet -- app/api/sentry-webhook/route.ts && echo "RESTORED OK" || echo "RESTORE FAILED"
[ $tsc_failed -eq 0 ] && echo "tsc OK" || echo "tsc FAILED"
```

Expected: `RESTORED OK`, `tsc OK` 둘 다 출력.

- [ ] **Step 6: 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git add skills/sentry-slack-setup/templates/webhook-route.ts.tmpl
git commit -m "feat(sentry-slack-setup): webhook 라우트 템플릿 추가

PROJECT_LABEL/SENTRY_ORG_URL/REPO_COMMIT_BASE_URL/ALLOWED_TAG_KEYS
4개 placeholder. shortKeys는 allowedTagKeys.filter로 derive."
```

---

## Task 3: `errors.ts.tmpl`

**골드:** `/Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts`

**설계 결정 (Task 0 Step 2 참조):** `errors.ts.tmpl`은 일반 captureError 헬퍼로 만든다. LifeCanvas 골드의 `lifebookId` 같은 도메인 ID 필드는 템플릿에 포함하지 않는다. placeholder는 `{{CATEGORY_UNION}}` 1개.

- [ ] **Step 1: 골드 복사 + 도메인 필드 제거**

```bash
cd /Users/2509-n0032/repos/ldx-skills
cp /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts \
   skills/sentry-slack-setup/templates/errors.ts.tmpl
```

이어서 템플릿 파일을 다음과 같이 수정:

1. `ErrorCategory` 타입 정의를 →
   ```ts
   export type ErrorCategory = {{CATEGORY_UNION}}
   ```
2. `CaptureErrorOptions` interface에서 도메인 ID 필드 (예: `lifebookId?: string`) 모두 제거. 일반 필드(`category`, `level`, `context`, `userId`)만 남긴다.
3. `captureError` 함수 본문에서 도메인 ID destructure 및 `scope.setTag('lifebookId', lifebookId)` 같은 도메인-specific 호출 모두 제거.
4. import / Sentry scope 기본 설정은 유지.

- [ ] **Step 2: 렌더 + placeholder 잔존 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
node scripts/render.mjs skills/sentry-slack-setup/templates/errors.ts.tmpl \
  fixtures/lifecanvas.json > tmp/errors.rendered.ts
echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: 의미 매핑 체크리스트**

```bash
grep -q "type ErrorCategory = 'lifebook' | 'export' | 'viewer'" tmp/errors.rendered.ts && echo "OK union"
grep -q "function captureError" tmp/errors.rendered.ts && echo "OK fn"
grep -q "scope.setTag('category'" tmp/errors.rendered.ts && echo "OK tag"
grep -q "lifebookId" tmp/errors.rendered.ts && echo "FAIL: domain field leaked" || echo "OK no domain field"
```

Expected: `OK union`, `OK fn`, `OK tag`, `OK no domain field` 모두 출력.

- [ ] **Step 4: tsc 검증**

errors.ts는 골드 파일과 시그니처가 다르므로(도메인 필드 제거), 골드 파일 자리에 그대로 덮어쓰면 호출자(`captureError(..., { lifebookId })`)에서 ts 에러가 난다. 대신 **fixture 디렉토리에 임시 standalone 검증 환경**을 만든다:

```bash
cd /Users/2509-n0032/repos/ldx-skills
mkdir -p tmp/tsc-errors
cp tmp/errors.rendered.ts tmp/tsc-errors/errors.ts
cat > tmp/tsc-errors/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["errors.ts"]
}
EOF
# Sentry import 경로 검증을 위해 dw-life-platform-frontend의 node_modules 활용
cd tmp/tsc-errors
ln -sf /Users/2509-n0032/repos/dw-life-platform-frontend/node_modules .
pnpm exec tsc --noEmit 2>&1 | head -20
echo "tsc exit=$?"
cd /Users/2509-n0032/repos/ldx-skills
rm -rf tmp/tsc-errors
```

Expected: tsc 에러 없음, `tsc exit=0`.

- [ ] **Step 5: 커밋**

```bash
git add skills/sentry-slack-setup/templates/errors.ts.tmpl
git commit -m "feat(sentry-slack-setup): captureError 헬퍼 템플릿 추가

CATEGORY_UNION 1개 placeholder. 도메인별 ID 필드는 포함하지 않는
일반 헬퍼로 단순화 (사용자가 필요 시 직접 확장)."
```

---

## Task 4: `config-schema.md`

**Files:** Create `skills/sentry-slack-setup/config-schema.md`

- [ ] **Step 1: 작성**

````markdown
# .sentry-skill.json 스키마

스킬 적용 결과를 기록하는 파일. 사용자 프로젝트 루트에 생성된다.
재실행 시 변수 default 값으로 사용된다.

## 필드

| 키 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `version` | `number` | ✅ | 스키마 버전. 항상 `1` |
| `projectLabel` | `string` | ✅ | Slack 메시지 prefix (예: `LifeCanvas`) |
| `sentryOrgUrl` | `string` | ✅ | Sentry organization URL |
| `repoCommitBaseUrl` | `string` | ✅ | 저장소 커밋 base URL. GitLab은 `/-/commit`, GitHub은 `/commit` |
| `categories` | `string[]` | ✅ | `captureError` 카테고리 멤버. 빈 배열이면 `['general']` |
| `allowedTagKeys` | `string[]` | ✅ | Slack에 노출할 Sentry 태그 키. 자동 도출 (Sentry 기본 9종 + `domainTagKeys`) |
| `domainTagKeys` | `string[]` | ⬜️ | 프로젝트 도메인별 태그 (예: `["lifebookId"]`) |
| `appliedAt` | `string` | ✅ | ISO8601 날짜 |
| `skippedItems` | `string[]` | ✅ | 스킵된 산출물 경로 목록 |

## Sentry 기본 태그 9종

`['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'replayId', 'url']`

## 예시

```json
{
  "version": 1,
  "projectLabel": "LifeCanvas",
  "sentryOrgUrl": "https://idstrust-lu.sentry.io",
  "repoCommitBaseUrl": "http://10.0.101.108:3000/share/dw-life-platform-group/dw-life-platform-frontend/-/commit",
  "categories": ["lifebook", "export", "viewer"],
  "allowedTagKeys": ["browser", "category", "device", "environment", "level", "lifebookId", "os", "release", "replayId", "url"],
  "domainTagKeys": ["lifebookId"],
  "appliedAt": "2026-04-27",
  "skippedItems": []
}
```
````

- [ ] **Step 2: JSON 예시 유효성 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
awk '/^```json$/{f=1;next} /^```$/{f=0} f' skills/sentry-slack-setup/config-schema.md | jq -e '.version == 1' >/dev/null && echo OK
```

Expected: `OK`.

- [ ] **Step 3: 커밋**

```bash
git add skills/sentry-slack-setup/config-schema.md
git commit -m "docs(sentry-slack-setup): .sentry-skill.json 스키마 정의"
```

---

## Task 5: `references/env-vars.md`

(이전 plan의 Task 5와 동일)

- [ ] **Step 1: 작성** — 다음 내용을 `skills/sentry-slack-setup/references/env-vars.md`에 작성

```markdown
# 환경변수 가이드

스킬 적용 후 사용자 프로젝트의 `.env.local`에 다음 키를 추가해야 한다.
스킬은 `.env.local`을 자동 작성하지 않는다.

## 필수

| 키 | 설명 | 예시 |
|---|---|---|
| `SENTRY_DSN` | Sentry 프로젝트 DSN | `https://abcdef@oXXXXX.ingest.sentry.io/YYYY` |
| `NEXT_PUBLIC_SENTRY_DSN` | 클라이언트 측 동일 DSN | 위와 동일 |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL | `https://hooks.slack.com/services/T.../B.../...` |

## 선택

| 키 | 설명 | 기본 동작 |
|---|---|---|
| `SENTRY_WEBHOOK_DRY_RUN` | `true`로 설정하면 webhook이 Slack 전송 없이 페이로드만 응답으로 반환 | 미설정 = 실제 전송 |

## .gitignore 확인

`.env.local`이 `.gitignore`에 포함되어 있는지 확인한다.
```

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/env-vars.md
git commit -m "docs(sentry-slack-setup): 환경변수 가이드 추가"
```

---

## Task 6: `references/sentry-console-setup.md`

- [ ] **Step 1: 작성**

````markdown
# Sentry 콘솔 셋업 (수동)

## 1. Internal Integration 생성

Sentry 콘솔 > **Settings** > **Custom Integrations** > **Create New Integration** > **Internal Integration**.

| 필드 | 값 |
|---|---|
| Name | 예: `Slack Webhook Notifier` |
| Webhook URL | `<배포 도메인>/api/sentry-webhook` |
| Permissions | `Issue & Event: Read` (최소) |
| Webhooks 이벤트 | `issue` 또는 `error` 체크 |

## 2. Alert Rule 연결

**Alerts** > **Create Alert** > **Issue Alert** > Action에서 위에서 만든 Internal Integration 선택.

## 3. 로컬 테스트

```bash
curl -X POST http://localhost:3000/api/sentry-webhook \
  -H 'Content-Type: application/json' \
  -d '{"action":"created","data":{"event":{"event_id":"test","title":"Test","level":"error","tags":[]}},"actor":{"type":"system","id":"0","name":"sentry"}}'
```

`SENTRY_WEBHOOK_DRY_RUN=true`로 설정하면 응답 JSON에 `slackMessage` 필드가 포함된다.
````

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/sentry-console-setup.md
git commit -m "docs(sentry-slack-setup): Sentry Internal Integration 셋업 가이드"
```

---

## Task 7: `references/slack-app-setup.md`

- [ ] **Step 1: 작성**

````markdown
# Slack Incoming Webhook 발급 (수동)

## 1. Slack App 생성

https://api.slack.com/apps > **Create New App** > **From scratch**.

## 2. Incoming Webhook 활성화

**Features > Incoming Webhooks** 토글 활성화 → **Add New Webhook to Workspace** → 채널 선택.
생성된 Webhook URL(`https://hooks.slack.com/services/T.../B.../...`)을 복사한다.

## 3. 환경변수

복사한 URL을 `.env.local`의 `SLACK_WEBHOOK_URL`에 설정. `references/env-vars.md` 참조.

## 4. 테스트

```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"sentry-slack-setup 테스트"}' \
  $SLACK_WEBHOOK_URL
```

채널에 메시지가 도착하면 OK.
````

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/slack-app-setup.md
git commit -m "docs(sentry-slack-setup): Slack Webhook 발급 가이드"
```

---

## Task 8: `references/test-scenarios.md`

- [ ] **Step 1: 작성** — 5개 시나리오 (Greenfield / Brownfield / 부분설치 / 재실행 / 강제적용)

```markdown
# 검증 시나리오

스킬 자체는 마크다운 + 템플릿이라 단위 테스트보다 시나리오 검증으로 확인한다.

## 시나리오 1. Greenfield (Sentry 미설치)

**초기 상태:** 빈 Next.js 16 App Router 프로젝트.

**기대:**
- [ ] Phase 1: Claude가 사용자에게 "별도 터미널에서 `npx @sentry/wizard@latest -i nextjs` 실행 후 알려달라" 요청
- [ ] 사용자 완료 후: wizard 산출 파일이 git status에 보이고, Phase 3/4가 webhook + errors.ts 생성
- [ ] `.sentry-skill.json` 생성

**검증:**
- [ ] `pnpm exec tsc --noEmit` 통과
- [ ] `app/api/sentry-webhook/route.ts`에 `{{` 잔존 없음

## 시나리오 2. Brownfield (현재 dw-life-platform-frontend)

**초기 상태:** 모든 자산 존재.

**기대:**
- [ ] 모든 phase 스킵, 차이 리포트만 출력
- [ ] git status에 변경된 파일 없음

## 시나리오 3. 부분 설치

**초기 상태:** SDK는 있음, webhook/errors는 없음.

**기대:**
- [ ] Phase 1 스킵, Phase 3/4가 새 파일 생성
- [ ] sentry config 파일은 미변경

## 시나리오 4. 재실행

**초기 상태:** 시나리오 1 완료 상태.

**기대:**
- [ ] `.sentry-skill.json` 로드 → default 값 자동 사용
- [ ] 모든 자산 스킵, 코드 미변경

## 시나리오 5. 강제 적용

**입력:** 사용자가 "덮어써도 돼" 발화.

**기대:**
- [ ] 덮어쓸 파일 목록 출력 + 추가 확인 받음
- [ ] 추가 확인 후에만 Write 발생
```

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/test-scenarios.md
git commit -m "docs(sentry-slack-setup): 검증 시나리오 5종 추가"
```

---

## Task 9: `SKILL.md`

이 task가 가장 중요. SKILL.md는 Claude Code가 로드해서 그대로 실행하는 플레이북.

**Files:**
- Create: `skills/sentry-slack-setup/SKILL.md`
- Delete: `skills/sentry-slack-setup/.gitkeep`

- [ ] **Step 1: frontmatter + 개요**

```markdown
---
name: sentry-slack-setup
description: Use when adding Sentry error tracking + Slack notification webhook to a Next.js 16 App Router project. Installs Sentry SDK via the official wizard, creates a webhook route that forwards Sentry events to Slack with project-specific labels and links, and creates a captureError helper with project-defined error categories. Trigger phrases include "Sentry 붙여줘", "Sentry Slack 알림", "sentry-webhook 라우트".
---

# sentry-slack-setup

Next.js 16 App Router 프로젝트에 Sentry SDK + Slack 알림 webhook + `captureError` 헬퍼를 일괄 설정한다.

## 산출물 (사용자 프로젝트에 추가됨)

- `@sentry/nextjs`, `@slack/webhook` 의존성
- Sentry SDK 설정 파일 (wizard가 생성)
- `app/api/sentry-webhook/route.ts` (이 스킬)
- `lib/shared/errors.ts` (이 스킬)
- `.sentry-skill.json` (변수 기록용)
```

- [ ] **Step 2: Phase 워크플로우**

```markdown
## 워크플로우

각 phase 시작 시 TaskCreate로 task 생성, 완료 시 TaskUpdate.

### Phase 0. 컨텍스트 탐색

1. `package.json` 읽기 → `@sentry/nextjs`, `@slack/webhook` 의존성 확인
2. `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` 중 어떤 게 있는지 확인하여 패키지 매니저 감지
3. `next.config.{ts,js,mjs}` 읽기 → `withSentryConfig` 적용 여부 확인
4. `git config --get remote.origin.url` 실행 → repo URL 추출
5. 기존 `.sentry-skill.json` 존재 확인 → 있으면 재실행 모드, 변수 default로 사용

### Phase 1. Sentry SDK

`@sentry/nextjs` 설치 분기:

- **미설치:**
  - `@sentry/wizard`는 인터랙티브(Sentry 로그인, org/project 선택)이므로 **Bash 도구로 직접 실행하지 않는다**
  - 사용자에게 다음과 같이 요청:
    > "Sentry SDK가 미설치입니다. **별도 터미널**을 열고 다음 명령을 실행해주세요:
    > `npx @sentry/wizard@latest -i nextjs` (또는 pnpm/yarn dlx 등가물)
    > 완료되면 알려주세요."
  - 사용자가 완료를 보고하면: `git status` 또는 `git diff --name-only HEAD`로 wizard가 생성한 파일 목록 확인 → 차이 리포트의 "생성" 항목에 추가

- **설치됨:** 버전 + 기존 설정 파일 목록을 차이 리포트의 "스킵"에 기록

### Phase 2. 프로젝트 변수 수집

#### 자동 추론

| 변수 | 출처 | fallback |
|---|---|---|
| `projectLabel` | `package.json`의 `name`을 PascalCase 변환 | 사용자 입력 |
| `repoCommitBaseUrl` | `git remote get-url origin` (GitLab `/-/commit`, GitHub `/commit`) | 사용자 입력 |
| `sentryOrgUrl` | `.sentryclirc` 또는 사용자 입력 | 사용자 입력 |

#### 사용자에게 한 번에 한 개씩 묻기

1. 프로젝트 라벨 (Slack prefix). 추론값을 default로 제시.
2. repo commit base URL.
3. Sentry org URL.
4. `captureError` 카테고리 (쉼표 구분). 빈 입력 → `["general"]`. 영문 소문자만 허용 (대문자/공백 입력 시 재요청).
5. 도메인 태그 키 (쉼표 구분, 선택). 빈 입력 허용.

재실행 모드면 모든 default를 `.sentry-skill.json`의 기존 값으로 채운다.

#### `allowedTagKeys` 자동 도출

```js
const SENTRY_DEFAULTS = ['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'replayId', 'url']
allowedTagKeys = [...new Set([...SENTRY_DEFAULTS, ...domainTagKeys])].sort()
```

#### `.sentry-skill.json` 기록

`config-schema.md`의 스키마에 맞춰 프로젝트 루트에 작성.

### Phase 3. Webhook 라우트 적용

1. `@slack/webhook` 미설치 시 사용자 동의 후 설치 (감지된 패키지 매니저 사용):
   - pnpm: `pnpm add @slack/webhook`
   - npm: `npm install @slack/webhook`
   - yarn: `yarn add @slack/webhook`
2. `app/api/sentry-webhook/route.ts` 분기:
   - **존재:** 차이 분석 (Write 안 함). 항목:
     - dedupe 로직 (`recentWebhooks` Map + `DEDUPE_WINDOW_MS`)
     - 프로젝트 라벨 (`[<label>:...]` 패턴)
     - 허용 태그 키 (정의 vs 권장 차집합)
     - replay 링크 패턴 (`/replays/${id}/`)
     - commit 링크 패턴 (`<base>/<release>`)
     - dry-run 처리 (`SENTRY_WEBHOOK_DRY_RUN`)
   - **미존재:** `templates/webhook-route.ts.tmpl`을 Read → Phase 2 변수로 치환 → Write
3. 치환은 다음 직렬화 규칙으로 수행:
   - 문자열: 따옴표 없이 그대로
   - 배열: TS 단일 따옴표 (예: `['a', 'b']`)
   - union: `'a' | 'b' | 'c'`
4. 치환 결과에 `{{` 잔존 시 phase 중단 + 사용자에게 보고

### Phase 4. captureError 헬퍼 적용

1. `lib/shared/errors.ts` 분기:
   - **존재:** 차이 분석. 항목:
     - `ErrorCategory` union 멤버 (추가 멤버는 사용자 도메인 확장으로 보존)
     - `captureError(error, options)` 시그니처
     - `options` 필드 (`level`, `context`, `userId`)
     - `scope.setTag` 호출 패턴
   - **미존재:** `templates/errors.ts.tmpl`을 Read → `{{CATEGORY_UNION}}`을 union 직렬화로 치환 → Write
2. 도메인별 ID 필드(예: `lifebookId`)는 템플릿이 자동 추가하지 않는다. 사용자 안내: "도메인별 ID 필드가 필요하면 errors.ts에 직접 추가하세요."

### Phase 5. 환경변수 가이드

`references/env-vars.md` 내용 출력. `.env.local` 자동 작성하지 않음.

`.gitignore`에 `.env.local` 누락 시 안내.

### Phase 6. 차이 리포트

다음 마크다운 포맷으로 콘솔 출력:

```markdown
# sentry-slack-setup 리포트

## 적용 결과
- ✅ 생성: <path>
- ⏭️  스킵: <path> (<이유>)

## 차이 (스킵된 항목)
### <path>
- ❌ 누락: <항목>
- ⚠️  불일치: <항목> — 현재 `<현재값>`, 권장 `<권장값>`
- ✅ 일치: <항목>

## 다음 단계 (수동)
1. references/sentry-console-setup.md 참조하여 Internal Integration 생성
2. references/slack-app-setup.md 참조하여 Slack Webhook URL 발급
3. references/env-vars.md 참조하여 .env.local 작성
```
```

- [ ] **Step 3: 안전장치 + 치환 규칙 작성**

```markdown
## 안전장치

### 파일 덮어쓰기 금지 (기본)

기존 파일은 항상 스킵 + 리포트. Write 안 함.

### 강제 적용 (예외)

사용자 발화에 다음 중 하나가 명시적으로 포함될 때만 발동:
- "강제 적용"
- "덮어써도 돼"
- "force overwrite"

발동 시:
1. 덮어쓸 파일 목록 출력
2. "<N>개 파일을 덮어씁니다. 진행할까요?" 추가 확인
3. 명확한 "예" 응답에서만 Write
4. 거부/모호 → 모든 파일 보존

기본은 비활성. 재실행해도 자동 활성되지 않음.

### 패키지 매니저

lock 파일로 감지:
- `pnpm-lock.yaml` → pnpm
- `package-lock.json` → npm
- `yarn.lock` → yarn

설치/dlx 명령은 감지된 매니저에 맞춰 사용.

### Sentry wizard 실행

wizard는 인터랙티브 명령이다. Bash 도구로 직접 실행하면 hang/실패한다. 항상 사용자에게 별도 터미널 실행을 요청한다.

### .env.local 자동 수정 금지

`references/env-vars.md`로 안내만.

## 참조 파일

- `templates/webhook-route.ts.tmpl` — Phase 3
- `templates/errors.ts.tmpl` — Phase 4
- `references/env-vars.md` — Phase 5
- `references/sentry-console-setup.md` — Phase 6 다음 단계
- `references/slack-app-setup.md` — Phase 6 다음 단계
- `references/test-scenarios.md` — 스킬 검증 (스킬 동작에는 미사용)
- `config-schema.md` — `.sentry-skill.json` 스키마
```

- [ ] **Step 4: frontmatter 및 참조 파일 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills/skills/sentry-slack-setup
head -4 SKILL.md
awk '/^description:/{print length($0)}' SKILL.md
for f in templates/webhook-route.ts.tmpl templates/errors.ts.tmpl \
         references/env-vars.md references/sentry-console-setup.md \
         references/slack-app-setup.md references/test-scenarios.md \
         config-schema.md; do
  [ -f "$f" ] || echo "MISSING: $f"
done
echo OK
```

Expected: frontmatter 4줄 (`---`, `name`, `description`, `---`), description 길이 200자 이상, MISSING 라인 없음, `OK`.

- [ ] **Step 5: .gitkeep 삭제 + 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
rm -f skills/sentry-slack-setup/.gitkeep
git add -A
git commit -m "feat(sentry-slack-setup): SKILL.md 워크플로우 정의

frontmatter + 6 phase + 안전장치 + 치환 규칙.
wizard는 사용자가 별도 터미널에서 실행하도록 명시."
```

---

## Task 10: 통합 검증 (Brownfield dry-run)

골드 레포에 대해 시나리오 2(Brownfield)를 dry-run으로 검증.

- [ ] **Step 1: 두 템플릿 모두 렌더하여 의미 매핑 재확인**

```bash
cd /Users/2509-n0032/repos/ldx-skills
mkdir -p tmp
node scripts/render.mjs skills/sentry-slack-setup/templates/webhook-route.ts.tmpl fixtures/lifecanvas.json > tmp/webhook-route.rendered.ts
node scripts/render.mjs skills/sentry-slack-setup/templates/errors.ts.tmpl fixtures/lifecanvas.json > tmp/errors.rendered.ts
! grep -l '{{' tmp/webhook-route.rendered.ts tmp/errors.rendered.ts && echo "no leftover placeholders"
```

Expected: `no leftover placeholders`.

- [ ] **Step 2: webhook 의미 매핑 재확인**

Task 2 Step 4의 5개 grep을 다시 실행. 5개 모두 OK.

- [ ] **Step 3: errors 의미 매핑 재확인**

Task 3 Step 3의 4개 grep을 다시 실행. 4개 모두 OK.

- [ ] **Step 4: SKILL.md를 시나리오 2 체크리스트로 자체 점검**

`references/test-scenarios.md`의 시나리오 2를 손으로 따라가며 SKILL.md 워크플로우가 각 단계를 안내하는지 확인. Phase 1 스킵 → Phase 3/4 차이 분석만 → Phase 6 리포트 출력 흐름이 누락 없이 명시되어 있어야 함.

- [ ] **Step 5: 최종 git 상태 확인**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git status
git log --oneline
find skills/sentry-slack-setup -type f | sort
```

Expected:
- working tree clean
- 커밋 히스토리: 초기 spec/plan + Task 1~9 커밋
- skills/sentry-slack-setup 트리에 8개 파일 (SKILL.md, config-schema.md, templates 2개, references 4개)

---

## 완료 후

- [ ] 스킬을 실제로 사용하려면:

```bash
ln -s /Users/2509-n0032/repos/ldx-skills/skills/sentry-slack-setup ~/.claude/skills/sentry-slack-setup
```

- [ ] 향후 GitHub `L-DXD/ldx-skills`로 push, 팀원이 clone 후 동일 위치에 링크하면 공유.
