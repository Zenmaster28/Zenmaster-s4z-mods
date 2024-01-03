import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './pp-location-render.mjs';
import * as fields from '/pages/src/fields.mjs';


//common.enableSentry();

const doc = document.documentElement;
const L = sauce.locale;
const imperial = !!common.storage.get('/imperialUnits');
L.setImperial(imperial);

common.settingsStore.setDefault({
    // v0.13.0...
    profileOverlay: true,
    mapStyle: 'default',
    tiltShift: false,
    tiltShiftAmount: 80,
    sparkle: false,
    solidBackground: false,
    transparency: 0,
    backgroundColor: '#00ff00',
    fields: 1,
    autoHeading: true,
    quality: 50,
    verticalOffset: 0,
    fpsLimit: 30,
    // v0.13.1...
    zoomPriorityTilt: true,
    // v1.0.0
    profileHeight: 100,
    routeProfile: true,
    showElevationMaxLine: true,
    autoCenter: true,
    showSegmentStart: true,
    showLapMarker: true,
    fontScale: 1.0,
    showLoopSegments: false,
    pinSize: "1",
    lineType: "solid",
    lineTypeFinish: "[5, 10]",
    lineSize: 1.0,
    pinColor: "#ff430e",
    showSegmentFinish: false,
    minSegmentLength: 500,
    showNextSegment: true,
    showOnlyMyPin: false,
    setAthleteSegmentData: true,
    showCompletedLaps: true,
    Taylor: true,
    Bernie: true,
    Miguel: true,
    Maria: true,
    Coco: true,
    Yumi: true,
    Jacques: true,
    Genie: true,
    Constance: true
});

const settings = common.settingsStore.get();

const ppIds = [
    {
        id: 5147285,
        name: "Coco"   
    },
    {
        id: 5147260,
        name: "Bernie"
    },
    {
        id: 5147298,
        name: "Constance"
    },
    {
        id: 5147276,
        name: "Maria"
    },
    {
        id: 5147250,
        name: "Taylor"
    },
    {
        id: 5147267,
        name: "Miguel"
    },
    {
        id: 5162620,
        name: "Yumi"
    },
    {
        id: 5147292,
        name: "Jacques"
    },
    {
        id: 5147294,
        name: "Genie"
    }
];
let ppIndex = 0;
let ppList = [];

function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}

function createElevationProfile({worldList}, divId) {
    //const el = document.querySelector('.elevation-profile');
    const el = document.getElementById(divId)    
    const preferRoute = settings.routeProfile !== false;
    const showMaxLine = settings.showElevationMaxLine !== false;
    const showLapMarker = settings.showLapMarker !== false;
    const showSegmentStart = settings.showSegmentStart !== false;   
    const showLoopSegments = settings.showLoopSegments !== false; 
    const pinSize = settings.pinSize ? settings.pinSize : 1;
    const lineType = settings.lineType ? settings.lineType : "solid";
    const lineTypeFinish = settings.lineTypeFinish ? settings.lineTypeFinish : "[5, 10]";
    const lineSize = settings.lineSize ? settings.lineSize : 1.0;
    const pinColor = settings.pinColor ? settings.pinColor : "#ff430e";
    const showSegmentFinish = settings.showSegmentFinish !== false;
    const minSegmentLength = settings.minSegmentLength ? settings.minSegmentLength : 500;
    const showNextSegment = settings.showNextSegment !== false;
    const showOnlyMyPin = settings.showOnlyMyPin !== false;
    const setAthleteSegmentData = settings.setAthleteSegmentData !== false;
    const showCompletedLaps = typeof(settings.showCompletedLaps) != "undefined" ? settings.showCompletedLaps : false;    
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin, setAthleteSegmentData, showCompletedLaps});
}
function renderPPlocation(id, el) {
    let state = [];
    let ppState = common.rpc.getPlayerState(id);   
    ppState.then(result => {
        state.push(result);    
        el.watchingId = id;  
        el.renderAthleteStates(state); 
    });
    
}

export async function main() {
    common.initInteractionListeners(); 
    const fieldsEl = document.querySelector('#content .fields');
    const fieldRenderer = new common.Renderer(fieldsEl, {fps: 1});
    const mapping = [];
    const defaults = {
        f1: 'grade',
        f2: 'altitude',
    };
    const numFields = common.settingsStore.get('fields');
    for (let i = 0; i < (isNaN(numFields) ? 1 : numFields); i++) {
        const id = `f${i + 1}`;
        fieldsEl.insertAdjacentHTML('afterbegin', `
            <div class="field" data-field="${id}">
                <div class="key"></div><div class="value"></div><abbr class="unit"></abbr>
            </div>
        `);
        mapping.push({id, default: defaults[id] || 'time-elapsed'});
    }
    fieldRenderer.addRotatingFields({
        mapping,
        fields: fields.fields.filter(({id}) => {
            const type = id.split('-')[0];
            return ['ev', 'game-laps', 'progress', 'rt', 'el', 'grade', 'altitude'].includes(type);
        })
    });
    const worldList = await common.getWorldList(); 
    for (let pp of ppIds) {
        if (settings[pp.name]) {            
            let el = settings.profileOverlay && createElevationProfile({worldList}, pp.name);
            el.ppName = pp.name;            
            let ppData = {
                id: pp.id,
                name: pp.name,
                el: el
            }
            ppList.push(ppData)
            renderPPlocation(pp.id, el)
        } else {
            let div = document.getElementById(pp.name);
            div.style.height = 0;
            div.style.visibility = "hidden";
        }

    }
    let timer = setInterval(function() {
        console.log("Updating: " + ppList[ppIndex].name);
        renderPPlocation(ppList[ppIndex].id, ppList[ppIndex].el);    
        if (ppIndex < ppList.length - 1) {        
            ppIndex++;            
        } else {
            ppIndex = 0;
        }  
    }, 4000);    

    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        //console.log(changed);
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {
            setBackground();
        } else if (changed.has('profileOverlay') || 
                        changed.has('fields') ||
                        changed.has('routeProfile') || 
                        changed.has('showElevationMaxLine') || 
                        changed.has('showSegmentStart') || 
                        changed.has('showLapMarker') ||
                        changed.has('showCompletedLaps') ||
                        changed.has('showLoopSegments') ||                        
                        changed.has('lineType') ||
                        changed.has('lineTypeFinish') ||
                        changed.has('lineSize') ||                         
                        changed.has('showSegmentFinish') ||
                        changed.has('minSegmentLength') ||
                        changed.has('fontScale')
                    )
                {
                    //console.log(changed);
                    //location.reload();  // automatic settings reload disabled to avoid hitting rate limits
        } else if(changed.has('pinSize'))
        {   
            for (let pp of ppList) {
                pp.el.pinSize = changed.get('pinSize');            
            }
        }  else {
            //location.reload(); // automatic settings reload disabled to avoid hitting rate limits
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}


setBackground();
