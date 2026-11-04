(() => {
  "use strict";

  const installButton = document.querySelector("#install-app");
  const installDialog = document.querySelector("#install-help-dialog");
  const installHelpCopy = document.querySelector("#install-help-copy");
  let deferredInstallPrompt = null;

  function showInstallHelp(message) {
    installHelpCopy.textContent = message;
    installDialog.showModal();
  }

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function isAppleMobileDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("تعذّر تسجيل عامل الخدمة:", error);
        installButton.dataset.serviceWorkerError = "true";
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });

  installButton.addEventListener("click", async () => {
    if (isInstalled()) {
      showInstallHelp("نغمتي مثبت بالفعل على جهازك.");
      return;
    }

    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === "accepted") installButton.hidden = true;
        deferredInstallPrompt = null;
      } catch (error) {
        console.error("تعذّر بدء تثبيت نغمتي:", error);
        showInstallHelp("تعذّر بدء التثبيت الآن. تأكد من فتح الموقع عبر HTTPS، ثم جرّب مرة أخرى من متصفح يدعم تثبيت التطبيقات.");
      }
      return;
    }

    if (isAppleMobileDevice()) {
      showInstallHelp("افتح نغمتي في Safari، واضغط زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».");
    } else if (window.location.protocol === "file:" || !window.isSecureContext) {
      showInstallHelp("التثبيت يحتاج رابط الموقع المنشور عبر HTTPS. بعد نشر ملفات الموقع على GitHub Pages، افتح الرابط في Chrome أو Edge أو Safari واضغط تثبيت نغمتي.");
    } else {
      showInstallHelp("من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، تأكد من تحديث المتصفح وفتح الموقع عبر HTTPS.");
    }
  });
})();
