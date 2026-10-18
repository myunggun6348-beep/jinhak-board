/* 진학 현황판 회귀 테스트
 *
 *   npm test
 *
 * index.html 을 브라우저에 띄워 실제 파일을 넣어 보고, 읽은 결과가
 * 기대와 같은지 확인한다. 가장 중요한 건 '상태 낱말' 표다. 여기서
 * '불합격'이 '합격'으로 뒤집히는 버그를 한 번 잡았다. */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FIX = (f) => path.join(__dirname, "fixtures", f);

let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label + "\n      나온 값: " + JSON.stringify(got) + "\n      기대한 값: " + JSON.stringify(want)); }
}

/* 게시된 페이지는 cdnjs 에서 라이브러리를 받지만, 테스트는 네트워크 없이
   돌아야 하므로 로컬 사본으로 갈아 끼운다. */
function buildTestPage() {
  const nm = path.join(ROOT, "node_modules");
  const jszip = path.join(nm, "jszip/dist/jszip.min.js");
  const xlsx = path.join(nm, "xlsx/dist/xlsx.full.min.js");
  if (!fs.existsSync(jszip) || !fs.existsSync(xlsx)) {
    console.error("먼저 npm install 을 실행해 주세요."); process.exit(1);
  }
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<script src="https:\/\/cdnjs[^"]*jszip[^"]*"><\/script>/, '<script src="node_modules/jszip/dist/jszip.min.js"></script>')
    .replace(/<script src="https:\/\/cdnjs[^"]*xlsx[^"]*"><\/script>/, '<script src="node_modules/xlsx/dist/xlsx.full.min.js"></script>');
  html = '<!doctype html><html><head><meta charset="utf-8">'
       + '<meta name="viewport" content="width=device-width,initial-scale=1">'
       + '<style>html{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
       + html + '</body></html>';
  const out = path.join(ROOT, ".test.html");
  fs.writeFileSync(out, html);
  return out;
}

(async () => {
  const page404 = buildTestPage();
  // Playwright 전용 브라우저를 못 받는 PC(학교망)도 있어, 설치된 크롬·엣지로도 띄운다.
  const tries = process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : [{}, { channel: "chrome" }, { channel: "msedge" }];
  let browser = null;
  for (const opt of tries) {
    try { browser = await chromium.launch(opt); break; } catch (e) { if (opt === tries[tries.length - 1]) throw e; }
  }
  const p = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto("file://" + page404);
  await p.waitForTimeout(600);

  /* ── 1. 상태 낱말 ──────────────────────────────
     순서가 틀리면 '불합격'이 '합격'을 품어 합격으로 뒤집힌다. */
  console.log("\n[상태 낱말 읽기]");
  const statusCases = [
    ["합격", "최초합"], ["최초합격", "최초합"], ["합", "최초합"],
    ["불합격", "불합격"], ["불합", "불합격"], ["탈락", "불합격"], ["미합격", "불합격"],
    ["1단계 합격", "1단계합"], ["서류합격", "1단계합"],
    ["1단계 불합격", "1단계불"], ["서류 탈락", "1단계불"],
    ["추합", "충원합"], ["추가합격", "충원합"], ["충원합격", "충원합"], ["예비합격", "충원합"],
    ["예비 7번", "충원대기"], ["예비", "충원대기"], ["충원대기", "충원대기"],
    ["등록", "등록완료"], ["등록완료", "등록완료"], ["등록포기", "등록포기"],
    ["면접완료", "면접완료"], ["지원", "지원완료"], ["접수", "지원완료"],
    ["붙음?", null], ["", null],
  ];
  const statusGot = await p.evaluate((cs) => cs.map((c) => window.__dev.mapStatus(c[0])), statusCases);
  statusCases.forEach((c, i) => check('"' + c[0] + '"', statusGot[i], c[1]));

  /* ── 2. 수능최저 충족 여부 ─────────────────── */
  console.log("\n[수능최저 낱말 읽기]");
  const minCases = [
    ["충족", "충족"], ["만족", "충족"], ["O", "충족"], ["Y", "충족"],
    ["미충족", "미충족"], ["불충족", "미충족"], ["미달", "미충족"], ["X", "미충족"],
    ["해당없음", "해당없음"], ["없음", "해당없음"],
    ["아직 모름", "미정"], ["미정", "미정"],
  ];
  const minGot = await p.evaluate((cs) => cs.map((c) => window.__dev.mapMin(c[0])), minCases);
  minCases.forEach((c, i) => check('"' + c[0] + '"', minGot[i], c[1]));

  /* ── 3. 날짜 ───────────────────────────────── */
  console.log("\n[날짜 읽기]");
  const dateCases = [
    ["2026-11-28", false, "2026-11-28"],
    ["2026.11.28", false, "2026-11-28"],
    ["20261128", false, "2026-11-28"],
    ["11/28", false, "2026-11-28"],      // 9월 이후 → 학년도 앞 해
    ["1/15", false, "2027-01-15"],       // 1월 → 학년도 해
    ["2026-12-26 18:00", true, "2026-12-26T18:00"],
    ["2026-12-26", true, "2026-12-26T00:00"], // 시각을 지어내지 않는다
    ["", false, ""],
  ];
  const dateGot = await p.evaluate((cs) => cs.map((c) => window.__dev.parseDate(c[0], c[1])), dateCases);
  dateCases.forEach((c, i) => check('"' + c[0] + '"' + (c[1] ? " (시각 포함)" : ""), dateGot[i], c[2]));

  /* ── 4. 파일에서 명단 읽기 ─────────────────── */
  console.log("\n[파일에서 명단 읽기]");
  /* 파일을 넣으면 미리 보기가 뜨고 [넣기]를 눌러야 들어간다. 읽은 결과는 __dev.last() 로, 안내는 #importMsg 로 본다. */
  let previewSeen = 0, previewLeak = 0;
  async function importFile(file) {
    await p.locator("#stFile").click();
    await p.locator("#file").setInputFiles(file);
    await p.waitForTimeout(900);
    const pv = await p.locator("#importMsg .doimport").count();
    const before = await p.evaluate(() => window.__dev.students().length);
    if (pv) { previewSeen++; if (await p.evaluate(() => window.__dev.students().length) !== before) previewLeak++; await p.click("#importMsg .doimport"); await p.waitForTimeout(400); }
    const msg = (await p.locator("#importMsg").textContent()).trim();
    const last = await p.evaluate(() => window.__dev.last());
    return { ok: /^넣었습니다/.test(msg), msg: msg, last: last };
  }
  let r = await importFile(FIX("roster_euckr.csv"));
  const rosterRows = (x) => (x.last && x.last.kind === "roster" ? x.last.res.list.map((o) => [o.no, o.name]) : []);
  check("CSV(EUC-KR) 한글 안 깨짐", r.ok && rosterRows(r).length, 4);
  check("CSV 첫 줄", rosterRows(r)[0], ["30201", "김민수"]);

  r = await importFile(FIX("roster.xlsx"));
  check("엑셀 학년/반/번호 → 학번 생성", r.ok && rosterRows(r)[0][0], "30201");
  check("엑셀 두 자리 번호", r.ok && rosterRows(r)[3][0], "30212");

  r = await importFile(FIX("roster.hwpx"));
  check("한글(.hwpx) 표에서 읽기", r.ok && rosterRows(r).length, 3);

  fs.writeFileSync(path.join(ROOT, ".fake.hwp"), "\xd0\xcf\x11\xe0");
  r = await importFile(path.join(ROOT, ".fake.hwp"));
  check("구형 .hwp 는 거절하고 안내", r.ok, false);
  check("안내에 hwpx 저장법 포함", /hwpx/.test(r.msg || ""), true);
  fs.unlinkSync(path.join(ROOT, ".fake.hwp"));

  /* ── 5. 지원 현황 읽기 ─────────────────────── */
  console.log("\n[지원 현황 읽기]");
  r = await importFile(FIX("apps_messy.csv"));
  const apps = r.last && r.last.kind === "apps" ? r.last.res.apps : [];
  check("열 이름이 달라도 지원 현황으로 알아보고 바로 넣음", r.ok && apps.length, 5);
  check("변경 기록: 파일 넣기로 묶어 남김", await p.evaluate(() => window.__dev.logs().some((e) => e.src === "파일 넣기")), true);
  check("‘추합’ → 충원합", apps[2] && apps[2].app.status, "충원합");
  check("‘탈락’ → 불합격", apps[3] && apps[3].app.status, "불합격");
  check("못 알아본 상태는 원문을 안내에 같이 보여줌", /붙음?/.test(r.msg), true);

  check("파일을 넣으면 먼저 미리 보기, [넣기]를 눌러야 들어감", [previewSeen >= 4, previewLeak], [true, 0]);
  /* 학교마다 다른 표 모양. 파일 대신 읽은 줄을 바로 넣어 본다. */
  console.log("\n[여러 가지 표 모양]");
  const shapes = await p.evaluate(() => {
    const R = (rows) => window.__dev.readApps(rows).apps.map((a) => [a.no, a.name, a.app.univ, a.app.major].join("|"));
    return {
      merged: R([["이름", "대학", "학과"], ["김기현", "부산대학교", "국어국문학과"], ["", "건국대학교", "철학과"], ["최윤후", "동명대학교", "경영학부"]]),
      wide: R([["학번", "이름", "대학1", "학과1", "대학2", "학과2"], ["30201", "김기현", "부산대학교", "국어국문학과", "건국대학교", "철학과"]]),
      slot: R([["학번", "성명", "수시1", "수시2"], ["30201", "김기현", "부산대학교 국어국문학과 논술", "건국대학교/철학과/논술"]]),
      noHeader: R([["수시 지원 현황"], ["30201", "김기현", "부산대학교(부산)", "국어국문학과", "논술"], ["", "", "건국대학교(서울)", "철학과", "논술"]]),
      loose: R([["3학년 2반"], [], ["번호", "성 명", "지원대학명", "모집단위명(학과)"], ["1", "김기현", "부산대학교", "국어국문학과"]]),
      repeatedHead: R([["이름", "대학"], ["김기현", "부산대학교"], ["이름", "대학"], ["최윤후", "동명대학교"]]),
      roster: R([["학번", "이름"], ["30201", "김기현"]]),
    };
  });
  check("병합된 이름칸은 위 학생으로", shapes.merged, ["|김기현|부산대학교|국어국문학과", "|김기현|건국대학교|철학과", "|최윤후|동명대학교|경영학부"]);
  check("대학1·대학2 옆으로 늘어선 표", shapes.wide, ["30201|김기현|부산대학교|국어국문학과", "30201|김기현|건국대학교|철학과"]);
  check("수시1·수시2 한 칸에 몰아 쓴 표", shapes.slot, ["30201|김기현|부산대학교|국어국문학과", "30201|김기현|건국대학교|철학과"]);
  check("머리줄 없는 표(PDF)", shapes.noHeader, ["30201|김기현|부산대학교(부산)|국어국문학과", "30201|김기현|건국대학교(서울)|철학과"]);
  check("제목줄과 느슨한 열 이름", shapes.loose, ["|김기현|부산대학교|국어국문학과"]);
  check("쪽마다 반복된 머리줄은 건너뜀", shapes.repeatedHead, ["|김기현|부산대학교", "|최윤후|동명대학교"].map((x) => x + "|"));
  check("명단 파일은 지원으로 읽지 않음", shapes.roster, []);

  /* 2027학년도 기준: 연도 없는 9~12월 날짜는 2026년, 학년도 일정 밖 날짜(지난해 파일)는 알려준다. */
  const yr = await p.evaluate(() => {
    const r = window.__dev.readApps([["이름", "대학", "면접일"], ["김기현", "부산대학교", "2025-11-28"], ["최윤후", "동명대학교", "11/20"]]);
    return { old: r.notes.oldDate, inferred: r.apps[1].app.itv };
  });
  check("연도 없는 11/20 → 2026-11-20", yr.inferred, "2026-11-20");
  check("지난해 날짜는 안내", yr.old, 1);

  /* 면접일이 비고 논술·실기·적성 일자만 있으면 그 날을 면접·고사일로(진학 프로그램 PDF). */
  const exam = await p.evaluate(() => window.__dev.readApps([
    ["이름", "대학명", "면접일자", "논술일자", "최종발표일"],
    ["김기현", "부산대학교(부산)", "", "2026-11-28 ~ 2026-11-28", "2026-12-18 ~ 2026-12-18"],
  ]).apps[0].app.itv);
  check("논술일자 → 면접·고사일", exam, "2026-11-28");

  /* 진학 프로그램 PDF: 긴 칸이 여러 줄로 접히고, 번호 열은 가운데 맞춤이다(2027지원현황.pdf 모양). */
  console.log("\n[PDF 표 복원]");
  const pdf = await p.evaluate(() => {
    const it = (x, y, w, s) => ({ x, y, w, s });
    const items = [
      it(33, 532, 8, "No"), it(46, 532, 16, "학년"), it(70, 532, 8, "반"), it(89, 536, 8, "번"), it(89, 528, 8, "호"),
      it(109, 532, 16, "이름"), it(224, 532, 24, "대학명"), it(277, 532, 32, "모집단위"),
      it(406, 538, 14, "수능"), it(406, 531, 14, "최저"), it(406, 524, 14, "유무"), it(515, 532, 32, "세부유형"),
      it(35, 506, 4, "9"), it(52, 506, 4, "3"), it(72, 506, 4, "2"), it(91, 506, 4, "1"), it(105, 506, 24, "강준석"),
      it(212, 510, 48, "국립부경대학"), it(220, 502, 32, "교(부산)"), it(267, 514, 52, "스마트헬스케"), it(267, 506, 52, "어학부(바이오"), it(283, 498, 20, "전공)"),
      it(411, 506, 4, "Y"), it(509, 510, 44, "학생부교과("), it(521, 502, 20, "일반)"),
      it(33, 471, 8, "10"), it(52, 471, 4, "3"), it(72, 471, 4, "2"), it(89, 471, 8, "12"), it(105, 471, 24, "최윤후"),
      it(214, 471, 44, "동명대학교"), it(269, 471, 40, "경영학부"), it(411, 471, 4, "N"), it(509, 471, 44, "학생부교과"),
    ];
    const rows = window.__dev.pdfTableRows(items);
    const apps = window.__dev.readApps(rows).apps.map((a) => [a.cls, a.no, a.name, a.app.univ, a.app.major, a.app.jh, a.app.mreq].join("|"));
    return { head: rows && rows[0], apps };
  });
  check("머리줄 접힌 글자 잇기", pdf.head, ["No", "학년", "반", "번호", "이름", "대학명", "모집단위", "수능최저유무", "세부유형"]);
  check("접힌 칸 잇기·학년반번호로 학번·최저 유무", pdf.apps, [
    "2|30201|강준석|국립부경대학교(부산)|스마트헬스케어학부(바이오전공)|학생부교과(일반)|최저 있음(기준 미기재)",
    "2|30212|최윤후|동명대학교|경영학부|학생부교과|없음",
  ]);

  /* ── 6. 점검 규칙 ──────────────────────────── */
  console.log("\n[점검 규칙]");
  const rules = await p.evaluate(() => {
    const c = window.__dev.checkStudent;
    const mk = (apps) => ({ id: "t", cls: 2, no: "30299", name: "테스트", apps: apps });
    const six = []; for (let i = 0; i < 7; i++) six.push({ kind: "수시", c6: true, univ: "대" + i, status: "지원완료" });
    const soon = new Date(); soon.setDate(soon.getDate() + 2);
    const iso = soon.getFullYear() + "-" + String(soon.getMonth() + 1).padStart(2, "0") + "-" + String(soon.getDate()).padStart(2, "0") + "T18:00";
    return {
      six: c(mk(six)).map((w) => w.code),
      itv: c(mk([{ kind: "수시", univ: "A", status: "1단계합", itv: "2026-11-28", prep: { read: true, q: true, mock: true, go: true } }, { kind: "수시", univ: "B", status: "1단계합", itv: "2026-11-28", prep: { read: true, q: true, mock: true, go: true } }])).map((w) => w.code),
      itvSameUniv: c(mk([{ kind: "수시", univ: "A", jh: "교과", status: "지원완료", itv: "2026-10-17", prep: { read: true, q: true, mock: true, go: true } }, { kind: "수시", univ: "A", jh: "종합", status: "지원완료", itv: "2026-10-17", prep: { read: true, q: true, mock: true, go: true } }])).map((w) => w.code),
      jungsi: c(mk([{ kind: "수시", univ: "A", status: "최초합" }, { kind: "정시", univ: "B", group: "가", status: "지원완료" }])).map((w) => w.code),
      jungsiGaveUp: c(mk([{ kind: "수시", univ: "A", status: "등록포기" }, { kind: "정시", univ: "B", group: "가", status: "지원완료" }])).map((w) => w.code),
      jungsiPass: c(mk([{ kind: "정시", univ: "A", group: "가", status: "최초합" }, { kind: "정시", univ: "B", group: "나", status: "지원완료" }])).map((w) => w.code),
      gunDup: c(mk([{ kind: "정시", univ: "A", group: "가" }, { kind: "정시", univ: "B", group: "가" }])).map((w) => w.code),
      gunJc: c(mk([{ kind: "정시", univ: "A", group: "가" }, { kind: "정시", univ: "B", jc: true }, { kind: "정시", univ: "C", jc: true }])).map((w) => w.code),
      gunNone: c(mk([{ kind: "정시", univ: "A" }])).map((w) => w.code),
      annPast: c(mk([{ kind: "수시", univ: "A", status: "면접완료", ann: "2020-01-01" }])).map((w) => w.code),
      ann1Past: c(mk([{ kind: "수시", univ: "A", status: "지원완료", ann1: "2020-01-01", ann: "2099-12-01" }])).map((w) => w.code),
      ann1Done: c(mk([{ kind: "수시", univ: "A", status: "1단계합", ann1: "2020-01-01", ann: "2099-12-01" }])).map((w) => w.code),
      annDone: c(mk([{ kind: "수시", univ: "A", status: "불합격", ann: "2020-01-01" }])).map((w) => w.code),
      dual: c(mk([{ kind: "수시", univ: "A", status: "등록완료" }, { kind: "수시", univ: "B", status: "등록완료" }])).map((w) => w.code),
      due: c(mk([{ kind: "수시", univ: "A", status: "충원대기", due: iso }])).map((w) => w.code),
      minreq: c(mk([{ kind: "수시", univ: "A", status: "지원완료", mmet: "미충족" }])).map((w) => w.code),
      clean: c(mk([{ kind: "수시", univ: "A", status: "지원완료", c6: true, mmet: "충족" }])).map((w) => w.code),
    };
  });
  check("① 6장 초과", rules.six, ["6장초과"]);
  check("② 면접일 중복", rules.itv, ["면접중복"]);
  check("② 같은 대학 두 전형이 같은 날이면 겹침 아님", rules.itvSameUniv, []);
  check("③ 수시 합격자의 정시 지원", rules.jungsi, ["정시지원불가"]);
  check("③ 등록을 포기해도 정시 지원 불가", rules.jungsiGaveUp, ["정시지원불가"]);
  check("정시 합격은 수시 합격으로 치지 않음", rules.jungsiPass, []);
  check("⑧ 정시 같은 군 두 곳", rules.gunDup, ["군중복"]);
  check("전문대 정시는 군 제한 없음", rules.gunJc, []);
  check("4년제 정시에 군이 없으면 알림", rules.gunNone, ["군 미입력"]);
  check("④ 이중등록", rules.dual, ["이중등록"]);
  check("⑤ 충원 마감 임박", rules.due, ["충원마감"]);
  check("⑥ 수능최저 미충족", rules.minreq, ["최저 미충족"]);
  check("⑦ 발표일 지났는데 결과 미입력", rules.annPast, ["결과 미입력"]);
  check("⑦ 결과가 들어갔으면 경고 없음", rules.annDone, []);
  check("⑦ 1단계 발표일 지났는데 지원완료면 결과 미입력", rules.ann1Past, ["결과 미입력"]);
  check("⑦ 1단계 결과가 들어갔으면 경고 없음", rules.ann1Done, []);
  check("문제 없는 학생은 경고 없음", rules.clean, []);

  console.log("\n[수능최저 자동 판정]");
  // 국3 수2 영1 탐3·4 한4. 기대값이 null이면 판정하지 않아야 한다(틀린 판정보다 판정 없음이 낫다).
  const g = { kor: "3", math: "2", eng: "1", inq1: "3", inq2: "4", his: "4" };
  const minCasesJ = [
    ["국수영탐 중 2개합 5", g, "충족"],
    ["2개합 2", g, "미충족"],
    ["3합7", g, "충족"],
    ["국,수,영,탐 중 3개 합 7, 한국사 4등급 이내", g, "충족"],
    ["2개합 5, 한국사 3", g, "미충족"],
    ["수학 포함 2개합 3", g, "충족"],
    ["국어 포함 2개합 3", g, "미충족"],
    ["국수탐(1) 2개합 4", g, "미충족"],
    ["3개 영역 각 3등급", g, "충족"],
    ["국수영탐 각 3", g, null],
    ["탐구 2과목 평균 3, 2개합 5", g, null],
    ["없음", g, "해당없음"],
    ["", g, null],
    ["수학(미적/기하) 포함 2개합 5", g, null],
    ["2개합 5 또는 영어 1", g, null],
    ["상위 2개 평균 2.5", g, null],
    ["2개합 5", { kor: "3" }, null],
    // 실제 2027 요강 문장
    ["국어, 수학, 영어, 탐구(1과목) 중 수학 포함 2개 영역 등급 합 6 이내, 한국사 응시 (IT대학 교과 기준 5에서 1등급 하향 적용)", g, "충족"],
    ["국어, 수학, 영어, 사회/과학탐구 중 2개 영역 등급 합 5 이내, 한국사 4등급 이내 (탐구는 2과목 응시, 상위 1과목 반영)", { ...g, his: "5" }, "미충족"],
    ["국어, 수학, 영어, 탐구(사/과) 중 3개 영역 등급 합 6 이내, 한국사 4등급 이내 (탐구 상위 1과목, 영어 1·2등급은 1등급으로 간주)", { ...g, eng: "2" }, "충족"],
    ["수학, 영어, 탐구(사회·과학) 3개 영역 중 1개 영역 이상이 5등급 이내 (탐구영역은 2개 과목의 등급 평균 적용, 소수점 이하 절사)", { kor: "1", math: "7", eng: "6", inq1: "5", inq2: "6", his: "4" }, "충족"],
    ["국어, 수학, 영어, 사회/과학탐구(2과목) 중 2개 영역 등급의 합이 5 이내이고, 한국사 5등급 이내 ※ 탐구영역은 2과목 평균등급을 반영하되, 소수점 자리 버림 없이 그대로 반영", { kor: "4", math: "4", eng: "4", inq1: "1", inq2: "2", his: "4" }, "미충족"],
    ["[인문] 국어, 수학, 탐구 중 2개 과목 등급 합 4 이내(국어, 수학 중 1개 과목 포함), 영어 3등급 이내, 한국사 4등급 이내 (탐구: 사회/과학탐구)", { kor: "4", math: "5", eng: "1", inq1: "1", inq2: "1", his: "4" }, "미충족"],
    ["* 수능최저기준: 국어, 영어, 탐구영역 중 상위 1개 등급과 수학 영역 등급 합이 6이내", { kor: "1", math: "6", eng: "1", inq1: "1", inq2: "1", his: "4" }, "미충족"],
    ["수학포함 2개 영역 합 9등급 이내(탐구과목은 1개 과목 적용). 다만, 수학영역 \"확률과통계\" 선택 시 1등급 하향 적용", g, "충족"],   // 확통으로 낮춰도 충족
    // 수학 선택과목·탐구 과목(사/과)
    ["수학포함 2개 영역 합 9등급 이내(탐구과목은 1개 과목 적용). 다만, 수학영역 \"확률과통계\" 선택 시 1등급 하향 적용", { kor: "4", math: "5", eng: "6", inq1: "6", inq2: "6", his: "4" }, null],
    ["수학포함 2개 영역 합 9등급 이내(탐구과목은 1개 과목 적용). 다만, 수학영역 \"확률과통계\" 선택 시 1등급 하향 적용", { kor: "4", math: "5", eng: "6", inq1: "6", inq2: "6", his: "4", mathSel: "확통" }, "미충족"],
    ["수학포함 2개 영역 합 9등급 이내(탐구과목은 1개 과목 적용). 다만, 수학영역 \"확률과통계\" 선택 시 1등급 하향 적용", { kor: "4", math: "5", eng: "6", inq1: "6", inq2: "6", his: "4", mathSel: "미적" }, "충족"],
    ["국어, 수학, 영어, 사회/과학탐구 중 수학 포함 2개 영역 등급 합 5 이내, 한국사 4등급 이내 ※ 탐구 2과목 중 과학탐구(1과목 이상) 필수 응시", { ...g, inq1t: "사", inq2t: "사" }, "미충족"],
    ["국어, 수학, 영어, 사회/과학탐구 중 수학 포함 2개 영역 등급 합 5 이내, 한국사 4등급 이내 ※ 탐구 2과목 중 과학탐구(1과목 이상) 필수 응시", { ...g, inq1t: "과", inq2t: "사" }, "충족"],
    ["국어, 수학, 영어, 탐구(2개 과목 평균) 4개 영역 중 3개 등급합 6등급 이내 ※ 과탐 1과목 이상 응시자는 탐구 2과목 평균과 과탐 상위 1과목 중 우수한 등급 반영", { kor: "5", math: "3", eng: "2", inq1: "1", inq2: "6", his: "4", inq1t: "과", inq2t: "사" }, "충족"],
  ];
  // "국수영과탐"처럼 탐구 자리에 과탐·사탐만 적은 기준: 그 과목이 아니면 탐구를 못 쓴다
  const gs = { kor: "3", math: "3", eng: "4", inq1: "1", inq2: "1", his: "3" };
  minCasesJ.push(
    ["국수영과탐 중 수학 포함 3개합 9, 한국사 4", { ...gs, inq1t: "과", inq2t: "과" }, "충족"],
    ["국수영과탐(1과목) 중 수학 포함 3개합 9, 한국사 4", { ...gs, inq1t: "과", inq2t: "사" }, "충족"],
    ["국수영과탐 중 수학 포함 3개합 9, 한국사 4", { ...gs, inq1t: "과", inq2t: "사" }, null],   // 2과목 평균이면 갈림
    ["국수영과탐 중 수학 포함 3개합 9, 한국사 4", { ...gs, inq1t: "사", inq2t: "사" }, "미충족"],
    ["국수영과탐 중 수학 포함 3개합 9, 한국사 4", gs, null],
    ["국어, 수학, 영어, 과학탐구 중 2개 영역 등급 합 6 이내", { ...g, inq1t: "과", inq2t: "과" }, "충족"],
    ["국수영사탐 중 3개합 5", { ...g, inq1t: "사", inq2t: "과" }, "미충족"],
    ["국수영사탐 중 3개합 6", { ...g, inq1t: "사", inq2t: "과" }, "충족"],
    ["국수영과탐 중 2개합 3", { ...g, mathSel: "미적" }, "충족"],
  );
  const judged = await p.evaluate((cs) => cs.map((c) => window.__dev.judgeMin(c[0], c[1]).res), minCasesJ);
  minCasesJ.forEach((c, i) => check("‘" + c[0] + "’", judged[i], c[2]));

  console.log("\n[전체 현황 · 일정 · 정시]");
  const misc = await p.evaluate(() => {
    const d = window.__dev;
    const day = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
    const st = { id: "t", cls: 2, no: "30299", name: "테스트", apps: [
      { id: "a", kind: "수시", univ: "A", itv: day(3), ann: day(20), status: "지원완료" },
      { id: "b", kind: "수시", univ: "B", ann: day(-2), status: "1단계합" },
      { id: "c", kind: "수시", univ: "C", itv: day(5), status: "불합격" },
      { id: "e", kind: "수시", univ: "E", due: day(-1) + "T18:00", status: "충원대기" },
      { id: "f", kind: "수시", univ: "F", ann1: day(4), itv: day(9), ann: day(30), status: "지원완료" },
      { id: "g", kind: "수시", univ: "G", ann1: day(-1), status: "지원완료" },
      { id: "h", kind: "수시", univ: "H", ann1: day(2), status: "1단계합" },
    ] };
    const enc = new TextEncoder();
    const folded = d.icsFold("SUMMARY:" + "가".repeat(80)).split("\r\n");
    const j = d.jungsiOf({ apps: [{ kind: "정시", group: "가" }, { kind: "정시", jc: true }, { kind: "수시", status: "최초합" }] });
    return {
      univSame: d.univKey("부경대") === d.univKey("국립부경대학교(부산)") && d.univKey("부산외대") === d.univKey("부산외국어대학교(부산)"),
      campusApart: d.univKey("경희대학교(서울)") !== d.univKey("경희대학교(국제)"),
      majorSame: d.majorKey("컴퓨터공학과") === d.majorKey("컴퓨터공학부") && d.majorKey("스마트헬스케어학부(바이오메디컬공학전공)") === d.majorKey("스마트헬스케어학부"),
      upcoming: d.upcoming([st], 14).map((e) => e.a.id + e.kind),
      pending: d.pending([st]).map((e) => e.a.id + e.kind),
      foldMax: Math.max(...folded.map((l) => enc.encode(l).length)),
      foldCont: folded.slice(1).every((l) => l[0] === " "),
      notice: d.noticeText(st, 14, 2),
      ann1Read: (() => { const a = d.readApps([["이름", "대학", "1단계 발표일", "최종발표일"], ["김기현", "부산대학교", "11/20", "12/12"]]).apps[0].app; return [a.ann1, a.ann]; })(),
      jungsi: [j.pass.length, j.gun["가"].length, j.jc.length].join(","),
    };
  });
  check("대학 표기 묶기(국립·줄임말)", misc.univSame, true);
  check("캠퍼스가 다르면 따로", misc.campusApart, true);
  check("학과 끝말·괄호 무시하고 묶기", misc.majorSame, true);
  check("다가오는 일정: 불합격 면접은 빼고, 1단계 발표는 결과 전만", misc.upcoming, ["aitv", "fann1", "fitv"]);
  check("결과 입력할 것: 지난 발표·1단계 발표·충원 마감", misc.pending, ["bann", "gann1", "edue"]);
  check("일정 안내 문자에 1단계 발표", /1단계 합격자 발표 — F/.test(misc.notice), true);
  check("파일 읽기: 1단계 발표일·최종 발표일 따로", misc.ann1Read, ["2026-11-20", "2026-12-12"]);
  const rec = await p.evaluate(() => { const d = window.__dev;
    const r = d.readApps([["이름", "대학", "전형명", "학교장추천"], ["김", "부산대학교", "학생부교과(학교장추천)", ""], ["이", "경북대학교", "지역인재", "Y"], ["박", "동아대학교", "학생부교과(학교장추천)", "N"]]).apps.map((x) => d.isRec(x.app));
    const g = d.recGroups([{ cls: 2, no: "1", name: "가", apps: [{ kind: "수시", univ: "부산대학교", jh: "학생부교과(학교장추천)" }, { kind: "수시", univ: "부경대학교", jh: "교과", rec: true }, { kind: "정시", univ: "부산대학교", jh: "학교장추천" }] },
      { cls: 3, no: "2", name: "나", apps: [{ kind: "수시", univ: "부산대학교(부산)", jh: "학생부교과(학교장추천)", rec: false }, { kind: "수시", univ: "부산대학교", jh: "지역인재(학교추천)" }] }]);
    return { r, g: g.map((x) => x.univ + x.list.length) }; });
  check("학교장추천: 전형명에서 저절로, 칸이 있으면 그 값", rec.r, [true, true, false]);
  const ac = await p.evaluate(() => { const d = window.__dev;
    const st = (g) => ({ name: "가", csat: g });
    const a = (m) => ({ kind: "수시", univ: "A대학교", itv: "2026-11-28", status: "1단계합", mreq: m });
    const V = (g, m) => (d.examVerdict(st(g), a(m)) || {}).v;
    return {
      edge: V({ kor: "2", math: "3", eng: "4", inq1: "5", inq2: "5", his: "4" }, "국수영탐 중 2개합 5"),
      go: V({ kor: "1", math: "1", eng: "1", inq1: "1", inq2: "1", his: "1" }, "국수영탐 중 2개합 5"),
      skip: V({ kor: "4", math: "4", eng: "4", inq1: "4", inq2: "4", his: "4" }, "국수영탐 중 2개합 5"),
      near: V({ kor: "3", math: "3", eng: "4", inq1: "4", inq2: "4", his: "4", src: "가채점" }, "국수영탐 중 2개합 5"),
      nearReal: V({ kor: "3", math: "3", eng: "4", inq1: "4", inq2: "4", his: "4", src: "성적표" }, "국수영탐 중 2개합 5"),
      nearNotice: d.noticeText({ name: "가", csat: { kor: "3", math: "3", eng: "4", inq1: "4", inq2: "4", his: "4", src: "가채점" }, apps: [{ kind: "수시", univ: "부산대학교", major: "경영학과", type: "논술", itv: "2026-11-28", status: "지원완료", mreq: "국수영탐 중 2개합 5" }] }, 400, 2),
      none: V({ kor: "4" }, ""),
      noGrade: d.examVerdict(st({}), a("2개합 5")),
      before: d.afterCsatApp({ kind: "수시", itv: "2026-11-14", status: "지원완료" }),
      done: d.afterCsatApp({ kind: "수시", itv: "2026-11-28", status: "1단계불" }),
      notice: d.noticeText({ name: "가", csat: { kor: "4", math: "4", eng: "4", inq1: "4", inq2: "4", his: "4", src: "가채점" }, apps: [{ kind: "수시", univ: "부산대학교", major: "경영학과", type: "논술", itv: "2026-11-28", status: "지원완료", mreq: "국수영탐 중 2개합 5" }] }, 400, 2),
    }; });
  check("수능 뒤 응시 판단: 아슬아슬·응시·안 가도 됨·최저 없음", [ac.edge, ac.go, ac.skip, ac.none], ["edge", "go", "skip", "go"]);
  check("수능 뒤 응시 판단: 등급 없으면 판단 안 함, 수능 전 고사·떨어진 지원은 빼기", [ac.noGrade, ac.before, ac.done], [null, false, false]);
  check("수능 뒤 응시 판단: 가채점으로 한 등급 모자라면 '안 가도 됨' 대신 응시 권함(성적표면 안 가도 됨)", [ac.near, ac.nearReal], ["near", "skip"]);
  check("일정 안내 문자: 가채점 한 등급 차이 미충족이면 응시하세요", /논술 — 부산대 경영학과.*한 등급 차이.*응시하세요/.test(ac.nearNotice) && !/응시하지 않아도/.test(ac.nearNotice), true);
  const pr = await p.evaluate(() => { const d = window.__dev;
    const a = { id: "x", kind: "수시", univ: "부산대학교", major: "경영학과", type: "학종", itv: "2026-11-28", status: "1단계합", prep: { read: true, mock: true } };
    const b = JSON.parse(JSON.stringify(a)); b.prep.go = true;
    return { list: [d.prepList(a).length, d.prepList({ type: "논술" }).length, d.prepList({ type: "실기" }).length], done: d.prepDone(a),
      needs: [d.prepNeeds(a), d.prepNeeds({ ...a, status: "1단계불" }), d.prepNeeds({ ...a, itv: "" })],
      log: d.diffLines({ name: "가", apps: [a] }, { name: "가", apps: [b] }) }; });
  check("면접 준비: 면접 4·논술 3·실기 2 항목, 한 것 세기", [pr.list, pr.done], [[4, 3, 2], 2]);
  check("면접 준비: 남은 면접만(떨어졌거나 날짜 없으면 빼기)", pr.needs, [true, false, false]);
  check("변경 기록에 면접 준비", pr.log, ["부산대 경영학 — 면접 준비 2→3/4"]);
  const rg = await p.evaluate(() => { const d = window.__dev;
    const st = (apps) => ({ id: "r", cls: 2, no: "1", name: "가", apps: apps.map((a, i) => ({ id: "a" + i, kind: "수시", univ: a[0] + "대학교", major: "경영학과", status: a[1] })) });
    const S = [st([["부산", "최초합"], ["경북", "충원합"], ["동아", "충원대기"]]), st([["부산", "등록완료"], ["경북", "충원대기"]]), st([["부산", "등록포기"]]), st([["부산", "불합격"]])];
    const I = S.map((x) => d.regInfo(x)); const div = document.createElement("div"); d.renderReg(div, S, false);
    return { st: I.map((x) => x.state), add: I[0].add, due: I[0].due, btn: div.querySelectorAll(".regapp .btn").length, text: /등록할 곳 정하기 1/.test(div.textContent) && /등록 완료 1/.test(div.textContent) && /모두 포기 1/.test(div.textContent) }; });
  check("수시 등록: 정하기·완료·모두 포기·해당 없음", rg.st, ["todo", "done", "gaveup", null]);
  check("수시 등록: 충원합이 있으면 충원 등록 마감, 합격마다 여기 등록 단추", [rg.add, rg.due, rg.btn, rg.text], [true, "2026-12-30", 2, true]);
  const nx = await p.evaluate(() => { const d = window.__dev;
    const st = { name: "가", apps: [{ kind: "수시", univ: "부산대학교", major: "경영학과", type: "학종", itv: "2026-11-28", status: "1단계합" }] };
    return { withNote: d.noticeText(st, 400, 2, "수험표 챙기세요"), onlyNote: d.noticeText({ name: "나", apps: [] }, 400, 2, "수험표 챙기세요"), empty: d.noticeText({ name: "다", apps: [] }, 400, 2, "") }; });
  check("일정 안내 문자: 덧붙일 말은 일정 뒤에, 일정 없어도 말만 보냄", [/면접·고사 — 부산대 경영학과 \(학종\)\n\n수험표 챙기세요\n※/.test(nx.withNote), /^\[3학년 2반\] 나 학생 대입 안내.*\n수험표 챙기세요$/.test(nx.onlyNote), nx.empty], [true, true, ""]);
  const sg = await p.evaluate(() => { const r = []; const set = (k, v) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); };
    const was = [localStorage.getItem("jh.myname"), localStorage.getItem("jh.sign")];
    [["2반 김철수", null], ["3학년 2반 담임 김철수", null], ["김철수 선생님", null], ["2반 김철수", "박영희"], ["", null]].forEach((x) => { set("jh.myname", x[0] || null); set("jh.sign", x[1]); r.push(window.__dev.signGet()); });
    set("jh.myname", was[0]); set("jh.sign", was[1]); return r; });
  check("가정통신문 서명: 선생님 이름에서 'n반'·'선생님' 떼기, 따로 적은 서명이 먼저", sg, ["김철수", "김철수", "김철수", "박영희", ""]);
  check("일정 안내 문자: 최저 미충족이면 응시 안 해도 됨", /논술 — 부산대 경영학과.*응시하지 않아도 됩니다/.test(ac.notice), true);
  check("학교장추천 현황: 대학별로 묶고 직접 끈 것·정시는 빼기", rec.g, ["부산대2", "부경대1"]);
  check("달력 줄 75바이트 안으로 접기", misc.foldMax <= 75 && misc.foldCont, true);
  check("정시 현황: 수시 합격·가군·전문대 구분", misc.jungsi, "1,1,1");

  console.log("\n[진학 실적]");
  const res = await p.evaluate(() => {
    const d = window.__dev;
    const F = (u) => d.univFound({ univ: u });
    const R = (u, r) => d.univRegion({ univ: u, region: r || "" });
    const O = (apps, fate) => d.outcomeOf({ apps, fate }).kind;
    return {
      found: [F("국립부경대학교(부산)"), F("부산대학교(부산)"), F("서울시립대학교"), F("부산교육대학교"), F("동아대학교(부산)"), F("경남도립거창대학")].join(","),
      region: [R("부산대학교(부산)"), R("인제대학교(김해)"), R("경희대학교(국제)", "경기"), R("동국대학교(WISE)"), R("동의과학대학교"), R("x", "경상남도")].join(","),
      outcome: [
        O([{ status: "등록완료" }, { status: "최초합" }]),
        O([{ status: "등록포기" }, { status: "충원합" }]),
        O([{ status: "등록포기" }]),
        O([{ status: "충원대기" }]),
        O([{ status: "불합격" }], "재수"),
        O([{ status: "불합격" }]),
      ].join(","),
    };
  });
  check("국공립·사립 구분", res.found, "국공립,국공립,국공립,국공립,사립,국공립");
  check("지역: 괄호 속 지명·파일의 지역 칸", res.region, "부산,경남,경기,경북,미상,경남");
  check("최종 결과: 등록 > 합격(등록포기 제외) > 진행 중 > 진로", res.outcome, "등록,합격,미정,진행 중,재수,미정");

  const kd = await p.evaluate(() => { const K = window.__dev.KEYDATES;
    return { sorted: K.every((k, i) => !i || K[i - 1].s <= k.s) && K.every((k) => !k.e || k.e >= k.s), csat: K.find((k) => k.id === "csat").s, jApp: K.find((k) => k.id === "j-app").s }; });
  check("입시 공통 일정: 날짜순", kd.sorted, true);

  const gaps = await p.evaluate(() => { const G = window.__dev.minGaps([
    { cls: 2, apps: [{ kind: "수시", univ: "A대학교", major: "가학과", jh: "교과", mreq: "최저 있음(기준 미기재)" }, { kind: "수시", univ: "B대학교", mreq: "2개합 5 또는 영어 1" }, { kind: "수시", univ: "C대학교", mreq: "국수영탐 중 2개합 5" }, { kind: "수시", univ: "D대학교", mreq: "없음" }] },
    { cls: 5, apps: [{ kind: "수시", univ: "A대학교", major: "가학과", jh: "교과", mreq: "최저 있음(기준 미기재)" }] },
  ]); return G.miss.map((e) => e.univ + e.n + Object.keys(e.cls).join("")).join() + "/" + G.bad.map((e) => e.univ).join(); });
  check("최저 점검: 기준 없음은 모아 세고, 못 읽는 기준만 따로", gaps, "A대학교225/B대학교");
  check("2027 수능 2026-11-19 · 정시 접수 2027-01-04", kd.csat + " " + kd.jApp, "2026-11-19 2027-01-04");

  const gl = await p.evaluate(() => { const D = window.__dev.glanceData([
    { apps: [{ kind: "수시", type: "학종", univ: "부산대학교(부산)", status: "최초합" }, { kind: "수시", type: "교과", univ: "연세대학교(서울)", status: "충원대기" },
             { kind: "수시", type: "논술", univ: "A대학교", status: "등록포기" }, { kind: "정시", univ: "B대학교(서울)", status: "1단계합" }] },
    { apps: [] },
  ]); return JSON.stringify([D.R, D.T, D.G, D.H, D.n]); });
  const dl = await p.evaluate(() => window.__dev.diffLines(
    { name: "가", cls: 2, csat: { kor: "3" }, apps: [{ id: "a", kind: "수시", univ: "부산대학교", major: "국어국문학과", status: "지원완료", itv: "2026-11-28", c6: true }, { id: "b", univ: "경성대학교" }] },
    { name: "가", cls: 2, csat: { kor: "2", mathSel: "미적" }, apps: [{ id: "a", kind: "수시", univ: "부산대학교", major: "국어국문학과", status: "최초합", itv: "2026-11-29", c6: true, note: "메모" }, { id: "c", kind: "정시", univ: "동아대학교" }] }));
  check("변경 기록: 수능·상태·날짜·메모·추가·삭제", dl, ["수능: 국어 3→2, 수학 선택 –→미적", "부산대 국어국문학 — 상태 지원완료 → 최초합, 면접·고사일 11/28 → 11/29, 메모 바뀜", "지원 추가: 동아대 (정시)", "지원 삭제: 경성대"]);
  check("변경 기록: 바뀐 것 없으면 남기지 않음", await p.evaluate(() => window.__dev.diffLines({ name: "가", apps: [{ id: "a", c6: false }] }, { name: "가", apps: [{ id: "a" }] })), []);
  const nt = await p.evaluate(() => { const d = (n, tm) => { const x = new Date(Date.now() + n * 864e5); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0") + (tm ? "T" + tm : ""); };
    const st = { name: "가나", apps: [
      { kind: "수시", univ: "부산대학교", major: "국어국문학과", type: "논술", itv: d(9), status: "지원완료" },
      { kind: "수시", univ: "동아대학교", major: "경영학과", type: "학종", itv: d(3), ann: d(20), status: "1단계합" },
      { kind: "수시", univ: "경성대학교", major: "건축학과", type: "교과", due: d(5, "18:00"), rank: "7", status: "충원대기" },
      { kind: "수시", univ: "신라대학교", type: "교과", itv: d(4), status: "불합격" }] };
    const lines = window.__dev.noticeText(st, 400, 2).split("\n");
    return { head: /^\[3학년 2반\] 가나 학생/.test(lines[0]), kinds: lines.slice(1).map((l) => (l.match(/ (면접·고사|논술|합격자 발표|충원 합격 마감|수능) —/) || [])[1]).filter(Boolean).filter((k) => k !== "수능"),
      rank: lines.some((l) => /18:00 충원 합격 마감 — 경성대 .*예비 7번/.test(l)), none: window.__dev.noticeText({ name: "다", apps: [] }, 400, 2) }; });
  check("일정 안내 문자: 날짜순, 결과 난 지원 빼고, 충원 시각·예비 번호", nt, { head: true, kinds: ["면접·고사", "충원 합격 마감", "논술", "합격자 발표"], rank: true, none: "" });
  const sc = await p.evaluate(() => ({ sum: window.__dev.scoreSum({ korS: "131", korP: "96", mathS: "140", mathP: "98", inq1S: "68", inq1P: "95", inq2S: "65" }),
    ok: [["korS", "200"], ["korS", "201"], ["inq1S", "101"], ["mathP", "100"], ["korP", "9a"], ["korP", ""]].map((x) => window.__dev.scoreOk(x[0], x[1])) }));
  check("정시 점수: 국·수·탐2 합과 과목 수, 범위 검사", sc, { sum: { s: 404, p: 289, ns: 4, np: 3 }, ok: [true, false, false, true, false, true] });
  check("한눈에 보기: 결과 묶음·전형·지역·지원 장수", gl,
    JSON.stringify([{ ok: 1, wait: 1, go: 1, bad: 1, none: 0 }, { 학종: 1, 교과: 1, 논술: 1, 정시: 1 }, { 부산: 1, 서울: 2, 미상: 1 }, [1, 0, 0, 1, 0, 0, 0], 4]));

  await p.click(".row >> nth=0 >> .rowhead"); await p.click("#tabAll"); await p.waitForTimeout(200);
  await p.click("#brandHome"); await p.waitForTimeout(200);
  check("제목 누르면 홈(우리 반 맨 위, 펼친 학생 닫힘)", await p.evaluate(() => [!document.getElementById("viewClass").hidden, document.querySelectorAll(".detail").length]), [true, 0]);

  check("경고는 학생마다 한 칸(이름·경고 수)", await p.evaluate(() => { const g = [...document.querySelectorAll("#alerts .alert.grp")]; return g.length > 0 && g.every((x) => x.querySelector(".stu b") && x.querySelectorAll("li").length >= 1); }), true);

  await p.click(".row >> nth=0 >> .rowhead"); await p.waitForTimeout(200);
  await p.click(".detail .dtab >> text=상담 기록"); await p.waitForTimeout(150); await p.fill(".detail textarea[name=note]", "학부모 상담 — 정시 가능성 설명"); await p.click(".detail .btn >> text=기록 추가"); await p.waitForTimeout(300);
  const nts = await p.evaluate(() => { const S = window.__dev.students(); const s = S.find((x) => (x.notes || []).length); return s ? [s.notes.length, s.notes[0].t, s.notes[0].k, window.__dev.logs().some((e) => e.w.some((w) => /상담 기록 추가/.test(w)))] : null; });
  check("상담 기록: 학생 화면에서 추가, 변경 기록에 남음", nts, [1, "학부모 상담 — 정시 가능성 설명", "학생", true]);
  check("상담 기록: 줄 머리에 상담 수, 반 CSV 단추", await p.evaluate(() => [document.querySelector(".row .cnote") && document.querySelector(".row .cnote").textContent, !document.getElementById("btnNotesCsv").hidden]), ["상담 1", true]);
  await p.click(".row >> nth=0 >> .rowhead"); await p.waitForTimeout(100);

  await p.click("#btnJungsi"); await p.waitForTimeout(300);
  const jrow = await p.evaluate(() => { const b = document.querySelector("#jungsiPanel .jcadd"); if (!b) return null; const tr = b.closest("tr"); return [...document.querySelectorAll("#jungsiPanel tbody tr")].indexOf(tr); });
  if (jrow === null) check("정시 후보: 후보 칸이 있음", false, true); else {
    const R2 = (sel) => "#jungsiPanel tbody tr >> nth=" + jrow + " >> " + sel;
    await p.click(R2(".jcadd")); await p.fill(R2(".jcin input"), "부경대학교 경영학부"); await p.click(R2(".jcin .btn")); await p.waitForTimeout(200);
    const cand = await p.evaluate((i) => document.querySelectorAll("#jungsiPanel tbody tr")[i].querySelector(".jcand .t").textContent, jrow);
    await p.click(R2(".jcand .btn >> text=확정")); await p.waitForTimeout(200);
    const after = await p.evaluate((i) => { const tr = document.querySelectorAll("#jungsiPanel tbody tr")[i]; return [!!tr.querySelector(".jcand"), [...tr.querySelectorAll(".japp")].some((b) => /부경대 경영학부/.test(b.textContent)), tr.querySelector(".jfile") && tr.querySelector(".jfile").textContent]; }, jrow);
    await p.click(R2(".jfile")); await p.waitForTimeout(200);
    const filed = await p.evaluate(() => window.__dev.students().some((s) => (s.apps || []).some((a) => a.kind === "정시" && a.univ === "부경대학교" && a.major === "경영학부" && a.filed && a.group)));
    check("정시 후보: 적고 → 확정하면 그 군 지원, 접수 ✓ 저장", [cand, after, filed], ["후보 · 부경대 경영학부", [false, true, "접수 전"], true]);
  }
  await p.click("#btnJungsi"); await p.waitForTimeout(100);

  check("앱 흔적 없음(설치 단추·manifest·아이콘·서비스 워커 파일 없음, 남은 서비스 워커는 앱이 지움)", [await p.evaluate(() => !document.querySelector("link[rel=manifest],link[rel=icon],link[rel=apple-touch-icon]") && !document.getElementById("btnInstall")), ["manifest.webmanifest", "sw.js", "icons"].some((f) => fs.existsSync(path.join(ROOT, f))), /getRegistrations[\s\S]*unregister/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"))], [true, false, true]);

  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    const A = (id, u, d) => ({ id, kind: "수시", univ: u, major: "국어국문학과", type: "논술", itv: d, status: "지원완료", c6: true });
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mode", "local"); },
      [{ id: "s1", cls: 2, no: "30201", name: "가나", apps: [A("a", "부산대학교", "2026-11-28"), A("b", "건국대학교", "2026-11-21"), A("c", "숭실대학교", "2026-11-21"), A("d", "경북대학교", "2026-11-28"), A("e", "아주대학교", "2026-12-06")] }]);
    await x.goto("file://" + page404); await x.waitForTimeout(500);
    await x.click(".row >> nth=0 >> .rowhead"); await x.waitForTimeout(200);
    const ws = await x.$$eval(".apptable tbody tr.arow", (rs) => rs.map((r) => (r.querySelector(".w") || {}).textContent || ""));
    const itvT = await p.evaluate(() => { const d = window.__dev, c = d.checkStudent;
    const mk = (t1, t2) => ({ id: "t", cls: 2, name: "가", apps: [{ kind: "수시", univ: "부산대학교(부산)", itv: "2026-11-28", itvTime: t1, status: "지원완료" }, { kind: "수시", univ: "경북대학교(대구)", itv: "2026-11-28", itvTime: t2, status: "지원완료" }] });
    const w = (st) => c(st).filter((x) => x.code === "면접중복").map((x) => x.lv + ":" + (/겹칩니다/.test(x.msg) ? "over" : /시간은 다릅니다/.test(x.msg) ? "far" : "unknown"));
    const r = d.readApps([["이름", "대학", "면접일", "면접시각", "고사장"], ["가나", "부산대학교", "2026-11-28", "10시 30분", "인문관 301"], ["다라", "경북대학교", "2026-11-28 14:00", "", ""]]).apps.map((x) => [x.app.itvTime || "", x.app.itvPlace || ""]);
    const nt = d.noticeText({ name: "가", apps: [{ kind: "수시", univ: "부산대학교", major: "경영학과", type: "논술", itv: "2026-11-28", itvTime: "10:00", itvPlace: "인문관", status: "지원완료" }] }, 400, 2);
    return { over: w(mk("10:00", "11:30")), far: w(mk("09:00", "15:00")), unk: w(mk("10:00", undefined)), read: r, notice: /논술 10:00 — 부산대 경영학과 \(논술\) \[인문관\]/.test(nt) }; });
  check("면접 시각: 3시간 안이면 겹침(빨강), 떨어지면 이동 확인(주황), 모르면 확인 요청", [itvT.over, itvT.far, itvT.unk], [["crit:over"], ["warn:far"], ["warn:unknown"]]);
  check("면접 시각: 파일의 면접시각·고사장(또는 면접일 안의 시각)을 읽음", itvT.read, [["10:30", "인문관 301"], ["14:00", ""]]);
  check("면접 시각: 안내 문자에 시각·고사장", itvT.notice, true);
  check("면접 겹침: 같은 날끼리 번호와 상대 대학", ws, ["② 경북대와 같은 날", "① 숭실대와 같은 날", "① 건국대와 같은 날", "② 부산대와 같은 날", ""]);
    await c.close();
  }

  await p.click(".row >> nth=0 >> .rowhead"); await p.waitForTimeout(200); await p.click(".detail .dtab >> nth=0"); await p.waitForTimeout(150);
  const dv = await p.evaluate(() => { const d = document.querySelector(".detail"); return [!!d.querySelector(".dsum"), [...d.querySelectorAll(".dtab")].map((b) => b.textContent.replace(/\s*\(\d+\)/, "")), !!d.querySelector(".apptable"), !!d.querySelector(".grid.csat")]; });
  await p.click(".detail .dtab >> text=수능 성적"); await p.waitForTimeout(150);
  const dv2 = await p.evaluate(() => { const d = document.querySelector(".detail"); return [!!d.querySelector(".grid.csat"), !!d.querySelector(".apptable")]; });
  await p.click(".detail .dtab >> text=지원 대학"); await p.click(".row >> nth=0 >> .rowhead"); await p.waitForTimeout(100);
  check("학생 화면: 요약 줄과 탭(지원 대학이 먼저, 수능은 탭으로)", [dv, dv2], [[true, ["지원 대학", "수능 성적", "상담 기록", "기타"], true, false], [true, false]]);

  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    const A = (u, st) => ({ id: u + st, kind: "수시", univ: u, major: "경영학과", type: "학종", status: st, c6: true });
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mode", "local"); },
      [{ id: "s1", cls: 2, no: "30201", name: "가나", apps: [A("부산대학교", "최초합")] }, { id: "s2", cls: 2, no: "30202", name: "다라", apps: [A("경북대학교", "지원완료")] },
       { id: "s3", cls: 2, no: "30203", name: "마바", apps: [A("동아대학교", "등록완료"), A("부경대학교", "등록완료")] }]);
    await x.goto("file://" + page404); await x.waitForTimeout(500);
    const names = () => x.$$eval("#rows .row .nm", (e) => e.map((n) => n.textContent));
    const all = await names();
    await x.click("#rfilter .rf >> text=경고"); await x.waitForTimeout(100); const warn = await names();
    await x.click("#rfilter .rf >> text=경고"); await x.click("#rfilter .rf >> text=결과 기다림"); await x.waitForTimeout(100); const wait = await names();
    await x.click("#rfilter .rf >> text=결과 기다림"); await x.fill("#rfilter input", "경북"); await x.waitForTimeout(150); const q = await names();
    const cnt = await x.textContent("#listCount");
    check("우리 반 찾기·거르기: 경고·결과 기다림·대학 이름으로", [all.length, warn, wait, q, cnt], [3, ["마바"], ["다라"], ["다라"], "1 / 3명"]);
    await x.click("#tabAll"); await x.waitForTimeout(200);
    const vis = (id) => x.$eval(id, (e) => getComputedStyle(e.closest(".otab")).display !== "none");
    const t0 = [await vis("#allAlerts"), await vis("#classTable")];
    await x.click("#allTabs button >> text=반별 현황"); await x.waitForTimeout(150);
    const t1 = [await vis("#allAlerts"), await vis("#classTable")];
    await x.reload(); await x.waitForTimeout(500); await x.click("#tabAll"); await x.waitForTimeout(200);
    check("전체 현황 탭: 한눈에 → 반별 현황, 다시 열어도 기억", [t0, t1, await vis("#classTable")], [[true, false], [false, true], true]);
    await c.close();
  }

  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } }); const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    const A = (id, u, itv, extra) => Object.assign({ id, kind: "수시", univ: u, major: "경영학과", jh: "학생부종합(일반)", type: "학종", status: "지원완료", c6: true, itv }, extra || {});
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mode", "local"); localStorage.setItem("jh.alltab", "exam"); },
      [{ id: "s1", cls: 2, no: "30201", name: "가나", apps: [A("a1", "경북대학교", "2026-12-05")] }, { id: "s2", cls: 3, no: "30301", name: "다라", apps: [A("a2", "경북대학교", "2026-12-05")] },
       { id: "s3", cls: 4, no: "30401", name: "마바", apps: [A("a3", "경북대학교", "2026-12-05", { itvTime: "14:00", itvSrc: "학생" })] },
       { id: "s4", cls: 4, no: "30402", name: "사아", apps: [A("a4", "동아대학교", "2026-12-06")] }]);
    await x.goto("file://" + page404); await x.waitForTimeout(500);
    await x.click("#tabAll"); await x.waitForTimeout(300);
    const rows0 = await x.$$eval("#examTable tbody tr", (r) => r.map((e) => e.innerText.replace(/\s+/g, " ")));
    await x.click("#examTable tbody tr >> nth=0 >> button >> text=넣기"); await x.waitForTimeout(150);
    await x.fill("#examTable input[name=time]", "10:30"); await x.fill("#examTable input[name=place]", "글로벌플라자 301호");
    await x.click("#examTable button >> text=저장"); await x.waitForTimeout(300);
    const got = await x.evaluate(() => JSON.parse(localStorage.getItem("jh.local.students")).map((s) => [s.name, s.apps[0].itvTime || "", s.apps[0].itvPlace || "", s.apps[0].itvSrc || ""]));
    const row1 = await x.$eval("#examTable tbody tr", (e) => e.innerText.replace(/\s+/g, " "));
    check("고사 시간표: 대학·전형·날짜로 묶고, 한 번 넣으면 같은 지원 학생 모두에게(학생에게 받은 시각은 그대로)",
      [rows0.length, /가나 외 2명/.test(rows0[0]), /시각 없음/.test(rows0[0]), got, /10:30 · 글로벌플라자 301호/.test(row1), /학생별 시각 다른 학생 1명/.test(row1), await x.textContent("#examCnt")],
      [2, true, true, [["가나", "10:30", "글로벌플라자 301호", "공지"], ["다라", "10:30", "글로벌플라자 301호", "공지"], ["마바", "14:00", "", "학생"], ["사아", "", "", ""]], true, true, "앞으로 2건 · 시각 확인 1건 · 아직 1건"]);
    await c.close();
  }

  /* ── 자료 지키기(백업 알림) ── */
  const bb = () => p.evaluate(() => { const b = document.getElementById("backupBar"); return [!b.hidden, b.classList.contains("due"), b.textContent]; });
  let B1 = await bb();
  check("백업 알림: 받아 둔 적 없으면 주황 경고", [B1[0], B1[1], /한 번도/.test(B1[2])], [true, true, true]);
  await p.evaluate(() => document.querySelector("#backupBar .btn").click()); await p.waitForTimeout(300);
  B1 = await bb();
  check("백업 받으면 경고가 사라지고 날짜 표시", [B1[1], /마지막 백업 \d/.test(B1[2])], [false, true]);
  await p.evaluate(() => { localStorage.setItem("jh.lastBackup", new Date(Date.now() - 8 * 864e5).toISOString()); });
  await p.evaluate(() => window.__dev.render()); B1 = await bb();
  check("백업 7일 지나면 다시 경고", [B1[1], /8일이 지났습니다/.test(B1[2])], [true, true]);
  await p.evaluate(() => { localStorage.setItem("jh.lastBackup", new Date().toISOString()); localStorage.setItem("jh.chgRes", "1"); window.__dev.render(); }); B1 = await bb();
  check("백업 뒤 결과가 바뀌면 경고", [B1[1], /결과가 바뀌었습니다/.test(B1[2])], [true, true]);
  await p.evaluate(() => { localStorage.removeItem("jh.chgRes"); window.__dev.render(); });

  /* ── 반 파일 합치기 ── 학생마다 더 최근에 고친 쪽, 변경 기록은 합침, 학번 없으면 반·이름으로 */
  const mg = await p.evaluate(() => {
    const D = window.__dev, f = (st) => ({ name: "x.json", b: { app: "jinhak-board", students: st } });
    D.mergeData([f([
      { id: "m1", cls: 9, no: "30901", name: "가", updatedAt: "2026-10-10T00:00:00Z", apps: [{ id: "a", status: "지원완료" }], log: [{ t: "2026-10-10T00:00:00Z", w: ["처음"] }] },
      { id: "m2", cls: 9, name: "나", updatedAt: "2026-10-10T00:00:00Z", apps: [] }])]);
    const r = D.mergeData([f([
      { id: "m1", cls: 9, no: "30901", name: "가", updatedAt: "2026-10-12T00:00:00Z", apps: [{ id: "a", status: "최초합" }], log: [{ t: "2026-10-12T00:00:00Z", w: ["합격"] }] },
      { id: "zz", cls: 9, name: "나", updatedAt: "2026-10-01T00:00:00Z", apps: [{ id: "b", status: "불합격" }] }])]);
    const S = D.students(), a = S.find((x) => x.id === "m1"), b2 = S.filter((x) => x.name === "나" && x.cls === 9);
    return { upd: r.upd, keep: r.keep, status: a.apps[0].status, log: a.log.map((e) => e.w[0]), dup: b2.length, nAppsB: b2[0].apps.length };
  });
  check("반 파일 합치기: 최근 쪽 남김·기록 합침·같은 학생 중복 없음", mg, { upd: 1, keep: 1, status: "최초합", log: ["처음", "합격"], dup: 1, nAppsB: 0 });

  /* ── 학교별 공용 장부(Vercel 판) ── 가짜 Firebase 로 학교 만들기·가입 승인·담임은 자기 반만·관리자는 전부·학교끼리 막힘 */
  console.log("\n[학교별 공용 장부]");
  const srv = require("http").createServer((q, r) => {
    const f = q.url.split("?")[0] === "/" ? page404 : path.join(ROOT, decodeURIComponent(q.url.split("?")[0]));
    try { r.end(fs.readFileSync(f)); } catch (e) { r.statusCode = 404; r.end(); }
  }).listen(0);
  const port = srv.address().port, KV = {};
  const kv = (op, p, d) => { if (op === "get") return KV[p] || null; if (op === "set") { if (d === null) delete KV[p]; else KV[p] = d; return null; }
    return Object.keys(KV).filter((k) => k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/")).map((k) => ({ path: k, data: KV[k] })); };
  let lastCode = "";
  const who = async (o) => {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await c.exposeFunction("__kv", kv);
    await c.addInitScript(fs.readFileSync(FIX("fbmock.js"), "utf8"));
    await c.addInitScript((a) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("jh.cls", "2");
      if (a.local) localStorage.setItem("jh.local.students", JSON.stringify(a.local)); } if (a.email) window.__fbEmail = a.email; }, o);
    const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e))); x.on("dialog", (d) => d.accept());
    await x.goto("http://localhost:" + port + "/?fb=1" + (o.hash || "")); await x.waitForTimeout(600);
    x.makeSchool = async () => {
      await x.click("#banner .choice >> text=관리자입니다"); await x.click("#banner .btn >> text=구글로 로그인"); await x.waitForTimeout(300);
      await x.fill("#banner input[name=school]", o.school || "테스트고"); await x.fill("#banner input[name=joinpw]", "1234"); await x.click("#banner .btn >> text=학교 만들기"); await x.waitForTimeout(3500);
      lastCode = (await x.innerText("#banner .codetext")).trim(); await x.click("#banner .btn >> text=들어가기"); await x.waitForTimeout(1500); };
    return x;
  };
  const rowNames = (x) => x.evaluate(() => [...document.querySelectorAll(".row .nm")].map((e) => e.textContent));
  const gateTitle = (x) => x.evaluate(() => { const b = document.getElementById("banner"), h = b.querySelector("h2"); return b.hidden || !h ? "" : h.textContent; });
  const join = async (x, code, name, cls, pw) => {
    await x.click("#banner .choice >> text=선생님입니다");
    await x.fill("#banner input[name=code]", code); await x.fill("#banner input[name=name]", name); await x.selectOption("#banner select[name=cls]", String(cls)); await x.fill("#banner input[name=pw]", pw || "1234");
    await x.click("#banner .codeform .btn"); await x.waitForTimeout(1500);
  };
  const stu = (id, cls, name) => ({ id, cls, no: id, name, updatedAt: "2026-10-01T00:00:00Z", apps: [{ id: "a" + id, kind: "수시", univ: "부산대학교", major: "국어국문학과", type: "학종", status: "지원완료", c6: true, itv: "2026-11-21" }] });
  const adm = await who({ email: "admin@x.com", local: [stu("30201", 2, "김예시"), stu("30501", 5, "박예시")] });
  check("처음: 선생님/관리자 고르기", await gateTitle(adm), "진학 현황판");
  const vis = (x) => x.evaluate(() => getComputedStyle(document.getElementById("viewClass")).display !== "none");
  check("시작 화면: 카드 세 장, 뒤의 예시 화면은 감춤", [await adm.evaluate(() => document.querySelectorAll("#banner .land .choice").length), await vis(adm)], [3, false]);
  await adm.click("#banner .linkbtn >> text=예시 화면 둘러보기"); await adm.waitForTimeout(300);
  check("예시 화면 둘러보기 → 예시 보이고 돌아가기", [await vis(adm), /예시 화면입니다/.test(await adm.innerText("#banner"))], [true, true]);
  await adm.click("#banner .linkbtn >> text=시작 화면으로"); await adm.waitForTimeout(300);
  await adm.makeSchool(); for (let i = 0; i < 40 && Object.keys(KV).filter((k) => k.includes("/students/")).length < 2; i++) await adm.waitForTimeout(200);   // 올리기가 끝날 때까지(느린 PC)
  const sids = Object.keys(KV).filter((k) => /^schools\/[0-9a-f]{40}$/.test(k));
  check("가입 암호는 해시로만(관리자 전용 자리)", Object.keys(KV).some((k) => k.endsWith("/private/join")) && !/1234/.test(JSON.stringify(KV)), true);
  check("관리자: 학교 만들기(이름·관리자 이메일)", sids.length === 1 && KV[sids[0]].name + "/" + KV[sids[0]].admins.join(), "테스트고/admin@x.com");
  const sdocs = Object.keys(KV).filter((k) => /\/students\//.test(k));
  check("관리자: 이 브라우저 자료를 학교 장부로(반 번호만 드러남)", sdocs.map((k) => KV[k].cls).sort(), [2, 5]);
  check("저장소엔 암호문만(이름·학번·대학 안 보임)", /김예시|30201|부산대/.test(JSON.stringify(KV)), false);
  check("새 학교 코드는 8자리", /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(lastCode), true);
  const firstCode = lastCode;
  await adm.click("#tabAdmin"); await adm.waitForTimeout(300);
  await adm.fill("#schoolPanel input[name=rename]", "테스트고 3학년"); await adm.click("#schoolPanel button >> text=이름 바꾸기"); await adm.waitForTimeout(800);
  await adm.check("#schoolPanel input[name=quick]"); await adm.waitForTimeout(600);
  check("빠른 열기 켜기: 관리자 전용 칸에 학교 코드", Object.keys(KV).some((k) => k.endsWith("/private/code")), true);
  check("관리자: 학교 이름 나중에 바꾸기", [KV[sids[0]].name, KV[sids[0]].admins.join(), /테스트고 3학년/.test(await adm.innerText("#whoChip"))], ["테스트고 3학년", "admin@x.com", true]);
  await adm.click("#tabClass");
  const t2 = await who({ hash: "#join=" + lastCode });
  check("초대 링크: 코드가 채워지고 칸은 숨김, 주소에서 코드 지움", [await gateTitle(t2), await t2.$eval("#banner input[name=code]", (e) => e.hidden && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(e.value)), t2.url().includes("join=")], ["선생님 들어가기", true, false]);
  await t2.fill("#banner input[name=name]", "박담임"); await t2.selectOption("#banner select[name=cls]", "2");
  await t2.fill("#banner input[name=pw]", "틀린암호"); await t2.click("#banner .codeform .btn"); await t2.waitForTimeout(1500);
  check("가입 암호가 틀리면 요청이 안 됨(코드는 그대로)", [/가입 암호가 맞지 않습니다/.test(await t2.innerText("#banner")), Object.keys(KV).filter((k) => k.includes("/members/")).length], [true, 0]);
  await t2.fill("#banner input[name=name]", "박담임"); await t2.selectOption("#banner select[name=cls]", "2");
  await t2.fill("#banner input[name=pw]", "1234"); await t2.click("#banner .codeform .btn"); await t2.waitForTimeout(1500);
  check("선생님: 가입 요청하면 승인 대기, 자료 안 보임", [await gateTitle(t2), (await rowNames(t2)).includes("김예시")], ["관리자 승인을 기다리는 중입니다", false]);
  check("관리자: 학교 관리 탭에 승인 대기 숫자", await adm.evaluate(() => { const n = document.getElementById("tabAdminN"); return !document.getElementById("tabAdmin").hidden && !n.hidden && n.textContent; }), "1");
  await adm.click("#tabAdmin"); await adm.waitForTimeout(800);
  check("관리자: 승인 기다리는 선생님(반 포함) 보임", /박담임/.test(await adm.innerText("#schoolPanel")) && await adm.$eval("#schoolPanel .uitem select", (e) => e.value), "2");
  await adm.click("#schoolPanel button >> text=승인"); await t2.waitForTimeout(2500);
  check("승인되면 담임 화면이 열리고 자기 반만", [await gateTitle(t2), await rowNames(t2), await t2.$eval("#classbar", (e) => e.hidden)], ["", ["김예시"], true]);
  await adm.click("#tabAdmin"); await adm.waitForTimeout(500);
  const prog = await adm.evaluate(() => { const rows = [...document.querySelectorAll("#schoolPanel .progt tbody tr")].map((r) => [...r.cells].map((c) => c.textContent)); return { r2: rows.find((r) => r[0] === "2반"), r5: rows.find((r) => r[0] === "5반"), r1: rows.find((r) => r[0] === "1반") }; });
  check("반별 진행 현황: 담임·학생·지원·챙길 것", [prog.r2 && prog.r2[1], prog.r2 && prog.r2[2], prog.r5 && prog.r5[7], prog.r1 && prog.r1[7]], ["박담임", "1", "담임 가입 전", "담임 가입 전"]);
  await adm.click("#tabClass"); await adm.waitForTimeout(200);
  await t2.click("#whoChip button >> text=다른 컴퓨터"); await t2.waitForTimeout(800);
  const linkUrl = await t2.evaluate(() => new Promise((ok) => { const o = navigator.clipboard && navigator.clipboard.writeText; window.__copied = null;
    if (navigator.clipboard) navigator.clipboard.writeText = (v) => { window.__copied = v; return Promise.resolve(); };
    document.querySelector("#banner .btn").click(); setTimeout(() => ok(window.__copied), 300); }));
  check("다른 컴퓨터 링크: 학교 코드.열쇠, 저장소엔 해시만", [/#link=[0-9A-Z]{4}-[0-9A-Z]{4}\.[0-9A-Z]{16}$/.test(linkUrl || ""), Object.keys(KV).filter((k) => k.includes("/links/")).length >= 1], [true, true]);
  const t3 = await who({ hash: linkUrl ? linkUrl.slice(linkUrl.indexOf("#")) : "" }); await t3.waitForTimeout(2500);
  check("링크로 연 새 컴퓨터: 가입·승인 없이 같은 반으로", [await gateTitle(t3), await rowNames(t3), /박담임/.test(await t3.innerText("#whoChip"))], ["", ["김예시"], true]);
  const t4 = await who({ hash: "#link=" + lastCode + ".AAAAAAAAAAAAAAAA" }); await t4.waitForTimeout(1500);
  check("틀린 링크는 못 씀", /쓸 수 없는 링크/.test(await t4.innerText("#banner")), true);
  await t3.context().close(); await t4.context().close();
  await t2.reload(); await t2.waitForTimeout(2000);
  check("담임: 한 번 가입하면 다음부터는 코드 없이 바로 들어감", [await gateTitle(t2), (await rowNames(t2)).includes("김예시")], ["", true]);
  await t2.evaluate(() => { window.__fbEmail = "park@x.com"; });
  check("담임 화면 위쪽엔 구글 연결 단추가 없음(기본 방식)", await t2.evaluate(() => ![...document.querySelectorAll("#whoChip button")].some((b) => /구글/.test(b.textContent))), true);
  await t2.click("#whoChip button >> text=다른 컴퓨터"); await t2.waitForTimeout(800);
  await t2.click("#banner button >> text=내 구글 계정 연결"); await t2.waitForTimeout(800);
  await t2.evaluate(() => { document.getElementById("banner").hidden = true; });
  const linked = [Object.keys(KV).some((k) => /^users\//.test(k) && KV[k].code), await t2.evaluate(() => !document.querySelector("#whoChip") || ![...document.querySelectorAll("#whoChip button")].some((b) => b.textContent === "구글 연결"))];
  const t10 = await who({ email: "park@x.com" });
  await t10.click("#banner .choice >> text=선생님입니다"); await t10.click("#banner button >> text=구글로 들어가기"); await t10.waitForTimeout(2000);
  check("담임 구글 연결: 다른 컴퓨터에서 초대 링크 없이 구글로만 자기 반", [linked, await gateTitle(t10), await rowNames(t10)], [[true, true], "", ["김예시"]]);
  await t10.reload(); await t10.waitForTimeout(1800);
  check("담임 구글 연결: 그 컴퓨터는 다음부터 바로", await gateTitle(t10), "");
  await t10.context().close();
  const t11 = await who({ email: "stranger@x.com" });
  await t11.click("#banner .choice >> text=선생님입니다"); await t11.click("#banner button >> text=구글로 들어가기"); await t11.waitForTimeout(1200);
  check("처음 구글로 누르면 그 계정으로 가입 칸", [/가입한 학교가 아직 없습니다/.test(await t11.innerText("#banner")), /stranger@x\.com 계정으로 가입됩니다/.test(await t11.innerText("#banner"))], [true, true]);
  await t11.fill("#banner input[name=code]", firstCode); await t11.waitForTimeout(1200);
  await t11.fill("#banner input[name=name]", "구담임"); await t11.selectOption("#banner select[name=cls]", "3"); await t11.fill("#banner input[name=pw]", "1234"); await t11.click("#banner .codeform .btn"); await t11.waitForTimeout(1500);
  await adm.click("#tabAdmin"); await adm.waitForTimeout(600); await adm.click("#schoolPanel button >> text=승인"); await t11.waitForTimeout(2500);
  await adm.click("#tabClass"); await adm.waitForTimeout(200);
  const g11 = await gateTitle(t11);
  await t11.context().close();
  const t12 = await who({ email: "stranger@x.com" });
  await t12.click("#banner .choice >> text=선생님입니다"); await t12.click("#banner button >> text=구글로 들어가기"); await t12.waitForTimeout(2000);
  check("구글로 가입·승인되면 다른 컴퓨터에서 구글로 바로(링크·코드 없이)", [g11, await gateTitle(t12), /3반/.test(await t12.innerText("#whoChip"))], ["", "", true]);
  await t12.context().close();
  await t2.click("#tabAll"); await t2.waitForTimeout(500);
  check("담임은 다른 반(5반) 학생이 안 보임", /박예시/.test(await t2.innerText("#viewAll")), false);
  await adm.click("#tabAll"); await adm.waitForTimeout(500);
  check("관리자는 모든 반", /2반[\s\S]*5반/.test(await adm.innerText("#classTable")), true);
  await t2.click("#allTabs button >> text=고사 시간표"); await t2.waitForTimeout(200);
  await t2.click("#examTable button >> text=넣기"); await t2.fill("#examTable input[name=time]", "09:30"); await t2.fill("#examTable input[name=place]", "인문관");
  await t2.click("#examTable button >> text=저장"); await adm.waitForTimeout(2500);
  await adm.click("#allTabs button >> text=고사 시간표"); await adm.waitForTimeout(300);
  const ex = await adm.$eval("#examTable tbody", (e) => e.innerText.replace(/\s+/g, " "));
  check("학교 장부: 2반 담임이 넣은 고사 시각이 5반 학생에게도(관리자 화면)", [/09:30 · 인문관/.test(ex), /외 1명/.test(ex), /박담임 입력/.test(ex), /김예시|30201|인문관/.test(JSON.stringify(KV))], [true, true, true, false]);
  await adm.click("#allTabs button >> text=한눈에"); await t2.click("#allTabs button >> text=한눈에");
  await t2.click("#tabClass"); await t2.click(".row >> nth=0 >> .rowhead"); await t2.waitForTimeout(200);
  const ti = await t2.evaluate(() => [...document.querySelectorAll(".detail select")].findIndex((x) => [...x.options].some((o) => o.value === "최초합")));
  await (await t2.$$(".detail select"))[ti].selectOption("최초합"); await adm.waitForTimeout(2500);
  await adm.click("#tabClass"); await adm.waitForTimeout(300);
  check("담임이 고친 결과가 관리자 화면에 실시간", await adm.evaluate(() => document.querySelector(".row .pills").textContent.includes("최초합")), true);
  await adm.click(".row >> nth=0 >> .rowhead"); await adm.waitForTimeout(200);
  await adm.click(".detail .dtab >> text=상담 기록"); await adm.waitForTimeout(150); await adm.fill(".detail textarea[name=note]", "학교 장부 상담"); await adm.click(".detail .btn >> text=기록 추가"); await t2.waitForTimeout(2500);
  check("학교 장부: 상담 기록도 저장되어 담임 화면에 보임", await t2.evaluate(() => { const c = document.querySelector(".row .cnote"); return c && c.textContent; }), "상담 1");
  await adm.click(".row >> nth=0 >> .rowhead"); await adm.waitForTimeout(100);
  const bb1 = await adm.$eval("#backupBar", (b) => [!b.hidden, b.classList.contains("due"), /학교 장부 전체 백업/.test(b.textContent)]);
  await adm.click("#backupBar button >> text=전체 백업 받기"); await adm.waitForTimeout(300);
  check("관리자 백업 알림: 처음엔 주황 경고, 받으면 알림 줄은 사라지고 학교 관리 탭에 날짜", [bb1, await adm.$eval("#backupBar", (b) => b.hidden), await adm.$eval("#schoolPanel", (e) => /마지막 전체 백업\(이 컴퓨터\): (?!없음)/.test(e.textContent))], [[true, true, true], true, true]);
  check("담임에게는 백업 알림 없음(자료는 학교 장부에)", await t2.$eval("#backupBar", (b) => b.hidden), true);
  check("학교 장부: 반별 현황에서 백업·되살리기·합치기 단추 감춤(학교 관리 탭으로)", await t2.evaluate(() => ["btnBackup", "btnRestore", "btnMerge"].map((i) => document.getElementById(i).hidden)), [true, true, true]);
  const other = await who({ email: "other@x.com", school: "다른고" });
  await other.makeSchool(); await other.waitForTimeout(500);
  check("다른 학교는 서로 안 보임", [Object.keys(KV).filter((k) => /^schools\/[0-9a-f]{40}$/.test(k)).length, (await rowNames(other)).includes("김예시")], [2, false]);
  const otherSid = Object.keys(KV).find((k) => /^schools\/[0-9a-f]{40}$/.test(k) && KV[k].name === "다른고").split("/")[1];
  await other.click("#tabAdmin"); await other.waitForTimeout(400);
  await other.click("#schoolPanel button >> text=이 학교 지우기"); await other.fill("#schoolPanel input[name=delname]", "다른");
  const offWhenWrong = await other.$eval("#schoolPanel .btn.del", (b) => b.disabled);
  await other.fill("#schoolPanel input[name=delname]", "다른고"); await other.click("#schoolPanel .btn.del"); await other.waitForTimeout(2500);
  check("학교 지우기: 이름을 그대로 쳐야 지워지고, 학교의 모든 문서가 사라짐", [offWhenWrong, Object.keys(KV).filter((k) => k.includes(otherSid)).length, /지웠습니다/.test(await other.innerText("#banner"))], [true, 0, true]);
  check("학교 지우기: 다른 학교는 그대로", Object.keys(KV).some((k) => /^schools\/[0-9a-f]{40}$/.test(k) && KV[k].name !== "다른고"), true);
  const adm2 = await who({ email: "admin@x.com" });
  await adm2.click("#banner .choice >> text=관리자입니다"); await adm2.click("#banner .btn >> text=구글로 로그인"); await adm2.waitForTimeout(300);
  const codeHidden = await adm2.$eval("#banner input[name=code]", (e) => e.hidden);
  await adm2.click("#banner .linkbtn >> text=학교 코드로 열기"); await adm2.fill("#banner input[name=code]", firstCode); await adm2.click("#banner .btn >> text=들어가기"); await adm2.waitForTimeout(1500);
  check("관리자 다른 컴퓨터: 코드 칸은 접혀 있다가 펼쳐 열기", [codeHidden, await gateTitle(adm2), /관리자/.test(await adm2.innerText("#whoChip"))], [true, "", true]);
  await adm2.context().close();
  const adm3 = await who({ email: "admin@x.com" });
  await adm3.click("#banner .choice >> text=관리자입니다"); await adm3.click("#banner .btn >> text=구글로 로그인"); await adm3.waitForTimeout(800);
  await adm3.click("#banner .btn >> text=열기 →"); await adm3.waitForTimeout(1500);
  check("빠른 열기: 새 컴퓨터에서 구글 로그인만으로 내 학교", [await gateTitle(adm3), /관리자/.test(await adm3.innerText("#whoChip"))], ["", true]);
  await adm3.context().close();
  const nob = await who({ email: "nobody@x.com" });
  await nob.click("#banner .choice >> text=관리자입니다"); await nob.click("#banner .btn >> text=구글로 로그인"); await nob.waitForTimeout(800);
  check("빠른 열기: 관리자가 아니면 목록이 안 보임", await nob.evaluate(() => !document.querySelector("#banner .btn") || ![...document.querySelectorAll("#banner .btn")].some((b) => /열기 →/.test(b.textContent))), true);
  await nob.context().close();
  const multi = await who({ email: "multi@x.com", school: "가고" });
  await multi.makeSchool(); await multi.click("#tabAdmin"); await multi.waitForTimeout(300); await multi.check("#schoolPanel input[name=quick]"); await multi.waitForTimeout(400);
  await multi.click("#whoChip button >> text=나가기"); await multi.waitForTimeout(1500);
  await multi.click("#banner .choice >> text=관리자입니다"); await multi.click("#banner .btn >> text=구글로 로그인"); await multi.waitForTimeout(300);
  await multi.fill("#banner input[name=school]", "나고"); await multi.fill("#banner input[name=joinpw]", "1234"); await multi.click("#banner .btn >> text=학교 만들기"); await multi.waitForTimeout(3500);
  await multi.click("#banner .btn >> text=들어가기"); await multi.waitForTimeout(1500);
  await multi.click("#tabAdmin"); await multi.waitForTimeout(300); await multi.check("#schoolPanel input[name=quick]"); await multi.waitForTimeout(400);
  await multi.reload(); await multi.waitForTimeout(1500);
  const swOpts = await multi.evaluate(() => { const s = document.querySelector("#whoChip select.schoolsw"); return s ? [...s.options].map((o) => o.textContent) : null; });
  if (swOpts) { await multi.selectOption("#whoChip select.schoolsw", { label: "가고" }); await multi.waitForTimeout(1500); }
  check("관리자 학교 바꾸기: 빠른 열기 학교끼리 위쪽에서 바로 옮김", [swOpts, await multi.evaluate(() => { const s = document.querySelector("#whoChip select.schoolsw"); return s && s.options[0].textContent; })], [["나고 · 관리자", "가고", "다른 학교 코드로…"], "가고 · 관리자"]);
  await multi.click("#whoChip button >> text=나가기"); await multi.waitForTimeout(1500);
  await multi.click("#banner .choice >> text=관리자입니다"); await multi.click("#banner .btn >> text=구글로 로그인"); await multi.waitForTimeout(900);
  const before = await multi.$$eval("#banner .myschool .msn", (e) => e.map((x) => x.textContent));
  const gaSid = Object.keys(KV).find((k) => /^schools\/[0-9a-f]{40}$/.test(k) && KV[k].name === "가고").split("/")[1];
  await multi.click("#banner .myschool:has-text('가고') .msdel"); await multi.waitForTimeout(2500);
  const after = await multi.$$eval("#banner .myschool .msn", (e) => e.map((x) => x.textContent));
  check("내 학교: 첫 화면에서 학교마다 지우기(확인 한 번), 그 학교 문서가 모두 사라짐", [before, after, Object.keys(KV).filter((k) => k.includes(gaSid)).length], [["가고", "나고"], ["나고"], 0]);
  await multi.context().close();
  await adm.click("#tabAdmin"); await adm.waitForTimeout(300); await adm.check("#schoolPanel input[name=pwoff]"); await adm.waitForTimeout(600);
  const pwOffSaved = Object.keys(KV).some((k) => /^schools\/[0-9a-f]{40}$/.test(k) && KV[k].pwOff === true && KV[k].admins.includes("admin@x.com"));
  const t6 = await who({ hash: "#join=" + firstCode }); await t6.waitForTimeout(1200);
  const pwHidden = await t6.$eval("#banner input[name=pw]", (e) => e.hidden);
  await t6.fill("#banner input[name=name]", "최담임"); await t6.selectOption("#banner select[name=cls]", "5"); await t6.click("#banner .codeform .btn"); await t6.waitForTimeout(1500);
  check("가입 암호 없이 승인만으로: 초대 링크에 암호 칸이 없고 이름·반만으로 승인 대기", [pwOffSaved, pwHidden, await gateTitle(t6)], [true, true, "관리자 승인을 기다리는 중입니다"]);
  const t9 = await who({}); await t9.click("#banner .choice >> text=선생님입니다"); await t9.fill("#banner input[name=code]", "https://jinhak-board.vercel.app/#join=" + firstCode);
  check("코드 칸에 초대 링크를 통째로 붙여넣어도 코드만", await t9.$eval("#banner input[name=code]", (e) => e.value), firstCode);
  await t9.context().close();
  const t8 = await who({}); await t8.click("#banner .choice >> text=선생님입니다"); const pwFirst = await t8.$eval("#banner input[name=pw]", (e) => e.hidden);
  check("코드를 넣기 전에는 가입 암호 칸을 숨김", pwFirst, true);
  await t8.fill("#banner input[name=code]", firstCode.toLowerCase()); await t8.waitForTimeout(1200);
  check("코드를 쳐도 가입 암호를 끈 학교면 암호 칸이 사라짐", await t8.$eval("#banner input[name=pw]", (e) => e.hidden), true);
  await t8.context().close();
  await adm.uncheck("#schoolPanel input[name=pwoff]"); await adm.waitForTimeout(600);
  const t7 = await who({ hash: "#join=" + firstCode }); await t7.waitForTimeout(1200);
  await t7.fill("#banner input[name=name]", "한담임"); await t7.selectOption("#banner select[name=cls]", "6"); await t7.click("#banner .codeform .btn"); await t7.waitForTimeout(1500);
  check("가입 암호 다시 켜면 암호 없이는 가입 요청이 안 됨", /가입 암호를 넣어 주세요/.test(await t7.innerText("#banner")), true);
  await t6.context().close(); await t7.context().close();
  const wrong = await who({});
  await join(wrong, "AAAA-BBBB-CCCC-DDDD", "누구", 1);
  check("틀린 코드: 학교 없음", /이 코드의 학교가 없습니다/.test(await wrong.innerText("#banner")), true);
  check("위쪽에 누가 로그인했는지(역할·이름·학교)", [await adm.$eval("#whoChip .wrole", (e) => e.textContent), await t2.$eval("#whoChip .wrole", (e) => e.textContent), /박담임/.test(await t2.$eval("#whoChip .wname", (e) => e.textContent))], ["관리자", "2반 담임", true]);
  check("담임에게는 학교 관리 탭이 없음", await t2.$eval("#tabAdmin", (e) => e.hidden), true);
  await adm.click("#tabAdmin"); await adm.waitForTimeout(500);
  await adm.click("#schoolPanel button >> text=빼기"); await t2.waitForTimeout(2500);
  check("관리자가 빼면 담임 화면이 막힘", [await gateTitle(t2), (await rowNames(t2)).includes("김예시")], ["진학 현황판", false]);
  await adm.click("#whoChip button >> text=나가기"); await adm.waitForTimeout(1500);
  check("나가기: 관리자도 코드 잊고 로그아웃해 시작 화면으로", [await gateTitle(adm), await adm.evaluate(() => localStorage.getItem("jh.code"))], ["진학 현황판", null]);
  await adm.reload(); await adm.waitForTimeout(1000);
  check("나가기: 다시 열어도 시작 화면", await gateTitle(adm), "진학 현황판");
  const solo = await who({});
  await solo.click("#banner .choice >> text=혼자 쓰기"); await solo.waitForTimeout(500);
  check("혼자 쓰기: 이 브라우저 저장으로 바로", [await solo.$eval("#whoChip", (e) => !e.hidden && /혼자 쓰기/.test(e.textContent)), await solo.$eval("#addPanel", (e) => !e.hidden)], [true, true]);
  await solo.reload(); await solo.waitForTimeout(800);
  check("혼자 쓰기: 다시 열어도 코드 화면 없이", [await gateTitle(solo) === "진학 현황판", /혼자 쓰기/.test(await solo.innerText("#whoChip"))], [false, true]);
  await solo.click("#whoChip button >> text=학교 장부로"); await solo.waitForTimeout(900);
  check("혼자 쓰기 → 학교 장부로: 첫 화면", await gateTitle(solo), "진학 현황판");
  await solo.click("#banner .choice >> text=혼자 쓰기"); await solo.waitForTimeout(500);
  await solo.click("#brandHome"); await solo.waitForTimeout(800);
  check("혼자 쓰기: 제목은 우리 반 맨 위(시작 화면으로 안 감)", [await gateTitle(solo), /혼자 쓰기/.test(await solo.innerText("#whoChip")), await solo.evaluate(() => !!document.getElementById("btnHome"))], ["", true, false]);
  for (const x of [adm, t2, other, wrong, solo]) await x.context().close();
  srv.close();

  /* 수능 다음 날(11/20) 아침: 맨 위 알림 → 엑셀 표(머리줄·학번·이름·순서 섞임) 붙여넣기 → 응시 판단 */
  console.log("\n[수능 다음 날 가채점 넣기]");
  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    await x.clock.install({ time: new Date("2026-11-20T08:30:00+09:00") });
    const A = (no, name, mreq) => ({ id: no, cls: 2, no, name, apps: [{ id: "a" + no, kind: "수시", univ: "부산대학교", major: "경영학과", type: "논술", itv: "2026-11-21", status: "지원완료", c6: true, mmet: "미정", mreq }] });
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
      localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mycls", "2"); localStorage.setItem("jh.mode", "local"); },
      [A("30201", "가나", "국수영탐 중 2개합 5"), A("30202", "다라", "국수영탐 중 2개합 5"), A("30203", "마바", "")]);
    await x.goto("file://" + page404); await x.waitForTimeout(600);
    const nudge = await x.$eval("#csatNudge", (e) => !e.hidden && e.textContent);
    check("수능 뒤 맨 위 알림: 최저 있는 고사 2건, 등급 없는 학생 2명", /면접·논술·실기 2건.*학생 2명: 가나, 다라/.test(nudge || ""), true);
    await x.click("#csatNudge button"); await x.waitForTimeout(200);
    await x.evaluate((t) => { const i = document.querySelector("#csatPanel input.g"); const dt = new DataTransfer(); dt.setData("text", t);
      i.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); },
      ["학번\t이름\t국어\t수학\t영어\t탐구1\t탐구2\t한국사", "30202\t다라\t5\t5\t5\t5\t5\t5", "30201\t가나\t2\t2\t3\t\t4\t결시", "30299\t없는학생\t1\t1\t1\t1\t1\t1"].join("\r\n"));
    await x.waitForTimeout(300);
    const r = await x.evaluate(() => ({ msg: document.querySelector("#csatPanel .acnog").textContent, g: window.__dev.students().map((s) => [s.no, s.csat]), nudge: !document.getElementById("csatNudge").hidden }));
    const gOf = (no) => (r.g.find((y) => y[0] === no) || [])[1] || {};
    check("붙여넣기: 머리줄 건너뛰고 학번으로 맞춤(순서 섞여도), 빈칸은 자리 지킴", [gOf("30201").kor, gOf("30201").inq1, gOf("30201").inq2, gOf("30201").his, gOf("30202").kor, gOf("30203").kor, gOf("30201").src], ["2", undefined, "4", undefined, "5", undefined, "가채점"]);
    check("붙여넣기 안내: 넣은 학생·못 찾은 줄·잘못된 칸", /학생 2명.*학번·이름으로 맞춤.*못 찾은 줄 1개: 30299 없는학생.*(1~9가 아닌|알아보지 못한) 칸 1개/.test(r.msg), true);
    check("등급을 다 넣으면 맨 위 알림이 사라짐", r.nudge, false);
    await c.close();
  }
  /* 성적 통지 날(12/11): 가채점 학생 알림 → 학교 성적 엑셀(두 줄 머리, 과목마다 선택·표점·백분위·등급) 통째로 붙여넣기 */
  console.log("\n[성적 통지 날 성적표 넣기]");
  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e))); x.on("dialog", (d) => d.dismiss());
    await x.clock.install({ time: new Date("2026-12-11T10:00:00+09:00") });
    const G = { kor: "3", math: "3", eng: "4", inq1: "4", inq2: "4", his: "4", src: "가채점" };
    const A = (no, name) => ({ id: no, cls: 2, no, name, csat: { ...G }, apps: [{ id: "a" + no, kind: "수시", univ: "부산대학교", major: "경영학과", type: "교과", ann: "2026-12-12", status: "지원완료", c6: true, mmet: "미충족", mreq: "국수영탐(1과목) 중 2개합 5" }] });
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
      localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mycls", "2"); localStorage.setItem("jh.mode", "local"); },
      [A("30201", "가나"), A("30202", "다라")]);
    await x.goto("file://" + page404); await x.waitForTimeout(600);
    const nudge = await x.$eval("#csatNudge", (e) => !e.hidden && e.textContent);
    check("성적 통지 날 맨 위 알림: 아직 가채점인 학생", /성적표가 나왔습니다.*2명: 가나, 다라/.test(nudge || ""), true);
    await x.click("#csatNudge button"); await x.waitForTimeout(200);
    const seg = await x.$$eval("#csatPanel .seg button", (b) => b.filter((y) => y.getAttribute("aria-pressed") === "true").map((y) => y.textContent));
    check("성적 통지 날엔 '성적표'가 기본", seg, ["등급(수시 최저)", "성적표"]);
    await x.click("#csatPanel button:has-text('표준점수')"); await x.waitForTimeout(200);
    const paste = (t) => x.evaluate((t) => { const i = document.querySelector("#csatPanel input.g"); const dt = new DataTransfer(); dt.setData("text", t);
      i.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, t);
    await paste(["번호	성명	국어				수학				영어	한국사	탐구1				탐구2			",
      "		선택	표준점수	백분위	등급	선택	표준점수	백분위	등급	등급	등급	과목	표준점수	백분위	등급	과목	표준점수	백분위	등급",
      "30202	다라	화작	124	82	3	확률과 통계	131	91	2	2	4	생활과 윤리	67	95	2	사회·문화	62	85	3",
      "30201	가나	언매	131	92	2	미적분	128	88	3	2	3	물리학Ⅰ	64	88	결시	화학Ⅰ	66	93	2"].join("\r\n"));
    await x.waitForTimeout(300);
    const r = await x.evaluate(() => ({ msg: document.querySelector("#csatPanel .acnog").textContent, s: window.__dev.students(), nudge: !document.getElementById("csatNudge").hidden }));
    const S = (no) => r.s.find((y) => y.no === no);
    const a = S("30201").csat, b = S("30202").csat;
    check("성적표 통째로: 두 줄 머리 읽고 학번으로 맞춤(등급·표점·백분위·선택과목)", [a.kor, a.korS, a.korP, a.math, a.mathS, a.mathSel, a.eng, a.his, a.inq1S, a.inq1t, a.inq2, a.inq2t, a.src, b.mathSel, b.inq1t, b.inq2t, b.mathP],
      ["2", "131", "92", "3", "128", "미적", "2", "3", "64", "과", "2", "과", "성적표", "확통", "사", "사", "91"]);
    check("성적표 통째로: 결시 칸은 넣지 않고 가채점 등급 그대로, 알림", [a.inq1, /학생 2명.*등급·표준점수·백분위·선택과목.*알아보지 못한 칸 1개/.test(r.msg)], ["4", true]);
    check("성적표로 최저 다시 판정, 맨 위 알림 사라짐", [S("30201").apps[0].mmet, S("30202").apps[0].mmet, r.nudge], ["충족", "충족", false]);
    // 머리줄 없이 학번·이름 + 8칸, 순서 섞임
    await paste(["30202	다라	120	80	130	90	60	84	61	83", "30201	가나	130	91	127	87	63	87	65	92"].join("\n"));
    await x.waitForTimeout(300);
    const r2 = await x.evaluate(() => window.__dev.students().map((y) => [y.no, y.csat.korS, y.csat.inq2P]));
    check("표준점수 붙여넣기: 머리줄 없어도 학번으로 맞춤", r2.sort(), [["30201", "130", "92"], ["30202", "120", "83"]]);
    await c.close();
  }
  /* 12월 수시 발표·충원·등록: 발표일·충원 마감을 안 넣은 지원도 마감이 지나면 잡고, 등록 뒤 충원 합격은 옮길지 묻는다 */
  console.log("\n[수시 발표·충원·등록 기간]");
  {
    const A = (o) => Object.assign({ kind: "수시", status: "지원완료", c6: true, mmet: "미정" }, o);
    const seed = [
      { id: "30201", cls: 2, no: "30201", name: "가나", apps: [A({ id: "a1", univ: "부경대학교", major: "전자공학과" }), A({ id: "a2", univ: "부산대학교", major: "경영학과", status: "충원대기", rank: "12" })] },
      { id: "30202", cls: 2, no: "30202", name: "다라", apps: [A({ id: "b1", univ: "부산대학교", major: "수학교육과", status: "충원합" }), A({ id: "b2", univ: "동아대학교", major: "수학과", status: "등록완료" })] },
      { id: "30203", cls: 2, no: "30203", name: "마바", apps: [A({ id: "c1", univ: "동아대학교", major: "기계공학과", status: "최초합" })] },
    ];
    const at = async (when) => {
      const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e))); x.on("dialog", (d) => d.accept());
      await x.clock.install({ time: new Date(when) });
      await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
        localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mycls", "2"); localStorage.setItem("jh.mode", "local"); }, seed);
      await x.goto("file://" + page404); await x.waitForTimeout(500);
      const r = await x.evaluate(() => { const d = window.__dev, S = d.students();
        return { codes: S.map((s) => d.checkStudent(s).map((w) => w.code)), pend: d.pending(S).map((e) => e.s.no + ":" + e.kind), reg: S.map((s) => d.regInfo(s).state) }; });
      return { c, x, r };
    };
    let t = await at("2026-12-14T09:00:00+09:00");
    check("12/14: 발표일 없는 지원은 아직 안 잡음, 충원 마감 없는 충원 대기는 알림", [t.r.codes[0], t.r.pend], [["충원 마감 미입력"], []]);
    await t.c.close();
    t = await at("2026-12-19T09:00:00+09:00");
    check("12/19: 수시 발표 마감이 지났는데 발표일 없이 지원완료면 결과 입력할 것", [t.r.codes[0].includes("결과 미입력"), t.r.pend], [true, ["30201:annx"]]);
    check("등록했는데 충원 합격: 옮길지 정하기 + 경고", [t.r.reg[1], t.r.codes[1]], ["move", ["충원 합격"]]);
    await t.x.click("#reg button:has-text('여기로 옮기기')"); await t.x.waitForTimeout(300);
    const moved = await t.x.evaluate(() => window.__dev.students().find((s) => s.no === "30202").apps.map((a) => a.univ + ":" + a.status));
    check("여기로 옮기기: 새 곳 등록완료, 원래 곳 등록포기(이중등록 없음)", moved, ["부산대학교:등록완료", "동아대학교:등록포기"]);
    await t.c.close();
    t = await at("2026-12-30T09:00:00+09:00");
    check("12/30: 충원 통보 마감 지난 충원 대기·등록 마감 지난 미정은 확인 요청", [t.r.pend.includes("30201:due"), t.r.codes[2], t.r.reg[1]], [true, ["등록 확인"], "move"]);   // 12/30은 충원 등록 마감 당일이라 아직 옮길지 정할 수 있다
    await t.c.close();
  }
  console.log("\n[화면 정리]");
  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    await x.addInitScript(() => localStorage.setItem("jh.cls", "2"));
    await x.goto("file://" + page404); await x.waitForTimeout(500);
    const shown = (id) => x.$eval("#" + id, (e) => getComputedStyle(e).display !== "none");
    const g0 = await shown("glance");
    await x.click("#btnView"); await x.uncheck("#viewPanel input[name=view-glance]"); await x.waitForTimeout(100);
    const g1 = await shown("glance");
    await x.reload(); await x.waitForTimeout(500);
    check("보기 설정: 칸 숨기기, 다시 열어도 기억", [g0, g1, await shown("glance")], [true, false, false]);
    const menu = await x.evaluate(() => { const d = document.querySelector(".tmenu"); return [!d.open, ["btnClassFile", "btnCsv", "btnPrint"].every((id) => d.contains(document.getElementById(id)))]; });
    await x.click(".tmenu > summary"); const opened = await x.$eval(".tmenu", (d) => d.open);
    await x.click("#listTitle"); const closed = await x.$eval(".tmenu", (d) => !d.open);
    check("받기·인쇄 메뉴: 단추를 한 메뉴에, 바깥 누르면 닫힘", [menu, opened, closed], [[true, true], true, true]);
    await c.close();
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const y = await m.newPage(); y.on("pageerror", (e) => errors.push(String(e)));
    await y.addInitScript(() => localStorage.setItem("jh.cls", "2"));
    await y.goto("file://" + page404); await y.waitForTimeout(500);
    check("휴대폰: 처음엔 숫자 요약·한눈에 보기·일정 목록을 숨김", await y.evaluate(() => ["stats", "glance", "sched"].map((id) => getComputedStyle(document.getElementById(id)).display === "none")), [true, true, true]);
    await m.close();
  }
  console.log("\n[결과 한꺼번에 · 오늘 할 일]");
  {
    const c = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const x = await c.newPage(); x.on("pageerror", (e) => errors.push(String(e)));
    await x.clock.install({ time: new Date("2026-11-24T08:30:00+09:00") });
    const A = (id, u, st, ann, itv) => ({ id, kind: "수시", univ: u, major: "경영학과", type: "학종", status: st, ann: ann || "", itv: itv || "", c6: true });
    await x.addInitScript((s) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1");
      localStorage.setItem("jh.local.students", JSON.stringify(s)); localStorage.setItem("jh.cls", "2"); localStorage.setItem("jh.mode", "local"); }, [
      { id: "s1", cls: 2, no: "30201", name: "가나", apps: [A("a1", "부산대학교", "면접완료", "2026-11-24"), A("a2", "경북대학교", "1단계합", "2026-12-10", "2026-11-25")] },
      { id: "s2", cls: 2, no: "30202", name: "다라", apps: [A("b1", "부산대학교(부산)", "지원완료", "2026-11-24"), A("b2", "동아대학교", "최초합")] },
      { id: "s3", cls: 2, no: "30203", name: "마바", apps: [A("c1", "부경대학교", "지원완료", "2026-11-30")] }]);
    await x.goto("file://" + page404); await x.waitForTimeout(600);
    const td = await x.evaluate(() => { const h = document.getElementById("today"); const cols = [...h.querySelectorAll(".tcol")].map((c) => c.innerText); return [!h.hidden, cols[0], cols[1]]; });
    check("오늘 할 일: 오늘 발표 2건, 내일 면접", [td[0], /발표[\s\S]*가나[\s\S]*발표[\s\S]*다라/.test(td[1]), /면접·고사[\s\S]*가나[\s\S]*경북대/.test(td[2])], [true, true, true]);
    await x.click("#btnBulkRes"); await x.waitForTimeout(200);
    const pick = await x.$eval("#bulkPanel select.bulkpick", (s) => [s.value, s.options[s.selectedIndex].textContent]);
    const names = await x.$$eval("#bulkPanel .bulkrow .who", (b) => b.map((e) => e.textContent));
    check("결과 한꺼번에: 기다리는 대학 먼저, 캠퍼스 표기 달라도 같은 대학으로", [/부산대 — 결과 기다림 2 \/ 2건/.test(pick[1]), names], [true, ["30201 가나", "30202 다라"]]);
    await x.selectOption("#bulkPanel .bulkrow >> nth=0 >> select", "최초합"); await x.waitForTimeout(150);
    await x.selectOption("#bulkPanel .bulkrow >> nth=1 >> select", "충원대기"); await x.waitForTimeout(150);
    await x.fill("#bulkPanel .bulkrow >> nth=1 >> input", "7"); await x.press("#bulkPanel .bulkrow >> nth=1 >> input", "Tab"); await x.waitForTimeout(150);
    const saved = await x.evaluate(() => window.__dev.students().map((s) => s.apps[0].status + (s.apps[0].rank ? ":" + s.apps[0].rank : "")));
    check("결과 한꺼번에: 고르면 바로 저장, 충원대기는 예비 번호", saved, ["최초합", "충원대기:7", "지원완료"]);
    await x.click("#bulkPanel .seg button >> text=발표일별"); await x.waitForTimeout(150);
    const dpick = await x.$eval("#bulkPanel select.bulkpick", (s) => s.options[s.selectedIndex].textContent);
    check("결과 한꺼번에(발표일별): 오늘과 가까운 발표일을 먼저", /^11\/30\(월\) 발표|^11\/24\(화\) 발표/.test(dpick), true);
    await c.close();
  }
  check("자바스크립트 오류 없음", errors, []);
  await browser.close();
  fs.unlinkSync(page404);

  console.log("\n" + (fail ? "✗ " + fail + "개 실패 / " : "✓ 모두 통과 — ") + pass + "개 통과");
  process.exit(fail ? 1 : 0);
})();
