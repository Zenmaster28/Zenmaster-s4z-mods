import * as sauce from '/shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';
import * as elevation from './next-segment-elevation.mjs';
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
    showOnlyMyPin: false
});

const settings = common.settingsStore.get();

let elProfile;
let allSegments = [];
let segmentNameDiv = document.getElementById('segmentName');
let segmentDataDiv = document.getElementById('segmentData');
let segmentToGo = document.getElementById('distanceToGo');
let segmentBestTime = document.getElementById('bestTime');
let segmentProfileDiv = document.getElementById('segment-profile');
let nextSegmentId;
let segmentBests = [];

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
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin});
}


async function getSegment(course, segmentId) {
    let segments = await common.rpc.getSegments(course);    
    let segment = segments.find(x => x.id === segmentId);
    return segment;
}

async function getRoadData(course, road) {
    let segmentRoad = await common.getRoad(course, road);
    return segmentRoad;
}

async function getSegmentBests(segmentId, athleteId) {
    let segmentBests = await common.rpc.getSegmentResults(segmentId, {athleteId: athleteId, from: Date.now() - 86400000 * 90,})
    return segmentBests;
}

async function updateSegmentInfo(watching) {       
    if (typeof watching.segmentData.nextSegment.name != 'undefined')
    {
        segmentNameDiv.style.visibility = "";
        segmentProfileDiv.style.visibility = "";
        segmentBestTime.style.visibility = "";
        segmentNameDiv.innerHTML = watching.segmentData.nextSegment.name;
        segmentToGo.innerHTML = watching.segmentData.nextSegment.distanceToGo + " " + watching.segmentData.nextSegment.distanceToGoUnits;
    }
    else 
    {
        segmentNameDiv.innerHTML = "";
        segmentNameDiv.style.visibility = "hidden";
        segmentProfileDiv.style.visibility = "hidden";
        segmentBestTime.style.visibility = "hidden";
    }
    //segmentDistanceDiv.innerHTML = watching.segmentData.nextSegment.distanceToGo + " " + watching.segmentData.nextSegment.distanceToGoUnits
    if (watching.segmentData.nextSegment.id != nextSegmentId || elProfile.watchingId != watching.athleteId)
    {
        console.log("Updating for new segment or new athleteId")
        
        // change the segment profile            
        let segmentInfo = await getSegment(watching.courseId, watching.segmentData.nextSegment.id);
        let segmentRoad = await getRoadData(watching.courseId, segmentInfo.roadId);
        let segmentBests = await getSegmentBests(watching.segmentData.nextSegment.id, watching.athleteId)
        if (segmentBests[0])
        {
            segmentBestTime.innerHTML = "PB: " + formatTime(segmentBests[0].elapsed);
        }
        else 
        {
            segmentBestTime.innerHTML = "PB: ---";
        }
        
        elProfile.setSegment(segmentInfo, segmentRoad);
        elProfile.watchingId = watching.athleteId;
        nextSegmentId = watching.segmentData.nextSegment.id;
    }
}

const formatTime = milliseconds => {
    milliseconds = milliseconds * 1000;
    const ms = milliseconds.toString().substr(-3);
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60); 
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0)
    {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    if (minutes != 0)
    {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0") + "." + ms;
    }
    else
    {
        return seconds.toString().padStart(2, "0") + "." + ms;
    }
}


export async function main() {
    common.initInteractionListeners();      
    const worldList = await common.getWorldList();  

    elProfile = settings.profileOverlay && createElevationProfile({worldList});

    
    common.subscribe('athlete/watching', updateSegmentInfo);    
    
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        //console.log(changed);
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
                        changed.has('lineType') ||
                        changed.has('lineTypeFinish') ||
                        changed.has('lineSize') ||                         
                        changed.has('showSegmentFinish') ||
                        changed.has('minSegmentLength') ||
                        changed.has('fontScale')
                    )
                {                    
                    location.reload();
        } else if(changed.has('pinSize'))
        {   
            elProfile.pinSize = changed.get('pinSize');            
        } else if (changed.has('pinColor'))
        {            
            elProfile.pinColor = changed.get('pinColor');
        } else if (changed.has('showNextSegment'))
        {
            elProfile.showNextSegment = changed.get('showNextSegment')
        } else if (changed.has('showOnlyMyPin'))
        {
            elProfile.showOnlyMyPin = changed.get('showOnlyMyPin')
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}


setBackground();
