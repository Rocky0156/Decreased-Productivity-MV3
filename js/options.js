// (c) Andrew 
// Icon by dunedhel: http://dunedhel.deviantart.com/
// Supporting functions by AdThwart - T. Joseph

/* ============================================
   MV3対応済み options.js - フル版
   - background page (window) に依存しない
   - 背景処理は sendMessagePromise を使う
   - DOMSubtreeModified -> MutationObserver
   ============================================ */

const version = '0.46.56.12'; // マニフェストから直接読み取れないため定数として定義
let bkg = null; // 可能なら background page の参照（MV3では未定義のことが多い）
let error = false;
let oldglobalstate = false;
let settingnames = [];

/* ---------- ユーティリティ: storage を Promise で扱う ---------- */
function getStorageItems(keys) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(keys, (items) => {
                resolve(items);
            });
        } catch (e) {
            resolve({});
        }
    });
}

function setStorageItems(items) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set(items, () => {
                resolve();
            });
        } catch (e) {
            resolve();
        }
    });
}

/* ---------- ユーティリティ: chrome.runtime.sendMessage を Promise 化 ---------- */
function sendMessagePromise(message, timeout = 2000) {
    return new Promise((resolve) => {
        let resolved = false;
        try {
            chrome.runtime.sendMessage(message, (response) => {
                // runtime.lastError はあっても response がある場合があるので優先的に response を返す
                if (!resolved) {
                    resolved = true;
                    resolve(response);
                }
            });
        } catch (e) {
            // 例外でもresolve
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        }
        // タイムアウトで null を返す（背景が無ければ無視する）
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        }, timeout);
    });
}

/* ---------- DOMContentLoaded 開始 ---------- */
document.addEventListener('DOMContentLoaded', async function () {
    // MV3 の場合、getBackgroundPage は存在しない（service worker）。あれば使うが存在しないことを前提にメッセージングを使う。
    try {
        if (typeof chrome.extension.getBackgroundPage === 'function') {
            // ただし MV3 の拡張では undefined になることが多い
            bkg = chrome.extension.getBackgroundPage();
        } else {
            bkg = null;
        }
    } catch (e) {
        bkg = null;
        console.warn('Background page not accessible, using messaging instead');
    }

    // jQuery UI 初期化等（既存ロジック維持）
    $("#tabs").tabs();
    $("#o1").slider({
        min: 0, max: 1, step: 0.05,
        slide: function (event, ui) {
            $("#opacity1").val(ui.value);
            opacitytest();
        },
        stop: async function (event, ui) {
            if (ui.value == 0) $("#collapseimageblock").show();
            else $("#collapseimageblock").hide();
            await saveOptions();
        }
    });
    $("#o2").slider({
        min: 0, max: 1, step: 0.05,
        slide: function (event, ui) {
            $("#opacity2").val(ui.value);
            opacitytest();
        },
        stop: async function () { await saveOptions(); }
    });

    await loadOptions();
    colorPickLoad("s_bg");
    colorPickLoad("s_text");
    colorPickLoad("s_link");
    colorPickLoad("s_table");

    $(".i18_save, .i18_savecolours").click(saveOptions);
    $(".i18_revertcolours").click(revertColours);
    $(".i18_addwhitelist").click(function () { addList(0); });
    $(".i18_addblacklist").click(function () { addList(1); });
    $(".i18_dpoptions").click(function () { location.href = 'options.html'; });
    $(".i18_clear").click(function () {
        if ($(this).parent().find('strong').hasClass('i18_whitelist')) {
            listclear(0);
        } else {
            listclear(1);
        }
    });

    $("#enable, #enableToggle, #enableStickiness, #disableFavicons, #hidePageTitles, #showUnderline, #collapseimage, #removeBold, #showContext, #showIcon, #showUpdateNotifications").click(saveOptions);
    $("#iconTitle, #customcss").blur(saveOptions);
    $("#s_bg, #s_text, #s_link, #s_table").keyup(updateDemo);
    $("#global").click(function () { saveOptions(); });
    $("#opacity1").blur(function () {
        intValidate(this, 0.05);
        if (this.value == 0) $("#collapseimageblock").show();
        else $("#collapseimageblock").hide();
        opacitytest();
    });
    $("#opacity2").blur(function () {
        intValidate(this, 0.5);
        opacitytest();
    });
    $("#maxwidth, #maxheight").blur(function () { intValidate(this); });
    $("#pageTitleText").blur(pageTitleValidation);
    $("#font").change(function () { updateDemo(); });

    // Hotkey setup (既存ライブラリ keypress を前提)
    try {
        const listener = new window.keypress.Listener($("#hotkey"), {
            is_solitary: true,
            is_unordered: true,
            is_exclusive: true,
            prevent_repeat: true,
            is_sequence: false,
            is_counting: false
        });
        listener.register_many(combos);

        const listener2 = new window.keypress.Listener($("#paranoidhotkey"), {
            is_solitary: true,
            is_unordered: true,
            is_exclusive: true,
            prevent_repeat: true,
            is_sequence: false,
            is_counting: false
        });
        listener2.register_many(combos);
    } catch (e) {
        console.warn('Keypress library not available or combos undefined', e);
    }

    $("#hotkeyrecord").click(function () {
        $("#hotkeyrecord").val(chrome.i18n.getMessage("hotkey_set"));
        $("#hotkey").removeAttr('disabled').select().focus();
    });
    $("#paranoidhotkeyrecord").click(function () {
        $("#paranoidhotkeyrecord").val(chrome.i18n.getMessage("hotkey_set"));
        $("#paranoidhotkey").removeAttr('disabled').select().focus();
    });

    $("#iconType").change(function () {
        $("#sampleicon").attr('src', '../img/addressicon/' + $(this).val() + '.png');
    });
    $("#fontsize").change(fontsizeValidation);
    $("#newPages, #sfwmode, #font, #iconType").change(saveOptions);
    $("#s_preset").change(function () { stylePreset($(this).val()); });
    $("#settingsall").click(settingsall);
    $("#importsettings").click(settingsImport);
    $("#savetxt").click(downloadtxt);
    $(".i18_close").click(closeOptions);

    // DOM変更監視（DOMSubtreeModified 廃止 -> MutationObserver）
    try {
        const observer = new MutationObserver((mutations) => {
            // 必要なら mutation を処理
            mutations.forEach((mutation) => {
                // ここに必要な処理を入れる（デバッグ用コメントは残しません）
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        // 一部環境で document.body が未定義の可能性があるため安全に握りつぶす
        console.warn('MutationObserver setup failed', e);
    }
});

/* ---------- keyhandle ---------- */
function keyhandle(keypressed) {
    keypressed = keypressed.toUpperCase();
    if ($("#hotkey").attr('disabled')) {
        if (keypressed != $("#hotkey").val()) {
            $("#paranoidhotkey").val(keypressed).attr('disabled', 'true');
            $("#paranoidhotkeyrecord").val(chrome.i18n.getMessage("hotkey_record"));
            saveOptions();
        }
    } else {
        if (keypressed != $("#paranoidhotkey").val()) {
            $("#hotkey").val(keypressed).attr('disabled', 'true');
            $("#hotkeyrecord").val(chrome.i18n.getMessage("hotkey_record"));
            saveOptions();
        }
    }
}

/* ---------- small storage helpers ---------- */
async function loadCheckbox(id) {
    const result = await getStorageItems([id]);
    try { document.getElementById(id).checked = result[id] === 'true'; } catch (e) { }
}

async function loadElement(id) {
    const result = await getStorageItems([id]);
    $("#" + id).val(result[id] || '');
}

async function saveCheckbox(id) {
    await setStorageItems({ [id]: document.getElementById(id).checked.toString() });
}

async function saveElement(id) {
    await setStorageItems({ [id]: $("#" + id).val() });
}

/* ---------- UI helper ---------- */
function closeOptions() {
    window.open('', '_self', '');
    window.close();
}

function settingsall() {
    selectAll('settingsexport');
}

function selectAll(id) {
    $("#" + id).select();
}

/* ---------- i18n load ---------- */
function i18load() {
    $("#title").html("Decreased Productivity v" + version);
    $(".i18_default").html(chrome.i18n.getMessage("default"));
    $(".i18_enable").html(chrome.i18n.getMessage("enable"));
    $(".i18_enabled").html(chrome.i18n.getMessage("enabled"));
    $(".i18_disabled").html(chrome.i18n.getMessage("disabled"));
    $(".i18_globalmode").html(chrome.i18n.getMessage("globalmode"));
    $(".i18_globalmode2").html(chrome.i18n.getMessage("globalmode2"));
    $(".i18_globalmode3").html(chrome.i18n.getMessage("globalmode3"));
    $(".i18_cloak").html(chrome.i18n.getMessage("cloak"));
    $(".i18_uncloak").html(chrome.i18n.getMessage("uncloak"));
    $(".i18_level").html(chrome.i18n.getMessage("level"));
    $(".i18_paranoid").html(chrome.i18n.getMessage("paranoid"));
    $(".i18_sfw0").html(chrome.i18n.getMessage("sfw0"));
    $(".i18_sfw1").html(chrome.i18n.getMessage("sfw1"));
    $(".i18_sfw2").html(chrome.i18n.getMessage("sfw2"));
    $(".i18_nsfw").html(chrome.i18n.getMessage("nsfw"));
    $(".i18_toggle").html(chrome.i18n.getMessage("toggle"));
    $(".i18_toggle2").html(chrome.i18n.getMessage("toggle2"));
    $(".i18_toggle_hotkey").html(chrome.i18n.getMessage("hotkey"));
    $(".i18_toggle_paranoidhotkey").html(chrome.i18n.getMessage("paranoidhotkey"));
    $(".i18_hotkey_record").val(chrome.i18n.getMessage("hotkey_record"));
    $(".i18_opacity").html(chrome.i18n.getMessage("opacity"));
    $(".i18_collapseimage").html(chrome.i18n.getMessage("collapseimage"));
    $(".i18_opacity2").html(chrome.i18n.getMessage("opacity2"));
    $(".i18_unhovered").html(chrome.i18n.getMessage("unhovered"));
    $(".i18_hovered").html(chrome.i18n.getMessage("hovered"));
    $(".i18_stickiness").html(chrome.i18n.getMessage("stickiness"));
    $(".i18_stickiness2").html(chrome.i18n.getMessage("stickiness2"));
    $(".i18_favicons").html(chrome.i18n.getMessage("favicons"));
    $(".i18_hidetitles").html(chrome.i18n.getMessage("hidetitles"));
    $(".i18_showimages").html(chrome.i18n.getMessage("showimages"));
    $(".i18_showimages2").html(chrome.i18n.getMessage("showimages2"));
    $(".i18_showunderline").html(chrome.i18n.getMessage("showunderline"));
    $(".i18_removebold").html(chrome.i18n.getMessage("removebold"));
    $(".i18_showcontext").html(chrome.i18n.getMessage("showcontext"));
    $(".i18_showcontext2").html(chrome.i18n.getMessage("showcontext2"));
    $(".i18_showicon").html(chrome.i18n.getMessage("showicon"));
    $(".i18_showicon2").html(chrome.i18n.getMessage("showicon2"));
    $(".i18_showicon_type").html(chrome.i18n.getMessage("showicon_type"));
    $(".i18_showicon_type2").html(chrome.i18n.getMessage("showicon_type2"));
    $(".i18_showicon_title").html(chrome.i18n.getMessage("showicon_title"));
    $(".i18_showupdate").html(chrome.i18n.getMessage("showupdate"));
    $(".i18_showupdate2").html(chrome.i18n.getMessage("showupdate2"));
    $(".i18_font").html(chrome.i18n.getMessage("font"));
    $(".i18_customfont").html(chrome.i18n.getMessage("customfont"));
    $(".i18_fontsize").html(chrome.i18n.getMessage("fontsize"));
    $(".i18_color").html(chrome.i18n.getMessage("color"));
    $(".i18_colorpresets").html(chrome.i18n.getMessage("colorpresets"));
    $(".i18_colorpresetselect").html('-- ' + chrome.i18n.getMessage("colorpresetselect") + ' --');
    $(".i18_colorbackground").html(chrome.i18n.getMessage("colorbackground"));
    $(".i18_colortext").html(chrome.i18n.getMessage("colortext"));
    $(".i18_colorlink").html(chrome.i18n.getMessage("colorlink"));
    $(".i18_colortable").html(chrome.i18n.getMessage("colortable"));
    $(".i18_c1").html(chrome.i18n.getMessage("white") + ' - ' + chrome.i18n.getMessage("blue"));
    $(".i18_c2").html(chrome.i18n.getMessage("white") + ' - ' + chrome.i18n.getMessage("gray"));
    $(".i18_c3").html(chrome.i18n.getMessage("gray") + ' - ' + chrome.i18n.getMessage("blue"));
    $(".i18_c4").html(chrome.i18n.getMessage("lightred") + ' - ' + chrome.i18n.getMessage("paleblue"));
    $(".i18_c5").html(chrome.i18n.getMessage("darkbrown") + ' - ' + chrome.i18n.getMessage("offwhite"));
    $(".i18_c6").html(chrome.i18n.getMessage("black") + ' - ' + chrome.i18n.getMessage("blue"));
    $(".i18_c7").html(chrome.i18n.getMessage("black") + ' - ' + chrome.i18n.getMessage("green"));
    $(".i18_c8").html(chrome.i18n.getMessage("black") + ' - ' + chrome.i18n.getMessage("red"));
    $(".i18_c9").html(chrome.i18n.getMessage("black") + ' - ' + chrome.i18n.getMessage("pink"));
    $(".i18_c10").html(chrome.i18n.getMessage("white") + ' - ' + chrome.i18n.getMessage("green"));
    $(".i18_demo").html(chrome.i18n.getMessage("demo"));
    $(".i18_test1").html(chrome.i18n.getMessage("test1"));
    $(".i18_test2").html(chrome.i18n.getMessage("test2"));
    $(".i18_savecolours").val(chrome.i18n.getMessage("savecolours"));
    $(".i18_revertcolours").val(chrome.i18n.getMessage("revertcolours"));
    $(".i18_domain").html(chrome.i18n.getMessage("domain"));
    $(".i18_addwhitelist").val("+ " + chrome.i18n.getMessage("whitelist"));
    $(".i18_addblacklist").val("+ " + chrome.i18n.getMessage("blacklist"));
    $(".i18_whitelist").html(chrome.i18n.getMessage("whitelist"));
    $(".i18_blacklist").html(chrome.i18n.getMessage("blacklist"));
    $(".i18_clear").html(chrome.i18n.getMessage("clear"));
    $(".i18_save").val(chrome.i18n.getMessage("save"));
    $(".i18_close").val(chrome.i18n.getMessage("close"));
    $(".i18_people").html(chrome.i18n.getMessage("people"));
    $(".i18_translators").html(chrome.i18n.getMessage("translators"));
    $(".i18_help").html(chrome.i18n.getMessage("help"));
    $(".i18_support").html(chrome.i18n.getMessage("support"));
    $("#customcssdesc").html(chrome.i18n.getMessage("customcss"));
    $(".i18_supportimg").attr({ alt: chrome.i18n.getMessage("support"), title: chrome.i18n.getMessage("support") });
}

/* ---------- loadOptions ---------- */
async function loadOptions() {
    document.title = chrome.i18n.getMessage("dpoptions");
    i18load();

    const settings = await getStorageItems([
        'global', 'enable', 'enableToggle', 'hotkey', 'paranoidhotkey', 'newPages', 'sfwmode',
        'opacity1', 'opacity2', 'collapseimage', 'showIcon', 'iconType', 'iconTitle',
        'disableFavicons', 'hidePageTitles', 'pageTitleText', 'maxwidth', 'maxheight',
        'enableStickiness', 'showContext', 'showUnderline', 'removeBold', 'showUpdateNotifications',
        'font', 'customfont', 'fontsize', 's_text', 's_bg', 's_table', 's_link', 'customcss'
    ]);

    oldglobalstate = settings.global;

    // Load checkboxes safely
    try { document.getElementById("enable").checked = settings.enable === 'true'; } catch (e) { }
    try { document.getElementById("global").checked = settings.global === 'true'; } catch (e) { }
    try { document.getElementById("enableToggle").checked = settings.enableToggle === 'true'; } catch (e) { }
    try { document.getElementById("collapseimage").checked = settings.collapseimage === 'true'; } catch (e) { }
    try { document.getElementById("showIcon").checked = settings.showIcon === 'true'; } catch (e) { }
    try { document.getElementById("disableFavicons").checked = settings.disableFavicons === 'true'; } catch (e) { }
    try { document.getElementById("hidePageTitles").checked = settings.hidePageTitles === 'true'; } catch (e) { }
    try { document.getElementById("enableStickiness").checked = settings.enableStickiness === 'true'; } catch (e) { }
    try { document.getElementById("showContext").checked = settings.showContext === 'true'; } catch (e) { }
    try { document.getElementById("showUnderline").checked = settings.showUnderline === 'true'; } catch (e) { }
    try { document.getElementById("removeBold").checked = settings.removeBold === 'true'; } catch (e) { }
    try { document.getElementById("showUpdateNotifications").checked = settings.showUpdateNotifications === 'true'; } catch (e) { }

    // Load elements
    $("#hotkey").val((settings.hotkey || '').toUpperCase());
    $("#paranoidhotkey").val((settings.paranoidhotkey || '').toUpperCase());
    $("#newPages").val(settings.newPages || '');
    $("#sfwmode").val(settings.sfwmode || '');
    $("#opacity1").val(settings.opacity1 || '');
    $("#opacity2").val(settings.opacity2 || '');
    $("#iconType").val(settings.iconType || '');
    $("#iconTitle").val(settings.iconTitle || '');
    $("#pageTitleText").val(settings.pageTitleText || '');
    $("#maxwidth").val(settings.maxwidth || '');
    $("#maxheight").val(settings.maxheight || '');
    $("#font").val(settings.font || '');
    $("#customfont").val(settings.customfont || '');
    $("#fontsize").val(settings.fontsize || '');
    $("#s_text").val(settings.s_text || '');
    $("#s_bg").val(settings.s_bg || '');
    $("#s_table").val(settings.s_table || '');
    $("#s_link").val(settings.s_link || '');
    $("#customcss").val(settings.customcss || '');

    // UI updates based on loaded settings
    if ($('#global').is(':checked')) $("#newPagesRow").css('display', 'none');
    if ($('#showIcon').is(':checked')) $(".discreeticonrow").show();
    if ($('#enableToggle').is(':checked')) $("#hotkeyrow, #paranoidhotkeyrow").show();
    $("#sampleicon").attr('src', '../img/addressicon/' + (settings.iconType || 'coffee') + '.png');
    if (!$('#hidePageTitles').is(':checked')) $("#pageTitle").css('display', 'none');
    if ((settings.opacity1 || '0') == '0') $("#collapseimageblock").css('display', 'block');
    if (['SFW', 'SFW1', 'SFW2'].includes(settings.sfwmode)) $("#opacityrow").show();
    if (settings.font == '-Custom-') {
        if (settings.customfont) $("#customfontrow").show();
        else {
            $('#font').val('Arial');
            $("#customfontrow").hide();
        }
    }

    await listUpdate();
    opacitytest();
    updateDemo();
}

/* ---------- 色検証 ---------- */
function isValidColor(hex) {
    var strPattern = /^[0-9a-f]{3,6}$/i;
    return strPattern.test(hex);
}

/* ---------- 保存処理 ---------- */
async function saveOptions() {
    updateDemo();
    if (!$('#enable').is(':checked') && !$('#global').is(':checked')) {
        $('#enable').prop('checked', true);
    }
    if ($('#global').is(':checked')) $("#newPagesRow").css('display', 'none');
    else $("#newPagesRow").css('display', 'block');
    if ($('#enableToggle').is(':checked')) $("#hotkeyrow, #paranoidhotkeyrow").show();
    else $("#hotkeyrow, #paranoidhotkeyrow").hide();
    if ($('#hidePageTitles').is(':checked')) $("#pageTitle").css('display', 'block');
    else $("#pageTitle").css('display', 'none');
    if (['SFW', 'SFW1', 'SFW2'].includes($('#sfwmode').val())) $("#opacityrow").fadeIn("fast");
    else $("#opacityrow").hide();
    if ($('#font').val() == '-Custom-') $("#customfontrow").show();
    else $("#customfontrow").hide();
    if (!$("#hotkey").val()) $("#hotkey").val('CTRL F12');
    if (!$("#paranoidhotkey").val()) $("#paranoidhotkey").val('ALT P');

    // Save all settings
    const settings = {
        enable: document.getElementById("enable").checked.toString(),
        global: document.getElementById("global").checked.toString(),
        enableToggle: document.getElementById("enableToggle").checked.toString(),
        hotkey: $("#hotkey").val(),
        paranoidhotkey: $("#paranoidhotkey").val(),
        opacity1: $("#opacity1").val(),
        opacity2: $("#opacity2").val(),
        collapseimage: document.getElementById("collapseimage").checked.toString(),
        newPages: $("#newPages").val(),
        sfwmode: $("#sfwmode").val(),
        showIcon: document.getElementById("showIcon").checked.toString(),
        iconType: $("#iconType").val(),
        iconTitle: $("#iconTitle").val(),
        disableFavicons: document.getElementById("disableFavicons").checked.toString(),
        hidePageTitles: document.getElementById("hidePageTitles").checked.toString(),
        pageTitleText: $("#pageTitleText").val(),
        maxwidth: $("#maxwidth").val(),
        maxheight: $("#maxheight").val(),
        enableStickiness: document.getElementById("enableStickiness").checked.toString(),
        showContext: document.getElementById("showContext").checked.toString(),
        showUnderline: document.getElementById("showUnderline").checked.toString(),
        removeBold: document.getElementById("removeBold").checked.toString(),
        showUpdateNotifications: document.getElementById("showUpdateNotifications").checked.toString(),
        font: $("#font").val(),
        customfont: $("#customfont").val(),
        fontsize: $("#fontsize").val(),
        customcss: $("#customcss").val().replace(/\s*<([^>]+)>\s*/ig, "")
    };

    if ($('#showIcon').is(':checked')) {
        $(".discreeticonrow").show();
        // Background pageへのメッセージングを安全に呼ぶ（MV3 対応）
        if (bkg && typeof bkg.setDPIcon === 'function') {
            try { bkg.setDPIcon(); } catch (e) { /* ignore */ }
        } else {
            // メッセージを投げて background に処理を依頼（あれば実行）
            await sendMessagePromise({ reqtype: "setDPIcon" });
        }
    } else {
        $(".discreeticonrow").hide();
    }

    if (isValidColor($('#s_text').val()) && isValidColor($('#s_bg').val()) &&
        isValidColor($('#s_table').val()) && isValidColor($('#s_link').val())) {
        settings.s_text = $("#s_text").val();
        settings.s_bg = $("#s_bg").val();
        settings.s_table = $("#s_table").val();
        settings.s_link = $("#s_link").val();
    } else {
        error = true;
    }

    await setStorageItems(settings);
    await updateExport();

    // Apply new settings - background に通知（MV3対応）
    if (bkg && typeof bkg.optionsSaveTrigger === 'function') {
        try {
            bkg.optionsSaveTrigger(oldglobalstate, settings.global);
            if (typeof bkg.hotkeyChange === 'function') bkg.hotkeyChange();
        } catch (e) { /* ignore */ }
    } else {
        await sendMessagePromise({
            reqtype: "optionsSaveTrigger",
            oldglobalstate: oldglobalstate,
            newglobalstate: settings.global
        });
        await sendMessagePromise({ reqtype: "hotkeyChange" });
    }

    oldglobalstate = settings.global;

    if (!error) notification(chrome.i18n.getMessage("saved"));
    else notification(chrome.i18n.getMessage("invalidcolour"));

    error = false;
}

/* ---------- opacity / demo ---------- */
function opacitytest() {
    $("#o1").slider("option", "value", $("#opacity1").val());
    $("#o2").slider("option", "value", $("#opacity2").val());
    $(".sampleimage").css({ "opacity": $("#opacity1").val() });
    $(".sampleimage").hover(
        function () { $(this).css("opacity", $("#opacity2").val()); },
        function () { $(this).css("opacity", $("#opacity1").val()); }
    );
}

function intValidate(elm, val) {
    if (!is_int(elm.value)) {
        notification(chrome.i18n.getMessage("invalidnumber"));
        elm.value = val;
    } else {
        saveOptions();
    }
}

function is_int(value) {
    return value != '' && !isNaN(value);
}

function pageTitleValidation() {
    if ($.trim($("#pageTitleText").val()) == '') {
        $("#pageTitleText").val('Google Chrome');
    } else {
        saveOptions();
    }
}

function fontsizeValidation() {
    if (!is_int($.trim($("#fontsize").val()))) {
        $("#fontsize").val('12');
    }
    updateDemo();
}

function notification(msg) {
    $('#message').html(msg).stop().fadeIn("slow").delay(2000).fadeOut("slow");
}

function truncText(str) {
    if (!str) return '';
    if (str.length > 16) return str.substr(0, 16) + '...';
    return str;
}

function updateDemo() {
    if ($('#disableFavicons').is(':checked')) $("#demo_favicon").attr('style', 'visibility: hidden');
    else $("#demo_favicon").removeAttr('style');
    if ($('#hidePageTitles').is(':checked')) $("#demo_title").text(truncText($("#pageTitleText").val()));
    else $("#demo_title").text(chrome.i18n.getMessage("demo") + ' Page');
    $("#demo_content").css('backgroundColor', '#' + $("#s_bg").val());
    $("#t_link").css('color', '#' + $("#s_link").val());
    $("#test table").css('border', "1px solid #" + $("#s_table").val());
    $("#t_table, #demo_content h1").css('color', '#' + $("#s_text").val());

    if ($("#font").val() == '-Custom-' && $("#customfont").val()) {
        $("#t_table, #demo_content h1").css({ 'font-family': $("#customfont").val(), 'font-size': $("#fontsize").val() + 'px' });
    } else if ($("#font").val() != '-Unchanged-' && $("#font").val() != '-Custom-') {
        $("#t_table, #demo_content h1").css({ 'font-family': $("#font").val(), 'font-size': $("#fontsize").val() + 'px' });
    } else {
        $("#t_table, #demo_content h1").css({ 'font-family': 'Arial, sans-serif', 'font-size': '12px' });
    }

    if ($('#removeBold').is(':checked')) $("#demo_content h1").css('font-weight', 'normal');
    else $("#demo_content h1").css('font-weight', 'bold');
    if ($('#showUnderline').is(':checked')) $("#t_link").css('textDecoration', 'underline');
    else $("#t_link").css('textDecoration', 'none');
    if ($("#sfwmode").val() == 'Paranoid') $(".sampleimage").attr('style', 'visibility: hidden');
    else if ($("#sfwmode").val() == 'NSFW') $(".sampleimage").attr('style', 'visibility: visible; opacity: 1 !important;').unbind();
    else opacitytest();
}

/* ---------- style presets ---------- */
function stylePreset(s) {
    if (s) {
        let bg = 'FFFFFF';
        let text = '000000';
        let link = '000099';
        let table = 'cccccc';

        switch (s) {
            case 'White - Gray':
                text = 'AAAAAA';
                link = 'AAAAAA';
                table = 'AAAAAA';
                break;
            case 'White - Green':
                link = '008000';
                break;
            case 'Gray - Blue':
                bg = 'EEEEEE';
                break;
            case 'Light Red - Pale Blue':
                bg = 'FFEEE3';
                text = '555555';
                link = '7F75AA';
                break;
            case 'Black - Blue':
                bg = '000000';
                text = 'FFFFFF';
                link = '3366FF';
                table = '333333';
                break;
            case 'Dark Brown - Off-White':
                bg = '2c2c2c';
                text = 'e5e9a8';
                link = '5cb0cc';
                table = '7f7f7f';
                break;
            case 'Black - Green':
                bg = '000000';
                text = 'FFFFFF';
                link = '00FF00';
                table = '333333';
                break;
            case 'Black - Red':
                bg = '000000';
                text = 'FFFFFF';
                link = 'FF0000';
                table = '333333';
                break;
            case 'Black - Pink':
                bg = '000000';
                text = 'FFFFFF';
                link = 'FF1CAE';
                table = '333333';
                break;
        }
        $('#s_bg').val(bg);
        $('#s_text').val(text);
        $('#s_link').val(link);
        $('#s_table').val(table);
        updateDemo();
    }
}

/* ---------- リスト関連（white/black list） ---------- */
async function addList(type) {
    let domain = $('#url').val().toLowerCase();

    if (!domain.match(/^(?:[\-\w\*\?]+(\.[\-\w\*\?]+)*|((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})|\[[A-Fa-f0-9:.]+\])?$/g)) {
        $('#listMsg').html(chrome.i18n.getMessage("invaliddomain")).stop().fadeIn("slow").delay(2000).fadeOut("slow");
    } else {
        // background に処理を頼む（domainHandler を background で実装している前提）
        if (bkg && typeof bkg.domainHandler === 'function') {
            try { await bkg.domainHandler(domain, type); } catch (e) { /* ignore */ }
        } else {
            await sendMessagePromise({
                reqtype: "domainHandler",
                domain: domain,
                action: type
            });
        }

        $('#url').val('');
        $('#listMsg').html([chrome.i18n.getMessage("whitelisted"), chrome.i18n.getMessage("blacklisted")][type] + ' ' + domain + '.').stop().fadeIn("slow").delay(2000).fadeOut("slow");
        await listUpdate();
        $('#url').focus();
    }
    return false;
}

async function domainRemover(domain) {
    if (bkg && typeof bkg.domainHandler === 'function') {
        try { await bkg.domainHandler(domain, 2); } catch (e) { /* ignore */ }
    } else {
        await sendMessagePromise({
            reqtype: "domainHandler",
            domain: domain,
            action: 2
        });
    }
    await listUpdate();
    return false;
}

async function listUpdate() {
    const result = await getStorageItems(['whiteList', 'blackList']);
    const whiteList = result.whiteList ? JSON.parse(result.whiteList) : [];
    const blackList = result.blackList ? JSON.parse(result.blackList) : [];

    let whitelistCompiled = '';
    if (whiteList.length == 0) {
        whitelistCompiled = '[' + chrome.i18n.getMessage("empty") + ']';
    } else {
        whiteList.sort();
        for (let i in whiteList) {
            whitelistCompiled += '<div class="listentry">' + whiteList[i] + ' <a href="javascript:;" style="color:#f00;float:right;" rel="' + whiteList[i] + '" class="domainRemover">X</a></div>';
        }
    }

    let blacklistCompiled = '';
    if (blackList.length == 0) {
        blacklistCompiled = '[' + chrome.i18n.getMessage("empty") + ']';
    } else {
        blackList.sort();
        for (let i in blackList) {
            blacklistCompiled += '<div class="listentry">' + blackList[i] + ' <a href="javascript:;" style="color:#f00;float:right;" rel="' + blackList[i] + '" class="domainRemover">X</a></div>';
        }
    }

    $('#whitelist').html(whitelistCompiled);
    $('#blacklist').html(blacklistCompiled);
    $(".domainRemover").unbind('click');
    $(".domainRemover").click(function () {
        domainRemover($(this).attr('rel'));
    });

    // 背景に初期化依頼
    if (bkg && typeof bkg.initLists === 'function') {
        try { bkg.initLists(); } catch (e) { /* ignore */ }
    } else {
        await sendMessagePromise({ reqtype: "initLists" });
    }

    await updateExport();
}

async function listclear(type) {
    if (confirm([chrome.i18n.getMessage("removefromwhitelist"), chrome.i18n.getMessage("removefromblacklist")][type] + '?')) {
        const key = ['whiteList', 'blackList'][type];
        await setStorageItems({ [key]: JSON.stringify([]) });
        await listUpdate();
    }
    return false;
}

/* ---------- 色の復元 ---------- */
async function revertColours() {
    const result = await getStorageItems(['s_bg', 's_text', 's_link', 's_table']);
    $('#s_bg').val(result.s_bg || '');
    $('#s_text').val(result.s_text || '');
    $('#s_link').val(result.s_link || '');
    $('#s_table').val(result.s_table || '');
    updateDemo();
}

/* ---------- カラーピッカー初期化 ---------- */
function colorPickLoad(id) {
    try {
        $('#' + id).ColorPicker({
            onBeforeShow: function () {
                $(this).ColorPickerSetColor(this.value);
            },
            onChange: function (hsb, hex, rgb) {
                $('#' + id).val(hex);
                updateDemo();
            }
        });
    } catch (e) {
        // ColorPicker ライブラリがない場合は無視
        console.warn('ColorPicker not available for', id);
    }
}

/* ---------- 設定をテキストで落とす ---------- */
function downloadtxt() {
    const textToWrite = $("#settingsexport").val();
    const textFileAsBlob = new Blob([textToWrite], { type: 'text/plain' });
    const fileNameToSaveAs = "dp-settings-" + new Date().toJSON() + ".txt";
    const downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.innerHTML = "Download File";
    downloadLink.href = window.webkitURL ? window.webkitURL.createObjectURL(textFileAsBlob) : URL.createObjectURL(textFileAsBlob);
    downloadLink.click();
    downloadLink.remove();
}

/* ---------- export を更新 ---------- */
async function updateExport() {
    const allSettings = await getStorageItems(null); // 全ての設定を取得
    $("#settingsexport").val("");
    settingnames = [];

    for (let key in allSettings) {
        if (Object.prototype.hasOwnProperty.call(allSettings, key) && key != "version") {
            settingnames.push(key);
            $("#settingsexport").val($("#settingsexport").val() + key + "|" + allSettings[key].toString().replace(/(?:\r\n|\r|\n)/g, ' ') + "\n");
        }
    }

    // 末尾の改行を削る
    $("#settingsexport").val($("#settingsexport").val().replace(/\n$/, ""));
}

/* ---------- 設定のインポート ---------- */
async function settingsImport() {
    let error = "";
    const settings = $("#settingsimport").val().split("\n");

    if ($.trim($("#settingsimport").val()) == "") {
        notification(chrome.i18n.getMessage("pastesettings"));
        return false;
    }

    if (settings.length > 0) {
        const settingsToImport = {};

        $.each(settings, function (i, v) {
            if ($.trim(v) != "") {
                const settingentry = $.trim(v).split("|");
                if (settingnames.indexOf($.trim(settingentry[0])) != -1) {
                    if ($.trim(settingentry[0]) == 'whiteList' || $.trim(settingentry[0]) == 'blackList') {
                        const listarray = $.trim(settingentry[1]).replace(/(\[|\]|")/g, "").split(",");
                        if ($.trim(settingentry[0]) == 'whiteList' && listarray.toString() != '') {
                            settingsToImport['whiteList'] = JSON.stringify(listarray);
                        } else if ($.trim(settingentry[0]) == 'blackList' && listarray.toString() != '') {
                            settingsToImport['blackList'] = JSON.stringify(listarray);
                        }
                    } else {
                        settingsToImport[$.trim(settingentry[0])] = $.trim(settingentry[1]);
                    }
                } else {
                    error += $.trim(settingentry[0]) + ", ";
                }
            }
        });

        // 設定を一括で保存
        await setStorageItems(settingsToImport);
    }

    await loadOptions();
    await listUpdate();

    if (!error) {
        notification(chrome.i18n.getMessage("importsuccessoptions"));
        $("#settingsimport").val("");
    } else {
        notification(chrome.i18n.getMessage("importsuccesscond") + error.slice(0, -2));
    }
}
