# .sentry-skill.json 스키마

스킬 적용 결과를 기록하는 파일. 사용자 프로젝트 루트에 생성된다.
재실행 시 변수 default 값으로 사용된다.

## 필드

| 키 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `version` | `number` | ✅ | 스키마 버전. 항상 `1` |
| `projectLabel` | `string` | ✅ | Slack 메시지 prefix (예: `LifeCanvas`) |
| `sentryOrgUrl` | `string` | ✅ | Sentry organization URL |
| `repoCommitBaseUrl` | `string` | ✅ | 저장소 커밋 base URL. GitLab은 `/-/commit`, GitHub은 `/commit` |
| `categories` | `string[]` | ✅ | `captureError` 카테고리 멤버. 빈 배열이면 `['general']` |
| `allowedTagKeys` | `string[]` | ✅ | Slack에 노출할 Sentry 태그 키. 자동 도출 (Sentry 기본 9종 + `domainTagKeys`) |
| `domainTagKeys` | `string[]` | ⬜️ | 프로젝트 도메인별 태그 (예: `["lifebookId"]`) |
| `appliedAt` | `string` | ✅ | ISO8601 날짜 |
| `skippedItems` | `string[]` | ✅ | 스킵된 산출물 경로 목록 |

## Sentry 기본 태그 9종

`['browser', 'category', 'device', 'environment', 'level', 'os', 'release', 'replayId', 'url']`

## 예시

```json
{
  "version": 1,
  "projectLabel": "LifeCanvas",
  "sentryOrgUrl": "https://idstrust-lu.sentry.io",
  "repoCommitBaseUrl": "http://10.0.101.108:3000/share/dw-life-platform-group/dw-life-platform-frontend/-/commit",
  "categories": ["lifebook", "export", "viewer"],
  "allowedTagKeys": ["browser", "category", "device", "environment", "level", "lifebookId", "os", "release", "replayId", "url"],
  "domainTagKeys": ["lifebookId"],
  "appliedAt": "2026-04-27",
  "skippedItems": []
}
```
