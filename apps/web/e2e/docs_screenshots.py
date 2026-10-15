"""Regenerates docs/screenshots/*.png from the running DEMO build (not a test). Run: ./e2e/run-demo.sh docs"""
import os, re
from playwright.sync_api import sync_playwright

B = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

def login(pg, email, pw, landing):
    pg.goto(B + "/sign-in"); pg.get_by_label("Email address").fill(email); pg.get_by_label("Password", exact=True).fill(pw)
    pg.get_by_role("button", name="Sign in", exact=True).click(); pg.wait_for_url(landing)

def shot(pg, name):
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, name + ".png"))
    print("PASS wrote", name + ".png")

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Asia/Kolkata", locale="en-IN")
    ctx.clock.set_fixed_time("2026-10-11T13:30:00+05:30")  # a fixed afternoon, so the schedule shows a sensible mix of states
    pg = ctx.new_page()
    pg.goto(B + "/"); pg.wait_for_selector("h1"); shot(pg, "01-landing")
    login(pg, "demo.patient@healthhub.test", "DemoPatient#1", re.compile(r".*/dashboard$"))
    pg.wait_for_selector("text=Notices"); pg.wait_for_selector("text=Paracetamol"); shot(pg, "02-dashboard")
    pg.goto(B + "/prescriptions/demo-rx-2"); pg.wait_for_selector("table"); shot(pg, "03-prescription-review")
    pg.goto(B + "/medications"); pg.wait_for_selector("h2:has-text('Today')"); shot(pg, "04-medication-schedule")
    pg.goto(B + "/health-card"); pg.wait_for_selector("svg[role=img]"); shot(pg, "05-health-card")
    pg.goto(B + "/hospitals/demo-hospital-1"); pg.wait_for_selector("input[type=radio]")
    pg.locator("label:has(input[type=radio])").nth(1).click(); pg.evaluate("window.scrollTo(0, 360)"); shot(pg, "06-booking")
    pg.get_by_role("button", name="Sign out").click(); pg.wait_for_url("**/sign-in")
    login(pg, "demo.admin@healthhub.test", "DemoAdmin#1", "**/admin/hospitals")
    pg.wait_for_selector("text=hospitals:"); shot(pg, "07-admin-hospitals")
    br.close()
