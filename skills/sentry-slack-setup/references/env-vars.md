# 환경변수 가이드

스킬은 `.env.local`을 자동 작성하지 않는다.

## 필수

| 키 | 설명 | 예시 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL | `https://hooks.slack.com/services/T.../B.../...` |

> **SLACK_WEBHOOK_URL 값 참고:** 프로젝트별 Webhook URL은 Confluence에 등록되어 있다.
> https://idstrust-dxteam.atlassian.net/wiki/spaces/dxd/pages/46694433/Slack+Incoming+Webhook+URL

## 선택

| 키 | 설명 | 기본 동작 |
|---|---|---|
| `SENTRY_WEBHOOK_DRY_RUN` | `true`로 설정하면 webhook이 Slack 전송 없이 페이로드만 응답으로 반환 | 미설정 = 실제 전송 |

## .gitignore 확인

`.env.local`이 `.gitignore`에 포함되어 있는지 확인한다.
