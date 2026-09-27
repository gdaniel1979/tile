#!/usr/bin/env python3
"""Kiosztás-tesztek futtatása headless Chromiumban (Playwright).

Friss böngésző-profilban nyitja meg az appot (a valódi mentett adatokhoz nem
nyúl), beinjektálja a tests/layout.test.js-t, és kiírja az eredményt.

Használat:  python3 tests/run_tests.py [app-URL]
            (alapértelmezés: http://127.0.0.1:8000/)
Kilépési kód: 0 ha minden teszt zöld, 1 ha van hiba.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/"
test_js = pathlib.Path(__file__).with_name("layout.test.js").read_text(encoding="utf-8")

page_errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 1400, "height": 900}).new_page()
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.on("dialog", lambda d: (page_errors.append("dialógus: " + d.message), d.dismiss()))
    page.goto(url)
    page.wait_for_function("typeof project !== 'undefined' && project !== null")
    page.add_script_tag(content=test_js)
    results = page.evaluate("window.__tileTestResults")
    browser.close()

failed = [r for r in results if not r["ok"]]
for r in results:
    print(("  ✓ " if r["ok"] else "  ✗ ") + r["name"] + ("" if r["ok"] else "\n      " + r["msg"]))
for e in page_errors:
    print("  ! oldal-hiba: " + e)
print(f"\n{len(results) - len(failed)}/{len(results)} teszt sikeres")
sys.exit(1 if failed or page_errors else 0)
