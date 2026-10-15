"""Landing page, sign-in/sign-up, route gating, open-redirect guard.

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
def ok(name,cond): res.append((name,bool(cond))); print(("PASS " if cond else "FAIL ")+name)
with sync_playwright() as p:
    br=p.chromium.launch()
    # screenshots at 3 widths
    for w,h in [(375,812),(768,1024),(1280,900)]:
        pg=br.new_page(viewport={"width":w,"height":h})
        pg.goto(B+"/"); pg.wait_for_load_state("networkidle")
        pg.screenshot(path=f"{SHOTS}/home-{w}.png",full_page=True)
        sw=pg.evaluate("document.documentElement.scrollWidth")
        ok(f"home no horizontal scroll @{w} (scrollWidth={sw})", sw<=w)
        pg.goto(B+"/sign-in"); pg.wait_for_load_state("networkidle")
        pg.screenshot(path=f"{SHOTS}/signin-{w}.png",full_page=True)
        ok(f"signin no horizontal scroll @{w}", pg.evaluate("document.documentElement.scrollWidth")<=w)
        pg.close()
    ctx=br.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    # unauthenticated protected route -> redirect
    pg.goto(B+"/dashboard"); pg.wait_for_url("**/sign-in**")
    ok("signed-out /dashboard redirects to sign-in with next", "next=%2Fdashboard" in pg.url)
    # validation
    pg.get_by_role("button",name="Sign in",exact=True).click()
    ok("empty submit shows email error", pg.get_by_text("Enter your email address.").is_visible())
    ok("focus moved to first invalid field", pg.evaluate("document.activeElement.name")=="email")
    # wrong creds
    pg.get_by_label("Email address").fill("demo.patient@healthhub.test")
    pg.get_by_label("Password",exact=True).fill("wrong")
    pg.get_by_role("button",name="Sign in",exact=True).click()
    pg.wait_for_selector("text=Email or password is incorrect")
    ok("wrong password shows server-style error, stays on sign-in", "/sign-in" in pg.url)
    # right creds
    pg.get_by_label("Password",exact=True).fill("DemoPatient#1")
    pg.get_by_role("button",name="Sign in",exact=True).click()
    pg.wait_for_url("**/dashboard")
    pg.wait_for_selector("h1:has-text('Dashboard')"); ok("valid demo sign-in lands on dashboard", True)
    ok("demo banner visible in app", pg.get_by_text("Demo mode.").first.is_visible())
    pg.screenshot(path=f"{SHOTS}/dashboard-1280.png")
    # reload keeps session
    pg.reload(); pg.wait_for_selector("h1:has-text('Dashboard')")
    ok("session survives reload", True)
    # sign out
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    pg.goto(B+"/dashboard"); pg.wait_for_url("**/sign-in**")
    ok("after sign out dashboard is gated again", "/sign-in" in pg.url)
    # open-redirect guard
    pg.goto(B+"/sign-in?next=//evil.example"); 
    pg.get_by_label("Email address").fill("demo.patient@healthhub.test"); pg.get_by_label("Password",exact=True).fill("DemoPatient#1")
    pg.get_by_role("button",name="Sign in",exact=True).click(); pg.wait_for_url(re.compile(r".*/(dashboard|admin/hospitals)$"))
    ok("unsafe next param ignored", "evil" not in pg.url)
    pg.get_by_role("button",name="Sign out").click(); pg.wait_for_url("**/sign-in")
    # sign up
    pg.goto(B+"/sign-up")
    pg.get_by_label("Full name").fill("A"); pg.get_by_label("Email address").fill("not-an-email"); pg.get_by_label("Password",exact=True).fill("short")
    pg.get_by_role("button",name="Create account",exact=True).click()
    ok("sign-up shows 3 field errors", pg.get_by_text("Enter your full name.").is_visible() and pg.get_by_text("Enter an email address like name@example.com.").is_visible() and pg.get_by_text("Use at least 8 characters.").nth(1).is_visible() if pg.get_by_text("Use at least 8 characters.").count()>1 else pg.get_by_text("Use at least 8 characters.").is_visible())
    pg.get_by_label("Full name").fill("Asha Test"); pg.get_by_label("Email address").fill("asha.test@example.com"); pg.get_by_label("Password",exact=True).fill("longenough1")
    pg.get_by_role("button",name="Create account",exact=True).click(); pg.wait_for_url("**/dashboard")
    pg.wait_for_selector("header >> text=Asha Test"); ok("sign-up creates demo session and lands on dashboard", True)
    # provider buttons disabled
    pg.goto(B+"/sign-in")
    ok("provider buttons disabled", pg.get_by_role("button",name="Continue with Google").is_disabled() and pg.get_by_role("button",name="Continue with Apple").is_disabled())
    # keyboard: skip link first tab stop
    pg.goto(B+"/"); pg.keyboard.press("Tab")
    ok("first Tab stop is skip link", pg.evaluate("document.activeElement.textContent").strip()=="Skip to main content")
    br.close()
print("FAILED:", [n for n,c in res if not c])
raise SystemExit(1 if any(not c for _, c in res) else 0)
