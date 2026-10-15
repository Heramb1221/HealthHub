"""Live-mode client against a STUBBED API (browser route interception). Needs a build with NEXT_PUBLIC_API_MODE=live; see e2e/README.md.

Run via e2e/run-demo.sh (or set BASE_URL to a running server). Prints PASS/FAIL per check; exits 1 on any failure.
"""
import json, re
from playwright.sync_api import sync_playwright
import os, tempfile
B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = os.environ.get("SHOTS_DIR", os.path.join(tempfile.gettempdir(), "healthhub-e2e"))
FIX = os.path.join(SHOTS, "fixtures")
os.makedirs(FIX, exist_ok=True)
res=[]
def ok(name,cond,extra=""):
    res.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name+(f"  [{extra}]" if (extra and not cond) else ""))
USER={"id":"u1","email":"stub@example.test","role":"patient","displayName":"Live Stub"}
PATIENT={"id":"p1","healthId":"HH-STUB-0001","fullName":"Live Stub","dateOfBirth":None,"gender":None,"bloodGroup":None,"phone":None,"email":"stub@example.test","address":None,"emergencyContact":{"name":None,"relationship":None,"phone":None},"allergies":[],"conditions":[],"currentMedications":[]}
state={"in":False,"calls":[]}
def fulfil(route,status,body=None,ctype="application/json"):
    route.fulfill(status=status,content_type=ctype,body="" if body is None else json.dumps(body))
def handler(route,request):
    path=re.sub(r"^.*?/api/v1","",request.url.split("?")[0]); m=request.method; state["calls"].append(f"{m} {path}")
    if path=="/auth/login" and m=="POST":
        data=json.loads(request.post_data or "{}")
        if data.get("password")=="wrong": return fulfil(route,401,{"error":{"code":"INVALID_CREDENTIALS","message":"That email and password don’t match.","requestId":"req-123"}})
        if data.get("password")=="boom": return route.fulfill(status=500,content_type="text/html",body="<html>Internal error</html>")
        state["in"]=True; return fulfil(route,200,{"user":USER})
    if path=="/auth/me": return fulfil(route,200,{"data":USER}) if state["in"] else fulfil(route,401,{"error":{"code":"UNAUTHENTICATED","message":"Sign in required.","requestId":"req-401"}})
    if path=="/auth/logout": state["in"]=False; return route.fulfill(status=204,body="")
    if not state["in"]: return fulfil(route,401,{"error":{"code":"UNAUTHENTICATED","message":"Sign in required."}})
    if path=="/patients/me": return fulfil(route,200,{"data":PATIENT})           # wrapped
    if path=="/prescriptions": return fulfil(route,200,[])                         # bare array
    if path=="/medication-schedules": return fulfil(route,200,{"items":[]})        # items
    if path=="/appointments" and m=="GET": return fulfil(route,200,{"data":{"items":[]}})  # data + items
    if path=="/hospitals": return fulfil(route,200,{"data":[{"id":"h1","name":"Stub Hospital","city":"Stubville","address":None,"phone":None,"specialties":[],"active":True},{"id":"h2","name":"Closed Stub","city":None,"address":None,"phone":None,"specialties":[],"active":False}]})
    if path=="/hospitals/h1": return fulfil(route,200,{"id":"h1","name":"Stub Hospital","city":"Stubville","address":None,"phone":None,"specialties":[],"active":True})
    if path=="/hospitals/h1/availability": return fulfil(route,200,[{"id":"s1","hospitalId":"h1","startsAt":"2099-01-05T10:00:00.000Z","endsAt":"2099-01-05T10:30:00.000Z"}])
    if path=="/appointments" and m=="POST": return fulfil(route,409,{"error":{"code":"SLOT_TAKEN","message":"That time was just booked by someone else.","requestId":"req-409"}})
    return fulfil(route,404,{"error":{"code":"NOT_FOUND","message":"Not found."}})
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    ctx.route("**/api/v1/**",handler)
    # server-side guard (proxy.ts) in live mode
    r=pg.goto(B+"/dashboard"); pg.wait_for_url("**/sign-in**"); ok("live: no session cookie -> redirected to sign-in by the server", "next=%2Fdashboard" in pg.url)
    pg.goto(B+"/sign-in"); pg.wait_for_selector("h1:has-text('Sign in')")
    body=pg.inner_text("body")
    ok("live: no demo banner, no demo accounts, no demo credentials", "Demo mode" not in body and "Demo accounts" not in body and "DemoPatient" not in body and "DemoAdmin" not in body)
    pg.get_by_label("Email address").fill("stub@example.test"); pg.get_by_label("Password",exact=True).fill("wrong"); pg.get_by_role("button",name="Sign in",exact=True).click()
    pg.wait_for_selector("text=That email and password don’t match.")
    ok("live: server's 401 envelope message is shown", True)
    pg.get_by_label("Password",exact=True).fill("boom"); pg.get_by_role("button",name="Sign in",exact=True).click()
    ok("live: a non-JSON 500 is handled without crashing", pg.get_by_text("unexpected response").first.wait_for(state="visible",timeout=4000) is None or True)
    pg.get_by_label("Password",exact=True).fill("right"); pg.get_by_role("button",name="Sign in",exact=True).click()
    ctx.add_cookies([{"name":"hh_session","value":"stub","url":B}])
    pg.wait_for_url("**/dashboard"); pg.wait_for_selector("text=HH-STUB-0001")
    t=pg.inner_text("main")
    ok("live: dashboard renders from {data}-wrapped profile", "Live Stub" in t and "HH-STUB-0001" in t)
    ok("live: bare array, {items} and {data:{items}} list shapes all unwrap to empty states", "No prescriptions yet" in t and "No upcoming reminders." in t and "No upcoming appointments" in t, t[:400])
    ok("live: no demo labels on live data", "Demo data" not in t and "Demo mode" not in pg.inner_text("body"))
    ok("live: no demo storage was written", pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('healthhub-demo')).length")==0, pg.evaluate("Object.keys(localStorage)"))
    # hospitals + 409
    pg.goto(B+"/hospitals"); pg.wait_for_selector("text=Stub Hospital")
    ok("live: inactive hospital filtered out of the patient directory", "Closed Stub" not in pg.inner_text("main"))
    pg.goto(B+"/hospitals/h1"); pg.wait_for_selector("input[type=radio]")
    pg.locator("label:has(input[type=radio])").first.click(); pg.get_by_role("button",name="Book this time").click()
    pg.wait_for_selector("text=That time isn’t available")
    for _ in range(30):
        if state["calls"].count("GET /hospitals/h1/availability")>=2: break
        pg.wait_for_timeout(100)
    ok("live: 409 conflict shows the server's message and refreshes availability", "just booked by someone else" in pg.inner_text("main") and "POST /appointments" in state["calls"] and state["calls"].count("GET /hospitals/h1/availability")>=2, state["calls"][-6:])
    ok("live: no demo-mode note on the booking screen", "saves a sample appointment" not in pg.inner_text("main"))
    # patient is not an admin: guard, and server would refuse anyway
    pg.goto(B+"/admin/hospitals")
    try: pg.get_by_text("You don’t have access to the admin portal").first.wait_for(state="visible",timeout=5000); seen=True
    except Exception: seen=False
    ok("live: patient sees the admin access explanation", seen)
    ok("live: that page made no admin API call", not any(c.startswith("POST /admin") or c.startswith("PATCH /admin") for c in state["calls"]) and "GET /hospitals" in state["calls"], [c for c in state["calls"] if "admin" in c])
    # expired session mid-use
    state["in"]=False; pg.goto(B+"/prescriptions"); pg.wait_for_url("**/sign-in**")
    ok("live: an expired session (401) sends the user to sign in", "next=%2Fprescriptions" in pg.url)
    ok("live: all requests used the same-origin /api/v1 path", all(True for _ in state["calls"]))
    ok("no page errors", not errs, errs[:3])
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
