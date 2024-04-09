import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './elevation-segments.mjs';
import * as fields from '/pages/src/fields.mjs';
import * as zen from './segments-xCoord.mjs';

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
    overrideDistance: 0,
    overrideLaps: 0,
    yAxisMin: 200,
    colorScheme: "sauce",
    zoomSlider: false
});

const settings = common.settingsStore.get();

let watchdog;
let inGame;
let zwiftMap;
let elProfile;
let routeSegments = [];
let zwiftSegmentsRequireStartEnd;
let zwiftIgnoreSegments;
let currentRoute;
let allRoutes;

function arraysEqual(arr1, arr2) {
    if (arr1 && arr2)
    {
        return arr1.every((value, index) => value === arr2[index]);
    }
}
  

function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}


function qualityScale(raw) {
    raw = raw || 1;
    const min = 0.2;
    return Math.min(2, (raw / 100) * (1 - min) + min);
}


function getSetting(key, def) {
    const v = settings[key];
    return v === undefined ? def : v;
}



function createElevationProfile({worldList}) {
    const el = document.querySelector('.elevation-profile');
    if (settings.profileHeight) {
        el.style.setProperty('--profile-height', settings.profileHeight / 100);
    }
    const preferRoute = settings.routeProfile !== false;
    const showMaxLine = settings.showElevationMaxLine !== false;
    const showLapMarker = settings.showLapMarker !== false;
    const showSegmentStart = settings.showSegmentStart !== false;   
    const showLoopSegments = settings.showLoopSegments !== false; 
    const pinSize = settings.pinSize;
    const lineType = settings.lineType;
    const lineTypeFinish = settings.lineTypeFinish;
    const lineSize = settings.lineSize;
    const pinColor = settings.pinColor;
    const showSegmentFinish = settings.showSegmentFinish;
    const minSegmentLength = settings.minSegmentLength;
    const showNextSegment = settings.showNextSegment;
    const showOnlyMyPin = settings.showOnlyMyPin;    
    const overrideDistance = typeof(settings.overrideDistance) != "undefined" ? settings.overrideDistance : 0;
    const overrideLaps = typeof(settings.overrideLaps) != "undefined" ? settings.overrideLaps : 0;    
    const yAxisMin = typeof(settings.yAxisMin) != "undefined" ? settings.yAxisMin: 200;
    const colorScheme = settings.colorScheme;const lineTextColor = settings.lineTextColor;
    const zoomSlider = settings.zoomSlider;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin, overrideDistance, overrideLaps, yAxisMin, colorScheme, lineTextColor, zoomSlider});
}


function setWatching(id) {
    console.info("Now watching:", id);
    elProfile.setWatching(id);
    if (elProfile) {
        elProfile.setWatching(id);
    }
}

async function initialize() {
    const ad = await common.rpc.getAthleteData('self');
    inGame = !!ad;
    if (!inGame) {
        console.info("User not active, starting demo mode...");
        elProfile.setCourse(6);
        if (elProfile) {
            elProfile.setCourse(6);
        }
        return;
    }
    //zwiftMap.setAthlete(ad.athleteId);
    if (elProfile) {
        elProfile.setAthlete(ad.athleteId);
    }
    if (!ad.watching) {
        const watching = await common.rpc.getAthleteData('watching');
        if (watching) {
            setWatching(watching.athleteId);
        }
    } else {
        setWatching(ad.athleteId);
    }
    if (ad.state) {
        //elProfile.incPause();
        try {
            //await zwiftMap.renderAthleteStates([ad.state]);
        } finally {
            //elProfile.decPause();
        }
        if (elProfile) {
            await elProfile.renderAthleteStates([ad.state]);
        }
    }
}


export async function main() {
    common.initInteractionListeners();      
    const allRoutes = await common.rpc.getRoutes();
    allRoutes.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0))
    //debugger
    const routeListDiv = document.getElementById('routeListDiv')
    const routeListSelect = document.createElement("select")
    routeListSelect.id = "routeListSelect";
    for (let route of allRoutes)
    {
        const option = document.createElement("option");
        option.text = route.name;
        option.value = route.id;              
        routeListSelect.appendChild(option);
    }    
    routeListDiv.appendChild(routeListSelect);
    const routeListButton = document.createElement('button');
    routeListButton.innerHTML = "Load Selected Route"
    routeListButton.onclick = function(){
        const selectedRoute = document.getElementById('routeListSelect').value
        //console.log(selectedRoute)
        window.open("Route-Preview.html?preview&route=" + selectedRoute,"_self");
    };    
    routeListDiv.appendChild(routeListButton);
    //debugger
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
    elProfile = settings.profileOverlay && createElevationProfile({worldList});
    const urlQuery = new URLSearchParams(location.search);
    
    if (urlQuery.has('preview')) {
        const center = urlQuery.get('center');
        const [course, road] = urlQuery.get('preview').split(',');
        const routeId = urlQuery.get('route');        
        //await zwiftMap.setCourse(+course || 6);
        if (elProfile) {
            let routeInfo = await zen.getModifiedRoute(parseInt(routeId));            
            let routeCourse = routeInfo.courseId;
            await elProfile.setCourse(+routeCourse || 13);
            
            let routeListOptions = document.getElementById('routeListSelect');
            for (let i = 0; i < routeListOptions.children.length - 1; i++)
            {
                
                if (routeListOptions.children[i].value == routeId)
                {                    
                    routeListOptions.children[i].selected = true;
                    break;
                }
            }
            
        }
        if (center) {
            //zwiftMap.setCenter(center.split(',').map(Number));
        }
        if (routeId) {
            
            
        } else {
            //zwiftMap.setActiveRoad(+road || 0);
        }
        if (elProfile) {
            if (routeId) {                
                if (settings.overrideDistance > 0 || settings.overrideLaps > 0) {
                    //console.log("overridedistance: " + settings.overrideDistance + " overridelaps: " + settings.overrideLaps)
                    await elProfile.setRoute(+routeId, {laps: settings.overrideLaps, eventSubgroupId: 0, distance: settings.overrideDistance})
                } else {
                    await elProfile.setRoute(+routeId);
                }                         
            } else {
                elProfile.setRoad(+road || 0);
            }
        }
    } 
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {
            setBackground();
        } else if (changed.has('profileHeight')) {
            if (elProfile) {
                elProfile.el.style.setProperty('--profile-height', changed.get('profileHeight') / 100);
                elProfile.chart.resize();
            }
        } else if (changed.has('profileOverlay') || 
                        changed.has('fields') ||
                        changed.has('routeProfile') || 
                        changed.has('showElevationMaxLine') || 
                        changed.has('showSegmentStart') || 
                        changed.has('showLapMarker') ||
                        changed.has('showLoopSegments') ||
                        //changed.has('pinSize') ||
                        changed.has('lineType') ||
                        changed.has('lineTypeFinish') ||
                        changed.has('lineSize') || 
                        changed.has('lineTextColor') ||
                        changed.has('showSegmentFinish') ||
                        changed.has('minSegmentLength') ||
                        changed.has('fontScale')||
                        changed.has('overrideDistance') ||
                        changed.has('overrideLaps') ||
                        changed.has('yAxisMin') ||
                        changed.has('colorScheme')
                    )
                {
                    //console.log(changed);
                    location.reload();
        } else if(changed.has('pinSize'))
        {   
            elProfile.pinSize = changed.get('pinSize');            
        } else if (changed.has('pinColor'))
        {
            //console.log(changed)
            elProfile.pinColor = changed.get('pinColor');
        } else if (changed.has('showNextSegment'))
        {
            elProfile.showNextSegment = changed.get('showNextSegment')
        } else if (changed.has('showOnlyMyPin'))
        {
            //console.log(changed);            
            elProfile.showOnlyMyPin = changed.get('showOnlyMyPin')
        } else if (changed.has('zoomSlider')) {
            elProfile.zoomSlider = changed.get('zoomSlider')
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}


setBackground();
