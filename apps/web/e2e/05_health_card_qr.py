"""Health card, QR decoded from a screenshot (needs opencv-python-headless), public scan page.

Run via e2e/run-demo.sh (or set BASE_URL to a running server). Prints PASS/FAIL per check; exits 1 on any failure.
"""
import re, cv2
from playwright.sync_api import sync_playwright
import os, tempfile
B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = os.environ.get("SHOTS_DIR", os.path.join(tempfile.gettempdir(), "healthhub-e2e"))
FIX = os.path.join(SHOTS, "fixtures")
os.makedirs(FIX, exist_ok=True)
res=[]
def ok(name,cond,extra=""):
    res.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name+(f"  [{extra}]" if (extra and not cond) else ""))
def vis(loc,t=4000):
    try: loc.first.wait_for(state="visible",timeout=t); return True
    except Exception: return False
def login(pg,email,pw):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(re.compile(r".*/(dashboard|admin/hospitals)$"))
def decode(png_path):
    img=cv2.imread(png_path); text,_,_=cv2.QRCodeDetector().detectAndDecode(img); return text
def qr_text(pg,name):
    pg.locator('svg[role=img]').first.screenshot(path=f"{SHOTS}/{name}.png"); return decode(f"{SHOTS}/{name}.png")
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={"width":1280,"height":900},accept_downloads=True); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(B+"/health-card"); pg.wait_for_url("**/sign-in**")
    ok("signed-out health card redirects to sign-in", "next=%2Fhealth-card" in pg.url)
    login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    pg.get_by_role("link",name="Health card",exact=True).first.click(); pg.wait_for_url("**/health-card"); pg.wait_for_selector('svg[role=img]')
    t=pg.inner_text("main")
    ok("card shows name, HealthHub ID, demo label", "Demo Patient" in t and "HH-4F7K-9QXM" in t and "Not valid for any real service" in t)
    ok("nav marks Health card current", pg.locator('nav[aria-label="Main"] a[aria-current="page"]').inner_text().strip()=="Health card")
    label=pg.locator('svg[role=img]').first.get_attribute("aria-label")
    ok("QR has an accessible description", "random reference only" in label and "not medical information" in label, label)
    pg.get_by_text("See exactly what the QR code contains").click()
    shown=pg.locator("details code").inner_text()
    decoded=qr_text(pg,"qr-1280")
    ok("QR decodes from a real screenshot", decoded!="", "cv2 returned empty")
    ok("decoded text equals the URL shown on the page", decoded==shown, f"{decoded!r} vs {shown!r}")
    ok("URL is origin + /qr/ + random reference", re.fullmatch(re.escape(B)+r"/qr/q_[a-z2-9]{20}",decoded) is not None, decoded)
    ok("QR holds nothing personal or medical", not any(s in decoded for s in ["Demo","Patient","HH-","4F7K","Paracetamol","1990","@"]), decoded)
    pg.screenshot(path=f"{SHOTS}/card-1280.png",full_page=True)
    ctx.grant_permissions(["clipboard-read","clipboard-write"])
    pg.get_by_role("button",name=re.compile("Copy HealthHub ID")).click(); pg.wait_for_selector("text=HealthHub ID copied")
    ok("copy ID works", pg.evaluate("navigator.clipboard.readText()")=="HH-4F7K-9QXM")
    pg.reload(); pg.wait_for_selector('svg[role=img]')
    pg.get_by_text("See exactly what the QR code contains").click()
    ok("same QR after reload (stable reference)", pg.locator("details code").inner_text()==decoded)
    t=pg.inner_text("main")
    ok("explainer: contains / never contains", "It contains" in t and "It never contains" in t and "Medicines, conditions or allergies" in t)
    ok("explainer: 5 steps and admin-no-records rule", all(f"Step {i}" in t for i in range(1,6)) and "Hospital administrator accounts don’t get access to medical records" in t)
    ok("controls honestly marked not available", "Not available yet" in t and "withdrawing consent" in t.lower())
    ok("designed-to language, no overclaim", "designed to work" in t and "run on HealthHub’s servers" in t)
    # print layout
    pg.emulate_media(media="print")
    ok("print hides nav, explainer and details", not pg.locator("header nav").is_visible() and not pg.get_by_text("What the QR code holds").is_visible() and not pg.get_by_text("See exactly what").is_visible())
    ok("print keeps the card", pg.locator('section[aria-label="Your digital health card"]').is_visible() and pg.locator('svg[role=img]').first.is_visible())
    pg.emulate_media(media="screen")
    # dashboard link
    pg.goto(B+"/dashboard"); pg.wait_for_selector("text=HealthHub ID")
    ok("dashboard links to health card", pg.get_by_role("link",name="Health card",exact=True).count()>=1)
    # public landing for the scanned URL in a signed-out context
    ctx2=br.new_context(viewport={"width":390,"height":844}); pub=ctx2.new_page()
    r=pub.goto(decoded); ok("scanned URL loads publicly (200)", r.status==200, r.status)
    body=pub.inner_text("body")
    ok("public page shows no personal or medical data", not any(s in body for s in ["Demo Patient","HH-4F7K","Paracetamol","Azithromycin","1990"]) and "doesn’t contain any medical information" in body, body[:300])
    ok("public page explains authorization and consent", "authorized account" in body and "consent" in body)
    ok("public page is noindex", (pub.locator('meta[name=robots]').get_attribute("content") or "").startswith("noindex"))
    ok("public page offers sign in", pub.get_by_role("link",name="Sign in").count()>=1)
    pub.screenshot(path=f"{SHOTS}/qr-public-390.png",full_page=True)
    pub.goto(B+"/qr/not-a-real-code"); body2=pub.inner_text("body")
    ok("unknown reference looks identical (nothing to probe)", re.sub(r"\s+"," ",body2)==re.sub(r"\s+"," ",body), "")
    ok("public page doesn't echo the reference", "not-a-real-code" not in body2)
    ctx2.close()
    # other user gets own card
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    pg.goto(B+"/sign-up"); pg.get_by_label("Full name").fill("Asha Test"); pg.get_by_label("Email address").fill("asha6@example.com"); pg.get_by_label("Password",exact=True).fill("longenough1")
    pg.get_by_role("button",name="Create account",exact=True).click(); pg.wait_for_url("**/dashboard")
    pg.goto(B+"/health-card"); pg.wait_for_selector('svg[role=img]')
    other=qr_text(pg,"qr-other")
    ok("new user gets a different QR and ID", other!="" and other!=decoded and "Asha Test" in pg.inner_text("main") and "HH-4F7K-9QXM" not in pg.inner_text("main"), other)
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.admin@healthhub.test","DemoAdmin#1"); pg.goto(B+"/health-card")
    ok("admin has no health card", vis(pg.get_by_text("This account has no patient profile")))
    ok("no console/page errors", not errs, errs[:4])
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    for w,h in [(375,812),(768,1024),(1280,900)]:
        pg.set_viewport_size({"width":w,"height":h})
        pg.goto(B+"/health-card"); pg.wait_for_selector('svg[role=img]'); pg.wait_for_timeout(400)
        ok(f"/health-card no horizontal scroll @{w}", pg.evaluate("document.documentElement.scrollWidth")<=w, pg.evaluate("document.documentElement.scrollWidth"))
        ok(f"QR still decodes @{w}", qr_text(pg,f"qr-{w}")==decoded)
        pg.screenshot(path=f"{SHOTS}/card-{w}.png",full_page=True)
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
