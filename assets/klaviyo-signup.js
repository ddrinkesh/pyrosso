/**
 * Footer newsletter -> Klaviyo.
 * Submits the custom email + SMS sign-up forms to Klaviyo's client-side
 * subscription API, keeping the theme's markup/styling. Config (public key,
 * list id, messages) is read from data-* attributes on the
 * [data-klaviyo-config] wrapper, which the section fills from theme settings.
 *
 * Docs: POST https://a.klaviyo.com/client/subscriptions/?company_id=PUBLIC_KEY
 */
(function () {
  "use strict";

  // Must be >= 2025-x for the profile `subscriptions` consent block to be accepted
  // by /client/subscriptions/ (older revisions reject it as an invalid field).
  var KLAVIYO_REVISION = "2025-07-15";
  var ENDPOINT = "https://a.klaviyo.com/client/subscriptions/";

  function configFor(form) {
    var root = form.closest("[data-klaviyo-config]");
    if (!root) return null;
    // Each form carries its own list (email vs SMS); fall back to a wrapper-level
    // list if a form doesn't specify one.
    var list = (
      form.getAttribute("data-klaviyo-list") ||
      root.getAttribute("data-klaviyo-list-id") ||
      ""
    ).trim();
    return {
      key: (root.getAttribute("data-klaviyo-public-key") || "").trim(),
      list: list,
      dialCode: (root.getAttribute("data-default-dial-code") || "1").replace(
        /[^\d]/g,
        "",
      ),
      successText:
        root.getAttribute("data-success-text") || "Thanks for subscribing!",
      errorText:
        root.getAttribute("data-error-text") ||
        "Something went wrong. Please try again.",
    };
  }

  // Normalize a typed phone number to E.164 (Klaviyo requires it for SMS).
  // "(555) 123-4567" -> "+15551234567"; "15551234567" -> "+15551234567";
  // a number already starting with "+" keeps its own country code.
  function toE164(raw, dialCode) {
    if (!raw) return "";
    var trimmed = raw.trim();
    if (trimmed.charAt(0) === "+") {
      return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
    }
    var digits = trimmed.replace(/[^\d]/g, "");
    if (!digits) return "";
    var cc = dialCode || "1";
    // Already includes the country code without the "+" (e.g. US 1XXXXXXXXXX).
    if (digits.length > 10 && digits.indexOf(cc) === 0) {
      return "+" + digits;
    }
    return "+" + cc + digits;
  }

  function setMessage(form, text, isError) {
    var box = form.querySelector("[data-signup-message]");
    if (!box) return;
    box.textContent = text || "";
    box.classList.toggle("wt-signup__message--error", !!isError);
    box.classList.toggle("wt-signup__message--success", !isError && !!text);
  }

  function buildBody(cfg, email, phone, source) {
    var subscriptions = {};
    var profileAttributes = {};

    // Email form -> email consent. SMS form -> phone + SMS consent (no email).
    if (email) {
      profileAttributes.email = email;
      subscriptions.email = { marketing: { consent: "SUBSCRIBED" } };
    }
    if (phone) {
      profileAttributes.phone_number = phone;
      subscriptions.sms = { marketing: { consent: "SUBSCRIBED" } };
    }
    profileAttributes.subscriptions = subscriptions;

    return {
      data: {
        type: "subscription",
        attributes: {
          custom_source: source || "Footer Newsletter",
          profile: {
            data: { type: "profile", attributes: profileAttributes },
          },
        },
        relationships: {
          list: { data: { type: "list", id: cfg.list } },
        },
      },
    };
  }

  function handleSubmit(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var cfg = configFor(form);

    if (!cfg || !cfg.key || !cfg.list) {
      setMessage(form, "Newsletter is not configured yet.", true);
      return;
    }

    var emailEl = form.querySelector('[name="email"]');
    var phoneEl = form.querySelector('[name="phone"]');
    var email = emailEl ? emailEl.value.trim() : "";
    var phoneRaw = phoneEl ? phoneEl.value.trim() : "";

    if (emailEl && !email) {
      setMessage(form, "Please enter your email.", true);
      return;
    }
    if (phoneEl && !phoneRaw) {
      setMessage(form, "Please enter your phone number.", true);
      return;
    }
    // Normalize to E.164 (default dial code from config, US "+1").
    var phone = phoneEl ? toE164(phoneRaw, cfg.dialCode) : "";

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    form.classList.add("is-submitting");
    setMessage(form, "", false);

    fetch(ENDPOINT + "?company_id=" + encodeURIComponent(cfg.key), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(
        buildBody(cfg, email, phone || null, form.getAttribute("data-klaviyo-source")),
      ),
    })
      .then(function (res) {
        // Klaviyo returns 202 Accepted with an empty body on success.
        if (res.ok || res.status === 202) {
          setMessage(form, cfg.successText, false);
          form.reset();
          return;
        }
        return res
          .json()
          .then(function (data) {
            var detail =
              data && data.errors && data.errors[0] && data.errors[0].detail;
            setMessage(form, detail || cfg.errorText, true);
          })
          .catch(function () {
            setMessage(form, cfg.errorText, true);
          });
      })
      .catch(function () {
        setMessage(form, cfg.errorText, true);
      })
      .then(function () {
        if (submitBtn) submitBtn.disabled = false;
        form.classList.remove("is-submitting");
      });
  }

  function init() {
    var forms = document.querySelectorAll("form[data-klaviyo-form]");
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (form.dataset.klaviyoBound) continue;
      form.dataset.klaviyoBound = "1";
      form.addEventListener("submit", handleSubmit);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
