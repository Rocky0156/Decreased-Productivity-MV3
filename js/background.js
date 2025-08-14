// (c) Andrew
// Icon by dunedhel: http://dunedhel.deviantart.com/
// Supporting functions by AdThwart - T. Joseph

const version = '0.47'; // v2 -> v3

let cloakedTabs = [];
let uncloakedTabs = [];
let contextLoaded = false;
let dpicon, dptitle;
let blackList = [], whiteList = [];

function enabled(tab, dpcloakindex) {
	const dpdomaincheck = domainCheck(extractDomainFromURL(tab.url));
	dpcloakindex = dpcloakindex || cloakedTabs.indexOf(tab.windowId+"|"+tab.id);
	
	return new Promise((resolve) => {
		chrome.storage.local.get(['enable', 'global', 'newPages'], (result) => {
			const enableVal = result.enable || 'true';
			const globalVal = result.global || 'false';
			const newPagesVal = result.newPages || 'Uncloak';
			
			if ((enableVal == "true" || dpdomaincheck == '1') && 
				dpdomaincheck != '0' && 
				(globalVal == "true" || (globalVal == "false" && 
				(dpcloakindex != -1 || newPagesVal == "Cloak" || dpdomaincheck == '1')))) {
				resolve('true');
			} else {
				resolve('false');
			}
		});
	});
}

function domainCheck(domain) {
	if (!domain) return '-1';
	if (in_array(domain, whiteList) == '1') return '0';
	if (in_array(domain, blackList) == '1') return '1';
	return '-1';
}

function in_array(needle, haystack) {
	if (!haystack || !needle) return false;
	if (binarySearch(haystack, needle) != -1) return '1';
	if (needle.indexOf('www.') == 0) {
		if (binarySearch(haystack, needle.substring(4)) != -1) return '1';
	}
	for (let i in haystack) {
		if (haystack[i].indexOf("*") == -1 && haystack[i].indexOf("?") == -1) continue;
		if (new RegExp('^(?:www\\.|^)(?:'+haystack[i].replace(/\./g, '\\.').replace(/^\[/, '\\[').replace(/\]$/, '\\]').replace(/\?/g, '.').replace(/\*/g, '[^.]+')+')').test(needle)) return '1';
	}
	return false;
}

function binarySearch(list, item) {
    let min = 0;
    let max = list.length - 1;
    let guess;
	const bitwise = (max <= 2147483647) ? true : false;
	if (bitwise) {
		while (min <= max) {
			guess = (min + max) >> 1;
			if (list[guess] === item) { return guess; }
			else {
				if (list[guess] < item) { min = guess + 1; }
				else { max = guess - 1; }
			}
		}
	} else {
		while (min <= max) {
			guess = Math.floor((min + max) / 2);
			if (list[guess] === item) { return guess; }
			else {
				if (list[guess] < item) { min = guess + 1; }
				else { max = guess - 1; }
			}
		}
	}
    return -1;
}

function extractDomainFromURL(url) {
	if (!url) return "";
	if (url.indexOf("://") != -1) url = url.substr(url.indexOf("://") + 3);
	if (url.indexOf("/") != -1) url = url.substr(0, url.indexOf("/"));
	if (url.indexOf("@") != -1) url = url.substr(url.indexOf("@") + 1);
	if (url.match(/^(?:\[[A-Fa-f0-9:.]+\])(:[0-9]+)?$/g)) {
		if (url.indexOf("]:") != -1) return url.substr(0, url.indexOf("]:")+1);
		return url;
	}
	if (url.indexOf(":") > 0) url = url.substr(0, url.indexOf(":"));
	return url;
}

function domainHandler(domain, action) {
	return new Promise((resolve) => {
		chrome.storage.local.get(['whiteList', 'blackList'], (result) => {
			let tempWhitelist = result.whiteList ? JSON.parse(result.whiteList) : [];
			let tempBlacklist = result.blackList ? JSON.parse(result.blackList) : [];
			
			// Remove domain from whitelist and blacklist
			let pos = tempWhitelist.indexOf(domain);
			if (pos > -1) tempWhitelist.splice(pos, 1);
			pos = tempBlacklist.indexOf(domain);
			if (pos > -1) tempBlacklist.splice(pos, 1);
			
			switch(action) {
				case 0:	// Whitelist
					tempWhitelist.push(domain);
					break;
				case 1:	// Blacklist
					tempBlacklist.push(domain);
					break;
				case 2:	// Remove
					break;
			}
			
			chrome.storage.local.set({
				'blackList': JSON.stringify(tempBlacklist),
				'whiteList': JSON.stringify(tempWhitelist)
			}, () => {
				blackList = tempBlacklist.sort();
				whiteList = tempWhitelist.sort();
				resolve();
			});
		});
	});
}

// ----- Options
function optionExists(opt) {
	return new Promise((resolve) => {
		chrome.storage.local.get([opt], (result) => {
			resolve(result[opt] !== undefined);
		});
	});
}

function defaultOptionValue(opt, val) {
	return new Promise((resolve) => {
		chrome.storage.local.get([opt], (result) => {
			if (result[opt] === undefined) {
				chrome.storage.local.set({[opt]: val}, resolve);
			} else {
				resolve();
			}
		});
	});
}

async function setDefaultOptions() {
	await defaultOptionValue("version", version);
	await defaultOptionValue("enable", "true");
	await defaultOptionValue("enableToggle", "true");
	await defaultOptionValue("hotkey", "CTRL F12");
	await defaultOptionValue("paranoidhotkey", "ALT P");
	await defaultOptionValue("global", "false");
	await defaultOptionValue("newPages", "Uncloak");
	await defaultOptionValue("sfwmode", "SFW");
	await defaultOptionValue("savedsfwmode", "");
	await defaultOptionValue("opacity1", "0.05");
	await defaultOptionValue("opacity2", "0.5");
	await defaultOptionValue("collapseimage", "false");
	await defaultOptionValue("showIcon", "true");
	await defaultOptionValue("iconType", "coffee");
	await defaultOptionValue("iconTitle", "Decreased Productivity");
	await defaultOptionValue("disableFavicons", "false");
	await defaultOptionValue("hidePageTitles", "false");
	await defaultOptionValue("pageTitleText", "Google Chrome");
	await defaultOptionValue("enableStickiness", "false");
	await defaultOptionValue("maxwidth", "0");
	await defaultOptionValue("maxheight", "0");
	await defaultOptionValue("showContext", "true");
	await defaultOptionValue("showUnderline", "true");
	await defaultOptionValue("removeBold", "false");
	await defaultOptionValue("showUpdateNotifications", "true");
	await defaultOptionValue("font", "Arial");
	await defaultOptionValue("customfont", "");
	await defaultOptionValue("fontsize", "12");
	await defaultOptionValue("s_bg", "FFFFFF");
	await defaultOptionValue("s_link", "000099");
	await defaultOptionValue("s_table", "cccccc");
	await defaultOptionValue("s_text", "000000");
	await defaultOptionValue("customcss", "");
	await defaultOptionValue("blackList", JSON.stringify([]));
	await defaultOptionValue("whiteList", JSON.stringify([]));
	
	// Fix hotkey format if needed
	chrome.storage.local.get(['hotkey'], (result) => {
		if (result.hotkey && result.hotkey.indexOf('+') != -1) {
			const fixedHotkey = result.hotkey.replace(/\+$/, "APLUSA").replace(/\+/g, " ").replace(/APLUSA/, "+");
			chrome.storage.local.set({'hotkey': fixedHotkey});
		}
	});
	
	// Clean up old options
	chrome.storage.local.remove(['globalEnable', 'style']);
	
	// Fix SFW mode
	chrome.storage.local.get(['sfwmode'], (result) => {
		if (result.sfwmode == "true") {
			chrome.storage.local.set({'sfwmode': "SFW"});
		}
	});
}

// Context Menu
function createContextMenus() {
	chrome.contextMenus.create({
		"id": "whitelist-domain",
		"title": chrome.i18n.getMessage("whitelistdomain"), 
		"contexts": ['action']
	});
	
	chrome.contextMenus.create({
		"id": "blacklist-domain",
		"title": chrome.i18n.getMessage("blacklistdomain"), 
		"contexts": ['action']
	});
	
	chrome.contextMenus.create({
		"id": "remove-list",
		"title": chrome.i18n.getMessage("removelist"), 
		"contexts": ['action']
	});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (tab.url.substring(0, 4) != 'http') return;
	
	const domain = extractDomainFromURL(tab.url);
	const result = await chrome.storage.local.get(['enable']);
	const enable = result.enable || 'true';
	
	switch(info.menuItemId) {
		case 'whitelist-domain':
			await domainHandler(domain, 0);
			if (enable == "true") magician('false', tab.id);
			break;
		case 'blacklist-domain':
			await domainHandler(domain, 1);
			if (enable == "true") magician('true', tab.id);
			break;
		case 'remove-list':
			await domainHandler(domain, 2);
			if (enable == "true") {
				const settings = await chrome.storage.local.get(['newPages', 'global']);
				let flag = 'false';
				if (settings.newPages == 'Cloak' || settings.global == 'true') flag = 'true';
				magician(flag, tab.id);
			}
			break;
	}
});

function dpContext() {
	chrome.storage.local.get(['showContext'], (result) => {
		if (result.showContext == 'true' && !contextLoaded) {
			chrome.contextMenus.create({
				"id": "open-safely",
				"title": chrome.i18n.getMessage("opensafely"), 
				"contexts": ['link', 'image']
			});
			contextLoaded = true;
		}
	});
}

// ----- Main Functions
function checkChrome(url) {
	return url.substring(0, 6) == 'chrome';
}

function hotkeyChange() {
	chrome.windows.getAll({"populate": true}, (windows) => {
		windows.forEach(window => {
			window.tabs.forEach(tab => {
				if (!checkChrome(tab.url)) {
					chrome.storage.local.get(['enableToggle', 'hotkey', 'paranoidhotkey'], (result) => {
						chrome.scripting.executeScript({
							target: { tabId: tab.id, allFrames: true },
							func: (enableToggle, hotkey, paranoidhotkey) => {
								if (typeof hotkeySet === 'function') {
									hotkeySet(enableToggle, hotkey, paranoidhotkey);
								}
							},
							args: [result.enableToggle, result.hotkey, result.paranoidhotkey]
						});
					});
				}
			});
		});
	});
}

function magician(enable, tabId) {
	chrome.storage.local.get(['disableFavicons', 'hidePageTitles', 'pageTitleText', 'showIcon', 'iconType', 'iconTitle'], (settings) => {
		if (enable == 'true') {
			chrome.scripting.executeScript({
				target: { tabId: tabId, allFrames: true },
				func: (disableFavicons, hidePageTitles, pageTitleText) => {
					if (typeof init === 'function') init();
					if (disableFavicons == 'true' && typeof faviconblank === 'function') faviconblank();
					else if (typeof faviconrestore === 'function') faviconrestore();
					
					if (hidePageTitles == 'true') {
						if (typeof replaceTitle === 'function') replaceTitle(pageTitleText);
						if (typeof titleBind === 'function') titleBind(pageTitleText);
					} else if (typeof titleRestore === 'function') {
						titleRestore();
					}
				},
				args: [settings.disableFavicons, settings.hidePageTitles, settings.pageTitleText]
			});
		} else {
			chrome.scripting.executeScript({
				target: { tabId: tabId, allFrames: true },
				func: () => {
					if (typeof removeCss === 'function') removeCss();
				}
			});
		}
		
		if (settings.showIcon == 'true') {
			const iconType = settings.iconType || 'coffee';
			let iconPath;
			
			if (enable == 'true') {
				iconPath = `img/addressicon/${iconType}.png`;
			} else {
				iconPath = `img/addressicon/${iconType}.png`;
			}
			
			chrome.action.setIcon({ path: iconPath, tabId: tabId }, () => {
				if (chrome.runtime.lastError) {
					console.warn(`Icon not found: ${iconPath}, using default icon`);
					const defaultIcon = chrome.runtime.getURL("img/icon16.png");
					chrome.action.setIcon({ path: defaultIcon, tabId: tabId }, () => {
						if (chrome.runtime.lastError) {
							console.error('No valid icon found');
						}
					});
				}
			});

			
			chrome.action.setTitle({title: settings.iconTitle || 'Decreased Productivity', tabId: tabId});
		}
	});
}

async function initLists() {
	const result = await chrome.storage.local.get(['blackList', 'whiteList']);
	blackList = result.blackList ? JSON.parse(result.blackList).sort() : [];
	whiteList = result.whiteList ? JSON.parse(result.whiteList).sort() : [];
}

// Event Listeners
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status == "loading") {
		const dpTabId = tab.windowId + "|" + tabId;
		const dpcloakindex = cloakedTabs.indexOf(dpTabId);
		const enableResult = await enabled(tab, dpcloakindex);
		
		const settings = await chrome.storage.local.get(['showIcon', 'iconType', 'iconTitle']);
		
		if (settings.showIcon == "true") {
			const iconType = settings.iconType || 'coffee';
			const iconPath = `img/addressicon/${iconType}.png`;
			
			chrome.action.setIcon({ path: iconPath, tabId: tabId }, () => {
				if (chrome.runtime.lastError) {
					console.warn(`Icon not found: ${iconPath}, using default icon`);
					const defaultIcon = chrome.runtime.getURL("img/icon16.png");
					chrome.action.setIcon({ path: defaultIcon, tabId: tabId }, () => {
						if (chrome.runtime.lastError) {
							console.error('No valid icon found');
						}
					});
				}
			});
			
			chrome.action.setTitle({title: settings.iconTitle || 'Decreased Productivity', tabId: tabId});
		}
		
		if (checkChrome(tab.url)) return;
		
		const dpuncloakindex = uncloakedTabs.indexOf(dpTabId);
		if (enableResult == "true") {
			magician('true', tabId);
			const globalSettings = await chrome.storage.local.get(['global', 'enable']);
			if (globalSettings.global == "false" && globalSettings.enable == "false") {
				chrome.storage.local.set({'enable': 'true'});
			}
			if (dpcloakindex == -1) cloakedTabs.push(dpTabId);
			if (dpuncloakindex != -1) uncloakedTabs.splice(dpuncloakindex, 1);
		} else {
			// Handle stickiness logic here if needed
			if (dpuncloakindex == -1) uncloakedTabs.push(dpTabId);
			if (dpcloakindex != -1) cloakedTabs.splice(dpcloakindex, 1);
		}
	}
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
	const dpTabId = removeInfo.windowId + "|" + tabId;
	const dpcloakindex = cloakedTabs.indexOf(dpTabId);
	const dpuncloakindex = uncloakedTabs.indexOf(dpTabId);
	if (dpcloakindex != -1) cloakedTabs.splice(dpcloakindex, 1);
	if (dpuncloakindex != -1) uncloakedTabs.splice(dpuncloakindex, 1);
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	switch(request.reqtype) {
		case "get-enabled":
			(async () => {
				const dpTabId = sender.tab.windowId + "|" + sender.tab.id;
				const dpcloakindex = cloakedTabs.indexOf(dpTabId);
				const enableResult = await enabled(sender.tab, dpcloakindex);
				
				if (enableResult == 'true' && dpcloakindex == -1) {
					cloakedTabs.push(dpTabId);
				}
				
				const settings = await chrome.storage.local.get([
					's_bg', 'disableFavicons', 'hidePageTitles', 'pageTitleText',
					'enableToggle', 'hotkey', 'paranoidhotkey'
				]);
				
				sendResponse({
					enable: enableResult,
					background: settings.s_bg,
					favicon: settings.disableFavicons,
					hidePageTitles: settings.hidePageTitles,
					pageTitleText: settings.pageTitleText,
					enableToggle: settings.enableToggle,
					hotkey: settings.hotkey,
					paranoidhotkey: settings.paranoidhotkey
				});
			})();
			return true;
			
		case "get-settings":
			(async () => {
				const settings = await chrome.storage.local.get([
					'font', 'customfont', 'global', 'sfwmode', 'fontsize', 'showUnderline',
					's_bg', 's_text', 's_table', 's_link', 'removeBold', 'opacity1', 'opacity2',
					'collapseimage', 'maxheight', 'maxwidth', 'customcss'
				]);
				
				let fontface;
				if (settings.font == '-Custom-') {
					fontface = settings.customfont || 'Arial';
				} else {
					fontface = settings.font || 'Arial';
				}
				
				let enable;
				if (settings.global == "false") {
					enable = 'true';
				} else {
					enable = await enabled(sender.tab);
				}
				
				sendResponse({
					enable: enable,
					sfwmode: settings.sfwmode,
					font: fontface,
					fontsize: settings.fontsize,
					underline: settings.showUnderline,
					background: settings.s_bg,
					text: settings.s_text,
					table: settings.s_table,
					link: settings.s_link,
					bold: settings.removeBold,
					opacity1: settings.opacity1,
					opacity2: settings.opacity2,
					collapseimage: settings.collapseimage,
					maxheight: settings.maxheight,
					maxwidth: settings.maxwidth,
					customcss: settings.customcss
				});
			})();
			return true;
			
		// Add other message handlers as needed
	}
});

// Action click handler
chrome.action.onClicked.addListener((tab) => {
	// Handle tab cloaking logic here
});

// Initialize
(async () => {
	await setDefaultOptions();
	await initLists();
	createContextMenus();
	dpContext();
	
	// Check for updates
	const result = await chrome.storage.local.get(['version', 'showUpdateNotifications']);
	if ((!result.version || result.version != version) && result.showUpdateNotifications == 'true') {
		chrome.storage.local.set({'version': version});
	}
})();