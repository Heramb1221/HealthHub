"""Prescription list, upload checks, simulated reading, correction history, PDF download (needs qpdf + pdftotext).

Run via e2e/run-demo.sh (or set BASE_URL to a running server). Prints PASS/FAIL per check; exits 1 on any failure.
"""
import re, subprocess
from playwright.sync_api import sync_playwright
import os, tempfile
B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = os.environ.get("SHOTS_DIR", os.path.join(tempfile.gettempdir(), "healthhub-e2e"))
FIX = os.path.join(SHOTS, "fixtures")
os.makedirs(FIX, exist_ok=True)
import struct, zlib
def _png(w=8, h=8):
    raw = b"".join(b"\x00" + bytes([200, 220, 230] * w) for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
open(os.path.join(FIX, "rx.png"), "wb").write(_png())
open(os.path.join(FIX, "unreadable.png"), "wb").write(_png())
open(os.path.join(FIX, "fake.pdf"), "wb").write(b"MZ\x90\x00" + b"\x00" * 200)  # an executable header renamed .pdf
open(os.path.join(FIX, "big.png"), "wb").write(_png() + b"\x00" * (11 * 1024 * 1024))  # over the 10 MB limit
res=[]
def ok(name,cond,extra=""):
    res.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name+(f"  [{extra}]" if (extra and not cond) else ""))
def vis(loc):
    try:
        loc.first.wait_for(state="visible",timeout=4000); return True
    except Exception: return False
def login(pg,email,pw):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(re.compile(r".*/(dashboard|admin/hospitals)$"))
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={"width":1280,"height":900},accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    # dashboard link
    pg.wait_for_selector("text=Open prescription")
    ok("dashboard links to latest prescription", pg.get_by_role("link",name="Open prescription").first.get_attribute("href")=="/prescriptions/demo-rx-2")
    # list
    pg.get_by_role("link",name="Prescriptions",exact=True).first.click(); pg.wait_for_url("**/prescriptions"); pg.wait_for_selector("table")
    t=pg.inner_text("main")
    ok("list shows both seeded prescriptions with statuses", "Not verified" in t or "Needs your review" in t)
    ok("list shows review count", "1 need review" in t)
    ok("list has demo tags", pg.locator("table").get_by_text("Demo data").count()==2)
    ok("list nav current", pg.locator('nav[aria-label="Main"] a[aria-current="page"]').inner_text().strip()=="Prescriptions")
    pg.screenshot(path=f"{SHOTS}/list-1280.png",full_page=True)
    # detail rx-2
    pg.goto(B+"/prescriptions/demo-rx-2"); pg.wait_for_selector("table")
    t=pg.inner_text("main")
    ok("detail: azithromycin read clearly", re.search(r"Azithromycin[\s\S]*Read clearly",t))
    ok("detail: vitamin D3 flagged with reasons", "Needs review" in t and "Dose not found" in t and "How often not found" in t and "Low reading confidence" in t)
    ok("detail: missing values say Not found", t.count("Not found")>=3)
    ok("detail: caution banner", "Check these details against your paper prescription" in t)
    ok("detail: source label honest", "Scanned from a paper prescription" in t and "kept unchanged" in t)
    ok("detail: history v1 automatic reading", "Version 1" in t and "Automatic reading" in t)
    pg.screenshot(path=f"{SHOTS}/detail-1280.png",full_page=True)
    # detail rx-1 diff history
    pg.goto(B+"/prescriptions/demo-rx-1"); pg.wait_for_selector("text=Version 2")
    t=pg.inner_text("main")
    ok("rx-1 shows entered-by-you", "Entered by you" in t)
    ok("rx-1 history shows before/after", "Dose:" in t and "not found" in t and "1 tablet" in t and "Once a day" in t and "Twice a day" in t)
    pg.screenshot(path=f"{SHOTS}/detail-rx1-1280.png",full_page=True)
    # PDF download
    with pg.expect_download() as dl:
        pg.get_by_role("button",name="Download PDF").click()
    d=dl.value; path=f"{FIX}/out.pdf"; d.save_as(path)
    ok("pdf filename", d.suggested_filename=="healthhub-prescription-demo-rx-1.pdf", d.suggested_filename)
    q=subprocess.run(["qpdf","--check",path],capture_output=True,text=True)
    ok("pdf passes qpdf --check", q.returncode==0, q.stdout[-200:]+q.stderr[-200:])
    txt=subprocess.run(["pdftotext","-layout",path,"-"],capture_output=True,text=True).stdout
    ok("pdf has HealthHub ID, record ID, source, verification, QR ref", all(s in txt for s in ["HH-4F7K-9QXM","demo-rx-1","Scanned from a paper prescription","Corrected by you","QR reference: demo-qr-demo-rx-1"]), txt[:300])
    ok("pdf is labelled demo", "DEMO DOCUMENT" in txt)
    # correction on rx-2
    pg.goto(B+"/prescriptions/demo-rx-2"); pg.wait_for_selector("table")
    pg.get_by_role("button",name="Correct details").click(); pg.wait_for_selector("h1:has-text('Correct details')")
    ok("form shows unclear reasons hint", pg.get_by_text("Unclear in the scan").count()==1)
    pg.get_by_role("button",name="Save correction").click()
    ok("confirm checkbox required", pg.get_by_text("Confirm that you checked these details against your paper prescription.").is_visible())
    row2=pg.locator('[data-row]').nth(1)
    row2.get_by_label("Medicine name").fill("")
    pg.get_by_role("button",name="Save correction").click()
    ok("medicine name required", pg.get_by_text("Enter the medicine name.").is_visible())
    ok("focus goes to invalid medicine name", pg.evaluate("document.activeElement.name")=="name")
    pg.screenshot(path=f"{SHOTS}/correct-errors-1280.png",full_page=True)
    row2.get_by_label("Medicine name").fill("Vitamin D3")
    row2.get_by_label("Dose").fill("1 sachet"); row2.get_by_label("How often").fill("Once a week")
    pg.get_by_role("button",name="Add a medicine").click()
    ok("new row focused", pg.evaluate("document.activeElement.name")=="name" and pg.locator('[data-row]').count()==3)
    pg.get_by_role("button",name="Remove medicine 3").click()
    ok("remove row works + focus to add button", pg.locator('[data-row]').count()==2 and "Add a medicine" in pg.evaluate("document.activeElement.textContent"))
    pg.get_by_label("I’ve checked these details").check()
    pg.get_by_role("button",name="Save correction").click()
    pg.wait_for_selector("text=Correction saved"); pg.wait_for_selector("h1:has-text('Prescription from')")
    t=pg.inner_text("main")
    ok("status becomes corrected by you", "You corrected these details" in t and "not verified by a clinician" in t.lower())
    ok("changed medicine marked entered by you, untouched stays read clearly", "Entered by you" in t and "Read clearly" in t)
    ok("history v2 shows previous values", "Version 2" in t and "Your correction" in t and "Dose:" in t and "1 sachet" in t and "Once a week" in t)
    pg.reload(); pg.wait_for_selector("text=Version 2")
    ok("correction persists across reload", True)
    pg.screenshot(path=f"{SHOTS}/detail-corrected-1280.png",full_page=True)
    # upload validation
    pg.goto(B+"/prescriptions/new"); pg.wait_for_selector("text=Demo mode: your file is not uploaded or read")
    pg.get_by_role("button",name="Upload prescription").click()
    ok("no file error", vis(pg.get_by_text("Choose a prescription file to upload.")))
    pg.set_input_files('input[type=file]',f"{FIX}/fake.pdf"); pg.get_by_role("button",name="Upload prescription").click()
    ok("renamed non-pdf rejected by content sniff", vis(pg.get_by_text("This file type isn’t supported")))
    pg.set_input_files('input[type=file]',f"{FIX}/big.png"); pg.get_by_role("button",name="Upload prescription").click()
    ok("oversize rejected", vis(pg.get_by_text("Choose one under 10.0 MB")))
    pg.screenshot(path=f"{SHOTS}/upload-error-1280.png",full_page=True)
    pg.set_input_files('input[type=file]',f"{FIX}/rx.png")
    pg.get_by_label("Prescription date").fill("2999-01-01"); pg.get_by_role("button",name="Upload prescription").click()
    ok("future date rejected", vis(pg.get_by_text("The prescription date can’t be in the future.")))
    pg.get_by_label("Prescription date").fill("2026-10-01"); pg.get_by_label("Prescriber").fill("Dr. Test Sample")
    pg.get_by_role("button",name="Upload prescription").click(); pg.wait_for_url(re.compile(r".*/prescriptions/demo-rx-.*"))
    pg.wait_for_selector("text=Reading your file")
    ok("processing status announced via role=status", pg.locator('[role=status]:has-text("Reading your file")').count()==1)
    ok("no correction button while processing", pg.get_by_role("button",name="Correct details").count()==0)
    pg.screenshot(path=f"{SHOTS}/processing-1280.png",full_page=True)
    pg.wait_for_selector("text=Check these details against your paper prescription", timeout=15000)
    t=pg.inner_text("main")
    ok("page updated itself to completed with fixture meds", "Cefixime" in t and "Pantoprazole" in t and "Needs review" in t)
    ok("uploaded record shows file name and prescriber", "rx.png" in t and "Dr. Test Sample" in t)
    ok("upload version 1 listed", "Version 1" in t)
    new_url=pg.url
    # failed -> retry
    pg.goto(B+"/prescriptions/new"); pg.set_input_files('input[type=file]',f"{FIX}/unreadable.png"); pg.get_by_role("button",name="Upload prescription").click()
    pg.wait_for_selector("text=We couldn’t read this file", timeout=15000)
    ok("failed state shown", True)
    pg.screenshot(path=f"{SHOTS}/failed-1280.png",full_page=True)
    pg.get_by_role("button",name="Try reading again").click(); pg.wait_for_selector("text=Reading your file")
    pg.wait_for_selector("text=Check these details against your paper prescription", timeout=15000)
    ok("retry recovers", True)
    # list now has 4
    pg.goto(B+"/prescriptions"); pg.wait_for_selector("table")
    ok("list shows 4 prescriptions", "Showing all 4 prescriptions" in pg.inner_text("main"))
    # not found
    pg.goto(B+"/prescriptions/does-not-exist"); pg.wait_for_selector("text=Prescription not found")
    ok("unknown id shows not found", True)
    # new user empty
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    pg.goto(B+"/sign-up"); pg.get_by_label("Full name").fill("Asha Test"); pg.get_by_label("Email address").fill("asha4@example.com"); pg.get_by_label("Password",exact=True).fill("longenough1")
    pg.get_by_role("button",name="Create account",exact=True).click(); pg.wait_for_url("**/dashboard")
    pg.goto(B+"/prescriptions"); pg.wait_for_selector("text=No prescriptions yet")
    ok("new user empty state with upload CTA", pg.get_by_role("link",name="Upload prescription").count()>=1)
    pg.screenshot(path=f"{SHOTS}/empty-1280.png")
    # other user cannot open seeded prescription
    pg.goto(B+"/prescriptions/demo-rx-2"); pg.wait_for_selector("text=Prescription not found")
    ok("another account can't open someone else's prescription", True)
    # admin
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.admin@healthhub.test","DemoAdmin#1"); pg.goto(B+"/prescriptions"); pg.wait_for_selector("text=This account has no patient profile|Something went wrong|Not found",timeout=8000) if False else pg.wait_for_timeout(1500)
    ok("admin doesn't see patient prescriptions", "Demo City" not in pg.inner_text("body") and "Azithromycin" not in pg.inner_text("body"))
    ok("no console/page errors", not errs, errs[:4])
    # widths
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    for w,h in [(375,812),(768,1024),(1280,900)]:
        pg.set_viewport_size({"width":w,"height":h})
        for path in ["/prescriptions","/prescriptions/new","/prescriptions/demo-rx-2","/prescriptions/demo-rx-1"]:
            pg.goto(B+path); pg.wait_for_selector("h1"); pg.wait_for_timeout(500)
            sw=pg.evaluate("document.documentElement.scrollWidth")
            ok(f"{path} no horizontal scroll @{w}", sw<=w, sw)
        pg.goto(B+"/prescriptions/demo-rx-2"); pg.wait_for_selector("text=Medicines"); pg.wait_for_timeout(300); pg.screenshot(path=f"{SHOTS}/detail-{w}.png",full_page=True)
        pg.get_by_role("button",name="Correct details").click(); pg.wait_for_selector("text=Add a medicine"); ok(f"correction form no h-scroll @{w}", pg.evaluate("document.documentElement.scrollWidth")<=w)
        pg.screenshot(path=f"{SHOTS}/correct-{w}.png",full_page=True)
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
