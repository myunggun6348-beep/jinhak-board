// 설치 기능을 뺐다. 예전에 이 서비스 워커를 받은 브라우저에서 저장본을 지우고 스스로 물러난다.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); }));
});
