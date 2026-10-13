// 테스트용 가짜 Firebase: 메모리 저장, 허락 명단·관리자 규칙 흉내
window.__fbMock = (function () {
  var owner = "me@x.com";
  var store = { students: {}, minreq: {}, teachers: {}, allowed: {} }, listeners = [], authCb, user = null;
  var ok = function () { return user && (user.email === owner || store.allowed[user.email]); };
  var deny = function () { return Promise.reject({ code: "permission-denied" }); };
  var emit = function () { listeners.slice().forEach(function (l) { l(); }); };
  var S = {
    initializeFirestore: function () { return {}; },
    doc: function (fs, c, id) { return { c: c, id: id }; },
    collection: function (fs, c) { return { c: c }; },
    setDoc: function (r, v, opt) {
      if (r.c === "allowed" ? user.email !== owner : r.c === "teachers" ? !user || r.id !== user.uid : !ok()) return deny();
      store[r.c][r.id] = opt && opt.merge ? Object.assign({}, store[r.c][r.id], v) : JSON.parse(JSON.stringify(v));
      setTimeout(emit); return Promise.resolve();
    },
    deleteDoc: function (r) { if (r.c === "allowed" ? user.email !== owner : !ok()) return deny(); delete store[r.c][r.id]; setTimeout(emit); return Promise.resolve(); },
    getDoc: function (r) { if (!ok()) return deny(); return Promise.resolve({ exists: function () { return !!store[r.c][r.id]; }, data: function () { return store[r.c][r.id]; } }); },
    getDocs: function (q) {
      if (q.c === "allowed" && (!user || user.email !== owner)) return deny();
      return Promise.resolve({ docs: Object.keys(store[q.c]).map(function (id) { return { id: id, data: function () { return store[q.c][id]; } }; }) });
    },
    onSnapshot: function (q, opt, cb, err) {
      var l = function () {
        if (!ok()) { var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); if (err) err({ code: "permission-denied" }); return; }
        cb({ metadata: { fromCache: false, hasPendingWrites: false }, docs: Object.keys(store[q.c]).map(function (id) { return { id: id, data: function () { return JSON.parse(JSON.stringify(store[q.c][id])); } }; }) });
      };
      listeners.push(l); setTimeout(l);
      return function () { var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
  };
  var U = {
    getAuth: function () { return {}; },
    onAuthStateChanged: function (a, cb) { authCb = cb; setTimeout(function () { cb(user); }); },
    GoogleAuthProvider: function () { this.setCustomParameters = function () {}; },
    signInWithPopup: function () { var e = window.__fbEmail || owner; user = { uid: "u_" + e.split("@")[0], email: e, displayName: e === owner ? "관리 선생님" : "다른 선생님" }; setTimeout(function () { authCb(user); }); return Promise.resolve(); },
    signOut: function () { user = null; listeners.length = 0; setTimeout(function () { authCb(null); }); return Promise.resolve(); },
  };
  return { A: { initializeApp: function () { return {}; } }, U: U, S: S, store: store };
})();
