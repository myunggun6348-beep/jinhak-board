// 진학 현황판 서비스 워커: 늘 인터넷의 최신 화면을 먼저 쓰고, 끊겼을 때만 마지막으로 받아 둔 것을 보여 준다.
// 학생 자료는 여기 담지 않는다(학교 장부는 Firebase 가 암호문으로 따로 보관한다).
var C = "jinhak-v1";
var CDN = /^https:\/\/(cdnjs\.cloudflare\.com|www\.gstatic\.com\/firebasejs|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(["/", "/guide.html", "/manifest.webmanifest", "/icons/icon-192.png"]); }).catch(function () {}));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var same = new URL(r.url).origin === self.location.origin;
  if (!same && !CDN.test(r.url)) return;
  var key = same && r.mode === "navigate" ? new Request(new URL(r.url).pathname) : r;
  e.respondWith(fetch(r).then(function (res) {
    if (res.ok || res.type === "opaque") { var cp = res.clone(); caches.open(C).then(function (c) { c.put(key, cp); }); }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (m) { return m || (r.mode === "navigate" ? caches.match("/") : undefined); });
  }));
});
