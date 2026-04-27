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
