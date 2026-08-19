# Raw ESC/POS yadrosi — dizayn spetsifikatsiyasi

- **Sana:** 2026-08-19
- **Paket:** `@madrimov/electron-pos-printer`
- **Maqsad versiya:** `2.0.0` (buzuvchi)
- **Bosqich:** 1/3 — Raw ESC/POS yadrosi (poydevor)

## 1. Kontekst va muammo

Paket README va `CLAUDE.md` da **raw ESC/POS chop etish** kutubxonasi sifatida taqdim etilgan. Haqiqiy kod oqimi esa boshqa:

- `setupPrinterIPC()` → `buildHTML()` → `printHTML()` — yashirin `BrowserWindow` yaratib, Electron'ning `webContents.print()` orqali HTML chop etadi (`src/electron/main.ts:46`).
- `buildESCPOSData()` va `printRawData()` eksport qilingan, ammo **hech qanday IPC kanalidan chaqirilmaydi**. Ular faqat foydalanuvchi qoʻlda ulaganda ishlaydi — README misoli aynan shunday qilishni oʻrgatadi.

Natijada paketda ikkita parallel print yoʻli mavjud: biri hujjatlashtirilgan, ikkinchisi ulangan. Shu bilan birga raw yoʻlning oʻzida ham bir qator buzuqliklar bor — ular ulanmaganligi uchun hozirgacha sezilmagan.

Bundan tashqari matn `Buffer.from(text, 'utf8')` bilan yuboriladi. Koʻpchilik termal printerlar UTF-8 ni tushunmaydi — kirill matni va oʻzbek lotinidagi `oʻ`, `gʻ` belgilarida chekda maʻnosiz belgilar chiqadi.

## 2. Qamrov

Bu spec **faqat 1-bosqich** ni qamrab oladi. 1-bosqich poydevor: kodlash qatlami va raw quvuri boʻlmasa, keyingi bosqichlarni yozib boʻlmaydi.

### Kiritiladi

1. Raw ESC/POS ni asosiy print yoʻliga aylantirish; `PrinterConfig.mode: 'raw' | 'html'`, default `'raw'`.
2. Codepage / kodlash qatlami — zero-dependency, qoʻlda tuzilgan jadvallar, translit + `?` fallback.
3. Komanda jadvalini yagona manbaga birlashtirish.
4. Bug fixlar: `BARCODE.PRINT` formati, `IMAGE.RASTER` yaxlitlash, `CUT_PARTIAL` ziddiyati, Windows PowerShell escaping, oʻlik sync `getPrinters()`.
5. Barcode qiymat validatsiyasi.
6. `dumpESCPOS()` — hex dump / debug vositasi.
7. Testlar (TDD), golden fixture.
8. Hujjatlar: README, CHANGELOG, CLAUDE.md, v1→v2 migratsiya, `example/` ilovasi.

### Kiritilmaydi (keyingi bosqichlar)

- **2-bosqich:** rasm/logo raster chop etish, cash drawer, beeper.
- **3-bosqich:** TCP/IP tarmoq printer, transport abstraksiyasi, printer status, print queue.

`Transport` interfeysi ataylab **hozir kiritilmaydi** — bitta implementatsiya uchun abstraksiya qurish 3-bosqichda TCP'ning haqiqiy talablari koʻringanda baribir qayta yozilishga majbur qiladi.

## 3. Qabul qilingan qarorlar

| Qaror | Tanlov | Sabab |
|---|---|---|
| Print yoʻli | Raw asosiy, `mode` bilan HTML fallback | Paketning asosiy qiymati raw boshqaruvda; hujjatlar haqiqatga mos keladi |
| Dependency | Zero-dep, jadvallar qoʻlda | Paket yengil qoladi, Electron bundler bilan muammo yoʻq |
| Mos kelmaydigan belgilar | Translit jadvali, soʻnggi chora `?` | `oʻ` → `o'` oʻqiladi; jimgina buzilish ham, print yiqilishi ham boʻlmaydi |
| Versiya | `2.0.0`, buzishga ruxsat | Paket yangi (v1.0.1), foydalanuvchi bazasi kichik — buzish eng arzon payt |
| Tekshirish | Bayt darajasidagi testlar + hex dump | Haqiqiy termal printer mavjud emas |
| Arxitektura | Komanda jadvalini birlashtirish + encoder moduli | Dublikatni yoʻqotadi, tasavvur qilingan kelajakka qurmaydi |

## 4. Kodlash quvuri (encoding pipeline)

1-bosqichning eng nozik qismi. Toʻrt qadam, **qatʻiy shu tartibda**:

```
matn → NFC normalize → translit → layout (padding/wrap) → encode (bayt)
```

### 4.1 NFC normalize

`text.normalize('NFC')`. Kirill `й` / `ё` dekompozitsiyalangan holda (asos harf + qoʻshiluvchi belgi) kelishi mumkin. Normalize qilinmasa jadvaldan topilmaydi va `?` boʻlib ketadi.

### 4.2 Translit

Codepage'da mavjud boʻlmagan belgilar ASCII muqobiliga aylantiriladi:

| Belgi | Unicode | Natija |
|---|---|---|
| `ʻ ʼ ‘ ’` | U+02BB, U+02BC, U+2018, U+2019 | `'` |
| `“ ”` | U+201C, U+201D | `"` |
| `– —` | U+2013, U+2014 | `-` |
| `…` | U+2026 | `...` |
| ajratilmaydigan boʻsh joy | U+00A0, U+2009, U+202F | ` ` — **shartsiz**, pastdagi izohga qarang |
| `ғ қ ҳ` | U+0493, U+049B, U+04B3 | `г к х` |
| `« »` | U+00AB, U+00BB | `"` — **faqat PC866 da**, qolgan codepage'larda oʻzgarmaydi |

Translit **maqsadli codepage'ni bilgan holda** ishlaydi va layout'dan **oldin** bajariladi. Har bir belgi uchun avval codepage jadvalida borligi tekshiriladi: mavjud boʻlsa (masalan `«` `»` PC437, PC852, CP1251 va WPC1252 da bor) belgi oʻzgartirilmaydi, aks holda translit jadvalidan muqobil olinadi.

Yaʻni funksiya imzosi `translit(text, codepage): string` boʻladi va u encode qadamidagi jadval qidiruvini takrorlaydi, lekin baytga aylantirmaydi. Takrorlanish ataylab: encode faqat layout tugagach ishlashi mumkin, translit esa layout'dan oldin satr uzunligini barqarorlashtirishi kerak. Qidiruv mantiqʻi bitta ichki funksiyada saqlanadi va ikki joydan chaqiriladi.

**Boʻshliq belgilari uchun istisno.** Yuqoridagi «faqat kodlanmaydigan belgi translit qilinadi» qoidasidan bitta ataylab chiqarilgan istisno bor: `U+00A0`, `U+2009`, `U+202F` **har doim** ASCII boʻshligʻiga aylantiriladi, garchi ular toʻqqizta codepage'ning hammasida mavjud boʻlsa ham (PC sahifalarida `0xFF`, CP1251 da `0xA0`).

Sabab: Unicode mapping `0xFF` ni NBSP deb belgilasa ham, haqiqiy termal printerlar bu baytni ishonchsiz chiqaradi — baʻzilari boʻsh joy, baʻzilari toʻldirilgan blok, baʻzilari umuman hech narsa bosadi. Bundan tashqari NBSP'ning «uzilmaydigan» maʻnosi qatʻiy kenglikdagi chek satrida hech qanday roʻl oʻynamaydi. `0x20` esa har bir printerda bir xil va aniq. Belgi soni oʻzgarmaydi, yaʻni ikki fazali quvurning invarianti buzilmaydi.

Bu istisno Task 3 implementatsiyasi paytida aniqlangan: dizaynning umumiy qoidasi bilan uning oʻz test kutilmasi bir-birini rad qilardi, va tanlov shu foydasiga hal qilindi.

### 4.3 Layout

Jadval ustunlarini toʻldirish va satr wrap qilish **translitdan keyin** bajariladi.

Sabab: `…` bitta belgidan `...` uchtaga aylanadi. Agar padding translitdan oldin hisoblansa, ustunlar siljib ketadi. Translitdan keyin har bir belgi aynan bitta baytga toʻgʻri keladi — yaʻni `.length` ishonchli boʻladi.

Bu ikki fazali tartib quvurning eng muhim invarianti va uni buzilishdan saqlash uchun alohida regressiya testi yoziladi.

### 4.4 Encode

- `0x00–0x7F` — toʻgʻridan-toʻgʻri baytga.
- Qolgani — tanlangan codepage'ning teskari jadvalidan.
- Topilmasa — `?` (`0x3F`).

### 4.5 Jadval manbasi

Codepage jadvallari **xotiradan yozilmaydi**. `unicode.org/Public/MAPPINGS/VENDORS/MICSFT/` dan olingan rasmiy mapping fayllaridan `0x80–0xFF` oraligʻi koʻchiriladi, faylda manba havolasi izoh sifatida qoldiriladi.

Sabab: xotiradan yozilgan jadvalda bitta belgi xatosi yashirinadi va testlar ham shu xotiraga qarab yozilgani uchun uni tutmaydi.

Qoʻllab-quvvatlanadigan codepage'lar: `PC437`, `PC850`, `PC852`, `PC860`, `PC863`, `PC865`, `PC866`, `CP1251`, `WPC1252`.

### 4.6 Oʻzbek tili boʻyicha ogohlantirish

`ғ қ ҳ` harflari yuqoridagi codepage'larning hech birida yoʻq — translit orqali `г к х` ga aylanadi, yaʻni maʻno biroz oʻzgaradi. `ў` esa PC866 va CP1251 da mavjud boʻlishi ehtimoli katta; implementatsiya vaqtida mapping fayli bilan tekshiriladi va jadvalda mavjud boʻlsa translit qoʻllanmaydi.

Agar `ғ қ ҳ` chekda aynan chiqishi shart boʻlsa — yagona yechim rasm sifatida chop etish, u 2-bosqich mavzusi. Bu README da ochiq yoziladi.

## 5. Raw IPC oqimi va `PrinterConfig`

### 5.1 Oqim

```
pos-printer:print
  ├─ mode === 'raw'  (default) → buildESCPOSData(contents, { paperWidth, codepage })
  │                              → printRawData(buffer, printerName)
  └─ mode === 'html'           → buildHTML(contents, paperWidth)
                                 → printHTML(window, html, config)
```

Raw yoʻlga `BrowserWindow` **kerak emas**. Hozirgi handler ishning boshida `BrowserWindow.fromWebContents()` chaqiradi va topilmasa `'No window found'` xatosi bilan toʻxtaydi — raw rejimda bu sunʻiy toʻsiq. Window izlash faqat `html` shoxiga koʻchiriladi.

### 5.2 `PrinterConfig` yangi maydonlari

| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| `mode` | `'raw' \| 'html'` | `'raw'` | Print yoʻli |
| `codepage` | `Codepage \| number` | `'PC437'` | Faqat raw rejimda; `ESC t n` orqali yuboriladi |
| `codepageTable` | `Codepage` | `'PC437'` | Faqat `codepage` raqamli boʻlganda maʻnoli — qaysi kodlash jadvali ishlatilishini koʻrsatadi |

`number` variantining sababi: `ESC t n` kodlari faqat qisman standart. `PC437=0`, `PC850=2`, `PC860=3`, `PC863=4`, `PC865=5`, `WPC1252=16`, `PC866=17`, `PC852=18` — bular Epson referenceida qatʻiy. `CP1251` esa **vendor'ga bogʻliq** (turli printerlarda 46, 73 yoki boshqa qiymat). Shuning uchun nomlangan codepage'lar bilan birga xom raqamli qiymat berish imkoni qoldiriladi:

```ts
{ codepage: 'PC866' }   // nomlangan — jadval + ESC t 17
{ codepage: 46 }        // xom ESC t 46, kodlash jadvali sifatida CP1251 ishlatiladi
```

Raqamli variant `ESC t` qiymatini beradi, lekin baytlarni qanday kodlashni aytmaydi — buni `codepageTable` maydoni koʻrsatadi (koʻrsatilmasa `PC437`). Ikki maydon ham `PrinterConfig` da ham `buildESCPOSData` opsiyalarida mavjud; nomlangan `codepage` berilganda `codepageTable` eʻtiborsiz qoldiriladi. `CP1251` uchun tanlangan default kod README da hujjatlashtiriladi va uni almashtirish yoʻli koʻrsatiladi.

`PC437` default qilingan sababi: `ESC @` (init) dan keyin printerlar oʻzi shu holatga qaytadi — default hech qanday kutilmagan oʻzgarish keltirmaydi. Kirill uchun foydalanuvchi ochiq ravishda `codepage: 'PC866'` yozadi.

### 5.3 Rejimga bogʻliq maydonlar

Hozir `PrinterConfig` da rejimlar aralash yashaydi — bu chalkashlik manbai. Hujjatda va JSDoc da ajratiladi:

- **Faqat `html`**, raw'da eʻtiborsiz qoldiriladi: `silent`, `preview`, `margin`, `pageSize`
- **Ikki rejimda ham**: `printerName`, `paperWidth`, `charsPerLine`

### 5.4 `buildESCPOSData` imzosi (buzuvchi)

```ts
// v1
buildESCPOSData(contents: PrintContent[], paperWidth?: PaperWidth): Buffer

// v2
buildESCPOSData(contents: PrintContent[], options?: {
  paperWidth?: PaperWidth
  codepage?: Codepage | number
  codepageTable?: Codepage   // faqat codepage raqamli boʻlganda
  charsPerLine?: number      // paperWidth'dan hisoblanganini bekor qiladi
}): Buffer
```

`charsPerLine` ni ochiq qoʻyish sababi: u `PrinterConfig` da mavjud, lekin `buildESCPOSData` uni umuman oʻqimaydi — 58/80 mm dan qattiq hisoblaydi. 42 belgili printerlar keng tarqalgan, shu jimgina buzuqlik ham yopiladi.

### 5.5 `PrintResult`

`mode: 'raw' | 'html'` maydoni qoʻshiladi — qaysi yoʻl bilan chop etilgani natijadan koʻrinadi.

Maydonni **IPC handler toʻldiradi**, `printRawData()` va `printHTML()` emas: ular oʻz rejimini bilmaydi va bilishi ham kerak emas. Tipda maydon majburiy emas (`mode?`), chunki `printRawData()` ni toʻgʻridan-toʻgʻri chaqirgan foydalanuvchi uni olmaydi.

### 5.6 Raw rejimda `image` kontenti

Haqiqiy rasm chop etish 2-bosqichda. Hozirgi builder `[IMAGE]` matnini chop etadi — mijozning chekida `[IMAGE]` soʻzi chiqadi, bu aniq xato.

**Qaror: jimgina oʻtkazib yuborish.** Logosiz chek chiqadi, hujjatda 2-bosqichgacha shunday deb yoziladi. `ReceiptBuilder.fromData()` ni `logo` bilan ishlatish buzilmaydi.

Muqobil (xato tashlash) rad etildi: chop etishning butunlay yiqilishi logo yoʻqolishidan qimmatga tushadi.

## 6. Komanda jadvali birlashishi va bug fixlar

### 6.1 Birlashish

`esc-pos.ts` yagona haqiqat manbasiga aylanadi, barcha qiymatlar `Buffer` (yoki `Buffer` qaytaruvchi funksiya) shakliga oʻtadi. `escpos-builder.ts` dagi lokal `CMD` obyekti olib tashlanadi, oʻrniga `esc-pos.ts` dan import qilinadi. `ESCPOSCommands` eksporti yoʻqoladi, `Commands` qoladi.

### 6.2 `CUT_PARTIAL` ziddiyati (buzuqlik)

| Manba | Qiymat | Haqiqiy maʻnosi |
|---|---|---|
| `esc-pos.ts` | `GS V 1` | qismiy kesish — toʻgʻri |
| `escpos-builder.ts` | `GS V 65 0` | qogʻoz surib **toʻliq** kesish — xato |

ESC/POS da `GS V m` uchun `m=1` qismiy, `m=65` surib toʻliq kesish, qismiy varianti `m=66`. Yaʻni hozir `cut(partial: true)` chaqirilganda printer aslida toʻliq kesadi. `GS V 1` toʻgʻri deb qabul qilinadi; Epson reference bilan implementatsiya vaqtida tasdiqlanadi.

### 6.3 `Commands.BARCODE.PRINT` formati (#3)

Hozirgi implementatsiya NUL bilan tugash shaklini (`GS k m d... NUL`) ishlatadi, lekin tip kodlari `0x41–0x49` (65–73). Spetsifikatsiyada NUL shakli faqat `m=0–6` uchun; `m=65–73` uzunlik baytini talab qiladi: `GS k m n d1…dn`.

Bir vaqtda `escpos-builder.ts` dagi ichki barcode tip jadvali olib tashlanadi — u `Commands.BARCODE.TYPE` ning uchinchi dublikati.

### 6.4 `Commands.IMAGE.RASTER` yaxlitlash (#5)

`(width / 8) & 0xff` — 8 ga boʻlinmaydigan kenglikda kasr son chiqadi va `Buffer.from` yiqiladi. `Math.ceil(width / 8)` boʻladi. Bu 2-bosqichdagi rasm featurei uchun poydevor.

### 6.5 Windows PowerShell escaping (#2)

Hozir printer nomi va fayl yoʻli PS skript matniga shablon orqali qoʻyiladi — qoʻshtirnoqli nomda buziladi, injection shaklida.

**Yechim:** skript oʻzgarmas satr boʻlib qoladi, qiymatlar `spawn` ning `env` opsiyasi orqali uzatiladi va skript ularni `$env:POS_PRINTER_NAME` / `$env:POS_PRINTER_FILE` dan oʻqiydi.

`argv` orqali uzatish ham mumkin, lekin Node'ning Windows argument-quoting mantiqida chegara holatlari bor (oxiridagi backslash, ichki qoʻshtirnoq) — aynan biz himoyalanmoqchi boʻlgan kirishlar. `env` da quoting yuzasi umuman yoʻq; qoʻshimcha foyda — skript konstantaga aylanadi va uni test bilan qoplash mumkin.

### 6.6 Oʻlik sync API (#4)

`printer-manager.ts:23` dagi sync `getPrinters()` va uning `src/index.ts` dagi eksporti olib tashlanadi. Bu API Electron 21+ da yoʻq, peer dep esa `>=28` — funksiya jimgina `[]` qaytaradi. `getPrintersAsync()` qoladi, undagi fallback shoxi ham yoʻqoladi.

### 6.7 Barcode qiymat validatsiyasi

Notoʻgʻri barcode maʻlumoti baʻzi printerlarni **osib qoʻyadi** (kesishni ham bajarmaydi, qayta yoqish kerak boʻladi) — bu jimgina buzuqlik emas, xizmatni toʻxtatuvchi holat.

- `EAN13` → 12–13 raqam; `EAN8` → 7–8; `UPC-A` → 11–12; `ITF` → juft sondagi raqam
- `CODE39` → ruxsat etilgan belgilar toʻplami
- `CODE128` → ASCII bosiladigan belgilar; `{B` prefiksi sababli qiymat ichidagi `{` → `{{`
- Mos kelmasa — aniq matnli xato tashlanadi, printerga hech narsa yuborilmaydi

### 6.8 Kichik tozalash

`printRawData` dagi `fs.writeFileSync` → `fs.promises.writeFile` (main process'ni bloklamaydi).

## 7. Testlar va tekshirish

Haqiqiy printer mavjud emas — **bayt darajasidagi test yagona tasdiqlash vositasi**.

### 7.1 `dumpESCPOS()` — hex dump

Yangi `src/utils/hex-dump.ts`, ommaviy eksport (kutubxona foydalanuvchilari uchun ham debug vositasi):

```ts
export function dumpESCPOS(data: Buffer): string
```

Chiqishi:

```
0000  1B 40              ESC @         Initialize printer
0002  1B 74 11           ESC t 17      Select codepage PC866
0005  1B 61 01           ESC a 1       Align center
0008  8F E0 A8 A2 A5 E2  "Привет"      (PC866)
000E  0A                 LF
```

Izohlash jadvali faqat builder haqiqatda chiqaradigan komandalar uchun yoziladi (~20 ta), qolgani xom hex koʻrinishida. Bu bayt farqini `1B 74 11` vs `1B 74 12` deb emas, `PC866` vs `PC852` deb koʻrish imkonini beradi.

### 7.2 Test fayllari

| Fayl | Nimani qoplaydi |
|---|---|
| `codepage.test.ts` *(yangi)* | ASCII oʻtkazish; NFC (dekompozitsiyalangan `й` = kompozitsiyalangan `й`); `Привет` → PC866 baytlari; xuddi shu satr → CP1251 boshqa baytlar; `Toʻxta gʻoz` → `To'xta g'oz`; translit jadvali; `日本` → `3F 3F`; `ESC t` kodlari; round-trip — har bir codepage jadvalidagi har bir belgi oʻz baytiga qaytadi |
| `esc-pos.test.ts` *(yangi)* | `BARCODE.PRINT` uzunlik shakli, NUL yoʻq; `RASTER` `width=10` → `xL=2`; `CUT_PARTIAL` = `1D 56 01`; `FEED_N` va `BEEP` clamping |
| `escpos-builder.test.ts` *(kengaytiriladi)* | `ESC t` aynan `ESC @` dan keyin; codepage matn va jadvalga qoʻllanadi; **jadval padding translitdan keyin hisoblanadi** (`…` holati) — ikki fazali quvurning asosiy regressiya testi; `charsPerLine` bekor qilishi; `image` hech narsa chiqarmaydi; notoʻgʻri `EAN13` xato tashlaydi; `CODE128` da `{` → `{{` |
| `raw-printer.test.ts` *(yangi)* | `child_process` mock. PS skript konstantasi printer nomini oʻz ichiga olmaydi; nom va yoʻl `env` orqali uzatiladi; `"` , `'` , `; rm -rf` boʻlgan printer nomi `env` da oʻzgarmasdan yetib boradi; Unix `argv` aynan `['-d', name, '-o', 'raw', file]` |
| `hex-dump.test.ts` *(yangi)* | Formatlash, izohlash, notanish baytlar |

### 7.3 Golden fixture

`ReceiptBuilder` bilan qurilgan toʻliq chek → hex dump'i `src/commands/__fixtures__/receipt-pc866.golden.txt` fayliga saqlanadi va git ga kiritiladi.

Golden faylni **hozirgi kod chiqishidan olib boʻlmaydi** — u buglarni ham muhrlab qoʻyar edi. U ESC/POS reference asosida qoʻlda yoziladi, yaʻni haqiqiy test boʻladi, snapshot emas. Refaktoring paytida tasodifiy bayt oʻzgarishlaridan qalqon boʻlib xizmat qiladi.

### 7.4 TDD tartibi

- **Bug fixlar:** avval hozir yiqiladigan test, keyin tuzatish.
- **Birlashish (refaktoring):** yangi xatti-harakat yoʻq, tartib teskari — birinchi golden fixture va kengaytirilgan builder testlari yoziladi va oʻtadi, keyin dublikat olib tashlanadi. Testlar oʻtishda davom etsa, refaktoring xavfsiz boʻlgani isbotlanadi.

### 7.5 Darvoza

`npm run test:run` va `npm run typecheck` ikkisi ham toza oʻtishi shart. Foiz koʻrsatkichi quvilmaydi — mezon: yuqoridagi har bir fix uchun tuzatishdan **oldin yiqilgan** va keyin oʻtgan test mavjud boʻlishi.

Mavjud `format.test.ts` va `receipt-builder.test.ts` saqlanadi; `buildESCPOSData` imzosi oʻzgarganda buziladigan testlar yangilanadi.

## 8. Hujjatlar va migratsiya

### 8.1 `CHANGELOG.md` (yangi)

Keep a Changelog formatida, `2.0.0` yozuvi `BREAKING` / `Added` / `Changed` / `Fixed` / `Removed` boʻlimlari bilan.

### 8.2 `README.md`

1. Paket nomi tuzatiladi (#7): `npm install @madrimov/electron-pos-printer`.
2. Quick Start qayta yoziladi — hozirgi misol qoʻlda `ipcMain.handle('print', ...)` yozishni koʻrsatadi, chunki v1 da boshqa yoʻl yoʻq edi. v2 da paketning oʻz API'si koʻrsatiladi: `setupPrinterIPC()` + `exposePosPrinterAPI()` + `createPosPrinter()`.
3. Yangi **«Codepage va til»** boʻlimi — qoʻllab-quvvatlanadigan codepage jadvali, `codepage: 'PC866'` misoli, translit xatti-harakati, `ғ қ ҳ` ogohlantirishi.
4. Yangi **«Rejimlar»** va **«Debug»** boʻlimlari — `raw` vs `html`, qaysi `PrinterConfig` maydoni qaysi rejimda ishlaydi, `dumpESCPOS()` bilan chiqishni tekshirish.

### 8.3 v1 → v2 migratsiya (README ichida boʻlim)

| v1 | v2 |
|---|---|
| `buildESCPOSData(contents, 80)` | `buildESCPOSData(contents, { paperWidth: 80 })` |
| `ESCPOSCommands` | `Commands` |
| `Commands.*` → `number[]` | `Commands.*` → `Buffer` |
| `getPrinters(webContents)` | `getPrintersAsync(webContents)` |
| IPC default: HTML print | IPC default: raw. Eski xatti-harakat uchun `mode: 'html'` |
| `cut(true)` aslida toʻliq kesardi | `cut(true)` haqiqatan qismiy kesadi |

Bitta major versiya uchun alohida `MIGRATION.md` ortiqcha — README boʻlimi yetarli.

### 8.4 `CLAUDE.md`

Arxitektura boʻlimi raw-asosiy oqimni, `src/commands/codepage.ts` modulini va rejimga bogʻliq maydonlar ajratilishini tasvirlaydi. Hozirgi holatda u `setupPrinterIPC()` HTML orqali ishlashini yozmagan — allaqachon haqiqatdan chetda.

### 8.5 `package.json`

`version: "2.0.0"`.

### 8.6 `example/` ilovasi

Paketning yagona uchdan-uchga artefakti; hozir u ham qoʻlda yozilgan IPC ni ishlatadi.

- `setupPrinterIPC()` orqali ishlaydi — misol paketning haqiqiy API'sini sinaydi
- Codepage tanlash roʻyxati (`PC437` / `PC866` / `CP1251` / …), kirill va oʻzbek matnli namuna chek
- **«Dump to file» tugmasi** — chekni printerga emas, `dumpESCPOS()` orqali faylga yozadi

Oxirgi punkt printer yoʻqligi sharoitida muhim: misolni ishga tushirib, oʻzbek va kirill matnining haqiqiy baytlarga qanday aylanishini koʻrish mumkin — testlardan keyingi ikkinchi tasdiqlash qatlami.

## 9. Tegiladigan fayllar

### Yangi

- `src/commands/codepage.ts` — codepage jadvallari, translit, `encodeText`, `selectCodepage`
- `src/commands/codepage.test.ts`
- `src/commands/esc-pos.test.ts`
- `src/commands/__fixtures__/receipt-pc866.golden.txt`
- `src/utils/hex-dump.ts`
- `src/utils/hex-dump.test.ts`
- `src/printer/raw-printer.test.ts`
- `CHANGELOG.md`

### Oʻzgartiriladi

- `src/commands/esc-pos.ts` — yagona manba, `Buffer` shakli, `BARCODE.PRINT`, `IMAGE.RASTER`, `CUT_PARTIAL`
- `src/commands/escpos-builder.ts` — lokal `CMD` olib tashlanadi, codepage quvuri, imzo, `image` xatti-harakati, barcode validatsiyasi
- `src/commands/escpos-builder.test.ts` — kengaytiriladi
- `src/commands/index.ts` — eksportlar
- `src/types/index.ts` — `mode`, `codepage`, `codepageTable`, `Codepage`, `PrintResult.mode`
- `src/electron/main.ts` — IPC handler raw/html shoxlari, window izlash koʻchiriladi
- `src/printer/raw-printer.ts` — PS skript konstantasi + `env`, async yozish
- `src/printer/printer-manager.ts` — sync `getPrinters()` olib tashlanadi
- `src/printer/index.ts`, `src/index.ts` — eksportlar
- `src/utils/index.ts` — `hex-dump` eksporti
- `README.md`, `CLAUDE.md`, `package.json`
- `example/main.js`, `example/preload.js`, `example/index.html`

## 10. Xavflar va yumshatish

| Xavf | Yumshatish |
|---|---|
| Codepage jadvalida bitta belgi xatosi | Jadvallar rasmiy Unicode mapping fayllaridan koʻchiriladi; round-trip testi har bir belgini qoplaydi |
| Printer boʻlmaganda haqiqiy xatti-harakat tasdiqlanmaydi | Golden fixture reference asosida qoʻlda yoziladi; `dumpESCPOS()` bilan qoʻlda koʻzdan kechirish; `example/` da «Dump to file» |
| `CUT_PARTIAL` va `BARCODE.PRINT` boʻyicha spec talqini xato boʻlishi | Implementatsiya vaqtida Epson ESC/POS reference bilan har bir komanda solishtiriladi |
| v2 buzuvchi oʻzgarishlari foydalanuvchini kutilmaganda urishi | CHANGELOG + README migratsiya jadvali; `mode: 'html'` bilan eski xatti-harakat saqlanadi |
| `ғ қ ҳ` translit maʻnoni oʻzgartirishi | README da ochiq ogohlantirish; toʻliq yechim 2-bosqichdagi rasm chop etish |

## 11. Bajarilganlik mezoni

1. `setupPrinterIPC()` default holatda raw ESC/POS chiqaradi; `mode: 'html'` eski yoʻlni beradi.
2. `codepage: 'PC866'` bilan kirill matni toʻgʻri baytlarga aylanadi; `oʻ`/`gʻ` → `o'`/`g'`.
3. 6-boʻlimdagi har bir bug fix uchun tuzatishdan **oldin yiqilgan** va endi oʻtadigan test mavjud.
4. `esc-pos.ts` yagona komanda manbasi; `escpos-builder.ts` da dublikat jadval qolmagan.
5. `npm run test:run` va `npm run typecheck` toza oʻtadi.
6. Golden fixture git da; `dumpESCPOS()` eksport qilingan.
7. README/CHANGELOG/CLAUDE.md haqiqatga mos; migratsiya jadvali mavjud.
8. `example/` ilovasi paket API'si orqali ishlaydi va «Dump to file» tugmasi bor.
