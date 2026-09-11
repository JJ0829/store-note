# -*- coding: utf-8 -*-
"""아티팩트 원본을 **혼자 열리는 제출용 HTML** 로 만든다.

아티팩트는 세 가지를 대신해 준다 —
  1) <!doctype html> … <head> … <body> 껍데기
  2) 그림(mermaid) 그리기
  3) 스크롤 위치 관리
파일로 내보내려면 전부 직접 붙여야 한다.

그리고 절마다 #s1 #s2 … 앵커를 달아서 특정 절을 바로 가리킬 수 있게 한다.
"""
import io, os, re, sys

NL = chr(10)   # 줄바꿈
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ★ 원본과 생성기를 저장소 안에 둔다 (2026-09-11).
#   전에는 임시 폴더에만 있어서 **다시 만들 수가 없었다** — 문서를 고치려면
#   처음부터 다시 써야 했고, 그러면 숫자는 손으로 옮기게 되고 반드시 낡는다.
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = HERE + "/"
DAY = "20260911"
OUTS = [
    os.path.abspath(os.path.join(HERE, "..")).replace(chr(92), "/") + "/",  # 저장소 docs/제출물/
    "C:/Users/user/Downloads/storenote_docs/",                              # 올리기 쉽게 한 벌 더
]
for o in OUTS:
    os.makedirs(o, exist_ok=True)

파일 = [
    ("arch.html",       f"storenote_architecture_{DAY}.html"),
    ("db.html",         f"storenote_db_architecture_{DAY}.html"),
    ("erd-v2.html",     f"storenote_erd_v3_{DAY}.html"),
    ("schema-fix.html", f"storenote_schema_v2_{DAY}.html"),
    ("erd.html",        f"storenote_current_data_{DAY}.html"),
    ("wbs.html",        f"storenote_wbs_{DAY}.html"),
]

HEAD = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<style>
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0}
img{max-width:100%;height:auto}
[hidden]{display:none!important}
section[id]{scroll-margin-top:16px}

/* 목차 */
.toc{background:var(--surface,#fff);border:1px solid var(--line,#dde2e6);
  border-radius:5px;padding:14px 18px;margin:0 0 34px}
.toc h2{font-size:13px!important;margin:0 0 10px!important;
  font-family:var(--mono,monospace);letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3,#8a959e);font-weight:600}
.toc ol{margin:0;padding-left:0;list-style:none;
  display:grid;gap:5px 22px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.toc li{font-size:13.5px}
.toc a{color:var(--ink-2,#55626c);text-decoration:none;display:block;padding:1px 0}
.toc a:hover,.toc a:focus{color:var(--ink,#14181b);text-decoration:underline}
.toc .n{font-family:var(--mono,monospace);font-size:11px;color:var(--ink-3,#8a959e);
  margin-right:7px}

/* 그림이 아직 안 그려졌거나 인터넷이 없을 때도 읽히게 */
pre.mermaid{font-family:"IBM Plex Mono",Consolas,monospace;font-size:11.5px;
  text-align:left;white-space:pre;color:#5a6873}
pre.mermaid[data-processed="true"]{font-size:0}

/* 종이로 뽑을 때 (제출용 PDF) */
@media print{
  body{background:#fff!important;color:#000!important}
  .wrap{max-width:none;padding:0 8mm}
  .toc{break-after:page}
  section{break-inside:avoid-page}
  .dia,.tablebox,.note,.card,pre{break-inside:avoid}
  a{color:inherit;text-decoration:none}
  .mapbox,.dia{background:#fff!important}
}
</style>
"""

TAIL = """
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  (function () {
    function 앵커로() {
      if (location.hash) {
        var el = document.querySelector(location.hash);
        if (el) el.scrollIntoView();
      }
    }
    if (!window.mermaid) {
      // 인터넷이 없으면 그림 대신 안내를 띄운다 — 조용히 비어 있는 것보다 낫다
      document.querySelectorAll("pre.mermaid").forEach(function (el) {
        var p = document.createElement("p");
        p.textContent = "※ 이 자리에 그림이 들어갑니다. 인터넷에 연결한 뒤 새로고침하세요.";
        p.style.cssText = "font-size:13px;color:#8a959e;margin:0 0 8px";
        el.parentNode.insertBefore(p, el);
      });
      앵커로();
      return;
    }
    mermaid.initialize({
      startOnLoad: true,
      securityLevel: "loose",
      flowchart: { htmlLabels: true, useMaxWidth: true },
      er: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
    });
    // 그림이 그려지면 높이가 바뀌므로 앵커로 다시 간다
    window.addEventListener("load", function () { setTimeout(앵커로, 400); });
  })();
</script>
</body>
</html>
"""

SEC = re.compile(r"<section(\s[^>]*)?>")
H = re.compile(r"<h[23][^>]*>(.*?)</h[23]>", re.S)
TAGS = re.compile(r"<[^>]+>")

for src, dst in 파일:
    p = SRC + src
    if not os.path.exists(p):
        print(f"  ✘ 원본 없음: {src}"); continue
    # ★ 줄바꿈을 맞춘다 (2026-09-11). 원본의 \r\n 을 그대로 물려받으면,
    #   체크아웃 설정이 다른 컴퓨터에서 돌릴 때마다 **내용이 같은데 파일이 바뀐 것으로** 뜬다.
    #   두 세션이 번갈아 돌리면 그 차이가 영원히 왕복한다.
    s = open(p, encoding="utf-8", newline="").read().replace(chr(13) + NL, NL)

    m = re.search(r"<title>(.*?)</title>", s)
    title = m.group(1) if m else dst
    if m:
        s = s.replace(m.group(0), "", 1)

    # ── 절마다 id="sN" 을 달고 제목을 모은다 ────────────────────────────
    제목 = []
    def 번호(mt):
        i = len(제목) + 1
        attrs = mt.group(1) or ""
        if "id=" in attrs:
            return mt.group(0)
        제목.append(i)
        return f'<section id="s{i}"{attrs}>'
    s = SEC.sub(번호, s)

    # 각 절의 첫 제목을 뽑아 목차를 만든다
    항목 = []
    for i, blk in enumerate(re.findall(r'<section id="s\d+"[^>]*>(.*?)</section>', s, re.S), 1):
        h = H.search(blk)
        이름 = TAGS.sub("", h.group(1)).strip() if h else f"{i}절"
        이름 = re.sub(r"\s+", " ", 이름)
        항목.append((i, 이름))

    목차 = ['<nav class="toc"><h2>목차</h2><ol>']
    for i, 이름 in 항목:
        목차.append(f'<li><a href="#s{i}"><span class="n">{i:02d}</span>{이름}</a></li>')
    목차.append("</ol></nav>")
    목차 = "\n".join(목차)

    # 머리말(masthead) 바로 뒤에 목차를 넣는다
    if "</header>" in s:
        s = s.replace("</header>", "</header>\n\n" + 목차, 1)
    else:
        s = s.replace('<div class="wrap">', '<div class="wrap">\n' + 목차, 1)

    body = HEAD + f"<title>{title}</title>\n" + s.lstrip() + TAIL
    body = body.replace('\n<div class="wrap">', '\n</head>\n<body>\n<div class="wrap">', 1)

    for o in OUTS:
        open(o + dst, "w", encoding="utf-8", newline="\n").write(body)
    kb = os.path.getsize(OUTS[0] + dst) / 1024
    print(f"  ✔ {dst}   절 {len(항목)}개 · {kb:.0f}KB   — {title}")

# ── 표지 ───────────────────────────────────────────────────────────────
#    그림도 목차도 없으므로 껍데기만 씌운다. 따로 만들면 또 어긋난다.
표지머리 = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<style>*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0}img{max-width:100%;height:auto}[hidden]{display:none!important}
@media print{body{background:#fff!important;color:#000!important}a.doc{break-inside:avoid}}</style>
"""
표지 = open(SRC + "index_src.html", encoding="utf-8", newline="").read().replace(chr(13) + NL, NL)
표지 = 표지머리 + 표지.lstrip()
표지 = 표지.replace(NL + '<div class="wrap">',
                    NL + "</head>" + NL + "<body>" + NL + '<div class="wrap">', 1)
표지 = 표지 + NL + "</body>" + NL + "</html>" + NL
for o in OUTS:
    open(o + "index.html", "w", encoding="utf-8", newline=NL).write(표지)
print("  OK index.html   표지")

print("\n저장 위치:")
for o in OUTS:
    print("  " + o)
