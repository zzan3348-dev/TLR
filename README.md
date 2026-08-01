# 1932 대체역사 인터랙티브 세계지도

React 19, TypeScript, Vite, HTML Canvas로 구현한 인터랙티브 지도 MVP입니다.
원본 지도는 `public/maps/world-1932.png`이며 생성 스크립트는 이 파일을 수정하지 않습니다.

## 실행

```sh
pnpm generate-map-assets
pnpm dev
```

수정된 원본 지도를 적용하려면:

```sh
pnpm update-map-source -- --input "C:\path\to\updated-map.png"
pnpm update-map-source -- --input "C:\path\to\updated-map.png" --dry-run
```

이 명령은 PNG 크기를 검사한 뒤 임시 디렉터리에서 전체 에셋을 먼저 생성합니다.
`--dry-run`은 정식 파일을 전혀 바꾸지 않습니다. 실제 적용 시 기존 원본을
`public/maps/backups/`에 백업하고, 생성·데이터 복사·프로덕션 빌드 중 하나라도
실패하면 원본·파생 에셋·국가 데이터를 모두 이전 스냅샷으로 복원합니다.

검증 명령:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## 지도 에셋과 국가명 라벨 생성

`pnpm generate-map-assets`는 국가 대표색과 기존 ID를 보존하면서 아래 자료를 생성합니다.

- `public/maps/generated/world-1932-fill.png`
- `public/maps/generated/world-1932-province-lines.png`
- `public/maps/generated/world-1932-country-lines.png`
- `public/maps/generated/world-1932-countries.png`
- `public/maps/generated/world-1932-id-map.png`
- `public/maps/generated/world-1932-clean-id-map.png`
- `public/maps/generated/map-generation-report.json`
- `public/maps/generated/debug/`
- `public/maps/generated/country-masks/`
- `public/maps/generated/label-envelopes/`
- `src/data/mapCountries.json`
- `src/data/mapCountryComponents.json`
- `src/data/mapCountryPhysicalComponents.json`
- `src/data/mapCountryDisplayGroups.json`
- `src/data/mapCountryLabels.json`

국가 번호는 원본 지도에서 대표색이 처음 발견된 순서로 최초 배정됩니다. 다시 생성할
때는 기존 `color`의 ID와 `name`, `shortName`, `mapLabel`, `label`, 국기 설정을
보존하고 새 색상만 마지막 번호 뒤에 추가합니다. ID 30은 보호 국가로 분류해
어두운 대표색 `#2D2C2D`가 검은 선으로 오인되지 않게 합니다.

원본의 검은 선은 전역 다중 소스 소유권 전파로 복원됩니다. 바다와 미지정 지역은
고정한 채 선의 양쪽에서 가장 가까운 소유권을 전파하고, 이후 모든 마스크·클릭 ID·
8방향 물리 연결요소·국제 국경·해안선을 clean ID map에서 다시 계산합니다.

국가명 라벨은 각 표시 그룹의 clean 마스크를 대상으로 주성분 분석(PCA), 내부 거리
변환, 실제 글자 래스터 적합도 검사를 거쳐 자동 배치됩니다. 지도에는
`label.text` → `mapLabel` → `shortLabel` → `shortName` → `name` 순서로 표시할
문구를 선택합니다. `internalName`은 내부 식별용, `name`은 정식 표시명,
`nativeName`은 현지어 보조명, `englishName`은 영문 보조명으로 분리됩니다.
국가 패널은 현지어명이 있으면 이를 우선하고, 없으면 모든 국가에 정의된 영문명을
두 번째 줄에 표시합니다. 표준 현지어 표기는
`src/data/countryNativeNames.ts`에서 국가 ID별로 관리하며, 복수 표기는 줄바꿈으로
구분해 패널 헤더에 순서대로 표시합니다.
큰 분리 영토는 `labelRepeat` 기준에 따라 국가별 설정 개수만큼 반복할 수 있으며,
각 라벨은 위 아치·아래 아치·직선 후보를 비교하되 지형을 따르는 완만한 곡선을
우선합니다. 지도에 그릴 때는 국명의 모든 공백을 제거하고 좁은 자간을 사용합니다.
곡선은 글자별 월드 좌표와 접선 각도로 렌더링됩니다.

자동 후보 평가는 자국 마스크 적합도와 함께 전역 소유권 ID 맵에서 타국 영토를
덮는 글자 픽셀 비율을 계산합니다. 타국 침범률이 높은 후보는 강하게 감점하고,
반대 곡률·다른 중심·다음 글꼴 크기를 계속 비교합니다. 자동 곡선의 중점과
`label.x/y` 앵커는 동일하게 생성하며, 수동 곡선도 런타임에서 저장 앵커에 맞춰
정렬하므로 확대 중 곡선 기준점으로 라벨이 끌려가지 않습니다.

표시 그룹 생성기는 물리 연결요소의 크기·분포·순환 경계 거리로 가까운 군도를
자동 판별합니다. 일본처럼 주요 섬이 연속된 국가는 본토 군도를 하나로 묶고,
대양을 사이에 둔 식민지나 고립 영토는 별도 그룹으로 유지합니다.
`grouping.archipelagoMode`는 국가별 자동 판정을 명시적으로 활성화하며,
`manualGroups`와 `excludedPhysicalComponentIds`는 자동 결과보다 우선합니다.
ownership/국기 마스크에는 실제 육지만 남기고, 라벨 적합도에는 별도의 buffered
label envelope와 실제 육지 포함률을 함께 사용해 좁은 해협은 건너되 먼 바다에
라벨이 뜨는 후보는 감점합니다.

프론트 지도 에셋 URL에는 `src/data/mapAssetVersion.ts`의 버전이 붙습니다. 원본이나
파생 에셋을 교체한 경우 이 값을 올리면 브라우저 캐시에 남은 이전 지도를 피할 수
있습니다.

자동 배치를 보정하려면 `src/data/mapCountries.json`의 `label` 설정을 사용합니다.

- `componentId`: 라벨을 놓을 연결영토 고정
- `mode`: `auto`, `manual`, `hidden`
- `text`: 지도 전용 문구
- `x`, `y`, `angle`, `fontSize`, `letterSpacing`: 수동 배치값
- `minZoom`, `priority`: 줌 표시 기준과 충돌 우선순위

`labelRepeat`에서는 반복 라벨의 최소 면적·상대 면적·바운딩 박스·최대 개수를
국가별로 덮어쓸 수 있습니다. `labelGroups`에서는 특정 component 묶기, 숨김/강제
표시, 그룹별 문구, `straight`/`arc-up`/`arc-down`, 위치·곡률·글꼴 크기·자간·
곡선의 start/control/end를 수동 지정할 수 있습니다. 이 값은 에셋 재생성 시
보존됩니다.

런타임 라벨은 전체 지도에서 생성 크기를 유지하고, 확대 단계에서는 줌 배율과 영토
면적에 따라 화면 글자 상한을 완만하게 높입니다. 선택 국가는 일반 라벨보다 약간
크게 허용하므로 클로즈업의 존재감은 남기되 극단적인 확대에서 글자가 화면을 덮지
않습니다. 충돌한 라벨은 숨기기 전에 같은 월드 위치에서 단계적으로 축소해 다시
배치합니다. 라벨 중심과 곡선 방향은 월드 좌표에 고정하고, 화면 글꼴 상한이 적용될
때는 그 중심을 기준으로 글자 간 경로도 함께 축소해 확대 시 자간만 벌어지는 현상을
막습니다. 라벨 상한은 줌 배율의 0.48제곱으로 완만하게 증가하며, 비선택 라벨은
76px, 선택 라벨은 80px를 넘지 않습니다. 근접 줌의 충돌 복구는 원래 크기의
70% 아래로 축소하지 않고, 그래도 충돌하면 크기를 유지해 역축소를 방지합니다.

빈 국가명은 지도 라벨에서 제외되며, 클릭 시 상태창에는 `미지정 국가`로 표시됩니다.
`allowShortMapLabel: false`인 국가는 정식 `mapLabel`을 자동 축약하지 않습니다.

## 선택 국가 프레젠테이션

국가를 선택하면 나머지 지도는 밝기·채도·대비가 낮아지고 약한 남색 비네트가
적용됩니다. 클릭한 display group은 clean 마스크로 원래 색을 복원한 뒤 국기 또는
fallback 패턴, 선택 그룹 선, 밝은 림, 강화된 국가명 순으로 렌더링됩니다.

데스크톱 국가 UI는 지도 왼쪽의 390~440px 열람 전용 프로필 패널로 열립니다.
헤더 아래에는 지도자·정치, 국민정신, 설정 이미지, 국가 개요 섹션을 위한 독립
컴포넌트가 있습니다. `src/data/countryPresentation.json`에 값이 없어도 국기,
지도자·정치, 국민정신 4칸, 설정 이미지 3칸, 국가 개요의 기본 골격은 유지합니다.
빈 칸은 어두운 음각 프레임으로만 표현하며 가짜 인물·설명·수치는 채우지 않습니다.
실제 데이터가 추가되면 같은 슬롯 안에서 이미지와 텍스트로 교체됩니다.
플레이·관리·외교·첩보 등의 행동 탭도 만들지 않습니다. 패널이 열린 상태에서도
지도 확대·이동·동서 순환을 계속 사용할 수 있고,
선택 클로즈업은 패널을 제외한 가시 지도 영역을 기준으로 중앙을 계산합니다.
모바일에서는 같은 읽기 전용 내용을 바텀시트로 표시합니다.

공통 UI 색상·표면·테두리·텍스트·그림자·반경·모션 값은 `src/styles.css`의
`--bg-*`, `--border-*`, `--text-*`, `--accent-*`, `--shadow-*`,
`--radius-*`, `--duration-*` 토큰에서 관리합니다.

`mapCountries.json`에서 다음 값을 국가별로 설정할 수 있습니다.

- `flagPath`: 국기 이미지 경로. `null`이면 404 요청 없이 fallback 사용
- `flagFit`: `cover`, `contain`, `stretch`
- `flagOpacity`: 국기 투명도
- `flagFocusMode`: `selected-component`, `selected-display-group`,
  `all-territories`
- `flagBlendMode`: `source-over`, `multiply`, `overlay`, `soft-light`

기본 범위는 `selected-display-group`입니다. 프로빈스 표시 여부에 맞춰 선택 그룹
위에 프로빈스선 또는 국가 국경선을 다시 합성하며, 월드 복사본 세 곳에 같은
월드 좌표로 선택 효과를 반복합니다.

평상시 지도 색감은 `src/data/mapTheme.ts`에서 밝기·채도·대비, navy multiply,
soft-light, 비네트를 따로 관리합니다. Canvas는 CSS 크기와 DPR을 분리하고,
축소 시 고품질 스무딩·원본 픽셀 이상 확대 시 비스무딩을 사용합니다.
