"""Hospital directory, slot picker, booking, two-tab double-booking race, cancelling.

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
def login(pg,email,pw):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(re.compile(r".*/(dashboard|admin/hospitals)$"))
def signup(pg,name,email):
    pg.goto(B+"/sign-up"); pg.get_by_label("Full name").fill(name); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password",exact=True).fill("longenough1")
    pg.get_by_role("button",name="Create account",exact=True).click(); pg.wait_for_url("**/dashboard")
def newctx(br):
    ctx=br.new_context(viewport={"width":1280,"height":900},timezone_id="Asia/Kolkata",locale="en-IN")
    ctx.clock.set_fixed_time("2026-10-11T13:30:00+05:30"); return ctx
def slot_ids(pg): return pg.locator('input[type=radio][name=slot]').evaluate_all("els=>els.map(e=>e.value)")
def pick(pg,sid): pg.locator(f'label:has(input[value="{sid}"])').click()
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=newctx(br); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(B+"/hospitals"); pg.wait_for_url("**/sign-in**"); ok("signed-out /hospitals redirects", "next=%2Fhospitals" in pg.url)
    login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    pg.get_by_role("link",name="Hospitals",exact=True).first.click(); pg.wait_for_url("**/hospitals"); pg.wait_for_selector("text=hospitals.")
    t=pg.inner_text("main")
    ok("directory lists 3 active demo hospitals, not the closed one", "Demo City Hospital" in t and "Sample Lakeside Clinic" in t and "Riverside" in t and "Closed Clinic" not in t and "3 hospitals." in t, t[:300])
    ok("each hospital tagged demo", pg.locator("ul li").get_by_text("Demo data").count()==3)
    ok("no ratings or reviews invented", not re.search(r"rating|stars|review|★|reviews", t, re.I))
    ok("nav marks Hospitals current", pg.locator('nav[aria-label="Main"] a[aria-current="page"]').inner_text().strip()=="Hospitals")
    pg.get_by_label("Search hospitals").fill("cardio"); ok("search by speciality", vis(pg.get_by_text("1 of 3 hospitals match")) and "Riverside" in pg.inner_text("main") and "Lakeside" not in pg.inner_text("main"))
    pg.get_by_label("Search hospitals").fill("zzz"); ok("no match state + clear", vis(pg.get_by_text("No hospitals match your search"))); pg.get_by_role("button",name="Clear search").click(); ok("clear restores list", vis(pg.get_by_text("3 hospitals.")))
    pg.screenshot(path=f"{SHOTS}/hospitals-1280.png",full_page=True)
    # inactive and unknown
    pg.goto(B+"/hospitals/demo-hospital-4"); pg.wait_for_selector("h1:has-text('Demo Closed Clinic')")
    ok("deactivated hospital: notice, no picker", pg.get_by_text("This hospital isn’t accepting appointments").count()>=1 and pg.locator("input[type=radio]").count()==0)
    pg.goto(B+"/hospitals/nope"); ok("unknown hospital not found", vis(pg.get_by_text("Hospital not found")))
    # detail + availability
    pg.goto(B+"/hospitals/demo-hospital-1"); pg.wait_for_selector("h2:has-text('Book an appointment')"); pg.wait_for_selector("input[type=radio]")
    t=pg.inner_text("main")
    ok("detail shows address, tel link, specialities, demo note", "1 Sample Road" in t and pg.locator('a[href^="tel:"]').count()==1 and "Orthopaedics" in t and "No hospital receives it" in t)
    ids=slot_ids(pg)
    ok("slots offered for the next days", len(ids)>=10, len(ids))
    seeded_day=[i for i in ids if i.startswith("demo-hospital-1:2026-10-14T10:30")]
    ok("seeded appointment's slot is not offered", seeded_day==[], seeded_day)
    ok("nothing offered inside the 1-hour lead time", all(i>"demo-hospital-1:2026-10-11T14:30" or i.startswith("demo-hospital-1:2026-10-11T14:30") for i in ids))
    ok("book button absent until a time is chosen", pg.get_by_role("button",name="Book this time").count()==0 and "Choose a time to continue" in pg.inner_text("main"))
    # keyboard
    first=pg.locator("input[type=radio]").first; pg.locator("label:has(input[type=radio])").first.click(); first.focus(); pg.keyboard.press("ArrowRight")
    ok("arrow keys move the selection", pg.locator("input[type=radio]:checked").evaluate("e=>e.value")==ids[1], pg.locator("input[type=radio]:checked").evaluate("e=>e.value"))
    ok("summary names hospital, day and time", "Your appointment" in pg.inner_text("main") and "Demo City Hospital" in pg.inner_text("main"))
    pg.screenshot(path=f"{SHOTS}/detail-selected-1280.png",full_page=True)
    chosen=ids[1]
    pg.get_by_role("button",name="Book this time").click(); pg.wait_for_url("**/appointments?booked=*")
    pg.wait_for_selector("text=Appointment booked")
    t=pg.inner_text("main")
    ok("success only after the server confirmed, with demo caveat", "Appointment booked" in t and "No hospital has received it" in t)
    ok("appears under Upcoming", pg.locator("section[aria-labelledby=upcoming] li").count()==2, pg.locator("section[aria-labelledby=upcoming] li").count())
    pg.screenshot(path=f"{SHOTS}/appointments-1280.png",full_page=True)
    pg.goto(B+"/hospitals/demo-hospital-1"); pg.wait_for_selector("input[type=radio]")
    ok("booked slot no longer offered", chosen not in slot_ids(pg))
    # dashboard
    pg.goto(B+"/dashboard"); pg.wait_for_selector("text=Next appointment"); pg.wait_for_selector("text=Demo City Hospital")
    ok("dashboard links to appointments", pg.get_by_role("link",name="View appointments").count()==1)
    # ---- double booking race: two tabs, same slot
    pa=ctx.new_page(); pb=ctx.new_page()
    for q in (pa,pb): q.goto(B+"/hospitals/demo-hospital-2"); q.wait_for_selector("input[type=radio]")
    sid=slot_ids(pa)[0]; ok("both tabs see the same open slot", sid in slot_ids(pb))
    pick(pa,sid); pick(pb,sid)
    pa.get_by_role("button",name="Book this time").click(); pa.wait_for_url("**/appointments?booked=*"); pa.wait_for_selector("text=Appointment booked")
    ok("first tab booked it", True)
    pb.get_by_role("button",name="Book this time").click()
    ok("second tab is refused with a clear message", vis(pb.get_by_text("That time isn’t available")) and vis(pb.get_by_text("just booked by someone else")))
    ok("focus moves to the notice", pb.evaluate("document.activeElement.tagName")=="DIV" and "isn’t available" in pb.evaluate("document.activeElement.innerText"))
    pb.wait_for_selector("input[type=radio]")
    ok("availability refreshed without that slot", sid not in slot_ids(pb))
    ok("selection cleared, no stale book button", pb.get_by_role("button",name="Book this time").count()==0)
    pb.goto(B+"/appointments"); pb.wait_for_selector("section[aria-labelledby=upcoming]")
    mine=pb.locator("section[aria-labelledby=upcoming] li:has-text('Lakeside')").count()
    ok("exactly one booking exists for that slot", mine==1, mine)
    pb.screenshot(path=f"{SHOTS}/appointments-3-1280.png",full_page=True)
    pa.close(); pb.close()
    # ---- another account can't take it
    pg.goto(B+"/hospitals/demo-hospital-3"); pg.wait_for_selector("input[type=radio]"); s3=slot_ids(pg)[0]; pick(pg,s3)
    pg.get_by_role("button",name="Book this time").click(); pg.wait_for_url("**/appointments?booked=*")
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    signup(pg,"Asha Test","asha7@example.com")
    pg.goto(B+"/hospitals/demo-hospital-3"); pg.wait_for_selector("input[type=radio]")
    ok("a different account doesn't see the booked slot", s3 not in slot_ids(pg))
    pg.goto(B+"/appointments"); pg.wait_for_selector("text=No appointments yet")
    ok("new user empty appointments state", pg.get_by_role("link",name="Find a hospital").count()>=1 and "Demo City" not in pg.inner_text("main"))
    pg.goto(B+"/dashboard"); pg.wait_for_selector("text=No upcoming appointments.")
    ok("dashboard empty state links to hospitals", pg.get_by_role("link",name="Find a hospital").count()==1)
    pg.goto(B+"/appointments?booked=demo-appt-1"); pg.wait_for_selector("text=No appointments yet")
    ok("a booked id that isn't yours shows no success banner", "Appointment booked" not in pg.inner_text("main"))
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    # ---- cancel
    login(pg,"demo.patient@healthhub.test","DemoPatient#1"); pg.goto(B+"/appointments"); pg.wait_for_selector("section[aria-labelledby=upcoming] li")
    n0=pg.locator("section[aria-labelledby=upcoming] li").count()
    pg.get_by_role("button",name=re.compile("Cancel appointment at Sample Lakeside")).click()
    ok("cancel asks for confirmation, focus on Keep it", vis(pg.get_by_text("Cancel this appointment?")) and pg.evaluate("document.activeElement.textContent")=="Keep it")
    pg.get_by_role("button",name="Keep it").click(); ok("keep it closes the question", pg.get_by_text("Cancel this appointment?").count()==0 and pg.locator("section[aria-labelledby=upcoming] li").count()==n0)
    pg.get_by_role("button",name=re.compile("Cancel appointment at Sample Lakeside")).click(); pg.get_by_role("button",name="Yes, cancel it").click()
    pg.wait_for_selector("text=Appointment cancelled")
    ok("cancelled moves to Past and cancelled", pg.locator("section[aria-labelledby=earlier] li:has-text('Lakeside')").get_by_text("Cancelled").count()==1 and pg.locator("section[aria-labelledby=upcoming] li").count()==n0-1)
    ok("cancelled appointment has no cancel button", pg.locator("section[aria-labelledby=earlier] button").count()==0)
    pg.goto(B+"/hospitals/demo-hospital-2"); pg.wait_for_selector("input[type=radio]")
    ok("cancelled slot is open again", sid in slot_ids(pg))
    # seeded appointment cancel + persistence
    pg.goto(B+"/appointments"); pg.wait_for_selector("section[aria-labelledby=upcoming] li")
    pg.get_by_role("button",name=re.compile("Cancel appointment at Demo City")).first.click(); pg.get_by_role("button",name="Yes, cancel it").click(); pg.wait_for_selector("text=Appointment cancelled")
    pg.reload(); pg.wait_for_selector("h1:has-text('Appointments')"); pg.wait_for_selector("section[aria-labelledby=earlier]")
    ok("cancellation persists across reload", pg.locator("section[aria-labelledby=earlier] li").get_by_text("Cancelled").count()>=2)
    # admin
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg,"demo.admin@healthhub.test","DemoAdmin#1"); pg.goto(B+"/appointments")
    ok("admin has no patient appointments", vis(pg.get_by_text("This account has no patient profile")))
    ok("no console/page errors", not errs, errs[:4])
    ctx.close()
    # widths
    ctx=newctx(br); pg=ctx.new_page(); login(pg,"demo.patient@healthhub.test","DemoPatient#1")
    for w,h in [(375,812),(768,1024),(1280,900)]:
        pg.set_viewport_size({"width":w,"height":h})
        for path in ["/hospitals","/hospitals/demo-hospital-1","/appointments"]:
            pg.goto(B+path); pg.wait_for_selector("h1"); pg.wait_for_timeout(600)
            ok(f"{path} no horizontal scroll @{w}", pg.evaluate("document.documentElement.scrollWidth")<=w, pg.evaluate("document.documentElement.scrollWidth"))
        pg.goto(B+"/hospitals/demo-hospital-1"); pg.wait_for_selector("input[type=radio]"); pg.locator("label:has(input[type=radio])").nth(2).click(); pg.screenshot(path=f"{SHOTS}/detail-{w}.png",full_page=True)
        pg.goto(B+"/appointments"); pg.wait_for_selector("section[aria-labelledby=upcoming]"); pg.screenshot(path=f"{SHOTS}/appointments-{w}.png",full_page=True)
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
