import * as common from '/pages/src/common.mjs';
import * as locale from '/shared/sauce/locale.mjs';
import * as fields from '/pages/src/fields.mjs';
import { PowerUpField } from '/pages/src/fields.mjs';

const H = locale.human;
let settings = common.settingsStore.get();
console.log("settings on load", settings)
common.settingsStore.set("profileOverlay", false);
common.settingsStore.set("fields", 0);
common.settingsStore.set("tiltShift", true)
common.settingsStore.set("zoomPriorityTilt", false)
if (isNaN(settings.dataFields)) {
    common.settingsStore.set('dataFields', 6);
}
if (isNaN(settings.actionButtons)) {
    common.settingsStore.set('actionButtons', 5);
}

if (settings.showFieldNames === undefined) {
    common.settingsStore.set('showFieldNames', true);
}
if (settings.peekBackDuration === undefined) {
    common.settingsStore.set('peekBackDuration', 5);
    common.settingsStore.set('tiltShiftAmount', 0);
    common.settingsStore.set('zoom', 2);    
}
//const rideOnBombButton = document.getElementById("rideOnBombButton");
//const toggleHudButton = document.getElementById("toggleHudButton");
//const disableHudButton = document.getElementById("disableHudButton");
//const takePictureButton = document.getElementById("takePictureButton");
//const powerUpButton = document.getElementById("powerUpButton");
//const toggleChatButton = document.getElementById("toggleChatButton");
const content = document.getElementById("content");
const caChat = document.getElementById("caChatDiv");
const caActions = document.getElementById("caActions");
const caTeleports = document.getElementById("caTeleports");
const caTeleportsOption = document.getElementById("caTeleportsOption");
const caTeleportsData = document.getElementById("caTeleportsData");
const chatMessages = document.getElementById("chatMessages");
const sendMessageButton = document.getElementById("sendMessageButton");
const chatForm = document.getElementById("chatForm");
const powerData = document.getElementById("power");
const speedData = document.getElementById("speed");
const cadenceData = document.getElementById("cadence");
const draftData = document.getElementById("draft");
const distanceData = document.getElementById("distance");
const timeData = document.getElementById("time");
const currentTimeData = document.getElementById("currentTime");
const chatCounter = document.getElementById("chatCounter");
const powerupSvgSource = "/pages/images/powerups/";
const powerUpDisplay = document.querySelector('.powerUpDisplay');
const tabMap = document.getElementById('tabMap');
const tabChat = document.getElementById('tabChat');
const tabActions = document.getElementById('tabActions');
const tabTeleports = document.getElementById('tabTeleports');
const allTabs = document.querySelectorAll('.tab');
const radioTeleportOptions = document.querySelectorAll('input[name="radioTeleports"]')
const actionButtonOne = document.getElementById("buttonOne");
const actionButtonTwo = document.getElementById("buttonTwo");
const actionButtonThree = document.getElementById("buttonThree");
const actionButtonFour = document.getElementById("buttonFour");
const actionButtonFive = document.getElementById("buttonFive");
const tiltButton = document.querySelector('.toggle-tilt');
//const caButtonDivs = document.querySelectorAll('.caButton');
let caButtonDivs;
let actionButtonLocation = settings.actionButtonLocation || "bottom";
let caButtonsDiv;

//const caButtonsDiv = document.getElementById("caButtons");
const dataFields = document.getElementById("dataFields");
let gcEnabled = false;
let fieldRenderer
let chatActive = false;
let actionsActive = false;
let watchingAthlete = null;
let lastScrollTime = Date.now() - 100000;
let unreadChats = 0;
let lastChatUpdateTime = Date.now() - 10000;
let lastActionUpdateTime = Date.now() - 1000;
let lastButtonUpdateTime = Date.now() - 1000;
let powerUpField;
let peekBackInfo = {
    active: false,
    ts: Date.now(),
    delay: 0
}
function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}
function changeFontScaleChat() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale-chat', common.settingsStore.get('fontScaleChat') || 1);  
}
changeFontScale();
changeFontScaleChat();
const customActions = {
    peekBack
};
const wattLockPlus = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <!-- Lightning bolt -->
  <g transform="translate(-2 5) scale(0.85)">
    <path
        d="M55 5 L25 53 H45 L38 95 L75 40 H53 Z"
        fill="#FFD43B"
    />
  </g>

  <!-- Plus symbol -->
  <g transform="translate(-5 -5)">
    <path
        d="M80 65 V95 M65 80 H95"
        stroke="#000000"
        stroke-width="7"
        stroke-linecap="round"
        fill="none"
    />
  </g>
</svg>`
const wattLockMinus = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <!-- Lightning bolt -->
  <g transform="translate(-2 5) scale(0.85)">
    <path
        d="M55 5 L25 53 H45 L38 95 L75 40 H53 Z"
        fill="#FFD43B"
    />
  </g>

  <!-- Minus symbol -->
  <g transform="translate(-5 -5)">
    <path
        d="M65 80 H95"
        stroke="#000000"
        stroke-width="7"
        stroke-linecap="round"
        fill="none"
    />
  </g>
</svg>`

export const caButtons = [
    {
        id: 0,
        title: 'Rideon Bomb',
        target: common.rpc,
        action: 'say',
        arg: 'rideon',
        icon: '&#x1F4A3;'
    },
    {
        id: 1,
        title: 'Peek back',
        target: customActions,
        action: 'peekBack',
        arg: settings.peekBackDuration * 1000 || 5000,
        icon: '&#x1F440;'
    },
    {
        id: 2,
        title: 'Toggle HUD',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'display:toggle_hud',
        icon: '&#11034;'
    },
    {
        id: 3,
        title: 'Screenshot',
        target: common.rpc,
        action: 'takePicture',
        arg: '',
        icon: '&#128247;'
    },
    {
        id: 4,
        title: 'PowerUp',
        target: common.rpc,
        action: 'powerup',
        arg: '',
        icon: ''
    },
    {
        id: 5,
        title: 'Toss PowerUp',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'gameplay:toss_powerup',
        icon: '&#128465;'
    },
    {
        id: 6,
        title: 'Coffee break',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'navigation:coffee_stop',
        icon: '&#x2615;'
    },
    {
        id: 7,
        title: 'New Split',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'gameplay:new_split',
        icon: '&#9201;'
    },
    {
        id: 8,
        title: 'Video Screenshot',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'media:movie',
        icon: '&#x1F3A5;'
    },
    {
        id: 9,
        title: 'U-Turn',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'navigation:u_turn',
        icon: '&#x21B6;'
    },
    {
        id: 10,
        title: 'Watt Lock',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'gameplay:watt_lock',
        argToggle: 'gameplay:watt_unlock',
        icon: '<ms>lock</ms>',
        toggleIcon: '<ms>no_encryption</ms>',
        toggle: true,
        toggled: false,
        hasChildren: true,
        childButtons: [11, 12]
    },
    {
        id: 11,
        title: 'Increase Watt Lock',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'gameplay:watt_adjust_up',
        icon: wattLockPlus,
        isChild: true,
        repeatable: true
    },
    {
        id: 12,
        title: 'Decrease Watt Lock',
        target: common.rpc,
        action: 'runUserAction',
        arg: 'gameplay:watt_adjust_dn',
        icon: wattLockMinus,
        isChild: true,
        repeatable: true
    }
];

for (let i = 1; i <= 5; i++) {
    if (!settings[`button${i}`]) {
        common.settingsStore.set(`button${i}`, `${i - 1}`)
    }
}
function updateConnStatus(s) {
    console.log("Updating game connection status", s)
    if (!s) {
        s = {connected: false, state: 'disabled'};
    }    
    //const gcStatus = document.getElementById("gcStatus")
    const gcState = s.state == "connected" ? "&#x2705;" : s.state == "waiting" ? "waiting" : "&#x274C;"
    //gcStatus.innerHTML = `Game connection: ${gcState}&nbsp; <div id="paused"></div>`
    if (s.state != "connected") {
        const warningDiv = document.getElementById("caButtons");
        //warningDiv.innerHTML = `Game connection: ${gcState}&nbsp; Must be "connected" for action buttons`
    } 
    if (s.state === "connected" && !gcEnabled) {
        populateButtons();
    }
    if (s.state === "connected") {
        gcEnabled = true;
    } else {
        gcEnabled = false;
    };
};
function setupLongPress(button, callback) {
    let pressTimer;
    let repeatTimer;
    let isPressed = false;
    let pointerEvent;

    button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        isPressed = false;
        pointerEvent = e;

        pressTimer = setTimeout(() => {
            isPressed = true;
            callback(pointerEvent);
            repeatTimer = setInterval(() => callback(pointerEvent), 100);

        }, 750);
    });

    function stopPress() {
        clearTimeout(pressTimer);
        clearInterval(repeatTimer);
    }

    button.addEventListener("pointerup", () => {
        if (!isPressed) {
            stopPress();
            callback(pointerEvent);
        } else {
            stopPress();
        }
    });

    button.addEventListener("pointerleave", stopPress);
    button.addEventListener("pointercancel", stopPress);
};

async function doButtonAction(id) {
    const buttonData = caButtons[id];

    if (!buttonData) {
        return;
    }
    if (buttonData.toggle && !buttonData.toggled) {
        const fn = buttonData.target[buttonData.action];

        if (typeof fn !== 'function') {
            console.error(`Invalid action: ${buttonData.action}`);
            return;
        }
        console.log("running", buttonData.arg)
        await fn(buttonData.arg);
    } else if (buttonData.toggle && buttonData.toggled) {
        const fn = buttonData.target[buttonData.action];

        if (typeof fn !== 'function') {
            console.error(`Invalid action: ${buttonData.action}`);
            return;
        }
        console.log("running", buttonData.argToggle)
        await fn(buttonData.argToggle);
    } else {
        const fn = buttonData.target[buttonData.action];

        if (typeof fn !== 'function') {
            console.error(`Invalid action: ${buttonData.action}`);
            return;
        }
        console.log("running", buttonData.arg)
        await fn(buttonData.arg);
    }
    //check toggle status here
    //debugger
    
};

async function peekBack(delay) {
    if (delay === 0) {
        console.log("peekBack complete, switching back to front")
        await common.rpc.runUserAction('camera:follow')
        peekBackInfo.active = false;
    } else {
        delay = settings.peekBackDuration * 1000 || delay
        console.log("peeking back, delay is ", delay)
        await common.rpc.runUserAction('camera:lead');
        peekBackInfo = {
            active: true,
            ts: Date.now(),
            delay: delay
        }
    }
}
if (content) {
    
    fieldRenderer = new fields.Renderer(dataFields, {fps: 5});
    tabMap.addEventListener("click", async () => {
        allTabs.forEach(x => x.classList.remove('active'));
        tabMap.classList.add('active');
        content.classList.remove("hidden");
        caChat.classList.add("hidden");
        caActions.classList.add("hidden");
        caTeleports.classList.add("hidden");
        chatActive = false;
        actionsActive = false;
        //await common.rpc.collapseUserAction('teleport:friends')
        //await common.rpc.collapseUserAction('teleport')
    });
    tabChat.addEventListener("click", async () => {
        if (!gcEnabled) {
            return;
        }
        const initialNewMessage = document.getElementById("newMessageText");
        const newMsg = initialNewMessage.cloneNode(true);
        initialNewMessage.replaceWith(newMsg);
        allTabs.forEach(x => x.classList.remove('active'));
        tabChat.classList.add('active');
        caChat.classList.remove("hidden");
        content.classList.add("hidden");
        caActions.classList.add("hidden");
        caTeleports.classList.add("hidden");
        chatActive = true;
        actionsActive = false;
        unreadChats = 0;
        chatCounter.innerHTML = "0";
        chatMessages.scrollTop = chatMessages.scrollHeight;
        //await common.rpc.collapseUserAction('teleport:friends')
        //await common.rpc.collapseUserAction('teleport')
    });
    tabActions.addEventListener("click", async () => {
        if (!gcEnabled) {
            return;
        }
        allTabs.forEach(x => x.classList.remove('active'));
        tabActions.classList.add('active'); 
        content.classList.add('hidden');
        caChat.classList.add("hidden");
        caActions.classList.remove("hidden");
        caTeleports.classList.add("hidden");
        chatActive = false; 
        actionsActive = true;  
        await updateUserActions();
        //await common.rpc.collapseUserAction('teleport:friends')
        //await common.rpc.collapseUserAction('teleport')
    });
    tabTeleports.addEventListener("click", async () => {
        if (!gcEnabled) {
            return;
        }
        allTabs.forEach(x => x.classList.remove('active'));
        tabTeleports.classList.add('active'); 
        content.classList.add('hidden');
        caChat.classList.add("hidden");
        caActions.classList.add("hidden");
        caTeleports.classList.remove("hidden");
        chatActive = false;
        actionsActive = false;
        await updateTeleports();
    });
    chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage();
    });
    chatMessages.addEventListener("wheel", () => {
        lastScrollTime = Date.now();
    });
    chatMessages.addEventListener("touchstart", () => {
        lastScrollTime = Date.now();
    });
    chatMessages.addEventListener("scroll", () => {
        lastScrollTime = Date.now();
    });    
    radioTeleportOptions.forEach(opt => {
        opt.addEventListener("change", updateTeleports)
    });
    tiltButton.addEventListener("click", () => {
        const currentTilt = settings.tiltShiftAmount;
        console.log("initial tilt", currentTilt)
        if (currentTilt < 25) {
            common.settingsStore.set('tiltShiftAmount', 25);
            zwiftMap.setTiltAngle(25)
        } else if (currentTilt < 50) {
            common.settingsStore.set('tiltShiftAmount', 50);
            zwiftMap.setTiltAngle(40)
        } else if (currentTilt < 75) {
            common.settingsStore.set('tiltShiftAmount', 75)
            zwiftMap.setTiltAngle(55)
        } else {
            common.settingsStore.set('tiltShiftAmount', 0)
            zwiftMap.setTiltAngle(0)
        }
        //zwiftMap.setTiltAngle(settings.tiltShiftAmount)
        console.log("settings.tiltShiftAmount", settings.tiltShiftAmount)
    })
}
async function sendMessage() {
    const newMessageText = document.getElementById("newMessageText");
    const messageText = newMessageText.value;
    if (messageText) {
        await common.rpc.chatMessage(messageText);
        newMessageText.value = "";
    };
};
const formatTime = (milliseconds) => {   
    milliseconds = milliseconds * 1000;     
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0)
    {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    if (minutes != 0)
    {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    else
    {
        return seconds.toString().padStart(1, "0");
    }
};
function updateChatAges() {
    const now = Date.now();
    chatMessages.querySelectorAll('.chatAge').forEach(el => {
        const ts = Number(el.dataset.age);
        if (!ts) {
            return;
        };
        const timeDiff = now - ts;
        const seconds = Math.floor((timeDiff / 1000) % 60);
        const minutes = Math.floor((timeDiff / 1000 / 60) % 60);
        let chatAge;
        if (minutes != 0) {
            chatAge = `${minutes}m ago`;
        } else {
            chatAge = `${seconds}s ago`;
        }
        el.innerHTML = chatAge;
    });
    lastChatUpdateTime = Date.now();
}
function onGameState(gameState) {
    //console.log("gameState", gameState);
    common.softInnerHTML(powerUpDisplay, powerUpField.format({gameState}));
    for (let button of caButtonDivs) {
        if (button.dataset.action === "4") {
            common.softInnerHTML(button, powerUpField.format({gameState}))
        }
    }
    updateButtons();
}
async function onPowerUpClick() {
    if (powerUpDisplay.querySelector('.field-powerup.available')) {
        console.log("powerup available and clicked")
        await common.rpc.powerup();
    } else {
        console.log("no powerup available")
    }
}
async function updateTeleports() {        
    //await common.rpc.expandUserAction('teleport:friends')
    //await common.rpc.expandUserAction('teleport:pacers')
    await common.rpc.expandUserAction('teleport:pacers')
    await common.rpc.expandUserAction('teleport:friends')
    const userActions = await common.rpc.getUserActions();
    console.log("userActions", userActions)
    
    const teleportPacers = userActions.filter(x => x.parentURI === "teleport:pacers");
    teleportPacers.sort((a,b) => {
        return parseInt(a.displayParameters[1].value) - parseInt(b.displayParameters[1].value);
    });
    const teleportFriends = userActions.filter(x => x.parentURI === "teleport:friends");
    let caTeleportsOutput = "";
    const selectedTeleport = document.querySelector('input[name="radioTeleports"]:checked')
    if (selectedTeleport.value === "friends") {
        for (let friend of teleportFriends) {
            const name = friend.displayParameters.find(x => x.placement === 2)?.value || "";
            const route = friend.displayParameters.find(x => x.placement === 3)?.value || "";
            const wkg = friend.displayParameters.find(x => x.placement === 4)?.value || "";
            const unit = friend.displayParameters.find(x => x.placement === 4)?.unit || "";
            const time = friend.displayParameters.find(x => x.placement === 5)?.value || "";
            
            const friendDiv = `<div class='pacerCard' data-uri='${friend.uri}'>
                                <div class='leftCard'>
                                    <div class='pacerDesc'>${name}</div>
                                    <div class='pacerRoute'>${route}</div>
                                </div>
                                <div class='rightCard'>
                                    <div class='pacerGroupSize'>${wkg}&nbsp;${unit}</div>
                                    <div class='pacerElevation'>${time}</div>
                                </div>
                                <div class='buttonCard'>
                                    <div class="pacerButton button caButton std icon" data-zid='${friend.uri}'>&#x1F441;</div>
                                    <div class="pacerButton button caButton std icon" data-uri='${friend.uri}'><ms>flare</ms></div>
                                </div>
                            </div>`;
            caTeleportsOutput += friendDiv;        
        };
    } else {
        for (let pacer of teleportPacers) {
            const pacerId = pacer.uri.replace("teleport:pacers:", "");
            const pacerData = await common.rpc.getAthlete(parseInt(pacerId))
            console.log("pacerData", pacerData)
            const wkg = pacer.displayParameters.find(x => x.placement === 2)?.value || "";
            const unit = pacer.displayParameters.find(x => x.placement === 2)?.unit || "";
            const route = pacer.displayParameters.find(x => x.placement === 3)?.value || "";
            const groupSize = pacer.displayParameters.find(x => x.placement === 4)?.value || "";
            const elevation = pacer.displayParameters.find(x => x.placement === 5)?.value || "";
            const pacerDiv = `<div class='pacerCard' '>
                                <div class='leftCard'>
                                    <div class='pacerDesc'>${pacerData?.sanitizedFullname}: ${wkg}&nbsp;${unit}</div>
                                    <div class='pacerRoute'>${route}</div>
                                </div>
                                <div class='rightCard'>
                                    <div class='pacerGroupSize'>${groupSize}</div>
                                    <div class='pacerElevation'>${elevation}m</div>
                                </div>
                                <div class='buttonCard'>
                                    <div class="watchButton button caButton std icon" data-zid='${pacer.uri}'>&#x1F441;</div>
                                    <div class="pacerButton button caButton std icon" data-uri='${pacer.uri}'><ms>flare</ms></div>
                                </div>
                            </div>`;
            caTeleportsOutput += pacerDiv;        
        };
    }
    caTeleportsData.innerHTML = caTeleportsOutput;
    const teleportCards = document.querySelectorAll('.pacerButton, .watchButton');
    for (let card of teleportCards) {
        card.addEventListener("click", async () => {
            const uri = card.dataset.uri;
            const uriZid = card.dataset.zid;
            if (uri) {
                console.log("running user action", uri)
                await common.rpc.runUserAction(uri);
            } else if (uriZid) {
                const zid = uriZid.replace("teleport:friends:", "").replace("teleport:pacers:", "");
                const selfData = await common.rpc.getAthleteData('self');
                //const watchingData = await common.rpc.getAthleteData('watching');
                if (watchingAthlete === selfData.athleteId || watchingAthlete != zid) {
                    console.log("watching", zid)
                    console.log("card inner", card)
                    await common.rpc.watch(zid);
                    document.querySelectorAll('.watchButton').forEach(x => {
                        x.innerHTML = '&#x1F441;'
                    });
                    card.innerHTML = "<ms>undo</ms>"
                } else {
                    console.log("watching self")
                    await common.rpc.watch(selfData.athleteId);
                    document.querySelectorAll('.watchButton').forEach(x => {
                        x.innerHTML = '&#x1F441;'
                    });
                }
            }
        });
    }
}
function onUserActionsSet(actions) {
    console.log("actions", actions)
}

async function updateButtons() {
    const userActions = await common.rpc.getUserActions();
    caButtonDivs = document.querySelectorAll('.caButton, .caButtonVertical');
    for (let caButton of caButtonDivs) {
        const thisButtonData = caButtons.find(x => x.id == caButton.dataset.action);
        caButton.classList.toggle("disabled", !gcEnabled);        
        if (thisButtonData && thisButtonData.toggle) {
            const buttonAction = userActions.find(x => x.uri === thisButtonData.arg && x.presentable);
            const buttonActionAlt = userActions.find(x => x.uri === thisButtonData.argToggle && x.presentable);
            if (buttonAction) {
                caButton.innerHTML = thisButtonData.icon;
                caButton.dataset.toggle = "0";
                thisButtonData.toggled = false;
                caButton.classList.toggle("disabled", !buttonAction.enabled)
                if (thisButtonData.hasChildren) {
                    const childButtons = [...document.querySelectorAll('div[data-action]')].filter(div => thisButtonData.childButtons.includes(Number(div.dataset.action)));
                    childButtons?.forEach(button => button.classList.add("hidden"));
                }
            } else if (buttonActionAlt) {
                caButton.innerHTML = thisButtonData.toggleIcon;
                caButton.dataset.toggle = "1";
                thisButtonData.toggled = true;
                caButton.classList.toggle("disabled", !buttonActionAlt.enabled)   
                if (thisButtonData.hasChildren) {
                    const childButtons = [...document.querySelectorAll('div[data-action]')].filter(div => thisButtonData.childButtons.includes(Number(div.dataset.action)));
                    childButtons?.forEach(button => button.classList.remove("hidden"));
                }             
            } else {
                caButton.classList.add("disabled");
            }
        }
        if (!zwiftMap?.watchingId) {
            caButton.classList.add("disabled");
        }
        
        if (!gcEnabled) {
            caButton.title = "Sauce Game Connection must be enabled and connected for buttons to be enabled."
        } else {
            caButton.title = ""
        }
    }
    const tabDivs = document.querySelectorAll('.tab');
    
    for (let tab of tabDivs) {
        if (!gcEnabled || !zwiftMap.watchingId) {
            if (tab.id === "tabMap") {
                tabMap.click();
            } else {
                tab.classList.remove("active");
                tab.classList.add("disabled");
            }
        } else {
            tab.classList.remove("disabled");
        }
    }
}

async function updateUserActions() {
    const userActions = await common.rpc.getUserActions();
    console.log("userActions", userActions);
    const cameraActions = userActions.filter(x => x.parentURI === 'camera');
    const displayActions = userActions.filter(x => x.parentURI === 'display');
    const emoteActions = userActions.filter(x => x.parentURI === 'emotes:gestures' || x.parentURI === 'emotes:sounds');
    const navigationActions = userActions.filter(x => x.parentURI === 'navigation');
    const gameplayActions = userActions.filter(x => x.parentURI === 'gameplay');
    const mediaActions = userActions.filter(x => x.parentURI === 'media');
    let actionsOutput = "";
    if (cameraActions.length > 0) {
        actionsOutput = "<div class='actionsTitle'>Camera view<div></div>";
        for (let action of cameraActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    if (displayActions.length > 0) {
        actionsOutput += "<div class='actionsTitle'>Display<div></div>"
        for (let action of displayActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    if (emoteActions.length > 0) {
        actionsOutput += "<div class='actionsTitle'>Emotes<div></div>"
        for (let action of emoteActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    if (gameplayActions.length > 0) {
        actionsOutput += "<div class='actionsTitle'>Gameplay<div></div>"
        for (let action of gameplayActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    if (navigationActions.length > 0) {
        actionsOutput += "<div class='actionsTitle'>Navigation<div></div>"
        for (let action of navigationActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    if (mediaActions.length > 0) {
        actionsOutput += "<div class='actionsTitle'>Media<div></div>"
        for (let action of mediaActions) {
            const actionEnabled = action.enabled && action.presentable;
            const actionCard = `<div class='actionCard ${actionEnabled ? "" : settings.showDisabledActions ? "actionDisabled" : "hidden"}' data-uri=${action.uri}>${actionEnabled ? "&#x2705;" : "&#x274C;"}&nbsp;${action.locTitle}</div>`
            actionsOutput += actionCard;
        };
        actionsOutput += "</div>"
    };
    caActions.innerHTML = actionsOutput;
    const actionCards = document.querySelectorAll('.actionCard:not(.actionDisabled)');
    for (let card of actionCards) {
        card.addEventListener("click", async () => {
            const uri = card.dataset.uri;
            await common.rpc.runUserAction(uri);
        });
    };
    lastActionUpdateTime = Date.now();
}
async function populateButtons() {
    if (actionButtonLocation === "right") {
        caButtonsDiv = document.getElementById("rightActionButtons");
        document.getElementById("leftActionButtons").classList.add("hidden");
        document.getElementById("caButtons").classList.add("hidden");        
    } else if (actionButtonLocation === "left") {
        caButtonsDiv = document.getElementById("leftActionButtons");
        document.getElementById("rightActionButtons").classList.add("hidden");
        document.getElementById("caButtons").classList.add("hidden");        
    } else {
        caButtonsDiv = document.getElementById("caButtons");
        document.getElementById("leftActionButtons").classList.add("hidden");
        document.getElementById("rightActionButtons").classList.add("hidden");        
    }
    caButtonsDiv.classList.remove("hidden");
    let buttonsOutput = '';
    const buttonsCount = parseInt(settings.actionButtons) || 5;
    const buttonClass = actionButtonLocation === "right" || actionButtonLocation === "left" ? "caButtonVertical" : "caButton";
    for (let i = 1;i <= buttonsCount;i++) {
        const buttonData = caButtons[parseInt(settings[`button${i}`])];
        if (buttonData) {            
            buttonsOutput += `<div class="button ${buttonClass} std icon" data-action="${buttonData.id}" data-repeatable=${buttonData.repeatable ? "1" : "0"}>
                ${buttonData.icon}
            </div>`
            if (buttonData.hasChildren) {
                for (let child of buttonData.childButtons) {                    
                    const childData = caButtons[child];
                    buttonsOutput += `<div class="button ${buttonClass} std icon hidden" data-action="${childData.id}" data-repeatable=${childData.repeatable ? "1" : "0"}>
                        ${childData.icon}
                    </div>`
                }
                //debugger
            }
        } else {
            console.warn('Missing buttonData for button #', i)
        }
    }
    buttonsOutput += '</div>'
    caButtonsDiv.innerHTML = buttonsOutput;
    caButtonDivs = document.querySelectorAll('.caButton, .caButtonVertical');
    const gameState = await common.rpc.getGameState();
    for (let button of caButtonDivs) {
        if (button.dataset.action === "4") {
            //debugger
            common.softInnerHTML(button, powerUpField.format({gameState}))
        }
    }
    caButtonDivs.forEach(x => {
        if (x.dataset.repeatable != "1") {
            return;
        }
        setupLongPress(x, (e) => {
            const buttonData = caButtons[parseInt(e.target.dataset.action)] || 
            caButtons[parseInt(e.target.parentElement.dataset.action)] ||
            caButtons[parseInt(e.target.parentElement.parentElement.dataset.action)];
            if (!buttonData) {
                console.warn("Invalid buttonData");
                debugger
                return;
            }
            doButtonAction(buttonData.id);
        })
    })
    
    caButtonDivs.forEach(x => {
        if (x.dataset.repeatable === "1") {
            return;
        }
        x.addEventListener("click", async (e) => {        
            const buttonData = caButtons[parseInt(e.target.dataset.action)] || 
                caButtons[parseInt(e.target.parentElement.dataset.action)] ||
                caButtons[parseInt(e.target.parentElement.parentElement.dataset.action)];
            if (!buttonData) {
                console.warn("Invalid buttonData");
                debugger
                return;
            }
            doButtonAction(buttonData.id);
        })
    });
    
}
function setDataFields() {
    dataFields.innerHTML = "";
    const mapping = [];
    const defaults = {
        f1: 'pwr-cur',
        f2: 'draft-cur',
        f3: 'spd-cur',
        f4: 'hr-cur',
        f5: 'dst',
        f6: 'time-session'
    }
    const numFields = isNaN(settings.dataFields) ? 6 : settings.dataFields; 
    for (let i = 0; i < (isNaN(numFields) ? 6 : numFields); i++) {
        const id = `f${i + 1}`;
        dataFields.insertAdjacentHTML('beforeend', `
            <div class="field" data-field="${id}">
                ${settings.showFieldNames ? '<div class="key"></div>' : ""}<div class="value"></div><abbr class="unit"></abbr>
            </div>
        `);
        mapping.push({id, default: defaults[id] || 'power'});
    };
    
    fieldRenderer.addRotatingFields({
        mapping,
        fields: fields.fields.filter(({id, group}) => {
            const type = id.split('-')[0];
            return ['pwr', 'cad', 'hr', 'spd', 'draft', 'grade', 'altitude', 'time', 'el', 'clock', 'ev', 'dst'].includes(type);
        })
    });
    fieldRenderer.setData({});
    fieldRenderer.render();
}
export async function caMain() {    
    powerUpField = new PowerUpField();    
    powerUpDisplay.addEventListener('click', onPowerUpClick);
    populateButtons();
    updateButtons();
    setDataFields();
    updateConnStatus(await common.rpc.getGameConnectionStatus());
    common.subscribe('status', updateConnStatus, {source: 'gameConnection', persistent: true});
    common.subscribe("chat", async chat => {
        console.log("chat", chat)
        const ad = await common.rpc.getAthlete(chat.from);
        const teamBadge = ad ? common.teamBadge(ad.team) : "";
        const name = ad ? `${ad.sanitizedFullname} ${teamBadge}` : `${chat.firstName ?? ""} ${chat.lastName ?? ""}`
        const chatAvatar = chat.avatar ? chat.avatar : "";
        const chatData = `<div class="caChat">
            <img class="avatar" src="${chatAvatar}">
            <div class="chatMessage">
                <div class="headerRow">
                    <div class="chatName">
                        ${name}
                    </div>
                    <div class="chatAge" data-age="${chat.ts}">
                    now
                    </div>
                </div>
                <div class="chatText">${chat.message}</div>
            </div>
        </div>`
        chatMessages.innerHTML += chatData;
        if (Date.now() - lastScrollTime > 10000) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };
        if (!chatActive) {
            unreadChats++;
            chatCounter.innerHTML = unreadChats;
        } else {
            unreadChats = 0;
        }
    });
    common.subscribe('athlete/watching', async watching => {
        fieldRenderer.setData(watching);
        fieldRenderer.render();
        
        const now = new Date(); 
        if (gcEnabled && now.valueOf() - lastButtonUpdateTime > 1000) {
            updateButtons();
        }
        if (gcEnabled && actionsActive && now.valueOf() - lastActionUpdateTime > 1000) {
            updateUserActions();
        }
        if (gcEnabled && chatActive && now.valueOf() - lastChatUpdateTime > 10000) {
            updateChatAges();
        };
        if (peekBackInfo.active && now.valueOf() - peekBackInfo.ts > peekBackInfo.delay) {
            await peekBack(0);
        }
        
    });
    common.subscribe('user-actions-set', actions => {
        console.log("actions", actions)
    })
    common.subscribe('watching-athlete-change', athleteId => {
        console.log("changing ca watching athlete to", athleteId)
        watchingAthlete = athleteId;
    });
    //let powerUpField = new fields.PowerUpField();
    common.subscribe('game-state', onGameState);
    const gameState = await common.rpc.getGameState();
    onGameState(gameState);  
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;        
        console.log("settings changed", changed)
        settings = common.settingsStore.get();
        const key = changed.keys().next().value;
        if (gcEnabled && changed.has('actionButtonLocation')) {
            actionButtonLocation = settings.actionButtonLocation;
            populateButtons();
        }
        if (gcEnabled && key?.startsWith("button") || changed.has('actionButtons')) {
            populateButtons();
        }
        if (changed.has('dataFields') || changed.has('showFieldNames')) {
            setDataFields();
        }
        if (changed.has('fontScale')) {
            changeFontScale();
        }
        if (changed.has('fontScaleChat')) {
            changeFontScaleChat();
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
settingsMain();
