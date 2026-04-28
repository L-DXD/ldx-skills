# ldx-skills

L-DXD 팀이 함께 사용하는 Claude Code 스킬 모음.

## 설치 방법

### 설치

```bash
npx degit L-DXD/ldx-skills/skills/sentry-slack-setup .claude/skills/sentry-slack-setup
```

### 업데이트

```bash
npx degit L-DXD/ldx-skills/skills/sentry-slack-setup .claude/skills/sentry-slack-setup --force
```

### Claude Code에서 실행

```
/sentry-slack-setup
```

## 수록 스킬

| 스킬                 | 설명                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `sentry-slack-setup` | Next.js 16 App Router에 Sentry SDK + Slack 알림 webhook + captureError 헬퍼 일괄 설정 |

## 구조

```
ldx-skills/
└── skills/           # 각 디렉토리가 하나의 스킬
    └── sentry-slack-setup/
```

## 개발 가이드

### 스킬 디렉토리 구조

```
skills/<skill-name>/
├── SKILL.md              # 워크플로우 정의 (필수)
├── templates/            # 코드 템플릿
├── references/           # 참조 문서
└── config-schema.md      # 설정 스키마
```

- `SKILL.md` — 스킬의 진입점. Claude Code가 이 파일을 읽고 워크플로우를 실행한다.
- `templates/` — 프로젝트에 생성할 코드 템플릿 (`*.tmpl`)
- `references/` — 스킬 실행 중 참조하는 가이드 문서

### 브랜치 전략

| 브랜치 | 용도 |
| --- | --- |
| `main` | 배포 브랜치. 직접 push 금지 |
| `feat/<skill-name>` | 새 스킬 개발 |
| `fix/<skill-name>` | 기존 스킬 수정 |
| `docs/<description>` | 문서 수정 |

### 작업 흐름

1. `main`에서 브랜치 생성
2. 작업 후 PR 생성
3. 리뷰 후 merge
4. 릴리즈가 필요하면 `main`에서 태그 생성 (`v1.x.x`)

### 릴리즈

```bash
# 태그 생성 + GitHub Release
gh release create v1.x.x --title "v1.x.x" --generate-notes
```

릴리즈 후 스킬을 사용하는 프로젝트에서 최신 버전을 반영:

```bash
npx degit L-DXD/ldx-skills/skills/<skill-name> .claude/skills/<skill-name> --force
```
