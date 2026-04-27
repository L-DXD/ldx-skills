# sentry-slack-setup 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 16 App Router 프로젝트에 Sentry SDK + Slack 알림 webhook + `captureError` 헬퍼를 일괄 설정하는 Claude Code 팀 스킬 `sentry-slack-setup`을 `ldx-skills` 레포에 구현한다.

**Architecture:** 단일 스킬 디렉토리에 `SKILL.md`(워크플로우)와 `templates/`(webhook 라우트, errors 헬퍼) + `references/`(환경 가이드)를 배치. Sentry SDK 셋업은 `@sentry/wizard@latest`에 위임하고, 우리 스킬은 위저드가 다루지 않는 webhook/captureError/프로젝트별 변수 수집만 책임진다. 검증은 골드 스탠다드(`dw-life-platform-frontend`의 실제 파일)와 placeholder 치환 결과의 diff로 한다.

**Tech Stack:** Markdown + TypeScript 템플릿(.tmpl). 검증용 셸 스크립트(`scripts/render.sh`)로 placeholder 치환. 골드 스탠다드 fixture는 `/Users/2509-n0032/repos/dw-life-platform-frontend`의 실제 파일.

**Spec 참조:** `docs/specs/2026-04-27-sentry-slack-skill-design.md`

**작업 레포:** `/Users/2509-n0032/repos/ldx-skills` (이미 git 초기화됨, branch: `main`)

---

## 파일 구조 (구현 대상)

```
ldx-skills/
├── README.md                                          # 이미 존재
├── docs/
│   ├── specs/2026-04-27-sentry-slack-skill-design.md  # 이미 존재
│   └── plans/2026-04-27-sentry-slack-skill-implementation.md  # 이 파일
├── scripts/
│   └── render.sh                                      # placeholder 치환 검증 도구
├── fixtures/
│   └── lifecanvas.json                                # 검증용 변수 세트
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
- `templates/*.tmpl`: 사용자 프로젝트에 생성될 파일의 원본. `{{VAR}}` placeholder 사용
- `references/*.md`: Phase 5/6에서 사용자에게 출력되는 안내 문서
- `config-schema.md`: `.sentry-skill.json` 스키마 reference (사람·LLM 둘 다 읽음)
- `scripts/render.sh`: placeholder 치환 도구 (검증 + 디버깅용. 스킬 자체 동작에는 불필요)
- `fixtures/lifecanvas.json`: 골드 스탠다드 비교용 변수 세트

---

## Task 1: 디렉토리 구조 + 검증 도구 + fixture

**Files:**
- Create: `scripts/render.sh`
- Create: `fixtures/lifecanvas.json`
- Create: `skills/sentry-slack-setup/.gitkeep` (디렉토리 보존용, 이후 task에서 실파일 채우면 삭제)
- Create: `.gitignore`

- [ ] **Step 1: `.gitignore` 작성**

```gitignore
node_modules/
*.log
.DS_Store
/tmp/
```

- [ ] **Step 2: `fixtures/lifecanvas.json` 작성** — 골드 스탠다드 비교에 사용할 LifeCanvas 변수 세트

```json
{
  "PROJECT_LABEL": "LifeCanvas",
  "SENTRY_ORG_URL": "https://idstrust-lu.sentry.io",
  "REPO_COMMIT_BASE_URL": "http://10.0.101.108:3000/share/dw-life-platform-group/dw-life-platform-frontend/-/commit",
  "ALLOWED_TAG_KEYS": ["browser", "category", "device", "environment", "level", "lifebookId", "os", "replayId", "release", "url"],
  "CATEGORY_UNION": "'lifebook' | 'export' | 'viewer'",
  "DOMAIN_TAG_KEYS": ["lifebookId"]
}
```

> 주의: `dw-life-platform-frontend`의 실제 webhook route는 `allowedTagKeys`에 `lifebookId`를 포함하지만 `replayId`는 별도 처리한다. 이 fixture는 spec의 "Sentry 기본 9종 + domainTagKeys" 도출 규칙(replayId 포함)을 따르되, 골드 비교 시 replayId 처리 라인은 별도 검증한다.

- [ ] **Step 3: `scripts/render.sh` 작성** — placeholder 치환 도구

```bash
#!/usr/bin/env bash
# Usage: scripts/render.sh <template> <fixture.json> > out
# Replaces {{KEY}} in template with fixture[KEY].
# Array values become JSON array literals; string values are inserted as-is (no quoting).

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <template> <fixture.json>" >&2
  exit 1
fi

template="$1"
fixture="$2"

[ -f "$template" ] || { echo "template not found: $template" >&2; exit 1; }
[ -f "$fixture" ] || { echo "fixture not found: $fixture" >&2; exit 1; }

# Use jq to extract each key, then sed -i to substitute.
content=$(cat "$template")
keys=$(jq -r 'keys[]' "$fixture")

while IFS= read -r key; do
  value=$(jq -c --arg k "$key" '.[$k]' "$fixture")
  # If value is JSON string, strip surrounding quotes (we want raw substitution)
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:-1}"
  fi
  # Escape replacement characters for awk
  content=$(awk -v key="{{${key}}}" -v val="$value" '
    {
      while ((idx = index($0, key)) > 0) {
        $0 = substr($0, 1, idx - 1) val substr($0, idx + length(key))
      }
      print
    }
  ' <<<"$content")
done <<<"$keys"

printf '%s\n' "$content"
```

- [ ] **Step 4: 스크립트 권한 + 도구 가용성 확인**

```bash
chmod +x scripts/render.sh
which jq awk  # both must exist; macOS ships with awk; jq from brew
echo "no template yet" > /tmp/dummy.tmpl
scripts/render.sh /tmp/dummy.tmpl fixtures/lifecanvas.json
```

Expected: `no template yet` 출력 (placeholder 없으니 그대로). 에러 없이 종료.

- [ ] **Step 5: `skills/sentry-slack-setup/.gitkeep` 생성**

```bash
mkdir -p skills/sentry-slack-setup/{templates,references}
touch skills/sentry-slack-setup/.gitkeep
```

- [ ] **Step 6: 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git add -A
git commit -m "chore: 검증 도구·fixture·디렉토리 구조 추가

- scripts/render.sh: 템플릿 placeholder 치환 도구
- fixtures/lifecanvas.json: 골드 스탠다드 비교용 변수 세트
- skills/sentry-slack-setup/ 빈 디렉토리 생성"
```

---

## Task 2: `webhook-route.ts.tmpl` 작성 + 골드 비교

**골드 스탠다드:** `/Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts`

**Files:**
- Create: `skills/sentry-slack-setup/templates/webhook-route.ts.tmpl`
- 검증 산출물: `tmp/webhook-route.rendered.ts` (gitignored)

**핵심 변환 매핑** (골드 → 템플릿):
| 골드 라인 | 템플릿 표현 |
|---|---|
| `'idstrust-lu.sentry.io'` 등 sentry org 호스트 | `{{SENTRY_ORG_URL}}` 변수로 치환된 형태 (스킴 포함 전체 URL) |
| GitLab commit base URL 하드코딩 | `{{REPO_COMMIT_BASE_URL}}` |
| `[LifeCanvas:${environment}]` | `[{{PROJECT_LABEL}}:${environment}]` |
| `allowedTagKeys` 배열 | `{{ALLOWED_TAG_KEYS}}` (JSON 배열로 치환) |
| `shortKeys` 배열 | `allowedTagKeys`와 동일하게 도출하되 `replayId` 제외 (코드 내에서 derive) |

- [ ] **Step 1: 골드 파일을 새 위치로 복사하여 베이스 확보**

```bash
cd /Users/2509-n0032/repos/ldx-skills
cp /Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts \
   skills/sentry-slack-setup/templates/webhook-route.ts.tmpl
```

- [ ] **Step 2: 템플릿화 — 하드코딩된 값을 placeholder로 치환**

`skills/sentry-slack-setup/templates/webhook-route.ts.tmpl`을 열어 다음을 수정:

1. `const SENTRY_ORG_URL = 'https://idstrust-lu.sentry.io'` → `const SENTRY_ORG_URL = '{{SENTRY_ORG_URL}}'`
2. `const GITLAB_COMMIT_BASE = 'http://10.0.101.108...'` → `const REPO_COMMIT_BASE = '{{REPO_COMMIT_BASE_URL}}'`
   - 변수명도 `GITLAB_COMMIT_BASE` → `REPO_COMMIT_BASE`로 변경 (GitHub 호환)
   - 사용처도 모두 변경
3. `allowedTagKeys` 배열 정의를 `const allowedTagKeys = {{ALLOWED_TAG_KEYS}}`로 치환
4. `shortKeys` 배열은 `allowedTagKeys.filter((k) => k !== 'replayId')`로 코드 내 derive 로 변경 (별도 placeholder 불필요)
5. Slack 메시지 텍스트 `[LifeCanvas:${environment}]` → `[{{PROJECT_LABEL}}:${environment}]`

- [ ] **Step 3: render.sh로 LifeCanvas 변수 치환**

```bash
cd /Users/2509-n0032/repos/ldx-skills
mkdir -p tmp
scripts/render.sh skills/sentry-slack-setup/templates/webhook-route.ts.tmpl \
  fixtures/lifecanvas.json > tmp/webhook-route.rendered.ts
```

Expected: 종료 코드 0, 출력 파일에 `{{` 문자열이 남아있지 않음.

- [ ] **Step 4: 검증 1 — placeholder 잔존 여부 확인**

```bash
! grep -n '{{' tmp/webhook-route.rendered.ts
```

Expected: grep이 매치를 못 찾아 종료 코드 1 반환 → `!`로 반전 → 종료 코드 0. 매치되면 실패.

- [ ] **Step 5: 검증 2 — 골드와 의미적 동등성 비교 (수동 diff)**

```bash
diff /Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts \
     tmp/webhook-route.rendered.ts
```

Expected diff:
- 변수명 `GITLAB_COMMIT_BASE` → `REPO_COMMIT_BASE` (rename)
- `shortKeys` 정의 방식만 다름 (배열 → derive). 결과 멤버는 동일해야 함

위 두 가지 외에 차이가 있으면 템플릿에 결함이 있는 것이므로 Step 2부터 다시.

- [ ] **Step 6: 검증 3 — 렌더 결과를 frontend 레포에 임시 배치하여 TypeScript 컴파일**

```bash
cp tmp/webhook-route.rendered.ts \
   /Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts.candidate
cd /Users/2509-n0032/repos/dw-life-platform-frontend
pnpm exec tsc --noEmit -p . 2>&1 | grep 'sentry-webhook/route.ts.candidate' || echo "no errors in candidate"
rm app/api/sentry-webhook/route.ts.candidate
```

Expected: `no errors in candidate` 출력 (해당 파일 관련 ts 에러 없음).

> 만약 `.candidate` 확장자로 인해 tsc가 무시한다면, 골드 파일을 백업 후 일시 덮어쓰고 검증 → 복구하는 방식으로 변경.

- [ ] **Step 7: `tmp/`는 .gitignore에 이미 포함됨 — 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git add skills/sentry-slack-setup/templates/webhook-route.ts.tmpl
git commit -m "feat(sentry-slack-setup): webhook 라우트 템플릿 추가

dw-life-platform-frontend의 route.ts를 베이스로
PROJECT_LABEL/SENTRY_ORG_URL/REPO_COMMIT_BASE_URL/ALLOWED_TAG_KEYS
4개 placeholder 도입. shortKeys는 allowedTagKeys에서 derive."
```

---

## Task 3: `errors.ts.tmpl` 작성 + 골드 비교

**골드 스탠다드:** `/Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts`

**핵심 변환 매핑:**
| 골드 라인 | 템플릿 표현 |
|---|---|
| `type ErrorCategory = 'lifebook' \| 'export' \| 'viewer' \| ...` | `type ErrorCategory = {{CATEGORY_UNION}}` |
| `lifebookId?: string` 등 도메인별 ID 필드 | `{{DOMAIN_TAG_KEYS}}` 기반 동적 생성 |

- [ ] **Step 1: 골드 파일 복사**

```bash
cd /Users/2509-n0032/repos/ldx-skills
cp /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts \
   skills/sentry-slack-setup/templates/errors.ts.tmpl
```

- [ ] **Step 2: 골드 파일의 정확한 인터페이스/시그니처 확인**

```bash
sed -n '1,80p' skills/sentry-slack-setup/templates/errors.ts.tmpl
```

읽고 다음을 메모: `ErrorCategory` 타입 정의 라인, `CaptureErrorOptions` interface 안의 도메인 ID 필드 라인, `scope.setTag` 호출 라인.

- [ ] **Step 3: 템플릿화**

수정 사항:
1. `ErrorCategory` 타입 정의를 `export type ErrorCategory = {{CATEGORY_UNION}}`로 변경
2. `CaptureErrorOptions` interface에서 도메인별 ID 필드(예: `lifebookId?: string`)는 두 가지 처리 방식 중 선택:
   - **선택 A (단순, 권장)**: `domainTagKeys`에 해당하는 필드를 한 줄로 표현 — `{{DOMAIN_ID_FIELDS}}` placeholder 도입 후 fixture에서 `"lifebookId?: string"` 형태로 채움
   - 본 plan에서는 선택 A로 진행. fixture에 `DOMAIN_ID_FIELDS` 키 추가 필요.
3. `scope.setTag` 호출도 도메인 키마다 한 줄씩 — `{{DOMAIN_TAG_SETTERS}}` placeholder 도입, fixture에서 `"if (lifebookId) scope.setTag('lifebookId', lifebookId);"` 형태로 채움

- [ ] **Step 4: fixture 업데이트** — `DOMAIN_ID_FIELDS`, `DOMAIN_TAG_SETTERS` 추가

`fixtures/lifecanvas.json`에 두 키 추가:

```json
"DOMAIN_ID_FIELDS": "  lifebookId?: string",
"DOMAIN_TAG_SETTERS": "    if (lifebookId) scope.setTag('lifebookId', lifebookId);"
```

> 들여쓰기는 errors.ts 골드 파일의 들여쓰기와 정확히 일치해야 함.

- [ ] **Step 5: 렌더 + placeholder 잔존 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
scripts/render.sh skills/sentry-slack-setup/templates/errors.ts.tmpl \
  fixtures/lifecanvas.json > tmp/errors.rendered.ts
! grep -n '{{' tmp/errors.rendered.ts
```

Expected: 종료 코드 0.

- [ ] **Step 6: 골드와 diff 비교**

```bash
diff /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts \
     tmp/errors.rendered.ts
```

Expected: 차이 없음(0줄). 차이가 있으면 fixture 또는 템플릿 들여쓰기 재조정.

- [ ] **Step 7: TypeScript 컴파일 검증** (Task 2 Step 6과 동일 방식, 백업→덮어쓰기→복구)

```bash
cp /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts /tmp/errors.ts.backup
cp tmp/errors.rendered.ts /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts
cd /Users/2509-n0032/repos/dw-life-platform-frontend
pnpm exec tsc --noEmit 2>&1 | grep 'lib/shared/errors.ts' || echo "no errors"
cp /tmp/errors.ts.backup lib/shared/errors.ts
```

Expected: `no errors` 출력.

- [ ] **Step 8: 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git add skills/sentry-slack-setup/templates/errors.ts.tmpl fixtures/lifecanvas.json
git commit -m "feat(sentry-slack-setup): captureError 헬퍼 템플릿 추가

CATEGORY_UNION/DOMAIN_ID_FIELDS/DOMAIN_TAG_SETTERS 3개 placeholder.
LifeCanvas 변수로 렌더 시 골드 파일과 byte-equal."
```

---

## Task 4: `config-schema.md` 작성

**Files:**
- Create: `skills/sentry-slack-setup/config-schema.md`

- [ ] **Step 1: 작성**

```markdown
# .sentry-skill.json 스키마

스킬 적용 결과를 기록하는 파일. 사용자 프로젝트 루트에 생성된다.
재실행 시 변수 default 값으로 사용된다.

## 필드

| 키 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `version` | `number` | ✅ | 현재 스키마 버전. 항상 `1` |
| `projectLabel` | `string` | ✅ | Slack 메시지 prefix (예: `LifeCanvas`) |
| `sentryOrgUrl` | `string` | ✅ | Sentry organization URL (예: `https://idstrust-lu.sentry.io`) |
| `repoCommitBaseUrl` | `string` | ✅ | 저장소 커밋 base URL. GitLab은 `/-/commit`, GitHub은 `/commit` |
| `categories` | `string[]` | ✅ | `captureError` 카테고리 union 멤버. 빈 배열이면 `['general']` |
| `allowedTagKeys` | `string[]` | ✅ | Slack에 노출할 Sentry 태그 키. 자동 도출 (Sentry 기본 9종 + `domainTagKeys`) |
| `domainTagKeys` | `string[]` | ⬜️ | 프로젝트 도메인별 태그 (예: `["lifebookId"]`). 빈 배열 허용 |
| `appliedAt` | `string` | ✅ | ISO8601 날짜 (예: `2026-04-27`) |
| `skippedItems` | `string[]` | ✅ | 스킵된 산출물 경로 목록 |

## Sentry 기본 태그 9종

`['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'url', 'replayId']`

## 예시

\`\`\`json
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
\`\`\`
```

- [ ] **Step 2: 셀프 체크 — JSON 예시가 유효한지**

```bash
cd /Users/2509-n0032/repos/ldx-skills
awk '/^```json$/{f=1;next} /^```$/{f=0} f' skills/sentry-slack-setup/config-schema.md | jq -e '.version == 1'
```

Expected: `true` 출력, 종료 코드 0.

- [ ] **Step 3: 커밋**

```bash
git add skills/sentry-slack-setup/config-schema.md
git commit -m "docs(sentry-slack-setup): .sentry-skill.json 스키마 정의"
```

---

## Task 5: `references/env-vars.md` 작성

**Files:**
- Create: `skills/sentry-slack-setup/references/env-vars.md`

- [ ] **Step 1: 작성**

```markdown
# 환경변수 가이드

스킬 적용 후 사용자 프로젝트의 `.env.local`에 다음 키를 추가해야 한다.
스킬은 `.env.local`을 자동 작성하지 않는다.

## 필수

| 키 | 설명 | 예시 |
|---|---|---|
| `SENTRY_DSN` | Sentry 프로젝트 DSN. Sentry 콘솔 > Project Settings > Client Keys (DSN) | `https://abcdef@oXXXXX.ingest.sentry.io/YYYY` |
| `NEXT_PUBLIC_SENTRY_DSN` | 클라이언트 측 동일 DSN (Next.js public env) | 위와 동일 |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL. `references/slack-app-setup.md` 참조 | `https://hooks.slack.com/services/T.../B.../...` |

## 선택

| 키 | 설명 | 기본 동작 |
|---|---|---|
| `SENTRY_WEBHOOK_DRY_RUN` | `true`로 설정하면 webhook이 Slack 전송 없이 페이로드만 응답으로 반환 | 미설정 = 실제 전송 |

## .gitignore 확인

`.env.local`이 `.gitignore`에 포함되어 있는지 확인한다. Next.js 16 기본 템플릿엔 포함되어 있으나, 직접 만든 프로젝트라면 누락될 수 있다.
```

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/env-vars.md
git commit -m "docs(sentry-slack-setup): 환경변수 가이드 추가"
```

---

## Task 6: `references/sentry-console-setup.md` 작성

**Files:**
- Create: `skills/sentry-slack-setup/references/sentry-console-setup.md`

- [ ] **Step 1: 작성**

````markdown
# Sentry 콘솔 셋업 (수동)

## 1. Internal Integration 생성

Sentry 콘솔 > **Settings** > **Custom Integrations** > **Create New Integration** > **Internal Integration** 선택.

| 필드 | 값 |
|---|---|
| Name | 예: `Slack Webhook Notifier` |
| Webhook URL | `<배포 도메인>/api/sentry-webhook` (예: `https://app.example.com/api/sentry-webhook`) |
| Permissions | `Issue & Event: Read` (최소) |
| Webhooks 이벤트 | `issue` 또는 `error` 체크 |

## 2. Alert Rule 연결

Sentry 콘솔 > **Alerts** > **Create Alert** > **Issue Alert**에서:

- 트리거 조건 설정 (예: "A new issue is created")
- Action: **Send a notification via an integration** > 위에서 만든 Internal Integration 선택

## 3. 테스트

배포된 환경에서 일부러 에러를 발생시켜 Slack 메시지가 도착하는지 확인.

로컬에서 테스트하려면:
- `SENTRY_WEBHOOK_DRY_RUN=true` 설정 후 webhook 라우트로 직접 POST
- 응답 JSON에 `slackMessage` 필드가 포함되면 정상

```bash
curl -X POST http://localhost:3000/api/sentry-webhook \
  -H 'Content-Type: application/json' \
  -d '{"action":"created","data":{"event":{"event_id":"test","title":"Test","level":"error","tags":[]}},"actor":{"type":"system","id":"0","name":"sentry"}}'
```
````

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/sentry-console-setup.md
git commit -m "docs(sentry-slack-setup): Sentry Internal Integration 셋업 가이드"
```

---

## Task 7: `references/slack-app-setup.md` 작성

**Files:**
- Create: `skills/sentry-slack-setup/references/slack-app-setup.md`

- [ ] **Step 1: 작성**

```markdown
# Slack Incoming Webhook 발급 (수동)

## 1. Slack App 생성

https://api.slack.com/apps > **Create New App** > **From scratch**.

| 필드 | 값 |
|---|---|
| App Name | 예: `Sentry Notifier` |
| Workspace | 알림을 받을 워크스페이스 |

## 2. Incoming Webhook 활성화

좌측 메뉴 **Features > Incoming Webhooks** > 토글 활성화.

**Add New Webhook to Workspace** 클릭 > 알림을 받을 채널 선택 > Allow.

생성된 **Webhook URL**을 복사한다 (`https://hooks.slack.com/services/T.../B.../...` 형태).

## 3. 환경변수 설정

복사한 URL을 사용자 프로젝트 `.env.local`의 `SLACK_WEBHOOK_URL` 값으로 설정한다. `references/env-vars.md` 참조.

## 4. 테스트

```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"sentry-slack-setup 테스트"}' \
  $SLACK_WEBHOOK_URL
```

Expected: 채널에 메시지 도착.
```

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/slack-app-setup.md
git commit -m "docs(sentry-slack-setup): Slack Incoming Webhook 발급 가이드"
```

---

## Task 8: `references/test-scenarios.md` 작성

**Files:**
- Create: `skills/sentry-slack-setup/references/test-scenarios.md`

- [ ] **Step 1: 작성**

```markdown
# 검증 시나리오

스킬 자체는 마크다운 + 템플릿이라 단위 테스트보다 시나리오 검증으로 확인한다.
각 시나리오는 수동 실행 + 체크리스트로 검증한다.

## 시나리오 1. Greenfield (Sentry 미설치)

**초기 상태:** 빈 Next.js 16 App Router 프로젝트. `@sentry/nextjs` 미설치, webhook 라우트 없음.

**기대 동작:**
- [ ] Phase 0: `package.json` 읽고 SDK 미설치 감지
- [ ] Phase 1: 사용자 동의 후 `npx @sentry/wizard@latest -i nextjs` 실행 → wizard가 SDK 설치 + 설정 파일 생성
- [ ] Phase 2: 자동 추론 + 인터랙티브 프롬프트로 변수 수집 → `.sentry-skill.json` 생성
- [ ] Phase 3: `app/api/sentry-webhook/route.ts` 생성, `@slack/webhook` 설치
- [ ] Phase 4: `lib/shared/errors.ts` 생성
- [ ] Phase 5/6: 환경변수 가이드 + 다음 단계 리포트 출력

**검증:**
- [ ] `pnpm exec tsc --noEmit` 통과
- [ ] `app/api/sentry-webhook/route.ts`에 placeholder(`{{`)가 남아있지 않음
- [ ] `.sentry-skill.json`이 config-schema.md 스펙과 일치

## 시나리오 2. Brownfield (현재 dw-life-platform-frontend)

**초기 상태:** 모든 자산이 이미 존재하는 레포.

**기대 동작:**
- [ ] Phase 1: SDK 설치됨 감지 → wizard 스킵
- [ ] Phase 3: webhook 라우트 존재 감지 → 차이 분석만 수행, Write 안 함
- [ ] Phase 4: errors.ts 존재 감지 → 차이 분석만, Write 안 함
- [ ] Phase 6: "스킵: ..." 리포트 + 차이 항목 (라벨 일치, dedupe 일치 등) 출력

**검증:**
- [ ] git status로 변경된 파일 없음 확인
- [ ] 리포트에 모든 phase가 "스킵"으로 기록됨

## 시나리오 3. 부분 설치 (SDK만 있음)

**초기 상태:** `@sentry/nextjs`는 설치됨 + `sentry.*.config.ts` 존재. webhook 라우트와 errors.ts는 없음.

**기대 동작:**
- [ ] Phase 1: SDK 설치됨 감지 → wizard 스킵
- [ ] Phase 3: webhook 라우트 미존재 → 생성
- [ ] Phase 4: errors.ts 미존재 → 생성

**검증:**
- [ ] `app/api/sentry-webhook/route.ts`, `lib/shared/errors.ts`만 새로 생성됨
- [ ] 기존 sentry config 파일은 변경되지 않음

## 시나리오 4. 재실행 (.sentry-skill.json 존재)

**초기 상태:** 시나리오 1을 한 번 완료한 상태. `.sentry-skill.json`이 존재하고 모든 자산이 적용됨.

**기대 동작:**
- [ ] Phase 0: 기존 `.sentry-skill.json` 로드 → 재실행 모드 진입
- [ ] Phase 2: 인터랙티브 프롬프트의 default 값이 기존 값으로 채워짐
- [ ] Phase 3/4: 모든 자산 존재 → 모두 스킵
- [ ] Phase 6: "재실행 모드: 변경 없음" 리포트

**검증:**
- [ ] `.sentry-skill.json`의 `appliedAt`만 갱신됨 (또는 변경 없음)
- [ ] 코드 파일은 변경되지 않음

## 시나리오 5. 강제 적용 ("덮어써도 돼")

**초기 상태:** 시나리오 2와 동일.

**입력:** 사용자가 명시적으로 "덮어써도 돼" 또는 "force overwrite" 발화.

**기대 동작:**
- [ ] Phase 0/1: 동일하게 스킵
- [ ] Phase 3: 덮어쓸 파일 목록 출력 + 사용자 추가 확인 받음
- [ ] Phase 3 (확인 후): webhook 라우트 덮어쓰기
- [ ] Phase 4: errors.ts도 동일

**검증:**
- [ ] 사용자가 추가 확인을 명시적으로 한 번 더 해야만 Write 발생
- [ ] 추가 확인 거부 시 모든 파일 보존
```

- [ ] **Step 2: 커밋**

```bash
git add skills/sentry-slack-setup/references/test-scenarios.md
git commit -m "docs(sentry-slack-setup): 검증 시나리오 5종 추가"
```

---

## Task 9: `SKILL.md` 작성 (워크플로우 정의)

**Files:**
- Create: `skills/sentry-slack-setup/SKILL.md`
- Delete: `skills/sentry-slack-setup/.gitkeep`

이 task가 가장 중요하다. SKILL.md는 Claude Code가 로드해서 그대로 실행하는 플레이북이다. 다른 모든 산출물(템플릿/references)을 참조한다.

- [ ] **Step 1: frontmatter + 개요 작성**

```markdown
---
name: sentry-slack-setup
description: Use when adding Sentry error tracking + Slack notification webhook to a Next.js 16 App Router project. Installs Sentry SDK via official wizard, creates webhook route that forwards Sentry events to Slack with project-specific labels and links, and creates a captureError helper with project-defined error categories.
---

# sentry-slack-setup

Next.js 16 App Router 프로젝트에 Sentry SDK + Slack 알림 webhook + `captureError` 헬퍼를 일괄 설정한다.

## 트리거

다음 같은 사용자 발화로 호출된다:
- "이 프로젝트에 Sentry 붙여줘"
- "Sentry → Slack 알림 연동해줘"
- "Sentry webhook 라우트 만들어줘"

## 산출물

스킬 적용 후 사용자 프로젝트에 다음이 추가된다:
- `@sentry/nextjs`, `@slack/webhook` 의존성
- Sentry SDK 설정 파일 (wizard가 생성)
- `app/api/sentry-webhook/route.ts` (이 스킬이 생성)
- `lib/shared/errors.ts` (이 스킬이 생성)
- `.sentry-skill.json` (이 스킬이 생성, 변수 기록용)

상세는 `docs/specs/2026-04-27-sentry-slack-skill-design.md` 참조.
```

- [ ] **Step 2: Phase 워크플로우 작성** — 6 phase 각각을 Claude가 실행 가능한 단계로

```markdown
## 워크플로우

다음 phase를 순서대로 진행한다. 각 phase 시작 시 TaskCreate로 task를 만들고 진행 중·완료 상태를 갱신한다.

### Phase 0. 컨텍스트 탐색

1. `package.json` 읽기 → 의존성 목록 확인 (`@sentry/nextjs`, `@slack/webhook`)
2. `next.config.{ts,js,mjs}` 읽기 → `withSentryConfig` 적용 여부 확인
3. `git config --get remote.origin.url` 실행 → repo URL 추출
4. 기존 `.sentry-skill.json` 존재 여부 확인:
   - 존재 → 재실행 모드. 파일 로드 후 Phase 2에서 default로 사용
   - 없음 → 신규 모드

**Output:** 컨텍스트 요약 (SDK 설치 여부, webhook 라우트 존재 여부, errors.ts 존재 여부, 추론된 변수)

### Phase 1. Sentry SDK

`@sentry/nextjs` 설치 여부 분기:

- **미설치:**
  1. 사용자에게 명시적으로 동의 받기: "Sentry SDK가 미설치입니다. `npx @sentry/wizard@latest -i nextjs`를 실행해도 될까요?"
  2. 동의 시 Bash로 wizard 실행 (`run_in_background: false`, 인터랙티브 입력 필요 시 사용자에게 위임)
  3. wizard 종료 후 생성된 파일 목록을 차이 리포트의 "생성" 항목에 추가

- **설치됨:**
  1. 버전, 기존 설정 파일 목록을 차이 리포트의 "스킵" 항목에 추가
  2. wizard 실행하지 않음

### Phase 2. 프로젝트 변수 수집

자동 추론 + 인터랙티브 입력 + `.sentry-skill.json` 기록.

#### 자동 추론

| 변수 | 출처 | fallback |
|---|---|---|
| `projectLabel` | `package.json` `name`을 PascalCase 변환 | 사용자 입력 |
| `repoCommitBaseUrl` | `git remote get-url origin`에서 derive (GitLab `/-/commit`, GitHub `/commit`) | 사용자 입력 |
| `sentryOrgUrl` | wizard 결과 또는 `.sentryclirc` | 사용자 입력 |

#### 사용자에게 묻기

다음 변수를 한 번에 한 개씩 묻는다 (재실행 모드면 기존 값을 default로 제시):

1. 프로젝트 라벨 (Slack 메시지 prefix). 추론값 표시 후 확인/수정.
2. repo commit base URL. 추론값 표시 후 확인/수정.
3. Sentry org URL. 추론값 표시 후 확인/수정.
4. `captureError` 카테고리 목록 (쉼표 구분). 빈 입력 → `["general"]`. 영문 소문자만 허용.
5. 도메인 태그 키 목록 (쉼표 구분, 선택). 빈 입력 허용.

#### `allowedTagKeys` 자동 도출

```js
const SENTRY_DEFAULTS = ['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'replayId', 'url']
allowedTagKeys = [...new Set([...SENTRY_DEFAULTS, ...domainTagKeys])].sort()
```

#### `.sentry-skill.json` 기록

`config-schema.md`의 스키마에 맞춰 프로젝트 루트에 작성한다.

### Phase 3. Webhook 라우트 적용

1. `@slack/webhook` 미설치 시 사용자 동의 후 설치 (`pnpm add @slack/webhook` 또는 npm/yarn 등 감지된 매니저)
2. `app/api/sentry-webhook/route.ts` 존재 여부 분기:
   - **존재:** 차이 분석을 수행하고 Write 안 함. 차이 항목:
     - dedupe 로직 (`recentWebhooks` Map + `DEDUPE_WINDOW_MS`)
     - 프로젝트 라벨 (Slack text의 `[<label>:...]` 패턴)
     - 허용 태그 키 (`allowedTagKeys` 변수 정의 vs 권장 차집합)
     - replay 링크 패턴 (`/replays/${id}/`)
     - commit 링크 패턴 (`<base>/<release>`)
     - dry-run 처리 (`SENTRY_WEBHOOK_DRY_RUN`)
   - **미존재:** `templates/webhook-route.ts.tmpl`을 Read → Phase 2 변수로 placeholder 치환 → Write

### Phase 4. captureError 헬퍼 적용

1. `lib/shared/errors.ts` 존재 여부 분기:
   - **존재:** 차이 분석. 항목:
     - `ErrorCategory` union 멤버 차집합 (추가 멤버는 사용자 도메인 확장으로 보존)
     - `captureError(error, options)` 시그니처
     - `options` 필드 (`level`, `context`, `userId`, 도메인 ID 필드)
     - `scope.setTag` 호출 패턴
   - **미존재:** `templates/errors.ts.tmpl`을 Read → Phase 2 변수로 치환 → Write

### Phase 5. 환경변수 가이드

`references/env-vars.md` 내용을 그대로 출력한다. `.env.local`은 자동 작성하지 않는다.

추가로 확인:
- `.gitignore`에 `.env.local`이 포함되어 있는가? 없으면 안내.

### Phase 6. 차이 리포트 출력

다음 마크다운 포맷으로 출력:

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
1. references/sentry-console-setup.md 참조하여 Sentry Internal Integration 생성
2. references/slack-app-setup.md 참조하여 Slack Webhook URL 발급
3. references/env-vars.md 참조하여 .env.local 작성
```
```

- [ ] **Step 3: 안전장치 + placeholder 치환 규칙 작성**

```markdown
## 안전장치

### 파일 덮어쓰기 금지 (기본)

기존 파일이 발견되면 항상 스킵 + 리포트. Write 도구를 사용하지 않는다.

### 강제 적용 (예외)

사용자가 다음과 같이 명시적으로 발화한 경우에만 덮어쓰기 모드 진입:
- "강제 적용"
- "덮어써도 돼"
- "force overwrite"

발화 감지 시:
1. 덮어쓸 파일 목록을 출력한다
2. 사용자에게 "<N>개 파일을 덮어씁니다. 진행할까요?"로 한 번 더 확인받는다
3. 확인 응답에서만 Write 수행
4. 거부 또는 모호한 응답 → 모든 파일 보존

기본값은 항상 비활성. 재실행해도 자동 활성되지 않는다.

### 패키지 매니저

`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` 존재 여부로 매니저를 감지하여 명령을 맞춘다.
- pnpm: `pnpm add <pkg>`, `pnpm dlx @sentry/wizard@latest -i nextjs`
- npm: `npm install <pkg>`, `npx @sentry/wizard@latest -i nextjs`
- yarn: `yarn add <pkg>`, `yarn dlx @sentry/wizard@latest -i nextjs`

### .env.local 직접 수정 금지

`.env.local`은 자동 작성하지 않는다. references/env-vars.md를 안내만 한다.

## 템플릿 placeholder 치환 규칙

치환은 단순 문자열 치환이다. Claude는 다음 절차를 따른다:
1. `templates/<file>.tmpl`을 Read
2. Phase 2에서 수집한 변수를 다음 규칙으로 직렬화하여 `{{KEY}}`를 치환:
   - 문자열: 그대로 삽입 (따옴표 없이)
   - 배열: JSON 배열 리터럴로 직렬화 (예: `['a', 'b']`)
   - union 타입: `'a' | 'b' | 'c'` 형태
3. 치환 결과에 `{{` 패턴이 남아있는지 확인. 남아있으면 Phase 중단 + 사용자에게 보고.
4. 사용자 프로젝트의 해당 경로에 Write

## 참조 파일

- `templates/webhook-route.ts.tmpl` — Phase 3
- `templates/errors.ts.tmpl` — Phase 4
- `references/env-vars.md` — Phase 5
- `references/sentry-console-setup.md` — Phase 6 다음 단계
- `references/slack-app-setup.md` — Phase 6 다음 단계
- `references/test-scenarios.md` — 스킬 검증 (스킬 동작 자체엔 사용 안 함)
- `config-schema.md` — `.sentry-skill.json` 스키마
```

- [ ] **Step 4: frontmatter 형식 검증**

```bash
cd /Users/2509-n0032/repos/ldx-skills
head -4 skills/sentry-slack-setup/SKILL.md
```

Expected: 첫 줄이 `---`, `name: sentry-slack-setup`, `description: ...`, `---` 순서.

- [ ] **Step 5: 참조 파일 존재 여부 확인** — SKILL.md가 언급한 모든 파일이 실제로 있는가?

```bash
cd /Users/2509-n0032/repos/ldx-skills/skills/sentry-slack-setup
for f in templates/webhook-route.ts.tmpl templates/errors.ts.tmpl \
         references/env-vars.md references/sentry-console-setup.md \
         references/slack-app-setup.md references/test-scenarios.md \
         config-schema.md; do
  [ -f "$f" ] || echo "MISSING: $f"
done
echo "OK"
```

Expected: `OK`만 출력 (MISSING 라인 없음).

- [ ] **Step 6: .gitkeep 삭제 + 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
rm -f skills/sentry-slack-setup/.gitkeep
git add -A
git commit -m "feat(sentry-slack-setup): SKILL.md 워크플로우 정의

frontmatter + 6 phase + 안전장치 + placeholder 치환 규칙.
templates/references/config-schema.md 모두 참조."
```

---

## Task 10: 통합 검증 — Brownfield 시나리오 dry-run

골드 스탠다드 레포(`dw-life-platform-frontend`)에 대해 시나리오 2(Brownfield)를 dry-run으로 검증한다. 코드 변경 없이 차이 분석만 한다.

**Files:** (Read only)
- `/Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts`
- `/Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts`

- [ ] **Step 1: 차이 분석 수동 수행**

골드 파일 vs LifeCanvas 변수로 렌더한 템플릿을 diff:

```bash
cd /Users/2509-n0032/repos/ldx-skills
mkdir -p tmp
scripts/render.sh skills/sentry-slack-setup/templates/webhook-route.ts.tmpl fixtures/lifecanvas.json > tmp/webhook-route.rendered.ts
scripts/render.sh skills/sentry-slack-setup/templates/errors.ts.tmpl fixtures/lifecanvas.json > tmp/errors.rendered.ts

diff /Users/2509-n0032/repos/dw-life-platform-frontend/app/api/sentry-webhook/route.ts tmp/webhook-route.rendered.ts > tmp/webhook.diff || true
diff /Users/2509-n0032/repos/dw-life-platform-frontend/lib/shared/errors.ts tmp/errors.rendered.ts > tmp/errors.diff || true

cat tmp/webhook.diff
cat tmp/errors.diff
```

Expected:
- `webhook.diff`: 변수명 rename(`GITLAB_COMMIT_BASE` → `REPO_COMMIT_BASE`) + `shortKeys` 정의 방식 차이만. 그 외 차이 없음.
- `errors.diff`: 차이 없음 (0줄).

차이가 더 발견되면 Task 2 또는 Task 3로 돌아가서 수정.

- [ ] **Step 2: SKILL.md를 Claude가 로드 가능한지 확인**

```bash
cd /Users/2509-n0032/repos/ldx-skills/skills/sentry-slack-setup
# frontmatter 파싱 검증
awk '/^---$/{c++} c==1{print} c==2{exit}' SKILL.md | head -5
# description 길이 확인 (claude code skills는 description이 너무 짧으면 매칭 안 됨)
awk '/^description:/{print length($0)}' SKILL.md
```

Expected: description 라인이 100자 이상 (충분한 트리거 키워드 포함).

- [ ] **Step 3: 시나리오 체크리스트로 자체 점검**

`references/test-scenarios.md`의 시나리오 2를 손으로 따라가며 SKILL.md의 워크플로우가 각 단계를 올바르게 안내하는지 확인. 누락 또는 모순이 있으면 SKILL.md 수정.

- [ ] **Step 4: 최종 커밋**

```bash
cd /Users/2509-n0032/repos/ldx-skills
git status
git log --oneline
```

Expected: 모든 산출물이 커밋되어 있고 working tree clean.

---

## 완료 후

- [ ] `git log --oneline`로 커밋 히스토리 확인 (Task 1~9 + 초기 spec/plan 커밋)
- [ ] `tree skills/sentry-slack-setup` 또는 `find skills/sentry-slack-setup -type f`로 파일 트리 확인
- [ ] 스킬을 실제로 사용해보려면: `~/.claude/skills/sentry-slack-setup`에 심볼릭 링크 후 다른 Next.js 프로젝트에서 호출

```bash
ln -s /Users/2509-n0032/repos/ldx-skills/skills/sentry-slack-setup ~/.claude/skills/sentry-slack-setup
```

향후 GitHub `L-DXD/ldx-skills`로 push하고 팀원이 clone하여 동일 위치에 링크하면 공유된다.
