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
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
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
  /* 파일을 넣으면 확인 단계 없이 바로 들어간다. 읽은 결과는 __dev.last() 로, 안내는 #importMsg 로 본다. */
  async function importFile(file) {
    await p.locator("#stFile").click();
    await p.locator("#file").setInputFiles(file);
    await p.waitForTimeout(900);
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
  check("‘추합’ → 충원합", apps[2] && apps[2].app.status, "충원합");
  check("‘탈락’ → 불합격", apps[3] && apps[3].app.status, "불합격");
  check("못 알아본 상태는 원문을 안내에 같이 보여줌", /붙음?/.test(r.msg), true);

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
      itv: c(mk([{ kind: "수시", univ: "A", status: "1단계합", itv: "2026-11-28" }, { kind: "수시", univ: "B", status: "1단계합", itv: "2026-11-28" }])).map((w) => w.code),
      itvSameUniv: c(mk([{ kind: "수시", univ: "A", jh: "교과", status: "지원완료", itv: "2026-10-17" }, { kind: "수시", univ: "A", jh: "종합", status: "지원완료", itv: "2026-10-17" }])).map((w) => w.code),
      jungsi: c(mk([{ kind: "수시", univ: "A", status: "최초합" }, { kind: "정시", univ: "B", status: "지원완료" }])).map((w) => w.code),
      jungsiGaveUp: c(mk([{ kind: "수시", univ: "A", status: "등록포기" }, { kind: "정시", univ: "B", status: "지원완료" }])).map((w) => w.code),
      jungsiPass: c(mk([{ kind: "정시", univ: "A", group: "가", status: "최초합" }, { kind: "정시", univ: "B", group: "나", status: "지원완료" }])).map((w) => w.code),
      annPast: c(mk([{ kind: "수시", univ: "A", status: "면접완료", ann: "2020-01-01" }])).map((w) => w.code),
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
  check("④ 이중등록", rules.dual, ["이중등록"]);
  check("⑤ 충원 마감 임박", rules.due, ["충원마감"]);
  check("⑥ 수능최저 미충족", rules.minreq, ["최저 미충족"]);
  check("⑦ 발표일 지났는데 결과 미입력", rules.annPast, ["결과 미입력"]);
  check("⑦ 결과가 들어갔으면 경고 없음", rules.annDone, []);
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
  ];
  const judged = await p.evaluate((cs) => cs.map((c) => window.__dev.judgeMin(c[0], c[1]).res), minCasesJ);
  minCasesJ.forEach((c, i) => check("‘" + c[0] + "’", judged[i], c[2]));

  check("자바스크립트 오류 없음", errors, []);
  await browser.close();
  fs.unlinkSync(page404);

  console.log("\n" + (fail ? "✗ " + fail + "개 실패 / " : "✓ 모두 통과 — ") + pass + "개 통과");
  process.exit(fail ? 1 : 0);
})();
