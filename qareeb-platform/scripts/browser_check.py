import json
import os
import re
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("QAREEB_BASE_URL", "http://127.0.0.1:4173")
SCREENSHOT_DIR = Path("/tmp/qareeb-browser")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def assert_no_overflow(page: Page, label: str) -> dict:
    metrics = page.evaluate(
        """() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth
        })"""
    )
    if metrics["document"] > metrics["viewport"] or metrics["body"] > metrics["viewport"]:
        raise AssertionError(f"{label}: horizontal overflow {metrics}")
    return metrics


def assert_target_sizes(page: Page, label: str) -> int:
    undersized = page.evaluate(
        """() => [...document.querySelectorAll('button, a[href], input, textarea')]
          .filter((element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' &&
              box.width > 0 && box.height > 0 &&
              (box.width < 44 || box.height < 44);
          })
          .map((element) => ({
            tag: element.tagName,
            text: (element.textContent || element.getAttribute('aria-label') || '').trim(),
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height
          }))"""
    )
    if undersized:
        raise AssertionError(f"{label}: undersized interactive targets {undersized}")
    return 0


def capture(page: Page, screenshot_name: str) -> None:
    page.evaluate("window.scrollTo(0, 0)")
    page.add_style_tag(
        content="""
          .action-dock, .trust-ledger {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
          }
        """
    )
    page.screenshot(
        path=str(SCREENSHOT_DIR / screenshot_name),
        full_page=True,
    )


def open_scenario(page: Page, label: str) -> None:
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name=re.compile(label)).click()
    page.get_by_role("button", name="تثبيت هوية الدواء").click()


def run_success(page: Page, screenshot_name: str) -> dict:
    open_scenario(page, "حجز ناجح")
    page.get_by_role("button", name="طلب تأكيد التوفر").click()
    page.get_by_role("heading", name="نبض الرف").wait_for()
    page.get_by_role(
        "heading", name="أكدت الصيدلية العرض وبدأ الحجز"
    ).wait_for(timeout=8_000)
    capture(page, screenshot_name)
    page.get_by_role("timer").wait_for()
    metrics = assert_no_overflow(page, screenshot_name)
    assert_target_sizes(page, screenshot_name)
    return metrics


def run_controlled(page: Page, screenshot_name: str) -> dict:
    open_scenario(page, "دواء خاضع")
    page.get_by_role("button", name="عرض المسار الآمن").click()
    page.get_by_role(
        "heading", name="هذا العرض لا يدخل شبكة التوفر العامة"
    ).wait_for()
    if page.get_by_test_id("broadcast-allowlist").count() != 0:
        raise AssertionError("controlled path created a public broadcast")
    capture(page, screenshot_name)
    metrics = assert_no_overflow(page, screenshot_name)
    assert_target_sizes(page, screenshot_name)
    return metrics


def run_gudea_fallback(page: Page, screenshot_name: str) -> dict:
    open_scenario(page, "Gudea غير متاح")
    page.get_by_text(
        "تعذر التحقق من التسعير/الهوية الحكومية حالياً", exact=True
    ).first.wait_for()
    page.get_by_role("button", name="متابعة بموافقة آمنة").wait_for()
    capture(page, screenshot_name)
    metrics = assert_no_overflow(page, screenshot_name)
    assert_target_sizes(page, screenshot_name)
    return metrics


def run_timeout(page: Page, screenshot_name: str) -> dict:
    open_scenario(page, "انتهاء المهلة")
    page.get_by_role("button", name="متابعة بموافقة آمنة").click()
    page.get_by_role("checkbox").check()
    page.get_by_role(
        "button", name="منح الموافقة وفتح أدوات الوصفة"
    ).click()
    page.get_by_role("button", name="استخدام وصفة محاكاة").click()
    page.get_by_text(re.compile("تم التشفير قبل التهيئة")).wait_for()
    page.get_by_role("button", name="إرسال طلب توفر مجهول").click()
    page.get_by_role("heading", name="لم يصل تأكيد صيدلية").wait_for(
        timeout=7_000
    )
    capture(page, screenshot_name)
    metrics = assert_no_overflow(page, screenshot_name)
    assert_target_sizes(page, screenshot_name)
    return metrics


def run_keyboard_ambiguous(page: Page) -> dict:
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    scenario = page.get_by_role("button", name=re.compile("اسم ملتبس"))
    scenario.focus()
    page.keyboard.press("Enter")
    submit = page.get_by_role("button", name="تثبيت هوية الدواء")
    submit.focus()
    page.keyboard.press("Enter")
    page.get_by_role("heading", name="أي عرض تقصد تحديداً؟").wait_for()
    first_radio = page.get_by_role("radio").first
    first_radio.focus()
    page.keyboard.press("Space")
    continue_button = page.get_by_role("button", name="اعتماد هذا العرض")
    if not continue_button.is_enabled():
        raise AssertionError("keyboard selection did not enable presentation")
    continue_button.focus()
    page.keyboard.press("Enter")
    page.get_by_text("الاسم العلمي (INN)", exact=True).wait_for()
    return assert_no_overflow(page, "keyboard-ambiguous")


def main() -> None:
    results = {}
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")

        mobile_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=1,
            locale="ar-IQ",
            reduced_motion="reduce",
        )
        mobile_success = mobile_context.new_page()
        mobile_success.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        results["mobile_success"] = run_success(
            mobile_success, "mobile-success-390.png"
        )
        reduced_duration = mobile_success.locator(
            ".shelf-pulse li.is-latest .pulse-marker"
        ).evaluate(
            """(element) => getComputedStyle(element, '::after').animationDuration"""
        )
        if reduced_duration not in ("0s", "0.00001s", "1e-05s", "0.01ms"):
            raise AssertionError(
                f"reduced motion animation not minimized: {reduced_duration}"
            )
        results["reduced_motion_animation_duration"] = reduced_duration
        mobile_success.close()

        mobile_controlled = mobile_context.new_page()
        mobile_controlled.set_viewport_size({"width": 360, "height": 800})
        results["mobile_controlled"] = run_controlled(
            mobile_controlled, "mobile-controlled-360.png"
        )
        mobile_controlled.close()

        mobile_gudea = mobile_context.new_page()
        results["mobile_gudea_fallback"] = run_gudea_fallback(
            mobile_gudea, "mobile-gudea-390.png"
        )
        mobile_gudea.close()

        keyboard_page = mobile_context.new_page()
        results["keyboard_ambiguous"] = run_keyboard_ambiguous(keyboard_page)
        keyboard_page.close()
        mobile_context.close()

        desktop_context = browser.new_context(
            viewport={"width": 1365, "height": 900},
            locale="ar-IQ",
        )
        desktop_success = desktop_context.new_page()
        desktop_success.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        results["desktop_success"] = run_success(
            desktop_success, "desktop-success-1365.png"
        )
        desktop_success.close()

        desktop_timeout = desktop_context.new_page()
        results["desktop_timeout"] = run_timeout(
            desktop_timeout, "desktop-timeout-1365.png"
        )
        desktop_timeout.close()

        desktop_controlled = desktop_context.new_page()
        results["desktop_controlled"] = run_controlled(
            desktop_controlled, "desktop-controlled-1365.png"
        )
        desktop_controlled.close()
        desktop_context.close()

        browser.close()

    if console_errors:
        raise AssertionError(f"browser console errors: {console_errors}")

    print(
        json.dumps(
            {
                "screenshots": sorted(
                    str(path) for path in SCREENSHOT_DIR.glob("*.png")
                ),
                "overflow_checks": results,
                "console_errors": console_errors,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
