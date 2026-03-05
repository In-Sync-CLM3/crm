/**
 * In-Sync Help Widget
 * 
 * Usage: Add this to any website:
 * <script src="https://go.in-sync.co.in/help-widget.js" data-source="paisaa_saarthi"></script>
 * 
 * Optional attributes:
 *   data-source="paisaa_saarthi"  (required - identifies the platform)
 *   data-color="#6366f1"          (optional - accent color)
 *   data-position="right"        (optional - left or right)
 *   data-company=""               (optional - pre-fill company name)
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var SOURCE = script?.getAttribute("data-source") || "website";
  var ACCENT = script?.getAttribute("data-color") || "#6366f1";
  var POSITION = script?.getAttribute("data-position") || "right";
  var COMPANY = script?.getAttribute("data-company") || "";
  var API_URL = "https://knuewnenaswscgaldjej.supabase.co/functions/v1/submit-help-ticket";

  var IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp"];
  var VIDEO_EXTS = ["mp4", "webm", "mov"];
  var MAX_IMAGES = 6;
  var MAX_VIDEOS = 2;
  var MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  var MAX_VIDEO_SIZE = 10 * 1024 * 1024;

  function getFileExt(name) { return (name.split(".").pop() || "").toLowerCase(); }
  function isImage(name) { return IMAGE_EXTS.indexOf(getFileExt(name)) !== -1; }
  function isVideo(name) { return VIDEO_EXTS.indexOf(getFileExt(name)) !== -1; }
  function formatSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        var base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Styles
  var style = document.createElement("style");
  style.textContent = "\n    #insync-help-fab {\n      position: fixed; bottom: 24px; " + POSITION + ": 24px; z-index: 99999;\n      width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;\n      background: " + ACCENT + "; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,.25);\n      display: flex; align-items: center; justify-content: center;\n      transition: transform .2s, box-shadow .2s;\n      font-size: 0;\n    }\n    #insync-help-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,.3); }\n    #insync-help-fab svg { width: 28px; height: 28px; }\n\n    #insync-help-overlay {\n      position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.4);\n      display: none; align-items: center; justify-content: center;\n      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    }\n    #insync-help-overlay.open { display: flex; }\n\n    #insync-help-dialog {\n      background: #fff; border-radius: 16px; width: 90%; max-width: 460px;\n      max-height: 90vh; overflow-y: auto; padding: 32px;\n      box-shadow: 0 25px 60px rgba(0,0,0,.2); position: relative;\n    }\n\n    #insync-help-dialog h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: #111; }\n    #insync-help-dialog p.subtitle { margin: 0 0 20px; font-size: 14px; color: #666; }\n\n    #insync-help-dialog label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 4px; }\n    #insync-help-dialog input, #insync-help-dialog textarea, #insync-help-dialog select {\n      width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;\n      font-size: 14px; margin-bottom: 14px; outline: none; box-sizing: border-box;\n      transition: border-color .2s;\n    }\n    #insync-help-dialog input:focus, #insync-help-dialog textarea:focus, #insync-help-dialog select:focus {\n      border-color: " + ACCENT + "; box-shadow: 0 0 0 3px " + ACCENT + "22;\n    }\n    #insync-help-dialog textarea { min-height: 100px; resize: vertical; }\n\n    #insync-help-dialog .btn-submit {\n      width: 100%; padding: 12px; border: none; border-radius: 8px; cursor: pointer;\n      background: " + ACCENT + "; color: #fff; font-size: 15px; font-weight: 600;\n      transition: opacity .2s;\n    }\n    #insync-help-dialog .btn-submit:hover { opacity: .9; }\n    #insync-help-dialog .btn-submit:disabled { opacity: .5; cursor: not-allowed; }\n\n    #insync-help-dialog .close-btn {\n      position: absolute; top: 12px; right: 16px; background: none; border: none;\n      font-size: 24px; color: #999; cursor: pointer; padding: 4px;\n    }\n    #insync-help-dialog .close-btn:hover { color: #333; }\n\n    #insync-help-dialog .success-msg {\n      text-align: center; padding: 24px 0;\n    }\n    #insync-help-dialog .success-msg .check { font-size: 48px; margin-bottom: 12px; }\n    #insync-help-dialog .success-msg h3 { font-size: 18px; font-weight: 700; color: #111; margin: 0 0 8px; }\n    #insync-help-dialog .success-msg p { font-size: 14px; color: #666; margin: 0 0 6px; }\n\n    #insync-help-dialog .error-msg { color: #dc2626; font-size: 13px; margin-bottom: 12px; }\n    #insync-help-dialog .row { display: flex; gap: 12px; }\n    #insync-help-dialog .row > div { flex: 1; }\n\n    #insync-file-area {\n      border: 2px dashed #d1d5db; border-radius: 8px; padding: 12px; text-align: center;\n      cursor: pointer; margin-bottom: 14px; transition: border-color .2s;\n    }\n    #insync-file-area:hover { border-color: " + ACCENT + "; }\n    #insync-file-area p { margin: 0; font-size: 13px; color: #666; }\n    #insync-file-area .hint { font-size: 11px; color: #999; margin-top: 4px; }\n\n    #insync-file-list {\n      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;\n    }\n    .insync-file-item {\n      position: relative; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;\n      width: 80px; height: 64px; display: flex; align-items: center; justify-content: center;\n      background: #f9fafb; font-size: 10px; color: #666; text-align: center;\n    }\n    .insync-file-item img {\n      width: 100%; height: 100%; object-fit: cover;\n    }\n    .insync-file-item .remove-btn {\n      position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,.6); color: #fff;\n      border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px;\n      cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;\n    }\n    .insync-file-item .file-info {\n      padding: 2px 4px; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 76px;\n    }\n  ";
  document.head.appendChild(style);

  // FAB
  var fab = document.createElement("button");
  fab.id = "insync-help-fab";
  fab.title = "Need Help?";
  fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  document.body.appendChild(fab);

  // State
  var selectedFiles = [];

  // Overlay
  var overlay = document.createElement("div");
  overlay.id = "insync-help-overlay";
  overlay.innerHTML = '\n    <div id="insync-help-dialog">\n      <button class="close-btn" id="insync-close">&times;</button>\n      <div id="insync-form-view">\n        <h2>Need Help?</h2>\n        <p class="subtitle">Submit a support ticket and we\'ll get back to you shortly.</p>\n        <div id="insync-error" class="error-msg" style="display:none;"></div>\n        <form id="insync-form">\n          <div class="row">\n            <div>\n              <label>Name *</label>\n              <input type="text" name="name" required maxlength="100" placeholder="Your full name" />\n            </div>\n            <div>\n              <label>Email *</label>\n              <input type="email" name="email" required maxlength="255" placeholder="you@example.com" />\n            </div>\n          </div>\n          <div class="row">\n            <div>\n              <label>Phone</label>\n              <input type="tel" name="phone" maxlength="20" placeholder="+91 98765 43210" />\n            </div>\n            <div>\n              <label>Company</label>\n              <input type="text" name="company_name" maxlength="100" value="' + COMPANY + '" placeholder="Company name" />\n            </div>\n          </div>\n          <label>Category</label>\n          <select name="category">\n            <option value="general">General</option>\n            <option value="bug">Bug / Issue</option>\n            <option value="feature_request">Feature Request</option>\n            <option value="billing">Billing</option>\n            <option value="technical">Technical</option>\n          </select>\n          <label>Subject *</label>\n          <input type="text" name="subject" required maxlength="200" placeholder="Brief summary of your issue" />\n          <label>Description *</label>\n          <textarea name="description" required maxlength="5000" placeholder="Please describe your issue in detail..."></textarea>\n          <label>Attachments</label>\n          <div id="insync-file-area">\n            <p>\uD83D\uDCCE Click to attach files</p>\n            <p class="hint">Images (max 6, 5 MB each) \u00B7 Videos (max 2, 10 MB each)</p>\n          </div>\n          <input type="file" id="insync-file-input" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" style="display:none" />\n          <div id="insync-file-list"></div>\n          <button type="submit" class="btn-submit" id="insync-submit">Submit Ticket</button>\n        </form>\n      </div>\n      <div id="insync-success-view" style="display:none;">\n        <div class="success-msg">\n          <div class="check">\u2705</div>\n          <h3>Ticket Submitted!</h3>\n          <p>Your ticket <strong id="insync-ticket-num"></strong> has been created.</p>\n          <p>We\'ve sent a confirmation to your email.</p>\n          <br/>\n          <button class="btn-submit" id="insync-done">Done</button>\n        </div>\n      </div>\n    </div>\n  ';
  document.body.appendChild(overlay);

  function renderFileList() {
    var list = document.getElementById("insync-file-list");
    list.innerHTML = "";
    selectedFiles.forEach(function (sf, i) {
      var item = document.createElement("div");
      item.className = "insync-file-item";
      if (sf.type === "image" && sf.preview) {
        item.innerHTML = '<img src="' + sf.preview + '" alt="' + sf.file.name + '"/>';
      } else {
        item.innerHTML = '<div class="file-info">\uD83C\uDFA5 ' + sf.file.name + '<br/>' + formatSize(sf.file.size) + '</div>';
      }
      var removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "\u00D7";
      removeBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (sf.preview) URL.revokeObjectURL(sf.preview);
        selectedFiles.splice(i, 1);
        renderFileList();
      };
      item.appendChild(removeBtn);
      list.appendChild(item);
    });
  }

  function validateAndAddFiles(files) {
    var imgCount = selectedFiles.filter(function (f) { return f.type === "image"; }).length;
    var vidCount = selectedFiles.filter(function (f) { return f.type === "video"; }).length;
    var errEl = document.getElementById("insync-error");

    for (var idx = 0; idx < files.length; idx++) {
      var file = files[idx];
      var fName = file.name;
      if (isImage(fName)) {
        if (imgCount >= MAX_IMAGES) { errEl.textContent = "Maximum " + MAX_IMAGES + " images allowed"; errEl.style.display = ""; continue; }
        if (file.size > MAX_IMAGE_SIZE) { errEl.textContent = fName + " exceeds 5 MB limit"; errEl.style.display = ""; continue; }
        imgCount++;
        selectedFiles.push({ file: file, type: "image", preview: URL.createObjectURL(file) });
      } else if (isVideo(fName)) {
        if (vidCount >= MAX_VIDEOS) { errEl.textContent = "Maximum " + MAX_VIDEOS + " videos allowed"; errEl.style.display = ""; continue; }
        if (file.size > MAX_VIDEO_SIZE) { errEl.textContent = fName + " exceeds 10 MB limit"; errEl.style.display = ""; continue; }
        vidCount++;
        selectedFiles.push({ file: file, type: "video" });
      } else {
        errEl.textContent = "Unsupported file type: " + fName;
        errEl.style.display = "";
        continue;
      }
    }
    renderFileList();
  }

  // Handlers
  fab.addEventListener("click", function () { overlay.classList.add("open"); });

  var close = function () {
    overlay.classList.remove("open");
    document.getElementById("insync-form-view").style.display = "";
    document.getElementById("insync-success-view").style.display = "none";
    document.getElementById("insync-form").reset();
    document.getElementById("insync-error").style.display = "none";
    selectedFiles.forEach(function (sf) { if (sf.preview) URL.revokeObjectURL(sf.preview); });
    selectedFiles = [];
    renderFileList();
  };

  document.getElementById("insync-close").addEventListener("click", close);
  document.getElementById("insync-done").addEventListener("click", close);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

  document.getElementById("insync-file-area").addEventListener("click", function () {
    document.getElementById("insync-file-input").click();
  });

  document.getElementById("insync-file-input").addEventListener("change", function (e) {
    if (e.target.files && e.target.files.length) validateAndAddFiles(e.target.files);
    e.target.value = "";
  });

  document.getElementById("insync-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var form = e.target;
    var btn = document.getElementById("insync-submit");
    var errEl = document.getElementById("insync-error");

    btn.disabled = true;
    btn.textContent = selectedFiles.length > 0 ? "Uploading files..." : "Submitting...";
    errEl.style.display = "none";

    var fd = new FormData(form);
    var body = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone") || null,
      company_name: fd.get("company_name") || null,
      category: fd.get("category"),
      subject: fd.get("subject"),
      description: fd.get("description"),
      source: SOURCE,
    };

    // Encode files as base64
    if (selectedFiles.length > 0) {
      try {
        var attachments = [];
        for (var i = 0; i < selectedFiles.length; i++) {
          btn.textContent = "Uploading file " + (i + 1) + "/" + selectedFiles.length + "...";
          var sf = selectedFiles[i];
          var b64 = await fileToBase64(sf.file);
          attachments.push({ name: sf.file.name, data: b64 });
        }
        body.attachments = attachments;
        btn.textContent = "Submitting...";
      } catch (encErr) {
        errEl.textContent = "Failed to process files. Please try again.";
        errEl.style.display = "";
        btn.disabled = false;
        btn.textContent = "Submit Ticket";
        return;
      }
    }

    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      document.getElementById("insync-ticket-num").textContent = data.ticket_number;
      document.getElementById("insync-form-view").style.display = "none";
      document.getElementById("insync-success-view").style.display = "";
      selectedFiles.forEach(function (sf) { if (sf.preview) URL.revokeObjectURL(sf.preview); });
      selectedFiles = [];
    } catch (err) {
      errEl.textContent = err.message || "Failed to submit. Please try again.";
      errEl.style.display = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit Ticket";
    }
  });
})();
