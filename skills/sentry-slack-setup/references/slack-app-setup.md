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
