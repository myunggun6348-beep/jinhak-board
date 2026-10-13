// 테스트용 가짜 Firebase(인증 + Firestore). 문서는 테스트 쪽(node)의 __kv 로 두어 서로 다른 브라우저
// (=다른 선생님 PC)가 같은 저장소를 본다. 로그인 상태는 그 브라우저 localStorage. firestore.rules 의 핵심을 흉내 낸다.
window.__fbMock = (function () {
  var authCb = null, sub = [];
  var me = function () { try { return JSON.parse(localStorage.getItem("__fbuser") || "null"); } catch (e) { return null; } };
  var setMe = function (u) { if (u) localStorage.setItem("__fbuser", JSON.stringify(u)); else localStorage.removeItem("__fbuser"); auth.currentUser = u; };
  var auth = { currentUser: me() };
  var deny = function () { return Promise.reject({ code: "permission-denied" }); };
  var seg = function (p) { return p.split("/"); };
  var mail = function () { var u = auth.currentUser; return u && !u.isAnonymous && u.email ? u.email.toLowerCase() : ""; };
  var schoolOf = function (sid) { return window.__kv("get", "schools/" + sid); };
  var isAdmin = function (sid) { return schoolOf(sid).then(function (s) { return !!(s && mail() && s.admins.indexOf(mail()) >= 0); }); };
  var isMember = function (sid) { var u = auth.currentUser; return u ? window.__kv("get", "schools/" + sid + "/members/" + u.uid).then(function (m) { return !!(m && m.ok); }) : Promise.resolve(false); };
  // 규칙: op = get|list|write|delete, path 는 문서 또는 모음
  var allow = function (op, path, data) {
    var p = seg(path), u = auth.currentUser;
    if (!u) return Promise.resolve(false);
    if (p[0] !== "schools" || !p[1] || p[1].length !== 40) return Promise.resolve(false);
    var sid = p[1];
    if (p.length === 2) {
      if (op === "get") return Promise.resolve(true);
      if (op === "write") return schoolOf(sid).then(function (s) { return s ? isAdmin(sid) : !!mail() && data.admins.length === 1 && data.admins[0] === mail(); });
      return Promise.resolve(false);
    }
    if (p[2] === "members") {
      if (op === "list") return isAdmin(sid);
      var own = p[3] === u.uid;
      if (op === "get") return own ? Promise.resolve(true) : isAdmin(sid);
      if (op === "delete") return own ? Promise.resolve(true) : isAdmin(sid);
      return isAdmin(sid).then(function (a) { if (a) return true; return window.__kv("get", path).then(function (old) { return own && !old && data.ok === false; }); });
    }
    if (p[2] === "students" || p[2] === "minreq") {
      if (op === "write" && Object.keys(data).some(function (k) { return ["v", "iv", "c", "t"].indexOf(k) < 0; })) return Promise.resolve(false);
      return Promise.all([isMember(sid), isAdmin(sid)]).then(function (r) { return r[0] || r[1]; });
    }
    return Promise.resolve(false);
  };
  var poke = function () { sub.forEach(function (f) { f(); }); };
  setInterval(poke, 300);
  var U = {
    getAuth: function () { return auth; },
    onAuthStateChanged: function (a, cb) { authCb = cb; setTimeout(function () { cb(auth.currentUser); }); return function () {}; },
    signInAnonymously: function () { setMe({ uid: "anon_" + Math.random().toString(36).slice(2, 8), isAnonymous: true }); return Promise.resolve(); },
    GoogleAuthProvider: function () { this.setCustomParameters = function () {}; },
    signInWithPopup: function () { var e = window.__fbEmail || "admin@x.com"; setMe({ uid: "g_" + e.split("@")[0], email: e, isAnonymous: false }); return Promise.resolve(); },
    signOut: function () { setMe(null); return Promise.resolve(); },
  };
  var S = {
    initializeFirestore: function () { return {}; },
    doc: function () { return { path: [].slice.call(arguments, 1).join("/"), doc: true }; },
    collection: function () { return { path: [].slice.call(arguments, 1).join("/") }; },
    getDoc: function (r) { return allow("get", r.path).then(function (ok) { if (!ok) return deny();
      return window.__kv("get", r.path).then(function (d) { return { id: seg(r.path).pop(), exists: function () { return !!d; }, data: function () { return d; } }; }); }); },
    setDoc: function (r, v) { return allow("write", r.path, v).then(function (ok) { if (!ok) return deny(); return window.__kv("set", r.path, JSON.parse(JSON.stringify(v))); }).then(function () { setTimeout(poke); }); },
    deleteDoc: function (r) { return allow("delete", r.path).then(function (ok) { if (!ok) return deny(); return window.__kv("set", r.path, null); }).then(function () { setTimeout(poke); }); },
    onSnapshot: function (ref) {
      var a = [].slice.call(arguments, 1); if (typeof a[0] !== "function") a.shift();
      var cb = a[0], err = a[1], last = null, dead = false;
      var run = function () {
        if (dead) return;
        var p = ref.doc ? allow("get", ref.path) : allow(seg(ref.path)[2] === "members" ? "list" : "get", ref.path);
        p.then(function (ok) {
          if (dead) return;
          if (!ok) { dead = true; if (err) err({ code: "permission-denied" }); return; }
          var q = ref.doc ? window.__kv("get", ref.path) : window.__kv("list", ref.path);
          return q.then(function (d) {
            var key = JSON.stringify(d); if (key === last || dead) return; last = key;
            if (ref.doc) cb({ id: seg(ref.path).pop(), exists: function () { return !!d; }, data: function () { return d; } });
            else cb({ metadata: { fromCache: false, hasPendingWrites: false }, docs: d.map(function (x) { return { id: seg(x.path).pop(), data: function () { return x.data; } }; }) });
          });
        });
      };
      sub.push(run); setTimeout(run);
      return function () { dead = true; var i = sub.indexOf(run); if (i >= 0) sub.splice(i, 1); };
    },
  };
  return { A: { initializeApp: function () { return {}; } }, U: U, S: S };
})();
