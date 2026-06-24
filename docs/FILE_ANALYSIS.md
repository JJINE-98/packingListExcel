# 첨부 파일 분석 결과

## 1. PDF에서 추출 가능한 데이터

PDF는 A4 5페이지 스캔 이미지이며 텍스트 레이어가 없다. 대상 `PACKING LIST`는 5페이지다.

- 기본 정보: Date, Invoice Ref.No., Flight, ETD/ETA, Destination, Ship By, AWB NO.
- 상품 정보: Customer, Product Name, Variety/Grade, Size/KG
- 사이즈 수량: 8, 10, 12, 14, 16, 18, 20, 22
- 합계: Total Quantity, Total Net Weight, Total Gross Weight
- 기타: Remarks

샘플 실측값:

- Date: `06 Jun., 2026`
- Invoice: `9B-060626-SQRXKR-1`
- Flight: `SQ705-SQ606/07-06-2026`
- Destination: `KOREA`
- Ship By: `Air`
- AWB: `618-5548 6071`
- Product: `Fresh Mango`
- Variety/Grade: `Mahachanok Grade C`
- Size/KG: `5`
- Size 10/12/14/16/18: `7 / 262 / 128 / 30 / 73`
- Total Quantity/Net/Gross: `500 / 2500 / 2750`

## 2. Excel 실제 입력 셀

통합문서는 `출고요청서`, `가락`, `Sheet1`의 3개 시트다. 업무 입력 대상은 `출고요청서`이며 샘플 AWB `618-5548-6071`은 `BH:BL` 블록, 데이터 행은 27행이다.

| 데이터 | 실제 셀 |
|---|---|
| 통관일자 | C27 |
| B/L No. 설명 | D27 |
| AWB 블록 제목 | BH14 |
| 품종 제목 | BH15 |
| Size 10 | BH27 |
| Size 12 | BI27 |
| Size 14 | BJ27 |
| Size 16 | BK27 |
| Size 18 | BL27 |
| 합계 | BS27 |
| 비고 | BT27 |
| 블록 합계 10~18 | BH30:BL30 |

템플릿에는 Invoice, Flight, Destination, Ship By, Size 8/20/22, Net/Gross Weight 전용 입력 셀이 없다. 따라서 임의 주소를 만들지 않고 웹 검수 데이터로 유지한다.

## 3. PDF ↔ Excel 매핑

- Date → C27 (Excel 날짜 일련번호)
- AWB + 총수량 + Remarks → D27
- AWB NO. → BH14
- Variety + Grade(없으면 Product Name) → BH15
- Size 10/12/14/16/18 → BH27:BL27
- Total Quantity → BS27
- Remarks → BT27
- 합계 캐시 → BH30:BL30

## 4. OCR 전략

1. pdfjs-dist로 모든 페이지를 2배 해상도 Canvas로 렌더링
2. Tesseract.js 영문 모델로 브라우저 내 OCR
3. 샘플처럼 PACKING LIST가 뒤쪽에 있는 문서를 고려해 마지막 페이지부터 인식
4. 라벨 기반 정규식과 사이즈 행 패턴으로 구조화
5. 수량 합계 및 `Size/KG × Total Quantity`로 누락값 보조 계산
6. `IOcrProvider` 인터페이스로 CLOVA, Google Vision, Upstage, OpenAI JSON 정규화 모듈 교체 가능

## 5. 예외 처리

- PDF 외 파일 차단
- PDF 렌더링/워커 실패 메시지
- OCR 결과 공백 차단
- OCR 진행률과 페이지 표시
- 템플릿 HTTP 로드/시트 누락 오류
- Date, AWB, 상품 행 필수 검증
- Excel 생성/다운로드 오류
- 사용자가 OCR 결과를 수정·행 추가·복사·삭제·초기화 가능
