// 테스트용 가짜 Firebase(인증 + Firestore). 문서는 테스트 쪽(node)의 __kv 로 두어 서로 다른 브라우저
// (=다른 선생님 PC)가 같은 저장소를 본다. 로그인 상태는 그 브라우저 localStorage. firestore.rules 의 핵심을 흉내 낸다.
window.__fbMock = (function () {
  var sub = [];
  var me = function () { try { return JSON.parse(localStorage.getItem("__fbuser") || "null"); } catch (e) { return null; } };
  var setMe = function (u) { if (u) localStorage.setItem("__fbuser", JSON.stringify(u)); else localStorage.removeItem("__fbuser"); auth.currentUser = u; };
  var auth = { currentUser: me() };
  var deny = function () { return Promise.reject({ code: "permission-denied" }); };
  var seg = function (p) { return p.split("/"); };
  var get = function (p) { return window.__kv("get", p); };
  var mail = function () { var u = auth.currentUser; return u && !u.isAnonymous && u.email ? u.email.toLowerCase() : ""; };
  var isAdmin = function (sid) { return get("schools/" + sid).then(function (s) { return !!(s && mail() && s.admins.indexOf(mail()) >= 0); }); };
  var member = function (sid) { var u = auth.currentUser; return u ? get("schools/" + sid + "/members/" + u.uid) : Promise.resolve(null); };
  // 규칙: op = get|list|write|delete. where = 목록 조건 {f, v}. old = 지금 문서
  var allow = function (op, path, data, where) {
    var p = seg(path), u = auth.currentUser;
    if (op === "list" && p.length === 2 && p[0] === "schools") return Promise.resolve(!!mail() && !!where && where.op === "array-contains" && where.f === "admins" && where.v === mail());
    if (!u || p[0] !== "schools" || !p[1] || p[1].length !== 40) return Promise.resolve(false);
    var sid = p[1];
    if (p.length === 2) {
      if (op === "get") return Promise.resolve(true);
      if (op === "write") return get(path).then(function (s) { return s ? isAdmin(sid) : !!mail() && data.admins.length === 1 && data.admins[0] === mail(); });
      if (op === "delete") return isAdmin(sid);
      return Promise.resolve(false);
    }
    var lp = p[2] === "members" && data && data.ok === true && data.link ? get("schools/" + sid + "/links/" + data.link) : null;
    return Promise.all([isAdmin(sid), member(sid), p[3] ? get(path) : null, get("schools/" + sid + "/private/join"), lp, get("schools/" + sid)]).then(function (r) {
      var adm = r[0], m = r[1] && r[1].ok ? r[1] : null, old = r[2], own = p[3] === u.uid, join = r[3];
      if (p[2] === "private") return adm;
      if (p[2] === "links") {
        if (op === "get") return true;
        if (op === "delete" || op === "list") return adm;
        if (op !== "write" || old) return false;
        return typeof data.cls === "number" && typeof data.exp === "number" && data.exp < Date.now() + 172800000 && (adm || (!!m && data.cls === m.cls));
      }
      if (p[2] === "members") {
        if (op === "list") return adm;
        if (op === "get" || op === "delete") return own || adm;
        var lk = r[4];
        if (own && !old && data.ok === true && lk) return lk.cls === data.cls && lk.exp > Date.now();
        var sd = r[5] || {};
        return adm || (own && !old && data.ok === false && typeof data.cls === "number" && (sd.pwOff === true || (!!join && data.pw === join.hash)));
      }
      if (p[2] === "minreq") return adm || !!m;
      if (p[2] === "students") {
        if (adm) return true;
        if (!m) return false;
        if (op === "list") return !!(where && where.f === "cls" && where.v === m.cls);
        if (op === "get" || op === "delete") return !!old && old.cls === m.cls;
        return data.cls === m.cls && (!old || old.cls === m.cls);
      }
      return false;
    });
  };
  var poke = function () { sub.forEach(function (f) { f(); }); };
  setInterval(poke, 300);
  var U = {
    getAuth: function () { return auth; },
    onAuthStateChanged: function (a, cb) { setTimeout(function () { cb(auth.currentUser); }); return function () {}; },
    signInAnonymously: function () { setMe({ uid: "anon_" + Math.random().toString(36).slice(2, 8), isAnonymous: true }); return Promise.resolve(); },
    GoogleAuthProvider: function () { this.setCustomParameters = function () {}; },
    signInWithPopup: function () { var e = window.__fbEmail || "admin@x.com"; setMe({ uid: "g_" + e.split("@")[0], email: e, isAnonymous: false }); return Promise.resolve(); },
    signOut: function () { setMe(null); return Promise.resolve(); },
  };
  var S = {
    initializeFirestore: function () { return {}; },
    doc: function () { return { path: [].slice.call(arguments, 1).join("/"), doc: true }; },
    collection: function () { return { path: [].slice.call(arguments, 1).join("/") }; },
    where: function (f, op, v) { return { f: f, op: op, v: v }; },
    getDocs: function (q) { return allow("list", q.path + "/x", null, q.where).then(function (ok) { if (!ok) return deny();
      return window.__kv("list", q.path).then(function (d) { if (q.where) d = d.filter(function (x) { var v = x.data[q.where.f]; return q.where.op === "array-contains" ? Array.isArray(v) && v.indexOf(q.where.v) >= 0 : v === q.where.v; });
        return { docs: d.map(function (x) { return { id: seg(x.path).pop(), data: function () { return x.data; } }; }) }; }); }); },
    query: function (ref, w) { return { path: ref.path, where: w }; },
    getDoc: function (r) { return allow("get", r.path).then(function (ok) { if (!ok) return deny();
      return get(r.path).then(function (d) { return { id: seg(r.path).pop(), exists: function () { return !!d; }, data: function () { return d; } }; }); }); },
    setDoc: function (r, v) { return allow("write", r.path, v).then(function (ok) { if (!ok) return deny(); return window.__kv("set", r.path, JSON.parse(JSON.stringify(v))); }).then(function () { setTimeout(poke); }); },
    deleteDoc: function (r) { return allow("delete", r.path).then(function (ok) { if (!ok) return deny(); return window.__kv("set", r.path, null); }).then(function () { setTimeout(poke); }); },
    onSnapshot: function (ref) {
      var a = [].slice.call(arguments, 1); if (typeof a[0] !== "function") a.shift();
      var cb = a[0], err = a[1], last = null, dead = false;
      var run = function () {
        if (dead) return;
        (ref.doc ? allow("get", ref.path) : allow("list", ref.path + "/x", null, ref.where)).then(function (ok) {
          if (dead) return;
          if (!ok) { dead = true; if (err) err({ code: "permission-denied" }); return; }
          return (ref.doc ? get(ref.path) : window.__kv("list", ref.path)).then(function (d) {
            if (!ref.doc && ref.where) d = d.filter(function (x) { return x.data[ref.where.f] === ref.where.v; });
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
