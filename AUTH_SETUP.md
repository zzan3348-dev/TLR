# TLR Discord OAuth / 접근 제어 설정

## 환경변수

클라이언트(Vite):

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Vercel 함수 전용:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
IP_HASH_PEPPER=<long-random-secret>
DEVICE_HASH_PEPPER=<long-random-secret>
IPINFO_TOKEN=<optional-server-only-token>
SITE_URL=https://the-long-revolution.vercel.app
```

`SUPABASE_SECRET_KEY`, pepper, IPInfo 토큰은 브라우저 변수(`VITE_`)로 만들지 않습니다.

## Supabase / Discord

1. SQL Editor에서 `supabase/migrations/202608020001_auth.sql`을 실행합니다.
2. Supabase Auth → Providers → Discord에 Discord Client ID/Secret을 입력합니다.
3. Discord OAuth redirect URL은 `https://<project-ref>.supabase.co/auth/v1/callback`으로 둡니다.
4. Supabase URL configuration의 Site URL은 `https://the-long-revolution.vercel.app`으로 둡니다.
5. Additional Redirect URLs에 다음을 추가합니다.
   - `https://the-long-revolution.vercel.app/auth/callback`
   - `http://localhost:5173/auth/callback`

서버는 Discord identity의 `provider_id`를 사용해 `profiles.discord_user_id`를 만들며, 클라이언트 metadata를 식별자로 신뢰하지 않습니다.

## 개인정보 / 부계정 방지

로그인 UI에는 Discord 계정 식별자, HttpOnly 장치 쿠키, IP HMAC 해시, ASN이 부계정 방지 목적으로 처리된다는 안내가 표시됩니다. 원시 IP와 Discord access/refresh token은 데이터베이스나 로그에 저장하지 않습니다.

새 계정의 장치 해시·IP 해시·ASN이 모두 기존 계정과 일치할 때만 `MULTI_ACCOUNT_TRIPLE_MATCH`로 차단합니다. 일부 신호만 일치하면 자동 차단하지 않습니다. 차단 계정은 공개 지도·국가 정보만 볼 수 있고 플레이 및 상태 변경 API는 서버에서 거부해야 합니다.
