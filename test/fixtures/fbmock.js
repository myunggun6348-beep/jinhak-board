// 테스트용 가짜 Firebase(Firestore 만). 문서는 localStorage("__fb")에 두어 같은 브라우저의
// 다른 창끼리 공유하고, storage 이벤트로 실시간 반영을 흉내 낸다. 규칙: rooms/{40자}/{students|minreq|meta}/{id}
window.__fbMock = (function () {
  var KEY = "__fb", listeners = [];
  var load = function () { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  var put = function (o) { localStorage.setItem(KEY, JSON.stringify(o)); setTimeout(emit); };
  var emit = function () { listeners.slice().forEach(function (l) { l(); }); };
  window.addEventListener("storage", function (e) { if (e.key === KEY) emit(); });
  var okPath = function (p) { var s = p.split("/"); return s[0] === "rooms" && s[1] && s[1].length === 40 && ["students", "minreq", "meta"].indexOf(s[2]) >= 0; };
  var deny = function () { return Promise.reject({ code: "permission-denied" }); };
  var S = {
    initializeFirestore: function () { return {}; },
    doc: function () { return { p: [].slice.call(arguments, 1).join("/") }; },
    collection: function () { return { p: [].slice.call(arguments, 1).join("/") }; },
    setDoc: function (r, v) {
      if (!okPath(r.p) || Object.keys(v).some(function (k) { return ["v", "iv", "c", "t"].indexOf(k) < 0; })) return deny();
      var o = load(); o[r.p] = JSON.parse(JSON.stringify(v)); put(o); return Promise.resolve();
    },
    deleteDoc: function (r) { if (!okPath(r.p)) return deny(); var o = load(); delete o[r.p]; put(o); return Promise.resolve(); },
    getDoc: function (r) { if (!okPath(r.p)) return deny(); var o = load(); return Promise.resolve({ exists: function () { return !!o[r.p]; }, data: function () { return o[r.p]; } }); },
    onSnapshot: function (q, opt, cb, err) {
      if (!okPath(q.p + "/x")) { setTimeout(function () { err && err({ code: "permission-denied" }); }); return function () {}; }
      var l = function () {
        var o = load(), docs = Object.keys(o).filter(function (k) { return k.indexOf(q.p + "/") === 0 && k.slice(q.p.length + 1).indexOf("/") < 0; });
        cb({ metadata: { fromCache: false, hasPendingWrites: false }, docs: docs.map(function (k) { return { id: k.split("/").pop(), data: function () { return o[k]; } }; }) });
      };
      listeners.push(l); setTimeout(l);
      return function () { var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
  };
  return { A: { initializeApp: function () { return {}; } }, S: S, dump: load };
})();
