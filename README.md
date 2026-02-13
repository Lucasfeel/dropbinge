# DropBinge (v0.9 MVP)

DropBinge는 영화/TV 시리즈 팬이 공개 일정 변화와 신규 에피소드를 추적할 수 있도록 만든 서비스입니다.  
TMDB API를 통해 콘텐츠 데이터를 수집하고, 사용자는 관심 작품을 팔로우한 뒤 이메일 알림으로 업데이트를 받을 수 있습니다.

## 주요 기능
- TMDB 기반 탐색/검색: 인기작, 개봉 예정작, TV/시리즈 정보를 조회
- 팔로우 및 알림: 관심 콘텐츠를 팔로우하고 상태 변화 알림 수신
- 개인 활동 피드: 최근 팔로우/변경 내역 조회
- 서버 캐시 및 배치 갱신: TMDB 응답 캐시 + 크론 기반 주기적 갱신
- 공개 이메일 구독: 로그인 없이 이메일만으로 구독 생성 가능

## 기술 스택
- Backend: Flask, PostgreSQL, psycopg2
- Frontend: React 18, Vite, TypeScript
- Infra: GitHub Actions(크론 트리거), Docker

## 요구 사항
- Python 3.11+
- PostgreSQL 13+
- Node.js 18+ (프론트엔드 개발/빌드 시)

## 빠른 시작

### 1) 저장소 클론 및 백엔드 설치
```bash
git clone https://github.com/Lucasfeel/dropbinge.git
cd dropbinge
python -m venv .venv
```

Linux/macOS:
```bash
source .venv/bin/activate
```

Windows (PowerShell):
```powershell
.venv\Scripts\Activate.ps1
```

의존성 설치:
```bash
pip install -r requirements.txt
```

### 2) 환경 변수 설정
`.env` 파일 또는 셸 환경 변수로 아래 값을 설정합니다.

### 3) DB 초기화 및 백엔드 실행
```bash
python init_db.py
python app.py
```

프로덕션 예시:
```bash
gunicorn app:app
```

### 4) 프론트엔드 실행 (개발)
```bash
cd frontend
npm install
npm run dev
```

Vite 개발 서버는 `/api` 요청을 Flask 백엔드로 프록시합니다.

## 환경 변수

### 핵심 변수
| 변수명 | 설명 | 기본값 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 연결 URI (권장) | 없음 |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | `DATABASE_URL` 미사용 시 개별 DB 설정 | 없음 |
| `JWT_SECRET` | JWT 서명 키 | `dev-secret-change-me` |
| `TMDB_BEARER_TOKEN` 또는 `TMDB_API_KEY` | TMDB 인증 토큰/키 | 없음 |
| `CORS_ALLOW_ORIGINS` | 허용 Origin 목록 (콤마 구분 또는 JSON 배열) | 전체 허용 |
| `CORS_SUPPORTS_CREDENTIALS` | CORS credentials 허용 여부 (`1/0`) | `0` |

### 이메일 관련 (선택)
| 변수명 | 설명 | 기본값 |
|---|---|---|
| `EMAIL_ENABLED` | 이메일 기능 활성화 | `false` |
| `EMAIL_FROM` | 발신자 주소 (`EMAIL_ENABLED=true` 시 필요) | 없음 |
| `EMAIL_REPLY_TO` | 회신 주소 | 없음 |
| `APP_BASE_URL` | 이메일 내 딥링크 생성용 앱 기본 URL | 없음 |
| `SMTP_HOST` | SMTP 호스트 | 없음 |
| `SMTP_PORT` | SMTP 포트 | `587` |
| `SMTP_USER` | SMTP 계정 | 없음 |
| `SMTP_PASSWORD` | SMTP 비밀번호 | 없음 |
| `SMTP_USE_TLS` | STARTTLS 사용 여부 | `true` |
| `SMTP_USE_SSL` | SMTPS 사용 여부 | `false` |

### 디스패치/크론 관련 (선택)
- `EMAIL_DISPATCH_BATCH_SIZE` (기본 `25`)
- `EMAIL_DISPATCH_MAX_ATTEMPTS` (기본 `5`)
- `EMAIL_DISPATCH_STALE_SENDING_MINUTES` (기본 `15`)
- `EMAIL_DISPATCH_BACKOFF_BASE_SECONDS` (기본 `60`)
- `EMAIL_DISPATCH_BACKOFF_MAX_SECONDS` (기본 `3600`)
- `EMAIL_DISPATCH_DRY_RUN` (기본 `false`)
- `EMAIL_DISPATCH_LOOP_SECONDS` (기본 `30`)
- `CRON_SECRET` (내부 크론 엔드포인트 보호용)
- `CRON_DISPATCH_BATCH_SIZE` (기본 `EMAIL_DISPATCH_BATCH_SIZE`)
- `CRON_REFRESH_LIMIT_USERS` (선택)
- `CRON_REFRESH_LIMIT_FOLLOWS` (선택)

## 내부 크론 엔드포인트
- `POST /api/internal/dispatch-email`
- `POST /api/internal/refresh-all?limit_users=...&limit_follows=...`

인증 방식:
- 요청 헤더 `X-CRON-SECRET: <CRON_SECRET>` 필수
- `CRON_SECRET` 미설정 시 `503`
- 헤더 누락/불일치 시 `401`

## GitHub Actions 스케줄
저장소에는 아래 워크플로가 포함되어 있습니다.
- `cron_dispatch_email.yml`: 15분마다 실행 (`*/15 * * * *`)
- `cron_refresh_all.yml`: 6시간마다 실행 (`0 */6 * * *`)

필요한 GitHub Secrets:
- `CRON_SECRET`
- `CRON_DISPATCH_URL` (`/api/internal/dispatch-email` 전체 URL)
- `CRON_REFRESH_URL` (`/api/internal/refresh-all` 전체 URL)

## 공개 이메일 구독 API
- `POST /api/public/subscribe-email`
- 이메일이 이미 비밀번호 기반 계정이면 `409` + `{"error":"login_required"}` 반환

요청 예시:
```json
{
  "email": "user@example.com",
  "target_type": "movie",
  "tmdb_id": 123,
  "season_number": null,
  "roles": { "drop": true, "binge": false }
}
```

`target_type` 허용값:
- `movie`
- `tv_full`
- `tv_season`

## 테스트
전체 테스트:
```bash
pytest -q
```

이메일 템플릿 테스트:
```bash
pytest -q tests/test_email_templates.py
```

## Docker 실행
```bash
docker build -t dropbinge .
docker run -p 10000:10000 \
  -e DATABASE_URL=... \
  -e JWT_SECRET=... \
  -e TMDB_BEARER_TOKEN=... \
  dropbinge
```

Docker 이미지는 프론트엔드를 함께 빌드하여 포함합니다.

## 보안 및 제한 사항
- 기본 `JWT_SECRET`은 개발용이므로 운영 환경에서 반드시 변경 필요
- JWT 토큰에 만료(`exp`)가 없으므로 운영 시 만료 정책 도입 권장
- 공개 이메일 구독 API에 더블 옵트인/강한 스팸 방지 장치가 없어 운영 시 보강 필요
- 운영 환경에서는 rate limiting, 입력 검증, 로깅/모니터링 추가 권장

## 기여
- 이슈/PR 환영
- 변경 사항은 테스트 후 PR에 요약과 의도를 함께 작성 권장

## 라이선스
현재 저장소에 `LICENSE` 파일이 없습니다.  
오픈소스 배포 시 적절한 라이선스를 선택해 추가하세요.
