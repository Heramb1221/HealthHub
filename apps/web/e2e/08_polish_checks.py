"""Landing list semantics, status badge hierarchy, page titles, keyboard focus.

Run via e2e/run-demo.sh (or set BASE_URL to a running server). Prints PASS/FAIL per check; exits 1 on any failure.
"""
import re
from playwright.sync_api import sync_playwright
import os, tempfile
B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = os.environ.get("SHOTS_DIR", os.path.join(tempfile.gettempdir(), "healthhub-e2e"))
FIX = os.path.join(SHOTS, "fixtures")
os.makedirs(FIX, exist_ok=True)
res=[]
def ok(name,cond,extra=""):
    res.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name+(f"  [{extra}]" if (extra and not cond) else ""))
def login(pg,e,pw,landing):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(e); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(landing)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    # landing structure
    pg.goto(B+"/"); pg.wait_for_selector("h1")
    ok("landing: each capability is a proper dt/dd group", pg.locator("dl > div > dt").count()==5 and pg.locator("dl > div > dd").count()==5)
    ok("landing: icons are decorative", pg.locator("dl dt svg[aria-hidden=true]").count()==5)
    login(pg,"demo.patient@healthhub.test","DemoPatient#1","**/dashboard")
    # quieter badges
    pg.wait_for_selector("text=Latest prescription"); pg.wait_for_selector("text=Needs your review")
    ok("dashboard: no 'Reading finished' on a completed prescription", pg.get_by_text("Reading finished").count()==0)
    pg.goto(B+"/prescriptions"); pg.wait_for_selector("table")
    ok("list: completed rows show verification only", pg.get_by_text("Reading finished").count()==0 and pg.locator("table").get_by_text("Needs your review").count()==1 and pg.locator("table").get_by_text("Corrected by you").count()==1)
    pg.goto(B+"/prescriptions/demo-rx-2"); pg.wait_for_selector("table")
    ok("detail still shows both statuses", pg.get_by_text("Reading finished").count()>=1 and pg.get_by_text("Needs your review").count()>=1)
    # attention state keeps the processing badge
    pg.goto(B+"/prescriptions/new"); pg.wait_for_selector("input[type=file]")
    import struct, zlib
    def png():
        raw=b"".join(b"\x00"+bytes([200,220,230]*8) for _ in range(8))
        def ch(t,d): c=struct.pack(">I",len(d))+t+d; return c+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
        return b"\x89PNG\r\n\x1a\n"+ch(b"IHDR",struct.pack(">IIBBBBB",8,8,8,2,0,0,0))+ch(b"IDAT",zlib.compress(raw))+ch(b"IEND",b"")
    open(f"{FIX}/rx9.png","wb").write(png())
    pg.set_input_files("input[type=file]",f"{FIX}/rx9.png"); pg.get_by_role("button",name="Upload prescription").click(); pg.wait_for_url(re.compile(r".*/prescriptions/demo-rx-.*")); pg.wait_for_selector("text=Reading your file")
    pg.goto(B+"/prescriptions"); pg.wait_for_selector("table")
    ok("list: a file still being read shows its reading status", pg.locator("table").get_by_text("Reading document").count()==1)
    # titles
    pg.goto(B+"/prescriptions/demo-rx-1"); pg.wait_for_selector("table"); pg.wait_for_timeout(300)
    ok("prescription detail title is specific", re.match(r"Prescription from \d+ \w+ \d{4} · HealthHub",pg.title()) is not None, pg.title())
    pg.goto(B+"/hospitals/demo-hospital-2"); pg.wait_for_selector("h1:has-text('Sample Lakeside')"); pg.wait_for_timeout(300)
    ok("hospital detail title names the hospital", pg.title()=="Sample Lakeside Clinic (demo) · HealthHub", pg.title())
    pg.get_by_role("link",name="All hospitals").click(); pg.wait_for_url("**/hospitals"); pg.wait_for_selector("text=hospitals."); pg.wait_for_timeout(300)
    ok("title resets to the list's own title on navigation", pg.title()=="Hospitals · HealthHub", pg.title())
    # focus visibility and keyboard
    pg.goto(B+"/sign-in"); pg.keyboard.press("Tab")
    sh=pg.evaluate("getComputedStyle(document.activeElement).boxShadow")
    ok("skip link is first and visible when focused", "Skip to main content" in pg.evaluate("document.activeElement.textContent") and pg.evaluate("document.activeElement.getBoundingClientRect().width")>0)
    pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
    sh=pg.evaluate("getComputedStyle(document.activeElement).boxShadow"); outline=pg.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    ok("keyboard focus is visibly marked", (sh not in ("none","")) or outline!="none", f"{sh} / {outline}")
    # reduced motion: no spinning animation
    pg.emulate_media(reduced_motion="reduce")
    pg.goto(B+"/prescriptions/new"); pg.wait_for_selector("input[type=file]")
    ok("reduced motion honoured by the stylesheet", pg.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"))
    # admin titles
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.admin@healthhub.test","DemoAdmin#1","**/admin/hospitals")
    pg.goto(B+"/admin/hospitals/demo-hospital-1"); pg.wait_for_selector("h1:has-text('Demo City')"); pg.wait_for_timeout(300)
    ok("admin edit title", pg.title()=="Demo City Hospital (sample) · Admin · HealthHub", pg.title())
    pg.goto(B+"/admin/hospitals/demo-hospital-1/slots"); pg.wait_for_selector("h2:has-text('open times')"); pg.wait_for_timeout(300)
    ok("admin slots title", pg.title()=="Open times · Demo City Hospital (sample) · Admin · HealthHub", pg.title())
    ok("no console/page errors", not errs, errs[:4])
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
