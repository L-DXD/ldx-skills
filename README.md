# ldx-skills

L-DXD 팀이 함께 사용하는 Claude Code 스킬 모음.

## 구조

```
ldx-skills/
├── skills/              # 팀 스킬 (각 디렉토리가 하나의 스킬)
└── docs/
    └── specs/           # 스킬 설계 문서
```

## 스킬 사용법

각 스킬은 `skills/<skill-name>/SKILL.md`에 워크플로우가 정의되어 있다.
Claude Code에서 호출하려면 해당 스킬 디렉토리를 `~/.claude/skills/` 또는
프로젝트의 `.claude/skills/`에 심볼릭 링크하거나 복사한다.

## 수록 스킬

| 스킬 | 설명 |
|---|---|
| `sentry-slack-setup` | Next.js 프로젝트에 Sentry SDK + Slack 알림 webhook + captureError 헬퍼를 일괄 설정 |
