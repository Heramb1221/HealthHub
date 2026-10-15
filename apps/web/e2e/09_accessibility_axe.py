"""axe-core WCAG A/AA scan of every route and key states (needs: npm install --no-save axe-core).

Run via e2e/run-demo.sh (or set BASE_URL to a running server). Prints PASS/FAIL per check; exits 1 on any failure.
"""
import json, re, collections
from playwright.sync_api import sync_playwright
import os, tempfile
B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
SHOTS = os.environ.get("SHOTS_DIR", os.path.join(tempfile.gettempdir(), "healthhub-e2e"))
FIX = os.path.join(SHOTS, "fixtures")
os.makedirs(FIX, exist_ok=True)
AXE=open(os.environ.get("AXE_JS","node_modules/axe-core/axe.min.js")).read()
TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']
PUBLIC=["/","/sign-in","/sign-up","/qr/q_testreference"]
PATIENT=["/dashboard","/prescriptions","/prescriptions/new","/prescriptions/demo-rx-2","/prescriptions/demo-rx-1","/medications","/medications/new","/medications/demo-sched-1","/history","/health-card","/hospitals","/hospitals/demo-hospital-1","/appointments","/profile"]
ADMIN=["/admin/hospitals","/admin/hospitals/new","/admin/hospitals/demo-hospital-1","/admin/hospitals/demo-hospital-1/slots"]
found=collections.defaultdict(lambda:{"impact":"","help":"","where":[],"example":""})
views=[0]
def scan(pg,label):
    views[0]+=1
    pg.add_script_tag(content=AXE)
    r=pg.evaluate("axe.run(document,{runOnly:{type:'tag',values:%s}})"%json.dumps(TAGS))
    for v in r["violations"]:
        f=found[v["id"]]; f["impact"]=v["impact"]; f["help"]=v["help"]; f["where"].append(label)
        if not f["example"]: f["example"]=v["nodes"][0]["html"][:140]+"  ->  "+" ".join(v["nodes"][0]["target"])[:80]
def settle(pg): 
    pg.wait_for_selector("h1",timeout=8000); pg.wait_for_timeout(700)
def login(pg,e,pw,landing):
    pg.goto(B+"/sign-in"); pg.get_by_label("Email address").fill(e); pg.get_by_label("Password",exact=True).fill(pw)
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(landing)
with sync_playwright() as p:
    br=p.chromium.launch()
    for w,h in [(375,812),(1280,900)]:
        ctx=br.new_context(viewport={"width":w,"height":h}); pg=ctx.new_page()
        for path in PUBLIC: pg.goto(B+path); settle(pg); scan(pg,f"{path}@{w}")
        login(pg,"demo.patient@healthhub.test","DemoPatient#1","**/dashboard")
        for path in PATIENT: pg.goto(B+path); settle(pg); scan(pg,f"{path}@{w}")
        # interactive states
        pg.goto(B+"/profile"); settle(pg); pg.get_by_role("button",name="Edit profile").click(); pg.wait_for_selector("h1:has-text('Edit profile')"); scan(pg,f"profile-edit@{w}")
        pg.goto(B+"/prescriptions/demo-rx-2"); settle(pg); pg.get_by_role("button",name="Correct details").click(); pg.wait_for_selector("text=Add a medicine"); scan(pg,f"correction-form@{w}")
        pg.goto(B+"/history"); settle(pg); pg.get_by_role("button",name="Add a condition").first.click(); pg.wait_for_selector("h2:has-text('Add a condition')"); scan(pg,f"add-condition@{w}")
        pg.goto(B+"/hospitals/demo-hospital-1"); settle(pg); pg.wait_for_selector("input[type=radio]"); pg.locator("label:has(input[type=radio])").nth(1).click(); scan(pg,f"slot-selected@{w}")
        pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
        login(pg,"demo.admin@healthhub.test","DemoAdmin#1","**/admin/hospitals")
        for path in ADMIN: pg.goto(B+path); settle(pg); scan(pg,f"{path}@{w}")
        ctx.close()
    br.close()
print("RULES WITH VIOLATIONS:",len(found))
if not found: print(f"PASS axe: 0 WCAG A/AA violations across {views[0]} page-views")
for rid,f in sorted(found.items(), key=lambda kv:(["critical","serious","moderate","minor"].index(kv[1]["impact"]) if kv[1]["impact"] in ["critical","serious","moderate","minor"] else 9, -len(kv[1]["where"]))):
    print(f"\n[{f['impact']}] {rid}: {f['help']}  ({len(f['where'])} page-views)")
    print("   e.g.", f["example"]); print("   on:", ", ".join(f["where"][:6]), "..." if len(f["where"])>6 else "")

raise SystemExit(1 if found else 0)
