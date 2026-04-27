# ldx-skills

L-DXD 팀이 함께 사용하는 Claude Code 스킬 모음.

## 설치 방법

### 바로 설치 (권장)

```bash
npx degit L-DXD/ldx-skills/skills/sentry-slack-setup .claude/skills/sentry-slack-setup
```

### 심볼릭 링크 (스킬 업데이트 자동 반영)

```bash
git clone https://github.com/L-DXD/ldx-skills.git ~/repos/ldx-skills
ln -s ~/repos/ldx-skills/skills/sentry-slack-setup <프로젝트경로>/.claude/skills/sentry-slack-setup
```

> 심볼릭 링크를 사용하면 `git pull`만으로 스킬 업데이트가 반영됩니다.

### Claude Code에서 실행

```
/sentry-slack-setup
```

또는 자연어로 호출:

```
Sentry 붙여줘
Sentry Slack 알림 설정해줘
```

## 수록 스킬

| 스킬 | 설명 |
|---|---|
| `sentry-slack-setup` | Next.js 16 App Router에 Sentry SDK + Slack 알림 webhook + captureError 헬퍼 일괄 설정 |

## 구조

```
ldx-skills/
└── skills/           # 각 디렉토리가 하나의 스킬
    └── sentry-slack-setup/
```
