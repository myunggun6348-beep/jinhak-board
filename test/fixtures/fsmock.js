// 테스트용 가짜 폴더(File System Access API). 파일은 테스트 쪽(node)의 __fsList/__fsRead/__fsWrite 로
// 두어 서로 다른 브라우저(=다른 PC)가 같은 폴더를 보는 것을 흉내 낸다. "연결 기억"은 그 브라우저 localStorage.
window.__fsMock = (function () {
  function fileHandle(name) {
    return { kind: "file", name: name,
      getFile: function () { return window.__fsRead(name).then(function (o) { return { lastModified: o ? o.t : 0, text: function () { return Promise.resolve(o ? o.data : ""); } }; }); },
      createWritable: function () { var buf = ""; return Promise.resolve({ write: function (s) { buf += s; return Promise.resolve(); }, close: function () { return window.__fsWrite(name, buf); } }); } };
  }
  var dir = { kind: "directory", name: "진학현황 공유",
    values: function () { var p = window.__fsList(), names = null, i = 0;
      return { next: function () { return p.then(function (n) { names = names || n; return i < names.length ? { done: false, value: fileHandle(names[i++]) } : { done: true }; }); } }; },
    getFileHandle: function (n) { return Promise.resolve(fileHandle(n)); },
    queryPermission: function () { return Promise.resolve(localStorage.getItem("__fs_perm") || "granted"); },
    requestPermission: function () { localStorage.removeItem("__fs_perm"); return Promise.resolve("granted"); } };
  return { pick: function () { return Promise.resolve(dir); },
    get: function () { return localStorage.getItem("__fs_saved") ? dir : null; },
    set: function (v) { if (v) localStorage.setItem("__fs_saved", "1"); else localStorage.removeItem("__fs_saved"); } };
})();
