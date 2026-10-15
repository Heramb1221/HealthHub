"""Admin portal: role gate, hospital create/edit/deactivate, read-only open times, full admin->patient loop.

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
def vis(loc,t=4000):
    try: loc.first.wait_for(state="visible",timeout=t); return True
    except Exception: return False
def login(pg,email,pw,landing):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(landing)
def admin(pg): login(pg,"demo.admin@healthhub.test","DemoAdmin#1","**/admin/hospitals")
def patient(pg): login(pg,"demo.patient@healthhub.test","DemoPatient#1","**/dashboard")
def signout(pg): pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
def newctx(br):
    ctx=br.new_context(viewport={"width":1280,"height":900},timezone_id="Asia/Kolkata",locale="en-IN"); ctx.clock.set_fixed_time("2026-10-11T13:30:00+05:30"); return ctx
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=newctx(br); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(B+"/admin/hospitals"); pg.wait_for_url("**/sign-in**"); ok("signed-out /admin/hospitals redirects", "next=%2Fadmin%2Fhospitals" in pg.url)
    # patient is kept out
    patient(pg)
    for path in ["/admin/hospitals","/admin/hospitals/new","/admin/hospitals/demo-hospital-1","/admin/hospitals/demo-hospital-1/slots"]:
        pg.goto(B+path); ok(f"patient refused at {path}", vis(pg.get_by_text("You don’t have access to the admin portal")))
    t=pg.inner_text("body")
    ok("patient sees no admin controls or admin nav", "Add hospital" not in t and "Administrator" not in t and pg.locator('nav[aria-label="Main"] a:has-text("Prescriptions")').count()==1)
    signout(pg)
    # admin lands in the portal
    login(pg,"demo.admin@healthhub.test","DemoAdmin#1","**/admin/hospitals"); pg.wait_for_selector("h1:has-text('Hospitals')"); pg.wait_for_selector("text=hospitals:")
    ok("admin sign-in lands on the hospital list", "/admin/hospitals" in pg.url)
    nav=pg.locator('nav[aria-label="Main"] a').all_inner_texts()
    ok("admin nav lists the portal only, no patient screens", [n.strip() for n in nav]==["Hospitals"], nav)
    ok("Administrator badge shown", pg.get_by_text("Administrator",exact=True).first.is_visible())
    t=pg.inner_text("main")
    ok("list shows all four incl. deactivated, with counts", "4 hospitals: 3 active, 1 deactivated." in t and "Demo Closed Clinic" in t and pg.get_by_text("Deactivated",exact=True).count()>=1, t[:300])
    ok("list states admins can't see patient records", "can’t see patient records" in t)
    pg.get_by_label("Search hospitals").fill("cardio"); ok("search works", vis(pg.get_by_text("1 of 4 hospitals shown.")))
    pg.get_by_label("Search hospitals").fill(""); pg.get_by_label("Status").select_option("deactivated"); ok("status filter", vis(pg.get_by_text("1 of 4 hospitals shown.")) and "Closed Clinic" in pg.inner_text("main"))
    pg.get_by_label("Status").select_option("zzz-none") if False else None
    pg.get_by_label("Search hospitals").fill("zzz"); ok("no match state", vis(pg.get_by_text("No hospitals match"))); pg.get_by_role("button",name="Clear filters").click(); ok("clear restores", vis(pg.get_by_text("4 hospitals:")))
    pg.screenshot(path=f"{SHOTS}/list-1280.png",full_page=True)
    # create: validation
    pg.get_by_role("link",name="Add hospital").first.click(); pg.wait_for_url("**/admin/hospitals/new"); pg.wait_for_selector("h1:has-text('Add a hospital')")
    pg.get_by_role("button",name="Add hospital").click()
    ok("name required + focus", vis(pg.get_by_text("Enter the hospital’s name.")) and pg.evaluate("document.activeElement.name")=="name")
    pg.get_by_label("Hospital name").fill("Demo Hillside Clinic (sample)"); pg.get_by_label("Phone").fill("abc"); pg.get_by_label("Specialities").fill("ENT\nent")
    pg.get_by_role("button",name="Add hospital").click()
    ok("phone and duplicate speciality rejected", vis(pg.get_by_text("Enter a phone number using digits")) and vis(pg.get_by_text("Each speciality should appear once.")))
    pg.get_by_label("Phone").fill("+91 90000 00020"); pg.get_by_label("City").fill("Hillside (sample)"); pg.get_by_label("Address").fill("3 Example Hill, Hillside"); pg.get_by_label("Specialities").fill("Dermatology\nENT")
    # duplicate name against a seeded one -> server conflict
    pg.get_by_label("Hospital name").fill("demo city hospital (SAMPLE)"); pg.get_by_role("button",name="Add hospital").click()
    ok("server conflict shown in form with focus", vis(pg.get_by_text("A hospital with this name already exists.")) and "weren’t saved" in pg.inner_text("main") and "Something went wrong" not in pg.inner_text("main"))
    pg.get_by_label("Hospital name").fill("Demo Hillside Clinic (sample)"); pg.get_by_role("button",name="Add hospital").click()
    pg.wait_for_selector("text=Hospital added"); pg.wait_for_url(re.compile(r".*/admin/hospitals/demo-hospital-[0-9a-f]{8}$")); pg.wait_for_selector("h1:has-text('Demo Hillside Clinic')")
    new_id=pg.url.rsplit("/",1)[1]
    ok("created and opened for editing, active and demo-tagged", pg.get_by_text("Active",exact=True).count()>=1 and pg.get_by_text("Demo data").count()>=1)
    pg.screenshot(path=f"{SHOTS}/edit-1280.png",full_page=True)
    # open times (read-only)
    pg.get_by_role("link",name="Open times").first.click(); pg.wait_for_url("**/slots"); pg.wait_for_selector("h2:has-text('open times over')")
    t=pg.inner_text("main")
    ok("open times are read-only with the gap stated", "Read-only: times can’t be added or changed yet" in t and "no way to create or edit appointment times" in t)
    ok("no patient or booking info and no controls", not re.search(r"booked by|patient name|HH-|Booked(?! times)", t) and pg.locator("main input, main textarea, main select").count()==0 and pg.locator("main button").count()==0)
    ok("demo hospital got sample times", re.search(r"\d+ open times over \d+ days", t) is not None and "10:00 am" in t and "2:00 pm" in t, t[:400])
    pg.screenshot(path=f"{SHOTS}/slots-1280.png",full_page=True)
    n_open=int(re.search(r"(\d+) open times",t).group(1))
    # patient books at the new hospital
    signout(pg); patient(pg); pg.goto(B+"/hospitals"); pg.wait_for_selector("text=hospitals.")
    ok("patient sees the new hospital", "Demo Hillside Clinic (sample)" in pg.inner_text("main") and "4 hospitals." in pg.inner_text("main"))
    pg.goto(B+"/hospitals/"+new_id); pg.wait_for_selector("input[type=radio]")
    ok("same open times the admin saw", pg.locator("input[type=radio]").count()==n_open, f"{pg.locator('input[type=radio]').count()} vs {n_open}")
    pg.locator("label:has(input[type=radio])").nth(1).click(); pg.get_by_role("button",name="Book this time").click(); pg.wait_for_url("**/appointments?booked=*"); pg.wait_for_selector("text=Appointment booked")
    ok("patient booked at the admin-created hospital", "Demo Hillside Clinic (sample)" in pg.inner_text("main"))
    signout(pg); admin(pg)
    # edit: rename + conflict
    pg.goto(B+"/admin/hospitals/"+new_id); pg.wait_for_selector("h1:has-text('Demo Hillside Clinic')")
    pg.get_by_label("Hospital name").fill("Sample Lakeside Clinic (demo)"); pg.get_by_role("button",name="Save changes").click()
    ok("rename to an existing name refused", vis(pg.get_by_text("A hospital with this name already exists.")))
    pg.get_by_label("Hospital name").fill("Demo Hilltop Clinic (sample)"); pg.get_by_label("City").fill("Hilltop (sample)"); pg.get_by_role("button",name="Save changes").click()
    pg.wait_for_selector("text=Changes saved"); pg.wait_for_selector("h1:has-text('Demo Hilltop Clinic')")
    ok("saved: heading shows the new name", True)
    pg.reload(); pg.wait_for_selector("h1:has-text('Demo Hilltop Clinic')"); ok("rename persists across reload", pg.get_by_label("City").input_value()=="Hilltop (sample)")
    # patient sees the rename in their existing appointment
    signout(pg); patient(pg); pg.goto(B+"/appointments"); pg.wait_for_selector("section[aria-labelledby=upcoming]")
    ok("patient's appointment follows the new name", "Demo Hilltop Clinic (sample)" in pg.inner_text("main") and "Hillside" not in pg.inner_text("main"))
    signout(pg); admin(pg)
    # deactivate
    pg.goto(B+"/admin/hospitals/"+new_id); pg.wait_for_selector("h2:has-text('Deactivate hospital')")
    ok("copy says it doesn't cancel bookings and can't be reversed here", "doesn’t cancel appointments that are already booked" in pg.inner_text("main") and "Reactivating isn’t available" in pg.inner_text("main"))
    pg.get_by_role("button",name="Deactivate hospital").click()
    ok("confirmation with focus on Keep active", vis(pg.get_by_text("Deactivate Demo Hilltop Clinic (sample)?")) and pg.evaluate("document.activeElement.textContent")=="Keep active")
    pg.get_by_role("button",name="Keep active").click(); ok("keep active closes the question", pg.get_by_text("Deactivate Demo Hilltop").count()==0 and pg.get_by_role("button",name="Deactivate hospital").count()==1)
    pg.get_by_role("button",name="Deactivate hospital").click(); pg.get_by_role("button",name="Yes, deactivate").click(); pg.wait_for_selector("text=Hospital deactivated")
    ok("shown as deactivated, no deactivate or reactivate button", vis(pg.get_by_text("This hospital is deactivated")) and pg.get_by_role("button",name=re.compile("activate",re.I)).count()==0)
    pg.goto(B+"/admin/hospitals/"+new_id+"/slots"); ok("deactivated: no times offered", vis(pg.get_by_text("No times are offered")))
    pg.goto(B+"/admin/hospitals"); pg.wait_for_selector("text=hospitals:"); ok("list counts update", "5 hospitals: 3 active, 2 deactivated." in pg.inner_text("main"), pg.inner_text("main")[:300])
    signout(pg); patient(pg); pg.goto(B+"/hospitals"); pg.wait_for_selector("text=hospitals.")
    ok("patients no longer see it", "Hilltop" not in pg.inner_text("main") and "3 hospitals." in pg.inner_text("main"))
    pg.goto(B+"/hospitals/"+new_id); pg.wait_for_selector("h1:has-text('Demo Hilltop Clinic')")
    ok("direct link: not accepting appointments, no picker", pg.get_by_text("This hospital isn’t accepting appointments").count()>=1 and pg.locator("input[type=radio]").count()==0)
    pg.goto(B+"/appointments"); pg.wait_for_selector("section[aria-labelledby=upcoming]")
    ok("existing booking is untouched", "Demo Hilltop Clinic (sample)" in pg.inner_text("main") and pg.get_by_role("button",name=re.compile("Cancel appointment at Demo Hilltop")).count()==1)
    ok("no console/page errors", not errs, errs[:4])
    signout(pg)
    # next param + deep link for admin
    pg.goto(B+"/sign-in?next=%2Fadmin%2Fhospitals%2Fnew"); pg.get_by_label("Email address").fill("demo.admin@healthhub.test"); pg.get_by_label("Password",exact=True).fill("DemoAdmin#1"); pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url("**/admin/hospitals/new")
    ok("deep link respected after admin sign-in", True)
    ctx.close()
    # widths
    ctx=newctx(br); pg=ctx.new_page(); admin(pg)
    for w,h in [(375,812),(768,1024),(1280,900)]:
        pg.set_viewport_size({"width":w,"height":h})
        for path in ["/admin/hospitals","/admin/hospitals/new","/admin/hospitals/demo-hospital-1","/admin/hospitals/demo-hospital-1/slots"]:
            pg.goto(B+path); pg.wait_for_selector("h1"); pg.wait_for_timeout(600)
            ok(f"{path} no horizontal scroll @{w}", pg.evaluate("document.documentElement.scrollWidth")<=w, pg.evaluate("document.documentElement.scrollWidth"))
        pg.goto(B+"/admin/hospitals"); pg.wait_for_selector("text=hospitals:"); pg.screenshot(path=f"{SHOTS}/list-{w}.png",full_page=True)
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
