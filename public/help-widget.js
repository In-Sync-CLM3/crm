/**
 * In-Sync Help / Support Ticketing Widget
 *
 * Usage: Add this to any website:
 * <script src="https://YOUR_DOMAIN/help-widget.js" data-source="platform_name"></script>
 *
 * Optional attributes:
 *   data-source="platform_name"  (required - identifies the platform)
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
  style.textContent = [
    "#insync-help-fab {",
    "  position:fixed; bottom:24px; " + POSITION + ":24px; z-index:99999;",
    "  width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;",
    "  background:" + ACCENT + "; color:#fff; box-shadow:0 4px 20px rgba(0,0,0,.25);",
    "  display:flex; align-items:center; justify-content:center;",
    "  transition:transform .2s,box-shadow .2s; font-size:0;",
    "}",
    "#insync-help-fab:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(0,0,0,.3); }",
    "#insync-help-fab svg { width:28px; height:28px; }",
    "",
    "#insync-help-overlay {",
    "  position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,.4);",
    "  display:none; align-items:center; justify-content:center;",
    "  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "}",
    "#insync-help-overlay.open { display:flex; }",
    "",
    "#insync-help-dialog {",
    "  background:#fff; border-radius:16px; width:90%; max-width:460px;",
    "  max-height:90vh; overflow-y:auto; padding:0; position:relative;",
    "  box-shadow:0 25px 60px rgba(0,0,0,.2);",
    "}",
    "",
    "#insync-help-dialog .dialog-header {",
    "  background:" + ACCENT + "; padding:20px 24px; border-radius:16px 16px 0 0;",
    "}",
    "#insync-help-dialog .dialog-header h2 { margin:0 0 4px; font-size:20px; font-weight:700; color:#fff; }",
    "#insync-help-dialog .dialog-header p { margin:0; font-size:13px; color:rgba(255,255,255,.85); }",
    "",
    "#insync-help-dialog .dialog-body { padding:20px 24px 24px; }",
    "",
    "#insync-help-dialog label { display:block; font-size:13px; font-weight:600; color:#333; margin-bottom:4px; }",
    "#insync-help-dialog input, #insync-help-dialog textarea, #insync-help-dialog select {",
    "  width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;",
    "  font-size:14px; margin-bottom:14px; outline:none; box-sizing:border-box;",
    "  transition:border-color .2s;",
    "}",
    "#insync-help-dialog input:focus, #insync-help-dialog textarea:focus, #insync-help-dialog select:focus {",
    "  border-color:" + ACCENT + "; box-shadow:0 0 0 3px " + ACCENT + "22;",
    "}",
    "#insync-help-dialog textarea { min-height:100px; resize:vertical; }",
    "",
    "#insync-help-dialog .btn-submit {",
    "  width:100%; padding:12px; border:none; border-radius:8px; cursor:pointer;",
    "  background:" + ACCENT + "; color:#fff; font-size:15px; font-weight:600;",
    "  transition:opacity .2s;",
    "}",
    "#insync-help-dialog .btn-submit:hover { opacity:.9; }",
    "#insync-help-dialog .btn-submit:disabled { opacity:.5; cursor:not-allowed; }",
    "",
    "#insync-help-dialog .close-btn {",
    "  position:absolute; top:12px; right:16px; background:none; border:none;",
    "  font-size:24px; color:rgba(255,255,255,.8); cursor:pointer; padding:4px; z-index:1;",
    "}",
    "#insync-help-dialog .close-btn:hover { color:#fff; }",
    "",
    "#insync-help-dialog .success-msg { text-align:center; padding:24px 0; }",
    "#insync-help-dialog .success-msg .check { font-size:48px; margin-bottom:12px; }",
    "#insync-help-dialog .success-msg h3 { font-size:18px; font-weight:700; color:#111; margin:0 0 8px; }",
    "#insync-help-dialog .success-msg p { font-size:14px; color:#666; margin:0 0 6px; }",
    "#insync-help-dialog .success-msg .ticket-num { font-size:20px; color:" + ACCENT + "; font-weight:700; display:block; margin:8px 0; }",
    "",
    "#insync-help-dialog .resolution-info {",
    "  background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;",
    "  margin:12px 0 16px; font-size:13px; color:#166534; text-align:left;",
    "}",
    "#insync-help-dialog .resolution-info strong { color:#15803d; }",
    "",
    "#insync-help-dialog .working-hours-note {",
    "  background:#fefce8; border:1px solid #fde68a; border-radius:8px; padding:8px 14px;",
    "  margin:0 0 12px; font-size:12px; color:#92400e; text-align:left;",
    "}",
    "",
    "#insync-help-dialog .email-note {",
    "  background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 14px;",
    "  margin:0 0 16px; font-size:12px; color:#1e40af; text-align:left;",
    "}",
    "",
    "#insync-help-dialog .error-msg { color:#dc2626; font-size:13px; margin-bottom:12px; }",
    "#insync-help-dialog .row { display:flex; gap:12px; }",
    "#insync-help-dialog .row > div { flex:1; }",
    "",
    "#insync-file-area {",
    "  border:2px dashed #d1d5db; border-radius:8px; padding:12px; text-align:center;",
    "  cursor:pointer; margin-bottom:14px; transition:border-color .2s;",
    "}",
    "#insync-file-area:hover { border-color:" + ACCENT + "; }",
    "#insync-file-area p { margin:0; font-size:13px; color:#666; }",
    "#insync-file-area .hint { font-size:11px; color:#999; margin-top:4px; }",
    "",
    "#insync-file-list { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }",
    ".insync-file-item {",
    "  position:relative; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;",
    "  width:80px; height:64px; display:flex; align-items:center; justify-content:center;",
    "  background:#f9fafb; font-size:10px; color:#666; text-align:center;",
    "}",
    ".insync-file-item img { width:100%; height:100%; object-fit:cover; }",
    ".insync-file-item .remove-btn {",
    "  position:absolute; top:2px; right:2px; background:rgba(0,0,0,.6); color:#fff;",
    "  border:none; border-radius:50%; width:16px; height:16px; font-size:10px;",
    "  cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;",
    "}",
    ".insync-file-item .file-info {",
    "  padding:2px 4px; font-size:9px; overflow:hidden; text-overflow:ellipsis;",
    "  white-space:nowrap; max-width:76px;",
    "}",
  ].join("\n");
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
  overlay.innerHTML = [
    '<div id="insync-help-dialog">',
    '  <button class="close-btn" id="insync-close">&times;</button>',
    '  <div id="insync-form-view">',
    '    <div class="dialog-header">',
    '      <h2>Need Help?</h2>',
    '      <p>Submit a support ticket and we\'ll get back to you during working hours.</p>',
    '    </div>',
    '    <div class="dialog-body">',
    '      <div class="working-hours-note">',
    '        <strong>Working Hours:</strong> Monday to Friday, 9:00 AM - 6:00 PM IST. Resolution time is calculated on working hours only.',
    '      </div>',
    '      <div id="insync-error" class="error-msg" style="display:none;"></div>',
    '      <form id="insync-form">',
    '        <div class="row">',
    '          <div>',
    '            <label>Name *</label>',
    '            <input type="text" name="name" required maxlength="100" placeholder="Your full name" />',
    '          </div>',
    '          <div>',
    '            <label>Email *</label>',
    '            <input type="email" name="email" required maxlength="255" placeholder="you@example.com" />',
    '          </div>',
    '        </div>',
    '        <div class="row">',
    '          <div>',
    '            <label>Phone</label>',
    '            <input type="tel" name="phone" maxlength="20" placeholder="+91 98765 43210" />',
    '          </div>',
    '          <div>',
    '            <label>Company</label>',
    '            <input type="text" name="company_name" maxlength="100" value="' + COMPANY + '" placeholder="Company name" />',
    '          </div>',
    '        </div>',
    '        <div class="row">',
    '          <div>',
    '            <label>Category</label>',
    '            <select name="category">',
    '              <option value="general">General</option>',
    '              <option value="bug">Bug / Issue</option>',
    '              <option value="feature_request">Feature Request</option>',
    '              <option value="billing">Billing</option>',
    '              <option value="technical">Technical</option>',
    '            </select>',
    '          </div>',
    '          <div>',
    '            <label>Priority</label>',
    '            <select name="priority">',
    '              <option value="medium">Medium</option>',
    '              <option value="low">Low</option>',
    '              <option value="high">High</option>',
    '              <option value="critical">Critical</option>',
    '            </select>',
    '          </div>',
    '        </div>',
    '        <label>Subject *</label>',
    '        <input type="text" name="subject" required maxlength="200" placeholder="Brief summary of your issue" />',
    '        <label>Description *</label>',
    '        <textarea name="description" required maxlength="5000" placeholder="Please describe your issue in detail..."></textarea>',
    '        <label>Attachments</label>',
    '        <div id="insync-file-area">',
    '          <p>\uD83D\uDCCE Click to attach files</p>',
    '          <p class="hint">Images (max 6, 5 MB each) \u00B7 Videos (max 2, 10 MB each)</p>',
    '        </div>',
    '        <input type="file" id="insync-file-input" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" style="display:none" />',
    '        <div id="insync-file-list"></div>',
    '        <button type="submit" class="btn-submit" id="insync-submit">Submit Ticket</button>',
    '      </form>',
    '    </div>',
    '  </div>',
    '  <div id="insync-success-view" style="display:none;">',
    '    <div class="dialog-header">',
    '      <h2>Ticket Submitted!</h2>',
    '      <p>Our team will review your request during working hours.</p>',
    '    </div>',
    '    <div class="dialog-body">',
    '      <div class="success-msg">',
    '        <div class="check">\u2705</div>',
    '        <h3>Your ticket has been created</h3>',
    '        <span class="ticket-num" id="insync-ticket-num"></span>',
    '        <div class="resolution-info" id="insync-resolution-info" style="display:none;">',
    '          <strong>Expected Resolution:</strong> <span id="insync-due-date"></span>',
    '        </div>',
    '        <div class="email-note">',
    '          <strong>Email Confirmation:</strong> A confirmation email with your ticket number has been sent. You can reply to that email to add more details or follow up on your ticket.',
    '        </div>',
    '        <div class="working-hours-note">',
    '          <strong>Working Hours:</strong> Mon-Fri, 9:00 AM - 6:00 PM IST. Resolution time is based on working hours only.',
    '        </div>',
    '        <br/>',
    '        <button class="btn-submit" id="insync-done">Done</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join("\n");
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
      priority: fd.get("priority"),
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

      // Show resolution date if available
      if (data.due_at_formatted) {
        document.getElementById("insync-due-date").textContent = data.due_at_formatted;
        document.getElementById("insync-resolution-info").style.display = "";
      }

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
