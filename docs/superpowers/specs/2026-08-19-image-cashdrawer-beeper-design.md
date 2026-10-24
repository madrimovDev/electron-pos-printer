# Rasm chop etish, cash drawer va beeper — dizayn spetsifikatsiyasi

- **Sana:** 2026-08-19
- **Paket:** `@madrimov/electron-pos-printer`
- **Maqsad versiya:** `2.1.0`
- **Bosqich:** 2/3 — kontent featurelari
- **Branch:** `feat/image-cashdrawer-beeper`, `feat/raw-escpos-core` ustidan ajratilgan
- **Oldingi bosqich:** `docs/superpowers/specs/2026-08-19-raw-escpos-core-design.md` (PR #1, hali merge qilinmagan)

## 1. Kontekst va muammo

1-bosqich raw ESC/POS yoʻlini asosiy qildi va matn kodlashni tuzatdi. Uchta kontent turi esa hali yetib boʻlmaydigan holda qoldi:

- **Rasm.** `PrintContent` da `image` turi bor, `ReceiptBuilder.image()` metodi bor, `Commands.IMAGE.RASTER()` yozilgan va testlangan — lekin builder `image` kontentini uchratganda **hech narsa chiqarmaydi**. 1-bosqichda bu ataylab shunday qilingan edi: oldin u `[IMAGE]` degan matnni mijozning chekiga bosardi, bu aniq nuqson edi, xato tashlash esa logotipli har bir `fromData()` chaqiruvini buzardi.
- **Cash drawer va beeper.** `Commands.CASH_DRAWER.OPEN_PIN2/PIN5` va `Commands.BEEP()` 1-bosqichda yozildi, testlandi va `Buffer` shakliga oʻtkazildi — lekin `PrintContent` da mos variant yoʻq, shuning uchun ularga API orqali yetib boʻlmaydi.

Bu bosqich uchalasini ham ulaydi.

## 2. Qamrov

### Kiritiladi

1. PNG dekodlash — zero-dependency, `node:zlib` ustida.
2. Rasterizatsiya quvuri — alpha kompozitsiya, grayscale, oʻlcham, dithering, bit qadoqlash, band’lar.
3. `PrintContent` ga `cashdraw` va `beep` variantlari.
4. `ImageOptions` kengayishi va `ImageContent.source` semantikasini aniqlashtirish.
5. `ReceiptBuilder.openCashDrawer()` va `.beep()`.
6. Yakuniy koʻrikdan qolgan ikkita qarz: `buildContent` exhaustiveness tekshiruvi va QR yuk hajmi validatsiyasi.
7. Hujjatlar, `example/` va versiya.

### Kiritilmaydi

- **JPEG dekodlash.** Huffman va DCT dekodlash ming satrdan ortiq va xato ehtimoli yuqori; zero-dependency qoidasi bilan birga bu bosqichning eng katta xavfi boʻlardi. Logotiplar amalda deyarli har doim PNG.
- **Fayl yoʻlidan oʻqish.** §7.2 ga qarang — `source` faqat base64 / data URL.
- **3-bosqich:** TCP/IP tarmoq printer, transport abstraksiyasi, printer status, print queue.

## 3. Qabul qilingan qarorlar

| Qaror | Tanlov | Sabab |
|---|---|---|
| Branch | `feat/raw-escpos-core` ustidan yangi branch | Bu bosqich 1-bosqich kodiga tayanadi; PR #1 uzoq kutsa ham ish toʻxtamaydi. Stacked PR boʻladi |
| Rasm formati | Faqat PNG | `node:zlib` bilan zero-dep dekodlanadi — probe bilan tasdiqlangan. JPEG rad etildi |
| Manba | Faqat base64 / data URL | Fayl yoʻli renderer’ga IPC orqali ixtiyoriy fayl oʻqitish imkonini berardi. Builder sof funksiya boʻlib qoladi va fayl tizimiga umuman tegmaydi. Main jarayondagi chaqiruvchi bir satrda oʻzi oʻqiydi |
| 1-bitga tushirish | Ikkisi ham, default `threshold` | Logotip asosiy holat va u odatda allaqachon qora-oq; termal printerdagi nuqta yoyilishi mayda dither naqshini loyqalashtiradi. Fotosurat uchun `floyd-steinberg` |
| Modul boʻlinishi | Dekodlash va rasterizatsiya alohida | Ular boshqacha yiqiladi: PNG bugi «oʻqilmadi», dithering bugi «xunuk chiqdi». Bitta modulda test qaysi bosqich buzilganini aytmaydi |
| Xato siyosati | Buzuq rasm xato tashlaydi | 1-bosqichdagi «jimgina oʻtkazish» qarorining teskarisi — 4.6 ga qarang |
| Versiya | `2.1.0` | Asosan additive; yagona xatti-harakat oʻzgarishi CHANGELOG’da vaqtinchalik deb yozilgan edi |

## 4. PNG dekodlash

### 4.1 Zero-dependency asosi

`node:zlib` Node’ning oʻzida bor, PNG konteyneri esa oddiy chunk formati. Bu spec yozilishidan oldin probe bilan tasdiqlandi: 8×4 RGBA PNG yasab, uni faqat standart kutubxona bilan qayta oʻqish muvaffaqiyatli boʻldi.

### 4.2 Qoʻllab-quvvatlanadigan matritsa

| Rang tipi | Bit chuqurligi |
|---|---|
| 0 — grayscale | 1, 2, 4, 8 |
| 2 — RGB | 8 |
| 3 — palette (`PLTE`, ixtiyoriy `tRNS`) | 1, 2, 4, 8 |
| 4 — grayscale + alpha | 8 |
| 6 — RGBA | 8 |

Barcha filtr turlari qoʻllab-quvvatlanadi: None (0), Sub (1), Up (2), Average (3), Paeth (4).

4-bit palette’ni qoʻllab-quvvatlash alohida ahamiyatga ega: TinyPNG kabi optimizatorlar logotiplarni aynan shunday siqadi, va ularni rad etsak koʻp real fayl ishlamay qoladi.

### 4.3 Aniq xato bilan rad etiladi

- 16-bit chuqurlik
- Interlaced (Adam7)
- Notoʻgʻri CRC
- Buzilgan chunk tuzilishi yoki yoʻqolgan `IHDR`/`IDAT`
- PNG imzosi mos kelmasligi

Har bir xato nimani kutgani va nimani topganini aytadi — barcode validatsiyasidagi uslub.

Notanish yordamchi chunk’lar (`tEXt`, `pHYs`, `gAMA`, `iCCP` va h.k.) jimgina oʻtkazib yuboriladi.

### 4.4 CRC tekshiruvi

Har bir chunk’ning CRC32 qiymati tekshiriladi. Jadval bir marta hisoblanadi va keshlanadi.

### 4.5 Kirish oʻlchami chegarasi

`inflateSync` va dithering — sinxron CPU ishi va u main jarayonda bajariladi. 1-bosqich CHANGELOG’i aynan main jarayonni bloklamaslik uchun `writeFileSync` dan voz kechgan edi, shuning uchun bu yerda chegara qoʻyiladi: kirish rasmi **4096×4096** dan katta boʻlsa, tushunarli xato bilan rad etiladi.

Chegara hujjatlashtiriladi. Rasterizatsiyadan keyingi chiqish har doim kichik — bosiladigan kenglik 576 nuqtadan oshmaydi.

### 4.6 Xato siyosatining ochiq oʻzgarishi

1-bosqichda `image` kontenti **jimgina oʻtkazib yuborilardi**, va bu qaror shunday asoslangan edi: oʻshanda hamma rasm ishlamasdi, shuning uchun xato tashlash logotip beradigan har bir `fromData()` chaqiruvini buzardi, chop etishning butunlay yiqilishi esa logotip yoʻqolishidan qimmatga tushardi.

Endi holat teskari: faqat **buzuq** rasm yiqiladi, toʻgʻrilari ishlaydi. Shuning uchun xato tashlash toʻgʻri va barcode validatsiyasi bilan izchil. Bu avvalgi qarorning teskarisi boʻlgani uchun CHANGELOG’da ochiq yoziladi.

## 5. Rasterizatsiya quvuri

Tartib qatʻiy:

```
PNG baytlari → dekodlash → RGBA piksellar
  → oq fon ustiga alpha kompozitsiya
  → grayscale (luminance)
  → oʻlchamni moslash (box averaging, faqat kichraytirish)
  → dithering (threshold | floyd-steinberg)
  → MSB-first bit qadoqlash
  → band’lar bilan chiqarish
```

### 5.1 Alpha kompozitsiya

Logotiplar deyarli har doim shaffof fonli RGBA PNG. Alpha kanali shunchaki tashlansa, shaffof piksel `(0,0,0,0)` **qora** boʻlib qoladi va butun logotip toʻldirilgan toʻrtburchak boʻlib chiqadi.

Shuning uchun grayscale’dan **oldin** oq fon ustiga kompozitsiya qilinadi:

```
out = src * alpha + 255 * (1 - alpha)
```

Bu birinchi chekda uchraydigan eng ehtimolli bug, shuning uchun uning oʻz testi boʻladi.

### 5.2 Grayscale

Luminance formulasi bilan, kanallar oʻrtachasi bilan **emas**:

```
gray = 0.299 R + 0.587 G + 0.114 B
```

Oʻrtacha koʻk rangni haddan tashqari yorqin, qizilni haddan tashqari toʻq koʻrsatadi — koʻk logotip oq boʻlib yoʻqoladi.

### 5.3 Oʻlchamni moslash

**Dithering’dan oldin bajariladi.** Bu 1-bosqichdagi «translit layout’dan oldin» invariantining aynan oʻxshashi: avval dithering qilinsa, keyingi kichraytirish dither naqshini buzadi va natija loyqa chiqadi.

Kichraytirish **box averaging** bilan — nearest-neighbour mayda matn va nozik chiziqlarni yoʻqotadi.

**Kattalashtirish yoʻq.** Rasm bosiladigan sohadan keng boʻlsagina kichraytiriladi; aks holda oʻz oʻlchamida qoladi. Kichik logotipni qogʻoz kengligiga choʻzish uni pikselli qiladi.

### 5.4 Bosiladigan kenglik

| Qogʻoz | Bosiladigan kenglik |
|---|---|
| 58mm | **384** nuqta |
| 80mm | **576** nuqta |

Bu qiymatlar yangi konstantalar sifatida yoziladi. **Mavjud `getPageWidthPixels()` ishlatilmaydi** — u qogʻozning toʻliq kengligini qaytaradi (464 va 640), va u ishlatilsa har bir logotip bosiladigan sohadan chetga chiqib ketardi.

384/576 qiymatlari uch mustaqil manba bilan tasdiqlangan: `charsPerLine × 12` (32×12=384, 48×12=576), `html-builder` dagi 48mm/72mm, va 203 DPI termal printerlar standarti.

`ImageOptions.width` foydalanuvchiga aniq kenglik berish imkonini beradi, lekin u ham shu chegara bilan cheklanadi.

### 5.5 Dithering

- **`threshold`** (default) — bitta sozlanadigan chegara, `ImageOptions.threshold`, default 128.
- **`floyd-steinberg`** — xatoni qoʻshnilarga tarqatish: oʻngga 7/16, pastga-chapga 3/16, pastga 5/16, pastga-oʻngga 1/16.

Default `threshold` sababi: logotip asosiy holat va u odatda allaqachon qora-oq, threshold uni aniq chiqaradi; termal printerdagi nuqta yoyilishi (blooming) esa mayda dither naqshini loyqalashtiradi.

### 5.6 Bit qadoqlash

**MSB-first** — bit 7 chapdagi piksel. Qora piksel = 1.

Har bir qator `ceil(width / 8)` bayt egallaydi; qator oxiridagi toʻldiruvchi bitlar 0 (oq).

Qoʻlda hisoblangan kichik bitmap uchun aniq baytlar bilan test yoziladi — 1-bosqichdagi «oʻlchangan, eslab qolingan emas» uslubida.

### 5.7 Band’lar va satr oraligʻi

Arzon printerlarning buferi cheklangan va baland rasterni butunlay yutmaydi — logotip umuman chiqmaydi, foydalanuvchi esa sababini topolmaydi. Shuning uchun rasm **128 qatorli band’larga** boʻlinadi, har biri alohida `GS v 0` komandasi. Band balandligi ichki konstanta — u sozlanadigan qilinmaydi, chunki foydalanuvchida uni tanlash uchun maʻlumot yoʻq va noto'g'ri qiymat muammoni faqat yashiradi.

Bunda nozik joy bor: `GS v 0` chop etgandan keyin keyingi satr boshiga oʻtadi, yaʻni band’lar orasida satr oraligʻi qadar boʻshliq paydo boʻladi va logotip chiziqlarga boʻlinib koʻrinadi.

Shuning uchun butun rasm `ESC 3 0` (satr oraligʻi nol) va `ESC 2` (default) orasiga oʻraladi. Ikkala komanda `Commands.LINE_SPACING` da allaqachon mavjud va hozirgacha hech qayerda ishlatilmagan.

### 5.8 Tekislash

`ImageOptions.align` `Commands.ALIGN` orqali qoʻllanadi, matn kontenti bilan bir xil uslubda: rasmdan oldin tekislash qoʻyiladi, keyin `ALIGN.LEFT` ga qaytariladi.

**Rasmdan keyin qoʻshimcha satr tashlanmaydi.** `GS v 0` ning oʻzi keyingi satr boshiga oʻtadi; bundan ortigʻi kerak boʻlsa chaqiruvchi `feed` kontentini qoʻshadi. Bu boshqa kontent turlari bilan izchil — ular ham oʻzidan keyin boʻsh joy qoldirmaydi.

## 6. Cash drawer va beeper

Ikkalasi ham **kontent elementi** boʻladi, alohida metod emas. Sabab: tartib aniq boʻlishi kerak — kassa qutisi chek kesilgandan keyin ochilishi kerakmi yoki oldin, buni foydalanuvchi kontent massivida koʻrsatadi.

```ts
export interface CashDrawerContent extends PrintContentBase {
  type: 'cashdraw';
  /** Ulagich pini. Default 2 — eng keng tarqalgan ulanish. */
  pin?: 2 | 5;
}

export interface BeepContent extends PrintContentBase {
  type: 'beep';
  /** Signal soni, 1–9. Default 1. */
  times?: number;
  /** Har bir signal davomiyligi, 1–9. Default 3. */
  duration?: number;
}
```

Ikkisi ham `Commands.CASH_DRAWER` va `Commands.BEEP` ga ulanadi.

**`ESC B` universal emas.** Koʻp printerlar beeper komandasini qoʻllab-quvvatlamaydi va uni jimgina eʻtiborsiz qoldiradi. Bu README’da ochiq yoziladi, chunki «beep ishlamayapti» degan savol muqarrar va uning javobi kodda emas, apparatda.

## 7. API yuzasi

### 7.1 `ImageOptions`

```ts
export interface ImageOptions {
  /** Maqsadli kenglik, printer nuqtasida. Bosiladigan kenglik bilan cheklanadi. Hech qachon kattalashtirmaydi. */
  width?: number;
  /** Tekislash. */
  align?: TextAlign;
  /** 1-bitga qanday tushirish. Default 'threshold'. */
  dither?: 'threshold' | 'floyd-steinberg';
  /** Chegara 0–255, faqat dither: 'threshold' uchun. Default 128. */
  threshold?: number;
}
```

### 7.2 `ImageContent.source`

Semantikasi aniqlashtiriladi: **faqat base64 yoki `data:image/png;base64,...` URL**. Fayl yoʻli qabul qilinmaydi. Hozirgi JSDoc «base64 yoki fayl yoʻli» deydi va u tuzatiladi.

Main jarayondagi chaqiruvchi oʻzi bir satrda oʻqiydi:

```ts
readFileSync('logo.png').toString('base64')
```

### 7.3 `ReceiptBuilder`

Ikkita yangi metod: `openCashDrawer(pin?: 2 | 5)` va `beep(times?: number, duration?: number)`. `image()` oʻzgarmaydi.

### 7.4 Yangi ommaviy eksportlar

```ts
/** Dekodlangan rasm: har doim 8-bit RGBA, kanal tartibi R,G,B,A. */
export interface DecodedImage {
  width: number;
  height: number;
  /** width * height * 4 bayt. */
  pixels: Buffer;
}

export function decodePNG(data: Buffer): DecodedImage;

/** 1-bit raster: har bir qator ceil(width/8) bayt, MSB-first, qora = 1. */
export interface RasterImage {
  width: number;
  height: number;
  data: Buffer;
}

export function rasterize(image: DecodedImage, options: {
  maxWidth: number;
  width?: number;
  dither?: 'threshold' | 'floyd-steinberg';
  threshold?: number;
}): RasterImage;

export const PRINTABLE_WIDTH_58 = 384;
export const PRINTABLE_WIDTH_80 = 576;
```

`decodePNG` har doim RGBA qaytaradi — grayscale va palette kirishlar ham shu shaklga keltiriladi, shunda `rasterize` bitta kod yoʻliga ega boʻladi.

## 8. Yakuniy koʻrikdan qolgan qarzlar

1-bosqichning yakuniy koʻriki ikkita topilmani aynan shu bosqichga kechiktirgan edi. SDD workspace’i oʻchirilgan, shuning uchun ular shu spec’da yozib qoʻyiladi.

### 8.1 `buildContent` exhaustiveness tekshiruvi

`buildContent` ning `default: return []` shoxi bugungi kunda yetib boʻlmaydigan, lekin exhaustiveness tekshiruvi yoʻq — yangi `PrintContent` varianti qoʻshilsa u kompilyatsiyadan oʻtadi va **jimgina hech narsa chiqarmaydi**.

Yakuniy koʻrik buni «yangi variant paydo boʻlgunicha tishlamaydi» deb kechiktirgan edi. **Aynan hozir tishlaydi**, chunki ikkita variant qoʻshilyapti. `const _exhaustive: never = content` shu bosqichda qoʻshiladi.

### 8.2 QR yuk hajmi validatsiyasi

`Commands.QRCODE.STORE` faqat 65532 baytdan oshganini rad etadi, haqiqiy sigʻim esa ancha kichik. Xato tuzatish darajasi build vaqtida maʻlum, shuning uchun aniq cheklar qoʻyiladi (bayt rejimi, version 40):

| Daraja | Maksimal bayt |
|---|---|
| L | 2953 |
| M | 2331 |
| Q | 1663 |
| H | 1273 |

Bu barcode validatsiyasi bilan bir xil sinf: notoʻgʻri maʻlumot printerga yuborilmasdan oldin rad etiladi.

**Validatsiya qayerda yashaydi:** `escpos-builder.ts` da, `validateBarcodeValue` yonida, `validateQRCodeValue(value, errorCorrection)` nomi bilan. Sabab: sigʻim xato tuzatish darajasiga bogʻliq, va bu darajani faqat builder biladi — `Commands.QRCODE.STORE` ga u uzatilmaydi. `STORE` dagi mavjud 65532 baytlik mutlaq chegara oʻz joyida qoladi, ikkinchi himoya qatlami sifatida.

## 9. Testlar va tekshirish

Termal printer hali ham yoʻq. Tekshirish 1-bosqichdagi uslubni davom ettiradi.

### 9.1 Test fixture’lari kod bilan generatsiya qilinadi

PNG fixture’lari git’ga binar blob sifatida qoʻyilmaydi — ular test faylida programmatik yasaladi (probe’dagi mini PNG encoder asosida). Bu «oʻlchangan, eslab qolingan emas» qoidasining shu bosqichdagi shakli: fixture nima ekanini diff’da oʻqib boʻladi, va uni yasagan kod testning oʻzida turadi.

### 9.2 Test qamrovi

| Fayl | Nimani qoplaydi |
|---|---|
| `png.test.ts` | Har bir rang tipi va bit chuqurligi; har bir filtr turi; `tRNS`; notanish chunk oʻtkazib yuborilishi; CRC xatosi; 16-bit rad etilishi; interlaced rad etilishi; oʻlcham chegarasi; buzilgan imzo |
| `raster.test.ts` | **Alpha kompozitsiya** — shaffof piksel oq boʻladi, qora emas; luminance formulasi (koʻk vs qizil); box averaging; kattalashtirish yoʻqligi; threshold; Floyd–Steinberg xato tarqatishi; **MSB-first qadoqlash qoʻlda hisoblangan baytlar bilan**; toʻldiruvchi bitlar 0 |
| `escpos-builder.test.ts` | `image` endi bayt chiqaradi; band’lar `ESC 3 0` va `ESC 2` orasida; `cashdraw` va `beep` baytlari; buzuq rasm xato tashlaydi; QR sigʻim cheklari |
| `receipt-builder.test.ts` | `openCashDrawer()` va `beep()` toʻgʻri kontent yasaydi |
| `golden.test.ts` | Logotipli yangi golden fixture |

### 9.3 Vizual tekshirish

`dumpESCPOS` raster komandasini oʻlchami bilan koʻrsatadi, lekin rasmning oʻzini koʻrsatmaydi. Shuning uchun test yordamchisi qoʻshiladi: 1-bit rasterni ASCII san’atga aylantirish (`█` va boʻshliq). Bu dithering natijasini koʻz bilan tekshirish imkonini beradi va aynan shu usul bilan bu spec’ning dithering qarori qabul qilingan.

### 9.4 Darvoza

`npm run test:run`, `npm run typecheck` va `npm run build` — uchalasi ham toza. 1-bosqichdan kelgan 227 test buzilmasligi kerak.

## 10. Hujjatlar va versiya

- `package.json` → `2.1.0`
- `CHANGELOG.md` → `2.1.0` yozuvi, unda xato siyosatining oʻzgarishi (4.6) alohida taʻkidlanadi
- `README.md` — «Print modes» jadvalidagi «images skipped until raster support lands» qatori tuzatiladi; yangi «Images and logos» boʻlimi: qoʻllab-quvvatlanadigan PNG matritsasi, base64 talab qilinishi, dithering tanlovi, bosiladigan kenglik, oʻlcham chegarasi; cash drawer va beeper misoli va `ESC B` universal emasligi haqida ogohlantirish
- `CLAUDE.md` — `src/images/` katalogi va rasterizatsiya quvuri tartibi
- `example/` — namuna chekka kichik logotip va cash-drawer tugmasi

## 11. Tegiladigan fayllar

### Yangi

- `src/images/png.ts` — PNG dekodlash
- `src/images/png.test.ts`
- `src/images/raster.ts` — rasterizatsiya quvuri
- `src/images/raster.test.ts`
- `src/images/index.ts` — barrel
- `src/images/__testutils__/make-png.ts` — test fixture generatori
- `src/images/__testutils__/ascii-art.ts` — 1-bit rasterni koʻrish uchun

### Oʻzgartiriladi

- `src/commands/escpos-builder.ts` — `image` shoxi, `cashdraw`, `beep`, exhaustiveness tekshiruvi, QR sigʻimi
- `src/commands/escpos-builder.test.ts`
- `src/commands/esc-pos.ts` — QR sigʻim cheklari
- `src/commands/esc-pos.test.ts`
- `src/types/index.ts` — `CashDrawerContent`, `BeepContent`, `PrintContentType`, `ImageOptions`, `ImageContent.source` JSDoc, bosiladigan kenglik konstantalari
- `src/utils/receipt-builder.ts` — `openCashDrawer()`, `beep()`
- `src/utils/receipt-builder.test.ts`
- `src/commands/golden.test.ts` va fixture — logotip bilan
- `src/index.ts` — yangi eksportlar
- `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `package.json`
- `example/index.html`, `example/main.js`

## 12. Xavflar va yumshatish

| Xavf | Yumshatish |
|---|---|
| Alpha kanali tashlanib, logotip qora toʻrtburchak boʻlib chiqishi | 5.1 da alohida talab; oʻz testi bor; ASCII san’at yordamchisi bilan koʻz bilan tekshiriladi |
| PNG filtr implementatsiyasidagi xato | Har bir filtr turi uchun alohida test; fixture’lar kod bilan yasaladi, shuning uchun kutilgan natija hisoblab chiqiladi |
| Bosiladigan kenglik oʻrniga qogʻoz kengligi ishlatilishi | Yangi konstantalar; `getPageWidthPixels()` ishlatish spec’da ochiq taqiqlangan |
| Baland rasterni printer yutmasligi | 128 qatorli band’lar; satr oraligʻi nolga qoʻyiladi |
| Sinxron dekodlash main jarayonni bloklashi | Kirish oʻlchami 4096×4096 bilan cheklanadi va hujjatlashtiriladi |
| Dithering natijasi apparatsiz tekshirilmasligi | ASCII san’at yordamchisi; default `threshold` eng kam xavfli tanlov |
| Band’lar orasida boʻshliq qolishi | `ESC 3 0` / `ESC 2` bilan oʻrash; golden fixture buni muhrlab qoʻyadi |

## 13. Bajarilganlik mezoni

1. Shaffof fonli RGBA PNG logotip chekda toʻgʻri chiqadi — qora toʻrtburchak emas.
2. 4-bit palette PNG (TinyPNG chiqishi) qabul qilinadi.
3. 16-bit va interlaced PNG tushunarli xato bilan rad etiladi.
4. Bosiladigan kenglikdan keng rasm kichraytiriladi; kichik rasm kattalashtirilmaydi.
5. `dither: 'floyd-steinberg'` gradientni saqlaydi; default `threshold` toza logotipni aniq chiqaradi.
6. Rasm 128 qatorli band’larda, `ESC 3 0` va `ESC 2` orasida chiqadi.
7. `cashdraw` va `beep` kontenti toʻgʻri baytlar chiqaradi va `ReceiptBuilder` dan yetib boradi.
8. `buildContent` da exhaustiveness tekshiruvi bor; yangi variant qoʻshilsa kompilyatsiya yiqiladi.
9. QR yuki sigʻimdan oshsa, printerga yuborilmasdan rad etiladi.
10. `npm run test:run`, `npm run typecheck` va `npm run build` toza; 1-bosqichdan kelgan 227 test buzilmagan.
11. README, CHANGELOG va CLAUDE.md haqiqatga mos; `example/` logotip koʻrsatadi.
