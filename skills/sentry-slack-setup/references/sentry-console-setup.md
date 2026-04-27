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
