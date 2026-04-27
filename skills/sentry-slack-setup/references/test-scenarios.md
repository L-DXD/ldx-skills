# 검증 시나리오

스킬 자체는 마크다운 + 템플릿이라 단위 테스트보다 시나리오 검증으로 확인한다.

## 시나리오 1. Greenfield (Sentry 미설치)

**초기 상태:** 빈 Next.js 16 App Router 프로젝트.

**기대:**
- [ ] Phase 1: Claude가 사용자에게 "별도 터미널에서 `npx @sentry/wizard@latest -i nextjs` 실행 후 알려달라" 요청
- [ ] 사용자 완료 후: wizard 산출 파일이 git status에 보이고, Phase 3/4가 webhook + errors.ts 생성
- [ ] `.sentry-skill.json` 생성

**검증:**
- [ ] `pnpm exec tsc --noEmit` 통과
- [ ] `app/api/sentry-webhook/route.ts`에 `{{` 잔존 없음

## 시나리오 2. Brownfield (현재 dw-life-platform-frontend)

**초기 상태:** 모든 자산 존재.

**기대:**
- [ ] 모든 phase 스킵, 차이 리포트만 출력
- [ ] git status에 변경된 파일 없음

## 시나리오 3. 부분 설치

**초기 상태:** SDK는 있음, webhook/errors는 없음.

**기대:**
- [ ] Phase 1 스킵, Phase 3/4가 새 파일 생성
- [ ] sentry config 파일은 미변경

## 시나리오 4. 재실행

**초기 상태:** 시나리오 1 완료 상태.

**기대:**
- [ ] `.sentry-skill.json` 로드 → default 값 자동 사용
- [ ] 모든 자산 스킵, 코드 미변경

## 시나리오 5. 강제 적용

**입력:** 사용자가 "덮어써도 돼" 발화.

**기대:**
- [ ] 덮어쓸 파일 목록 출력 + 추가 확인 받음
- [ ] 추가 확인 후에만 Write 발생
