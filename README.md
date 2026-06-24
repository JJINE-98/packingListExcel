# 패킹리스트 출고요청서 자동 생성

스캔 패킹리스트 PDF를 브라우저에서 OCR 처리하고, 사용자가 결과를 검수한 뒤 실제 출고요청서 Excel 템플릿에 값을 채워 내려받는 정적 React 애플리케이션입니다. PDF와 Excel 데이터는 서버로 전송하지 않습니다.

## 원본 분석

구현 전 PDF 5페이지와 Excel 3개 시트의 값, 수식, 서식, 레이아웃을 직접 분석했습니다. 실제 셀 매핑과 OCR/예외 처리 설계는 [docs/FILE_ANALYSIS.md](docs/FILE_ANALYSIS.md)를 참고하세요.

## 설치 및 실행

```bash
npm install
npm run dev
```

또는 pnpm을 사용할 수 있습니다.

```bash
pnpm install
pnpm dev
```

프로덕션 빌드:

```bash
npm run build
npm run preview
```

## GitHub Pages 자동 배포

이 프로젝트의 GitHub 저장소명은 `packingListExcel`을 기준으로 설정되어 있습니다.

- Vite 배포 base: `/packingListExcel/`
- GitHub Actions: `.github/workflows/deploy.yml`
- 예상 주소: `https://<GitHub사용자명>.github.io/packingListExcel/`

배포 순서:

1. GitHub에 `packingListExcel` 저장소를 생성합니다.
2. 현재 프로젝트 전체를 저장소의 `main` 브랜치에 push합니다.
3. 저장소의 `Settings → Pages`로 이동합니다.
4. `Build and deployment → Source`를 `GitHub Actions`로 선택합니다.
5. `main` 브랜치에 push할 때마다 `Deploy to GitHub Pages` 작업이 자동 실행됩니다.
6. `Actions` 탭에서 작업이 완료되면 Pages 주소로 접속합니다.

워크플로는 Node.js 22와 pnpm을 사용해 다음 과정을 자동 실행합니다.

```text
pnpm install --frozen-lockfile
pnpm run build
dist 업로드
GitHub Pages 배포
```

`pnpm-workspace.yaml`에서 Vite가 사용하는 `esbuild`와 OCR 라이브러리인
`tesseract.js`의 설치 스크립트를 명시적으로 허용합니다. 따라서 GitHub Actions의
비대화식 설치 환경에서도 `ERR_PNPM_IGNORED_BUILDS` 오류 없이 설치됩니다.

Actions 탭의 `Deploy to GitHub Pages`에서 `Run workflow`를 눌러 수동 재배포할 수도 있습니다.

## gh-pages 명령으로 수동 배포

GitHub Actions 대신 로컬에서 `gh-pages` 브랜치로 배포할 수도 있습니다.

```bash
npm install
npm run deploy
```

이 방식에서는 GitHub Pages Source를 `Deploy from a branch`로 선택하고 `gh-pages` 브랜치의 `/ (root)`를 지정해야 합니다. 자동 배포와 수동 배포 방식은 혼용하지 않는 것을 권장합니다.

## 저장소명 변경

저장소 이름을 변경하면 `vite.config.ts`의 기본 base도 변경해야 합니다.

```ts
base: "/새로운저장소명/"
```

또는 빌드할 때 환경 변수로 덮어쓸 수 있습니다.

```bash
VITE_BASE_PATH=/새로운저장소명/ npm run build
```

Windows PowerShell:

```powershell
$env:VITE_BASE_PATH="/새로운저장소명/"; npm run build
```

## OCR 구조

- `pdfService`: pdfjs-dist로 PDF 페이지 렌더링
- `ocrService`: `IOcrProvider`와 Tesseract.js 구현
- `extractionService`: OCR 원문을 업무 데이터로 정규화
- `useOcr`: 진행률, 재실행, 오류 및 리소스 관리

현재는 영문 Tesseract 모델을 사용합니다. 전체 페이지 OCR과 별도로 마지막
`PACKING LIST` 페이지의 상품 표를 셀 단위로 확대·대비 보정해 재인식합니다.
Customer, Product, Size/KG, Size 8~22, 총수량, 순중량, 총중량을 각 열의 상대
위치에 맞춰 읽기 때문에 표 전체 원문 OCR보다 숫자 인식 안정성이 높습니다.
또한 OCR이 `73`을 `7`처럼 마지막 한 자리만 누락한 경우, Total Quantity와
다른 사이즈 수량의 합을 비교해 유일하게 성립하는 값으로 자동 보정합니다.

CLOVA OCR, Google Vision, Upstage Document AI는 `IOcrProvider`의
`extractText`, `extractFields`, `terminate`를 구현해 교체할 수 있습니다.

OpenAI 기반 JSON 정규화 모듈도 같은 인터페이스로 추가할 수 있습니다. API 키를 정적 사이트 코드에 직접 포함하지 말고, 사용자가 세션에서 입력하거나 별도 프록시 또는 서버리스 함수를 사용해야 합니다.

## Excel 매핑 수정

`src/config/excelMapping.ts`에 실제 셀 주소가 정의되어 있습니다. 현재 첨부 템플릿 기준 대상 시트는 `출고요청서`, 대상 행은 27행, 사이즈 블록은 `BH:BL`입니다.

템플릿에 없는 필드는 임의 셀에 쓰지 않습니다. 다른 거래처 템플릿을 지원하려면 매핑 객체와 Excel exporter를 거래처별로 분리하면 됩니다.

## 템플릿 교체

`public/templates/shipping-template.xlsx`를 교체합니다. 시트명이나 셀 위치가 바뀌면 반드시 `src/config/excelMapping.ts`도 함께 수정해야 합니다.

## 주요 기능

- PDF 업로드와 페이지 미리보기
- 사용자가 관리 중인 `.xlsx` Excel 첨부
- 브라우저 OCR 및 진행률 표시
- OCR 원문과 구조화 결과 표시
- 셀 수정, 행 추가·복사·삭제·초기화
- 간단 사용 매뉴얼 모달
- 첨부 Excel의 첫 번째 `출고요청서` 시트에 출고 행 추가
- 빈 데이터 행이 없으면 합계 행 위에 동일 스타일의 행 자동 삽입
- 첨부 Excel의 나머지 시트 내용과 수식 유지
- Excel을 첨부하지 않으면 내장 템플릿 기반 다운로드
- 반응형 MES/ERP 스타일 UI
- GitHub Pages 자동 배포

## 기존 관리 Excel에 행 추가

PDF OCR 결과를 검수한 뒤 기존 관리 Excel을 첨부하면 다음 순서로 처리합니다.

1. 첨부 파일의 첫 번째 시트가 `출고요청서`인지 확인합니다.
2. `B/L No.` 헤더와 데이터 영역, 합계 행을 자동으로 찾습니다.
3. PDF의 AWB 번호와 일치하는 Excel의 AWB 열을 찾습니다.
4. 데이터 영역에 완전히 비어 있는 행이 있으면 해당 행을 사용합니다.
5. 빈 행이 없으면 합계 행 바로 위에 새 행을 삽입합니다.
6. 인접 데이터 행의 셀 스타일과 행 높이를 복사합니다.
7. 날짜, B/L 설명, 사이즈별 수량, 총수량과 비고를 입력합니다.
8. 합계 수식 범위를 새 행까지 확장하고 Excel 재계산을 활성화합니다.
9. `출고요청서` 이외의 시트에는 데이터를 쓰지 않습니다.

관리 Excel은 SheetJS로 통합문서 전체를 다시 저장하지 않습니다. 원본 `.xlsx`
ZIP에서 `출고요청서`의 worksheet XML만 수정하고 `styles.xml`, 테마, 폰트,
채우기, 테두리, 인쇄설정과 나머지 시트 파일은 그대로 유지합니다. 신규 행의
각 셀에는 기존 데이터 행의 style index를 열별로 복제하므로 배경색, 글꼴 굵기,
정렬, 테두리와 숫자 형식이 기존 양식과 동일하게 적용됩니다.
행 삽입 시에는 하단 합계 행의 값이 없는 셀 주소도 함께 이동하므로, 수치가 없는
칸에만 지정된 연속 배경색과 테두리 역시 빠지지 않습니다.

지원 파일은 `.xlsx`입니다. PDF의 AWB 번호에 해당하는 AWB 열이 기존
`출고요청서` 시트에 있어야 하며, 찾지 못하면 잘못된 열에 입력하지 않고 오류를 표시합니다.
