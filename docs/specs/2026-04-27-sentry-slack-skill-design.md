# sentry-slack-setup 스킬 설계 문서

- 작성일: 2026-04-27
- 작성자: jayoung.lee
- 상태: Draft

## 1. 배경 및 목적

`dw-life-platform-frontend` 프로젝트에 구현된 Sentry → Slack 알림 파이프라인을 다른 프로젝트에서도 재사용할 수 있도록 팀 스킬로 추출한다.

현재 `dw-life-platform-frontend`에는 다음 자산이 존재한다:

- `@sentry/nextjs` SDK 설치 및 설정 (`sentry.{server,edge}.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`)
- `app/api/sentry-webhook/route.ts` — Sentry webhook을 받아 Slack Incoming Webhook으로 포맷팅된 메시지를 전송. 이벤트 ID 기반 중복 제거(5초 윈도우), dry-run 모드, GitLab 커밋 링크, Sentry Replay 링크 포함
- `lib/shared/errors.ts` — `captureError(error, { category, level, context, ... })` 헬퍼. 카테고리는 union 타입으로 강제

이 자산을 다른 Next.js 프로젝트에 일관된 방식으로 이식하는 것이 본 스킬의 목적이다.

## 2. 스코프

### In scope
- Next.js 16 App Router 프로젝트
- `@sentry/nextjs` SDK 셋업 (공식 wizard 위임)
- Slack 알림 webhook 라우트 생성
- `captureError` 헬퍼 + 프로젝트별 카테고리 union 타입 생성
- 프로젝트별 변수(라벨, repo URL, 카테고리, 도메인 태그) 인터랙티브 수집
- 부분 설치 상태 감지 + 차이 리포트

### Out of scope
- Pages Router, 비-Next.js 프레임워크
- Slack 외 알림 채널 (Discord/Teams 등)
- Sentry 콘솔에서의 Internal Integration 생성 (수동, references 문서로 안내)
- `.env.local` 자동 작성 (수동, references 문서로 안내)
- 자동 롤백 (사용자가 git으로 처리)

## 3. 결정 사항

| 영역 | 결정 |
|---|---|
| 적용 범위 | C 풀세트 (SDK + webhook + captureError + 프로젝트별 커스터마이징) |
| 프레임워크 | Next.js App Router 전용 |
| 입력 방식 | 자동 추론 + 인터랙티브 + `.sentry-skill.json` 기록 (하이브리드) |
| 부분 설치 처리 | "있으면 스킵 + 차이 리포트" — 사용자 코드 자동 수정/덮어쓰기 금지 |
| 카테고리 정의 | 사용자에게 인터랙티브로 묻고 union 타입 생성 |
| 스킬 구조 | 단일 스킬 + phase 기반 워크플로우 |
| Sentry SDK 셋업 | 공식 `@sentry/wizard@latest` 위임 (버전 드리프트 회피) |

## 4. 디렉토리 구조

```
ldx-skills/skills/sentry-slack-setup/
├── SKILL.md                           # 스킬 워크플로우 + phase 체크리스트
├── templates/
│   ├── webhook-route.ts.tmpl          # app/api/sentry-webhook/route.ts
│   └── errors.ts.tmpl                 # lib/shared/errors.ts (captureError)
├── references/
│   ├── env-vars.md                    # SENTRY_DSN, SLACK_WEBHOOK_URL, SENTRY_WEBHOOK_DRY_RUN
│   ├── sentry-console-setup.md        # Sentry Internal Integration + webhook URL 발급 절차
│   ├── slack-app-setup.md             # Slack Incoming Webhook URL 발급 절차
│   └── test-scenarios.md              # 스킬 검증 시나리오 (greenfield / brownfield / 부분설치)
└── config-schema.md                   # .sentry-skill.json 스키마 정의
```

## 5. 워크플로우 (Phase)

### Phase 0. 컨텍스트 탐색
- `package.json`, `.git/config`, `next.config.{ts,js,mjs}` 읽기
- 기존 `.sentry-skill.json` 있으면 로드 (재실행 모드)
- 자동 추론 가능한 변수 후보 추출

### Phase 1. Sentry SDK 단계
- `@sentry/nextjs` 설치 여부 확인
- 미설치 → 사용자 동의 후 `npx @sentry/wizard@latest -i nextjs` 실행
- 설치됨 → 버전 + 기존 설정 파일 목록을 차이 리포트에 기록 (스킵)

### Phase 2. 프로젝트 변수 수집
- **자동 추론 시도**:
  - `projectLabel`: `package.json`의 `name`을 PascalCase 변환
  - `repoCommitBaseUrl`: `git remote get-url origin`을 GitLab(`/-/commit`) 또는 GitHub(`/commit`) 형식으로 변환
  - `sentryOrgUrl`: wizard 결과 또는 `.sentryclirc`에서 추출
- **사용자에게 묻기 (추론 실패 또는 추가 입력)**:
  - 프로젝트 라벨 (Slack 메시지 prefix)
  - repo commit base URL
  - Sentry org URL
  - `captureError` 카테고리 목록 (쉼표 구분, 빈 입력 시 `['general']` 기본값)
  - 도메인 태그 키 (예: `lifebookId`, 선택)
- 결과를 `.sentry-skill.json`에 저장 (재실행 시 default로 제시)

### Phase 3. Webhook 라우트 적용
- `@slack/webhook` 패키지 미설치 시 설치
- `app/api/sentry-webhook/route.ts` 존재 여부 확인:
  - 존재 → 차이 분석(dedupe 로직, 라벨, 카테고리 필터, 링크 패턴) → 차이 리포트에 기록 (덮어쓰기 금지)
  - 미존재 → `templates/webhook-route.ts.tmpl`을 Phase 2 변수로 치환하여 생성

### Phase 4. captureError 헬퍼 적용
- `lib/shared/errors.ts` 존재 여부 확인:
  - 존재 → 카테고리 union 차이 리포트
  - 미존재 → `templates/errors.ts.tmpl`을 Phase 2 카테고리로 치환하여 생성

### Phase 5. 환경변수 가이드
- `references/env-vars.md` 내용 출력
- 필수 키: `SENTRY_DSN`, `SLACK_WEBHOOK_URL`
- 선택 키: `SENTRY_WEBHOOK_DRY_RUN`
- `.gitignore`에 `.env.local` 포함 여부 확인 (없으면 안내)

### Phase 6. 차이 리포트 출력
- 스킵된 항목과 이유
- 권장 vs 현재 차이 (특히 webhook dedupe 로직, 카테고리)
- 수동 단계: Sentry 콘솔에서 Internal Integration 생성, Slack Incoming Webhook URL 발급

## 6. 템플릿 변수 및 config 스키마

### `.sentry-skill.json`

```json
{
  "version": 1,
  "projectLabel": "LifeCanvas",
  "sentryOrgUrl": "https://idstrust-lu.sentry.io",
  "repoCommitBaseUrl": "http://10.0.101.108:3000/share/dw-life-platform-group/dw-life-platform-frontend/-/commit",
  "categories": ["lifebook", "export", "viewer"],
  "allowedTagKeys": ["browser", "category", "device", "environment", "level", "os", "release", "url", "lifebookId"],
  "domainTagKeys": ["lifebookId"],
  "appliedAt": "2026-04-27",
  "skippedItems": ["sentry.server.config.ts", "instrumentation.ts"]
}
```

### 템플릿 placeholder

| placeholder | 출처 | 예시 |
|---|---|---|
| `{{PROJECT_LABEL}}` | 사용자 입력 | `LifeCanvas` |
| `{{SENTRY_ORG_URL}}` | 사용자 입력 / 자동 추론 | `https://idstrust-lu.sentry.io` |
| `{{REPO_COMMIT_BASE_URL}}` | 자동 추론 / 사용자 입력 | `http://.../-/commit` |
| `{{ALLOWED_TAG_KEYS}}` | 사용자 입력 (배열) | `['browser', 'category', ...]` |
| `{{CATEGORY_UNION}}` | 사용자 입력 (union) | `'lifebook' \| 'export' \| 'viewer'` |
| `{{DOMAIN_TAG_KEYS}}` | 사용자 입력 (배열) | `['lifebookId']` |

치환은 단순 문자열 치환(별도 템플릿 엔진 불필요). Claude가 템플릿을 Read → 치환 → Write.

## 7. 안전장치

- **파일 덮어쓰기 금지**: 기존 파일은 항상 스킵 + 리포트. 사용자가 명시적으로 "강제 적용"을 요청한 경우에만 Write 허용.
- **wizard 실행 전 사용자 확인**: 외부 인터랙티브 명령이므로 동의 필수.
- **`.sentry-skill.json` 충돌**: 기존 파일이 있으면 재실행 모드 진입. 변수는 기존 값을 default로 제시.
- **카테고리 입력 검증**: 빈 입력은 `['general']`로 보정. 영문 소문자만 허용 (대문자/공백 입력 시 재요청).
- **env var 직접 수정 금지**: `.env.local`은 자동 작성하지 않고 `references/env-vars.md`로 안내.
- **롤백**: 자동 롤백 없음. git 작업 트리 위에서 동작 가정.

## 8. 검증 시나리오 (`references/test-scenarios.md`)

스킬 자체는 마크다운 + 템플릿이라 단위 테스트보다 시나리오 검증으로 확인한다.

| 시나리오 | 초기 상태 | 기대 동작 |
|---|---|---|
| Greenfield | 빈 Next.js 16 프로젝트 | wizard 호출 + webhook 라우트 + errors.ts 생성 |
| Brownfield (현재 레포) | 모든 자산 존재 | 모든 phase 스킵, 차이 리포트만 출력 |
| 부분 설치 | SDK 있음, webhook 없음 | wizard 스킵 + webhook만 생성 |
| 재실행 | `.sentry-skill.json` 존재 | 변수 default를 기존 값으로 제시, 입력 최소화 |

## 9. 추후 확장 (현 스코프 외)

- Pages Router 지원 분기
- Discord/Teams 알림 어댑터
- 카테고리/태그를 외부 schema 파일로 분리
- 스킬 자체를 Claude Code plugin으로 패키징하여 설치형으로 배포

## 10. 의존성 / 외부 영향

- `@sentry/wizard@latest` — Sentry 공식 도구. 버전 변경에 따른 마이그레이션은 wizard에 위임.
- `@sentry/nextjs`, `@slack/webhook` — 사용자 프로젝트의 의존성으로 추가됨.
- 사용자 프로젝트의 git 작업 트리 — 스킬은 git 위에서 동작한다고 가정.
