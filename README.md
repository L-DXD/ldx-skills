# ldx-skills

L-DXD 팀이 함께 사용하는 Claude Code 스킬 모음.

## 설치 방법

### 1. 프로젝트에 스킬 추가 (심볼릭 링크)

```bash
# ldx-skills 레포 클론
git clone https://github.com/L-DXD/ldx-skills.git ~/repos/ldx-skills

# 사용할 프로젝트의 .claude/skills/ 에 심볼릭 링크
mkdir -p <프로젝트경로>/.claude/skills
ln -s ~/repos/ldx-skills/skills/sentry-slack-setup <프로젝트경로>/.claude/skills/sentry-slack-setup
```

### 2. 프로젝트에 스킬 추가 (복사)

```bash
# 특정 버전의 스킬을 복사
cp -r ~/repos/ldx-skills/skills/sentry-slack-setup <프로젝트경로>/.claude/skills/
```

> 심볼릭 링크를 사용하면 `git pull`만으로 스킬 업데이트가 반영됩니다.

### 3. Claude Code에서 실행

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
