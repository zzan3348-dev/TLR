# NEW NAVI

NEW NAVI는 TLR 사이트와 Discord를 연결하면서 나비식당, 끝말잇기, 대사, 호감도,
배지 같은 NAVI 고유 기능을 유지하는 새 Discord 봇입니다.

구 NAVI의 정적 대사 1,200개와 호감도 단계 칭호, 정적 배지 정의를 보존합니다. 다만
옛 사용자별 호감도·배지 보유 기록은 복사하지 않으며, 호감도 표시는 전용 이모지 대신
`❤️ +N`, `❤️ 0`, `❤️ -N`으로 통일합니다.

국가, 국가 소유권, 세계일, 경제, 연구력, 연구 프로젝트는 이 프로젝트의 SQLite에
저장하지 않습니다. 모든 국가 운영 명령은 `TLR_API_BASE_URL`의 제한된 NAVI API를
호출합니다. SQLite에는 신규 사용자의 미니게임·관계 데이터만 생성됩니다.

## 설정

1. 새 Discord Application과 Bot을 생성합니다.
2. Bot 설정에서 Message Content Intent와 Server Members Intent를 활성화합니다.
   전자는 캐릭터 대사 반응, 후자는 서버 부스트 배지 동기화에 필요합니다.
3. `.env.example`을 참고해 배포 환경변수를 등록합니다. `.env`는 커밋하지 않습니다.
4. TLR 서버에도 같은 `TLR_NAVI_SERVICE_TOKEN`을 설정합니다. 최소 32자 이상의 난수여야 합니다.
5. Supabase에 `202608110001_navi_integration.sql`을 적용하고, 관리자 Discord OAuth
   프로필만 `navi_admin_members`에 명시적으로 등록합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

## Railway 배포

NEW NAVI worker는 옛 NAVI 서비스·volume을 재사용하지 않고 Railway의 신규 서비스로
배포합니다. 서비스 root는 이 `navi/` 디렉터리이며 `Dockerfile`을 사용합니다.

- 신규 서비스: `new-navi-tlr`
- 신규 volume mount: `/data`
- `NAVI_DATABASE_PATH`: `/data/new_navi.sqlite3`
- 필수 환경변수: `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`,
  `TLR_API_BASE_URL`, `TLR_NAVI_SERVICE_TOKEN`, `OPENROUTER_API_KEY`
- LLM 공급자/모델: `NAVI_LLM_PROVIDER=openrouter`,
  `NAVI_LLM_MODEL=google/gemma-4-31b-it:free`
- 무료 fallback: `google/gemma-4-26b-a4b-it:free`, `z-ai/glm-5.2:free`
- LLM 전체 timeout: `NAVI_LLM_TIMEOUT_SECONDS=30`

Railway 변수에는 실제 secret을 직접 등록하고 `.env`나 기존 SQLite를 업로드하지
않습니다. 새 volume의 빈 DB에서 NAVI 미니게임·캐릭터 schema만 생성됩니다.

## Slash Command

- TLR 클라이언트: `/내국가`, `/연구요청`, `/내연구`, `/연구력추가투입`, `/연구심사`, `/경제`, `/내디시전`
- NAVI: `/나비식당`, `/끝말잇기`, `/호감도`, `/배지목록`, `/대표배지`, `/상태창`

`/연구심사`는 Discord 서버 역할만으로 실행되지 않습니다. 요청한 Discord ID가 TLR
프로필에 연결되어 있고 `navi_admin_members.active = true`인 경우에만 허용됩니다.
