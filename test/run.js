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
  async function importFile(file) {
    await p.locator("#stFile").click();
    await p.locator("#file").setInputFiles(file);
    await p.waitForTimeout(900);
    const shown = await p.locator("#preview").isVisible();
    if (!shown) return { ok: false, err: (await p.locator("#importMsg").textContent()).trim() };
    const rows = await p.$$eval(".pvbody tbody tr", (trs) =>
      trs.map((tr) => Array.from(tr.cells).map((td) => td.textContent.trim())));
    await p.locator(".pvhead .btn").click();
    await p.waitForTimeout(500);
    return { ok: true, rows: rows };
  }
  let r = await importFile(FIX("roster_euckr.csv"));
  check("CSV(EUC-KR) 한글 안 깨짐", r.ok && r.rows.length, 4);
  check("CSV 첫 줄", r.rows && r.rows[0].slice(0, 2), ["30201", "김민수"]);

  r = await importFile(FIX("roster.xlsx"));
  check("엑셀 학년/반/번호 → 학번 생성", r.ok && r.rows[0][0], "30201");
  check("엑셀 두 자리 번호", r.ok && r.rows[3][0], "30212");

  r = await importFile(FIX("roster.hwpx"));
  check("한글(.hwpx) 표에서 읽기", r.ok && r.rows.length, 3);

  fs.writeFileSync(path.join(ROOT, ".fake.hwp"), "\xd0\xcf\x11\xe0");
  r = await importFile(path.join(ROOT, ".fake.hwp"));
  check("구형 .hwp 는 거절하고 안내", r.ok, false);
  check("안내에 hwpx 저장법 포함", /hwpx/.test(r.err || ""), true);
  fs.unlinkSync(path.join(ROOT, ".fake.hwp"));

  /* ── 5. 지원 현황 읽기 ─────────────────────── */
  console.log("\n[지원 현황 읽기]");
  await p.locator("#file").setInputFiles(FIX("apps_messy.csv"));
  await p.waitForTimeout(900);
  const head = await p.locator(".pvhead .t").textContent();
  check("열 이름이 달라도 지원 현황으로 알아봄", /지원 5건/.test(head), true);
  const cells = (await p.$$eval(".pvbody tbody tr", (trs) =>
    trs.map((tr) => Array.from(tr.cells).map((td) => td.textContent.trim()).join(" | "))));
  check("‘추합’ → 충원합", /충원합/.test(cells[2]), true);
  check("‘탈락’ → 불합격", /불합격/.test(cells[3]), true);
  check("못 알아본 상태는 원문을 같이 보여줌", /붙음\?/.test(cells[4]), true);
  await p.locator(".pvhead .btn").click();
  await p.waitForTimeout(600);

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
      jungsi: c(mk([{ kind: "수시", univ: "A", status: "최초합" }, { kind: "정시", univ: "B", status: "지원완료" }])).map((w) => w.code),
      dual: c(mk([{ kind: "수시", univ: "A", status: "등록완료" }, { kind: "수시", univ: "B", status: "등록완료" }])).map((w) => w.code),
      due: c(mk([{ kind: "수시", univ: "A", status: "충원대기", due: iso }])).map((w) => w.code),
      minreq: c(mk([{ kind: "수시", univ: "A", status: "지원완료", mmet: "미충족" }])).map((w) => w.code),
      clean: c(mk([{ kind: "수시", univ: "A", status: "지원완료", c6: true, mmet: "충족" }])).map((w) => w.code),
    };
  });
  check("① 6장 초과", rules.six, ["6장초과"]);
  check("② 면접일 중복", rules.itv, ["면접중복"]);
  check("③ 수시 합격자의 정시 지원", rules.jungsi, ["정시지원불가"]);
  check("④ 이중등록", rules.dual, ["이중등록"]);
  check("⑤ 충원 마감 임박", rules.due, ["충원마감"]);
  check("⑥ 수능최저 미충족", rules.minreq, ["최저 미충족"]);
  check("문제 없는 학생은 경고 없음", rules.clean, []);

  check("자바스크립트 오류 없음", errors, []);
  await browser.close();
  fs.unlinkSync(page404);

  console.log("\n" + (fail ? "✗ " + fail + "개 실패 / " : "✓ 모두 통과 — ") + pass + "개 통과");
  process.exit(fail ? 1 : 0);
})();
