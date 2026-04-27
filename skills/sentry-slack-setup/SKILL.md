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
| `sentryOrgUrl` | **고정 기본값** `https://idstrust-lu.sentry.io` (프로젝트 파일에서 추론하지 않음) | 사용자 확인 후 변경 가능 |

#### 사용자에게 한 번에 한 개씩 묻기

1. 프로젝트 라벨 (`projectLabel`, Slack prefix). 추론값을 default로 제시.
2. repo commit base URL (`repoCommitBaseUrl`).
3. Sentry org URL (`sentryOrgUrl`). **항상** `https://idstrust-lu.sentry.io`를 default로 제시한다 (프로젝트 내 `sentry.properties`, `next.config.*` 등에서 다른 org URL이 발견되더라도 무시). 엔터(빈 입력)면 확정, 다른 URL 입력 시 해당 값 사용.
4. `captureError` 카테고리 (`categories`, 쉼표 구분). 빈 입력 → `["general"]`. 영문 소문자만 허용 (대문자/공백 입력 시 재요청).
5. 도메인 태그 키 (`domainTagKeys`, 쉼표 구분, 선택). 빈 입력 허용.

재실행 모드면 모든 default를 `.sentry-skill.json`의 기존 값으로 채운다.

#### 변수 → 템플릿 placeholder 매핑

| 템플릿 placeholder | 출처 변수 | 직렬화 규칙 |
|---|---|---|
| `{{PROJECT_LABEL}}` | `projectLabel` | 문자열 그대로 |
| `{{REPO_COMMIT_BASE_URL}}` | `repoCommitBaseUrl` | 문자열 그대로 |
| `{{SENTRY_ORG_URL}}` | `sentryOrgUrl` | 문자열 그대로 |
| `{{ALLOWED_TAG_KEYS}}` | `allowedTagKeys` | TS 단일 따옴표 배열 (`['a', 'b']`) |
| `{{CATEGORY_UNION}}` | `categories` | TS union (`'a' \| 'b' \| 'c'`) |

#### `allowedTagKeys` 자동 도출

```js
const SENTRY_DEFAULTS = ['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'url']
allowedTagKeys = [...new Set([...SENTRY_DEFAULTS, ...domainTagKeys])].sort()
```

#### `.sentry-skill.json` 기록

`config-schema.md`의 스키마에 맞춰 프로젝트 루트에 작성.

### Phase 3. Webhook 라우트 적용

1. `@slack/webhook` 미설치 시 사용자 동의 후 설치 (감지된 패키지 매니저 사용):
   - pnpm: `pnpm add @slack/webhook`
   - npm: `npm install @slack/webhook`
   - yarn: `yarn add @slack/webhook`

   설치 실패 시(네트워크/lockfile 충돌 등): phase 중단 → 에러 메시지 사용자에 출력 → 재시도 의사 확인. 사용자가 재시도 거부하면 Phase 3 스킵하고 Phase 6 리포트의 "스킵" 항목에 기록.
2. `app/api/sentry-webhook/route.ts` 분기:
   - **존재:** 차이 분석 (Write 안 함). 각 항목을 **누락** / **불일치** / **일치**로 grading하여 Phase 6 리포트에 기록:
     - dedupe 로직: `recentWebhooks` Map 선언이 없으면 누락. `DEDUPE_WINDOW_MS` 값이 다르면 불일치.
     - 프로젝트 라벨: `[<label>:` 패턴이 없으면 누락. label이 다르면 불일치(현재값/권장값).
     - 허용 태그 키: 권장 set (`allowedTagKeys`)와의 차집합 → 부족 키는 누락, 추가 키는 일치(보존).
     - commit 링크: `${...}/${displayValue}` 형태 부재 또는 base URL 다름 → 누락/불일치.
     - dry-run 처리: `SENTRY_WEBHOOK_DRY_RUN` 분기 부재 → 누락.
   - **미존재:** `templates/webhook-route.ts.tmpl`을 Read → Phase 2 변수로 치환 → Write
3. 치환은 다음 직렬화 규칙으로 수행:
   - 문자열: 따옴표 없이 그대로
   - 배열: TS 단일 따옴표 (예: `['a', 'b']`)
   - union: `'a' | 'b' | 'c'`
4. 치환 결과에 `{{` 잔존 시 phase 중단 + 사용자에게 보고

### Phase 4. captureError 헬퍼 적용

1. `lib/shared/errors.ts` 분기:
   - **존재:** 차이 분석 (Write 안 함). 각 항목을 **누락** / **불일치** / **일치**로 grading:
     - `ErrorCategory` union: 권장 멤버 부재 → 누락. 추가 멤버는 사용자 도메인 확장으로 보존(일치).
     - `captureError(error, options)` 시그니처: 함수 부재 → 누락. 시그니처 다름 → 불일치.
     - `options` 필드(`level`, `context`, `userId`): 부재 → 누락.
     - `scope.setTag('category', ...)` 호출 부재 → 누락.
   - **미존재:** `templates/errors.ts.tmpl`을 Read → `{{CATEGORY_UNION}}`을 union 직렬화로 치환 → Write
2. 도메인별 ID 필드(예: `lifebookId`)는 템플릿이 자동 추가하지 않는다. 사용자 안내: "도메인별 ID 필드가 필요하면 errors.ts에 직접 추가하세요."

### Phase 5. 환경변수 가이드

`references/env-vars.md` 내용 출력. `.env.local` 자동 작성하지 않음.

`SLACK_WEBHOOK_URL` 안내 시, Confluence 페이지에 프로젝트별 값이 등록되어 있음을 함께 안내:
> https://idstrust-dxteam.atlassian.net/wiki/spaces/dxd/pages/46694433/Slack+Incoming+Webhook+URL

`.gitignore`에 `.env.local` 누락 시 안내.

### Phase 6. 차이 리포트

다음 마크다운 포맷으로 콘솔 출력:

````markdown
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
````

**조건부 출력:** `.env.local`에 `SLACK_WEBHOOK_URL`이 이미 설정되어 있고, 차이 섹션에 ❌ 누락이나 ⚠️ 불일치가 하나도 없으면 → "다음 단계" 섹션을 아래로 대체:

```markdown
## 다음 단계
모든 산출물이 권장 구조와 일치하고 환경변수도 설정되어 있습니다. 추가 작업이 필요 없습니다.
```

그 외에는 **해당하는 항목만** 출력:

````markdown
## 다음 단계 (수동)
<!-- .env.local에 SLACK_WEBHOOK_URL 미설정 또는 .env.local 미존재 시에만 -->
1. references/sentry-console-setup.md 참조하여 Internal Integration 생성
2. references/env-vars.md 참조하여 .env.local 작성 (Webhook URL은 Confluence 참고)
<!-- 차이 섹션에 ❌ 누락 또는 ⚠️ 불일치가 있을 때만 -->
3. 위 차이 항목을 참고하여 해당 파일 수동 수정
````

## 안전장치

### 파일 덮어쓰기 금지 (기본)

기존 파일은 항상 스킵 + 리포트. Write 안 함.

이 가드는 **이 스킬이 Write 도구로 생성하는 파일**(`app/api/sentry-webhook/route.ts`, `lib/shared/errors.ts`, `.sentry-skill.json`)에만 적용된다. Sentry wizard나 패키지 매니저(`pnpm add` 등)가 `package.json`/`next.config.*`/`instrumentation.ts` 등을 수정하는 것은 별도 — Phase 1/3 안내에 따라 사용자 동의 후 진행한다.

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
- `references/test-scenarios.md` — 스킬 검증 (스킬 동작에는 미사용)
- `config-schema.md` — `.sentry-skill.json` 스키마
