# Directorate bootstrap 인증

Discord OAuth가 준비되기 전 관리 패널을 운영 환경에서 테스트하기 위한 임시 인증입니다.

1. 로컬에서 `node scripts/generate-admin-bootstrap-hash.mjs`를 실행하고 관리 코드를 입력합니다.
2. 명령이 출력한 해시를 Vercel 또는 호스팅 제공자의 서버 전용 환경변수 `ADMIN_BOOTSTRAP_SECRET_HASH`에 저장합니다.
3. 다음 환경변수를 서버 전용으로 설정합니다.
   - `ADMIN_BOOTSTRAP_ENABLED=true`
   - `ADMIN_BOOTSTRAP_SECRET_HASH=<생성된 scrypt 해시>`
   - `ADMIN_SESSION_SECRET=<충분히 긴 무작위 값>`
4. 타이틀 화면 우측 상단의 작은 기밀 도장을 2초 안에 세 번 클릭하면 Directorate Access 창이 열립니다.

관리 코드는 소스, 저장소, 프런트엔드 번들에 저장하지 않습니다. 세션은 4시간 유효한 서명 쿠키이며 HttpOnly, Secure, SameSite=Lax로 발급됩니다. `/admin`, `/directorate`, `/api/admin/*`는 유효한 관리자 세션이 없으면 일반 404로 응답합니다.

bootstrap 인증을 끌 때는 `ADMIN_BOOTSTRAP_ENABLED=false`로 설정합니다. 이후 Discord 관리자 세션은 `server/adminAuth.ts`의 동일한 검증 계층에 연결합니다.
